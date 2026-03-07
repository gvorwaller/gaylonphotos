#!/usr/bin/env node

/**
 * Bulk photo ingest script.
 *
 * Reads photos from a local directory, extracts EXIF metadata,
 * generates resized display + thumbnail versions, uploads to DO Spaces,
 * and updates the collection's photos.json.
 *
 * Supports Google Takeout sidecar .json files for GPS/date fallback
 * when EXIF metadata is missing (common with Google Photos exports).
 *
 * Usage:
 *   node scripts/ingest-photos.js <collection-slug> [source-dir]
 *
 * If source-dir is omitted, defaults to photos/<collection-slug>/
 *
 * Examples:
 *   node scripts/ingest-photos.js scandinavia-2023
 *   node scripts/ingest-photos.js birds /path/to/exported/birds
 */

import { readdir, readFile, stat, writeFile as writeFileFs, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import exifr from 'exifr';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// ── Config ──────────────────────────────────────────────────────────

const THUMB_WIDTH = 400;
const DISPLAY_WIDTH = 1600;
const DATA_DIR = 'data';

const SUPPORTED_EXTENSIONS = new Set([
	'.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tif', '.tiff'
]);

// ── Environment ─────────────────────────────────────────────────────

// Load .env manually since we're outside SvelteKit (no dotenv dep needed)
try {
	const envContent = readFileSync('.env', 'utf-8');
	for (const line of envContent.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eqIdx = trimmed.indexOf('=');
		if (eqIdx === -1) continue;
		const key = trimmed.slice(0, eqIdx).trim();
		const val = trimmed.slice(eqIdx + 1).trim();
		if (!process.env[key]) process.env[key] = val;
	}
} catch {
	console.error('Warning: could not read .env file');
}

const {
	SPACES_KEY,
	SPACES_SECRET,
	SPACES_BUCKET,
	SPACES_REGION,
	SPACES_ENDPOINT,
	SPACES_CDN_URL
} = process.env;

if (!SPACES_KEY || !SPACES_SECRET || !SPACES_BUCKET) {
	console.error('Missing required environment variables: SPACES_KEY, SPACES_SECRET, SPACES_BUCKET');
	console.error('Make sure .env is configured.');
	process.exit(1);
}

// ── S3 Client ───────────────────────────────────────────────────────

const s3 = new S3Client({
	region: SPACES_REGION,
	endpoint: SPACES_ENDPOINT,
	forcePathStyle: false,
	credentials: {
		accessKeyId: SPACES_KEY,
		secretAccessKey: SPACES_SECRET
	}
});

function getCdnUrl(key) {
	const base = SPACES_CDN_URL.replace(/\/+$/, '');
	return `${base}/${key}`;
}

async function uploadBuffer(key, buffer, contentType) {
	await s3.send(new PutObjectCommand({
		Bucket: SPACES_BUCKET,
		Key: key,
		Body: buffer,
		ACL: 'public-read',
		ContentType: contentType
	}));
	return getCdnUrl(key);
}

// ── JSON Store (simplified for script context) ──────────────────────

async function readJson(filePath) {
	const raw = await readFile(filePath, 'utf-8');
	return JSON.parse(raw);
}

async function writeJson(filePath, data) {
	await writeFileFs(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

async function ensureDir(dirPath) {
	await mkdir(dirPath, { recursive: true });
}

// ── EXIF Extraction ─────────────────────────────────────────────────

async function extractExif(buffer) {
	try {
		const exif = await exifr.parse(buffer, {
			gps: true,
			exif: true,
			icc: false,
			pick: [
				'DateTimeOriginal', 'CreateDate',
				'Make', 'Model',
				'LensModel', 'LensMake',
				'FocalLength', 'FocalLengthIn35mmFormat',
				'ISO', 'FNumber', 'ExposureTime',
				'GPSLatitude', 'GPSLongitude'
			]
		});
		if (!exif) return emptyExif();

		const lat = exif.latitude ?? exif.GPSLatitude ?? null;
		const lng = exif.longitude ?? exif.GPSLongitude ?? null;
		const hasGps = lat !== null && lng !== null && isFinite(lat) && isFinite(lng);

		const rawDate = exif.DateTimeOriginal || exif.CreateDate || null;
		const date = rawDate instanceof Date ? rawDate.toISOString() : null;

		const make = exif.Make?.trim() || '';
		const model = exif.Model?.trim() || '';
		const camera = model
			? (model.toLowerCase().startsWith(make.toLowerCase()) ? model : `${make} ${model}`.trim())
			: (make || null);

		const lensMake = exif.LensMake?.trim() || '';
		const lensModel = exif.LensModel?.trim() || '';
		const lens = lensModel
			? (lensModel.toLowerCase().startsWith(lensMake.toLowerCase()) ? lensModel : `${lensMake} ${lensModel}`.trim())
			: (lensMake || null);

		const fl = exif.FocalLength ?? exif.FocalLengthIn35mmFormat ?? null;
		const focalLength = fl !== null ? `${Math.round(fl)}mm` : null;

		const iso = exif.ISO ?? null;
		const aperture = exif.FNumber ? `f/${exif.FNumber}` : null;
		const shutterSpeed = formatShutterSpeed(exif.ExposureTime);

		return { gps: hasGps ? { lat, lng } : null, gpsSource: hasGps ? 'exif' : null, date, camera, lens, focalLength, iso, aperture, shutterSpeed };
	} catch {
		return emptyExif();
	}
}

function formatShutterSpeed(seconds) {
	if (seconds == null || seconds <= 0) return null;
	if (seconds >= 1) return `${seconds}s`;
	return `1/${Math.round(1 / seconds)}s`;
}

function emptyExif() {
	return { gps: null, gpsSource: null, date: null, camera: null, lens: null, focalLength: null, iso: null, aperture: null, shutterSpeed: null };
}

// ── Google Takeout Sidecar ──────────────────────────────────────────

/**
 * Try to read a Google Takeout sidecar JSON for a photo file.
 * Takeout creates files like "IMG_1234.jpg.json" next to "IMG_1234.jpg".
 * Returns extracted metadata or null if no sidecar exists.
 */
async function readTakeoutSidecar(photoPath) {
	// Takeout sidecar naming: exact filename + .json
	const sidecarPath = photoPath + '.json';
	try {
		const raw = await readFile(sidecarPath, 'utf-8');
		const sidecar = JSON.parse(raw);

		const result = {};

		// GPS: geoData or geoDataExif
		const geo = sidecar.geoData || sidecar.geoDataExif;
		if (geo && geo.latitude !== 0 && geo.longitude !== 0) {
			result.gps = { lat: geo.latitude, lng: geo.longitude };
			result.gpsSource = 'manual'; // from sidecar, not embedded EXIF
		}

		// Date: photoTakenTime.timestamp (Unix seconds)
		if (sidecar.photoTakenTime?.timestamp) {
			const ts = parseInt(sidecar.photoTakenTime.timestamp, 10);
			if (ts > 0) {
				result.date = new Date(ts * 1000).toISOString();
			}
		}

		// Description
		if (sidecar.description) {
			result.description = sidecar.description;
		}

		return Object.keys(result).length > 0 ? result : null;
	} catch {
		return null;
	}
}

// ── Photo ID Generation ─────────────────────────────────────────────

import { randomBytes } from 'node:crypto';

// Lazy-loaded only when --species flag is used
let identifySpeciesFromBuffer = null;
let speciesModel = null;

function derivePhotoId(filename, existingIds) {
	const base = filename.replace(/\.[^.]+$/, '');
	let id = base.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
	if (!id) {
		id = randomBytes(6).toString('hex');
	}
	if (!existingIds.has(id)) return id;
	let candidate;
	do {
		const suffix = randomBytes(3).toString('hex');
		candidate = `${id}-${suffix}`;
	} while (existingIds.has(candidate));
	return candidate;
}

// ── Main Ingest ─────────────────────────────────────────────────────

async function ingest(collectionSlug, sourceDir, autoSpecies = false) {
	if (autoSpecies) {
		const vision = await import('./vision-standalone.js');
		identifySpeciesFromBuffer = vision.identifySpeciesFromBuffer;
		const { SPECIES_MODEL } = await import('../src/lib/vision-prompt.js');
		speciesModel = SPECIES_MODEL;
		console.log('Species auto-ID enabled (GPT-4.1-mini)\n');
	}

	console.log(`\nIngesting photos for collection: ${collectionSlug}`);
	console.log(`Source directory: ${sourceDir}`);

	// Verify source directory exists
	try {
		const s = await stat(sourceDir);
		if (!s.isDirectory()) {
			console.error(`Not a directory: ${sourceDir}`);
			process.exit(1);
		}
	} catch {
		console.error(`Directory not found: ${sourceDir}`);
		process.exit(1);
	}

	// Read existing photos.json (or start fresh)
	const photosJsonPath = join(DATA_DIR, collectionSlug, 'photos.json');
	let photosData;
	try {
		photosData = await readJson(photosJsonPath);
	} catch {
		await ensureDir(join(DATA_DIR, collectionSlug));
		photosData = { photos: [] };
	}

	const existingIds = new Set(photosData.photos.map((p) => p.id));
	const existingFilenames = new Set(photosData.photos.map((p) => p.filename));

	// List all image files in source directory (non-recursive)
	const entries = await readdir(sourceDir);
	const imageFiles = entries.filter((f) => {
		const ext = extname(f).toLowerCase();
		return SUPPORTED_EXTENSIONS.has(ext);
	});

	console.log(`Found ${imageFiles.length} image files`);

	let ingested = 0;
	let skipped = 0;
	let failed = 0;

	for (const filename of imageFiles) {
		// Skip already-ingested files
		if (existingFilenames.has(filename)) {
			console.log(`  SKIP (already ingested): ${filename}`);
			skipped++;
			continue;
		}

		const filePath = join(sourceDir, filename);

		try {
			console.log(`  Processing: ${filename}`);

			// Read file
			const fileBuffer = await readFile(filePath);

			// Extract EXIF
			const exifData = await extractExif(fileBuffer);

			// Read Google Takeout sidecar for fallback metadata
			const sidecar = await readTakeoutSidecar(filePath);

			// Merge: EXIF takes priority, sidecar fills gaps
			const metadata = { ...emptyExif(), ...exifData };
			if (sidecar) {
				if (!metadata.gps && sidecar.gps) {
					metadata.gps = sidecar.gps;
					metadata.gpsSource = sidecar.gpsSource || 'manual';
				}
				if (!metadata.date && sidecar.date) {
					metadata.date = sidecar.date;
				}
			}

			// Generate photo ID
			const id = derivePhotoId(filename, existingIds);
			existingIds.add(id);
			const jpgFilename = `${id}.jpg`;

			// Resize to display + thumbnail
			const [displayBuffer, thumbBuffer] = await Promise.all([
				sharp(fileBuffer)
					.rotate() // auto-rotate based on EXIF orientation
					.resize(DISPLAY_WIDTH, null, { withoutEnlargement: true })
					.jpeg({ quality: 85 })
					.toBuffer(),
				sharp(fileBuffer)
					.rotate() // auto-rotate based on EXIF orientation
					.resize(THUMB_WIDTH, null, { withoutEnlargement: true })
					.jpeg({ quality: 80 })
					.toBuffer()
			]);

			// Upload to Spaces
			const displayKey = `${collectionSlug}/${jpgFilename}`;
			const thumbKey = `${collectionSlug}/thumbs/${jpgFilename}`;

			const [displayUrl, thumbUrl] = await Promise.all([
				uploadBuffer(displayKey, displayBuffer, 'image/jpeg'),
				uploadBuffer(thumbKey, thumbBuffer, 'image/jpeg')
			]);

			// Build photo object — explicitly pick metadata fields
			const photo = {
				id,
				filename,
				url: displayUrl,
				thumbnail: thumbUrl,
				description: sidecar?.description || '',
				tags: [],
				favorite: false,
				gps: metadata.gps,
				gpsSource: metadata.gpsSource,
				date: metadata.date,
				camera: metadata.camera,
				lens: metadata.lens,
				focalLength: metadata.focalLength,
				iso: metadata.iso,
				aperture: metadata.aperture,
				shutterSpeed: metadata.shutterSpeed
			};

			// Auto-identify species if flag is set
			if (autoSpecies && identifySpeciesFromBuffer) {
				const identification = await identifySpeciesFromBuffer(displayBuffer);
				if (identification) {
					photo.species = identification.species;
					photo.scientificName = identification.scientificName;
					photo.speciesAI = {
						model: speciesModel,
						confidence: identification.confidence,
						detectedAt: new Date().toISOString()
					};
					console.log(`    Species: ${identification.species} (${identification.confidence})`);
				} else {
					console.log(`    Species: could not identify`);
				}
			}

			photosData.photos.push(photo);
			existingFilenames.add(filename);
			ingested++;

			const gpsLabel = photo.gps ? `GPS: ${photo.gps.lat.toFixed(4)}, ${photo.gps.lng.toFixed(4)}` : 'No GPS';
			console.log(`    ✓ ${id} | ${gpsLabel} | ${photo.date || 'No date'}`);

		} catch (err) {
			console.error(`    ✗ FAILED: ${filename} — ${err.message}`);
			failed++;
		}
	}

	// Write updated photos.json
	await writeJson(photosJsonPath, photosData);

	console.log(`\nDone!`);
	console.log(`  Ingested: ${ingested}`);
	console.log(`  Skipped:  ${skipped} (already in photos.json)`);
	console.log(`  Failed:   ${failed}`);
	if (autoSpecies) {
		const speciesCount = photosData.photos.filter((p) => p.species).length;
		console.log(`  Species:  ${speciesCount} photos with species labels`);
	}
	console.log(`  Total:    ${photosData.photos.length} photos in collection\n`);
}

// ── CLI Entry ───────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);
const flagArgs = rawArgs.filter((a) => a.startsWith('--'));
const posArgs = rawArgs.filter((a) => !a.startsWith('--'));
const speciesFlag = flagArgs.includes('--species');

if (posArgs.length === 0) {
	console.error('Usage: node scripts/ingest-photos.js <collection-slug> [source-dir] [--species]');
	console.error('');
	console.error('Options:');
	console.error('  --species    Auto-identify bird species via Claude Vision (requires ANTHROPIC_API_KEY)');
	console.error('');
	console.error('If source-dir is omitted, defaults to photos/<collection-slug>/');
	process.exit(1);
}

const slug = posArgs[0];
if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
	console.error(`Invalid collection slug: "${slug}". Must be lowercase alphanumeric with optional hyphens.`);
	process.exit(1);
}
const sourceDir = posArgs[1] || join('photos', slug);

if (speciesFlag && !process.env.OPENAI_API_KEY) {
	console.error('--species requires OPENAI_API_KEY in .env');
	process.exit(1);
}

ingest(slug, sourceDir, speciesFlag).catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});

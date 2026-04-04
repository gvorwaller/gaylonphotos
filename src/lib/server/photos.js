import { readJson, updateJson, createJsonIfNotExists, ensureDir } from './json-store.js';
import { uploadFile, deleteFile, getCdnUrl } from './storage.js';
import { extractVideoMetadata, extractVideoThumbnail, normalizeVideo, isWebFriendly } from './video.js';
import { computePhash, hammingDistance, findDuplicateGroups } from './phash.js';
import sharp from 'sharp';
import exifr from 'exifr';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { writeFile, unlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const THUMB_WIDTH = 400;
const DISPLAY_WIDTH = 1600;
const DATA_DIR = 'data';

// Re-export phash utilities for consumers that import from photos.js
export { computePhash, hammingDistance, findDuplicateGroups };

/**
 * Compute SHA-256 hash of a buffer.
 * @param {Buffer} buffer
 * @returns {string} hex digest
 */
function fileHashFn(buffer) {
	return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Validate a collection slug to prevent path traversal.
 * @param {string} slug
 */
function validateSlug(slug) {
	if (!slug || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
		throw new Error('Invalid collection slug');
	}
}

/**
 * Resolve the photos.json path for a collection.
 * @param {string} slug
 * @returns {string}
 */
function photosPath(slug) {
	validateSlug(slug);
	return join(DATA_DIR, slug, 'photos.json');
}

/**
 * Derive a photo ID from the original filename.
 * Strips extension. If the resulting ID already exists in the collection,
 * appends a short random suffix to avoid collisions.
 * @param {string} filename — original filename, e.g. "IMG_1234.jpg"
 * @param {Set<string>} existingIds — IDs already in the collection
 * @returns {string}
 */
function derivePhotoId(filename, existingIds) {
	// Remove extension to get base ID
	const base = filename.replace(/\.[^.]+$/, '');
	// Sanitize: lowercase, replace non-alphanumeric (except hyphens/underscores) with hyphens
	let id = base.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
	if (!id) {
		id = randomBytes(6).toString('hex');
	}
	if (!existingIds.has(id)) return id;
	// Collision: loop until non-colliding suffix found
	let candidate;
	do {
		const suffix = randomBytes(3).toString('hex');
		candidate = `${id}-${suffix}`;
	} while (existingIds.has(candidate));
	return candidate;
}

/**
 * List all photos in a collection.
 * Returns [] if the photos.json file doesn't exist yet.
 * @param {string} collectionSlug
 * @returns {Promise<import('./photos.js').Photo[]>}
 */
export async function listPhotos(collectionSlug) {
	try {
		const data = await readJson(photosPath(collectionSlug));
		return data.photos || [];
	} catch {
		// File doesn't exist yet — empty collection
		return [];
	}
}

/**
 * Compute and persist perceptual hashes for any photos in the collection
 * that are missing them. Downloads the thumbnail (or display image) from CDN,
 * computes dHash, and saves the result back to photos.json.
 *
 * @param {string} collectionSlug
 * @returns {Promise<{ computed: number, failed: number }>}
 */
export async function backfillMissingHashes(collectionSlug) {
	const photos = await listPhotos(collectionSlug);
	const needsHash = photos.filter((p) => !p.phash);
	if (needsHash.length === 0) return { computed: 0, failed: 0 };

	// Compute hashes for each photo that's missing one
	/** @type {Map<string, string>} */
	const computed = new Map();
	let failed = 0;

	for (const photo of needsHash) {
		try {
			const imageUrl = photo.thumbnail || photo.url;
			const res = await fetch(imageUrl);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const buffer = Buffer.from(await res.arrayBuffer());
			const phash = await computePhash(buffer);
			computed.set(photo.id, phash);
		} catch {
			failed++;
		}
	}

	// Persist all newly computed hashes in a single atomic write
	if (computed.size > 0) {
		const filePath = photosPath(collectionSlug);
		await updateJson(filePath, (data) => {
			for (const photo of data.photos) {
				if (computed.has(photo.id)) {
					photo.phash = computed.get(photo.id);
				}
			}
			return data;
		});
	}

	return { computed: computed.size, failed };
}

/**
 * Get a single photo by ID.
 * @param {string} collectionSlug
 * @param {string} photoId
 * @returns {Promise<object|null>}
 */
export async function getPhoto(collectionSlug, photoId) {
	const photos = await listPhotos(collectionSlug);
	return photos.find((p) => p.id === photoId) || null;
}

/**
 * Extract EXIF metadata from an image buffer.
 * Returns a normalized object with null for missing fields.
 * @param {Buffer} buffer
 * @returns {Promise<object>}
 */
async function extractExif(buffer) {
	try {
		const exif = await exifr.parse(buffer, {
			gps: true,
			exif: true,
			icc: false,
			// Request specific tags we care about
			pick: [
				'DateTimeOriginal', 'CreateDate',
				'Make', 'Model',
				'LensModel', 'LensMake',
				'FocalLength', 'FocalLengthIn35mmFormat',
				'ISO', 'FNumber', 'ExposureTime',
				'GPSLatitude', 'GPSLongitude',
				'GPSLatitudeRef', 'GPSLongitudeRef'
			]
		});
		if (!exif) return emptyExif();

		// GPS: exifr returns decimal degrees when gps:true
		const lat = exif.latitude ?? exif.GPSLatitude ?? null;
		const lng = exif.longitude ?? exif.GPSLongitude ?? null;
		const hasGps = lat !== null && lng !== null && isFinite(lat) && isFinite(lng);

		// Date: prefer DateTimeOriginal, fall back to CreateDate
		const rawDate = exif.DateTimeOriginal || exif.CreateDate || null;
		const date = rawDate instanceof Date ? rawDate.toISOString() : null;

		// Camera model: combine make + model, dedup if model already contains make
		const make = exif.Make?.trim() || '';
		const model = exif.Model?.trim() || '';
		const camera = model
			? (model.toLowerCase().startsWith(make.toLowerCase()) ? model : `${make} ${model}`.trim())
			: (make || null);

		// Lens
		const lensMake = exif.LensMake?.trim() || '';
		const lensModel = exif.LensModel?.trim() || '';
		const lens = lensModel
			? (lensModel.toLowerCase().startsWith(lensMake.toLowerCase()) ? lensModel : `${lensMake} ${lensModel}`.trim())
			: (lensMake || null);

		// Focal length
		const fl = exif.FocalLength ?? exif.FocalLengthIn35mmFormat ?? null;
		const focalLength = fl !== null ? `${Math.round(fl)}mm` : null;

		// Exposure
		const iso = exif.ISO ?? null;
		const aperture = exif.FNumber ? `f/${exif.FNumber}` : null;
		const shutterSpeed = formatShutterSpeed(exif.ExposureTime);

		return {
			gps: hasGps ? { lat, lng } : null,
			gpsSource: hasGps ? 'exif' : null,
			date,
			camera,
			lens,
			focalLength,
			iso,
			aperture,
			shutterSpeed
		};
	} catch {
		// EXIF parsing failed — return empty metadata
		return emptyExif();
	}
}

/**
 * Format exposure time as a human-readable shutter speed string.
 * @param {number|null|undefined} seconds
 * @returns {string|null}
 */
function formatShutterSpeed(seconds) {
	if (seconds == null || seconds <= 0) return null;
	if (seconds >= 1) return `${seconds}s`;
	// Express as fraction: 1/X
	const denominator = Math.round(1 / seconds);
	return `1/${denominator}s`;
}

/**
 * Empty EXIF result for images with no metadata.
 */
function emptyExif() {
	return {
		gps: null,
		gpsSource: null,
		date: null,
		camera: null,
		lens: null,
		focalLength: null,
		iso: null,
		aperture: null,
		shutterSpeed: null
	};
}

/**
 * Process an uploaded image and store in DO Spaces.
 * 1. Extract EXIF metadata
 * 2. Resize to display (1600px) and thumbnail (400px) sizes
 * 3. Upload both to Spaces
 * 4. Append photo record to photos.json
 *
 * @param {string} collectionSlug
 * @param {Buffer} fileBuffer — raw uploaded file bytes
 * @param {string} originalFilename — e.g. "IMG_1234.jpg"
 * @returns {Promise<object>} the new Photo object
 */
export async function processAndUpload(collectionSlug, fileBuffer, originalFilename) {
	// Validate slug early, before any Spaces operations
	validateSlug(collectionSlug);

	// 1. Extract EXIF before any resizing (resizing strips metadata)
	const exifData = await extractExif(fileBuffer);

	// 1b. Compute perceptual hash and file hash in parallel with EXIF
	const phash = await computePhash(fileBuffer).catch(() => null);
	const fHash = fileHashFn(fileBuffer);

	// 2. Generate display-size and thumbnail images (normalized to JPEG)
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

	// 3. Generate a guaranteed-unique upload ID using filename + random suffix.
	//    This avoids needing to read photos.json before upload, preventing races.
	const baseId = originalFilename.replace(/\.[^.]+$/, '')
		.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
	const uploadId = `${baseId || 'photo'}-${randomBytes(4).toString('hex')}`;
	const jpgFilename = `${uploadId}.jpg`;

	// 4. Upload to Spaces
	const displayKey = `${collectionSlug}/${jpgFilename}`;
	const thumbKey = `${collectionSlug}/thumbs/${jpgFilename}`;
	const uploadedKeys = [];

	try {
		const [displayUpload, thumbUpload] = await Promise.allSettled([
			uploadFile(displayKey, displayBuffer, 'image/jpeg'),
			uploadFile(thumbKey, thumbBuffer, 'image/jpeg')
		]);
		if (displayUpload.status === 'fulfilled') uploadedKeys.push(displayKey);
		if (thumbUpload.status === 'fulfilled') uploadedKeys.push(thumbKey);
		if (displayUpload.status === 'rejected') throw displayUpload.reason;
		if (thumbUpload.status === 'rejected') throw thumbUpload.reason;

		const displayResult = displayUpload.value;
		const thumbResult = thumbUpload.value;

		// 5. Build complete photo object
		const photo = {
			id: uploadId,
			filename: originalFilename,
			url: displayResult.url,
			thumbnail: thumbResult.url,
			description: '',
			tags: [],
			favorite: false,
			gps: exifData.gps,
			gpsSource: exifData.gpsSource,
			date: exifData.date,
			camera: exifData.camera,
			lens: exifData.lens,
			focalLength: exifData.focalLength,
			iso: exifData.iso,
			aperture: exifData.aperture,
			shutterSpeed: exifData.shutterSpeed,
			phash: phash || undefined,
			fileHash: fHash
		};

		// 6. Atomically append to photos.json — ensure file exists (atomic — prevents TOCTOU race)
		const filePath = photosPath(collectionSlug);
		await ensureDir(join(DATA_DIR, collectionSlug));
		try {
			await createJsonIfNotExists(filePath, { photos: [] });
		} catch (err) {
			if (err.message !== 'FILE_EXISTS') throw err;
		}

		await updateJson(filePath, (data) => {
			if (!Array.isArray(data.photos)) data.photos = [];
			// Final dedup check inside lock (extremely unlikely with random suffix)
			if (data.photos.some((p) => p.id === uploadId)) {
				throw new Error(`Duplicate photo ID: ${uploadId}`);
			}
			data.photos.push(photo);
			return data;
		});

		return photo;
	} catch (err) {
		// Rollback: clean up any uploaded Spaces objects on failure
		for (const key of uploadedKeys) {
			try {
				await deleteFile(key);
			} catch {
				console.error(`Rollback: failed to delete ${key}`);
			}
		}
		throw err;
	}
}

/**
 * Process an uploaded video file and store in DO Spaces.
 * 1. Write buffer to temp file
 * 2. Extract metadata (duration) and generate poster/thumbnail
 * 3. Normalize to web-friendly H.264 MP4 if needed
 * 4. Upload video, poster, and thumbnail to Spaces
 * 5. Append record to photos.json
 *
 * @param {string} collectionSlug
 * @param {Buffer} fileBuffer — raw uploaded video bytes
 * @param {string} originalFilename — e.g. "sunset-clip.mov"
 * @returns {Promise<object>} the new media object
 */
export async function processAndUploadVideo(collectionSlug, fileBuffer, originalFilename) {
	validateSlug(collectionSlug);

	// Write buffer to temp file (ffmpeg needs a file path, not a buffer)
	const inputPath = join(tmpdir(), `gp-video-${randomBytes(8).toString('hex')}-input`);
	let normalizedPath = null;
	const uploadedKeys = [];

	try {
		await writeFile(inputPath, fileBuffer);

		// 1. Extract metadata and thumbnail/poster
		const meta = await extractVideoMetadata(inputPath);
		const { posterBuffer, thumbBuffer } = await extractVideoThumbnail(inputPath);

		// 1b. Compute perceptual hash from poster frame and file hash
		const phash = await computePhash(posterBuffer).catch(() => null);
		const fHash = fileHashFn(fileBuffer);

		// 2. Normalize to H.264 MP4 if needed
		let videoBuffer;
		if (isWebFriendly(meta)) {
			// Already web-friendly — just ensure faststart
			normalizedPath = await normalizeVideo(inputPath, meta);
			videoBuffer = await readFile(normalizedPath);
		} else {
			// Re-encode
			normalizedPath = await normalizeVideo(inputPath, meta);
			videoBuffer = await readFile(normalizedPath);
		}

		// 3. Generate unique upload ID
		const baseId = originalFilename.replace(/\.[^.]+$/, '')
			.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
		const uploadId = `${baseId || 'video'}-${randomBytes(4).toString('hex')}`;

		// 4. Upload to Spaces: video (.mp4), poster (.jpg), thumbnail
		const videoKey = `${collectionSlug}/${uploadId}.mp4`;
		const posterKey = `${collectionSlug}/${uploadId}.jpg`;
		const thumbKey = `${collectionSlug}/thumbs/${uploadId}.jpg`;

		const [videoUpload, posterUpload, thumbUpload] = await Promise.allSettled([
			uploadFile(videoKey, videoBuffer, 'video/mp4'),
			uploadFile(posterKey, posterBuffer, 'image/jpeg'),
			uploadFile(thumbKey, thumbBuffer, 'image/jpeg')
		]);
		if (videoUpload.status === 'fulfilled') uploadedKeys.push(videoKey);
		if (posterUpload.status === 'fulfilled') uploadedKeys.push(posterKey);
		if (thumbUpload.status === 'fulfilled') uploadedKeys.push(thumbKey);
		if (videoUpload.status === 'rejected') throw videoUpload.reason;
		if (posterUpload.status === 'rejected') throw posterUpload.reason;
		if (thumbUpload.status === 'rejected') throw thumbUpload.reason;

		// 5. Build media record
		const record = {
			id: uploadId,
			type: 'video',
			filename: originalFilename,
			url: posterUpload.value.url,         // poster JPEG — backward compat with <img src={url}>
			videoUrl: videoUpload.value.url,      // actual video MP4
			thumbnail: thumbUpload.value.url,
			duration: meta.duration,
			description: '',
			tags: [],
			favorite: false,
			gps: meta.gps || null,
			gpsSource: meta.gps ? 'exif' : null,
			date: meta.date || null,
			camera: null,
			lens: null,
			focalLength: null,
			iso: null,
			aperture: null,
			shutterSpeed: null,
			phash: phash || undefined,
			fileHash: fHash
		};

		// 6. Atomically append to photos.json
		const filePath = photosPath(collectionSlug);
		await ensureDir(join(DATA_DIR, collectionSlug));
		try {
			await createJsonIfNotExists(filePath, { photos: [] });
		} catch (err) {
			if (err.message !== 'FILE_EXISTS') throw err;
		}

		await updateJson(filePath, (data) => {
			if (!Array.isArray(data.photos)) data.photos = [];
			if (data.photos.some((p) => p.id === uploadId)) {
				throw new Error(`Duplicate media ID: ${uploadId}`);
			}
			data.photos.push(record);
			return data;
		});

		return record;
	} catch (err) {
		// Rollback: clean up any uploaded Spaces objects on failure
		for (const key of uploadedKeys) {
			try {
				await deleteFile(key);
			} catch {
				console.error(`Rollback: failed to delete ${key}`);
			}
		}
		throw err;
	} finally {
		// Clean up temp files
		await unlink(inputPath).catch(() => {});
		if (normalizedPath) await unlink(normalizedPath).catch(() => {});
	}
}

/**
 * Update metadata fields on an existing photo.
 * Only the provided fields are merged — others are left unchanged.
 * Rejects updates to structural fields (id, url, thumbnail).
 *
 * @param {string} collectionSlug
 * @param {string} photoId
 * @param {object} updates — partial Photo fields
 * @returns {Promise<object>} updated Photo
 */
export async function updatePhotoMetadata(collectionSlug, photoId, updates) {
	// Prevent overwriting structural/derived fields
	const forbidden = ['id', 'filename', 'url', 'thumbnail', 'videoUrl', 'type', 'phash', 'fileHash'];
	for (const key of forbidden) {
		delete updates[key];
	}

	const filePath = photosPath(collectionSlug);
	let updated = null;

	await updateJson(filePath, (data) => {
		const idx = data.photos.findIndex((p) => p.id === photoId);
		if (idx === -1) {
			throw new Error(`Photo not found: ${photoId}`);
		}
		data.photos[idx] = { ...data.photos[idx], ...updates };
		updated = data.photos[idx];
		return data;
	});

	return updated;
}

/**
 * Assign GPS coordinates to one or more photos.
 * Sets gpsSource to "manual" for all affected photos.
 *
 * @param {string} collectionSlug
 * @param {string[]} photoIds
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<object[]>} updated Photo objects
 */
export async function updatePhotoGps(collectionSlug, photoIds, lat, lng) {
	// Deduplicate input IDs
	const uniqueIds = [...new Set(photoIds)];
	const idSet = new Set(uniqueIds);
	const updatedPhotos = [];
	const filePath = photosPath(collectionSlug);

	await updateJson(filePath, (data) => {
		// Validate all IDs exist before mutating
		const existingIds = new Set(data.photos.map((p) => p.id));
		const missing = uniqueIds.filter((id) => !existingIds.has(id));
		if (missing.length > 0) {
			throw new Error(`Photos not found: ${missing.join(', ')}`);
		}

		for (const photo of data.photos) {
			if (idSet.has(photo.id)) {
				photo.gps = { lat, lng };
				photo.gpsSource = 'manual';
				updatedPhotos.push({ ...photo });
			}
		}
		return data;
	});

	return updatedPhotos;
}

/**
 * Delete a photo — removes from Spaces (display + thumb) and from photos.json.
 *
 * @param {string} collectionSlug
 * @param {string} photoId
 * @returns {Promise<void>}
 */
export async function deletePhoto(collectionSlug, photoId) {
	const filePath = photosPath(collectionSlug);

	// Verify photo exists before attempting Spaces delete
	const photos = await listPhotos(collectionSlug);
	const photo = photos.find((p) => p.id === photoId);
	if (!photo) {
		throw new Error(`Photo not found: ${photoId}`);
	}

	// Delete from Spaces FIRST — if this fails, metadata stays intact for retry
	const posterKey = `${collectionSlug}/${photoId}.jpg`;
	const thumbKey = `${collectionSlug}/thumbs/${photoId}.jpg`;
	const keysToDelete = [posterKey, thumbKey];

	// Videos also have an .mp4 file
	if (photo.type === 'video') {
		keysToDelete.push(`${collectionSlug}/${photoId}.mp4`);
	}

	await Promise.all(keysToDelete.map((key) => deleteFile(key)));

	// Then remove from photos.json atomically
	await updateJson(filePath, (data) => {
		const idx = data.photos.findIndex((p) => p.id === photoId);
		if (idx !== -1) {
			data.photos.splice(idx, 1);
		}
		return data;
	});
}

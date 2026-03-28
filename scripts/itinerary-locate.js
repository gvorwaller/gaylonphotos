#!/usr/bin/env node
/**
 * Assign GPS coordinates to unlocated photos based on itinerary stop dates.
 *
 * For travel collections with an itinerary, matches each photo's date to the
 * active stop on that day and assigns the stop's coordinates.
 *
 * Usage:
 *   node scripts/itinerary-locate.js <collection-slug> [--prod] [--dry-run]
 *
 * Options:
 *   --prod      Read from / write to production (gaylon.photos via SSH + API)
 *   --dry-run   Preview matches without writing any changes
 */

import fs from 'fs';
import path from 'path';

// Load .env manually (no dotenv dependency needed)
const envPath = path.resolve(import.meta.dirname, '..', '.env');
if (fs.existsSync(envPath)) {
	for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq > 0) {
			const key = trimmed.slice(0, eq).trim();
			const val = trimmed.slice(eq + 1).trim();
			if (!process.env[key]) process.env[key] = val;
		}
	}
}

const args = process.argv.slice(2);
const slug = args.find(a => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const prod = args.includes('--prod');

if (!slug) {
	console.error('Usage: node scripts/itinerary-locate.js <collection-slug> [--prod] [--dry-run]');
	process.exit(1);
}

const BASE_URL = prod ? 'https://gaylon.photos' : 'http://localhost:5174';
const UPLOAD_USER = process.env.UPLOAD_USER;
const UPLOAD_PASS = process.env.UPLOAD_PASS;
const REMOTE = 'root@134.199.211.199';
const REMOTE_DATA = '/opt/gaylonphotos/data';

// --- Data Loading ---

async function loadJson(relativePath) {
	if (prod) {
		const { execSync } = await import('child_process');
		try {
			const json = execSync(
				`ssh ${REMOTE} "cat ${REMOTE_DATA}/${relativePath}"`,
				{ encoding: 'utf8', timeout: 15000 }
			);
			return JSON.parse(json);
		} catch (e) {
			console.error(`Failed to fetch ${relativePath} from server: ${e.message}`);
			return null;
		}
	}
	const localPath = path.join('data', relativePath);
	if (fs.existsSync(localPath)) {
		return JSON.parse(fs.readFileSync(localPath, 'utf8'));
	}
	return null;
}

// --- Auth ---

async function login() {
	if (!UPLOAD_USER || !UPLOAD_PASS) {
		console.error('Set UPLOAD_USER and UPLOAD_PASS in .env');
		process.exit(1);
	}
	const resp = await fetch(`${BASE_URL}/api/auth`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', 'Origin': BASE_URL },
		body: JSON.stringify({ username: UPLOAD_USER, password: UPLOAD_PASS })
	});
	if (!resp.ok) {
		console.error(`Login failed: ${resp.status}`);
		process.exit(1);
	}
	const setCookie = resp.headers.get('set-cookie');
	if (!setCookie) {
		console.error('No session cookie returned');
		process.exit(1);
	}
	return setCookie.split(';')[0];
}

async function updatePhoto(cookie, photoId, updates) {
	const resp = await fetch(`${BASE_URL}/api/photos`, {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json',
			'Origin': BASE_URL,
			'Cookie': cookie
		},
		body: JSON.stringify({ collection: slug, photoId, updates })
	});
	return resp.ok;
}

// --- Itinerary Matching ---

/**
 * Find the active itinerary stop for a given photo date.
 * Returns the most recent stop whose arrivalDate <= photo date.
 */
function findStopForDate(stops, photoDateISO) {
	const photoDate = photoDateISO.slice(0, 10); // YYYY-MM-DD
	let match = null;
	for (const stop of stops) {
		if (!stop.arrivalDate) continue;
		if (photoDate >= stop.arrivalDate) {
			match = stop;
		} else {
			break; // stops are sorted by arrivalDate, so we can stop early
		}
	}
	return match;
}

function sleep(ms) {
	return new Promise(r => setTimeout(r, ms));
}

// --- Main ---

async function main() {
	// Load photos
	const photosData = await loadJson(`${slug}/photos.json`);
	if (!photosData || !photosData.photos) {
		console.error(`Could not load photos for "${slug}". Check collection slug and run from project root.`);
		process.exit(1);
	}
	const photos = photosData.photos;

	// Load itinerary
	const itineraryData = await loadJson(`${slug}/itinerary.json`);
	if (!itineraryData || !itineraryData.stops || itineraryData.stops.length === 0) {
		console.error(`No itinerary found for "${slug}". This script only works on travel collections with stops.`);
		process.exit(1);
	}

	// Sort stops by arrivalDate
	const stops = itineraryData.stops
		.filter(s => s.arrivalDate && s.lat && s.lng)
		.sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate));

	if (stops.length === 0) {
		console.error('No valid stops (with dates and coordinates) found in itinerary.');
		process.exit(1);
	}

	const mode = prod ? 'PROD' : 'LOCAL';
	console.log(`[${mode}] Loaded ${photos.length} photos, ${stops.length} itinerary stops for "${slug}"`);
	console.log(`  Stops: ${stops.map(s => `${s.city} (${s.arrivalDate})`).join(' → ')}\n`);

	// Find photos without GPS that have a date
	const candidates = photos.filter(p => {
		const hasGps = p.gps && p.gps.lat != null && p.gps.lng != null;
		return !hasGps && p.date;
	});

	const noDate = photos.filter(p => {
		const hasGps = p.gps && p.gps.lat != null && p.gps.lng != null;
		return !hasGps && !p.date;
	});

	console.log(`Photos without GPS: ${candidates.length + noDate.length}`);
	if (noDate.length > 0) {
		console.log(`  (${noDate.length} have no date and will be skipped)`);
	}

	if (candidates.length === 0) {
		console.log('Nothing to do — all dateable photos already have GPS.');
		return;
	}

	// Match candidates to stops
	const matches = [];
	const unmatched = [];

	for (const photo of candidates) {
		const stop = findStopForDate(stops, photo.date);
		if (stop) {
			matches.push({ photo, stop });
		} else {
			unmatched.push(photo);
		}
	}

	// Group by stop for display
	const byStop = {};
	for (const { photo, stop } of matches) {
		const key = stop.city;
		if (!byStop[key]) byStop[key] = { stop, photos: [] };
		byStop[key].photos.push(photo);
	}

	console.log(`\nMatched ${matches.length} photos to itinerary stops:\n`);
	for (const [city, group] of Object.entries(byStop)) {
		const s = group.stop;
		console.log(`  ${city} (${s.lat}, ${s.lng}) — ${group.photos.length} photos`);
		if (dryRun) {
			for (const p of group.photos) {
				const d = p.date.slice(0, 10);
				console.log(`    ${d}  ${p.filename}`);
			}
		}
	}

	if (unmatched.length > 0) {
		console.log(`\n  ${unmatched.length} photos before first stop — skipped`);
		if (dryRun) {
			for (const p of unmatched) {
				console.log(`    ${p.date?.slice(0, 10) || '?'}  ${p.filename}`);
			}
		}
	}

	if (dryRun) {
		console.log('\n[DRY RUN] No changes written.');
		return;
	}

	if (prod) {
		// Prod mode — update via API
		const cookie = await login();
		let success = 0, failed = 0;

		for (let i = 0; i < matches.length; i++) {
			const { photo, stop } = matches[i];
			const locationName = stop.country
				? `${stop.city}, ${stop.country}`
				: stop.city;

			process.stdout.write(`  [${i + 1}/${matches.length}] ${photo.filename} → ${stop.city} ... `);

			const ok = await updatePhoto(cookie, photo.id, {
				gps: { lat: stop.lat, lng: stop.lng },
				gpsSource: 'itinerary',
				locationName
			});

			if (ok) {
				console.log('ok');
				success++;
			} else {
				console.log('FAILED');
				failed++;
			}

			await sleep(50);
		}

		console.log(`\nDone: ${success} located, ${failed} failed`);
	} else {
		// Local mode — write directly to photos.json
		const photosPath = path.join('data', slug, 'photos.json');
		const data = JSON.parse(fs.readFileSync(photosPath, 'utf8'));
		const photoMap = new Map(data.photos.map(p => [p.id, p]));
		let updated = 0;

		for (const { photo, stop } of matches) {
			const p = photoMap.get(photo.id);
			if (!p) continue;
			const locationName = stop.country
				? `${stop.city}, ${stop.country}`
				: stop.city;
			p.gps = { lat: stop.lat, lng: stop.lng };
			p.gpsSource = 'itinerary';
			p.locationName = locationName;
			updated++;
		}

		fs.writeFileSync(photosPath, JSON.stringify(data, null, 2) + '\n');
		console.log(`\nDone: ${updated} photos updated in ${photosPath}`);
	}
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});

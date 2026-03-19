#!/usr/bin/env node
/**
 * Geocode unresolved ancestry places using Google Geocoding API.
 * Replaces failed/ai-estimate/family-estimate places with accurate Google coordinates.
 *
 * Usage:
 *   node scripts/ai-geocode-ancestry.js <collection-slug> [--dry-run] [--status <status>]
 *
 * Reads PUBLIC_GOOGLE_MAPS_API_KEY from .env.
 * Default: geocodes places with status "failed" (no coordinates).
 * Use --status to target a specific status (e.g. --status ai-estimate).
 * If Google cannot resolve a place, marks it as "failed" with null coordinates.
 */

import fs from 'fs';
import path from 'path';

// Load .env manually
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

const API_KEY = process.env.GOOGLE_GEOCODING_KEY;
if (!API_KEY) {
	console.error('Missing GOOGLE_GEOCODING_KEY in .env');
	process.exit(1);
}

const slug = process.argv[2];
if (!slug) {
	console.error('Usage: node scripts/ai-geocode-ancestry.js <collection-slug> [--dry-run] [--status <status>]');
	process.exit(1);
}
const dryRun = process.argv.includes('--dry-run');
const statusIdx = process.argv.indexOf('--status');
const targetStatus = statusIdx >= 0 ? process.argv[statusIdx + 1] : null;

const ancestryPath = path.resolve(import.meta.dirname, '..', 'data', slug, 'ancestry.json');
if (!fs.existsSync(ancestryPath)) {
	console.error(`No ancestry.json found at ${ancestryPath}`);
	process.exit(1);
}

const ancestry = JSON.parse(fs.readFileSync(ancestryPath, 'utf8'));
const places = ancestry.places || [];

// Find places to geocode
let toGeocode;
if (targetStatus) {
	toGeocode = places.filter(p => p.geocodeStatus === targetStatus);
	console.log(`Found ${toGeocode.length} places with status "${targetStatus}" out of ${places.length} total.`);
} else {
	toGeocode = places.filter(p => p.geocodeStatus === 'failed' || (p.lat == null && p.lng == null));
	console.log(`Found ${toGeocode.length} unresolved places out of ${places.length} total.`);
}

if (toGeocode.length === 0) {
	console.log('Nothing to do.');
	process.exit(0);
}

/**
 * Call Google Geocoding API for a single place name.
 * Returns { lat, lng, formattedAddress, locationType } or null.
 */
async function geocodeWithGoogle(placeName) {
	const url = `https://maps.googleapis.com/maps/api/geocode/json?${new URLSearchParams({
		address: placeName,
		key: API_KEY
	})}`;

	const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
	if (!resp.ok) {
		throw new Error(`Google API HTTP ${resp.status}`);
	}

	const data = await resp.json();

	if (data.status === 'REQUEST_DENIED') {
		throw new Error(`Google API denied: ${data.error_message || 'Geocoding API may not be enabled'}`);
	}

	if (data.status !== 'OK' || !data.results?.length) {
		return null;
	}

	const result = data.results[0];
	const { lat, lng } = result.geometry.location;
	const locationType = result.geometry.location_type; // ROOFTOP, RANGE_INTERPOLATED, GEOMETRIC_CENTER, APPROXIMATE
	return {
		lat,
		lng,
		formattedAddress: result.formatted_address,
		locationType
	};
}

let resolved = 0;
let unresolved = 0;

for (let i = 0; i < toGeocode.length; i++) {
	const place = toGeocode[i];

	// Rate limit: ~10 req/sec
	if (i > 0) {
		await new Promise(r => setTimeout(r, 100));
	}

	try {
		const result = await geocodeWithGoogle(place.name);

		if (result) {
			place.lat = result.lat;
			place.lng = result.lng;
			// ROOFTOP or RANGE_INTERPOLATED = precise; GEOMETRIC_CENTER or APPROXIMATE = approximate
			place.geocodeStatus = (result.locationType === 'ROOFTOP' || result.locationType === 'RANGE_INTERPOLATED')
				? 'ok' : 'approximate';
			place.modernName = result.formattedAddress || null;
			// Clean up old AI fields
			delete place.aiConfidence;
			resolved++;
			console.log(`  [${i + 1}/${toGeocode.length}] ✓ ${place.name} → ${result.formattedAddress} (${result.lat}, ${result.lng}) [${result.locationType}]`);
		} else {
			place.lat = null;
			place.lng = null;
			place.geocodeStatus = 'failed';
			delete place.aiConfidence;
			delete place.modernName;
			unresolved++;
			console.log(`  [${i + 1}/${toGeocode.length}] ✗ ${place.name} — not found`);
		}
	} catch (err) {
		console.error(`  [${i + 1}/${toGeocode.length}] ✗ ${place.name} — error: ${err.message}`);
		// On API error (e.g. denied), stop early — likely a config issue
		if (err.message.includes('denied')) {
			console.error('\nStopping: Google Geocoding API access denied. Enable it at https://console.cloud.google.com/apis/library/geocoding-backend.googleapis.com');
			process.exit(1);
		}
		unresolved++;
	}
}

console.log(`\nDone: ${resolved} resolved, ${unresolved} unresolvable, ${toGeocode.length} total attempted.`);

if (!dryRun && resolved > 0) {
	fs.writeFileSync(ancestryPath, JSON.stringify(ancestry, null, '\t') + '\n');
	console.log(`Updated ${ancestryPath}`);
} else if (dryRun) {
	console.log('Dry run — no files modified.');
}

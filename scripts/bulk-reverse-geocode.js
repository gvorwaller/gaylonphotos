#!/usr/bin/env node
/**
 * Bulk reverse-geocode photos that have GPS but no locationName.
 *
 * Usage:
 *   node scripts/bulk-reverse-geocode.js <collection-slug> [--prod] [--dry-run]
 *
 * Reads the Google Maps API key from .env (PUBLIC_GOOGLE_MAPS_API_KEY).
 * Uses the Google Maps Geocoding REST API (server-side, no browser needed).
 * Rate-limited to ~10 requests/second to stay within Google's free tier.
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

const GOOGLE_API_KEY = process.env.PUBLIC_GOOGLE_MAPS_API_KEY;
if (!GOOGLE_API_KEY) {
	console.error('Missing PUBLIC_GOOGLE_MAPS_API_KEY in .env');
	process.exit(1);
}

const args = process.argv.slice(2);
const slug = args.find(a => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const prod = args.includes('--prod');

if (!slug) {
	console.error('Usage: node scripts/bulk-reverse-geocode.js <collection-slug> [--prod] [--dry-run]');
	process.exit(1);
}

const BASE_URL = prod ? 'https://gaylon.photos' : 'http://localhost:5174';
const UPLOAD_USER = process.env.UPLOAD_USER;
const UPLOAD_PASS = process.env.UPLOAD_PASS;

// --- Google Maps Geocoding REST API ---

const PLUS_CODE_RE = /^[23456789CFGHJMPQRVWX]+\+[23456789CFGHJMPQRVWX]*$/;

function findComponent(results, type) {
	for (const result of results) {
		const comp = result.address_components?.find(c => c.types.includes(type));
		if (comp) return comp;
	}
	return null;
}

function formatPlaceName(results) {
	if (!results?.length) return null;

	const components = results[0].address_components;
	if (!components) return null;

	const get = (type) => components.find(c => c.types.includes(type))?.long_name || null;
	const getShort = (type) => components.find(c => c.types.includes(type))?.short_name || null;

	const poi = findComponent(results, 'point_of_interest') ||
		findComponent(results, 'park') ||
		findComponent(results, 'establishment');
	const poiName = poi?.long_name || null;

	const country = get('country');
	const state = get('administrative_area_level_1');
	const stateShort = getShort('administrative_area_level_1');
	const city =
		get('locality') ||
		get('sublocality') ||
		get('natural_feature') ||
		get('administrative_area_level_2') ||
		state;

	let region = null;
	if (country === 'United States' && stateShort) {
		region = stateShort;
	} else if (country) {
		region = country;
	}

	if (poiName && region && poiName !== city) {
		return `${poiName}, ${region}`;
	}

	if (!city) {
		const formatted = results[0].formatted_address;
		if (formatted && !PLUS_CODE_RE.test(formatted.split(',')[0].trim())) {
			return formatted;
		}
		return null;
	}

	if (region && city !== country && city !== state) {
		return `${city}, ${region}`;
	}

	return city;
}

async function reverseGeocodeGoogle(lat, lng) {
	const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_API_KEY}`;
	const resp = await fetch(url);
	const data = await resp.json();
	if (data.status !== 'OK') return null;
	return formatPlaceName(data.results);
}

/**
 * Reverse-geocode via OpenStreetMap Nominatim (free, no API key needed).
 * Rate limit: 1 request/second per Nominatim usage policy.
 */
async function reverseGeocodeNominatim(lat, lng) {
	const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14&accept-language=en`;
	const resp = await fetch(url, {
		headers: { 'User-Agent': 'gaylonphotos-bulk-geocoder/1.0' }
	});
	if (!resp.ok) return null;
	const data = await resp.json();
	if (data.error) return null;

	const addr = data.address;
	if (!addr) return data.display_name || null;

	const city = addr.city || addr.town || addr.village || addr.municipality
		|| addr.county || addr.state;
	const country = addr.country;

	if (!city) return data.display_name || null;
	if (country && city !== country) {
		return `${city}, ${country}`;
	}
	return city;
}

async function reverseGeocode(lat, lng) {
	// Try Google first if key works, fall back to Nominatim
	if (GOOGLE_API_KEY && !useNominatim) {
		const result = await reverseGeocodeGoogle(lat, lng);
		if (result) return result;
		// If Google fails (e.g. referrer restriction), switch to Nominatim
		console.log('\n  Google Geocoding API denied — switching to Nominatim (OSM)');
		useNominatim = true;
	}
	return reverseGeocodeNominatim(lat, lng);
}

let useNominatim = false;

function sleep(ms) {
	return new Promise(r => setTimeout(r, ms));
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
	// Extract just the cookie name=value part
	const cookie = setCookie.split(';')[0];
	return cookie;
}

async function updatePhoto(cookie, photoId, locationName) {
	const resp = await fetch(`${BASE_URL}/api/photos`, {
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json',
			'Origin': BASE_URL,
			'Cookie': cookie
		},
		body: JSON.stringify({
			collection: slug,
			photoId,
			updates: { locationName }
		})
	});
	return resp.ok;
}

// --- Main ---

async function loadPhotos() {
	// For prod: fetch from server via SSH
	if (prod) {
		const { execSync } = await import('child_process');
		try {
			const json = execSync(
				`ssh root@134.199.211.199 "cat /opt/gaylonphotos/data/${slug}/photos.json"`,
				{ encoding: 'utf8', timeout: 15000 }
			);
			return JSON.parse(json).photos;
		} catch (e) {
			console.error(`Failed to fetch photos.json from server: ${e.message}`);
		}
	}
	// Fallback: local data file
	const localPath = path.join('data', slug, 'photos.json');
	if (fs.existsSync(localPath)) {
		const data = JSON.parse(fs.readFileSync(localPath, 'utf8'));
		return data.photos;
	}
	return null;
}

async function main() {
	const photos = await loadPhotos();
	if (!photos) {
		console.error(`Could not load photos for ${slug}. Run from project root or check collection slug.`);
		process.exit(1);
	}
	console.log(`Loaded ${photos.length} photos for ${slug}`);

	const needGeocode = photos.filter(p => p.gps?.lat && !p.locationName);
	console.log(`Photos with GPS but no place name: ${needGeocode.length}`);
	if (needGeocode.length === 0) {
		console.log('Nothing to do.');
		return;
	}

	if (dryRun) {
		console.log('\n[DRY RUN] Would geocode:');
		for (const p of needGeocode.slice(0, 10)) {
			const name = await reverseGeocode(p.gps.lat, p.gps.lng);
			console.log(`  ${p.id}: ${p.gps.lat},${p.gps.lng} → ${name}`);
			await sleep(100);
		}
		console.log(`  ... and ${Math.max(0, needGeocode.length - 10)} more`);
		return;
	}

	if (!prod) {
		console.log('Use --prod to geocode and update production data.');
		return;
	}

	const cookie = await login();
	let success = 0, failed = 0, skipped = 0;

	for (let i = 0; i < needGeocode.length; i++) {
		const p = needGeocode[i];
		process.stdout.write(`  [${i + 1}/${needGeocode.length}] ${p.id} ... `);

		const name = await reverseGeocode(p.gps.lat, p.gps.lng);
		if (!name) {
			console.log('no result');
			skipped++;
			await sleep(100);
			continue;
		}

		const ok = await updatePhoto(cookie, p.id, name);
		if (ok) {
			console.log(name);
			success++;
		} else {
			console.log('FAILED to update');
			failed++;
		}
		await sleep(useNominatim ? 1100 : 100); // Nominatim: 1 req/s; Google: ~10 req/s
	}

	console.log(`\nDone: ${success} geocoded, ${skipped} no result, ${failed} failed`);
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});

#!/usr/bin/env node
/**
 * Family-context geocoding for ancestry places that AI geocoding couldn't resolve.
 * Estimates coordinates by looking at the person(s) associated with each unresolved place,
 * then finding known locations from:
 *   1. The person's own birth/death places
 *   2. Parents' birth/death places
 *   3. Children's birth/death places
 *
 * Priority: person's own places > parents > children.
 * Uses the closest relative's coordinates (geographically nearest to the family cluster).
 *
 * Usage:
 *   node scripts/family-geocode-ancestry.js <collection-slug> [--dry-run]
 */

import fs from 'fs';
import path from 'path';

const slug = process.argv[2];
if (!slug) {
	console.error('Usage: node scripts/family-geocode-ancestry.js <collection-slug> [--dry-run]');
	process.exit(1);
}
const dryRun = process.argv.includes('--dry-run');

const ancestryPath = path.resolve(import.meta.dirname, '..', 'data', slug, 'ancestry.json');
if (!fs.existsSync(ancestryPath)) {
	console.error(`No ancestry.json found at ${ancestryPath}`);
	process.exit(1);
}

const ancestry = JSON.parse(fs.readFileSync(ancestryPath, 'utf8'));
const places = ancestry.places || [];
const persons = ancestry.persons || [];

// Build lookups
const placeByName = new Map();
for (const p of places) placeByName.set(p.name, p);

const personById = new Map();
for (const p of persons) personById.set(p.id, p);

// Find unresolved places
const failed = places.filter(p => p.geocodeStatus === 'failed');
console.log(`Found ${failed.length} unresolved places out of ${places.length} total.\n`);

if (failed.length === 0) {
	console.log('Nothing to do.');
	process.exit(0);
}

/**
 * Get coordinates from a place name, if resolved.
 */
function getPlaceCoords(placeName) {
	if (!placeName) return null;
	const place = placeByName.get(placeName);
	if (place && place.lat != null && place.lng != null) {
		return { lat: place.lat, lng: place.lng, name: placeName };
	}
	return null;
}

/**
 * Collect all known coordinates for a person's birth/death places.
 */
function getPersonCoords(person) {
	const coords = [];
	const bp = getPlaceCoords(person.birthPlace);
	if (bp) coords.push({ ...bp, source: 'birth', personName: person.name });
	const dp = getPlaceCoords(person.deathPlace);
	if (dp) coords.push({ ...dp, source: 'death', personName: person.name });
	return coords;
}

/**
 * Find parents by lineagePath convention.
 */
function findParents(person) {
	if (!person.lineagePath) return [];
	const fatherPath = person.lineagePath + "'s father";
	const motherPath = person.lineagePath + "'s mother";
	return persons.filter(p => p.lineagePath === fatherPath || p.lineagePath === motherPath);
}

/**
 * Find children by lineagePath convention.
 * A child's lineagePath + "'s father" or "'s mother" should equal this person's lineagePath.
 */
function findChildren(person) {
	if (!person.lineagePath) return [];
	const targetGen = person.generation - 1;
	return persons.filter(p => {
		if (p.generation !== targetGen || !p.lineagePath) return false;
		return p.lineagePath + "'s father" === person.lineagePath ||
		       p.lineagePath + "'s mother" === person.lineagePath;
	});
}

/**
 * Compute centroid of an array of {lat, lng} points.
 */
function centroid(points) {
	if (points.length === 0) return null;
	if (points.length === 1) return { lat: points[0].lat, lng: points[0].lng };
	const sum = points.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
	return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

let resolved = 0;

for (const place of failed) {
	// Collect all persons at this place
	const placePersons = (place.events || [])
		.map(e => personById.get(e.personId))
		.filter(Boolean);

	if (placePersons.length === 0) {
		console.log(`  ✗ ${place.name} — no persons associated`);
		continue;
	}

	// Gather candidate coordinates in priority order
	const selfCoords = [];   // person's own birth/death places
	const parentCoords = []; // parents' places
	const childCoords = [];  // children's places

	const seen = new Set(); // deduplicate persons (same person may appear in multiple events)
	for (const person of placePersons) {
		if (seen.has(person.id)) continue;
		seen.add(person.id);

		selfCoords.push(...getPersonCoords(person));

		for (const parent of findParents(person)) {
			parentCoords.push(...getPersonCoords(parent));
		}

		for (const child of findChildren(person)) {
			childCoords.push(...getPersonCoords(child));
		}
	}

	// Pick the best estimate: prefer self > parents > children
	let bestCoords = null;
	let sourceLabel = '';

	if (selfCoords.length > 0) {
		bestCoords = centroid(selfCoords);
		sourceLabel = `person's own places (${selfCoords.map(c => c.name).join(', ')})`;
	} else if (parentCoords.length > 0) {
		bestCoords = centroid(parentCoords);
		sourceLabel = `parents' places (${parentCoords.map(c => c.name).join(', ')})`;
	} else if (childCoords.length > 0) {
		bestCoords = centroid(childCoords);
		sourceLabel = `children's places (${childCoords.map(c => c.name).join(', ')})`;
	}

	if (bestCoords) {
		// Round to 3 decimal places (~111m precision — plenty for a map pin)
		place.lat = Math.round(bestCoords.lat * 1000) / 1000;
		place.lng = Math.round(bestCoords.lng * 1000) / 1000;
		place.geocodeStatus = 'family-estimate';
		place.aiConfidence = 'low';
		resolved++;
		console.log(`  ✓ ${place.name} → (${place.lat}, ${place.lng}) from ${sourceLabel}`);
	} else {
		console.log(`  ✗ ${place.name} — no family coordinates found`);
	}
}

console.log(`\nDone: ${resolved} resolved out of ${failed.length} unresolved.`);

if (!dryRun && resolved > 0) {
	fs.writeFileSync(ancestryPath, JSON.stringify(ancestry, null, '\t') + '\n');
	console.log(`Updated ${ancestryPath}`);
} else if (dryRun) {
	console.log('Dry run — no files modified.');
}

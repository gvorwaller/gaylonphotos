#!/usr/bin/env node
/**
 * AI-assisted geocoding for unresolved ancestry places.
 * Uses the Anthropic API (Claude) to estimate lat/lng for historical places
 * like "Prussia, German Empire" or "Königsberg, East Prussia".
 *
 * Usage:
 *   node scripts/ai-geocode-ancestry.js <collection-slug> [--dry-run]
 *
 * Reads ANTHROPIC_API_KEY from .env.
 * Batches ~20 places per API call. Updates ancestry.json in-place.
 * Sets geocodeStatus to "ai-estimate" and adds modernName field.
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

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
	console.error('Missing ANTHROPIC_API_KEY in .env');
	process.exit(1);
}

const slug = process.argv[2];
if (!slug) {
	console.error('Usage: node scripts/ai-geocode-ancestry.js <collection-slug> [--dry-run]');
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

// Find unresolved places
const failed = places.filter(p => p.geocodeStatus === 'failed' || (p.lat == null && p.lng == null));
console.log(`Found ${failed.length} unresolved places out of ${places.length} total.`);

if (failed.length === 0) {
	console.log('Nothing to do.');
	process.exit(0);
}

const BATCH_SIZE = 20;

async function callClaude(placeNames) {
	const prompt = `For each historical place name below, provide the approximate modern-day coordinates (latitude, longitude) and the modern equivalent name if different. These are genealogical places from GEDCOM data, often historical regions that no longer exist (e.g. Prussia, East Prussia).

Reply ONLY with a JSON array, no markdown fencing, no explanation. Each element:
{"index": 0, "lat": 54.71, "lng": 20.45, "modernName": "Kaliningrad, Russia", "confidence": "high"}

confidence should be "high" (well-known city/region), "medium" (small town, approximate), or "low" (very uncertain).

If you truly cannot determine any location, use: {"index": 0, "lat": null, "lng": null, "modernName": null, "confidence": "none"}

Places:
${placeNames.map((n, i) => `${i}. ${n}`).join('\n')}`;

	const resp = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'x-api-key': ANTHROPIC_API_KEY,
			'anthropic-version': '2023-06-01',
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			model: 'claude-sonnet-4-20250514',
			max_tokens: 4096,
			messages: [{ role: 'user', content: prompt }]
		})
	});

	if (!resp.ok) {
		const err = await resp.text();
		throw new Error(`Anthropic API error ${resp.status}: ${err}`);
	}

	const data = await resp.json();
	const text = data.content[0].text.trim();

	// Parse JSON — strip markdown fencing if present
	const jsonStr = text.replace(/^```json\s*/, '').replace(/\s*```$/, '');
	return JSON.parse(jsonStr);
}

// Process in batches
let resolved = 0;
let skipped = 0;

for (let i = 0; i < failed.length; i += BATCH_SIZE) {
	const batch = failed.slice(i, i + BATCH_SIZE);
	const names = batch.map(p => p.name);
	const batchNum = Math.floor(i / BATCH_SIZE) + 1;
	const totalBatches = Math.ceil(failed.length / BATCH_SIZE);

	console.log(`\nBatch ${batchNum}/${totalBatches} (${batch.length} places)...`);

	try {
		const results = await callClaude(names);

		for (const result of results) {
			const place = batch[result.index];
			if (!place) continue;

			if (result.lat != null && result.lng != null && result.confidence !== 'none') {
				place.lat = result.lat;
				place.lng = result.lng;
				place.geocodeStatus = 'ai-estimate';
				place.modernName = result.modernName || null;
				place.aiConfidence = result.confidence || 'medium';
				resolved++;
				console.log(`  ✓ ${place.name} → ${result.modernName || 'coords only'} (${result.lat}, ${result.lng}) [${result.confidence}]`);
			} else {
				skipped++;
				console.log(`  ✗ ${place.name} — could not resolve`);
			}
		}
	} catch (err) {
		console.error(`  Error in batch ${batchNum}: ${err.message}`);
	}

	// Brief pause between batches to be polite
	if (i + BATCH_SIZE < failed.length) {
		await new Promise(r => setTimeout(r, 1000));
	}
}

console.log(`\nDone: ${resolved} resolved, ${skipped} unresolvable, ${failed.length} total attempted.`);

if (!dryRun && resolved > 0) {
	fs.writeFileSync(ancestryPath, JSON.stringify(ancestry, null, '\t') + '\n');
	console.log(`Updated ${ancestryPath}`);
} else if (dryRun) {
	console.log('Dry run — no files modified.');
}

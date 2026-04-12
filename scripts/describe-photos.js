#!/usr/bin/env node
/**
 * Generate AI descriptions for all photos in a collection (or all collections).
 *
 * Usage:
 *   node scripts/describe-photos.js [collection-slug] [--dry-run] [--force]
 *
 * Without a slug, processes all collections.
 * Skips photos that already have aiDescription unless --force is used.
 * Reads OPENAI_API_KEY from .env.
 */

import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { DESCRIBE_PROMPT, DESCRIBE_MODEL, parseDescribeResponse } from '../src/lib/describe-prompt.js';

// Load .env manually (same pattern as ai-geocode-ancestry.js)
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

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
	console.error('Missing OPENAI_API_KEY in .env');
	process.exit(1);
}

const slug = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');

const dataDir = path.resolve(import.meta.dirname, '..', 'data');
const client = new OpenAI({ apiKey: API_KEY });

/**
 * Describe a single photo via GPT-4.1-mini vision.
 */
async function describePhoto(imageUrl) {
	const response = await client.chat.completions.create({
		model: DESCRIBE_MODEL,
		max_tokens: 300,
		messages: [
			{
				role: 'user',
				content: [
					{ type: 'image_url', image_url: { url: imageUrl } },
					{ type: 'text', text: DESCRIBE_PROMPT }
				]
			}
		]
	});
	return parseDescribeResponse(response.choices[0]?.message?.content);
}

/**
 * Process a single collection.
 */
async function processCollection(collectionSlug) {
	const photosPath = path.join(dataDir, collectionSlug, 'photos.json');
	if (!fs.existsSync(photosPath)) {
		console.log(`  Skipping ${collectionSlug} — no photos.json`);
		return { described: 0, skipped: 0, failed: 0 };
	}

	const data = JSON.parse(fs.readFileSync(photosPath, 'utf8'));
	const photos = data.photos || [];

	// Filter to photos needing description
	const toDescribe = force
		? photos.filter(p => p.thumbnail && !p.isVideo)
		: photos.filter(p => p.thumbnail && !p.isVideo && !p.aiDescription);

	console.log(`\n${collectionSlug}: ${toDescribe.length} photos to describe (${photos.length} total)`);

	if (toDescribe.length === 0) return { described: 0, skipped: photos.length, failed: 0 };

	let described = 0;
	let failed = 0;

	for (let i = 0; i < toDescribe.length; i++) {
		const photo = toDescribe[i];

		// Rate limit: 200ms between calls
		if (i > 0) {
			await new Promise(r => setTimeout(r, 200));
		}

		if (dryRun) {
			console.log(`  [${i + 1}/${toDescribe.length}] Would describe ${photo.id}`);
			described++;
			continue;
		}

		try {
			const description = await describePhoto(photo.thumbnail);
			if (description) {
				photo.aiDescription = description;
				described++;
				console.log(`  [${i + 1}/${toDescribe.length}] ✓ ${photo.id} — ${description.slice(0, 80)}...`);
			} else {
				failed++;
				console.log(`  [${i + 1}/${toDescribe.length}] ✗ ${photo.id} — empty response`);
			}
		} catch (err) {
			failed++;
			console.error(`  [${i + 1}/${toDescribe.length}] ✗ ${photo.id} — ${err.message}`);
			// On auth error, stop early
			if (err.status === 401 || err.status === 403) {
				console.error('\nStopping: OpenAI API auth error.');
				process.exit(1);
			}
		}
	}

	if (!dryRun && described > 0) {
		fs.writeFileSync(photosPath, JSON.stringify(data, null, '\t') + '\n');
		console.log(`  Updated ${photosPath}`);
	}

	return { described, skipped: photos.length - toDescribe.length, failed };
}

// Main
const collectionsFile = path.join(dataDir, 'collections.json');
const { collections } = JSON.parse(fs.readFileSync(collectionsFile, 'utf8'));

const slugs = slug ? [slug] : collections.map(c => c.slug);
let totalDescribed = 0;
let totalFailed = 0;

for (const s of slugs) {
	const result = await processCollection(s);
	totalDescribed += result.described;
	totalFailed += result.failed;
}

console.log(`\nDone: ${totalDescribed} described, ${totalFailed} failed.`);
if (dryRun) console.log('Dry run — no files modified.');

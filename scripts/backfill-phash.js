#!/usr/bin/env node

/**
 * Backfill perceptual hashes (phash) for existing photos.
 *
 * Downloads the display image (or poster for videos) from CDN,
 * computes dHash, and writes phash back to photos.json.
 *
 * Usage:
 *   node scripts/backfill-phash.js <collection-slug>
 *   node scripts/backfill-phash.js --all
 */

import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { computePhash } from '../src/lib/server/phash.js';

const DATA_DIR = 'data';

// ── Environment ─────────────────────────────────────────────────────

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

const { SPACES_CDN_URL } = process.env;
if (!SPACES_CDN_URL) {
	console.error('Missing SPACES_CDN_URL in .env');
	process.exit(1);
}

// ── Helpers ─────────────────────────────────────────────────────────

async function readJson(filePath) {
	return JSON.parse(await readFile(filePath, 'utf-8'));
}

async function writeJson(filePath, data) {
	await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

async function downloadImage(url) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
	return Buffer.from(await res.arrayBuffer());
}

// ── Backfill ────────────────────────────────────────────────────────

async function backfillCollection(slug) {
	const photosPath = join(DATA_DIR, slug, 'photos.json');
	let data;
	try {
		data = await readJson(photosPath);
	} catch {
		console.error(`  No photos.json for ${slug}, skipping`);
		return { total: 0, backfilled: 0, failed: 0 };
	}

	const needsHash = data.photos.filter(p => !p.phash);
	if (needsHash.length === 0) {
		console.log(`  ${slug}: all ${data.photos.length} items already have phash`);
		return { total: data.photos.length, backfilled: 0, failed: 0 };
	}

	console.log(`  ${slug}: ${needsHash.length}/${data.photos.length} need phash`);

	let backfilled = 0;
	let failed = 0;

	for (const photo of needsHash) {
		try {
			// Download the display image (poster for videos) from CDN
			const imageUrl = photo.url;
			const buffer = await downloadImage(imageUrl);
			const phash = await computePhash(buffer);
			photo.phash = phash;
			backfilled++;

			if (backfilled % 50 === 0) {
				console.log(`    ... ${backfilled}/${needsHash.length}`);
			}
		} catch (err) {
			console.error(`    FAIL ${photo.id}: ${err.message}`);
			failed++;
		}
	}

	await writeJson(photosPath, data);
	console.log(`  ${slug}: backfilled ${backfilled}, failed ${failed}`);
	return { total: data.photos.length, backfilled, failed };
}

// ── CLI ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length === 0) {
	console.error('Usage: node scripts/backfill-phash.js <collection-slug>');
	console.error('       node scripts/backfill-phash.js --all');
	process.exit(1);
}

const isAll = args.includes('--all');
let slugs;

if (isAll) {
	// Find all collection dirs that have photos.json
	slugs = readdirSync(DATA_DIR)
		.filter(entry => {
			const p = join(DATA_DIR, entry, 'photos.json');
			try { statSync(p); return true; } catch { return false; }
		});
} else {
	slugs = [args[0]];
}

console.log(`\nBackfilling phash for ${slugs.length} collection(s)...\n`);

let totalBackfilled = 0;
let totalFailed = 0;

for (const slug of slugs) {
	const result = await backfillCollection(slug);
	totalBackfilled += result.backfilled;
	totalFailed += result.failed;
}

console.log(`\nDone! Backfilled: ${totalBackfilled}, Failed: ${totalFailed}\n`);

#!/usr/bin/env node
/**
 * Generate text embeddings for all photos with AI descriptions.
 *
 * Usage:
 *   node scripts/embed-photos.js [collection-slug] [--force]
 *
 * Without a slug, processes all collections.
 * Skips photos already in embeddings.json unless --force.
 * Reads OPENAI_API_KEY from .env.
 */

import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';

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

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
	console.error('Missing OPENAI_API_KEY in .env');
	process.exit(1);
}

const EMBEDDING_MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 100; // OpenAI supports up to 2048 inputs per call

const slug = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const force = process.argv.includes('--force');

const dataDir = path.resolve(import.meta.dirname, '..', 'data');
const client = new OpenAI({ apiKey: API_KEY });

/**
 * Build the text to embed for a photo, combining all searchable metadata.
 */
function buildEmbeddingText(photo) {
	const parts = [];
	if (photo.aiDescription) parts.push(photo.aiDescription);
	if (photo.description) parts.push(photo.description);
	if (photo.species) parts.push(photo.species);
	if (photo.scientificName) parts.push(photo.scientificName);
	if (photo.locationName) parts.push(photo.locationName);
	if (photo.spot) parts.push(photo.spot);
	if (photo.conditions) parts.push(photo.conditions);
	if (photo.tags?.length) parts.push(photo.tags.join(' '));
	return parts.join(' ');
}

/**
 * Process a single collection.
 */
async function processCollection(collectionSlug) {
	const photosPath = path.join(dataDir, collectionSlug, 'photos.json');
	if (!fs.existsSync(photosPath)) {
		console.log(`  Skipping ${collectionSlug} — no photos.json`);
		return 0;
	}

	const { photos } = JSON.parse(fs.readFileSync(photosPath, 'utf8'));

	// Load existing embeddings
	const embeddingsPath = path.join(dataDir, collectionSlug, 'embeddings.json');
	let existing = {};
	if (!force && fs.existsSync(embeddingsPath)) {
		try {
			const data = JSON.parse(fs.readFileSync(embeddingsPath, 'utf8'));
			existing = data.embeddings || {};
		} catch { /* start fresh */ }
	}

	// Filter to photos with embeddable text that need embedding
	const toEmbed = photos.filter(p => {
		const text = buildEmbeddingText(p);
		if (!text) return false;
		if (!force && existing[p.id]) return false;
		return true;
	});

	console.log(`\n${collectionSlug}: ${toEmbed.length} photos to embed (${photos.length} total, ${Object.keys(existing).length} already embedded)`);

	if (toEmbed.length === 0) return 0;

	let embedded = 0;

	// Process in batches
	for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
		const batch = toEmbed.slice(i, i + BATCH_SIZE);
		const texts = batch.map(p => buildEmbeddingText(p));

		try {
			const response = await client.embeddings.create({
				model: EMBEDDING_MODEL,
				input: texts
			});

			for (let j = 0; j < batch.length; j++) {
				existing[batch[j].id] = response.data[j].embedding;
				embedded++;
			}

			console.log(`  [${Math.min(i + BATCH_SIZE, toEmbed.length)}/${toEmbed.length}] Embedded batch`);
		} catch (err) {
			console.error(`  Batch failed at offset ${i}: ${err.message}`);
			if (err.status === 401 || err.status === 403) {
				console.error('\nStopping: OpenAI API auth error.');
				process.exit(1);
			}
		}

		// Rate limit between batches
		if (i + BATCH_SIZE < toEmbed.length) {
			await new Promise(r => setTimeout(r, 200));
		}
	}

	if (embedded > 0) {
		const output = {
			model: EMBEDDING_MODEL,
			dimensions: 1536,
			generatedAt: new Date().toISOString(),
			embeddings: existing
		};
		fs.writeFileSync(embeddingsPath, JSON.stringify(output) + '\n');
		console.log(`  Updated ${embeddingsPath} (${Object.keys(existing).length} total embeddings)`);
	}

	return embedded;
}

// Main
const collectionsFile = path.join(dataDir, 'collections.json');
const { collections } = JSON.parse(fs.readFileSync(collectionsFile, 'utf8'));

const slugs = slug ? [slug] : collections.map(c => c.slug);
let totalEmbedded = 0;

for (const s of slugs) {
	totalEmbedded += await processCollection(s);
}

console.log(`\nDone: ${totalEmbedded} embeddings generated.`);

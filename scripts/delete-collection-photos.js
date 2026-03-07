#!/usr/bin/env node

/**
 * One-time script: delete all photos from a collection's DO Spaces prefix
 * and reset its photos.json to an empty array.
 *
 * Usage: node scripts/delete-collection-photos.js <collection-slug>
 */

import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	S3Client, ListObjectsV2Command, DeleteObjectsCommand
} from '@aws-sdk/client-s3';

// Load .env
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
} catch { console.error('Warning: could not read .env'); }

const { SPACES_KEY, SPACES_SECRET, SPACES_BUCKET, SPACES_REGION, SPACES_ENDPOINT } = process.env;
if (!SPACES_KEY || !SPACES_SECRET || !SPACES_BUCKET) {
	console.error('Missing SPACES_* env vars'); process.exit(1);
}

const slug = process.argv[2];
if (!slug) { console.error('Usage: node scripts/delete-collection-photos.js <collection-slug>'); process.exit(1); }

const s3 = new S3Client({
	region: SPACES_REGION,
	endpoint: SPACES_ENDPOINT,
	forcePathStyle: false,
	credentials: { accessKeyId: SPACES_KEY, secretAccessKey: SPACES_SECRET }
});

async function deletePrefix(prefix) {
	let token, total = 0;
	do {
		const list = await s3.send(new ListObjectsV2Command({
			Bucket: SPACES_BUCKET, Prefix: prefix, ContinuationToken: token
		}));
		const objects = list.Contents;
		if (!objects || objects.length === 0) break;
		await s3.send(new DeleteObjectsCommand({
			Bucket: SPACES_BUCKET, Delete: { Objects: objects.map(o => ({ Key: o.Key })), Quiet: true }
		}));
		total += objects.length;
		console.log(`  Deleted ${total} objects so far...`);
		token = list.IsTruncated ? list.NextContinuationToken : undefined;
	} while (token);
	return total;
}

console.log(`\nDeleting all Spaces objects under "${slug}/"...`);
const count = await deletePrefix(`${slug}/`);
console.log(`Deleted ${count} objects from Spaces.`);

const photosPath = join('data', slug, 'photos.json');
await writeFile(photosPath, JSON.stringify({ photos: [] }, null, 2) + '\n');
console.log(`Reset ${photosPath} to empty.\n`);

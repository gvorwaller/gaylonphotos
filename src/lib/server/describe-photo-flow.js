/**
 * Shared "generate AI description + embedding for a single photo" flow.
 * Used by:
 *   - /api/photos POST (fire-and-forget on upload)
 *   - /api/describe POST (admin bulk/per-photo regenerate)
 */
import fs from 'fs';
import path from 'path';
import { readJson, updateJson } from './json-store.js';
import { describePhoto } from './describe.js';
import { buildEmbeddingText, generateEmbedding, invalidateCache } from './embeddings.js';

/**
 * Generate aiDescription + embedding for one photo.
 * Persists the description to photos.json and the embedding to embeddings.json.
 *
 * @param {string} collection — collection slug
 * @param {string} photoId
 * @returns {Promise<{ok: boolean, aiDescription?: string, error?: string}>}
 */
export async function describeAndEmbedPhoto(collection, photoId) {
	try {
		const data = await readJson(`data/${collection}/photos.json`);
		const photo = data.photos?.find((p) => p.id === photoId);
		if (!photo?.thumbnail) return { ok: false, error: 'Photo or thumbnail missing' };

		const aiDescription = await describePhoto(photo.thumbnail);
		if (!aiDescription) return { ok: false, error: 'Description generation failed' };

		await updateJson(`data/${collection}/photos.json`, (d) => {
			const p = d.photos?.find((p) => p.id === photoId);
			if (p) p.aiDescription = aiDescription;
		});

		const embeddingText = buildEmbeddingText({ ...photo, aiDescription });
		const embedding = await generateEmbedding(embeddingText);
		if (embedding) {
			const embeddingsPath = path.resolve('data', collection, 'embeddings.json');
			let embData = { model: 'text-embedding-3-small', dimensions: 1536, embeddings: {} };
			if (fs.existsSync(embeddingsPath)) {
				try {
					embData = JSON.parse(fs.readFileSync(embeddingsPath, 'utf8'));
				} catch {
					/* fresh */
				}
			}
			embData.embeddings[photoId] = embedding;
			fs.writeFileSync(embeddingsPath, JSON.stringify(embData) + '\n');
			invalidateCache(collection);
		}

		return { ok: true, aiDescription };
	} catch (err) {
		console.warn(`describeAndEmbedPhoto failed for ${collection}/${photoId}:`, err.message);
		return { ok: false, error: err.message };
	}
}

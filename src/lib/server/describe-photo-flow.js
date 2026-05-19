/**
 * Shared "generate AI description + embedding for a single photo" flow.
 * Used by:
 *   - /api/photos POST (fire-and-forget on upload)
 *   - /api/describe POST (admin bulk/per-photo regenerate)
 */
import { readJson, updateJson, createJsonIfNotExists } from './json-store.js';
import { describePhoto } from './describe.js';
import { buildEmbeddingText, generateEmbedding, invalidateCache } from './embeddings.js';

const DEFAULT_EMBEDDINGS_FILE = { model: 'text-embedding-3-small', dimensions: 1536, embeddings: {} };

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
			return d;
		});

		const embeddingText = buildEmbeddingText({ ...photo, aiDescription });
		const embedding = await generateEmbedding(embeddingText);
		if (embedding) {
			const embeddingsPath = `data/${collection}/embeddings.json`;
			// Ensure the file exists, then mutate it under the per-file lock so
			// concurrent describes can't lose each other's embeddings.
			try {
				await createJsonIfNotExists(embeddingsPath, DEFAULT_EMBEDDINGS_FILE);
			} catch (err) {
				if (err.message !== 'FILE_EXISTS') throw err;
			}
			await updateJson(embeddingsPath, (d) => {
				if (!d.embeddings || typeof d.embeddings !== 'object') d.embeddings = {};
				if (!d.model) d.model = DEFAULT_EMBEDDINGS_FILE.model;
				if (!d.dimensions) d.dimensions = DEFAULT_EMBEDDINGS_FILE.dimensions;
				d.embeddings[photoId] = embedding;
				return d;
			});
			invalidateCache(collection);
		}

		return { ok: true, aiDescription };
	} catch (err) {
		console.warn(`describeAndEmbedPhoto failed for ${collection}/${photoId}:`, err.message);
		return { ok: false, error: err.message };
	}
}

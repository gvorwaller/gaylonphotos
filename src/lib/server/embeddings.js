/**
 * Embedding-based semantic photo search.
 *
 * Generates text embeddings via OpenAI text-embedding-3-small,
 * caches them in memory, and performs cosine similarity search.
 * At ~1,000 photos, brute-force search takes <5ms.
 */
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { OPENAI_API_KEY } from '$env/static/private';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const DIMENSIONS = 1536;

let client = null;

function getClient() {
	if (!client) client = new OpenAI({ apiKey: OPENAI_API_KEY });
	return client;
}

// Module-level cache: slug → { embeddings: Map<photoId, Float64Array>, model: string }
const cache = new Map();

/**
 * Generate an embedding for a text string.
 * @param {string} text
 * @returns {Promise<number[]|null>}
 */
export async function generateEmbedding(text) {
	if (!OPENAI_API_KEY) return null;
	try {
		const response = await getClient().embeddings.create({
			model: EMBEDDING_MODEL,
			input: text
		});
		return response.data[0]?.embedding || null;
	} catch (err) {
		console.warn('Embedding generation failed:', err.message);
		return null;
	}
}

/**
 * Generate embeddings for multiple texts in a single API call.
 * @param {string[]} texts
 * @returns {Promise<number[][]|null>}
 */
export async function generateEmbeddings(texts) {
	if (!OPENAI_API_KEY || texts.length === 0) return null;
	try {
		const response = await getClient().embeddings.create({
			model: EMBEDDING_MODEL,
			input: texts
		});
		return response.data.map(d => d.embedding);
	} catch (err) {
		console.warn('Batch embedding generation failed:', err.message);
		return null;
	}
}

/**
 * Build the text to embed for a photo, combining all searchable metadata.
 * @param {object} photo
 * @returns {string}
 */
export function buildEmbeddingText(photo) {
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
 * Load embeddings for a collection from disk, caching in memory.
 * @param {string} slug
 * @returns {Map<string, Float64Array>} photoId → embedding vector
 */
export function loadEmbeddings(slug) {
	if (cache.has(slug)) return cache.get(slug);

	const embeddingsPath = path.resolve('data', slug, 'embeddings.json');
	const embeddingMap = new Map();

	if (fs.existsSync(embeddingsPath)) {
		try {
			const data = JSON.parse(fs.readFileSync(embeddingsPath, 'utf8'));
			for (const [id, vector] of Object.entries(data.embeddings || {})) {
				embeddingMap.set(id, new Float64Array(vector));
			}
		} catch (err) {
			console.warn(`Failed to load embeddings for ${slug}:`, err.message);
		}
	}

	cache.set(slug, embeddingMap);
	return embeddingMap;
}

/**
 * Clear the in-memory cache for a collection (call after writing new embeddings).
 * @param {string} slug
 */
export function invalidateCache(slug) {
	cache.delete(slug);
}

/**
 * Compute dot product of two vectors (cosine similarity for normalized vectors).
 */
function dotProduct(a, b) {
	let sum = 0;
	for (let i = 0; i < a.length; i++) {
		sum += a[i] * b[i];
	}
	return sum;
}

/**
 * Search photos across one or all collections.
 * @param {string} query — natural language search text
 * @param {object} options
 * @param {string} [options.collection] — limit to one collection
 * @param {number} [options.limit=20] — max results
 * @param {{ north: number, south: number, east: number, west: number }} [options.bounds] — GPS bounding box
 * @param {object[]} [options.allPhotos] — pre-loaded photos array (avoids re-reading JSON)
 * @returns {Promise<{ results: object[], query: string }|null>}
 */
export async function searchPhotos(query, options = {}) {
	const { collection, limit = 20, bounds } = options;

	// Embed the query
	const queryEmbedding = await generateEmbedding(query);
	if (!queryEmbedding) return null;
	const queryVec = new Float64Array(queryEmbedding);

	// Determine which collections to search
	const collectionsFile = path.resolve('data', 'collections.json');
	const { collections } = JSON.parse(fs.readFileSync(collectionsFile, 'utf8'));
	const slugs = collection
		? [collection]
		: collections.map(c => c.slug);

	const queryLower = query.toLowerCase();
	const scored = [];

	for (const slug of slugs) {
		const embeddings = loadEmbeddings(slug);
		if (embeddings.size === 0) continue;

		// Load photos for metadata
		const photosPath = path.resolve('data', slug, 'photos.json');
		if (!fs.existsSync(photosPath)) continue;
		const { photos } = JSON.parse(fs.readFileSync(photosPath, 'utf8'));
		const photoMap = new Map(photos.map(p => [p.id, p]));

		for (const [photoId, embedding] of embeddings) {
			const photo = photoMap.get(photoId);
			if (!photo) continue;

			// GPS bounds filter
			if (bounds && photo.gps) {
				const { lat, lng } = photo.gps;
				if (lat < bounds.south || lat > bounds.north) continue;
				// Handle antimeridian wrapping
				if (bounds.west <= bounds.east) {
					if (lng < bounds.west || lng > bounds.east) continue;
				} else {
					if (lng < bounds.west && lng > bounds.east) continue;
				}
			} else if (bounds && !photo.gps) {
				continue; // Skip photos without GPS when bounds filter is active
			}

			// Cosine similarity
			let score = dotProduct(queryVec, embedding);

			// Hybrid boost: exact substring match in searchable text
			const searchText = [
				photo.aiDescription, photo.description, photo.species,
				photo.locationName, photo.spot, photo.conditions,
				...(photo.tags || [])
			].filter(Boolean).join(' ').toLowerCase();

			if (searchText.includes(queryLower)) {
				score = Math.min(1.0, score + 0.1);
			}

			scored.push({
				id: photo.id,
				collection: slug,
				score,
				thumbnail: photo.thumbnail,
				url: photo.url,
				aiDescription: photo.aiDescription || null,
				description: photo.description || null,
				gps: photo.gps,
				date: photo.date
			});
		}
	}

	// Sort by score descending, take top results
	scored.sort((a, b) => b.score - a.score);
	const results = scored.slice(0, Math.min(limit, 50));

	return { results, query };
}

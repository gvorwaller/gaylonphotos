import { readJson, updateJson, createJsonIfNotExists, ensureDir } from './json-store.js';
import { deletePrefix } from './storage.js';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';

const COLLECTIONS_PATH = 'data/collections.json';
const DATA_DIR = 'data';

/**
 * Validate a collection slug to prevent path traversal.
 * @param {string} slug
 */
function validateSlug(slug) {
	if (!slug || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
		throw new Error('Invalid collection slug');
	}
}

/**
 * List all collections.
 * @returns {Promise<object[]>} Collection[]
 */
export async function listCollections() {
	try {
		const data = await readJson(COLLECTIONS_PATH);
		return data.collections || [];
	} catch {
		return [];
	}
}

/**
 * Get a single collection by slug.
 * @param {string} slug
 * @returns {Promise<object|null>}
 */
export async function getCollection(slug) {
	if (!slug || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) return null;
	const collections = await listCollections();
	return collections.find((c) => c.slug === slug) || null;
}

/**
 * Create a new collection.
 * Initializes the data directory and empty photos.json for it.
 * @param {object} collectionData — { slug, name, type, description, heroImage?, dateRange? }
 * @returns {Promise<object>} the created Collection
 */
export async function createCollection(collectionData) {
	const { slug, name, type, description } = collectionData;
	validateSlug(slug);

	if (!name || !type) {
		throw new Error('name and type are required');
	}

	const validTypes = ['travel', 'wildlife', 'action'];
	if (!validTypes.includes(type)) {
		throw new Error(`Invalid collection type: ${type}. Must be one of: ${validTypes.join(', ')}`);
	}

	const collection = {
		slug,
		name,
		type,
		description: description || '',
		heroImage: collectionData.heroImage || null,
		...(type === 'travel' ? {
			dateRange: collectionData.dateRange || { start: null, end: null },
			showAncestry: collectionData.showAncestry ?? false
		} : {})
	};

	// Ensure collections.json exists (atomic — prevents TOCTOU race on fresh install)
	await ensureDir(DATA_DIR);
	try {
		await createJsonIfNotExists(COLLECTIONS_PATH, { collections: [] });
	} catch (err) {
		if (err.message !== 'FILE_EXISTS') throw err;
	}

	// Add to collections.json — duplicate check inside lock to prevent TOCTOU race
	await updateJson(COLLECTIONS_PATH, (data) => {
		if (!Array.isArray(data.collections)) data.collections = [];
		if (data.collections.some((c) => c.slug === slug)) {
			throw new Error(`Collection already exists: ${slug}`);
		}
		data.collections.push(collection);
		return data;
	});

	// Create data directory and initialize empty photos.json
	const collectionDir = join(DATA_DIR, slug);
	await ensureDir(collectionDir);
	try {
		await createJsonIfNotExists(join(collectionDir, 'photos.json'), { photos: [] });
	} catch (err) {
		if (err.message !== 'FILE_EXISTS') throw err;
	}

	return collection;
}

/**
 * Update an existing collection's metadata.
 * Cannot change the slug (that's the identity key).
 * @param {string} slug
 * @param {object} updates — partial Collection fields
 * @returns {Promise<object>} updated Collection
 */
export async function updateCollection(slug, updates) {
	validateSlug(slug);
	// Prevent changing slug or type (would break file structure)
	delete updates.slug;
	delete updates.type;

	let updated = null;

	await updateJson(COLLECTIONS_PATH, (data) => {
		const idx = data.collections.findIndex((c) => c.slug === slug);
		if (idx === -1) {
			throw new Error(`Collection not found: ${slug}`);
		}
		data.collections[idx] = { ...data.collections[idx], ...updates };
		updated = data.collections[idx];
		return data;
	});

	return updated;
}

/**
 * Delete a collection — removes from collections.json, deletes local data directory,
 * and deletes all objects from Spaces under the collection prefix.
 * @param {string} slug
 * @returns {Promise<void>}
 */
export async function deleteCollection(slug) {
	validateSlug(slug);
	// Verify existence before destructive operations
	const existing = await getCollection(slug);
	if (!existing) {
		throw new Error(`Collection not found: ${slug}`);
	}

	// Delete Spaces objects FIRST — if this fails, metadata stays for retry
	await deletePrefix(`${slug}/`);

	// Remove from collections.json
	await updateJson(COLLECTIONS_PATH, (data) => {
		if (!Array.isArray(data.collections)) data.collections = [];
		const idx = data.collections.findIndex((c) => c.slug === slug);
		if (idx !== -1) {
			data.collections.splice(idx, 1);
		}
		return data;
	});

	// Delete local data directory last
	const collectionDir = join(DATA_DIR, slug);
	try {
		await rm(collectionDir, { recursive: true, force: true });
	} catch (err) {
		console.error(`Warning: failed to delete local data dir ${collectionDir}:`, err.message);
	}
}

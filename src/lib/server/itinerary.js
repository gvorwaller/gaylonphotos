import { readJson, writeJson, updateJson, ensureDir } from './json-store.js';
import { getCollection } from './collections.js';
import { join } from 'node:path';

const DATA_DIR = 'data';

/**
 * Resolve the itinerary.json path for a collection.
 * @param {string} slug
 * @returns {string}
 */
/**
 * Validate a collection slug to prevent path traversal.
 */
function validateSlug(slug) {
	if (!slug || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
		throw new Error('Invalid collection slug');
	}
}

function itineraryPath(slug) {
	validateSlug(slug);
	return join(DATA_DIR, slug, 'itinerary.json');
}

/**
 * Validate that a collection exists and is a travel type.
 * @param {string} slug
 * @returns {Promise<void>}
 * @throws if collection doesn't exist or isn't type "travel"
 */
async function validateTravelCollection(slug) {
	const collection = await getCollection(slug);
	if (!collection) {
		throw new Error(`Collection not found: ${slug}`);
	}
	if (collection.type !== 'travel') {
		throw new Error(`Collection "${slug}" is type "${collection.type}", not "travel". Itineraries are only for travel collections.`);
	}
}

/**
 * Get the itinerary for a collection.
 * Returns null if no itinerary exists yet.
 * @param {string} collectionSlug
 * @returns {Promise<object|null>}
 */
export async function getItinerary(collectionSlug) {
	try {
		return await readJson(itineraryPath(collectionSlug));
	} catch {
		return null;
	}
}

/**
 * Replace the entire itinerary for a collection.
 * @param {string} collectionSlug
 * @param {object} itineraryData — full Itinerary object { trip, stops }
 * @returns {Promise<object>} the saved Itinerary
 */
export async function updateItinerary(collectionSlug, itineraryData) {
	await validateTravelCollection(collectionSlug);
	await ensureDir(join(DATA_DIR, collectionSlug));
	await writeJson(itineraryPath(collectionSlug), itineraryData);
	return itineraryData;
}

/**
 * Add a stop to the itinerary.
 * Auto-assigns a sequential ID.
 * @param {string} collectionSlug
 * @param {object} stopData — partial ItineraryStop (without id)
 * @returns {Promise<object>} the new ItineraryStop with id
 */
export async function addStop(collectionSlug, stopData) {
	await validateTravelCollection(collectionSlug);

	const filePath = itineraryPath(collectionSlug);
	let newStop;

	// Ensure itinerary file exists before atomic update
	try {
		await readJson(filePath);
	} catch {
		// File doesn't exist — initialize with empty itinerary
		await ensureDir(join(DATA_DIR, collectionSlug));
		await writeJson(filePath, {
			trip: { name: '', description: '', startDate: null, endDate: null },
			stops: []
		});
	}

	await updateJson(filePath, (data) => {
		const stops = Array.isArray(data.stops) ? data.stops : [];
		data.stops = stops;
		const maxId = stops.reduce((max, s) => Math.max(max, s.id), 0);
		newStop = {
			id: maxId + 1,
			city: stopData.city || '',
			country: stopData.country || '',
			lat: stopData.lat ?? 0,
			lng: stopData.lng ?? 0,
			arrivalDate: stopData.arrivalDate || null,
			departureDate: stopData.departureDate || null,
			notes: stopData.notes || ''
		};
		data.stops.push(newStop);
		return data;
	});

	return newStop;
}

/**
 * Update fields on an existing stop.
 * @param {string} collectionSlug
 * @param {number} stopId
 * @param {object} updates — partial ItineraryStop fields
 * @returns {Promise<object>} updated ItineraryStop
 */
export async function updateStop(collectionSlug, stopId, updates) {
	// Prevent overwriting the id
	delete updates.id;

	let updated = null;
	const filePath = itineraryPath(collectionSlug);

	await updateJson(filePath, (data) => {
		const idx = data.stops.findIndex((s) => s.id === stopId);
		if (idx === -1) {
			throw new Error(`Stop not found: ${stopId}`);
		}
		data.stops[idx] = { ...data.stops[idx], ...updates };
		updated = data.stops[idx];
		return data;
	});

	return updated;
}

/**
 * Delete a stop from the itinerary.
 * @param {string} collectionSlug
 * @param {number} stopId
 * @returns {Promise<void>}
 */
export async function deleteStop(collectionSlug, stopId) {
	const filePath = itineraryPath(collectionSlug);

	await updateJson(filePath, (data) => {
		const before = data.stops.length;
		data.stops = data.stops.filter((s) => s.id !== stopId);
		if (data.stops.length === before) {
			throw new Error(`Stop not found: ${stopId}`);
		}
		return data;
	});
}

/**
 * Reorder stops to match the provided ordered array of IDs.
 * All existing stop IDs must be present in orderedIds.
 * @param {string} collectionSlug
 * @param {number[]} orderedIds — stop IDs in desired order
 * @returns {Promise<object[]>} stops in new order
 */
export async function reorderStops(collectionSlug, orderedIds) {
	let reordered = null;
	const filePath = itineraryPath(collectionSlug);

	await updateJson(filePath, (data) => {
		const stopMap = new Map(data.stops.map((s) => [s.id, s]));

		// Validate: every existing stop must appear in orderedIds
		if (orderedIds.length !== stopMap.size) {
			throw new Error(
				`orderedIds length (${orderedIds.length}) doesn't match stop count (${stopMap.size})`
			);
		}

		reordered = orderedIds.map((id) => {
			const stop = stopMap.get(id);
			if (!stop) {
				throw new Error(`Stop not found in reorder list: ${id}`);
			}
			return stop;
		});

		data.stops = reordered;
		return data;
	});

	return reordered;
}

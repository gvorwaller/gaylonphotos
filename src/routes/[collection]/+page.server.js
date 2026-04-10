import { getCollection } from '$lib/server/collections.js';
import { listPhotos } from '$lib/server/photos.js';
import { getItinerary } from '$lib/server/itinerary.js';
import { getAncestry } from '$lib/server/ancestry.js';
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
	const collection = await getCollection(params.collection);
	if (!collection) {
		throw error(404, 'Collection not found');
	}

	const photos = await listPhotos(params.collection);

	// Load itinerary for travel collections; ancestry only if enabled
	let itinerary = null;
	let ancestry = null;
	if (collection.type === 'travel') {
		const promises = [getItinerary(params.collection)];
		if (collection.showAncestry) {
			promises.push(getAncestry(params.collection));
		}
		const results = await Promise.all(promises);
		itinerary = results[0];
		ancestry = results[1] ?? null;
	}

	return { collection, photos, itinerary, ancestry };
}

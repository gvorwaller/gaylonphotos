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

	// Load itinerary and ancestry for travel collections
	let itinerary = null;
	let ancestry = null;
	if (collection.type === 'travel') {
		[itinerary, ancestry] = await Promise.all([
			getItinerary(params.collection),
			getAncestry(params.collection)
		]);
	}

	return { collection, photos, itinerary, ancestry };
}

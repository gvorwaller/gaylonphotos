import { getCollection } from '$lib/server/collections.js';
import { getItinerary } from '$lib/server/itinerary.js';
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
	const collection = await getCollection(params.collection);
	if (!collection) {
		throw error(404, `Collection not found: ${params.collection}`);
	}

	if (collection.type !== 'travel') {
		throw error(400, `Itinerary editor is only available for travel collections`);
	}

	const itinerary = await getItinerary(params.collection);

	return { collection, itinerary };
}

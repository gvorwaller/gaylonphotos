import { getCollection } from '$lib/server/collections.js';
import { getAncestry } from '$lib/server/ancestry.js';
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
	const collection = await getCollection(params.collection);
	if (!collection) {
		throw error(404, 'Collection not found');
	}
	if (collection.type !== 'travel') {
		throw error(400, 'Ancestry is only for travel collections');
	}

	const ancestry = await getAncestry(params.collection);
	if (!ancestry) {
		throw error(404, 'No ancestry data for this collection');
	}

	return { collection, ancestry };
}

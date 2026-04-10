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
	if (!collection.showAncestry) {
		throw error(400, 'Ancestry is not enabled for this collection');
	}

	const ancestry = await getAncestry(params.collection);
	if (!ancestry) {
		throw error(400, 'No ancestry data. Import a GEDCOM first.');
	}

	return { collection, ancestry };
}

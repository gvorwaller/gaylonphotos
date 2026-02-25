import { getCollection } from '$lib/server/collections.js';
import { getPhoto } from '$lib/server/photos.js';
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
	const collection = await getCollection(params.collection);
	if (!collection) {
		throw error(404, 'Collection not found');
	}

	const photo = await getPhoto(params.collection, params.id);
	if (!photo) {
		throw error(404, 'Photo not found');
	}

	return { collection, photo };
}

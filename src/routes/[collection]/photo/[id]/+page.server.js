import { getCollection } from '$lib/server/collections.js';
import { getPhoto } from '$lib/server/photos.js';
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
	const collection = await getCollection(params.collection);
	if (!collection) {
		error(404, `Collection not found: ${params.collection}`);
	}

	const photo = await getPhoto(params.collection, params.id);
	if (!photo) {
		error(404, `Photo not found: ${params.id}`);
	}

	return { collection, photo };
}

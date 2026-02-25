import { getCollection } from '$lib/server/collections.js';
import { listPhotos } from '$lib/server/photos.js';
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
	const collection = await getCollection(params.collection);
	if (!collection) {
		error(404, `Collection not found: ${params.collection}`);
	}

	const photos = await listPhotos(params.collection);

	return { collection, photos };
}

import { getCollection } from '$lib/server/collections.js';
import { listPhotos } from '$lib/server/photos.js';
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
	const collection = await getCollection(params.collection);
	if (!collection) {
		throw error(404, `Collection not found: ${params.collection}`);
	}

	const allPhotos = await listPhotos(params.collection);
	const untaggedPhotos = allPhotos.filter((p) => p.gpsSource === null);

	return { collection, allPhotos, untaggedPhotos };
}

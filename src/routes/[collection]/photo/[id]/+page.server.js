import { getCollection } from '$lib/server/collections.js';
import { getPhoto, listPhotos } from '$lib/server/photos.js';
import { byChronological } from '$lib/photo-sort.js';
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

	// Load all photos for prev/next navigation and counter
	const allPhotos = await listPhotos(params.collection);
	allPhotos.sort(byChronological);

	// Send lightweight nav list (just id + thumbnail for preloading)
	const photoNav = allPhotos.map((p) => ({ id: p.id, thumbnail: p.thumbnail }));

	return { collection, photo, photoNav };
}

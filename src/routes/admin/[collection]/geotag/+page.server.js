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
	// Show untagged first so they're top of the list, then tagged photos
	// (chronological within each group so order stays predictable).
	allPhotos.sort((a, b) => {
		const aUntagged = a.gpsSource === null ? 0 : 1;
		const bUntagged = b.gpsSource === null ? 0 : 1;
		if (aUntagged !== bUntagged) return aUntagged - bUntagged;
		const ad = a.date || '';
		const bd = b.date || '';
		return ad.localeCompare(bd);
	});

	return { collection, photos: allPhotos };
}

import { getCollection } from '$lib/server/collections.js';
import { listPhotos } from '$lib/server/photos.js';
import { byChronological } from '$lib/photo-sort.js';
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
	const collection = await getCollection(params.collection);
	if (!collection) {
		throw error(404, `Collection not found: ${params.collection}`);
	}

	const allPhotos = await listPhotos(params.collection);
	// Show untagged first so they're top of the list, then tagged photos
	// (chronological within each group, with filename tiebreaker for stable
	// ordering on same-day or date-only legacy photos — see byChronological).
	allPhotos.sort((a, b) => {
		const aUntagged = a.gpsSource === null ? 0 : 1;
		const bUntagged = b.gpsSource === null ? 0 : 1;
		if (aUntagged !== bUntagged) return aUntagged - bUntagged;
		return byChronological(a, b);
	});

	return { collection, photos: allPhotos };
}

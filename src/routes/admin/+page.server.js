import { listCollections } from '$lib/server/collections.js';
import { listPhotos } from '$lib/server/photos.js';

/** @type {import('./$types').PageServerLoad} */
export async function load() {
	const collections = await listCollections();

	// Get photo counts per collection for dashboard stats (parallel)
	const stats = await Promise.all(collections.map(async (c) => {
		const photos = await listPhotos(c.slug);
		const untagged = photos.filter((p) => p.gpsSource === null).length;
		return {
			...c,
			photoCount: photos.length,
			untaggedCount: untagged
		};
	}));

	return { collections: stats };
}

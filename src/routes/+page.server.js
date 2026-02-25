import { listPhotos } from '$lib/server/photos.js';

/** @type {import('./$types').PageServerLoad} */
export async function load({ parent }) {
	const { collections } = await parent();

	// Load photos per collection in parallel — full list for counts, sliced for hero display
	const photosByCollection = {};
	const photoCounts = {};
	await Promise.all(collections.map(async (c) => {
		const photos = await listPhotos(c.slug);
		photoCounts[c.slug] = photos.length;
		photosByCollection[c.slug] = photos.slice(0, 6);
	}));

	return { collections, photosByCollection, photoCounts };
}

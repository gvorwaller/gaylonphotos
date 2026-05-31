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
		const slice = photos.slice(0, 6);
		if (c.heroImage && !slice.some((p) => p.id === c.heroImage)) {
			const hero = photos.find((p) => p.id === c.heroImage);
			if (hero) slice.push(hero);
		}
		photosByCollection[c.slug] = slice;
	}));

	return { collections, photosByCollection, photoCounts };
}

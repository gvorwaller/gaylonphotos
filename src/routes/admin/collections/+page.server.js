import { listCollections } from '$lib/server/collections.js';

/** @type {import('./$types').PageServerLoad} */
export async function load() {
	const collections = await listCollections();
	return { collections };
}

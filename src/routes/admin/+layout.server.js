import { listCollections } from '$lib/server/collections.js';

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ locals }) {
	const collections = await listCollections();
	return {
		user: locals.user || null,
		navCollections: collections
	};
}

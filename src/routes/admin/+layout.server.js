import { listCollections } from '$lib/server/collections.js';

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ locals }) {
	// Only load collections for authenticated users (login page is unauthenticated)
	const collections = locals.user ? await listCollections() : [];
	return {
		navCollections: collections
	};
}

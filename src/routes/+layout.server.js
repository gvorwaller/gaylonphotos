import { PUBLIC_GOOGLE_MAPS_API_KEY } from '$env/static/public';
import { adminExists } from '$lib/server/auth.js';
import { listCollections } from '$lib/server/collections.js';

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ locals }) {
	const [adminExistsResult, collections] = await Promise.all([
		adminExists(),
		listCollections()
	]);

	return {
		user: locals.user || null,
		googleMapsApiKey: PUBLIC_GOOGLE_MAPS_API_KEY,
		adminExists: adminExistsResult,
		collections
	};
}

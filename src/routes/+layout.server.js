import { PUBLIC_GOOGLE_MAPS_API_KEY } from '$env/static/public';
import { adminExists } from '$lib/server/auth.js';

/** @type {import('./$types').LayoutServerLoad} */
export async function load({ locals }) {
	return {
		user: locals.user || null,
		googleMapsApiKey: PUBLIC_GOOGLE_MAPS_API_KEY,
		adminExists: await adminExists()
	};
}

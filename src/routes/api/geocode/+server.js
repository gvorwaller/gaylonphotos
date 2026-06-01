import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const query = typeof body?.query === 'string' ? body.query.trim() : '';
	if (!query) {
		return json({ error: 'query is required' }, { status: 400 });
	}
	if (query.length > 200) {
		return json({ error: 'query is too long' }, { status: 400 });
	}

	const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
	url.searchParams.set('address', query);
	url.searchParams.set('key', env.GOOGLE_GEOCODING_KEY);

	const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
	if (!response.ok) {
		return json({ error: `Geocoding HTTP ${response.status}` }, { status: 502 });
	}

	const data = await response.json();
	if (data.status !== 'OK' || !data.results?.length) {
		return json({ error: data.error_message || 'Place not found' }, { status: 404 });
	}

	const top = data.results[0];
	return json({
		lat: top.geometry.location.lat,
		lng: top.geometry.location.lng,
		name: top.formatted_address || query,
		bounds: top.geometry.viewport || null
	});
}

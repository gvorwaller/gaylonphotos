import { json } from '@sveltejs/kit';
import { updatePhotoGps } from '$lib/server/photos.js';

/** POST /api/geotag — Assign GPS coordinates to one or more photos */
export async function POST({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { collection, photoIds, lat, lng } = body;

	if (!collection || !Array.isArray(photoIds) || photoIds.length === 0) {
		return json({ error: 'collection and non-empty photoIds array required' }, { status: 400 });
	}

	if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(collection)) {
		return json({ error: 'Invalid collection slug' }, { status: 400 });
	}

	if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng)) {
		return json({ error: 'lat and lng must be finite numbers' }, { status: 400 });
	}

	if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
		return json({ error: 'lat must be [-90, 90], lng must be [-180, 180]' }, { status: 400 });
	}

	try {
		const photos = await updatePhotoGps(collection, photoIds, lat, lng);
		return json({ photos });
	} catch (err) {
		const status = err.message.includes('not found') ? 404 : 500;
		return json({ error: err.message }, { status });
	}
}

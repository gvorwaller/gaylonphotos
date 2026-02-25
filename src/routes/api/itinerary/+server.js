import { json } from '@sveltejs/kit';
import {
	getItinerary,
	updateItinerary,
	addStop,
	deleteStop
} from '$lib/server/itinerary.js';

/** GET /api/itinerary?collection=slug — Get itinerary for a collection */
export async function GET({ url }) {
	const collection = url.searchParams.get('collection');
	if (!collection) {
		return json({ error: 'collection query parameter required' }, { status: 400 });
	}

	if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(collection)) {
		return json({ error: 'Invalid collection slug' }, { status: 400 });
	}

	const itinerary = await getItinerary(collection);
	return json({ itinerary });
}

/** PUT /api/itinerary — Replace entire itinerary */
export async function PUT({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { collection, itinerary } = body;
	if (!collection || !itinerary) {
		return json({ error: 'collection and itinerary required' }, { status: 400 });
	}

	if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(collection)) {
		return json({ error: 'Invalid collection slug' }, { status: 400 });
	}

	try {
		const result = await updateItinerary(collection, itinerary);
		return json({ itinerary: result });
	} catch (err) {
		const status = err.message.includes('not found') ? 404
			: err.message.includes('not "travel"') ? 400
			: 500;
		return json({ error: err.message }, { status });
	}
}

/** POST /api/itinerary — Add a stop */
export async function POST({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { collection, stop } = body;
	if (!collection || !stop) {
		return json({ error: 'collection and stop required' }, { status: 400 });
	}

	if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(collection)) {
		return json({ error: 'Invalid collection slug' }, { status: 400 });
	}

	try {
		const result = await addStop(collection, stop);
		return json({ stop: result }, { status: 201 });
	} catch (err) {
		const status = err.message.includes('not found') ? 404
			: err.message.includes('not "travel"') ? 400
			: 500;
		return json({ error: err.message }, { status });
	}
}

/** DELETE /api/itinerary — Remove a stop */
export async function DELETE({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { collection } = body;
	const stopId = Number(body.stopId);
	if (!collection || !Number.isInteger(stopId)) {
		return json({ error: 'collection and integer stopId required' }, { status: 400 });
	}

	if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(collection)) {
		return json({ error: 'Invalid collection slug' }, { status: 400 });
	}

	try {
		await deleteStop(collection, stopId);
		return json({ success: true });
	} catch (err) {
		const status = err.message.includes('not found') ? 404 : 500;
		return json({ error: err.message }, { status });
	}
}

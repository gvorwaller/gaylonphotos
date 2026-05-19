import { json } from '@sveltejs/kit';
import { describeAndEmbedPhoto } from '$lib/server/describe-photo-flow.js';

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const MAX_BATCH = 50;

/**
 * POST /api/describe — Generate AI description + embedding for one or more photos.
 *
 * Body: { collection: string, photoIds: string[] }
 * Auth: gated by hooks.server.js (requires admin session).
 * Returns: { results: [{ photoId, ok, aiDescription?, error? }, ...] }
 */
export async function POST({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { collection, photoIds } = body;
	if (!collection || !Array.isArray(photoIds) || photoIds.length === 0) {
		return json({ error: 'collection and photoIds[] required' }, { status: 400 });
	}
	if (!SLUG_RE.test(collection)) {
		return json({ error: 'Invalid collection slug' }, { status: 400 });
	}
	if (photoIds.length > MAX_BATCH) {
		return json({ error: `Too many photoIds (max ${MAX_BATCH} per request)` }, { status: 400 });
	}

	// Process sequentially — OpenAI rate limits and writes share the photos.json lock anyway
	const results = [];
	for (const photoId of photoIds) {
		const result = await describeAndEmbedPhoto(collection, photoId);
		results.push({ photoId, ...result });
	}

	return json({ results });
}

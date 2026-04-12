import { json } from '@sveltejs/kit';
import { searchPhotos } from '$lib/server/embeddings.js';

/**
 * GET /api/search — Semantic photo search via embeddings.
 *
 * Query params:
 *   q          — search query (required)
 *   collection — limit to one collection slug
 *   limit      — max results (default 20, max 50)
 *   bounds     — JSON GPS bounding box { north, south, east, west }
 */
export async function GET({ url }) {
	const q = url.searchParams.get('q')?.trim();
	if (!q || q.length < 2) {
		return json({ error: 'Query parameter "q" is required (min 2 chars)' }, { status: 400 });
	}

	if (q.length > 200) {
		return json({ error: 'Query too long (max 200 chars)' }, { status: 400 });
	}

	const collection = url.searchParams.get('collection') || undefined;
	const limitParam = parseInt(url.searchParams.get('limit') || '20', 10);
	const limit = Math.min(Math.max(1, limitParam || 20), 50);

	let bounds;
	const boundsParam = url.searchParams.get('bounds');
	if (boundsParam) {
		try {
			bounds = JSON.parse(boundsParam);
			if (typeof bounds.north !== 'number' || typeof bounds.south !== 'number' ||
				typeof bounds.east !== 'number' || typeof bounds.west !== 'number') {
				return json({ error: 'bounds must have north, south, east, west as numbers' }, { status: 400 });
			}
		} catch {
			return json({ error: 'Invalid bounds JSON' }, { status: 400 });
		}
	}

	const result = await searchPhotos(q, { collection, limit, bounds });

	if (!result) {
		return json({ error: 'Search unavailable — OPENAI_API_KEY not configured' }, { status: 503 });
	}

	return json({
		results: result.results,
		query: result.query,
		total: result.results.length
	});
}

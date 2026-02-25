import { json } from '@sveltejs/kit';
import {
	listCollections,
	createCollection,
	updateCollection,
	deleteCollection
} from '$lib/server/collections.js';

/** GET /api/collections — List all collections */
export async function GET() {
	const collections = await listCollections();
	return json({ collections });
}

/** POST /api/collections — Create a new collection */
export async function POST({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { slug, name, type, description } = body;
	if (!slug || !name || !type) {
		return json({ error: 'slug, name, and type required' }, { status: 400 });
	}

	// Validate slug format: lowercase, alphanumeric + hyphens
	if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) && !/^[a-z0-9]$/.test(slug)) {
		return json(
			{ error: 'slug must be lowercase alphanumeric with hyphens (e.g. "my-collection")' },
			{ status: 400 }
		);
	}

	try {
		const collection = await createCollection({
			slug, name, type, description,
			heroImage: body.heroImage,
			dateRange: body.dateRange
		});
		return json({ collection }, { status: 201 });
	} catch (err) {
		const status = err.message.includes('already exists') ? 409
			: err.message.includes('Invalid') ? 400
			: 500;
		return json({ error: err.message }, { status });
	}
}

/** PUT /api/collections — Update collection metadata */
export async function PUT({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { slug, updates } = body;
	if (!slug || !updates) {
		return json({ error: 'slug and updates required' }, { status: 400 });
	}

	if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
		return json({ error: 'Invalid collection slug' }, { status: 400 });
	}

	try {
		const collection = await updateCollection(slug, updates);
		return json({ collection });
	} catch (err) {
		const status = err.message.includes('not found') ? 404 : 500;
		return json({ error: err.message }, { status });
	}
}

/** DELETE /api/collections — Delete a collection */
export async function DELETE({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { slug } = body;
	if (!slug) {
		return json({ error: 'slug required' }, { status: 400 });
	}

	if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
		return json({ error: 'Invalid collection slug' }, { status: 400 });
	}

	try {
		await deleteCollection(slug);
		return json({ success: true });
	} catch (err) {
		const status = err.message.includes('not found') ? 404 : 500;
		return json({ error: err.message }, { status });
	}
}

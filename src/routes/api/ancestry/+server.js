import { json } from '@sveltejs/kit';
import {
	getAncestry,
	updateAncestry,
	clearAncestry,
	importGedcom
} from '$lib/server/ancestry.js';

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** GET /api/ancestry?collection=slug — Get ancestry for a collection (public) */
export async function GET({ url }) {
	const collection = url.searchParams.get('collection');
	if (!collection) {
		return json({ error: 'collection query parameter required' }, { status: 400 });
	}
	if (!SLUG_RE.test(collection)) {
		return json({ error: 'Invalid collection slug' }, { status: 400 });
	}

	try {
		const ancestry = await getAncestry(collection);
		return json({ ancestry });
	} catch {
		return json({ error: 'Failed to read ancestry data' }, { status: 500 });
	}
}

/** POST /api/ancestry — Import GEDCOM file (multipart/form-data, auth required) */
export async function POST({ request }) {
	let formData;
	try {
		formData = await request.formData();
	} catch {
		return json({ error: 'Expected multipart form data' }, { status: 400 });
	}

	const file = formData.get('file');
	const collection = formData.get('collection');
	const rootPersonId = formData.get('rootPersonId');
	const maxGenerations = parseInt(formData.get('maxGenerations') ?? '8', 10);

	if (!file || !collection || !rootPersonId) {
		return json({ error: 'file, collection, and rootPersonId required' }, { status: 400 });
	}

	if (!/^@?[A-Za-z0-9_]+@?$/.test(rootPersonId)) {
		return json({ error: 'Invalid rootPersonId format' }, { status: 400 });
	}

	if (!(file instanceof File) || file.size === 0) {
		return json({ error: 'file must be a non-empty .ged file' }, { status: 400 });
	}

	if (!file.name?.toLowerCase().endsWith('.ged')) {
		return json({ error: 'file must be a .ged file' }, { status: 400 });
	}

	if (!SLUG_RE.test(collection)) {
		return json({ error: 'Invalid collection slug' }, { status: 400 });
	}

	if (!Number.isInteger(maxGenerations) || maxGenerations < 1 || maxGenerations > 8) {
		return json({ error: 'maxGenerations must be an integer 1–8' }, { status: 400 });
	}

	// Max 10 MB for GEDCOM files
	if (file.size > 10 * 1024 * 1024) {
		return json({ error: 'GEDCOM file too large. Maximum 10 MB.' }, { status: 413 });
	}

	try {
		const gedcomText = await file.text();
		const { ancestry, geocodeReport } = await importGedcom(
			collection, gedcomText, rootPersonId, maxGenerations, file.name
		);
		return json({ ancestry, geocodeReport }, { status: 201 });
	} catch (err) {
		console.error('GEDCOM import failed:', err);
		const status = err.message.includes('not found') ? 404
			: err.message.includes('not "travel"') ? 400
			: 500;
		return json({ error: status === 500 ? 'GEDCOM import failed' : err.message }, { status });
	}
}

/** PUT /api/ancestry — Update ancestry data (auth required, for manual edits) */
export async function PUT({ request }) {
	let rawText;
	try {
		rawText = await request.text();
	} catch {
		return json({ error: 'Failed to read request body' }, { status: 400 });
	}

	if (rawText.length > 10 * 1024 * 1024) {
		return json({ error: 'Request body too large. Maximum 10 MB.' }, { status: 413 });
	}

	let body;
	try {
		body = JSON.parse(rawText);
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { collection, ancestry } = body;
	if (!collection || !ancestry) {
		return json({ error: 'collection and ancestry required' }, { status: 400 });
	}

	if (!SLUG_RE.test(collection)) {
		return json({ error: 'Invalid collection slug' }, { status: 400 });
	}

	if (!Array.isArray(ancestry.persons) || !Array.isArray(ancestry.places) || !ancestry.meta) {
		return json({ error: 'ancestry must have meta, persons[], and places[]' }, { status: 400 });
	}

	// Basic schema validation for persons and places
	for (const p of ancestry.persons) {
		if (typeof p.id !== 'string' || typeof p.name !== 'string') {
			return json({ error: 'Each person must have string id and name' }, { status: 400 });
		}
	}
	for (const p of ancestry.places) {
		if (typeof p.id !== 'string' || typeof p.name !== 'string') {
			return json({ error: 'Each place must have string id and name' }, { status: 400 });
		}
	}

	try {
		const result = await updateAncestry(collection, ancestry);
		return json({ ancestry: result });
	} catch (err) {
		const status = err.message.includes('not found') ? 404
			: err.message.includes('not "travel"') ? 400
			: 500;
		return json({ error: status === 500 ? 'Failed to save ancestry' : err.message }, { status });
	}
}

/** DELETE /api/ancestry — Clear ancestry data (auth required) */
export async function DELETE({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { collection } = body;
	if (!collection) {
		return json({ error: 'collection required' }, { status: 400 });
	}

	if (!SLUG_RE.test(collection)) {
		return json({ error: 'Invalid collection slug' }, { status: 400 });
	}

	try {
		await clearAncestry(collection);
		return json({ success: true });
	} catch (err) {
		const status = err.message.includes('not found') ? 404 : 500;
		return json({ error: status === 500 ? 'Failed to clear ancestry' : err.message }, { status });
	}
}

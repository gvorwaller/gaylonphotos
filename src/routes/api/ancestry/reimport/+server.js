import { json } from '@sveltejs/kit';
import { randomBytes } from 'crypto';
import {
	getAncestry,
	parseGedcom,
	diffAncestry,
	applyReimport
} from '$lib/server/ancestry.js';

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const ROOT_ID_RE = /^@?[A-Za-z0-9_]+@?$/;

// Server-side GEDCOM text cache (avoids roundtripping up to 10 MB through the client)
const gedcomCache = new Map(); // previewId → { gedcomText, expiresAt }
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CACHE_MAX_ENTRIES = 5;

function storeGedcom(text) {
	const now = Date.now();
	// Evict expired entries
	for (const [id, entry] of gedcomCache) {
		if (entry.expiresAt < now) gedcomCache.delete(id);
	}
	// Enforce max entries — evict oldest if at capacity
	while (gedcomCache.size >= CACHE_MAX_ENTRIES) {
		const oldestKey = gedcomCache.keys().next().value;
		gedcomCache.delete(oldestKey);
	}
	const previewId = randomBytes(16).toString('hex');
	gedcomCache.set(previewId, { gedcomText: text, expiresAt: now + CACHE_TTL_MS });
	return previewId;
}

function retrieveGedcom(previewId) {
	const entry = gedcomCache.get(previewId);
	if (!entry) return null;
	if (entry.expiresAt < Date.now()) {
		gedcomCache.delete(previewId);
		return null;
	}
	return entry.gedcomText;
}

/** POST /api/ancestry/reimport — Preview diff (multipart/form-data, auth required) */
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

	if (!SLUG_RE.test(collection)) {
		return json({ error: 'Invalid collection slug' }, { status: 400 });
	}

	if (!ROOT_ID_RE.test(rootPersonId)) {
		return json({ error: 'Invalid rootPersonId format' }, { status: 400 });
	}

	if (!(file instanceof File) || file.size === 0) {
		return json({ error: 'file must be a non-empty .ged file' }, { status: 400 });
	}

	if (!file.name?.toLowerCase().endsWith('.ged')) {
		return json({ error: 'file must be a .ged file' }, { status: 400 });
	}

	if (!Number.isInteger(maxGenerations) || maxGenerations < 1 || maxGenerations > 8) {
		return json({ error: 'maxGenerations must be an integer 1–8' }, { status: 400 });
	}

	if (file.size > 10 * 1024 * 1024) {
		return json({ error: 'GEDCOM file too large. Maximum 10 MB.' }, { status: 413 });
	}

	try {
		const existing = await getAncestry(collection);
		if (!existing) {
			return json({ error: 'No existing ancestry data. Use a regular import first.' }, { status: 400 });
		}

		const gedcomText = await file.text();
		const normalizedRoot = rootPersonId.replace(/^@?([A-Za-z0-9_]+)@?$/, '@$1@');

		const parsed = parseGedcom(gedcomText);
		if (!parsed.individuals.has(normalizedRoot)) {
			const sample = [...parsed.individuals.keys()].slice(0, 5).map(k => k.replace(/@/g, '')).join(', ');
			return json({ error: `Root person not found. Try: ${sample}` }, { status: 400 });
		}

		const diff = diffAncestry(existing, parsed, normalizedRoot, maxGenerations);

		// Don't send internal fields to client; filter out fact-level changes
		// (fact merge is not yet implemented — showing them would mislead users)
		const { _newParsed, _genMap, ...clientDiff } = diff;
		for (const change of clientDiff.changes) {
			change.fields = change.fields.filter(f => f.field !== 'facts');
		}
		clientDiff.changes = clientDiff.changes.filter(c => c.fields.length > 0);

		// Recalculate summary after filtering out fact-only changes
		clientDiff.summary.changed = clientDiff.changes.length;
		clientDiff.summary.protectedOverrides = clientDiff.changes.reduce(
			(sum, c) => sum + c.fields.filter(f => f.hasOverride).length, 0
		);

		// Store GEDCOM text server-side instead of sending to client
		const previewId = storeGedcom(gedcomText);

		return json({ diff: clientDiff, previewId, rootPersonId: normalizedRoot });
	} catch (err) {
		console.error('GEDCOM preview failed:', err);
		const msg = err.message || '';
		const status = msg.includes('not found') ? 404
			: msg.includes('not "travel"') ? 400
			: 500;
		return json({ error: status === 500 ? 'Preview failed' : msg }, { status });
	}
}

/** PUT /api/ancestry/reimport — Apply re-import with decisions (auth required) */
export async function PUT({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { collection, rootPersonId, maxGenerations, decisions, previewId } = body;

	if (!collection || !rootPersonId || !previewId || !decisions) {
		return json({ error: 'collection, rootPersonId, previewId, and decisions required' }, { status: 400 });
	}

	if (!SLUG_RE.test(collection)) {
		return json({ error: 'Invalid collection slug' }, { status: 400 });
	}

	if (!ROOT_ID_RE.test(rootPersonId)) {
		return json({ error: 'Invalid rootPersonId format' }, { status: 400 });
	}

	if (typeof previewId !== 'string' || previewId.length !== 32) {
		return json({ error: 'Invalid previewId' }, { status: 400 });
	}

	const maxGen = parseInt(maxGenerations ?? '8', 10);
	if (!Number.isInteger(maxGen) || maxGen < 1 || maxGen > 8) {
		return json({ error: 'maxGenerations must be an integer 1–8' }, { status: 400 });
	}

	// Retrieve GEDCOM text from server-side cache
	const gedcomText = retrieveGedcom(previewId);
	if (!gedcomText) {
		return json({ error: 'Preview session expired. Please re-upload the GEDCOM file.' }, { status: 410 });
	}

	try {
		const { ancestry, geocodeReport } = await applyReimport(
			collection, gedcomText, rootPersonId, maxGen, decisions
		);
		// Clean up cache after successful apply
		gedcomCache.delete(previewId);
		return json({ ancestry, geocodeReport });
	} catch (err) {
		console.error('Re-import apply failed:', err);
		const msg = err.message || '';
		const status = msg.includes('not found') ? 404
			: msg.includes('not "travel"') || msg.includes('No existing') ? 400
			: 500;
		return json({ error: status === 500 ? 'Apply failed' : msg }, { status });
	}
}

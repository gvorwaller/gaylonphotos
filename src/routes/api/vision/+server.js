import { json } from '@sveltejs/kit';
import { identifySpecies } from '$lib/server/vision.js';
import { getPhoto, updatePhotoMetadata } from '$lib/server/photos.js';
import { getCollection } from '$lib/server/collections.js';
import { SPECIES_MODEL } from '$lib/vision-prompt.js';

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** POST /api/vision — Identify species for one or more photos */
export async function POST({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { collection, photoIds } = body;

	if (!collection || !SLUG_RE.test(collection)) {
		return json({ error: 'Invalid collection slug' }, { status: 400 });
	}

	if (!Array.isArray(photoIds) || photoIds.length === 0) {
		return json({ error: 'photoIds must be a non-empty array' }, { status: 400 });
	}

	if (photoIds.length > 50) {
		return json({ error: 'Max 50 photos per request' }, { status: 400 });
	}

	if (!photoIds.every((id) => typeof id === 'string' && id.length > 0)) {
		return json({ error: 'All photoIds must be non-empty strings' }, { status: 400 });
	}

	// Only wildlife collections support species identification
	const col = await getCollection(collection);
	if (!col) {
		return json({ error: 'Collection not found' }, { status: 404 });
	}
	if (col.type !== 'wildlife') {
		return json({ error: 'Species identification is only available for wildlife collections' }, { status: 400 });
	}

	// Process sequentially (~1s/photo, avoids rate limits)
	const results = [];

	for (const photoId of photoIds) {
		const photo = await getPhoto(collection, photoId);
		if (!photo) {
			results.push({ photoId, status: 'error', error: 'Photo not found' });
			continue;
		}

		if (!photo.url) {
			results.push({ photoId, status: 'error', error: 'No image URL' });
			continue;
		}

		if (photo.species) {
			results.push({ photoId, status: 'skipped', reason: 'Already identified' });
			continue;
		}

		const identification = await identifySpecies(photo.url);

		if (!identification) {
			results.push({ photoId, status: 'skipped', reason: 'Could not identify' });
			continue;
		}

		const updates = {
			species: identification.species,
			scientificName: identification.scientificName,
			speciesAI: {
				model: SPECIES_MODEL,
				confidence: identification.confidence,
				detectedAt: new Date().toISOString()
			}
		};

		try {
			const updatedPhoto = await updatePhotoMetadata(collection, photoId, updates);
			results.push({
				photoId,
				status: 'identified',
				species: identification.species,
				confidence: identification.confidence,
				photo: updatedPhoto
			});
		} catch {
			results.push({ photoId, status: 'error', error: 'Failed to save identification' });
		}
	}

	const identified = results.filter((r) => r.status === 'identified').length;
	const skipped = results.filter((r) => r.status === 'skipped').length;
	const errors = results.filter((r) => r.status === 'error').length;

	return json({ results, summary: { identified, skipped, errors, total: photoIds.length } });
}

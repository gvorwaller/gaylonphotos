import { json } from '@sveltejs/kit';
import { identifyLocation, RateLimitedError } from '$lib/server/geovision.js';
import { getPhoto, updatePhotoMetadata } from '$lib/server/photos.js';
import { getCollection } from '$lib/server/collections.js';
import { GEOLOCATION_MODEL } from '$lib/geovision-prompt.js';

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** POST /api/geovision — Identify location for photos (preview only, no save) */
export async function POST({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { collection, photoIds, action } = body;

	if (!collection || !SLUG_RE.test(collection)) {
		return json({ error: 'Invalid collection slug' }, { status: 400 });
	}

	if (!Array.isArray(photoIds) || photoIds.length === 0) {
		return json({ error: 'photoIds must be a non-empty array' }, { status: 400 });
	}

	const maxPhotos = action === 'apply' ? 50 : 5;
	if (photoIds.length > maxPhotos) {
		return json({ error: `Max ${maxPhotos} photos per request` }, { status: 400 });
	}

	if (!photoIds.every((id) => typeof id === 'string' && id.length > 0)) {
		return json({ error: 'All photoIds must be non-empty strings' }, { status: 400 });
	}

	const col = await getCollection(collection);
	if (!col) {
		return json({ error: 'Collection not found' }, { status: 404 });
	}

	// --- Action: "apply" — save approved locations ---
	if (action === 'apply') {
		const { approvals } = body;
		if (!Array.isArray(approvals) || approvals.length === 0) {
			return json({ error: 'approvals must be a non-empty array' }, { status: 400 });
		}

		const results = [];
		for (const approval of approvals) {
			const { photoId, lat, lng, placeName } = approval;
			if (
				!photoId ||
				typeof lat !== 'number' ||
				typeof lng !== 'number' ||
				!isFinite(lat) ||
				!isFinite(lng)
			) {
				results.push({ photoId, status: 'error', error: 'Invalid approval data' });
				continue;
			}
			if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
				results.push({ photoId, status: 'error', error: 'Coordinates out of range' });
				continue;
			}

			try {
				const updates = {
					gps: { lat, lng },
					gpsSource: 'ai',
					...(placeName ? { locationName: placeName } : {}),
					locationAI: {
						model: GEOLOCATION_MODEL,
						detectedAt: new Date().toISOString()
					}
				};
				const updatedPhoto = await updatePhotoMetadata(collection, photoId, updates);
				results.push({ photoId, status: 'saved', photo: updatedPhoto });
			} catch {
				results.push({ photoId, status: 'error', error: 'Failed to save location' });
			}
		}

		const saved = results.filter((r) => r.status === 'saved').length;
		const errors = results.filter((r) => r.status === 'error').length;
		return json({ results, summary: { saved, errors, total: approvals.length } });
	}

	// --- Default action: "identify" — preview only, no save ---
	const results = [];

	for (const photoId of photoIds) {
		const photo = await getPhoto(collection, photoId);
		if (!photo) {
			results.push({ photoId, status: 'error', error: 'Photo not found' });
			continue;
		}

		// Use the display URL (1600px) for better location recognition
		const imageUrl = photo.url;
		if (!imageUrl) {
			results.push({ photoId, status: 'error', error: 'No image URL', thumbnail: photo.thumbnail, filename: photo.filename });
			continue;
		}

		// Skip photos that already have valid GPS coordinates
		if (photo.gps?.lat != null && photo.gps?.lng != null) {
			results.push({ photoId, status: 'skipped', reason: 'Already has GPS', thumbnail: photo.thumbnail, filename: photo.filename });
			continue;
		}

		let location;
		try {
			location = await identifyLocation(imageUrl);
		} catch (err) {
			if (err instanceof RateLimitedError) {
				results.push({ photoId, status: 'rate-limited', reason: 'Gemini quota exceeded — wait or enable billing', thumbnail: photo.thumbnail, filename: photo.filename });
				continue;
			}
			results.push({ photoId, status: 'failed', reason: 'AI processing error', thumbnail: photo.thumbnail, filename: photo.filename });
			continue;
		}

		if (!location) {
			results.push({ photoId, status: 'failed', reason: 'AI could not process image', thumbnail: photo.thumbnail, filename: photo.filename });
			continue;
		}

		if (location.lat == null || location.confidence === 'none') {
			results.push({
				photoId,
				status: 'no-location',
				reason: location.reasoning || 'Could not determine location',
				thumbnail: photo.thumbnail,
				filename: photo.filename
			});
			continue;
		}

		results.push({
			photoId,
			status: 'located',
			lat: location.lat,
			lng: location.lng,
			placeName: location.placeName,
			reasoning: location.reasoning,
			confidence: location.confidence,
			thumbnail: photo.thumbnail,
			filename: photo.filename
		});
	}

	const located = results.filter((r) => r.status === 'located').length;
	const skipped = results.filter((r) => r.status === 'skipped').length;
	const failed = results.filter((r) => r.status === 'failed' || r.status === 'no-location').length;
	const errors = results.filter((r) => r.status === 'error').length;

	return json({ results, summary: { located, skipped, failed, errors, total: photoIds.length } });
}

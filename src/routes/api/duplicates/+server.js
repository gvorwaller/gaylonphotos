import { json } from '@sveltejs/kit';
import { listPhotos, backfillMissingHashes } from '$lib/server/photos.js';
import { findDuplicateGroups } from '$lib/server/phash.js';

/** GET /api/duplicates?collection=slug&threshold=10 */
export async function GET({ url }) {
	const collection = url.searchParams.get('collection');
	if (!collection) {
		return json({ error: 'collection query parameter required' }, { status: 400 });
	}

	if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(collection)) {
		return json({ error: 'Invalid collection slug' }, { status: 400 });
	}

	const threshold = parseInt(url.searchParams.get('threshold') || '8', 10);
	if (isNaN(threshold) || threshold < 0 || threshold > 64) {
		return json({ error: 'threshold must be 0-64' }, { status: 400 });
	}

	// Compute and persist hashes for any photos that don't have one yet
	await backfillMissingHashes(collection);

	// Reload photos so all newly hashed photos are included in the comparison
	const photos = await listPhotos(collection);

	// Find perceptual duplicate groups
	const groups = findDuplicateGroups(photos, threshold);

	// Also find exact duplicates by fileHash
	const hashMap = new Map();
	for (const p of photos) {
		if (!p.fileHash) continue;
		if (!hashMap.has(p.fileHash)) hashMap.set(p.fileHash, []);
		hashMap.get(p.fileHash).push(p.id);
	}
	const exactDupes = [...hashMap.values()].filter(ids => ids.length > 1);

	// Trim photo objects to essential fields for the response
	const trim = (p) => ({
		id: p.id,
		filename: p.filename,
		thumbnail: p.thumbnail,
		url: p.url,
		date: p.date,
		type: p.type || 'photo',
		phash: p.phash,
		fileHash: p.fileHash,
		favorite: p.favorite
	});

	return json({
		total: photos.length,
		groups: groups.map(group => group.map(trim)),
		exactDuplicates: exactDupes
	});
}

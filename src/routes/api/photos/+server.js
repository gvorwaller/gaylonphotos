import { json } from '@sveltejs/kit';
import { listPhotos, processAndUpload, updatePhotoMetadata, deletePhoto } from '$lib/server/photos.js';
import { getCollection } from '$lib/server/collections.js';

/** GET /api/photos?collection=slug — List photos in a collection */
export async function GET({ url }) {
	const collection = url.searchParams.get('collection');
	if (!collection) {
		return json({ error: 'collection query parameter required' }, { status: 400 });
	}

	if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(collection)) {
		return json({ error: 'Invalid collection slug' }, { status: 400 });
	}

	const photos = await listPhotos(collection);
	return json({ photos });
}

/** POST /api/photos — Upload a new photo (FormData: file + collection) */
export async function POST({ request }) {
	let formData;
	try {
		formData = await request.formData();
	} catch {
		return json({ error: 'Expected multipart form data' }, { status: 400 });
	}

	const file = formData.get('file');
	const collection = formData.get('collection');

	if (!file || !collection) {
		return json({ error: 'file and collection fields required' }, { status: 400 });
	}

	if (!(file instanceof File) || file.size === 0) {
		return json({ error: 'file must be a non-empty file' }, { status: 400 });
	}

	// Reject oversized uploads before image processing
	const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
	if (file.size > MAX_FILE_SIZE) {
		return json({ error: 'File too large. Maximum size is 50 MB.' }, { status: 413 });
	}

	// Validate content type (client-provided, checked again via magic bytes below)
	const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
	if (!allowedTypes.includes(file.type)) {
		return json(
			{ error: `Unsupported file type: ${file.type}. Allowed: ${allowedTypes.join(', ')}` },
			{ status: 400 }
		);
	}

	// Validate slug format
	if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(collection)) {
		return json({ error: 'Invalid collection slug' }, { status: 400 });
	}

	// Validate collection exists before upload
	const collectionObj = await getCollection(collection);
	if (!collectionObj) {
		return json({ error: `Collection not found: ${collection}` }, { status: 404 });
	}

	try {
		const buffer = Buffer.from(await file.arrayBuffer());

		// Validate magic bytes to prevent disguised file uploads
		const header = buffer.subarray(0, 4);
		const isJpeg = header[0] === 0xFF && header[1] === 0xD8;
		const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
		const isWebp = buffer.length >= 12 && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
		// HEIC/HEIF use ISO BMFF: bytes 4-7 are "ftyp"
		const isHeic = buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
		if (!isJpeg && !isPng && !isWebp && !isHeic) {
			return json({ error: 'File content does not match a supported image format' }, { status: 400 });
		}

		const photo = await processAndUpload(collection, buffer, file.name);
		return json({ photo }, { status: 201 });
	} catch (err) {
		console.error('Photo upload failed:', err);
		return json({ error: 'Upload failed' }, { status: 500 });
	}
}

/** PUT /api/photos — Update photo metadata */
export async function PUT({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { collection, photoId, updates } = body;
	if (!collection || !photoId || !updates) {
		return json({ error: 'collection, photoId, and updates required' }, { status: 400 });
	}

	if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(collection)) {
		return json({ error: 'Invalid collection slug' }, { status: 400 });
	}

	try {
		const photo = await updatePhotoMetadata(collection, photoId, updates);
		return json({ photo });
	} catch (err) {
		const status = err.message.includes('not found') ? 404 : 500;
		return json({ error: err.message }, { status });
	}
}

/** DELETE /api/photos — Remove a photo */
export async function DELETE({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { collection, photoId } = body;
	if (!collection || !photoId) {
		return json({ error: 'collection and photoId required' }, { status: 400 });
	}

	if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(collection)) {
		return json({ error: 'Invalid collection slug' }, { status: 400 });
	}

	try {
		await deletePhoto(collection, photoId);
		return json({ success: true });
	} catch (err) {
		const status = err.message.includes('not found') ? 404 : 500;
		return json({ error: err.message }, { status });
	}
}

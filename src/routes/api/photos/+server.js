import { json } from '@sveltejs/kit';
import { listPhotos, processAndUpload, processAndUploadVideo, updatePhotoMetadata, deletePhoto } from '$lib/server/photos.js';
import { getCollection } from '$lib/server/collections.js';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime'];
const ALLOWED_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES];
const MAX_IMAGE_SIZE = 50 * 1024 * 1024;   // 50 MB
const MAX_VIDEO_SIZE = 1024 * 1024 * 1024;   // 1 GB

// ISO BMFF brands that indicate video (not HEIC image)
const VIDEO_FTYP_BRANDS = ['isom', 'iso2', 'mp41', 'mp42', 'M4V ', 'qt  ', 'avc1'];

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

	// Determine if this is a video or image upload
	const isVideo = file.type ? VIDEO_TYPES.includes(file.type) : /\.(mp4|mov|m4v)$/i.test(file.name);

	// Reject oversized uploads before processing
	const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
	const maxLabel = isVideo ? '500 MB' : '50 MB';
	if (file.size > maxSize) {
		return json({ error: `File too large. Maximum size is ${maxLabel}.` }, { status: 413 });
	}

	// Validate content type (client-provided, checked again via magic bytes below)
	// Allow empty type — Apple Photos drag-and-drop often provides no MIME type
	if (file.type && !ALLOWED_TYPES.includes(file.type)) {
		return json(
			{ error: `Unsupported file type: ${file.type}. Allowed: ${ALLOWED_TYPES.join(', ')}` },
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
		// ISO BMFF: bytes 4-7 are "ftyp" — shared by HEIC images and MP4/MOV videos
		const isFtyp = buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
		// Disambiguate HEIC vs video by checking the brand at bytes 8-12
		const ftypBrand = isFtyp ? buffer.subarray(8, 12).toString('ascii') : '';
		const isVideoFile = isFtyp && VIDEO_FTYP_BRANDS.includes(ftypBrand);
		const isHeic = isFtyp && !isVideoFile;

		if (!isJpeg && !isPng && !isWebp && !isHeic && !isVideoFile) {
			return json({ error: 'File content does not match a supported format' }, { status: 400 });
		}

		if (isVideoFile || isVideo) {
			const record = await processAndUploadVideo(collection, buffer, file.name);
			return json({ photo: record }, { status: 201 });
		}

		const photo = await processAndUpload(collection, buffer, file.name);
		return json({ photo }, { status: 201 });
	} catch (err) {
		console.error('Upload failed:', err);
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

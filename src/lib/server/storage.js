import {
	S3Client,
	PutObjectCommand,
	DeleteObjectCommand,
	ListObjectsV2Command,
	DeleteObjectsCommand
} from '@aws-sdk/client-s3';
import {
	SPACES_KEY,
	SPACES_SECRET,
	SPACES_BUCKET,
	SPACES_REGION,
	SPACES_ENDPOINT,
	SPACES_CDN_URL
} from '$env/static/private';

/**
 * Singleton S3 client configured for Digital Ocean Spaces.
 * DO Spaces is S3-compatible but requires:
 *   - Custom endpoint (region-specific)
 *   - forcePathStyle: false (Spaces uses virtual-hosted bucket style)
 */
const client = new S3Client({
	region: SPACES_REGION,
	endpoint: SPACES_ENDPOINT,
	forcePathStyle: false,
	credentials: {
		accessKeyId: SPACES_KEY,
		secretAccessKey: SPACES_SECRET
	}
});

/**
 * Upload a file to DO Spaces with public-read ACL.
 * @param {string} key — object key, e.g. "scandinavia-2023/IMG_1234.jpg"
 * @param {Buffer} buffer — file contents
 * @param {string} contentType — MIME type, e.g. "image/jpeg"
 * @returns {Promise<{ url: string }>} CDN URL of the uploaded file
 */
export async function uploadFile(key, buffer, contentType) {
	await client.send(new PutObjectCommand({
		Bucket: SPACES_BUCKET,
		Key: key,
		Body: buffer,
		ACL: 'public-read',
		ContentType: contentType
	}));
	return { url: getCdnUrl(key) };
}

/**
 * Delete a single file from DO Spaces.
 * Idempotent — does not throw if the key doesn't exist.
 * @param {string} key — object key to delete
 * @returns {Promise<void>}
 */
export async function deleteFile(key) {
	await client.send(new DeleteObjectCommand({
		Bucket: SPACES_BUCKET,
		Key: key
	}));
}

/**
 * Delete all objects under a prefix (e.g. an entire collection folder).
 * Uses ListObjectsV2 pagination to find all keys, then DeleteObjects
 * in batches of up to 1000 (S3 limit per request).
 * Idempotent — no-op if prefix is already empty.
 * @param {string} prefix — key prefix, e.g. "scandinavia-2023/"
 * @returns {Promise<void>}
 */
export async function deletePrefix(prefix) {
	let continuationToken;

	do {
		const listResponse = await client.send(new ListObjectsV2Command({
			Bucket: SPACES_BUCKET,
			Prefix: prefix,
			ContinuationToken: continuationToken
		}));

		const objects = listResponse.Contents;
		if (!objects || objects.length === 0) break;

		// DeleteObjects accepts up to 1000 keys per request
		const batch = objects.map((obj) => ({ Key: obj.Key }));
		await client.send(new DeleteObjectsCommand({
			Bucket: SPACES_BUCKET,
			Delete: { Objects: batch, Quiet: true }
		}));

		continuationToken = listResponse.IsTruncated
			? listResponse.NextContinuationToken
			: undefined;
	} while (continuationToken);
}

/**
 * Build the public CDN URL for an object key.
 * @param {string} key — object key
 * @returns {string} full CDN URL
 */
export function getCdnUrl(key) {
	// Strip trailing slash from CDN URL if present, ensure clean join
	const base = SPACES_CDN_URL.replace(/\/+$/, '');
	return `${base}/${key}`;
}

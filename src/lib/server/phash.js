/**
 * Perceptual hashing (dHash) and duplicate detection utilities.
 *
 * No heavy dependencies — only needs sharp (already in the project).
 */
import sharp from 'sharp';

/**
 * Compute a difference hash (dHash) from an image buffer.
 * Resizes to 9x8 grayscale, compares each pixel to its right neighbor,
 * producing a 64-bit fingerprint encoded as a 16-char hex string.
 *
 * @param {Buffer} imageBuffer — raw image bytes (any format sharp supports)
 * @returns {Promise<string>} 16-char hex string (64-bit hash)
 */
export async function computePhash(imageBuffer) {
	const { data } = await sharp(imageBuffer)
		.rotate()
		.greyscale()
		.resize(9, 8, { fit: 'fill' })
		.raw()
		.toBuffer({ resolveWithObject: true });

	// 9 columns x 8 rows = 72 pixels; compare adjacent pairs -> 8x8 = 64 bits
	const bits = [];
	for (let row = 0; row < 8; row++) {
		for (let col = 0; col < 8; col++) {
			const idx = row * 9 + col;
			bits.push(data[idx] > data[idx + 1] ? 1 : 0);
		}
	}

	// Pack 64 bits into a 16-char hex string
	let hex = '';
	for (let i = 0; i < 64; i += 4) {
		const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
		hex += nibble.toString(16);
	}
	return hex;
}

/**
 * Compute Hamming distance between two phash hex strings.
 * @param {string} a — 16-char hex hash
 * @param {string} b — 16-char hex hash
 * @returns {number} number of differing bits (0 = identical, max 64)
 */
export function hammingDistance(a, b) {
	let dist = 0;
	for (let i = 0; i < a.length; i++) {
		let xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
		while (xor) {
			dist += xor & 1;
			xor >>= 1;
		}
	}
	return dist;
}

/**
 * Find duplicate groups within a set of photos using phash Hamming distance.
 * @param {object[]} photos — array of photo objects with `phash` field
 * @param {number} [threshold=10] — max Hamming distance to consider near-duplicate
 * @returns {object[][]} array of groups, each group is an array of photos
 */
export function findDuplicateGroups(photos, threshold = 10) {
	const withHash = photos.filter(p => p.phash);
	const used = new Set();
	const groups = [];

	for (let i = 0; i < withHash.length; i++) {
		if (used.has(withHash[i].id)) continue;
		const group = [withHash[i]];

		for (let j = i + 1; j < withHash.length; j++) {
			if (used.has(withHash[j].id)) continue;
			const dist = hammingDistance(withHash[i].phash, withHash[j].phash);
			if (dist <= threshold) {
				group.push(withHash[j]);
			}
		}

		if (group.length > 1) {
			for (const p of group) used.add(p.id);
			groups.push(group);
		}
	}

	return groups;
}

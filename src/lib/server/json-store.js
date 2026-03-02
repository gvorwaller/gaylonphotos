import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';

/**
 * Per-file Promise chain for serializing writes.
 * Safe within a single Node.js process only.
 * @type {Map<string, Promise<void>>}
 */
const locks = new Map();

/**
 * Acquire a per-file lock, execute fn, then release.
 * Serializes all writes to the same file path.
 */
function withLock(filePath, fn) {
	const prev = locks.get(filePath) || Promise.resolve();
	const next = prev.then(fn, fn); // run fn even if previous lock rejected
	locks.set(filePath, next);
	// Clean up the map entry when the chain settles to avoid memory leak
	next.then(
		() => { if (locks.get(filePath) === next) locks.delete(filePath); },
		() => { if (locks.get(filePath) === next) locks.delete(filePath); }
	);
	return next;
}

/**
 * Read and parse a JSON file.
 * @param {string} filePath — absolute or relative path to JSON file
 * @returns {Promise<any>} parsed JSON
 * @throws if file doesn't exist or contains invalid JSON
 */
export async function readJson(filePath) {
	const raw = await readFile(filePath, 'utf-8');
	return JSON.parse(raw);
}

/**
 * Atomically write data as JSON to filePath.
 * Writes to a temp file first, then renames (atomic on POSIX).
 * Acquires a per-file lock to prevent concurrent writes.
 * @param {string} filePath
 * @param {any} data
 * @returns {Promise<void>}
 */
export async function writeJson(filePath, data) {
	return withLock(filePath, async () => {
		const serialized = JSON.stringify(data, null, 2) + '\n';
		const tmpPath = filePath + '.tmp';
		await writeFile(tmpPath, serialized, 'utf-8');
		await rename(tmpPath, filePath);
	});
}

/**
 * Read-modify-write a JSON file atomically.
 * This is the primary write interface — prevents read-modify-write races
 * by holding the lock across the entire read → transform → write cycle.
 * @param {string} filePath
 * @param {(data: any) => any} updaterFn — receives current data, returns modified data
 * @returns {Promise<any>} the updated data
 */
export async function updateJson(filePath, updaterFn) {
	let result;
	await withLock(filePath, async () => {
		const raw = await readFile(filePath, 'utf-8');
		const data = JSON.parse(raw);
		result = updaterFn(data);
		if (result instanceof Promise) {
			throw new Error('updaterFn must be synchronous');
		}
		if (result === undefined) {
			throw new Error('updaterFn must return the updated data');
		}
		const serialized = JSON.stringify(result, null, 2) + '\n';
		const tmpPath = filePath + '.tmp';
		await writeFile(tmpPath, serialized, 'utf-8');
		await rename(tmpPath, filePath);
	});
	return result;
}

/**
 * Atomically create a JSON file only if it does not exist.
 * Holds the per-file lock across the existence check and write,
 * preventing TOCTOU races from concurrent callers.
 * @param {string} filePath
 * @param {any} data
 * @returns {Promise<void>}
 * @throws {Error} with message 'FILE_EXISTS' if the file already exists
 */
export async function createJsonIfNotExists(filePath, data) {
	return withLock(filePath, async () => {
		try {
			await readFile(filePath, 'utf-8');
			throw new Error('FILE_EXISTS');
		} catch (err) {
			if (err.message === 'FILE_EXISTS') throw err;
			if (err.code !== 'ENOENT') throw err;
			// File genuinely doesn't exist — proceed with creation
		}
		const serialized = JSON.stringify(data, null, 2) + '\n';
		const tmpPath = filePath + '.tmp';
		await writeFile(tmpPath, serialized, 'utf-8');
		await rename(tmpPath, filePath);
	});
}

/**
 * Delete a JSON file, serialized through the per-file lock.
 * Ignores ENOENT (file already absent).
 * @param {string} filePath
 * @returns {Promise<void>}
 */
export async function deleteJson(filePath) {
	return withLock(filePath, async () => {
		try {
			await unlink(filePath);
		} catch (err) {
			if (err.code !== 'ENOENT') throw err;
		}
	});
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 * @param {string} dirPath
 * @returns {Promise<void>}
 */
export async function ensureDir(dirPath) {
	await mkdir(dirPath, { recursive: true });
}

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { readJson, createJsonIfNotExists, ensureDir } from './json-store.js';
import { dev } from '$app/environment';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const SALT_ROUNDS = 12;
const ADMIN_FILE = 'data/admin.json';
export const ADMIN_EXISTS_ERROR = 'Admin already configured';

/**
 * In-memory session store. Sessions are lost on restart.
 * Acceptable for single-admin use.
 * @type {Map<string, {token: string, username: string, createdAt: number, expiresAt: number}>}
 */
const sessions = new Map();
const MAX_SESSIONS = 100;

/** Sweep expired sessions every 15 minutes */
setInterval(() => {
	const now = Date.now();
	for (const [token, session] of sessions) {
		if (session.expiresAt <= now) sessions.delete(token);
	}
}, 15 * 60 * 1000).unref();

/** Create a session, evicting the oldest if at capacity. */
function createSession(username) {
	if (sessions.size >= MAX_SESSIONS) {
		// Evict oldest session
		const oldest = sessions.keys().next().value;
		sessions.delete(oldest);
	}
	const token = crypto.randomUUID();
	const now = Date.now();
	sessions.set(token, { token, username, createdAt: now, expiresAt: now + SESSION_TTL_MS });
	return { token };
}

/**
 * Verify username + password against data/admin.json.
 * On success, creates a session and returns the token.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{token: string} | null>}
 */
// Dummy hash to prevent timing oracle on username existence
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', SALT_ROUNDS);

export async function verifyCredentials(username, password) {
	let admin;
	try {
		admin = await readJson(ADMIN_FILE);
	} catch {
		// admin.json doesn't exist — no admin configured
		return null;
	}

	// Always run bcrypt.compare to prevent timing oracle on username
	const usernameMatch = admin.username === username;
	const valid = await bcrypt.compare(password, usernameMatch ? admin.passwordHash : DUMMY_HASH);
	if (!usernameMatch || !valid) {
		return null;
	}

	return createSession(username);
}

/**
 * Validate a session token. Returns the session if valid and not expired.
 * Automatically cleans up expired sessions.
 * @param {string} token
 * @returns {{token: string, username: string, createdAt: number, expiresAt: number} | null}
 */
export function validateSession(token) {
	const session = sessions.get(token);
	if (!session) {
		return null;
	}
	if (session.expiresAt <= Date.now()) {
		sessions.delete(token);
		return null;
	}
	return session;
}

/**
 * Destroy a session by token.
 * @param {string} token
 */
export function destroySession(token) {
	sessions.delete(token);
}

/**
 * Create admin credentials for first-time setup.
 * Throws if admin.json already exists.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{token: string}>}
 */
export async function createAdmin(username, password) {
	// Fast path: skip expensive bcrypt if admin already exists.
	// createJsonIfNotExists is the true race guard (holds file lock).
	if (await adminExists()) throw new Error(ADMIN_EXISTS_ERROR);
	const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
	await ensureDir('data');

	try {
		await createJsonIfNotExists(ADMIN_FILE, { username, passwordHash });
		expireAdminCache();
	} catch (err) {
		if (err.message === 'FILE_EXISTS') {
			expireAdminCache();
			throw new Error(ADMIN_EXISTS_ERROR);
		}
		throw err;
	}

	return createSession(username);
}

/** TTL cache for adminExists — avoids disk read on every SSR render. Resets on createAdmin. */
let _adminExistsCache = { value: false, expiresAt: 0 };

export async function adminExists() {
	if (_adminExistsCache.expiresAt > Date.now()) return _adminExistsCache.value;
	try {
		await readJson(ADMIN_FILE);
		_adminExistsCache = { value: true, expiresAt: Date.now() + 60_000 };
		return true;
	} catch {
		_adminExistsCache = { value: false, expiresAt: Date.now() + 60_000 };
		return false;
	}
}

/** Expire the adminExists cache — forces a disk re-read on next call. */
function expireAdminCache() {
	_adminExistsCache.expiresAt = 0;
}

export const COOKIE_NAME = 'gp_session';

export const COOKIE_OPTIONS = {
	path: '/',
	httpOnly: true,
	secure: !dev,
	sameSite: 'Lax',
	maxAge: SESSION_TTL_MS / 1000 // maxAge is in seconds
};

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { readJson } from './json-store.js';
import { dev } from '$app/environment';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const ADMIN_FILE = 'data/admin.json';

/**
 * In-memory session store. Sessions are lost on restart.
 * Acceptable for single-admin use.
 * @type {Map<string, {token: string, username: string, createdAt: number, expiresAt: number}>}
 */
const sessions = new Map();

/**
 * Verify username + password against data/admin.json.
 * On success, creates a session and returns the token.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{token: string} | null>}
 */
export async function verifyCredentials(username, password) {
	let admin;
	try {
		admin = await readJson(ADMIN_FILE);
	} catch {
		// admin.json doesn't exist — no admin configured
		return null;
	}

	if (admin.username !== username) {
		return null;
	}

	const valid = await bcrypt.compare(password, admin.passwordHash);
	if (!valid) {
		return null;
	}

	const token = crypto.randomUUID();
	const now = Date.now();
	sessions.set(token, {
		token,
		username,
		createdAt: now,
		expiresAt: now + SESSION_TTL_MS
	});

	return { token };
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

export const COOKIE_NAME = 'gp_session';

export const COOKIE_OPTIONS = {
	path: '/',
	httpOnly: true,
	secure: !dev,
	sameSite: 'lax',
	maxAge: SESSION_TTL_MS / 1000 // maxAge is in seconds
};

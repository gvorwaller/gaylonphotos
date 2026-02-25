import { json } from '@sveltejs/kit';
import { verifyCredentials, destroySession, COOKIE_NAME, COOKIE_OPTIONS } from '$lib/server/auth.js';

/** POST /api/auth — Login */
export async function POST({ request, cookies }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { username, password } = body;
	if (typeof username !== 'string' || !username || typeof password !== 'string' || !password) {
		return json({ error: 'Username and password required' }, { status: 400 });
	}

	const result = await verifyCredentials(username.trim(), password);
	if (!result) {
		return json({ error: 'Invalid credentials' }, { status: 401 });
	}

	cookies.set(COOKIE_NAME, result.token, COOKIE_OPTIONS);
	return json({ success: true });
}

/** DELETE /api/auth — Logout */
export async function DELETE({ cookies }) {
	const token = cookies.get(COOKIE_NAME);
	if (token) {
		destroySession(token);
	}
	cookies.delete(COOKIE_NAME, { path: '/' });
	return json({ success: true });
}

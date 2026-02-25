import { json } from '@sveltejs/kit';
import { createAdmin, COOKIE_NAME, COOKIE_OPTIONS, ADMIN_EXISTS_ERROR } from '$lib/server/auth.js';

/** POST /api/auth/setup — First-time admin account creation */
export async function POST({ request, cookies }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { username, password, confirmPassword } = body;

	if (typeof username !== 'string' || !username.trim()) {
		return json({ error: 'Username is required' }, { status: 400 });
	}
	if (typeof password !== 'string' || password.length < 8) {
		return json({ error: 'Password must be at least 8 characters' }, { status: 400 });
	}
	if (typeof confirmPassword !== 'string' || password !== confirmPassword) {
		return json({ error: 'Passwords do not match' }, { status: 400 });
	}
	if (username.trim().length > 128) {
		return json({ error: 'Username too long' }, { status: 400 });
	}
	if (password.length > 1024) {
		return json({ error: 'Password too long' }, { status: 400 });
	}

	try {
		const result = await createAdmin(username.trim(), password);
		cookies.set(COOKIE_NAME, result.token, COOKIE_OPTIONS);
		return json({ success: true });
	} catch (err) {
		if (err.message === ADMIN_EXISTS_ERROR) {
			return json({ error: ADMIN_EXISTS_ERROR }, { status: 403 });
		}
		throw err;
	}
}

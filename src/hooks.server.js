import { validateSession, COOKIE_NAME } from '$lib/server/auth.js';
import { redirect } from '@sveltejs/kit';

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	// 1. Extract session token from cookie
	const token = event.cookies.get(COOKIE_NAME);

	// 2. Validate session if token exists
	if (token) {
		const session = validateSession(token);
		if (session) {
			event.locals.user = { username: session.username };
		}
	}

	// 3. Protect admin routes (except login page)
	if ((event.url.pathname === '/admin' || event.url.pathname.startsWith('/admin/')) &&
		!event.url.pathname.startsWith('/admin/login')) {
		if (!event.locals.user) {
			throw redirect(303, '/admin/login');
		}
	}

	// 4. Protect API mutation routes (POST/PUT/DELETE, except /api/auth)
	if (event.url.pathname.startsWith('/api') &&
		!event.url.pathname.startsWith('/api/auth') &&
		event.request.method !== 'GET') {

		if (!event.locals.user) {
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// CSRF mitigation: reject cross-site mutation attempts
		const origin = event.request.headers.get('origin');
		const host = event.url.origin;
		if (!origin || origin !== host) {
			return new Response(JSON.stringify({ error: 'Invalid origin' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

	return resolve(event);
}

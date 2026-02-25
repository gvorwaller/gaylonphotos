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
		event.url.pathname !== '/admin/login') {
		if (!event.locals.user) {
			throw redirect(303, '/admin/login');
		}
	}

	// 4. Protect API mutation routes (POST/PUT/DELETE)
	// Auth endpoints skip the auth check but still get CSRF protection
	const isApiMutation = event.url.pathname.startsWith('/api') && event.request.method !== 'GET';
	const isAuthEndpoint = event.url.pathname === '/api/auth' || event.url.pathname === '/api/auth/setup';

	if (isApiMutation) {
		// CSRF mitigation: applies to ALL API mutations including auth
		const origin = event.request.headers.get('origin');
		const host = event.url.origin;
		if (!origin || origin !== host) {
			return new Response(JSON.stringify({ error: 'Invalid origin' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Auth endpoints handle their own authorization
		if (!isAuthEndpoint && !event.locals.user) {
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}
	}

	return resolve(event);
}

/**
 * Thin wrappers around fetch for admin API calls.
 * All include credentials and JSON headers.
 * Each returns { ok, data, error } for consistent error handling.
 */

async function request(method, path, body) {
	const opts = {
		method,
		credentials: 'same-origin',
		headers: {}
	};

	if (body !== undefined) {
		opts.headers['Content-Type'] = 'application/json';
		opts.body = JSON.stringify(body);
	}

	try {
		const res = await fetch(path, opts);
		const contentType = res.headers.get('Content-Type') || '';
		if (!contentType.includes('application/json')) {
			return { ok: false, data: null, error: `HTTP ${res.status}` };
		}
		const data = await res.json();
		if (!res.ok) {
			return { ok: false, data: null, error: data.error || `HTTP ${res.status}` };
		}
		return { ok: true, data, error: null };
	} catch (err) {
		return { ok: false, data: null, error: err.message || 'Network error' };
	}
}

export function apiGet(path) {
	return request('GET', path);
}

export function apiPost(path, body) {
	return request('POST', path, body);
}

export function apiPut(path, body) {
	return request('PUT', path, body);
}

export function apiDelete(path, body) {
	return request('DELETE', path, body);
}

/**
 * Upload files via FormData. Does not set Content-Type header
 * (browser sets multipart boundary automatically).
 * @param {string} path
 * @param {FormData} formData
 * @returns {Promise<{ ok: boolean, data: any, error: string|null }>}
 */
export async function apiUpload(path, formData) {
	try {
		const res = await fetch(path, {
			method: 'POST',
			credentials: 'same-origin',
			body: formData
		});
		const contentType = res.headers.get('Content-Type') || '';
		if (!contentType.includes('application/json')) {
			const text = await res.text();
			console.warn(`Upload non-JSON response [${res.status}]:`, text.slice(0, 500));
			return { ok: false, data: null, error: `HTTP ${res.status}` };
		}
		const data = await res.json();
		if (!res.ok) {
			console.warn(`Upload failed [${res.status}]:`, data);
			return { ok: false, data: null, error: data.error || `HTTP ${res.status}` };
		}
		return { ok: true, data, error: null };
	} catch (err) {
		console.warn('Upload exception:', err);
		return { ok: false, data: null, error: err.message || 'Network error' };
	}
}

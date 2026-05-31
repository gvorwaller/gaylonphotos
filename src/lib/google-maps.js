const GOOGLE_MAPS_CALLBACK = '__gaylonGoogleMapsLoaded__';

let scriptLoadPromise = null;
const libraryPromises = new Map();

function buildMapsUrl(apiKey) {
	const params = new URLSearchParams({
		key: apiKey,
		v: 'weekly',
		loading: 'async',
		callback: GOOGLE_MAPS_CALLBACK
	});
	return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
}

function loadScript(apiKey) {
	if (typeof window === 'undefined') {
		return Promise.reject(new Error('Google Maps can only be loaded in the browser'));
	}

	if (window.google?.maps?.importLibrary) return Promise.resolve();
	if (scriptLoadPromise) return scriptLoadPromise;

	const existingScript = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
	if (existingScript) {
		scriptLoadPromise = new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				clearInterval(check);
				scriptLoadPromise = null;
				reject(new Error('Google Maps API load timeout'));
			}, 30000);
			const check = setInterval(() => {
				if (window.google?.maps) {
					clearInterval(check);
					clearTimeout(timeout);
					resolve();
				}
			}, 100);
		});
		return scriptLoadPromise;
	}

	scriptLoadPromise = new Promise((resolve, reject) => {
		const previousCallback = window[GOOGLE_MAPS_CALLBACK];
		window[GOOGLE_MAPS_CALLBACK] = () => {
			if (typeof previousCallback === 'function') previousCallback();
			resolve();
		};

		const script = document.createElement('script');
		script.src = buildMapsUrl(apiKey);
		script.async = true;
		script.onerror = () => {
			scriptLoadPromise = null;
			reject(new Error('Failed to load Google Maps API'));
		};
		document.head.appendChild(script);
	});

	return scriptLoadPromise;
}

async function importLibrary(name) {
	if (!window.google?.maps?.importLibrary) return null;
	if (!libraryPromises.has(name)) {
		libraryPromises.set(name, window.google.maps.importLibrary(name));
	}
	return libraryPromises.get(name);
}

export async function loadGoogleMaps(apiKey, libraries = ['maps']) {
	if (!apiKey) throw new Error('Google Maps API key is required');

	await loadScript(apiKey);

	const loaded = { google: window.google };
	for (const library of libraries) {
		loaded[library] = await importLibrary(library);
	}

	return loaded;
}

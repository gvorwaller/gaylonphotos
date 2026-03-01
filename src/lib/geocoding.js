/**
 * Client-side reverse geocoding using Google Maps Geocoder.
 * Requires the Geocoding API to be enabled in the Google Cloud project.
 */

let loadPromise = null;
let geocoderInstance = null;

/**
 * Ensures the Google Maps JS API is loaded. Returns immediately if already
 * available, otherwise injects the script tag and waits. Prevents duplicate loads.
 */
export function ensureGoogleMapsLoaded(apiKey) {
	if (typeof window === 'undefined') return Promise.reject(new Error('Not in browser'));

	if (window.google?.maps) return Promise.resolve();

	if (loadPromise) return loadPromise;

	// Check if a script tag already exists (e.g. from Map.svelte)
	if (document.querySelector('script[src*="maps.googleapis.com"]')) {
		loadPromise = new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				clearInterval(check);
				loadPromise = null;
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
		return loadPromise;
	}

	loadPromise = new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker,places`;
		script.async = true;
		script.onload = () => {
			if (window.google?.maps) {
				resolve();
			} else {
				// Script loaded but API failed to initialize
				loadPromise = null;
				reject(new Error('Google Maps API loaded but not initialized'));
			}
		};
		script.onerror = () => {
			loadPromise = null;
			reject(new Error('Failed to load Google Maps API'));
		};
		document.head.appendChild(script);
	});

	return loadPromise;
}

/**
 * Google Plus Codes use only these characters: 23456789CFGHJMPQRVWX
 * Filter them out — they're not human-readable place names.
 */
const PLUS_CODE_RE = /^[23456789CFGHJMPQRVWX]+\+[23456789CFGHJMPQRVWX]*$/;

function isPlusCode(str) {
	return PLUS_CODE_RE.test(str);
}

/**
 * Search across all geocoder results for a specific address component type.
 * The first result is the most specific, but may lack certain components
 * that appear in broader results.
 */
function findComponent(results, type) {
	for (const result of results) {
		const comp = result.address_components?.find((c) => c.types.includes(type));
		if (comp) return comp;
	}
	return null;
}

/**
 * Reverse-geocode lat/lng into a human-readable place name.
 * Returns null on failure (silently — geocoding errors shouldn't block UI).
 *
 * Priority: point_of_interest/park > locality > sublocality > natural_feature > admin_area_2 > admin_area_1.
 * Formatting: "{city}, {country}" for international, "{city}, {state}" for US.
 * Filters out Google Plus Codes.
 */
export async function reverseGeocode(lat, lng, apiKey) {
	try {
		await ensureGoogleMapsLoaded(apiKey);

		if (!geocoderInstance) {
			geocoderInstance = new window.google.maps.Geocoder();
		}
		const response = await geocoderInstance.geocode({ location: { lat, lng } });

		if (!response.results?.length) return null;

		const results = response.results;
		const components = results[0].address_components;
		if (!components) return null;

		const get = (type) => components.find((c) => c.types.includes(type))?.long_name || null;
		const getShort = (type) => components.find((c) => c.types.includes(type))?.short_name || null;

		// Check for specific venue/park/POI in any result
		const poi = findComponent(results, 'point_of_interest') ||
			findComponent(results, 'park') ||
			findComponent(results, 'establishment');
		const poiName = poi?.long_name || null;

		const country = get('country');
		const state = get('administrative_area_level_1');
		const stateShort = getShort('administrative_area_level_1');
		const city =
			get('locality') ||
			get('sublocality') ||
			get('natural_feature') ||
			get('administrative_area_level_2') ||
			state;

		// Build the region suffix: "ST" for US, "Country" for international
		let region = null;
		if (country === 'United States' && stateShort) {
			region = stateShort;
		} else if (country) {
			region = country;
		}

		// If we found a POI/park, use it: "Huguenot Memorial Park, FL"
		if (poiName && region && poiName !== city) {
			return `${poiName}, ${region}`;
		}

		if (!city) {
			// Last resort: formatted_address, but filter out Plus Codes
			const formatted = results[0].formatted_address;
			if (formatted && !isPlusCode(formatted.split(',')[0].trim())) {
				return formatted;
			}
			return null;
		}

		if (region && city !== country && city !== state) {
			return `${city}, ${region}`;
		}

		return city;
	} catch {
		return null;
	}
}

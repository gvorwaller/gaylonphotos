import { loadGoogleMaps } from '$lib/google-maps.js';

let geocoderInstance = null;

/**
 * Client-side reverse geocoding using Google Maps Geocoder.
 * Requires the Geocoding API to be enabled in the Google Cloud project.
 */
export function ensureGoogleMapsLoaded(apiKey) {
	return loadGoogleMaps(apiKey, ['geocoding']);
}

async function getGeocoder(apiKey) {
	const { google, geocoding } = await ensureGoogleMapsLoaded(apiKey);
	if (!geocoderInstance) {
		const Geocoder = geocoding?.Geocoder || google.maps.Geocoder;
		geocoderInstance = new Geocoder();
	}
	return { google, geocoder: geocoderInstance };
}

/**
 * Geocode a typed place query into map coordinates.
 * Uses the Maps Geocoder instead of Places Autocomplete so search does not
 * require the browser key to have Places API access.
 */
export async function geocodePlaceQuery(query, apiKey) {
	const trimmed = query?.trim();
	if (!trimmed) return null;

	const { geocoder } = await getGeocoder(apiKey);
	const response = await geocoder.geocode({ address: trimmed });
	const first = response.results?.[0];
	if (!first?.geometry?.location) return null;

	return {
		lat: first.geometry.location.lat(),
		lng: first.geometry.location.lng(),
		viewport: first.geometry.viewport || null,
		name: first.formatted_address || trimmed
	};
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
		const { geocoder } = await getGeocoder(apiKey);
		const response = await geocoder.geocode({ location: { lat, lng } });

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

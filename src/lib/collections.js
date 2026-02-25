/**
 * Collection type → component mapping.
 * Used by [collection]/+page.svelte to render the right layout per type.
 */
export const COLLECTION_TYPES = {
	travel: {
		mapComponent: 'ItineraryMap',
		extraComponents: ['Timeline'],
		sidecarFields: [],
		hasItinerary: true
	},
	wildlife: {
		mapComponent: 'SightingMap',
		extraComponents: ['SpeciesGrid'],
		sidecarFields: ['species'],
		hasItinerary: false
	},
	action: {
		mapComponent: 'SpotGallery',
		extraComponents: [],
		sidecarFields: ['spot', 'conditions'],
		hasItinerary: false
	}
};

/**
 * Get the component configuration for a collection type.
 * @param {string} type — "travel" | "wildlife" | "action"
 * @returns {object|null}
 */
export function getTypeConfig(type) {
	return COLLECTION_TYPES[type] || null;
}

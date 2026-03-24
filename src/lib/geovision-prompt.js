/**
 * Shared prompt and response parsing for AI-powered photo geolocation.
 * Used by src/lib/server/geovision.js (SvelteKit).
 */

export const GEOLOCATION_MODEL = 'gemini-2.5-flash';

export const GEOLOCATION_PROMPT = `You are a geolocation expert. Analyze this photo and determine where it was taken.

Look for clues: landmarks, architecture, vegetation, signage, terrain, road markings, license plates, language on signs, sun position, wildlife, cultural indicators, coastline features, mountain ranges, etc.

Respond with ONLY a JSON object, no markdown, no explanation:
{"lat": 12.3456, "lng": -78.9012, "placeName": "City, Country", "reasoning": "brief explanation of clues used", "confidence": "high|medium|low"}

If you absolutely cannot determine the location:
{"lat": null, "lng": null, "placeName": null, "reasoning": "why location could not be determined", "confidence": "none"}

Confidence guide:
- "high": recognizable landmark, clear signage, or distinctive location features
- "medium": regional clues narrow it to an area but exact location uncertain
- "low": vague clues, could be multiple places
- "none": no useful location clues (e.g., close-up macro shot, studio photo)

Be as precise as possible with coordinates. If you can identify the exact spot, do so. If only the general area, give coordinates for the most likely specific location within that area.`;

/**
 * Parse the LLM response text into a geolocation result.
 * @param {string|undefined} rawText
 * @returns {{ lat: number, lng: number, placeName: string, reasoning: string, confidence: string }|null}
 */
export function parseGeolocationResponse(rawText) {
	try {
		let text = rawText?.trim();
		if (!text) return null;

		// Extract JSON from markdown fences if present
		const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
		if (fenceMatch) {
			text = fenceMatch[1];
		} else {
			// Fallback: extract first bare JSON object
			const jsonMatch = text.match(/\{[\s\S]*\}/);
			if (jsonMatch) text = jsonMatch[0];
		}

		const result = JSON.parse(text);
		if (!result || typeof result !== 'object') return null;

		const confidence = ['high', 'medium', 'low', 'none'].includes(result.confidence)
			? result.confidence
			: 'low';

		// No location determined
		if (result.lat == null || result.lng == null || confidence === 'none') {
			return {
				lat: null,
				lng: null,
				placeName: null,
				reasoning: typeof result.reasoning === 'string' ? result.reasoning : 'Could not determine location',
				confidence
			};
		}

		// Validate coordinates
		const lat = parseFloat(result.lat);
		const lng = parseFloat(result.lng);
		if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
			return null;
		}

		return {
			lat,
			lng,
			placeName: typeof result.placeName === 'string' ? result.placeName : null,
			reasoning: typeof result.reasoning === 'string' ? result.reasoning : '',
			confidence
		};
	} catch {
		return null;
	}
}

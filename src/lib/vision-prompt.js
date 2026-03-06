/**
 * Shared prompt and response parsing for bird species vision identification.
 * Used by both src/lib/server/vision.js (SvelteKit) and scripts/vision-standalone.js.
 */

export const SPECIES_PROMPT = `Identify the bird species in this photo. Respond with ONLY a JSON object, no markdown, no explanation:
{"species": "Common Name", "scientificName": "Genus species", "confidence": "high|medium|low"}

If no bird is visible or you cannot identify it:
{"species": null, "scientificName": null, "confidence": "low"}

Confidence guide:
- "high": distinctive species, clearly visible features
- "medium": likely correct but angle/lighting makes it uncertain
- "low": poor visibility, partial view, or ambiguous species`;

export const SPECIES_MODEL = 'gpt-4.1-mini';

/**
 * Parse the LLM response text into a species result.
 * @param {string|undefined} rawText
 * @returns {{ species: string, scientificName: string|null, confidence: string }|null}
 */
export function parseSpeciesResponse(rawText) {
	try {
		let text = rawText?.trim();
		if (!text) return null;

		// Extract JSON from markdown fences if present (handles preamble text)
		const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
		if (fenceMatch) {
			text = fenceMatch[1];
		} else {
			// Fallback: extract first bare JSON object (handles preamble without fences)
			const jsonMatch = text.match(/\{[\s\S]*\}/);
			if (jsonMatch) text = jsonMatch[0];
		}

		const result = JSON.parse(text);
		if (!result || typeof result.species !== 'string' || result.species.length > 100) return null;

		return {
			species: result.species,
			scientificName: typeof result.scientificName === 'string' ? result.scientificName : null,
			confidence: ['high', 'medium', 'low'].includes(result.confidence)
				? result.confidence
				: 'low'
		};
	} catch {
		return null;
	}
}

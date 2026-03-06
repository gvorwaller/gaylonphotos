/**
 * Bird species identification via OpenAI GPT-4.1-mini vision.
 * Uses the 400px thumbnail URL to minimize token cost.
 * Returns null on any error — same pattern as reverseGeocode.
 */
import OpenAI from 'openai';
import { OPENAI_API_KEY } from '$env/static/private';
import { SPECIES_PROMPT, SPECIES_MODEL, parseSpeciesResponse } from '$lib/vision-prompt.js';

let client = null;

function getClient() {
	if (!client) client = new OpenAI({ apiKey: OPENAI_API_KEY });
	return client;
}

/**
 * Identify bird species from a photo thumbnail URL.
 * @param {string} thumbnailUrl — CDN URL of the 400px thumbnail
 * @returns {Promise<{ species: string, scientificName: string|null, confidence: string }|null>}
 */
export async function identifySpecies(thumbnailUrl) {
	if (!OPENAI_API_KEY) {
		console.warn('Vision: OPENAI_API_KEY not configured');
		return null;
	}

	try {
		const response = await getClient().chat.completions.create({
			model: SPECIES_MODEL,
			max_tokens: 256,
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'image_url', image_url: { url: thumbnailUrl } },
						{ type: 'text', text: SPECIES_PROMPT }
					]
				}
			]
		});

		return parseSpeciesResponse(response.choices[0]?.message?.content);
	} catch (err) {
		console.warn('Vision identification failed:', err.message);
		return null;
	}
}

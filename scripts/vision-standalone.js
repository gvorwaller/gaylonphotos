/**
 * Standalone vision module for use outside SvelteKit runtime.
 * Uses process.env instead of $env/static/private.
 * The calling script (ingest-photos.js) handles .env loading.
 */
import OpenAI from 'openai';
import { SPECIES_PROMPT, SPECIES_MODEL, parseSpeciesResponse } from '../src/lib/vision-prompt.js';

let client = null;

function getClient() {
	if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
	return client;
}

/**
 * Identify bird species from a photo thumbnail buffer.
 * @param {Buffer} thumbBuffer — JPEG thumbnail buffer (400px wide)
 * @returns {Promise<{ species: string, scientificName: string|null, confidence: string }|null>}
 */
export async function identifySpeciesFromBuffer(thumbBuffer) {
	if (!process.env.OPENAI_API_KEY) {
		console.warn('Vision: OPENAI_API_KEY not set');
		return null;
	}

	try {
		const base64 = thumbBuffer.toString('base64');
		const dataUrl = `data:image/jpeg;base64,${base64}`;

		const response = await getClient().chat.completions.create({
			model: SPECIES_MODEL,
			max_tokens: 256,
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'image_url', image_url: { url: dataUrl } },
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

/**
 * Photo description via OpenAI GPT-4.1-mini vision.
 * Uses the 400px thumbnail URL to minimize token cost.
 * Returns null on any error — same pattern as vision.js.
 */
import OpenAI from 'openai';
import { OPENAI_API_KEY } from '$env/static/private';
import { DESCRIBE_PROMPT, DESCRIBE_MODEL, parseDescribeResponse } from '$lib/describe-prompt.js';

let client = null;

function getClient() {
	if (!client) client = new OpenAI({ apiKey: OPENAI_API_KEY });
	return client;
}

/**
 * Generate a natural language description of a photo.
 * @param {string} imageUrl — CDN URL (thumbnail preferred for cost)
 * @returns {Promise<string|null>}
 */
export async function describePhoto(imageUrl) {
	if (!OPENAI_API_KEY) {
		console.warn('Describe: OPENAI_API_KEY not configured');
		return null;
	}

	try {
		const response = await getClient().chat.completions.create({
			model: DESCRIBE_MODEL,
			max_tokens: 300,
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'image_url', image_url: { url: imageUrl } },
						{ type: 'text', text: DESCRIBE_PROMPT }
					]
				}
			]
		});

		return parseDescribeResponse(response.choices[0]?.message?.content);
	} catch (err) {
		console.warn('Photo description failed:', err.message);
		return null;
	}
}

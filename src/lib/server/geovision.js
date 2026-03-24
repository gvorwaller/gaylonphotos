/**
 * AI-powered photo geolocation via Google Gemini 2.0 Flash.
 * Sends the photo's CDN display URL to Gemini for location recognition.
 * Returns null on any error — same pattern as vision.js (species ID).
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_API_KEY } from '$env/static/private';
import { GEOLOCATION_PROMPT, GEOLOCATION_MODEL, parseGeolocationResponse } from '$lib/geovision-prompt.js';

let client = null;

function getClient() {
	if (!client) client = new GoogleGenerativeAI(GEMINI_API_KEY);
	return client;
}

/**
 * Fetch image from URL and convert to the format Gemini expects.
 * @param {string} imageUrl — CDN URL
 * @returns {Promise<{ inlineData: { data: string, mimeType: string } }>}
 */
async function fetchImageAsInlineData(imageUrl) {
	const response = await fetch(imageUrl);
	if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
	const buffer = await response.arrayBuffer();
	const base64 = Buffer.from(buffer).toString('base64');
	const contentType = response.headers.get('content-type') || 'image/jpeg';
	return {
		inlineData: {
			data: base64,
			mimeType: contentType
		}
	};
}

/**
 * Custom error for Gemini rate limiting.
 */
export class RateLimitedError extends Error {
	constructor() {
		super('Gemini quota exceeded — wait or enable billing');
		this.name = 'RateLimitedError';
	}
}

/**
 * Identify the location of a photo using Gemini vision.
 * @param {string} imageUrl — CDN URL of the display image (1600px for better detail)
 * @returns {Promise<{ lat: number|null, lng: number|null, placeName: string|null, reasoning: string, confidence: string }|null>}
 * @throws {RateLimitedError} on 429/quota errors
 */
export async function identifyLocation(imageUrl) {
	if (!GEMINI_API_KEY) {
		console.warn('Geovision: GEMINI_API_KEY not configured');
		return null;
	}

	try {
		const model = getClient().getGenerativeModel({ model: GEOLOCATION_MODEL });
		const imagePart = await fetchImageAsInlineData(imageUrl);

		const result = await model.generateContent([
			imagePart,
			{ text: GEOLOCATION_PROMPT }
		]);

		const response = result.response;
		const text = response.text();
		return parseGeolocationResponse(text);
	} catch (err) {
		const msg = err.message || '';
		if (msg.includes('429') || msg.includes('quota')) {
			console.error('Geovision: RATE LIMITED — quota exceeded');
			throw new RateLimitedError();
		}
		console.warn('Geovision identification failed:', msg);
		return null;
	}
}

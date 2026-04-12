/**
 * Shared prompt and response parsing for AI photo descriptions.
 * Used by both src/lib/server/describe.js (SvelteKit) and scripts/describe-photos.js.
 */

export const DESCRIBE_PROMPT = `Describe this photo in 2-4 sentences of plain English. Cover the key visual elements:
- Main subject(s) and their characteristics
- Setting, environment, or landscape
- Notable objects, text/signage, animals, or people
- Colors, lighting, weather, or season if apparent
- Architecture style if buildings are present

Be specific and factual. Use natural language, not bullet points. Do not start with "This photo shows" or "The image depicts" — just describe what you see.`;

export const DESCRIBE_MODEL = 'gpt-4.1-mini';

/**
 * Parse the LLM response text into a description string.
 * @param {string|undefined} rawText
 * @returns {string|null}
 */
export function parseDescribeResponse(rawText) {
	const text = rawText?.trim();
	if (!text || text.length < 10) return null;
	// Strip markdown fences if the model wraps the response
	const fenceMatch = text.match(/```(?:\w+)?\s*([\s\S]*?)\s*```/);
	if (fenceMatch) return fenceMatch[1].trim() || null;
	return text;
}

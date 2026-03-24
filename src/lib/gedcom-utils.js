/**
 * Client-side GEDCOM person list parser for person picker dropdowns.
 * Extracts individual names, birth years, and birth places from raw GEDCOM text.
 * Used by AncestryEditor (initial import) and AncestryReimport (re-import).
 */

/**
 * Parse a GEDCOM text to extract a sorted list of individuals.
 * @param {string} text — raw GEDCOM file content
 * @returns {Array<{ id: string, name: string, birthYear: number|null, birthPlace: string|null }>}
 */
export function parseGedcomPersonList(text) {
	text = text.replace(/^\uFEFF/, '');
	const persons = [];
	let currentId = null;
	let name = null;
	let birthYear = null;
	let birthPlace = null;
	let inBirt = false;

	const lines = text.split(/\r\n|\r|\n/);
	for (const line of lines) {
		const match = line.match(/^(\d+)\s+(@\S+@|\S+)\s?(.*)?$/);
		if (!match) continue;

		const level = parseInt(match[1], 10);
		const tag = match[2];
		const value = (match[3] || '').trim();

		if (level === 0) {
			if (currentId && name) {
				persons.push({ id: currentId, name, birthYear, birthPlace });
			}
			currentId = null; name = null; birthYear = null; birthPlace = null; inBirt = false;
			if (value === 'INDI' && tag.startsWith('@')) {
				currentId = tag;
			}
			continue;
		}
		if (!currentId) continue;
		if (level === 1) {
			inBirt = false;
			if (tag === 'NAME') {
				const surname = value.match(/\/(.+?)\//);
				name = surname ? `${value.replace(/\/.*?\//, '').trim()} ${surname[1]}`.trim() : value.replace(/\//g, '').trim();
			} else if (tag === 'BIRT') { inBirt = true; }
		} else if (level === 2 && inBirt) {
			if (tag === 'DATE') { const yr = value.match(/\b(\d{4})\b/); if (yr) birthYear = parseInt(yr[1], 10); }
			else if (tag === 'PLAC') { birthPlace = value; }
		}
	}
	if (currentId && name) persons.push({ id: currentId, name, birthYear, birthPlace });
	persons.sort((a, b) => a.name.localeCompare(b.name));
	return persons;
}

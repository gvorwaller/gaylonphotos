import { readJson, writeJson, deleteJson, ensureDir } from './json-store.js';
import { getCollection } from './collections.js';
import { getItinerary } from './itinerary.js';
import { join } from 'node:path';

const DATA_DIR = 'data';

// ---------------------------------------------------------------------------
// Slug validation (same pattern as itinerary.js)
// ---------------------------------------------------------------------------

function validateSlug(slug) {
	if (!slug || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
		throw new Error('Invalid collection slug');
	}
}

function ancestryPath(slug) {
	validateSlug(slug);
	return join(DATA_DIR, slug, 'ancestry.json');
}

async function validateTravelCollection(slug) {
	const collection = await getCollection(slug);
	if (!collection) throw new Error(`Collection not found: ${slug}`);
	if (collection.type !== 'travel') {
		throw new Error(`Collection "${slug}" is type "${collection.type}", not "travel". Ancestry is only for travel collections.`);
	}
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function getAncestry(collectionSlug) {
	try {
		return await readJson(ancestryPath(collectionSlug));
	} catch (err) {
		if (err.code === 'ENOENT') return null;
		throw err;
	}
}

export async function updateAncestry(collectionSlug, ancestryData) {
	await validateTravelCollection(collectionSlug);

	// Deep clone to avoid mutating caller's object on partial failure
	ancestryData = JSON.parse(JSON.stringify(ancestryData));

	// Recompute nearStop for all places — admin may have fixed coordinates
	const itinerary = await getItinerary(collectionSlug);
	const stops = itinerary?.stops || [];
	if (Array.isArray(ancestryData.places)) {
		for (const place of ancestryData.places) {
			// Coerce coordinates to numbers (client may send strings or empty strings)
			if (place.lat === '' || place.lat === undefined) place.lat = null;
			if (place.lng === '' || place.lng === undefined) place.lng = null;
			if (place.lat != null) place.lat = Number(place.lat);
			if (place.lng != null) place.lng = Number(place.lng);
			if (isNaN(place.lat)) place.lat = null;
			if (isNaN(place.lng)) place.lng = null;
			if (!Array.isArray(place.events)) place.events = [];

			place.nearStop = false;
			if (place.lat != null && place.lng != null) {
				for (const stop of stops) {
					if (stop.lat != null && stop.lng != null && haversineKm(place.lat, place.lng, stop.lat, stop.lng) < 50) {
						place.nearStop = true;
						break;
					}
				}
			}
		}
	}

	// Recompute meta stats to prevent stale counts
	if (ancestryData.meta) {
		ancestryData.meta.totalPersons = ancestryData.persons?.length ?? 0;
		ancestryData.meta.totalPlaces = ancestryData.places?.length ?? 0;
		ancestryData.meta.generationCount = (ancestryData.persons || []).reduce((max, p) => Math.max(max, p.generation ?? 0), 0);
	}

	await ensureDir(join(DATA_DIR, collectionSlug));
	await writeJson(ancestryPath(collectionSlug), ancestryData);
	return ancestryData;
}

/**
 * Update a single place's coordinates and geocodeStatus.
 * Lighter than updateAncestry — reads, patches one place, recomputes nearStop, writes.
 */
export async function updatePlace(collectionSlug, placeId, lat, lng) {
	await validateTravelCollection(collectionSlug);

	const filePath = ancestryPath(collectionSlug);
	const ancestry = await readJson(filePath);
	if (!ancestry) throw new Error('No ancestry data for this collection');

	const place = ancestry.places.find((p) => p.id === placeId);
	if (!place) throw new Error(`Place not found: ${placeId}`);

	place.lat = lat;
	place.lng = lng;
	place.geocodeStatus = lat != null && lng != null ? 'manual' : 'failed';

	// Recompute nearStop for this place
	const itinerary = await getItinerary(collectionSlug);
	const stops = itinerary?.stops || [];
	place.nearStop = false;
	if (place.lat != null && place.lng != null) {
		for (const stop of stops) {
			if (stop.lat != null && stop.lng != null && haversineKm(place.lat, place.lng, stop.lat, stop.lng) < 50) {
				place.nearStop = true;
				break;
			}
		}
	}

	await writeJson(filePath, ancestry);
	return place;
}

export async function clearAncestry(collectionSlug) {
	await validateTravelCollection(collectionSlug);
	await deleteJson(ancestryPath(collectionSlug));
}

// ---------------------------------------------------------------------------
// GEDCOM Parser
// ---------------------------------------------------------------------------

/**
 * Supported event tags → human-readable labels.
 */
const EVENT_TAGS = {
	BIRT: 'Birth',
	DEAT: 'Death',
	MARR: 'Marriage',
	CHR: 'Christening',
	BAPM: 'Baptism',
	BURI: 'Burial',
	RESI: 'Residence',
	IMMI: 'Immigration',
	EMIG: 'Emigration',
	OCCU: 'Occupation',
	MILI: 'Military Service',
	NATU: 'Naturalization',
	CENS: 'Census',
	WILL: 'Will',
	PROB: 'Probate',
	EVEN: 'Event'
};

/**
 * Parse a GEDCOM file buffer into structured data.
 * Handles both GEDCOM 5.x and 7.x line formats.
 *
 * @param {string} text — GEDCOM file content as string
 * @returns {{ individuals: Map, families: Map }}
 */
export function parseGedcom(text) {
	const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');

	const individuals = new Map(); // id → { name, gender, facts[], fsId, familyChild, familySpouse[] }
	const families = new Map();    // id → { husband, wife, children[] , facts[] }

	let currentRecord = null; // { type: 'INDI'|'FAM', id, data }
	let currentEvent = null;  // { tag, date, place, year }
	let lastLevel1Tag = null; // Track for CONC/CONT at level 2
	let lastLevel2Tag = null; // Track for CONC/CONT at level 3

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) continue;

		// GEDCOM line: "level [xref] tag [value]"
		// GEDCOM 7 may use @ or not for xrefs
		const match = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\S+)(?:\s+(.*))?$/);
		if (!match) continue;

		const level = parseInt(match[1], 10);
		const xref = match[2] || null;
		const tag = match[3];
		const value = match[4] || '';

		// Level 0 — new record
		if (level === 0) {
			// Flush any pending event
			if (currentEvent && currentRecord) {
				currentRecord.data.facts.push({ ...currentEvent });
			}
			currentEvent = null;

			// Skip GEDCOM 7 @VOID@ placeholder xrefs
			if (xref === '@VOID@') {
				currentRecord = null;
				continue;
			}

			if (xref && tag === 'INDI') {
				currentRecord = {
					type: 'INDI', id: xref,
					data: { name: '', gender: '', facts: [], fsId: null, familyChild: null, familySpouse: [] }
				};
				individuals.set(xref, currentRecord.data);
			} else if (xref && tag === 'FAM') {
				currentRecord = {
					type: 'FAM', id: xref,
					data: { husband: null, wife: null, children: [], facts: [] }
				};
				families.set(xref, currentRecord.data);
			} else {
				currentRecord = null;
			}
			continue;
		}

		if (!currentRecord) continue;

		// Level 1 tags
		if (level === 1) {
			// Flush pending event before starting a new level-1 section
			if (currentEvent) {
				currentRecord.data.facts.push({ ...currentEvent });
				currentEvent = null;
			}
			lastLevel1Tag = tag;
			lastLevel2Tag = null;

			if (currentRecord.type === 'INDI') {
				if (tag === 'NAME') {
					// Parse "First /Last/" → "First Last"
					// Also handles "/Last/ First" → "First Last"
					const surnameMatch = value.match(/^\/([^/]*)\/\s*(.+)/);
					if (surnameMatch) {
						currentRecord.data.name = `${surnameMatch[2]} ${surnameMatch[1]}`.trim();
					} else {
						currentRecord.data.name = value.replace(/\//g, '').trim();
					}
				} else if (tag === 'SEX') {
					currentRecord.data.gender = value === 'M' ? 'Male' : value === 'F' ? 'Female' : value;
				} else if (tag === 'FAMC') {
					currentRecord.data.familyChild = value;
				} else if (tag === 'FAMS') {
					currentRecord.data.familySpouse.push(value);
				} else if (tag === '_FSFTID' || tag === '_FID') {
					currentRecord.data.fsId = value;
				} else if (EVENT_TAGS[tag]) {
					currentEvent = { tag, type: EVENT_TAGS[tag], date: null, place: null, year: null };
				}
			} else if (currentRecord.type === 'FAM') {
				if (tag === 'HUSB') {
					currentRecord.data.husband = value;
				} else if (tag === 'WIFE') {
					currentRecord.data.wife = value;
				} else if (tag === 'CHIL') {
					currentRecord.data.children.push(value);
				} else if (EVENT_TAGS[tag]) {
					currentEvent = { tag, type: EVENT_TAGS[tag], date: null, place: null, year: null };
				}
			}
			continue;
		}

		// Level 2 tags (sub-fields of events, or CONC/CONT for level-1 values)
		if (level === 2) {
			if (currentEvent) {
				if (tag === 'DATE') {
					currentEvent.date = value;
					currentEvent.year = extractYear(value);
					lastLevel2Tag = 'DATE';
				} else if (tag === 'PLAC') {
					currentEvent.place = value;
					lastLevel2Tag = 'PLAC';
				} else if (tag === 'CONC' || tag === 'CONT') {
					// Continuation of a level-1 value (e.g. NAME)
					// not inside an event — handled below
				}
			}
			// CONC/CONT for level-1 NAME values
			if ((tag === 'CONC' || tag === 'CONT') && lastLevel1Tag === 'NAME' && currentRecord.type === 'INDI') {
				const sep = tag === 'CONT' ? '\n' : '';
				currentRecord.data.name = (currentRecord.data.name + sep + value).replace(/\//g, '').trim();
			}
			// _FSFTID / _FID on INDI (some GEDCOM exporters put it at level 2)
			if ((tag === '_FSFTID' || tag === '_FID') && currentRecord.type === 'INDI') {
				currentRecord.data.fsId = value;
			}
		}

		// Level 3 CONC/CONT (continuation of PLAC or DATE values)
		if (level === 3 && currentEvent && (tag === 'CONC' || tag === 'CONT')) {
			const sep = tag === 'CONT' ? '\n' : '';
			if (lastLevel2Tag === 'PLAC' && currentEvent.place != null) {
				currentEvent.place += sep + value;
			} else if (lastLevel2Tag === 'DATE' && currentEvent.date != null) {
				currentEvent.date += sep + value;
				currentEvent.year = extractYear(currentEvent.date);
			}
		}
	}

	// Flush last event
	if (currentEvent && currentRecord) {
		currentRecord.data.facts.push({ ...currentEvent });
	}

	// Post-parse: derive FAMC/FAMS from FAM records to handle GEDCOM files
	// that only define relationships in FAM records (not on INDI records).
	for (const [famId, fam] of families) {
		for (const childId of fam.children) {
			const child = individuals.get(childId);
			if (child && !child.familyChild) {
				child.familyChild = famId;
			}
		}
		if (fam.husband) {
			const husb = individuals.get(fam.husband);
			if (husb && !husb.familySpouse.includes(famId)) {
				husb.familySpouse.push(famId);
			}
		}
		if (fam.wife) {
			const wife = individuals.get(fam.wife);
			if (wife && !wife.familySpouse.includes(famId)) {
				wife.familySpouse.push(famId);
			}
		}
	}

	return { individuals, families };
}

/**
 * Extract a 4-digit year from a GEDCOM date string.
 * Handles: "15 MAY 1832", "1832", "ABT 1862", "BEF 1900", etc.
 */
function extractYear(dateStr) {
	const match = dateStr.match(/(\d{4})/);
	return match ? parseInt(match[1], 10) : null;
}

// ---------------------------------------------------------------------------
// Generation & lineage computation
// ---------------------------------------------------------------------------

/**
 * BFS from root person through family links to compute generation numbers
 * and lineage paths, filtered to maxGenerations.
 *
 * @param {string} rootId — GEDCOM individual xref (e.g. "@I1@")
 * @param {Map} individuals
 * @param {Map} families
 * @param {number} maxGenerations
 * @returns {Map<string, { generation: number, lineage: string, lineagePath: string }>}
 */
function computeGenerations(rootId, individuals, families, maxGenerations) {
	const result = new Map();
	// Queue entries: [personId, generation, lineage ('paternal'|'maternal'|'self'), lineagePath]
	const queue = [[rootId, 0, 'self', 'Self']];
	let qi = 0;

	while (qi < queue.length) {
		const [personId, gen, lineage, path] = queue[qi++];

		if (gen > maxGenerations) continue;

		if (result.has(personId)) {
			// Pedigree collapse: ancestor reached via both lines → mark as 'both'
			const existing = result.get(personId);
			if (existing.lineage !== lineage && existing.lineage !== 'self' && existing.lineage !== 'both') {
				existing.lineage = 'both';
			}
			continue;
		}

		result.set(personId, { generation: gen, lineage: gen === 0 ? 'self' : lineage, lineagePath: path });

		const person = individuals.get(personId);
		if (!person || !person.familyChild) continue;

		const family = families.get(person.familyChild);
		if (!family) continue;

		const nextGen = gen + 1;
		if (nextGen > maxGenerations) continue;

		if (family.husband) {
			const fatherLineage = lineage === 'self' || lineage === 'paternal' ? 'paternal' : lineage;
			const fatherPath = gen === 0 ? 'Father' : path + "'s father";
			if (result.has(family.husband)) {
				// Pedigree collapse: ancestor already processed via different lineage
				const existing = result.get(family.husband);
				if (existing.lineage !== fatherLineage && existing.lineage !== 'self' && existing.lineage !== 'both') {
					existing.lineage = 'both';
				}
			} else {
				queue.push([family.husband, nextGen, fatherLineage, fatherPath]);
			}
		}

		if (family.wife) {
			const motherLineage = lineage === 'self' || lineage === 'maternal' ? 'maternal' : lineage;
			const motherPath = gen === 0 ? 'Mother' : path + "'s mother";
			if (result.has(family.wife)) {
				const existing = result.get(family.wife);
				if (existing.lineage !== motherLineage && existing.lineage !== 'self' && existing.lineage !== 'both') {
					existing.lineage = 'both';
				}
			} else {
				queue.push([family.wife, nextGen, motherLineage, motherPath]);
			}
		}
	}

	return result;
}

// ---------------------------------------------------------------------------
// Geocoding via Google Geocoding API
// ---------------------------------------------------------------------------

/**
 * Geocode a list of unique place names using Google Geocoding API.
 * Rate-limited to ~10 requests per second.
 *
 * @param {string[]} placeNames
 * @returns {Promise<Map<string, { lat: number, lng: number, country: string, status: string }>>}
 */
export async function geocodePlaces(placeNames) {
	const { GOOGLE_GEOCODING_KEY } = await import('$env/dynamic/private');
	const results = new Map();
	placeNames = [...new Set(placeNames)];

	for (let i = 0; i < placeNames.length; i++) {
		const name = placeNames[i];

		// Rate limit: ~10 req/sec
		if (i > 0) {
			await new Promise((r) => setTimeout(r, 100));
		}

		try {
			const url = `https://maps.googleapis.com/maps/api/geocode/json?${new URLSearchParams({
				address: name,
				key: GOOGLE_GEOCODING_KEY
			})}`;

			const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

			if (!res.ok) {
				results.set(name, { lat: null, lng: null, country: '', status: 'failed' });
				continue;
			}

			const data = await res.json();
			if (data.status !== 'OK' || !data.results?.length) {
				results.set(name, { lat: null, lng: null, country: '', status: 'failed' });
				continue;
			}

			const top = data.results[0];
			const lat = top.geometry.location.lat;
			const lng = top.geometry.location.lng;
			const country = top.address_components?.find(c => c.types.includes('country'))?.long_name || '';
			// ROOFTOP/RANGE_INTERPOLATED = precise, GEOMETRIC_CENTER/APPROXIMATE = approximate
			const locationType = top.geometry.location_type;
			const status = (locationType === 'ROOFTOP' || locationType === 'RANGE_INTERPOLATED') ? 'ok' : 'approximate';

			results.set(name, { lat, lng, country, status });
		} catch {
			results.set(name, { lat: null, lng: null, country: '', status: 'failed' });
		}
	}

	return results;
}

// ---------------------------------------------------------------------------
// Haversine distance (for nearStop computation)
// ---------------------------------------------------------------------------

function haversineKm(lat1, lng1, lat2, lng2) {
	const R = 6371;
	const dLat = (lat2 - lat1) * Math.PI / 180;
	const dLng = (lng2 - lng1) * Math.PI / 180;
	const a = Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Build ancestry.json from parsed GEDCOM + geocoded places
// ---------------------------------------------------------------------------

/**
 * Assemble the full ancestry object from parsed GEDCOM + geocoded places.
 *
 * @param {{ individuals: Map, families: Map }} parsed
 * @param {Map} geocoded — place name → { lat, lng, country, status }
 * @param {string} rootPersonId — GEDCOM individual xref (e.g. "@I1@")
 * @param {number} maxGenerations
 * @param {object[]|null} itineraryStops — from itinerary.json, for nearStop computation
 * @param {{ source: string, fileName: string }} importMeta
 * @param {Map} [precomputedGenMap] — optional pre-computed generation map to avoid recomputation
 * @returns {object} — ancestry.json schema
 */
export function buildAncestry(parsed, geocoded, rootPersonId, maxGenerations, itineraryStops, importMeta, precomputedGenMap) {
	const { individuals, families } = parsed;
	const genMap = precomputedGenMap || computeGenerations(rootPersonId, individuals, families, maxGenerations);

	// Build persons array (only those within maxGenerations)
	const persons = [];
	for (const [id, genInfo] of genMap) {
		const indi = individuals.get(id);
		if (!indi) continue;

		const birthFact = indi.facts.find((f) => f.type === 'Birth');
		const deathFact = indi.facts.find((f) => f.type === 'Death');

		// Include marriage facts from FAM records
		const allFacts = [...indi.facts];
		for (const famId of indi.familySpouse) {
			const fam = families.get(famId);
			if (fam) {
				for (const fact of fam.facts) {
					allFacts.push({ ...fact });
				}
			}
		}

		persons.push({
			id,
			fsId: indi.fsId ?? null,
			name: indi.name,
			gender: indi.gender,
			birthDate: birthFact?.date ?? null,
			birthYear: birthFact?.year ?? null,
			birthPlace: birthFact?.place ?? null,
			deathDate: deathFact?.date ?? null,
			deathYear: deathFact?.year ?? null,
			deathPlace: deathFact?.place ?? null,
			generation: genInfo.generation,
			lineage: genInfo.lineage,
			lineagePath: genInfo.lineagePath,
			facts: allFacts
				.filter((f) => f.place || f.date)
				.map((f) => ({
					type: f.type,
					date: f.date ?? null,
					year: f.year ?? null,
					place: f.place ?? null
				}))
		});
	}

	// Build places array (rebuilt from persons — denormalized)
	const places = rebuildPlaces(persons, geocoded, itineraryStops);

	// Determine actual generation count
	const maxGen = persons.reduce((max, p) => Math.max(max, p.generation), 0);

	const rootPerson = individuals.get(rootPersonId);

	return {
		meta: {
			importedAt: new Date().toISOString(),
			source: importMeta.source || 'gedcom',
			fileName: importMeta.fileName || '',
			rootPersonId,
			rootPersonName: rootPerson?.name || '',
			generationCount: maxGen,
			totalPersons: persons.length,
			totalPlaces: places.length
		},
		persons,
		places,
		familyLines: [
			{ id: 'paternal', label: "Father's Line" },
			{ id: 'maternal', label: "Mother's Line" }
		]
	};
}

/**
 * Rebuild the denormalized places array from persons + geocoded data.
 * Called on import and on save (to prevent stale personName data).
 */
export function rebuildPlaces(persons, geocoded, itineraryStops) {
	// Collect all unique place names from person facts
	const placeEventsMap = new Map(); // placeName → [{ personId, personName, type, year }]

	for (const person of persons) {
		for (const fact of person.facts) {
			if (!fact.place) continue;
			if (!placeEventsMap.has(fact.place)) {
				placeEventsMap.set(fact.place, []);
			}
			placeEventsMap.get(fact.place).push({
				personId: person.id,
				personName: person.name,
				type: fact.type,
				year: fact.year
			});
		}
	}

	const stops = itineraryStops || [];
	const places = [];
	let placeIdx = 1;

	for (const [name, events] of placeEventsMap) {
		const geo = geocoded.get(name) || { lat: null, lng: null, country: '', status: 'failed' };

		// Determine if this place is near any itinerary stop (~50km)
		let nearStop = false;
		if (geo.lat != null && geo.lng != null) {
			for (const stop of stops) {
				if (stop.lat != null && stop.lng != null && haversineKm(geo.lat, geo.lng, stop.lat, stop.lng) < 50) {
					nearStop = true;
					break;
				}
			}
		}

		places.push({
			id: `P${placeIdx++}`,
			name,
			lat: geo.lat,
			lng: geo.lng,
			country: geo.country,
			geocodeStatus: geo.status,
			events: events.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999)),
			nearStop
		});
	}

	return places.sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Merge ancestry (combine two GEDCOM imports)
// ---------------------------------------------------------------------------

/**
 * Merge a new GEDCOM import into existing ancestry data.
 * Deduplicates persons by fsId, prefixes new lineage labels, tracks multiple roots.
 *
 * @param {object} existing — current ancestry.json data
 * @param {{ individuals: Map, families: Map }} parsed — newly parsed GEDCOM
 * @param {string} newRootId — root person xref from the new GEDCOM
 * @param {number} maxGenerations
 * @param {Map} geocoded — place name → { lat, lng, country, status }
 * @param {object[]} itineraryStops
 * @param {string} lineagePrefix — prefix for new lineage labels (e.g. 'wife')
 * @param {{ source: string, fileName: string }} importMeta
 * @returns {object} — merged ancestry.json schema
 */
export function mergeAncestry(existing, parsed, newRootId, maxGenerations, geocoded, itineraryStops, lineagePrefix, importMeta) {
	if (!Array.isArray(existing?.persons) || !Array.isArray(existing?.places)) {
		throw new Error('Existing ancestry data is corrupted — missing persons or places array');
	}

	const { individuals, families } = parsed;
	const genMap = computeGenerations(newRootId, individuals, families, maxGenerations);

	// Build sets for dedup — by fsId and by person ID (prevents duplicates on repeated merges)
	const existingFsIds = new Set();
	const existingPersonIds = new Set();
	for (const p of existing.persons) {
		if (p.fsId) existingFsIds.add(p.fsId);
		existingPersonIds.add(p.id);
	}

	// Build new persons, skipping duplicates by fsId
	const newPersons = [];
	let dupCount = 0;

	for (const [id, genInfo] of genMap) {
		const indi = individuals.get(id);
		if (!indi) continue;

		// Dedup: skip if this person's fsId already exists in the dataset
		if (indi.fsId && existingFsIds.has(indi.fsId)) {
			dupCount++;
			continue;
		}

		const birthFact = indi.facts.find((f) => f.type === 'Birth');
		const deathFact = indi.facts.find((f) => f.type === 'Death');

		// Include marriage facts from FAM records
		const allFacts = [...indi.facts];
		for (const famId of indi.familySpouse) {
			const fam = families.get(famId);
			if (fam) {
				for (const fact of fam.facts) {
					allFacts.push({ ...fact });
				}
			}
		}

		// Prefix lineage with source label
		let lineage = genInfo.lineage;
		if (lineage === 'self') {
			lineage = `${lineagePrefix}-self`;
		} else if (lineage === 'both') {
			lineage = `${lineagePrefix}-both`;
		} else {
			lineage = `${lineagePrefix}-${lineage}`;
		}

		// Prefix lineagePath
		const pathPrefix = lineagePrefix.charAt(0).toUpperCase() + lineagePrefix.slice(1);
		const rawPath = genInfo.lineagePath || '';
		const lineagePath = genInfo.generation === 0 || !rawPath
			? pathPrefix
			: `${pathPrefix}'s ${rawPath.charAt(0).toLowerCase()}${rawPath.slice(1)}`;

		const cleanId = id.replace(/@/g, '');
		const newId = `${lineagePrefix}_${cleanId}`;

		// Skip if this person ID already exists (repeated merge with same file)
		if (existingPersonIds.has(newId)) {
			dupCount++;
			continue;
		}

		newPersons.push({
			id: newId,
			fsId: indi.fsId ?? null,
			name: indi.name,
			gender: indi.gender,
			birthDate: birthFact?.date ?? null,
			birthYear: birthFact?.year ?? null,
			birthPlace: birthFact?.place ?? null,
			deathDate: deathFact?.date ?? null,
			deathYear: deathFact?.year ?? null,
			deathPlace: deathFact?.place ?? null,
			generation: genInfo.generation,
			lineage,
			lineagePath,
			facts: allFacts
				.filter((f) => f.place || f.date)
				.map((f) => ({
					type: f.type,
					date: f.date ?? null,
					year: f.year ?? null,
					place: f.place ?? null
				}))
		});
	}

	// Combine persons
	const allPersons = [...existing.persons, ...newPersons];

	// Merge geocoded: combine existing place coords with new geocode results
	const existingGeoMap = new Map();
	for (const place of existing.places) {
		existingGeoMap.set(place.name, {
			lat: place.lat,
			lng: place.lng,
			country: place.country,
			status: place.geocodeStatus
		});
	}
	// Overlay new geocode results (for places that didn't exist before)
	const combinedGeo = new Map(existingGeoMap);
	for (const [name, result] of geocoded) {
		if (!combinedGeo.has(name)) {
			combinedGeo.set(name, result);
		}
	}

	// Rebuild places from combined person set
	const places = rebuildPlaces(allPersons, combinedGeo, itineraryStops);

	// Update meta
	const rootPerson = individuals.get(newRootId);
	const existingRootIds = existing.meta.rootPersonIds || [existing.meta.rootPersonId];
	const existingRootNames = existing.meta.rootPersonNames || [existing.meta.rootPersonName];

	const maxGen = allPersons.reduce((max, p) => Math.max(max, p.generation), 0);

	// Build updated familyLines
	const existingLines = existing.familyLines || [];
	const pl = pathLabel(lineagePrefix);
	const newLines = [
		{ id: `${lineagePrefix}-self`, label: pl },
		{ id: `${lineagePrefix}-paternal`, label: `${pl}'s Father's Line` },
		{ id: `${lineagePrefix}-maternal`, label: `${pl}'s Mother's Line` },
		{ id: `${lineagePrefix}-both`, label: `${pl} (Both Lines)` }
	];
	// Only add lines that don't already exist
	const existingLineIds = new Set(existingLines.map((l) => l.id));
	const familyLines = [...existingLines];
	for (const line of newLines) {
		if (!existingLineIds.has(line.id)) {
			familyLines.push(line);
		}
	}

	// Build merged meta — remove stale singular rootPersonId/rootPersonName
	const { rootPersonId: _rpId, rootPersonName: _rpName, ...baseMeta } = existing.meta;

	return {
		meta: {
			...baseMeta,
			importedAt: new Date().toISOString(),
			rootPersonIds: [...existingRootIds, newRootId],
			rootPersonNames: [...existingRootNames, rootPerson?.name || ''],
			generationCount: maxGen,
			totalPersons: allPersons.length,
			totalPlaces: places.length,
			mergeHistory: [
				...(existing.meta.mergeHistory || []),
				{
					source: importMeta.source || 'gedcom',
					fileName: importMeta.fileName || '',
					lineagePrefix,
					addedPersons: newPersons.length,
					skippedDuplicates: dupCount,
					mergedAt: new Date().toISOString()
				}
			]
		},
		persons: allPersons,
		places,
		familyLines,
		_mergeReport: {
			addedPersons: newPersons.length,
			skippedDuplicates: dupCount,
			newPlacesGeocoded: geocoded.size,
			personsWithoutFsId: newPersons.filter((p) => !p.fsId).length
		}
	};
}

function pathLabel(prefix) {
	return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

// ---------------------------------------------------------------------------
// Full import pipeline
// ---------------------------------------------------------------------------

/**
 * Full import pipeline: parse GEDCOM → geocode → build → save.
 *
 * @param {string} collectionSlug
 * @param {string} gedcomText — GEDCOM file content
 * @param {string} rootPersonId — GEDCOM xref e.g. "@I1@"
 * @param {number} maxGenerations — 1–8
 * @param {string} fileName — original file name for metadata
 * @param {{ merge?: boolean, lineagePrefix?: string }} [options] — merge options
 * @returns {Promise<{ ancestry: object, geocodeReport: object }>}
 */
export async function importGedcom(collectionSlug, gedcomText, rootPersonId, maxGenerations, fileName, options = {}) {
	await validateTravelCollection(collectionSlug);

	const { merge = false, lineagePrefix = 'wife' } = options;

	// Normalize rootPersonId — ensure it has @ delimiters
	rootPersonId = rootPersonId.replace(/^@?([A-Za-z0-9_]+)@?$/, '@$1@');

	const parsed = parseGedcom(gedcomText);

	if (!parsed.individuals.has(rootPersonId)) {
		const sample = [...parsed.individuals.keys()].slice(0, 5).map(k => k.replace(/@/g, '')).join(', ');
		console.warn(`Root person "${rootPersonId}" not found. GEDCOM contains: ${sample}${parsed.individuals.size > 5 ? '...' : ''}`);
		throw new Error(`Root person not found in GEDCOM file. Try one of: ${sample}${parsed.individuals.size > 5 ? '...' : ''}`);
	}

	// Collect unique place names from persons within generation range
	const genMap = computeGenerations(rootPersonId, parsed.individuals, parsed.families, maxGenerations);
	const placeNames = new Set();

	for (const [id] of genMap) {
		const indi = parsed.individuals.get(id);
		if (!indi) continue;
		for (const fact of indi.facts) {
			if (fact.place) placeNames.add(fact.place);
		}
		// Marriage facts from families
		for (const famId of indi.familySpouse) {
			const fam = parsed.families.get(famId);
			if (fam) {
				for (const fact of fam.facts) {
					if (fact.place) placeNames.add(fact.place);
				}
			}
		}
	}

	// Load itinerary for nearStop computation
	const itinerary = await getItinerary(collectionSlug);
	const stops = itinerary?.stops || [];

	// If merging, skip geocoding for places we already have coords for
	let existing = null;
	const existingPlaceNames = new Set();
	if (merge) {
		existing = await getAncestry(collectionSlug);
		if (!existing) {
			throw new Error('No existing ancestry data to merge with. Use a regular import first.');
		}
		for (const place of existing.places) {
			if (place.lat != null && place.lng != null) {
				existingPlaceNames.add(place.name);
			}
		}
	}

	// Only geocode places we don't already have
	const placesToGeocode = [...placeNames].filter((name) => !existingPlaceNames.has(name));

	// Cap unique places (~440s at 1.1s/req). Requires Node requestTimeout >440s
	// and Nginx proxy_read_timeout >440s (default 60s — must be increased).
	if (placesToGeocode.length > 400) {
		throw new Error(`Too many unique new places (${placesToGeocode.length}). Maximum is 400. Try reducing maxGenerations.`);
	}

	// Geocode only new places
	const geocoded = await geocodePlaces(placesToGeocode);

	let ancestry;
	if (merge && existing) {
		// Merge into existing data
		ancestry = mergeAncestry(
			existing, parsed, rootPersonId, maxGenerations,
			geocoded, stops, lineagePrefix,
			{ source: 'gedcom', fileName }
		);
	} else {
		// Fresh import (pass pre-computed genMap to avoid redundant BFS)
		ancestry = buildAncestry(
			parsed, geocoded, rootPersonId, maxGenerations, stops,
			{ source: 'gedcom', fileName }, genMap
		);
	}

	// Save
	await ensureDir(join(DATA_DIR, collectionSlug));
	const toSave = { ...ancestry };
	delete toSave._mergeReport;
	await writeJson(ancestryPath(collectionSlug), toSave);

	// Build geocode report
	const geocodeReport = {
		total: geocoded.size,
		ok: 0,
		approximate: 0,
		failed: 0,
		failedPlaces: []
	};
	for (const [name, result] of geocoded) {
		if (result.status === 'ok') geocodeReport.ok++;
		else if (result.status === 'approximate') geocodeReport.approximate++;
		else geocodeReport.failed++;
		if (result.status === 'failed') {
			geocodeReport.failedPlaces.push(name);
		}
	}

	// Include merge stats in response
	if (ancestry._mergeReport) {
		geocodeReport.mergeReport = ancestry._mergeReport;
		delete ancestry._mergeReport;
	}

	return { ancestry: toSave, geocodeReport };
}

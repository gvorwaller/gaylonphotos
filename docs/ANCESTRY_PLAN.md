# Ancestral Geography Layer — Family Heritage for Travel Collections

## Context
Task: td-2b4305. The Scandinavia 2023 trip was primarily for family history — visiting cities, churches, and cemeteries where ancestors lived. This feature ties that family history to the travel collection, showing where ancestors lived alongside places actually visited. Displayed as a collapsible "Family Heritage" section between Timeline and Photos on the public travel page, with ancestry markers on the Journey map.

## Architecture Decision: Import Method

**Recommended: GEDCOM file upload with automated geocoding.**

The task originally called for FamilySearch API integration, but FamilySearch requires:
- Developer program registration + "Compatible Solution Provider" approval for production data
- OAuth2 Authorization Code flow (browser redirect to FamilySearch, callback, token management)
- 24-hour token expiry, complex error handling, rate limiting (429 responses)

For a one-time import on a personal photography site, this is significant overhead. Instead:
1. User exports a GEDCOM file from familysearch.org (File → Download → GEDCOM)
2. User uploads the GEDCOM file via admin page
3. Server parses GEDCOM, extracts persons/events/places
4. Server batch-geocodes place names using OpenStreetMap Nominatim (free, no API key, good with historical European names)
5. Server saves structured data to `data/{slug}/ancestry.json`

The original objection to GEDCOM ("manually geocoding place names is too labor-intensive") is solved by automating geocoding server-side. No manual geocoding at all.

**FamilySearch API can be added later** as an enhancement — the data schema and display layer are identical regardless of import source.

---

## Data Schema — `data/{slug}/ancestry.json`

```json
{
  "meta": {
    "importedAt": "2026-03-01T14:30:00Z",
    "source": "gedcom",
    "fileName": "FamilySearch-Tree.ged",
    "rootPersonId": "I1",
    "rootPersonName": "Gaylon Vorwaller",
    "generationCount": 8,
    "totalPersons": 47,
    "totalPlaces": 12
  },
  "persons": [
    {
      "id": "I16",
      "fsId": "XXXX-XXX",
      "name": "Anders Olsen",
      "gender": "Male",
      "birthDate": "15 May 1832",
      "birthYear": 1832,
      "birthPlace": "Tanum, Bohuslän, Sweden",
      "deathDate": "20 Nov 1901",
      "deathYear": 1901,
      "deathPlace": "Logan, Cache, Utah, United States",
      "generation": 4,
      "lineage": "paternal",
      "lineagePath": "Father's father's father's father",
      "facts": [
        { "type": "Birth", "date": "15 May 1832", "year": 1832, "place": "Tanum, Bohuslän, Sweden" },
        { "type": "Christening", "date": "20 May 1832", "year": 1832, "place": "Tanum Parish, Bohuslän, Sweden" },
        { "type": "Marriage", "date": "12 Jun 1858", "year": 1858, "place": "Tanum, Bohuslän, Sweden" },
        { "type": "Immigration", "date": "1862", "year": 1862, "place": "United States" },
        { "type": "Residence", "date": "1870", "year": 1870, "place": "Logan, Cache, Utah" },
        { "type": "Death", "date": "20 Nov 1901", "year": 1901, "place": "Logan, Cache, Utah, United States" },
        { "type": "Burial", "date": "23 Nov 1901", "year": 1901, "place": "Logan City Cemetery, Utah" }
      ]
    }
  ],
  "places": [
    {
      "id": "P1",
      "name": "Tanum, Bohuslän, Sweden",
      "lat": 58.7235,
      "lng": 11.3268,
      "country": "Sweden",
      "geocodeStatus": "ok",
      "events": [
        { "personId": "I16", "personName": "Anders Olsen", "type": "Birth", "year": 1832 },
        { "personId": "I16", "personName": "Anders Olsen", "type": "Marriage", "year": 1858 },
        { "personId": "I17", "personName": "Ingrid Andersdotter", "type": "Birth", "year": 1835 }
      ],
      "nearStop": true
    }
  ],
  "familyLines": [
    { "id": "paternal", "label": "Father's Line" },
    { "id": "maternal", "label": "Mother's Line" }
  ]
}
```

Key design choices:
- **`places` array** is denormalized with events for fast rendering — no joins needed on the client. The `places` array is **rebuilt from `persons`** on every save/import (not independently editable), so `personName` fields in events never go stale after edits.
- **`nearStop`** flag marks places that are within ~50km of an itinerary stop (computed at import time) for "Visited" badges
- **`generation`** and **`lineagePath`** computed from GEDCOM family links using Ahnentafel numbering
- **`fsId`** (FamilySearch ID) preserved from GEDCOM `_FSFTID` tag for profile links
- **`geocodeStatus`** tracks: `"ok"`, `"approximate"`, `"failed"` — admin can fix failed geocodes
- **Lineage colors use CSS custom properties** defined in `src/styles/global.css` (`--color-line-paternal: #8B5CF6`, `--color-line-maternal: #D97706`, `--color-ancestry-marker: #8B5CF6`) rather than hardcoded hex values, consistent with the project's design token conventions

---

## File Changes

### 1. `src/lib/server/ancestry.js` (NEW) — Server module

Following the `itinerary.js` pattern exactly:

```
validateSlug(slug) — path traversal prevention
ancestryPath(slug) — resolve data/{slug}/ancestry.json
getAncestry(slug) → ancestry data or null
updateAncestry(slug, data) → save full ancestry
clearAncestry(slug) → delete ancestry.json
```

Also includes:
```
parseGedcom(fileBuffer) → { persons, families, places }
  - Parse GEDCOM line-based format (0/1/2 level tags)
  - Extract INDI records (persons) with NAME, BIRT, DEAT, MARR, RESI, CHR, BURI, IMMI, EMIG, OCCU
  - Extract FAM records to build parent-child links
  - Compute generation numbers and lineage paths from family tree traversal
  - Extract _FSFTID tags for FamilySearch IDs

geocodePlaces(uniquePlaceNames) → Map<name, {lat, lng, country, status}>
  - Batch geocode using OpenStreetMap Nominatim REST API
  - Rate limit: 1 request/second (Nominatim policy)
  - Cache results to avoid re-geocoding on re-import
  - Handles historical place names (FamilySearch standardized format helps)

buildAncestry(parsedGedcom, geocodedPlaces, rootPersonId, maxGenerations, itineraryStops) → ancestry.json schema
  - Filter persons to those within maxGenerations of the root person
  - Assemble the full ancestry object from parsed + geocoded data
  - Compute nearStop flags by comparing ancestry places to itinerary stop coordinates
  - Group events by place for the places array
  - Derive family line labels (paternal/maternal)
```

### 2. `src/routes/api/ancestry/+server.js` (NEW) — API endpoint

Following `/api/itinerary/+server.js` pattern:

- **GET** `?collection=slug` — returns `{ ancestry }` (public, no auth)
- **POST** — GEDCOM upload (auth required, multipart/form-data)
  - Receives: GEDCOM file + `collection` slug + `rootPersonId` (GEDCOM individual ID, e.g. "I1") + `maxGenerations` (1–8, default 8)
  - Parses GEDCOM → filters to maxGenerations → geocodes places → builds ancestry → saves to JSON
  - Returns: `{ ancestry, geocodeReport }` (report shows which places succeeded/failed)
- **PUT** — update ancestry data (auth required, for manual edits — fix geocodes, edit labels)
  - Body: `{ collection, ancestry }` — replaces full ancestry object
- **DELETE** — clear ancestry (auth required)
  - Body: `{ collection }`

### 3. `src/routes/admin/[collection]/ancestry/+page.server.js` (NEW)

```js
import { getCollection } from '$lib/server/collections.js';
import { getAncestry } from '$lib/server/ancestry.js';
import { getItinerary } from '$lib/server/itinerary.js';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
    const collection = await getCollection(params.collection);
    if (!collection) throw error(404, 'Collection not found');
    if (collection.type !== 'travel') throw error(400, 'Ancestry is only for travel collections');
    const ancestry = await getAncestry(params.collection);
    const itinerary = await getItinerary(params.collection);
    return { collection, ancestry, itinerary };
}
```

### 4. `src/routes/admin/[collection]/ancestry/+page.svelte` (NEW)

```svelte
<script>
    import AncestryEditor from '$lib/components/admin/AncestryEditor.svelte';
    let { data } = $props();
</script>

<div>
    <div class="page-header">
        <h1>Family Heritage — {data.collection.name}</h1>
    </div>
    <AncestryEditor
        collectionSlug={data.collection.slug}
        ancestry={data.ancestry}
        itinerary={data.itinerary}
    />
</div>
```

### 5. `src/lib/components/admin/AncestryEditor.svelte` (NEW) — Admin import & management

Two states:

**No ancestry data — Import mode:**
- File upload zone (reuse drop-zone pattern from PhotoUploader)
- Accepts `.ged` files only
- Input field: "Root Person ID" with help text: "The GEDCOM individual ID (e.g., I1) for yourself or the starting ancestor. Find this in your GEDCOM file or on FamilySearch."
- Generation count slider: 1–8 (default 6)
- "Import" button → uploads GEDCOM to POST /api/ancestry
- Import is a single POST that may take 30–60 seconds (geocoding is rate-limited to 1 req/sec). Show an indeterminate spinner with "Importing — this may take a minute..." rather than staged progress (a single HTTP request can't stream intermediate status).
- After import: shows geocode report (X places geocoded, Y approximate, Z failed)

**Ancestry data exists — Management mode:**
- Summary stats bar: N persons, N places, N generations, imported date
- **Places table**: each place with lat/lng, geocode status, event count
  - Failed geocodes highlighted in red with manual lat/lng override inputs
  - "Re-geocode" button per place
- **Family lines**: editable labels and colors
- **Persons list**: searchable/filterable, shows name, dates, generation, facts
- "Re-import" button (replaces existing data)
- "Clear" button with modal confirmation
- "Save Changes" for manual edits (PUT /api/ancestry)

### 6. `src/lib/components/travel/AncestryPanel.svelte` (NEW) — Public display

**Collapsible section** positioned between Timeline and Photos on the public travel page. **Collapsed by default.**

**Reactive map filtering**: The panel receives `mapBounds` from the parent (same mechanism used for photo filtering). As the user pans/zooms the Journey map, the panel reactively shows only ancestors whose places fall within the visible map viewport. The existing `isInBounds()` function in `+page.svelte` is reused for this.

**Collapsed state** (default):
```
▸ Family Heritage    3 ancestors · 2 places in view  (47 total)
```
Summary updates reactively as map viewport changes. Clicking toggles expansion.

**Expanded state** has three view modes via tab buttons:

#### Tab: "By Place" (default)
- Places sorted alphabetically by country, then name
- Each place card:
  - Place name as header, country flag emoji, "Visited" badge if `nearStop: true`
  - List of persons with events at this place
  - Each person: name (linked to FamilySearch if fsId exists), generation label, event type + year
  - Events sorted chronologically

#### Tab: "By Family Line"
- Two columns (or stacked on mobile): "Father's Line" and "Mother's Line"
- Each line shows persons in generation order (oldest first)
- Each person: name, life dates, key places (birth → death summary)
- Indentation or tree-line connector showing parent-child relationships
- Color-coded by family line

#### Tab: "By Generation"
- Accordion sections: "Generation 1 — Parents (2)", "Generation 2 — Grandparents (4)", etc.
- Each generation section lists persons with:
  - Name, lifespan, birth place → death place
  - All facts as a compact timeline
  - FamilySearch link

**Person detail expansion**: Clicking a person name expands inline to show all their facts/events with dates and places.

**Empty states per tab**: When map filtering results in no visible ancestry, each tab shows: "No ancestors in the current map view — zoom out or pan to see more." Same pattern used by the photo gallery's map filter.

**Statistics footer** (always visible when expanded):
- Date range: "Earliest: Anders Olsen, b. 1832 · Latest: John Vorwaller, d. 1995"
- Countries: "Sweden, Norway, Denmark, United States"
- "Data from FamilySearch" attribution with link

### 7. Modify `src/lib/components/travel/ItineraryMap.svelte` — Add ancestry markers

Add new prop: `ancestryPlaces = []`, `showAncestry = false`

When `showAncestry` is true, merge ancestry place markers into the markers array:
- Color: `#8B5CF6` (purple) — distinct from green (stops) and blue (photos)
- **Distinct marker shape**: Use a diamond or star glyph, not just a colored circle. Color-only distinction is insufficient for colorblind users. Extend `createColoredMarkerElement()` in `Map.svelte` to accept an optional `shape` parameter.
- Label: place name + "N ancestors"

### 8. Modify `src/routes/[collection]/+page.svelte` — Wire up ancestry

- Import AncestryPanel
- Load ancestry data from `data.ancestry`
- Add `showAncestryOnMap` toggle state
- **Pass `mapBounds` to AncestryPanel** — reuses the existing `mapBounds` state and `handleBoundsChange` callback already wired to ItineraryMap's `onboundschange`
- Insert between Timeline and Photos sections:

```svelte
{#if data.ancestry?.persons?.length > 0}
    <section style="margin-top: 32px;">
        <AncestryPanel
            ancestry={data.ancestry}
            collectionSlug={data.collection.slug}
            {mapBounds}
        />
    </section>
{/if}
```

- AncestryPanel internally filters `ancestry.places` using the same bounds-checking logic as `isInBounds()` — only places within the map viewport are shown, and only persons with events at visible places appear
- Pass `ancestryPlaces` and `showAncestry` to ItineraryMap
- Add "Show Family Heritage" toggle checkbox near the Journey section header

### 9. Modify `src/routes/[collection]/+page.server.js` — Load ancestry

Add ancestry loading for travel collections (alongside itinerary):

```js
import { getAncestry } from '$lib/server/ancestry.js';

// In load():
let ancestry = null;
if (collection.type === 'travel') {
    itinerary = await getItinerary(params.collection);
    ancestry = await getAncestry(params.collection);
}
return { collection, photos, itinerary, ancestry };
```

### 10. Modify `src/lib/components/admin/AdminNav.svelte` — Add ancestry link

Add "Ancestry" sublink for travel collections, next to "Itinerary":

```svelte
{#if c.type === 'travel'}
    <a href="/admin/{c.slug}/itinerary" class="nav-sublink" ...>Itinerary</a>
    <a href="/admin/{c.slug}/ancestry" class="nav-sublink" ...>Ancestry</a>
{/if}
```

---

## GEDCOM Parsing Details

GEDCOM is a line-based format. Each line: `{level} {tag} {value}`. Key records:

```
0 @I1@ INDI              ← Individual record
1 NAME Anders /Olsen/
1 SEX M
1 BIRT                    ← Birth event
2 DATE 15 MAY 1832
2 PLAC Tanum, Bohuslän, Sweden
1 DEAT                    ← Death event
2 DATE 20 NOV 1901
2 PLAC Logan, Cache, Utah, United States
1 _FSFTID XXXX-XXX        ← FamilySearch ID

0 @F1@ FAM               ← Family record
1 HUSB @I1@               ← Links husband
1 WIFE @I2@               ← Links wife
1 CHIL @I3@               ← Links child
1 MARR
2 DATE 12 JUN 1858
2 PLAC Tanum, Sweden
```

**Supported event tags**: BIRT (birth), DEAT (death), MARR (marriage), CHR/BAPM (christening/baptism), BURI (burial), RESI (residence), IMMI (immigration), EMIG (emigration), OCCU (occupation), MILI (military service), NATU (naturalization), CENS (census), WILL, PROB (probate)

**Generation computation**: Starting from root person, BFS through FAM records. Each parent generation increments by 1. Lineage path built by tracking "father"/"mother" at each step.

**No npm dependency needed** — GEDCOM is simple enough to parse with a ~100-line parser function. Avoid adding a dependency for this.

---

## Geocoding Details — OpenStreetMap Nominatim

Server-side geocoding via Nominatim (free, no API key):

```
GET https://nominatim.openstreetmap.org/search?q={place_name}&format=json&limit=1
Headers: User-Agent: GaylonPhotos/1.0
```

- Rate limit: max 1 request/second (we add 1100ms delay between requests)
- Good with historical European place names
- Returns `lat`, `lon`, `display_name`, `address.country`
- For ~20-50 unique places, takes ~30-60 seconds (acceptable for a one-time import)

**Fallback**: If Nominatim fails for a place, mark `geocodeStatus: "failed"` — admin can manually enter lat/lng in the editor.

---

## Collapsible Panel Implementation

```svelte
<script>
    import { slide } from 'svelte/transition';
    let { ancestry, mapBounds = null } = $props();
    let expanded = $state(false);

    // Filter places to those within current map viewport
    let visiblePlaces = $derived.by(() => {
        if (!mapBounds) return ancestry.places;
        return ancestry.places.filter(p => {
            if (!p.lat || !p.lng) return false;
            const inLat = p.lat >= mapBounds.south && p.lat <= mapBounds.north;
            if (!inLat) return false;
            if (mapBounds.west <= mapBounds.east) {
                return p.lng >= mapBounds.west && p.lng <= mapBounds.east;
            }
            return p.lng >= mapBounds.west || p.lng <= mapBounds.east;
        });
    });

    // Persons with events at visible places
    let visiblePersonIds = $derived(new Set(visiblePlaces.flatMap(p => p.events.map(e => e.personId))));
    let visiblePersons = $derived(ancestry.persons.filter(p => visiblePersonIds.has(p.id)));
</script>

<div class="ancestry-panel">
    <button class="ancestry-header" onclick={() => expanded = !expanded}>
        <span class="ancestry-chevron">{expanded ? '▾' : '▸'}</span>
        <h2>Family Heritage</h2>
        <span class="ancestry-summary">
            {visiblePersons.length} ancestors · {visiblePlaces.length} places in view
            ({ancestry.persons.length} total)
        </span>
    </button>

    {#if expanded}
        <div class="ancestry-body" transition:slide>
            <!-- Tab bar + content, using visiblePlaces/visiblePersons -->
        </div>
    {/if}
</div>
```

Uses Svelte's `transition:slide` for smooth expand/collapse animation. Content is conditionally rendered (not just hidden) to avoid rendering large DOM trees when collapsed. Filtering is reactive — pan/zoom the map and both collapsed summary and expanded content update immediately.

---

## Files Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/server/ancestry.js` | NEW | GEDCOM parser, Nominatim geocoder, ancestry CRUD |
| `src/routes/api/ancestry/+server.js` | NEW | GET/POST/PUT/DELETE API endpoint |
| `src/routes/admin/[collection]/ancestry/+page.server.js` | NEW | Admin page data loader |
| `src/routes/admin/[collection]/ancestry/+page.svelte` | NEW | Admin page shell |
| `src/lib/components/admin/AncestryEditor.svelte` | NEW | Import UI + management |
| `src/lib/components/travel/AncestryPanel.svelte` | NEW | Public collapsible display |
| `src/routes/[collection]/+page.svelte` | MODIFY | Add AncestryPanel + map toggle |
| `src/routes/[collection]/+page.server.js` | MODIFY | Load ancestry data |
| `src/lib/components/travel/ItineraryMap.svelte` | MODIFY | Add ancestry markers + toggle |
| `src/lib/components/admin/AdminNav.svelte` | MODIFY | Add "Ancestry" nav link |

---

## Verification

1. `npm run build` — no errors
2. Export GEDCOM from FamilySearch → upload via admin → verify parsing + geocoding
3. Check `data/scandinavia-2023/ancestry.json` has correct data
4. View travel collection page → verify collapsible panel with all three view modes
5. Toggle "Show Family Heritage" on map → verify purple ancestry markers appear
6. Click ancestry markers → verify person/event info
7. Test mobile responsive (panel stacks, tabs work, map toggle works)
8. Fix any failed geocodes via admin editor
9. Test with empty ancestry (no panel shown), single person, large dataset

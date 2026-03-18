# Batch Implementation: Open Tasks (P1-P3)

## Context
Open td tasks spanning bug fixes, UX improvements, and new features. Organized into phases by dependency and complexity — quick fixes first, then progressively larger changes. Each phase can be committed and deployed independently.

**Last updated:** 2026-03-14

---

## ~~Phase 1: Quick Fixes~~ DONE (deployed 2026-03-11)

- ~~1a. Admin photo thumbnails (td-75d4a3)~~ — object-fit: contain
- ~~1b. Bird species in photo detail (td-96f8b8)~~ — already working, verified
- **1c. Fix ancestry husband/wife swap (td-7c2fdc, td-8118e1)** — STILL OPEN, moved to Phase 2
- ~~1d. Sort photos by date (td-b5a684)~~ — date sort in public + admin pages
- ~~td-6189db Species in lightbox~~ — added to Lightbox.svelte

### 1c. Fix ancestry husband/wife swap (td-7c2fdc, td-8118e1)
**File:** `data/scandinavia-2023/ancestry.json`
**Root cause:** The GEDCOM import order was reversed — Madonna was imported as primary (index 0), Gaylon's tree merged with `lineagePrefix: "wife"`. The `rootPersonNames` array is `["Madonna Lynn Vorwaller", "Gaylon Blaine Vorwaller"]` and all of Gaylon's ancestors have `wife-paternal`/`wife-maternal` lineage.
**Fix:** Write a one-time script to:
1. Swap `rootPersonNames[0]` and `rootPersonNames[1]`
2. Swap `rootPersonIds[0]` and `rootPersonIds[1]`
3. For each person: swap lineage prefixes (`paternal` ↔ `wife-paternal`, `maternal` ↔ `wife-maternal`, `self` ↔ `wife-self`, `both` ↔ `wife-both`)
4. Update `mergeHistory[0].lineagePrefix` from `"wife"` to indicate it was the original primary

---

## ~~Phase 2A: Birds Page Polish~~ DONE (deployed 2026-03-13)

- ~~td-0b7c22 Collapsible species list~~ — collapsible panel with expand bar
- ~~td-bf5450 Map filter birds/surf~~ — already working, verified

## ~~Phase 2B: Ancestry Lineage Names~~ DONE (deployed 2026-03-13)

- ~~td-7c2fdc / td-8118e1 Ancestry lineage names~~ — displayLineagePath() shows Madonna/Gaylon instead of generic Father's/Mother's/Wife's

## Phase 2C: Search & AI Geocoding (P1/P2 features)
*Search on maps, search ancestors by name, AI-assisted geocoding for unresolved ancestry places.*

### 2c-1. Add search-for-location on map (td-59853b)
**Files:** `src/lib/components/common/Map.svelte`
**Approach:** Add an optional `searchable` prop to Map.svelte. When true, render a search input overlaid on the map, wired to Google Places Autocomplete (already loaded — `libraries=marker,places` at Map.svelte:90). On place select, pan/zoom the map to the result.
**Pattern:** Reuse the exact same Autocomplete pattern from `src/lib/components/admin/ItineraryEditor.svelte:27-65`.
**Changes:**
- Map.svelte: add `searchable = false` prop, conditionally render search input, init Places Autocomplete, pan on place_changed
- `src/routes/[collection]/+page.svelte`: pass `searchable={true}` to ItineraryMap, SightingMap, SpotGallery (or directly to Map if those components forward the prop)

### 2c-2. Add search for name in family history (td-8a9992)
**File:** `src/lib/components/travel/AncestryPanel.svelte`
**Approach:** Add a search input in the ancestry panel header (below tabs). Filter `visiblePersons` by name match. On selecting a result, expand that person's detail and (if they have place events) pan the map to their location.
**Pattern:** Reuse the filter logic from `src/lib/components/admin/AncestryEditor.svelte:166-185`.

### 2c-3. AI geocoding for unresolved ancestry places (td-034625) [P1]
**File:** New script + `data/scandinavia-2023/ancestry.json`
**Description:** Use AI (or Google Geocoding API) to estimate lat/lng for ancestry places that have no coordinates — e.g. "Prussia" → approximate center of historical Prussia (now part of Poland/Russia).
**Approach:** Write a script that:
1. Reads ancestry.json, finds all places with no `lat`/`lng` (or flagged "not found")
2. For each, calls Google Geocoding API (or Gemini) with the place name to get best-guess coordinates
3. Updates ancestry.json with estimated coordinates, flagged as `"geocodeSource": "ai-estimate"` so they can be reviewed/corrected later via td-918913 (manual map geo-tagger)
**Precursor to:** td-918913 (map UI for manual geo-tag corrections)

---

## Phase 3: Batch Operations (P2 features)
*~1-2 hrs. Builds on existing delete flow.*

### 3a. Batch delete in admin UI (td-286da1)
**File:** `src/routes/admin/[collection]/+page.svelte`
**Approach:**
- Add a `selectedPhotos` Set state for multi-select
- Add checkbox overlay on each PhotoEditor thumbnail
- "Select All" / "Deselect All" toggle in header
- "Delete Selected (N)" button → confirmation modal → sequential DELETE calls with progress
- Reuse existing `handleDeleted()` callback and `/api/photos` DELETE endpoint
- CSS: checkbox positioned absolute on thumbnail corner

*td-63cf89 and td-73c604 moved to P4 by user — excluded from this plan.*

---

## Phase 4: Lower Priority / Data Cleanup (P3)
*Deferred or manual tasks.*

### 4a. Clean up family history locations (td-0a402a)
**Description:** Many locations "not found" — need cross-reference with Family Tree 11.
**Approach:** This is primarily a data quality task. Could write a script to list all ancestry places with no coordinates, then attempt geocoding via Google Geocoding API. But the user notes cross-referencing with Family Tree 11 software, suggesting manual review is needed.
**Action:** Write a diagnostic script that lists unresolved places, then user decides which to fix.

### 4b. Itinerary line sometimes missing (td-fa3441)
**File:** `src/lib/components/common/Map.svelte:207-233`
**Investigation:** Only 2 stops exist, both have valid GPS. Polyline requires `length >= 2`. The issue may be a Svelte reactivity timing issue — if the polyline `$effect` runs before `map` is initialized, it silently does nothing and doesn't re-run. Also possible: the polyline renders but is visually obscured by markers.
**Approach:** Add a `$effect` dependency guard: ensure polyline re-syncs whenever `map` AND `polyline` both change. Currently the effect depends on `map` (line 209 check) but the reactive tracking may not re-trigger if `polyline` arrives before `map`.
**Fix:** Verify by adding `console.log` to the polyline effect to see if it fires. If timing issue confirmed, restructure the effect to properly track both dependencies.

---

## Task Disposition Summary

| Task | Status | Action |
|------|--------|--------|
| ~~td-75d4a3 Photo thumbnails~~ | **DONE** | object-fit: contain |
| ~~td-96f8b8 Species in detail~~ | **DONE** | Already working, verified |
| ~~td-b5a684 Sort by date~~ | **DONE** | Date sort in public + admin |
| ~~td-6189db Species in lightbox~~ | **DONE** | Added to Lightbox.svelte |
| ~~td-58011e Bulk reverse-geocode~~ | **DONE** | 858 photos geocoded, 2026-03-10 |
| ~~td-73c604 Shared album photos~~ | **DONE** | Workaround: copy to local album |
| ~~td-7c2fdc Ancestry lineage names~~ | **DONE** | displayLineagePath() with real names (2026-03-13) |
| ~~td-8118e1 Names in body~~ | **DONE** | Same fix as 7c2fdc (2026-03-13) |
| ~~td-bf5450 Map filter birds/surf~~ | **DONE** | Already working, verified |
| ~~td-0b7c22 Collapsible species list~~ | **DONE** | Collapsible panel with expand bar (2026-03-13) |
| td-e259fc Map marker photo preview | Open | Show photo thumbnail on marker click for birds/surfing |
| td-59853b Map location search | Open | Add Places Autocomplete to Map.svelte |
| td-8a9992 / td-a7415a Ancestry search | Open | Add search to AncestryPanel (dupes) |
| td-286da1 Batch delete UI | Open | Multi-select + bulk delete |
| td-63cf89 Delete duplicates | Open | Moved to P4 by user |
| td-77ddd9 Perceptual hash dedup | Open | Future |
| td-c71ffe Gemini 2.0 Flash | Open | Replace GPT-4.1-mini for bird ID |
| td-3b705b AI location recognition | Open | Gemini vision for photos without GPS |
| td-617191 Family tree display | Open | Family tree visualization |
| td-fa3441 Itinerary polyline | Open | Debug timing issue |
| td-0a826d / (task #13) Video support | Open | Video uploads + playback |
| td-918913 Ancestry place geo-tagger | Open | Map UI to assign lat/lng to unresolved ancestry places (P1) |
| td-0a402a Family locations | Open | Data cleanup script |
| td-034625 AI ancestry geocoding | Open | AI/API estimates for unresolved ancestry places (P1) |
| td-2f97fe Switch geocoding to Google | Open | Replace Nominatim with Google Maps API |

---

## Verification
After each phase:
1. `npm run build` — no errors
2. Test changes in browser (dev server or production)
3. Commit and deploy

Phase 1 verification:
- Admin → Scandinavia → thumbnails show full image, not cropped
- Birds → click photo → species shows in detail panel
- Scandinavia → Family Heritage → column headings show "Gaylon's Father's Line" (not Madonna's)
- Collection pages → photos sorted chronologically

Phase 2 verification:
- Birds/Surfing → "Filter by Map" button works
- Any map → search box appears, typing location pans map
- Ancestry → search for ancestor name → results highlight

Phase 3 verification:
- Admin → select multiple photos → "Delete Selected" → confirmation → photos deleted

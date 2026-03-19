# Batch Implementation: Open Tasks (P1-P3)

## Context
Open td tasks spanning bug fixes, UX improvements, and new features. Organized into phases by dependency and complexity — quick fixes first, then progressively larger changes. Each phase can be committed and deployed independently.

**Last updated:** 2026-03-18

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

## ~~Phase 2C: Search & AI Geocoding~~ DONE (deployed 2026-03-14)

- ~~td-59853b Map location search~~ — `searchable` prop on Map.svelte with Places Autocomplete
- ~~td-8a9992 Ancestry name search~~ — search input in AncestryPanel filters persons + places
- ~~td-034625 AI ancestry geocoding~~ — Anthropic API resolved 112/124 places; family-context script resolved remaining 12
- ~~td-918913 Ancestry place geo-tagger~~ — closed (all places now have coordinates)

---

## Phase 3: Ancestry Events & Bug Fixes (P1)
*Show all event locations per person; fix polyline timing bug.*

### 3a. Show all event places for each person (td-8aa049, td-2c4fef)
**Description:** Currently only birth/death places are shown per person. A person can have multiple events (birth, christening, marriage, death, burial) each at a different location. Example: Anders Gustaf Johannesson has events in Mofalla and Grantsville.
**Files:** `src/lib/components/travel/AncestryPanel.svelte`, possibly `data/scandinavia-2023/ancestry.json` structure
**Approach:** TBD — needs investigation of current ancestry data structure for events vs. places.

### 3b. Itinerary line sometimes missing (td-fa3441)
**File:** `src/lib/components/common/Map.svelte:231-257`
**Investigation:** Only 2 stops exist, both have valid GPS. Polyline requires `length >= 2`. The issue may be a Svelte reactivity timing issue — if the polyline `$effect` runs before `map` is initialized, it silently does nothing and doesn't re-run. Also possible: the polyline renders but is visually obscured by markers.
**Approach:** Add a `$effect` dependency guard: ensure polyline re-syncs whenever `map` AND `polyline` both change. Currently the effect depends on `map` (line 233 check) but the reactive tracking may not re-trigger if `polyline` arrives before `map`.

---

## Phase 4: Batch Operations & Map UX (P2)
*Admin batch operations and map interaction improvements.*

### 4a. Batch delete in admin UI (td-286da1)
**File:** `src/routes/admin/[collection]/+page.svelte`
**Approach:**
- Add a `selectedPhotos` Set state for multi-select
- Add checkbox overlay on each PhotoEditor thumbnail
- "Select All" / "Deselect All" toggle in header
- "Delete Selected (N)" button → confirmation modal → sequential DELETE calls with progress
- Reuse existing `handleDeleted()` callback and `/api/photos` DELETE endpoint

### 4b. Photo preview on map marker click (td-e259fc)
**Description:** Show photo thumbnail when clicking a map marker in birds/surfing collections.

### 4c. Family tree display (td-617191)
**Description:** Add a family tree visualization to the family history section.

*td-63cf89 (delete duplicates) and td-77ddd9 (perceptual hash dedup) — deferred.*

---

## Phase 5: Lower Priority (P3)
*Deferred features and polish.*

### 5a. Admin ancestry real names (td-3573e3)
**Description:** Show "Gaylon's" / "Madonna's" instead of "Wife-Paternal" etc. in the admin ancestry editor.

### 5b. AI location recognition (td-3b705b)
**Description:** Gemini vision for photos without GPS data.

### 5c. Video support (td-0a826d)
**Description:** Video uploads + playback.

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
| ~~td-59853b Map location search~~ | **DONE** | Places Autocomplete on Map.svelte (2026-03-14) |
| ~~td-8a9992 / td-a7415a Ancestry search~~ | **DONE** | Search in AncestryPanel (2026-03-14) |
| ~~td-034625 AI ancestry geocoding~~ | **DONE** | Anthropic API + family-context script (2026-03-14) |
| ~~td-918913 Ancestry place geo-tagger~~ | **DONE** | All places resolved; closed (2026-03-14) |
| ~~td-c71ffe Gemini 2.0 Flash~~ | **DONE** | Closed |
| ~~td-0a402a Family locations~~ | **DONE** | Closed (superseded by AI geocoding) |
| ~~td-2f97fe Switch geocoding to Google~~ | **DONE** | Closed |
| td-8aa049 All event places per person | Open | Show birth/christening/marriage/death/burial locations (P1) |
| td-2c4fef Show all ancestry locations | Open | Multiple event places per person (P2) |
| td-fa3441 Itinerary polyline | Open | Debug timing issue (P1) |
| td-e259fc Map marker photo preview | Open | Photo thumbnail on marker click for birds/surfing (P2) |
| td-286da1 Batch delete UI | Open | Multi-select + bulk delete (P2) |
| td-617191 Family tree display | Open | Family tree visualization (P2) |
| td-63cf89 Delete duplicates | Open | Deferred |
| td-77ddd9 Perceptual hash dedup | Open | Deferred |
| td-3573e3 Admin ancestry real names | Open | Show Gaylon's/Madonna's in admin (P3) |
| td-3b705b AI location recognition | Open | Gemini vision for photos without GPS (P3) |
| td-0a826d Video support | Open | Video uploads + playback (P3) |

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

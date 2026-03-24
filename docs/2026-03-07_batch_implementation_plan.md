# Batch Implementation: Open Tasks (P1-P3)

## Context
Open td tasks spanning bug fixes, UX improvements, and new features. Organized into phases by dependency and complexity — quick fixes first, then progressively larger changes. Each phase can be committed and deployed independently.

**Last updated:** 2026-03-21

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

## ~~Phase 3: Ancestry Events & Bug Fixes~~ DONE (deployed 2026-03-19)

### ~~3a. Show all event places for each person (td-8aa049, td-2c4fef)~~
- Updated `placeSummary()` to iterate all `person.facts[]` for unique places (not just birth/death)
- Updated search filter to match all fact places
- **Files:** `src/lib/components/travel/AncestryPanel.svelte`

### ~~3b. Itinerary line sometimes missing (td-fa3441)~~
- **Root cause:** Svelte 5 `$effect` only tracks deps read during execution; early return before reading `polyline` meant the effect never re-ran when polyline data arrived
- **Fix:** Read both `map` and `polyline` upfront before early return, ensuring both are tracked
- **File:** `src/lib/components/common/Map.svelte`

### 3c. Google Geocoding & Place Geo-Tagger (added during Phase 3)
- Rewrote `scripts/ai-geocode-ancestry.js` to use Google Geocoding API instead of Anthropic
- Added `GOOGLE_GEOCODING_KEY` (server-side, no referrer restriction) to `.env`
- Updated `src/lib/server/ancestry.js` `geocodePlaces()` to use Google for GEDCOM imports
- Built admin ancestry place geo-tagger UI at `/admin/[collection]/ancestry/geotag`
- Added `PATCH /api/ancestry` endpoint + `updatePlace()` server function
- Re-geocoded all 124 AI/family-estimate places; researched and resolved all 15 failed places
- **Final: 356 places — 195 ok, 161 approximate, 0 failed**

---

## ~~Phase 4: Batch Operations & Map UX~~ DONE (deployed 2026-03-20, 2026-03-21)

### ~~4a. Batch delete in admin UI (td-286da1)~~ DONE
- Select mode with checkboxes, Select All / Deselect All, confirmation modal, sequential DELETE with progress
- **File:** `src/routes/admin/[collection]/+page.svelte`

### ~~4b. Photo preview on map marker click (td-e259fc)~~ DONE
- Wildlife: InfoWindow with thumbnail, species, location, date linked to detail page
- Action/Surf: InfoWindow with spot name, first photo thumbnail, photo count + scrolls to section
- **Files:** `SightingMap.svelte`, `SpotGallery.svelte`

### ~~4c. Global ancestor name search with map zoom (td-2d7177)~~ DONE
- "In View" / "All" toggle on ancestry search bar; zoom-to-person ⊕ buttons on each ancestor name
- Map pans to birth location (priority: birth > death > first event with coordinates)
- Auto-enables "Show Family Heritage" map overlay on zoom
- **Files:** `AncestryPanel.svelte`, `Map.svelte`, `ItineraryMap.svelte`, `[collection]/+page.svelte`

### 4d. Family tree display (td-617191)
**Description:** Add a family tree visualization to the family history section.

*td-63cf89 (delete duplicates) and td-77ddd9 (perceptual hash dedup) — deferred.*

---

## ~~Phase 5: Photo Detail UX~~ DONE (deployed 2026-03-21)
*Improvements to the photo detail/lightbox browsing experience.*

### ~~5a. Photo counter in detail view (td-36e3e0)~~ DONE
- "X of N" pill badge in both Lightbox (gallery overlay) and PhotoDetail (`/photo/[id]` page)
- **Files:** `Lightbox.svelte`, `PhotoDetail.svelte`

### ~~5b. Swipe through photos in detail view (td-d6b1c7)~~ DONE
- Arrow keys, touch swipe (60px threshold), trackpad horizontal swipe (debounced deltaX, 80px threshold)
- Works in both Lightbox and PhotoDetail
- **Files:** `Lightbox.svelte`, `PhotoDetail.svelte`

### ~~5c. Photo detail: jump to location on map (td-cd6075)~~ DONE
- "Show on Map →" link for GPS-tagged photos in both Lightbox and PhotoDetail
- Navigates to collection page with `?mapLat=&mapLng=` query params; map pans/zooms to location
- **Files:** `Lightbox.svelte`, `PhotoDetail.svelte`, `Gallery.svelte`, `[collection]/+page.svelte`, `photo/[id]/+page.server.js`, `photo/[id]/+page.svelte`

---

## Phase 6: Ancestry Polish (P3)
*Visual refinements to the ancestry/family heritage display.*

### 6a. Ancestry: tag names gaylon/madonna in By Generation tab (td-20ed38)
**Description:** Color-code ancestor names in the By Generation tab to indicate whose side of the family they belong to (gaylon vs madonna), same as the color-coded tagging that appears when clicking a location diamond on the map.

### 6b. Admin ancestry real names (td-3573e3)
**Description:** Show "Gaylon's" / "Madonna's" instead of "Wife-Paternal" etc. in the admin ancestry editor.

---

## Phase 7: Advanced Features (P3)
*Larger features requiring more design/infrastructure work.*

### 7a. AI location recognition (td-3b705b)
**Description:** Gemini vision for photos without GPS data.

### 7b. Video support (td-0a826d)
**Description:** Video uploads + playback.

### 7c. User help in hamburger menu (td-41b18a)
**Description:** Add a help/info section accessible from the hamburger navigation menu.

---

## Phase 8: GEDCOM Re-Import Merge (P1)
*Smart re-import from FamilyTree 11 with diff preview and app-side override protection.*
*Design doc: `docs/2026-03-21_gedcom-reimport-merge-design.md`*

### 8a. Override tracking (td-8dfca1, Phase A)
- Add `appOverrides` object to person records for tracking manual edits
- Person edit UI in admin ancestry page (name, dates, places, facts)
- Extend PATCH endpoint for person-level field edits
- Visual indicators (pencil icon) on overridden fields

### 8b. Diff engine (td-8dfca1, Phase B)
- `diffAncestry()` function: match by fsId → xref → name+year
- Produce structured diff with field-level old/new values
- Auto-reject changes to override-protected fields
- Detect added/removed persons

### 8c. Preview UI (td-8dfca1, Phase C)
- "Re-Import" tab in admin ancestry page
- Upload GEDCOM → diff summary (changed/added/removed/protected counts)
- Expandable per-person field-level diff with accept/reject toggles
- Bulk actions: "Accept All Unprotected" / "Reject All"

### 8d. Apply merge (td-8dfca1, Phase D)
- Apply accepted changes, preserve GPS/geocode data and app overrides
- Recompute generation/lineage from updated tree structure
- Rebuild places array, update mergeHistory
- Confirmation modal with summary before applying

---

## Phase 9: Smoke Test & QA (P3)

### 9a. Add new collection end-to-end test (td-86a93f)
**Description:** Try adding a new collection (e.g., "floating cottage"). Should create a new JSON file and have all admin and display elements matching the surfing/action collection type.

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
| td-8aa049 All event places per person | **REVIEW** | All person.facts[] places shown in panel + search (2026-03-19) |
| td-2c4fef Show all ancestry locations | **REVIEW** | Same fix as td-8aa049 (2026-03-19) |
| td-fa3441 Itinerary polyline | **REVIEW** | Fixed $effect dep tracking — read both map+polyline upfront (2026-03-19) |
| ~~td-286da1 Batch delete UI~~ | **DONE** | Select mode, checkboxes, confirm modal, sequential delete (2026-03-20) |
| ~~td-2d7177 Global ancestor name search~~ | **DONE** | In View/All toggle, zoom-to-person buttons, map pans (2026-03-20) |
| ~~td-e259fc Map marker photo preview~~ | **DONE** | InfoWindow with thumbnail on marker click for birds/surfing (2026-03-21) |
| td-617191 Family tree display | Open | Family tree visualization (P2) |
| td-63cf89 Delete duplicates | Open | Deferred |
| td-77ddd9 Perceptual hash dedup | Open | Deferred |
| ~~td-36e3e0 Photo counter in detail~~ | **DONE** | "X of N" pill in Lightbox + PhotoDetail (2026-03-21) |
| ~~td-d6b1c7 Swipe through photos~~ | **DONE** | Arrow keys, touch swipe, trackpad swipe in both views (2026-03-21) |
| ~~td-cd6075 Photo detail jump to map~~ | **DONE** | "Show on Map" link with ?mapLat/mapLng params (2026-03-21) |
| td-8dfca1 GEDCOM re-import merge | Open | Smart diff/preview/apply with override protection (P1) |
| td-86a93f New collection smoke test | Open | Add new collection end-to-end (P3) |
| td-20ed38 Ancestry gaylon/madonna tags | Open | Color-code names in By Generation tab (P3) |
| td-3573e3 Admin ancestry real names | Open | Show Gaylon's/Madonna's in admin (P3) |
| td-3b705b AI location recognition | Open | Gemini vision for photos without GPS (P3) |
| td-0a826d Video support | Open | Video uploads + playback (P3) |
| td-41b18a User help in menu | Open | Help section in hamburger nav (P3) |

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
- Scandinavia → Show Family Heritage → diamonds appear for all event types, not just birth/death
- Scandinavia → search "Mofalla" → ancestors with events there appear in list
- Any travel collection → polyline renders on first load (no refresh needed)
- Admin → Ancestry → 0 failed geocodes, "Geo-Tag Places" button hidden
- Admin → Ancestry → Geo-Tag → "All places have been resolved!"

Phase 4 verification:
- Admin → select multiple photos → "Delete Selected" → confirmation → photos deleted
- Scandinavia → Family Heritage → search toggle "All" → type name → ⊕ button zooms map to person
- Map auto-shows ancestry diamonds when zooming to a person
- Birds → click map marker → InfoWindow with thumbnail, species, date
- Surfing → click spot marker → InfoWindow with spot name, photo, count + scroll

Phase 5 verification:
- Gallery → click photo → Lightbox shows "X of N" counter at top center
- Photo detail page → counter pill visible on hover
- Lightbox → arrow keys, touch swipe, trackpad swipe navigate photos
- Photo detail → arrow keys, touch swipe, prev/next overlays navigate photos
- Lightbox (GPS photo) → "Show on Map →" → closes lightbox, navigates to map zoomed to location
- Photo detail (GPS photo) → "Show on Map →" → navigates to collection map zoomed to location

Phase 6 verification:
- By Generation tab → ancestor names color-coded by gaylon/madonna lineage
- Admin ancestry editor → shows "Gaylon's" / "Madonna's" instead of "Wife-Paternal"

Phase 8 verification:
- Admin → Ancestry → edit a person's name → appOverrides recorded
- Admin → Ancestry → Re-Import tab → upload new GEDCOM → diff preview shown
- Changed persons → expand → field-level diff with accept/reject toggles
- Override-protected fields auto-rejected with lock icon
- Apply → changes saved, GPS preserved, overrides survive

Phase 9 verification:
- Admin → Collections → create new "floating cottage" collection (type: action)
- New JSON file created, admin page functional, public page renders with map + spot gallery

# Batch Implementation: Open Tasks (P1-P3)

## Context
14 open td tasks spanning bug fixes, UX improvements, and new features. Organized into 4 phases by dependency and complexity — quick fixes first, then progressively larger changes. Each phase can be committed and deployed independently.

---

## Phase 1: Quick Fixes (P1 bugs + easy wins)
*~30 min. All are small, isolated changes.*

### 1a. Admin photo thumbnails show cropped slice (td-75d4a3)
**File:** `src/lib/components/admin/PhotoEditor.svelte:243-248`
**Fix:** Change `object-fit: cover` to `object-fit: contain` and set `background: #f5f5f5` so the full photo is visible in the admin preview. May also need to adjust the fixed `height: 100px` to `max-height: 120px` with `width: auto` for better fit.

### 1b. Bird species not showing in photo detail (td-96f8b8)
**File:** `src/lib/components/common/PhotoDetail.svelte:36`
**Investigation:** The species display code exists at line 36 (`if (photo.species) items.push(...)`). This may be a data issue — species not persisted to photos.json, or the route not loading the field. Check `data/birds/photos.json` for species fields, and verify `src/routes/[collection]/photo/[id]/+page.server.js` passes the full photo object. Also show `scientificName` in italics if present.

### 1c. Fix ancestry husband/wife swap (td-7c2fdc, td-8118e1)
**File:** `data/scandinavia-2023/ancestry.json`
**Root cause:** The GEDCOM import order was reversed — Madonna was imported as primary (index 0), Gaylon's tree merged with `lineagePrefix: "wife"`. The `rootPersonNames` array is `["Madonna Lynn Vorwaller", "Gaylon Blaine Vorwaller"]` and all of Gaylon's ancestors have `wife-paternal`/`wife-maternal` lineage.
**Fix:** Write a one-time script to:
1. Swap `rootPersonNames[0]` and `rootPersonNames[1]`
2. Swap `rootPersonIds[0]` and `rootPersonIds[1]`
3. For each person: swap lineage prefixes (`paternal` ↔ `wife-paternal`, `maternal` ↔ `wife-maternal`, `self` ↔ `wife-self`, `both` ↔ `wife-both`)
4. Update `mergeHistory[0].lineagePrefix` from `"wife"` to indicate it was the original primary

### 1d. Sort photos by date (td-b5a684)
**File:** `src/routes/[collection]/+page.svelte:57-71`
**Fix:** In the `displayPhotos` derived, sort by `photo.date` (ISO string, sorts lexicographically). Photos without dates go to the end. Apply to both the public collection page and admin page (`src/routes/admin/[collection]/+page.svelte`).
```js
// After filtering, before return:
filtered.sort((a, b) => {
  if (!a.date && !b.date) return 0;
  if (!a.date) return 1;
  if (!b.date) return -1;
  return a.date.localeCompare(b.date);
});
```

---

## Phase 2: Map & Search Enhancements (P2 features)
*~1-2 hrs. Adds search to maps and consistency to viewport filtering.*

### 2a. Map viewport filtering for wildlife + action (td-bf5450)
**File:** `src/routes/[collection]/+page.svelte`
**Status:** Already implemented! The `displayPhotos` derived at lines 57-71 applies `mapFilterActive && mapBounds` filtering for ALL collection types. The `handleBoundsChange` callback is wired to all three map components (lines 105, 132, 146). The "Filter by Map" button shows when `hasMapSection && hasGpsPhotos` (line 164) — this works for all types.
**Verify:** Test in browser — navigate to birds and surfing collections, confirm the "Filter by Map" button appears and works. If it does, close this task as already-done.

### 2b. Add search-for-location on map (td-59853b)
**Files:** `src/lib/components/common/Map.svelte`
**Approach:** Add an optional `searchable` prop to Map.svelte. When true, render a search input overlaid on the map, wired to Google Places Autocomplete (already loaded — `libraries=marker,places` at Map.svelte:90). On place select, pan/zoom the map to the result.
**Pattern:** Reuse the exact same Autocomplete pattern from `src/lib/components/admin/ItineraryEditor.svelte:27-65`.
**Changes:**
- Map.svelte: add `searchable = false` prop, conditionally render search input, init Places Autocomplete, pan on place_changed
- `src/routes/[collection]/+page.svelte`: pass `searchable={true}` to ItineraryMap, SightingMap, SpotGallery (or directly to Map if those components forward the prop)

### 2c. Add search for name in family history (td-8a9992)
**File:** `src/lib/components/travel/AncestryPanel.svelte`
**Approach:** Add a search input in the ancestry panel header (below tabs). Filter `visiblePersons` by name match. On selecting a result, expand that person's detail and (if they have place events) pan the map to their location.
**Pattern:** Reuse the filter logic from `src/lib/components/admin/AncestryEditor.svelte:166-185`.

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

| Task | Phase | Action |
|------|-------|--------|
| td-75d4a3 Photo thumbnails | 1a | Fix CSS object-fit |
| td-96f8b8 Species in detail | 1b | Debug data/display issue |
| td-7c2fdc Gaylon as wife | 1c | Swap ancestry data |
| td-8118e1 Names in body | 1c | Same fix as 7c2fdc |
| td-b5a684 Sort by date | 1d | Add sort to displayPhotos |
| td-bf5450 Map filter birds/surf | 2a | Verify already works |
| td-59853b Map location search | 2b | Add Places Autocomplete to Map.svelte |
| td-8a9992 Ancestry name search | 2c | Add search to AncestryPanel |
| td-286da1 Batch delete UI | 3a | Multi-select + bulk delete |
| td-63cf89 Delete duplicates | — | Moved to P4 by user |
| td-73c604 Shared album photos | — | Moved to P4 by user |
| td-77ddd9 Perceptual hash dedup | — | Future (already detailed in td) |
| td-fa3441 Itinerary polyline | 4b | Debug timing issue |
| td-0a402a Family locations | 4a | Data cleanup script |

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

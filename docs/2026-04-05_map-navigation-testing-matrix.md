# Plan: Map Navigation Testing Matrix & Fixes

## Context

The map position/orientation system was reworked on April 4 with two regression fixes, but the devlog notes "map position behavior still has some inconsistencies." The system uses three mechanisms to control map state: `gotoTarget` prop, `sessionStorage` persistence, and URL query params. We need to systematically test every navigation path and fix whatever's broken.

## Testing Approach

Use Claude-in-Chrome to walk through each test case on the live site (gaylon.photos). For each case, observe the map's center/zoom and compare against expected behavior. Log pass/fail, then batch fixes.

---

## Testing Matrix

### Legend
- **Fresh** = no prior sessionStorage for this collection (incognito or cleared)
- **Warm** = sessionStorage has saved map position from prior visit
- **fitBounds** = map auto-zooms to show all markers (correct for fresh entry)
- **Restore** = map returns to previously saved position
- Collection slugs: `scandinavia-2023` (travel), `birds` (wildlife), `surfing` (action)
#GBV also in prod have 'floating cottage';  could copy .json back down from prod

---

### A. Fresh Entry (no saved state);  #GBV always s/b 'fitBounds' for fresh entry

| # | From | To | Action | Expected Map Behavior |
|---|------|----|--------|-----------------------|
| A1 | Home page | Travel collection | Click collection card | fitBounds — all stops + photo markers visible |
| A2 | Home page | Wildlife collection | Click collection card | fitBounds — all sighting markers visible |
| A3 | Home page | Action collection | Click collection card | fitBounds — all spot markers visible |
| A4 | Direct URL | Travel collection | Paste URL in address bar | fitBounds (no `_fromDetail` flag) |
| A5 | Direct URL | Wildlife collection | Paste URL in address bar | fitBounds |

---

### B. Back-Navigation from Photo Detail

| # | From | To | Action | Expected Map Behavior |
|---|------|----|--------|-----------------------|
| B1 | Travel collection | Photo detail → back | Click photo → click "← Collection Name" link | Restore saved position (where user was panning before) |
| B2 | Travel collection | Photo detail → browser back | Click photo → browser back button | Restore saved position |
| B3 | Wildlife collection | Photo detail → back | Click photo → back link | Restore saved position |
| B4 | Action collection | Photo detail → back | Click photo → back link | Restore saved position |
| B5 | Travel collection | Photo detail → swipe through 3 photos → back | Navigate through multiple photos, then back | Restore position from before first photo click |
| B6 | Travel collection | Photo detail → "Show on Map" link | Click "Show on Map →" in sidebar | Pan to photo's GPS coords at zoom 13 |

---

### C. Marker Click → Photo Detail → Back

| # | From | To | Action | Expected Map Behavior |
|---|------|----|--------|-----------------------|
| C1 | Travel map marker | Click marker → info window → photo link → back | Full round-trip | Restore to marker's position (not world view) |
| C2 | Wildlife map marker | Click marker → info window → photo link → back | Full round-trip | Restore to marker's position |
| C3 | Action map marker | Click spot marker → scroll to spot | Marker click (no navigation) | Map stays, gallery scrolls to spot section |

---

### D. Collection-to-Collection Navigation

| # | From | To | Action | Expected Map Behavior |
|---|------|----|--------|-----------------------|
| D1 | Travel (zoomed into Norway) | Home → Wildlife | Navigate away and to different collection | Wildlife gets fitBounds (its own markers) |
| D2 | Wildlife (zoomed in) | Home → Travel | Navigate away and back to travel | Travel gets fitBounds (fresh entry, no `_fromDetail`) |
| D3 | Travel (zoomed in) | Photo → Wildlife photo (if possible) | Cross-collection navigation | Each collection independent state |

---

### E. "Show on Map" Query Params

| # | From | To | Action | Expected Map Behavior |
|---|------|----|--------|-----------------------|
| E1 | Photo detail (travel) | Collection page with `?mapLat=&mapLng=` | Click "Show on Map →" | Pan to exact GPS coords, zoom 13 |
| E2 | Photo detail (wildlife) | Collection page with `?mapLat=&mapLng=` | Click "Show on Map →" | Pan to exact GPS coords, zoom 13 |
| E3 | Direct URL with params | Collection page | Paste URL with `?mapLat=60&mapLng=10` | Pan to coords, zoom 13 |

---

### F. Ancestry Panel Interactions (Travel only)

| # | From | To | Action | Expected Map Behavior |
|---|------|----|--------|-----------------------|
| F1 | Ancestry panel | Map | Click place pin icon in Ancestry Places tab | Pan to place coords, ancestry layer turns on |
| F2 | Ancestry panel | Map | Click "Map" button on a person card | Pan to person's location, zoom 11, ancestry on |
| F3 | Ancestry on map | Toggle checkbox off | Uncheck "Show Family Heritage" | Ancestry markers disappear, map position unchanged |
| F4 | Ancestry on map | Navigate to photo → back | Click photo, come back | Ancestry checkbox state preserved, position restored |

---

### G. Edge Cases

| # | Scenario | Action | Expected Map Behavior |
|---|----------|--------|-----------------------|
| G1 | Browser forward/back multiple levels | Home → travel → photo → back → photo → back → home → travel | fitBounds on final travel entry (no `_fromDetail` after home) |
| G2 | Lightbox open → close (no navigation) | Open lightbox from gallery, close it | Map unchanged (no page navigation occurred) |
| G3 | Page refresh on collection page | F5 / Cmd+R while viewing collection | fitBounds (server render, no `_fromDetail` flag) |
| G4 | Filter by Map active → photo → back | Toggle map filter, click photo, come back | Map position restored, but is filter state preserved? |
| G5 | Species filter active → photo → back | Filter to species, click photo, come back | Map position restored, but is species filter preserved? |

---

## Execution Plan

1. Open gaylon.photos in Chrome
2. Clear sessionStorage for clean baseline
3. Walk through cases A1-A5 (fresh entry)
4. Walk through cases B1-B6 (back-nav)
5. Walk through cases C1-C3 (marker round-trips)
6. Walk through cases D1-D2 (cross-collection)
7. Walk through cases E1-E3 (Show on Map)
8. Walk through cases F1-F4 (ancestry)
9. Walk through cases G1-G5 (edge cases)
10. Compile pass/fail results, then batch-fix failures

## Files Involved

- `src/lib/components/common/Map.svelte` — base map, gotoTarget effect, fitBounds, sessionStorage
- `src/routes/[collection]/+page.svelte` — `_fromDetail` flag, query params, gotoTarget state
- `src/routes/[collection]/photo/[id]/+page.svelte` — sets `_fromDetail` flag
- `src/lib/components/travel/ItineraryMap.svelte` — travel marker clicks, ancestry overlay
- `src/lib/components/wildlife/SightingMap.svelte` — wildlife marker clicks
- `src/lib/components/action/SpotGallery.svelte` — action marker clicks (no navigation)
- `src/lib/components/common/PhotoDetail.svelte` — "Show on Map" link generation
- `src/lib/components/common/Gallery.svelte` — photo links to detail page
- `src/lib/components/common/Lightbox.svelte` — photo links to detail page
- `src/lib/components/travel/AncestryPanel.svelte` — go-to-location callbacks

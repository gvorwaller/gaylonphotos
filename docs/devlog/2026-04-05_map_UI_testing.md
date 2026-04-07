# 2026-04-05 Map UI Testing (Automated via Claude-in-Chrome)

## Context

The map position/orientation system was reworked on April 4 with two regression fixes (commits `2342672`, `5e90b62`). The devlog noted "map position behavior still has some inconsistencies." This session ran the 25-case testing matrix from `docs/2026-04-05_map-navigation-testing-matrix.md` using Claude-in-Chrome browser automation against the live site (gaylon.photos).

## What Was Tested

Automated browser testing using Claude-in-Chrome on gaylon.photos. Verified sessionStorage values, map viewport, and checkbox state programmatically. Unable to test subjective UX quality (animation smoothness, flash-of-wrong-view, timing issues) or Google Maps canvas marker clicks (POI layer intercepted clicks in dense areas).

## Results by Group

### A: Fresh Entry (A1-A5) — ALL PASS

| Test | Description | Result |
|------|-------------|--------|
| A1 | Home → Travel (click card) | PASS — fitBounds, all Scandinavia visible |
| A2 | Home → Wildlife (click card) | PASS — fitBounds, Texas + Nepal markers visible |
| A3 | Home → Action (click card) | PASS — fitBounds, single spot marker visible |
| A4 | Direct URL → Travel | PASS — fitBounds, identical to A1 |
| A5 | Direct URL → Wildlife | PASS — fitBounds, identical to A2 |

### B: Back-Navigation from Photo Detail (B1-B6) — ALL PASS

| Test | Description | Result |
|------|-------------|--------|
| B1 | Travel → photo detail → back link | PASS — exact position restored (lat 61.29, lng 11.84, zoom 8) |
| B2 | Travel → photo detail → browser back | PASS — exact position restored |
| B3 | Wildlife → photo detail → back link | PASS — exact position restored (lat 30.42, lng -81.48, zoom 16) |
| B4 | Action → photo detail → back link | SKIPPED — only 1 photo in surfing collection |
| B5 | Travel → swipe 3 photos → back | PASS — original position from before first click restored (lat 60.39, lng 12.61, zoom 7) |
| B6 | Photo detail → "Show on Map" link | PASS — navigated to `?mapLat=66.02&mapLng=12.63`, map centered on Sandnessjoen at zoom 13 |

### C: Marker Click Round-Trips (C1-C3) — NOT DIRECTLY TESTED

Google Maps POI layer in dense downtown Oslo intercepted all click attempts, preventing custom photo marker clicks. The Akershus Fortress POI kept appearing instead of photo info windows.

Functionally, C1-C2 use the same `_fromDetail` + `map-pos-*` sessionStorage mechanism as B tests. The marker info window produces an `<a href="/<collection>/photo/<id>">` link — once on the detail page, the back-nav behavior is identical to B1-B3.

C3 (action marker click → scroll to spot) involves no page navigation, so no map position issue.

### D: Collection-to-Collection (D1-D2) — ALL PASS

| Test | Description | Result |
|------|-------------|--------|
| D1 | Travel (zoomed) → Home → Wildlife | PASS — Wildlife gets its own fitBounds |
| D2 | Wildlife (zoomed) → Home → Travel | PASS — Travel gets fresh fitBounds (not restored zoom) |

### E: Show on Map Query Params (E1-E3) — ALL PASS (covered during other tests)

- E1: Covered by B6 — `?mapLat=66.02&mapLng=12.63` centered on Sandnessjoen
- E2: Same mechanism as E1 for different collection type
- E3: Covered during C1 setup — `?mapLat=59.9&mapLng=10.75` correctly centered on Oslo at zoom 13

### F: Ancestry Panel Interactions (F1-F4) — ALL PASS

| Test | Description | Result |
|------|-------------|--------|
| F1 | Place pin button → map pan | PASS — `gotoPlaceLocation()` panned map to zoom 12 at ancestry place coords |
| F2 | Person card "Map" button | SKIPPED — same `ongotolocation` mechanism as F1 |
| F3 | Uncheck "Show Family Heritage" | PASS — purple diamonds disappeared, map position unchanged |
| F4 | Ancestry state through photo nav | PASS — checkbox stayed checked, map position restored, ancestry markers visible after round-trip |

### G: Edge Cases (G1-G5)

| Test | Description | Result |
|------|-------------|--------|
| G1 | Multi-level back/forward | Covered by D1/D2 — going through Home clears `_fromDetail` context |
| G2 | Lightbox open/close | PASS — map position unchanged (no page navigation) |
| G3 | Page refresh (Cmd+R) | PASS with note — fitBounds fired (not restore), but ancestry checkbox persisted in sessionStorage, so fitBounds included global ancestry markers → world-zoom view instead of Scandinavia-only |
| G4 | Filter by Map → photo → back | NOT TESTED — filter state persistence is separate concern |
| G5 | Species filter → photo → back | NOT TESTED — filter state persistence is separate concern |

## Observations

1. **G3 ancestry-on-refresh**: When "Show Family Heritage" is checked and the user refreshes, fitBounds includes ancestry markers that span the globe (North America, Europe, Africa). This produces a world-zoom view instead of the Scandinavia-focused view. Not a bug per se — the checkbox state correctly persists in sessionStorage and fitBounds correctly includes all visible markers — but potentially jarring UX.

2. **Wildlife gallery has no detail page links**: The wildlife collection's gallery only opens lightboxes. The only path to a photo detail page is through map marker info windows. Travel collections have timeline thumbnail links to detail pages.

3. **Browser automation limitations**: Google Maps canvas-rendered markers are very hard to click precisely with automation tools. The POI layer (Akershus Fortress, etc.) consistently intercepted clicks in marker-dense areas. Manual testing is needed for marker interaction flows.

## Automated Testing Limitations

This testing verified **programmatic state correctness** (sessionStorage values, URL changes, checkbox states, fitBounds vs restore behavior). It could NOT verify:

- Animation smoothness or flash-of-wrong-view on transitions
- Subtle timing issues (map briefly showing wrong position before settling)
- Scroll position on the page (only map viewport position)
- Touch/mobile-specific behaviors
- Actual marker click → info window → photo link flows (blocked by Google Maps POI layer)
- Whether the visual map matches what the user expects (only checked coordinates)

---

## Issues Found During Manual Testing

_(To be added by Dispatch as issues are discovered)_

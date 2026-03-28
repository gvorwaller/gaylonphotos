# td-617191: Family Tree Visualization (V2)

## Summary

Add a 4th public tab, `Family Tree`, to [`AncestryPanel.svelte`](/Users/gaylonvorwaller/gaylonphotos/src/lib/components/travel/AncestryPanel.svelte). Implement it as a compact SVG **collapsed pedigree view** for one root at a time.

This is not an exact genealogy graph. The stored ancestry data does not preserve parent-child ID references — tree structure must be reconstructed from `lineagePath` strings. For pedigree-collapse cases, the data preserves only the first-discovered path (BFS order during GEDCOM import), so the UI must represent shared ancestors once at their first-path position and style them as shared.

### Changes from V1

- Fixed redundant checks in `branchKeyFromLineagePath`
- Added tab bar responsive overflow handling for 4 tabs on mobile
- Increased tree content area height and made it an independent scroll container
- Renamed `ongoto` prop to `ongotolocation` to match existing codebase convention
- Added generation label display next to the slider
- Added SVG accessibility (`role`, `aria-label`)
- Added auto-scroll to detail card on node selection
- Added explicit layout direction documentation (left-to-right)
- Added validation warning for unexpected lineagePath tokens
- Clarified pedigree-collapse as future-proofing (zero current instances in data)
- Added zoom/pan as a v1.1 boundary item

## Decisions

### What this feature is
- A pedigree-style browser for the currently selected ancestry root
- A public read-only visualization inside the existing Family Heritage panel
- A compact occupied-branch layout, not a full binary-tree matrix
- Left-to-right layout: Gen 0 (root) on the LEFT, older generations to the RIGHT

### What this feature is not
- Not a new route or page
- Not a server/data-model change in v1
- Not an exact family graph reconstruction
- Not a tree rebuilt from only viewport-visible persons

### Existing data constraints
- `ancestry.json` stores flattened `persons[]` and denormalized `places[]`
- persons have `generation`, `lineage`, and `lineagePath` — but NO parent ID references
- tree structure must be reconstructed entirely from `lineagePath` string parsing
- merged roots are represented by `wife-*` lineage values (note: "wife" is the import prefix, not necessarily the person's gender — in the current dataset, the "wife-*" root is actually the husband Gaylon, because Madonna's tree was imported first)
- pedigree-collapse: when an ancestor is reached via two lineage paths during GEDCOM import, `lineage` is set to `'both'` (or `wife-both`) but `lineagePath` retains only the first-discovered path. **Current dataset has zero instances** of `both`/`wife-both`, but the code handles it defensively for future data.
- Valid lineage values: `self`, `paternal`, `maternal`, `both`, `wife-self`, `wife-paternal`, `wife-maternal`, `wife-both`
- Person ID formats: `@NNNNNNN@` (primary GEDCOM import), `wife_NNNNNNN` (merged import)
- Generation range: 0 (self) through 8 in current data (351 total persons)

### Current dataset shape (for reference during implementation)
| Generation | Count | Label |
|---|---|---|
| 0 | 2 | Self |
| 1 | 4 | Parents |
| 2 | 8 | Grandparents |
| 3 | 16 | Great-Grandparents |
| 4 | 32 | 2nd Great-Grandparents |
| 5 | 56 | 3rd Great-Grandparents |
| 6 | 83 | 4th Great-Grandparents |
| 7 | 109 | 5th Great-Grandparents |
| 8 | 41 | 6th Great-Grandparents |

At maxGen=5, ~117 nodes rendered. At maxGen=8, all 351.

## Files

| File | Action |
|------|--------|
| `src/lib/components/travel/PedigreeTree.svelte` | Create |
| `src/lib/components/travel/AncestryPanel.svelte` | Modify |

## Acceptance Criteria

- A new `Family Tree` tab appears beside `By Generation`
- Tab bar remains usable on mobile (no overflow clipping)
- Primary tree renders by default
- If spouse lines exist, a primary/spouse root toggle appears
- Tree shows one root at a time
- Tree layout flows left-to-right (root on left, ancestors to the right)
- Tree remains structurally complete even when the map viewport excludes many ancestors
- Off-map ancestors are visible but muted
- Search highlights matches without removing non-matching context
- Shared ancestors render once with shared-line styling (future-proofing — no current data triggers this)
- Node selection shows the existing detail card below the tree, auto-scrolled into view
- `Show on Map` still works from the detail card
- Generation slider shows the generation label (e.g., "5 — 3rd Great-Grandparents")
- SVG has proper accessibility attributes
- `npm run check` and `npm run build` pass

## Build Order

### 1. Add root-specific tree derivations in `AncestryPanel.svelte`

Implement derived values for:
- `primaryTreePersons`
- `wifeTreePersons`
- `treePersons`
- `treeVisibleIds`
- `treeActualMaxGen`

Rules:
- `primaryTreePersons` = persons whose lineage does not start with `wife-` (captures: `self`, `paternal`, `maternal`, `both`)
- `wifeTreePersons` = persons whose lineage starts with `wife-` (captures: `wife-self`, `wife-paternal`, `wife-maternal`, `wife-both`)
- `treePersons` is chosen by `treeRoot`
- `treeVisibleIds` is the intersection of `treePersons` IDs and existing `visiblePersonIds`
- `treeActualMaxGen` is the max generation inside the selected root tree

Add state:

```js
let treeRoot = $state('primary');
let treeMaxGen = $state(5);
```

Clamp `treeMaxGen` when switching roots so it never exceeds `treeActualMaxGen`.

Desktop default: `5`
Tablet/phone default: `4`

Add a derived label for the current max generation:

```js
let treeMaxGenLabel = $derived(generationLabel(treeMaxGen));
```

Reuses the existing `generationLabel()` helper (lines 141–149).

### 2. Add the new tab UI in `AncestryPanel.svelte`

#### Tab bar changes

Add a 4th tab button: `Family Tree`.

Make the tab bar horizontally scrollable on small screens to prevent overflow:

```css
.ancestry-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--color-border);
  padding: 0 20px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none; /* Firefox */
}
.ancestry-tabs::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}
```

Optionally shorten tab labels on mobile via a media query:

```css
@media (max-width: 480px) {
  .ancestry-tab {
    padding: 10px 10px;
    font-size: 0.75rem;
  }
}
```

#### Tree tab content

Add:
- root toggle when `hasWifeLines` is true (use existing segmented-control pattern)
- generation slider with label display: `"Depth: {treeMaxGen} — {treeMaxGenLabel}"`
- compact explanatory note
- `PedigreeTree` component render inside its own scroll container (see Section 9)
- selected-person detail card below the tree, with auto-scroll-into-view

Tree tab behavior:
- structure comes from `treePersons`, not `visiblePersons`
- viewport state only affects node emphasis, not whether nodes exist
- search highlights matching nodes by existing search criteria
- when `searchGlobal && ancestorSearch`, viewport muting is suppressed (consistent with other tabs)

Required explanatory text:
- make it clear this is the pedigree view for the selected root
- make it clear off-map ancestors remain visible but muted

#### Detail card placement

Render the `personDetails` snippet below the tree SVG container (not inline within SVG). When a node is selected:
1. Set `expandedPersonId` to the selected person's ID
2. After the detail card renders, scroll it into view using `element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })`

This reuses the existing `personDetails` snippet and `togglePerson()` function.

### 3. Create `PedigreeTree.svelte`

Props:

```js
/** @type {Array} */ persons
/** @type {number} */ maxGen
/** @type {string|null} */ selectedId
/** @type {string} */ searchQuery
/** @type {boolean} */ searchGlobal
/** @type {Set<string>} */ visibleIds
/** @type {string} */ selectedRoot  // 'primary' or 'spouse'
/** @type {(id: string) => void} */ onselect
/** @type {(loc: {lat: number, lng: number, zoom: number, _ts: number}) => void} */ ongotolocation
```

Notes:
- `ongotolocation` matches the existing callback signature used in `AncestryPanel.svelte` (line 13)
- `ongotolocation` may not be called directly inside the tree in v1 if map jumping stays in the shared detail card, but keeping the prop enables future "Show on Map" buttons on nodes
- All layout computation should be in `$derived.by()` blocks so it only recomputes when inputs change

### 4. Parse raw stored `lineagePath`, not display text

Do not reverse-parse `displayLineagePath()` output. Use raw stored `lineagePath` only.

Actual `lineagePath` patterns in the data (verified):
- Gen 0: `"Self"`, `"Wife"`
- Gen 1: `"Father"`, `"Mother"`, `"Wife's father"`, `"Wife's mother"`
- Gen 2+: `"Father's father"`, `"Father's mother"`, `"Mother's father"`, `"Mother's mother"`, `"Wife's father's father"`, etc.

The pattern is a chain of `"Father"/"father"` and `"Mother"/"mother"` tokens joined by `"'s "`. The first token is capitalized; subsequent tokens are lowercase.

Supported root labels:
- primary root: `Self`
- merged root: `Wife`

Convert each person to a stable structural key:
- root: `root`
- father: `root.f`
- mother: `root.m`
- father's mother: `root.f.m`

Reference helper:

```js
function branchKeyFromLineagePath(path, rootLabel) {
  if (!path || path === rootLabel) return 'root';

  let remainder = path;
  if (path.startsWith(rootLabel + "'s ")) {
    remainder = path.slice((rootLabel + "'s ").length);
  }

  const tokens = remainder
    .split("'s ")
    .map((token) => token.toLowerCase());

  // Validate: only 'father' and 'mother' are expected tokens
  const validTokens = tokens.filter((token) => token === 'father' || token === 'mother');
  if (validTokens.length !== tokens.length) {
    console.warn(`Unexpected lineagePath tokens in "${path}": got [${tokens}], expected only father/mother`);
  }

  if (validTokens.length === 0) return 'root';
  return ['root', ...validTokens.map((t) => t === 'father' ? 'f' : 'm')].join('.');
}
```

Changes from V1:
- Removed redundant `path === 'Self'` and `path === 'Wife'` checks (already handled by `path === rootLabel`)
- Added validation warning for unexpected tokens instead of silent filtering
- Added fallback to `'root'` if no valid tokens remain after filtering

Derived node shape:

```js
{
  id,
  person,
  generation,
  branchKey,
  parentKey,
  side,
  shared,
  inViewport,
  matchesSearch
}
```

Where:
- `parentKey` is the branch key with the last segment removed, or `null` for root
- `side` is `'root'`, `'father'`, or `'mother'` (last segment of branchKey)
- `shared` is true for `both` / `wife-both` lineage (future-proofing — zero current instances)
- `inViewport` comes from `visibleIds`
- `matchesSearch` — true if `searchQuery` matches person name or any fact place (same logic as existing `visiblePersons` filter)

### 5. Use a compact occupied-branch layout

Do not allocate `2^maxGen` vertical slots.

Layout direction: **left-to-right**. Gen 0 (root) is positioned at the left edge. Each subsequent generation is one column to the right. This matches standard pedigree chart convention.

Layout algorithm:
1. Keep only nodes where `generation <= maxGen`
2. Sort by `generation`, then `branchKey`
3. Assign compact row positions to deepest visible nodes (rightmost column first)
4. Position parent nodes at the midpoint of existing child rows
5. If only one child exists, align the parent to that child
6. Compute total SVG width from `(maxGen + 1) * (nodeWidth + genGap)` and height from `leafCount * (nodeHeight + rowGap)`

Wrap the entire layout computation in `$derived.by()` keyed on `persons`, `maxGen`, `visibleIds`, `searchQuery`, and `searchGlobal`.

Suggested constants:

```js
const NODE_HEIGHT = 52;
const GEN_GAP = 36;
const ROW_GAP = 10;
const OUTER_PAD = 12;
```

Responsive node width — detect via CSS media query and pass as prop, or use a reactive width:

| Breakpoint | Node width |
|---|---|
| >= 768px (desktop) | `160` |
| 481–767px (tablet) | `140` |
| <= 480px (phone) | `120` |

Detect via `window.matchMedia` in an `$effect` or use a container query. Do NOT hardcode breakpoint detection in the layout algorithm — keep it as a single `nodeWidth` prop/state.

### 6. Render shared ancestors as shared, not duplicated

**Note:** The current dataset has zero `both`/`wife-both` persons. This section is defensive for future data.

If `lineage` is `both` or `wife-both`:
- render the person once at their first-discovered branchKey position
- add shared styling (e.g., dashed border or distinct background)
- tooltip: `"Appears in both paternal and maternal lines"`

Do not attempt multiple rendered positions in v1.

Since `lineagePath` preserves only the first BFS-discovered path, the branchKey places the person at one position. This is a data-layer limitation. The Future Upgrade Boundary section describes how to support multi-position rendering if needed later.

### 7. Keep missing-person rendering minimal

Do not render a complete matrix of unknown ancestors.

Two acceptable options:
- v1 simplest: no unknown placeholders
- v1.1: only render immediate dashed parent stubs adjacent to known persons

Do not recurse unknown placeholders across all remaining generations.

### 8. Render and interaction requirements

Each node should include:
- rounded rect with lineage-colored left border (`var(--color-line-{lineage})` via `safeLineageColor()`)
- full name (truncated with ellipsis if exceeding node width)
- compact lifespan (reuse existing `lifespan()` helper)
- selected state (highlighted border or background)
- search-match state (e.g., bold outline or glow)
- viewport-muted state (reduced opacity for off-map persons)
- shared-ancestor state (dashed border — future-proofing)

Connector pattern (left-to-right):

```text
M parentRightX,parentCenterY
H midX
V childCenterY
H childLeftX
```

Where `midX` is the horizontal midpoint between parent right edge and child left edge.

SVG accessibility:
- Root `<svg>` element: `role="img"` with `aria-label="Pedigree chart for {rootPersonName}"`
- Each node group: `role="button"`, `tabindex="0"`, `aria-label="{name}, {lifespan}, {lineagePath}"`
- Each node group: `<title>` element with full name + lineage path (for native tooltip)

Interaction requirements:
- click selects person (fires `onselect(id)`)
- node is keyboard focusable (`tabindex="0"`)
- Enter/Space also selects person
- Selected node scrolls the detail card into view below the tree

Do not rely on hover-only interactions.

### 9. Styling requirements

Use existing tokens and ancestry colors:
- `var(--color-border-light)` — `#f0f0f0`
- `var(--color-surface)` — `#fff`
- `var(--color-bg)` — `#f8f9fa`
- `var(--color-primary)` — `#28a745`
- `var(--color-border)` — `#e9ecef`
- `var(--radius-sm)` — `6px`
- `var(--radius-md)` — `8px`
- existing `--color-line-*` variables (8 lineage colors defined in `global.css` lines 69–78)

Do not introduce hardcoded theme colors unless there is no existing token.

#### Tree scroll container

The tree needs its own scroll container separate from `.ancestry-content`, because the tree SVG can be much larger than the generic 500px max-height.

```css
.pedigree-wrapper {
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  max-height: min(70vh, 700px);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
}
```

The `.ancestry-content` area for the tree tab should NOT apply `max-height: 500px`. Either:
- Add a `.ancestry-content.tree-active` override that removes the max-height, OR
- Render the tree tab content outside `.ancestry-content` and handle its own layout

#### Panel-specific CSS
- Mark `.ancestry-content` with a `tree-active` class when the tree tab is open
- Stack controls (root toggle, generation slider) vertically on screens < 640px
- Generation slider label uses `font-size: 0.8rem; color: var(--color-text-muted)`

#### Root toggle
Use the existing segmented-control styling pattern (same as `.search-scope-toggle` / `.scope-btn` classes).

## Explicit Behavior Rules

### Viewport behavior
- Tree structure is never filtered down to only visible persons
- Persons outside the current map viewport remain in the tree
- Off-map persons are visually muted (opacity ~0.4)
- When `searchGlobal` is active with a search query, viewport muting is suppressed (consistent with other tabs where global search overrides viewport filtering)

### Search behavior
- Search uses the existing `ancestorSearch` query and `searchGlobal` toggle
- Match by person name or fact place (same logic as `visiblePersons` derivation, lines 47–53)
- Matching nodes are highlighted (e.g., bold border, slight background tint)
- Non-matching nodes remain visible for structural context
- If all matches are beyond current depth slider, show a compact hint: `"N matches in deeper generations — increase depth to see them"`
- Do NOT auto-expand depth — the user controls depth explicitly

### Root toggle behavior
- Show only when `hasWifeLines` is true (detected by checking for any person with `lineage?.startsWith('wife-')`)
- Labels: use `primaryName` and `mergedName` from `ancestry.meta.rootPersonNames` (e.g., "Madonna's Tree" / "Gaylon's Tree"), falling back to "Primary" / "Spouse" if names unavailable
- Primary tree uses non-`wife-*` persons
- Spouse tree uses `wife-*` persons
- Slider max updates per selected root's `treeActualMaxGen`
- `treeMaxGen` is clamped when switching roots

## Verification Checklist

### Static
1. Run `npm run check` — zero warnings
2. Run `npm run build` — successful

### UI
1. Open a public travel collection with ancestry data (scandinavia-2023)
2. Expand `Family Heritage`
3. Verify `Family Tree` tab appears as the 4th tab
4. Verify tab bar doesn't overflow on mobile (test at 375px width)
5. Verify primary tree (Madonna's) renders first
6. Verify root toggle appears and switches between Madonna's and Gaylon's trees
7. Verify generation slider changes visible depth
8. Verify slider label updates (e.g., "5 — 3rd Great-Grandparents")
9. Verify selected person shows the detail card below the tree
10. Verify detail card auto-scrolls into view on node selection
11. Verify `Show on Map` still works from that detail card
12. Verify tree scrolls horizontally and vertically within its container

### Filtering and search
1. Pan the map so only some ancestry events are in bounds
2. Verify tree structure stays intact — all nodes still present
3. Verify off-map nodes are muted rather than removed
4. Switch to "All" search scope — verify muting is suppressed
5. Search by surname — verify matching nodes highlight
6. Search by place name — verify matching nodes highlight
7. Verify non-matching nodes remain visible for context
8. Set depth to 3, search for a name that only exists at gen 6 — verify hidden-match hint appears

### Data-shape edge cases
1. Test the current merged Madonna/Gaylon dataset (351 persons)
2. Test with depth slider at max (8) — verify all 351 nodes render without layout breakage
3. Verify SVG accessibility: tab through nodes with keyboard, verify aria-labels
4. Verify parsing does not depend on UI-rewritten lineage labels (e.g., `displayLineagePath` output like `Madonna's father` is never used for tree construction)
5. Verify the console shows no `lineagePath` warnings for the current dataset

### Performance
1. Set depth to 8 — verify tree renders without visible lag
2. Pan the map rapidly — verify muting updates don't cause jank
3. Search while at max depth — verify highlight updates are responsive

## Future Upgrade Boundary (v1.1+)

### Zoom and pan controls
v1 uses CSS `overflow: auto` scrolling. v1.1 could add:
- Pinch-to-zoom on mobile
- A zoom slider or fit-to-view button
- `CSS transform: scale()` approach is simplest

### Multi-position shared ancestors
If exact genealogy-graph rendering becomes a requirement, the ancestry storage format must change. The minimal future extension would be to persist structural parent ID references (fatherId, motherId) or multiple valid lineage paths per person during GEDCOM import, then build the graph from those structural links instead of reverse-parsing one stored `lineagePath`.

### Unknown-ancestor placeholders
v1.1 could render dashed placeholder stubs for immediate missing parents of known persons, providing a visual cue that the tree has gaps.

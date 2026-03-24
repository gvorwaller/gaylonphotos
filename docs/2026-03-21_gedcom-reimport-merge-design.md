# GEDCOM Re-Import Merge Design

## Problem

FamilySearch is a wiki — anyone can make unverified changes. FamilyTree 11 (desktop) is the trusted source for genealogical data. But the app has accumulated manual fixes: GPS coordinates on places, relationship corrections, lineage path adjustments, and potentially name corrections. A naive GEDCOM re-import destroys all of that.

## Goal

Enable a workflow where:
1. User makes corrections in FamilyTree 11
2. User exports GEDCOM
3. User uploads to gaylon.photos admin
4. App shows a diff: what changed, what's new, what was removed
5. User approves/rejects changes per-field or in bulk
6. App-side fixes (GPS, manual geocodes, relationship overrides) survive untouched

## Current State

### What the app already has
- `fsId` on every person (FamilySearch ID) — **perfect match key**
- `mergeAncestry()` — but designed for merging two *different* roots (husband + wife), not re-importing the *same* tree
- `geocodeStatus` progression: `manual > ok > approximate > ai-estimate > family-estimate > failed`
- `meta.mergeHistory[]` — tracks import events
- Places rebuilt from persons on every save (denormalized)
- GEDCOM parser handles MacFamilyTree 11 format

### What's missing
- No concept of "this field was edited in the app" — no way to protect overrides during re-import
- No diff/preview before applying changes
- No per-field accept/reject UI

---

## Design

### 1. Track App-Side Overrides

Add an `appOverrides` object to person records when a field is manually edited in the app:

```json
{
  "id": "@I123@",
  "fsId": "KWHG-CQM",
  "name": "Madonna Lynn Vorwaller",
  "birthDate": "11/21/1954",
  "birthPlace": "Jacksonville, Duval, Florida, United States",
  "appOverrides": {
    "name": {
      "value": "Madonna Lynn Crosby",
      "reason": "Maiden name correction",
      "editedAt": "2026-03-21T14:30:00Z"
    }
  }
}
```

**Rules:**
- `appOverrides` is empty/absent by default (most persons never edited)
- Only fields explicitly changed by the admin get an override entry
- Each override stores: the corrected value, an optional reason, and a timestamp
- During re-import, any field with an `appOverrides` entry is **protected** — GEDCOM value is shown in the diff but not applied unless the user explicitly accepts it

**Fields that can be overridden:**
- `name` — corrected name
- `birthDate`, `birthPlace` — corrected birth info
- `deathDate`, `deathPlace` — corrected death info
- `gender` — corrected gender
- `facts[]` — added/removed/corrected facts (tracked by type+date key)
- `lineage`, `lineagePath` — relationship corrections

**Fields that are always app-owned (never from GEDCOM):**
- Place GPS coordinates (`lat`, `lng`)
- `geocodeStatus`, `nearStop`, `modernName`
- `generation` (computed from root)
- `lineage`, `lineagePath` (computed from root)

### 2. Match Strategy

When a new GEDCOM is uploaded for re-import:

```
For each person in new GEDCOM:
  1. Match by fsId (primary — stable across exports)
  2. Fallback: match by GEDCOM xref ID (@I123@)
  3. Fallback: match by exact name + birthYear (fuzzy, flagged for review)
  4. No match → NEW person

For each person in existing data:
  If no match in new GEDCOM → REMOVED (flagged, not auto-deleted)
```

**Why fsId is reliable:** FamilyTree 11 stores the FamilySearch ID in the `_FSFTID` custom GEDCOM tag. This is a globally unique, stable identifier. Even if the person's GEDCOM xref changes between exports, the fsId stays the same.

### 3. Diff Engine

The merge produces a structured diff:

```json
{
  "summary": {
    "matched": 340,
    "changed": 12,
    "added": 3,
    "removed": 2,
    "protectedOverrides": 5
  },
  "changes": [
    {
      "personId": "@I123@",
      "fsId": "KWHG-CQM",
      "name": "Madonna Lynn Vorwaller",
      "matchType": "fsId",
      "fields": [
        {
          "field": "birthDate",
          "oldValue": "11/21/1954",
          "newValue": "11/22/1954",
          "hasOverride": false,
          "action": "pending"        // "accept", "reject", "pending"
        },
        {
          "field": "name",
          "oldValue": "Madonna Lynn Crosby",
          "newValue": "Madonna Lynn Smith",
          "hasOverride": true,
          "overrideReason": "Maiden name correction",
          "action": "reject"         // auto-rejected because of override
        }
      ]
    }
  ],
  "added": [
    { "id": "@I999@", "fsId": "NEW-ID", "name": "New Person", "generation": 5 }
  ],
  "removed": [
    { "id": "@I45@", "fsId": "OLD-ID", "name": "Removed Person", "generation": 4 }
  ]
}
```

### 4. Merge Rules

| Category | GEDCOM field | App override exists? | Default action |
|----------|-------------|---------------------|----------------|
| Biographical | name, dates, places, gender | No | Accept from GEDCOM |
| Biographical | name, dates, places, gender | Yes | Reject (keep app value) |
| Facts/Events | new fact in GEDCOM | — | Accept (add) |
| Facts/Events | fact removed from GEDCOM | — | Flag for review |
| Facts/Events | fact changed in GEDCOM | No | Accept |
| Facts/Events | fact changed in GEDCOM | Yes | Reject (keep app value) |
| GPS/Geocode | lat, lng, geocodeStatus | — | Always keep app value |
| Computed | generation, lineage, lineagePath | — | Recompute from new tree structure |
| New person | all fields | — | Accept (add to tree) |
| Removed person | — | — | Flag for review (don't auto-delete) |

### 5. Admin UI: Re-Import Page

**Location:** `/admin/[collection]/ancestry` — new "Re-Import" tab (alongside existing Import/Manage)

**Step 1: Upload**
- Drag-drop or file picker for new .ged file
- Select root person (pre-filled from last import)
- "Preview Changes" button

**Step 2: Diff Review**
- Summary bar: "12 changed, 3 added, 2 removed, 5 protected by your edits"
- Three sections with counts:

  **Changed Persons** (expandable list)
  - Each person shows: name, generation, match type badge
  - Expand to see field-level diff (old → new) with accept/reject toggles
  - Override-protected fields shown with lock icon and reason
  - "Accept All Unprotected" / "Reject All" bulk buttons

  **New Persons** (simple list with accept/reject checkboxes)
  - Name, birth info, generation
  - Default: accepted

  **Removed Persons** (simple list)
  - Name, generation, last known info
  - Options: "Remove" or "Keep" (default: keep)

**Step 3: Apply**
- "Apply N Changes" button with confirmation modal
- Shows summary: "Updating 8 persons, adding 3, removing 1. 5 fields protected by your edits."
- Progress indicator during save

### 6. Person Edit UI (for creating overrides)

**Location:** Existing ancestry admin page → person detail expansion

Add an "Edit" button next to each person's fields. When editing:
- Shows current value (from GEDCOM) and input for corrected value
- Optional "Reason" text field (e.g., "Maiden name per family Bible")
- Save creates/updates the `appOverrides` entry
- Visual indicator (pencil icon or colored background) on overridden fields
- "Revert to GEDCOM value" option to remove an override

### 7. Server API

**New endpoint:** `POST /api/ancestry/preview-reimport`
```
Request: multipart/form-data
  - file: .ged file
  - collection: slug
  - rootPersonId: GEDCOM xref

Response: { diff: DiffResult }
```

**New endpoint:** `POST /api/ancestry/apply-reimport`
```
Request: JSON
  - collection: slug
  - changes: [ { personId, fields: [{ field, action }] } ]
  - added: [ personId ]     // which new persons to include
  - removed: [ personId ]   // which removed persons to delete

Response: { ancestry: updated, summary: { updated, added, removed } }
```

**Modified endpoint:** `PATCH /api/ancestry` (existing)
- Extend to support person field edits (not just place coordinates)
- Creates `appOverrides` entries when saving person-level changes

### 8. Implementation Phases

**Phase A: Override tracking** (foundation)
- Add `appOverrides` to person schema
- Add person edit UI in admin ancestry page
- Extend PATCH endpoint for person edits
- Display override indicators in admin view

**Phase B: Diff engine** (core logic)
- `diffAncestry(existing, newParsed, rootId, maxGen)` function in ancestry.js
- Match by fsId → xref → name+year
- Produce structured diff with field-level changes
- Respect appOverrides in default actions

**Phase C: Preview UI** (admin page)
- New "Re-Import" tab with upload + preview
- Diff review interface with accept/reject toggles
- Summary statistics

**Phase D: Apply merge** (complete)
- Apply accepted changes to ancestry data
- Preserve GPS, geocode data, nearStop
- Recompute generation/lineage from new tree structure
- Rebuild places array
- Update meta.mergeHistory with reimport record

---

## Edge Cases

**Person ID changes between exports:** FamilyTree 11 may renumber GEDCOM xrefs. fsId matching handles this — the FamilySearch ID is stable even if the internal @I123@ numbering changes.

**Pedigree collapse (ancestor via multiple paths):** Already handled — existing `lineage: "both"` logic stays. Re-import preserves this.

**Facts with no dates:** Match by type + place. If ambiguous, flag for review.

**Removed person who appears in place events:** Cascade — remove from places events array. Places rebuild handles this automatically.

**Multiple re-imports:** Each creates a mergeHistory entry. Overrides persist across re-imports unless explicitly reverted.

**Non-travel collections:** Ancestry is travel-only. Validation already enforces this.

## FamilyTree 11 vs FamilySearch Workflow

The recommended workflow after this feature:

```
FamilyTree 11 (desktop, trusted)
    ↓ export .ged
gaylon.photos (re-import with diff preview)
    ↓ app-side: GPS fixes, name corrections, overrides
gaylon.photos (live site for family)
```

FamilySearch becomes read-only reference. Stop fighting the wiki battle. FamilyTree 11 is the source of truth for genealogical data. gaylon.photos is the source of truth for presentation (GPS, photos, corrected names).

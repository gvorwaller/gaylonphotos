# td-1d857c: Auto-populate Bird Species Using Vision AI

## Context
The wildlife collection (`/birds`) has photos with no `species` field populated — they all show as "Unknown" in the SpeciesGrid. This task adds Claude Haiku 4.5 vision to auto-identify bird species from 400px thumbnails (~$0.001/photo). Two integration points: bulk mode during ingest and an admin UI Auto-ID button.

## Files Overview

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | MODIFY | Add `@anthropic-ai/sdk` |
| `.env` / `.env.example` | MODIFY | Add `ANTHROPIC_API_KEY` |
| `src/lib/server/vision.js` | CREATE | Core vision module (SvelteKit context) |
| `scripts/vision-standalone.js` | CREATE | Vision module for scripts (process.env) |
| `src/routes/api/vision/+server.js` | CREATE | POST endpoint for species detection |
| `src/lib/components/admin/PhotoEditor.svelte` | MODIFY | Add Auto-ID button next to species input |
| `src/routes/admin/[collection]/+page.svelte` | MODIFY | Add bulk "Auto-ID N photos" button |
| `scripts/ingest-photos.js` | MODIFY | Add `--species` flag for bulk import |

---

## 1. Install SDK & Environment

```bash
npm install @anthropic-ai/sdk
```

Add to `.env.example`:
```
# Anthropic (bird species auto-ID)
ANTHROPIC_API_KEY=sk-ant-...
```

Add actual key to `.env`.

---

## 2. Core Vision Module — `src/lib/server/vision.js`

Two exported functions sharing an internal `_identify()` helper:

```js
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const PROMPT = `You are an expert ornithologist. Identify the bird species in this photo.

Respond with ONLY a JSON object, no other text:
{"common_name": "Species Name", "scientific_name": "Genus species", "confidence": "high|medium|low"}

If the image does not contain a bird: {"common_name": null, "scientific_name": null, "confidence": "none"}
Use the most widely accepted common name. Do not guess subspecies unless very confident.`;
```

**`identifySpeciesFromUrl(imageUrl)`** — for admin use (photo already on CDN):
- Sends `{ type: 'image', source: { type: 'url', url: imageUrl } }` in message content
- Model: `claude-haiku-4-5-20251001`, max_tokens: 150
- Parses JSON response, returns `{ common_name, scientific_name, confidence }` or `null`
- Catches all errors, logs warning, returns `null` (matches geocoding pattern)

**`identifySpeciesFromBuffer(buffer)`** — for ingest script (thumbnail not yet on CDN):
- Sends `{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buffer.toString('base64') } }`
- Same model/parsing/error handling

---

## 3. Standalone Script Module — `scripts/vision-standalone.js`

Same logic as `identifySpeciesFromBuffer` but uses `process.env.ANTHROPIC_API_KEY` instead of `$env/static/private`. The ingest script runs outside SvelteKit and already loads `.env` manually (lines 42-56).

Single export: `identifySpeciesFromBuffer(buffer)`

---

## 4. API Endpoint — `src/routes/api/vision/+server.js`

**POST** handler accepts `{ collection, photoIds }`:

- Auth enforced by `hooks.server.js` (line 42 — all non-auth POST routes require `event.locals.user`)
- CSRF enforced by same hooks Origin check (line 34)
- Validates collection slug format, photoIds is non-empty array
- For each photoId:
  1. `getPhoto(collection, photoId)` to get thumbnail URL
  2. `identifySpeciesFromUrl(photo.thumbnail)`
  3. If successful: `updatePhotoMetadata(collection, photoId, { species, scientificName, speciesAI: { model, confidence, detectedAt } })`
  4. Push result to `results[]`
- Returns `{ results: [{ photoId, species, confidence, photo }] }`
- Photos processed sequentially (avoid rate limits, ~1s each)

**Reused functions:**
- `getPhoto()` from `src/lib/server/photos.js:284`
- `updatePhotoMetadata()` from `src/lib/server/photos.js:307`

---

## 5. Data Model Extension

Add two optional fields to Photo (no migration needed — `updatePhotoMetadata` merges partials):

```
scientificName: string | null     // "Haliaeetus leucocephalus"
speciesAI: {                      // only present if AI-detected
    model: string,                // "claude-haiku-4-5"
    confidence: string,           // "high" | "medium" | "low"
    detectedAt: string            // ISO timestamp
} | null
```

Existing `species` field already in schema — just gets populated.

---

## 6. PhotoEditor Auto-ID Button

**File:** `src/lib/components/admin/PhotoEditor.svelte`

Add `apiPost` to import (line 6). Add state: `identifying`, `identifyError`.

Replace the species input block (lines 140-145) with a row containing the input + Auto-ID button:

```svelte
{#if collectionType === 'wildlife'}
    <label class="field">
        <span>Species</span>
        <div class="species-row">
            <input type="text" bind:value={species} placeholder="e.g. Bald Eagle" />
            <button class="btn btn-outline btn-xs" onclick={autoIdentify} disabled={identifying}>
                {identifying ? 'Identifying...' : 'Auto-ID'}
            </button>
        </div>
    </label>
    {#if identifyError}
        <div class="field-hint field-warning">{identifyError}</div>
    {/if}
    {#if photo.speciesAI}
        <div class="ai-badge">AI: {photo.speciesAI.confidence}{photo.scientificName ? ` — ${photo.scientificName}` : ''}</div>
    {/if}
{/if}
```

**`autoIdentify()`** function:
1. Sets `identifying = true`
2. `apiPost('/api/vision', { collection: collectionSlug, photoIds: [photo.id] })`
3. On success: sets `species = result.species`, calls `onupdated?.(result.photo)` (API already persisted)
4. On failure: sets `identifyError`
5. Sets `identifying = false`

**CSS additions:**
```css
.species-row { display: flex; gap: 6px; align-items: center; }
.species-row input { flex: 1; /* inherit existing .field input styles */ }
.btn-xs { padding: 4px 8px; font-size: 0.7rem; white-space: nowrap; }
.field-warning { font-size: 0.75rem; color: var(--color-warning, #f0ad4e); }
.ai-badge { font-size: 0.7rem; color: var(--color-text-muted); font-style: italic; }
```

---

## 7. Bulk Auto-ID on Admin Collection Page

**File:** `src/routes/admin/[collection]/+page.svelte`

Add imports: `apiPost` from `$lib/api.js`, `Modal` from common.

**New state:** `autoIdRunning`, `autoIdProgress { current, total }`, `autoIdResults`, `showAutoIdConfirm`

**New derived:** `unidentifiedCount` — photos where `!p.species`, `estimatedCost` — `(count * 0.001).toFixed(3)`

**In page-header (after geo-tag button, line 43):** Show button for wildlife collections with unidentified photos:

```svelte
{#if data.collection.type === 'wildlife' && unidentifiedCount > 0 && !autoIdRunning}
    <button class="btn btn-outline btn-sm" onclick={() => showAutoIdConfirm = true}>
        Auto-ID {unidentifiedCount} photo{unidentifiedCount !== 1 ? 's' : ''}
    </button>
{/if}
{#if autoIdRunning}
    <span class="auto-id-progress">Identifying... {autoIdProgress.current}/{autoIdProgress.total}</span>
{/if}
```

**Confirmation modal** (follows existing Modal/`{#snippet actions()}` pattern from PhotoEditor):
- Shows count, estimated cost (~$0.001/photo)
- "Existing species labels will not be overwritten"
- Cancel + Start buttons

**`bulkAutoId()`** function:
- Filters to photos without species
- Processes one-at-a-time via `apiPost('/api/vision', { collection, photoIds: [id] })` in a loop
- Updates `autoIdProgress.current` each iteration
- Calls `handleUpdated(result.photo)` per success to update the photos list reactively
- Shows summary when done (auto-clears after 10s)

---

## 8. Ingest Script Integration

**File:** `scripts/ingest-photos.js`

**CLI change (lines 387-400):** Parse `--species` flag from `process.argv`, strip it from positional args.

**Lazy import (after CLI parsing):**
```js
if (enableSpecies) {
    if (!process.env.ANTHROPIC_API_KEY) { console.error('...'); process.exit(1); }
    const mod = await import('./vision-standalone.js');
    identifySpeciesFromBuffer = mod.identifySpeciesFromBuffer;
}
```

**In main loop (after line 331, thumbBuffer generated):** Call `identifySpeciesFromBuffer(thumbBuffer)`, wrap in try/catch.

**In photo object construction (line 343-360):** Spread `...speciesData` to add `species`, `scientificName`, `speciesAI`.

**After loop (line 378):** Print cost summary: `Species API cost: ~$X.XXX (N photos @ ~$0.001/photo)`.

**Usage:**
```bash
node scripts/ingest-photos.js birds /path/to/photos --species
```

---

## Verification

1. **Build:** `npm run build` — no errors
2. **Single Auto-ID:** Admin → birds collection → click Auto-ID on a photo → species field populates, AI badge shows
3. **Bulk Auto-ID:** Admin → birds collection → "Auto-ID 2 photos" button → confirm modal shows cost → progress counter → both photos identified → SpeciesGrid no longer shows "Unknown"
4. **Ingest:** `node scripts/ingest-photos.js birds /path --species` → species printed per photo, cost summary at end
5. **Error handling:** Bad/missing API key → graceful null return, no crash; non-bird image → returns null
6. **Auth:** Unauthenticated POST to `/api/vision` → 401
7. **Data persistence:** After Auto-ID, check `data/birds/photos.json` has `species`, `scientificName`, `speciesAI` fields

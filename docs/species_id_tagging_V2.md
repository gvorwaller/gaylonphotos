# Auto-populate Bird Species Using Vision AI (td-1d857c)

## Context
The wildlife collection (`/birds`) has photos with no `species` field populated — they show as "Unknown" in the SpeciesGrid. This plan adds Claude Haiku 4.5 vision to auto-identify bird species from 400px thumbnails (~$0.001/photo). Three integration points: per-photo Auto-ID button, bulk Auto-ID on admin collection page, and `--species` CLI flag on ingest script.

## Files Overview

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | MODIFY | Add `@anthropic-ai/sdk` dependency |
| `.env` / `.env.example` | MODIFY | Add `ANTHROPIC_API_KEY` |
| `src/lib/server/vision.js` | CREATE | Core vision module (SvelteKit `$env/static/private`) |
| `scripts/vision-standalone.js` | CREATE | Vision module for ingest script (`process.env`) |
| `src/routes/api/vision/+server.js` | CREATE | POST endpoint for species detection |
| `src/lib/components/admin/PhotoEditor.svelte` | MODIFY | Add Auto-ID button next to species input |
| `src/routes/admin/[collection]/+page.svelte` | MODIFY | Add bulk Auto-ID button + confirmation modal |
| `scripts/ingest-photos.js` | MODIFY | Add `--species` flag |

---

## Step 1: Dependencies & Environment

**`package.json`** — add to `dependencies` (line 12-18):
```json
"@anthropic-ai/sdk": "^0.39.0",
```
Then run `npm install`.

**`.env.example`** — append:
```
# Anthropic Vision (bird species auto-ID)
ANTHROPIC_API_KEY=sk-ant-...
```

**`.env`** — add actual key (already gitignored).

---

## Step 2: `src/lib/server/vision.js` (CREATE)

Core vision module for SvelteKit server context. Single export: `identifySpecies(thumbnailUrl)`.

```js
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';

let client = null;
function getClient() {
    if (!client) client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    return client;
}

export async function identifySpecies(thumbnailUrl) {
    if (!ANTHROPIC_API_KEY) {
        console.warn('Vision: ANTHROPIC_API_KEY not configured');
        return null;
    }
    try {
        const response = await getClient().messages.create({
            model: 'claude-haiku-4-5-20250315',
            max_tokens: 256,
            messages: [{
                role: 'user',
                content: [
                    { type: 'image', source: { type: 'url', url: thumbnailUrl } },
                    { type: 'text', text: PROMPT }
                ]
            }]
        });
        const text = response.content[0]?.text?.trim();
        if (!text) return null;
        const result = JSON.parse(text);
        if (!result.species) return null;
        return {
            species: result.species,
            scientificName: result.scientificName || null,
            confidence: ['high', 'medium', 'low'].includes(result.confidence) ? result.confidence : 'low'
        };
    } catch (err) {
        console.warn('Vision identification failed:', err.message);
        return null;
    }
}
```

**PROMPT constant** (defined above `identifySpecies`):
```js
const PROMPT = `Identify the bird species in this photo. Respond with ONLY a JSON object, no markdown, no explanation:
{"species": "Common Name", "scientificName": "Genus species", "confidence": "high|medium|low"}

If no bird is visible or you cannot identify it:
{"species": null, "scientificName": null, "confidence": "low"}

Confidence guide:
- "high": distinctive species, clearly visible features
- "medium": likely correct but angle/lighting makes it uncertain
- "low": poor visibility, partial view, or ambiguous species`;
```

**Design notes:**
- Uses `type: 'url'` — Anthropic SDK fetches the CDN URL directly (thumbnails are public-read on DO Spaces)
- Lazy singleton client avoids creating client if vision is never called
- Returns `null` on any error — same pattern as `reverseGeocode` in `src/lib/geocoding.js`

---

## Step 3: `scripts/vision-standalone.js` (CREATE)

Same logic but uses `process.env.ANTHROPIC_API_KEY` (not `$env/static/private`) and accepts a Buffer instead of URL (thumbnail isn't on CDN yet during ingest). Single export: `identifySpeciesFromBuffer(thumbBuffer)`.

```js
import Anthropic from '@anthropic-ai/sdk';

let client = null;
function getClient() {
    if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return client;
}

export async function identifySpeciesFromBuffer(thumbBuffer) {
    if (!process.env.ANTHROPIC_API_KEY) {
        console.warn('Vision: ANTHROPIC_API_KEY not set');
        return null;
    }
    try {
        const response = await getClient().messages.create({
            model: 'claude-haiku-4-5-20250315',
            max_tokens: 256,
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: { type: 'base64', media_type: 'image/jpeg', data: thumbBuffer.toString('base64') }
                    },
                    { type: 'text', text: PROMPT }  // same PROMPT constant as vision.js
                ]
            }]
        });
        // ... identical JSON parsing and return as vision.js
    } catch (err) {
        console.warn('Vision identification failed:', err.message);
        return null;
    }
}
```

---

## Step 4: `src/routes/api/vision/+server.js` (CREATE)

POST endpoint. Auto-protected by `hooks.server.js:27-48` (CSRF + auth on all POST `/api/*`).

**Request:** `{ collection: string, photoIds: string[] }`
**Response:** `{ results: [...], summary: { identified, skipped, errors, total } }`

**Pattern follows** `src/routes/api/geotag/+server.js` exactly.

```js
import { json } from '@sveltejs/kit';
import { identifySpecies } from '$lib/server/vision.js';
import { getPhoto, updatePhotoMetadata } from '$lib/server/photos.js';

const SLUG_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export async function POST({ request }) {
    // Parse & validate (same pattern as geotag endpoint)
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, { status: 400 }); }
    const { collection, photoIds } = body;
    if (!collection || !SLUG_RE.test(collection))
        return json({ error: 'Invalid collection slug' }, { status: 400 });
    if (!Array.isArray(photoIds) || photoIds.length === 0)
        return json({ error: 'photoIds must be a non-empty array' }, { status: 400 });

    // Process sequentially (~1s/photo, avoids rate limits)
    const results = [];
    for (const photoId of photoIds) {
        const photo = await getPhoto(collection, photoId);
        if (!photo) { results.push({ photoId, status: 'error', error: 'Photo not found' }); continue; }
        if (!photo.thumbnail) { results.push({ photoId, status: 'error', error: 'No thumbnail' }); continue; }

        const id = await identifySpecies(photo.thumbnail);
        if (!id) { results.push({ photoId, status: 'skipped', reason: 'Could not identify' }); continue; }

        const updates = {
            species: id.species,
            scientificName: id.scientificName,
            speciesAI: {
                model: 'claude-haiku-4-5-20250315',
                confidence: id.confidence,
                detectedAt: new Date().toISOString()
            }
        };
        const updatedPhoto = await updatePhotoMetadata(collection, photoId, updates);
        results.push({ photoId, status: 'identified', species: id.species, confidence: id.confidence, photo: updatedPhoto });
    }

    const identified = results.filter(r => r.status === 'identified').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const errors = results.filter(r => r.status === 'error').length;
    return json({ results, summary: { identified, skipped, errors, total: photoIds.length } });
}
```

**Key reused functions:**
- `getPhoto()` — `src/lib/server/photos.js:80`
- `updatePhotoMetadata()` — `src/lib/server/photos.js:307` (merges partial updates, perfect for adding new fields)

---

## Step 5: `src/lib/components/admin/PhotoEditor.svelte` (MODIFY)

### 5a. Add `apiPost` import (line 6)
```js
// FROM:
import { apiPut, apiDelete } from '$lib/api.js';
// TO:
import { apiPost, apiPut, apiDelete } from '$lib/api.js';
```

### 5b. Add state variable (after line 54)
```js
let identifying = $state(false);
```

### 5c. Add `autoIdentify` function (after line 86, after `save()` closing brace)
```js
async function autoIdentify() {
    identifying = true;
    error = '';
    const result = await apiPost('/api/vision', {
        collection: collectionSlug,
        photoIds: [photo.id]
    });
    identifying = false;
    if (!result.ok) { error = result.error || 'Auto-ID failed'; return; }
    const item = result.data.results?.[0];
    if (!item || item.status !== 'identified') {
        error = item?.reason || item?.error || 'Could not identify species';
        return;
    }
    species = item.species;
    onupdated?.(item.photo);
}
```

**Note:** The API endpoint persists immediately via `updatePhotoMetadata`. `onupdated?.(item.photo)` syncs parent state. This matches the geocode backfill pattern at lines 22-27 which also persists silently via `apiPut`.

### 5d. Replace species input block (lines 140-145)
```svelte
<!-- FROM: -->
{#if collectionType === 'wildlife'}
    <label class="field">
        <span>Species</span>
        <input type="text" bind:value={species} placeholder="e.g. Bald Eagle" />
    </label>
{/if}

<!-- TO: -->
{#if collectionType === 'wildlife'}
    <label class="field">
        <span>Species</span>
        <div class="species-row">
            <input type="text" bind:value={species} placeholder="e.g. Bald Eagle" />
            <button class="btn btn-outline btn-sm auto-id-btn"
                onclick={autoIdentify} disabled={identifying}
                title="Use AI to identify bird species">
                {identifying ? 'Identifying...' : 'Auto-ID'}
            </button>
        </div>
    </label>
    {#if photo.speciesAI}
        <div class="ai-badge">
            AI: {photo.speciesAI.confidence} confidence
            {#if photo.scientificName}
                <span class="scientific-name">({photo.scientificName})</span>
            {/if}
        </div>
    {/if}
{/if}
```

### 5e. Add CSS (before `@media` block at line 266)
```css
.species-row { display: flex; gap: 8px; align-items: center; }
.species-row input { flex: 1; }
.auto-id-btn { white-space: nowrap; flex-shrink: 0; }
.auto-id-btn:disabled { opacity: 0.6; cursor: wait; }
.ai-badge { font-size: 0.7rem; color: var(--color-text-muted); padding: 2px 0; }
.scientific-name { font-style: italic; }
```

---

## Step 6: `src/routes/admin/[collection]/+page.svelte` (MODIFY)

### 6a. Add imports (after line 3)
```js
import { apiPost } from '$lib/api.js';
import Modal from '$lib/components/common/Modal.svelte';
```

### 6b. Add derived + state (after line 31, after `untaggedCount`)
```js
let unidentifiedPhotos = $derived(
    data.collection.type === 'wildlife' ? photos.filter(p => !p.species) : []
);
let showAutoIdConfirm = $state(false);
let autoIdProgress = $state(null);  // null | { current, total, identified, errors }
```

### 6c. Add `bulkAutoIdentify` function (after line 29, after `handleDeleted`)
```js
async function bulkAutoIdentify() {
    showAutoIdConfirm = false;
    const targets = [...unidentifiedPhotos];  // snapshot current list
    if (targets.length === 0) return;
    autoIdProgress = { current: 0, total: targets.length, identified: 0, errors: 0 };

    // Process one at a time (sequential API calls, ~1s each)
    for (let i = 0; i < targets.length; i++) {
        const result = await apiPost('/api/vision', {
            collection: data.collection.slug,
            photoIds: [targets[i].id]
        });
        if (result.ok && result.data.results?.[0]?.status === 'identified') {
            handleUpdated(result.data.results[0].photo);
            autoIdProgress.identified++;
        } else {
            autoIdProgress.errors++;
        }
        autoIdProgress.current = i + 1;
    }
    setTimeout(() => { autoIdProgress = null; }, 3000);
}
```

**Why one-at-a-time instead of batching:** Allows progress counter to update after each photo, giving real-time feedback. Batch of 10 would update in jumps.

### 6d. Add Auto-ID button in header (replace lines 39-44)
```svelte
<!-- FROM: -->
{#if untaggedCount > 0}
    <a href="/admin/{data.collection.slug}/geotag" class="btn btn-outline btn-sm">
        Geo-tag {untaggedCount} photo{untaggedCount !== 1 ? 's' : ''}
    </a>
{/if}

<!-- TO: -->
<div class="header-actions">
    {#if data.collection.type === 'wildlife' && unidentifiedPhotos.length > 0 && !autoIdProgress}
        <button class="btn btn-outline btn-sm" onclick={() => showAutoIdConfirm = true}>
            Auto-ID {unidentifiedPhotos.length} photo{unidentifiedPhotos.length !== 1 ? 's' : ''}
        </button>
    {/if}
    {#if autoIdProgress}
        <span class="auto-id-progress">
            Identifying... {autoIdProgress.current}/{autoIdProgress.total}
            ({autoIdProgress.identified} identified)
        </span>
    {/if}
    {#if untaggedCount > 0}
        <a href="/admin/{data.collection.slug}/geotag" class="btn btn-outline btn-sm">
            Geo-tag {untaggedCount} photo{untaggedCount !== 1 ? 's' : ''}
        </a>
    {/if}
</div>
```

### 6e. Add confirmation modal (before closing `</div>` on line 73)
```svelte
<Modal title="Auto-ID Bird Species" show={showAutoIdConfirm} onclose={() => showAutoIdConfirm = false}>
    <p>Use AI vision to identify species for <strong>{unidentifiedPhotos.length}</strong>
        photo{unidentifiedPhotos.length !== 1 ? 's' : ''}.</p>
    <p class="cost-estimate">Estimated cost: ~${(unidentifiedPhotos.length * 0.001).toFixed(3)}</p>
    <p style="font-size: 0.8rem; color: var(--color-text-muted);">
        Photos with existing species labels will not be overwritten.
    </p>
    {#snippet actions()}
        <button class="btn btn-outline btn-sm" onclick={() => showAutoIdConfirm = false}>Cancel</button>
        <button class="btn btn-primary btn-sm" onclick={bulkAutoIdentify}>
            Identify {unidentifiedPhotos.length} Photos
        </button>
    {/snippet}
</Modal>
```

### 6f. Add CSS
```css
.header-actions { display: flex; align-items: center; gap: 8px; }
.auto-id-progress {
    font-size: 0.8rem; color: var(--color-text-muted);
    padding: 6px 14px; background: #f8f9fa; border-radius: var(--radius-sm);
}
.cost-estimate { font-size: 0.85rem; color: var(--color-text-muted); font-style: italic; }
```

---

## Step 7: `scripts/ingest-photos.js` (MODIFY)

### 7a. Replace CLI parsing (lines 387-405)
```js
// FROM:
const args = process.argv.slice(2);
// ...
const sourceDir = args[1] || join('photos', slug);
ingest(slug, sourceDir).catch(...);

// TO:
const rawArgs = process.argv.slice(2);
const flagArgs = rawArgs.filter(a => a.startsWith('--'));
const posArgs = rawArgs.filter(a => !a.startsWith('--'));
const speciesFlag = flagArgs.includes('--species');

if (posArgs.length === 0) {
    console.error('Usage: node scripts/ingest-photos.js <collection-slug> [source-dir] [--species]');
    console.error('');
    console.error('Options:');
    console.error('  --species    Auto-identify bird species via Claude Vision (requires ANTHROPIC_API_KEY)');
    process.exit(1);
}

const slug = posArgs[0];
if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    console.error(`Invalid collection slug: "${slug}".`);
    process.exit(1);
}
const sourceDir = posArgs[1] || join('photos', slug);

if (speciesFlag && !process.env.ANTHROPIC_API_KEY) {
    console.error('--species requires ANTHROPIC_API_KEY in .env');
    process.exit(1);
}

ingest(slug, sourceDir, speciesFlag).catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
```

### 7b. Add lazy-load variable (after line 221, after `randomBytes` import)
```js
let identifySpeciesFromBuffer = null;
```

### 7c. Update `ingest` function signature (line 240)
```js
async function ingest(collectionSlug, sourceDir, autoSpecies = false) {
```

### 7d. Lazy-load vision module (after line 241, inside `ingest()` before first console.log)
```js
if (autoSpecies) {
    const vision = await import('./vision-standalone.js');
    identifySpeciesFromBuffer = vision.identifySpeciesFromBuffer;
    console.log('Species auto-ID enabled (Claude Haiku 4.5)\n');
}
```

### 7e. Add species identification after photo object construction (after line 360, before `photosData.photos.push(photo)`)
```js
if (autoSpecies && identifySpeciesFromBuffer) {
    const identification = await identifySpeciesFromBuffer(thumbBuffer);
    if (identification) {
        photo.species = identification.species;
        photo.scientificName = identification.scientificName;
        photo.speciesAI = {
            model: 'claude-haiku-4-5-20250315',
            confidence: identification.confidence,
            detectedAt: new Date().toISOString()
        };
        console.log(`    Species: ${identification.species} (${identification.confidence})`);
    } else {
        console.log(`    Species: could not identify`);
    }
}
```

### 7f. Add species summary (after line 382, after existing summary)
```js
if (autoSpecies) {
    const speciesCount = photosData.photos.filter(p => p.species).length;
    console.log(`  Species:  ${speciesCount} photos with species labels`);
}
```

---

## Data Model Extension

New optional fields on Photo (no migration — `updatePhotoMetadata` merges partials):

| Field | Type | Description |
|-------|------|-------------|
| `species` | `string` | Already in schema, just gets populated |
| `scientificName` | `string \| null` | Latin binomial, e.g. "Haliaeetus leucocephalus" |
| `speciesAI` | `{ model, confidence, detectedAt } \| null` | AI audit trail |

---

## Implementation Order

1. `package.json` + `npm install`
2. `.env` / `.env.example`
3. `src/lib/server/vision.js`
4. `src/routes/api/vision/+server.js` (testable with curl after this)
5. `src/lib/components/admin/PhotoEditor.svelte`
6. `src/routes/admin/[collection]/+page.svelte`
7. `scripts/vision-standalone.js`
8. `scripts/ingest-photos.js`

---

## Verification

1. **Build:** `npm run build` — no errors
2. **Single Auto-ID:** Admin → birds → click Auto-ID on a photo → species field populates, AI badge shows confidence + scientific name
3. **Bulk Auto-ID:** Admin → birds → "Auto-ID N photos" button → modal shows count + cost → confirm → progress counter updates → photos identified
4. **Ingest:** `node scripts/ingest-photos.js birds /path --species` → species logged per photo, summary at end
5. **Error handling:** Missing API key → graceful null, no crash. Non-bird image → "Could not identify" error message
6. **Auth:** Unauthenticated POST to `/api/vision` → 401
7. **Data:** Check `data/birds/photos.json` has `species`, `scientificName`, `speciesAI` fields after Auto-ID

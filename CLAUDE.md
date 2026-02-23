# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **DO NOT modify this file without explicitly asking the user first.**

## Session Startup (Do These First, In Order)

1. **Read docs/DESIGN_SPEC.md** — the authoritative implementation contract. If ARCHITECTURE.md or PROJECT_VISION.md conflict, DESIGN_SPEC wins.
2. **Check recent devlog** — review the last few entries in `docs/devlog/` for recent decisions and work.
3. **Task management** — run `td usage --new-session` to see current work (after reading docs).

## Project Overview

Multi-collection photography showcase built with SvelteKit (SSR via adapter-node). Three collection types — `travel` (itinerary/timeline/map), `wildlife` (species grid/sighting map), `action` (spot-based gallery) — each routing to type-specific component sets. Single-admin auth with JSON file persistence. Photos stored on DO Spaces CDN.

**No source code exists yet** — only architecture docs and data scaffolding. Implementation follows the 9-phase order in DESIGN_SPEC.md §12.

## Commands

```bash
# Dev server (once SvelteKit is scaffolded)
npm run dev

# Production build
npm run build
node build/index.js

# Create admin credentials
node scripts/setup-admin.js

# Bulk photo import from local folder
node scripts/ingest-photos.js <collection-slug> <folder-path>
```

## Architecture

### Document Hierarchy
- `docs/DESIGN_SPEC.md` — canonical spec (schemas, modules, APIs, components, flows)
- `docs/ARCHITECTURE.md` — concise onboarding summary
- `docs/PROJECT_VISION.md` — feature spec and user-facing requirements

### Runtime Constraints
- **Single process only** — JSON persistence uses in-memory per-file Promise locks. No PM2 cluster mode, no multi-instance. This is a hard constraint until/unless persistence is migrated to a database.
- **Sessions are in-memory** — admin sessions live in a Map, lost on restart. Acceptable for single-admin use.

### Data Layer
All persistence is JSON files under `data/`:
- `data/collections.json` — collection registry
- `data/{slug}/photos.json` — per-collection photo metadata
- `data/{slug}/itinerary.json` — travel collections only
- `data/admin.json` — bcrypt password hash (gitignored)

Writes use atomic temp-file-then-rename via `src/lib/server/json-store.js`. All mutations go through `updateJson()` to prevent read-modify-write races.

### Server Modules (src/lib/server/)
- `json-store.js` — atomic JSON I/O with per-file locking (foundation for all other modules)
- `auth.js` — bcrypt login, in-memory session Map, cookie management
- `photos.js` — EXIF extraction (exifr), image resize (sharp), DO Spaces upload, photo CRUD
- `storage.js` — S3 client for DO Spaces (upload, delete, deletePrefix, CDN URLs)
- `collections.js` — collection CRUD against collections.json
- `itinerary.js` — itinerary stop CRUD (travel collections only)

### Key Patterns
- **Collection type → component mapping**: `src/lib/collections.js` maps type strings to component sets. The `[collection]/+page.svelte` route reads the type and renders the appropriate components.
- **CSRF protection**: `hooks.server.js` validates Origin header on all non-GET API routes (except /api/auth).
- **Photo processing pipeline**: upload → exifr parse → sharp resize to 1600px display + 400px thumb → JPEG normalization → upload to Spaces as `{slug}/{photoId}.jpg`.
- **Spaces object keys**: `{slug}/{photoId}.jpg` (display) and `{slug}/thumbs/{photoId}.jpg` (thumbnail). Collection deletion uses `deletePrefix()` with paginated list + batched delete.
- **Google Maps key**: exposed via `PUBLIC_GOOGLE_MAPS_API_KEY` ($env/static/public), restricted by HTTP referrer in Google Cloud Console.

### Route Structure
- Public: `/` (landing), `/[collection]` (type-specific view), `/[collection]/photo/[id]`
- Admin: `/admin/login`, `/admin` (dashboard), `/admin/collections`, `/admin/[collection]` (photo management), `/admin/[collection]/geotag`, `/admin/[collection]/itinerary`
- API: `/api/auth`, `/api/photos`, `/api/collections`, `/api/geotag`, `/api/itinerary`

## CSS Rules

**No Tailwind. No utility frameworks.** Hand-written component-scoped CSS using SvelteKit `<style>` blocks.

Follow the BTC Dashboard pattern (reference: `~/BTC-dashboard/frontend/src/components/RedditIntelligence.css`):
- Class naming: `.component-name` pattern (`.gallery-grid`, `.photo-card`, `.map-container`)
- Card styling: white background, `border-radius: 8px`, `border: 1px solid #e9ecef`
- Font: `system-ui, -apple-system, sans-serif`
- Colors: green `#28a745`, red `#dc3545`, gray `#6c757d`, borders `#e9ecef`
- Destructive actions: modal confirmation dialogs, never toast notifications

## Environment Variables

Required in `.env` (see DESIGN_SPEC §10):
- `PUBLIC_GOOGLE_MAPS_API_KEY` — Google Maps JavaScript API key
- `SPACES_KEY`, `SPACES_SECRET`, `SPACES_BUCKET`, `SPACES_REGION`, `SPACES_ENDPOINT`, `SPACES_CDN_URL` — DO Spaces
- `AUTH_SECRET` — optional cookie signing secret

# Architecture

## Source Of Truth

`docs/DESIGN_SPEC.md` is the authoritative implementation contract. This file is a synchronized summary for quick onboarding.

## Canonical Structure

```
gaylonphotos/
├── docs/
│   ├── PROJECT_VISION.md
│   ├── ARCHITECTURE.md
│   └── DESIGN_SPEC.md
├── data/
│   ├── collections.json
│   ├── admin.json
│   └── {collection}/(photos.json, itinerary.json for travel)
├── photos/                             # local source photos for bulk import (gitignored)
├── scripts/
│   ├── ingest-photos.js
│   └── setup-admin.js
├── src/
│   ├── lib/
│   │   ├── api.js
│   │   ├── collections.js
│   │   ├── stores.js
│   │   ├── server/
│   │   │   ├── auth.js
│   │   │   ├── collections.js
│   │   │   ├── exif-write.js
│   │   │   ├── itinerary.js
│   │   │   ├── json-store.js
│   │   │   ├── photos.js
│   │   │   └── storage.js
│   │   └── components/
│   │       ├── common/
│   │       ├── travel/
│   │       ├── wildlife/
│   │       ├── action/
│   │       ├── admin/
│   │       └── Landing.svelte
│   ├── routes/
│   │   ├── +layout.svelte
│   │   ├── +layout.server.js
│   │   ├── +page.svelte
│   │   ├── +page.server.js
│   │   ├── [collection]/...
│   │   ├── admin/...                  # /admin/login is login route; /admin is dashboard
│   │   └── api/...
│   ├── hooks.server.js
│   └── styles/global.css
└── static/
```

## Runtime Model

- SSR SvelteKit on a DigitalOcean Droplet using `@sveltejs/adapter-node`.
- Single-admin session auth via httpOnly cookie.
- JSON files are the persistence layer.
- **Single app process only** while using JSON persistence (no multi-instance cluster).

## Security Model

- Admin and mutating APIs require authenticated session.
- CSRF protection for mutating `/api/*` routes uses **Origin validation**: reject when `Origin` is missing or mismatched.
- Google Maps key is treated as public client config (`PUBLIC_GOOGLE_MAPS_API_KEY`) and must be restricted by HTTP referrer in Google Cloud.

## Storage And Media

- Originals/derivatives stored in DO Spaces + CDN URLs persisted in JSON metadata.
- Uploaded sources (jpg/png/webp) are normalized to JPEG derivatives.
- Canonical object keys:
  - display: `{slug}/{photoId}.jpg`
  - thumbnail: `{slug}/thumbs/{photoId}.jpg`
- Collection deletion must delete Spaces objects by prefix using paginated list + batched delete with retries.

## Route Conventions

- Public routes are unauthenticated.
- Admin login is `/admin/login`.
- `/admin` is the authenticated dashboard.

## Deployment

- Reverse proxy: Nginx → single Node.js app process (systemd or PM2 fork mode with one instance)
- TLS: Let's Encrypt
- Media: DO Spaces CDN

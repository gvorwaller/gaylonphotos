# Gaylon Photos — Multi-Collection Photography Site

## Project Overview

A self-hosted photography showcase that supports multiple **collections** — each with its own theme, display style, and organization. Photos are dynamically loaded and managed through an admin interface, with EXIF metadata extracted for GPS mapping, dates, and camera info.

**Goal**: A beautiful, shareable personal photography site — one place to display travel adventures, bird photography, surf sessions, and anything else. Deployed on Digital Ocean so anyone with the link can explore it. Full admin editing via the app.

---

## Collections

The app is organized around **collections**, each with a type that determines its display behavior.

### Collection Types

| Type | Description | Key Features |
|------|-------------|--------------|
| `travel` | Trip-based photo journals | Itinerary route on map, chronological timeline, stop-by-stop narrative |
| `wildlife` | Species-focused photography | Species/taxonomy tagging, sighting map, species checklist |
| `action` | Activity/sports photography | Spot/location-based grouping, session organization |

### Planned Collections

| Collection | Type | Description |
|-----------|------|-------------|
| `scandinavia-2023` | `travel` | Scandinavia trip — the original inspiration |
| `birds` | `wildlife` | Bird photography hobby, ~6 years of photos |
| `surfing` | `action` | Surfing photos |

New collections can be added anytime through the admin interface.

---

## Core Features

### 1. Photo Ingestion & Management
- Upload photos through the admin interface, or bulk-ingest from a local folder
- EXIF metadata extracted automatically (GPS coordinates, date/time, camera model, focal length, etc.)
- Photos processed and optimized for web display (thumbnails + full-size)
- Collection-aware: each collection's photos are managed independently
- Stored on Digital Ocean Spaces (S3-compatible CDN)

### 2. Geo-Tagging UI (for GPS-less photos)
- **Problem**: Most photos are from a Panasonic camera with no GPS
- **Solution**: In-app geo-tagger — select photo(s), click on Google Map to assign coordinates
- Batch geo-tagging: select multiple photos from the same location, assign GPS in one click
- Option to write GPS back into the original EXIF data (via exiftool) or store in app metadata only
- Visual indicator for photos that are untagged (no GPS)

### 3. Interactive Map (Google Maps)
- **Google Maps Platform** — existing account from prior WordPress/Bluehost project
- Photo markers placed at GPS coordinates
- **Travel collections**: Itinerary route drawn connecting stops in chronological order
- **Wildlife collections**: Sighting density / species distribution
- **Action collections**: Spot markers with session grouping
- Click a marker to see the photo, description, and metadata
- Street View available where applicable

### 4. Photo Gallery
- Browse all photos in a grid/masonry layout
- Filter by location, date, tag, or collection-specific fields (species, spot, etc.)
- Lightbox view with full metadata display
- Multiple sort options (chronological, location, favorites)

### 5. Admin Interface (authenticated)
- **Login required** for all editing/management features
- Public visitors see the read-only showcase
- Admin capabilities:
  - Upload/delete photos
  - Edit descriptions, tags, and collection-specific fields
  - Geo-tag photos via map click
  - Manage collections (add/edit/remove)
  - Edit itinerary stops for travel collections
  - Set hero images, collection descriptions

### 6. User Descriptions
- Per-photo descriptions editable through the admin interface
- Sidecar `.json` files still supported for bulk import from local folders
- All metadata stored in JSON data files (no database)

### 7. Collection-Specific Views
- **Travel**: Itinerary timeline, day-by-day progression, route map
- **Wildlife**: Species grid, taxonomy browser, sighting log
- **Action**: Spot guide, session timeline

### 8. Landing Page
- Overview of all collections with hero images
- Quick stats per collection (photo count, date range, locations)
- Direct navigation into any collection

---

## Decisions (Resolved)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Map provider | **Google Maps** | Existing account, familiar UX, Street View, cost not a factor |
| Static vs dynamic | **Dynamic (SSR)** | Enables admin editing, photo upload, live updates without rebuild |
| Photo storage | **DO Spaces (CDN)** | Cloud-hosted, fast delivery, no rebuild needed to add photos |
| CSS framework | **None (hand-written)** | BTC Dashboard pattern, SvelteKit scoped styles |
| Framework | **SvelteKit** | Recommended by experienced developer, compiled output, scoped CSS |
| Database | **JSON files** | Simple, sufficient for the data volume, editable via admin UI |
| Authentication | **Admin login** | Simple auth — single admin user, session-based |

---

## Proposed Tech Stack

```
Frontend:    SvelteKit (SSR mode via @sveltejs/adapter-node)
Map:         Google Maps JavaScript API (svelte-google-maps-api)
EXIF read:   exifr (fast EXIF parser, browser + Node)
EXIF write:  exiftool (CLI, for writing GPS back to original files)
Images:      sharp (Node.js image processing for thumbnails/optimization)
Styling:     Hand-written CSS — no Tailwind, no utility frameworks
             Pattern: BTC Dashboard style (card-based, system fonts, .component-name classes)
             Reference: ~/BTC-dashboard/frontend/src/components/RedditIntelligence.css
Storage:     Digital Ocean Spaces (S3-compatible object storage + CDN)
Deployment:  Digital Ocean Droplet (needed for SSR + API routes)
Data:        JSON files per collection (no database)
Auth:        Simple session-based admin login (bcrypt + httpOnly cookie)
Security:    Origin validation for mutating API routes (CSRF mitigation)
Runtime:     Single app process while JSON files are the persistence layer
```

### CSS Approach
- **No Tailwind**. Hand-written, component-scoped CSS files
- Consistent class naming: `.component-name` pattern (e.g., `.gallery-grid`, `.photo-card`, `.map-container`)
- Card styling: white background, `border-radius: 8px`, `border: 1px solid #e9ecef`
- System font stack: `system-ui, -apple-system, sans-serif`
- Color palette: green (#28a745), red (#dc3545), gray (#6c757d), borders (#e9ecef)
- Modal confirmations for destructive actions (no toast notifications)
- SvelteKit's built-in `<style>` blocks provide natural component scoping

---

## Deployment Target

- **Platform**: Digital Ocean Droplet
- **Why Droplet over App Platform**: SSR mode needs a running Node process; Droplet gives full control
- **Photo CDN**: Digital Ocean Spaces with CDN enabled
- **Reverse proxy**: Nginx → SvelteKit Node server
- **SSL**: Let's Encrypt via certbot
- **Estimated cost**: ~$6-12/mo (Droplet) + ~$5/mo (Spaces) = ~$11-17/mo

---

## Data & Folder Convention

### Collection Registry
```json
{
  "collections": [
    {
      "slug": "scandinavia-2023",
      "name": "Scandinavia 2023",
      "type": "travel",
      "description": "Our Scandinavian adventure",
      "heroImage": "IMG_1234",
      "dateRange": { "start": "2023-06-15", "end": "2023-07-02" }
    },
    {
      "slug": "birds",
      "name": "Bird Photography",
      "type": "wildlife",
      "description": "Birding hobby — 6 years of sightings",
      "heroImage": "heron_2022"
    },
    {
      "slug": "surfing",
      "name": "Surfing",
      "type": "action",
      "description": "Surf sessions and wave photography",
      "heroImage": "pipeline_dawn"
    }
  ]
}
```

### Photo Metadata (per photo in photos.json)
```json
{
  "id": "IMG_1234",
  "filename": "IMG_1234.jpg",
  "url": "https://spaces-cdn.example.com/scandinavia-2023/IMG_1234.jpg",
  "thumbnail": "https://spaces-cdn.example.com/scandinavia-2023/thumbs/IMG_1234.jpg",
  "description": "Watching the northern lights from our cabin in Tromso",
  "tags": ["northern-lights", "tromso", "night"],
  "favorite": true,
  "gps": { "lat": 69.6496, "lng": 18.9560 },
  "gpsSource": "exif",
  "date": "2023-06-20T23:45:00Z",
  "camera": "Panasonic DC-GH5",
  "lens": "Leica 12-60mm f/2.8-4.0",
  "focalLength": "35mm",
  "iso": 1600,
  "aperture": "f/2.8",
  "shutterSpeed": "1/30"
}
```

The `gpsSource` field tracks where GPS came from:
- `"exif"` — extracted from photo EXIF data
- `"manual"` — assigned via the geo-tagging UI
- `"ai"` — estimated by AI geocoding (Google Geocoding API for ancestry places)
- `"itinerary"` — inferred from matching photo date to active itinerary stop
- `null` — no GPS assigned yet (shows as "untagged" in admin)

### Sidecar File Format (for bulk import)
```json
{
  "description": "Great blue heron hunting at dawn, Lake Murray",
  "tags": ["heron", "lake-murray", "dawn"],
  "favorite": true,
  "species": "Great Blue Heron"
}
```

---

## URL Structure

```
yoursite.com/                                    # Landing — all collections
yoursite.com/scandinavia-2023/                   # Travel view (map + itinerary + gallery)
yoursite.com/birds/                              # Wildlife view (species grid + sighting map)
yoursite.com/surfing/                            # Action view (spot-based gallery + map)
yoursite.com/scandinavia-2023/photo/IMG_1234     # Single photo detail

yoursite.com/admin/login                         # Admin login
yoursite.com/admin/                              # Admin dashboard (authenticated)
yoursite.com/admin/collections/                  # Manage collections
yoursite.com/admin/[collection]/                 # Manage photos in a collection
yoursite.com/admin/[collection]/geotag           # Geo-tagging UI
yoursite.com/admin/[collection]/itinerary        # Itinerary editor (travel only)
```

---

## Implemented Beyond MVP
- **Batch drag-and-drop upload** — multi-file upload in admin UI
- **Reverse geocoding** — auto-fill city/country from GPS coords (Google Geocoding API)
- **AI geocoding** — estimate lat/lng for ancestry places via Google Geocoding API
- **Family-context ancestry estimation** — infer coordinates from family members' known locations
- **Itinerary-based GPS** — assign coordinates to unlocated travel photos by matching dates to stops
- **GEDCOM import/merge** — import family history from GEDCOM files with diff preview
- **Bird species auto-ID** — Gemini 2.0 Flash vision identifies species from photos
- **Admin photo lightbox** — full-size preview with EXIF sidebar on admin & geotag pages
- **Collection sync** — bidirectional dev↔prod JSON sync with timestamp safety
- **Duplicate detection** (planned) — dHash perceptual hashing for near-duplicate detection

## Future Ideas
- Video clip support (short clips, 1 min max)
- Weather data overlay (what was the weather that day?)
- Trip statistics (km traveled, countries visited, photos per day)
- Guest comments / guestbook
- Print-quality export
- eBird integration for bird sightings
- Surf forecast data overlay (swell, wind, tide)
- Family tree visualization display

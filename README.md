# Gaylon Photos

A multi-collection photography showcase built with SvelteKit. Three collection types — **travel**, **wildlife**, and **action** — each with type-specific layouts, maps, and interaction patterns. Single-admin auth with a clean management interface. Photos stored on DigitalOcean Spaces CDN.

---

## Quick Start

```bash
npm install
cp .env.example .env    # fill in Spaces + Google Maps keys
npm run dev              # http://localhost:5174
```

Navigate to `/admin` to create your admin account on first visit.

---

## Design System

Hand-written component-scoped CSS. No Tailwind, no utility frameworks.

### Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | `#28a745` | Buttons, active states, links |
| `--color-danger` | `#dc3545` | Delete buttons, error text |
| `--color-text` | `#212529` | Body text |
| `--color-text-muted` | `#6c757d` | Secondary text, labels |
| `--color-surface` | `#fff` | Card backgrounds |
| `--color-border` | `#e9ecef` | Borders, dividers |
| `--color-bg` | `#f8f9fa` | Page background |

### Collection Type Badges

Each collection type has a distinct badge color used consistently across the app:

| Type | Background | Text |
|------|-----------|------|
| Travel | `#e8f5e9` | `#2e7d32` |
| Wildlife | `#e3f2fd` | `#1565c0` |
| Action | `#fff3e0` | `#e65100` |

### Typography

- Font stack: `system-ui, -apple-system, sans-serif`
- Headings: 700-800 weight, `#212529`
- Body: 400 weight, `0.95rem`
- Labels: 600 weight, `0.75-0.85rem`, uppercase where used as section labels

### Spacing & Elevation

- Container max-width: `1200px` with `24px` horizontal padding
- Border radii: `6px` (sm), `8px` (md), `12px` (lg), `20px` (pill)
- Card shadow: `0 1px 3px rgba(0,0,0,0.04)` — lifts to `0 12px 28px rgba(0,0,0,0.08)` on hover
- Button hover: `translateY(-1px)` with enhanced shadow

---

## Public Pages

### Landing Page (`/`)

Full-width hero section with a cover photo, dark gradient overlay, and centered title. Below it, a responsive card grid displays all collections.

- **Hero**: Min-height 280px, semi-transparent overlay for text contrast
- **Collection cards**: 3-column grid (1-column on mobile). Each card shows a cover thumbnail with the type badge positioned top-left, plus the collection name, description, and photo count
- **Hover**: Cards lift 4px with shadow transition
- **Placeholders**: Collections without photos show type-specific gradient backgrounds (blue-gray for travel, green for wildlife, tan for action)

### Collection Detail (`/[collection]`)

Back link, collection title with type badge, and description header — then type-specific content sections followed by a full photo gallery.

#### Travel Collections

Two sections appear above the gallery:

1. **Journey Map** — Google Maps with numbered stop markers connected by a green polyline route. Markers labeled "1. City, Country". Auto-fits bounds around all stops.

2. **Timeline** — Vertical timeline with green dot markers and connecting lines. Each stop shows city/country, date range, notes, and up to 6 grouped photo thumbnails with a "+X more" overflow badge. Photos are grouped to their nearest stop by date proximity.

#### Wildlife Collections

1. **Sightings Map** — Google Maps with species-colored markers. Colors are deterministic per species (hash-based HSL). Only photos with GPS coordinates appear.

2. **Species Grid** — Filterable card grid with search input. Each card shows a representative photo, species name, and sighting count. Clicking a species card filters the gallery below to show only that species. Active card gets a green border with inner shadow. "Show All" button clears the filter.

#### Action Collections

1. **Spot Gallery** — Photos grouped by spot name. A map at the top shows spot locations; clicking a marker smooth-scrolls to that spot's section. Each spot section has a header with count and a 4-column photo grid. Photos with conditions metadata show a bottom overlay badge with gradient background.

### Photo Detail (`/[collection]/photo/[id]`)

Two-column layout (stacks on mobile): full-resolution photo on the left, metadata sidebar on the right.

Sidebar contains:
- Back link to collection
- Description
- Tags as pill badges
- Metadata table: date, camera, lens, focal length, aperture, shutter speed, ISO, GPS coordinates, plus type-specific fields (species, spot, conditions)
- Embedded Google Map (zoom 13) if GPS data exists

### Lightbox

Clicking any gallery thumbnail opens a full-screen overlay (`rgba(0,0,0,0.92)` background) with:
- Photo at max 90vw / 80vh, `object-fit: contain`
- Description text below
- EXIF metadata row (date, camera, focal length, aperture, shutter, ISO)
- Prev/next arrows (hidden at boundaries)
- Keyboard: left/right arrows navigate, Escape closes
- Click backdrop to close

### Hamburger Menu

The global nav bar (sticky, 56px, frosted glass) has a hamburger button on the left that opens a 280px slide-out drawer listing all collections with type labels. The currently active collection is highlighted in green. The hamburger animates to an X when open.

- Closes on: navigation, backdrop click, Escape key
- Drawer uses CSS `transform: translateX` transition (0.25s)
- Hidden drawer is `inert` (removed from tab order and accessibility tree)

---

## Admin Interface

### Login / Setup (`/admin/login`)

Centered card on a light background. Automatically detects whether an admin account exists:

- **No admin**: Shows "Create Admin Account" with username, password (min 8 chars), and confirm password fields. Inline validation hints for password length and mismatch.
- **Admin exists**: Shows "Admin Login" with username and password fields.

Both forms: full-width green submit button, red error alerts above form, focus rings on inputs.

### Dashboard (`/admin`)

Responsive card grid showing each collection with stats:
- Photo count (large number)
- Untagged count (orange warning color if > 0)
- Quick link to geo-tagger if untagged photos exist
- Cards link to collection management page

### Sidebar Navigation

Fixed 240px sidebar with:
- Brand + "Admin" badge header
- Dashboard and Collections links
- Per-collection section with sub-links: photo management, geo-tagger, and itinerary (travel only)
- Active state: green background tint + green text
- Logout button at bottom

### Photo Management (`/admin/[collection]`)

- **Upload zone**: Drag-and-drop area with dashed border. Visual feedback on drag-over (green border + tint). File input fallback. Supports JPEG, PNG, WebP up to 50MB. Per-file progress tracking (pending, uploading, done, error).

- **Photo editor**: Inline cards with 100px thumbnail preview, metadata fields (description, tags, favorite toggle), and type-specific fields (species for wildlife, spot + conditions for action). Save and delete buttons per photo. Delete requires modal confirmation.

### Geo-Tagger (`/admin/[collection]/geotag`)

Split-panel interface filling the viewport below the header:

- **Left panel (40%)**: Grid of untagged photos with multi-select. Toggle individual photos or use Select All / Clear. Selected photos get a green border.
- **Right panel (60%)**: Interactive Google Map. Existing tagged photos shown as green markers. Click map to place an orange preview marker. Assign bar at bottom shows coordinates (monospace) and "Assign GPS to X photo(s)" button.

Workflow: select photos, click map to choose location, click assign. Assigned photos disappear from the untagged grid.

### Itinerary Editor (`/admin/[collection]/itinerary`)

Split-panel interface for travel collections:

- **Left panel (45%)**: Trip info card (name, description, date range) followed by an ordered list of stop cards. Each stop has city, country, arrival/departure dates, notes, GPS coordinates, and a "Set on map" button. Stops can be reordered with up/down arrows or deleted.
- **Right panel (55%)**: Google Map showing numbered stop markers connected by a green polyline. Clicking "Set on map" then clicking the map assigns GPS to that stop. A green hint bar appears at the bottom: "Click the map to set location for stop N."

### Collection Manager (`/admin/collections`)

- List of existing collections with inline edit mode
- "Add Collection" button opens a modal with name (auto-generates slug), slug (editable), type dropdown, and description
- Delete requires modal confirmation

---

## Responsive Behavior

| Component | Desktop | Tablet (768px) | Mobile (480px) |
|-----------|---------|----------------|----------------|
| Collection cards | 3 columns | 1 column | 1 column |
| Photo gallery | 4 columns | 2 columns | 1 column |
| Spot photos | 4 columns | 2 columns | 2 columns |
| Species grid | Auto-fill 180px min | Responsive | Responsive |
| Photo detail | 2-column (photo + sidebar) | 1-column stacked | 1-column stacked |
| Geo-tagger | 40/60 split | 40/60 split | Stacked |
| Itinerary editor | 45/55 split | 45/55 split | Stacked |

---

## Animations & Transitions

| Element | Trigger | Effect | Duration |
|---------|---------|--------|----------|
| Buttons | Hover | Lift 1px + shadow | 0.15s |
| Gallery photos | Hover | Scale 1.05 | 0.2s |
| Collection cards | Hover | Lift 4px + shadow | 0.2s |
| Hamburger lines | Toggle | Rotate to X / back | 0.25s |
| Nav drawer | Toggle | Slide translateX | 0.25s |
| Menu backdrop | Toggle | Opacity fade | 0.25s |
| Species cards | Hover | Border color | 0.15s |
| Input focus | Focus | Border color + ring | 0.15s |

---

## Accessibility

- **Semantic HTML**: Proper heading hierarchy, `<a>` for links, `<button>` for actions
- **ARIA**: Dialogs use `role="dialog"`, `aria-modal`, `aria-label`. Hamburger has `aria-expanded` and `aria-controls`. Icon buttons have `aria-label`
- **Keyboard**: Escape closes all overlays. Arrow keys navigate lightbox. Tab order preserved. `inert` attribute on hidden drawer
- **Images**: Alt text from description or filename fallback. Decorative images use empty alt
- **Color**: No color-only indicators. Warning states use text labels alongside color

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | SvelteKit 2 (Svelte 5 with runes) |
| Adapter | `@sveltejs/adapter-node` (SSR) |
| Styling | Hand-written component-scoped CSS |
| Image processing | sharp (resize, JPEG normalization) |
| EXIF parsing | exifr |
| Auth | bcryptjs + in-memory session Map |
| Storage | DigitalOcean Spaces (S3-compatible) via `@aws-sdk/client-s3` |
| Maps | Google Maps JavaScript API |
| Persistence | JSON files with atomic writes and per-file locking |

---

## Project Structure

```
src/
  lib/
    components/
      common/          Gallery, Lightbox, PhotoDetail, Modal, Map
      travel/          Timeline, ItineraryMap
      wildlife/        SpeciesGrid, SightingMap
      action/          SpotGallery
      admin/           AdminNav, PhotoUploader, PhotoEditor,
                       CollectionEditor, GeoTagger, ItineraryEditor
      Landing.svelte
    server/            json-store, auth, photos, storage, collections, itinerary
  routes/
    +layout.svelte     Global nav + hamburger menu
    +page.svelte       Landing page
    [collection]/      Public collection views
    admin/             Admin dashboard, login, management pages
    api/               REST endpoints (auth, photos, collections, geotag, itinerary)
  styles/
    global.css         Design tokens, base styles, utility classes
data/                  JSON persistence (collections, photos, itineraries, admin)
scripts/               setup-admin.js, ingest-photos.js, ingest-all.sh
```

---

## Environment Variables

```env
PUBLIC_GOOGLE_MAPS_API_KEY=   # Google Maps JavaScript API key
SPACES_KEY=                    # DO Spaces access key
SPACES_SECRET=                 # DO Spaces secret key
SPACES_BUCKET=                 # Bucket name
SPACES_REGION=                 # e.g. nyc3
SPACES_ENDPOINT=               # e.g. https://nyc3.digitaloceanspaces.com
SPACES_CDN_URL=                # e.g. https://bucket.nyc3.cdn.digitaloceanspaces.com
AUTH_SECRET=                   # Optional cookie signing secret
```

---

## Commands

```bash
npm run dev                              # Dev server (port 5174)
npm run build && node build/index.js     # Production build + run
node scripts/setup-admin.js              # CLI admin account creation
node scripts/ingest-photos.js <slug> <folder>  # Bulk photo import
./scripts/ingest-all.sh [slug...]        # Import all collections (or specific ones)
```

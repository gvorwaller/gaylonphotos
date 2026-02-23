# Gaylon Photos — Detailed Design Specification

## Context

This is the foundational design spec for a multi-collection photography showcase app. The user wants a personal photography site deployed on Digital Ocean that supports travel journals, bird photography, and surfing photo collections — each with type-specific display (maps, timelines, species grids). The app needs admin authentication for editing, a geo-tagging UI for GPS-less Panasonic camera photos, and dynamic photo management (no rebuild to add/edit photos). This document must be detailed enough for a coding agent to implement directly without asking questions.

**Project root**: `~/gaylonphotos/`
**Existing scaffolding**: Directory structure, docs, collections.json, itinerary.json template. No source code yet.

**Authority**: This document is the canonical implementation contract. If `ARCHITECTURE.md` or `PROJECT_VISION.md` differ, this spec wins and those docs must be updated to match.

---

## 1. Data Schemas

### 1.1 Collection

```ts
interface Collection {
  slug: string;           // URL-safe identifier: "scandinavia-2023", "birds", "surfing"
  name: string;           // Display name: "Scandinavia 2023"
  type: "travel" | "wildlife" | "action";
  description: string;
  heroImage: string | null;  // Photo ID used as collection cover
  dateRange?: { start: string | null; end: string | null };  // ISO dates, travel collections
}
```

**File**: `data/collections.json` → `{ collections: Collection[] }`

### 1.2 Photo

```ts
interface Photo {
  id: string;              // Filename without extension: "IMG_1234"
  filename: string;        // "IMG_1234.jpg"
  url: string;             // DO Spaces CDN URL for full-size
  thumbnail: string;       // DO Spaces CDN URL for thumbnail (400px wide)
  description: string;     // User-written description
  tags: string[];          // ["northern-lights", "tromso"]
  favorite: boolean;
  gps: { lat: number; lng: number } | null;
  gpsSource: "exif" | "manual" | null;  // null = untagged
  date: string | null;     // ISO 8601 from EXIF
  camera: string | null;   // "Panasonic DC-GH5"
  lens: string | null;
  focalLength: string | null;
  iso: number | null;
  aperture: string | null;
  shutterSpeed: string | null;
  // Type-specific fields (passed through, not validated)
  species?: string;        // wildlife collections
  spot?: string;           // action collections
  conditions?: string;     // action collections
}
```

**File**: `data/{slug}/photos.json` → `{ photos: Photo[] }`

### 1.3 ItineraryStop

```ts
interface ItineraryStop {
  id: number;              // Sequential integer
  city: string;
  country: string;
  lat: number;
  lng: number;
  arrivalDate: string | null;   // ISO date
  departureDate: string | null;
  notes: string;
}

interface Itinerary {
  trip: {
    name: string;
    description: string;
    startDate: string | null;
    endDate: string | null;
  };
  stops: ItineraryStop[];
}
```

**File**: `data/{slug}/itinerary.json` (travel collections only)

### 1.4 AdminUser & Session

```ts
interface AdminConfig {
  username: string;
  passwordHash: string;  // bcrypt hash
}

interface Session {
  token: string;         // crypto.randomUUID()
  username: string;
  createdAt: number;     // Date.now()
  expiresAt: number;     // createdAt + 7 days
}
```

**File**: `data/admin.json` → `AdminConfig`
**Sessions**: In-memory Map (sessions lost on restart — acceptable for single admin)

---

## 2. Server-Side Modules (src/lib/server/)

### 2.1 json-store.js — Atomic JSON File I/O

The foundation module. Every other server module uses this for JSON persistence.

```js
// Strategy: read → parse → modify → write-to-temp → rename (atomic on POSIX)
// Locking: per-file Promise chain prevents concurrent write corruption

export function readJson(filePath)
// Returns: parsed JSON object
// Throws: if file doesn't exist or invalid JSON
// Behavior: fs.readFile → JSON.parse

export function writeJson(filePath, data)
// Returns: void
// Behavior: JSON.stringify(data, null, 2) → write to filePath + '.tmp' → fs.rename to filePath
// Locking: acquires per-file lock, releases after rename

export function updateJson(filePath, updaterFn)
// Returns: the updated data
// Behavior: readJson → updaterFn(data) → writeJson
// This is the primary write interface — prevents read-modify-write races

export function ensureDir(dirPath)
// Returns: void
// Behavior: fs.mkdir with { recursive: true }
```

**Internal**: `locks` Map<string, Promise> for per-file serialization.

**Process model constraint**: This locking strategy is safe only within a single Node.js process. The production runtime must run exactly one app process (no multi-instance PM2 cluster) while using JSON persistence.

### 2.2 storage.js — Digital Ocean Spaces (S3)

```js
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { SPACES_KEY, SPACES_SECRET, SPACES_BUCKET, SPACES_REGION, SPACES_CDN_URL } from '$env/static/private';

// Singleton S3 client configured for DO Spaces
const client = new S3Client({ ... });

export async function uploadFile(key, buffer, contentType)
// Params: key = "scandinavia-2023/IMG_1234.jpg", buffer = Buffer, contentType = "image/jpeg"
// Returns: { url: string } — the CDN URL
// Behavior: PutObjectCommand with ACL: 'public-read'

export async function deleteFile(key)
// Returns: void
// Behavior: DeleteObjectCommand

export async function deletePrefix(prefix)
// Returns: void
// Behavior: list all objects under prefix using ListObjectsV2 pagination,
//           delete in batches (up to 1000 keys/request) with DeleteObjectsCommand,
//           retry transient failures with exponential backoff, idempotent if prefix is already empty

export function getCdnUrl(key)
// Returns: string — e.g., "https://{bucket}.{region}.cdn.digitaloceanspaces.com/{key}"
```

### 2.3 photos.js — Photo CRUD + Processing

```js
import { readJson, updateJson, ensureDir } from './json-store.js';
import { uploadFile, deleteFile, getCdnUrl } from './storage.js';
import sharp from 'sharp';
import exifr from 'exifr';

const THUMB_WIDTH = 400;
const DISPLAY_WIDTH = 1600;
const DATA_DIR = 'data';

export async function listPhotos(collectionSlug)
// Returns: Photo[]
// Behavior: readJson(`data/{slug}/photos.json`).photos — returns [] if file doesn't exist

export async function getPhoto(collectionSlug, photoId)
// Returns: Photo | null

export async function processAndUpload(collectionSlug, fileBuffer, originalFilename)
// Returns: Photo (the new photo object with all metadata populated)
// Steps:
//   1. Extract EXIF via exifr.parse(fileBuffer, { gps: true, exif: true, icc: false })
//   2. Generate display image: sharp(fileBuffer).resize(DISPLAY_WIDTH).jpeg({ quality: 85 })
//   3. Generate thumbnail: sharp(fileBuffer).resize(THUMB_WIDTH).jpeg({ quality: 80 })
//   4. Normalize output format to JPEG and upload using derived keys:
//      {slug}/{photoId}.jpg and {slug}/thumbs/{photoId}.jpg
//   5. Build Photo object from EXIF data
//   6. Append to data/{slug}/photos.json via updateJson
//   7. Return the Photo object

export async function updatePhotoMetadata(collectionSlug, photoId, updates)
// Params: updates = partial Photo (description, tags, favorite, species, spot, etc.)
// Returns: Photo (updated)
// Behavior: updateJson on photos.json — find by id, merge updates

export async function updatePhotoGps(collectionSlug, photoIds, lat, lng)
// Params: photoIds = string[], lat/lng = numbers
// Returns: Photo[] (updated photos)
// Behavior: updateJson — for each matching photo, set gps: {lat, lng}, gpsSource: "manual"

export async function deletePhoto(collectionSlug, photoId)
// Returns: void
// Behavior: deleteFile from Spaces (full + thumb), remove from photos.json via updateJson
```

### 2.4 collections.js — Collection CRUD

```js
export async function listCollections()
// Returns: Collection[]

export async function getCollection(slug)
// Returns: Collection | null

export async function createCollection(collectionData)
// Returns: Collection
// Behavior: updateJson on collections.json — push new collection
//           ensureDir for data/{slug}/ and initialize empty photos.json

export async function updateCollection(slug, updates)
// Returns: Collection (updated)

export async function deleteCollection(slug)
// Returns: void
// Behavior: remove from collections.json, delete data/{slug}/ directory,
//           delete all Spaces objects under {slug}/ via storage.deletePrefix(),
//           fail-safe on partial errors with retries and clear error reporting
```

### 2.5 itinerary.js — Itinerary CRUD

```js
export async function getItinerary(collectionSlug)
// Returns: Itinerary | null

export async function updateItinerary(collectionSlug, itineraryData)
// Returns: Itinerary
// Behavior: writeJson to data/{slug}/itinerary.json
// Validates: collection must exist and be type "travel"

export async function addStop(collectionSlug, stopData)
// Returns: ItineraryStop (with auto-assigned id)

export async function updateStop(collectionSlug, stopId, updates)
// Returns: ItineraryStop

export async function deleteStop(collectionSlug, stopId)
// Returns: void

export async function reorderStops(collectionSlug, orderedIds)
// Returns: ItineraryStop[] (in new order)
```

### 2.6 auth.js — Authentication

```js
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { readJson } from './json-store.js';

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const sessions = new Map(); // token → Session (in-memory, lost on restart)

export async function verifyCredentials(username, password)
// Returns: { token: string } | null
// Behavior: read data/admin.json, bcrypt.compare, if valid create session + return token

export function validateSession(token)
// Returns: Session | null
// Behavior: look up in sessions Map, check expiresAt > Date.now()

export function destroySession(token)
// Returns: void

export const COOKIE_NAME = 'gp_session';
export const COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  secure: true,        // set false in dev
  sameSite: 'lax',
  maxAge: SESSION_TTL / 1000
};
```

### 2.7 exif-write.js — GPS Write-Back via exiftool

```js
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

export async function writeGpsToFile(filePath, lat, lng)
// Returns: void
// Behavior: execFile('exiftool', [
//   `-GPSLatitude=${Math.abs(lat)}`,
//   `-GPSLongitude=${Math.abs(lng)}`,
//   `-GPSLatitudeRef=${lat >= 0 ? 'N' : 'S'}`,
//   `-GPSLongitudeRef=${lng >= 0 ? 'E' : 'W'}`,
//   '-overwrite_original',
//   filePath
// ])
// Note: Only used for local files during bulk import. Not used for DO Spaces photos.
```

---

## 3. Client-Side Library (src/lib/)

### 3.1 stores.js

```js
import { writable, derived } from 'svelte/store';

export const currentUser = writable(null);  // { username } or null
export const isAdmin = derived(currentUser, $u => $u !== null);
```

### 3.2 collections.js — Type → Component Mapping

```js
// This module maps collection types to their specialized component sets.
// Used by [collection]/+page.svelte to render the right layout.

export const COLLECTION_TYPES = {
  travel: {
    mapComponent: 'ItineraryMap',
    extraComponents: ['Timeline'],
    sidecarFields: [],
    hasItinerary: true
  },
  wildlife: {
    mapComponent: 'SightingMap',
    extraComponents: ['SpeciesGrid'],
    sidecarFields: ['species'],
    hasItinerary: false
  },
  action: {
    mapComponent: 'SpotGallery',   // SpotGallery includes its own map
    extraComponents: [],
    sidecarFields: ['spot', 'conditions'],
    hasItinerary: false
  }
};

export function getTypeConfig(type) {
  return COLLECTION_TYPES[type] || null;
}
```

### 3.3 api.js — Fetch Helpers for Admin UI

```js
// Thin wrappers around fetch for admin API calls.
// All include credentials and JSON headers.

export async function apiGet(path)
export async function apiPost(path, body)
export async function apiPut(path, body)
export async function apiDelete(path, body)
// Each returns: { ok, data, error }
// Handles: JSON parsing, error extraction
// All paths relative: apiPost('/api/photos', { ... })

export async function apiUpload(path, formData)
// For file uploads — sends FormData, no JSON content-type header
```

---

## 4. Hooks (src/hooks.server.js)

```js
import { validateSession, COOKIE_NAME } from '$lib/server/auth.js';
import { redirect } from '@sveltejs/kit';

export async function handle({ event, resolve }) {
  // 1. Extract session token from cookie
  const token = event.cookies.get(COOKIE_NAME);

  // 2. Validate session if token exists
  if (token) {
    const session = validateSession(token);
    if (session) {
      event.locals.user = { username: session.username };
    }
  }

  // 3. Protect admin routes (except login page)
  if (event.url.pathname.startsWith('/admin') &&
      !event.url.pathname.startsWith('/admin/login')) {
    if (!event.locals.user) {
      throw redirect(303, '/admin/login');
    }
  }

  // 4. Protect API mutation routes (POST/PUT/DELETE, except /api/auth)
  if (event.url.pathname.startsWith('/api') &&
      !event.url.pathname.startsWith('/api/auth') &&
      event.request.method !== 'GET') {
    if (!event.locals.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { 'Content-Type': 'application/json' }
      });
    }

    // CSRF mitigation: reject cross-site mutation attempts
    const origin = event.request.headers.get('origin');
    const host = event.url.origin;
    if (!origin || origin !== host) {
      return new Response(JSON.stringify({ error: 'Invalid origin' }), {
        status: 403, headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return resolve(event);
}
```

---

## 5. API Routes (src/routes/api/)

### 5.1 /api/auth/+server.js

**POST** — Login
Auth required: No
```
Request:  { username: string, password: string }
Response: { success: true } + Set-Cookie header
Error:    { error: "Invalid credentials" } (401)
```
Calls: `auth.verifyCredentials()` → sets cookie via `event.cookies.set()`

**DELETE** — Logout
Auth required: Yes
```
Response: { success: true } + Clear-Cookie header
```
Calls: `auth.destroySession()` → clears cookie

### 5.2 /api/photos/+server.js

**GET** — List photos in collection
Auth required: No
```
Query:    ?collection=scandinavia-2023
Response: { photos: Photo[] }
```

**POST** — Upload new photo
Auth required: Yes
```
Request:  FormData with fields: file (File), collection (string)
Response: { photo: Photo }
```
Calls: `photos.processAndUpload()`

**PUT** — Update photo metadata
Auth required: Yes
```
Request:  { collection: string, photoId: string, updates: Partial<Photo> }
Response: { photo: Photo }
```
Calls: `photos.updatePhotoMetadata()`

**DELETE** — Remove photo
Auth required: Yes
```
Request:  { collection: string, photoId: string }
Response: { success: true }
```
Calls: `photos.deletePhoto()`

### 5.3 /api/collections/+server.js

**GET** — List all collections
Auth required: No
```
Response: { collections: Collection[] }
```

**POST** — Create collection
Auth required: Yes
```
Request:  { slug, name, type, description }
Response: { collection: Collection }
```

**PUT** — Update collection
Auth required: Yes
```
Request:  { slug, updates: Partial<Collection> }
Response: { collection: Collection }
```

**DELETE** — Delete collection
Auth required: Yes
```
Request:  { slug }
Response: { success: true }
```

### 5.4 /api/geotag/+server.js

**POST** — Assign GPS coordinates to photos
Auth required: Yes
```
Request:  { collection: string, photoIds: string[], lat: number, lng: number }
Response: { photos: Photo[] }
```
Calls: `photos.updatePhotoGps()`

### 5.5 /api/itinerary/+server.js

**GET** — Get itinerary
Auth required: No
```
Query:    ?collection=scandinavia-2023
Response: { itinerary: Itinerary }
```

**PUT** — Update entire itinerary
Auth required: Yes
```
Request:  { collection: string, itinerary: Itinerary }
Response: { itinerary: Itinerary }
```

**POST** — Add stop
Auth required: Yes
```
Request:  { collection: string, stop: Partial<ItineraryStop> }
Response: { stop: ItineraryStop }
```

**DELETE** — Remove stop
Auth required: Yes
```
Request:  { collection: string, stopId: number }
Response: { success: true }
```

---

## 6. Routes (src/routes/)

### 6.1 Root Layout: +layout.svelte + +layout.server.js

**+layout.server.js**:
```js
// Passes Google Maps API key and user info to all pages
import { PUBLIC_GOOGLE_MAPS_API_KEY } from '$env/static/public';
export async function load({ locals }) {
  return {
    user: locals.user || null,
    googleMapsApiKey: PUBLIC_GOOGLE_MAPS_API_KEY
    // Maps API keys are public (restricted by HTTP referrer in Google Cloud Console)
  };
}
```

**+layout.svelte**: Renders `<slot />` with global CSS import, header/footer if desired. Sets `currentUser` store from layout data.

### 6.2 Public Routes

#### / (Landing Page)
**+page.server.js**: Loads all collections + first few photos per collection for hero cards.
**+page.svelte**: Renders `Landing.svelte` — grid of collection cards with hero images, names, descriptions, photo counts.

#### /[collection] (Collection View)
**+page.server.js**: Loads collection metadata, all photos, and itinerary (if travel type). Validates slug exists.
**+page.svelte**: Reads `collection.type`, dynamically renders the appropriate component set:
- `travel` → ItineraryMap + Timeline + Gallery
- `wildlife` → SightingMap + SpeciesGrid + Gallery
- `action` → SpotGallery + Gallery

#### /[collection]/photo/[id] (Photo Detail)
**+page.server.js**: Loads single photo + collection metadata.
**+page.svelte**: Renders `PhotoDetail.svelte` with full metadata display.

### 6.3 Admin Routes

#### /admin/login
**+page.svelte**: Login form (username + password). POSTs to /api/auth. On success, redirects to /admin. No +page.server.js needed (hooks skips login page).

#### /admin (+layout.server.js guard)
**+layout.server.js**: Verifies `locals.user` exists (double-check after hooks). Returns user data. All nested admin routes inherit this guard.

#### /admin (Dashboard)
**+page.server.js**: Loads all collections with photo counts.
**+page.svelte**: Admin dashboard — collection list with quick stats, links to manage each.

#### /admin/collections
**+page.server.js**: Loads all collections.
**+page.svelte**: Renders `CollectionEditor.svelte` — create/edit/delete collections.

#### /admin/[collection]
**+page.server.js**: Loads collection + all photos.
**+page.svelte**: Renders `PhotoUploader.svelte` + `PhotoEditor.svelte` — upload photos, edit metadata, delete photos. Shows count of untagged (no GPS) photos with link to geo-tagger.

#### /admin/[collection]/geotag
**+page.server.js**: Loads collection + photos where gpsSource === null.
**+page.svelte**: Renders `GeoTagger.svelte` — the critical split-panel geo-tagging UI.

#### /admin/[collection]/itinerary
**+page.server.js**: Loads collection (validates type === "travel") + itinerary.
**+page.svelte**: Renders `ItineraryEditor.svelte` — add/edit/reorder stops with map picker.

---

## 7. Svelte Components

### 7.1 Common Components (src/lib/components/common/)

#### Map.svelte — Base Google Maps Wrapper
```
Props:
  center: { lat, lng }       — initial map center
  zoom: number               — initial zoom level (default: 10)
  markers: Array<{ lat, lng, id, label?, icon? }>  — markers to display
  polyline: Array<{ lat, lng }> | null  — route line to draw
  clickable: boolean         — if true, dispatches 'mapclick' event (default: false)
  apiKey: string             — Google Maps API key (from layout data)

Events:
  mapclick: { lat, lng }     — fired when clickable=true and user clicks map
  markerclick: { id }        — fired when a marker is clicked

Children: <slot /> for info window content

Behavior:
  - Uses svelte-google-maps-api: APIProvider, GoogleMap, Marker, Polyline
  - Creates map instance, places markers, draws polyline
  - When clickable, adds click listener that dispatches {lat, lng}
  - Marker click opens info window (content from slot or default popup)
```

#### Gallery.svelte — Photo Grid + Lightbox
```
Props:
  photos: Photo[]
  columns: number (default: 4)

Events:
  photoclick: { photo }

Behavior:
  - CSS grid of thumbnails (masonry-like with uniform columns)
  - Click thumbnail → opens Lightbox.svelte with full-size image
  - Keyboard navigation in lightbox (left/right arrows, Escape to close)
```

#### Lightbox.svelte — Full-Screen Photo Viewer
```
Props:
  photo: Photo
  photos: Photo[]  — for prev/next navigation

Events:
  close: void

Behavior:
  - Fixed overlay covering viewport
  - Full-size image centered
  - Metadata panel: date, location, camera, description
  - Prev/next arrows + keyboard navigation
  - Click outside or Escape to close
```

#### PhotoDetail.svelte — Single Photo Page Content
```
Props:
  photo: Photo
  collection: Collection

Behavior:
  - Large display image
  - Metadata sidebar: date, GPS coordinates, camera, lens, ISO, aperture, shutter
  - Description text
  - Tags displayed as chips
  - Mini Google Map showing photo location (if GPS exists)
  - Back link to collection
```

#### Modal.svelte — Reusable Modal Dialog
```
Props:
  title: string
  show: boolean

Events:
  close: void

Slots:
  default — modal body content
  actions — modal footer buttons

Behavior:
  - .modal-overlay + .modal-content following BTC Dashboard pattern
  - Escape key closes
  - Click overlay closes
  - Focus trap for accessibility
```

### 7.2 Travel Components (src/lib/components/travel/)

#### ItineraryMap.svelte
```
Props:
  photos: Photo[]       — photos with GPS
  stops: ItineraryStop[]
  apiKey: string

Behavior:
  - Renders Map.svelte with:
    - Stop markers (numbered, custom icon) from itinerary stops
    - Photo markers (camera icon) from photos with GPS
    - Polyline connecting stops in order
  - Click stop marker → info window with city, country, dates, notes
  - Click photo marker → info window with thumbnail + description
  - Auto-fits bounds to show all markers
```

#### Timeline.svelte
```
Props:
  photos: Photo[]
  stops: ItineraryStop[]

Behavior:
  - Vertical timeline layout, grouped by stop/date
  - Each stop is a section header with city, dates, notes
  - Photos within each stop displayed as a small gallery row
  - Click photo → dispatches event (parent handles lightbox)
```

### 7.3 Wildlife Components (src/lib/components/wildlife/)

#### SightingMap.svelte
```
Props:
  photos: Photo[]
  apiKey: string

Behavior:
  - Renders Map.svelte with species-colored markers
  - Colors derived from species name (hash → hue)
  - Marker clustering for dense areas (MarkerClusterer library)
  - Click marker → info window with thumbnail + species + date
```

#### SpeciesGrid.svelte
```
Props:
  photos: Photo[]

Behavior:
  - Groups photos by `species` field
  - Renders species cards: species name, photo count, representative thumbnail
  - Click species card → filters gallery to that species
  - Search/filter by species name
```

### 7.4 Action Components (src/lib/components/action/)

#### SpotGallery.svelte
```
Props:
  photos: Photo[]
  apiKey: string

Behavior:
  - Groups photos by `spot` field
  - Shows spot sections with name + photo count
  - Within each spot, photos grouped by date (sessions)
  - Includes a map showing spot locations
  - Click spot on map → scrolls to that spot's photos
```

### 7.5 Admin Components (src/lib/components/admin/)

#### PhotoUploader.svelte
```
Props:
  collectionSlug: string

Events:
  uploaded: { photo: Photo }

Behavior:
  - Drag-and-drop zone + file picker button
  - Accepts multiple source files (jpg, png, webp)
  - Server normalizes all stored derivatives to JPEG (`{photoId}.jpg` + `thumbs/{photoId}.jpg`)
  - Upload progress bar per file
  - Calls apiUpload('/api/photos', formData)
  - On success, dispatches 'uploaded' event
```

#### PhotoEditor.svelte
```
Props:
  photo: Photo
  collectionType: string  — determines which extra fields to show

Events:
  updated: { photo: Photo }
  deleted: void

Behavior:
  - Form fields: description (textarea), tags (comma-separated input), favorite (checkbox)
  - Conditional fields based on type: species (wildlife), spot + conditions (action)
  - Save button → apiPut('/api/photos', { ... })
  - Delete button → Modal confirmation → apiDelete('/api/photos', { ... })
  - GPS status indicator (tagged/untagged) with link to geo-tagger
```

#### GeoTagger.svelte — THE CRITICAL FEATURE
```
Props:
  collectionSlug: string
  photos: Photo[]       — photos where gpsSource === null (untagged)
  allPhotos: Photo[]    — all photos (for showing already-tagged markers)
  apiKey: string

State:
  selectedPhotoIds: Set<string>
  pendingCoords: { lat, lng } | null

Behavior:
  Layout: Split panel — left (photo grid, 40%) | right (Google Map, 60%)

  Left panel:
    - Grid of untagged photo thumbnails
    - Click thumbnail to toggle selection (highlight border)
    - "Select All" / "Clear" buttons
    - Count display: "12 untagged, 3 selected"

  Right panel:
    - Map.svelte with clickable=true
    - Already-tagged photos shown as semi-transparent markers (context)
    - When user clicks map with photos selected:
      1. Set pendingCoords to click location
      2. Show preview marker at click location
      3. Enable "Assign GPS" button

  Assign flow:
    1. User selects photos in left panel
    2. User clicks location on map
    3. Preview marker appears, "Assign GPS to N photos" button enables
    4. User clicks "Assign GPS" button
    5. POST /api/geotag with { collection, photoIds, lat, lng }
    6. On success: remove assigned photos from untagged list,
       add permanent markers to map, clear selection
    7. Counter updates

  Batch mode: Select many photos → one click assigns same GPS to all.
```

#### CollectionEditor.svelte
```
Props:
  collections: Collection[]

Events:
  created: { collection }
  updated: { collection }
  deleted: { slug }

Behavior:
  - List existing collections as cards
  - "Add Collection" button → form: slug, name, type (dropdown), description
  - Edit button on each card → inline edit form
  - Delete button → Modal confirmation
  - Type selector: travel / wildlife / action
```

#### ItineraryEditor.svelte
```
Props:
  collectionSlug: string
  itinerary: Itinerary
  apiKey: string

Events:
  updated: { itinerary }

Behavior:
  Layout: Split panel — left (stop list) | right (Google Map with clickable=true)

  Left panel:
    - Trip info header: name, description, dates (editable)
    - Ordered list of stops, each with: city, country, dates, notes
    - "Add Stop" button → new empty stop form
    - Drag handles for reordering
    - Delete button per stop (with modal confirmation)

  Right panel:
    - Map.svelte with clickable=true and current stops as markers + polyline
    - When editing a stop, click map to set its lat/lng
    - Route preview updates as stops are added/reordered

  Save: PUT /api/itinerary with full itinerary object
```

#### AdminNav.svelte
```
Props:
  collections: Collection[]
  currentPath: string

Behavior:
  - Sidebar navigation for admin section
  - Links: Dashboard, Collections, then each collection (Photos / Geotag / Itinerary)
  - Highlights current route
  - Logout button at bottom
```

### 7.6 Landing Component (src/lib/components/Landing.svelte)

```
Props:
  collections: Collection[]
  photosByCollection: Record<string, Photo[]>  — first few photos per collection

Behavior:
  - Hero section: site title
  - Grid of collection cards, each showing:
    - Hero image (or first photo as fallback)
    - Collection name + description
    - Photo count, date range (if travel)
    - Click → navigates to /[collection]
```

---

## 8. Module Dependency Graph

```
hooks.server.js
  └── $lib/server/auth.js

+layout.server.js (root)
  └── $env/static/public (PUBLIC_GOOGLE_MAPS_API_KEY)

+layout.svelte (root)
  └── $lib/stores.js

API Routes:
  /api/auth        → $lib/server/auth.js
  /api/photos      → $lib/server/photos.js → storage.js, json-store.js
  /api/collections → $lib/server/collections.js → json-store.js
  /api/geotag      → $lib/server/photos.js → json-store.js
  /api/itinerary   → $lib/server/itinerary.js → json-store.js

Server modules:
  auth.js          → json-store.js (reads admin.json), bcrypt, crypto
  photos.js        → json-store.js, storage.js, sharp, exifr
  collections.js   → json-store.js
  itinerary.js     → json-store.js
  storage.js       → @aws-sdk/client-s3, $env/static/private
  hooks.server.js  → Origin validation for mutating routes (CSRF mitigation)
  exif-write.js    → child_process (exiftool CLI)

Client lib:
  stores.js        → svelte/store (standalone)
  collections.js   → (standalone, no imports)
  api.js           → (standalone, wraps fetch)

Components (→ means "uses"):
  Map.svelte       → svelte-google-maps-api
  Gallery.svelte   → Lightbox.svelte
  Lightbox.svelte  → (standalone)
  PhotoDetail.svelte → Map.svelte
  Modal.svelte     → (standalone)
  Landing.svelte   → (standalone)

  ItineraryMap.svelte → Map.svelte
  Timeline.svelte     → (standalone)
  SightingMap.svelte  → Map.svelte
  SpeciesGrid.svelte  → (standalone)
  SpotGallery.svelte  → Map.svelte

  PhotoUploader.svelte  → $lib/api.js
  PhotoEditor.svelte    → $lib/api.js, Modal.svelte
  GeoTagger.svelte      → $lib/api.js, Map.svelte
  CollectionEditor.svelte → $lib/api.js, Modal.svelte
  ItineraryEditor.svelte  → $lib/api.js, Map.svelte, Modal.svelte
  AdminNav.svelte         → $lib/api.js (logout)
```

---

## 9. Critical Flows

### 9.1 Photo Upload Flow

```
1. Admin selects files in PhotoUploader drag-and-drop zone
2. For each file:
   a. Create FormData with file + collection slug
   b. POST /api/photos (FormData)
3. Server /api/photos handler:
   a. Parse multipart form data
   b. Call photos.processAndUpload(slug, buffer, filename)
4. processAndUpload:
   a. exifr.parse(buffer) → extract GPS, date, camera, lens, ISO, aperture, shutter
   b. sharp(buffer).resize(1600).jpeg({quality:85}) → displayBuffer
   c. sharp(buffer).resize(400).jpeg({quality:80}) → thumbBuffer
   d. storage.uploadFile(`${slug}/${photoId}.jpg`, displayBuffer) → url
   e. storage.uploadFile(`${slug}/thumbs/${photoId}.jpg`, thumbBuffer) → thumbnail
   f. Build Photo object: { id, filename, url, thumbnail, gps (from EXIF or null),
      gpsSource (exif or null), date, camera, ... description:'', tags:[], favorite:false }
   g. updateJson(`data/${slug}/photos.json`, data => { data.photos.push(photo); return data; })
   h. Return Photo object
5. Server returns { photo } to client
6. PhotoUploader dispatches 'uploaded' event
7. Parent page adds photo to display list
```

### 9.2 Geo-Tagging Flow

```
1. Admin navigates to /admin/{collection}/geotag
2. +page.server.js loads photos where gpsSource === null
3. GeoTagger renders: left panel (untagged thumbnails), right panel (Google Map)
4. Admin clicks thumbnails to select (multi-select, visual highlight)
5. Admin clicks location on Google Map
6. Map dispatches 'mapclick' with { lat, lng }
7. GeoTagger sets pendingCoords, shows preview marker
8. Admin clicks "Assign GPS to N photos" button
9. apiPost('/api/geotag', { collection, photoIds: [...selectedIds], lat, lng })
10. Server /api/geotag handler:
    a. Call photos.updatePhotoGps(slug, photoIds, lat, lng)
    b. updateJson: for each photo in photoIds, set gps:{lat,lng}, gpsSource:"manual"
    c. Return updated Photo[]
11. GeoTagger UI:
    a. Remove assigned photos from untagged list (left panel)
    b. Add permanent markers to map (right panel)
    c. Clear selection, update counter
    d. Admin continues with remaining untagged photos
```

### 9.3 Authentication Flow

```
1. Unauthenticated user visits /admin/*
2. hooks.server.js: no cookie → no locals.user → redirect to /admin/login
3. User enters username + password, submits form
4. Client POSTs to /api/auth with { username, password }
5. Server: auth.verifyCredentials() → bcrypt.compare against data/admin.json hash
6. If valid: create session (token, username, timestamps), store in sessions Map
7. Set cookie: event.cookies.set('gp_session', token, COOKIE_OPTIONS)
8. Return { success: true }
9. Client redirects to /admin
10. Subsequent requests: hooks.server.js reads cookie → validateSession() → sets locals.user
11. Logout: DELETE /api/auth → destroySession() → clear cookie → redirect to /
```

### 9.4 JSON Atomic Write Pattern

This flow assumes a single running app process.

```
1. Caller invokes updateJson(filePath, updaterFn)
2. Acquire lock: await locks.get(filePath) or Promise.resolve()
3. Set new lock: locks.set(filePath, new Promise(resolve => ...))
4. Read: fs.readFile(filePath, 'utf-8') → JSON.parse()
5. Transform: updaterFn(data) → modifiedData
6. Serialize: JSON.stringify(modifiedData, null, 2)
7. Write temp: fs.writeFile(filePath + '.tmp', serialized)
8. Atomic rename: fs.rename(filePath + '.tmp', filePath)
9. Release lock: resolve()
10. Return modifiedData
```

---

## 10. Environment Variables (.env)

```bash
# Google Maps
PUBLIC_GOOGLE_MAPS_API_KEY=AIza...

# Digital Ocean Spaces
SPACES_KEY=DO...
SPACES_SECRET=...
SPACES_BUCKET=gaylonphotos
SPACES_REGION=nyc3
SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
SPACES_CDN_URL=https://gaylonphotos.nyc3.cdn.digitaloceanspaces.com

# Auth
AUTH_SECRET=...  # Used for additional cookie signing if needed
```

---

## 11. File Manifest (All Files to Create)

```
Configuration:
  package.json
  svelte.config.js          — adapter-node, alias $lib
  vite.config.js            — sveltekit plugin
  .env                      — environment variables (gitignored)
  .env.example              — template without secrets (committed)
  data/admin.json           — { username, passwordHash } (gitignored)

Server modules (src/lib/server/):
  json-store.js
  storage.js
  photos.js
  collections.js
  itinerary.js
  auth.js
  exif-write.js

Client modules (src/lib/):
  stores.js
  collections.js
  api.js

Hooks:
  src/hooks.server.js

Styles:
  src/styles/global.css     — BTC Dashboard design system variables + base classes

Layout:
  src/routes/+layout.svelte
  src/routes/+layout.server.js
  src/app.html

Public routes:
  src/routes/+page.svelte
  src/routes/+page.server.js
  src/routes/[collection]/+page.svelte
  src/routes/[collection]/+page.server.js
  src/routes/[collection]/photo/[id]/+page.svelte
  src/routes/[collection]/photo/[id]/+page.server.js

Admin routes:
  src/routes/admin/+layout.svelte
  src/routes/admin/+layout.server.js
  src/routes/admin/login/+page.svelte
  src/routes/admin/+page.svelte
  src/routes/admin/+page.server.js
  src/routes/admin/collections/+page.svelte
  src/routes/admin/collections/+page.server.js
  src/routes/admin/[collection]/+page.svelte
  src/routes/admin/[collection]/+page.server.js
  src/routes/admin/[collection]/geotag/+page.svelte
  src/routes/admin/[collection]/geotag/+page.server.js
  src/routes/admin/[collection]/itinerary/+page.svelte
  src/routes/admin/[collection]/itinerary/+page.server.js

API routes:
  src/routes/api/auth/+server.js
  src/routes/api/photos/+server.js
  src/routes/api/collections/+server.js
  src/routes/api/geotag/+server.js
  src/routes/api/itinerary/+server.js

Components (src/lib/components/):
  common/Map.svelte
  common/Gallery.svelte
  common/Lightbox.svelte
  common/PhotoDetail.svelte
  common/Modal.svelte
  travel/ItineraryMap.svelte
  travel/Timeline.svelte
  wildlife/SightingMap.svelte
  wildlife/SpeciesGrid.svelte
  action/SpotGallery.svelte
  admin/PhotoUploader.svelte
  admin/PhotoEditor.svelte
  admin/GeoTagger.svelte
  admin/CollectionEditor.svelte
  admin/ItineraryEditor.svelte
  admin/AdminNav.svelte
  Landing.svelte

Bulk import script:
  scripts/ingest-photos.js
  scripts/setup-admin.js    — CLI to create data/admin.json with hashed password
```

**Total: ~55 files**

---

## 12. Implementation Order

Build in this sequence — each phase produces a testable milestone:

1. **SvelteKit scaffold** — package.json, configs, app.html, global.css, +layout files, dev server running
2. **json-store.js + auth.js + hooks** — Atomic file I/O, admin login, session guard. Test: can log in/out.
3. **storage.js + photos.js** — DO Spaces connection, photo upload + EXIF extraction. Test: upload a photo via API.
4. **collections.js + itinerary.js** — Collection and itinerary CRUD. Test: create/edit collections via API.
5. **API routes** — Wire up all /api/ endpoints. Test: full CRUD via curl.
6. **Admin UI** — AdminNav, PhotoUploader, PhotoEditor, CollectionEditor, GeoTagger, ItineraryEditor. Test: full admin workflow in browser.
7. **Public components** — Map, Gallery, Lightbox, PhotoDetail, Landing. Test: public site displays collections.
8. **Type-specific components** — ItineraryMap, Timeline, SightingMap, SpeciesGrid, SpotGallery. Test: each collection type renders correctly.
9. **Deployment** — Droplet, Nginx, single Node.js app process (systemd or PM2 in fork mode with one instance), Spaces CDN, SSL.

---

## 13. Verification Plan

After full implementation, verify end-to-end:

1. `npm run dev` — dev server starts without errors
2. Navigate to `/admin/login` — login form appears
3. Run `node scripts/setup-admin.js` — creates admin credentials
4. Log in with credentials — redirected to /admin dashboard
5. Create a new collection via /admin/collections
6. Upload 3-5 test photos via /admin/{collection}
7. Edit photo descriptions and tags
8. Open /admin/{collection}/geotag — verify untagged photos appear
9. Select photos, click map, assign GPS — verify markers appear
10. Navigate to public site / — landing page shows collection
11. Click collection — type-appropriate view renders with map + gallery
12. Click photo — lightbox opens with metadata
13. Verify mobile responsiveness at 375px and 768px widths
14. Attempt cross-origin POST to a mutation endpoint and verify it is rejected with 403

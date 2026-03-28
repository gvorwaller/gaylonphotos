# Progress Snapshots

## 2026-03-28 14:10:50 EDT — main
- reviewing remaining td items, syncing planning doc

**Project status: 43 of 50 tasks closed — 7 open**

Open tasks:
- td-77ddd9 [P2] Duplicate/near-duplicate photo detection (dHash perceptual hashing)
- td-617191 [P2] Add family tree display to family history
- td-0a826d [P3] Support videos (short clips, 1 min max)
- td-3573e3 [P3] Admin ancestry: show real names instead of Wife-Paternal etc.
- td-20ed38 [P3] Ancestry: tag names gaylon/madonna in By Generation tab
- td-41b18a [P3] Add user help to the hamburger menu
- td-a8c913 [P3] Make the family history part multi-user

Recently completed (this session and prior):
- td-51e76b: Itinerary-based location fallback script (93/101 local, 121/130 prod photos matched)
- td-22b047: Collection sync script (bidirectional dev↔prod JSON sync)
- td-3b705b: Admin photo lightbox (large preview + EXIF on admin & geotag pages)
- td-27d5da: Geo-tag large thumbnail preview
- td-c71ffe: Bird auto-ID switched to Gemini 2.0 Flash
- td-286da1: Batch delete for photos in UI

**Features built beyond original MVP spec:**
- AI geocoding for ancestry places (Google Geocoding API)
- Family-context ancestry coordinate estimation
- Itinerary-based GPS assignment for unlocated travel photos
- GEDCOM import/merge for family history
- Admin photo lightbox with EXIF display
- Bird species auto-ID (Gemini 2.0 Flash vision)
- Collection JSON sync between dev and prod
- Interactive script runner (scripts/run.js)
- Batch drag-and-drop photo upload
- Reverse geocoding (auto place names from GPS)
- gpsSource expanded: 'exif', 'manual', 'ai', 'itinerary'

**Uncommitted changes:**
    ?? docs/2026-03-07_batch_implementation_plan.md
    ?? docs/2026-03-08_fix-phimagemanager-deadlock-nsapplication.md
    ?? docs/2026-03-08_native-mac-photo-uploader-plan.md
    ?? docs/2026-03-09_shared-album-safe-photo-ingestion_Codex.md
    ?? docs/ChatGPT_photo_uploader_swift_cli_design_notes.md
    ?? docs/devlog/2026-03-08.md
    ?? docs/devlog/2026-03-09.md
    ?? scripts/upload-from-photos.sh

**Open #GBV notes (top 50):**
    (none)

---

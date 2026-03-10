# Native Mac Photo Uploader (CLI) Plan

## Summary
Build a native Swift CLI (local dev build) that uploads directly from Photos app selection to `gaylon.photos`, replacing the shell AppleScript flow with a robust macOS-native implementation. Keep all current Claude changes untouched; this is a parallel replacement path to implement after Claude is done.

## Architecture

### Hybrid approach (ScriptingBridge + Photos.framework)
Use two Apple frameworks for different responsibilities:
- **ScriptingBridge** — read the current Photos selection (what the user has selected in the UI)
- **Photos.framework (PHAsset)** — export assets, handle iCloud downloads with progress tracking

This avoids AppleScript limitations while getting reliable iCloud download support via `PHImageManager` with `isNetworkAccessAllowed = true`.

## Implementation Changes
1. **Create a new Swift CLI module**
   - Add a standalone Swift Package (for example `mac/photo-uploader-cli`) with command:
     `photo-uploader --collection <slug> [--prod|--base-url <url>] [--concurrency N] [--skip-videos] [--dry-run]`
   - Local-dev run path: `swift run photo-uploader ...`

2. **Preflight system (`--preflight`)**
   Run all checks before any export or upload to detect problems early:

   | Stage | Check | Method | Error Code |
   |-------|-------|--------|------------|
   | 1 | macOS version | `ProcessInfo` | `UNSUPPORTED_OS` |
   | 2 | Photos running | `NSRunningApplication` | `PHOTOS_NOT_RUNNING` (auto-launch) |
   | 3 | Automation permission | `AEDeterminePermissionToAutomateTarget` | `AUTOMATION_DENIED` |
   | 4 | Photos selection | ScriptingBridge | `NO_SELECTION` / `SELECTION_EMPTY` |
   | 5 | Asset validation | Classify each asset | `UNSUPPORTED_TYPE` / `VIDEO_SKIPPED` |
   | 6 | iCloud availability | Check local vs cloud | `ICLOUD_NOT_LOCAL` (report count) |
   | 7 | Backend connectivity | `POST /api/auth` | `AUTH_FAILED` / `SERVER_UNREACHABLE` |
   | 8 | Export test | Export 1 asset to temp | `EXPORT_FAILED` |

   Example output:
   ```
   photo-uploader preflight
   ────────────────────────
   Photos running: ✓
   Automation permission: ✓
   Selected assets: 143
   Local originals: 121
   iCloud originals: 22
   Backend auth: ✓
   Temp directory: ✓
   READY TO UPLOAD (22 assets will download from iCloud during export)
   ```

3. **Read Photos selection natively**
   - Use **ScriptingBridge (Photos app Apple Events)** to fetch currently selected media items in Photos.
   - Avoid `osascript` and shell-embedded AppleScript strings entirely.
   - Surface explicit errors for: no selection, Photos not running, automation permission denied.
   - When Photos not running, auto-launch it and wait for it to respond.

4. **iCloud download handling (`--download-originals`)**
   Use Photos.framework for export with iCloud support:
   ```swift
   let options = PHImageRequestOptions()
   options.isNetworkAccessAllowed = true  // allows iCloud download
   options.deliveryMode = .highQualityFormat

   PHImageManager.default().requestImageDataAndOrientation(
       for: asset, options: options
   ) { data, uti, orientation, info in ... }
   ```
   - `--download-originals` pre-downloads all iCloud assets before export (two-pass workflow)
   - Show progress: `Downloading originals from iCloud: 32/143`
   - Without the flag, iCloud assets are downloaded on-the-fly during export (may appear to stall without progress)

5. **Export and upload pipeline**
   - Export selected assets to a managed temp directory with deterministic naming.
   - Upload via existing backend endpoints (`POST /api/auth`, `POST /api/photos`) using `URLSession` + cookie handling.
   - Add bounded concurrency and retry policy (network/transient failures only), per-file result tracking, and final summary report.
   - Filter by supported image types; skip sidecars/videos by default unless future flag enables video handling.

6. **Operational safety and observability**
   - Structured console output: progress line per file + final CSV/JSON summary artifact in `/tmp`.
   - Non-zero exit when any upload fails; include failed file list and reason codes.
   - Explicit cleanup of temp exports and session state.
   - Deterministic error codes for all failure modes (see preflight table above).

7. **Docs and handoff**
   - Add concise runbook doc for prerequisites:
     - System Settings > Privacy & Security > Automation: enable `photo-uploader → Photos`
     - System Settings > Privacy & Security > Photos: grant access if using Photos.framework
     - Full Disk Access may be needed depending on macOS version
   - Document recovery steps for iCloud-not-downloaded originals and partial reruns.

## CLI Interface
```
photo-uploader --collection <slug> [options]

Options:
  --collection <slug>     Target collection slug (required)
  --prod                  Upload to gaylon.photos (default: localhost:5174)
  --base-url <url>        Custom base URL
  --concurrency <N>       Concurrent uploads (default: 3)
  --skip-videos           Skip video assets (default: true in v1)
  --dry-run               Enumerate and validate without uploading
  --preflight             Run all checks, report readiness, then exit
  --download-originals    Pre-download iCloud assets before export
  --output-report <path>  Write JSON summary to file
```

No backend API contract changes in v1 (reuse existing auth + upload routes).

## Test Plan
1. **Preflight/permission scenarios**
   - Photos closed (should auto-launch), empty selection, automation denied, Photos access denied.
   - Each preflight stage fails independently with clear error code and remediation.
2. **Data-path scenarios**
   - Mixed selected assets (jpg/heic/png + mov + sidecars), large batch (500+), iCloud-not-downloaded originals.
   - Shared album photos (the primary use case that motivated this tool).
3. **iCloud scenarios**
   - All local, all iCloud, mixed. Verify `--download-originals` completes before export begins.
   - Partial iCloud failure (some assets unavailable) — report which failed and continue with rest.
4. **Network/auth scenarios**
   - Wrong password, expired session, intermittent 5xx/timeouts with retry.
5. **Correctness checks**
   - Uploaded count equals successful exported-image count.
   - Failures are reported with actionable reason codes.
   - Temp files removed after success/failure.
6. **Dry-run**
   - Enumerates and validates selection without uploading.

## Approach: Do NOT access Photos library bundle directly
Directly reading `~/Pictures/Photos Library.photoslibrary` is not viable:
- Internal structure is undocumented and changes between macOS versions
- Asset filenames are hashed and mapped through a SQLite database
- iCloud-only assets may not exist locally
- Even less reliable for shared libraries
- Apple strongly discourages direct access

Use the Photos framework or ScriptingBridge export APIs instead.

## Assumptions and Defaults
- v1 target is **CLI binary**, not GUI app.
- v1 source mode is **current Photos selection** only.
- v1 distribution is **local dev build only** (no signing/notarization).
- Existing uncommitted Claude files remain untouched until implementation handoff begins.
- Primary use case: uploading 600+ photos from shared iCloud albums on Mac.

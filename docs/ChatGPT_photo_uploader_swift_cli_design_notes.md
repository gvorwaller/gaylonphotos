# Native macOS Photos Uploader -- Implementation Notes and Preflight Plan

Author: ChatGPT (for Gaylon Vorwaller)\
Purpose: Consolidate implementation guidance for a Swift CLI that
uploads selected Photos assets to `gaylon.photos`.

------------------------------------------------------------------------

# 1. Overview

This document captures practical implementation guidance for a Swift CLI
tool that:

1.  Reads the **current selection in Apple Photos**
2.  Exports originals
3.  Uploads them to a backend service
4.  Handles iCloud assets gracefully
5.  Produces deterministic diagnostics

It assumes the architecture outlined in your original plan:

    Photos → Swift CLI → export → upload

Where the CLI interacts with Photos using **ScriptingBridge**.

------------------------------------------------------------------------

# 2. Preflight System (Recommended)

Before any export or upload begins, the CLI should run a **preflight
check** to detect permission problems, missing downloads, and backend
issues.

Command example:

    photo-uploader --preflight

This avoids mysterious failures later.

------------------------------------------------------------------------

# 3. Preflight Stages

## Stage 1 --- Environment Checks

  Check                     Method            Error
  ------------------------- ----------------- -------------------
  macOS version             ProcessInfo       UNSUPPORTED_OS
  Photos installed          check bundle id   PHOTOS_NOT_FOUND
  Temp directory writable   FileManager       TEMP_NOT_WRITABLE

------------------------------------------------------------------------

## Stage 2 --- Photos App State

  Check               Method                 Error
  ------------------- ---------------------- -----------------------
  Photos running      NSRunningApplication   PHOTOS_NOT_RUNNING
  Photos responding   AppleEvent ping        PHOTOS_NOT_RESPONDING

Recommended auto‑fix:

    Launching Photos.app…

------------------------------------------------------------------------

## Stage 3 --- Automation Permission

macOS requires permission for one application to control another.

Detection method:

    AEDeterminePermissionToAutomateTarget

Failure code:

    AUTOMATION_DENIED

User message:

    This tool needs permission to control Photos.

    Open:
    System Settings → Privacy & Security → Automation

    Enable:
    photo-uploader → Photos

------------------------------------------------------------------------

## Stage 4 --- Fetch Photos Selection

Using **ScriptingBridge**, retrieve the currently selected media items.

Possible failures:

  Code                Meaning
  ------------------- ---------------------------
  NO_SELECTION        User didn't select photos
  SELECTION_EMPTY     Selection returned 0
  SCRIPTING_FAILURE   Photos automation failed

Example output:

    Selected assets: 143

------------------------------------------------------------------------

## Stage 5 --- Asset Validation

Each asset should be classified before export.

  Check              Failure
  ------------------ ------------------------
  unsupported type   UNSUPPORTED_TYPE
  video skipped      VIDEO_SKIPPED
  sidecar skipped    SIDECAR_SKIPPED
  missing original   ORIGINAL_NOT_AVAILABLE

------------------------------------------------------------------------

## Stage 6 --- iCloud Local Availability

Determine whether assets are already downloaded.

Failure code:

    ICLOUD_NOT_LOCAL

Example output:

    143 selected
    121 local
    22 require iCloud download

------------------------------------------------------------------------

## Stage 7 --- Backend Connectivity

Test API authentication before export begins.

Example:

    POST /api/auth

Possible failures:

  Code                 Meaning
  -------------------- -------------------
  AUTH_FAILED          wrong credentials
  SERVER_UNREACHABLE   network problem
  API_ERROR            backend issue

------------------------------------------------------------------------

## Stage 8 --- Export Test

Export **one test asset** to the temporary directory.

Failure:

    EXPORT_FAILED

------------------------------------------------------------------------

# 4. Example Preflight Output

    photo-uploader preflight
    ────────────────────────

    Photos running: ✓
    Automation permission: ✓
    Photos library access: ✓

    Selected assets: 143

    Local originals: 121
    iCloud originals: 22

    Backend auth: ✓
    Temp directory: ✓

    READY TO UPLOAD

Example blocked state:

    BLOCKED

    22 assets require iCloud download.

    Run:
    photo-uploader --download-originals

------------------------------------------------------------------------

# 5. Handling iCloud Photos

Some assets exist only in iCloud until requested.

Three approaches exist.

------------------------------------------------------------------------

## Method 1 --- Photos Framework Download

Using `PHAsset` APIs automatically downloads originals when requested.

Swift example:

``` swift
let options = PHImageRequestOptions()
options.isNetworkAccessAllowed = true
options.deliveryMode = .highQualityFormat

PHImageManager.default().requestImageDataAndOrientation(
    for: asset,
    options: options
) { data, uti, orientation, info in
}
```

Key flag:

    isNetworkAccessAllowed = true

This allows automatic download from iCloud.

------------------------------------------------------------------------

## Method 2 --- Resource Manager Export

    PHAssetResourceManager

Example:

``` swift
let options = PHAssetResourceRequestOptions()
options.isNetworkAccessAllowed = true

PHAssetResourceManager.default().requestData(
    for: resource,
    options: options
)
```

------------------------------------------------------------------------

## Method 3 --- ScriptingBridge Export

If using only ScriptingBridge:

    export → wait → iCloud download → export

The export blocks until the original downloads.

This can appear as a stall if progress is not shown.

------------------------------------------------------------------------

# 6. Recommended CLI Flag

Add:

    photo-uploader --download-originals

Workflow:

    photo-uploader --download-originals
    photo-uploader --upload

This prevents long pauses during export.

------------------------------------------------------------------------

# 7. Recommended Architecture Improvement

Hybrid approach:

    ScriptingBridge → detect selection
    Photos.framework → export assets

Advantages:

  Benefit                      Reason
  ---------------------------- --------------------------------
  automatic iCloud downloads   framework handles it
  better progress tracking     async callbacks
  more reliable export         avoids AppleScript limitations

------------------------------------------------------------------------

# 8. Performance Considerations

Large downloads may take time.

Your CLI should show progress such as:

    Downloading originals from iCloud
    Progress: 32 / 143

Otherwise users assume the program is frozen.

------------------------------------------------------------------------

# 9. Direct Photos Library Access (Reality Check)

It is technically possible to read files directly from:

    ~/Pictures/Photos Library.photoslibrary

However:

1.  The internal structure is undocumented and changes between macOS
    versions.
2.  Asset filenames are hashed and mapped through a database.
3.  iCloud‑only assets may not exist locally.
4.  Apple strongly discourages direct access.

For a **shared Photos library** this approach is even less reliable.

Conclusion:

Direct bundle access **is not recommended** for your uploader.

Using the Photos framework or export APIs remains the safest method.

------------------------------------------------------------------------

# 10. Final Recommendation

Best practical design:

    1. Swift CLI
    2. ScriptingBridge → read Photos selection
    3. Photos.framework → export originals
    4. URLSession → upload

Add:

-   `--preflight`
-   `--download-originals`
-   progress reporting
-   deterministic error codes

This yields a reliable native macOS uploader suitable for large photo
batches.

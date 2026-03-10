# Fix PHImageManager Deadlock in Swift CLI Photo Uploader

## Context

The Swift CLI at `mac/photo-uploader-cli` hangs when calling `PHImageManager.default().requestImageDataAndOrientation()`. Preflight, auth, and selection reading all work. The export step never completes — the callback never fires.

The same code works in a standalone `swift -` interpreted script but hangs in a compiled Swift Package CLI. Four threading approaches have failed (async+semaphore, isSynchronous on main, isSynchronous on background queue, RunLoop pumping).

## Root Cause (Confirmed by Research)

**Photos.framework requires `NSApplication.shared` to be initialized and its event loop running.** This is not documented by Apple, but is confirmed by:

1. **[PhotosExporter](https://github.com/abentele/PhotosExporter)** — the only working open-source Swift CLI that exports photos via PhotoKit — uses `@NSApplicationMain` with an `AppDelegate`. It is an NSApplication-based tool, not a plain CLI.

2. **[Apple Developer Forums](https://developer.apple.com/forums/thread/680491)** — when monitoring AppKit events in a CLI, `RunLoop.main.run()` does NOT work. You must use `NSApplication.shared.run()`.

3. **[objc.io](https://www.objc.io/blog/2018/10/02/using-appkit-from-the-command-line/)** — confirms the pattern: import AppKit, create `NSApplication.shared`, set a delegate, call `app.run()`.

4. **Why the standalone `swift -` script worked**: The Swift interpreter may initialize AppKit infrastructure automatically (or runs code in a context where the RunLoop is serviced differently). A compiled executable does not get this for free.

`RunLoop.main.run()` (which we tried) is NOT the same as `NSApplication.shared.run()`. The NSApplication run loop processes additional event sources that Photos.framework depends on internally — specifically XPC connections to the `photoanalysisd` and `photolibraryd` daemons that service image data requests.

## Fix: Convert CLI to NSApplication-based Tool

### Pattern (from objc.io + PhotosExporter)

```swift
import AppKit

class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Dispatch work to background queue
        DispatchQueue.global(qos: .userInitiated).async {
            // ... do all the work here ...

            // When done, terminate
            DispatchQueue.main.async {
                NSApp.terminate(nil)
            }
        }
    }
}

// Entry point
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()  // This runs the event loop — never returns until terminate
```

### Changes Required

**File: `mac/photo-uploader-cli/Sources/PhotoUploader.swift`**

Replace `@main struct PhotoUploader: ParsableCommand` with an NSApplication entry point. Move all the logic from `run()` into an `AppDelegate.applicationDidFinishLaunching()` method that dispatches to a background queue.

Two options for argument parsing:
- **Option A**: Keep ArgumentParser but call `PhotoUploader.parseOrExit()` manually instead of using `@main`. Parse args before starting NSApplication, pass parsed values to AppDelegate.
- **Option B**: Drop ArgumentParser and use `CommandLine.arguments` directly (simpler, fewer dependencies).

**Recommended: Option A** — keep ArgumentParser for the nice help text and validation, but don't use its `@main` mechanism.

Restructured entry point:

```swift
import AppKit
import ArgumentParser

// Remove @main from PhotoUploader struct
struct PhotoUploader: ParsableCommand { ... }

// New entry point in main.swift (or top-level code)
class PhotoUploaderDelegate: NSObject, NSApplicationDelegate {
    let command: PhotoUploader

    init(command: PhotoUploader) {
        self.command = command
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                var cmd = self.command
                try cmd.execute()  // The actual work
            } catch {
                // handle error
            }
            DispatchQueue.main.async {
                NSApp.terminate(nil)
            }
        }
    }
}

// Parse arguments first (before NSApp.run)
do {
    var command = try PhotoUploader.parseAsRoot() as! PhotoUploader
    let app = NSApplication.shared
    app.setActivationPolicy(.accessory)  // No dock icon
    let delegate = PhotoUploaderDelegate(command: command)
    app.delegate = delegate
    app.run()
} catch {
    PhotoUploader.exit(withError: error)
}
```

**File: `mac/photo-uploader-cli/Sources/ExportUploadPipeline.swift`**

Simplify `exportAsset()` — remove the `DispatchQueue.global` wrapper and semaphore. Since the pipeline runs on a background thread and `NSApplication.shared.run()` keeps the main event loop alive, `isSynchronous = true` should work directly:

```swift
private func exportAsset(_ asset: PHAsset, filename: String) -> (path: String?, error: String?) {
    let options = PHImageRequestOptions()
    options.isNetworkAccessAllowed = true
    options.deliveryMode = .highQualityFormat
    options.isSynchronous = true
    options.version = .original

    var resultPath: String?
    var errorMsg: String?

    PHImageManager.default().requestImageDataAndOrientation(
        for: asset, options: options
    ) { data, uti, orientation, info in
        // With isSynchronous, callback fires inline on same thread
        if let error = info?[PHImageErrorKey] as? Error {
            errorMsg = "Export error: \(error.localizedDescription)"
            return
        }
        guard let imageData = data else {
            errorMsg = "No image data returned"
            return
        }
        // ... write to file ...
    }

    return (resultPath, errorMsg)
}
```

**File: `mac/photo-uploader-cli/Package.swift`**

No changes needed — already links Photos and AppKit frameworks.

### Implementation Steps

1. Split `PhotoUploader.swift` into two files:
   - `PhotoUploader.swift` — the `ParsableCommand` struct (remove `@main`)
   - `main.swift` — NSApplication entry point with AppDelegate

2. In `main.swift`:
   - Parse args via `PhotoUploader.parseAsRoot()`
   - Create `NSApplication.shared` with `.accessory` activation policy (no dock icon)
   - Set delegate that dispatches pipeline work to background queue
   - Call `app.run()`
   - Terminate via `NSApp.terminate(nil)` when pipeline completes

3. Move credential prompting to BEFORE `app.run()` (stdin reads work fine before the event loop starts, but may not work after)

4. Simplify `ExportUploadPipeline.exportAsset()` — remove DispatchQueue wrapper and semaphore since NSApplication event loop handles Photos.framework internally

5. Build and test

### Important: stdin and NSApplication.run()

`NSApplication.shared.run()` takes over the main thread. `readLine()` for username/password must happen BEFORE `app.run()` is called, or on a background thread with manual stdin handling. The cleanest approach: do all interactive prompting before starting the NSApplication event loop.

## Verification

```bash
swift build
printf 'gdawgv\nxobnop-zotxa2-Gasnys\n' | swift run photo-uploader --collection scandinavia-2023 --prod
```

Expected: photos export and upload within seconds (not hanging). Each photo should show progress like `[1/5] IMG_4069.HEIC ... ✓`.

## Sources

- [objc.io: Using AppKit from the Command-line](https://www.objc.io/blog/2018/10/02/using-appkit-from-the-command-line/)
- [Apple Developer Forums: Keeping CLI alive](https://developer.apple.com/forums/thread/680491)
- [PhotosExporter: Working Swift CLI with @NSApplicationMain](https://github.com/abentele/PhotosExporter)
- [Apple Developer Forums: Swift command line tool runtime](https://developer.apple.com/forums/thread/80596)
- [PyObjC AppHelper: runConsoleEventLoop](https://pyobjc.readthedocs.io/en/latest/api/module-PyObjCTools.AppHelper.html)

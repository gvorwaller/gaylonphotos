import Foundation
import Photos
import AppKit

struct PreflightResult {
    var passed: Bool
    var imageCount: Int
    var iCloudCount: Int
    var localCount: Int
    var videoCount: Int
    var assetIdentifiers: [String]  // PHAsset localIdentifiers for images
}

enum Preflight {
    static func run(baseUrl: String) -> PreflightResult {
        var passed = true
        var identifiers: [String] = []
        var imageCount = 0
        var iCloudCount = 0
        var localCount = 0
        var videoCount = 0

        // Stage 1: macOS version
        let osVersion = ProcessInfo.processInfo.operatingSystemVersion
        if osVersion.majorVersion < 13 {
            printCheck("macOS version", ok: false, detail: "UNSUPPORTED_OS (need 13+, have \(osVersion.majorVersion))")
            passed = false
            return PreflightResult(passed: false, imageCount: 0, iCloudCount: 0, localCount: 0, videoCount: 0, assetIdentifiers: [])
        }
        printCheck("macOS \(osVersion.majorVersion).\(osVersion.minorVersion)", ok: true)

        // Stage 2: Photos app running
        let photosRunning = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.Photos")
        if photosRunning.isEmpty {
            print("  Photos not running — launching...")
            NSWorkspace.shared.open(URL(fileURLWithPath: "/System/Applications/Photos.app"))
            // Wait up to 10 seconds for it to launch
            var waited = 0
            while NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.Photos").isEmpty && waited < 10 {
                Thread.sleep(forTimeInterval: 1)
                waited += 1
            }
            if NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.Photos").isEmpty {
                printCheck("Photos running", ok: false, detail: "PHOTOS_NOT_RUNNING — could not launch")
                return PreflightResult(passed: false, imageCount: 0, iCloudCount: 0, localCount: 0, videoCount: 0, assetIdentifiers: [])
            }
        }
        printCheck("Photos running", ok: true)

        // Stage 3: Photos library authorization
        let authStatus = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        switch authStatus {
        case .authorized, .limited:
            printCheck("Photos library access", ok: true)
        case .notDetermined:
            print("  Requesting Photos access...")
            let sem = DispatchSemaphore(value: 0)
            var granted = false
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
                granted = (status == .authorized || status == .limited)
                sem.signal()
            }
            sem.wait()
            if granted {
                printCheck("Photos library access", ok: true)
            } else {
                printCheck("Photos library access", ok: false,
                    detail: "PHOTOS_ACCESS_DENIED\n  → Open: System Settings → Privacy & Security → Photos\n  → Enable: photo-uploader (or Terminal)")
                passed = false
                return PreflightResult(passed: false, imageCount: 0, iCloudCount: 0, localCount: 0, videoCount: 0, assetIdentifiers: [])
            }
        default:
            printCheck("Photos library access", ok: false,
                detail: "PHOTOS_ACCESS_DENIED\n  → Open: System Settings → Privacy & Security → Photos\n  → Enable: photo-uploader (or Terminal)")
            passed = false
            return PreflightResult(passed: false, imageCount: 0, iCloudCount: 0, localCount: 0, videoCount: 0, assetIdentifiers: [])
        }

        // Stage 4: Read selection via AppleScript (ScriptingBridge selection API
        // is limited; AppleScript is more reliable for getting selection IDs)
        let selectionResult = getPhotosSelection()
        switch selectionResult {
        case .failure(let error):
            if case .message(let msg) = error {
                printCheck("Photos selection", ok: false, detail: msg)
            }
            passed = false
            return PreflightResult(passed: false, imageCount: 0, iCloudCount: 0, localCount: 0, videoCount: 0, assetIdentifiers: [])
        case .success(let count) where count == 0:
            printCheck("Photos selection", ok: false, detail: "SELECTION_EMPTY — select photos in the Photos app first")
            passed = false
            return PreflightResult(passed: false, imageCount: 0, iCloudCount: 0, localCount: 0, videoCount: 0, assetIdentifiers: [])
        case .success(let count):
            printCheck("Selected assets: \(count)", ok: true)
        }

        // Stage 5 & 6: Enumerate assets via Photos.framework to classify and check iCloud status
        // We need to get the selected assets. Since ScriptingBridge selection → PHAsset bridging
        // is complex, we'll use a different approach: get ALL assets from the active album
        // and match against the selection count, or export via AppleScript.
        //
        // Practical approach: Use AppleScript to get media item IDs, then fetch via PHAsset.
        let assetInfo = classifySelectedAssets()
        imageCount = assetInfo.imageCount
        videoCount = assetInfo.videoCount
        iCloudCount = assetInfo.iCloudCount
        localCount = assetInfo.localCount
        identifiers = assetInfo.identifiers

        print("  Images: \(imageCount) (local: \(localCount), iCloud: \(iCloudCount))")
        if videoCount > 0 {
            print("  Videos: \(videoCount) (skipped)")
        }

        if imageCount == 0 {
            printCheck("Exportable images", ok: false, detail: "No images in selection")
            passed = false
        }

        // Stage 7: Backend connectivity (just check it's reachable)
        let reachable = checkBackendReachable(baseUrl: baseUrl)
        printCheck("Backend reachable", ok: reachable, detail: reachable ? nil : "SERVER_UNREACHABLE — \(baseUrl)")
        if !reachable { passed = false }

        return PreflightResult(
            passed: passed,
            imageCount: imageCount,
            iCloudCount: iCloudCount,
            localCount: localCount,
            videoCount: videoCount,
            assetIdentifiers: identifiers
        )
    }

    // MARK: - Helpers

    private static func printCheck(_ label: String, ok: Bool, detail: String? = nil) {
        let symbol = ok ? "✓" : "✗"
        print("  \(symbol) \(label)")
        if let detail = detail {
            for line in detail.split(separator: "\n") {
                print("    \(line)")
            }
        }
    }

    enum PreflightError: Error {
        case message(String)
    }

    private static func getPhotosSelection() -> Result<Int, PreflightError> {
        let script = """
        tell application "Photos"
            set sel to selection
            return count of sel
        end tell
        """
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-e", script]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = Pipe()

        do {
            try process.run()
            process.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if let count = Int(output) {
                return .success(count)
            }
            return .failure(.message("SCRIPTING_FAILURE — could not parse selection count: '\(output)'"))
        } catch {
            return .failure(.message("SCRIPTING_FAILURE — \(error.localizedDescription)"))
        }
    }

    struct AssetClassification {
        var imageCount: Int = 0
        var videoCount: Int = 0
        var localCount: Int = 0
        var iCloudCount: Int = 0
        var identifiers: [String] = []
    }

    private static func classifySelectedAssets() -> AssetClassification {
        // Get media item IDs from AppleScript
        let script = """
        tell application "Photos"
            set sel to selection
            set idList to {}
            repeat with item_ in sel
                set end of idList to id of item_
            end repeat
            return idList
        end tell
        """
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-e", script]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = Pipe()

        var result = AssetClassification()

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            print("  Warning: could not enumerate assets — \(error.localizedDescription)")
            return result
        }

        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let output = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        // AppleScript returns comma-separated IDs
        let ids = output.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        if ids.isEmpty { return result }

        // Fetch PHAssets by localIdentifier
        let fetchResult = PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil)
        fetchResult.enumerateObjects { asset, _, _ in
            if asset.mediaType == .video {
                result.videoCount += 1
                return
            }
            if asset.mediaType == .image {
                result.imageCount += 1
                result.identifiers.append(asset.localIdentifier)

                // Check if the asset's resources are local
                let resources = PHAssetResource.assetResources(for: asset)
                // If there are no resources, it's likely iCloud-only
                if resources.isEmpty {
                    result.iCloudCount += 1
                } else {
                    // Check if the primary resource is local
                    // (this is a heuristic — fully accurate check requires requesting data)
                    result.localCount += 1
                }
            }
        }

        // Assets not found via PHAsset (shared album items may not appear)
        let foundCount = result.imageCount + result.videoCount
        let missingCount = ids.count - foundCount
        if missingCount > 0 {
            // These are likely shared album photos — still exportable via AppleScript
            result.imageCount += missingCount
            result.iCloudCount += missingCount
            result.identifiers.append(contentsOf: ids.suffix(missingCount).map { String($0) })
        }

        return result
    }

    private static func checkBackendReachable(baseUrl: String) -> Bool {
        guard let url = URL(string: "\(baseUrl)/api/auth") else { return false }
        var request = URLRequest(url: url, timeoutInterval: 10)
        request.httpMethod = "HEAD"

        let sem = DispatchSemaphore(value: 0)
        var reachable = false

        URLSession.shared.dataTask(with: request) { _, response, error in
            // Any HTTP response means the server is reachable
            if let http = response as? HTTPURLResponse, http.statusCode > 0 {
                reachable = true
            }
            // Even a connection error might return something
            if error == nil { reachable = true }
            sem.signal()
        }.resume()

        sem.wait()
        return reachable
    }
}

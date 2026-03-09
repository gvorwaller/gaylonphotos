import Foundation
import Photos
import CryptoKit

struct UploadFailure {
    let filename: String
    let reason: String
}

enum PipelineItemState: String {
    case uploaded
    case failed
    case skipped
}

struct PipelineItemResult {
    let assetId: String
    let filename: String
    let state: PipelineItemState
    let filePath: String?
    let checksum: String?
    let errorCode: String?
    let errorMessage: String?
}

struct PipelineResults {
    var total: Int = 0
    var succeeded: Int = 0
    var failed: Int = 0
    var skipped: Int = 0
    var failures: [UploadFailure] = []
    var items: [PipelineItemResult] = []

    func writeJSON(to path: String) {
        let dict: [String: Any] = [
            "total": total,
            "succeeded": succeeded,
            "failed": failed,
            "skipped": skipped,
            "failures": failures.map { ["filename": $0.filename, "reason": $0.reason] },
            "items": items.map { item in
                [
                    "assetId": item.assetId,
                    "filename": item.filename,
                    "state": item.state.rawValue,
                    "filePath": item.filePath as Any,
                    "checksum": item.checksum as Any,
                    "errorCode": item.errorCode as Any,
                    "errorMessage": item.errorMessage as Any
                ]
            }
        ]
        if let data = try? JSONSerialization.data(withJSONObject: dict, options: .prettyPrinted) {
            try? data.write(to: URL(fileURLWithPath: path))
        }
    }
}

class ExportUploadPipeline {
    let session: APISession
    let collection: String
    let concurrency: Int
    let downloadOriginals: Bool
    let maxRetries: Int
    let exportTimeoutSec: Int
    let targetAssetIDs: Set<String>?
    let exportDir: String
    var currentProgress: String = ""  // e.g. "3/10" for progress display

    init(session: APISession,
         collection: String,
         concurrency: Int,
         downloadOriginals: Bool,
         maxRetries: Int,
         exportTimeoutSec: Int,
         targetAssetIDs: Set<String>? = nil) {
        self.session = session
        self.collection = collection
        self.concurrency = concurrency
        self.downloadOriginals = downloadOriginals
        self.maxRetries = max(1, maxRetries)
        self.exportTimeoutSec = max(60, exportTimeoutSec)
        self.targetAssetIDs = targetAssetIDs
        self.exportDir = NSTemporaryDirectory() + "photo-uploader-\(ProcessInfo.processInfo.processIdentifier)"
    }

    func run() -> PipelineResults {
        var results = PipelineResults()

        // Create temp export directory
        try? FileManager.default.createDirectory(atPath: exportDir, withIntermediateDirectories: true)

        // Get selection IDs via AppleScript
        print("\nReading Photos selection...")
        var ids = getSelectionIDs()
        if let targetAssetIDs {
            ids = ids.filter { targetAssetIDs.contains($0) }
            print("Retry filter active: processing \(ids.count) selected failed assets")
        }
        if ids.isEmpty {
            print("No photos selected.")
            return results
        }

        // Fetch PHAssets by ID (include all source types so shared album assets resolve)
        let fetchOpts = PHFetchOptions()
        fetchOpts.includeAssetSourceTypes = [.typeUserLibrary, .typeCloudShared, .typeiTunesSynced]
        let fetchResult = PHAsset.fetchAssets(withLocalIdentifiers: ids, options: fetchOpts)
        var assets: [PHAsset] = []
        fetchResult.enumerateObjects { asset, _, _ in
            assets.append(asset)
        }

        // IDs not resolved by PHAsset at all — fall back to AppleScript
        let resolvedIds = Set(assets.map { $0.localIdentifier })
        let unresolvedIds = ids.filter { !resolvedIds.contains($0) }

        // Classify resolved assets
        let imageAssets = assets.filter { $0.mediaType == .image }
        let videoCount = assets.filter { $0.mediaType == .video }.count

        // Split images by source: local library vs shared album
        // PHAssetResourceManager.writeData hangs on .typeCloudShared assets —
        // a known PhotoKit limitation. Shared album images must be exported
        // via AppleScript, which delegates to Photos.app's own export machinery.
        let localAssets = imageAssets.filter { !$0.sourceType.contains(.typeCloudShared) }
        let sharedAssets = imageAssets.filter { $0.sourceType.contains(.typeCloudShared) }
        let sharedIds = sharedAssets.map { $0.localIdentifier }

        // All IDs that need AppleScript export
        let appleScriptIds = sharedIds + unresolvedIds

        let totalImages = localAssets.count + appleScriptIds.count
        results.total = totalImages

        if videoCount > 0 {
            print("Skipping \(videoCount) videos.")
            results.skipped += videoCount
        }

        if !localAssets.isEmpty {
            print("  Local library images: \(localAssets.count)")
        }
        if !appleScriptIds.isEmpty {
            print("  Shared album images: \(appleScriptIds.count) (via AppleScript)")
        }
        print("Exporting and uploading \(totalImages) images...\n")

        var globalIndex = 0

        // 1. Export local library assets via PHAssetResourceManager (fast, direct)
        for asset in localAssets {
            globalIndex += 1
            let filename = asset.originalFilename ?? "photo-\(asset.localIdentifier.prefix(8)).jpg"
            currentProgress = "\(globalIndex)/\(totalImages)"
            print("  [\(currentProgress)] \(filename) ... ", terminator: "")
            fflush(stdout)

            let exportResult = exportAsset(asset, filename: filename)
            processExportResult(exportResult, assetId: asset.localIdentifier, filename: filename, results: &results)
        }

        // 2. Export shared album assets via Photos UI automation first, then
        // fallback to AppleScript export API.
        if !appleScriptIds.isEmpty {
            var batchResult = batchExportViaUIAutomation(itemIds: appleScriptIds)
            if batchResult.allSatisfy({ $0 == nil }) {
                print("  UI automation export returned no files.")
                let manualBatch = waitForManualExport(itemIds: appleScriptIds)
                if !manualBatch.allSatisfy({ $0 == nil }) {
                    batchResult = manualBatch
                } else {
                    print("  Manual export fallback did not produce files; skipping AppleScript export API fallback to avoid known hang.")
                }
            }

            for (idx, itemId) in appleScriptIds.enumerated() {
                globalIndex += 1
                let filename = sharedAssets.first(where: { $0.localIdentifier == itemId })?.originalFilename
                    ?? "shared-\(idx + 1)"
                currentProgress = "\(globalIndex)/\(totalImages)"
                print("  [\(currentProgress)] \(filename) ... ", terminator: "")
                fflush(stdout)

                if let filePath = batchResult[idx] {
                    let actualFilename = (filePath as NSString).lastPathComponent
                    let ext = (actualFilename as NSString).pathExtension.lowercased()
                    let imageExts = Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "tif", "tiff"])

                    if !imageExts.contains(ext) {
                        results.skipped += 1
                        results.items.append(PipelineItemResult(
                            assetId: itemId,
                            filename: actualFilename,
                            state: .skipped,
                            filePath: filePath,
                            checksum: nil,
                            errorCode: "UNSUPPORTED_EXTENSION",
                            errorMessage: "Skipped non-image extension: \(ext)"
                        ))
                        print("skipped (\(ext))")
                        try? FileManager.default.removeItem(atPath: filePath)
                        continue
                    }

                    let checksum = sha256Hex(fileAtPath: filePath)
                    let upload = uploadWithRetry(filePath: filePath, assetId: itemId)
                    if upload.ok {
                        results.succeeded += 1
                        results.items.append(PipelineItemResult(
                            assetId: itemId,
                            filename: actualFilename,
                            state: .uploaded,
                            filePath: filePath,
                            checksum: checksum,
                            errorCode: nil,
                            errorMessage: nil
                        ))
                        print("✓")
                    } else {
                        results.failed += 1
                        let reason = upload.errorMessage ?? "Unknown error"
                        results.failures.append(UploadFailure(filename: actualFilename, reason: reason))
                        results.items.append(PipelineItemResult(
                            assetId: itemId,
                            filename: actualFilename,
                            state: .failed,
                            filePath: filePath,
                            checksum: checksum,
                            errorCode: upload.errorCode ?? "UPLOAD_FAILED",
                            errorMessage: reason
                        ))
                        print("✗ \(reason)")
                    }
                    try? FileManager.default.removeItem(atPath: filePath)
                } else {
                    results.failed += 1
                    results.failures.append(UploadFailure(filename: filename, reason: "EXPORT_FAILED"))
                    results.items.append(PipelineItemResult(
                        assetId: itemId,
                        filename: filename,
                        state: .failed,
                        filePath: nil,
                        checksum: nil,
                        errorCode: "EXPORT_FAILED",
                        errorMessage: "Shared album export failed"
                    ))
                    print("✗ export failed")
                }
            }
        }

        return results
    }

    func cleanup() {
        try? FileManager.default.removeItem(atPath: exportDir)
    }

    // MARK: - Upload helper

    private func processExportResult(_ exportResult: (path: String?, error: String?),
                                      assetId: String,
                                      filename: String,
                                      results: inout PipelineResults) {
        if let filePath = exportResult.path {
            let checksum = sha256Hex(fileAtPath: filePath)
            let upload = uploadWithRetry(filePath: filePath, assetId: assetId)
            if upload.ok {
                results.succeeded += 1
                results.items.append(PipelineItemResult(
                    assetId: assetId,
                    filename: filename,
                    state: .uploaded,
                    filePath: filePath,
                    checksum: checksum,
                    errorCode: nil,
                    errorMessage: nil
                ))
                print("✓")
            } else {
                results.failed += 1
                let reason = upload.errorMessage ?? "Unknown error"
                results.failures.append(UploadFailure(filename: filename, reason: reason))
                results.items.append(PipelineItemResult(
                    assetId: assetId,
                    filename: filename,
                    state: .failed,
                    filePath: filePath,
                    checksum: checksum,
                    errorCode: upload.errorCode ?? "UPLOAD_FAILED",
                    errorMessage: reason
                ))
                print("✗ \(reason)")
            }
            try? FileManager.default.removeItem(atPath: filePath)
        } else {
            let reason = exportResult.error ?? "Unknown export error"
            results.failed += 1
            results.failures.append(UploadFailure(filename: filename, reason: reason))
            results.items.append(PipelineItemResult(
                assetId: assetId,
                filename: filename,
                state: .failed,
                filePath: nil,
                checksum: nil,
                errorCode: classifyExportError(reason),
                errorMessage: reason
            ))
            print("✗ \(reason)")
        }
    }

    private func classifyExportError(_ reason: String) -> String {
        if reason.contains("TIMEOUT") { return "EXPORT_TIMEOUT" }
        if reason.contains("No photo resource") { return "EXPORT_NOT_FOUND" }
        return "EXPORT_FAILED"
    }

    private func uploadWithRetry(filePath: String, assetId: String) -> UploadResponse {
        var attempt = 1
        var last = UploadResponse(
            ok: false,
            statusCode: nil,
            errorCode: "UPLOAD_FAILED",
            errorMessage: "Upload failed",
            retriable: false
        )
        while attempt <= maxRetries {
            let key = "\(assetId)-\(attempt)"
            last = session.uploadPhotoDetailed(filePath: filePath, collection: collection, idempotencyKey: key)
            if last.ok { return last }
            if !last.retriable || attempt == maxRetries { break }
            let delay = UInt32(min(8, Int(pow(2.0, Double(attempt - 1)))))
            sleep(delay)
            attempt += 1
        }
        if last.retriable && !last.ok && (last.errorCode == "NETWORK_ERROR" || last.errorCode == "NO_HTTP_RESPONSE") {
            return UploadResponse(
                ok: false,
                statusCode: last.statusCode,
                errorCode: "NETWORK_RETRY_EXHAUSTED",
                errorMessage: last.errorMessage,
                retriable: false
            )
        }
        return last
    }

    private func sha256Hex(fileAtPath path: String) -> String? {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)) else { return nil }
        let digest = SHA256.hash(data: data)
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    // MARK: - Photos.framework export (local library assets only)

    /// Export a single PHAsset to a temporary file using PHAssetResourceManager.
    /// Returns (filePath, errorMessage) — one will be nil.
    ///
    /// Uses PHAssetResourceManager.writeData(for:toFile:options:) which writes
    /// the asset's original resource directly to disk. This avoids PHImageManager
    /// entirely — PHImageManager's requestImageDataAndOrientation deadlocks in
    /// CLI contexts regardless of isSynchronous setting due to internal dispatch
    /// dependencies.
    ///
    /// PHAssetResourceManager works correctly from a background thread with
    /// NSApplication's event loop running on the main thread.
    private func exportAsset(_ asset: PHAsset, filename: String) -> (path: String?, error: String?) {
        let resources = PHAssetResource.assetResources(for: asset)

        // Find the best resource: prefer original, fall back to full-size
        let resource = resources.first(where: { $0.type == .photo })
            ?? resources.first(where: { $0.type == .fullSizePhoto })
            ?? resources.first

        guard let resource = resource else {
            return (nil, "No photo resource found")
        }

        let ext = (resource.originalFilename as NSString).pathExtension.lowercased()
        let exportFilename = (filename as NSString).deletingPathExtension + "." + (ext.isEmpty ? "jpg" : ext)
        let exportPath = "\(exportDir)/\(exportFilename)"
        let exportURL = URL(fileURLWithPath: exportPath)

        // Remove any stale file at the target path
        try? FileManager.default.removeItem(at: exportURL)

        let sem = DispatchSemaphore(value: 0)
        var errorMsg: String?

        let writeOptions = PHAssetResourceRequestOptions()
        writeOptions.isNetworkAccessAllowed = true  // Download from iCloud if needed
        writeOptions.progressHandler = { progress in
            // Show iCloud download progress inline (only for slow downloads)
            if progress > 0 && progress < 1 {
                print("\r  [\(self.currentProgress)] \(filename) ... iCloud \(Int(progress * 100))%", terminator: "")
                fflush(stdout)
            }
        }

        PHAssetResourceManager.default().writeData(
            for: resource,
            toFile: exportURL,
            options: writeOptions
        ) { error in
            if let error = error {
                errorMsg = "Export error: \(error.localizedDescription)"
            }
            sem.signal()
        }

        // Wait up to 5 minutes per photo (iCloud downloads can be slow)
        let waitResult = sem.wait(timeout: .now() + .seconds(exportTimeoutSec))
        if waitResult == .timedOut {
            // Cancel the request to free resources
            return (nil, "TIMEOUT — iCloud download took too long (\(exportTimeoutSec)s)")
        }

        if errorMsg == nil && FileManager.default.fileExists(atPath: exportPath) {
            return (exportPath, nil)
        }
        return (nil, errorMsg ?? "Export produced no file")
    }

    private func extensionFromUTI(_ uti: String?) -> String? {
        guard let uti = uti else { return nil }
        switch uti {
        case "public.jpeg": return "jpg"
        case "public.png": return "png"
        case "public.heic", "public.heif": return "heic"
        case "org.webmproject.webp": return "webp"
        case "public.tiff": return "tiff"
        default:
            // Try to extract from UTI string
            if uti.contains("jpeg") { return "jpg" }
            if uti.contains("png") { return "png" }
            if uti.contains("heic") || uti.contains("heif") { return "heic" }
            return "jpg" // fallback
        }
    }

    // MARK: - AppleScript export for shared album items
    //
    // PHAssetResourceManager.writeData and PHImageManager.requestImageData both
    // hang indefinitely on .typeCloudShared assets — a known PhotoKit limitation.
    // Photos.app's own export machinery (via AppleScript) works because it uses
    // private APIs to access the shared album cache.

    /// Batch-export assets via Photos UI automation (menu + dialogs).
    /// Requires Accessibility permissions for System Events.
    private func batchExportViaUIAutomation(itemIds: [String]) -> [String?] {
        let batchDir = exportDir + "/shared-ui-batch"
        try? FileManager.default.createDirectory(atPath: batchDir, withIntermediateDirectories: true)

        let idList = itemIds.map { "\"\($0)\"" }.joined(separator: ", ")
        let escapedPath = batchDir
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")

        let script = """
        tell application "Photos"
            activate
            set selectedItems to {}
            repeat with targetId in {\(idList)}
                try
                    set end of selectedItems to (media item id targetId)
                end try
            end repeat
            if (count of selectedItems) = 0 then
                return "ERROR:NO_ITEMS"
            end if
            set selection to selectedItems
        end tell

        tell application "System Events"
            tell process "Photos"
                set frontmost to true
                delay 0.5
                try
                    click menu item 1 of (every menu item of menu 1 of menu bar item "File" of menu bar 1 whose name starts with "Export Unmodified Original")
                on error
                    return "ERROR:EXPORT_MENU_NOT_FOUND"
                end try

                delay 0.8
                try
                    if exists sheet 1 of window 1 then
                        try
                            click button "Export" of sheet 1 of window 1
                        on error
                            click button 1 of sheet 1 of window 1
                        end try
                    end if
                end try
            end tell
        end tell

        tell application "System Events"
            tell process "Photos"
                delay 0.6
                keystroke "G" using {command down, shift down}
                delay 0.5
                keystroke "\(escapedPath)"
                key code 36
                delay 0.5
                key code 36
            end tell
        end tell

        delay 1.0
        return "OK"
        """

        print("  Exporting \(itemIds.count) shared album photos via Photos UI automation...")
        print("  Note: Accessibility permission is required for System Events.")
        fflush(stdout)

        let result = runAppleScript(script, timeout: exportTimeoutSec)
        if result.hasPrefix("ERROR:") {
            print("  UI automation export failed: \(result)")
            return Array(repeating: nil, count: itemIds.count)
        }

        return mapExportedFiles(batchDir: batchDir, itemIds: itemIds)
    }

    private func waitForManualExport(itemIds: [String]) -> [String?] {
        let batchDir = exportDir + "/shared-manual-batch"
        try? FileManager.default.createDirectory(atPath: batchDir, withIntermediateDirectories: true)

        print("")
        print("  Manual export fallback:")
        print("  1) In Photos, export the currently selected shared photos")
        print("  2) Destination folder: \(batchDir)")
        print("  3) Press Enter here when export is done (or type 'skip')")
        print("")
        print("  Continue: ", terminator: "")
        fflush(stdout)

        guard let input = readLine() else {
            return Array(repeating: nil, count: itemIds.count)
        }
        if input.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "skip" {
            return Array(repeating: nil, count: itemIds.count)
        }
        return mapExportedFiles(batchDir: batchDir, itemIds: itemIds)
    }

    /// Batch-export shared album items via AppleScript. Returns an array parallel
    /// to itemIds — each entry is a file path (success) or nil (failure).
    private func batchExportViaAppleScript(itemIds: [String]) -> [String?] {
        let batchDir = exportDir + "/shared-batch"
        try? FileManager.default.createDirectory(atPath: batchDir, withIntermediateDirectories: true)

        // Build AppleScript that exports all items at once
        let idList = itemIds.map { "media item id \"\($0)\"" }.joined(separator: ", ")
        let script = """
        tell application "Photos"
            try
                set exportPath to POSIX file "\(batchDir)" as alias
                set itemList to {\(idList)}
                export itemList to exportPath
                return "OK"
            on error errMsg
                return "ERROR:" & errMsg
            end try
        end tell
        """

        print("  Exporting \(itemIds.count) shared album photos via Photos.app...")
        fflush(stdout)

        let result = runAppleScript(script, timeout: exportTimeoutSec)

        if result.hasPrefix("ERROR:") {
            print("  AppleScript batch export failed: \(result)")
            return Array(repeating: nil, count: itemIds.count)
        }
        return mapExportedFiles(batchDir: batchDir, itemIds: itemIds)
    }

    private func getSelectionIDs() -> [String] {
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
        let output = runAppleScript(script, timeout: 60)
        return output.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    private func exportViaAppleScript(itemId: String) -> String? {
        let batchDir = exportDir + "/as-\(UUID().uuidString.prefix(8))"
        try? FileManager.default.createDirectory(atPath: batchDir, withIntermediateDirectories: true)

        let script = """
        tell application "Photos"
            try
                set item_ to media item id "\(itemId)"
                set exportPath to POSIX file "\(batchDir)" as alias
                export {item_} to exportPath
                return "OK"
            on error errMsg
                return "ERROR:" & errMsg
            end try
        end tell
        """
        let result = runAppleScript(script, timeout: exportTimeoutSec)

        if result.hasPrefix("ERROR:") {
            try? FileManager.default.removeItem(atPath: batchDir)
            return nil
        }

        // Find the exported file
        if let files = try? FileManager.default.contentsOfDirectory(atPath: batchDir), let first = files.first {
            return "\(batchDir)/\(first)"
        }
        try? FileManager.default.removeItem(atPath: batchDir)
        return nil
    }

    private func runAppleScript(_ script: String, timeout: Int) -> String {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-e", "with timeout of \(timeout) seconds\n\(script)\nend timeout"]
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = Pipe()

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return ""
        }

        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    private func mapExportedFiles(batchDir: String, itemIds: [String]) -> [String?] {
        guard let exportedFiles = try? FileManager.default.contentsOfDirectory(atPath: batchDir) else {
            return Array(repeating: nil, count: itemIds.count)
        }

        var fileByName: [String: String] = [:]
        for file in exportedFiles {
            fileByName[file] = "\(batchDir)/\(file)"
        }

        var results: [String?] = []
        for itemId in itemIds {
            let fetchOpts = PHFetchOptions()
            fetchOpts.includeAssetSourceTypes = [.typeCloudShared, .typeUserLibrary, .typeiTunesSynced]
            let fetch = PHAsset.fetchAssets(withLocalIdentifiers: [itemId], options: fetchOpts)
            var matched: String?
            if let asset = fetch.firstObject {
                let resources = PHAssetResource.assetResources(for: asset)
                if let origName = resources.first?.originalFilename, let path = fileByName[origName] {
                    matched = path
                    fileByName.removeValue(forKey: origName)
                }
            }
            if matched == nil, let (name, path) = fileByName.first {
                matched = path
                fileByName.removeValue(forKey: name)
            }
            results.append(matched)
        }
        return results
    }
}

// MARK: - PHAsset extension

extension PHAsset {
    /// Get the original filename from asset resources
    var originalFilename: String? {
        let resources = PHAssetResource.assetResources(for: self)
        return resources.first?.originalFilename
    }
}

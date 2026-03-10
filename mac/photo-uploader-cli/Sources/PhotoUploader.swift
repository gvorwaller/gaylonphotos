import ArgumentParser
import Foundation

struct PhotoUploader: ParsableCommand {
    static let configuration = CommandConfiguration(
        commandName: "photo-uploader",
        abstract: "Upload photos from Apple Photos selection to gaylon.photos"
    )

    @Option(name: .long, help: "Target collection slug (required for run/retry)")
    var collection: String = ""

    @Flag(name: .long, help: "Upload to gaylon.photos (default: localhost:5174)")
    var prod: Bool = false

    @Option(name: .long, help: "Custom base URL")
    var baseUrl: String?

    @Option(name: .long, help: "Concurrent uploads (default: 3)")
    var concurrency: Int = 3

    @Flag(name: .long, inversion: .prefixedNo, help: "Skip video assets (default: true)")
    var skipVideos: Bool = true

    @Flag(name: .long, help: "Enumerate and validate without uploading")
    var dryRun: Bool = false

    @Flag(name: .long, help: "Run all checks, report readiness, then exit")
    var preflight: Bool = false

    @Flag(name: .long, help: "Pre-download iCloud assets before export")
    var downloadOriginals: Bool = false

    @Option(name: .long, help: "Write JSON summary to file")
    var outputReport: String?

    @Option(name: .long, help: "Workspace directory for run artifacts")
    var workspace: String?

    @Option(name: .long, help: "Run ID to resume or inspect")
    var resume: String?

    @Flag(name: .long, help: "Show status for --resume run and exit")
    var status: Bool = false

    @Flag(name: .long, help: "Retry mode for --resume run (currently aliases run)")
    var retry: Bool = false

    @Option(name: .long, help: "Maximum retries per asset (reserved for retry-capable engine)")
    var maxRetries: Int = 3

    @Option(name: .long, help: "Export timeout in seconds (reserved for v1 exporter)")
    var exportTimeoutSec: Int = 600

    var resolvedBaseUrl: String {
        if let baseUrl = baseUrl { return baseUrl }
        return prod ? "https://gaylon.photos" : "http://localhost:5174"
    }

    /// Run the export+upload pipeline. Called from a background queue by the
    /// NSApplication delegate — the main thread is running the AppKit event loop
    /// so Photos.framework can service its XPC/iCloud callbacks.
    ///
    /// Returns the process exit code (0 = success, 1 = failure).
    func execute(session: APISession, googleMapsAPIKey: String? = nil) -> Int32 {
        if retry && (resume == nil || resume?.isEmpty == true) {
            printError("RETRY_REQUIRES_RUN_ID — pass --resume <run-id> with --retry")
            return 1
        }

        let workspaceRoot = workspace ?? RunWorkspace.defaultRootPath()
        let runId = resume ?? generatedRunID()
        let runWorkspace = RunWorkspace(rootPath: workspaceRoot, runId: runId)

        if status {
            do {
                try runWorkspace.printStatus()
                return 0
            } catch {
                printError("STATUS_FAILED — \(error.localizedDescription)")
                return 1
            }
        }

        var effectiveCollection = collection
        if retry && effectiveCollection.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            effectiveCollection = (try? runWorkspace.collectionName()) ?? ""
        }
        if effectiveCollection.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            printError("MISSING_COLLECTION — pass --collection <slug> for run/retry")
            return 1
        }

        let pipeline = ExportUploadPipeline(
            session: session,
            collection: effectiveCollection,
            concurrency: concurrency,
            downloadOriginals: downloadOriginals,
            maxRetries: maxRetries,
            exportTimeoutSec: exportTimeoutSec,
            targetAssetIDs: retry ? (try? runWorkspace.failedAssetIDs()) : nil,
            googleMapsAPIKey: googleMapsAPIKey
        )

        do {
            if retry {
                try runWorkspace.startRetry()
            } else {
                try runWorkspace.initialize(collection: effectiveCollection, baseUrl: resolvedBaseUrl)
            }
            print("Run workspace: \(runWorkspace.runDir)")
            if retry {
                let failedCount = (try? runWorkspace.failedAssetIDs().count) ?? 0
                print("Retry mode enabled: \(failedCount) failed assets queued")
            }
            print("Max retries: \(maxRetries), export timeout: \(exportTimeoutSec)s")
        } catch {
            printError("WORKSPACE_INIT_FAILED — \(error.localizedDescription)")
            return 1
        }

        let results = pipeline.run()

        do {
            try runWorkspace.finalize(results: results, isRetry: retry)
        } catch {
            printError("WORKSPACE_FINALIZE_FAILED — \(error.localizedDescription)")
        }

        // Summary
        print("")
        printHeader("Summary")
        print("Run ID:        \(runId)")
        print("Workspace:     \(runWorkspace.runDir)")
        print("Total images:  \(results.total)")
        print("Uploaded:      \(results.succeeded)")
        print("Failed:        \(results.failed)")
        print("Skipped:       \(results.skipped)")
        if pipeline.geocodedCount > 0 {
            print("Geocoded:      \(pipeline.geocodedCount)")
        }

        if !results.failures.isEmpty {
            print("\nFailed files:")
            for f in results.failures {
                print("  \(f.filename): \(f.reason)")
            }
        }

        // Write report if requested
        if let reportPath = outputReport {
            results.writeJSON(to: reportPath)
            print("\nReport written to \(reportPath)")
        }

        // Cleanup
        pipeline.cleanup()

        return results.failed > 0 ? 1 : 0
    }

    private func generatedRunID() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        return "run-\(formatter.string(from: Date()))-\(String(UUID().uuidString.prefix(8)).lowercased())"
    }
}

// MARK: - Helpers

func printHeader(_ title: String) {
    print(title)
    print(String(repeating: "─", count: title.count))
}

func printError(_ message: String) {
    FileHandle.standardError.write(Data("Error: \(message)\n".utf8))
}

func promptPassword() -> String? {
    print("Admin password: ", terminator: "")
    // Disable echo for password input
    var oldTermios = termios()
    tcgetattr(STDIN_FILENO, &oldTermios)
    var newTermios = oldTermios
    newTermios.c_lflag &= ~UInt(ECHO)
    tcsetattr(STDIN_FILENO, TCSANOW, &newTermios)
    let password = readLine()
    tcsetattr(STDIN_FILENO, TCSANOW, &oldTermios)
    print("") // newline after hidden input
    return password?.isEmpty == true ? nil : password
}

import AppKit
import ArgumentParser

// MARK: - NSApplication delegate

/// Photos.framework (PHImageManager) requires NSApplication's event loop to service
/// XPC connections to photoanalysisd/photolibraryd. A plain CLI without NSApplication
/// will deadlock on any PHImageManager request. This delegate dispatches the real work
/// to a background queue while the main thread runs the AppKit event loop.
class PhotoUploaderDelegate: NSObject, NSApplicationDelegate {
    private let command: PhotoUploader
    private let session: APISession

    init(command: PhotoUploader, session: APISession) {
        self.command = command
        self.session = session
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            let exitCode = command.execute(session: session)
            DispatchQueue.main.async {
                NSApp.terminate(nil)
            }
            // If NSApp.terminate is delayed by modal sheets (shouldn't happen with
            // .accessory policy), force exit after a short grace period.
            DispatchQueue.global().asyncAfter(deadline: .now() + 2) {
                Darwin.exit(exitCode)
            }
        }
    }
}

// MARK: - Entry point

// 1. Parse arguments (before NSApp.run — this is synchronous and fine).
let command: PhotoUploader
do {
    var parsed = try PhotoUploader.parseAsRoot()
    guard let uploaderCommand = parsed as? PhotoUploader else {
        try parsed.run()
        Darwin.exit(0)
    }
    command = uploaderCommand
} catch {
    PhotoUploader.exit(withError: error)
}

let url = command.resolvedBaseUrl
printHeader("Photo Uploader")
print("Collection: \(command.collection)")
print("Target:     \(url)")
print("")

// Fast path: status mode does not need preflight, auth, or NSApplication event loop.
if command.status {
    guard let runId = command.resume, !runId.isEmpty else {
        printError("STATUS_REQUIRES_RUN_ID — pass --resume <run-id> with --status")
        Darwin.exit(1)
    }
    let workspaceRoot = command.workspace ?? RunWorkspace.defaultRootPath()
    let runWorkspace = RunWorkspace(rootPath: workspaceRoot, runId: runId)
    do {
        try runWorkspace.printStatus()
        Darwin.exit(0)
    } catch {
        printError("STATUS_FAILED — \(error.localizedDescription)")
        Darwin.exit(1)
    }
}

let missingCollection = command.collection.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
if missingCollection && !(command.retry && command.resume != nil) {
    printError("MISSING_COLLECTION — pass --collection <slug> for run/retry")
    Darwin.exit(1)
}

// 2. Preflight (no PHImageManager calls — safe on main thread).
let preflightResult = Preflight.run(baseUrl: url)

if !preflightResult.passed {
    print("\n❌ BLOCKED — fix the issues above before uploading.")
    Darwin.exit(1)
}

if command.preflight {
    print("\n✓ READY TO UPLOAD")
    Darwin.exit(0)
}

if command.dryRun {
    print("\n✓ DRY RUN — \(preflightResult.imageCount) images would be uploaded.")
    Darwin.exit(0)
}

// 3. Collect credentials (stdin reads must happen before NSApp.run takes over the main thread).
print("")
print("Username: ", terminator: "")
guard let username = readLine(), !username.isEmpty else {
    printError("No username provided")
    Darwin.exit(1)
}
guard let password = promptPassword() else {
    printError("No password provided")
    Darwin.exit(1)
}

// 4. Authenticate (plain URLSession — safe on main thread).
print("Authenticating...")
let session = APISession(baseUrl: url)
guard session.login(username: username, password: password) else {
    printError("AUTH_FAILED — wrong password or server error")
    Darwin.exit(1)
}
print("Authenticated ✓")

// 5. Start NSApplication event loop — Photos.framework needs this running.
//    The delegate dispatches pipeline work to a background queue, then terminates.
let app = NSApplication.shared
app.setActivationPolicy(.accessory)  // No dock icon, no menu bar
let delegate = PhotoUploaderDelegate(command: command, session: session)
app.delegate = delegate
app.run()

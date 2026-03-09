import Foundation

struct RunMetadata: Codable {
    var runId: String
    var collection: String
    var baseUrl: String
    var startedAt: String
    var finishedAt: String?
    var status: String
    var total: Int
    var uploaded: Int
    var failed: Int
    var skipped: Int
}

struct ManifestRecord: Codable {
    var assetId: String
    var filename: String
    var filePath: String?
    var checksum: String?
    var exportStatus: String
    var uploadStatus: String
    var attempts: Int
    var errorCode: String?
    var errorMessage: String?
}

struct FailureRecord: Codable {
    var assetId: String
    var filename: String
    var errorCode: String?
    var errorMessage: String?
}

final class RunWorkspace {
    let rootPath: String
    let runId: String
    let runDir: String

    private var runJSONPath: String { "\(runDir)/run.json" }
    private var manifestPath: String { "\(runDir)/manifest.jsonl" }
    private var failuresPath: String { "\(runDir)/failures.jsonl" }

    init(rootPath: String, runId: String) {
        self.rootPath = rootPath
        self.runId = runId
        self.runDir = "\(rootPath)/\(runId)"
    }

    static func defaultRootPath() -> String {
        return FileManager.default.currentDirectoryPath + "/.photo-uploader-runs"
    }

    func initialize(collection: String, baseUrl: String) throws {
        try FileManager.default.createDirectory(atPath: runDir, withIntermediateDirectories: true)
        let metadata = RunMetadata(
            runId: runId,
            collection: collection,
            baseUrl: baseUrl,
            startedAt: isoNow(),
            finishedAt: nil,
            status: "running",
            total: 0,
            uploaded: 0,
            failed: 0,
            skipped: 0
        )
        try writeJSON(metadata, to: runJSONPath)
        try "".write(toFile: manifestPath, atomically: true, encoding: .utf8)
        try "".write(toFile: failuresPath, atomically: true, encoding: .utf8)
    }

    func startRetry() throws {
        var metadata = try readMetadata()
        metadata.status = "running_retry"
        metadata.finishedAt = nil
        try writeJSON(metadata, to: runJSONPath)
    }

    func finalize(results: PipelineResults, isRetry: Bool) throws {
        var metadata = try readMetadata()
        let existingByAsset = isRetry ? Dictionary(uniqueKeysWithValues: try readManifest().map { ($0.assetId, $0) }) : [:]

        var mergedByAsset = existingByAsset
        for item in results.items {
            let previous = existingByAsset[item.assetId]
            let attempts = (previous?.attempts ?? 0) + 1
            mergedByAsset[item.assetId] = ManifestRecord(
                assetId: item.assetId,
                filename: item.filename,
                filePath: item.filePath,
                checksum: item.checksum,
                exportStatus: item.state == .failed && (item.errorCode ?? "").hasPrefix("EXPORT") ? "failed" : "completed",
                uploadStatus: uploadStatus(for: item),
                attempts: attempts,
                errorCode: item.errorCode,
                errorMessage: item.errorMessage
            )
        }

        let merged = mergedByAsset.values.sorted { $0.assetId < $1.assetId }
        let uploaded = merged.filter { $0.uploadStatus == "uploaded" }.count
        let failed = merged.filter { $0.uploadStatus == "failed" }.count
        let skipped = merged.filter { $0.uploadStatus == "skipped" }.count

        metadata.finishedAt = isoNow()
        metadata.status = failed > 0 ? "completed_with_failures" : "completed"
        metadata.total = merged.count
        metadata.uploaded = uploaded
        metadata.failed = failed
        metadata.skipped = skipped
        try writeJSON(metadata, to: runJSONPath)
        try writeJSONL(merged, to: manifestPath)

        let failures = merged.filter { $0.uploadStatus == "failed" }.map { item in
            FailureRecord(
                assetId: item.assetId,
                filename: item.filename,
                errorCode: item.errorCode,
                errorMessage: item.errorMessage
            )
        }
        try writeJSONL(failures, to: failuresPath)
    }

    func printStatus() throws {
        let metadata = try readMetadata()
        printHeader("Run Status")
        print("Run ID:      \(metadata.runId)")
        print("Collection:  \(metadata.collection)")
        print("Target:      \(metadata.baseUrl)")
        print("Started:     \(metadata.startedAt)")
        print("Finished:    \(metadata.finishedAt ?? "-")")
        print("Status:      \(metadata.status)")
        print("Total:       \(metadata.total)")
        print("Uploaded:    \(metadata.uploaded)")
        print("Failed:      \(metadata.failed)")
        print("Skipped:     \(metadata.skipped)")
        print("")
        print("Artifacts:")
        print("  \(runJSONPath)")
        print("  \(manifestPath)")
        print("  \(failuresPath)")
    }

    func failedAssetIDs() throws -> Set<String> {
        return Set(try readManifest().filter { $0.uploadStatus == "failed" }.map(\.assetId))
    }

    func collectionName() throws -> String {
        return try readMetadata().collection
    }

    func readManifest() throws -> [ManifestRecord] {
        guard FileManager.default.fileExists(atPath: manifestPath) else { return [] }
        let data = try String(contentsOfFile: manifestPath, encoding: .utf8)
        return data
            .split(separator: "\n")
            .compactMap { line in
                guard let lineData = line.data(using: .utf8) else { return nil }
                return try? JSONDecoder().decode(ManifestRecord.self, from: lineData)
            }
    }

    private func uploadStatus(for item: PipelineItemResult) -> String {
        switch item.state {
        case .uploaded: return "uploaded"
        case .failed: return "failed"
        case .skipped: return "skipped"
        }
    }

    private func readMetadata() throws -> RunMetadata {
        let data = try Data(contentsOf: URL(fileURLWithPath: runJSONPath))
        return try JSONDecoder().decode(RunMetadata.self, from: data)
    }

    private func writeJSON<T: Encodable>(_ value: T, to path: String) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(value)
        try data.write(to: URL(fileURLWithPath: path))
    }

    private func writeJSONL<T: Encodable>(_ values: [T], to path: String) throws {
        let encoder = JSONEncoder()
        let lines = try values.map { value -> String in
            let data = try encoder.encode(value)
            return String(decoding: data, as: UTF8.self)
        }
        let output = lines.joined(separator: "\n") + (lines.isEmpty ? "" : "\n")
        try output.write(toFile: path, atomically: true, encoding: .utf8)
    }

    private func isoNow() -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: Date())
    }
}

import Foundation

struct UploadResponse {
    let ok: Bool
    let statusCode: Int?
    let errorCode: String?
    let errorMessage: String?
    let retriable: Bool
}

/// Handles authentication and file uploads to the gaylonphotos backend.
class APISession {
    let baseUrl: String
    private let session: URLSession
    private var cookies: [HTTPCookie] = []

    init(baseUrl: String) {
        self.baseUrl = baseUrl
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.timeoutIntervalForRequest = 120
        config.timeoutIntervalForResource = 300
        self.session = URLSession(configuration: config)
    }

    /// Login to the admin API. Returns true on success.
    func login(username: String, password: String) -> Bool {
        guard let url = URL(string: "\(baseUrl)/api/auth") else { return false }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(baseUrl, forHTTPHeaderField: "Origin")

        let body = ["username": username, "password": password]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        let sem = DispatchSemaphore(value: 0)
        var success = false

        session.dataTask(with: request) { data, response, error in
            defer { sem.signal() }
            guard let http = response as? HTTPURLResponse else { return }
            if http.statusCode == 200 {
                success = true
                // Cookies are stored automatically by HTTPCookieStorage
            }
        }.resume()

        sem.wait()
        return success
    }

    /// Upload a file to /api/photos with classified response metadata.
    func uploadPhotoDetailed(filePath: String, collection: String, idempotencyKey: String? = nil) -> UploadResponse {
        guard let url = URL(string: "\(baseUrl)/api/photos") else {
            return UploadResponse(
                ok: false,
                statusCode: nil,
                errorCode: "INVALID_URL",
                errorMessage: "Invalid URL",
                retriable: false
            )
        }

        let fileURL = URL(fileURLWithPath: filePath)
        let filename = fileURL.lastPathComponent

        // Build multipart form data
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue(baseUrl, forHTTPHeaderField: "Origin")
        if let idempotencyKey = idempotencyKey, !idempotencyKey.isEmpty {
            request.setValue(idempotencyKey, forHTTPHeaderField: "X-Upload-Idempotency-Key")
        }

        var body = Data()

        // Collection field
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"collection\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(collection)\r\n".data(using: .utf8)!)

        // File field
        guard let fileData = try? Data(contentsOf: fileURL) else {
            return UploadResponse(
                ok: false,
                statusCode: nil,
                errorCode: "FILE_READ_FAILED",
                errorMessage: "Could not read file",
                retriable: false
            )
        }

        let mimeType = guessMimeType(for: filename)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n".data(using: .utf8)!)

        // End boundary
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        let sem = DispatchSemaphore(value: 0)
        var uploadResult = UploadResponse(ok: false, statusCode: nil, errorCode: "UNKNOWN", errorMessage: "Unknown error", retriable: false)

        session.dataTask(with: request) { data, urlResponse, error in
            defer { sem.signal() }
            if let error = error {
                uploadResult = UploadResponse(
                    ok: false,
                    statusCode: nil,
                    errorCode: "NETWORK_ERROR",
                    errorMessage: error.localizedDescription,
                    retriable: true
                )
                return
            }
            guard let http = urlResponse as? HTTPURLResponse else {
                uploadResult = UploadResponse(
                    ok: false,
                    statusCode: nil,
                    errorCode: "NO_HTTP_RESPONSE",
                    errorMessage: "No HTTP response",
                    retriable: true
                )
                return
            }
            if http.statusCode == 201 {
                uploadResult = UploadResponse(ok: true, statusCode: 201, errorCode: nil, errorMessage: nil, retriable: false)
            } else {
                // Try to parse error from JSON response
                let parsedMessage: String?
                if let data = data,
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let err = json["error"] as? String {
                    parsedMessage = "HTTP \(http.statusCode): \(err)"
                } else {
                    parsedMessage = "HTTP \(http.statusCode)"
                }
                let status = http.statusCode
                let retriable = status == 429 || status >= 500
                let code: String
                if status >= 500 {
                    code = "UPLOAD_HTTP_5XX"
                } else if status >= 400 {
                    code = "UPLOAD_HTTP_4XX"
                } else {
                    code = "UPLOAD_HTTP_UNKNOWN"
                }
                uploadResult = UploadResponse(
                    ok: false,
                    statusCode: status,
                    errorCode: code,
                    errorMessage: parsedMessage,
                    retriable: retriable
                )
            }
        }.resume()

        sem.wait()
        return uploadResult
    }

    /// Backward-compatible thin wrapper.
    func uploadPhoto(filePath: String, collection: String) -> (Bool, String?) {
        let response = uploadPhotoDetailed(filePath: filePath, collection: collection, idempotencyKey: nil)
        return (response.ok, response.errorMessage)
    }

    private func guessMimeType(for filename: String) -> String {
        let ext = (filename as NSString).pathExtension.lowercased()
        switch ext {
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "webp": return "image/webp"
        case "heic": return "image/heic"
        case "heif": return "image/heif"
        case "tif", "tiff": return "image/tiff"
        default: return "application/octet-stream"
        }
    }
}

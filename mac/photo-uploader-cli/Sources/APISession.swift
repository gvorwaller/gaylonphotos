import Foundation

struct UploadResponse {
    let ok: Bool
    let statusCode: Int?
    let errorCode: String?
    let errorMessage: String?
    let retriable: Bool
    let photoId: String?
    let gps: (lat: Double, lng: Double)?
}

struct GeocodedLocation {
    let name: String
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
                retriable: false,
                photoId: nil,
                gps: nil
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
                retriable: false,
                photoId: nil,
                gps: nil
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
        var uploadResult = UploadResponse(ok: false, statusCode: nil, errorCode: "UNKNOWN", errorMessage: "Unknown error", retriable: false, photoId: nil, gps: nil)

        session.dataTask(with: request) { data, urlResponse, error in
            defer { sem.signal() }
            if let error = error {
                uploadResult = UploadResponse(
                    ok: false,
                    statusCode: nil,
                    errorCode: "NETWORK_ERROR",
                    errorMessage: error.localizedDescription,
                    retriable: true,
                    photoId: nil,
                    gps: nil
                )
                return
            }
            guard let http = urlResponse as? HTTPURLResponse else {
                uploadResult = UploadResponse(
                    ok: false,
                    statusCode: nil,
                    errorCode: "NO_HTTP_RESPONSE",
                    errorMessage: "No HTTP response",
                    retriable: true,
                    photoId: nil,
                    gps: nil
                )
                return
            }
            if http.statusCode == 201 {
                var photoId: String?
                var gps: (lat: Double, lng: Double)?
                if let data = data,
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let photo = json["photo"] as? [String: Any] {
                    photoId = photo["id"] as? String
                    if let gpsObj = photo["gps"] as? [String: Any],
                       let lat = gpsObj["lat"] as? Double,
                       let lng = gpsObj["lng"] as? Double {
                        gps = (lat: lat, lng: lng)
                    }
                }
                uploadResult = UploadResponse(ok: true, statusCode: 201, errorCode: nil, errorMessage: nil, retriable: false, photoId: photoId, gps: gps)
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
                    retriable: retriable,
                    photoId: nil,
                    gps: nil
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

    /// Reverse-geocode GPS coordinates via Google Maps Geocoding REST API.
    func reverseGeocode(lat: Double, lng: Double, apiKey: String) -> String? {
        guard let url = URL(string: "https://maps.googleapis.com/maps/api/geocode/json?latlng=\(lat),\(lng)&key=\(apiKey)") else { return nil }

        let sem = DispatchSemaphore(value: 0)
        var placeName: String?

        URLSession.shared.dataTask(with: url) { data, _, _ in
            defer { sem.signal() }
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let status = json["status"] as? String, status == "OK",
                  let results = json["results"] as? [[String: Any]],
                  !results.isEmpty else { return }

            placeName = Self.formatPlaceName(results: results)
        }.resume()

        sem.wait()
        return placeName
    }

    /// Update a photo's metadata via PUT /api/photos.
    func updatePhotoMetadata(collection: String, photoId: String, updates: [String: Any]) -> Bool {
        guard let url = URL(string: "\(baseUrl)/api/photos") else { return false }

        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(baseUrl, forHTTPHeaderField: "Origin")

        let body: [String: Any] = ["collection": collection, "photoId": photoId, "updates": updates]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        let sem = DispatchSemaphore(value: 0)
        var success = false

        session.dataTask(with: request) { _, response, _ in
            defer { sem.signal() }
            if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                success = true
            }
        }.resume()

        sem.wait()
        return success
    }

    // MARK: - Geocoding helpers

    private static let PLUS_CODE_RE = try! NSRegularExpression(pattern: "^[23456789CFGHJMPQRVWX]+\\+[23456789CFGHJMPQRVWX]*$")

    private static func findComponent(_ results: [[String: Any]], type: String) -> [String: Any]? {
        for result in results {
            if let components = result["address_components"] as? [[String: Any]] {
                for comp in components {
                    if let types = comp["types"] as? [String], types.contains(type) {
                        return comp
                    }
                }
            }
        }
        return nil
    }

    private static func formatPlaceName(results: [[String: Any]]) -> String? {
        guard let first = results.first,
              let components = first["address_components"] as? [[String: Any]] else { return nil }

        func get(_ type: String) -> String? {
            components.first { ($0["types"] as? [String])?.contains(type) == true }?["long_name"] as? String
        }
        func getShort(_ type: String) -> String? {
            components.first { ($0["types"] as? [String])?.contains(type) == true }?["short_name"] as? String
        }

        let poi = findComponent(results, type: "point_of_interest")
            ?? findComponent(results, type: "park")
            ?? findComponent(results, type: "establishment")
        let poiName = poi?["long_name"] as? String

        let country = get("country")
        let state = get("administrative_area_level_1")
        let stateShort = getShort("administrative_area_level_1")
        let city = get("locality") ?? get("sublocality") ?? get("natural_feature")
            ?? get("administrative_area_level_2") ?? state

        var region: String?
        if country == "United States", let s = stateShort {
            region = s
        } else if let c = country {
            region = c
        }

        if let poiName = poiName, let region = region, poiName != city {
            return "\(poiName), \(region)"
        }

        guard let city = city else {
            if let formatted = first["formatted_address"] as? String {
                let firstPart = formatted.split(separator: ",").first.map(String.init) ?? formatted
                let range = NSRange(firstPart.startIndex..., in: firstPart)
                if PLUS_CODE_RE.firstMatch(in: firstPart, range: range) == nil {
                    return formatted
                }
            }
            return nil
        }

        if let region = region, city != country, city != state {
            return "\(city), \(region)"
        }

        return city
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

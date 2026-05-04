// Models/GatewayPairing.swift
// OpenClaw Work Console
// Parses QR/deep-link gateway pairing payloads.

import Foundation

struct GatewayPairing: Equatable {
    let name: String
    let baseURL: String
    let token: String

    enum ParseError: LocalizedError {
        case unsupportedFormat
        case missingField(String)
        case invalidURL

        var errorDescription: String? {
            switch self {
            case .unsupportedFormat:
                return "Paste an OpenClaw pairing link or pairing JSON."
            case .missingField(let field):
                return "Pairing code is missing \(field)."
            case .invalidURL:
                return "Pairing code contains an invalid gateway URL."
            }
        }
    }

    static func parse(_ rawValue: String) throws -> GatewayPairing {
        let raw = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { throw ParseError.unsupportedFormat }

        if raw.hasPrefix("{") {
            return try parseJSON(raw)
        }

        guard let url = URL(string: raw),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            throw ParseError.unsupportedFormat
        }

        let isPairingLink = url.scheme == "openclaw" && url.host == "pair"
        guard isPairingLink else { throw ParseError.unsupportedFormat }

        let items = Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value ?? "") })
        return try build(
            name: items["name"],
            baseURL: items["base_url"] ?? items["baseUrl"] ?? items["baseURL"],
            token: items["token"]
        )
    }

    private static func parseJSON(_ raw: String) throws -> GatewayPairing {
        guard let data = raw.data(using: .utf8) else { throw ParseError.unsupportedFormat }
        let payload = try JSONDecoder().decode(GatewayPairingJSONPayload.self, from: data)
        guard payload.type == "openclaw.gateway.pairing.v1" else {
            throw ParseError.unsupportedFormat
        }
        return try build(name: payload.name, baseURL: payload.baseURL, token: payload.token)
    }

    private static func build(name: String?, baseURL: String?, token: String?) throws -> GatewayPairing {
        let cleanedName = (name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanedURL = (baseURL ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let cleanedToken = (token ?? "").trimmingCharacters(in: .whitespacesAndNewlines)

        guard !cleanedURL.isEmpty else { throw ParseError.missingField("base_url") }
        guard !cleanedToken.isEmpty else { throw ParseError.missingField("token") }
        guard cleanedURL.hasPrefix("https://") || cleanedURL.hasPrefix("http://") else {
            throw ParseError.invalidURL
        }

        return GatewayPairing(
            name: cleanedName.isEmpty ? "OpenClaw Gateway" : cleanedName,
            baseURL: cleanedURL,
            token: cleanedToken
        )
    }

}

private struct GatewayPairingJSONPayload: Decodable {
    let type: String
    let name: String?
    let baseURL: String?
    let token: String?

    enum CodingKeys: String, CodingKey {
        case type
        case name
        case baseURL = "base_url"
        case token
    }
}

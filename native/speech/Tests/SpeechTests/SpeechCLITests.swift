import Foundation
import Testing

@Suite("Speech CLI")
struct SpeechCLISuite {
    @Test("transcribes Japanese fixture")
    func japaneseSampleTranscription() throws {
        guard ProcessInfo.processInfo.environment["SEAM_ENABLE_STT_TESTS"] == "1" else {
            return // Explicit opt-in required; treat as skipped.
        }

        let binaryURL = try productsDirectory().appendingPathComponent("speech")
        guard let fixtureURL = Bundle.module.url(forResource: "ja_sample", withExtension: "m4a", subdirectory: "Fixtures") else {
            throw TestError.fixtureNotFound
        }

        let process = Process()
        process.executableURL = binaryURL
        process.arguments = [fixtureURL.path, "--locale=ja-JP", "--json", "--timeout=30"]

        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr

        try process.run()
        process.waitUntilExit()

        let stdoutData = stdout.fileHandleForReading.readDataToEndOfFile()
        let stderrData = stderr.fileHandleForReading.readDataToEndOfFile()

        let stderrString = String(decoding: stderrData, as: UTF8.self)
        if process.terminationStatus != 0 {
            if stderrString.contains("authorization was denied") || stderrString.contains("authorizationDenied") {
                return // Speech recognition permission not granted; treat as skipped.
            }
            throw TestError.unexpectedExit(code: Int(process.terminationStatus), message: stderrString)
        }

        struct RecognitionPayload: Decodable {
            struct Segment: Decodable {
                let substring: String
                let confidence: Float
                let timestamp: TimeInterval
                let duration: TimeInterval
            }

            let locale: String
            let text: String
            let confidence: Float
            let segments: [Segment]
            let audioPath: String
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let payload = try decoder.decode(RecognitionPayload.self, from: stdoutData)

        #expect(payload.locale == "ja-JP")
        #expect(payload.confidence > 0.0)
        #expect(!payload.segments.isEmpty)
        #expect(payload.text.contains("テスト"), "Recognized text should contain 'テスト'. Actual: \(payload.text)")
        #expect(!payload.text.isEmpty)
        #expect(payload.audioPath.hasSuffix("ja_sample.m4a"))
    }

    private func productsDirectory() throws -> URL {
        #if os(macOS)
        for bundle in Bundle.allBundles where bundle.bundlePath.hasSuffix(".xctest") {
            return bundle.bundleURL.deletingLastPathComponent()
        }
        throw TestError.productsDirectoryNotFound
        #else
        return URL(fileURLWithPath: "")
        #endif
    }
}

enum TestError: Error, CustomStringConvertible {
    case fixtureNotFound
    case productsDirectoryNotFound
    case unexpectedExit(code: Int, message: String)

    var description: String {
        switch self {
        case .fixtureNotFound:
            return "Fixture audio not found in bundled resources."
        case .productsDirectoryNotFound:
            return "Failed to locate products directory for speech binary."
        case let .unexpectedExit(code, message):
            return "speech CLI exited with status \(code): \(message)"
        }
    }
}

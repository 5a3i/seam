import Foundation
import Speech
import Atomics

// MARK: - Configuration

struct AppConfig {
    enum OutputFormat {
        case plain
        case json
    }

    let audioURL: URL
    let localeIdentifier: String
    let outputFormat: OutputFormat
    let timeout: TimeInterval
}

enum AppError: Error, CustomStringConvertible {
    case missingAudioPath
    case fileNotFound(String)
    case invalidLocale(String)
    case authorizationDenied
    case recognitionUnavailable
    case timeout

    var description: String {
        switch self {
        case .missingAudioPath:
            return "Audio file path is required. Run with --help for usage."
        case .fileNotFound(let path):
            return "Audio file not found at path: \(path)"
        case .invalidLocale(let identifier):
            return "Invalid locale identifier: \(identifier)"
        case .authorizationDenied:
            return "Speech recognition authorization was denied. Enable it in System Settings > Privacy & Security > Speech Recognition."
        case .recognitionUnavailable:
            return "Speech recognition is not available for the selected locale on this device."
        case .timeout:
            return "Speech recognition timed out before receiving a response."
        }
    }
}

// MARK: - Entry Point

@main
struct SpeechCLI {
    static func main() {
        do {
            let config = try parseArguments()
            try run(config: config)
        } catch AppError.missingAudioPath {
            printUsage()
            exit(1)
        } catch let error as AppError {
            fputs("❌ \(error.description)\n", stderr)
            exit(2)
        } catch {
            fputs("❌ Unexpected error: \(error.localizedDescription)\n", stderr)
            exit(3)
        }
    }
}

// MARK: - Core Logic

private func run(config: AppConfig) throws {
    fputs("[speech] Starting recognition for: \(config.audioURL.path)\n", stderr)
    fputs("[speech] Locale: \(config.localeIdentifier), Timeout: \(config.timeout)s\n", stderr)

    try ensureAuthorization()
    fputs("[speech] Authorization granted\n", stderr)

    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: config.localeIdentifier)) else {
        throw AppError.invalidLocale(config.localeIdentifier)
    }
    fputs("[speech] Recognizer created for locale: \(config.localeIdentifier)\n", stderr)

    guard recognizer.isAvailable else {
        throw AppError.recognitionUnavailable
    }
    fputs("[speech] Recognizer is available\n", stderr)

    let request = SFSpeechURLRecognitionRequest(url: config.audioURL)
    request.shouldReportPartialResults = true

    // Enable on-device recognition for better accuracy and privacy
    if #available(macOS 12.0, *), recognizer.supportsOnDeviceRecognition {
        request.requiresOnDeviceRecognition = true
        fputs("[speech] Using on-device recognition for better accuracy and privacy\n", stderr)
    } else {
        fputs("[speech] On-device recognition not available, using server-based\n", stderr)
    }

    // Enable automatic punctuation (macOS 13+)
    if #available(macOS 13.0, *) {
        request.addsPunctuation = true
        fputs("[speech] Automatic punctuation enabled\n", stderr)
    }

    let semaphore = DispatchSemaphore(value: 0)
    var finalResult: SFSpeechRecognitionResult?
    var finalError: Error?

    fputs("[speech] Starting recognition task...\n", stderr)
    var hasReceivedAnyResult = false
    let task = recognizer.recognitionTask(with: request) { result, error in
        if let result = result {
            hasReceivedAnyResult = true
            fputs("[speech] Got result, isFinal: \(result.isFinal), text: \(result.bestTranscription.formattedString)\n", stderr)
            finalResult = result
            if result.isFinal {
                fputs("[speech] Final result received, signaling completion\n", stderr)
                semaphore.signal()
            }
        }
        if let error = error {
            fputs("[speech] Got error: \(error.localizedDescription)\n", stderr)
            finalError = error
            semaphore.signal()
        }
    }

    fputs("[speech] Waiting for recognition to complete (timeout: \(config.timeout)s)...\n", stderr)

    // Wait on a background queue to keep the main RunLoop running
    let waitQueue = DispatchQueue.global(qos: .userInitiated)
    let timedOut = ManagedAtomic(false)

    waitQueue.async {
        let waitResult = semaphore.wait(timeout: .now() + config.timeout)
        timedOut.store(waitResult == .timedOut, ordering: .relaxed)
        // Stop the RunLoop after timeout or completion
        CFRunLoopStop(CFRunLoopGetMain())
    }

    // Run the main RunLoop to allow SFSpeechRecognizer callbacks to fire
    CFRunLoopRun()

    task.cancel()
    fputs("[speech] Task cancelled, hasReceivedAnyResult: \(hasReceivedAnyResult)\n", stderr)

    let didTimeOut = timedOut.load(ordering: .relaxed)

    if didTimeOut {
        if hasReceivedAnyResult {
            fputs("[speech] Timed out but using partial result\n", stderr)
            // Use the partial result if we got something
        } else {
            throw AppError.timeout
        }
    }

    if let error = finalError {
        throw error
    }

    guard let result = finalResult else {
        throw AppError.timeout
    }

    switch config.outputFormat {
    case .plain:
        print(result.bestTranscription.formattedString)
    case .json:
        let payload = RecognitionPayload(result: result, locale: config.localeIdentifier, audioURL: config.audioURL)
        let jsonData = try JSONEncoder.outputEncoder.encode(payload)
        FileHandle.standardOutput.write(jsonData)
        if jsonData.last != 0x0A {
            FileHandle.standardOutput.write(Data([0x0A]))
        }
    }
}

private func ensureAuthorization() throws {
    let semaphore = DispatchSemaphore(value: 0)
    var status: SFSpeechRecognizerAuthorizationStatus = .notDetermined
    SFSpeechRecognizer.requestAuthorization { newStatus in
        status = newStatus
        semaphore.signal()
    }
    semaphore.wait()

    switch status {
    case .authorized:
        return
    case .denied, .restricted:
        throw AppError.authorizationDenied
    case .notDetermined:
        throw AppError.authorizationDenied
    @unknown default:
        throw AppError.authorizationDenied
    }
}

// MARK: - Argument Parsing

private func parseArguments() throws -> AppConfig {
    var arguments = CommandLine.arguments.dropFirst()
    if arguments.contains("--help") || arguments.contains("-h") {
        throw AppError.missingAudioPath
    }

    guard let path = arguments.first else {
        throw AppError.missingAudioPath
    }
    arguments = arguments.dropFirst()

    let url = URL(fileURLWithPath: path)
    guard FileManager.default.fileExists(atPath: url.path) else {
        throw AppError.fileNotFound(path)
    }

    var localeIdentifier = Locale.current.identifier
    var outputFormat: AppConfig.OutputFormat = .plain
    var timeout: TimeInterval = 30

    for argument in arguments {
        if argument.hasPrefix("--locale=") {
            let value = String(argument.dropFirst("--locale=".count))
            guard Locale.availableIdentifiers.contains(value) else {
                throw AppError.invalidLocale(value)
            }
            localeIdentifier = value
        } else if argument == "--json" {
            outputFormat = .json
        } else if argument.hasPrefix("--timeout=") {
            let value = String(argument.dropFirst("--timeout=".count))
            if let seconds = TimeInterval(value), seconds > 0 {
                timeout = seconds
            }
        }
    }

    return AppConfig(
        audioURL: url,
        localeIdentifier: localeIdentifier,
        outputFormat: outputFormat,
        timeout: timeout
    )
}

private func printUsage() {
    let usage = """
    Usage: speech <audio-file-path> [--locale=ja-JP] [--json] [--timeout=30]

    Options:
      --locale=<identifier>   Locale for recognition (default: system locale)
      --json                  Output JSON payload with transcription metadata
      --timeout=<seconds>     Seconds to wait before timing out (default: 30)
      -h, --help              Show this help message
    """
    print(usage)
}

// MARK: - Output Models

private struct RecognitionPayload: Encodable {
    struct Segment: Encodable {
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

    init(result: SFSpeechRecognitionResult, locale: String, audioURL: URL) {
        self.locale = locale
        self.text = result.bestTranscription.formattedString
        self.confidence = result.bestTranscription.segments.map { $0.confidence }.average
        self.segments = result.bestTranscription.segments.map { segment in
            Segment(
                substring: segment.substring,
                confidence: segment.confidence,
                timestamp: segment.timestamp,
                duration: segment.duration
            )
        }
        self.audioPath = audioURL.path
    }
}

private extension Sequence where Element == Float {
    var average: Float {
        var total: Float = 0
        var count: Float = 0
        for value in self {
            total += value
            count += 1
        }
        return count > 0 ? total / count : 0
    }
}

private extension JSONEncoder {
    static var outputEncoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}

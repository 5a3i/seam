// swift-tools-version: 6.1
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription
import Foundation

let packageRoot = (#filePath as NSString).deletingLastPathComponent
let infoPlistPath = "\(packageRoot)/Sources/speech/Info.plist"

let package = Package(
    name: "speech",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "speech", targets: ["speech"])
    ],
    targets: [
        .executableTarget(
            name: "speech",
            dependencies: [],
            exclude: ["Info.plist"],
            swiftSettings: [
                .unsafeFlags([
                    "-Xlinker", "-sectcreate",
                    "-Xlinker", "__TEXT",
                    "-Xlinker", "__info_plist",
                    "-Xlinker", infoPlistPath
                ])
            ],
            linkerSettings: [
                .linkedFramework("Speech"),
                .linkedFramework("AVFoundation")
            ]
        )
    ]
)

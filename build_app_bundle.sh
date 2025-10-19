#!/bin/zsh
set -euo pipefail
APP_ROOT="$(pwd)/.build/debug/SpeechCLI.app"
BIN_SRC="$(pwd)/.build/debug/speech"
rm -rf "$APP_ROOT"
mkdir -p "$APP_ROOT/Contents/MacOS"
cp "$BIN_SRC" "$APP_ROOT/Contents/MacOS/speech"
cat >"$APP_ROOT/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>speech</string>
    <key>CFBundleIdentifier</key>
    <string>dev.sanma.speech</string>
    <key>CFBundleName</key>
    <string>Sanma Speech CLI</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>NSSpeechRecognitionUsageDescription</key>
    <string>Sanma transcribes recordings locally.</string>
    <key>NSMicrophoneUsageDescription</key>
    <string>Sanma records audio snippets for transcription.</string>
</dict>
</plist>
PLIST
codesign --force --sign - --entitlements entitlements.plist "${APP_ROOT}"

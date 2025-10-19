#!/bin/zsh
set -euo pipefail

echo "🏗️  Building Sanma Codex Electron App..."

# Define paths
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$PROJECT_ROOT/app"
NATIVE_DIR="$PROJECT_ROOT/native/speech"
BUILD_DIR="$PROJECT_ROOT/release"
APP_BUNDLE="$BUILD_DIR/Sanma Codex.app"
APP_CONTENTS="$APP_BUNDLE/Contents"
APP_MACOS="$APP_CONTENTS/MacOS"
APP_RESOURCES="$APP_CONTENTS/Resources"

echo "📁 Project root: $PROJECT_ROOT"

# Clean previous build
echo "🧹 Cleaning previous build..."
rm -rf "$BUILD_DIR"
mkdir -p "$APP_MACOS"
mkdir -p "$APP_RESOURCES/app"

# Build Swift speech binary
echo "🔨 Building native speech binary..."
cd "$NATIVE_DIR"
swift build -c release
cp .build/release/speech "$APP_RESOURCES/speech"
cd "$PROJECT_ROOT"

# Build Electron app
echo "⚛️  Building Electron app..."
cd "$APP_DIR"
npm run build

# Copy built files
echo "📦 Copying application files..."
mkdir -p "$APP_RESOURCES/app/dist"
mkdir -p "$APP_RESOURCES/app/dist-electron"
cp -r dist/* "$APP_RESOURCES/app/dist/"
cp -r dist-electron/* "$APP_RESOURCES/app/dist-electron/"
cp package.json "$APP_RESOURCES/app/"

# Copy node_modules (includes all dependencies, but native modules are already built correctly)
echo "📦 Copying node_modules..."
cp -r node_modules "$APP_RESOURCES/app/"

# Find Electron binary
ELECTRON_PATH="$APP_DIR/node_modules/electron/dist/Electron.app"
if [ ! -d "$ELECTRON_PATH" ]; then
    echo "❌ Electron not found at $ELECTRON_PATH"
    exit 1
fi

# Copy Electron framework
echo "📋 Copying Electron framework..."
cp -r "$ELECTRON_PATH/Contents/MacOS/Electron" "$APP_MACOS/Sanma Codex"
cp -r "$ELECTRON_PATH/Contents/Frameworks" "$APP_CONTENTS/"
cp -r "$ELECTRON_PATH/Contents/Resources"/*.lproj "$APP_RESOURCES/" 2>/dev/null || true

# Create Info.plist
echo "📄 Creating Info.plist..."
cat >"$APP_CONTENTS/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDisplayName</key>
    <string>Sanma Codex</string>
    <key>CFBundleExecutable</key>
    <string>Sanma Codex</string>
    <key>CFBundleIconFile</key>
    <string>electron.icns</string>
    <key>CFBundleIdentifier</key>
    <string>com.sanma.codex</string>
    <key>CFBundleName</key>
    <string>Sanma Codex</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSMicrophoneUsageDescription</key>
    <string>Sanma Codex needs access to your microphone to record and transcribe meeting audio.</string>
    <key>NSSpeechRecognitionUsageDescription</key>
    <string>Sanma Codex uses speech recognition to transcribe your meeting recordings.</string>
</dict>
</plist>
PLIST

# Copy icon if exists
if [ -f "$ELECTRON_PATH/Contents/Resources/electron.icns" ]; then
    cp "$ELECTRON_PATH/Contents/Resources/electron.icns" "$APP_RESOURCES/"
fi

# Update package.json main entry to point to built main.js
cd "$APP_RESOURCES/app"
node -e "
const pkg = require('./package.json');
pkg.main = 'dist-electron/main.js';
require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2));
"

# Sign the app (ad-hoc signature for local distribution)
echo "✍️  Signing application..."
cd "$PROJECT_ROOT"
codesign --force --deep --sign - "$APP_BUNDLE"

echo "✅ Build complete!"
echo "📦 Application bundle created at: $APP_BUNDLE"
echo ""
echo "You can now:"
echo "  - Open the app: open \"$APP_BUNDLE\""
echo "  - Share the entire 'release' folder with others"
echo "  - Create a DMG for easier distribution (requires additional tools)"

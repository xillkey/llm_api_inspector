#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/renderer/imgs/logo.png"
BUILD="$ROOT/build"
ICONSET="$BUILD/icon.iconset"

mkdir -p "$BUILD"

sips -z 1024 1024 "$SOURCE" --out "$BUILD/icon.png"

rm -rf "$ICONSET"
mkdir -p "$ICONSET"

sips -z 16 16 "$SOURCE" --out "$ICONSET/icon_16x16.png"
sips -z 32 32 "$SOURCE" --out "$ICONSET/icon_16x16@2x.png"
sips -z 32 32 "$SOURCE" --out "$ICONSET/icon_32x32.png"
sips -z 64 64 "$SOURCE" --out "$ICONSET/icon_32x32@2x.png"
sips -z 128 128 "$SOURCE" --out "$ICONSET/icon_128x128.png"
sips -z 256 256 "$SOURCE" --out "$ICONSET/icon_128x128@2x.png"
sips -z 256 256 "$SOURCE" --out "$ICONSET/icon_256x256.png"
sips -z 512 512 "$SOURCE" --out "$ICONSET/icon_256x256@2x.png"
sips -z 512 512 "$SOURCE" --out "$ICONSET/icon_512x512.png"
sips -z 1024 1024 "$SOURCE" --out "$ICONSET/icon_512x512@2x.png"

iconutil -c icns "$ICONSET" -o "$BUILD/icon.icns"
rm -rf "$ICONSET"

echo "Generated build/icon.png and build/icon.icns"

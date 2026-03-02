#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# PACT Mobile — Auto Version Stamper
# Sets version: 1.01.0+<git-commit-count> in pubspec.yaml before every build.
# Usage:
#   chmod +x scripts/set_version.sh
#   ./scripts/set_version.sh          # stamp only
#   ./scripts/set_version.sh android  # stamp + build APK
#   ./scripts/set_version.sh ios      # stamp + build IPA
# ─────────────────────────────────────────────────────────────────────────────

set -e

VERSION_NAME="1.01.0"
PUBSPEC="$(dirname "$0")/../pubspec.yaml"

# Auto build number = total git commit count in this repo
BUILD_NUMBER=$(git rev-list --count HEAD 2>/dev/null || echo "1")

# Stamp pubspec.yaml
sed -i.bak "s/^version: .*/version: ${VERSION_NAME}+${BUILD_NUMBER}/" "$PUBSPEC"
rm -f "${PUBSPEC}.bak"

echo "✓ Version set to PACT v${VERSION_NAME} (build ${BUILD_NUMBER})"

# Optional: build target
TARGET="${1:-}"
if [ "$TARGET" = "android" ]; then
  echo "→ Building Android APK..."
  flutter build apk --release
elif [ "$TARGET" = "ios" ]; then
  echo "→ Building iOS IPA..."
  flutter build ipa --release
elif [ "$TARGET" = "appbundle" ]; then
  echo "→ Building Android App Bundle..."
  flutter build appbundle --release
fi

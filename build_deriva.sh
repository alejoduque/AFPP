#!/bin/bash
# Deriva Sonora (xyz.altred.permasoftware), the permasoftware field app.
# Installs alongside SoundWalk; never replaces it.
#
#   ./build_deriva.sh                 sideloadable APK
#   ./build_deriva.sh --aab           Play Store bundle
#   ./build_deriva.sh <keyword>       keyword in the file name (any order with --aab)
#
# The global map API defaults to https://altred.xyz/AlpineFeministPunkParade/afpp
# (override with VITE_AFPP_API=…; empty string = fully offline build).
set -euo pipefail
cd "$(dirname "$0")"

WANT_AAB=false
KEYWORD_TAG=""
for arg in "$@"; do
  if [[ "$arg" == "--aab" ]]; then WANT_AAB=true
  elif [[ -n "$arg" ]]; then KEYWORD_TAG="-$(echo "$arg" | tr ' ' '-' | tr '[:upper:]' '[:lower:]')"; fi
done

export VITE_AFPP_API="${VITE_AFPP_API-https://altred.xyz/AlpineFeministPunkParade/afpp}"

if [[ "$(uname)" == "Darwin" ]] && [ -d "/opt/homebrew/opt/openjdk@17" ]; then
  export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
fi
if [ -z "${ANDROID_HOME:-}" ] && [ -d "/opt/homebrew/share/android-commandlinetools" ]; then
  export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
fi

grep -q 'applicationId "xyz.altred.permasoftware"' android/app/build.gradle \
  || { echo "❌ android/app/build.gradle is not Deriva Sonora's (applicationId) — wrong branch?"; exit 1; }

start=$(date +%s)
rm -rf dist/ android/app/src/main/assets/public android/app/build/ android/build/

echo "🔨 Web app (API: ${VITE_AFPP_API:-offline})"
npx vite build
[ -f dist/index.html ] || { echo "❌ web build failed"; exit 1; }

echo "🔄 Capacitor sync"
npx cap sync android

version=$(grep -m1 'versionName' android/app/build.gradle | sed 's/[^0-9.]//g')
timestamp=$(date +"%Y%m%d-%H%M%S")
if $WANT_AAB; then
  ./android/gradlew -p android bundleRelease
  SRC=android/app/build/outputs/bundle/release/app-release.aab
  OUT="deriva-sonora-${version}${KEYWORD_TAG}-${timestamp}.aab"
else
  ./android/gradlew -p android assembleRelease
  SRC=android/app/build/outputs/apk/release/app-release.apk
  OUT="deriva-sonora-${version}${KEYWORD_TAG}-${timestamp}.apk"
fi
[ -f "$SRC" ] || { echo "❌ build output not found at $SRC"; exit 1; }
cp "$SRC" "$OUT"

echo ""
echo "✅ $OUT ($(( $(wc -c < "$OUT") / 1024 / 1024 ))MB, $(( $(date +%s) - start ))s)"
$WANT_AAB || echo "📱 adb install \"$OUT\"   (installs next to SoundWalk, as xyz.altred.permasoftware)"

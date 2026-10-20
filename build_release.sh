#!/bin/bash
# SoundWalk release builder — one codebase, two Play Store listings.
#
#   ./build_release.sh paid                    → AAB for com.soundwalk.recorder
#   ./build_release.sh free                    → AAB for com.soundwalk.recorder.free
#   ./build_release.sh paid <keyword>          → AAB, keyword in the filename
#   ./build_release.sh paid <keyword> --apk    → sideloadable APK instead of an AAB
#
# The web bundle's tier (VITE_APP_TIER) and the Android flavor are set
# together here so they can never disagree; a marker assertion guards
# against shipping the wrong tier.

set -e

TIER="$1"
if [[ "$TIER" != "paid" && "$TIER" != "free" ]]; then
    echo "Usage: $0 <paid|free> [keyword] [--apk]"
    exit 1
fi

# Remaining args (after tier) in any order: an optional keyword and/or --apk
WANT_APK=false
KEYWORD=""
for arg in "$2" "$3"; do
    if [[ "$arg" == "--apk" ]]; then
        WANT_APK=true
    elif [[ -n "$arg" ]]; then
        KEYWORD=$(echo "$arg" | tr ' ' '-' | tr '[:upper:]' '[:lower:]')
    fi
done
[[ -n "$KEYWORD" ]] && KEYWORD_TAG="-${KEYWORD}" || KEYWORD_TAG=""

TIER_UPPER=$(echo "$TIER" | tr '[:lower:]' '[:upper:]')
OTHER_TIER_UPPER=$([[ "$TIER" == "paid" ]] && echo "FREE" || echo "PAID")
FLAVOR_CAP=$([[ "$TIER" == "paid" ]] && echo "Paid" || echo "Free")

# ── Java / Android SDK ───────────────────────────────────────────────────────
if [[ "$(uname)" == "Darwin" ]] && [ -d "/opt/homebrew/opt/openjdk@17" ]; then
    export JAVA_HOME="/opt/homebrew/opt/openjdk@17"
fi
if [ -z "$ANDROID_HOME" ] && [ -d "/opt/homebrew/share/android-commandlinetools" ]; then
    export ANDROID_HOME="/opt/homebrew/share/android-commandlinetools"
fi

# ── Clean ────────────────────────────────────────────────────────────────────
rm -rf dist/ android/app/src/main/assets/ android/app/build/ android/build/

start_time=$(date +%s)

echo "🔨 Building web app (tier: $TIER)..."
VITE_APP_TIER="$TIER" npm run build

if [ ! -d "dist" ] || [ ! -f "dist/index.html" ]; then
    echo "❌ Web build failed - dist folder is missing or incomplete"
    exit 1
fi

# ── Tier assertion: vite injects only the active tier's marker string into
#    the bundle (see vite.config.js define + src/config/tier.js) ─────────────
if ! grep -rq "SOUNDWALK_TIER_${TIER_UPPER}" dist/assets/; then
    echo "❌ Tier marker SOUNDWALK_TIER_${TIER_UPPER} not found in dist — wrong tier built!"
    exit 1
fi
if grep -rq "SOUNDWALK_TIER_${OTHER_TIER_UPPER}" dist/assets/; then
    echo "❌ Opposite tier marker SOUNDWALK_TIER_${OTHER_TIER_UPPER} found in dist — tier mix-up!"
    exit 1
fi
echo "✅ Tier marker verified: SOUNDWALK_TIER_${TIER_UPPER}"

echo "🔄 Syncing with Android project..."
npx cap sync android

echo "🛠️ Building Android ${FLAVOR_CAP} release..."
cd android && ./gradlew clean && cd ..

version=$(grep -m1 'versionName' android/app/build.gradle | sed 's/[^0-9.]//g')
timestamp=$(date +"%Y%m%d-%H%M%S")

if $WANT_APK; then
    ./android/gradlew -p android "assemble${FLAVOR_CAP}Release"
    SRC="android/app/build/outputs/apk/${TIER}/release/app-${TIER}-release.apk"
    OUT="soundwalk-${TIER}-${version}${KEYWORD_TAG}-${timestamp}.apk"
else
    ./android/gradlew -p android "bundle${FLAVOR_CAP}Release"
    SRC="android/app/build/outputs/bundle/${TIER}Release/app-${TIER}-release.aab"
    OUT="soundwalk-${TIER}-${version}${KEYWORD_TAG}-${timestamp}.aab"
fi

if [ ! -f "$SRC" ]; then
    echo "❌ Build output not found at $SRC"
    exit 1
fi
cp "$SRC" "$OUT"

end_time=$(date +%s)
size_mb=$(( $(wc -c < "$OUT") / 1024 / 1024 ))
echo ""
echo "✅ ${TIER_UPPER} build: $OUT (${size_mb}MB, $((end_time - start_time))s)"
if $WANT_APK; then
    echo "📱 Sideload with: adb install \"$OUT\""
else
    echo "📦 Upload this AAB to the ${TIER} Play Console listing"
    echo "   ($([[ "$TIER" == "paid" ]] && echo com.soundwalk.recorder || echo com.soundwalk.recorder.free))"
fi

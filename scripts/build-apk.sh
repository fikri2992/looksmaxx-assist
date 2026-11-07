#!/usr/bin/env bash
# Builds a release APK on Windows. React Native's C++ build breaks on Windows path-length limits
# when the project sits in a deep folder, so this copies the app to a short path and builds there.
# Usage: bash scripts/build-apk.sh   →  dist/shelfie.apk
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
short="${SHORT_BUILD_DIR:-/c/sb/mobile}"
export ANDROID_HOME="${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}"

mkdir -p "$short"
# robocopy exit codes below 8 mean success. MSYS must not rewrite its /FLAGS into paths.
src="$(cygpath -w "$repo/mobile")"; dst="$(cygpath -w "$short")"
# Skip only Android's own build output: packages ship compiled code in folders named "build" too.
MSYS2_ARG_CONV_EXCL='*' robocopy "$src" "$dst" /MIR /NFL /NDL /NJH /NJS /NP \
  /XD "$src\\.expo" "$src\\android\\build" "$src\\android\\app\\build" "$src\\android\\.gradle" .cxx || [ $? -lt 8 ]

cd "$short/android"
# CMake 3.31's ninja (1.12) honours Windows long paths; the default 3.22 one stops at 260 characters.
cmake_dir="$ANDROID_HOME/cmake/${CMAKE_VERSION:-3.31.6}"
printf 'sdk.dir=%s\ncmake.dir=%s\n' "$(cygpath -m "$ANDROID_HOME")" "$(cygpath -m "$cmake_dir")" > local.properties
./gradlew assembleRelease --no-daemon -q -PreactNativeArchitectures="${ABIS:-arm64-v8a}"
mkdir -p "$repo/dist"
cp app/build/outputs/apk/release/app-release.apk "$repo/dist/shelfie.apk"
echo "APK: $repo/dist/shelfie.apk"

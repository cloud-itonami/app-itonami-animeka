#!/bin/sh
# Build the debug Android APK (aarch64) for the animeka app.
# Requires: Android SDK + NDK 27, JDK 21, Rust target aarch64-linux-android.
# Env is set by the caller (see README: PATH cargo-first, JAVA_HOME JDK21,
# ANDROID_HOME, NDK_HOME). Do NOT run /usr/libexec/java_home (empty here).
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
: "${ANDROID_HOME:=$HOME/Library/Android/sdk}"
if [ -z "${NDK_HOME:-}" ]; then NDK_HOME=$(ls -d "$ANDROID_HOME"/ndk/* | sort | tail -1); fi
export ANDROID_HOME NDK_HOME
build_tools=$(ls -d "$ANDROID_HOME"/build-tools/* 2>/dev/null | sort -V | tail -1)
aapt2="$build_tools/aapt2"
if [ ! -x "$aapt2" ]; then
  echo "no aapt2 under $ANDROID_HOME/build-tools; it checks the built APK's permissions" >&2; exit 1
fi
for tool in cargo rustc; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "$tool is not on PATH; install a Rust toolchain (rustup) and put its cargo/rustc on PATH first" >&2; exit 1
  fi
done
cd "$root"
test -x node_modules/.bin/tauri || npm ci
npm run build
# Fresh init every run: src-tauri/gen/android is generated, never edited.
# The committed android/MainActivity.kt is injected into the fresh tree by
# package id, so the APK comes from the commit, not from a local edit.
rm -rf "$root/src-tauri/gen/android"
node_modules/.bin/tauri android init --ci
pkg=$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).identifier)' "$root/src-tauri/tauri.conf.json")
if ! printf '%s\n' "$pkg" | grep -Eq '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'; then
  echo "tauri.conf.json identifier '$pkg' is not a Java package name" >&2; exit 1
fi
gen="$root/src-tauri/gen/android/app/src/main"
activity="$gen/java/$(printf '%s' "$pkg" | tr . /)/MainActivity.kt"
if [ ! -f "$activity" ]; then
  echo "tauri android init wrote no $activity" >&2; exit 1
fi
# uiMode must be in configChanges so a theme switch reaches
# MainActivity.onConfigurationChanged instead of recreating the activity.
node "$root/scripts/android-manifest.mjs" "$gen/AndroidManifest.xml"
if [ "$(grep -c '^package __PACKAGE__$' "$root/android/MainActivity.kt")" != 1 ]; then
  echo "android/MainActivity.kt has no single 'package __PACKAGE__' line" >&2; exit 1
fi
sed "s/^package __PACKAGE__\$/package $pkg/" "$root/android/MainActivity.kt" > "$activity"
# AGP packages incrementally into the old APK; start from none.
rm -rf "$root/src-tauri/gen/android/app/build/outputs/apk" "$root/src-tauri/gen/android/app/build/intermediates/apk"
node_modules/.bin/tauri android build --debug --apk --target aarch64 --ci
apk="$root/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk"
test -f "$apk"
# The merged manifest must ASK for INTERNET (WebView fetch to the Worker +
# PDS). Unlike the offline series apps it is intentionally not removed.
perms=$("$aapt2" dump permissions "$apk")
if ! printf '%s\n' "$perms" | grep -q 'android\.permission\.INTERNET'; then
  echo "the APK does not ask for android.permission.INTERNET:" >&2; printf '%s\n' "$perms" >&2; exit 1
fi
shasum -a 256 "$apk"

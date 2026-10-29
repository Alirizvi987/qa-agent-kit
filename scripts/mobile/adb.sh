#!/usr/bin/env bash
# Small remote control for the Android app under test.
# Set ANDROID_SERIAL to pick a device (see "adb devices"); otherwise adb uses the only one connected.
#
#   scripts/mobile/adb.sh devices                 list phones and emulators
#   scripts/mobile/adb.sh build                   app version, build and device details
#   scripts/mobile/adb.sh fg                      which app is in front (check before typing passwords)
#   scripts/mobile/adb.sh launch                  start the app
#   scripts/mobile/adb.sh shot <name> [dir]       screenshot to <dir>/<name>.png
#   scripts/mobile/adb.sh dump <name> [dir]       every element on screen to <dir>/<name>.xml
#   scripts/mobile/adb.sh tap-text "<text>"       tap the element showing that text
#   scripts/mobile/adb.sh type "<text>"           type into the focused field
#   scripts/mobile/adb.sh back                    system Back button
#   scripts/mobile/adb.sh dark on|off             dark mode
#   scripts/mobile/adb.sh offline on|off          airplane-style: wifi and mobile data off/on
#   scripts/mobile/adb.sh install <file.apk>      install or upgrade the app
#   scripts/mobile/adb.sh clone-apk               copy the app off the real phone onto every emulator
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PKG="$(node -e "try{const p=require('$ROOT/project.json');process.stdout.write((p.mobile&&p.mobile.package)||'')}catch{}")"
cmd="${1:-help}"; shift || true

command -v adb >/dev/null || { echo "adb is missing. Install it: brew install --cask android-platform-tools (Windows/Linux: Android SDK platform-tools)"; exit 1; }

need_pkg() { [ -n "$PKG" ] || { echo "Set the app package in the setup screen first."; exit 1; }; }

case "$cmd" in
  devices) adb devices -l ;;
  build)
    need_pkg
    adb shell dumpsys package "$PKG" | grep -E 'versionName|versionCode' | head -2
    echo "device: $(adb shell getprop ro.product.model | tr -d '\r') · Android $(adb shell getprop ro.build.version.release | tr -d '\r') · $(adb shell wm size | tr -d '\r') · $(adb shell wm density | tr -d '\r')" ;;
  fg) adb shell dumpsys activity activities | grep -m1 -E 'topResumedActivity|mResumedActivity' | sed 's/^ *//' ;;
  launch) need_pkg; adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 && echo "launched $PKG" ;;
  shot)
    name="${1:?name}"; dir="${2:-.}"; mkdir -p "$dir"
    adb exec-out screencap -p > "$dir/$name.png" && echo "$dir/$name.png" ;;
  dump)
    name="${1:?name}"; dir="${2:-.}"; mkdir -p "$dir"
    adb shell uiautomator dump /sdcard/qa-ui.xml >/dev/null && adb exec-out cat /sdcard/qa-ui.xml > "$dir/$name.xml" && echo "$dir/$name.xml" ;;
  tap-text)
    text="${1:?text}"; tmp="$(mktemp)"
    adb shell uiautomator dump /sdcard/qa-ui.xml >/dev/null && adb exec-out cat /sdcard/qa-ui.xml > "$tmp"
    xy="$(node "$HERE/find-text.mjs" "$tmp" "$text")" || { echo "No element showing \"$text\" on screen."; rm -f "$tmp"; exit 1; }
    rm -f "$tmp"; adb shell input tap $xy && echo "tapped \"$text\" at $xy" ;;
  type)
    text="${1:?text}"
    adb shell input text "$(printf '%s' "$text" | sed -e 's/ /%s/g' -e "s/'/\\\\'/g")" ;;
  back) adb shell input keyevent KEYCODE_BACK ;;
  dark)
    case "${1:-on}" in on) adb shell cmd uimode night yes ;; off) adb shell cmd uimode night no ;; esac ;;
  offline)
    if [ "${1:-on}" = on ]; then adb shell svc wifi disable; adb shell svc data disable; echo offline
    else adb shell svc wifi enable; adb shell svc data enable; echo online; fi ;;
  install) adb install -r "${1:?apk file}" ;;
  clone-apk)
    need_pkg
    real="$(adb devices | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/ {print $1; exit}')"
    [ -n "$real" ] || { echo "Connect the real phone first."; exit 1; }
    out="$(mktemp -d)"
    for p in $(adb -s "$real" shell pm path "$PKG" | sed 's/package://' | tr -d '\r'); do adb -s "$real" pull "$p" "$out/" >/dev/null; done
    for emu in $(adb devices | awk 'NR>1 && $2=="device" && $1 ~ /^emulator-/ {print $1}'); do
      adb -s "$emu" install-multiple -r "$out"/*.apk >/dev/null && echo "installed the phone's exact app on $emu"
    done ;;
  *) awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0" ;;
esac

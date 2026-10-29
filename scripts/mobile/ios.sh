#!/usr/bin/env bash
# Small remote control for the iPhone app on the iOS Simulator (needs a Mac with Xcode).
# Set IOS_DEVICE to a simulator id (see "devices"); otherwise the booted one is used.
# Tapping and typing need a UI driver: use Maestro (https://maestro.mobile.dev) or Appium.
#
#   scripts/mobile/ios.sh devices                 list simulators (booted ones first)
#   scripts/mobile/ios.sh boot ["iPhone 15"]      start a simulator with no window
#   scripts/mobile/ios.sh build                   app version and simulator details
#   scripts/mobile/ios.sh install <App.app>       install or upgrade the simulator build
#   scripts/mobile/ios.sh launch                  start the app
#   scripts/mobile/ios.sh stop                    force-close the app
#   scripts/mobile/ios.sh shot <name> [dir]       screenshot to <dir>/<name>.png
#   scripts/mobile/ios.sh dark on|off             dark mode
#   scripts/mobile/ios.sh text-size <size>        large text, e.g. extra-large, accessibility-large
#   scripts/mobile/ios.sh open-url <link>         open a link (deep links, email links)
#   scripts/mobile/ios.sh location <lat> <lon>    fake GPS position
#   scripts/mobile/ios.sh push <file.json>        send a test push notification
#   scripts/mobile/ios.sh uninstall               remove the app (fresh-install tests)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
read_project() { node -e "try{const m=require('$ROOT/project.json').mobile||{};process.stdout.write(String(m['$1']||''))}catch{}"; }
BUNDLE="$(read_project ios_bundle)"
MODEL="$(read_project ios_simulator)"; MODEL="${MODEL:-iPhone 15}"
DEV="${IOS_DEVICE:-booted}"
cmd="${1:-help}"; shift || true

xcrun simctl help >/dev/null 2>&1 || { echo "The iOS Simulator needs the full Xcode app (from the App Store), not only the command-line tools. Then run: sudo xcode-select -s /Applications/Xcode.app"; exit 1; }
need_bundle() { [ -n "$BUNDLE" ] || { echo "Set the iPhone app bundle id in the setup screen first."; exit 1; }; }

case "$cmd" in
  devices) xcrun simctl list devices available | grep -E 'Booted|iPhone|iPad' | sort -k2 -r ;;
  boot)
    model="${1:-$MODEL}"
    id="$(xcrun simctl list devices available | grep -F "$model (" | head -1 | grep -oE '[0-9A-F-]{36}')" \
      || { echo "No simulator called \"$model\". See: scripts/mobile/ios.sh devices"; exit 1; }
    xcrun simctl boot "$id" 2>/dev/null || true
    xcrun simctl bootstatus "$id" -b >/dev/null && echo "booted $model ($id), no window. export IOS_DEVICE=$id" ;;
  build)
    need_bundle
    app="$(xcrun simctl get_app_container "$DEV" "$BUNDLE" app 2>/dev/null)" || { echo "The app isn't installed on this simulator."; exit 1; }
    /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' -c 'Print :CFBundleVersion' "$app/Info.plist" | paste -sd' ' - | sed 's/^/version /'
    xcrun simctl list devices | grep -F "(Booted)" | head -1 | sed 's/^ *//; s/^/simulator: /'
    xcrun simctl list runtimes | grep -m1 iOS | sed 's/^/runtime: /' ;;
  install) xcrun simctl install "$DEV" "${1:?path to App.app}" && echo "installed ${1}" ;;
  launch) need_bundle; xcrun simctl launch "$DEV" "$BUNDLE" ;;
  stop) need_bundle; xcrun simctl terminate "$DEV" "$BUNDLE" && echo "closed $BUNDLE" ;;
  uninstall) need_bundle; xcrun simctl uninstall "$DEV" "$BUNDLE" && echo "removed $BUNDLE" ;;
  shot)
    name="${1:?name}"; dir="${2:-.}"; mkdir -p "$dir"
    xcrun simctl io "$DEV" screenshot "$dir/$name.png" >/dev/null 2>&1 && echo "$dir/$name.png" ;;
  dark) case "${1:-on}" in on) xcrun simctl ui "$DEV" appearance dark ;; off) xcrun simctl ui "$DEV" appearance light ;; esac ;;
  text-size) xcrun simctl ui "$DEV" content_size "${1:-extra-large}" ;;
  open-url) xcrun simctl openurl "$DEV" "${1:?link}" ;;
  location) xcrun simctl location "$DEV" set "${1:?latitude},${2:?longitude}" ;;
  push) need_bundle; xcrun simctl push "$DEV" "$BUNDLE" "${1:?payload.json}" ;;
  *) awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0" ;;
esac

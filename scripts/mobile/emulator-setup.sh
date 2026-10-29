#!/usr/bin/env bash
# Creates Android emulators that match your real test phone's screen, from project.json.
# Run once per computer. Then start them headless with:  scripts/mobile/emulator-setup.sh start
#
# Needs: Android command-line tools (brew install --cask android-commandlinetools) and Java
# (brew install openjdk). On Apple Silicon the arm64 image runs at full speed.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
read -r W H DPI COUNT API < <(node -e "
  const m=(require('$ROOT/project.json').mobile)||{};
  console.log([m.width||1080,m.height||2340,m.dpi||420,m.emulators??3,m.api_level||35].join(' '))")

ARCH="$(uname -m)"; [ "$ARCH" = "arm64" ] && ABI=arm64-v8a || ABI=x86_64
# "google_apis" (not "playstore") so "adb root" works for deeper checks.
IMAGE="system-images;android-${API};google_apis;${ABI}"

if [ "${1:-}" = "start" ]; then
  for i in $(seq 1 "$COUNT"); do
    port=$((5552 + i * 2))
    nohup emulator -avd "qa-twin-$i" -port "$port" -no-window -no-audio -no-boot-anim >/dev/null 2>&1 &
    echo "starting qa-twin-$i as emulator-$port (no window)"
  done
  echo "Wait about a minute, then: adb devices"
  exit 0
fi

command -v java >/dev/null || { echo "Java is missing: brew install openjdk"; exit 1; }
command -v sdkmanager >/dev/null || { echo "Android tools are missing: brew install --cask android-commandlinetools"; exit 1; }

echo "Downloading the Android $API image ($ABI). This takes a while the first time."
yes | sdkmanager --licenses >/dev/null || true
sdkmanager "platform-tools" "emulator" "platforms;android-${API}" "$IMAGE"

for i in $(seq 1 "$COUNT"); do
  name="qa-twin-$i"
  echo no | avdmanager create avd -n "$name" -k "$IMAGE" --force >/dev/null
  cfg="$HOME/.android/avd/$name.avd/config.ini"
  {
    echo "hw.lcd.width=$W"; echo "hw.lcd.height=$H"; echo "hw.lcd.density=$DPI"
    echo "hw.keyboard=yes"; echo "hw.ramSize=3072"
  } >> "$cfg"
  echo "created $name (${W}x${H} @ ${DPI}dpi)"
done

cat <<EOF

Done. If avdmanager said "Package path is not valid", it can't find your SDK: link the SDK folders
into the command-line tools folder (see docs/kit/SETUP-GUIDE.md, "Emulators").

Next:
  scripts/mobile/emulator-setup.sh start     start them with no window
  scripts/mobile/adb.sh clone-apk            put the real phone's exact app on each one
EOF

# Setup guide

Everything you need on your computer, in order. Most of it is a one-time job.

## 1. The basics

| Tool | Why | How |
|---|---|---|
| Node.js 20+ | runs the kit and the scripts | [nodejs.org](https://nodejs.org) or `brew install node` |
| Git | to clone and share the kit | `brew install git` (macOS) |
| Claude Code | the AI assistant that runs the agents | see [claude.com/claude-code](https://claude.com/claude-code) |
| Playwright + Chromium | the hidden browser | `npm install` then `npx playwright install chromium` |

## 2. Connectors

Connectors let Claude use your other tools directly. Add them in Claude Code (`/mcp`) or the Claude
desktop app's connector settings, signed in with the **team's test accounts**, not personal ones.

| Connector | Used for | Needed? |
|---|---|---|
| Gmail (or your mail provider) | reading the tester mailbox: verification links, receipts, email checks | yes, if the product sends email |
| Figma | reading design frames: sizes, colours, fonts | yes, if designs are in Figma |
| GitHub | reading PR changes to find impact | helpful |
| Your bug tracker (Jira, Linear…) | reading known issues; the lead files issues | helpful |

The mailbox connector is used **only by the lead session**. Agents ask the lead when they need an email.

## 3. Secrets

Test-user passwords go in one private file on your computer, never in the repo:

```bash
mkdir -p ~/.qa-secrets && chmod 700 ~/.qa-secrets
touch ~/.qa-secrets/<your-project>.env && chmod 600 ~/.qa-secrets/<your-project>.env
```

The kit's `.claude/settings.json` stops Claude Code from reading this folder. Scripts read it when they
need to sign in, and never print passwords.

## 4. Android: the real phone

1. On the phone: Settings → About phone → tap **Build number** seven times → **Developer options** →
   turn on **USB debugging**.
2. On the computer: `brew install --cask android-platform-tools` (gives you `adb`).
3. Connect by cable, accept the prompt on the phone, then check: `scripts/mobile/adb.sh devices`
4. Install the build under test: `scripts/mobile/adb.sh install app-release.apk`
5. Record what you're testing: `scripts/mobile/adb.sh build`

## 5. Android: emulators that match the phone

Emulators let several mobile agents run at once. The kit makes them match your real phone's screen.

```bash
brew install openjdk
brew install --cask android-commandlinetools
scripts/mobile/emulator-setup.sh          # creates qa-twin-1, -2, -3 (once)
scripts/mobile/emulator-setup.sh start    # starts them with no window
scripts/mobile/adb.sh clone-apk           # copies the phone's exact app onto each emulator
```

Two things that waste time if you don't know them:

- **"Unable to locate a Java Runtime"**: install Java (`brew install openjdk`) and follow the message it prints to link it.
- **"Package path is not valid"** from `avdmanager`: it looks for the SDK next to itself, not where you
  installed it. Link the SDK folders into the command-line tools folder:
  ```bash
  SDK=~/Library/Android/sdk; T="$(brew --prefix)/share/android-commandlinetools"
  for d in system-images emulator platforms platform-tools licenses; do ln -sfn "$SDK/$d" "$T/$d"; done
  ```

Use the `google_apis` image (the script does), not `playstore`: it allows deeper checks with `adb root`.

**Before trusting any emulator result**, prove the app reaches your server: try a wrong password and
look for the server's own error message.

## 6. iOS (optional)

Install Xcode, open the iOS Simulator, and record the simulator model and iOS version with every result.
Claude Code's desktop app can drive the simulator directly.

## 7. Network

If your environments are behind a VPN, connect it first. Every site timing out usually means the VPN,
not an outage. The scripts say so when it happens.

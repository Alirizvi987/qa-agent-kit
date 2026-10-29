# Setup guide

Everything you need on your computer, in order. Most of it is a one-time job.

## 1. The basics

Works on macOS, Linux and Windows. On Windows, run the `scripts/mobile/*.sh` helpers in Git Bash or WSL;
everything else (`npm run …`) works in any terminal.

| Tool | Why | How |
|---|---|---|
| Node.js 20+ | runs the kit and the scripts | [nodejs.org](https://nodejs.org) or `brew install node` |
| Git | to clone and share the kit | `brew install git` (macOS) |
| Claude Code | the AI assistant that runs the agents | see [claude.com/claude-code](https://claude.com/claude-code) |
| Playwright + browsers | the hidden browsers | `npm install` then `npx playwright install chromium` (add `firefox webkit` if you test those) |

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
5. Record what you're testing: `scripts/mobile/adb.sh build`. It also prints the phone's screen size and
   density: copy those into the setup screen, so the emulators match the phone exactly.

No real phone? Untick "We have a real Android test phone" in setup. Everything runs on emulators, and
reports say so.

## 5. Android: emulators that match the phone

Emulators let several mobile agents run at once. The kit makes them match your real phone's screen.

```bash
brew install openjdk
brew install --cask android-commandlinetools
scripts/mobile/emulator-setup.sh create   # creates qa-twin-1, -2, -3 (once)
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

## 6. iPhone (needs a Mac)

1. Install **Xcode** from the App Store (the full app, not only the command-line tools), open it once, and
   add an iOS simulator under Settings → Components.
2. Start the simulator with no window: `scripts/mobile/ios.sh boot "iPhone 15"`
3. Ask the developers for a **simulator build** (`App.app`; App Store and TestFlight builds don't run
   on the simulator) and install it: `scripts/mobile/ios.sh install App.app`
4. Record what you're testing: `scripts/mobile/ios.sh build`
5. For tapping and typing, install [Maestro](https://maestro.mobile.dev):
   `curl -Ls "https://get.maestro.mobile.dev" | bash`. Flows are short YAML files the agents write.

`ios.sh` also does dark mode, large text, links, fake GPS and test push notifications. Camera, Face ID,
real push and purchases need a real iPhone: the lead tests those by hand.

## 7. Sign-in by email code or single sign-on

If people sign in with a code sent by email, or with Google / Microsoft / company login, there is no
password to store. A person signs each test user in once:

```bash
npm run save-session -- FIX_CUSTOMER_A_U1
```

A browser window opens, you sign in, press Enter, and the session is saved in `~/.qa-secrets/sessions/`
(outside the repo). The scripts and agents reuse it. When `npm run health` says it has expired, run it again.

## 8. APIs

Portals marked "API (no screens)" are checked with plain requests: `npm run smoke` calls their health
address, and the agents follow `docs/qa/rules/API-RULES.md`. Keep test API keys in the secrets file.

## 9. Network

If your environments are behind a VPN, connect it first. Every site timing out usually means the VPN,
not an outage. The scripts say so when it happens.

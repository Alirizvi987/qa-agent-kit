# QA Agent Kit

**Describe your project once. Get a ready QA workspace with AI testers that follow your rules.**

This kit packages the way we test web apps, admin panels and mobile apps: a written rulebook, a team
of AI test agents (for [Claude Code](https://claude.com/claude-code)), test-user recipes, and starter
scripts for hidden-browser and Android testing. You fill in a short form about your product; the
kit writes everything for *your* project.

---

**New here? Watch the one-minute video first:** [docs/kit/how-it-works.mp4](docs/kit/how-it-works.mp4)

## In 5 steps

**1. Get the kit**

```bash
git clone <this repository's address> my-project-qa
cd my-project-qa
```

**2. Install the tools** (once per computer; needs [Node.js](https://nodejs.org) 20 or newer)

```bash
npm install
npx playwright install chromium
```

**3. Describe your project**

```bash
npm run setup
```

Open **http://127.0.0.1:4321** in your browser. Fill in your project: websites, roles, account states,
design links and so on. Press **Fill with an example** to see what a finished form looks like.
Press **Create my QA workspace**.

> Prefer chatting? Open Claude Code in this folder and say _"Set up this kit for my project"_.
> It will ask you the same questions and write the files.

**4. Check the websites open**

```bash
npm run smoke
```

**5. Start testing with Claude Code**

Open Claude Code in this folder and say:

> Read AGENTS.md and start docs/qa/FIRST-WEEK.md with me.

That's it. From here, see [How to work day to day](docs/kit/DAILY-WORK.md).

---

## What you get

After setup, this folder contains:

| File | What it is |
|---|---|
| `AGENTS.md` | The house rules for your project. Every person and agent reads it first. |
| `CLAUDE.md` | Tells Claude Code to load the house rules and shared lessons. |
| `docs/qa/handoff.md` | One page: where testing stands, what's next. Keep it current. |
| `docs/qa/FIRST-WEEK.md` | The first-week checklist for a new project. |
| `docs/qa/rules/*.md` | How to test a PR, check emails, retest fixes, write issues, ask the product owner. |
| `docs/qa/agents/*.md` | How the agents work together, make test users and report results. |
| `docs/qa/impact-grid.md` | Every role × every account state, checked on every change. |
| `docs/qa/test-plan.md`, `flow-backlog.md` | What to test, in which order. |
| `docs/qa/LESSONS.md` | Lessons learned, shared with the team through git. |
| `.claude/agents/qa-*.md` | Your AI testers: one per role, plus admin, mobile, reporter and re-checker. |
| `.claude/settings.json` | Lets Claude Code run the kit's scripts without asking each time, and stops it reading secrets. |

**Starter scripts**

| Command | What it does |
|---|---|
| `npm run smoke` | Opens every website at every screen width, saves screenshots and a summary |
| `npm run health -- FIX_CUSTOMER_A` | Checks a lane's test users can still sign in |
| `npm run signin -- FIX_CUSTOMER_A_U1 /dashboard` | Signs in and screenshots pages |
| `npm run new-run -- pr-123-new-plans` | Starts a run folder: brief, coverage, use cases, emails, design, restore log |
| `scripts/mobile/adb.sh` | Remote control for the Android app: tap by text, screenshot, dark mode, offline |
| `scripts/mobile/emulator-setup.sh` | Builds emulators that match your real phone's screen |
| `npm run setup` / `npm run generate` | Change your project details and refresh the files |

---

## Changing things later

- **Project changed?** Run `npm run setup` again (your answers are loaded) or edit `project.json` and run
  `npm run generate`.
- **Want your own wording in a rule file?** Edit it and delete its first line (the one that says
  `qa-agent-kit:generated`). The kit will never overwrite it again.
- **Working documents** (handoff, test plan, backlog, lessons, test users) are created once and then
  belong to you. The kit never overwrites them.

## Safety, built in

- No passwords in this folder, ever. Test-user passwords live in `~/.qa-secrets/<project>.env` on your
  own computer, and Claude Code is blocked from reading that folder.
- The live product is read-only for every agent.
- Payments use test mode only.
- Agents draft issues. A person decides what is filed.
- Every issue is reproduced again from the screens, twice, by a different agent before anyone sees it.

## Learn more

- [How it works](docs/kit/HOW-IT-WORKS.md): the idea, the agents and the testing loop, in plain words
- [Daily work](docs/kit/DAILY-WORK.md): what to say to Claude Code for each kind of task
- [Setup guide](docs/kit/SETUP-GUIDE.md): Claude Code, connectors, Android phones and emulators

To check the kit itself after changing a template: `npm test`.
To re-make the video after editing `docs/kit/video/explainer.html`: `node docs/kit/video/render.mjs` (needs ffmpeg).

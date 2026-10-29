# How it works

## The idea in one paragraph

You are the QA lead. Claude Code is your assistant in the terminal. The kit gives it a **rulebook**
(plain text files it reads before every task), a **team of AI testers** (one per type of user), and
**tools** (a hidden browser, phone controls, your test inbox, your design files). You decide what to
test; the agents do the clicking, collect proof and draft issues; nothing reaches a developer until it
has been seen twice from the screens.

## The pieces

```
           You + Claude Code (the "lead")
     plans · reads mailbox · approves · merges results
                         │
       ┌─────────┬───────┴──────┬──────────┐
   qa-<role>  qa-<role>    qa-admin    qa-mobile        ← AI testers, each with its own test users
   (side by side)          (one at a time)
       └─────────┴───────┬──────┴──────────┘
                         │  results (verdict.json) + proof
                   qa-reporter  → drafts issues, removes duplicates
                         │
                   qa-rechecker → repeats each issue from the screens, twice
                         │
                 Report for developers
```

- **The lead** is you plus your main Claude Code chat. Only the lead reads the mailbox, approves accounts,
  makes test payments and changes shared settings.
- **Role testers** (`qa-customer`, `qa-business`…) each know one type of user and own a private set of
  test users called a **lane**. Lanes stop two agents fighting over one account.
- **Admin and mobile** run one at a time, because they change shared things.
- **The reporter** turns results into clear issues. **The re-checker** is a fresh pair of eyes that tries
  to reproduce each one, using only clicks and real emails.

## The testing loop

1. **Understand**: read the change, the spec and the design.
2. **Plan**: list every use case and edge case; fill the coverage grid.
3. **Prepare**: reuse or create test users in the right state (`fixture-recipe.md`).
4. **Test**: websites, admin and app, like a real person. Check every email.
5. **Compare**: each screen against its design, with real measurements.
6. **Re-check**: every issue reproduced from the screens only, twice.
7. **Report**: one page for developers, with click-by-click steps.
8. **Retest**: when a fix arrives, prove it, and check nothing nearby broke.

## Rules, memory and lessons

- **Rules** live in `AGENTS.md` and `docs/qa/rules/`. They are written once for the project and read by
  everyone, every time. That's what makes the testing repeatable.
- **Memory**: Claude Code keeps its own notes per person automatically. For the **team**, lessons go in
  `docs/qa/LESSONS.md`, which is shared through git and loaded at the start of every session.
- **Handoff**: `docs/qa/handoff.md` is the one page that says where we are. Update it at the end of a session.

## Quality gates (why the reports are trusted)

Before a finding becomes an issue:

1. The spec says it's wrong (section quoted)
2. There is proof from this run, and it opens
3. It was reproduced from the screens only, twice, by someone else
4. It isn't a known issue or an accepted decision
5. It's worth fixing (tiny 1–2px differences are left out)
6. It has an honest severity (P1 blocks, P2 hurts, P3 polish)

## Words

| Word | Meaning |
|---|---|
| Front end / back end | What you see and tap / the server logic and data behind it |
| PR (pull request) | A developer's package of changes waiting to be released |
| Fixture | A ready-made test account in a known state |
| Lane | One agent's private set of test users |
| Headless | A browser or tool running with no window on screen |
| Emulator | A virtual phone on your computer |
| Edge case | An unusual situation where things often break |
| Regression | Something that used to work and broke after a change |
| Instrumented | A rare condition (slow server, error) simulated on purpose |
| Connector | A link that lets Claude use another service, like email or Figma |
| Verdict | An agent's fixed-format result: what passed, what failed, the proof |

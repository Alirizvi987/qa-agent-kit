# Contributing

Thanks for trying the kit — issues and PRs are welcome from anyone.

## Found a bug, or your project type isn't covered well?

Open an issue: https://github.com/Alirizvi987/qa-agent-kit/issues/new

Say what kind of project it was (web / mobile / API / admin, sign-in method), what you expected, and
what happened. If a generated file reads wrong or has a leftover `{{tag}}`, paste the line.

## Sending a change

1. Fork, clone, `npm install && npx playwright install chromium`.
2. Make your change. Templates live in `kit/templates/**.tmpl` and `kit/templates-run/**.tmpl`
   (the tiny engine they use is documented at the top of `kit/render.mjs`).
3. **Run `npm test` before every commit.** It renders 9 kinds of project (web+app+admin, mobile-only,
   API-only, public site, no test environment, inside a product repo, bare minimum, odd characters, no
   email) and checks every generated file for leftover tags, blank values and valid frontmatter/JSON.
   A change that only makes one example read well but breaks another won't pass.
4. If you added a new option (a new sign-in method, a new project shape, a new rule), add an example
   project to `kit/examples/` and an assertion in `kit/selftest.mjs` that covers it.
5. Open a PR describing what you changed and why.

## What belongs in the kit vs. your own project

The kit itself stays generic: no client names, no specific companies' tools, no hard-coded Figma file
IDs or tracker URLs. Project-specific detail belongs in `project.json`, which `npm run setup` writes
and which never leaves the user's machine or gets committed by the kit itself.

## Style

Plain words, short sentences, no jargon that needs an acronym key. A new QA engineer should be able to
read any generated file and know what to do next.

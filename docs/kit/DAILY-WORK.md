# Daily work: what to say to Claude Code

Open Claude Code in your project's QA folder. These are the sentences that start each kind of work.
Replace the parts in _italics_.

## Starting a session

> Read docs/qa/handoff.md and tell me where we stopped.

At the end of a session:

> Update docs/qa/handoff.md with what we did today, and add any lessons to docs/qa/LESSONS.md.

## A new project (first week)

> Read AGENTS.md and start docs/qa/FIRST-WEEK.md with me.

> Read the PRD at _link_ and fill in docs/qa/test-plan.md: roles, states and main flows.

> Open the Figma file _link_ and list every screen and state per role in docs/qa/test-plan.md.

## Test users

> Create a lane A for _Customer_ with two users: one _Approved_, one _Expired_. Follow docs/qa/agents/fixture-recipe.md.

> Health-check every lane before we start.

## Testing a pull request

> Test PR _#123_ (_link_) together with server PR _#45_ on dev, following docs/qa/rules/PR-TEST-RULES.md.
> Design frames: _Figma link_. Start a run folder, build the coverage grid and use cases first, and show me
> the plan before you start the agents.

The lead will then:
1. run `npm run new-run -- pr-123-…` and fill `BRIEF.md`, `COVERAGE.md`, `USE-CASES.md`
2. start the role agents side by side (admin and mobile one at a time)
3. read the mailbox and do approvals and payments when agents ask
4. send the results to `qa-reporter`, then every candidate to `qa-rechecker`
5. write the report with only the issues that were reproduced twice

## Testing a whole flow

> Test the _business sign-up_ flow end to end for every role it touches. Business runs full depth, the others smoke.

## Mobile

> Test the _sign-in and booking_ flow on the Android app. Use the real phone and two emulators in parallel, one lane each.

## Retesting fixes

> These tickets are ready for QA: _AB-101, AB-102, AB-117_. Retest them following docs/qa/rules/RETEST-RUNBOOK.md and draft a comment for each.

## Reports

> Turn the results in runs/_folder_ into a shareable report page for developers. Only re-checked issues.
> Include the use-case checklist and the Not covered list.

## Questions for the product owner

> I think _the discount should apply to expired members_. Check the spec, the rulings and the design
> first (PO-QUESTION-RULE.md). If it's still open, draft the question with your suggested answer.

## Good habits

- **Ask for the plan first** on big tasks: "show me the plan before you start".
- **Say the environment** every time: dev, staging, or production (read-only).
- **One flow at a time, to the end.** Breadth comes from the agents running side by side.
- **Save the surprise.** When something unexpected happens, say "add that to LESSONS.md".

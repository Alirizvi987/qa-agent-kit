<!-- qa-agent-kit:generated · this starter file is replaced when setup runs. -->
# QA Agent Kit (not set up yet)

This folder is the QA Agent Kit. It hasn't been set up for a project yet.

If the user wants to set it up, offer two ways:

1. **The setup screen:** they run `npm run setup` and open http://127.0.0.1:4321.
2. **In this chat:** ask them about their project in plain words, one topic at a time (name and what it does;
   environments; websites and portals; roles; account states; mobile app; spec, design and code links;
   tester mailbox; payments; languages, browsers and settings that change behaviour). Use
   `kit/example.project.json` and `kit/examples/*.json` as the shape (portal `kind`: web, admin or api;
   `sign_in`: password, email-code, sso or none; a role's `portal` can be `mobile`). Write `project.json`, show
   a short summary, then run `npm run generate`. Never ask for passwords.

If they want the QA files inside their own product repository, run `npm run add-to -- <path to their repo>`
(it copies the kit into `<repo>/qa`), then continue the setup in that folder: Claude Code must be opened
in `<repo>/qa` so it loads the QA agents.

Then explain what was created (see `docs/kit/HOW-IT-WORKS.md`) and start `docs/qa/FIRST-WEEK.md` with them.

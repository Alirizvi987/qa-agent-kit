// For portals that sign in with an email code or single sign-on (SSO): a person signs a test user
// in once, by hand, and the session is saved outside the repo for the scripts and agents to reuse.
// This is the one script that opens a visible browser window, because a person has to type.
//
//   npm run save-session -- FIX_CUSTOMER_A_U1
//
// Saved to ~/.qa-secrets/sessions/<KEY>.json (private to you). Run it again when the session expires.

import { mkdir, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { loadProject, loadSecrets, roleForKey, portalFor, launchBrowser, sessionFile } from './lib/project.mjs';

const key = process.argv[2];
if (!key) {
  console.error('Which test user? Example: npm run save-session -- FIX_CUSTOMER_A_U1');
  process.exit(1);
}
const project = await loadProject();
const { values } = loadSecrets(project);
const role = roleForKey(project, key);
const portal = portalFor(project, role);
if (!portal?.url) {
  console.error(role?.on_mobile ? `${role.name} uses the mobile app; sign in there instead.` : 'No website address for this role in project.json.');
  process.exit(1);
}

const browser = await launchBrowser('chromium', { headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(new URL(portal.login_path || '/', portal.url).toString());
console.log(`\nA browser window is open on ${portal.name}.`);
console.log(`Sign in as ${values[`${key}_EMAIL`] || key} (use the code from the tester mailbox, or the SSO screen).`);
const rl = createInterface({ input: process.stdin, output: process.stdout });
await rl.question('When you can see the signed-in page, press Enter here… ');
rl.close();

const file = sessionFile(key);
await mkdir(dirname(file), { recursive: true });
await chmod(dirname(dirname(file)), 0o700).catch(() => {});
await context.storageState({ path: file });
await chmod(file, 0o600);
await browser.close();
console.log(`Saved the sign-in for ${key} (outside this folder). The scripts will reuse it.`);

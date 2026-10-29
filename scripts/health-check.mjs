// Test-user health check: can every user in a lane still sign in?
// Run it before every test, so a broken test user is never reported as a product bug.
//
//   npm run health -- FIX_CUSTOMER_A
//
// Reads ~/.qa-secrets/<project>.env. Prints results only, never passwords.

import { loadProject, loadSecrets, laneUsers, roleForKey, portalFor, signIn, launchBrowser } from './lib/project.mjs';

const prefix = process.argv[2];
if (!prefix) {
  console.error('Which lane? Example: npm run health -- FIX_CUSTOMER_A');
  process.exit(1);
}
const project = await loadProject();
const { file, values } = loadSecrets(project);
const users = laneUsers(values, prefix);
if (!users.length) {
  console.error(`No users starting with ${prefix} in ${file}.\nCreate them with docs/qa/agents/fixture-recipe.md.`);
  process.exit(1);
}

const browser = await launchBrowser();
let bad = 0, network = 0;
for (const user of users) {
  const role = roleForKey(project, user.key);
  const portal = portalFor(project, role);
  const context = await browser.newContext();
  const page = await context.newPage();
  let r;
  try {
    r = await signIn(page, project, portal, user);
  } catch (e) {
    r = { ok: false, reason: /timeout/i.test(e.message) ? 'timeout (network or VPN?)' : e.message.split('\n')[0] };
  }
  if (!r.ok) bad++;
  if (/timeout|network/.test(r.reason)) network++;
  console.log(`${r.ok ? 'OK  ' : 'FAIL'}  ${user.key}  ${role?.name || '?'} on ${portal?.name}: ${r.reason}`);
  await context.close();
}
await browser.close();

if (network === users.length) console.log('\nEvery sign-in timed out: check the network or VPN before testing. This is not a product bug.');
else if (bad) console.log('\nSome test users are broken. Recreate them or report "blocked". Do not report these as product bugs.');
process.exit(bad ? 1 : 0);

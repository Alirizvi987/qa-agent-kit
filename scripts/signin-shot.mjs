// Sign in as a test user and take screenshots of pages, at every screen width.
// A starting point for your own scripts: copy it into a run folder and add steps.
//
//   npm run signin -- FIX_CUSTOMER_A_U1 /dashboard /settings

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, loadProject, loadSecrets, roleForKey, portalFor, signIn, launchBrowser, stamp } from './lib/project.mjs';

const [key, ...paths] = process.argv.slice(2);
if (!key) {
  console.error('Example: npm run signin -- FIX_CUSTOMER_A_U1 /dashboard');
  process.exit(1);
}
const project = await loadProject();
const { values } = loadSecrets(project);
const user = { key, email: values[`${key}_EMAIL`], password: values[`${key}_PASSWORD`] };
if (!user.email) { console.error(`${key} is not in the secrets file.`); process.exit(1); }

const role = roleForKey(project, key);
const portal = portalFor(project, role);
const dir = join(ROOT, 'runs', `${stamp()}-signin-${key.toLowerCase()}`);
await mkdir(dir, { recursive: true });

const browser = await launchBrowser();
for (const width of project.widths) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const r = await signIn(page, project, portal, user);
  console.log(`${width}px sign-in: ${r.reason}`);
  if (!r.ok) { await page.screenshot({ path: join(dir, `signin-failed-${width}.png`) }); await page.close(); continue; }
  for (const path of paths.length ? paths : ['/']) {
    await page.goto(new URL(path, portal.url).toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const name = `${path.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'home'}-${width}.png`;
    await page.screenshot({ path: join(dir, name), fullPage: true });
    console.log(`  saved ${name}`);
  }
  await page.close();
}
await browser.close();
console.log(`\nSaved to ${dir}`);

// Shared helpers for the starter scripts: read project.json, the private secrets file,
// and sign in through a portal's real sign-in page.

import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepare } from '../../kit/generate.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function loadProject() {
  const file = join(ROOT, 'project.json');
  if (!existsSync(file)) {
    console.error('No project.json yet. Run "npm run setup" first.');
    process.exit(1);
  }
  return prepare(JSON.parse(await readFile(file, 'utf8')));
}

// Reads KEY=value lines from ~/.qa-secrets/<project>.env. Values are never printed.
export function loadSecrets(project) {
  const file = project.secrets_file.replace(/^~/, homedir());
  if (!existsSync(file)) return { file, values: {} };
  const values = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) values[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return { file, values };
}

// Lists the users in a lane, e.g. prefix FIX_CUSTOMER_A → [{ key: 'FIX_CUSTOMER_A_U1', email, password, id }]
export function laneUsers(values, prefix) {
  return Object.keys(values)
    .filter(k => k.startsWith(prefix) && k.endsWith('_EMAIL'))
    .map(k => {
      const key = k.slice(0, -'_EMAIL'.length);
      return { key, email: values[k], password: values[`${key}_PASSWORD`], id: values[`${key}_ID`] };
    });
}

// Types a test user's secret (password by default) into a field without it appearing in logs or chat.
export async function fillSecret(page, selector, key, field = 'PASSWORD') {
  const project = await loadProject();
  const value = loadSecrets(project).values[`${key}_${field}`];
  if (!value) throw new Error(`${key}_${field} is not in the secrets file (npm run new-user makes it)`);
  await page.fill(selector, value);
}

export function roleForKey(project, key) {
  return project.roles.find(r => key.startsWith(`FIX_${r.key}_`));
}

export function portalFor(project, role) {
  if (role?.on_mobile) return null;
  return project.portals.find(p => p.slug === role?.portal_slug) || project.web_portals[0] || project.portals[0];
}

// Saved sign-ins for email-code and SSO portals live outside the repo, one file per test user.
export function sessionFile(key) {
  return join(homedir(), '.qa-secrets', 'sessions', `${key}.json`);
}

// Starts a browser (hidden unless asked), with a plain message when it hasn't been installed yet.
// name: chromium (Chrome/Edge), firefox, or webkit (Safari's engine).
export async function launchBrowser(name = 'chromium', { headless = true } = {}) {
  const pw = await import('playwright').catch(() => {
    console.error('Playwright is missing. Run: npm install');
    process.exit(1);
  });
  try {
    return await pw[name].launch({ headless });
  } catch (e) {
    if (/Executable doesn't exist|playwright install/i.test(e.message)) {
      console.error(`The ${name} browser is not installed yet. Run: npx playwright install ${name}`);
      process.exit(1);
    }
    throw e;
  }
}

// A browser context for a test user: reuses their saved session when there is one.
export async function contextFor(browser, user, options = {}) {
  const saved = user && existsSync(sessionFile(user.key)) ? sessionFile(user.key) : undefined;
  return browser.newContext({ ...options, ...(saved ? { storageState: saved } : {}) });
}

export function stamp() {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
}

// Signs in the way the portal expects. Returns { ok, reason, url }.
//   password    fills the real sign-in form
//   email-code  / sso: uses the user's saved session (npm run save-session), then checks it is still valid
//   none        public pages: just opens the portal
export async function signIn(page, project, portal, user) {
  if (!portal) return { ok: false, reason: 'this role uses the mobile app: check sign-in in the app' };
  if (!portal.url) return { ok: false, reason: `"${portal.name}" has no address in project.json yet` };
  if (portal.is_api) return { ok: false, reason: `"${portal.name}" is an API: sign in with a request, see docs/qa/rules/API-RULES.md` };
  if (portal.sign_in === 'none') {
    const r = await page.goto(portal.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    return { ok: Boolean(r && r.status() < 400), reason: r ? `public page, status ${r.status()}` : 'no response (network or VPN?)', url: page.url() };
  }
  const login = { email_selector: 'input[type=email]', password_selector: 'input[type=password]', submit_selector: 'button[type=submit]', ...(project.login || {}) };
  const start = new URL(portal.login_path || '/login', portal.url).toString();
  if (portal.sign_in !== 'password') {
    if (!existsSync(sessionFile(user.key))) return { ok: false, reason: `no saved sign-in. A person runs once: npm run save-session -- ${user.key}` };
    const r = await page.goto(portal.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!r) return { ok: false, reason: 'no response (network or VPN?)' };
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const onLogin = new URL(page.url()).pathname === new URL(start).pathname || /\/(login|signin|sign-in|auth)\b/i.test(new URL(page.url()).pathname);
    return { ok: !onLogin, reason: onLogin ? `saved sign-in has expired. Run again: npm run save-session -- ${user.key}` : 'signed in (saved session)', url: page.url() };
  }
  if (!user.password) return { ok: false, reason: `${user.key}_PASSWORD is missing from the secrets file` };
  const response = await page.goto(start, { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (!response) return { ok: false, reason: 'no response (network or VPN?)' };
  if (response.status() >= 500) return { ok: false, reason: `server error ${response.status()}` };
  if (!(await page.locator(login.email_selector).first().isVisible({ timeout: 5000 }).catch(() => false))) {
    return { ok: false, reason: `no email field (${login.email_selector}) on ${start}. Fix the sign-in form details in npm run setup` };
  }
  await page.fill(login.email_selector, user.email);
  // Two-step forms ask for the email first, then show the password field.
  if (!(await page.locator(login.password_selector).first().isVisible().catch(() => false))) {
    await page.click(login.submit_selector);
    await page.locator(login.password_selector).first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  }
  await page.fill(login.password_selector, user.password);
  await Promise.all([
    page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}),
    page.click(login.submit_selector),
  ]);
  await page.waitForTimeout(1500);
  if (login.success_text) {
    const seen = await page.getByText(login.success_text, { exact: false }).first().isVisible().catch(() => false);
    return { ok: seen, reason: seen ? 'signed in' : `"${login.success_text}" not shown after sign-in`, url: page.url() };
  }
  const stillOnLogin = new URL(page.url()).pathname === new URL(start).pathname;
  return { ok: !stillOnLogin, reason: stillOnLogin ? 'still on the sign-in page' : 'signed in', url: page.url() };
}

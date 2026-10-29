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

export function roleForKey(project, key) {
  return project.roles.find(r => key.startsWith(`FIX_${r.key}_`));
}

export function portalFor(project, role) {
  return project.portals.find(p => p.slug === role?.portal_slug) || project.portals[0];
}

// Starts the hidden browser, with a plain message when it hasn't been installed yet.
export async function launchBrowser() {
  const { chromium } = await import('playwright').catch(() => {
    console.error('Playwright is missing. Run: npm install');
    process.exit(1);
  });
  try {
    return await chromium.launch({ headless: true });
  } catch (e) {
    if (/Executable doesn't exist|playwright install/i.test(e.message)) {
      console.error('The hidden browser is not installed yet. Run: npx playwright install chromium');
      process.exit(1);
    }
    throw e;
  }
}

export function stamp() {
  return new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
}

// Signs in through the real sign-in page. Returns { ok, reason, url }.
export async function signIn(page, project, portal, user) {
  const login = { email_selector: 'input[type=email]', password_selector: 'input[type=password]', submit_selector: 'button[type=submit]', ...(project.login || {}) };
  const start = new URL(portal.login_path || '/login', portal.url).toString();
  const response = await page.goto(start, { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (!response) return { ok: false, reason: 'no response (network or VPN?)' };
  if (response.status() >= 500) return { ok: false, reason: `server error ${response.status()}` };
  await page.fill(login.email_selector, user.email);
  await page.fill(login.password_selector, user.password || '');
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

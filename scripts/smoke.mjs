// Smoke check: does every website in project.json open, at every screen width?
// Saves a screenshot per page and width, and a short summary.
//
//   npm run smoke                 every portal
//   npm run smoke -- admin        only the portal whose slug is "admin"

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, loadProject, launchBrowser, stamp } from './lib/project.mjs';

const project = await loadProject();
const only = process.argv[2];
const portals = project.portals.filter(p => p.url && (!only || p.slug === only));
if (!portals.length) {
  console.error(only ? `No portal called "${only}". Slugs: ${project.portals.map(p => p.slug).join(', ')}` : 'No portal addresses in project.json yet.');
  process.exit(1);
}

const dir = join(ROOT, 'runs', `${stamp()}-smoke`);
await mkdir(dir, { recursive: true });
const browser = await launchBrowser();
const rows = [];

for (const portal of portals) {
  for (const width of project.widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', e => errors.push(e.message));
    let status = 'no response', title = '', result = 'fail';
    try {
      const res = await page.goto(portal.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      status = res ? String(res.status()) : 'no response';
      title = await page.title();
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      result = res && res.status() < 400 ? (wide ? 'warn: scrolls sideways' : 'pass') : 'fail';
    } catch (e) {
      status = /timeout/i.test(e.message) ? 'timeout (network or VPN?)' : e.message.split('\n')[0];
    }
    const shot = `${portal.slug}-${width}.png`;
    await page.screenshot({ path: join(dir, shot) }).catch(() => {});
    rows.push({ portal: portal.name, width, status, title, errors: errors.length, result, shot });
    console.log(`${result.padEnd(22)} ${portal.name} @ ${width}px  (${status}${errors.length ? `, ${errors.length} console errors` : ''})`);
    await page.close();
  }
}
await browser.close();

const md = [
  `# Smoke check, ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, '',
  '| Portal | Width | Status | Title | Console errors | Result | Screenshot |', '|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.portal} | ${r.width} | ${r.status} | ${r.title.replace(/\|/g, '/')} | ${r.errors} | ${r.result} | ${r.shot} |`), '',
];
await writeFile(join(dir, 'SUMMARY.md'), md.join('\n'));
console.log(`\nSaved to ${dir}`);
process.exit(rows.every(r => r.result !== 'fail') ? 0 : 1);

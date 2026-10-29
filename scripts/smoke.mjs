// Smoke check: does everything in project.json open?
// Websites: every screen width, in every browser listed. APIs: does the health address answer?
// Saves a screenshot per page, width and browser, and a short summary.
//
//   npm run smoke                 everything
//   npm run smoke -- admin        only the portal whose slug is "admin"

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, loadProject, launchBrowser, stamp } from './lib/project.mjs';

const project = await loadProject();
const only = process.argv[2];
const chosen = project.portals.filter(p => !only || p.slug === only);
if (only && !chosen.length) {
  console.error(`No portal called "${only}". Slugs: ${project.portals.map(p => p.slug).join(', ') || 'none'}`);
  process.exit(1);
}
for (const p of chosen.filter(p => !p.url)) console.log(`skip                   ${p.name}: no address in project.json yet`);
const portals = chosen.filter(p => p.url);
if (!portals.length) {
  console.error(project.has_mobile && !project.portals.length
    ? 'This project only has a mobile app. Check it with scripts/mobile/ instead.'
    : 'No website or API addresses in project.json yet. Add them with "npm run setup".');
  process.exit(1);
}

const dir = join(ROOT, 'runs', `${stamp()}-smoke`);
await mkdir(dir, { recursive: true });
const rows = [];
const why = e => (/timeout/i.test(e.message) ? 'timeout (network or VPN?)' : e.message.split('\n')[0]);

// APIs: a plain request to the health address. Any answer below 500 means the server is up.
for (const portal of portals.filter(p => p.is_api)) {
  const url = new URL(portal.health_path || '/', portal.url).toString();
  let status = 'no response', result = 'fail';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    status = String(res.status);
    result = res.status < 500 ? 'pass' : 'fail';
  } catch (e) { status = why(e); }
  rows.push({ portal: portal.name, browser: 'api', width: '', status, title: url, errors: 0, result, shot: '' });
  console.log(`${result.padEnd(22)} ${portal.name} (API ${url})  (${status})`);
}

const web = portals.filter(p => !p.is_api);
for (const name of web.length ? project.browsers : []) {
  const browser = await launchBrowser(name);
  for (const portal of web) {
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
      } catch (e) { status = why(e); }
      const shot = `${portal.slug}-${name}-${width}.png`;
      await page.screenshot({ path: join(dir, shot) }).catch(() => {});
      rows.push({ portal: portal.name, browser: name, width, status, title, errors: errors.length, result, shot });
      console.log(`${result.padEnd(22)} ${portal.name} @ ${width}px in ${name}  (${status}${errors.length ? `, ${errors.length} console errors` : ''})`);
      await page.close();
    }
  }
  await browser.close();
}

const md = [
  `# Smoke check, ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, '',
  '| Portal | Browser | Width | Status | Title / address | Console errors | Result | Screenshot |', '|---|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.portal} | ${r.browser} | ${r.width} | ${r.status} | ${String(r.title).replace(/\|/g, '/')} | ${r.errors} | ${r.result} | ${r.shot} |`), '',
];
await writeFile(join(dir, 'SUMMARY.md'), md.join('\n'));
console.log(`\nSaved to ${dir}`);
process.exit(rows.every(r => r.result !== 'fail') ? 0 : 1);

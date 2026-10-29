// Checks the kit itself: renders many kinds of project into temporary folders and makes sure
// every file came out clean and fits that project. Run with "npm test" after changing a template.

import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, validate, prepare, MARK } from './generate.mjs';
import { render } from './render.mjs';

const KIT = dirname(fileURLToPath(import.meta.url));
const json = async f => JSON.parse(await readFile(f, 'utf8'));
const example = await json(join(KIT, 'example.project.json'));
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

// The template engine
check(render('{{#each a}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}', { a: [1, 2, 3] }) === '1, 2, 3', 'each / @last');
check(render('{{#if x}}yes{{else}}no{{/if}}', { x: [] }) === 'no', 'empty list is false');
check(render('{{#each r}}{{name}}-{{top}}{{/each}}', { top: 'T', r: [{ name: 'a' }] }) === 'a-T', 'outer scope lookup');
check(render('{{list.0.k}}', { list: [{ k: 'v' }] }) === 'v', 'index path');

// Settings that must be refused, with the reason people will see
const refused = {
  'empty settings': {},
  'no name': { portals: [{ name: 'Web' }], roles: [{ name: 'User' }] },
  'nothing to test': { project: { name: 'X' }, roles: [{ name: 'User' }] },
  'no roles': { project: { name: 'X' }, portals: [{ name: 'Web' }] },
  'bad address': { project: { name: 'X' }, portals: [{ name: 'Web', url: 'app.test' }], roles: [{ name: 'User' }] },
  'same role twice': { project: { name: 'X' }, portals: [{ name: 'Web' }], roles: [{ name: 'User' }, { name: 'user' }] },
  'same portal twice': { project: { name: 'X' }, portals: [{ name: 'Web' }, { name: 'web' }], roles: [{ name: 'User' }] },
  'mobile role, no app': { project: { name: 'X' }, portals: [{ name: 'Web' }], roles: [{ name: 'User', portal: 'mobile' }] },
  'android, no package': { project: { name: 'X' }, mobile: { android: true }, roles: [{ name: 'User' }] },
  'unknown sign-in': { project: { name: 'X' }, portals: [{ name: 'Web', sign_in: 'magic' }], roles: [{ name: 'User' }] },
  'role name of symbols': { project: { name: 'X' }, portals: [{ name: 'Web' }], roles: [{ name: '***' }] },
};
for (const [label, p] of Object.entries(refused)) check(validate(p).length > 0, `should be refused: ${label}`);

// Projects of every shape. Each must generate cleanly; "expect" lists what must (or must not) be there.
const variants = {
  'website + app + admin (example)': { p: example, expect: {
    'AGENTS.md': [/Android app `com\.acme\.bookings`/, /iPhone app/, /right to left/, /Safari \(WebKit\)/, /Membership plan/],
    'docs/qa/rules/MOBILE-RULES.md': [/Real phone/, /iOS Simulator/],
    'docs/qa/rules/EMAIL-CHECKS.md': [/qa\.team@acme\.example/],
    'docs/qa/rules/PR-TEST-RULES.md': [/Publish `REPORT\.html` as a Claude artifact/, /same link/],
    'docs/qa/rules/RETEST-RUNBOOK.md': [/REPORT-LINK\.txt/],
    '.claude/agents/qa-business.md': [/needs? approval/i],
    '.claude/settings.json': [/ios\.sh/, /adb\.sh/],
  }, absent: ['docs/qa/rules/API-RULES.md'] },
  'mobile app only': { p: await json(join(KIT, 'examples', 'mobile-app-only.json')), expect: {
    'AGENTS.md': [/Uses the mobile app/, /Accessibility is in scope/],
    '.claude/agents/qa-member.md': [/mobile helpers/, /device id/],
    'docs/qa/rules/MOBILE-RULES.md': [/No real phone yet/, /In-app purchases/],
    'docs/qa/FIRST-WEEK.md': [/emulators/],
  }, absent: ['docs/qa/rules/API-RULES.md'], none: { 'docs/qa/FIRST-WEEK.md': /npm run smoke/, '.claude/agents/qa-member.md': /Playwright/ } },
  'API + staff admin': { p: await json(join(KIT, 'examples', 'api-and-admin.json')), expect: {
    'docs/qa/rules/API-RULES.md': [/Public API/, /\/health/],
    '.claude/agents/qa-partner.md': [/curl/],
    'AGENTS.md': [/API, no screens/, /single sign-on/],
    'docs/qa/flow-backlog.md': [/partner-api-access-and-errors/],
  }, absent: ['docs/qa/rules/EMAIL-CHECKS.md', 'docs/qa/rules/MOBILE-RULES.md', '.claude/agents/qa-mobile.md'] },
  'public website, no states, three browsers': { p: await json(join(KIT, 'examples', 'public-website.json')), warn: /No account states/, expect: {
    'AGENTS.md': [/no sign-in \(public pages\)/, /ur read right to left/, /Firefox/, /Say where "expected" comes from/],
    'docs/qa/agents/fixture-recipe.md': [/save-session/],
    'docs/qa/FIRST-WEEK.md': [/save-session/],
  } },
  'only production': { p: { project: { name: 'Live Only' }, environments: [{ name: 'live', url: 'https://live.example', production: true }], portals: [{ name: 'Shop', url: 'https://live.example' }], roles: [{ name: 'Shopper' }], states: ['Guest', 'Signed in'] },
    warn: /Only the live product/, expect: { 'AGENTS.md': [/There is no test environment yet/], 'docs/qa/rules/PR-TEST-RULES.md': [/There is no test environment/] } },
  'bare minimum': { p: { project: { name: 'Tiny' }, portals: [{ name: 'App' }], roles: [{ name: 'User' }] },
    warn: /No tester mailbox/, expect: { 'AGENTS.md': [/None listed yet/, /not set up yet/, /No product spec linked/], 'docs/qa/rules/EMAIL-CHECKS.md': [/No tester mailbox is set up yet/] } },
  'inside the product repo (code folder)': { p: { ...example, sources: { ...example.sources, code_path: '..' } }, expect: {
    'AGENTS.md': [/Product code on this computer: `\.\.`/], '.claude/settings.json': [/git -C \.\. diff/], 'docs/qa/rules/PR-TEST-RULES.md': [/git -C \.\. fetch/] } },
  'odd characters': { p: { project: { name: 'Café "Pro" & Co\'s' }, portals: [{ name: 'Web app (beta)', url: 'http://localhost:3000' }], roles: [{ name: 'Power user "admin"', is_admin: true }, { name: 'Gäst' }], states: ['Trial | ended', 'Ok'] },
    expect: { '.claude/agents/qa-power-user-admin.md': [/Power user 'admin'/], '.claude/agents/qa-gast.md': [/Gäst/] } },
  'no admin, no email, PayPal without card': { p: { project: { name: 'Quiet' }, environments: [{ name: 'test', url: 'https://t.example' }], portals: [{ name: 'Portal', url: 'https://t.example' }], roles: [{ name: 'Member', needs_approval: true }], states: ['New'], mailbox: { product_sends_email: false }, payments: { provider: 'PayPal' }, rules: { report: 'Issues drafted for the tracker' } },
    expect: { 'AGENTS.md': [/PayPal test mode with the provider's published test details/, /Check every message the product sends/], 'docs/qa/agents/fixture-recipe.md': [/Approval/, /npm run new-user/], 'docs/qa/rules/PR-TEST-RULES.md': [/files each issue in the tracker/] }, absent: ['docs/qa/rules/EMAIL-CHECKS.md'],
    none: { 'docs/qa/rules/PR-TEST-RULES.md': /Claude artifact/ } },
};

const BAD = [
  [/\{\{|\}\}/, 'leftover template tags'],
  [/undefined|\[object Object\]|\bNaN\b/, 'an empty value'],
  [/Uses the \.|the \s*\(|\(\s*\)|(?<!`)``(?!`)/, 'a blank where a value should be'],
  [/[^\S\n]{2,}[.,]/, 'a gap before punctuation'],
];

async function files(dir, base = dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await files(p, base)); else out.push(p.slice(base.length + 1));
  }
  return out;
}

let total = 0;
for (const [label, v] of Object.entries(variants)) {
  const out = await mkdtemp(join(tmpdir(), 'qa-kit-'));
  try {
    const r = await generate(v.p, { out });
    if (!r.ok) { fails.push(`${label}: ${(r.errors || []).join('; ')}`); continue; }
    total += r.created.length;
    for (const f of await files(out)) {
      const text = await readFile(join(out, f), 'utf8');
      for (const [re, what] of BAD) {
        const m = text.match(re);
        if (m) fails.push(`${label}: ${f} has ${what}: "${text.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\n/g, '⏎')}"`);
      }
      if (f.startsWith('.claude/agents/')) check(/^---\nname: qa-[\w-]+\ndescription: "[^"\n]+"\n---\n/.test(text), `${label}: ${f} frontmatter`);
      if (f.endsWith('.json')) { try { JSON.parse(text); } catch { fails.push(`${label}: ${f} is not valid JSON`); } }
    }
    const d = prepare(v.p);
    for (const role of d.roles) check(existsSync(join(out, `.claude/agents/qa-${role.slug}.md`)), `${label}: agent for ${role.name}`);
    for (const [f, res] of Object.entries(v.expect || {})) {
      const text = existsSync(join(out, f)) ? await readFile(join(out, f), 'utf8') : '';
      if (!text) { fails.push(`${label}: ${f} missing`); continue; }
      for (const re of res) check(re.test(text), `${label}: ${f} should match ${re}`);
    }
    for (const [f, re] of Object.entries(v.none || {})) {
      const text = existsSync(join(out, f)) ? await readFile(join(out, f), 'utf8') : '';
      check(!re.test(text), `${label}: ${f} should not match ${re}`);
    }
    for (const f of v.absent || []) check(!existsSync(join(out, f)), `${label}: ${f} should not be made`);
    if (v.warn) check(r.warnings.some(w => v.warn.test(w)), `${label}: expected a warning like ${v.warn}`);

    // The run-folder templates must render for every shape too.
    for (const t of await readdir(join(KIT, 'templates-run'))) {
      const text = render(await readFile(join(KIT, 'templates-run', t), 'utf8'), { ...d, run: { name: 'test run' } });
      check(!/\{\{|undefined/.test(text), `${label}: run template ${t}`);
    }
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

// Running setup again keeps hand-edited files and working documents
const out = await mkdtemp(join(tmpdir(), 'qa-kit-'));
try {
  await generate(example, { out });
  const edited = join(out, 'docs/qa/rules/TICKET-RULES.md');
  await writeFile(edited, (await readFile(edited, 'utf8')).replace(new RegExp(`.*${MARK}.*\\n`), '') + '\nMy own rule.\n');
  const second = await generate(example, { out });
  check(second.kept.includes('docs/qa/rules/TICKET-RULES.md'), 'hand-edited file is kept');
  check(second.written.includes('AGENTS.md'), 'generated file is refreshed');
  check(second.kept.includes('docs/qa/handoff.md'), 'living document is kept');
} finally {
  await rm(out, { recursive: true, force: true });
}

console.log(`Rendered ${Object.keys(variants).length} kinds of project (${total} files), ${Object.keys(refused).length} bad settings refused.`);
if (fails.length) { console.error('FAILED:\n- ' + fails.join('\n- ')); process.exit(1); }
console.log('All kit checks passed.');

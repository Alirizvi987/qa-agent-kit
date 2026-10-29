// Turns project.json into this project's QA workspace: house rules, rule files,
// AI agent definitions and Claude Code settings.
//
//   node kit/generate.mjs                 use ./project.json, write into this folder
//   node kit/generate.mjs other.json      use another settings file
//   node kit/generate.mjs --out /tmp/x    write somewhere else (used by the self-test)
//   node kit/generate.mjs --dry           show what would change, write nothing
//
// Generated files carry a marker line. Delete that line in a file to keep your own
// edits: the generator will then leave that file alone.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from './render.mjs';

const KIT = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(KIT, '..');
const TEMPLATES = join(KIT, 'templates');
export const MARK = 'qa-agent-kit:generated';

// kind "rule": regenerated every time unless the marker line was removed.
// kind "living": a working document people keep editing; created only when missing.
const MANIFEST = [
  { t: 'AGENTS.md', kind: 'rule' },
  { t: 'CLAUDE.md', kind: 'rule' },
  { t: 'docs/qa/rules/PR-TEST-RULES.md', kind: 'rule' },
  { t: 'docs/qa/rules/PRD-FIRST-RULE.md', kind: 'rule' },
  { t: 'docs/qa/rules/PO-QUESTION-RULE.md', kind: 'rule' },
  { t: 'docs/qa/rules/TICKET-RULES.md', kind: 'rule' },
  { t: 'docs/qa/rules/RETEST-RUNBOOK.md', kind: 'rule' },
  { t: 'docs/qa/rules/EMAIL-CHECKS.md', kind: 'rule', when: d => d.sends_email },
  { t: 'docs/qa/rules/API-RULES.md', kind: 'rule', when: d => d.has_api },
  { t: 'docs/qa/rules/MOBILE-RULES.md', kind: 'rule', when: d => d.has_mobile },
  { t: 'docs/qa/agents/README.md', kind: 'rule' },
  { t: 'docs/qa/agents/fixture-recipe.md', kind: 'rule' },
  { t: 'docs/qa/agents/verdict-schema.md', kind: 'rule' },
  { t: 'docs/qa/handoff.md', kind: 'living' },
  { t: 'docs/qa/FIRST-WEEK.md', kind: 'living' },
  { t: 'docs/qa/test-plan.md', kind: 'living' },
  { t: 'docs/qa/impact-grid.md', kind: 'living' },
  { t: 'docs/qa/flow-backlog.md', kind: 'living' },
  { t: 'docs/qa/LESSONS.md', kind: 'living' },
  { t: 'docs/qa/test-users.md', kind: 'living' },
  { t: '.claude/agents/qa-role.md', o: r => `.claude/agents/qa-${r.slug}.md`, each: 'tester_roles', as: 'role', kind: 'rule' },
  { t: '.claude/agents/qa-admin.md', o: r => `.claude/agents/qa-${r.slug}.md`, each: 'admin_roles', as: 'role', kind: 'rule' },
  { t: '.claude/agents/qa-mobile.md', kind: 'rule', when: d => d.has_mobile },
  { t: '.claude/agents/qa-reporter.md', kind: 'rule' },
  { t: '.claude/agents/qa-rechecker.md', kind: 'rule' },
  { t: '.claude/settings.json', kind: 'living' },
];

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '')
    .trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
}

const envKey = s => slugify(s).replace(/-/g, '_').toUpperCase();
const list = v => (Array.isArray(v) ? v : []);

const SIGN_IN = {
  password: 'email and password',
  'email-code': 'a code or link sent by email',
  sso: 'single sign-on (Google, Microsoft or company login)',
  none: 'no sign-in (public pages)',
};
const KINDS = ['web', 'admin', 'api'];
const RTL = ['ar', 'he', 'fa', 'ur', 'ps', 'yi'];
const hasMobile = p => Boolean(p?.mobile?.android || p?.mobile?.ios);

export function validate(p) {
  const errors = [];
  if (!p || typeof p !== 'object') return ['The settings are empty.'];
  if (!p.project?.name?.trim()) errors.push('Give the project a name.');
  const portals = list(p.portals).filter(x => x.name);
  if (!portals.length && !hasMobile(p)) errors.push('Add at least one website, portal or API, or tick the mobile app.');
  const roles = list(p.roles).filter(r => r.name);
  if (!roles.length) errors.push('Add at least one role (a type of user).');
  for (const e of list(p.environments)) {
    if (e.url && !/^https?:\/\//.test(e.url)) errors.push(`Environment "${e.name}": the address should start with https:// or http://`);
  }
  for (const x of portals) {
    if (x.url && !/^https?:\/\//.test(x.url)) errors.push(`"${x.name}": the address should start with https:// or http://`);
    if (x.kind && !KINDS.includes(x.kind)) errors.push(`"${x.name}": unknown kind "${x.kind}" (use web, admin or api).`);
    if (x.sign_in && !SIGN_IN[x.sign_in]) errors.push(`"${x.name}": unknown sign-in "${x.sign_in}" (use ${Object.keys(SIGN_IN).join(', ')}).`);
  }
  const portalSlugs = portals.map(x => x.slug || slugify(x.name));
  if (new Set(portalSlugs).size !== portalSlugs.length) errors.push('Two websites or portals have the same name.');
  const slugs = roles.map(r => r.slug || slugify(r.name));
  if (slugs.some(s => !s)) errors.push('Each role name needs at least one letter or number.');
  if (new Set(slugs).size !== slugs.length) errors.push('Two roles have the same name.');
  for (const r of roles) {
    if (r.portal === 'mobile' && !hasMobile(p)) errors.push(`Role "${r.name}" uses the mobile app, but no mobile app is ticked.`);
  }
  if (p.mobile?.android && !p.mobile?.package?.trim()) errors.push('Add the Android app package (for example com.company.app).');
  return errors;
}

// Gaps that don't stop setup but change how agents must work. Shown after generating.
export function warnings(d) {
  const w = [];
  if (!d.environments.length) w.push('No environments listed. Agents will ask which one to use before testing.');
  if (d.only_production) w.push('Only the live product is listed. Agents will look but never create or change anything until a test environment is added.');
  if (d.states_defaulted) w.push(`No account states listed, so the kit used "${d.states.join('", "')}". Add the real ones when you know them.`);
  if (d.sends_email && !d.mailbox.address) w.push('No tester mailbox yet. Emails will be marked "Not covered" until one is added.');
  if (!d.sources.prd) w.push('No product spec (PRD) link. Agents will mark spec checks "Not covered" and ask the lead what is expected.');
  if (!d.sources.designs.length) w.push('No design files. Design checks compare with the previous build instead.');
  for (const x of d.portals.filter(x => !x.url)) w.push(`"${x.name}" has no address yet, so the smoke check skips it.`);
  return w;
}

// Adds the derived values the templates need, so templates stay simple.
export function prepare(p) {
  // Double quotes would break the quoted YAML descriptions in agent files.
  const d = JSON.parse(JSON.stringify(p), (k, v) => (typeof v === 'string' ? v.replace(/"/g, "'").trim() : v));
  d.project.slug = d.project.slug || slugify(d.project.name);
  d.project.summary = d.project.summary || `${d.project.name} is the product under test.`;
  d.today = new Date().toISOString().slice(0, 10);
  d.secrets_file = `~/.qa-secrets/${d.project.slug}.env`;

  d.environments = list(d.environments).filter(e => e.name);
  d.test_environments = d.environments.filter(e => !e.production);
  d.production = d.environments.find(e => e.production) || null;
  d.only_production = Boolean(d.production) && !d.test_environments.length;
  d.main_env = d.test_environments[0]?.name || (d.production ? d.production.name : 'the test environment');

  d.mobile = { android: false, ios: false, ...(d.mobile || {}) };
  d.has_mobile = Boolean(d.mobile.android || d.mobile.ios);
  d.mobile.real_phone = d.mobile.real_phone !== false;
  d.mobile.device = d.mobile.device || 'Samsung Galaxy S22';
  d.mobile.width = d.mobile.width || 1080;
  d.mobile.height = d.mobile.height || 2340;
  d.mobile.dpi = d.mobile.dpi || 420;
  d.mobile.emulators = Number(d.mobile.emulators ?? 3);
  d.mobile.ios_simulator = d.mobile.ios_simulator || 'iPhone 15';
  d.mobile.platforms = [d.mobile.android && 'Android', d.mobile.ios && 'iPhone'].filter(Boolean).join(' and ');

  d.portals = list(d.portals).filter(x => x.name).map(x => {
    const kind = KINDS.includes(x.kind) ? x.kind : /admin/i.test(x.name) ? 'admin' : 'web';
    const sign_in = kind === 'api' ? x.sign_in || 'none' : SIGN_IN[x.sign_in] ? x.sign_in : 'password';
    return {
      ...x, kind, sign_in, slug: x.slug || slugify(x.name), login_path: x.login_path || '/login',
      health_path: x.health_path || '/', is_api: kind === 'api', is_admin_panel: kind === 'admin',
      password_sign_in: sign_in === 'password', public: sign_in === 'none',
      sign_in_text: kind === 'api' ? 'an API key or token' : SIGN_IN[sign_in],
    };
  });
  d.web_portals = d.portals.filter(x => !x.is_api);
  d.api_portals = d.portals.filter(x => x.is_api);
  d.has_web = d.web_portals.length > 0;
  d.has_api = d.api_portals.length > 0;
  d.has_saved_sessions = d.portals.some(x => x.sign_in === 'email-code' || x.sign_in === 'sso');
  const portalBy = slug => d.portals.find(x => x.slug === slug) || d.web_portals[0] || d.portals[0];

  d.states = list(d.states).map(s => String(s).trim()).filter(Boolean);
  d.states_defaulted = !d.states.length;
  if (d.states_defaulted) d.states = ['Signed out', 'New user', 'Existing user'];

  d.roles = list(d.roles).filter(r => r.name).map(r => {
    const slug = r.slug || slugify(r.name);
    const on_mobile = d.has_mobile && (r.portal === 'mobile' || !d.portals.length);
    const portal = on_mobile ? null : portalBy(r.portal || '');
    const portal_name = on_mobile ? 'mobile app' : portal?.name || 'product';
    return {
      ...r, slug, key: envKey(slug), on_mobile,
      lane_prefix: `FIX_${envKey(slug)}_A`,
      summary: r.summary || `a ${r.name} user`,
      portal_name, portal_url: portal?.url || '', portal_slug: portal?.slug || '',
      on_api: Boolean(portal?.is_api),
      sign_in_text: on_mobile ? 'the app\'s own sign-in' : portal?.sign_in_text || SIGN_IN.password,
      depth: r.is_admin ? 'full' : r.default_depth || 'full',
    };
  });
  d.tester_roles = d.roles.filter(r => !r.is_admin);
  d.admin_roles = d.roles.filter(r => r.is_admin);
  d.approval_roles = d.roles.filter(r => r.needs_approval);
  d.has_admin = d.admin_roles.length > 0;
  d.admin_name = d.admin_roles[0]?.name || 'the lead';
  d.admin_agent = d.admin_roles[0] ? `qa-${d.admin_roles[0].slug}` : '';

  d.sources = { designs: [], repos: [], ...(d.sources || {}) };
  d.sources.designs = list(d.sources.designs).filter(x => x.url || x.name);
  d.sources.repos = list(d.sources.repos).filter(x => x.url || x.name);
  if (/^none/i.test(d.sources.tracker || '')) d.sources.tracker = '';
  d.has_designs = d.sources.designs.length > 0;
  d.sources.code_path = String(d.sources.code_path || '').trim();

  d.mailbox = { connector: 'Gmail', ...(d.mailbox || {}) };
  d.sends_email = d.mailbox.product_sends_email !== false;
  d.has_mailbox = Boolean(d.mailbox.address);
  d.mailbox.example_alias = (d.mailbox.alias_pattern || (d.mailbox.address ? d.mailbox.address.replace('@', '+{alias}@') : 'qa+{alias}@example.com')).replace('{alias}', 'sara.c1');
  d.mailbox.alias_pattern = d.mailbox.alias_pattern || (d.mailbox.address ? d.mailbox.address.replace('@', '+{alias}@') : 'qa+{alias}@example.com');

  d.payments = { provider: '', test_card: '', ...(d.payments || {}) };
  d.has_payments = Boolean(d.payments.provider && !/^none/i.test(d.payments.provider));
  d.in_app_payments = /app store|google play|in-app/i.test(d.payments.provider);
  d.payments.test_details = d.payments.test_card
    ? `test card ${d.payments.test_card}`
    : d.in_app_payments ? 'sandbox test accounts (App Store sandbox tester, Google Play licence tester)'
    : `the provider's published test details`;

  d.locales = list(d.locales).map(s => String(s).trim()).filter(Boolean);
  d.has_locales = d.locales.length > 1;
  d.locales_text = d.locales.join(', ');
  d.rtl_locales = d.locales.filter(l => RTL.includes(l.toLowerCase().split(/[-_]/)[0]));
  d.has_rtl = d.rtl_locales.length > 0;
  d.rtl_text = d.rtl_locales.join(', ');

  d.browsers = list(d.browsers).filter(b => ['chromium', 'firefox', 'webkit'].includes(b));
  if (!d.browsers.length) d.browsers = ['chromium'];
  d.browsers_text = d.browsers.map(b => ({ chromium: 'Chrome / Edge (Chromium)', firefox: 'Firefox', webkit: 'Safari (WebKit)' }[b])).join(', ');
  d.multi_browser = d.browsers.length > 1;
  d.install_cmd = `npx playwright install ${d.browsers.join(' ')}`;

  d.levers = list(d.levers).map(s => String(s).trim()).filter(Boolean);
  d.has_levers = d.levers.length > 0;
  d.other_surfaces = String(d.other_surfaces || '').trim();

  d.rules = {
    recheck_times: 2, prd_first: true, min_design_diff_px: 2, no_cleanup: true,
    headless_first: true, accessibility: false, severity: ['P1', 'P2', 'P3'], report: 'A shareable web page',
    ...(d.rules || {}),
  };
  d.rules.severity = list(d.rules.severity).length ? d.rules.severity : ['P1', 'P2', 'P3'];
  d.report_artifact = /artifact|web page/i.test(d.rules.report);
  d.report_tracker = /tracker/i.test(d.rules.report);
  d.widths = list(d.widths).map(Number).filter(n => n > 0);
  if (!d.widths.length) d.widths = [1440, 1280, 390];
  d.widths_text = d.widths.join(', ');

  d.tools_text = [d.has_web && 'headless Playwright for websites', d.has_api && 'HTTP requests for APIs',
    d.mobile.android && 'ADB for Android', d.mobile.ios && 'the iOS Simulator (xcrun simctl) for iPhone'].filter(Boolean).join(', ');
  d.warnings = warnings(d);
  return d;
}

async function stamp(text, path) {
  const marker = `<!-- ${MARK} · made from project.json by "npm run generate". Delete this line to keep your own edits. -->`;
  if (!path.endsWith('.md')) return text;
  // Agent files must start with their frontmatter, so the marker goes after it.
  const fm = text.match(/^---\n[\s\S]*?\n---\n/);
  return fm ? fm[0] + marker + '\n' + text.slice(fm[0].length) : marker + '\n' + text;
}

export async function generate(project, { out = ROOT, dry = false } = {}) {
  const errors = validate(project);
  if (errors.length) return { ok: false, errors };
  // Set by "npm run add-to": the kit lives inside the product's repo, whose code is one folder up.
  const codeFolder = join(out, '.code-folder');
  if (!project.sources?.code_path && existsSync(codeFolder)) {
    project = { ...project, sources: { ...(project.sources || {}), code_path: (await readFile(codeFolder, 'utf8')).trim() } };
  }
  const data = prepare(project);
  const result = { ok: true, written: [], created: [], kept: [], errors: [], warnings: data.warnings };

  for (const item of MANIFEST) {
    if (item.when && !item.when(data)) continue;
    const src = await readFile(join(TEMPLATES, item.t + '.tmpl'), 'utf8');
    const jobs = item.each
      ? data[item.each].map(x => ({ path: item.o(x), data: { ...data, [item.as]: x } }))
      : [{ path: item.t, data }];

    for (const job of jobs) {
      const dest = join(out, job.path);
      const exists = existsSync(dest);
      if (exists && item.kind === 'living') { result.kept.push(job.path); continue; }
      if (exists && item.kind === 'rule') {
        const current = await readFile(dest, 'utf8');
        if (!current.includes(MARK)) { result.kept.push(job.path); continue; }
      }
      let text;
      try {
        text = render(src, job.data);
      } catch (e) {
        result.errors.push(`${job.path}: ${e.message}`);
        continue;
      }
      text = await stamp(text.replace(/\n{3,}/g, '\n\n'), job.path);
      if (!dry) {
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, text);
      }
      (exists ? result.written : result.created).push(job.path);
    }
  }
  result.ok = result.errors.length === 0;
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = name => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const dry = args.includes('--dry');
  const out = flag('--out');
  const file = args.find(a => !a.startsWith('--')) || join(ROOT, 'project.json');
  if (!existsSync(file)) {
    console.error(`No settings file at ${file}.\nRun "npm run setup" to fill one in, or copy kit/example.project.json to project.json.`);
    process.exit(1);
  }
  const project = JSON.parse(await readFile(file, 'utf8'));
  const r = await generate(project, { out: out ? resolve(out) : ROOT, dry });
  if (!r.ok && !r.created) {
    console.error('Please fix these first:\n- ' + r.errors.join('\n- '));
    process.exit(1);
  }
  const line = (label, xs) => xs.length && console.log(`${label} (${xs.length}):\n  ${xs.join('\n  ')}`);
  line(dry ? 'Would create' : 'Created', r.created);
  line(dry ? 'Would update' : 'Updated', r.written);
  line('Kept as you left them', r.kept);
  line('Good to know', r.warnings);
  if (r.errors.length) { console.error('Problems:\n- ' + r.errors.join('\n- ')); process.exit(1); }
  console.log('\nDone. Next: open Claude Code in this folder and say "Read AGENTS.md and start the first-week checklist."');
}

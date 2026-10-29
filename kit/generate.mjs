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
  { t: 'docs/qa/rules/EMAIL-CHECKS.md', kind: 'rule' },
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

export function validate(p) {
  const errors = [];
  if (!p || typeof p !== 'object') return ['The settings are empty.'];
  if (!p.project?.name?.trim()) errors.push('Give the project a name.');
  if (!list(p.portals).filter(x => x.name).length) errors.push('Add at least one website, portal or app screen to test.');
  if (!list(p.roles).filter(x => x.name).length) errors.push('Add at least one role (a type of user).');
  if (!list(p.states).filter(Boolean).length) errors.push('Add at least one account state.');
  for (const e of list(p.environments)) {
    if (e.url && !/^https?:\/\//.test(e.url)) errors.push(`Environment "${e.name}": the address should start with https://`);
  }
  for (const x of list(p.portals)) {
    if (x.url && !/^https?:\/\//.test(x.url)) errors.push(`Portal "${x.name}": the address should start with https://`);
  }
  const slugs = list(p.roles).map(r => r.slug || slugify(r.name));
  if (new Set(slugs).size !== slugs.length) errors.push('Two roles have the same name.');
  return errors;
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
  d.main_env = d.test_environments[0]?.name || 'the test environment';

  d.portals = list(d.portals).filter(x => x.name).map(x => ({
    ...x, slug: x.slug || slugify(x.name), login_path: x.login_path || '/login',
  }));
  const portalBy = slug => d.portals.find(x => x.slug === slug) || d.portals[0];

  d.states = list(d.states).filter(Boolean);
  d.roles = list(d.roles).filter(r => r.name).map(r => {
    const slug = r.slug || slugify(r.name);
    const portal = portalBy(r.portal || '');
    return {
      ...r, slug, key: envKey(slug),
      lane_prefix: `FIX_${envKey(slug)}_A`,
      summary: r.summary || `a ${r.name} user`,
      portal_name: portal?.name || '', portal_url: portal?.url || '', portal_slug: portal?.slug || '',
      depth: r.is_admin ? 'full' : r.default_depth || 'full',
    };
  });
  d.tester_roles = d.roles.filter(r => !r.is_admin);
  d.admin_roles = d.roles.filter(r => r.is_admin);
  d.approval_roles = d.roles.filter(r => r.needs_approval);
  d.has_admin = d.admin_roles.length > 0;
  d.admin_name = d.admin_roles[0]?.name || 'Admin';
  d.admin_agent = d.admin_roles[0] ? `qa-${d.admin_roles[0].slug}` : '';

  d.mobile = { android: false, ios: false, ...(d.mobile || {}) };
  d.has_mobile = Boolean(d.mobile.android || d.mobile.ios);
  d.mobile.device = d.mobile.device || 'Samsung Galaxy S22';
  d.mobile.width = d.mobile.width || 1080;
  d.mobile.height = d.mobile.height || 2340;
  d.mobile.dpi = d.mobile.dpi || 420;
  d.mobile.emulators = Number(d.mobile.emulators ?? 3);

  d.sources = { designs: [], repos: [], ...(d.sources || {}) };
  d.sources.designs = list(d.sources.designs).filter(x => x.url || x.name);
  d.sources.repos = list(d.sources.repos).filter(x => x.url || x.name);
  d.mailbox = { connector: 'Gmail', ...(d.mailbox || {}) };
  d.mailbox.example_alias = (d.mailbox.alias_pattern || 'qa+{alias}@example.com').replace('{alias}', 'sara.c1');
  d.payments = { provider: '', ...(d.payments || {}) };
  d.has_payments = Boolean(d.payments.provider && d.payments.provider !== 'None');

  d.rules = {
    recheck_times: 2, prd_first: true, min_design_diff_px: 2, no_cleanup: true,
    headless_first: true, severity: ['P1', 'P2', 'P3'], report: 'A shareable web page',
    ...(d.rules || {}),
  };
  d.widths = list(d.widths).length ? d.widths : [1440, 1280, 390];
  d.widths_text = d.widths.join(', ');
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
  const data = prepare(project);
  const result = { ok: true, written: [], created: [], kept: [], errors: [] };

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
  if (r.errors.length) { console.error('Problems:\n- ' + r.errors.join('\n- ')); process.exit(1); }
  console.log('\nDone. Next: open Claude Code in this folder and say "Read AGENTS.md and start the first-week checklist."');
}

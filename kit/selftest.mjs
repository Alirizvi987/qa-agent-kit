// Checks the kit itself: renders the example project into a temporary folder and makes sure
// every file came out clean. Run with "npm test" after changing a template.

import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, validate, MARK } from './generate.mjs';
import { render } from './render.mjs';

const KIT = dirname(fileURLToPath(import.meta.url));
const example = JSON.parse(await readFile(join(KIT, 'example.project.json'), 'utf8'));
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

// The template engine
check(render('{{#each a}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}', { a: [1, 2, 3] }) === '1, 2, 3', 'each / @last');
check(render('{{#if x}}yes{{else}}no{{/if}}', { x: [] }) === 'no', 'empty list is false');
check(render('{{#each r}}{{name}}-{{top}}{{/each}}', { top: 'T', r: [{ name: 'a' }] }) === 'a-T', 'outer scope lookup');
check(render('{{list.0.k}}', { list: [{ k: 'v' }] }) === 'v', 'index path');

// Validation
check(validate({}).length > 0, 'empty settings are rejected');
check(validate(example).length === 0, 'example is valid: ' + validate(example).join('; '));

// Full generation, twice (the second run must keep hand-edited files)
const out = await mkdtemp(join(tmpdir(), 'qa-kit-'));
try {
  const first = await generate(example, { out });
  check(first.ok, 'generate: ' + first.errors.join('; '));
  for (const f of first.created) {
    const text = await readFile(join(out, f), 'utf8');
    check(!/\{\{|\}\}/.test(text), `${f} has leftover template tags`);
    check(!/undefined|\[object Object\]/.test(text), `${f} has an empty value`);
    if (f.startsWith('.claude/agents/')) check(/^---\nname: qa-[\w-]+\ndescription: "[^"\n]+"\n---\n/.test(text), `${f} frontmatter`);
    if (f.endsWith('.json')) { try { JSON.parse(text); } catch { fails.push(`${f} is not valid JSON`); } }
  }
  check(first.created.includes('.claude/agents/qa-business.md'), 'one agent per role');

  const edited = join(out, 'docs/qa/rules/TICKET-RULES.md');
  await writeFile(edited, (await readFile(edited, 'utf8')).replace(new RegExp(`.*${MARK}.*\\n`), '') + '\nMy own rule.\n');
  const second = await generate(example, { out });
  check(second.kept.includes('docs/qa/rules/TICKET-RULES.md'), 'hand-edited file is kept');
  check(second.written.includes('AGENTS.md'), 'generated file is refreshed');
  check(second.kept.includes('docs/qa/handoff.md'), 'living document is kept');
  console.log(`Rendered ${first.created.length} files.`);
} finally {
  await rm(out, { recursive: true, force: true });
}

if (fails.length) { console.error('FAILED:\n- ' + fails.join('\n- ')); process.exit(1); }
console.log('All kit checks passed.');

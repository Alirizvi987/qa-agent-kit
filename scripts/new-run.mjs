// Starts a run folder with the documents every test run fills in:
// brief, coverage grid, use cases, email log, design check, restore log, PO questions.
//
//   npm run new-run -- pr-123-new-plans

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '../kit/render.mjs';
import { slugify } from '../kit/generate.mjs';
import { ROOT, loadProject } from './lib/project.mjs';

const name = process.argv.slice(2).join(' ').trim();
if (!name) {
  console.error('Give the run a name. Example: npm run new-run -- pr-123-new-plans');
  process.exit(1);
}
const project = await loadProject();
const folder = join(ROOT, 'runs', `${project.today}-${slugify(name)}`);
if (existsSync(folder)) { console.error(`${folder} already exists.`); process.exit(1); }
await mkdir(folder, { recursive: true });

const tdir = join(ROOT, 'kit', 'templates-run');
for (const t of await readdir(tdir)) {
  const out = render(await readFile(join(tdir, t), 'utf8'), { ...project, run: { name } });
  await writeFile(join(folder, t.replace(/\.tmpl$/, '')), out.replace(/\n{3,}/g, '\n\n'));
}
for (const role of project.roles) await mkdir(join(folder, `${role.slug}-A`), { recursive: true });
if (project.has_mobile) await mkdir(join(folder, 'mobile'), { recursive: true });
if (!project.sends_email) await import('node:fs/promises').then(fs => fs.rm(join(folder, 'EMAILS.md'), { force: true }));
console.log(`Run folder ready: ${folder}\nStart with BRIEF.md, then COVERAGE.md and USE-CASES.md.`);

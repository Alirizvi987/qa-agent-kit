// Puts the kit inside your own project's repository, in a "qa" folder, so the QA workspace lives
// and is reviewed next to the code. Nothing outside that folder is changed.
//
//   npm run add-to -- ../my-app            → ../my-app/qa
//   npm run add-to -- ../my-app testing    → ../my-app/testing
//
// Then: cd ../my-app/qa && npm install && npm run setup

import { cp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { ROOT } from './lib/project.mjs';

const [repoArg, folder = 'qa'] = process.argv.slice(2);
if (!repoArg) {
  console.error('Where is your project? Example: npm run add-to -- ../my-app');
  process.exit(1);
}
const repo = resolve(repoArg);
if (!existsSync(repo)) { console.error(`No folder at ${repo}.`); process.exit(1); }
if (!existsSync(join(repo, '.git'))) console.log(`Note: ${repo} is not a git repository. Continuing anyway.`);
if (!/^[\w.-]+$/.test(folder)) { console.error('Use a simple folder name, like qa or testing.'); process.exit(1); }
const dest = join(repo, folder);
if (resolve(dest).startsWith(ROOT + sep) || resolve(dest) === ROOT) { console.error('That is inside the kit itself.'); process.exit(1); }
if (existsSync(dest) && (await readdir(dest)).length) {
  console.error(`${dest} already has files. Pick another name: npm run add-to -- ${repoArg} qa-kit`);
  process.exit(1);
}

// Copy everything people need; leave out git history, installed packages, local settings and test proof.
const skip = new Set(['.git', 'node_modules', 'runs', 'project.json', '.DS_Store']);
await mkdir(dest, { recursive: true });
await cp(ROOT, dest, {
  recursive: true,
  filter: src => {
    const rel = relative(ROOT, src);
    if (!rel) return true;
    const top = rel.split(sep)[0];
    return !skip.has(top) && !rel.startsWith(join('docs', 'kit', 'video')) && !rel.endsWith('.mp4');
  },
});
await writeFile(join(dest, '.code-folder'), relative(dest, repo) + '\n');

const near = relative(process.cwd(), dest);
console.log(`The kit is now in ${dest}

Next:
  cd ${near && !near.startsWith('../..') ? near : dest}
  npm install && npx playwright install chromium
  npm run setup

Open Claude Code in that folder (not the project root) so it loads the QA agents.
Agents can read your code from there (it is ${relative(dest, repo)}), which helps them judge impact.
Commit the folder with your code; passwords and test proof stay out (see its .gitignore).`);

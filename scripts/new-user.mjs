// Makes a new test user's identity before sign-up: a real-looking name, an email alias that lands in
// the tester mailbox, and a strong password. The password goes straight into the private secrets file
// and is never printed; sign-up scripts type it with fillSecret().
//
//   npm run new-user -- customer               next free user in lane A
//   npm run new-user -- customer B "Sara Chaudhry"
//
// Then sign the user up through the real screens (docs/qa/agents/fixture-recipe.md).

import { appendFile, chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadProject, loadSecrets } from './lib/project.mjs';
import { slugify } from '../kit/generate.mjs';

const [roleArg, laneArg = 'A', nameArg] = process.argv.slice(2);
const project = await loadProject();
const role = project.roles.find(r => r.slug === slugify(roleArg || '') || r.name.toLowerCase() === String(roleArg).toLowerCase());
if (!role) {
  console.error(`Which role? One of: ${project.roles.map(r => r.slug).join(', ')}\nExample: npm run new-user -- ${project.roles[0]?.slug || 'customer'} A`);
  process.exit(1);
}
const lane = laneArg.toUpperCase();
if (!/^[A-Z]$/.test(lane)) { console.error('The lane is one letter: A, B, C…'); process.exit(1); }
if (!project.mailbox.address && !project.mailbox.alias_pattern?.includes('{alias}')) {
  console.error('Add a tester mailbox in "npm run setup" first, so every test user\'s email reaches it.');
  process.exit(1);
}

const { file, values } = loadSecrets(project);
const prefix = `FIX_${role.key}_${lane}_U`;
let slot = 1;
while (values[`${prefix}${slot}_EMAIL`]) slot++;
const key = `${prefix}${slot}`;

// Real-looking, varied names find real bugs (accents, apostrophes, long surnames).
const NAMES = ['Sara Chaudhry', 'Daniel Okafor', 'Mei Lin Tan', 'Lucas Ferreira', 'Aisha Rahman', 'Tom O\'Brien', 'Zofia Nowak',
  'Omar Haddad', 'Priya Natarajan', 'Jonas Müller', 'Grace Mensah', 'Hiro Tanaka', 'Elena Rossi', 'Kwame Asante', 'Nora Lindqvist',
  'Ahmed Siddiqui', 'Isabella García', 'Ravi Kapoor', 'Chloé Martin', 'Yusuf Demir'];
const used = new Set(Object.entries(values).filter(([k]) => k.endsWith('_EMAIL')).map(([, v]) => v.toLowerCase()));
const pattern = project.mailbox.alias_pattern;
const aliasFor = (name, n) => {
  const [first, ...rest] = slugify(name).split('-');
  const last = rest.pop() || 'x';
  return `${first}.${last[0]}${n}${lane === 'A' ? '' : lane.toLowerCase()}`;
};
let name = nameArg, alias, email;
for (let tries = 0; tries < 200; tries++) {
  name = nameArg || NAMES[randomInt(NAMES.length)];
  alias = aliasFor(name, slot + Math.floor(tries / NAMES.length));
  email = pattern.replace('{alias}', alias);
  if (!used.has(email.toLowerCase())) break;
}

// 16 characters, with upper, lower, digits and a symbol most sign-up forms accept.
const pick = s => s[randomInt(s.length)];
const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!#'];
const chars = [...sets.map(pick), ...Array.from({ length: 12 }, () => pick(sets.slice(0, 3).join('')))];
for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
const password = chars.join('');

await mkdir(dirname(file), { recursive: true });
await chmod(dirname(file), 0o700).catch(() => {});
await appendFile(file, [`${key}_NAME=${name}`, `${key}_EMAIL=${email}`, `${key}_PASSWORD=${password}`, ''].join('\n'));
await chmod(file, 0o600);

// Public record (no password): docs/qa/test-users.md
const users = join(ROOT, 'docs', 'qa', 'test-users.md');
if (existsSync(users)) {
  const text = await readFile(users, 'utf8');
  const row = `| \`${key}\` | ${role.name} | ${alias} | | not signed up yet | new-user, ${project.today} | ${name} |`;
  const lines = text.split('\n');
  const placeholder = lines.findIndex(l => l.startsWith(`| \`${key}\` |`) && l.includes('_alias_'));
  const lastRow = lines.map((l, i) => (l.startsWith('|') ? i : -1)).filter(i => i >= 0).pop();
  if (placeholder >= 0) lines[placeholder] = row;
  else if (lastRow !== undefined) lines.splice(lastRow + 1, 0, row);
  else lines.push(row);
  await writeFile(users, lines.join('\n'));
}

console.log(`New ${role.name} test user, lane ${lane}:
  key    ${key}
  name   ${name}
  email  ${email}
  password saved in the secrets file (not shown)

Next: sign them up through the real ${role.portal_name} screens. In a Playwright script:
  import { fillSecret } from '${pathToFileURL(join(ROOT, 'scripts', 'lib', 'project.mjs')).href}';
  await page.fill('input[type=email]', '${email}');
  await fillSecret(page, 'input[type=password]', '${key}');
Then add ${key}_ID=<user id> to the secrets file and update the row in docs/qa/test-users.md.`);

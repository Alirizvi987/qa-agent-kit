// Turns a run's REPORT.md into REPORT.html: one self-contained page (screenshots embedded) that the
// lead publishes as a Claude artifact or shares as a file. It refuses to build the page when proof is
// missing or a password, token or card number slipped in.
//
//   npm run report                          the newest run folder
//   npm run report -- runs/2026-10-29-pr-123

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, extname, relative } from 'node:path';
import { ROOT, loadProject } from './lib/project.mjs';

const project = await loadProject();
const runs = join(ROOT, 'runs');
let dir = process.argv[2] ? resolve(process.argv[2]) : null;
if (!dir) {
  const all = existsSync(runs) ? (await readdir(runs, { withFileTypes: true })).filter(e => e.isDirectory() && existsSync(join(runs, e.name, 'REPORT.md'))).map(e => e.name).sort() : [];
  if (!all.length) { console.error('No run folder with a REPORT.md yet. Start one with: npm run new-run -- <name>'); process.exit(1); }
  dir = join(runs, all[all.length - 1]);
}
const source = join(dir, 'REPORT.md');
if (!existsSync(source)) { console.error(`No REPORT.md in ${dir}. Write it from REPORT-DRAFT.md once the re-check is done.`); process.exit(1); }
const md = await readFile(source, 'utf8');
// Notes inside <!-- --> are for the writer, not the page; blank them out (keeping line numbers) before checking.
const visible = md.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
const problems = [];

// 1. Nothing secret may be published.
const testCards = new Set([project.payments?.test_card, '4242424242424242', '4000056655665556', '5555555555554444', '378282246310005', '4111111111111111', '4012888888881881', '5105105105105100', '371449635398431', '6011111111111117']
  .filter(Boolean).map(s => String(s).replace(/\D/g, '')));
const luhn = n => [...n].reverse().reduce((s, c, i) => s + (i % 2 ? [0, 2, 4, 6, 8, 1, 3, 5, 7, 9][+c] : +c), 0) % 10 === 0;
visible.split('\n').forEach((line, i) => {
  const where = `REPORT.md line ${i + 1}`;
  if (/_PASSWORD\s*=|\bpassword\s*[:=]\s*\S{4,}/i.test(line)) problems.push(`${where}: looks like a password`);
  if (/\bBearer\s+[\w.-]{16,}|\beyJ[\w-]{8,}\.[\w-]{8,}\.|\b(sk|rk)_live_\w+|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_\w{20,}/.test(line)) problems.push(`${where}: looks like a token or key`);
  for (const m of line.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) {
    const n = m[0].replace(/\D/g, '');
    if (n.length >= 13 && luhn(n) && !testCards.has(n) && !n.startsWith('4000')) problems.push(`${where}: looks like a real card number`);
  }
});

// 2. Every screenshot it shows must exist; embed it so the page works anywhere.
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const embedded = new Map();
let bytes = 0;
for (const m of visible.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
  const target = m[1];
  if (/^(https?:|mailto:|#|data:)/.test(target) || embedded.has(target)) continue;
  const file = resolve(dir, decodeURI(target));
  if (!existsSync(file)) { if (m[0].startsWith('!') || TYPES[extname(file).toLowerCase()]) problems.push(`missing proof file: ${target}`); continue; }
  const type = TYPES[extname(file).toLowerCase()];
  if (!type) { console.log(`note: ${target} is not a picture, so it is not inside the page. Attach it separately.`); continue; }
  const data = await readFile(file);
  bytes += data.length;
  embedded.set(target, `data:${type};base64,${data.toString('base64')}`);
}
if (bytes > 14 * 1024 * 1024) problems.push(`screenshots add up to ${(bytes / 1048576).toFixed(1)} MB; keep it under 14 MB (crop, or use fewer)`);

if (problems.length) {
  console.error('The report page was NOT made. Fix these first:\n- ' + problems.join('\n- '));
  process.exit(1);
}

// 3. Markdown to HTML: the parts reports use.
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STATUS = { pass: 'pass', fixed: 'pass', fail: 'fail', 'not fixed': 'fail', 'not covered': 'warn', 'partly fixed': 'warn', "can't test yet": 'warn', blocked: 'warn' };

function inline(text) {
  const codes = [];
  let s = esc(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<figure><img src="${embedded.get(src) || src}" alt="${alt}" loading="lazy"><figcaption>${alt}</figcaption></figure>`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => `<a href="${embedded.get(href) || href}">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_]+)_(?=[\s).,:;!?]|$)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])\*([^*]+)\*(?=[\s).,:;!?]|$)/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}
const cell = c => {
  const status = STATUS[c.trim().toLowerCase().replace(/[.*_]/g, '')];
  return status ? `<span class="pill ${status}">${inline(c.trim())}</span>` : inline(c.trim());
};
const row = l => l.trim().replace(/^\||\|$/g, '').split('|');

function blocks(lines) {
  const out = [];
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (/^\s*<!--/.test(l)) { while (i < lines.length && !lines[i].includes('-->')) i++; i++; continue; }
    if (/^```/.test(l)) {
      const body = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++; out.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`); continue;
    }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^\s*\|/.test(l) && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || '')) {
      const head = row(l); i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) body.push(row(lines[i++]));
      out.push(`<div class="table"><table><thead><tr>${head.map(c => `<th>${inline(c.trim())}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${cell(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^>\s?/.test(l)) {
      const body = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${blocks(body)}</blockquote>`); continue;
    }
    const li = l.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (li) {
      const indent = li[1].length, ordered = /\d/.test(li[2]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        if (m && m[1].length === indent) { items.push([m[3]]); i++; continue; }
        if (lines[i].trim() && (/^\s+/.test(lines[i])) && items.length) { items[items.length - 1].push(lines[i].slice(Math.min(indent + 2, lines[i].search(/\S/)))); i++; continue; }
        break;
      }
      const html = items.map(([first, ...rest]) => {
        const task = first.match(/^\[( |x)\]\s+(.*)$/i);
        const head = task ? `<span class="box">${task[1].trim() ? '☑' : '☐'}</span> ${inline(task[2])}` : inline(first);
        return `<li>${head}${rest.length ? blocks(rest) : ''}</li>`;
      }).join('');
      out.push(ordered ? `<ol>${html}</ol>` : `<ul>${html}</ul>`); continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*\||\s*([-*+]|\d+\.)\s)/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]);
    out.push(`<p>${para.map(inline).join('<br>')}</p>`);
  }
  return out.join('\n');
}

const title = (md.match(/^#\s+(.+)$/m)?.[1] || `${project.project.name} test report`).replace(/[*_`]/g, '');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root { --paper: #F6F7F5; --surface: #FFFFFF; --ink: #17201B; --muted: #5A6760; --line: #D9DFDB; --accent: #0B6B52;
  --pass: #0B6B52; --pass-bg: #DCEEE6; --fail: #B4381F; --fail-bg: #F7E2DB; --warn: #8A5A00; --warn-bg: #F4EAD2; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --paper: #0F1512; --surface: #161E1A; --ink: #E5ECE7; --muted: #9AA9A1; --line: #2A3530;
  --accent: #5DC59E; --pass: #5DC59E; --pass-bg: #15332A; --fail: #F08468; --fail-bg: #3A1E16; --warn: #E2B455; --warn-bg: #33290F; color-scheme: dark; } }
:root[data-theme="dark"] { --paper: #0F1512; --surface: #161E1A; --ink: #E5ECE7; --muted: #9AA9A1; --line: #2A3530;
  --accent: #5DC59E; --pass: #5DC59E; --pass-bg: #15332A; --fail: #F08468; --fail-bg: #3A1E16; --warn: #E2B455; --warn-bg: #33290F; color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 920px; margin: 0 auto; padding: 40px 16px 80px; }
h1 { font-size: clamp(1.7rem, 1.2rem + 2vw, 2.4rem); line-height: 1.15; margin: 0 0 8px; letter-spacing: -.01em; }
h2 { font-size: 1.35rem; margin: 40px 0 12px; padding-top: 18px; border-top: 1px solid var(--line); }
h3 { font-size: 1.08rem; margin: 26px 0 8px; }
p, li { max-width: 72ch; }
a { color: var(--accent); }
code { font: .875em ui-monospace, Menlo, monospace; background: var(--surface); border: 1px solid var(--line); border-radius: 5px; padding: 1px 5px; }
pre { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px; overflow-x: auto; }
pre code { border: 0; padding: 0; }
.table { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); margin: 12px 0; }
table { border-collapse: collapse; width: 100%; font-size: .9375rem; }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: .8125rem; color: var(--muted); font-weight: 600; }
tr:last-child td { border-bottom: 0; }
.pill { display: inline-block; padding: 1px 9px; border-radius: 999px; font-size: .8125rem; font-weight: 600; white-space: nowrap; }
.pill.pass { color: var(--pass); background: var(--pass-bg); } .pill.fail { color: var(--fail); background: var(--fail-bg); } .pill.warn { color: var(--warn); background: var(--warn-bg); }
figure { margin: 14px 0; } figure img { max-width: 100%; height: auto; border: 1px solid var(--line); border-radius: 10px; display: block; }
figcaption { font-size: .8125rem; color: var(--muted); margin-top: 6px; }
blockquote { margin: 12px 0; padding: 4px 16px; border-left: 3px solid var(--accent); color: var(--muted); }
.box { font-size: 1.05em; } hr { border: 0; border-top: 1px solid var(--line); margin: 28px 0; }
@media (max-width: 560px) { th, td { padding: 8px; } main { padding-top: 28px; } }
footer { margin-top: 48px; font-size: .8125rem; color: var(--muted); }
</style>
</head>
<body>
<main>
${blocks(md.split('\n'))}
<footer>Made from ${esc(relative(ROOT, source))} on ${new Date().toISOString().slice(0, 10)}. Every issue was reproduced ${project.rules.recheck_times} times from the screens before it was included.</footer>
</main>
</body>
</html>
`;
const out = join(dir, 'REPORT.html');
await writeFile(out, html);
const size = (await stat(out)).size;
const link = join(dir, 'REPORT-LINK.txt');
console.log(`Report page ready: ${relative(process.cwd(), out)} (${(size / 1024).toFixed(0)} KB, ${embedded.size} picture${embedded.size === 1 ? "" : "s"} inside)`);
if (/artifact|web page/i.test(project.rules.report || '')) {
  console.log(existsSync(link)
    ? `Next: ask Claude Code to publish it again to the same link (${(await readFile(link, 'utf8')).trim()}), so readers keep one address.`
    : 'Next: ask Claude Code to "publish runs/…/REPORT.html as an artifact", then save the link it gives you in REPORT-LINK.txt.\nNo artifacts in your Claude Code? Share REPORT.html itself: it opens in any browser.');
}

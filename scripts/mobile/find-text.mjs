// Finds an element by its visible text (or content description) in a UIAutomator dump
// and prints the centre of its bounds as "x y". Exact matches win over partial ones.
//
//   node scripts/mobile/find-text.mjs dump.xml "Sign in"

import { readFileSync } from 'node:fs';

const [file, wanted] = process.argv.slice(2);
const xml = readFileSync(file, 'utf8');
const want = wanted.toLowerCase();
const nodes = [...xml.matchAll(/<node\b[^>]*>/g)].map(m => {
  const attr = name => (m[0].match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1] || '';
  return { text: attr('text') || attr('content-desc'), bounds: attr('bounds') };
}).filter(n => n.text && n.bounds);

const hit = nodes.find(n => n.text.toLowerCase() === want) || nodes.find(n => n.text.toLowerCase().includes(want));
if (!hit) process.exit(1);
const [x1, y1, x2, y2] = hit.bounds.match(/\d+/g).map(Number);
process.stdout.write(`${Math.round((x1 + x2) / 2)} ${Math.round((y1 + y2) / 2)}`);

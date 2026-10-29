// The setup screen. Run "npm run setup", open the address it prints, fill in your project,
// press "Create my QA workspace". It saves project.json and runs the generator.
// Listens on this computer only (127.0.0.1); nothing is sent anywhere else.

import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, validate } from './generate.mjs';

const KIT = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(KIT, '..');
const PROJECT = join(ROOT, 'project.json');
const PORT = Number(process.env.PORT || 4321);
const HOST = '127.0.0.1';

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

function readBody(req, limit = 1_000_000) {
  return new Promise((ok, fail) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { fail(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

// Only accept writes from the setup page itself, so other websites can't post to it.
function sameOrigin(req) {
  const origin = req.headers.origin;
  return !origin || origin === `http://${HOST}:${PORT}` || origin === `http://localhost:${PORT}`;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return send(res, 200, await readFile(join(KIT, 'setup-ui', 'index.html'), 'utf8'), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/api/project') {
      if (!existsSync(PROJECT)) { res.writeHead(204, { 'cache-control': 'no-store' }); return res.end(); }
      return send(res, 200, await readFile(PROJECT, 'utf8'));
    }
    if (req.method === 'GET' && url.pathname === '/api/example') {
      return send(res, 200, await readFile(join(KIT, 'example.project.json'), 'utf8'));
    }
    if (req.method === 'POST' && (url.pathname === '/api/generate' || url.pathname === '/api/preview')) {
      if (!sameOrigin(req)) return send(res, 403, { ok: false, errors: ['Requests are only accepted from the setup page.'] });
      let project;
      try { project = JSON.parse(await readBody(req)); } catch { return send(res, 400, { ok: false, errors: ['The form data could not be read.'] }); }
      const errors = validate(project);
      if (errors.length) return send(res, 422, { ok: false, errors });
      const dry = url.pathname === '/api/preview';
      if (!dry) await writeFile(PROJECT, JSON.stringify(project, null, 2) + '\n');
      const result = await generate(project, { out: ROOT, dry });
      return send(res, result.ok ? 200 : 500, { ...result, dry, folder: ROOT });
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    send(res, 500, { ok: false, errors: [e.message] });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\nQA Agent Kit setup is running.\nOpen this address in your browser:  http://${HOST}:${PORT}\n`);
  console.log(`Workspace folder: ${ROOT}`);
  console.log('Press Ctrl+C to stop.\n');
});

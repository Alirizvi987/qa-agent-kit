// Renders explainer.html to an MP4, frame by frame, in a hidden browser.
// Needs ffmpeg (brew install ffmpeg).
//
//   node docs/kit/video/render.mjs            → docs/kit/how-it-works.mp4
//   node docs/kit/video/render.mjs --check    only check that nothing is cut off
//   node docs/kit/video/render.mjs --fps 30
//
// Before any frame is drawn it checks every scene: everything inside the stage with a
// 40px margin, nothing clipped inside its box, text not too small, and every element
// fully shown at least 2 seconds before its scene ends. It stops with a list if not.

import { launchBrowser } from '../../../scripts/lib/project.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const fpsArg = args.indexOf('--fps');
const fps = fpsArg >= 0 ? Number(args[fpsArg + 1]) : 30;
const checkOnly = args.includes('--check');
const out = join(here, '..', 'how-it-works.mp4');
const W = 1920, H = 1080, MARGIN = 40, MIN_TEXT = 22, HOLD = 2;

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(here, 'explainer.html')).toString());
await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
const total = await page.evaluate(() => window.TOTAL);

const scenes = await page.evaluate(() => [...document.querySelectorAll('.scene')].map((el, i) => {
  const cs = getComputedStyle(el);
  return { i, s: Number(cs.getPropertyValue('--s')), len: Number(cs.getPropertyValue('--len')) };
}));

const problems = [];
for (const sc of scenes) {
  // Everything must have finished appearing HOLD seconds before the scene ends...
  await page.evaluate(t => window.seek(t), sc.s + sc.len - HOLD);
  const late = await page.evaluate(i => {
    const scene = document.querySelectorAll('.scene')[i];
    return [...scene.querySelectorAll('*')]
      .filter(el => el.getAnimations().some(a => a.currentTime < a.effect.getComputedTiming().endTime))
      .map(el => el.textContent.trim().slice(0, 40) || el.tagName);
  }, sc.i);
  for (const l of late) problems.push(`scene ${sc.i + 1}: "${l}" is still appearing ${HOLD}s before the scene ends`);

  // ...and at the end of the scene nothing may be cut off, too close to the edge, or too small.
  await page.evaluate(t => window.seek(t), sc.s + sc.len - 0.6);
  const found = await page.evaluate(({ i, W, H, MARGIN, MIN_TEXT }) => {
    const scene = document.querySelectorAll('.scene')[i];
    const out = [];
    const name = el => (el.textContent.trim().slice(0, 40) || el.getAttribute('src') || el.className || el.tagName);
    for (const el of scene.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.left < MARGIN || r.top < MARGIN || r.right > W - MARGIN || r.bottom > H - MARGIN)
        out.push(`"${name(el)}" reaches past the safe edge (${Math.round(r.left)},${Math.round(r.top)} → ${Math.round(r.right)},${Math.round(r.bottom)})`);
      const block = cs.display !== 'inline';
      if (block && cs.overflow !== 'visible' && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1))
        out.push(`"${name(el)}" hides part of its content (${el.scrollWidth}×${el.scrollHeight} in ${el.clientWidth}×${el.clientHeight})`);
      if (block && cs.overflow === 'visible' && el.clientWidth && el.scrollWidth > el.clientWidth + 1 && el.tagName !== 'svg')
        out.push(`"${name(el)}" spills out of its box (${el.scrollWidth} wide in ${el.clientWidth})`);
      if (el.tagName === 'IMG') {
        if (!el.complete || !el.naturalWidth) out.push(`image ${el.getAttribute('src')} did not load`);
        else if (Math.abs(r.width / r.height - el.naturalWidth / el.naturalHeight) > 0.01) out.push(`image ${el.getAttribute('src')} is squashed or cropped`);
      }
      const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (hasText && parseFloat(cs.fontSize) < MIN_TEXT) out.push(`"${name(el)}" text is ${cs.fontSize}, below ${MIN_TEXT}px`);
    }
    return out;
  }, { i: sc.i, W, H, MARGIN, MIN_TEXT });
  for (const f of found) problems.push(`scene ${sc.i + 1}: ${f}`);
}
if (problems.length) {
  await browser.close();
  console.error(`Not rendering. Fix these first:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`Checked ${scenes.length} scenes: nothing cut off.`);
if (checkOnly) { await browser.close(); process.exit(0); }

const frames = await mkdtemp(join(tmpdir(), 'qa-kit-video-'));
const count = Math.round(total * fps);
for (let i = 0; i < count; i++) {
  await page.evaluate(t => window.seek(t), i / fps);
  await page.screenshot({ path: join(frames, `f${String(i).padStart(5, '0')}.png`) });
  if (i % (fps * 10) === 0) console.log(`frame ${i} / ${count}`);
}
await browser.close();

execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(frames, 'f%05d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', '-preset', 'slow', '-tune', 'stillimage',
  '-map_metadata', '-1', '-movflags', '+faststart', out]);
await rm(frames, { recursive: true, force: true });
console.log(`Saved ${out} (${total}s, ${fps} fps, ${W}×${H})`);

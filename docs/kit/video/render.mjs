// Renders explainer.html to an MP4, frame by frame, in a hidden browser.
// Needs ffmpeg (brew install ffmpeg).
//
//   node docs/kit/video/render.mjs            → docs/kit/how-it-works.mp4
//   node docs/kit/video/render.mjs --fps 30

import { launchBrowser } from '../../../scripts/lib/project.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const fpsArg = process.argv.indexOf('--fps');
const fps = fpsArg > 0 ? Number(process.argv[fpsArg + 1]) : 30;
const out = join(here, '..', 'how-it-works.mp4');
const frames = await mkdtemp(join(tmpdir(), 'qa-kit-video-'));

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
await page.goto(pathToFileURL(join(here, 'explainer.html')).toString());
await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
const total = await page.evaluate(() => window.TOTAL);
const count = Math.round(total * fps);

for (let i = 0; i < count; i++) {
  await page.evaluate(t => window.seek(t), i / fps);
  await page.screenshot({ path: join(frames, `f${String(i).padStart(5, '0')}.png`) });
  if (i % (fps * 10) === 0) console.log(`frame ${i} / ${count}`);
}
await browser.close();

execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(frames, 'f%05d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', out]);
await rm(frames, { recursive: true, force: true });
console.log(`Saved ${out} (${total}s, ${fps} fps, 1920×1080)`);

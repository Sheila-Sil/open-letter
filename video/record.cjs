// Records the Open Letter demo video (1920x1080, 30 fps, no audio) by playing video/composition.html
// in Chrome and tapping through the real app on the same schedule as the voiceover script.
//
//   node video/record.cjs [output.mp4]
//
// Needs Node 18+, Playwright with Chromium (npm i playwright && npx playwright install chromium), and ffmpeg.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || 'open-letter-demo.mp4');
const FPS = 30;
const LENGTH = 180; // seconds; matches the script
const PORT = 8123;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function serve() {
  const server = http.createServer((req, res) => {
    let file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`http://localhost:${PORT}/video/composition.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.READY && document.fonts.status === 'loaded', null, { timeout: 60000 });
  await sleep(2000);
  const app = await (await page.$('#phone-frame')).contentFrame();
  const desk = await (await page.$('#desk-frame')).contentFrame();
  await app.evaluate(() => { window.speechSynthesis.speak = () => {}; }); // headless Chrome has no voices

  // ---------- Capture: every screencast frame goes to ffmpeg, repeated to keep a steady 30 fps ----------
  const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
  const cdp = await page.context().newCDPSession(page);
  let first = null;
  let last = null;
  let written = 0;
  const writeUntil = (count) => { while (written < count) { ffmpeg.stdin.write(last); written++; } };
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    if (first === null) first = metadata.timestamp;
    if (last) writeUntil(Math.round((metadata.timestamp - first) * FPS));
    last = Buffer.from(data, 'base64');
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });

  const T0 = Date.now();
  const at = async (s) => { const ms = T0 + s * 1000 - Date.now(); if (ms > 0) await sleep(ms); };
  // Run a composition helper without waiting for its own animations to finish.
  const V = (name, ...args) => page.evaluate(([n, a]) => { window.V[n](...a); }, [name, args]);

  // Scroll inside the app only. (scrollIntoView would also scroll the video frame around it.)
  async function scrollApp(target, block = 'center', offset = 0) {
    if (typeof target === 'number') {
      await app.evaluate((y) => window.scrollTo({ top: y, behavior: 'smooth' }), target);
    } else {
      await app.locator(target).first().evaluate((el, [b, off]) => {
        const r = el.getBoundingClientRect();
        const y = b === 'start' ? r.top + window.scrollY - 90 : r.top + window.scrollY - (window.innerHeight - r.height) / 2;
        window.scrollTo({ top: Math.max(0, y + off), behavior: 'smooth' });
      }, [block, offset]);
    }
    await sleep(900);
  }
  async function tap(selector, { scroll = true } = {}) {
    const el = app.locator(selector).first();
    if (scroll) await scrollApp(selector);
    const box = await el.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await V('tap', x, y);
    await sleep(140);
    await page.mouse.click(x, y);
  }
  // Zoom the camera in on part of an element (fy: 0 = its top, 1 = its bottom).
  async function focusOn(selector, scale, fy = 0.5) {
    const p = await app.locator(selector).first().evaluate((el, f) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * f }; }, fy);
    await V('focus', p.x, p.y, scale);
  }

  // ---------- 0:00 Hook ----------
  await V('hook');

  // ---------- 0:15 The problem ----------
  await at(15); await V('stakes');
  await at(23); await V('confusing');
  await at(29); await V('words');

  // ---------- 0:35 Introducing Open Letter ----------
  await at(35); await V('intro');
  await at(39); await V('browser');
  await desk.addStyleTag({ content: '.site-header { position: static !important; }' });
  await at(41.5); await desk.evaluate(() => window.scrollTo({ top: 520, behavior: 'smooth' }));

  // ---------- 0:45 Privacy first ----------
  await at(45);
  await V('phone', '03 — Privacy first');
  await V('caption', 'Private numbers are hidden first.');
  await at(46.5); await tap('.ask-btn');
  await sleep(1200);
  await scrollApp(0);
  await focusOn('.canvas-wrap', 1.0);
  await at(49.5); await V('label', 'Runs on the phone');
  await app.waitForFunction(() => !document.querySelector('#explain-btn').disabled, null, { timeout: 30000 });
  await scrollApp('.canvas-wrap', 'start', -40);
  await focusOn('.canvas-wrap', 1.8, 0.2);
  await V('label', 'SSN · account · case numbers covered');
  await at(57); await V('unfocus');
  await V('caption', 'Cover anything else, too.');
  await at(58); await tap('[data-action="toggle-draw"]');
  await sleep(500);
  await scrollApp('.canvas-wrap', 'start', -30);
  {
    const box = await app.locator('.canvas-wrap canvas').boundingBox();
    const map = (lx, ly) => ({ x: box.x + (lx / 1275) * box.width, y: box.y + (ly / 1650) * box.height });
    const a = map(86, 360);
    const b = map(390, 468);
    await V('finger', a.x, a.y, true);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= 30; i++) {
      const x = a.x + ((b.x - a.x) * i) / 30;
      const y = a.y + ((b.y - a.y) * i) / 30;
      await page.mouse.move(x, y);
      await V('finger', x, y, true);
      await sleep(40);
    }
    await page.mouse.up();
    await V('finger', b.x, b.y, false);
  }
  await V('label', 'Your name, your address');
  await sleep(300);
  await focusOn('.canvas-wrap', 1.75, 0.25);
  await at(64.5); await V('label', 'Only the covered photo is sent');
  await at(68.3); await V('unfocus');

  // ---------- 1:10 The explanation ----------
  await at(70);
  await V('chapter', '04 — The explanation');
  await V('caption', 'The deadline comes first.');
  await tap('#explain-btn', { scroll: false });
  await app.waitForFunction(() => !document.querySelector('#view-result').hidden, null, { timeout: 20000 });
  await sleep(600);
  await focusOn('.urgency', 1.45);
  await at(76); await V('label', 'Due date, in your language');
  await at(77.5); await V('label', 'Days left, counted for you');

  await at(80); await V('unfocus');
  await V('caption', 'A checklist of what to do.');
  await at(81.2); await scrollApp('.todo-progress', 'start', -20);
  await at(82.3); await tap('.check[data-index="0"]', { scroll: false });
  await at(83.5); await tap('.check[data-index="1"]', { scroll: false });
  await sleep(400);
  await focusOn('.todo', 1.45, 0.3);
  await V('label', 'Progress you can see');
  await at(86.6); await V('unfocus');

  await at(88);
  await V('caption', 'Every answer shows its source.');
  await tap('.todo-item[data-index="0"] details.source summary', { scroll: false });
  await sleep(500);
  await focusOn('.todo-item[data-index="0"] .quote', 1.6);
  await at(92); await V('label', 'The exact words from the letter');
  await at(95); await V('label', 'Checked against the photo');

  await at(99); await V('unfocus');
  await V('caption', 'Call the right number.');
  await scrollApp('.contact');
  await focusOn('.contact', 1.45);
  await at(101.5); await V('label', 'Only numbers printed in the letter');

  // ---------- 1:45 Built for real families ----------
  await at(105);
  await V('unfocus');
  await V('chapter', '05 — For real families');
  await V('caption', 'In your language.');
  await scrollApp(0);
  await at(106.5); await tap('.lang-pill', { scroll: false });
  await sleep(1000); await tap('.lang-option[data-lang="es"]', { scroll: false });
  await V('label', 'Español');
  await at(112); await tap('.lang-pill', { scroll: false });
  await sleep(1000); await tap('.lang-option[data-lang="ar"]', { scroll: false });
  await V('label', 'العربية · right to left');
  await at(116); await V('label', '中文 · Tiếng Việt · English');

  await at(119);
  await V('caption', 'Read aloud. Get a reminder.');
  await scrollApp('.actions-grid');
  await at(120.5); await tap('[data-action="read-aloud"]', { scroll: false });
  await V('float', 'wave', true);
  await V('label', 'Reads it out loud');
  await at(124.5); await V('float', 'wave', false);
  await tap('[data-action="reminder"]', { scroll: false });
  await V('float', 'reminder', true);
  await V('label', 'Adds it to your calendar');

  // ---------- 2:10 Reply helper ----------
  await at(130);
  await V('float', 'reminder', false);
  await V('chapter', '06 — Write back');
  await V('caption', 'Write back with confidence.');
  await tap('[data-action="reply"]', { scroll: false });
  await sleep(900);
  await V('label', 'Say it in any language');
  await at(133); await tap('#write-reply-btn');
  await app.waitForSelector('#reply-letter', { timeout: 10000 });
  await sleep(400);
  await scrollApp('.reply-panes', 'start');
  await at(136.5); await V('label', 'A polite letter in English');
  await at(139); await scrollApp('.pane:not(.pane-en)', 'start');
  await at(140.5); await V('label', 'Translated, so you know what you send');

  // ---------- 2:25 How it's built ----------
  await at(145); await V('built');

  // ---------- 2:45 Close ----------
  await at(165); await V('close');
  await at(LENGTH - 1.6); await V('blackout');
  await at(LENGTH);

  await cdp.send('Page.stopScreencast');
  writeUntil(LENGTH * FPS);
  ffmpeg.stdin.end();
  await new Promise((resolve) => ffmpeg.on('close', resolve));
  await browser.close();
  server.close();
  console.log(`Saved ${OUT} (${written} frames)`);
})();

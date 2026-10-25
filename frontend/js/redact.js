// Privacy step: finds private numbers on the phone with OCR (Tesseract, running locally in the browser)
// and covers them with black boxes before the photo is ever uploaded. People can also cover things by hand.

const MAX_SIDE = 2000;      // big enough to read small print, small enough to upload quickly
const BOX_PADDING = 6;
const VENDOR = new URL('../vendor/tesseract/', import.meta.url).href;

// ---------- Pages ----------

export async function pageFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('not_an_image'));
      el.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return newPage(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function newPage(canvas) {
  // status: 'scanning' | 'done' | 'failed'
  return { id: crypto.randomUUID(), source: canvas, boxes: [], words: [], autoCount: 0, status: 'scanning' };
}

// Draw the page with its black boxes. Used for the on-screen preview and the upload.
export function render(page, target = document.createElement('canvas'), draft = null) {
  target.width = page.source.width;
  target.height = page.source.height;
  const ctx = target.getContext('2d');
  ctx.drawImage(page.source, 0, 0);
  ctx.fillStyle = '#000';
  for (const box of page.boxes) ctx.fillRect(box.x, box.y, box.w, box.h);
  if (draft) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(draft.x, draft.y, draft.w, draft.h);
  }
  return target;
}

export function toJpeg(page) {
  // Re-drawing on a canvas also strips hidden photo data like GPS location.
  return new Promise((resolve) => render(page).toBlob(resolve, 'image/jpeg', 0.85));
}

// ---------- Finding private numbers ----------

let workerPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error('ocr_load_failed'));
    document.head.appendChild(script);
  });
}

function getWorker() {
  workerPromise ??= (async () => {
    await loadScript(`${VENDOR}tesseract.min.js`);
    return window.Tesseract.createWorker('eng', 1, {
      workerPath: `${VENDOR}worker.min.js`,
      corePath: `${VENDOR}core/`,
      langPath: `${VENDOR}lang/`,
      cacheMethod: 'none',
    });
  })();
  workerPromise.catch(() => { workerPromise = null; });
  return workerPromise;
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

// Tesseract can only work on one page at a time, so scans wait in line.
let queue = Promise.resolve();

export function scanPage(page) {
  const job = queue.then(async () => {
    try {
      const worker = await withTimeout(getWorker(), 45000);
      const { data } = await withTimeout(worker.recognize(page.source, {}, { text: true, blocks: true }), 60000);
      page.words = collectWords(data);
      const found = findPrivateNumbers(page.words);
      page.boxes.unshift(...found);
      page.autoCount = found.length;
      page.status = 'done';
    } catch (err) {
      console.warn('Automatic privacy check failed:', err);
      page.status = 'failed';
    }
  });
  queue = job;
  return job;
}

function collectWords(data) {
  const words = [];
  for (const block of data.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        for (const word of line.words || []) words.push({ text: word.text, bbox: word.bbox, line });
      }
    }
  }
  return words;
}

const LABEL = /^(ssn|social|security|acct|account|member|case|id|id#|no\.?|number|policy|client|recipient|itin|ein|routing|card)[:#]?$/i;
const PHONE = /^(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}$/;
const DATE = /^(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})$/;
const ZIP = /^\d{5}(-\d{4})?$/;
const SSN = /^\d{3}-\d{2}-\d{4}$/;
const MASKED_SSN = /^[x*•]{3}-?[x*•]{2}-?\d{4}$/i;
const DIGIT_GROUP = /^[\d-]*\d[\d-]*$/;

const clean = (text) => text.replace(/^[(#:]+/, '').replace(/[,;:.)]+$/, '');
const digitCount = (text) => text.replace(/\D/g, '').length;
const isHarmless = (text) => PHONE.test(text) || DATE.test(text) || ZIP.test(text) || /[$€]/.test(text);

// Returns black boxes covering anything that looks like an SSN, account, member, or case number,
// while leaving phone numbers, dates, ZIP codes, and money amounts readable.
export function findPrivateNumbers(words) {
  const hide = new Set();

  for (let i = 0; i < words.length; i++) {
    const text = clean(words[i].text);
    if (SSN.test(text) || MASKED_SSN.test(text)) hide.add(i);

    // A number right after a label like "Case number:" or "Member ID". After a label, even a
    // 5-digit number is an ID, not a ZIP code.
    const labelled = [1, 2, 3].some((back) => i - back >= 0 && LABEL.test(clean(words[i - back].text)));
    const labelledHarmless = PHONE.test(text) || DATE.test(text) || /[$€]/.test(text);
    if (labelled && digitCount(text) >= 4 && DIGIT_GROUP.test(text) && !labelledHarmless) hide.add(i);
  }

  // Long numbers, including ones split by spaces like "9081 4472 1150"
  for (let start = 0; start < words.length; start++) {
    if (!DIGIT_GROUP.test(clean(words[start].text))) continue;
    let end = start;
    while (end + 1 < words.length && words[end + 1].line === words[start].line && DIGIT_GROUP.test(clean(words[end + 1].text))) end++;
    const run = words.slice(start, end + 1).map((w) => clean(w.text)).join(' ');
    if (digitCount(run) >= 8 && !isHarmless(run)) {
      for (let k = start; k <= end; k++) hide.add(k);
    }
    start = end;
  }

  // Merge neighbouring words on the same line into one box.
  const boxes = [];
  let current = null;
  for (const i of [...hide].sort((a, b) => a - b)) {
    const { bbox, line } = words[i];
    if (current && current.line === line && current.last === i - 1) {
      current.x1 = Math.max(current.x1, bbox.x1);
      current.y0 = Math.min(current.y0, bbox.y0);
      current.y1 = Math.max(current.y1, bbox.y1);
      current.last = i;
    } else {
      current = { ...bbox, line, last: i };
      boxes.push(current);
    }
  }
  return boxes.map((b) => ({
    x: b.x0 - BOX_PADDING,
    y: b.y0 - BOX_PADDING,
    w: b.x1 - b.x0 + BOX_PADDING * 2,
    h: b.y1 - b.y0 + BOX_PADDING * 2,
    auto: true,
  }));
}

// The letter's text without anything under a black box. Stays on the phone: it's only used
// to double-check that quotes in the explanation really appear in the letter.
export function visibleText(page) {
  const covered = (bbox) => page.boxes.some((b) =>
    bbox.x0 < b.x + b.w && bbox.x1 > b.x && bbox.y0 < b.y + b.h && bbox.y1 > b.y);
  return page.words.filter((w) => !covered(w.bbox)).map((w) => w.text).join(' ');
}

// ---------- Hiding things by hand ----------

export function enableDrawing(canvas, page, onChange) {
  let start = null;
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };
  const boxFrom = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

  canvas.onpointerdown = (event) => {
    start = point(event);
    canvas.setPointerCapture(event.pointerId);
  };
  canvas.onpointermove = (event) => {
    if (start) render(page, canvas, boxFrom(start, point(event)));
  };
  canvas.onpointerup = canvas.onpointercancel = (event) => {
    if (!start) return;
    const box = boxFrom(start, point(event));
    start = null;
    if (box.w > 12 && box.h > 12) page.boxes.push(box);
    render(page, canvas);
    onChange();
  };
}

export function disableDrawing(canvas) {
  canvas.onpointerdown = canvas.onpointermove = canvas.onpointerup = canvas.onpointercancel = null;
}

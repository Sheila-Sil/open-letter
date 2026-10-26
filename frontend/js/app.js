// Open Letter: screens, buttons, and talking to the server.

import { LANGS, t, setLang, detectLang, getLang, formatDate } from './i18n.js';
import { pageFromFile, newPage, render, toJpeg, scanPage, visibleText, enableDrawing, disableDrawing } from './redact.js';
import { quoteFound } from './verify.js';
import { drawSampleLetter, sampleResult, sampleReply, todayUTC } from './sample.js';

const MAX_PAGES = 4;
const DAY = 24 * 60 * 60 * 1000;
const VIEWS = ['home', 'review', 'loading', 'result', 'reply', 'error'];

const ERROR_MESSAGES = {
  network: 'err_network',
  busy: 'err_busy',
  unreadable: 'err_unreadable',
  not_letter: 'err_not_letter',
  not_configured: 'err_not_configured',
  too_large: 'err_too_large',
  not_an_image: 'err_not_an_image',
  too_many_pages: 'err_too_many_pages',
  refused: 'err_refused',
};

const state = {
  view: 'home',
  pages: [],
  drawingPageId: null,
  example: false,
  result: null,        // { data, lang }
  letterText: '',      // what our OCR read, used to double-check quotes
  checked: new Set(),
  reply: null,
  error: null,         // { code, retry }
  token: 0,            // ignore answers to requests the user has since abandoned
  speaking: false,
};

const $ = (selector) => document.querySelector(selector);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Keeps phone numbers and dates left-to-right inside Arabic text.
const isolate = (text) => `\u2068${text}\u2069`;

function localISODate() {
  const now = new Date();
  return new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

class AppError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// ---------- Screens ----------

function show(view, { push = true, focus = true } = {}) {
  stopSpeaking();
  state.view = view;
  for (const name of VIEWS) $(`#view-${name}`).hidden = name !== view;
  document.body.classList.toggle('is-example', state.example);
  if (push) history.pushState({ view }, '', view === 'home' ? location.pathname : `#${view}`);
  window.scrollTo(0, 0);
  if (focus) {
    const heading = $(`#view-${view} h1`);
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }
}

window.addEventListener('popstate', (event) => {
  const view = event.state?.view || 'home';
  if (view === 'home') return goHome({ push: false });
  if (view === 'review' && !state.pages.length) return goHome({ push: false });
  if ((view === 'result' || view === 'reply') && !state.result) return goHome({ push: false });
  state.token++;
  show(view, { push: false });
  rerender();
});

function goHome({ push = true } = {}) {
  state.token++;
  resetLetter();
  state.example = false;
  show('home', { push });
}

function resetLetter() {
  state.pages = [];
  state.drawingPageId = null;
  state.result = null;
  state.reply = null;
  state.letterText = '';
  state.checked = new Set();
  $('#reply-note').value = '';
  $('#reply-output').innerHTML = '';
}

function rerender() {
  if (state.view === 'review') renderPages();
  if (state.view === 'result') renderResult();
  if (state.view === 'reply') renderReply();
  if (state.view === 'error') renderError();
}

// ---------- Language ----------

function renderLanguageUI() {
  const current = getLang();
  $('#lang-current').textContent = current.native;
  $('#lang-list').innerHTML = LANGS.map((lang) => `
    <li>
      <button type="button" class="lang-option" data-action="set-lang" data-lang="${lang.code}" aria-current="${lang.code === current.code}">
        <span>
          <span class="lang-native" lang="${lang.code}" dir="${lang.dir}">${lang.native}</span>
          <span class="lang-english" lang="en">${lang.english}</span>
        </span>
        ${lang.code === current.code ? `<span class="lang-check">${icon('check')}</span>` : ''}
      </button>
    </li>`).join('');

  $('#footer-langs').innerHTML = LANGS.map((lang) => `
    <li><button type="button" data-action="set-lang" data-lang="${lang.code}" lang="${lang.code}" dir="${lang.dir}">${lang.native}</button></li>`).join('');
  $('#write-reply-label').textContent = t('write_reply');
}

function changeLanguage(code) {
  setLang(code);
  renderLanguageUI();
  if (state.example && state.result) {
    state.result = { data: sampleResult(code), lang: code };
    if (state.reply) state.reply = sampleReply(code);
  }
  rerender();
}

// ---------- Home page decoration ----------

// Vertical lines, like lines of text seen sideways. Some are tinted, a couple lean,
// and a "scan" sweeps across them (see .lines in styles.css).
function drawHeroLines() {
  const svg = $('#hero-lines');
  const perRow = window.innerWidth < 640 ? 34 : 64;
  const widths = [1, 1.5, 2.5, 3.5, 4.5];
  // A fixed pattern (not random) so the page looks the same every time.
  const pick = (i, list) => list[(i * 7 + Math.floor(i / 3)) % list.length];
  const lines = [];
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < perRow; i++) {
      const n = row * perRow + i;
      const x = ((i + 0.5 + row * 0.5) / (perRow + 0.5)) * 1000;
      const tint = n % 17 === 5 ? 'violet' : n % 23 === 11 ? 'peach' : '';
      const y1 = row * 150 + 4;
      const y2 = row * 150 + 146;
      const lean = (row === 0 && i === 4) || (row === 1 && i === perRow - 7);
      const x2 = lean ? x + (row === 0 ? 34 : -34) : x;
      lines.push(`<line x1="${x.toFixed(1)}" y1="${y1}" x2="${x2.toFixed(1)}" y2="${y2}" class="${tint}" style="--w:${pick(n, widths)};--i:${i}"/>`);
    }
  }
  svg.setAttribute('viewBox', '0 0 1000 300');
  svg.innerHTML = lines.join('');
}

// Types the app's question in each language, one after another.
const QUESTIONS = [
  { text: 'What does this letter say?', lang: 'en', dir: 'ltr' },
  { text: '¿Qué dice esta carta?', lang: 'es', dir: 'ltr' },
  { text: '这封信是什么意思？', lang: 'zh', dir: 'ltr' },
  { text: 'Thư này nói gì?', lang: 'vi', dir: 'ltr' },
  { text: 'ماذا تقول هذه الرسالة؟', lang: 'ar', dir: 'rtl' },
];

async function typeQuestions() {
  const el = $('#ask-text');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const q = QUESTIONS.find((item) => item.lang === getLang().code);
    Object.assign(el, { textContent: q.text, lang: q.lang, dir: q.dir });
    return;
  }
  for (let i = 0; ; i = (i + 1) % QUESTIONS.length) {
    const q = QUESTIONS[i];
    const chars = Array.from(q.text);
    el.lang = q.lang;
    el.dir = q.dir;
    for (let n = 1; n <= chars.length; n++) {
      el.textContent = chars.slice(0, n).join('');
      await wait(55);
    }
    await wait(1800);
    for (let n = chars.length - 1; n >= 0; n--) {
      el.textContent = chars.slice(0, n).join('');
      await wait(22);
    }
    await wait(250);
  }
}

// ---------- Adding photos ----------

function pickPhotos(inputSelector, fresh) {
  const input = $(inputSelector);
  input.dataset.fresh = fresh ? '1' : '0';
  input.click();
}

async function addFiles(files, fresh) {
  if (fresh) {
    resetLetter();
    state.example = false;
  }
  if (state.example) {
    // Mixing real pages into the example letter would make the sample answer wrong.
    resetLetter();
    state.example = false;
  }
  if (state.view !== 'review') show('review');
  const room = MAX_PAGES - state.pages.length;
  if (files.length > room) toast(t('err_too_many_pages'));
  for (const file of [...files].slice(0, room)) {
    try {
      const page = await pageFromFile(file);
      state.pages.push(page);
      renderPages();
      scanPage(page).then(renderPages);
    } catch {
      toast(t('err_not_an_image'));
    }
  }
  if (!state.pages.length) goHome();
}

function startExample() {
  state.token++;
  resetLetter();
  state.example = true;
  const page = newPage(drawSampleLetter());
  state.pages = [page];
  show('review');
  renderPages();
  scanPage(page).then(renderPages);
}

// ---------- Review screen ----------

function renderPages() {
  if (state.view !== 'review') return;
  const container = $('#pages');
  container.innerHTML = state.pages.map(pageCard).join('');
  for (const page of state.pages) {
    const canvas = container.querySelector(`[data-page="${page.id}"] canvas`);
    render(page, canvas);
    if (page.id === state.drawingPageId) enableDrawing(canvas, page, renderPages);
    else disableDrawing(canvas);
  }
  $('#add-page-btn').hidden = state.pages.length >= MAX_PAGES;

  const scanning = state.pages.some((page) => page.status === 'scanning');
  const button = $('#explain-btn');
  button.disabled = scanning || !state.pages.length;
  button.classList.toggle('is-busy', scanning);
  $('#explain-label').textContent = t(scanning ? 'explain_wait' : 'explain');
}

function pageCard(page, index) {
  const hidden = page.boxes.filter((box) => box.auto).length;
  const drawing = page.id === state.drawingPageId;
  let status;
  if (page.status === 'scanning') status = `<p class="page-status busy"><span class="spinner" aria-hidden="true"></span>${t('scanning')}</p>`;
  else if (page.status === 'failed') status = `<p class="page-status warn">${icon('alert')}${t('scan_failed')}</p>`;
  else status = `<p class="page-status ok">${icon('check-circle')}${hidden ? t('hidden_n', { n: hidden }) : t('hidden_0')}</p>`;

  return `
    <article class="page-card" data-page="${page.id}">
      <div class="page-head">
        <h2>${t('page_n', { n: index + 1 })}</h2>
        <button class="icon-btn" type="button" data-action="remove-page" data-id="${page.id}" aria-label="${esc(t('remove_page'))}">${icon('trash')}</button>
      </div>
      <div class="canvas-wrap ${drawing ? 'is-drawing' : ''}">
        <canvas role="img" aria-label="${esc(t('page_n', { n: index + 1 }))}"></canvas>
        ${page.status === 'scanning' ? '<div class="scan-overlay" aria-hidden="true"><div class="scan-line"></div></div>' : ''}
      </div>
      <div aria-live="polite">${status}</div>
      <div class="page-tools">
        <button class="btn btn-tool ${drawing ? 'is-active' : ''}" type="button" data-action="toggle-draw" data-id="${page.id}" aria-pressed="${drawing}">
          ${icon(drawing ? 'check' : 'eye-off')}<span>${t(drawing ? 'hide_done' : 'hide_tool')}</span>
        </button>
        <button class="btn btn-tool" type="button" data-action="undo" data-id="${page.id}" ${page.boxes.length ? '' : 'disabled'}>
          ${icon('undo')}<span>${t('undo')}</span>
        </button>
      </div>
      ${drawing ? `<p class="hint">${t('hide_hint')}</p>` : ''}
    </article>`;
}

function removePage(id) {
  state.pages = state.pages.filter((page) => page.id !== id);
  if (!state.pages.length) return goHome();
  renderPages();
}

// ---------- Explaining the letter ----------

async function explain() {
  const token = ++state.token;
  state.drawingPageId = null;
  state.letterText = state.pages.map(visibleText).join('\n');
  render(state.pages[0], $('#loading-canvas'));
  show('loading', { push: false });
  const progress = runProgress();

  try {
    const data = state.example ? (await wait(2600), sampleResult(getLang().code)) : await requestExplanation();
    if (token !== state.token) return;
    if (data.status === 'unreadable') throw new AppError('unreadable');
    if (data.status === 'not_a_letter') throw new AppError('not_letter');
    state.result = { data, lang: getLang().code };
    state.checked = new Set();
    state.reply = null;
    await progress.finish();
    if (token !== state.token) return;
    show('result');
    renderResult();
  } catch (err) {
    progress.stop();
    if (token === state.token) showError(err.code || 'generic');
  }
}

async function requestExplanation() {
  const form = new FormData();
  for (const [index, page] of state.pages.entries()) {
    form.append('pages', await toJpeg(page), `page-${index + 1}.jpg`);
  }
  form.append('language', getLang().code);
  form.append('today', localISODate());

  let response;
  try {
    response = await fetch('api/decode', { method: 'POST', body: form });
  } catch {
    throw new AppError('network');
  }
  const body = await response.json().catch(() => ({}));
  // A site hosted without the Python server (like GitHub Pages) has no /api, so explain that instead.
  const noServer = [404, 405, 501].includes(response.status);
  if (!response.ok) throw new AppError(body.error || (noServer ? 'not_configured' : 'generic'));
  return body.result;
}

// The AI answers all at once, so the steps advance on a timer and the last one waits for the answer.
function runProgress() {
  const steps = [...document.querySelectorAll('.progress li')];
  const set = (active) => steps.forEach((li, i) => {
    li.classList.toggle('done', i < active);
    li.classList.toggle('active', i === active);
  });
  set(0);
  const timers = [setTimeout(() => set(1), 3500), setTimeout(() => set(2), 9000)];
  return {
    stop: () => timers.forEach(clearTimeout),
    finish: async () => {
      timers.forEach(clearTimeout);
      set(steps.length);
      await wait(450);
    },
  };
}

function showError(code) {
  let retry = () => explain();
  if (code === 'unreadable' || code === 'not_letter' || code === 'not_an_image' || code === 'too_large') {
    retry = () => goHome();
  }
  if (code === 'not_configured' || code === 'refused') retry = null;
  state.error = { code, retry };
  show('error', { push: false });
  renderError();
}

function renderError() {
  if (!state.error) return;
  $('#error-message').textContent = t(ERROR_MESSAGES[state.error.code] || 'err_generic');
  $('#retry-btn').hidden = !state.error.retry;
}

// ---------- The explanation ----------

function daysUntil(isoDate) {
  return Math.round((new Date(`${isoDate}T00:00:00Z`) - todayUTC()) / DAY);
}

function source(quote, translation = '') {
  const found = quoteFound(quote, state.letterText);
  return `
    ${found === false ? `<p class="verify bad">${icon('alert')}${t('not_verified')}</p>` : ''}
    <details class="source">
      <summary>${icon('chevron-right', 'icon-sm flip-rtl')}${t('show_source')}</summary>
      <div class="quote">
        <p class="quote-label">${t('letter_says')}</p>
        <p class="quote-text" dir="auto">“${esc(quote)}”</p>
        ${translation ? `<p class="quote-label">${t('in_your_language')}</p><p class="quote-text">${esc(translation)}</p>` : ''}
        ${found === true ? `<p class="verify ok">${icon('check-circle')}${t('verified')}</p>` : ''}
      </div>
    </details>`;
}

function renderResult() {
  if (!state.result) return;
  const { data: r, lang } = state.result;
  const html = [];

  html.push(`<button class="back-btn" type="button" data-action="home">${icon('plus')}<span>${t('new_letter')}</span></button>`);
  if (state.example) html.push(`<p class="notice notice-info">${icon('info')}<span>${t('example_banner')}</span></p>`);
  if (lang !== getLang().code) {
    html.push(`
      <div class="notice notice-info">${icon('globe')}
        <div><p>${t('lang_mismatch')}</p>
        <button class="btn btn-secondary" type="button" data-action="explain" style="margin-top:10px">${icon('refresh')}${t('explain_again', { lang: getLang().native })}</button></div>
      </div>`);
  }

  if (r.scam_check.possible_scam) {
    html.push(`
      <div class="notice notice-danger" role="alert">${icon('shield-alert')}
        <div><strong>${t('scam_title')}</strong><p>${t('scam_body')}</p>
        ${r.scam_check.reasons.length ? `<ul class="unsure">${r.scam_check.reasons.map((reason) => `<li>${esc(reason)}</li>`).join('')}</ul>` : ''}</div>
      </div>`);
  }

  // Urgency and deadline, the most important thing on the page.
  const urgencyIcon = { high: 'alert', medium: 'clock', low: 'info', none: 'check' }[r.urgency];
  let deadlineHTML = '';
  if (r.deadline?.date) {
    const days = daysUntil(r.deadline.date);
    const countdown = days < 0 ? t('overdue') : days === 0 ? t('due_today') : t('days_left', { n: days });
    deadlineHTML = `
      <p class="urgency-date">${esc(t('due_by', { date: formatDate(new Date(`${r.deadline.date}T00:00:00Z`)) }))}</p>
      <p class="urgency-detail">${esc(countdown)}</p>
      ${r.deadline.what_is_due ? `<p class="urgency-detail">${esc(r.deadline.what_is_due)}</p>` : ''}
      ${r.deadline.quote ? source(r.deadline.quote) : ''}`;
  }
  html.push(`
    <div class="urgency ${r.urgency}">
      <span class="urgency-icon">${icon(urgencyIcon)}</span>
      <div><p class="urgency-label">${t(`urgency_${r.urgency}`)}</p>${deadlineHTML}</div>
    </div>`);

  html.push(`<h1 class="doc-title">${esc(r.document_type)}</h1>`);
  if (r.sender) html.push(`<p class="doc-sender">${esc(t('from_sender', { sender: r.sender }))}</p>`);

  html.push(`<section class="section"><h2>${icon('file')}${t('what_title')}</h2><p class="summary">${esc(r.summary)}</p></section>`);

  if (r.actions.length) {
    html.push(`
      <section class="section"><h2>${icon('check-circle')}${t('todo_title')}</h2>
        <div class="todo-progress"><div class="todo-bar"><span id="todo-bar"></span></div><p class="todo-count" id="todo-count" aria-live="polite"></p></div>
        <ol class="todo">${r.actions.map((action, i) => {
          const done = state.checked.has(i);
          return `
            <li class="todo-item ${done ? 'is-done' : ''}" data-index="${i}">
              <div class="todo-row">
                <button class="check" type="button" role="checkbox" aria-checked="${done}" data-action="toggle-check" data-index="${i}" aria-label="${esc(action.step)}">${icon('check')}</button>
                <div>
                  <span class="todo-text">${esc(action.step)}</span>
                  ${action.quote ? source(action.quote) : `<p class="tip-tag">${icon('lightbulb', 'icon-sm')}${t('general_tip')}</p>`}
                </div>
              </div>
            </li>`;
        }).join('')}</ol>
        <p class="all-done" id="all-done" hidden>${icon('check-circle')}<span>${t('all_done')}</span></p>
      </section>`);
  }

  if (r.contacts.length) {
    html.push(`
      <section class="section"><h2>${icon('phone')}${t('contact_title')}</h2>
        ${r.contacts.map((c) => `
          <div class="contact">
            <p class="contact-name">${esc(c.name)}</p>
            ${c.phone ? `<a class="btn btn-primary" href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">${icon('phone')}<span>${esc(t('call', { phone: isolate(c.phone) }))}</span></a>` : ''}
            ${c.website && /^https?:\/\//.test(c.website) ? `<a class="btn btn-secondary" href="${esc(c.website)}" target="_blank" rel="noopener noreferrer">${icon('link')}<span>${t('open_website')}</span></a>` : ''}
            ${c.hours ? `<p class="contact-hours">${icon('clock', 'icon-sm')}${esc(t('hours', { hours: c.hours }))}</p>` : ''}
          </div>`).join('')}
      </section>`);
  }

  if (r.key_facts.length) {
    html.push(`
      <section class="section"><h2>${icon('quote')}${t('sources_title')}</h2>
        <ul class="facts">${r.key_facts.map((f) => `<li><p class="fact-text">${esc(f.fact)}</p>${source(f.quote, f.quote_translation)}</li>`).join('')}</ul>
      </section>`);
  }

  if (r.uncertain.length || r.confidence === 'low') {
    html.push(`
      <div class="notice notice-warn">${icon('alert')}
        <div><strong>${t('unsure_title')}</strong>
          <ul class="unsure">
            ${r.confidence === 'low' ? `<li>${t('unsure_low')}</li>` : ''}
            ${r.uncertain.map((item) => `<li>${esc(item)}</li>`).join('')}
          </ul>
        </div>
      </div>`);
  }

  html.push(`
    <div class="actions-grid">
      <button class="action-btn" type="button" data-action="read-aloud" aria-pressed="${state.speaking}">${icon('volume')}<span id="read-label">${t(state.speaking ? 'stop_reading' : 'read_aloud')}</span></button>
      ${r.deadline?.date ? `<button class="action-btn" type="button" data-action="reminder">${icon('calendar')}<span>${t('add_reminder')}</span></button>` : ''}
      <button class="action-btn" type="button" data-action="reply">${icon('pen')}<span>${t('help_reply')}</span></button>
      <button class="action-btn" type="button" data-action="share">${icon('share')}<span>${t('share')}</span></button>
    </div>
    <p class="disclaimer">${icon('info')}<span>${t('result_disclaimer')}</span></p>`);

  $('#result').innerHTML = html.join('');
  updateProgress();
}

function updateProgress() {
  const total = state.result.data.actions.length;
  if (!total) return;
  const done = state.checked.size;
  $('#todo-bar').style.width = `${(done / total) * 100}%`;
  $('#todo-count').textContent = t('progress', { done, total });
  $('#all-done').hidden = done !== total;
}

function toggleCheck(index) {
  if (state.checked.has(index)) state.checked.delete(index);
  else state.checked.add(index);
  const done = state.checked.has(index);
  $(`.todo-item[data-index="${index}"]`).classList.toggle('is-done', done);
  $(`.check[data-index="${index}"]`).setAttribute('aria-checked', done);
  updateProgress();
}

// ---------- Read aloud ----------

function readAloud() {
  if (state.speaking) return stopSpeaking();
  if (!('speechSynthesis' in window)) return;
  const { data: r, lang } = state.result;
  const speechLang = LANGS.find((l) => l.code === lang).speech;
  const parts = [r.document_type];
  if (r.deadline?.date) parts.push(t('due_by', { date: formatDate(new Date(`${r.deadline.date}T00:00:00Z`)) }));
  parts.push(r.summary, t('todo_title'), ...r.actions.map((a, i) => `${i + 1}. ${a.step}`));

  const voice = speechSynthesis.getVoices().find((v) => v.lang.replace('_', '-').toLowerCase().startsWith(lang));
  speechSynthesis.cancel();
  // One utterance per sentence: some browsers cut off long ones.
  parts.forEach((text, i) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLang;
    utterance.rate = 0.9;
    if (voice) utterance.voice = voice;
    if (i === parts.length - 1) utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    speechSynthesis.speak(utterance);
  });
  setSpeaking(true);
}

function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  setSpeaking(false);
}

function setSpeaking(on) {
  state.speaking = on;
  const button = document.querySelector('[data-action="read-aloud"]');
  if (!button) return;
  button.setAttribute('aria-pressed', on);
  $('#read-label').textContent = t(on ? 'stop_reading' : 'read_aloud');
}

// ---------- Calendar reminder (.ics file works with iPhone, Android, Google, and Outlook calendars) ----------

function icsText(text) {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Calendar files need lines of at most 75 bytes.
function foldLine(line) {
  const encoder = new TextEncoder();
  const out = [];
  let current = '';
  for (const char of line) {
    if (encoder.encode(current + char).length > 73) {
      out.push(current);
      current = ' ';
    }
    current += char;
  }
  out.push(current);
  return out.join('\r\n');
}

function downloadReminder() {
  const r = state.result.data;
  const start = r.deadline.date.replaceAll('-', '');
  const end = new Date(Date.parse(`${r.deadline.date}T00:00:00Z`) + DAY).toISOString().slice(0, 10).replaceAll('-', '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const details = [
    r.summary,
    '',
    ...r.actions.map((a, i) => `${i + 1}. ${a.step}`),
    '',
    ...r.contacts.filter((c) => c.phone).map((c) => `${c.name}: ${c.phone}`),
  ].join('\n');

  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Open Letter//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@open-letter`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${icsText(t('reminder_summary', { title: r.document_type }))}`,
    `DESCRIPTION:${icsText(details)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY',
    'TRIGGER:-P2DT15H', // 9:00 a.m., three days before
    `DESCRIPTION:${icsText(t('reminder_alarm', { title: r.document_type }))}`,
    'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  const blob = new Blob([lines.map(foldLine).join('\r\n')], { type: 'text/calendar' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'deadline.ics';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// ---------- Share ----------

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = Object.assign(document.createElement('textarea'), { value: text });
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  toast(t('copied'));
}

async function share() {
  const r = state.result.data;
  const lines = [r.document_type];
  if (r.deadline?.date) lines.push(t('share_deadline', { date: formatDate(new Date(`${r.deadline.date}T00:00:00Z`)) }));
  lines.push('', r.summary, '', `${t('todo_title')}:`, ...r.actions.map((a, i) => `${i + 1}. ${a.step}`));
  for (const c of r.contacts) if (c.phone) lines.push('', `${c.name}: ${c.phone}`);
  const text = lines.join('\n');

  if (navigator.share) {
    try { await navigator.share({ title: r.document_type, text }); } catch { /* closed the share sheet */ }
    return;
  }
  copyText(text);
}

// ---------- Reply helper ----------

function openReply() {
  if (state.example && !$('#reply-note').value) $('#reply-note').value = t('chip_more_time');
  show('reply');
  renderReply();
}

async function writeReply() {
  const button = $('#write-reply-btn');
  const token = state.token;
  button.disabled = true;
  button.classList.add('is-busy');
  $('#write-reply-label').textContent = t('writing');
  try {
    let reply;
    if (state.example) {
      await wait(1500);
      reply = sampleReply(getLang().code);
    } else {
      let response;
      try {
        response = await fetch('api/reply', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: getLang().code, letter: state.result.data, note: $('#reply-note').value }),
        });
      } catch {
        throw new AppError('network');
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new AppError(body.error || 'generic');
      reply = body.reply;
    }
    if (token !== state.token) return;
    state.reply = reply;
    renderReply();
    $('#reply-output').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    if (token !== state.token) return;
    $('#reply-output').innerHTML = `<p class="notice notice-danger" style="margin-top:20px">${icon('alert')}<span>${t(ERROR_MESSAGES[err.code] || 'err_generic')}</span></p>`;
  } finally {
    button.disabled = false;
    button.classList.remove('is-busy');
    $('#write-reply-label').textContent = t('write_reply');
  }
}

function renderReply() {
  const r = state.reply;
  if (!r) return;
  const letter = `Subject: ${r.subject}\n\n${r.letter_to_send}`;
  $('#reply-output').innerHTML = `
    <div class="reply-panes ${r.letter_translated ? '' : 'single'}">
      <section class="pane pane-en">
        <h2>${t('reply_send_label')}</h2>
        <textarea class="textarea" id="reply-letter" dir="auto" aria-label="${esc(t('reply_send_label'))}">${esc(letter)}</textarea>
        <div class="pane-buttons">
          <button class="btn btn-primary" type="button" data-action="copy-reply">${icon('copy')}<span>${t('copy_letter')}</span></button>
          <button class="btn btn-secondary" type="button" data-action="print-reply">${icon('printer')}<span>${t('print')}</span></button>
        </div>
      </section>
      ${r.letter_translated ? `
      <section class="pane">
        <h2>${t('reply_understand_label')}</h2>
        <p class="pane-text" dir="auto">${esc(r.letter_translated)}</p>
      </section>` : ''}
    </div>
    ${r.fill_in.length ? `
    <section class="section" style="margin-top:16px">
      <h2>${icon('pen')}${t('fill_in_title')}</h2>
      <ul class="fill-list">${r.fill_in.map((f) => `<li><code>${esc(f.placeholder)}</code> ${esc(f.explanation)}</li>`).join('')}</ul>
    </section>` : ''}
    ${r.tips.length ? `
    <section class="section">
      <h2>${icon('lightbulb')}${t('tips_title')}</h2>
      <ul class="unsure">${r.tips.map((tip) => `<li>${esc(tip)}</li>`).join('')}</ul>
    </section>` : ''}`;
}

function addChip(text) {
  const note = $('#reply-note');
  note.value = note.value.trim() ? `${note.value.trim()} ${text}.` : `${text}.`;
  note.focus();
}

function printReply() {
  $('#print-area').textContent = $('#reply-letter').value;
  window.print();
}

// ---------- Small helpers ----------

let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------- Wiring up buttons ----------

const ACTIONS = {
  'home': (el, event) => { event.preventDefault(); goHome(); },
  'open-lang': () => {
    $('#lang-dialog').showModal();
    $('#lang-dialog [aria-current="true"]')?.focus();
  },
  'close-lang': () => $('#lang-dialog').close(),
  'set-lang': (el) => { changeLanguage(el.dataset.lang); $('#lang-dialog').close(); },
  'camera': () => pickPhotos('#file-camera', true),
  'library': () => pickPhotos('#file-library', true),
  'add-page': () => pickPhotos('#file-library', false),
  'example': () => startExample(),
  'remove-page': (el) => removePage(el.dataset.id),
  'toggle-draw': (el) => {
    state.drawingPageId = state.drawingPageId === el.dataset.id ? null : el.dataset.id;
    renderPages();
  },
  'undo': (el) => {
    state.pages.find((page) => page.id === el.dataset.id)?.boxes.pop();
    renderPages();
  },
  'explain': () => explain(),
  'toggle-check': (el) => toggleCheck(Number(el.dataset.index)),
  'read-aloud': () => readAloud(),
  'reminder': () => downloadReminder(),
  'reply': () => openReply(),
  'share': () => share(),
  'to-result': () => { show('result'); renderResult(); },
  'chip': (el) => addChip(el.textContent),
  'write-reply': () => writeReply(),
  'copy-reply': () => copyText($('#reply-letter').value),
  'print-reply': () => printReply(),
  'retry': () => state.error?.retry?.(),
};

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (el && ACTIONS[el.dataset.action]) ACTIONS[el.dataset.action](el, event);
});

for (const input of [$('#file-camera'), $('#file-library')]) {
  input.addEventListener('change', () => {
    if (input.files.length) addFiles(input.files, input.dataset.fresh === '1');
    input.value = '';
  });
}

// Close the language picker when tapping outside it.
$('#lang-dialog').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

setLang(detectLang());
renderLanguageUI();
drawHeroLines();
typeQuestions();
history.replaceState({ view: 'home' }, '', location.pathname);
show('home', { push: false, focus: false });

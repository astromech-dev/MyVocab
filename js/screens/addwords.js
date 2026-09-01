// "+ Add words": paste a list, check the preview, add. Two taps, no import wizard.

import { esc, on, qs, qsa, toast } from '../dom.js';
import { store, addWords, lessons } from '../store.js';
import { parseWordLines } from '../wordsformat.js';
import { PACK_LANGUAGES, getPack } from '../packs.js';

const sheet = document.getElementById('sheet');

// The panel is reused, its contents are not: bind listeners to the fresh child
// so re-rendering never stacks duplicate handlers.
const inner = () => sheet.firstElementChild;
let draft = null;          // null = paste step, array = preview step
let lessonName = '';
let parseMode = 'columns'; // how to read the pasted text — see js/wordsformat.js
let afterAdd = () => {};
let packView = null;       // a pack object = showing its read-only preview step

const EXAMPLES = {
  columns: `word or phrase | translation | pronunciation
another word | its translation
a short phrase | its translation`,
  rows2: `word or phrase
translation

another word
its translation`,
  rows3: `word or phrase
translation
pronunciation

another word
its translation
pronunciation`,
};

export function openAddWords(onDone = () => {}) {
  draft = null;
  lessonName = '';
  parseMode = 'columns';
  packView = null;
  afterAdd = onDone;
  show();
}

function close() {
  sheet.hidden = true;
  sheet.innerHTML = '';
  document.body.style.overflow = '';
}

function show() {
  sheet.hidden = false;
  document.body.style.overflow = 'hidden';
  if (packView) renderPackPreview();
  else if (draft) renderPreview();
  else renderPaste();
}

/* --- step 1: paste ---------------------------------------------- */

function renderPaste() {
  const known = lessons();
  const isNewLesson = lessonName && !known.includes(lessonName);
  sheet.innerHTML = `<div class="sheet-inner">
    <div class="sheet-head">
      <h2>Add words</h2>
      <button class="btn btn-quiet" data-act="close">Cancel</button>
    </div>

    <label class="field">
      <span>How is your list laid out?</span>
      <select class="input" id="parse-mode">
        <option value="columns" ${parseMode === 'columns' ? 'selected' : ''}>All on one line — word, translation, pronunciation</option>
        <option value="rows2" ${parseMode === 'rows2' ? 'selected' : ''}>Word and translation on separate lines</option>
        <option value="rows3" ${parseMode === 'rows3' ? 'selected' : ''}>Word, translation, pronunciation on separate lines</option>
      </select>
    </label>

    <label class="field">
      <span>Paste your words</span>
      <textarea class="input" id="paste" spellcheck="false"
        placeholder="${esc(EXAMPLES[parseMode])}"></textarea>
    </label>
    <p class="hint" id="parse-hint">${modeHint()}</p>
    <p class="hint" id="parse-count" aria-live="polite"></p>

    <label class="field">
      <span>Lesson (optional)</span>
      <select class="input" id="lesson-select">
        <option value="">No lesson</option>
        ${known.map((l) => `<option value="${esc(l)}" ${!isNewLesson && l === lessonName ? 'selected' : ''}>${esc(l)}</option>`).join('')}
        <option value="__new__" ${isNewLesson ? 'selected' : ''}>➕ New lesson…</option>
      </select>
      <input class="input" id="lesson-new" placeholder="Lesson name"
        value="${esc(isNewLesson ? lessonName : '')}" ${isNewLesson ? '' : 'hidden'}>
    </label>

    <div class="sheet-foot">
      <button class="btn btn-big btn-primary" data-act="preview">Preview</button>
    </div>

    ${packsSection()}
  </div>`;

  on(inner(), '[data-act="close"]', 'click', close);
  on(inner(), '#lesson-select', 'change', (el) => {
    const newField = qs(sheet, '#lesson-new');
    newField.hidden = el.value !== '__new__';
    if (!newField.hidden) newField.focus();
  });
  on(inner(), '#parse-mode', 'change', (el) => {
    parseMode = el.value;
    const box = qs(sheet, '#paste');
    box.placeholder = EXAMPLES[parseMode];
    qs(sheet, '#parse-hint').textContent = modeHint();
    updateCount();
  });
  on(inner(), '#paste', 'input', updateCount);
  on(inner(), '[data-act="preview"]', 'click', () => {
    const picked = qs(sheet, '#lesson-select').value;
    lessonName = picked === '__new__' ? qs(sheet, '#lesson-new').value.trim() : picked;
    const rows = parseWordLines(qs(sheet, '#paste').value, parseMode);
    if (!rows.length) { toast('Paste some words first'); return; }
    draft = rows;
    renderPreview();
  });
  on(inner(), '[data-pack]', 'click', (el) => {
    const pack = getPack(el.dataset.pack);
    if (!pack) return;
    packView = pack;
    renderPackPreview();
  });
  qs(sheet, '#paste').focus();
  updateCount();
}

function modeHint() {
  if (parseMode === 'rows2') {
    return 'Each word takes two lines: the word, then its translation. Leave a blank line between entries if a translation runs long.';
  }
  if (parseMode === 'rows3') {
    return 'Each word takes three lines: word, translation, pronunciation.';
  }
  return 'One word per line. Separate the parts with “|”, a tab, a semicolon, a dash, or two or more spaces. Pronunciation is optional.';
}

/** Live "N words detected" readout under the textarea, so a paste that didn't
 * come apart the way you expected is obvious before you hit Preview. */
function updateCount() {
  const out = qs(sheet, '#parse-count');
  if (!out) return;
  const rows = parseWordLines(qs(sheet, '#paste').value, parseMode);
  if (!rows.length) { out.textContent = ''; return; }
  const missing = rows.filter((r) => !r.translation).length;
  const first = rows[0];
  const peek = first.translation ? `${first.term} → ${first.translation}` : first.term;
  out.textContent = `${rows.length} word${rows.length === 1 ? '' : 's'} detected — first: ${peek}`
    + (missing ? ` · ${missing} without a translation` : '');
}

/** "Add ready-made packs" — a browsable catalog inside the paste step,
 * grouped by language (only English for now, see js/packs.js). A pack whose
 * every term is already in this deck (case-insensitive, same check addWords()
 * uses) shows as added and can't be tapped again — no separate "added packs"
 * list to keep in sync, it's just derived from store.words each render. */
function packsSection() {
  if (!PACK_LANGUAGES.length) return '';
  const existing = new Set(store.words
    .filter((w) => w.deckId === store.activeDeckId)
    .map((w) => w.term.toLowerCase()));
  const groups = PACK_LANGUAGES.map(({ lang, packIds }) => {
    const packs = packIds.map(getPack).filter(Boolean);
    if (!packs.length) return '';
    return `<p class="tiny muted" style="margin:14px 0 8px">${esc(lang)}</p>
      <div class="actions">
        ${packs.map((p) => {
          const added = p.words.every((w) => existing.has(w.term.toLowerCase()));
          return `<button class="action-card${added ? ' disabled' : ''}" type="button"
            data-pack="${esc(p.id)}" ${added ? 'disabled aria-label="Already added"' : ''}>
            <div class="action-icon">${added ? '✓' : '📚'}</div>
            <div class="action-text">
              <div class="t">${esc(p.name)}</div>
              <div class="s">${added ? 'Added' : `${p.words.length} words`}</div>
            </div>
            ${added ? '' : '<span class="action-go" aria-hidden="true">→</span>'}
          </button>`;
        }).join('')}
      </div>`;
  }).join('');
  if (!groups) return '';
  return `<p class="section-title" style="margin-top:26px">Add ready-made packs</p>${groups}`;
}

/* --- pack preview: read-only list, one tap to add ---------------- */

function renderPackPreview() {
  const pack = packView;
  const rows = pack.words.map((w) => `<li class="word-row" style="padding:12px 4px">
    <span class="col">
      <span class="term">${esc(w.term)}</span>
      ${w.transcription ? `<span class="tr" style="display:block">${esc(w.transcription)}</span>` : ''}
      <span class="tl" style="display:block">${esc(w.translation)}</span>
    </span>
  </li>`).join('');

  sheet.innerHTML = `<div class="sheet-inner">
    <div class="sheet-head">
      <h2>${esc(pack.name)}</h2>
      <button class="btn btn-quiet" data-act="close">Cancel</button>
    </div>
    <p class="hint" style="margin-top:0">${pack.words.length} words</p>
    <ul class="list">${rows}</ul>
    <div class="sheet-foot">
      <button class="btn btn-big btn-primary" data-act="add-pack">Add ${pack.words.length} words</button>
      <div class="center" style="margin-top:8px">
        <button class="btn btn-quiet" data-act="back">Back</button>
      </div>
    </div>
  </div>`;

  on(inner(), '[data-act="close"]', 'click', close);
  on(inner(), '[data-act="back"]', 'click', () => { packView = null; renderPaste(); });
  on(inner(), '[data-act="add-pack"]', 'click', () => {
    const n = addWords(pack.words, pack.name);
    const skipped = pack.words.length - n;
    close();
    toast(skipped
      ? `${n} word${n === 1 ? '' : 's'} added, ${skipped} already existed`
      : `${n} word${n === 1 ? '' : 's'} added`);
    afterAdd();
  });
}

/* --- step 2: preview -------------------------------------------- */

function renderPreview() {
  const existing = new Set(store.words
    .filter((w) => w.deckId === store.activeDeckId)
    .map((w) => w.term.toLowerCase()));
  const rows = draft.map((row, i) => {
    const dup = existing.has(row.term.toLowerCase());
    return `<div class="prow${dup ? ' is-dup' : ''}" data-i="${i}">
      <div class="pf">
        <span class="pf-lbl">Word</span>
        <input data-f="term" value="${esc(row.term)}" placeholder="word or phrase">
      </div>
      <div class="pf">
        <span class="pf-lbl">Translation</span>
        <input data-f="translation" value="${esc(row.translation)}" placeholder="what it means">
      </div>
      <div class="pf">
        <span class="pf-lbl">Pronunciation</span>
        <input data-f="transcription" value="${esc(row.transcription)}" placeholder="optional">
      </div>
      <button class="x" data-act="drop" title="Remove this entry" aria-label="Remove entry">✕</button>
      ${dup ? '<div class="pf-note"><span class="badge-warn">already in your words — won\'t be added again</span></div>' : ''}
    </div>`;
  }).join('');

  const label = lessonName ? `Add ${draft.length} to “${esc(lessonName)}”` : `Add ${draft.length} without lesson`;

  sheet.innerHTML = `<div class="sheet-inner">
    <div class="sheet-head">
      <h2>${draft.length} word${draft.length === 1 ? '' : 's'}</h2>
      <button class="btn btn-quiet" data-act="close">Cancel</button>
    </div>
    <p class="hint" style="margin-top:0">Fix anything that came out wrong, or remove an entry.</p>
    <div class="prow-list">${rows || '<p class="muted small">Nothing left.</p>'}</div>
    <div class="sheet-foot">
      <button class="btn btn-big btn-primary" data-act="add" ${draft.length ? '' : 'disabled'}>${label}</button>
      <div class="center" style="margin-top:8px">
        <button class="btn btn-quiet" data-act="back">Back to the list</button>
      </div>
    </div>
  </div>`;

  on(inner(), '[data-act="close"]', 'click', close);
  on(inner(), '[data-act="back"]', 'click', () => { draft = null; renderPaste(); });
  on(inner(), '[data-act="drop"]', 'click', (el) => {
    collect();
    draft.splice(Number(el.closest('.prow').dataset.i), 1);
    renderPreview();
  });
  on(inner(), '[data-act="add"]', 'click', () => {
    collect();
    const rows = draft.filter((r) => r.term);
    if (!rows.length) { toast('Nothing to add'); return; }
    const n = addWords(rows, lessonName);
    const skipped = rows.length - n;
    close();
    toast(skipped
      ? `${n} word${n === 1 ? '' : 's'} added, ${skipped} already existed`
      : `${n} word${n === 1 ? '' : 's'} added`);
    afterAdd();
  });
}

/** Reads the preview inputs back into the draft. */
function collect() {
  qsa(sheet, '.prow').forEach((row) => {
    const i = Number(row.dataset.i);
    if (!draft[i]) return;
    qsa(row, '[data-f]').forEach((input) => {
      draft[i][input.dataset.f] = input.value.trim();
    });
  });
}

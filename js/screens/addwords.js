// "+ Add words": paste a list, check the preview, add. Two taps, no import wizard.

import { esc, on, qs, qsa, toast } from '../dom.js';
import { store, addWords, lessons } from '../store.js';
import { parseWordLines } from '../wordsformat.js';

const sheet = document.getElementById('sheet');

// The panel is reused, its contents are not: bind listeners to the fresh child
// so re-rendering never stacks duplicate handlers.
const inner = () => sheet.firstElementChild;
let draft = null;          // null = paste step, array = preview step
let lessonName = '';
let afterAdd = () => {};

const EXAMPLE = `word or phrase | translation | pronunciation
another word | its translation | pronunciation
a short phrase | its translation | pronunciation`;

export function openAddWords(onDone = () => {}) {
  draft = null;
  lessonName = '';
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
  draft ? renderPreview() : renderPaste();
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
      <span>One word or phrase per line</span>
      <textarea class="input" id="paste" spellcheck="false"
        placeholder="${esc(EXAMPLE)}"></textarea>
    </label>
    <p class="hint">Format: <code>word | translation | pronunciation</code><br>
      Pronunciation is optional — write it however is easiest for you to read.</p>

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
  </div>`;

  on(inner(), '[data-act="close"]', 'click', close);
  on(inner(), '#lesson-select', 'change', (el) => {
    const newField = qs(sheet, '#lesson-new');
    newField.hidden = el.value !== '__new__';
    if (!newField.hidden) newField.focus();
  });
  on(inner(), '[data-act="preview"]', 'click', () => {
    const picked = qs(sheet, '#lesson-select').value;
    lessonName = picked === '__new__' ? qs(sheet, '#lesson-new').value.trim() : picked;
    const rows = parseWordLines(qs(sheet, '#paste').value);
    if (!rows.length) { toast('Paste some words first'); return; }
    draft = rows;
    renderPreview();
  });
  qs(sheet, '#paste').focus();
}

/* --- step 2: preview -------------------------------------------- */

function renderPreview() {
  const existing = new Set(store.words
    .filter((w) => w.deckId === store.activeDeckId)
    .map((w) => w.term.toLowerCase()));
  const rows = draft.map((row, i) => {
    const dup = existing.has(row.term.toLowerCase());
    return `<div class="prow" data-i="${i}">
      <input class="input" data-f="term" value="${esc(row.term)}" placeholder="Word or phrase">
      <input class="input" data-f="translation" value="${esc(row.translation)}" placeholder="Translation">
      <input class="input" data-f="transcription" value="${esc(row.transcription)}" placeholder="Pronunciation">
      <button class="x" data-act="drop" title="Remove this line" aria-label="Remove">✕</button>
      ${dup ? '<div class="tiny"><span class="badge-warn">already in your words — won\'t be added again</span></div>' : ''}
    </div>`;
  }).join('');

  const label = lessonName ? `Add ${draft.length} to “${esc(lessonName)}”` : `Add ${draft.length} without lesson`;

  sheet.innerHTML = `<div class="sheet-inner">
    <div class="sheet-head">
      <h2>${draft.length} word${draft.length === 1 ? '' : 's'}</h2>
      <button class="btn btn-quiet" data-act="close">Cancel</button>
    </div>
    <p class="hint" style="margin-top:0">Fix anything that came out wrong, or remove a line.</p>
    <div class="card" style="padding:14px 18px">${rows || '<p class="muted small">Nothing left.</p>'}</div>
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

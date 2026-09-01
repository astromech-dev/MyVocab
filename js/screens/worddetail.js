// One word: read it, edit it, or change how it is being learned.

import { esc, on, qs, fromNow, toast } from '../dom.js';
import { getWord, updateWord, deleteWord, touched, lessons } from '../store.js';
import { markLearned, learnAgain, DIRECTIONS, LEARNED_DAYS } from '../srs.js';

const sheet = document.getElementById('sheet');

// The panel is reused, its contents are not: bind listeners to the fresh child
// so re-rendering never stacks duplicate handlers.
const inner = () => sheet.firstElementChild;
let editing = false;
let afterChange = () => {};

export function openWord(id, onChange = () => {}) {
  editing = false;
  afterChange = onChange;
  sheet.hidden = false;
  document.body.style.overflow = 'hidden';
  render(id);
}

function close() {
  sheet.hidden = true;
  sheet.innerHTML = '';
  document.body.style.overflow = '';
  afterChange();
}

function render(id) {
  const word = getWord(id);
  if (!word) { close(); return; }
  editing ? renderEdit(word) : renderView(word);
}

function renderView(word) {
  sheet.innerHTML = `<div class="sheet-inner">
    <div class="sheet-head">
      <span class="status status-${word.status}">${word.status}</span>
      <button class="btn btn-quiet" data-act="close">Close</button>
    </div>

    <div class="card">
      <div class="detail-term">${esc(word.term)}</div>
      ${word.transcription ? `<p class="translit" style="color:var(--orange);font-size:18px;margin-top:6px">${esc(word.transcription)}</p>` : ''}
      <p class="ink-2" style="font-size:19px;margin-top:10px">${esc(word.translation)}</p>
      ${word.lesson ? `<p class="tiny muted" style="margin-top:14px">${esc(word.lesson)}</p>` : ''}
    </div>

    <p class="section-title">Actions</p>
    <div class="btn-row">
      <button class="btn btn-ghost" data-act="edit">Edit</button>
      ${word.status !== 'learned' ? '<button class="btn btn-ghost" data-act="learned">Mark as learned</button>' : ''}
      <button class="btn btn-ghost" data-act="again">Learn again</button>
      <button class="btn btn-danger" data-act="delete">Delete</button>
    </div>

    <p class="section-title">History</p>
    <ul class="kv card" style="padding:6px 20px">
      <li><span>Correct</span><b>${Math.max(0, word.checks - word.mistakes)}</b></li>
      <li><span>Mistakes</span><b>${word.mistakes}</b></li>
      <li><span>Last practiced</span><b>${fromNow(word.lastPracticed)}</b></li>
      ${word.introduced ? `<li><span>Days of recall</span><b>${progressLabel(word)}</b></li>` : ''}
    </ul>
  </div>`;

  on(inner(), '[data-act="close"]', 'click', close);
  on(inner(), '[data-act="edit"]', 'click', () => { editing = true; render(word.id); });
  on(inner(), '[data-act="learned"]', 'click', () => {
    markLearned(word); touched(); toast('Marked as learned'); render(word.id);
  });
  on(inner(), '[data-act="again"]', 'click', () => {
    learnAgain(word); touched(); toast('Back into learning'); render(word.id);
  });
  on(inner(), '[data-act="delete"]', 'click', () => {
    if (!confirm(`Delete “${word.term}”? This cannot be undone.`)) return;
    deleteWord(word.id);
    close();
    toast('Word deleted');
  });
}

function progressLabel(word) {
  if (word.status === 'learned') return 'Learned';
  const dir = word.dirs[DIRECTIONS[0]];
  return `${dir.goodDays} of ${LEARNED_DAYS} days`;
}

function renderEdit(word) {
  const known = lessons();
  sheet.innerHTML = `<div class="sheet-inner">
    <div class="sheet-head">
      <h2>Edit word</h2>
      <button class="btn btn-quiet" data-act="cancel">Cancel</button>
    </div>
    <div class="card">
      <label class="field"><span>Word or phrase</span>
        <input class="input" id="f-term" value="${esc(word.term)}"></label>
      <label class="field"><span>Pronunciation</span>
        <input class="input" id="f-transcription" value="${esc(word.transcription)}"></label>
      <label class="field"><span>Translation</span>
        <input class="input" id="f-translation" value="${esc(word.translation)}"></label>
      <label class="field"><span>Lesson</span>
        <input class="input" id="f-lesson" list="edit-lessons" value="${esc(word.lesson)}" placeholder="optional">
        <datalist id="edit-lessons">${known.map((l) => `<option value="${esc(l)}">`).join('')}</datalist>
      </label>
    </div>
    <div class="sheet-foot">
      <button class="btn btn-big btn-primary" data-act="save">Save</button>
    </div>
  </div>`;

  on(inner(), '[data-act="cancel"]', 'click', () => { editing = false; render(word.id); });
  on(inner(), '[data-act="save"]', 'click', () => {
    const term = qs(sheet, '#f-term').value.trim();
    if (!term) { toast('The word cannot be empty'); return; }
    updateWord(word.id, {
      term,
      transcription: qs(sheet, '#f-transcription').value.trim(),
      translation: qs(sheet, '#f-translation').value.trim(),
      lesson: qs(sheet, '#f-lesson').value.trim(),
    });
    editing = false;
    toast('Saved');
    render(word.id);
  });
}

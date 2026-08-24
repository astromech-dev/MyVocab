// Words — the whole personal database, with search and simple filters.

import { esc, on, qs } from '../dom.js';
import { store, lessons, counts } from '../store.js';
import { openWord } from './worddetail.js';
import { openAddWords } from './addwords.js';

const FILTERS = [
  ['all', 'All'], ['new', 'New'], ['learning', 'Learning'], ['learned', 'Learned'],
];

// Kept between renders so search and filters survive coming back to the screen.
const view = { q: '', filter: 'all', lesson: '' };

export function renderWords(root, rerender, goBack) {
  const stats = counts();

  if (!stats.total) {
    root.innerHTML = `
      <button class="btn btn-quiet" data-act="back" style="margin:0 0 8px -12px">← Back</button>
      <div class="card empty">
        <strong>No words yet</strong>
        <p style="margin-bottom:22px">Everything you add shows up here.</p>
        <button class="btn btn-primary" data-act="add">+ Add words</button>
      </div>`;
    on(root, '[data-act="back"]', 'click', goBack);
    on(root, '[data-act="add"]', 'click', () => openAddWords(rerender));
    return;
  }

  const list = filtered();
  const known = lessons();

  root.innerHTML = `
    <button class="btn btn-quiet" data-act="back" style="margin:0 0 8px -12px">← Back</button>
    <input class="search" id="q" type="search" placeholder="Search words, translations, pronunciation"
      value="${esc(view.q)}" autocomplete="off">

    <div class="chips" style="margin-top:12px">
      ${FILTERS.map(([key, label]) => `
        <button class="chip" data-filter="${key}" aria-pressed="${view.filter === key}">
          ${label}${key === 'all' ? '' : ` ${stats[key]}`}
        </button>`).join('')}
    </div>

    ${known.length ? `<div style="margin-top:12px">
      <select class="input" id="lesson" style="max-width:280px">
        <option value="">All lessons</option>
        ${known.map((l) => `<option value="${esc(l)}" ${view.lesson === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}
      </select>
    </div>` : ''}

    <p class="count-line">${list.length} of ${stats.total} word${stats.total === 1 ? '' : 's'}</p>

    ${list.length ? `<ul class="list">${list.map(row).join('')}</ul>`
      : '<div class="empty">Nothing matches.</div>'}
  `;

  const input = qs(root, '#q');
  input.addEventListener('input', () => {
    view.q = input.value;
    const cursor = input.selectionStart;
    rerender();
    const next = qs(root, '#q');
    if (next) { next.focus(); next.setSelectionRange(cursor, cursor); }
  });

  on(root, '[data-act="back"]', 'click', goBack);
  on(root, '[data-filter]', 'click', (el) => { view.filter = el.dataset.filter; rerender(); });
  qs(root, '#lesson')?.addEventListener('change', (e) => { view.lesson = e.target.value; rerender(); });
  on(root, '[data-word]', 'click', (el) => openWord(el.dataset.word, rerender));
}

function filtered() {
  const q = view.q.trim().toLowerCase();
  return store.words
    .filter((w) => w.deckId === store.activeDeckId)
    .filter((w) => view.filter === 'all' || w.status === view.filter)
    .filter((w) => !view.lesson || w.lesson === view.lesson)
    .filter((w) => !q
      || w.term.toLowerCase().includes(q)
      || w.translation.toLowerCase().includes(q)
      || w.transcription.toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);
}

function row(word) {
  return `<li><button class="word-row" data-word="${esc(word.id)}">
    <span class="col">
      <span class="term">${esc(word.term)}</span>
      ${word.transcription ? `<span class="tr" style="display:block">${esc(word.transcription)}</span>` : ''}
      <span class="tl" style="display:block">${esc(word.translation)}</span>
    </span>
    <span class="status status-${word.status}">${word.status}</span>
  </button></li>`;
}

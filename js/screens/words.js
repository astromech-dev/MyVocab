// Words — the whole personal database, with search and simple filters.

import { esc, on, qs, toast } from '../dom.js';
import { store, lessons, counts, deleteWords } from '../store.js';
import { isHard } from '../srs.js';
import { openWord } from './worddetail.js';
import { openAddWords } from './addwords.js';

// 'hard' is not a status (see isHard in srs.js) — it's the one filter that
// cuts across New/Learning, which is the point: it's where you come to look
// at the words that keep beating you.
const FILTERS = [
  ['all', 'All'], ['new', 'New'], ['learning', 'Learning'], ['learned', 'Learned'], ['hard', 'Hard'],
];

function matchesFilter(word, filter) {
  if (filter === 'all') return true;
  if (filter === 'hard') return isHard(word);
  return word.status === filter;
}

// Kept between renders so search, filters and an in-progress selection
// survive coming back to the screen.
const view = { q: '', filter: 'all', lesson: '', selecting: false, selected: new Set() };

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
  const selecting = view.selecting;
  const allVisibleSelected = list.length > 0 && list.every((w) => view.selected.has(w.id));

  root.innerHTML = `
    <button class="btn btn-quiet" data-act="back" style="margin:0 0 8px -12px">← Back</button>
    <input class="search" id="q" type="search" placeholder="Search words, translations, pronunciation"
      value="${esc(view.q)}" autocomplete="off">

    <div class="chips" style="margin-top:12px">
      ${FILTERS.map(([key, label]) => `
        <button class="chip" data-filter="${key}" aria-pressed="${view.filter === key}">
          ${label}${key === 'all' ? '' : ` ${key === 'hard' ? hardCount() : stats[key]}`}
        </button>`).join('')}
    </div>

    ${known.length ? `<div style="margin-top:12px">
      <select class="input" id="lesson" style="max-width:280px">
        <option value="">All lessons</option>
        ${known.map((l) => `<option value="${esc(l)}" ${view.lesson === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}
      </select>
    </div>` : ''}

    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px">
      <p class="count-line" id="count-line" style="margin:0">${list.length} of ${stats.total} word${stats.total === 1 ? '' : 's'}</p>
      <button class="btn btn-quiet" data-act="toggle-select">${selecting ? 'Cancel' : 'Select'}</button>
    </div>

    ${selecting ? `<div class="btn-row" style="margin-top:12px">
      <button class="btn btn-ghost" data-act="select-all">${allVisibleSelected ? 'Deselect all' : 'Select all'}</button>
      <button class="btn btn-danger" data-act="delete-selected" ${view.selected.size ? '' : 'disabled'}>Delete (${view.selected.size})</button>
    </div>` : ''}

    <div id="list-container">
      ${list.length ? `<ul class="list">${list.map((w) => row(w, selecting, view.selected)).join('')}</ul>`
        : '<div class="empty">Nothing matches.</div>'}
    </div>
  `;

  const input = qs(root, '#q');
  input.addEventListener('input', () => {
    view.q = input.value;
    updateList(root);
  });

  on(root, '[data-act="back"]', 'click', goBack);
  on(root, '[data-act="toggle-select"]', 'click', () => {
    view.selecting = !view.selecting;
    if (!view.selecting) view.selected = new Set();
    rerender();
  });
  on(root, '[data-act="select-all"]', 'click', () => {
    const ids = list.map((w) => w.id);
    if (allVisibleSelected) ids.forEach((id) => view.selected.delete(id));
    else ids.forEach((id) => view.selected.add(id));
    rerender();
  });
  on(root, '[data-act="delete-selected"]', 'click', () => {
    const ids = [...view.selected];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} word${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    deleteWords(ids);
    view.selecting = false;
    view.selected = new Set();
    toast(`${ids.length} word${ids.length === 1 ? '' : 's'} deleted`);
    rerender();
  });
  on(root, '[data-filter]', 'click', (el) => { view.filter = el.dataset.filter; rerender(); });
  qs(root, '#lesson')?.addEventListener('change', (e) => { view.lesson = e.target.value; rerender(); });
  on(root, '[data-select]', 'change', (el) => {
    const id = el.dataset.select;
    if (el.checked) view.selected.add(id); else view.selected.delete(id);
    rerender();
  });
  on(root, '[data-word]', 'click', (el) => openWord(el.dataset.word, rerender));
}

// Updates only the count line and word list, leaving the search input
// untouched — replacing it (as a full rerender would) drops focus and, on
// mobile, closes the keyboard after every keystroke.
function updateList(root) {
  const stats = counts();
  const list = filtered();
  const countLine = qs(root, '#count-line');
  if (countLine) countLine.textContent = `${list.length} of ${stats.total} word${stats.total === 1 ? '' : 's'}`;
  const container = qs(root, '#list-container');
  if (container) {
    container.innerHTML = list.length
      ? `<ul class="list">${list.map((w) => row(w, view.selecting, view.selected)).join('')}</ul>`
      : '<div class="empty">Nothing matches.</div>';
  }
}

/** Not part of `counts()` — that lives in store.js, which stays clear of
 * srs.js (srs.js reads the store, so the dependency only goes one way). */
function hardCount() {
  return store.words.filter((w) => w.deckId === store.activeDeckId && isHard(w)).length;
}

function filtered() {
  const q = view.q.trim().toLowerCase();
  return store.words
    .filter((w) => w.deckId === store.activeDeckId)
    .filter((w) => matchesFilter(w, view.filter))
    .filter((w) => !view.lesson || w.lesson === view.lesson)
    .filter((w) => !q
      || w.term.toLowerCase().includes(q)
      || w.translation.toLowerCase().includes(q)
      || w.transcription.toLowerCase().includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);
}

function row(word, selecting, selected) {
  const body = `
    <span class="col">
      <span class="term">${esc(word.term)}</span>
      ${word.transcription ? `<span class="tr" style="display:block">${esc(word.transcription)}</span>` : ''}
      <span class="tl" style="display:block">${esc(word.translation)}</span>
    </span>
    <span class="row-tags">
      ${isHard(word) ? '<span class="status status-hard">hard</span>' : ''}
      <span class="status status-${word.status}">${word.status}</span>
    </span>`;

  if (selecting) {
    return `<li><label class="word-row">
      <input type="checkbox" class="row-check" data-select="${esc(word.id)}" ${selected.has(word.id) ? 'checked' : ''}>
      ${body}
    </label></li>`;
  }
  return `<li><button class="word-row" data-word="${esc(word.id)}">${body}</button></li>`;
}

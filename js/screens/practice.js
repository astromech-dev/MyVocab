// Practice — for when you want to choose yourself, plus exam preparation.

import { esc, on, qs, qsa } from '../dom.js';
import { store, lessons, counts } from '../store.js';
import { buildPractice, buildExam, mistakeCards, DIRECTIONS } from '../srs.js';
import { startSession } from '../study.js';
import { TARGET_LANGUAGE, NATIVE_LANGUAGE } from '../config.js';

const view = { lesson: '', examLessons: new Set(), examAll: true };

export function renderPractice(root, rerender) {
  const stats = counts();
  if (!stats.total) {
    root.innerHTML = '<div class="card empty"><strong>No words yet</strong>Add some words first.</div>';
    return;
  }

  const known = lessons();
  const pool = store.words.filter((w) => !view.lesson || w.lesson === view.lesson);
  const introduced = pool.filter((w) => w.introduced);
  const modes = [
    ['all', 'All practice', `${introduced.length * DIRECTIONS.length} cards`],
    ['new', 'New words', `${pool.filter((w) => w.status === 'new').length} words`],
    ['learning', 'Learning', `${pool.filter((w) => w.status === 'learning').length} words`],
    ['rf', `${NATIVE_LANGUAGE} → ${TARGET_LANGUAGE}`, `${introduced.length} cards`],
    ['fr', `${TARGET_LANGUAGE} → ${NATIVE_LANGUAGE}`, `${introduced.length} cards`],
    ['mistakes', 'Mistakes', `${mistakeCards(pool).length} cards`],
  ];

  root.innerHTML = `
    ${known.length ? `<select class="input" id="lesson" style="max-width:280px">
      <option value="">All lessons</option>
      ${known.map((l) => `<option value="${esc(l)}" ${view.lesson === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}
    </select>` : ''}

    <p class="section-title" style="margin-top:${known.length ? '22px' : '4px'}">Practice</p>
    <div class="mode-list">
      ${modes.map(([key, label, meta]) => {
        const empty = meta.startsWith('0 ');
        return `<button class="mode" data-mode="${key}" ${empty ? 'disabled' : ''}>
          <b>${esc(label)}</b><em>${esc(meta)}</em>
        </button>`;
      }).join('')}
    </div>

    <p class="section-title">Exam practice</p>
    <div class="card">
      <p class="small ink-2" style="margin-bottom:6px">Both directions mixed, one card per word, with a score at the end.</p>
      ${known.length ? `<div class="checks">
        <label><input type="checkbox" id="exam-all" ${view.examAll ? 'checked' : ''}> <b>All words</b></label>
        ${known.map((l) => `<label><input type="checkbox" data-exam-lesson="${esc(l)}"
          ${view.examLessons.has(l) ? 'checked' : ''} ${view.examAll ? 'disabled' : ''}> ${esc(l)}</label>`).join('')}
      </div>` : ''}
      <p class="hint" id="exam-count"></p>
      <button class="btn btn-primary" data-act="exam" style="margin-top:10px">Start exam</button>
    </div>
  `;

  qs(root, '#lesson')?.addEventListener('change', (e) => { view.lesson = e.target.value; rerender(); });

  on(root, '[data-mode]', 'click', (el) => {
    const mode = el.dataset.mode;
    const label = modes.find(([key]) => key === mode)[1];
    const set = buildPractice(mode, { lesson: view.lesson });
    startSession({ title: label, mode: `practice:${mode}`, ...set, onExit: rerender });
  });

  qs(root, '#exam-all')?.addEventListener('change', (e) => {
    view.examAll = e.target.checked;
    if (view.examAll) view.examLessons.clear();
    rerender();
  });
  on(root, '[data-exam-lesson]', 'change', (el) => {
    const name = el.dataset.examLesson;
    el.checked ? view.examLessons.add(name) : view.examLessons.delete(name);
    updateExamCount(root);
  });
  updateExamCount(root);

  on(root, '[data-act="exam"]', 'click', () => {
    const words = examWords();
    startSession({
      title: 'Exam practice',
      mode: 'exam',
      exam: true,
      ...buildExam(words),
      onExit: rerender,
    });
  });
}

function examWords() {
  const all = store.words.filter((w) => w.introduced || w.status !== 'new');
  if (view.examAll || !view.examLessons.size) return all;
  return all.filter((w) => view.examLessons.has(w.lesson));
}

function updateExamCount(root) {
  const node = qs(root, '#exam-count');
  if (!node) return;
  const n = examWords().length;
  node.textContent = n ? `${n} word${n === 1 ? '' : 's'} selected` : 'No words selected yet.';
}

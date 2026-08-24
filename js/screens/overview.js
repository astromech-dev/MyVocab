// Overview — the whole app on one page: no tabs. Start today's practice,
// see your stats, run an exam, browse words (via a link), back up.

import { esc, on, qs, dayKey, plural, toast, shuffle } from '../dom.js';
import { store, counts, today as todayStats, streak, lessons, exportBackup, importBackup } from '../store.js';
import { todayPlan, buildExam, mistakeCards } from '../srs.js';
import { startSession } from '../study.js';
import { openAddWords } from './addwords.js';

const DAY = 86400000;
const DAYS_SHOWN = 14;

const exam = { all: true, lessons: new Set() };

export function renderOverview(root, rerender, openWords) {
  const stats = counts();

  if (!stats.total) {
    root.innerHTML = `<div class="card empty">
      <strong>No words yet</strong>
      <p style="max-width:34ch;margin:0 auto 22px">Add the words from your last lesson and MyVocab
        will take care of when to repeat them.</p>
      <button class="btn btn-primary" data-act="add">+ Add words</button>
    </div>`;
    on(root, '[data-act="add"]', 'click', () => openAddWords(rerender));
    return;
  }

  const plan = todayPlan();
  const done = todayStats();
  const days = streak();
  const known = lessons();
  const mistakes = mistakeCards();
  const history = lastDays(DAYS_SHOWN);
  const peak = Math.max(1, ...history.map((d) => d.practiced));
  const streakLine = days >= 2 ? `<p class="streak">${days} days in a row</p>` : '';

  const todayBlock = !plan.words
    ? `<div class="card today-card">
        <div class="done-mark">✓</div>
        <h1 class="h1" style="margin-top:12px">Done for today</h1>
        <p class="today-label">${done.practiced
          ? `${done.practiced} word${done.practiced === 1 ? '' : 's'} practiced today`
          : 'Nothing is due right now'}</p>
        ${streakLine}
      </div>`
    : `<div class="card today-card">
        <p class="section-title" style="margin:0 0 8px">Today</p>
        <div class="today-count">${plan.words}</div>
        <p class="today-label">word${plan.words === 1 ? '' : 's'} to practice</p>
        <div class="today-split">
          ${plan.reviews ? `<span><i class="dot dot-blue"></i><b>${plan.reviews}</b> to review</span>` : ''}
          ${plan.newCount ? `<span><i class="dot dot-orange"></i><b>${plan.newCount}</b> new</span>` : ''}
        </div>
        <button class="btn btn-big btn-primary" data-act="start">Start</button>
        ${done.practiced ? `<p class="tiny muted" style="margin-top:14px">${done.practiced} already practiced today</p>` : ''}
        ${streakLine}
      </div>`;

  root.innerHTML = `
    ${todayBlock}
    ${mistakes.length ? `<div class="center" style="margin-top:14px">
      <button class="btn btn-ghost" data-act="mistakes">Practice ${plural(mistakes.length, 'mistake', 'mistakes')}</button>
    </div>` : ''}

    <p class="section-title">Your words</p>
    <div class="tiles">
      <div class="tile"><b>${stats.total}</b><span>Total</span></div>
      <div class="tile warm"><b>${stats.new}</b><span>New, not yet learned</span></div>
      <div class="tile accent"><b>${stats.learning}</b><span>Learning</span></div>
      <div class="tile"><b>${stats.learned}</b><span>Learned</span></div>
    </div>
    <p class="count-line"><a href="#" data-act="words">See all words →</a></p>

    <p class="section-title">Exam</p>
    <div class="card">
      <p class="small ink-2" style="margin-bottom:6px">One card per word, score at the end.</p>
      ${known.length ? `<div class="checks">
        <label><input type="checkbox" id="exam-all" ${exam.all ? 'checked' : ''}> <b>All words</b></label>
        ${known.map((l) => `<label><input type="checkbox" data-exam-lesson="${esc(l)}"
          ${exam.lessons.has(l) ? 'checked' : ''} ${exam.all ? 'disabled' : ''}> ${esc(l)}</label>`).join('')}
      </div>` : ''}
      <p class="hint" id="exam-count"></p>
      <button class="btn btn-primary" data-act="exam" style="margin-top:10px">Start exam</button>
    </div>

    <p class="section-title">Last ${DAYS_SHOWN} days</p>
    <div class="card">
      <div class="bars">
        ${history.map((d) => `<div class="${d.practiced ? 'on' : ''}"
          style="height:${Math.round((d.practiced / peak) * 100)}%"
          title="${esc(d.key)}: ${d.practiced}"></div>`).join('')}
      </div>
      <div class="bars-x">
        ${history.map((d, i) => `<span>${i === 0 || i === history.length - 1 ? d.label : ''}</span>`).join('')}
      </div>
    </div>

    <p class="section-title">Backup</p>
    <div class="card">
      <p class="small ink-2">Everything lives in this browser only. Export a copy from time to time so
        your words cannot get lost.</p>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn btn-ghost" data-act="export">Export backup</button>
        <button class="btn btn-ghost" data-act="import">Import backup</button>
      </div>
      <input type="file" id="file" accept="application/json,.json" hidden>
    </div>
  `;

  on(root, '[data-act="add"]', 'click', () => openAddWords(rerender));

  on(root, '[data-act="start"]', 'click', () => {
    const fresh = todayPlan();
    startSession({ title: 'Today', mode: 'today', intro: fresh.intro, cards: fresh.cards, onExit: rerender });
  });

  on(root, '[data-act="mistakes"]', 'click', () => {
    startSession({ title: 'Mistakes', mode: 'mistakes', cards: shuffle(mistakeCards()), onExit: rerender });
  });

  on(root, '[data-act="words"]', 'click', (el, e) => { e.preventDefault(); openWords(); });

  on(root, '[data-act="export"]', 'click', () => { exportBackup(); toast('Backup saved'); });
  on(root, '[data-act="import"]', 'click', () => root.querySelector('#file').click());
  root.querySelector('#file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!confirm('Importing replaces all words and history currently in this browser. Continue?')) {
      event.target.value = '';
      return;
    }
    try {
      const n = importBackup(await file.text());
      toast(`${plural(n, 'word', 'words')} restored`);
      rerender();
    } catch (err) {
      alert(`Could not import this file.\n\n${err.message}`);
    }
    event.target.value = '';
  });

  qs(root, '#exam-all')?.addEventListener('change', (e) => {
    exam.all = e.target.checked;
    if (exam.all) exam.lessons.clear();
    rerender();
  });
  on(root, '[data-exam-lesson]', 'change', (el) => {
    const name = el.dataset.examLesson;
    el.checked ? exam.lessons.add(name) : exam.lessons.delete(name);
    updateExamCount(root);
  });
  updateExamCount(root);

  on(root, '[data-act="exam"]', 'click', () => {
    startSession({ title: 'Exam', mode: 'exam', exam: true, ...buildExam(examWords()), onExit: rerender });
  });
}

function examWords() {
  const all = store.words.filter((w) => w.introduced || w.status !== 'new');
  if (exam.all || !exam.lessons.size) return all;
  return all.filter((w) => exam.lessons.has(w.lesson));
}

function updateExamCount(root) {
  const node = qs(root, '#exam-count');
  if (!node) return;
  const n = examWords().length;
  node.textContent = n ? `${plural(n, 'word', 'words')} selected` : 'No words selected yet.';
}

function lastDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const ts = Date.now() - i * DAY;
    const key = dayKey(ts);
    out.push({
      key,
      label: new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      practiced: store.days[key]?.practiced || 0,
    });
  }
  return out;
}

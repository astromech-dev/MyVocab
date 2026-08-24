// Overview — the whole app on one page. No "today", no schedule: just
// New → Learning → Learned, and you decide how much to do and when.

import { esc, on, plural, toast } from '../dom.js';
import { store, counts, exportBackup, importBackup, recentActivity } from '../store.js';
import { learningPool, pickNewWords } from '../srs.js';
import { startIntro, startCarousel, startExam } from '../study.js';
import { openAddWords } from './addwords.js';

const NEW_BATCH = 10;
const DAYS_SHOWN = 14;

export function renderOverview(root, rerender, openWords) {
  const stats = counts();

  if (!stats.total) {
    root.innerHTML = `<div class="card empty">
      <strong>No words yet</strong>
      <p style="max-width:34ch;margin:0 auto 22px">Add the words from your last lesson and start
        learning them whenever you like.</p>
      <button class="btn btn-primary" data-act="add">+ Add words</button>
    </div>`;
    on(root, '[data-act="add"]', 'click', () => openAddWords(rerender));
    return;
  }

  const pool = learningPool();
  const learnedPct = stats.total ? Math.round((stats.learned / stats.total) * 100) : 0;
  const newBatch = Math.min(NEW_BATCH, stats.new);
  const caughtUp = !stats.new && !pool.length;
  const history = recentActivity(DAYS_SHOWN);
  const peak = Math.max(1, ...history.map((d) => d.practiced));

  root.innerHTML = `
    <div class="card today-card">
      <div class="today-count">${stats.learned}</div>
      <p class="today-label">words learned</p>
      <p class="tiny muted" style="margin-top:2px">${plural(stats.total, 'word', 'words')} in your vocabulary</p>
      <div class="progressbar" style="margin:16px 0 20px"><i style="width:${learnedPct}%"></i></div>

      <div class="tiles">
        <div class="tile warm"><b>${stats.new}</b><span>New</span></div>
        <div class="tile accent"><b>${stats.learning}</b><span>Learning</span></div>
        <div class="tile"><b>${stats.learned}</b><span>Learned</span></div>
      </div>

      <div class="btn-row" style="margin-top:20px;align-items:stretch">
        <div style="flex:1 1 150px">
          <p class="section-title" style="margin:0 0 6px">New words</p>
          <p class="tiny muted" style="margin-bottom:10px">${stats.new ? `${plural(stats.new, 'word', 'words')} waiting` : 'Nothing new'}</p>
          <button class="btn btn-big btn-primary" data-act="learn-new" ${stats.new ? '' : 'disabled'}>Learn new words</button>
          ${stats.new ? `<p class="tiny muted center" style="margin-top:8px">Start with ${newBatch}</p>` : ''}
        </div>
        <div style="flex:1 1 150px">
          <p class="section-title" style="margin:0 0 6px">Practice</p>
          <p class="tiny muted" style="margin-bottom:10px">${pool.length ? `${plural(pool.length, 'word', 'words')} you're learning` : 'Nothing to practice'}</p>
          <button class="btn btn-big btn-primary" data-act="practice" ${pool.length ? '' : 'disabled'}>Practice words</button>
        </div>
      </div>
      ${caughtUp ? '<p class="tiny muted center" style="margin-top:16px">All caught up — try an exam, or add more words.</p>' : ''}
    </div>

    <p class="count-line"><a href="#" data-act="words">See all words →</a></p>

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

    <p class="section-title">Exam</p>
    <div class="card">
      ${stats.learned > 0
        ? `<p class="small ink-2">Test how well you remember your learned words.</p>
           <p class="tiny muted" style="margin-top:4px">${plural(stats.learned, 'word', 'words')}</p>
           <button class="btn btn-primary" data-act="exam" style="margin-top:12px">Start exam</button>`
        : `<p class="small ink-2">Test how well you remember the words you've learned.</p>
           <p class="tiny muted" style="margin-top:4px">No learned words yet</p>
           <p class="small ink-2" style="margin-top:10px">Your first exam will be available once you've learned some words.</p>
           <button class="btn btn-primary" data-act="exam" style="margin-top:12px" disabled>Start exam</button>`}
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
  on(root, '[data-act="words"]', 'click', (el, e) => { e.preventDefault(); openWords(); });

  on(root, '[data-act="practice"]', 'click', () => {
    if (!pool.length) return;
    startCarousel(pool, { onExit: rerender });
  });

  on(root, '[data-act="learn-new"]', 'click', () => {
    if (!stats.new) return;
    startIntro(pickNewWords(NEW_BATCH), { onExit: rerender });
  });

  on(root, '[data-act="exam"]', 'click', () => {
    if (!stats.learned) return;
    startExam(store.words.filter((w) => w.status === 'learned'), { onExit: rerender });
  });

  on(root, '[data-act="export"]', 'click', () => { exportBackup(); toast('Backup saved'); });
  on(root, '[data-act="import"]', 'click', () => root.querySelector('#file').click());
  root.querySelector('#file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!confirm('Importing replaces all words and progress currently in this browser. Continue?')) {
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
}

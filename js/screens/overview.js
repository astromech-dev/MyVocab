// Overview — the whole app on one page. No "today", no schedule: just
// New → Learning → Learned, and you decide how much to do and when.

import { esc, on, plural, toast } from '../dom.js';
import { store, counts, exportBackup, importBackup } from '../store.js';
import { learningPool, pickNewWords } from '../srs.js';
import { startIntro, startCarousel, startExam } from '../study.js';
import { openAddWords } from './addwords.js';

const NEW_COUNTS = [5, 10, 20];
const view = { newCount: 10 };

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

  root.innerHTML = `
    <div class="card today-card">
      <div class="today-count">${stats.learned}</div>
      <p class="today-label">of ${stats.total} learned</p>
      <div class="progressbar" style="margin:16px 0 18px"><i style="width:${learnedPct}%"></i></div>
      <div class="today-split">
        <span><i class="dot dot-orange"></i><b>${stats.new}</b> new</span>
        <span><i class="dot dot-blue"></i><b>${stats.learning}</b> learning</span>
      </div>
      ${primaryBlock(stats, pool)}
    </div>

    <p class="count-line"><a href="#" data-act="words">See all words →</a></p>

    <p class="section-title">Exam</p>
    <div class="card">
      ${stats.learned > 0
        ? `<p class="small ink-2">Test how well you remember your learned words.</p>
           <p class="tiny muted" style="margin-top:4px">${plural(stats.learned, 'learned word', 'learned words')}</p>
           <button class="btn btn-primary" data-act="exam" style="margin-top:12px">Start exam</button>`
        : `<p class="small ink-2">Learn some words first to unlock the exam.</p>
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

  on(root, '[data-act="continue"]', 'click', () => startCarousel(learningPool(), { onExit: rerender }));

  on(root, '[data-new-count]', 'click', (el) => { view.newCount = Number(el.dataset.newCount); rerender(); });
  on(root, '[data-act="learn-new"]', 'click', () => {
    startIntro(pickNewWords(view.newCount), { onExit: rerender });
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

function primaryBlock(stats, pool) {
  if (pool.length > 0) {
    return `
      <button class="btn btn-big btn-primary" data-act="continue">Continue learning</button>
      <p class="tiny muted" style="margin-top:10px">${plural(pool.length, 'word', 'words')} in rotation</p>
      ${stats.new > 0 ? newWordsPicker(stats.new, true) : ''}
    `;
  }
  if (stats.new > 0) {
    return newWordsPicker(stats.new, false);
  }
  return `
    <p class="today-label">All caught up</p>
    <div class="btn-row center" style="margin-top:14px;justify-content:center">
      <button class="btn btn-ghost" data-act="exam">Start an exam</button>
      <button class="btn btn-ghost" data-act="add">Add words</button>
    </div>
  `;
}

function newWordsPicker(newTotal, secondary) {
  const n = Math.min(view.newCount, newTotal);
  return `
    <div style="margin-top:${secondary ? '24px' : '0'}">
      ${secondary ? '<p class="tiny muted" style="margin-bottom:10px">or</p>' : ''}
      <div class="chips center" style="justify-content:center">
        ${NEW_COUNTS.map((c) => `<button class="chip" data-new-count="${c}" aria-pressed="${view.newCount === c}">${c}</button>`).join('')}
      </div>
      <button class="btn btn-big ${secondary ? 'btn-ghost' : 'btn-primary'}" data-act="learn-new" style="margin-top:10px">
        Learn ${plural(n, 'new word', 'new words')}
      </button>
      <p class="tiny muted" style="margin-top:8px">${plural(newTotal, 'word', 'words')} waiting</p>
    </div>
  `;
}

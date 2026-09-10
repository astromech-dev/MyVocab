// Overview — the whole app on one page. No "today", no schedule: just
// New → Learning → Learned, and you decide how much to do and when.

import { esc, on, plural, toast } from '../dom.js';
import { store, counts, exportBackup, importBackup, recentActivity, currentStreak, activeDeck } from '../store.js';
import { learningPool, learningPoolLessons, practiceSession, pickNewWords, newWordLessons, learnedLessons, examBatch, EXAM_BATCH } from '../srs.js';
import { startIntro, startCarousel, startExam, pickLesson, pickExamDir } from '../study.js';
import { openAddWords } from './addwords.js';
import { renderOnboarding } from './onboarding.js';

const NEW_BATCH = 10;
const DAYS_SHOWN = 14;

/**
 * Learn and Practice as two fixed rows (Learn always first), not two
 * competing buttons: an empty one goes quiet instead of disappearing so the
 * layout doesn't jump around. Each row is a single button — the whole card
 * is the tap target, not a pill inside it.
 */
function actionsBlock(stats, pool) {
  if (!stats.new && !pool.length && !stats.learning) {
    return `<div class="actions">
      <div class="action-card done">
        <div class="action-icon">✓</div>
        <div class="action-text"><div class="t">All ${stats.total} words learned</div><div class="s">Try the exam to stay sharp</div></div>
        <button class="btn btn-primary" data-act="exam">Exam</button>
      </div>
    </div>`;
  }

  const learnRow = stats.new
    ? `<button class="action-card new" type="button" data-act="learn-new">
        <div class="action-icon">+</div>
        <div class="action-text"><div class="t">${plural(stats.new, 'new word', 'new words')} waiting</div><div class="s">Start a fresh batch</div></div>
        <span class="action-go" aria-hidden="true">→</span>
      </button>`
    : `<div class="action-card new disabled">
        <div class="action-icon">0</div>
        <div class="action-text"><div class="t">No new words</div><div class="s">All caught up on new material</div></div>
      </div>`;

  const practiceRow = pool.length
    ? `<button class="action-card learning" type="button" data-act="practice">
        <div class="action-icon">${pool.length}</div>
        <div class="action-text"><div class="t">Words ready to review</div><div class="s">In your learning queue</div></div>
        <span class="action-go" aria-hidden="true">→</span>
      </button>`
    : stats.learning
    ? `<div class="action-card learning disabled">
        <div class="action-icon">✓</div>
        <div class="action-text"><div class="t">Practiced everything for now</div><div class="s">Come back tomorrow, or learn something new</div></div>
      </div>`
    : `<div class="action-card learning disabled">
        <div class="action-icon">0</div>
        <div class="action-text"><div class="t">Nothing to review yet</div><div class="s">Learn some words first</div></div>
      </div>`;

  return `<div class="actions">${learnRow}${practiceRow}</div>`;
}

export function renderOverview(root, rerender, openWords) {
  if (!activeDeck()) {
    renderOnboarding(root, rerender);
    return;
  }

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
  const history = recentActivity(DAYS_SHOWN);
  const peak = Math.max(1, ...history.map((d) => d.practiced)); // divisor for bar heights
  const streak = currentStreak();
  const activeDays = history.filter((d) => d.practiced).length;

  root.innerHTML = `
    <div class="card">
      <div class="status-row-top">
        <div class="pct">${learnedPct}%<em>learned</em></div>
        <div class="count">${plural(stats.total, 'word', 'words')} total</div>
      </div>
      <div class="seg-bar">
        <i class="new" style="flex:${stats.new}"></i>
        <i class="learning" style="flex:${stats.learning}"></i>
        <i class="learned" style="flex:${stats.learned}"></i>
      </div>
      <div class="legend">
        <div class="item"><span class="swatch new"></span>New <b>${stats.new}</b></div>
        <div class="item"><span class="swatch learning"></span>Learning <b>${stats.learning}</b></div>
        <div class="item"><span class="swatch learned"></span>Learned <b>${stats.learned}</b></div>
      </div>
    </div>

    <p class="section-title">Learning queue</p>
    <div class="card">
      ${actionsBlock(stats, pool)}
    </div>

    <p class="count-line"><a href="#" data-act="words">See all words →</a></p>

    <p class="section-title">Last ${DAYS_SHOWN} days</p>
    <div class="card">
      <div class="bars-top">
        <span>${activeDays ? `Practiced on ${activeDays} of ${DAYS_SHOWN} days` : `No practice in the last ${DAYS_SHOWN} days`}</span>
        ${streak > 1 ? `<span class="bars-streak">🔥 ${plural(streak, 'day', 'days')} in a row</span>` : ''}
      </div>
      <div class="bars">
        ${history.map((d) => `<div class="${d.practiced ? 'on' : ''}"
          style="height:${Math.round((d.practiced / peak) * 100)}%"
          title="${esc(d.label)}: ${plural(d.practiced, 'word', 'words')}"></div>`).join('')}
      </div>
      <div class="bars-x">
        ${history.map((d, i) => `<span>${i === 0 || i === history.length - 1 ? d.label : ''}</span>`).join('')}
      </div>
    </div>

    <p class="section-title">Exam</p>
    <div class="card">
      ${stats.learned > 0
        ? `<div class="exam-row">
             <div class="exam-icon ready">✓</div>
             <div class="action-text">
               <p class="small ink-2">Test how well you remember your learned words.</p>
               <p class="tiny muted" style="margin-top:4px">${plural(stats.learned, 'word', 'words')} learned · ${EXAM_BATCH} per exam</p>
             </div>
           </div>
           <button class="btn btn-primary btn-big" data-act="exam" style="margin-top:16px">Start exam</button>`
        : `<div class="exam-row">
             <div class="exam-icon">🔒</div>
             <div class="action-text">
               <p class="small ink-2">Test how well you remember the words you've learned.</p>
               <p class="tiny muted" style="margin-top:4px">No learned words yet</p>
               <p class="small ink-2" style="margin-top:10px">Your first exam will be available once you've learned some words.</p>
             </div>
           </div>
           <button class="btn btn-primary btn-big" data-act="exam" style="margin-top:16px" disabled>Start exam</button>`}
    </div>

    <p class="section-title">Backup</p>
    <div class="card">
      <p class="small ink-2">Everything lives in this browser only. Export a copy from time to time so
        your words cannot get lost.</p>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn btn-ghost" data-act="export">Export backup</button>
        <button class="btn btn-ghost" data-act="import">Restore backup</button>
      </div>
      <input type="file" id="file" accept="application/json,.json" hidden>
    </div>
  `;

  on(root, '[data-act="add"]', 'click', () => openAddWords(rerender));
  on(root, '[data-act="words"]', 'click', (el, e) => { e.preventDefault(); openWords(); });

  // `pool` above is what the card counts; the session itself also gets
  // filler so a thin pool doesn't march through in one block.
  const practice = (lessons) => {
    const { pool: words, filler } = practiceSession(undefined, undefined, lessons);
    startCarousel(words, { filler, onExit: rerender });
  };

  on(root, '[data-act="practice"]', 'click', () => {
    if (!pool.length) return;
    const lessonNames = learningPoolLessons();
    if (lessonNames.length > 1) {
      pickLesson(lessonNames, practice, { onExit: rerender });
    } else {
      practice(null);
    }
  });

  on(root, '[data-act="learn-new"]', 'click', () => {
    if (!stats.new) return;
    const lessonNames = newWordLessons();
    if (lessonNames.length > 1) {
      pickLesson(lessonNames, (lessons) => startIntro(pickNewWords(NEW_BATCH, undefined, lessons), { onExit: rerender }), { onExit: rerender });
    } else {
      startIntro(pickNewWords(NEW_BATCH), { onExit: rerender });
    }
  });

  // Direction first ("what kind of exam"), then lessons ("over which words").
  // Either way the session gets one portion, not the whole Learned pile.
  on(root, '[data-act="exam"]', 'click', () => {
    if (!stats.learned) return;
    pickExamDir((dir) => {
      const go = (lessons) => startExam(examBatch(EXAM_BATCH, dir, undefined, lessons), { dir, onExit: rerender });
      const lessonNames = learnedLessons();
      if (lessonNames.length > 1) pickLesson(lessonNames, go, { onExit: rerender });
      else go(null);
    }, { onExit: rerender });
  });

  on(root, '[data-act="export"]', 'click', () => { exportBackup(); toast('Backup saved'); });
  on(root, '[data-act="import"]', 'click', () => root.querySelector('#file').click());
  root.querySelector('#file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!confirm('Restoring replaces all words and progress currently in this browser. Continue?')) {
      event.target.value = '';
      return;
    }
    try {
      const n = importBackup(await file.text());
      toast(`${plural(n, 'word', 'words')} restored`);
      rerender();
    } catch (err) {
      alert(`Could not restore this backup.\n\n${err.message}`);
    }
    event.target.value = '';
  });
}

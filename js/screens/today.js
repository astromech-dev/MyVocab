// Today — the home screen. One question: what do I practise today?

import { esc, on } from '../dom.js';
import { store, counts, today as todayStats, streak } from '../store.js';
import { todayPlan } from '../srs.js';
import { startSession } from '../study.js';
import { openAddWords } from './addwords.js';

export function renderToday(root, rerender) {
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
  const streakLine = days >= 2 ? `<p class="streak">${days} days in a row</p>` : '';

  if (!plan.words) {
    root.innerHTML = `<div class="card today-card">
      <div class="done-mark">✓</div>
      <h1 class="h1" style="margin-top:12px">Done for today</h1>
      <p class="today-label">${done.practiced
        ? `${done.practiced} word${done.practiced === 1 ? '' : 's'} practiced today`
        : 'Nothing is due right now'}</p>
      <div style="margin-top:26px"><a class="btn btn-ghost" href="#/practice">Practice anyway</a></div>
      ${streakLine}
    </div>
    ${footer(stats)}`;
    return;
  }

  root.innerHTML = `<div class="card today-card">
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
  </div>
  ${footer(stats)}`;

  on(root, '[data-act="start"]', 'click', () => {
    const fresh = todayPlan();
    startSession({
      title: 'Today',
      mode: 'today',
      intro: fresh.intro,
      cards: fresh.cards,
      onExit: rerender,
    });
  });
}

function footer(stats) {
  return `<p class="count-line center" style="margin-top:18px">
    ${stats.total} word${stats.total === 1 ? '' : 's'} ·
    ${stats.learning} learning · ${stats.learned} learned
  </p>`;
}

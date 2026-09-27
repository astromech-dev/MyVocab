// Statistics — the activity history on its own screen, over longer periods
// than the overview's strip: answers (right / wrong), accuracy, and
// words learned.
//
// "Words" is only ever a count of *distinct* words. The daily `practiced`
// tally is distinct per day, so it's fine on a single day's row, but summed
// over a week or a period it counts a word once per day it was drilled — so
// period totals come from `wordsActiveSince()` and folded rows show no
// word count at all.

import { esc, on, plural } from '../dom.js';
import { recentActivity, currentStreak, activitySpan, wordsActiveSince } from '../store.js';

const PERIODS = [
  ['14', '2 weeks'], ['30', 'Month'], ['90', '3 months'], ['365', 'Year'], ['all', 'All time'],
];
const MODES = [['answers', 'Answers'], ['accuracy', 'Accuracy'], ['learned', 'Learned']];

// Kept between renders so the chosen period survives a re-render (an answer
// recorded elsewhere, a deck switch).
const view = { period: '14', mode: 'answers' };

/** Days a period covers. "All time" reaches back to the first recorded day,
 * but never less than the shortest preset so the chart has a shape. */
function periodDays(period) {
  if (period !== 'all') return Number(period);
  return Math.max(14, activitySpan());
}

/**
 * Daily entries folded into columns the chart can actually draw: a bar per
 * day up to a month, per week up to a season, per month beyond that. Weeks
 * are counted back from today so the last column is always the current one.
 */
function bucketize(days) {
  const n = days.length;
  if (n <= 31) return days.map((d) => ({ ...d, days: [d] }));
  const groups = [];
  if (n <= 120) {
    for (let end = n; end > 0; end -= 7) groups.unshift(days.slice(Math.max(0, end - 7), end));
  } else {
    let current = null;
    for (const d of days) {
      const month = d.key.slice(0, 7);
      if (!current || current.month !== month) groups.push(current = { month, list: [] });
      current.list.push(d);
    }
    return groups.map((g) => fold(g.list, new Date(g.list[0].ts).toLocaleDateString(undefined, { month: 'short', year: n > 400 ? '2-digit' : undefined })));
  }
  return groups.map((g) => fold(g, g.length === 1
    ? g[0].label
    : `${new Date(g[0].ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${new Date(g[g.length - 1].ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`));
}

function fold(list, label) {
  return list.reduce((acc, d) => ({
    ...acc,
    practiced: acc.practiced + d.practiced,
    correct: acc.correct + d.correct,
    wrong: acc.wrong + d.wrong,
    learned: acc.learned + d.learned,
  }), { label, days: list, practiced: 0, correct: 0, wrong: 0, learned: 0 });
}

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);

function tooltip(b) {
  const answers = b.correct + b.wrong;
  const parts = b.days.length === 1 ? [plural(b.practiced, 'word', 'words')] : [];
  if (answers) parts.push(`${plural(answers, 'answer', 'answers')}: ${b.correct} right, ${b.wrong} wrong (${pct(b.correct, answers)}%)`);
  if (b.learned) parts.push(`${b.learned} learned`);
  return `${b.label}: ${parts.join(' · ')}`;
}

function chart(buckets, mode) {
  const value = (b) => (mode === 'answers' ? b.correct + b.wrong
    : mode === 'accuracy' ? pct(b.correct, b.correct + b.wrong) ?? 0
    : b.learned);
  // Accuracy is drawn against a fixed 100%, so a 60% day looks like 60%.
  const peak = mode === 'accuracy' ? 100 : Math.max(1, ...buckets.map(value));
  const h = (v) => `${Math.round((v / peak) * 100)}%`;
  const cols = buckets.map((b) => {
    const v = value(b);
    let segs;
    if (!v) segs = '<i class="stub"></i>';
    else if (mode === 'answers') segs = `<i class="bad" style="height:${h(b.wrong)}"></i><i class="ok" style="height:${h(b.correct)}"></i>`;
    else segs = `<i class="${mode === 'accuracy' ? 'ok' : 'done'}" style="height:${h(v)}"></i>`;
    return `<div class="col" title="${esc(tooltip(b))}">${segs}</div>`;
  });
  // Every month label fits under its column; for days and weeks only the
  // two ends are shown, pinned to the chart's edges.
  const monthly = buckets.some((b) => b.days.length > 7); // first/last month may be partial
  const labels = monthly
    ? `<div class="chart-x">${buckets.map((b) => `<span>${esc(b.label)}</span>`).join('')}</div>`
    : `<div class="chart-x ends"><span>${esc(buckets[0]?.label ?? '')}</span><span>${esc(buckets[buckets.length - 1]?.label ?? '')}</span></div>`;
  return `<div class="chart">${cols.join('')}</div>${labels}`;
}

function table(buckets) {
  const rows = [...buckets].reverse().filter((b) => b.practiced);
  if (!rows.length) return '';
  const daily = buckets.every((b) => b.days.length === 1);
  const dash = '<span class="muted">–</span>';
  return `<div style="overflow-x:auto;margin-top:6px">
    <table class="stat-table">
      <thead><tr>
        <th>${daily ? 'Day' : 'Period'}</th>
        ${daily ? '<th title="Words practiced that day">Words</th>' : ''}
        <th title="Cards answered, repeats included">Answers</th>
        <th title="Share of answers that were right">Right</th>
        <th title="Words that became Learned">Learned</th>
      </tr></thead>
      <tbody>${rows.map((b) => {
        const answers = b.correct + b.wrong;
        const acc = pct(b.correct, answers);
        return `<tr>
          <td>${esc(b.label)}</td>
          ${daily ? `<td>${b.practiced}</td>` : ''}
          <td>${answers || dash}</td>
          <td>${acc === null ? dash : `<span class="ok">${acc}%</span>`}</td>
          <td>${b.learned ? `<span class="done">+${b.learned}</span>` : dash}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
  </div>`;
}

export function renderStats(root, rerender, goBack) {
  const n = periodDays(view.period);
  const days = recentActivity(n);
  const buckets = bucketize(days);
  const total = fold(days, '');
  const answers = total.correct + total.wrong;
  const accuracy = pct(total.correct, answers);
  const words = wordsActiveSince(new Date(days[0].key + 'T00:00:00').getTime());
  const streak = currentStreak();
  // Days practiced before answers were recorded: words only, no breakdown.
  const unsplit = days.some((d) => d.practiced && !d.correct && !d.wrong);

  root.innerHTML = `
    <button class="btn btn-quiet" data-act="back" style="margin:0 0 8px -12px">← Back</button>
    <h1 class="h1" style="margin-bottom:14px">Statistics</h1>

    <div class="chips">
      ${PERIODS.map(([key, label]) => `<button class="chip" data-period="${key}" aria-pressed="${view.period === key}">${label}</button>`).join('')}
    </div>

    <div class="card" style="margin-top:14px">
      ${total.practiced ? `
        <div class="stat-tiles stat-tiles-3">
          <div class="stat-tile"><b>${words}</b><span>${words === 1 ? 'word' : 'words'} practiced</span></div>
          <div class="stat-tile"><b class="${accuracy === null ? '' : 'ok'}">${accuracy === null ? '–' : `${accuracy}%`}</b><span>right answers</span>${answers ? `<span>${total.correct} of ${answers}</span>` : ''}</div>
          <div class="stat-tile"><b class="${total.learned ? 'done' : ''}">${total.learned ? `+${total.learned}` : '–'}</b><span>words learned</span></div>
        </div>
        ${streak > 1 ? `<div class="bars-top" style="margin:14px 0 0"><span></span><span class="bars-streak">🔥 ${plural(streak, 'day', 'days')} in a row</span></div>` : ''}`
        : `<p class="small ink-2">No practice in this period.</p>`}
    </div>

    <p class="section-title">Over time</p>
    <div class="card">
      <div class="chips chips-small" style="margin-bottom:14px">
        ${MODES.map(([key, label]) => `<button class="chip" data-mode="${key}" aria-pressed="${view.mode === key}">${label}</button>`).join('')}
      </div>
      ${chart(buckets, view.mode)}
      ${view.mode === 'answers' ? `<div class="legend" style="margin-top:12px">
        <div class="item"><span class="swatch" style="background:var(--blue)"></span>Right</div>
        <div class="item"><span class="swatch" style="background:var(--red)"></span>Wrong</div>
      </div>` : ''}
      <p class="tiny muted" style="margin-top:12px">${view.mode === 'answers'
        ? 'Each time you answered a card in Practice or Exam. The same word can be answered several times a day.'
        : view.mode === 'accuracy'
          ? 'Share of answers that were right.'
          : 'Words that reached Learned.'}</p>
      ${unsplit ? `<p class="tiny muted" style="margin-top:6px">Right and wrong answers are counted from the day this was added; earlier days have none.</p>` : ''}
    </div>

    ${total.practiced ? `<p class="section-title">Breakdown</p>
    <div class="card">${table(buckets)}</div>` : ''}
  `;

  on(root, '[data-act="back"]', 'click', goBack);
  on(root, '[data-period]', 'click', (el) => { view.period = el.dataset.period; rerender(); });
  on(root, '[data-mode]', 'click', (el) => { view.mode = el.dataset.mode; rerender(); });
}

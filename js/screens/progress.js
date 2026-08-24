// Progress — a few honest numbers, plus backup. No dashboards.

import { esc, on, dayKey, plural, toast } from '../dom.js';
import { store, counts, today as todayStats, streak, exportBackup, importBackup } from '../store.js';

const DAY = 86400000;
const DAYS_SHOWN = 14;

export function renderProgress(root, rerender) {
  const stats = counts();
  const done = todayStats();
  const days = streak();
  const history = lastDays(DAYS_SHOWN);
  const peak = Math.max(1, ...history.map((d) => d.practiced));

  root.innerHTML = `
    <div class="tiles">
      <div class="tile"><b>${stats.total}</b><span>Total words</span></div>
      <div class="tile warm"><b>${stats.new}</b><span>New</span></div>
      <div class="tile accent"><b>${stats.learning}</b><span>Learning</span></div>
      <div class="tile"><b>${stats.learned}</b><span>Learned</span></div>
    </div>

    <p class="section-title">Today</p>
    <div class="card">
      <p style="font-size:19px">${done.practiced
        ? `${plural(done.practiced, 'word', 'words')} practiced`
        : 'Nothing practiced yet today'}</p>
      ${done.practiced ? `<p class="small muted" style="margin-top:4px">
        ${done.knew} knew · ${done.almost} almost · ${done.unknown} didn't know</p>` : ''}
      ${days >= 2 ? `<p class="streak" style="text-align:left;margin-top:12px">${days} days in a row</p>` : ''}
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

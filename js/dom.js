// Tiny DOM helpers. No framework on purpose: every screen renders an HTML
// string and wires its own listeners through delegation.

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Delegated listener: on(root, '[data-act="x"]', 'click', (el, event) => ...) */
export function on(root, selector, type, handler) {
  root.addEventListener(type, (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) handler(target, event);
  });
}

export function qs(root, selector) { return root.querySelector(selector); }
export function qsa(root, selector) { return [...root.querySelectorAll(selector)]; }

export function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

export function toast(message) {
  document.querySelector('.toast')?.remove();
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 2400);
}

const DAY = 86400000;

/** "today", "yesterday", "3 days ago", "12 Aug" — short and human. */
export function fromNow(ts) {
  if (!ts) return 'never';
  const days = Math.floor((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Fisher–Yates, in place. */
export function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

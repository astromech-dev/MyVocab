// The whole database: one JSON blob in localStorage.
// Shape is intentionally flat and boring so it stays easy to migrate.

import { dayKey } from './dom.js';
import { parseWordLines } from './wordsformat.js';
import { LESSONS as SEED } from './seed.js';

const KEY = 'myvocab.v1';
const DAY = 86400000;

export const store = {
  version: 4,
  decks: [],          // [{id, name, createdAt}] — one independent vocabulary
  activeDeckId: null,
  words: [],
  days: {},        // 'YYYY-MM-DD' -> words practiced that day
  seedMerged: [],  // lowercased terms already pulled in from seed.js, ever
};

const listeners = new Set();

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function notify() { listeners.forEach((fn) => fn()); }

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* --- persistence ------------------------------------------------ */

let saveTimer = null;

export function save({ immediate = false } = {}) {
  clearTimeout(saveTimer);
  const write = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(store));
    } catch (err) {
      console.error('MyVocab: could not save', err);
      alert('MyVocab could not save your words (browser storage is full or blocked).');
    }
  };
  if (immediate) write();
  else saveTimer = setTimeout(write, 250);
}

export function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  if (raw) adopt(JSON.parse(raw));
  mergeSeed();
  // Never lose data because the tab was closed mid-debounce.
  addEventListener('pagehide', () => save({ immediate: true }));
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save({ immediate: true });
  });
}

function adopt(data) {
  if (!data || typeof data !== 'object') return;
  const decks = Array.isArray(data.decks) ? data.decks.map(normalizeDeck) : [];
  const words = Array.isArray(data.words) ? data.words.map(normalizeWord) : [];

  // Words from before decks existed (or a backup that predates them) have no
  // deckId — this app only ever taught Armenian back then, so file them all
  // under one deck matching that original setup rather than losing them or
  // making the reader guess.
  const orphans = words.filter((w) => !w.deckId);
  if (orphans.length) {
    let home = decks[0];
    if (!home) {
      home = normalizeDeck({ name: 'Armenian', createdAt: 0 });
      decks.push(home);
    }
    orphans.forEach((w) => { w.deckId = home.id; });
  }

  store.decks = decks;
  store.words = words;
  store.activeDeckId = decks.some((d) => d.id === data.activeDeckId) ? data.activeDeckId : (decks[0]?.id ?? null);
  store.days = data.days && typeof data.days === 'object' ? data.days : {};
  store.seedMerged = Array.isArray(data.seedMerged) ? data.seedMerged : [];
}

/** `target` is read as a fallback so backups saved before the language-pair
 * fields were dropped still recover a sensible name. */
function normalizeDeck(d) {
  return {
    id: d.id || uid(),
    name: String(d.name || d.target || '').trim() || 'Vocabulary',
    createdAt: d.createdAt || Date.now(),
  };
}

/**
 * Pulls in any seed.js words not yet seen on this device. Merged terms are
 * remembered forever (even if you later delete the word) so a lesson never
 * comes back from the dead just because the app reloaded.
 */
function mergeSeed() {
  if (!SEED.length) return;
  const merged = new Set(store.seedMerged);
  const now = Date.now();
  let added = 0;
  let deckId = store.activeDeckId;
  for (const { name, text } of SEED) {
    for (const row of parseWordLines(text)) {
      const key = row.term.toLowerCase();
      if (merged.has(key)) continue;
      if (!deckId) {
        const legacy = normalizeDeck({ name: 'Armenian', createdAt: 0 });
        store.decks.push(legacy);
        store.activeDeckId = deckId = legacy.id;
      }
      store.words.push(normalizeWord({
        id: uid(),
        term: row.term,
        translation: row.translation,
        transcription: row.transcription,
        lesson: name,
        deckId,
        createdAt: now + added,
      }));
      merged.add(key);
      added++;
    }
  }
  if (added) {
    store.seedMerged = [...merged];
    save();
    notify();
  }
}

/** Fills in anything a future/older version might be missing. */
function normalizeWord(w) {
  const dir = (d) => ({
    // A word migrating from the old one-rep-per-day model already carries a
    // meaningful level (0-3): each point there took a separate calendar day
    // to earn, same as a completed stage here, so it carries over as-is —
    // the word just resumes at that stage's quota instead of restarting.
    level: Number(d?.level) || 0,
    stageReps: Number(d?.stageReps) || 0,
    stageRepsDay: d?.stageRepsDay ?? null,
    dayDoneOn: d?.dayDoneOn ?? null,
    reps: Number(d?.reps) || 0,
  });
  return {
    id: w.id || uid(),
    deckId: w.deckId || null,
    term: String(w.term || '').trim(),
    translation: String(w.translation || '').trim(),
    transcription: String(w.transcription || '').trim(),
    lesson: String(w.lesson || '').trim(),
    status: ['new', 'learning', 'learned'].includes(w.status) ? w.status : 'new',
    introduced: Boolean(w.introduced),
    introViews: Number(w.introViews) || 0,
    learningStartedAt: w.learningStartedAt ?? null,
    dirs: { fr: dir(w.dirs?.fr), rf: dir(w.dirs?.rf) },
    checks: Number(w.checks) || 0,
    mistakes: Number(w.mistakes) || 0,
    lastPracticed: w.lastPracticed ?? null,
    createdAt: w.createdAt || Date.now(),
    updatedAt: w.updatedAt || w.createdAt || Date.now(),
  };
}

/* --- decks (vocabularies) ------------------------------------------ */

export function decks() { return store.decks; }

export function activeDeck() {
  return store.decks.find((d) => d.id === store.activeDeckId) || null;
}

export function setActiveDeck(id) {
  if (!store.decks.some((d) => d.id === id) || id === store.activeDeckId) return;
  store.activeDeckId = id;
  save();
  notify();
}

/** New vocabulary. Becomes the active deck. */
export function addDeck(name) {
  const deck = normalizeDeck({ name });
  store.decks.push(deck);
  store.activeDeckId = deck.id;
  save();
  notify();
  return deck;
}

/* --- words ------------------------------------------------------ */

export function getWord(id) { return store.words.find((w) => w.id === id); }

export function addWords(rows, lesson = '', deckId = store.activeDeckId) {
  const now = Date.now();
  const added = rows.map((row, i) => normalizeWord({
    id: uid(),
    deckId,
    term: row.term,
    translation: row.translation,
    transcription: row.transcription,
    lesson,
    createdAt: now + i,   // keeps the pasted order stable
  }));
  store.words.push(...added);
  save();
  notify();
  return added.length;
}

export function updateWord(id, patch) {
  const word = getWord(id);
  if (!word) return;
  Object.assign(word, patch, { updatedAt: Date.now() });
  save();
  notify();
}

export function deleteWord(id) {
  const i = store.words.findIndex((w) => w.id === id);
  if (i >= 0) store.words.splice(i, 1);
  save();
  notify();
}

/** Bulk delete — one filter pass and one save/notify, unlike N calls to deleteWord. */
export function deleteWords(ids) {
  if (!ids.length) return;
  const drop = new Set(ids);
  store.words = store.words.filter((w) => !drop.has(w.id));
  save();
  notify();
}

export function touched() { save(); notify(); }

export function lessons(deckId = store.activeDeckId) {
  const names = new Set(store.words.filter((w) => w.deckId === deckId).map((w) => w.lesson).filter(Boolean));
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function counts(deckId = store.activeDeckId) {
  const c = { total: 0, new: 0, learning: 0, learned: 0 };
  for (const w of store.words) {
    if (w.deckId !== deckId) continue;
    c.total++;
    c[w.status]++;
  }
  return c;
}

/* --- activity ----------------------------------------------------- */

/** One word answered/reviewed just now — for the activity chart only. */
export function recordActivity(n = 1) {
  const key = dayKey();
  store.days[key] = (store.days[key] || 0) + n;
  save();
  notify();
}

/** Last `n` days, oldest first, for a simple activity chart. */
export function recentActivity(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const ts = Date.now() - i * DAY;
    const key = dayKey(ts);
    out.push({
      key,
      label: new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      practiced: store.days[key] || 0,
    });
  }
  return out;
}

/* --- backup ----------------------------------------------------- */

export function exportBackup() {
  const payload = JSON.stringify({ app: 'MyVocab', exportedAt: new Date().toISOString(), ...store }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `myvocab-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Replaces everything with the file's contents (after the caller confirms). */
export function importBackup(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.words)) throw new Error('This file does not look like a MyVocab backup.');
  adopt(data);
  save({ immediate: true });
  notify();
  return store.words.length;
}

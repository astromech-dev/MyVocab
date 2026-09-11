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
  days: {},        // deckId -> { 'YYYY-MM-DD': distinct words reviewed that day }
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
  store.days = migrateDays(data.days, store.decks, store.activeDeckId);
  store.seedMerged = Array.isArray(data.seedMerged) ? data.seedMerged : [];
}

/**
 * `days` used to be one flat `{ 'YYYY-MM-DD': count }` map shared across every
 * deck; it's now per-deck (`{ deckId: { day: count } }`) so the activity chart
 * is scoped like the rest of the app. Old history predates multiple decks, so
 * all of it belongs to the single deck that existed back then. Buckets for a
 * deck that no longer exists are dropped.
 */
function migrateDays(raw, decks, activeId) {
  if (!raw || typeof raw !== 'object') return {};
  const entries = Object.entries(raw);
  const nested = entries.every(([, v]) => v && typeof v === 'object');
  if (nested) {
    const live = {};
    for (const [id, bucket] of entries) {
      if (decks.some((d) => d.id === id)) live[id] = normalizeBucket(bucket);
    }
    return live;
  }
  const home = activeId || decks[0]?.id;
  return home ? { [home]: normalizeBucket(raw) } : {};
}

/**
 * A day used to be a bare count of distinct words reviewed; it's now
 * `{ practiced, correct, wrong, learned }`. Old days keep their count and
 * get zeros for the rest — `correct + wrong === 0` with `practiced > 0` is
 * how the stats screen tells "no breakdown recorded" from "nothing done".
 */
function normalizeBucket(bucket) {
  const out = {};
  for (const [day, v] of Object.entries(bucket || {})) {
    out[day] = typeof v === 'number'
      ? { practiced: v, correct: 0, wrong: 0, learned: 0 }
      : { practiced: v.practiced || 0, correct: v.correct || 0, wrong: v.wrong || 0, learned: v.learned || 0 };
  }
  return out;
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

// Ceiling for a seeded miss balance (see seedMisses). Mirrors MISS_CAP in
// srs.js on purpose rather than importing it: srs.js reads `store`, and
// store.js reaching back into srs.js would make that a cycle.
const SEED_MISS_CAP = 5;

/**
 * Words that predate the rolling miss balance get one seeded from their
 * lifetime record, so the first session after the update already knows which
 * words have been fighting back rather than starting everybody at zero. Same
 * arithmetic the live counter uses — a miss up, a correct answer down —
 * applied to the totals, which flags only words whose misses actually
 * outnumber their hits.
 *
 * Learned words start clean: Practice never touches them, and a "hard" badge
 * on a finished word says nothing useful.
 */
function seedMisses(w) {
  if (w.status === 'learned') return 0;
  const mistakes = Number(w.mistakes) || 0;
  const corrects = Math.max(0, (Number(w.checks) || 0) - mistakes);
  return Math.max(0, Math.min(SEED_MISS_CAP, mistakes - corrects));
}

/** Fills in anything a future/older version might be missing. */
function normalizeWord(w) {
  const seeded = seedMisses(w);
  const dir = (d) => ({
    // goodDays: separate calendar days this direction has been recalled
    // correctly (see LEARNED_DAYS in srs.js). Words from the older 2-stage
    // model carry a `level` (0-2) where each point already took its own
    // calendar day, so it maps straight onto goodDays with no loss.
    goodDays: Number(d?.goodDays) || Number(d?.level) || 0,
    lastGoodDay: d?.lastGoodDay ?? d?.dayDoneOn ?? null,
    repsToday: Number(d?.repsToday) || 0,
    repsTodayDay: d?.repsTodayDay ?? null,
    // Today's latched reinforcement quota — 0 means "not decided yet", which
    // is also what a mid-day upgrade recomputes from. See applyAnswer.
    targetToday: Number(d?.targetToday) || 0,
    dayDoneOn: d?.dayDoneOn ?? null,
    reps: Number(d?.reps) || 0,
    // Rolling miss balance — see HARD_AT in srs.js. Not a lifetime total
    // (that's `mistakes` below): it pays down on every correct answer. The
    // field's *absence* is the migration marker — seed from history once,
    // then the live counter owns it, so a present 0 is left alone.
    misses: d?.misses === undefined ? seeded : (Number(d.misses) || 0),
    // Exam bookkeeping, per direction. `lastExamAt` is what orders each
    // portion (see examBatch in srs.js) — unset means never checked this way
    // round, which sorts first. `examPasses` is the "how solid is this
    // really" number, and unlike goodDays it keeps growing past Learned.
    lastExamAt: d?.lastExamAt ?? null,
    examPasses: Number(d?.examPasses) || 0,
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

/** Skips any row whose term already exists in the deck (case-insensitive) —
 * a duplicate collapses into the existing word instead of starting a fresh
 * one, so its progress/status is untouched and it never appears twice. */
export function addWords(rows, lesson = '', deckId = store.activeDeckId) {
  const now = Date.now();
  const seen = new Set(store.words
    .filter((w) => w.deckId === deckId)
    .map((w) => w.term.toLowerCase()));
  let added = 0;
  rows.forEach((row) => {
    const key = row.term.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    store.words.push(normalizeWord({
      id: uid(),
      deckId,
      term: row.term,
      translation: row.translation,
      transcription: row.transcription,
      lesson,
      createdAt: now + added,   // keeps the pasted order stable
    }));
    added++;
  });
  save();
  notify();
  return added;
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

// Words already counted toward today's bar — so a card circling back through
// the carousel, or re-seen in a later session the same day, is counted once.
// Rebuilt when the calendar day rolls over.
let countedDay = null;
let countedIds = new Set();

const EMPTY_DAY = { practiced: 0, correct: 0, wrong: 0, learned: 0 };

/**
 * One word reviewed just now. `practiced` counts each distinct word once per
 * calendar day, per deck — a measure of how much material you covered, not
 * how many taps it took. `result` (`'knew'` / `'unknown'`, absent for an
 * intro card) and `learned` (the answer graduated the word) are tallied on
 * *every* call: those measure the answers, not the material. `wordId` is
 * looked up so a stale id (word since deleted) simply doesn't count.
 */
export function recordActivity(wordId, { result = null, learned = false } = {}) {
  const word = wordId && store.words.find((w) => w.id === wordId);
  if (!word || !word.deckId) return;
  const key = dayKey();
  const bucket = store.days[word.deckId] || (store.days[word.deckId] = {});
  const day = bucket[key] || (bucket[key] = { ...EMPTY_DAY });
  if (result === 'knew') day.correct++;
  else if (result === 'unknown') day.wrong++;
  if (learned) day.learned++;
  if (countedDay !== key) { countedDay = key; countedIds = new Set(); }
  const tag = word.deckId + '|' + word.id;
  if (!countedIds.has(tag)) {
    countedIds.add(tag);
    day.practiced++;
  }
  save();
  notify();
}

/** Last `n` days for one deck, oldest first, for the activity charts. Each
 * entry carries the day's full tally (see `recordActivity`). */
export function recentActivity(n, deckId = store.activeDeckId) {
  const bucket = store.days[deckId] || {};
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const ts = Date.now() - i * DAY;
    const key = dayKey(ts);
    out.push({
      key,
      ts,
      label: new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      ...(bucket[key] || EMPTY_DAY),
    });
  }
  return out;
}

/** How many days back this deck's history reaches (today counts as 1), so
 * the stats screen's "all time" period knows how far to draw. */
export function activitySpan(deckId = store.activeDeckId) {
  const keys = Object.keys(store.days[deckId] || {}).filter((k) => store.days[deckId][k].practiced);
  if (!keys.length) return 0;
  const first = keys.sort()[0];
  const ts = new Date(first + 'T00:00:00').getTime();
  return Math.max(1, Math.floor((Date.now() - ts) / DAY) + 1);
}

/**
 * Consecutive calendar days with at least one word reviewed, ending today —
 * or, if nothing has been done yet today, ending yesterday, so an unfinished
 * day doesn't read as a broken streak.
 */
export function currentStreak(deckId = store.activeDeckId) {
  const bucket = store.days[deckId] || {};
  const active = (i) => Boolean(bucket[dayKey(Date.now() - i * DAY)]?.practiced);
  let i = 0;
  if (!active(0)) {
    if (!active(1)) return 0;
    i = 1;
  }
  let streak = 0;
  while (active(i)) { streak++; i++; }
  return streak;
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

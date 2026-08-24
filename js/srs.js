// Spaced repetition — one schedule per word, per direction.
//
// Armenian → Russian: see the word, say the translation. Each direction
// sits on its own step; each step is an interval in days. Knowing it moves
// one step up, not knowing resets it to the start.

import { startOfDay, shuffle } from './dom.js';
import { store } from './store.js';

const DAY = 86400000;
const STEP_DAYS = [0, 1, 2, 4, 9, 21, 45, 90];
const LEARNED_STEP = 4;          // 9 days apart counts as "known"

// Russian → Armenian ('rf') is switched off for now — add it back here to
// bring back speaking practice. The data model already tracks it per word.
export const DIRECTIONS = ['fr'];

function dirDue(dir, now = Date.now()) {
  return dir.due == null || dir.due <= startOfDay(now) + DAY - 1;
}

/** Records one answer for one direction: 'knew' | 'almost' | 'unknown'. Mutates the word. */
export function applyAnswer(word, kind, answer, now = Date.now()) {
  const dir = word.dirs[kind];
  dir.reps++;
  word.checks++;
  word.introduced = true;
  word.lastPracticed = now;

  if (answer === 'unknown') {
    dir.step = 0;
    dir.lapses++;
    dir.wrong = true;
    word.mistakes++;
    dir.due = now;                                  // comes back straight away
  } else if (answer === 'almost') {
    dir.step = Math.max(0, dir.step - 1);
    dir.wrong = true;
    word.mistakes++;
    dir.due = now + STEP_DAYS[dir.step] * DAY;
  } else {
    dir.step = Math.min(dir.step + 1, STEP_DAYS.length - 1);
    dir.wrong = false;
    dir.due = now + STEP_DAYS[dir.step] * DAY;
  }

  refreshStatus(word);
  word.updatedAt = now;
}

export function markIntroduced(word, now = Date.now()) {
  word.introViews++;
  if (!word.introduced) {
    word.introduced = true;
    word.updatedAt = now;
    refreshStatus(word);
  }
}

export function refreshStatus(word) {
  if (!word.introduced) { word.status = 'new'; return; }
  const bothLearned = DIRECTIONS.every((k) => word.dirs[k].step >= LEARNED_STEP);
  word.status = bothLearned ? 'learned' : 'learning';
}

/** Manual override: "Mark as learned" — pushes both directions past the bar. */
export function markLearned(word, now = Date.now()) {
  word.introduced = true;
  for (const k of DIRECTIONS) {
    const dir = word.dirs[k];
    dir.step = Math.max(dir.step, LEARNED_STEP);
    dir.wrong = false;
    dir.due = now + STEP_DAYS[dir.step] * DAY;
  }
  refreshStatus(word);
  word.updatedAt = now;
}

/** Manual override: "Learn again" — both directions back into rotation from scratch. */
export function learnAgain(word, now = Date.now()) {
  word.introduced = true;
  for (const k of DIRECTIONS) {
    const dir = word.dirs[k];
    dir.step = 0;
    dir.wrong = false;
    dir.due = now;
  }
  refreshStatus(word);
  word.updatedAt = now;
}

/** Earliest of the two directions' next review; null means "due now". */
export function nextDue(word) {
  const dues = DIRECTIONS.map((k) => word.dirs[k].due);
  if (dues.some((d) => d == null)) return null;
  return Math.min(...dues);
}

/* --- building queues -------------------------------------------- */

/**
 * Today's session: everything due in either direction, recent mistakes
 * first, plus a few new words. Returns { intro: Word[], cards: Card[] }.
 */
export function buildToday(now = Date.now()) {
  const { newPerDay, dailyTarget } = store.settings;

  const due = [];
  for (const w of store.words) {
    if (!w.introduced) continue;
    for (const k of DIRECTIONS) {
      const dir = w.dirs[k];
      if (dirDue(dir, now)) due.push({ wordId: w.id, kind: k, wrong: dir.wrong, due: dir.due ?? 0 });
    }
  }
  due.sort((a, b) => Number(b.wrong) - Number(a.wrong) || a.due - b.due);

  const intro = store.words
    .filter((w) => w.status === 'new')
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, newPerDay);

  return { intro, cards: due.slice(0, dailyTarget).map(({ wordId, kind }) => ({ wordId, kind })) };
}

/** Counts for the Today screen. */
export function todayPlan(now = Date.now()) {
  const { intro, cards } = buildToday(now);
  return { intro, cards, reviews: cards.length, newCount: intro.length, words: cards.length + intro.length };
}

/** Exam practice: one card per word, a random direction, score at the end. */
export function buildExam(words) {
  const cards = words.map((w) => ({
    wordId: w.id,
    kind: DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)],
  }));
  return { intro: [], cards: shuffle(cards) };
}

export function mistakeCards(words = store.words) {
  const cards = [];
  for (const w of words) for (const k of DIRECTIONS) if (w.dirs[k].wrong) cards.push({ wordId: w.id, kind: k });
  return cards;
}

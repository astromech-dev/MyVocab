// Learning model: New → Learning → Learned. No dates the user has to obey —
// Learning is one continuous shuffled rotation (Knew pushes a card further
// back, Didn't know brings it back sooner). "Learned" needs a successful
// recall on 3 separate calendar days, spanning at least 3 days total, so a
// burst of quick answers in one sitting can't fake it.
//
// Exam is separate: a one-shot, multiple-choice check over words already
// marked Learned. Getting one wrong immediately demotes it back to Learning
// — Exam is the only thing that can un-learn a word.

import { shuffle, dayKey } from './dom.js';
import { store } from './store.js';

const DAY = 86400000;
export const LEVELS_TO_LEARN = 3;
const MIN_AGE_DAYS = 3;

// Russian → Armenian ('rf') is switched off for now — add it back here to
// bring back speaking practice. The data model already tracks it per word.
export const DIRECTIONS = ['fr'];

/** Records one answer for one direction: 'knew' | 'unknown'. Mutates the word. */
export function applyAnswer(word, kind, answer, now = Date.now()) {
  const dir = word.dirs[kind];
  dir.reps++;
  word.checks++;
  word.lastPracticed = now;

  if (answer === 'unknown') {
    dir.level = Math.max(0, dir.level - 1);
    word.mistakes++;
  } else {
    const today = dayKey(now);
    if (dir.lastLevelUpDay !== today) {
      dir.level = Math.min(LEVELS_TO_LEARN, dir.level + 1);
      dir.lastLevelUpDay = today;
    }
  }

  refreshStatus(word, now);
  word.updatedAt = now;
}

export function markIntroduced(word, now = Date.now()) {
  word.introViews++;
  if (!word.introduced) {
    word.introduced = true;
    word.learningStartedAt = now;
    word.updatedAt = now;
    refreshStatus(word, now);
  }
}

export function refreshStatus(word, now = Date.now()) {
  if (!word.introduced) { word.status = 'new'; return; }
  const learned = DIRECTIONS.every((k) => word.dirs[k].level >= LEVELS_TO_LEARN)
    && word.learningStartedAt && (now - word.learningStartedAt) >= MIN_AGE_DAYS * DAY;
  word.status = learned ? 'learned' : 'learning';
}

/** Manual override: "Mark as learned" — skips the day/age gates. */
export function markLearned(word, now = Date.now()) {
  word.introduced = true;
  if (!word.learningStartedAt) word.learningStartedAt = now;
  for (const k of DIRECTIONS) {
    word.dirs[k].level = LEVELS_TO_LEARN;
    word.dirs[k].lastLevelUpDay = dayKey(now);
  }
  word.status = 'learned';
  word.updatedAt = now;
}

/** Manual override, and what an Exam miss does: back to Learning from scratch. */
export function learnAgain(word, now = Date.now()) {
  word.introduced = true;
  for (const k of DIRECTIONS) {
    word.dirs[k].level = 0;
    word.dirs[k].lastLevelUpDay = null;
  }
  word.status = 'learning';
  word.updatedAt = now;
}

/* --- picking words ------------------------------------------------- */

/**
 * Oldest-added New words first (so nothing sits forever), but shuffled
 * before showing — otherwise a batch is just one lesson read top to bottom.
 */
export function pickNewWords(count, deckId = store.activeDeckId) {
  const oldest = store.words
    .filter((w) => w.deckId === deckId && w.status === 'new')
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, count);
  return shuffle(oldest);
}

export function learningPool(deckId = store.activeDeckId) {
  return store.words.filter((w) => w.deckId === deckId && w.status === 'learning');
}

/* --- exam: multiple choice ------------------------------------------ */

/**
 * One question per word: the term, plus 3 wrong translations pulled from
 * other words in the same deck (length-similar where possible, so the
 * answer isn't obvious just from how long it is), all 4 shuffled.
 */
export function buildExamQuestions(words, deckId) {
  return shuffle(words.map((w) => {
    const correct = w.translation;
    const candidates = [...new Set(
      store.words
        .filter((o) => o.deckId === deckId && o.id !== w.id && o.translation && o.translation !== correct)
        .map((o) => o.translation)
    )];
    const distractors = pickDistractors(candidates, correct, 3);
    const options = shuffle([correct, ...distractors]);
    return { wordId: w.id, options, correctIndex: options.indexOf(correct) };
  }));
}

function pickDistractors(candidates, correct, n) {
  const byCloseness = candidates
    .map((t) => ({ t, diff: Math.abs(t.length - correct.length) }))
    .sort((a, b) => a.diff - b.diff)
    .slice(0, Math.max(n * 3, 8))
    .map((c) => c.t);
  return shuffle(byCloseness).slice(0, n);
}

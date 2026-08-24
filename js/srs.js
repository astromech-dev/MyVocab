// Learning model: New → Learning → Learned, in three day-stages of shrinking
// size — 3 successful Knews, then 2, then 1, each stage's quota completed on
// its own calendar day. Hit today's quota and the word drops out of Practice
// until a new day, so a burst of quick answers in one sitting can't fake
// "Learned" — only correct recall on 3 separate days can.
//
// A miss costs more the further along the word is: on the 3-rep stage it
// just keeps circulating; on the 2-rep stage the stage restarts from zero;
// on the 1-rep stage the word is pushed back a whole stage.
//
// Exam is separate: a one-shot, multiple-choice check over words already
// marked Learned. Getting one wrong immediately demotes it back to Learning
// — Exam is the only thing that can un-learn a word.

import { shuffle, dayKey } from './dom.js';
import { store } from './store.js';

// Successes needed per day-stage: 3 on the word's first day in Learning, 2
// the next day it's practiced, 1 the day after that — then it's Learned.
export const STAGE_REQS = [3, 2, 1];

// Russian → Armenian ('rf') is switched off for now — add it back here to
// bring back speaking practice. The data model already tracks it per word.
export const DIRECTIONS = ['fr'];

/**
 * Records one answer for one direction: 'knew' | 'unknown'. Mutates the word
 * and returns what happened to it: 'learned' (just finished the last stage),
 * 'day-complete' (finished today's quota, more stages remain), or 'continue'
 * (still mid-stage — keep it circulating).
 */
export function applyAnswer(word, kind, answer, now = Date.now()) {
  const dir = word.dirs[kind];
  dir.reps++;
  word.checks++;
  word.lastPracticed = now;
  const today = dayKey(now);
  let outcome = 'continue';

  if (answer === 'unknown') {
    word.mistakes++;
    if (dir.level === STAGE_REQS.length - 1) {
      // Miss on the last stage: not Learned yet, back a whole stage.
      dir.level = Math.max(0, dir.level - 1);
      dir.stageReps = 0;
      dir.stageRepsDay = null;
    } else if (dir.level > 0) {
      // Miss mid-way through: redo this stage's quota from scratch.
      dir.stageReps = 0;
      dir.stageRepsDay = null;
    }
    // Miss on the very first stage: no penalty beyond not counting — the
    // word just keeps circulating today.
  } else {
    if (dir.stageRepsDay !== today) { dir.stageReps = 0; dir.stageRepsDay = today; }
    dir.stageReps++;
    if (dir.stageReps >= STAGE_REQS[dir.level]) {
      dir.level++;
      dir.dayDoneOn = today;
      dir.stageReps = 0;
      dir.stageRepsDay = null;
      outcome = dir.level >= STAGE_REQS.length ? 'learned' : 'day-complete';
    }
  }

  refreshStatus(word, now);
  word.updatedAt = now;
  return outcome;
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
  const learned = DIRECTIONS.every((k) => word.dirs[k].level >= STAGE_REQS.length);
  word.status = learned ? 'learned' : 'learning';
}

/** Manual override: "Mark as learned" — skips the day-stage gates. */
export function markLearned(word, now = Date.now()) {
  word.introduced = true;
  if (!word.learningStartedAt) word.learningStartedAt = now;
  for (const k of DIRECTIONS) {
    const dir = word.dirs[k];
    dir.level = STAGE_REQS.length;
    dir.stageReps = 0;
    dir.stageRepsDay = null;
    dir.dayDoneOn = null;
  }
  word.status = 'learned';
  word.updatedAt = now;
}

/** Manual override, and what an Exam miss does: back to Learning from scratch. */
export function learnAgain(word, now = Date.now()) {
  word.introduced = true;
  for (const k of DIRECTIONS) {
    const dir = word.dirs[k];
    dir.level = 0;
    dir.stageReps = 0;
    dir.stageRepsDay = null;
    dir.dayDoneOn = null;
  }
  word.status = 'learning';
  word.updatedAt = now;
}

/* --- picking words ------------------------------------------------- */

/**
 * Oldest-added New words first (so nothing sits forever), but shuffled
 * before showing — otherwise a batch is just one lesson read top to bottom.
 * Pass `lesson` to restrict the batch to one lesson (from `newWordLessons`).
 */
export function pickNewWords(count, deckId = store.activeDeckId, lesson = null) {
  const oldest = store.words
    .filter((w) => w.deckId === deckId && w.status === 'new' && (!lesson || w.lesson === lesson))
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, count);
  return shuffle(oldest);
}

/** Learning words still eligible for Practice today — i.e. not already at
 * today's per-stage quota. A word that hit its quota reappears once the
 * calendar day turns over, not before. Pass `lesson` to restrict to one
 * lesson (from `learningPoolLessons`). */
export function learningPool(deckId = store.activeDeckId, now = Date.now(), lesson = null) {
  const today = dayKey(now);
  return store.words.filter((w) => w.deckId === deckId && w.status === 'learning'
    && DIRECTIONS.some((k) => w.dirs[k].dayDoneOn !== today)
    && (!lesson || w.lesson === lesson));
}

function namedLessons(words) {
  const names = new Set(words.filter((w) => w.lesson).map((w) => w.lesson));
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Named lessons represented among this deck's New words — for the
 * lesson-pick step before Learn. Empty/single means "skip the step". */
export function newWordLessons(deckId = store.activeDeckId) {
  return namedLessons(store.words.filter((w) => w.deckId === deckId && w.status === 'new'));
}

/** Named lessons represented in today's learning pool — for the lesson-pick
 * step before Practice. Empty/single means "skip the step". */
export function learningPoolLessons(deckId = store.activeDeckId, now = Date.now()) {
  return namedLessons(learningPool(deckId, now));
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

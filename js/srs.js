// Learning model: New → Learning → Learned.
//
// A word graduates to Learned once it has been recalled correctly on
// LEARNED_DAYS separate calendar days. Spacing is what builds memory, so only
// the *first* correct answer of each day counts toward that total — extra
// correct answers the same day are reinforcement, not progress. The day
// counter never resets: a skipped day just leaves it where it was, so a big
// backlog still drains one day at a time instead of stalling.
//
// Within a day a word is drilled up to REINFORCE_PER_DAY times — the first
// correct answer moves the counter, the rest reinforce — and then it drops
// out of Practice until the next calendar day. A miss hands back one of
// today's correct answers, and if today had already been counted it
// un-counts it; both floored at zero, so a bad run can't spiral.
//
// Exam is separate: a one-shot, multiple-choice check over words already
// marked Learned. Getting one wrong immediately demotes it back to Learning
// — Exam is the only thing that can un-learn a word.

import { shuffle, dayKey } from './dom.js';
import { store } from './store.js';

// Separate calendar days of correct recall a word needs before it's Learned.
export const LEARNED_DAYS = 4;

// Correct answers per day that retire a word from Practice for that day. The
// first one advances LEARNED_DAYS progress; the rest are reinforcement.
export const REINFORCE_PER_DAY = 2;

// Russian → Armenian ('rf') is switched off for now — add it back here to
// bring back speaking practice. The data model already tracks it per word.
export const DIRECTIONS = ['fr'];

/**
 * Records one answer for one direction: 'knew' | 'unknown'. Mutates the word
 * and returns what happened to it: 'learned' (hit LEARNED_DAYS — graduated),
 * 'day-complete' (hit today's reinforcement quota — done until tomorrow), or
 * 'continue' (still in play — keep it circulating this session).
 */
export function applyAnswer(word, kind, answer, now = Date.now()) {
  const dir = word.dirs[kind];
  dir.reps++;
  word.checks++;
  word.lastPracticed = now;
  const today = dayKey(now);
  let outcome = 'continue';

  if (dir.repsTodayDay !== today) { dir.repsToday = 0; dir.repsTodayDay = today; }

  if (answer === 'unknown') {
    word.mistakes++;
    // Hand back one of today's correct answers, and if today had already
    // counted toward LEARNED_DAYS, un-count it — both floored at zero, so a
    // run of misses can't push progress negative or loop the word forever.
    dir.repsToday = Math.max(0, dir.repsToday - 1);
    if (dir.lastGoodDay === today) {
      dir.lastGoodDay = null;
      dir.goodDays = Math.max(0, dir.goodDays - 1);
    }
  } else {
    dir.repsToday++;
    // Only the first correct answer of a calendar day is progress.
    if (dir.lastGoodDay !== today) {
      dir.goodDays++;
      dir.lastGoodDay = today;
    }
    if (dir.goodDays >= LEARNED_DAYS) {
      outcome = 'learned';
    } else if (dir.repsToday >= REINFORCE_PER_DAY) {
      dir.dayDoneOn = today;
      outcome = 'day-complete';
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
  // Never demote here — only Exam (via learnAgain) un-learns a word, and it
  // sets the status itself. This also keeps words learned under the old
  // 2-stage model from being knocked back when LEARNED_DAYS is larger.
  if (word.status === 'learned') return;
  const learned = DIRECTIONS.every((k) => word.dirs[k].goodDays >= LEARNED_DAYS);
  word.status = learned ? 'learned' : 'learning';
}

/** Manual override: "Mark as learned" — skips the day counter. */
export function markLearned(word, now = Date.now()) {
  word.introduced = true;
  if (!word.learningStartedAt) word.learningStartedAt = now;
  for (const k of DIRECTIONS) {
    const dir = word.dirs[k];
    dir.goodDays = LEARNED_DAYS;
    dir.lastGoodDay = null;
    dir.repsToday = 0;
    dir.repsTodayDay = null;
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
    dir.goodDays = 0;
    dir.lastGoodDay = null;
    dir.repsToday = 0;
    dir.repsTodayDay = null;
    dir.dayDoneOn = null;
  }
  word.status = 'learning';
  word.updatedAt = now;
}

/* --- picking words ------------------------------------------------- */

/**
 * Turns a `lessons` argument — `null` (all), a single lesson name, or an
 * array of names — into a `word => boolean` predicate. An empty array also
 * means "all", so a picker that clears its selection doesn't filter to
 * nothing.
 */
function lessonFilter(lessons) {
  if (!lessons) return () => true;
  const set = Array.isArray(lessons) ? new Set(lessons) : new Set([lessons]);
  if (!set.size) return () => true;
  return (w) => set.has(w.lesson);
}

/**
 * Oldest-added New words first (so nothing sits forever), but shuffled
 * before showing — otherwise a batch is just one lesson read top to bottom.
 * Pass `lessons` to restrict the batch to one lesson name or an array of
 * them (from `newWordLessons`).
 */
export function pickNewWords(count, deckId = store.activeDeckId, lessons = null) {
  const inLesson = lessonFilter(lessons);
  const oldest = store.words
    .filter((w) => w.deckId === deckId && w.status === 'new' && inLesson(w))
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, count);
  return shuffle(oldest);
}

/** Learning words still eligible for Practice today — i.e. not already at
 * today's REINFORCE_PER_DAY quota. A word that hit its quota reappears once
 * the calendar day turns over, not before. Pass `lessons` to restrict to one
 * lesson name or an array of them (from `learningPoolLessons`). */
export function learningPool(deckId = store.activeDeckId, now = Date.now(), lessons = null) {
  const today = dayKey(now);
  const inLesson = lessonFilter(lessons);
  return store.words.filter((w) => w.deckId === deckId && w.status === 'learning'
    && DIRECTIONS.some((k) => w.dirs[k].dayDoneOn !== today)
    && inLesson(w));
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

/** This deck's Learned words — the exam's word source. Pass `lessons` (a
 * name, an array, or null for all) to restrict which lessons it draws from. */
export function learnedWords(deckId = store.activeDeckId, lessons = null) {
  const inLesson = lessonFilter(lessons);
  return store.words.filter((w) => w.deckId === deckId && w.status === 'learned' && inLesson(w));
}

/** Named lessons represented among this deck's Learned words — for the
 * lesson-pick step before the exam. Empty/single means "skip the step". */
export function learnedLessons(deckId = store.activeDeckId) {
  return namedLessons(learnedWords(deckId));
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

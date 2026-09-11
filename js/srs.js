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
// Words that keep slipping get drilled harder rather than quarantined: each
// direction carries a rolling `misses` balance (+1 on a miss, -1 on any
// correct answer, clamped to 0..MISS_CAP). At HARD_AT the word counts as
// hard — it leads the session queue, owes an extra reinforcement rep that
// day, and halves its review gap (that last one is measurably close to
// inert; see the gap note in study.js). The balance answers "is this word
// failing me *now*", not "did I ever miss it", so a word redeems itself by
// being recalled and the label comes off on its own.
//
// Exam is separate: a one-shot flashcard check over words already marked
// Learned, run in either direction. Missing one in the forward direction
// (term → translation) immediately demotes it back to Learning — that is the
// only thing that can un-learn a word. The reverse direction is untrained
// (see DIRECTIONS) so its exam never demotes; it just reports.

import { shuffle, dayKey } from './dom.js';
import { store } from './store.js';

// Separate calendar days of correct recall a word needs before it's Learned.
export const LEARNED_DAYS = 4;

// Correct answers per day that retire a word from Practice for that day. The
// first one advances LEARNED_DAYS progress; the rest are reinforcement.
export const REINFORCE_PER_DAY = 2;

// Rolling miss balance at which a word counts as hard, and the ceiling that
// balance can reach — capped so a bad run can't build a debt that takes a
// week of correct answers to pay off.
export const HARD_AT = 3;
export const MISS_CAP = 5;

// Reinforcement reps a hard word owes for the day instead of REINFORCE_PER_DAY.
const HARD_REINFORCE_PER_DAY = 3;

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

  if (dir.repsTodayDay !== today) { dir.repsToday = 0; dir.repsTodayDay = today; dir.targetToday = 0; }

  // The day's dose is latched, and only ever ratchets up. Deriving it fresh
  // after each answer made the hard word's extra rep unreachable: the miss
  // balance decays *before* the quota check, so a word sitting exactly on
  // HARD_AT loses the label on its own first correct answer and then owes
  // the ordinary two. Measured on a 5-hard/25-normal pool, every hard word
  // still finished in 2 reps. Ratcheting also covers the other direction —
  // a word missed into hardness mid-day picks up the extra rep from its
  // next answer instead of having to wait for tomorrow.
  dir.targetToday = Math.max(dir.targetToday || 0, reinforceTarget(word));

  if (answer === 'unknown') {
    word.mistakes++;
    dir.misses = Math.min(MISS_CAP, dir.misses + 1);
    // Hand back one of today's correct answers, and if today had already
    // counted toward LEARNED_DAYS, un-count it — both floored at zero, so a
    // run of misses can't push progress negative or loop the word forever.
    dir.repsToday = Math.max(0, dir.repsToday - 1);
    if (dir.lastGoodDay === today) {
      dir.lastGoodDay = null;
      dir.goodDays = Math.max(0, dir.goodDays - 1);
    }
  } else {
    // Any correct answer pays down the miss balance — a reinforcement rep is
    // evidence of recall too, not just the day's first hit. Paying it down
    // can drop the word out of "hard" immediately, but today's quota is
    // already latched above, so the dose it owes doesn't shrink underneath it.
    dir.misses = Math.max(0, dir.misses - 1);
    dir.repsToday++;
    // Only the first correct answer of a calendar day is progress.
    if (dir.lastGoodDay !== today) {
      dir.goodDays++;
      dir.lastGoodDay = today;
    }
    if (dir.goodDays >= LEARNED_DAYS) {
      outcome = 'learned';
    } else if (dir.repsToday >= dir.targetToday) {
      dir.dayDoneOn = today;
      outcome = 'day-complete';
    }
  }

  refreshStatus(word, now);
  word.updatedAt = now;
  return outcome;
}

/**
 * Is this word currently failing? Reads the rolling miss balance of the
 * directions actually being trained — a reverse-direction exam miss doesn't
 * make a word hard in Practice, which only ever drills the forward one.
 *
 * Never true for a Learned word: "hard" means "failing me *now*", and a
 * Learned word isn't in rotation to fail at. A word can graduate while still
 * carrying a balance (the last correct answer hits LEARNED_DAYS before the
 * balance reaches zero), and without this it would sit in the list wearing
 * both a "learned" and a "hard" badge. The balance is deliberately *not*
 * cleared, only ignored — if an exam demotes the word later, its history of
 * being difficult is still there.
 */
export function isHard(word) {
  if (word.status === 'learned') return false;
  return DIRECTIONS.some((k) => word.dirs[k].misses >= HARD_AT);
}

/** Reinforcement reps this word owes for the day — hard words owe one more. */
function reinforceTarget(word) {
  return isHard(word) ? HARD_REINFORCE_PER_DAY : REINFORCE_PER_DAY;
}

/**
 * One exam answer. The forward direction is the graded one: a miss demotes
 * the word, and Exam stays the only path out of Learned. A reverse-direction
 * exam tests a direction that is never trained (see DIRECTIONS), so failing
 * it would wipe out most of a deck through no fault of the learner — it only
 * records, and the caller offers "back to practice" as a choice instead.
 *
 * Deliberately does not touch `lastPracticed`: a word you just failed should
 * come up *first* in the next Practice session, and `startCarousel` puts
 * words already practiced today last.
 *
 * `lastExamAt` is stamped on *every* answer, pass or miss — tested is tested,
 * and that is what lets `examBatch` rotate through the whole vocabulary
 * instead of re-serving the same words. A forward miss needs no special case
 * because demotion already removes the word from the Learned pool until it
 * re-graduates; a reverse miss stays Learned by design, and the results
 * screen offers "back to practice" as the remedy rather than an early
 * re-test that would stall the sweep.
 */
export function applyExamAnswer(word, kind, answer, now = Date.now()) {
  const dir = word.dirs[kind];
  dir.reps++;
  word.checks++;
  dir.lastExamAt = now;
  if (answer === 'unknown') {
    word.mistakes++;
    dir.misses = Math.min(MISS_CAP, dir.misses + 1);
  } else {
    dir.examPasses++;
    dir.misses = Math.max(0, dir.misses - 1);
  }
  word.updatedAt = now;
  if (answer === 'unknown' && DIRECTIONS.includes(kind)) learnAgain(word, now);
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

/** Manual override: "Mark as learned" — skips the day counter. Clears the
 * miss balance too: you've declared this one done, so it shouldn't come back
 * flagged as hard. */
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
    dir.targetToday = 0;
    dir.misses = 0;
  }
  word.status = 'learned';
  word.updatedAt = now;
}

/** Manual override, and what a forward Exam miss does: back to Learning from
 * scratch. Keeps `misses` on purpose — a word demoted because you forgot it
 * is the definition of one that's giving you trouble. */
export function learnAgain(word, now = Date.now()) {
  word.introduced = true;
  for (const k of DIRECTIONS) {
    const dir = word.dirs[k];
    dir.goodDays = 0;
    dir.lastGoodDay = null;
    dir.repsToday = 0;
    dir.repsTodayDay = null;
    dir.dayDoneOn = null;
    dir.targetToday = 0;
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

/**
 * Cards a Practice session aims to have in rotation. When fewer than this
 * actually owe work today, the session tops itself up with words already
 * finished for today — otherwise a freshly introduced batch is the *only*
 * thing left in the pool (everything else retired at its day quota) and you
 * march through those ten words undiluted, which is exactly the complaint.
 */
export const PRACTICE_ROTATION = 20;

/**
 * Words already finished for today — filler, and nothing more. `applyAnswer`
 * finds `repsToday` already at the day's quota, so one correct answer
 * re-closes the day and the card leaves rotation, and `lastGoodDay` is
 * already today so `goodDays` cannot advance. A *miss* on one is real work
 * again: it costs today's credit like any other miss, which is honest —
 * you'd just shown you can't recall it after all.
 */
function practiceFiller(count, deckId = store.activeDeckId, now = Date.now(), lessons = null) {
  if (count <= 0) return [];
  const today = dayKey(now);
  const inLesson = lessonFilter(lessons);
  // Exact complement of learningPool's eligibility test.
  const done = store.words.filter((w) => w.deckId === deckId && w.status === 'learning'
    && DIRECTIONS.every((k) => w.dirs[k].dayDoneOn === today)
    && inLesson(w));
  return shuffle(done).slice(0, count);
}

/**
 * Everything a Practice session should show: `pool` is the words that owe
 * work today (what the overview counts), `filler` is padding that never
 * earns progress. Callers hand both to `startCarousel`.
 */
export function practiceSession(deckId = store.activeDeckId, now = Date.now(), lessons = null) {
  const pool = learningPool(deckId, now, lessons);
  // Filler follows the pool's lessons, not the whole deck. The picker is
  // skipped when only one lesson still owes work, so `lessons` arrives as
  // null — and a deck-wide filler then pads those few words with every
  // lesson already finished today, none of which the learner chose.
  const scope = lessons ?? [...new Set(pool.map((w) => w.lesson))];
  return { pool, filler: practiceFiller(PRACTICE_ROTATION - pool.length, deckId, now, scope) };
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

/** This deck's Learned words — what `examBatch` and `examStats` draw from.
 * Pass `lessons` (a name, an array, or null for all) to restrict lessons. */
function learnedWords(deckId = store.activeDeckId, lessons = null) {
  const inLesson = lessonFilter(lessons);
  return store.words.filter((w) => w.deckId === deckId && w.status === 'learned' && inLesson(w));
}

/** Named lessons represented among this deck's Learned words — for the
 * lesson-pick step before the exam. Empty/single means "skip the step". */
export function learnedLessons(deckId = store.activeDeckId) {
  return namedLessons(learnedWords(deckId));
}

// Words per exam. A whole vocabulary at once is not a harder exam, it's an
// exam that never gets taken — 218 learned words is a wall, not a session.
export const EXAM_BATCH = 20;

/**
 * One exam portion: the Learned words this direction has tested least
 * recently, never-tested ones first (`lastExamAt` unset sorts as 0). Sorted
 * for selection, then shuffled for presentation — same split as
 * `pickNewWords`, so the portion rotates through the vocabulary while the
 * cards inside it don't arrive in a predictable order.
 *
 * Deliberately *not* weighted toward words with a bad history: the job of a
 * portion is to sweep everything eventually, and picking at random (or by
 * difficulty) on 218 words leaves a long tail that never gets checked.
 */
export function examBatch(count = EXAM_BATCH, dir = DIRECTIONS[0], deckId = store.activeDeckId, lessons = null) {
  const due = learnedWords(deckId, lessons)
    .sort((a, b) => (a.dirs[dir].lastExamAt || 0) - (b.dirs[dir].lastExamAt || 0))
    .slice(0, count);
  return shuffle(due);
}

/**
 * For the direction picker: how much of this deck this direction has ever
 * checked. Shown per direction because the two are tracked separately — a
 * reverse exam must not mark a word as "recently tested" for the forward one.
 */
export function examStats(dir, deckId = store.activeDeckId) {
  const words = learnedWords(deckId);
  return { total: words.length, untested: words.filter((w) => !w.dirs[dir].lastExamAt).length };
}

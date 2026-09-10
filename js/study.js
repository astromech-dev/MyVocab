// Three ways to study, each its own thing:
//  - startIntro    — read through brand-new words, no testing.
//  - startCarousel — the Learning rotation, self-graded; Knew pushes a card
//                    further back (or clears it for the day once it's had its
//                    reinforcement rep), Didn't know brings it back sooner.
//  - startExam     — a one-shot flashcard pass over Learned words, in either
//                    direction; a miss in the graded (forward) direction
//                    demotes the word back to Learning right away.

import { esc, on, shuffle, plural, dayKey } from './dom.js';
import { getWord, touched, recordActivity, activeDeck } from './store.js';
import { applyAnswer, markIntroduced, learnAgain, applyExamAnswer, isHard, practiceSession, learningPoolLessons, examStats, EXAM_BATCH } from './srs.js';

const sheet = document.getElementById('sheet');

// The panel is reused, its contents are not: bind listeners to the fresh child
// so re-rendering never stacks duplicate handlers.
const inner = () => sheet.firstElementChild;

let session = null;
let onClose = () => {};

// How many other cards get shown before an answered card comes back, as a
// share of the words still in rotation — not a fixed count, so it doesn't
// always resurface after exactly N cards regardless of how big the pool is.
// Small pools naturally collapse to "goes to the end" either way.
//
// A card only stays in rotation when it still owes work today: either it was
// missed, or it was the day's first correct answer and still needs its
// reinforcement rep. Both should come back *within the session* — capped, so
// a 150-word pool doesn't bury the second look 100 cards deep — with a miss
// returning soonest.
//
// "Soonest" needs both a smaller ratio *and* a cap to actually hold. It used
// to have neither: `unknown` ran at a bigger ratio than `knew` with no
// ceiling, so past a ~30-word pool a card you missed came back *later* than
// one you knew (100 words: missed at +35 turns, known at +25) — the
// scheduler was quietly deprioritising exactly the words that need the work.
// Both are clamped at both ends now. The ordering holds because unknown's
// ratio is lower (0.15 vs 0.25) *and* its ceiling is lower (12 vs 35); the
// margin is tightest around a 40-word pool, where knew sits on its floor of
// 10 and unknown is at 6.
//
// Hard words (see isHard in srs.js) halve whichever gap applies. Measured,
// this does almost nothing and should not be relied on: any gap well below
// the pool's cycle length is swamped by the queue backlog, so on a 60-word
// pool hard words averaged 7.0 shows against 6.56 with the same median
// return gap of 60, and on a small pool HARD_GAP_MIN squashes it. What
// actually gives a hard word more attention is leading the session queue
// and owing an extra rep (both in srs.js) — plus the fact that you miss it,
// and a miss already returns far sooner than a correct answer. Kept because
// it's one line and harmless.
//
// Every gap is then jittered, because a *fixed* gap preserves clusters
// forever: two cards answered on consecutive turns get the same gap and come
// back on consecutive turns, all session long — which is why a freshly
// introduced batch marched through Practice in one undiluted block.
//
// The spread is deliberately wide enough that the tails of the two
// distributions can cross. Holding "a miss comes back soonest" for every
// individual *draw* would cap jitter at ±20%, and measuring that showed it
// barely mixes anything (60-word pool: cards moved 1.2 positions on average
// between rounds, 18 of 60 not at all). The property worth keeping is that
// misses come back sooner *on average* — comparing the gap drawn for one
// card against another card's is meaningless to the learner — and at ±35%
// the medians stay far apart (9 turns vs 15 on a 60-word pool).
//
// This is a due-turn scheduler, not an array-position one: each card gets a
// `dueAt` turn number, and whichever card has the lowest `dueAt` is shown
// next. Turn numbers only ever increase, so a card can't get permanently
// stuck behind others the way inserting at a fixed *array position* would —
// reinserting at a fixed offset each time re-traps the same tail of the
// queue forever once the pool size stops changing (verified: 30 words, all
// answered "knew", plateaus at 21/30 ever shown — the rest are never
// reachable again that session).
const KNEW_GAP_RATIO = 0.25;    // first correct today — comes back to confirm
const KNEW_GAP_MIN = 10;
const KNEW_GAP_MAX = 35;
const UNKNOWN_GAP_RATIO = 0.15; // didn't know — always comes back sooner
const UNKNOWN_GAP_MIN = 3;
const UNKNOWN_GAP_MAX = 12;
const HARD_GAP_MIN = 2;
const GAP_JITTER = 0.35;        // see the note above; measured, not guessed

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function reviewGap(result, poolSize, hard) {
  const base = result === 'knew'
    ? clamp(Math.round(poolSize * KNEW_GAP_RATIO), KNEW_GAP_MIN, KNEW_GAP_MAX)
    : clamp(Math.round(poolSize * UNKNOWN_GAP_RATIO), UNKNOWN_GAP_MIN, UNKNOWN_GAP_MAX);
  const scaled = hard ? Math.max(HARD_GAP_MIN, Math.round(base / 2)) : base;
  const spread = scaled * GAP_JITTER;
  // Floored at 2 so jitter can't collapse a gap to nothing. That alone does
  // not stop a card repeating back-to-back — see pickDue, which does.
  return Math.max(2, Math.round(scaled + (Math.random() * 2 - 1) * spread));
}

/**
 * Chooses the next card: soonest `dueAt`, ties broken at random — gaps are
 * whole turns so cards do land on the same one, and always taking the first
 * would quietly reintroduce a fixed order among them. Never returns the card
 * just shown unless it is the only one left: a gap only promises a card
 * won't be due for N turns, not that anything else *is* due sooner, so in a
 * short queue a card can otherwise come straight back, which teaches nothing.
 *
 * The result is stored on the session, never recomputed per render. Because
 * the tie-break is random, two calls can disagree — and rendering one card
 * while grading another would file answers against the wrong word.
 */
function pickDue(queue, justShownId) {
  const others = queue.filter((e) => e.wordId !== justShownId);
  const from = others.length ? others : queue;
  let due = [];
  let soonest = Infinity;
  for (const e of from) {
    if (e.dueAt < soonest) { soonest = e.dueAt; due = [e]; }
    else if (e.dueAt === soonest) due.push(e);
  }
  return due[Math.floor(Math.random() * due.length)];
}

/* --- entry points ---------------------------------------------------- */

/** Read-through for brand-new words. No testing — just look, then move on. */
export function startIntro(words, { onExit } = {}) {
  onClose = onExit || (() => {});
  if (!words.length) { session = { kind: 'empty', note: 'Nothing to learn yet.' }; open(); render(); return; }
  session = { kind: 'intro', words, index: 0 };
  open(); render();
}

/**
 * Weaves `extra` evenly through `main` without disturbing main's own order,
 * so the priority order still holds for the words that count and the filler
 * simply sits between them. Appending instead would defeat the point —
 * trailing filler leaves the real words in the same undiluted block.
 */
function weave(main, extra) {
  if (!extra.length) return main;
  if (!main.length) return extra;
  const out = [];
  const step = main.length / extra.length;
  let placed = 0;
  main.forEach((w, i) => {
    out.push(w);
    while (placed < extra.length && (placed + 1) * step <= i + 1) out.push(extra[placed++]);
  });
  while (placed < extra.length) out.push(extra[placed++]);
  return out;
}

/**
 * The Learning rotation: endless, self-graded, keeps going until you stop.
 *
 * Four groups, shuffled within each: hard words lead, and inside both the
 * hard and the ordinary block the words not yet practiced today come first —
 * so reopening Practice later the same day surfaces different words instead
 * of reshuffling the same full pool from scratch every time, and the words
 * that keep slipping are the ones you meet while still fresh.
 *
 * `filler` (from `practiceSession` in srs.js) is woven through that order to
 * pad a thin session; it is tracked per queue entry so the summary doesn't
 * count padding as work finished today.
 */
export function startCarousel(words, { filler = [], onExit } = {}) {
  onClose = onExit || (() => {});
  if (!words.length) { session = { kind: 'empty', note: 'No words are in Learning right now.' }; open(); render(); return; }
  const today = dayKey();
  const untouched = (w) => dayKey(w.lastPracticed || 0) !== today;
  const group = (fresh, hard) => shuffle(words.filter((w) => untouched(w) === fresh && isHard(w) === hard));
  const fillerIds = new Set(filler.map((w) => w.id));
  const ordered = weave([
    ...group(true, true), ...group(true, false),
    ...group(false, true), ...group(false, false),
  ], shuffle(filler));
  session = {
    kind: 'carousel',
    queue: ordered.map((w, i) => ({ wordId: w.id, dueAt: i, filler: fillerIds.has(w.id) })),
    turn: ordered.length,
    revealed: false,
    reviewed: 0,
    promoted: 0,
    doneToday: 0,
  };
  session.current = pickDue(session.queue, null);
  open(); render();
}

/**
 * Flashcard exam over Learned words — one pass, no re-queue. `dir` picks
 * which way round the cards run: 'fr' (word → translation) is the graded
 * check, 'rf' the untrained stress test. See applyExamAnswer in srs.js.
 */
export function startExam(words, { dir = 'fr', onExit } = {}) {
  onClose = onExit || (() => {});
  if (!words.length) { session = { kind: 'empty', note: 'No learned words to test yet.' }; open(); render(); return; }
  session = {
    kind: 'exam',
    dir,
    words: shuffle(words),
    index: 0,
    revealed: false,
    correct: 0,
    forgotten: [],
  };
  open(); render();
}

/**
 * Shown before every exam: which way round the cards run. Two taps to start
 * an exam, and the harder direction is a deliberate choice rather than
 * something that quietly eats your progress. `onChoose('fr' | 'rf')`.
 */
export function pickExamDir(onChoose, { onExit } = {}) {
  onClose = onExit || (() => {});
  session = { kind: 'dir-pick', onChoose };
  open(); render();
}

/**
 * Shown before Learn/Practice/Exam whenever the eligible words span more than
 * one named lesson — lets the caller narrow to a subset of lessons (or take
 * them all) before it fetches the actual words and starts the real session.
 * Calling code decides whether this step is needed (pass fewer than 2 lesson
 * names to skip it) and what to do with the choice: `onChoose(lessons)` gets
 * an array of the picked lesson names, or `null` for all lessons.
 */
export function pickLesson(lessonNames, onChoose, { onExit } = {}) {
  onClose = onExit || (() => {});
  // Everything is selected to begin with, so the default "just hit Start"
  // path still means "all lessons" — unchecking is how you narrow it.
  session = { kind: 'lesson-pick', lessonNames, onChoose, picked: new Set(lessonNames) };
  open(); render();
}

function open() {
  sheet.hidden = false;
  document.body.style.overflow = 'hidden';
  removeEventListener('keydown', keys);
  addEventListener('keydown', keys);
}

function close() {
  removeEventListener('keydown', keys);
  sheet.hidden = true;
  sheet.innerHTML = '';
  document.body.style.overflow = '';
  session = null;
  onClose();
}

function keys(event) {
  if (!session || event.metaKey || event.ctrlKey || event.altKey) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (event.key === 'Escape') { close(); return; }

  if (session.kind === 'intro') {
    if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); advanceIntro(); }
    return;
  }
  // Carousel and exam are the same card gesture — reveal, then grade.
  if (session.kind === 'carousel' || session.kind === 'exam') {
    if (session.done) return;
    if (!session.revealed) { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); reveal(); } return; }
    const answer = event.key === '1' ? 'unknown' : event.key === '2' ? 'knew' : null;
    if (!answer) return;
    if (session.kind === 'carousel') answerCarousel(answer); else answerExam(answer);
  }
}

function reveal() { session.revealed = true; render(); }

/* --- intro ------------------------------------------------------------ */

function advanceIntro() {
  const word = session.words[session.index];
  markIntroduced(word);
  recordActivity(word.id);
  touched();

  if (session.index < session.words.length - 1) {
    session.index++;
    render();
  } else {
    session.done = true;
    render();
  }
}

function renderIntro() {
  if (session.done) { renderIntroDone(); return; }
  const word = session.words[session.index];

  sheet.innerHTML = `<div class="study">
    ${progress(session.index + 1, session.words.length)}
    <p class="center tiny muted" style="margin-bottom:12px">New words — just read them through</p>
    <div class="flash">
      <div class="term">${esc(word.term)}</div>
      ${word.transcription ? `<div class="translit">[${esc(word.transcription)}]</div>` : ''}
      <div class="translation">${esc(word.translation)}</div>
    </div>
    <div class="answers">
      ${session.index > 0 ? '<button class="btn btn-ghost" data-act="prev">Back</button>' : ''}
      <button class="btn a-yes" data-act="next">Next</button>
    </div>
    <p class="kbd-hint">Space — next</p>
  </div>`;

  on(inner(), '[data-act="close"]', 'click', close);
  on(inner(), '[data-act="prev"]', 'click', () => { session.index--; render(); });
  on(inner(), '[data-act="next"]', 'click', advanceIntro);
}

function renderIntroDone() {
  sheet.innerHTML = `<div class="study">
    <div class="card center">
      <div class="done-mark">✓</div>
      <h2 class="h1" style="margin-top:10px">Nice work</h2>
      <p class="today-label">${plural(session.words.length, 'word', 'words')} learned</p>
    </div>
    <div class="stack" style="margin-top:16px">
      <button class="btn btn-big btn-primary" data-act="close">OK</button>
    </div>
  </div>`;
  on(inner(), '[data-act="close"]', 'click', close);
}

/* --- carousel ----------------------------------------------------------- */

function answerCarousel(result) {
  const current = session.current;
  session.queue.splice(session.queue.indexOf(current), 1);
  session.turn++;
  const word = getWord(current.wordId);
  if (word) {
    const outcome = applyAnswer(word, 'fr', result);
    recordActivity(word.id);
    touched();
    // A missed filler card is real work again — it just cost today's credit.
    if (result === 'unknown') current.filler = false;
    if (outcome === 'learned') session.promoted++;
    // Padding re-closing a day it had already closed isn't work finished.
    else if (outcome === 'day-complete') { if (!current.filler) session.doneToday++; }
    else {
      // Hardness is read *after* the answer, so a word that just paid off
      // its miss balance loses the tight gap along with the label.
      current.dueAt = session.turn + reviewGap(result, session.queue.length, isHard(word));
      session.queue.push(current);
    }
  }
  session.reviewed++;
  session.revealed = false;
  session.current = session.queue.length ? pickDue(session.queue, current.wordId) : null;
  render();
}

function renderCarousel() {
  if (!session.current) { renderCarouselDone(); return; }
  const current = session.current;
  const word = getWord(current.wordId);
  const deck = activeDeck();

  const buttons = session.revealed
    ? `<div class="answers">
         <button class="btn a-no" data-answer="unknown">Didn't know</button>
         <button class="btn a-yes" data-answer="knew">Knew</button>
       </div>
       <p class="kbd-hint">1 — didn't know · 2 — knew</p>`
    : `<div class="answers"><button class="btn a-yes" data-act="show">Show</button></div>
       <p class="kbd-hint">Space — show</p>`;

  sheet.innerHTML = `<div class="study">
    <div class="study-head">
      <button class="btn btn-quiet" data-act="close" aria-label="Stop">✕ Stop</button>
      <span class="tiny muted" style="margin-left:auto">${plural(session.queue.length, 'word', 'words')} in rotation${session.promoted ? ` · ${session.promoted} learned` : ''}${session.doneToday ? ` · ${session.doneToday} done for today` : ''}</span>
    </div>
    <div class="flash">
      <div class="prompt-kind">${esc(deck.name)}</div>
      <div class="term">${esc(word.term)}</div>
      ${session.revealed ? `
        ${word.transcription ? `<div class="translit">[${esc(word.transcription)}]</div>` : ''}
        <div class="translation">${esc(word.translation)}</div>` : ''}
    </div>
    ${buttons}
  </div>`;

  on(inner(), '[data-act="close"]', 'click', close);
  on(inner(), '[data-act="show"]', 'click', reveal);
  on(inner(), '[data-answer]', 'click', (el) => answerCarousel(el.dataset.answer));
}

function renderCarouselDone() {
  sheet.innerHTML = `<div class="study">
    <div class="card center">
      <div class="done-mark">✓</div>
      <h2 class="h1" style="margin-top:10px">Practice complete</h2>
      <p class="today-label">You've practiced everything for now.</p>
      <p class="tiny muted" style="margin-top:8px">${session.reviewed} reviewed${session.promoted ? ` · ${session.promoted} learned` : ''}${session.doneToday ? ` · ${session.doneToday} done for today` : ''}</p>
    </div>
    <div class="stack" style="margin-top:16px">
      <button class="btn btn-big btn-primary" data-act="close">Done</button>
    </div>
  </div>`;
  on(inner(), '[data-act="close"]', 'click', close);
}

/* --- exam: flashcards ------------------------------------------------ */

function answerExam(answer) {
  const word = session.words[session.index];
  recordActivity(word.id);
  applyExamAnswer(word, session.dir, answer);
  touched();

  if (answer === 'knew') session.correct++;
  else session.forgotten.push(word.id);

  if (session.index < session.words.length - 1) {
    session.index++;
    session.revealed = false;
  } else {
    session.done = true;
  }
  render();
}

function renderExam() {
  if (session.done) { renderExamDone(); return; }
  const word = session.words[session.index];
  const deck = activeDeck();
  const reverse = session.dir === 'rf';
  const translit = word.transcription ? `<div class="translit">[${esc(word.transcription)}]</div>` : '';

  // Reversed, the reveal *is* the word being learned, so it gets the same big
  // type as the prompt rather than the smaller translation size — seeing it
  // small undercuts the whole point of running the exam this way round.
  const answerSide = reverse
    ? `<div class="term">${esc(word.term)}</div>${translit}`
    : `${translit}<div class="translation">${esc(word.translation)}</div>`;

  const buttons = session.revealed
    ? `<div class="answers">
         <button class="btn a-no" data-answer="unknown">Forgot</button>
         <button class="btn a-yes" data-answer="knew">Remembered</button>
       </div>
       <p class="kbd-hint">1 — forgot · 2 — remembered</p>`
    : `<div class="answers"><button class="btn a-yes" data-act="show">Show</button></div>
       <p class="kbd-hint">Space — show</p>`;

  sheet.innerHTML = `<div class="study">
    ${progress(session.index, session.words.length)}
    <div class="flash">
      <div class="prompt-kind">${esc(deck.name)} exam</div>
      <div class="term">${esc(reverse ? word.translation : word.term)}</div>
      ${session.revealed ? answerSide : (reverse ? '<div class="say">Say the word out loud</div>' : '')}
    </div>
    ${buttons}
  </div>`;

  on(inner(), '[data-act="close"]', 'click', close);
  on(inner(), '[data-act="show"]', 'click', reveal);
  on(inner(), '[data-answer]', 'click', (el) => answerExam(el.dataset.answer));
}

function renderExamDone() {
  const total = session.words.length;
  const forgotten = session.forgotten.length;
  const pct = total ? Math.round((session.correct / total) * 100) : 0;
  const reverse = session.dir === 'rf';
  // Forward misses already went back to Learning. Reverse ones didn't — that
  // direction is never trained, so grading it would gut a deck through no
  // fault of the learner; it's offered as a choice instead.
  const stillLearned = session.forgotten.filter((id) => getWord(id)?.status === 'learned');
  const canPractice = session.forgotten.some((id) => getWord(id)?.status === 'learning');

  const note = !forgotten ? ''
    : reverse
    ? (stillLearned.length
        ? '<p class="muted small" style="margin-top:14px">Nothing was moved — this direction is not part of your progress.</p>'
        : '')
    : `<p class="muted small" style="margin-top:14px">${plural(forgotten, 'word was', 'words were')} moved back to Learning.</p>`;

  // This was a portion, so say what's left — the point of portioning is that
  // the work is finite, and a bare score doesn't show that.
  const { untested } = examStats(session.dir);
  const coverage = untested
    ? `<p class="tiny muted" style="margin-top:10px">${plural(untested, 'word', 'words')} still never checked this way round.</p>`
    : '<p class="tiny muted" style="margin-top:10px">Every learned word has now been checked this way round.</p>';

  sheet.innerHTML = `<div class="study">
    <div class="card center">
      <h2 class="h1">Exam complete</h2>
      <div class="result-num" style="margin-top:8px">${session.correct} / ${total}</div>
      <p class="today-label">${pct}% correct${reverse ? ' · translation → word' : ''}</p>
      <ul class="tally">
        <li><span>Remembered</span><b>${session.correct}</b></li>
        ${forgotten ? `<li><span>Forgotten</span><b>${forgotten}</b></li>` : ''}
      </ul>
      ${note}
      ${coverage}
    </div>
    <div class="stack" style="margin-top:16px">
      ${stillLearned.length ? `<button class="btn btn-big btn-ghost" data-act="demote">Move ${plural(stillLearned.length, 'word', 'words')} back to Learning</button>` : ''}
      ${canPractice ? '<button class="btn btn-big btn-ghost" data-act="practice">Practice words</button>' : ''}
      <button class="btn btn-big btn-primary" data-act="close">Done</button>
    </div>
  </div>`;

  on(inner(), '[data-act="close"]', 'click', close);
  on(inner(), '[data-act="demote"]', 'click', () => {
    stillLearned.forEach((id) => { const w = getWord(id); if (w) learnAgain(w); });
    touched();
    render();
  });
  on(inner(), '[data-act="practice"]', 'click', () => {
    const exit = onClose;
    close();
    const go = (lessons) => {
      const { pool, filler } = practiceSession(undefined, undefined, lessons);
      startCarousel(pool, { filler, onExit: exit });
    };
    const lessonNames = learningPoolLessons();
    if (lessonNames.length > 1) pickLesson(lessonNames, go, { onExit: exit });
    else go(null);
  });
}

/* --- shared rendering -------------------------------------------------- */

function render() {
  if (!session) return;
  if (session.kind === 'empty') {
    sheet.innerHTML = `<div class="sheet-inner">
      ${head('Nothing here yet')}
      <div class="card empty"><strong>${esc(session.note)}</strong></div>
    </div>`;
    on(inner(), '[data-act="close"]', 'click', close);
    return;
  }
  if (session.kind === 'intro') renderIntro();
  else if (session.kind === 'carousel') renderCarousel();
  else if (session.kind === 'exam') renderExam();
  else if (session.kind === 'lesson-pick') renderLessonPick();
  else if (session.kind === 'dir-pick') renderDirPick();
}

/** "40 of 218 never checked this way" — the number that makes the choice. */
function dirCoverage(dir) {
  const { total, untested } = examStats(dir);
  if (!untested) return `all ${total} checked at least once`;
  if (untested === total) return `none of the ${total} checked yet`;
  return `${untested} of ${total} never checked this way`;
}

function renderDirPick() {
  sheet.innerHTML = `<div class="sheet-inner">
    ${head('Which way round?')}
    <p class="tiny muted" style="margin:2px 0 16px">${plural(EXAM_BATCH, 'word', 'words')} per exam, least recently checked first.</p>
    <div class="stack">
      <button class="action-card" type="button" data-dir="fr">
        <div class="action-text">
          <div class="t">Word → translation</div>
          <div class="s">The usual check. A miss sends the word back to Learning.</div>
          <div class="s">${dirCoverage('fr')}</div>
        </div>
        <span class="action-go" aria-hidden="true">→</span>
      </button>
      <button class="action-card" type="button" data-dir="rf">
        <div class="action-text">
          <div class="t">Translation → word</div>
          <div class="s">Harder — recall the word yourself. Nothing is demoted.</div>
          <div class="s">${dirCoverage('rf')}</div>
        </div>
        <span class="action-go" aria-hidden="true">→</span>
      </button>
    </div>
  </div>`;

  on(inner(), '[data-act="close"]', 'click', close);
  on(inner(), '[data-dir]', 'click', (el) => session.onChoose(el.dataset.dir));
}

function renderLessonPick() {
  const { lessonNames, picked } = session;
  const all = picked.size === lessonNames.length;

  sheet.innerHTML = `<div class="sheet-inner">
    ${head('Which lessons?')}
    <p class="tiny muted" style="margin:2px 0 4px">Tick the lessons to study, then Start.</p>
    <ul class="list pick-list">
      <li><label class="word-row">
        <input type="checkbox" class="row-check" data-all ${all ? 'checked' : ''}>
        <span class="col"><span class="term">All lessons</span></span>
      </label></li>
      ${lessonNames.map((name) => `<li><label class="word-row">
        <input type="checkbox" class="row-check" data-lesson="${esc(name)}" ${picked.has(name) ? 'checked' : ''}>
        <span class="col"><span class="term">${esc(name)}</span></span>
      </label></li>`).join('')}
    </ul>
    <div class="stack" style="margin-top:20px">
      <button class="btn btn-big btn-primary" data-act="start"${picked.size ? '' : ' disabled'}>Start${picked.size && !all ? ` · ${picked.size} ${picked.size === 1 ? 'lesson' : 'lessons'}` : ''}</button>
    </div>
  </div>`;

  on(inner(), '[data-act="close"]', 'click', close);
  on(inner(), '[data-all]', 'change', () => {
    if (picked.size === lessonNames.length) picked.clear();
    else lessonNames.forEach((n) => picked.add(n));
    render();
  });
  on(inner(), '[data-lesson]', 'change', (el) => {
    const name = el.dataset.lesson;
    if (picked.has(name)) picked.delete(name); else picked.add(name);
    render();
  });
  on(inner(), '[data-act="start"]', 'click', () => {
    if (!picked.size) return;
    session.onChoose(picked.size === lessonNames.length ? null : [...picked]);
  });
}

function head(title) {
  return `<div class="sheet-head">
      <h2>${esc(title)}</h2>
      <button class="btn btn-quiet" data-act="close">Close</button>
    </div>`;
}

function progress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return `<div class="study-head">
      <button class="btn btn-quiet" data-act="close" aria-label="Close">✕</button>
      <div class="progressbar"><i style="width:${pct}%"></i></div>
      <span class="tiny muted">${done} / ${total}</span>
    </div>`;
}

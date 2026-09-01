// Three ways to study, each its own thing:
//  - startIntro    — read through brand-new words, no testing.
//  - startCarousel — the Learning rotation, self-graded; Knew pushes a card
//                    further back (or clears it for the day once it's had its
//                    reinforcement rep), Didn't know brings it back sooner.
//  - startExam     — a one-shot multiple-choice check over Learned words;
//                    a miss demotes the word back to Learning right away.

import { esc, on, shuffle, plural, dayKey } from './dom.js';
import { getWord, touched, recordActivity, activeDeck } from './store.js';
import { applyAnswer, markIntroduced, learnAgain, buildExamQuestions, learningPool, learningPoolLessons } from './srs.js';

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
const UNKNOWN_GAP_RATIO = 0.35; // didn't know — comes back sooner
const UNKNOWN_GAP_MIN = 4;

function reviewGap(result, poolSize) {
  if (result === 'knew') {
    return Math.min(KNEW_GAP_MAX, Math.max(KNEW_GAP_MIN, Math.round(poolSize * KNEW_GAP_RATIO)));
  }
  return Math.max(UNKNOWN_GAP_MIN, Math.round(poolSize * UNKNOWN_GAP_RATIO));
}

/** The queue entry that's due soonest — shown next without being removed. */
function dueCard(queue) {
  return queue.reduce((soonest, e) => (e.dueAt < soonest.dueAt ? e : soonest), queue[0]);
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
 * The Learning rotation: endless, self-graded, keeps going until you stop.
 * Words not yet practiced today go first (shuffled among themselves), words
 * already practiced today go after — so reopening Practice later the same
 * day surfaces different words instead of reshuffling the same full pool
 * from scratch every time.
 */
export function startCarousel(words, { onExit } = {}) {
  onClose = onExit || (() => {});
  if (!words.length) { session = { kind: 'empty', note: 'No words are in Learning right now.' }; open(); render(); return; }
  const today = dayKey();
  const fresh = shuffle(words.filter((w) => dayKey(w.lastPracticed || 0) !== today));
  const seenToday = shuffle(words.filter((w) => dayKey(w.lastPracticed || 0) === today));
  const ordered = [...fresh, ...seenToday];
  session = {
    kind: 'carousel',
    queue: ordered.map((w, i) => ({ wordId: w.id, dueAt: i })),
    turn: ordered.length,
    revealed: false,
    reviewed: 0,
    promoted: 0,
    doneToday: 0,
  };
  open(); render();
}

/** Multiple-choice exam over Learned words — one shot, objective. */
export function startExam(words, { onExit } = {}) {
  onClose = onExit || (() => {});
  const questions = buildExamQuestions(words, words[0]?.deckId);
  if (!questions.length) { session = { kind: 'empty', note: 'No learned words to test yet.' }; open(); render(); return; }
  session = { kind: 'exam', questions, index: 0, chosen: null, correct: 0, forgotten: [] };
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
  if (session.kind === 'carousel') {
    if (!session.revealed) { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); reveal(); } return; }
    if (event.key === '1') answerCarousel('unknown');
    if (event.key === '2') answerCarousel('knew');
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
  const current = dueCard(session.queue);
  session.queue.splice(session.queue.indexOf(current), 1);
  session.turn++;
  const word = getWord(current.wordId);
  if (word) {
    const outcome = applyAnswer(word, 'fr', result);
    recordActivity(word.id);
    touched();
    if (outcome === 'learned') session.promoted++;
    else if (outcome === 'day-complete') session.doneToday++;
    else {
      current.dueAt = session.turn + reviewGap(result, session.queue.length);
      session.queue.push(current);
    }
  }
  session.reviewed++;
  session.revealed = false;
  render();
}

function renderCarousel() {
  if (!session.queue.length) { renderCarouselDone(); return; }
  const current = dueCard(session.queue);
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

/* --- exam: multiple choice ------------------------------------------- */

function chooseOption(i) {
  if (session.chosen != null) return;
  const q = session.questions[session.index];
  const word = getWord(q.wordId);
  session.chosen = i;
  recordActivity(q.wordId);

  if (i === q.correctIndex) {
    session.correct++;
  } else {
    session.forgotten.push(q.wordId);
    if (word) { learnAgain(word); word.mistakes++; touched(); }
  }
  render();

  setTimeout(() => {
    if (!session) return; // closed mid-delay
    if (session.index < session.questions.length - 1) {
      session.index++;
      session.chosen = null;
      render();
    } else {
      session.done = true;
      render();
    }
  }, 900);
}

function renderExam() {
  if (session.done) { renderExamDone(); return; }
  const q = session.questions[session.index];
  const word = getWord(q.wordId);
  const deck = activeDeck();
  const answered = session.chosen != null;

  sheet.innerHTML = `<div class="study">
    ${progress(session.index + (answered ? 1 : 0), session.questions.length)}
    <div class="flash">
      <div class="prompt-kind">${esc(deck.name)}</div>
      <div class="term">${esc(word.term)}</div>
    </div>
    <div class="mc-options">
      ${q.options.map((opt, i) => {
        let cls = 'mc-option';
        if (answered && i === q.correctIndex) cls += ' mc-correct';
        else if (answered && i === session.chosen) cls += ' mc-wrong';
        return `<button class="${cls}" data-i="${i}" ${answered ? 'disabled' : ''}>${esc(opt)}</button>`;
      }).join('')}
    </div>
  </div>`;

  on(inner(), '[data-act="close"]', 'click', close);
  on(inner(), '[data-i]', 'click', (el) => chooseOption(Number(el.dataset.i)));
}

function renderExamDone() {
  const total = session.questions.length;
  const forgotten = session.forgotten.length;
  const pct = total ? Math.round((session.correct / total) * 100) : 0;
  const canContinue = session.forgotten.some((id) => getWord(id)?.status === 'learning');

  sheet.innerHTML = `<div class="study">
    <div class="card center">
      <h2 class="h1">Exam complete</h2>
      <div class="result-num" style="margin-top:8px">${session.correct} / ${total}</div>
      <p class="today-label">${pct}% correct</p>
      <ul class="tally">
        <li><span>Remembered</span><b>${session.correct}</b></li>
        ${forgotten ? `<li><span>Forgotten</span><b>${forgotten}</b></li>` : ''}
      </ul>
      ${forgotten ? `<p class="muted small" style="margin-top:14px">${plural(forgotten, 'word was', 'words were')} moved back to Learning.</p>` : ''}
    </div>
    <div class="stack" style="margin-top:16px">
      ${canContinue ? '<button class="btn btn-big btn-ghost" data-act="practice">Practice words</button>' : ''}
      <button class="btn btn-big btn-primary" data-act="close">Done</button>
    </div>
  </div>`;

  on(inner(), '[data-act="close"]', 'click', close);
  on(inner(), '[data-act="practice"]', 'click', () => {
    const exit = onClose;
    close();
    const lessonNames = learningPoolLessons();
    if (lessonNames.length > 1) {
      pickLesson(lessonNames, (lessons) => startCarousel(learningPool(undefined, undefined, lessons), { onExit: exit }), { onExit: exit });
    } else {
      startCarousel(learningPool(), { onExit: exit });
    }
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

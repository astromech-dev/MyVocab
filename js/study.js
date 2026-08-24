// Three ways to study, each its own thing:
//  - startIntro    — read through brand-new words, no testing.
//  - startCarousel — the endless Learning rotation, self-graded, no fixed
//                    length; Knew pushes a card further back, Didn't know
//                    brings it back sooner.
//  - startExam     — a one-shot multiple-choice check over Learned words;
//                    a miss demotes the word back to Learning right away.

import { esc, on, shuffle, plural } from './dom.js';
import { getWord, touched } from './store.js';
import { applyAnswer, markIntroduced, learnAgain, buildExamQuestions, learningPool } from './srs.js';
import { TARGET_LANGUAGE, NATIVE_LANGUAGE } from './config.js';

const sheet = document.getElementById('sheet');

// The panel is reused, its contents are not: bind listeners to the fresh child
// so re-rendering never stacks duplicate handlers.
const inner = () => sheet.firstElementChild;

let session = null;
let onClose = () => {};

const BACK_KNEW = 8;     // knew it — goes deeper into the queue
const BACK_UNKNOWN = 3;  // didn't know — comes back sooner

/* --- entry points ---------------------------------------------------- */

/** Read-through for brand-new words. No testing — just look, then move on. */
export function startIntro(words, { onExit } = {}) {
  onClose = onExit || (() => {});
  if (!words.length) { session = { kind: 'empty', note: 'Nothing to learn yet.' }; open(); render(); return; }
  session = { kind: 'intro', words, index: 0 };
  open(); render();
}

/** The Learning rotation: endless, self-graded, keeps going until you stop. */
export function startCarousel(words, { onExit } = {}) {
  onClose = onExit || (() => {});
  if (!words.length) { session = { kind: 'empty', note: 'No words are in Learning right now.' }; open(); render(); return; }
  session = { kind: 'carousel', queue: shuffle(words.map((w) => ({ wordId: w.id }))), revealed: false, reviewed: 0, promoted: 0 };
  open(); render();
}

/** Multiple-choice exam over Learned words — one shot, objective. */
export function startExam(words, { onExit } = {}) {
  onClose = onExit || (() => {});
  const questions = buildExamQuestions(words);
  if (!questions.length) { session = { kind: 'empty', note: 'No learned words to test yet.' }; open(); render(); return; }
  session = { kind: 'exam', questions, index: 0, chosen: null, correct: 0, forgotten: [] };
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
  touched();

  if (session.index < session.words.length - 1) {
    session.index++;
    render();
  } else {
    startCarousel(session.words.map((w) => getWord(w.id)).filter(Boolean), { onExit: onClose });
  }
}

function renderIntro() {
  const word = session.words[session.index];
  const isLast = session.index === session.words.length - 1;

  sheet.innerHTML = `<div class="study">
    ${progress(session.index + 1, session.words.length)}
    <p class="center tiny muted" style="margin-bottom:12px">New words — just read them through</p>
    <div class="flash">
      <div class="term">${esc(word.term)}</div>
      ${word.transcription ? `<div class="translit">${esc(word.transcription)}</div>` : ''}
      <hr>
      <div class="translation">${esc(word.translation)}</div>
      ${lessonTag(word)}
    </div>
    <div class="answers">
      ${session.index > 0 ? '<button class="btn btn-ghost" data-act="prev">Back</button>' : ''}
      <button class="btn a-yes" data-act="next">${isLast ? 'Start checking' : 'Next'}</button>
    </div>
    ${isLast ? '<div class="study-foot"><button class="btn btn-quiet" data-act="later">Later</button></div>' : ''}
    <p class="kbd-hint">Space — next</p>
  </div>`;

  on(inner(), '[data-act="close"]', 'click', close);
  on(inner(), '[data-act="prev"]', 'click', () => { session.index--; render(); });
  on(inner(), '[data-act="next"]', 'click', advanceIntro);
  on(inner(), '[data-act="later"]', 'click', () => {
    markIntroduced(word);
    touched();
    close();
  });
}

/* --- carousel ----------------------------------------------------------- */

function answerCarousel(result) {
  const current = session.queue.shift();
  const word = getWord(current.wordId);
  if (word) {
    applyAnswer(word, 'fr', result);
    touched();
    if (word.status === 'learned') session.promoted++;
    else session.queue.splice(Math.min(session.queue.length, result === 'knew' ? BACK_KNEW : BACK_UNKNOWN), 0, current);
  }
  session.reviewed++;
  session.revealed = false;
  render();
}

function renderCarousel() {
  if (!session.queue.length) { renderCarouselDone(); return; }
  const current = session.queue[0];
  const word = getWord(current.wordId);

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
      <span class="tiny muted" style="margin-left:auto">${plural(session.queue.length, 'word', 'words')} in rotation${session.promoted ? ` · ${session.promoted} learned` : ''}</span>
    </div>
    <div class="flash">
      <div class="prompt-kind">${esc(TARGET_LANGUAGE)} → ${esc(NATIVE_LANGUAGE)}</div>
      <div class="term">${esc(word.term)}</div>
      ${session.revealed ? `<hr>
        ${word.transcription ? `<div class="translit">${esc(word.transcription)}</div>` : ''}
        <div class="translation">${esc(word.translation)}</div>
        ${lessonTag(word)}` : ''}
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
      <h2 class="h1" style="margin-top:10px">All caught up</h2>
      <p class="today-label">${session.reviewed} reviewed${session.promoted ? ` · ${session.promoted} learned` : ''}</p>
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
  const answered = session.chosen != null;

  sheet.innerHTML = `<div class="study">
    ${progress(session.index + (answered ? 1 : 0), session.questions.length)}
    <div class="flash">
      <div class="prompt-kind">${esc(TARGET_LANGUAGE)} → ${esc(NATIVE_LANGUAGE)}</div>
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
      ${canContinue ? '<button class="btn btn-big btn-ghost" data-act="continue">Continue learning</button>' : ''}
      <button class="btn btn-big btn-primary" data-act="close">Done</button>
    </div>
  </div>`;

  on(inner(), '[data-act="close"]', 'click', close);
  on(inner(), '[data-act="continue"]', 'click', () => {
    const exit = onClose;
    close();
    startCarousel(learningPool(), { onExit: exit });
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

function lessonTag(word) {
  return word.lesson ? `<div class="lesson-tag">${esc(word.lesson)}</div>` : '';
}

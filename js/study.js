// The study session: introduction cards first, then flashcards, then results.
// Every mode in the app (Today, Practice, Exam) runs through here.

import { esc, on, shuffle } from './dom.js';
import { getWord, touched, recordSession } from './store.js';
import { applyAnswer, markIntroduced } from './srs.js';
import { TARGET_LANGUAGE, NATIVE_LANGUAGE } from './config.js';

const sheet = document.getElementById('sheet');

// The panel is reused, its contents are not: bind listeners to the fresh child
// so re-rendering never stacks duplicate handlers.
const inner = () => sheet.firstElementChild;
let session = null;
let onClose = () => {};

/**
 * startSession({ title, mode, intro: Word[], cards: Card[], exam?: bool, onExit? })
 * Card = { wordId, kind: 'fr' | 'rf' }
 */
export function startSession(options) {
  const intro = (options.intro || []).filter(Boolean);
  const cards = (options.cards || []).filter((c) => getWord(c.wordId));

  if (!intro.length && !cards.length) {
    onClose = options.onExit || onClose;
    session = { ...options, intro, cards, empty: true };
    open();
    render();
    return;
  }

  session = {
    title: options.title || 'Practice',
    mode: options.mode || 'practice',
    exam: Boolean(options.exam),
    intro,
    cards,
    phase: intro.length ? 'intro' : 'cards',
    introIndex: 0,
    cardIndex: 0,
    revealed: false,
    counts: { knew: 0, almost: 0, unknown: 0 },
    missed: [],
    recorded: false,
  };
  onClose = options.onExit || (() => {});
  open();
  render();
}

function open() {
  sheet.hidden = false;
  document.body.style.overflow = 'hidden';
  removeEventListener('keydown', keys);   // a chained session must not double-bind
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
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault();
    if (session.phase === 'intro') nextIntro();
    else if (session.phase === 'cards' && !session.revealed) reveal();
    return;
  }
  if (session.phase !== 'cards' || !session.revealed) return;
  const kind = session.cards[session.cardIndex].kind;
  if (event.key === '1') answer('unknown');
  if (event.key === '2') answer(kind === 'rf' ? 'almost' : 'knew');
  if (event.key === '3' && kind === 'rf') answer('knew');
}

/* --- actions ---------------------------------------------------- */

function reveal() { session.revealed = true; render(); }

function nextIntro() {
  const word = session.intro[session.introIndex];
  if (word) { markIntroduced(word); touched(); }
  if (session.introIndex < session.intro.length - 1) {
    session.introIndex++;
  } else if (session.cards.length) {
    session.phase = 'cards';
  } else {
    finish();
    return;
  }
  render();
}

function answer(result) {
  const current = session.cards[session.cardIndex];
  const word = getWord(current.wordId);
  if (word) {
    applyAnswer(word, current.kind, result);
    touched();
  }
  session.counts[result]++;
  if (result !== 'knew') session.missed.push(current);

  if (session.cardIndex < session.cards.length - 1) {
    session.cardIndex++;
    session.revealed = false;
    render();
  } else {
    finish();
  }
}

function finish() {
  session.phase = 'done';
  if (!session.recorded) {
    session.recorded = true;
    const total = session.counts.knew + session.counts.almost + session.counts.unknown;
    if (total > 0) {
      recordSession({ mode: session.mode, title: session.title, counts: session.counts });
    }
  }
  render();
}

function practiceMissed() {
  const cards = shuffle([...session.missed]);
  startSession({
    title: 'Mistakes',
    mode: 'mistakes',
    cards,
    onExit: onClose,
  });
}

/* --- rendering -------------------------------------------------- */

function render() {
  if (!session) return;

  if (session.empty) {
    sheet.hidden = false;
    sheet.innerHTML = `<div class="sheet-inner">
      ${head('Nothing to practice')}
      <div class="card empty"><strong>Nothing here yet</strong>
        Add some words first, or pick another practice mode.</div>
    </div>`;
    on(inner(), '[data-act="close"]', 'click', close);
    return;
  }

  if (session.phase === 'intro') renderIntro();
  else if (session.phase === 'cards') renderCard();
  else renderDone();
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

function renderIntro() {
  const word = session.intro[session.introIndex];
  const isLast = session.introIndex === session.intro.length - 1;
  const nextLabel = isLast ? (session.cards.length ? 'Start practice' : 'Done') : 'Next';

  sheet.innerHTML = `<div class="study">
    ${progress(session.introIndex + 1, session.intro.length)}
    <p class="center tiny muted" style="margin-bottom:12px">New words — just read them through</p>
    <div class="flash">
      <div class="term">${esc(word.term)}</div>
      ${word.transcription ? `<div class="translit">${esc(word.transcription)}</div>` : ''}
      <hr>
      <div class="translation">${esc(word.translation)}</div>
      ${lessonTag(word)}
    </div>
    <div class="answers">
      ${session.introIndex > 0 ? '<button class="btn btn-ghost" data-act="prev">Back</button>' : ''}
      <button class="btn a-yes" data-act="next">${nextLabel}</button>
    </div>
    ${isLast ? '<div class="study-foot"><button class="btn btn-quiet" data-act="again">Show these again</button></div>' : ''}
    <p class="kbd-hint">Space — next</p>
  </div>`;

  on(inner(), '[data-act="close"]', 'click', close);
  on(inner(), '[data-act="next"]', 'click', nextIntro);
  on(inner(), '[data-act="prev"]', 'click', () => { session.introIndex--; render(); });
  on(inner(), '[data-act="again"]', 'click', () => { session.introIndex = 0; render(); });
}

function renderCard() {
  const current = session.cards[session.cardIndex];
  const word = getWord(current.wordId);
  const rf = current.kind === 'rf';

  const front = rf
    ? `<div class="prompt-kind">${esc(NATIVE_LANGUAGE)} → ${esc(TARGET_LANGUAGE)}</div>
       <div class="term">${esc(word.translation)}</div>
       <div class="say">Say it in ${esc(TARGET_LANGUAGE)}</div>`
    : `<div class="prompt-kind">${esc(TARGET_LANGUAGE)} → ${esc(NATIVE_LANGUAGE)}</div>
       <div class="term">${esc(word.term)}</div>`;

  const back = rf
    ? `<hr>
       <div class="term" style="font-size:clamp(26px,6vw,38px)">${esc(word.term)}</div>
       ${word.transcription ? `<div class="translit">${esc(word.transcription)}</div>` : ''}
       ${lessonTag(word)}`
    : `<hr>
       ${word.transcription ? `<div class="translit">${esc(word.transcription)}</div>` : ''}
       <div class="translation">${esc(word.translation)}</div>
       ${lessonTag(word)}`;

  const buttons = session.revealed
    ? `<div class="answers">
         <button class="btn a-no" data-answer="unknown">Didn't know</button>
         ${rf ? '<button class="btn a-almost" data-answer="almost">Almost</button>' : ''}
         <button class="btn a-yes" data-answer="knew">Knew</button>
       </div>
       <p class="kbd-hint">1 — didn't know${rf ? ' · 2 — almost · 3 — knew' : ' · 2 — knew'}</p>`
    : `<div class="answers"><button class="btn a-yes" data-act="show">Show</button></div>
       <p class="kbd-hint">Space — show</p>`;

  sheet.innerHTML = `<div class="study">
    ${progress(session.cardIndex + (session.revealed ? 1 : 0), session.cards.length)}
    <div class="flash">${front}${session.revealed ? back : ''}</div>
    ${buttons}
  </div>`;

  on(inner(), '[data-act="close"]', 'click', close);
  on(inner(), '[data-act="show"]', 'click', reveal);
  on(inner(), '[data-answer]', 'click', (el) => answer(el.dataset.answer));
}

function renderDone() {
  const { knew, almost, unknown } = session.counts;
  const total = knew + almost + unknown;
  const missedWords = new Set(session.missed.map((c) => c.wordId)).size;

  const body = session.exam
    ? `<div class="card center">
         <div class="result-num">${knew} / ${total}</div>
         <p class="today-label">${total ? Math.round((knew / total) * 100) : 0}% correct</p>
         ${missedWords ? `<p class="muted small" style="margin-top:14px">${missedWords} word${missedWords === 1 ? '' : 's'} to practice</p>` : ''}
       </div>`
    : `<div class="card center">
         <div class="done-mark">✓</div>
         <h2 class="h1" style="margin-top:10px">Session complete</h2>
         <p class="today-label">${total} word${total === 1 ? '' : 's'} practiced</p>
         <ul class="tally">
           <li><span>Knew</span><b>${knew}</b></li>
           ${almost ? `<li><span>Almost</span><b>${almost}</b></li>` : ''}
           ${unknown ? `<li><span>Didn't know</span><b>${unknown}</b></li>` : ''}
         </ul>
       </div>`;

  sheet.innerHTML = `<div class="study">
    ${body}
    <div class="stack" style="margin-top:16px">
      ${session.missed.length ? '<button class="btn btn-big btn-ghost" data-act="redo">Practice mistakes</button>' : ''}
      <button class="btn btn-big btn-primary" data-act="close">Done</button>
    </div>
  </div>`;

  on(inner(), '[data-act="close"]', 'click', close);
  on(inner(), '[data-act="redo"]', 'click', practiceMissed);
}

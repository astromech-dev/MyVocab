// The vocabulary switcher — lives in the header, outside the main screen, so
// it renders itself and needs its own call to refresh (see app.js).

import { esc, on } from './dom.js';
import { decks, activeDeck, setActiveDeck, addDeck, updateDeck } from './store.js';
import { deckFields, wireDeckFields } from './deckform.js';
import { guessLang } from './languages.js';

const sheet = document.getElementById('sheet');
const bar = document.getElementById('deckbar');

const NEW_DECK = '__new-deck__';
const EDIT_DECK = '__edit-deck__';

export function renderDeckBar(onChange) {
  const list = decks();
  const active = activeDeck();

  // Before any deck exists, Overview itself is the onboarding flow —
  // nothing for this bar to show yet.
  if (!list.length) {
    bar.innerHTML = '';
    return;
  }

  bar.innerHTML = `
    <span class="deckbar-label">Your vocabularies</span>
    <select class="deck-select" id="deck-select" aria-label="Your vocabularies">
      ${list.map((d) => `<option value="${esc(d.id)}" ${d.id === active?.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}
      <option value="${NEW_DECK}">+ New vocabulary</option>
      <option value="${EDIT_DECK}">Edit “${esc(active?.name ?? '')}”…</option>
    </select>
  `;

  const select = bar.querySelector('#deck-select');
  select.addEventListener('change', (e) => {
    if (e.target.value === NEW_DECK || e.target.value === EDIT_DECK) {
      const pick = e.target.value;
      select.value = active?.id ?? '';
      if (pick === NEW_DECK) openNewDeck(onChange);
      else openEditDeck(onChange);
      return;
    }
    setActiveDeck(e.target.value);
    onChange();
  });
}

function openSheet(title, body, submitLabel) {
  sheet.hidden = false;
  document.body.style.overflow = 'hidden';
  sheet.innerHTML = `<div class="sheet-inner">
    <div class="sheet-head">
      <h2>${title}</h2>
      <button class="btn btn-quiet" data-act="cancel">Cancel</button>
    </div>
    ${body}
    <div class="sheet-foot">
      <button class="btn btn-big btn-primary" data-act="submit">${submitLabel}</button>
    </div>
  </div>`;
  const inner = sheet.firstElementChild;
  const close = () => { sheet.hidden = true; sheet.innerHTML = ''; document.body.style.overflow = ''; };
  on(inner, '[data-act="cancel"]', 'click', close);
  return { inner, close };
}

/** New vocabulary sheet, for adding another vocabulary once at least one already exists. */
export function openNewDeck(onChange) {
  const { inner, close } = openSheet('New vocabulary', deckFields(), 'Create');
  const read = wireDeckFields(inner);
  on(inner, '[data-act="submit"]', 'click', () => {
    const fields = read();
    if (!fields) return;
    addDeck(fields);
    close();
    onChange();
  });
  inner.querySelector('#f-lang').focus();
}

/** Rename the active vocabulary or set its language pair. A deck from before
 * languages existed gets its language guessed from the name as a starting
 * point ("Armenian" → Armenian) — nothing is saved until you confirm. */
export function openEditDeck(onChange) {
  const deck = activeDeck();
  if (!deck) return;
  const lang = deck.lang ?? guessLang(deck.name);
  const { inner, close } = openSheet('Edit vocabulary', deckFields(deck, { lang }), 'Save');
  const read = wireDeckFields(inner, deck);
  on(inner, '[data-act="submit"]', 'click', () => {
    const fields = read();
    if (!fields) return;
    updateDeck(deck.id, fields);
    close();
    onChange();
  });
}

// The vocabulary switcher — lives in the header, outside the main screen, so
// it renders itself and needs its own call to refresh (see app.js).

import { esc, on, toast } from './dom.js';
import { decks, activeDeck, setActiveDeck, addDeck } from './store.js';

const sheet = document.getElementById('sheet');
const bar = document.getElementById('deckbar');

const NEW_DECK = '__new-deck__';

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
    </select>
  `;

  const select = bar.querySelector('#deck-select');
  select.addEventListener('change', (e) => {
    if (e.target.value === NEW_DECK) {
      select.value = active?.id ?? '';
      openNewDeck(onChange);
      return;
    }
    setActiveDeck(e.target.value);
    onChange();
  });
}

/** New vocabulary sheet, for adding another vocabulary once at least one already exists. */
export function openNewDeck(onChange) {
  sheet.hidden = false;
  document.body.style.overflow = 'hidden';

  sheet.innerHTML = `<div class="sheet-inner">
    <div class="sheet-head">
      <h2>New vocabulary</h2>
      <button class="btn btn-quiet" data-act="cancel">Cancel</button>
    </div>
    <label class="field"><span>Vocabulary name</span>
      <input class="input" id="f-name" placeholder="e.g. Italian" autocomplete="off"></label>
    <div class="sheet-foot">
      <button class="btn btn-big btn-primary" data-act="create">Create</button>
    </div>
  </div>`;

  const inner = sheet.firstElementChild;
  const close = () => { sheet.hidden = true; sheet.innerHTML = ''; document.body.style.overflow = ''; };

  on(inner, '[data-act="cancel"]', 'click', close);
  on(inner, '[data-act="create"]', 'click', () => {
    const name = sheet.querySelector('#f-name').value.trim();
    if (!name) { toast('Name your vocabulary'); return; }
    addDeck(name);
    close();
    onChange();
  });
  sheet.querySelector('#f-name').focus();
}

// The language switcher — lives in the header, outside the main screen, so
// it renders itself and needs its own call to refresh (see app.js).

import { esc, on, toast } from './dom.js';
import { decks, activeDeck, setActiveDeck, addDeck } from './store.js';

const sheet = document.getElementById('sheet');
const bar = document.getElementById('deckbar');

export function renderDeckBar(onChange) {
  const list = decks();
  const active = activeDeck();

  // Before any deck exists, Overview itself is the "create your first
  // dictionary" step — nothing for this bar to show yet.
  if (!list.length) {
    bar.innerHTML = '';
    return;
  }

  bar.innerHTML = `
    <select class="deck-select" id="deck-select" aria-label="Language">
      ${list.map((d) => `<option value="${esc(d.id)}" ${d.id === active?.id ? 'selected' : ''}>${esc(d.target)}</option>`).join('')}
    </select>
    <button class="btn btn-quiet deck-add" data-act="new-deck" aria-label="Add a language">+</button>
  `;

  bar.querySelector('#deck-select').addEventListener('change', (e) => {
    setActiveDeck(e.target.value);
    onChange();
  });
  on(bar, '[data-act="new-deck"]', 'click', () => openNewDeck(onChange));
}

/** New language pair sheet, for adding a language once at least one already exists. */
export function openNewDeck(onChange) {
  sheet.hidden = false;
  document.body.style.overflow = 'hidden';

  sheet.innerHTML = `<div class="sheet-inner">
    <div class="sheet-head">
      <h2>New language</h2>
      <button class="btn btn-quiet" data-act="cancel">Cancel</button>
    </div>
    <label class="field"><span>What are you learning?</span>
      <input class="input" id="f-target" placeholder="e.g. English" autocomplete="off"></label>
    <label class="field"><span>Translate into</span>
      <input class="input" id="f-native" placeholder="e.g. Russian" autocomplete="off"></label>
    <div class="sheet-foot">
      <button class="btn btn-big btn-primary" data-act="create">Create</button>
    </div>
  </div>`;

  const inner = sheet.firstElementChild;
  const close = () => { sheet.hidden = true; sheet.innerHTML = ''; document.body.style.overflow = ''; };

  on(inner, '[data-act="cancel"]', 'click', close);
  on(inner, '[data-act="create"]', 'click', () => {
    const target = sheet.querySelector('#f-target').value.trim();
    const native = sheet.querySelector('#f-native').value.trim();
    if (!target || !native) { toast('Fill in both languages'); return; }
    addDeck(target, native);
    close();
    onChange();
  });
  sheet.querySelector('#f-target').focus();
}

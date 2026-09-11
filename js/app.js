// Start-up. One page (Overview) plus Words and Statistics, reached by links, not tabs.

import { on } from './dom.js';
import { load, activeDeck } from './store.js';
import { renderDeckBar } from './deckbar.js';
import { renderOverview } from './screens/overview.js';
import { renderWords } from './screens/words.js';
import { renderStats } from './screens/stats.js';
import { openAddWords } from './screens/addwords.js';

let screen = document.getElementById('screen');
let view = 'overview';
const addWordsBtn = document.querySelector('[data-open="add"]');

function render() {
  renderDeckBar(render);   // outside #screen, so it needs its own refresh call
  // Nothing to add words to until a vocabulary (deck) exists — creating one
  // is step one, so this shortcut stays hidden until then.
  addWordsBtn.hidden = !activeDeck();

  // Swap in a fresh container: delegated listeners die with the old one.
  const fresh = document.createElement('main');
  fresh.id = 'screen';
  fresh.className = 'screen';
  fresh.setAttribute('aria-live', 'polite');
  screen.replaceWith(fresh);
  screen = fresh;

  const home = () => { view = 'overview'; render(); };
  if (view === 'words') renderWords(screen, render, home);
  else if (view === 'stats') renderStats(screen, render, home);
  else renderOverview(screen, render, () => { view = 'words'; render(); }, () => { view = 'stats'; render(); });
}

load();
render();

on(document, '[data-open="add"]', 'click', () => openAddWords(render));

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then((reg) => reg.update())
      .catch((err) => console.warn('MyVocab: offline mode unavailable', err));
  });
  // A newly activated worker takes over mid-session (skipWaiting +
  // clients.claim) — reload so the page picks up the new assets right away.
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
}

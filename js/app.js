// Start-up. One page (Overview) plus Words, reached by a link, not a tab.

import { on } from './dom.js';
import { load } from './store.js';
import { renderOverview } from './screens/overview.js';
import { renderWords } from './screens/words.js';
import { openAddWords } from './screens/addwords.js';

let screen = document.getElementById('screen');
let view = 'overview';

function render() {
  // Swap in a fresh container: delegated listeners die with the old one.
  const fresh = document.createElement('main');
  fresh.id = 'screen';
  fresh.className = 'screen';
  fresh.setAttribute('aria-live', 'polite');
  screen.replaceWith(fresh);
  screen = fresh;

  if (view === 'words') renderWords(screen, render, () => { view = 'overview'; render(); });
  else renderOverview(screen, render, () => { view = 'words'; render(); });
}

load();
render();

on(document, '[data-open="add"]', 'click', () => openAddWords(render));

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('MyVocab: offline mode unavailable', err));
  });
}

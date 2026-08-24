// Router and start-up. Four screens, hash based, no dependencies.

import { on } from './dom.js';
import { load } from './store.js';
import { renderToday } from './screens/today.js';
import { renderWords } from './screens/words.js';
import { renderPractice } from './screens/practice.js';
import { renderProgress } from './screens/progress.js';
import { openAddWords } from './screens/addwords.js';

const routes = {
  today: renderToday,
  words: renderWords,
  practice: renderPractice,
  progress: renderProgress,
};

let screen = document.getElementById('screen');

function currentRoute() {
  const name = location.hash.replace(/^#\/?/, '').split(/[?/]/)[0];
  return routes[name] ? name : 'today';
}

function render() {
  const name = currentRoute();

  // Swap in a fresh container: delegated listeners die with the old one.
  const fresh = document.createElement('main');
  fresh.id = 'screen';
  fresh.className = 'screen';
  fresh.setAttribute('aria-live', 'polite');
  screen.replaceWith(fresh);
  screen = fresh;

  document.querySelectorAll('.nav a').forEach((a) => {
    if (a.dataset.route === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  routes[name](screen, render);
}

load();
render();

addEventListener('hashchange', () => { render(); scrollTo(0, 0); });
on(document, '[data-open="add"]', 'click', () => openAddWords(render));

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('MyVocab: offline mode unavailable', err));
  });
}

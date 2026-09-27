// First-run flow, shown while no vocabulary exists yet: a short welcome step
// explaining the product, then naming the first vocabulary. See the
// activeDeck() check in overview.js, the only caller.

import { on, toast, plural } from '../dom.js';
import { addDeck, importBackup } from '../store.js';
import { deckFields, wireDeckFields } from '../deckform.js';

let step = 'welcome'; // 'welcome' | 'create'

function renderWelcome(root, rerender) {
  root.innerHTML = `<div class="card empty">
    <h1 class="h1">Learn the words that matter to you.</h1>
    <p class="small ink-2" style="max-width:36ch;margin:16px auto 0">
      Build your own vocabulary from the words and phrases you actually want to
      learn. Add new material, practice it until it sticks, and keep track of
      what you've learned.
    </p>
    <p class="small ink-2" style="max-width:36ch;margin:12px auto 0">
      Create separate vocabularies for different languages or learning goals.
      Each one keeps its own words, lessons and progress.
    </p>
    <div class="stack" style="max-width:280px;margin:26px auto 0">
      <button class="btn btn-big btn-primary" data-act="start">Get started</button>
    </div>
    <p class="small ink-2" style="margin-top:18px">Already have a vocabulary on another device? <button class="btn btn-link btn-inline" data-act="restore">Restore from backup</button></p>
    <input type="file" id="restore-file" accept="application/json,.json" hidden>
  </div>`;

  on(root, '[data-act="start"]', 'click', () => { step = 'create'; rerender(); });
  on(root, '[data-act="restore"]', 'click', () => root.querySelector('#restore-file').click());
  root.querySelector('#restore-file').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const n = importBackup(await file.text());
      toast(`${plural(n, 'word', 'words')} restored`);
      rerender();
    } catch (err) {
      alert(`Could not restore this backup.\n\n${err.message}`);
    }
    event.target.value = '';
  });
}

function renderCreate(root, rerender) {
  root.innerHTML = `<div class="card empty">
    <strong>Create your first vocabulary</strong>
    <p class="small ink-2" style="max-width:32ch;margin:8px auto 22px">
      Pick the language you're learning and the one you'll learn it in. You can
      create more vocabularies later, each with its own words and progress.
    </p>
    <div style="max-width:320px;margin:0 auto;text-align:left">
      ${deckFields()}
    </div>
    <button class="btn btn-primary" style="margin-top:20px" data-act="create">Create vocabulary</button>
  </div>`;

  const read = wireDeckFields(root);
  const create = () => {
    const fields = read();
    if (!fields) return;
    addDeck(fields);
    step = 'welcome';
    rerender();
  };
  on(root, '[data-act="create"]', 'click', create);
  root.querySelector('#f-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
  root.querySelector('#f-lang').focus();
}

export function renderOnboarding(root, rerender) {
  if (step === 'create') renderCreate(root, rerender);
  else renderWelcome(root, rerender);
}

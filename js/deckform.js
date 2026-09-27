// The three vocabulary fields — language you learn, language you learn it
// in, name — shared by onboarding, "+ New vocabulary" and "Edit
// vocabulary". The name follows the learned language ("Learning Turkish") until you
// type your own, then it's left alone.

import { esc, on, qs, toast } from './dom.js';
import { LANGUAGES, isKnownLang, langName } from './languages.js';

const OTHER = '__other__';

/** "Learning Turkish" — the name a vocabulary gets until you type your own. */
function defaultName(lang) {
  const name = langName(lang);
  return name ? `Learning ${name}` : '';
}

function langField(id, label, value) {
  const custom = value && !isKnownLang(value);
  return `<label class="field"><span>${label}</span>
    <select class="input" id="${id}">
      <option value="" ${value ? '' : 'selected'} disabled>Choose a language</option>
      ${LANGUAGES.map((l) => `<option value="${l.code}" ${l.code === value ? 'selected' : ''}>${esc(l.name)}${l.self !== l.name ? ` · ${esc(l.self)}` : ''}</option>`).join('')}
      <option value="${OTHER}" ${custom ? 'selected' : ''}>Other…</option>
    </select>
    <input class="input" id="${id}-other" placeholder="Language name" autocomplete="off"
      value="${esc(custom ? value : '')}" ${custom ? '' : 'hidden'} style="margin-top:8px">
  </label>`;
}

/** Form markup. `deck` prefills it (edit); omit it for a new vocabulary. */
export function deckFields(deck = null, { lang = deck?.lang ?? null } = {}) {
  return `${langField('f-lang', 'Which language are you learning?', lang)}
    ${langField('f-via', 'Which language are you learning it in?', deck?.via ?? null)}
    <label class="field"><span>Vocabulary name</span>
      <input class="input" id="f-name" placeholder="e.g. Learning English" autocomplete="off"
        value="${esc(deck?.name ?? defaultName(lang))}"></label>
    <p class="hint">Translations will be in the second language. Ready-made packs are matched to this pair.</p>`;
}

/**
 * Wires the fields inside `root` and returns `read()`, which yields
 * `{ lang, via, name }` or null (after a toast) if something's missing.
 */
export function wireDeckFields(root, deck = null) {
  const nameInput = qs(root, '#f-name');
  // An existing name counts as typed — editing a deck's language shouldn't
  // silently rename it.
  let nameTouched = Boolean(deck);
  nameInput.addEventListener('input', () => { nameTouched = nameInput.value.trim() !== ''; });

  const value = (id) => {
    const picked = qs(root, `#${id}`).value;
    return picked === OTHER ? qs(root, `#${id}-other`).value.trim() : picked;
  };

  for (const id of ['f-lang', 'f-via']) {
    on(root, `#${id}`, 'change', (el) => {
      const other = qs(root, `#${id}-other`);
      other.hidden = el.value !== OTHER;
      if (!other.hidden) other.focus();
      if (id === 'f-lang' && !nameTouched) nameInput.value = defaultName(value('f-lang'));
    });
  }
  on(root, '#f-lang-other', 'input', () => {
    if (!nameTouched) nameInput.value = defaultName(value('f-lang'));
  });

  return () => {
    const lang = value('f-lang');
    const via = value('f-via');
    const name = nameInput.value.trim() || defaultName(lang);
    if (!lang) { toast('Choose the language you are learning'); return null; }
    if (!via) { toast('Choose the language of the translations'); return null; }
    if (lang.toLowerCase() === via.toLowerCase()) { toast('Pick two different languages'); return null; }
    return { lang, via, name };
  };
}

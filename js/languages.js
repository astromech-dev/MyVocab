// Languages a vocabulary can be about. A deck stores two of these as ISO
// 639-1 codes: `lang` (what you're learning) and `via` (what the
// translations are written in) — so an Armenian can learn Turkish through
// English. Packs are matched on that exact pair (see js/packs.js).
//
// Anything not in the list is stored as its free-text name instead of a
// code ("Other…" in the picker). It displays fine, it just never matches a
// pack. Kept in alphabetical order (by English name) — that's the order the
// picker shows.

export const LANGUAGES = [
  { code: 'ar', name: 'Arabic', self: 'العربية' },
  { code: 'hy', name: 'Armenian', self: 'Հայերեն' },
  { code: 'zh', name: 'Chinese', self: '中文' },
  { code: 'cs', name: 'Czech', self: 'Čeština' },
  { code: 'nl', name: 'Dutch', self: 'Nederlands' },
  { code: 'en', name: 'English', self: 'English' },
  { code: 'fi', name: 'Finnish', self: 'Suomi' },
  { code: 'fr', name: 'French', self: 'Français' },
  { code: 'ka', name: 'Georgian', self: 'ქართული' },
  { code: 'de', name: 'German', self: 'Deutsch' },
  { code: 'el', name: 'Greek', self: 'Ελληνικά' },
  { code: 'he', name: 'Hebrew', self: 'עברית' },
  { code: 'hi', name: 'Hindi', self: 'हिन्दी' },
  { code: 'id', name: 'Indonesian', self: 'Bahasa Indonesia' },
  { code: 'it', name: 'Italian', self: 'Italiano' },
  { code: 'ja', name: 'Japanese', self: '日本語' },
  { code: 'ko', name: 'Korean', self: '한국어' },
  { code: 'fa', name: 'Persian', self: 'فارسی' },
  { code: 'pl', name: 'Polish', self: 'Polski' },
  { code: 'pt', name: 'Portuguese', self: 'Português' },
  { code: 'ru', name: 'Russian', self: 'Русский' },
  { code: 'sr', name: 'Serbian', self: 'Српски' },
  { code: 'es', name: 'Spanish', self: 'Español' },
  { code: 'sv', name: 'Swedish', self: 'Svenska' },
  { code: 'th', name: 'Thai', self: 'ไทย' },
  { code: 'tr', name: 'Turkish', self: 'Türkçe' },
  { code: 'uk', name: 'Ukrainian', self: 'Українська' },
  { code: 'vi', name: 'Vietnamese', self: 'Tiếng Việt' },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export function isKnownLang(value) { return BY_CODE.has(value); }

/** Display name for a stored `lang`/`via` value: the list name for a code,
 * the value itself for a free-text "Other" entry, '' when unset. */
export function langName(value) {
  if (!value) return '';
  return BY_CODE.get(value)?.name ?? value;
}

/** Best-effort code for a free-text name ("armenian", "Հայերեն", "hy") —
 * used to prefill the picker for decks created before languages existed. */
export function guessLang(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  const hit = LANGUAGES.find((l) => l.code === t || l.name.toLowerCase() === t || l.self.toLowerCase() === t)
    || LANGUAGES.find((l) => t.includes(l.name.toLowerCase()));
  return hit?.code ?? null;
}

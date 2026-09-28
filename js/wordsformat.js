// Shared parsing for the pasted word list, used by the in-app "+ Add words"
// sheet and by the seeded lesson lists.
//
// mode "columns" (default): one entry per line, fields in the order
//   term / translation / pronunciation. Field separators accepted:
//   "|", a tab, ";", a run of 2+ spaces, or a spaced dash (- – —) — so a list
//   copied from a table, a doc, or a chat usually parses without hand-editing.
//
//   Text with a tab in it is a copy from Excel / Google Sheets / Numbers and
//   is read as a table instead (see parseTable/tableToWords): one cell per
//   column, empty cells keep their place, quoted cells may hold line breaks,
//   and a header row ("Word", "Перевод", …) is skipped and used to find the
//   columns.
//
// mode "rows2" / "rows3": each entry spans 2 or 3 consecutive non-blank lines
//   (term, then translation, then pronunciation). A blank line ends the current
//   entry early. For lists pasted with every field on its own line.
//
// mode "auto": pick one of the above from the text itself (detectMode), so
//   the "+ Add words" sheet needs no "how is your list laid out?" question.

const FIELD_SEP = /\s*\|\s*|\t+|\s*;\s*|\s{2,}|\s+[-–—]\s+/;

export function parseWordLines(text, mode = 'columns') {
  if (mode === 'auto') mode = detectMode(text);
  const lines = String(text).split(/\r?\n/);

  if (mode === 'rows2' || mode === 'rows3') {
    const size = mode === 'rows2' ? 2 : 3;
    const out = [];
    let group = [];
    const flush = () => { if (group.length) { out.push(rowFrom(group)); group = []; } };
    for (const line of lines) {
      const raw = line.trim();
      if (!raw) { flush(); continue; }
      group.push(raw);
      if (group.length === size) flush();
    }
    flush();
    return out.filter((row) => row.term);
  }

  if (String(text).includes('\t')) return tableToWords(parseTable(text, '\t'));

  return lines.map((line) => {
    const raw = line.trim();
    if (!raw) return null;
    return rowFrom(raw.split(FIELD_SEP));
  }).filter((row) => row && row.term);
}

const PRON = /^(\[.*\]|\/.*\/)$/;

/** Guesses the layout of a pasted list:
 *  - a tab, or separators on at least half the lines → "columns";
 *  - blank lines between short blocks → "rows3" (a 2-line block still ends
 *    at its blank line, so this covers word+translation blocks too);
 *  - one unbroken run where every third line is [ipa] or /ipa/ → "rows3";
 *  - otherwise alternating lines → "rows2". */
export function detectMode(text) {
  const src = String(text);
  if (src.includes('\t')) return 'columns';
  const lines = src.split(/\r?\n/).map((l) => l.trim());
  const filled = lines.filter(Boolean);
  if (filled.length < 2) return 'columns';
  const split = filled.filter((l) => l.split(FIELD_SEP).length > 1).length;
  if (split * 2 >= filled.length) return 'columns';

  const blocks = src.trim().split(/\r?\n\s*\r?\n/).map((b) => b.split(/\r?\n/).filter((l) => l.trim()).length);
  if (blocks.length > 1 && Math.max(...blocks) <= 3) return 'rows3';
  if (filled.length % 3 === 0 && filled.every((l, i) => i % 3 !== 2 || PRON.test(l))) return 'rows3';
  return 'rows2';
}

function rowFrom(parts) {
  return {
    term: (parts[0] || '').trim(),
    translation: (parts[1] || '').trim(),
    transcription: (parts[2] || '').trim(),
  };
}

/* --- spreadsheets ------------------------------------------------ */

/** Splits delimited text into rows of cells, the way spreadsheets write it:
 * a cell wrapped in double quotes may contain the delimiter, line breaks and
 * doubled "" quotes. Used for pasted tabs and for .csv/.tsv files. */
export function parseTable(text, delim) {
  const src = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let atStart = true; // quotes only open a cell at its very start
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
      continue;
    }
    if (ch === '"' && atStart) { quoted = true; atStart = false; continue; }
    if (ch === delim) { row.push(cell); cell = ''; atStart = true; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = ''; atStart = true;
      continue;
    }
    cell += ch;
    atStart = false;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Picks the CSV delimiter from the first line: Excel writes ";" in locales
 * where "," is the decimal mark (Russian among them). */
export function guessDelimiter(text) {
  const first = String(text).split(/\r?\n/, 1)[0] || '';
  let best = ',';
  let bestN = 0;
  for (const d of ['\t', ';', ',']) {
    const n = first.split(d).length - 1;
    if (n > bestN) { best = d; bestN = n; }
  }
  return best;
}

const HEADERS = {
  term: ['word', 'words', 'term', 'phrase', 'expression', 'слово', 'слова', 'фраза', 'выражение', 'термин'],
  translation: ['translation', 'meaning', 'definition', 'перевод', 'значение'],
  transcription: ['pronunciation', 'transcription', 'reading', 'произношение', 'транскрипция', 'чтение'],
};

function headerRole(cell) {
  const key = cell.trim().toLowerCase().replace(/[:.]$/, '');
  return Object.keys(HEADERS).find((role) => HEADERS[role].includes(key)) || null;
}

/** Rows of cells → word entries. Columns that are empty all the way down are
 * dropped first (a selection that started one column early). If the first
 * row names the columns, those names decide which is which and the row is
 * not a word; otherwise the order is term / translation / pronunciation. */
export function tableToWords(table) {
  const clean = table
    .map((r) => r.map((c) => String(c ?? '').replace(/\s+/g, ' ').trim()))
    .filter((r) => r.some(Boolean));
  if (!clean.length) return [];

  const width = Math.max(...clean.map((r) => r.length));
  const cols = [];
  for (let c = 0; c < width; c++) if (clean.some((r) => r[c])) cols.push(c);
  const rows = clean.map((r) => cols.map((c) => r[c] || ''));

  const roles = rows[0].map(headerRole);
  let pos = { term: 0, translation: 1, transcription: 2 };
  let body = rows;
  if (roles.some(Boolean)) {
    body = rows.slice(1);
    pos = {
      term: roles.indexOf('term'),
      translation: roles.indexOf('translation'),
      transcription: roles.indexOf('transcription'),
    };
    // A header that only names the translation ("", "Перевод") still means
    // the word is the first column nobody else claimed.
    if (pos.term < 0) pos.term = roles.findIndex((r) => !r);
  }
  const at = (r, i) => (i >= 0 ? r[i] || '' : '');
  return body
    .map((r) => ({
      term: at(r, pos.term),
      translation: at(r, pos.translation),
      transcription: at(r, pos.transcription),
    }))
    .filter((row) => row.term);
}

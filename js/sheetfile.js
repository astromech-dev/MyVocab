// Reads a spreadsheet file picked in "+ Add words" into rows of cells.
// .csv / .tsv / .txt are text; .xlsx is a zip of XML, unpacked here with the
// browser's own DecompressionStream so no library ships with the app. Only
// the first sheet is read. Old binary .xls is not supported — the caller
// asks for it to be saved as .xlsx or .csv instead.

import { parseTable, guessDelimiter } from './wordsformat.js';

export async function readSheetFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) return readXlsx(await file.arrayBuffer());
  if (name.endsWith('.xls')) throw new Error('xls');
  const text = await file.text();
  return parseTable(text, name.endsWith('.tsv') ? '\t' : guessDelimiter(text));
}

/* --- zip --------------------------------------------------------- */

async function unzip(buf) {
  const view = new DataView(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = new Map();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    files.set(name, { method, size, local });
    p += 46 + nameLen + extraLen + commentLen;
  }

  return async (name) => {
    const f = files.get(name);
    if (!f) return null;
    const start = f.local + 30 + view.getUint16(f.local + 26, true) + view.getUint16(f.local + 28, true);
    const data = new Uint8Array(buf, start, f.size);
    if (f.method === 0) return dec.decode(data);
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).text();
  };
}

/* --- xlsx -------------------------------------------------------- */

const xml = (text) => new DOMParser().parseFromString(text, 'application/xml');
const all = (node, tag) => Array.from(node.getElementsByTagNameNS('*', tag));

async function readXlsx(buf) {
  const read = await unzip(buf);

  // Text cells point into one shared list. A rich-text entry is several <t>
  // runs; <rPh> holds phonetic hints (Japanese furigana) that aren't the text.
  const shared = [];
  const sst = await read('xl/sharedStrings.xml');
  if (sst) {
    for (const si of all(xml(sst), 'si')) {
      shared.push(all(si, 't').filter((t) => t.parentNode.localName !== 'rPh')
        .map((t) => t.textContent).join(''));
    }
  }

  const sheet = await read(await firstSheetPath(read));
  if (!sheet) throw new Error('no sheet');

  const rows = [];
  for (const row of all(xml(sheet), 'row')) {
    const cells = [];
    for (const c of all(row, 'c')) {
      const col = colIndex(c.getAttribute('r')) ?? cells.length;
      const type = c.getAttribute('t');
      const v = all(c, 'v')[0]?.textContent ?? '';
      let value;
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = all(c, 't').map((t) => t.textContent).join('');
      else value = v;
      cells[col] = value;
    }
    const r = Number(row.getAttribute('r')) - 1;
    rows[Number.isInteger(r) && r >= 0 ? r : rows.length] = Array.from(cells, (x) => x ?? '');
  }
  return Array.from(rows, (r) => r || []);
}

/** The first tab in the workbook — not necessarily sheet1.xml once tabs
 * have been reordered. */
async function firstSheetPath(read) {
  const fallback = 'xl/worksheets/sheet1.xml';
  const wb = await read('xl/workbook.xml');
  const rels = await read('xl/_rels/workbook.xml.rels');
  if (!wb || !rels) return fallback;
  const first = all(xml(wb), 'sheet')[0];
  const id = first && Array.from(first.attributes).find((a) => a.localName === 'id')?.value;
  const rel = all(xml(rels), 'Relationship').find((r) => r.getAttribute('Id') === id);
  const target = rel?.getAttribute('Target');
  if (!target) return fallback;
  return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
}

function colIndex(ref) {
  const m = /^([A-Z]+)/.exec(ref || '');
  if (!m) return null;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

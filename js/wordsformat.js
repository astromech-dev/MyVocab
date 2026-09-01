// Shared parsing for the pasted word list, used by the in-app "+ Add words"
// sheet and by the seeded lesson lists.
//
// mode "columns" (default): one entry per line, fields in the order
//   term / translation / pronunciation. Field separators accepted:
//   "|", a tab, ";", a run of 2+ spaces, or a spaced dash (- – —) — so a list
//   copied from a table, a doc, or a chat usually parses without hand-editing.
//
// mode "rows2" / "rows3": each entry spans 2 or 3 consecutive non-blank lines
//   (term, then translation, then pronunciation). A blank line ends the current
//   entry early. For lists pasted with every field on its own line.

const FIELD_SEP = /\s*\|\s*|\t+|\s*;\s*|\s{2,}|\s+[-–—]\s+/;

export function parseWordLines(text, mode = 'columns') {
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

  return lines.map((line) => {
    const raw = line.trim();
    if (!raw) return null;
    return rowFrom(raw.split(FIELD_SEP));
  }).filter((row) => row && row.term);
}

function rowFrom(parts) {
  return {
    term: (parts[0] || '').trim(),
    translation: (parts[1] || '').trim(),
    transcription: (parts[2] || '').trim(),
  };
}

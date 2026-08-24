// Shared parsing for the "word | translation | pronunciation" paste format,
// used by the in-app "+ Add words" sheet and by the seeded lesson lists.
// Also accepts tabs or semicolons as separators (handy when pasting from a table).
export function parseWordLines(text) {
  return String(text).split(/\r?\n/).map((line) => {
    const raw = line.trim();
    if (!raw) return null;
    const parts = raw.split(/\s*[|\t;]\s*/);
    return {
      term: (parts[0] || '').trim(),
      translation: (parts[1] || '').trim(),
      transcription: (parts[2] || '').trim(),
    };
  }).filter((row) => row && row.term);
}

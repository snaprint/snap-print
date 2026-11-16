/* ═══════════════════════════════════════════════════════════════
   SNAP PRINT — CSV parser for Google Sheets "Publish to web" CSVs (B-12)

   Helper module (no onRequest* exports, so Pages does not route it).
   Handles quoted fields (with "" escapes and line breaks inside quotes),
   CRLF line endings, a UTF-8 BOM on the first header, and trims every
   header and value. Returns an array of { header: value } objects.
   (The frontend uses PapaParse with the same trimming.)
   ═══════════════════════════════════════════════════════════════ */

export function parseCSV(text) {
  const lines = splitCSVRows(text);
  if (lines.length === 0) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.replace(/^\uFEFF/, '').trim());
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (values[i] || '').trim();
    });
    return obj;
  });
}

/** Splits CSV text into rows; a newline inside a quoted field is part of the cell. */
function splitCSVRows(text) {
  const rows = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') i++; // \r\n pair
      if (current.trim()) rows.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) rows.push(current);
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else if (char !== '\r') {
      current += char;
    }
  }
  result.push(current);
  return result;
}

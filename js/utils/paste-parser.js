// Parses pasted clipboard text from Excel/Google Sheets into a 2D matrix.
// Detects tab > comma > semicolon as separator. Handles quoted strings.

export function parsePastedText(text) {
  if (!text) return [];
  const t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Detect separator on the first non-empty line
  const firstLine = t.split('\n').find(l => l.trim()) || '';
  const sep = firstLine.includes('\t') ? '\t'
            : firstLine.includes(',')   ? ','
            : firstLine.includes(';')   ? ';'
            : '\t';

  const rows = [];
  let row = [], cur = '', inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i], next = t[i + 1];
    if (inQ) {
      if (c === '"' && next === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === sep) { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

// Spanish number/currency parsers — handles "1.000,50" / "2,00%" / "1.000 €"
// Heuristic: if string has both '.' and ',' and last separator is ',' → ES format.
// If only ',' → ES decimal. If only '.' → could be either — assume EN if .X{1,2} at end.

export function parseNumberEs(s) {
  if (s == null || s === '') return null;
  let v = String(s).trim();
  if (!v) return null;

  // Strip currency, percent, spaces
  v = v.replace(/[€$%]/g, '').replace(/\s+/g, '').trim();
  if (!v) return null;

  const hasComma = v.includes(',');
  const hasDot = v.includes('.');

  if (hasComma && hasDot) {
    // Last one is decimal sep
    if (v.lastIndexOf(',') > v.lastIndexOf('.')) {
      v = v.replace(/\./g, '').replace(',', '.');
    } else {
      v = v.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Pure comma → ES decimal (unless it looks like thousand sep "1,000")
    const parts = v.split(',');
    if (parts.length === 2 && parts[1].length === 3 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
      // Ambiguous: "1,000" — treat as 1000 (thousand sep is unlikely in trade data)
      v = parts.join('');
    } else {
      v = v.replace(',', '.');
    }
  }
  // Pure dot or no separator: parseFloat handles both

  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// Parse "% P&L" cell → returns the % as number (e.g. "2,00%" → 2.00)
export function parsePctEs(s) {
  return parseNumberEs(s);
}

// Parse "1.000 €" → number in same units
export function parseEuroEs(s) {
  return parseNumberEs(s);
}

export function fmtPct(v, digits = 2) {
  if (v == null || isNaN(v)) return '–';
  return (v >= 0 ? '+' : '') + v.toFixed(digits) + '%';
}

export function fmtPctNoSign(v, digits = 1) {
  if (v == null || isNaN(v)) return '–';
  return v.toFixed(digits) + '%';
}

export function fmtNum(v, digits = 2) {
  if (v == null || isNaN(v)) return '–';
  return v.toFixed(digits);
}

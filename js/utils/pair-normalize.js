// Normalize pair strings to canonical form
const MAP = new Map([
  ['EURUSD', 'EUR/USD'],
  ['EUR USD', 'EUR/USD'],
  ['EUR-USD', 'EUR/USD'],
  ['GBPUSD', 'GBP/USD'],
  ['GBP USD', 'GBP/USD'],
  ['GBP-USD', 'GBP/USD'],
  // Oro: se llama ORO (antes XAU/USD; los trades antiguos se renombran al
  // cargarlos, ver renamePair).
  ['XAUUSD', 'ORO'],
  ['XAU USD', 'ORO'],
  ['XAU-USD', 'ORO'],
  ['XAU/USD', 'ORO'],
  ['ORO', 'ORO'],
  ['GOLD', 'ORO'],
  // Petróleo (WTI)
  ['OIL', 'OIL'],
  ['USOIL', 'OIL'],
  ['US OIL', 'OIL'],
  ['WTI', 'OIL'],
  ['XTIUSD', 'OIL'],
  ['XTI/USD', 'OIL'],
  ['CL', 'OIL'],
  ['CRUDE', 'OIL'],
  ['PETROLEO', 'OIL'],
  ['PETRÓLEO', 'OIL'],
  ['NQ', 'NQ'],
  ['NASDAQ', 'NQ'],
]);

export function normalizePair(p, sheet) {
  if (!p) return sheet === 'NASDAQ' ? 'NQ' : '';
  const raw = String(p).toUpperCase().trim();
  if (MAP.has(raw)) return MAP.get(raw);
  // Already in EUR/USD form or similar
  if (/^[A-Z]{3}\/[A-Z]{3}$/.test(raw)) return raw;
  if (sheet === 'NASDAQ') return 'NQ';
  return raw;
}

export const ZONAS_PAIRS = ['EUR/USD', 'GBP/USD', 'ORO', 'OIL'];

// Nombres antiguos de un activo → el actual. Se aplica al cargar los trades
// (state.sanitize*) y en las vistas que leen datos sin pasar por ahí (grupo),
// así los guardados con el nombre viejo cuentan junto a los nuevos.
const RENOMBRADOS = { 'XAU/USD': 'ORO', GOLD: 'ORO' };
export function renamePair(p) {
  return RENOMBRADOS[p] || p || '';
}

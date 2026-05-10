// Normalize pair strings to canonical form
const MAP = new Map([
  ['EURUSD', 'EUR/USD'],
  ['EUR USD', 'EUR/USD'],
  ['EUR-USD', 'EUR/USD'],
  ['GBPUSD', 'GBP/USD'],
  ['GBP USD', 'GBP/USD'],
  ['GBP-USD', 'GBP/USD'],
  ['XAUUSD', 'XAU/USD'],
  ['XAU USD', 'XAU/USD'],
  ['XAU-USD', 'XAU/USD'],
  ['GOLD', 'XAU/USD'],
  ['ORO', 'XAU/USD'],
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

export const ZONAS_PAIRS = ['EUR/USD', 'GBP/USD', 'XAU/USD'];

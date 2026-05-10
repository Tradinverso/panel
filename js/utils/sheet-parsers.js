// Parsers for the user's actual Google Sheet tabs (ZONAS, LIQUIDEZ, NASDAQ).
// Each tab has a different column order; this module knows the layouts.

import { parseDate, parseTime, durationMinutes } from './date-helpers.js';
import { parseNumberEs, parsePctEs } from './number-format-es.js';
import { normalizePair } from './pair-normalize.js';

// Column index per strategy (0-based, matching the actual sheet structure
// where col 0 is the leading blank).
//
// ZONAS columns (verified):
//   0:""  1:TRADE  2:PAR  3:SETUP  4:DATE  5:DIA  6:OPEN  7:CLOSE
//   8:TIME  9:PIPS  10:ZONE  11:%P/L  12:€P&L  13:RES  14..20:calc
//   21:Sensacion  22:WWW  23:Reflexión
//
// LIQUIDEZ columns (verified — note the actual data order has %P&L BEFORE $P/L,
// even though the header label says the opposite):
//   0:""  1:TRADE  2:PAR  3:SETUP  4:DATE  5:DIA  6:OPEN  7:CLOSE
//   8:TIME  9:ZONA  10:RR  11:Pip SL  12:ENTRY  13:%P&L  14:$P/L
//   15:RES  16..22:calc  23:Sensacion  24:HTF  25:LTF  26:Reflexión
//
// NASDAQ columns (verified — same %P&L-then-$P/L order):
//   0:""  1:TRADE  2:SETUP  3:DATE  4:DIA  5:OPEN  6:CLOSE  7:TIME
//   8:ZONA  9:RR  10:TICKS  11:ENTRY  12:%P&L  13:$P/L  14:RES
//   15..21:calc  22:Sensacion  23:HTF  24:LTF  25:Reflexión

const SHEET_COL_MAP = {
  ZONAS: {
    trade: 1, pair: 2, setup: 3, date: 4, open: 6, close: 7,
    pips: 9, zone: 10, pct: 11, res: 13, sens: 21, url1: 22, reflex: 23,
  },
  LIQUIDEZ: {
    trade: 1, pair: 2, setup: 3, date: 4, open: 6, close: 7,
    zone: 9, rr: 10, pip: 11, entry: 12, pct: 13, res: 15,
    sens: 23, url1: 24, url2: 25, reflex: 26,
  },
  NASDAQ: {
    trade: 1, setup: 2, date: 3, open: 5, close: 6,
    zone: 8, rr: 9, ticks: 10, entry: 11, pct: 12, res: 14,
    sens: 22, url1: 23, url2: 24, reflex: 25,
  },
};

const RES_VALID = new Set(['TP', 'SL', 'BE']);

// Convert a row array (cells from the sheet) to a canonical trade.
// Returns null if the row is a header, empty, or aggregate row.
export function parseSheetRow(sheet, cells) {
  const map = SHEET_COL_MAP[sheet];
  if (!map) return null;
  if (!Array.isArray(cells)) return null;

  // Skip if first column doesn't have a numeric trade index
  const tradeNum = parseInt(String(cells[map.trade] || '').trim(), 10);
  if (isNaN(tradeNum) || tradeNum <= 0) return null;

  const date = parseDate(cells[map.date]);
  if (!date) return null;

  const open_str = normalizeTime(cells[map.open]);
  const close_str = normalizeTime(cells[map.close]);
  const pct = parsePctEs(cells[map.pct]);

  let result = String(cells[map.res] || '').trim().toUpperCase();
  if (!RES_VALID.has(result)) {
    result = pct == null ? 'BE' : (pct > 0.2 ? 'TP' : pct < -0.2 ? 'SL' : 'BE');
  }

  return {
    sheet,
    date,
    result,
    pnl_pct: pct != null ? +pct.toFixed(4) : 0,
    open_str,
    close_str,
    open_hour: parseTime(open_str),
    dur: durationMinutes(open_str, close_str),
    setup: String(cells[map.setup] || '').trim().toUpperCase(),
    pair: sheet === 'NASDAQ' ? 'NQ' : normalizePair(cells[map.pair], sheet),
    zone: String(cells[map.zone] || '').trim(),
    entry: map.entry != null ? String(cells[map.entry] || '').trim() : '',
    rr: map.rr != null ? parseNumberEs(cells[map.rr]) : null,
    pips: map.pips != null ? parseNumberEs(cells[map.pips])
        : map.pip != null ? parseNumberEs(cells[map.pip])
        : map.ticks != null ? parseNumberEs(cells[map.ticks])
        : null,
    sensacion: String(cells[map.sens] || '').trim(),
    url1: String(cells[map.url1] || '').trim(),
    url2: map.url2 != null ? String(cells[map.url2] || '').trim() : '',
    reflexion: String(cells[map.reflex] || '').trim(),
  };
}

function normalizeTime(s) {
  if (!s) return '';
  const v = String(s).replace(/"/g, '').trim();
  const m = v.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${String(m[1]).padStart(2, '0')}:${m[2]}`;
}

// Parse many rows (array of arrays) and return canonical trades
export function parseSheetRows(sheet, rows) {
  const out = [];
  for (const row of rows) {
    const t = parseSheetRow(sheet, row);
    if (t) out.push(t);
  }
  return out;
}

export const SHEET_COLUMNS = SHEET_COL_MAP;

// User-facing column headers for the import table view (matches the actual sheet)
export const IMPORT_HEADERS = {
  ZONAS: [
    { key: 'idx',     label: 'Nº',         calc: false, hint: 'auto' },
    { key: 'trade',   label: 'TRADE',      calc: false },
    { key: 'pair',    label: 'PAR',        calc: false },
    { key: 'setup',   label: 'SETUP',      calc: false },
    { key: 'date',    label: 'DATE',       calc: false },
    { key: 'dia',     label: 'DIA',        calc: true },
    { key: 'open',    label: 'OPEN',       calc: false },
    { key: 'close',   label: 'CLOSE',      calc: false },
    { key: 'time',    label: 'TIME',       calc: true },
    { key: 'pips',    label: 'PIPS',       calc: false },
    { key: 'zone',    label: 'ZONE',       calc: false },
    { key: 'pct',     label: '% P/L',      calc: false },
    { key: 'eur',     label: '(ignorado)', calc: true },
    { key: 'res',     label: 'RES',        calc: false },
    { key: 'balance', label: 'BALANCE',    calc: true },
    { key: 'pnlacc',  label: 'P&L ACC.',   calc: true },
    { key: 'max',     label: 'MÁX',        calc: true },
    { key: 'ddp',     label: 'DD +',       calc: true },
    { key: 'ddpct',   label: 'DD %',       calc: true },
    { key: 'wst',     label: 'WS',         calc: true },
    { key: 'wspct',   label: 'WS %',       calc: true },
    { key: 'sens',    label: 'SENSACIÓN',  calc: false },
    { key: 'url1',    label: 'WWW',        calc: false },
    { key: 'reflex',  label: 'REFLEXIÓN',  calc: false },
  ],
  LIQUIDEZ: [
    { key: 'idx',     label: 'Nº',         calc: false, hint: 'auto' },
    { key: 'trade',   label: 'TRADE',      calc: false },
    { key: 'pair',    label: 'PAR',        calc: false },
    { key: 'setup',   label: 'SETUP',      calc: false },
    { key: 'date',    label: 'DATE',       calc: false },
    { key: 'dia',     label: 'DIA',        calc: true },
    { key: 'open',    label: 'OPEN',       calc: false },
    { key: 'close',   label: 'CLOSE',      calc: false },
    { key: 'time',    label: 'TIME',       calc: true },
    { key: 'zone',    label: 'ZONA',       calc: false },
    { key: 'rr',      label: 'RR',         calc: false },
    { key: 'pip',     label: 'PIP SL',     calc: false },
    { key: 'entry',   label: 'ENTRY',      calc: false },
    { key: 'pct',     label: '% P&L',      calc: false },
    { key: 'usd',     label: '(ignorado)', calc: true },
    { key: 'res',     label: 'RES',        calc: false },
    { key: 'balance', label: 'BALANCE',    calc: true },
    { key: 'pnlacc',  label: 'P&L ACC.',   calc: true },
    { key: 'max',     label: 'MÁX',        calc: true },
    { key: 'ddp',     label: 'DD +',       calc: true },
    { key: 'ddpct',   label: 'DD %',       calc: true },
    { key: 'wst',     label: 'WS',         calc: true },
    { key: 'wspct',   label: 'WS %',       calc: true },
    { key: 'sens',    label: 'SENSACIÓN',  calc: false },
    { key: 'url1',    label: 'HTF',        calc: false },
    { key: 'url2',    label: 'LTF',        calc: false },
    { key: 'reflex',  label: 'REFLEXIÓN',  calc: false },
  ],
  NASDAQ: [
    { key: 'idx',     label: 'Nº',         calc: false, hint: 'auto' },
    { key: 'trade',   label: 'TRADE',      calc: false },
    { key: 'setup',   label: 'SETUP',      calc: false },
    { key: 'date',    label: 'DATE',       calc: false },
    { key: 'dia',     label: 'DIA',        calc: true },
    { key: 'open',    label: 'OPEN',       calc: false },
    { key: 'close',   label: 'CLOSE',      calc: false },
    { key: 'time',    label: 'TIME',       calc: true },
    { key: 'zone',    label: 'ZONA',       calc: false },
    { key: 'rr',      label: 'RR',         calc: false },
    { key: 'ticks',   label: 'TICKS',      calc: false },
    { key: 'entry',   label: 'ENTRY',      calc: false },
    { key: 'pct',     label: '% P&L',      calc: false },
    { key: 'usd',     label: '(ignorado)', calc: true },
    { key: 'res',     label: 'RES',        calc: false },
    { key: 'balance', label: 'BALANCE',    calc: true },
    { key: 'pnlacc',  label: 'P&L ACC.',   calc: true },
    { key: 'max',     label: 'MÁX',        calc: true },
    { key: 'ddp',     label: 'DD +',       calc: true },
    { key: 'ddpct',   label: 'DD %',       calc: true },
    { key: 'wst',     label: 'WS',         calc: true },
    { key: 'wspct',   label: 'WS %',       calc: true },
    { key: 'sens',    label: 'SENSACIÓN',  calc: false },
    { key: 'url1',    label: 'HTF',        calc: false },
    { key: 'url2',    label: 'LTF',        calc: false },
    { key: 'reflex',  label: 'REFLEXIÓN',  calc: false },
  ],
};

// Convert a row of {key:value} from import-table → canonical trade
export function rowToTrade(sheet, row) {
  const date = parseDate(row.date);
  if (!date) return { error: 'Fecha inválida' };
  const pct = parsePctEs(row.pct);
  if (pct == null) return { error: 'Falta % P&L' };
  const setup = String(row.setup || '').trim().toUpperCase();
  if (sheet !== 'NASDAQ' && !row.pair) return { error: 'Falta PAR' };
  if (!['LONG', 'SHORT'].includes(setup)) return { error: 'SETUP debe ser LONG o SHORT' };

  const open_str = normalizeTime(row.open);
  const close_str = normalizeTime(row.close);

  let result = String(row.res || '').trim().toUpperCase();
  if (!RES_VALID.has(result)) result = pct > 0.2 ? 'TP' : pct < -0.2 ? 'SL' : 'BE';

  return {
    trade: {
      sheet, date, result,
      pnl_pct: +pct.toFixed(4),
      open_str, close_str,
      open_hour: parseTime(open_str),
      dur: durationMinutes(open_str, close_str),
      setup,
      pair: sheet === 'NASDAQ' ? 'NQ' : normalizePair(row.pair, sheet),
      zone: String(row.zone || '').trim(),
      entry: String(row.entry || '').trim(),
      rr: row.rr != null && row.rr !== '' ? parseNumberEs(row.rr) : null,
      pips: parseNumberEs(row.pips || row.pip || row.ticks),
      sensacion: String(row.sens || '').trim(),
      url1: String(row.url1 || '').trim(),
      url2: String(row.url2 || '').trim(),
      reflexion: String(row.reflex || '').trim(),
    }
  };
}

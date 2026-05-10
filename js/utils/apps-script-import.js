import { parseDate, parseTime, durationMinutes, hourToString } from './date-helpers.js';
import { normalizePair } from './pair-normalize.js';
import { SHEET_CONVERSION_FACTOR } from './constants.js';

// Maps a single Apps Script trade record → canonical schema.
// The legacy Apps Script returns the P&L as a monetary amount; we convert
// internally to the canonical percentage. The factor is hardcoded — see
// constants.js. The user never sees money in the app.
export function mapAppsScriptTrade(raw) {
  if (!raw || !raw.sheet) return null;

  const date = parseDate(raw.date);
  if (!date) return null;

  const open_str = raw.open_str || (raw.open_hour != null ? hourToString(raw.open_hour) : '');
  let close_str = '';
  let dur = raw.dur != null ? Number(raw.dur) : null;

  // Some Apps Scripts return only open_hour + dur; reconstruct close
  if (dur != null && open_str) {
    const openMin = parseTime(open_str) * 60;
    const closeMin = openMin + dur;
    close_str = hourToString(closeMin / 60);
  }

  // Apps Script returns the P&L as a money amount; convert to % using the
  // sheet's internal capital base (hidden from the user).
  const rawAmount = typeof raw.pnl === 'number' ? raw.pnl : parseFloat(raw.pnl);
  const pnl_pct = !isNaN(rawAmount) ? (rawAmount / SHEET_CONVERSION_FACTOR) * 100 : 0;

  // Pips/Ticks: aceptamos cualquiera de estos nombres si el Apps Script los expone.
  // Si no, queda null (compat con scripts antiguos).
  const rawPips = raw.pips != null ? raw.pips
                : raw.pip  != null ? raw.pip
                : raw.ticks != null ? raw.ticks
                : null;
  const pips = rawPips != null && !isNaN(parseFloat(rawPips)) ? parseFloat(rawPips) : null;

  return {
    sheet: String(raw.sheet).toUpperCase(),
    date,
    pnl_pct: +pnl_pct.toFixed(4),
    open_str,
    close_str,
    open_hour: parseTime(open_str),
    dur,
    setup: raw.setup || '',
    pair: normalizePair(raw.pair, raw.sheet),
    zone: raw.zone || '',
    entry: raw.entry || '',
    rr: raw.rr != null && !isNaN(parseFloat(raw.rr)) ? parseFloat(raw.rr) : null,
    pips,
    sensacion: raw.sensacion || '',
    url1: raw.url1 || '',
    url2: raw.url2 || '',
    reflexion: raw.reflexion || '',
  };
}

// Fetches an Apps Script endpoint and returns canonical trades
export async function fetchAppsScript(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const raw = Array.isArray(json) ? json : (json.trades || []);
  return raw.map(t => mapAppsScriptTrade(t)).filter(Boolean);
}

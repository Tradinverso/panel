/**
 * TRADINVERSO — Apps Script v2
 * Drop-in replacement para tu Apps Script actual.
 * Añade: pips/ticks, RR mejorado, robustez en parsing de fechas/horas.
 *
 * CÓMO ACTUALIZAR:
 *   1. Abre tu Google Sheet (el del journaling).
 *   2. Extensiones → Apps Script. Se abre el editor.
 *   3. Borra TODO el código que tengas y pega este completo.
 *   4. Botón Guardar (💾) arriba.
 *   5. Botón "Implementar" → "Administrar implementaciones" → la que ya tengas → ✏ editar
 *      → Versión: "Nueva versión" → Implementar.
 *   6. La URL del endpoint NO cambia. Tu app sigue usando la misma URL.
 *   7. Re-importar desde Tradinverso → ahora trae pips/ticks/RR.
 *
 * Si tienes varios alumnos cada uno con su sheet+script, repite los pasos
 * para cada uno (cada estudiante tiene su URL).
 */

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const trades = []
    .concat(readSheet(ss.getSheetByName('ZONAS'),    'ZONAS'))
    .concat(readSheet(ss.getSheetByName('LIQUIDEZ'), 'LIQUIDEZ'))
    .concat(readSheet(ss.getSheetByName('NASDAQ'),   'NASDAQ'));

  return ContentService
    .createTextOutput(JSON.stringify({ trades, count: trades.length }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Mapeo de columnas por estrategia (0-indexed) ────────────
// Coincide con la estructura verificada de los sheets de Tradinverso.
const COLS = {
  ZONAS: {
    trade: 1, pair: 2, setup: 3, date: 4, open: 6, close: 7, dur: 8,
    pips: 9, zone: 10, pct: 11, eur: 12, res: 13,
    sens: 21, url1: 22, reflex: 23,
  },
  LIQUIDEZ: {
    trade: 1, pair: 2, setup: 3, date: 4, open: 6, close: 7, dur: 8,
    zone: 9, rr: 10, pips: 11, entry: 12, pct: 13, eur: 14, res: 15,
    sens: 23, url1: 24, url2: 25, reflex: 26,
  },
  NASDAQ: {
    trade: 1, setup: 2, date: 3, open: 5, close: 6, dur: 7,
    zone: 8, rr: 9, pips: 10, entry: 11, pct: 12, eur: 13, res: 14,
    sens: 22, url1: 23, url2: 24, reflex: 25,
  },
};

function readSheet(sheet, sheetName) {
  if (!sheet) return [];
  const map = COLS[sheetName];
  const data = sheet.getDataRange().getValues();
  const out = [];
  // Las dos primeras filas suelen ser cabecera + agregados; saltamos.
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    const tradeNum = parseInt(row[map.trade], 10);
    if (isNaN(tradeNum) || tradeNum <= 0) continue;
    out.push(buildTrade(row, map, sheetName));
  }
  return out;
}

function buildTrade(row, map, sheetName) {
  const dateStr = formatDate(row[map.date]);
  const openStr = formatTime(row[map.open]);
  const closeStr = formatTime(row[map.close]);
  const dur = parseDur(row[map.dur]);
  const pnlEur = parseEur(row[map.eur]);
  const result = String(row[map.res] || '').trim().toUpperCase();
  const pair = sheetName === 'NASDAQ' ? 'NQ' : (row[map.pair] || '');

  return {
    sheet: sheetName,
    trade: parseInt(row[map.trade], 10),
    date: dateStr,
    open_str: openStr,
    close_str: closeStr,
    open_hour: parseHour(openStr),
    dur,
    setup: String(row[map.setup] || '').trim().toUpperCase(),
    pair,
    zone: String(row[map.zone] || '').trim(),
    entry: map.entry != null ? String(row[map.entry] || '').trim() : '',
    rr: map.rr != null ? parseNum(row[map.rr]) : null,
    pips: map.pips != null ? parseNum(row[map.pips]) : null,
    pnl: pnlEur,
    pnl_pct: parsePct(row[map.pct]),
    result: ['TP', 'SL', 'BE'].indexOf(result) >= 0 ? result : (pnlEur > 0 ? 'TP' : pnlEur < 0 ? 'SL' : 'BE'),
    sensacion: String(row[map.sens] || '').trim(),
    url1: String(row[map.url1] || '').trim(),
    url2: map.url2 != null ? String(row[map.url2] || '').trim() : '',
    reflexion: String(row[map.reflex] || '').trim(),
  };
}

// ── Helpers de parsing ──────────────────────────────────────
function formatDate(v) {
  if (!v) return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v);
}

function formatTime(v) {
  if (!v) return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  }
  const m = String(v).match(/(\d{1,2}):(\d{2})/);
  return m ? (String(m[1]).padStart(2, '0') + ':' + m[2]) : '';
}

function parseHour(hhmm) {
  if (!hhmm) return null;
  const m = String(hhmm).match(/(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) + parseInt(m[2], 10) / 60 : null;
}

function parseDur(v) {
  if (!v) return null;
  if (v instanceof Date) {
    return v.getHours() * 60 + v.getMinutes();
  }
  const m = String(v).match(/(\d+):(\d+)/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}

function parseNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}

function parsePct(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    // Sheets guarda formato % como decimal: 0.02 = 2%
    return Math.abs(v) <= 1 ? v * 100 : v;
  }
  const s = String(v).replace('%', '').replace(',', '.').trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseEur(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[€$\s]/g, '').replace(/\.(?=\d{3}(?:[^\d]|$))/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

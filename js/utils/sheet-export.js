// Exportador al formato de las plantillas de Sheets de la academia.
//
// Sirve para el journal real Y para el histórico de backtesting: ambos usan los
// mismos nombres de campo (date, open_str, pair, zone, pnl_pct, result…), y las
// columnas que una de las dos colecciones no tiene (sensación en backtests,
// por ejemplo) salen vacías. Así el archivo conserva SIEMPRE el mismo orden de
// columnas que la hoja original y se puede reimportar sin tocar nada.
//
// Vivía dentro de settings.js; se extrajo aquí al añadir la exportación de
// backtests para no duplicar ~130 líneas.

import { IMPORT_HEADERS } from './sheet-parsers.js';
import { formatDateEs } from './date-helpers.js';
import { toCsv } from './csv.js';

const DAYS_FULL_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Orden cronológico dentro de cada pestaña (fecha, y a igual fecha por hora).
function sortChronoForExport(rows) {
  return [...rows].sort((a, b) => {
    if (a.date !== b.date) return String(a.date).localeCompare(String(b.date));
    return (a.open_hour || 0) - (b.open_hour || 0);
  });
}

export function rowsToCsv(sheet, rows) {
  const headers = IMPORT_HEADERS[sheet];
  const sorted = sortChronoForExport(rows);
  const headerRow = headers.map(h => h.label);
  const body = sorted.map((t, i) => headers.map(h => formatCell(h.key, t, i + 1, sheet)));
  return toCsv([headerRow, ...body]);
}

export function formatCell(key, t, idx, sheet) {
  switch (key) {
    case 'idx':
    case 'trade':   return String(idx);
    case 'pair':    return sheet === 'NASDAQ' ? '' : (t.pair || '');
    case 'setup':   return t.setup || '';
    case 'date':    return formatDateEs(t.date) || '';
    case 'dia':     return dayOfWeekFullEs(t.date);
    case 'open':    return t.open_str || '';
    case 'close':   return t.close_str || '';
    case 'time':    return formatDuration(t.dur);
    case 'pips':
    case 'pip':
    case 'ticks':   return numEs(t.pips);
    case 'zone':    return Array.isArray(t.zone) ? t.zone.join(' · ') : (t.zone || '');
    case 'rr':      return numEs(t.rr);
    case 'entry':   return Array.isArray(t.entry) ? t.entry.join(' · ') : (t.entry || '');
    case 'pct':     return pctEs(t.pnl_pct);
    case 'res':     return t.result || '';
    case 'sens':    return t.sensacion || '';
    case 'url1':    return t.url1 || '';
    case 'url2':    return t.url2 || '';
    case 'reflex':  return t.reflexion || '';
    // Columnas calc del Sheet (BALANCE, DD, etc.) — se exportan vacías
    // para preservar el alineamiento de columnas con la hoja original.
    default:        return '';
  }
}

function dayOfWeekFullEs(yyyy_mm_dd) {
  if (!yyyy_mm_dd) return '';
  const d = new Date(yyyy_mm_dd);
  if (isNaN(d.getTime())) return '';
  return DAYS_FULL_ES[d.getDay()];
}

function formatDuration(min) {
  if (min == null || isNaN(min)) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function numEs(v) {
  if (v == null || isNaN(v)) return '';
  return String(v).replace('.', ',');
}

function pctEs(v) {
  if (v == null || isNaN(v)) return '';
  return v.toFixed(2).replace('.', ',') + '%';
}

export function stampNow() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 32) || 'usuario';
}

// ─────────────────────────────────────────────────────────────
// XLSX (3 pestañas en un solo archivo)
// SheetJS se carga bajo demanda — solo la primera vez que el usuario
// pulsa "Descargar Excel", no en cada arranque de la app.
// ─────────────────────────────────────────────────────────────

const SHEETJS_CDN = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';

async function loadSheetJS() {
  if (window.XLSX) return window.XLSX;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SHEETJS_CDN;
    s.onload = () => window.XLSX ? resolve() : reject(new Error('XLSX no se inicializó'));
    s.onerror = () => reject(new Error('No se pudo descargar SheetJS desde el CDN. Comprueba tu conexión.'));
    document.head.appendChild(s);
  });
  return window.XLSX;
}

// `rows` = trades del journal o backtests, indistintamente.
export async function exportXlsx(rows, filename) {
  const XLSX = await loadSheetJS();
  const wb = XLSX.utils.book_new();
  const tabName = { ZONAS: 'Zonas', LIQUIDEZ: 'Liquidez', NASDAQ: 'Nasdaq' };

  for (const sheet of ['ZONAS', 'LIQUIDEZ', 'NASDAQ']) {
    const sheetRows = rows.filter(t => t.sheet === sheet);
    if (sheetRows.length === 0) continue;
    const headers = IMPORT_HEADERS[sheet];
    const sorted = sortChronoForExport(sheetRows);
    const aoa = [
      headers.map(h => h.label),
      ...sorted.map((t, i) => headers.map(h => formatCell(h.key, t, i + 1, sheet))),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Ancho de columnas razonable (autocálculo simple)
    ws['!cols'] = headers.map(h => ({ wch: Math.max(h.label.length + 2, 8) }));
    XLSX.utils.book_append_sheet(wb, ws, tabName[sheet]);
  }

  XLSX.writeFile(wb, filename);
}

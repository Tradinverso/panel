// Importación de backtests desde las plantillas de Google Sheets de la
// academia (un Sheet con 3 pestañas: Zonas · Liquidez · Nasdaq) o desde CSV.
//
// Particularidades de la plantilla (verificadas contra el Sheet real):
//   · La fila de cabeceras no es la 1 (hay títulos encima) → se localiza
//     buscando la fila que contiene TRADE + OPEN + RES.
//   · Las columnas difieren por pestaña (Zonas sin RR/ENTRY, Nasdaq sin PAR).
//   · En Liquidez y Nasdaq las cabeceras "$ P/L" y "% P&L" están INTERCAMBIADAS
//     respecto a los datos → se detecta el valor que lleva '%', no la cabecera.
//   · Fechas en dos formatos ("7/01/26" y "08-01-26") y decimales con coma.
//   · Columnas derivadas (BALANCE, DD, rachas, mini-tablas laterales) se ignoran.
//   · La columna Sensación se ignora: el backtesting no lleva emociones.

// ── Parser CSV de verdad (comillas, comas y saltos de línea embebidos) ──
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  const src = String(text || '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// ── Localizar la fila de cabeceras (títulos por encima en la plantilla) ──
export function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const up = rows[i].map(c => String(c).toUpperCase().trim());
    if (up.includes('TRADE') && up.includes('OPEN') && up.includes('RES')) return i;
  }
  return -1;
}

// ── ¿Qué pestaña es este CSV? (marcadores distintivos de cada una) ──
export function detectSheetType(headerRow) {
  const up = headerRow.map(c => String(c).toUpperCase().trim());
  if (up.includes('WWW')) return 'ZONAS';
  if (up.some(c => c.includes('PIP SL'))) return 'LIQUIDEZ';
  if (up.includes('TICKS')) return 'NASDAQ';
  // Fallback por combinación de columnas
  const hasPar = up.includes('PAR'), hasRR = up.includes('RR');
  if (hasPar && hasRR) return 'LIQUIDEZ';
  if (hasPar) return 'ZONAS';
  if (hasRR) return 'NASDAQ';
  return null;
}

// ── Mapa de columnas por nombre de cabecera (robusto a filas/orden) ──
function mapColumns(headerRow) {
  const map = { pctCandidates: [] };
  headerRow.forEach((raw, i) => {
    const h = String(raw).toUpperCase().trim();
    if (!h) return;
    if (h.includes('DATE') && map.date == null) map.date = i;
    else if (h === 'OPEN') map.open = i;
    else if (h === 'CLOSE') map.close = i;
    else if (h === 'PAR') map.pair = i;
    else if (h === 'SETUP') map.setup = i;
    else if (h === 'ZONE' || h === 'ZONA') map.zone = i;
    else if (h === 'RR') map.rr = i;
    else if (h === 'ENTRY') map.entry = i;
    else if (h === 'RES') map.res = i;
    else if (h === 'WWW' || h === 'HTF') map.url1 = i;
    else if (h === 'LTF') map.url2 = i;
    else if (h.includes('REFLEX')) map.notas = i;
    // Candidatas a % P&L: "% P/L", "% P&L", "$ P/L"… (cabeceras intercambiadas
    // en Liquidez/Nasdaq → se decide por el VALOR que contiene '%')
    else if (h.includes('P/L') || h.includes('P&L')) map.pctCandidates.push(i);
  });
  return map;
}

// ── Normalizadores ──
export function normalizeDate(s) {
  const v = String(s || '').trim();
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;      // ya ISO
  const parts = v.split(/[/\-.]/).map(x => x.trim());
  if (parts.length !== 3) return '';
  let [d, m, y] = parts;
  if (y.length === 2) y = '20' + y;
  if (!/^\d+$/.test(d) || !/^\d+$/.test(m) || !/^\d{4}$/.test(y)) return '';
  const dd = +d, mm = +m;
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12) return '';
  return `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export function parseNumComa(s) {
  const v = String(s == null ? '' : s).replace(/[%€$\s]/g, '').replace(',', '.').trim();
  if (v === '' || v === '-') return null;
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
}

export function normTime(s) {
  const v = String(s || '').trim();
  const m = v.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

// ── Filas CSV → borradores editables (strings, para la rejilla) ──
// Devuelve filas "draft": { date, open, close, pair, setup, zone, entry, rr,
// pnl, res, url1, url2, notas } — todo texto tal cual, sin normalizar aún.
export function rowsToDrafts(rows, headerIdx) {
  const map = mapColumns(rows[headerIdx]);
  const out = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const get = idx => (idx != null && r[idx] != null ? String(r[idx]).trim() : '');
    // % P&L: la candidata cuyo valor lleva '%' (cabeceras intercambiadas);
    // si ninguna lo lleva, la primera con contenido numérico.
    let pnl = '';
    for (const ci of map.pctCandidates) {
      const v = get(ci);
      if (v.includes('%')) { pnl = v; break; }
    }
    if (!pnl) {
      for (const ci of map.pctCandidates) {
        const v = get(ci);
        if (v && parseNumComa(v) != null && !v.includes('€') && !v.includes('$')) { pnl = v; break; }
      }
    }
    const draft = {
      date: get(map.date),
      open: get(map.open),
      close: get(map.close),
      pair: get(map.pair),
      setup: get(map.setup).toUpperCase(),
      zone: get(map.zone),
      entry: get(map.entry),
      rr: get(map.rr),
      pnl,
      res: get(map.res).toUpperCase(),
      url1: get(map.url1),
      url2: get(map.url2),
      notas: get(map.notas),
    };
    // Filas vacías o "laterales" de la plantilla (numeración sin datos): fuera.
    if (!draft.date && !draft.open && !draft.pnl && !draft.res) continue;
    out.push(draft);
  }
  return out;
}

// ── Descargar las 3 pestañas de un Sheet compartido con enlace ──
// Devuelve { buckets: {ZONAS:[drafts], …}, errors: [msgs] }.
export async function fetchSheetBacktests(url) {
  const m = String(url || '').match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return { buckets: null, errors: ['El enlace no parece de Google Sheets. Copia la URL completa del navegador.'] };
  const id = m[1];
  const buckets = { ZONAS: [], LIQUIDEZ: [], NASDAQ: [] };
  const errors = [];
  for (const tab of ['Zonas', 'Liquidez', 'Nasdaq']) {
    try {
      const resp = await fetch(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`);
      const text = await resp.text();
      if (!resp.ok || text.trim().startsWith('<')) {
        errors.push(`No se pudo leer la pestaña "${tab}". Comparte el Sheet como "Cualquiera con el enlace · Lector" (o usa la descarga CSV).`);
        continue;
      }
      const rows = parseCsv(text);
      const hIdx = findHeaderRow(rows);
      if (hIdx < 0) { errors.push(`La pestaña "${tab}" no tiene el formato de la plantilla (no encuentro las cabeceras).`); continue; }
      const type = detectSheetType(rows[hIdx]) || tab.toUpperCase();
      buckets[type] = buckets[type].concat(rowsToDrafts(rows, hIdx));
    } catch (e) {
      errors.push(`Error leyendo "${tab}": ${e.message || e}. Prueba con la descarga CSV.`);
    }
  }
  return { buckets, errors };
}

// ── Parsear un archivo CSV subido (una pestaña) ──
export function parseCsvFile(text) {
  const rows = parseCsv(text);
  const hIdx = findHeaderRow(rows);
  if (hIdx < 0) return { sheet: null, drafts: [], error: 'No encuentro la fila de cabeceras (TRADE/OPEN/RES). ¿Es el CSV de la plantilla?' };
  const sheet = detectSheetType(rows[hIdx]);
  if (!sheet) return { sheet: null, drafts: [], error: 'No reconozco de qué estrategia es este CSV.' };
  return { sheet, drafts: rowsToDrafts(rows, hIdx), error: null };
}

// ── Borrador (rejilla) → objeto backtest listo para state.addBacktestsMany ──
export function draftToBacktest(draft, sheet) {
  const date = normalizeDate(draft.date);
  const pnl = parseNumComa(draft.pnl);
  if (!date || pnl == null) return null;
  const res = ['TP', 'SL', 'BE'].includes(draft.res) ? draft.res : '';
  const setup = draft.setup === 'SHORT' ? 'SHORT' : (draft.setup ? 'LONG' : '');
  return {
    sheet,
    date,
    open_str: normTime(draft.open),
    close_str: normTime(draft.close),
    pair: draft.pair || '',
    setup,
    zone: draft.zone || '',
    entry: draft.entry || '',
    rr: parseNumComa(draft.rr),
    pnl_pct: pnl,
    result: res || undefined,   // sin res → sanitize lo deriva del %
    url1: draft.url1 || '',
    url2: draft.url2 || '',
    notas: draft.notas || '',
  };
}

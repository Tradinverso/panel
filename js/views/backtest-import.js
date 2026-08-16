// Backtesting · IMPORTAR — vuelca las plantillas de Sheets de la academia (o
// cualquier tabla) a la rejilla editable, y de ahí al histórico de backtests.
//
// Tres vías de entrada, todas desembocan en la MISMA rejilla revisable:
//   1. Enlace del Google Sheet (compartido "Cualquiera con el enlace · Lector")
//      → lee las 3 pestañas de golpe.
//   2. Subir CSV (Archivo → Descargar → CSV de una pestaña) → detecta cuál es.
//   3. Pegar a mano: copia columnas/bloques de CUALQUIER tabla (Excel, Sheets)
//      y pégalos en una celda — se reparten hacia abajo y hacia la derecha,
//      como en Excel. También se puede teclear celda a celda.
// Al final, "Importar" pasa las filas válidas a state.addBacktestsMany (con
// dedupe: reimportar lo mismo no duplica).

import { state } from '../state.js';
import { STRATEGIES } from '../utils/strategy-config.js';
import { backtestTabs, BACKTEST_ROUTES } from '../components/backtest-tabs.js';
import { openModal } from '../components/modal.js';
import { exportXlsx, stampNow, slug } from '../utils/sheet-export.js';
import {
  fetchSheetBacktests, parseCsvFile, draftToBacktest, normalizeDate, parseNumComa,
} from '../utils/backtest-import.js';

// ── Columnas de la rejilla por estrategia ──
const COLS = {
  ZONAS: [
    { key: 'date', label: 'Fecha', w: 90, ph: '21/07/26' },
    { key: 'open', label: 'Open', w: 62, ph: '9:35' },
    { key: 'close', label: 'Close', w: 62, ph: '11:30' },
    { key: 'pair', label: 'Par', w: 80, ph: 'EUR/USD' },
    { key: 'setup', label: 'Setup', w: 64, ph: 'LONG' },
    { key: 'zone', label: 'Zona', w: 110, ph: '< 7 días' },
    { key: 'pnl', label: '% P&L', w: 66, ph: '2,00%' },
    { key: 'res', label: 'Res', w: 48, ph: 'TP' },
    { key: 'url1', label: 'Link M1', w: 130, ph: 'https://…' },
    { key: 'url2', label: 'Link M15', w: 130, ph: 'https://…' },
    { key: 'notas', label: 'Notas', w: 170, ph: '' },
  ],
  LIQUIDEZ: [
    { key: 'date', label: 'Fecha', w: 90, ph: '21/07/26' },
    { key: 'open', label: 'Open', w: 62, ph: '9:31' },
    { key: 'close', label: 'Close', w: 62, ph: '9:37' },
    { key: 'pair', label: 'Par', w: 80, ph: 'EUR/USD' },
    { key: 'setup', label: 'Setup', w: 64, ph: 'LONG' },
    { key: 'zone', label: 'Zona', w: 90, ph: 'ASIA' },
    { key: 'entry', label: 'Entrada', w: 80, ph: 'BPR' },
    { key: 'rr', label: 'RR', w: 48, ph: '2,5' },
    { key: 'pnl', label: '% P&L', w: 66, ph: '-1,00%' },
    { key: 'res', label: 'Res', w: 48, ph: 'SL' },
    { key: 'url1', label: 'Link HTF', w: 130, ph: 'https://…' },
    { key: 'url2', label: 'Link LTF', w: 130, ph: 'https://…' },
    { key: 'notas', label: 'Notas', w: 170, ph: '' },
  ],
  NASDAQ: [
    { key: 'date', label: 'Fecha', w: 90, ph: '21/07/26' },
    { key: 'open', label: 'Open', w: 62, ph: '16:00' },
    { key: 'close', label: 'Close', w: 62, ph: '18:45' },
    { key: 'setup', label: 'Setup', w: 64, ph: 'LONG' },
    { key: 'zone', label: 'Zona', w: 90, ph: 'ORB' },
    { key: 'entry', label: 'Entrada', w: 80, ph: 'IFVG' },
    { key: 'rr', label: 'RR', w: 48, ph: '3' },
    { key: 'pnl', label: '% P&L', w: 66, ph: '2,00%' },
    { key: 'res', label: 'Res', w: 48, ph: 'TP' },
    { key: 'url1', label: 'Link HTF', w: 130, ph: 'https://…' },
    { key: 'url2', label: 'Link LTF', w: 130, ph: 'https://…' },
    { key: 'notas', label: 'Notas', w: 170, ph: '' },
  ],
};

const SHEETS = ['ZONAS', 'LIQUIDEZ', 'NASDAQ'];

// Estado del importador (a nivel de módulo: sobrevive al cambiar de pestaña
// dentro de la sesión; se limpia al importar).
let buckets = emptyBuckets();
let activeSheet = 'ZONAS';
let lastMsg = null;   // { type: 'ok'|'err', text }

function emptyBuckets() {
  return { ZONAS: [], LIQUIDEZ: [], NASDAQ: [] };
}
function emptyRow() {
  return { date: '', open: '', close: '', pair: '', setup: '', zone: '', entry: '', rr: '', pnl: '', res: '', url1: '', url2: '', notas: '' };
}
function rowIsEmpty(r) {
  return Object.values(r).every(v => !String(v || '').trim());
}
function rowStatus(r) {
  if (rowIsEmpty(r)) return { icon: '', title: '' };
  const missing = [];
  if (!normalizeDate(r.date)) missing.push('fecha');
  if (parseNumComa(r.pnl) == null) missing.push('% P&L');
  return missing.length
    ? { icon: '⚠', title: 'Falta o no se entiende: ' + missing.join(' y ') }
    : { icon: '✓', title: 'Lista para importar' };
}
function validCount(sheet) {
  return buckets[sheet].filter(r => !rowIsEmpty(r) && rowStatus(r).icon === '✓').length;
}

export function backtestImportView(container) {
  paint(container);
}

function paint(container) {
  const totalValid = SHEETS.reduce((s, k) => s + validCount(k), 0);
  const cols = COLS[activeSheet];
  const rows = buckets[activeSheet];
  const stored = countStored();

  container.innerHTML = `
    ${backtestTabs('IMPORTAR')}
    <div class="page-header">
      <div>
        <h1>Backtesting <span>·</span> Importar</h1>
        <div class="sub">Vuelca tu plantilla de Sheets o pega columnas de cualquier tabla · revisa · importa</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:16px;">
      <div class="card-title">1 · Cargar datos</div>
      <div class="card-sub">Las filas caen en la rejilla de abajo para revisarlas antes de importar. Se ignoran las columnas calculadas de la plantilla (balance, DD, rachas) y la sensación (el backtesting no lleva emociones).</div>
      <div class="bti-loaders">
        <div class="bti-loader">
          <div class="form-label">Enlace del Google Sheet (lee las 3 pestañas)</div>
          <div style="display:flex;gap:8px;">
            <input class="form-input" type="url" id="btiUrl" placeholder="https://docs.google.com/spreadsheets/d/…" style="flex:1;">
            <button class="btn primary" id="btiFetch">Cargar</button>
          </div>
          <div class="bti-hint">El Sheet debe estar compartido como <b>"Cualquiera con el enlace · Lector"</b> (botón Compartir).</div>
        </div>
        <div class="bti-or">o</div>
        <div class="bti-loader">
          <div class="form-label">Subir CSV (una pestaña por archivo)</div>
          <input class="form-input" type="file" id="btiFile" accept=".csv,text/csv" multiple>
          <div class="bti-hint">En el Sheet: <b>Archivo → Descargar → CSV</b> de la pestaña que quieras. Detecta sola si es Zonas, Liquidez o Nasdaq.</div>
        </div>
      </div>
      ${lastMsg ? `<div class="import-result ${lastMsg.type}" style="margin-top:12px;">${esc(lastMsg.text)}</div>` : ''}
    </div>

    <div class="card" style="margin-bottom:16px;">
      <div class="card-title">2 · Revisar y editar</div>
      <div class="card-sub">Rejilla editable: corrige celdas, o copia columnas/bloques de cualquier Excel/Sheet y pégalos en una celda — se reparten solos hacia abajo y a la derecha.</div>

      <div class="rg-tabs" style="margin:12px 0;">
        ${SHEETS.map(k => {
          const n = buckets[k].filter(r => !rowIsEmpty(r)).length;
          return `<button class="rg-tab ${activeSheet === k ? 'active' : ''}" data-bti-sheet="${k}">${STRATEGIES[k].label}${n ? ` (${n})` : ''}</button>`;
        }).join('')}
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        <button class="btn" id="btiAddRows">+ 10 filas</button>
        <button class="btn danger" id="btiClear" ${rows.length ? '' : 'disabled'}>Vaciar ${STRATEGIES[activeSheet].label}</button>
        <span class="filter-count" style="margin-left:auto;">${validCount(activeSheet)} válidas de ${rows.filter(r => !rowIsEmpty(r)).length} con datos</span>
      </div>

      <div class="trade-table-wrap">
        <table class="data-table bti-grid">
          <thead><tr>
            <th style="width:30px;">#</th>
            <th style="width:26px;"></th>
            ${cols.map(c => `<th style="min-width:${c.w}px;">${c.label}</th>`).join('')}
            <th style="width:30px;"></th>
          </tr></thead>
          <tbody id="btiBody">
            ${rows.length ? rows.map((r, i) => rowHtml(r, i, cols)).join('') : `
              <tr><td colspan="${cols.length + 3}" class="empty" style="padding:24px;">
                Sin filas aún. Carga arriba tu Sheet/CSV, o pulsa "+ 10 filas" y pega/teclea tus datos.
              </td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-bottom:24px;">
      <div class="card-title">3 · Importar</div>
      <div class="card-sub">Se importan las filas válidas (✓) de las tres estrategias. Reimportar lo mismo no duplica.</div>
      <div style="display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap;">
        <button class="btn primary" id="btiImport" ${totalValid ? '' : 'disabled'}>⬆ Importar ${totalValid} backtest${totalValid !== 1 ? 's' : ''}</button>
        <span class="filter-count">${SHEETS.map(k => `${STRATEGIES[k].label}: ${validCount(k)}`).join(' · ')}</span>
      </div>
    </div>

    <div class="section-title">Tu histórico de backtesting</div>
    <div class="card" style="margin-bottom:16px;">
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Exportar a Excel (.xlsx)</div>
          <div class="setting-desc">
            Archivo con <strong>3 pestañas</strong> (Zonas · Liquidez · Nasdaq) y el mismo orden de columnas
            que la plantilla de la academia, así que se puede volver a importar tal cual.
            Solo backtests — tu journal real se exporta desde <strong>Ajustes</strong>.
          </div>
        </div>
        <div class="setting-control" style="display:flex;justify-content:flex-end;">
          <button class="btn primary" id="btiExport" ${stored.total ? '' : 'disabled'}>📊 Descargar Excel (${stored.total})</button>
        </div>
      </div>
    </div>

    <div class="section-title">Mantenimiento</div>
    <div class="card" style="margin-bottom:24px;">
      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Borrar backtests por estrategia</div>
          <div class="setting-desc">Elimina el histórico de una sola estrategia. Útil para reimportar desde cero. No toca tu journal real.</div>
        </div>
        <div class="setting-control" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
          ${SHEETS.map(k => `<button class="btn danger" data-bti-wipe="${k}" ${stored[k] ? '' : 'disabled'}>${STRATEGIES[k].label} (${stored[k]})</button>`).join('')}
        </div>
      </div>

      <div class="setting-row">
        <div class="setting-info">
          <div class="setting-label">Borrar todo el backtesting</div>
          <div class="setting-desc">Elimina los backtests de las tres estrategias. Tus trades reales no se tocan. No se puede deshacer.</div>
        </div>
        <div class="setting-control" style="display:flex;justify-content:flex-end;">
          <button class="btn danger" id="btiWipeAll" ${stored.total ? '' : 'disabled'}>Borrar todo (${stored.total})</button>
        </div>
      </div>
    </div>
  `;

  wire(container);
}

function rowHtml(r, i, cols) {
  const st = rowStatus(r);
  return `<tr>
    <td style="color:var(--dim);font-family:var(--mono);font-size:10px;">${i + 1}</td>
    <td class="bti-st ${st.icon === '✓' ? 'ok' : st.icon ? 'warn' : ''}" data-st="${i}" title="${escAttr(st.title)}">${st.icon}</td>
    ${cols.map((c, ci) => `<td><input data-r="${i}" data-c="${ci}" value="${escAttr(r[c.key])}" placeholder="${escAttr(c.ph)}"></td>`).join('')}
    <td><button class="btn ghost danger" data-del-row="${i}" title="Quitar fila" style="padding:2px 7px;font-size:12px;">×</button></td>
  </tr>`;
}

function wire(container) {
  // Cambiar de estrategia en la rejilla
  container.querySelectorAll('[data-bti-sheet]').forEach(b => {
    b.addEventListener('click', () => { activeSheet = b.dataset.btiSheet; paint(container); });
  });

  // Cargar desde enlace
  const fetchBtn = container.querySelector('#btiFetch');
  if (fetchBtn) fetchBtn.addEventListener('click', async () => {
    const url = container.querySelector('#btiUrl').value.trim();
    if (!url) return;
    fetchBtn.disabled = true;
    fetchBtn.textContent = 'Cargando…';
    const { buckets: loaded, errors } = await fetchSheetBacktests(url);
    let total = 0;
    if (loaded) {
      for (const k of SHEETS) {
        buckets[k] = buckets[k].filter(r => !rowIsEmpty(r)).concat(loaded[k]);
        total += loaded[k].length;
      }
      const first = SHEETS.find(k => loaded[k].length);
      if (first) activeSheet = first;
    }
    lastMsg = errors.length
      ? { type: total ? 'ok' : 'err', text: `${total ? `Cargadas ${total} filas. ` : ''}${errors.join(' ')}` }
      : { type: 'ok', text: `Cargadas ${total} filas del Sheet (${SHEETS.map(k => `${STRATEGIES[k].label}: ${loaded[k].length}`).join(' · ')}). Revísalas y pulsa Importar.` };
    paint(container);
  });

  // Subir CSV(s)
  const fileEl = container.querySelector('#btiFile');
  if (fileEl) fileEl.addEventListener('change', async () => {
    let total = 0;
    const errs = [];
    for (const f of fileEl.files) {
      const text = await f.text();
      const { sheet, drafts, error } = parseCsvFile(text);
      if (error || !sheet) { errs.push(`${f.name}: ${error || 'estrategia no reconocida'}`); continue; }
      buckets[sheet] = buckets[sheet].filter(r => !rowIsEmpty(r)).concat(drafts);
      activeSheet = sheet;
      total += drafts.length;
    }
    lastMsg = errs.length
      ? { type: total ? 'ok' : 'err', text: `${total ? `Cargadas ${total} filas. ` : ''}${errs.join(' · ')}` }
      : { type: 'ok', text: `Cargadas ${total} filas del CSV. Revísalas y pulsa Importar.` };
    paint(container);
  });

  // Añadir filas / vaciar
  const addBtn = container.querySelector('#btiAddRows');
  if (addBtn) addBtn.addEventListener('click', () => {
    for (let i = 0; i < 10; i++) buckets[activeSheet].push(emptyRow());
    paint(container);
  });
  const clearBtn = container.querySelector('#btiClear');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    buckets[activeSheet] = [];
    paint(container);
  });

  const body = container.querySelector('#btiBody');
  if (body) {
    // Edición celda a celda (sin re-render para no perder el foco)
    body.addEventListener('input', e => {
      const inp = e.target.closest('input[data-r]');
      if (!inp) return;
      const r = +inp.dataset.r, c = +inp.dataset.c;
      const cols = COLS[activeSheet];
      if (!buckets[activeSheet][r]) return;
      buckets[activeSheet][r][cols[c].key] = inp.value;
      const st = rowStatus(buckets[activeSheet][r]);
      const stEl = body.querySelector(`[data-st="${r}"]`);
      if (stEl) { stEl.textContent = st.icon; stEl.title = st.title; stEl.className = `bti-st ${st.icon === '✓' ? 'ok' : st.icon ? 'warn' : ''}`; }
    });

    // Pegado tipo Excel: bloques/columnas se reparten desde la celda destino
    body.addEventListener('paste', e => {
      const inp = e.target.closest('input[data-r]');
      if (!inp) return;
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (!text || (!text.includes('\n') && !text.includes('\t'))) return;  // pegado normal de 1 celda
      e.preventDefault();
      const cols = COLS[activeSheet];
      const r0 = +inp.dataset.r, c0 = +inp.dataset.c;
      const lines = text.replace(/\r/g, '').split('\n');
      while (lines.length && lines[lines.length - 1] === '') lines.pop();
      lines.forEach((line, i) => {
        const cells = line.split('\t');
        const ri = r0 + i;
        while (buckets[activeSheet].length <= ri) buckets[activeSheet].push(emptyRow());
        cells.forEach((val, j) => {
          const ci = c0 + j;
          if (ci >= cols.length) return;
          buckets[activeSheet][ri][cols[ci].key] = val.trim();
        });
      });
      paint(container);
    });

    // Quitar fila
    body.addEventListener('click', e => {
      const del = e.target.closest('[data-del-row]');
      if (!del) return;
      buckets[activeSheet].splice(+del.dataset.delRow, 1);
      paint(container);
    });
  }

  // Importar todo
  const impBtn = container.querySelector('#btiImport');
  if (impBtn) impBtn.addEventListener('click', () => {
    const toImport = [];
    for (const k of SHEETS) {
      for (const r of buckets[k]) {
        if (rowIsEmpty(r)) continue;
        const bt = draftToBacktest(r, k);
        if (bt) toImport.push(bt);
      }
    }
    if (!toImport.length) return;
    const { added, dup } = state.addBacktestsMany(toImport);
    // Conservar solo las filas NO válidas (para corregirlas); lo importado se va
    for (const k of SHEETS) {
      buckets[k] = buckets[k].filter(r => !rowIsEmpty(r) && !draftToBacktest(r, k));
    }
    const restantes = SHEETS.reduce((s, k) => s + buckets[k].length, 0);
    lastMsg = {
      type: 'ok',
      text: `✓ Importados ${added} backtest${added !== 1 ? 's' : ''}${dup ? ` · ${dup} duplicado${dup !== 1 ? 's' : ''} omitido${dup !== 1 ? 's' : ''}` : ''}${restantes ? ` · quedan ${restantes} fila${restantes !== 1 ? 's' : ''} con avisos por corregir` : ''}. Ya están en sus pestañas de estrategia.`,
    };
    paint(container);
  });

  // ── Exportar el histórico ya guardado ──
  const expBtn = container.querySelector('#btiExport');
  if (expBtn) expBtn.addEventListener('click', async () => {
    if (!state.backtests.length) return;
    const original = expBtn.textContent;
    expBtn.disabled = true;
    expBtn.innerHTML = '<span class="spinner-sm"></span> Generando…';
    try {
      const who = state.viewAsProfile
        ? '-' + slug(state.viewAsProfile.nombre || state.viewAsProfile.email)
        : '';
      await exportXlsx(state.backtests, `tradinverso-backtesting${who}-${stampNow()}.xlsx`);
    } catch (e) {
      console.error('Export backtests XLSX falló:', e);
      lastMsg = { type: 'err', text: 'Error generando el Excel: ' + (e.message || e) };
      paint(container);
      return;
    } finally {
      expBtn.disabled = false;
      expBtn.textContent = original;
    }
  });

  // ── Borrar por estrategia ──
  container.querySelectorAll('[data-bti-wipe]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sheet = btn.dataset.btiWipe;
      const n = state.backtests.filter(b => b.sheet === sheet).length;
      if (!n) return;
      openModal({
        title: `Borrar backtests de ${STRATEGIES[sheet].label}`,
        body: `Vas a eliminar <strong>${n} backtest${n !== 1 ? 's' : ''}</strong> de ${STRATEGIES[sheet].label}.
               Las demás estrategias y <strong>tu journal real</strong> no se tocan.
               Esta acción <strong>no se puede deshacer</strong>. ¿Continuar?`,
        actions: [
          { label: 'Cancelar', onClick: close => close() },
          { label: `Sí, borrar ${n}`, variant: 'danger', onClick: close => {
            const removed = state.removeBacktestsBySheet(sheet);
            close();
            lastMsg = { type: 'ok', text: `✓ ${removed} backtest${removed !== 1 ? 's' : ''} de ${STRATEGIES[sheet].label} eliminados.` };
            paint(container);
          } },
        ],
      });
    });
  });

  // ── Borrar todo el backtesting ──
  const wipeAllBtn = container.querySelector('#btiWipeAll');
  if (wipeAllBtn) wipeAllBtn.addEventListener('click', () => {
    const n = state.backtests.length;
    if (!n) return;
    openModal({
      title: 'Borrar todo el backtesting',
      body: `Vas a eliminar <strong>los ${n} backtest${n !== 1 ? 's' : ''}</strong> de las tres estrategias.
             <strong>Tus trades reales del journal no se tocan.</strong>
             Esta acción <strong>no se puede deshacer</strong>. ¿Continuar?`,
      actions: [
        { label: 'Cancelar', onClick: close => close() },
        { label: `Sí, borrar los ${n}`, variant: 'danger', onClick: close => {
          const removed = state.wipeAllBacktests();
          close();
          lastMsg = { type: 'ok', text: `✓ ${removed} backtest${removed !== 1 ? 's' : ''} eliminados. El histórico de backtesting está vacío.` };
          paint(container);
        } },
      ],
    });
  });
}

// Backtests YA guardados (no las filas de la rejilla de arriba): es lo que
// alimenta los contadores de exportar y borrar.
function countStored() {
  const out = { total: state.backtests.length };
  for (const k of SHEETS) out[k] = state.backtests.filter(b => b.sheet === k).length;
  return out;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escAttr(s) {
  return esc(s);
}

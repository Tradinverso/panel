// Vista "Tabla de datos": editor tipo Excel para corregir trades en masa
// sin tener que abrir el modal de cada uno.
//
// Cada celda es un input/select inline; guarda en `state.update()` al hacer
// blur (Tab/Enter). NO se re-renderiza mientras hay un input enfocado para
// no romper el flujo de edición — el botón "↻ Refrescar" fuerza una recarga
// si necesitas sincronizar tras cambios externos.

import { state } from '../state.js';
import { TODAS as SENS_OPTIONS } from '../utils/sensaciones.js';
import { openModal } from '../components/modal.js';
import { openViewTradeModal } from '../components/trade-view-modal.js';
import { sortChrono } from '../utils/calculations.js';
import { parseTime, durationMinutes } from '../utils/date-helpers.js';

let filterSheet = 'all';
let filterResult = 'all';
let searchQuery = '';

export function tablaDatosView(container) {
  render(container);
  // Suscripción a cambios de estado, pero NO re-renderizamos si el usuario
  // está editando (preserva el foco en la celda).
  const unsub = state.on(() => {
    const focused = document.activeElement;
    if (focused && container.contains(focused) &&
        ['INPUT', 'SELECT', 'TEXTAREA'].includes(focused.tagName)) {
      return;
    }
    render(container);
  });
  return unsub;
}

function render(container) {
  const all = state.trades;

  const q = searchQuery.trim().toLowerCase();
  const filtered = all.filter(t => {
    if (filterSheet !== 'all' && t.sheet !== filterSheet) return false;
    if (filterResult !== 'all' && t.result !== filterResult) return false;
    if (q) {
      const zoneStr = Array.isArray(t.zone) ? t.zone.join(' ') : (t.zone || '');
      const entryStr = Array.isArray(t.entry) ? t.entry.join(' ') : (t.entry || '');
      const haystack = `${t.pair || ''} ${zoneStr} ${entryStr} ${t.reflexion || ''} ${t.sensacion || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
  // Más reciente primero
  const sorted = sortChrono(filtered).reverse();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Tabla de datos</h1>
        <div class="sub">${filtered.length} de ${all.length} trades · edita inline · guarda al pulsar Tab o salir de la celda</div>
      </div>
      <div class="page-actions">
        <button class="btn" id="td-refresh">↻ Refrescar</button>
      </div>
    </div>

    <div class="td-filters">
      <select id="td-sheet" class="select">
        <option value="all" ${filterSheet === 'all' ? 'selected' : ''}>Todas las estrategias</option>
        <option value="ZONAS" ${filterSheet === 'ZONAS' ? 'selected' : ''}>Zonas</option>
        <option value="LIQUIDEZ" ${filterSheet === 'LIQUIDEZ' ? 'selected' : ''}>Liquidez</option>
        <option value="NASDAQ" ${filterSheet === 'NASDAQ' ? 'selected' : ''}>Nasdaq</option>
      </select>
      <select id="td-result" class="select">
        <option value="all" ${filterResult === 'all' ? 'selected' : ''}>Todos los resultados</option>
        <option value="TP" ${filterResult === 'TP' ? 'selected' : ''}>Solo TP</option>
        <option value="SL" ${filterResult === 'SL' ? 'selected' : ''}>Solo SL</option>
        <option value="BE" ${filterResult === 'BE' ? 'selected' : ''}>Solo BE</option>
      </select>
      <input type="search" id="td-search" class="form-input" placeholder="🔍 Buscar (par, zona, entrada, reflexión, sensación)…" value="${escAttr(searchQuery)}" autocomplete="off">
    </div>

    ${all.length === 0
      ? '<div class="empty"><div class="big">📋</div><div>Aún no hay trades. Impórtalos o créalos primero.</div></div>'
      : filtered.length === 0
      ? '<div class="empty">Ningún trade coincide con los filtros.</div>'
      : `<div class="td-table-wrap">
          <table class="td-table">
            <thead>
              <tr>
                <th></th>
                <th></th>
                <th>Fecha</th>
                <th>Apert.</th>
                <th>Cierre</th>
                <th>Estrategia</th>
                <th>Par</th>
                <th>Setup</th>
                <th>Zona</th>
                <th>Entrada</th>
                <th>Sensación</th>
                <th>% P&L sist.</th>
                <th>Riesgo real</th>
                <th>RR</th>
                <th>Pips</th>
                <th>URL1</th>
                <th>URL2</th>
                <th>Reflexión</th>
                <th>Cuentas</th>
                <th>Result.</th>
              </tr>
            </thead>
            <tbody>${sorted.map(t => renderRow(t)).join('')}</tbody>
          </table>
        </div>`}
  `;

  // Filtros
  container.querySelector('#td-sheet').addEventListener('change', e => {
    filterSheet = e.target.value;
    render(container);
  });
  container.querySelector('#td-result').addEventListener('change', e => {
    filterResult = e.target.value;
    render(container);
  });
  const searchEl = container.querySelector('#td-search');
  searchEl.addEventListener('input', e => {
    searchQuery = e.target.value;
    render(container);
    const newEl = container.querySelector('#td-search');
    if (newEl) {
      newEl.focus();
      const len = newEl.value.length;
      newEl.setSelectionRange(len, len);
    }
  });
  container.querySelector('#td-refresh').addEventListener('click', () => render(container));

  // Event delegation para la tabla
  const tableEl = container.querySelector('.td-table');
  if (tableEl) {
    tableEl.addEventListener('change', e => handleCellChange(e));
    tableEl.addEventListener('click', e => handleRowAction(e));
  }
}

function renderRow(t) {
  const id = t.id;
  const numAccs = Array.isArray(t.accounts) ? t.accounts.length : 0;
  return `
    <tr data-trade-id="${id}">
      <td><button class="td-action view" data-action="view" data-id="${id}" title="Ver trade completo">👁️</button></td>
      <td><button class="td-action del" data-action="del" data-id="${id}" title="Eliminar trade">🗑</button></td>
      <td><input type="date" data-field="date" value="${escAttr(t.date)}"></td>
      <td><input type="time" data-field="open_str" value="${escAttr(t.open_str || '')}"></td>
      <td><input type="time" data-field="close_str" value="${escAttr(t.close_str || '')}"></td>
      <td>
        <select data-field="sheet">
          <option value="ZONAS" ${t.sheet === 'ZONAS' ? 'selected' : ''}>Zonas</option>
          <option value="LIQUIDEZ" ${t.sheet === 'LIQUIDEZ' ? 'selected' : ''}>Liquidez</option>
          <option value="NASDAQ" ${t.sheet === 'NASDAQ' ? 'selected' : ''}>Nasdaq</option>
        </select>
      </td>
      <td><input type="text" data-field="pair" value="${escAttr(t.pair || '')}" class="td-w-80"></td>
      <td>
        <select data-field="setup">
          <option value="LONG" ${t.setup === 'LONG' ? 'selected' : ''}>LONG</option>
          <option value="SHORT" ${t.setup === 'SHORT' ? 'selected' : ''}>SHORT</option>
        </select>
      </td>
      <td><input type="text" data-field="zone" value="${escAttr(Array.isArray(t.zone) ? t.zone.join(', ') : (t.zone || ''))}" class="td-w-100" title="Separar varios con coma"></td>
      <td><input type="text" data-field="entry" value="${escAttr(Array.isArray(t.entry) ? t.entry.join(', ') : (t.entry || ''))}" class="td-w-100" title="Separar varios con coma"></td>
      <td>
        <select data-field="sensacion">
          <option value="">—</option>
          ${SENS_OPTIONS.map(s => `<option value="${escAttr(s)}" ${t.sensacion === s ? 'selected' : ''}>${escHtml(s)}</option>`).join('')}
        </select>
      </td>
      <td><input type="number" step="0.01" data-field="pnl_pct" value="${t.pnl_pct != null ? t.pnl_pct : ''}" class="td-w-70"></td>
      <td><input type="number" step="0.01" min="0" data-field="risk_real_pct" value="${t.risk_real_pct != null ? t.risk_real_pct : ''}" class="td-w-70"></td>
      <td><input type="number" step="0.1" data-field="rr" value="${t.rr != null ? t.rr : ''}" class="td-w-60"></td>
      <td><input type="number" step="0.1" data-field="pips" value="${t.pips != null ? t.pips : ''}" class="td-w-60"></td>
      <td><input type="url" data-field="url1" value="${escAttr(t.url1 || '')}" class="td-w-140"></td>
      <td><input type="url" data-field="url2" value="${escAttr(t.url2 || '')}" class="td-w-140"></td>
      <td><input type="text" data-field="reflexion" value="${escAttr(t.reflexion || '')}" class="td-w-240"></td>
      <td class="td-accs">${numAccs}</td>
      <td class="td-result"><span class="res-pill res-${(t.result || '').toLowerCase()}">${t.result || '–'}</span></td>
    </tr>
  `;
}

function handleCellChange(e) {
  const el = e.target;
  if (!el.dataset || !el.dataset.field) return;
  const tr = el.closest('tr');
  if (!tr) return;
  const id = tr.dataset.tradeId;
  const trade = state.trades.find(t => t.id === id);
  if (!trade) return;

  const field = el.dataset.field;
  let value = el.value;

  // Parse arrays (zone, entry) — separados por coma
  if (field === 'zone' || field === 'entry') {
    value = String(value).split(',').map(s => s.trim()).filter(Boolean);
  }

  // Parse números
  const numericFields = ['pnl_pct', 'risk_real_pct', 'rr', 'pips'];
  if (numericFields.includes(field)) {
    if (value === '') {
      // Opcionales (rr, pips) → null; obligatorios (pnl_pct, risk_real_pct) → 0/1
      if (field === 'rr' || field === 'pips') value = null;
      else if (field === 'risk_real_pct') value = 1;
      else value = 0;
    } else {
      const n = parseFloat(value);
      if (isNaN(n)) {
        flash(el, 'error');
        return;
      }
      value = n;
    }
  }

  // Patch base
  const patch = { [field]: value };

  // Derivar campos dependientes
  if (field === 'pnl_pct') {
    const pnl = value;
    patch.result = pnl > 0.2 ? 'TP' : pnl < -0.2 ? 'SL' : 'BE';
  }
  if (field === 'open_str' || field === 'close_str') {
    const openStr = field === 'open_str' ? value : trade.open_str;
    const closeStr = field === 'close_str' ? value : trade.close_str;
    patch.open_hour = parseTime(openStr);
    patch.dur = durationMinutes(openStr, closeStr);
  }

  state.update(id, patch);
  flash(el, 'saved');

  // Si cambió el resultado, actualizamos la pildora visualmente (sin re-render completo)
  if (field === 'pnl_pct') {
    const updated = state.trades.find(t => t.id === id);
    if (updated) {
      const pill = tr.querySelector('.res-pill');
      if (pill) {
        pill.className = `res-pill res-${(updated.result || '').toLowerCase()}`;
        pill.textContent = updated.result || '–';
      }
    }
  }
}

function handleRowAction(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const t = state.trades.find(x => x.id === id);
  if (!t) return;

  if (action === 'view') {
    openViewTradeModal(t);
  } else if (action === 'del') {
    openModal({
      title: 'Eliminar trade',
      meta: `${t.date} · ${t.pair || ''} · ${t.setup || ''}`,
      body: '¿Seguro que quieres eliminar este trade? Esta acción no se puede deshacer.',
      actions: [
        { label: 'Cancelar', onClick: close => close() },
        { label: 'Eliminar', variant: 'danger', onClick: close => { state.remove(id); close(); } },
      ],
    });
  }
}

function flash(el, type) {
  el.classList.remove('td-saved', 'td-error');
  // Reflow para reiniciar la animación
  void el.offsetWidth;
  el.classList.add(type === 'error' ? 'td-error' : 'td-saved');
  setTimeout(() => el.classList.remove('td-saved', 'td-error'), 900);
}

function escAttr(s) {
  return String(s == null ? '' : s).replace(/"/g, '&quot;');
}
function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));
}

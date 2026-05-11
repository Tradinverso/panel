import { formatDateShort } from '../utils/date-helpers.js';
import { fmtPct } from '../utils/number-format-es.js';
import { sortChrono, tradeRealPnl } from '../utils/calculations.js';
import { openModal } from './modal.js';
import { openViewTradeModal } from './trade-view-modal.js';
import { state } from '../state.js';

const STRAT_LABEL = { ZONAS: 'Zonas', LIQUIDEZ: 'Liquidez', NASDAQ: 'Nasdaq' };
const STRAT_CLS = { ZONAS: 'zonas', LIQUIDEZ: 'liquidez', NASDAQ: 'nasdaq' };

export function renderTradeTable(container, trades, opts = {}) {
  const { canDelete = false, emptyMsg = 'No hay trades.', showFilters = true } = opts;

  if (!trades.length) {
    container.innerHTML = `<div class="empty"><div>${emptyMsg}</div></div>`;
    return;
  }

  // Detectar qué filtros tiene sentido mostrar según los datos
  const sheets = [...new Set(trades.map(t => t.sheet))];
  const setups = [...new Set(trades.map(t => t.setup).filter(Boolean))];
  const pairs = [...new Set(trades.map(t => t.pair).filter(Boolean))];
  const zones = [...new Set(trades.map(t => t.zone).filter(Boolean))].sort();
  const entries = [...new Set(trades.map(t => t.entry).filter(Boolean))].sort();
  const sensaciones = [...new Set(trades.map(t => t.sensacion).filter(Boolean))];
  const accountIds = [...new Set(trades.flatMap(t =>
    Array.isArray(t.accounts) ? t.accounts.map(a => a.accountId) : []
  ))];

  // Estado de filtros (privado al componente)
  let filters = {
    sheet: 'all', result: 'all', setup: 'all',
    pair: 'all', zone: 'all', entry: 'all',
    sens: 'all', account: 'all',
  };

  function applyFilters() {
    return trades.filter(t => {
      if (filters.sheet !== 'all' && t.sheet !== filters.sheet) return false;
      if (filters.result !== 'all' && t.result !== filters.result) return false;
      if (filters.setup !== 'all' && t.setup !== filters.setup) return false;
      if (filters.pair !== 'all' && t.pair !== filters.pair) return false;
      if (filters.zone !== 'all' && t.zone !== filters.zone) return false;
      if (filters.entry !== 'all' && t.entry !== filters.entry) return false;
      if (filters.sens !== 'all') {
        if (filters.sens === '_empty' && t.sensacion) return false;
        if (filters.sens !== '_empty' && t.sensacion !== filters.sens) return false;
      }
      if (filters.account !== 'all') {
        const has = Array.isArray(t.accounts)
          && t.accounts.some(a => a.accountId === filters.account);
        if (filters.account === '_none') {
          if (Array.isArray(t.accounts) && t.accounts.length > 0) return false;
        } else if (!has) return false;
      }
      return true;
    });
  }

  function paint() {
    const filtered = applyFilters();
    const filterBar = showFilters ? renderFilterBar(filtered.length) : '';
    const tableHtml = renderTable(filtered);
    container.innerHTML = filterBar + tableHtml;
    if (showFilters) wireFilters();
    wireRowActions(filtered);
  }

  function renderFilterBar(filteredCount) {
    const showSheet = sheets.length > 1;
    const showSetup = setups.length > 1;
    const showPair = pairs.length > 1;
    const showZone = zones.length > 1;
    const showEntry = entries.length > 1;
    const showSens = sensaciones.length > 0;
    const showAccount = accountIds.length > 0;
    const hasActiveFilters = Object.values(filters).some(v => v !== 'all');

    return `
      <div class="filter-bar">
        ${showSheet ? sel('sheet', filters.sheet, [
          { v: 'all', l: 'Todas las estrategias' },
          ...sheets.map(s => ({ v: s, l: STRAT_LABEL[s] || s })),
        ]) : ''}
        ${sel('result', filters.result, [
          { v: 'all', l: 'Todos los resultados' },
          { v: 'TP', l: 'Solo TP' },
          { v: 'SL', l: 'Solo SL' },
          { v: 'BE', l: 'Solo BE' },
        ])}
        ${showSetup ? sel('setup', filters.setup, [
          { v: 'all', l: 'Todas las direcciones' },
          ...setups.map(s => ({ v: s, l: s })),
        ]) : ''}
        ${showPair ? sel('pair', filters.pair, [
          { v: 'all', l: 'Todos los pares' },
          ...pairs.map(p => ({ v: p, l: p })),
        ]) : ''}
        ${showZone ? sel('zone', filters.zone, [
          { v: 'all', l: 'Todas las zonas' },
          ...zones.map(z => ({ v: z, l: z })),
        ]) : ''}
        ${showEntry ? sel('entry', filters.entry, [
          { v: 'all', l: 'Todas las entradas' },
          ...entries.map(e => ({ v: e, l: e })),
        ]) : ''}
        ${showSens ? sel('sens', filters.sens, [
          { v: 'all', l: 'Todas las sensaciones' },
          ...sensaciones.map(s => ({ v: s, l: s })),
          { v: '_empty', l: '— Sin sensación —' },
        ]) : ''}
        ${showAccount ? sel('account', filters.account, [
          { v: 'all', l: 'Todas las cuentas' },
          ...accountIds.map(id => {
            const c = state.cuentas.find(x => x.id === id);
            return { v: id, l: c ? `${c.empresa} ${capShort(c.capital)}` : '?' };
          }),
          { v: '_none', l: '— Sin asignar —' },
        ]) : ''}
        ${hasActiveFilters ? '<button class="btn ghost" data-clear-filters>× Limpiar filtros</button>' : ''}
        <span class="filter-count">${filteredCount} de ${trades.length} trades</span>
      </div>
    `;
  }

  function sel(name, value, options) {
    return `<select class="select filter-select" data-filter="${name}">
      ${options.map(o => `<option value="${o.v}" ${o.v === value ? 'selected' : ''}>${escAttr(o.l)}</option>`).join('')}
    </select>`;
  }

  function renderTable(filtered) {
    // Más reciente arriba: ordenamos cronológicamente y luego invertimos.
    const sorted = sortChrono(filtered).reverse();
    const colspan = canDelete ? 16 : 15;
    const bodyContent = sorted.length
      ? sorted.map(t => row(t, canDelete)).join('')
      : `<tr><td colspan="${colspan}" class="empty" style="padding:30px;">Ningún trade coincide con los filtros</td></tr>`;
    return `
      <div class="trade-table-wrap">
        <table class="trade-table">
          <thead>
            <tr>
              <th></th>
              <th>Fecha</th>
              <th>Hora</th>
              <th>Estrategia</th>
              <th>Activo</th>
              <th>Setup</th>
              <th>Zona</th>
              <th>Entrada</th>
              <th>Sensación</th>
              <th>Cuentas</th>
              <th>Resultado</th>
              <th>Dur.</th>
              <th>% P&L sistema</th>
              <th>% P&L real</th>
              <th>Links</th>
              ${canDelete ? '<th></th>' : ''}
            </tr>
          </thead>
          <tbody>${bodyContent}</tbody>
        </table>
      </div>
    `;
  }

  function wireFilters() {
    container.querySelectorAll('[data-filter]').forEach(s => {
      s.addEventListener('change', () => {
        filters[s.dataset.filter] = s.value;
        paint();
      });
    });
    const clear = container.querySelector('[data-clear-filters]');
    if (clear) clear.addEventListener('click', () => {
      filters = {
        sheet: 'all', result: 'all', setup: 'all',
        pair: 'all', zone: 'all', entry: 'all',
        sens: 'all', account: 'all',
      };
      paint();
    });
  }

  function wireRowActions(filtered) {
    container.querySelectorAll('.view-btn').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.dataset.id;
        const t = filtered.find(x => x.id === id);
        if (!t) return;
        openViewTradeModal(t);
      });
    });

    if (canDelete) {
      container.querySelectorAll('.del-btn').forEach(b => {
        b.addEventListener('click', () => {
          const id = b.dataset.id;
          openModal({
            title: 'Eliminar trade',
            body: '¿Seguro que quieres eliminar este trade? Esta acción no se puede deshacer.',
            actions: [
              { label: 'Cancelar', onClick: close => close() },
              { label: 'Eliminar', variant: 'danger', onClick: close => { state.remove(id); close(); } },
            ],
          });
        });
      });
    }
  }

  paint();
}

function row(t, canDelete) {
  const sens = t.sensacion ? `<span class="sens-pill" data-s="${t.sensacion}">${t.sensacion}</span>` : '<span style="color:var(--dim)">–</span>';

  // Cuentas: solo la primera + "+N" si hay más. El detalle completo se ve en el modal del ojo.
  function badgeFor(a) {
    const c = state.cuentas.find(x => x.id === a.accountId);
    const label = c ? (c.empresa.substring(0, 4).toUpperCase() + (c.capital >= 1000 ? Math.round(c.capital / 1000) + 'K' : '')) : '?';
    const title = c ? `${c.empresa} ${c.numero || ''} · ${a.riskPct}%` : 'Cuenta no encontrada';
    return `<span class="acc-badge" title="${escAttr(title)}">${label}</span>`;
  }
  let cuentas;
  if (Array.isArray(t.accounts) && t.accounts.length) {
    if (t.accounts.length === 1) {
      cuentas = badgeFor(t.accounts[0]);
    } else {
      const first = badgeFor(t.accounts[0]);
      const extra = t.accounts.length - 1;
      const restNames = t.accounts.slice(1).map(a => {
        const cc = state.cuentas.find(x => x.id === a.accountId);
        return cc ? `${cc.empresa} ${capShort(cc.capital)}${cc.numero ? ' #' + cc.numero : ''} · ${a.riskPct}%` : '?';
      }).join('\n');
      cuentas = `${first}<span class="acc-badge acc-more" title="${escAttr(restNames)}">+${extra}</span>`;
    }
  } else {
    cuentas = '<span style="color:var(--dim)">–</span>';
  }
  const links = (t.url1 || t.url2)
    ? [
        t.url1 ? `<a class="url-icon" href="${escAttr(t.url1)}" target="_blank" rel="noopener" title="${t.sheet === 'ZONAS' ? 'TradingView' : 'HTF'}">${t.sheet === 'ZONAS' ? 'L' : 'H'}</a>` : '',
        t.url2 ? `<a class="url-icon" href="${escAttr(t.url2)}" target="_blank" rel="noopener" title="LTF">L</a>` : '',
      ].join('')
    : '<span style="color:var(--dim)">–</span>';
  const dur = t.dur != null ? t.dur + 'm' : '–';
  const pct = t.result === 'BE' ? '<span style="color:var(--orange)">0.00%</span>' : `<span style="color:${t.pnl_pct >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtPct(t.pnl_pct)}</span>`;
  const realPnl = tradeRealPnl(t);
  const pctReal = t.result === 'BE'
    ? '<span style="color:var(--orange)">0.00%</span>'
    : `<span style="color:${realPnl >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtPct(realPnl)}</span>`;
  const viewBtn = `<button class="view-btn" data-id="${t.id}" title="Ver trade completo">👁️</button>`;
  const delTd = canDelete
    ? `<td><button class="btn ghost danger del-btn" data-id="${t.id}" style="padding:4px 8px;font-size:11px;">×</button></td>`
    : '';
  return `
    <tr>
      <td>${viewBtn}</td>
      <td>${formatDateShort(t.date)}</td>
      <td>${t.open_str || '–'}</td>
      <td><span class="strat-pill ${STRAT_CLS[t.sheet]}">${STRAT_LABEL[t.sheet] || t.sheet}</span></td>
      <td>${t.pair || '–'}</td>
      <td>${t.setup || '–'}</td>
      <td>${t.zone || '–'}</td>
      <td>${t.entry || '–'}</td>
      <td>${sens}</td>
      <td>${cuentas}</td>
      <td><span class="res-pill res-${t.result.toLowerCase()}">${t.result}</span></td>
      <td>${dur}</td>
      <td>${pct}</td>
      <td>${pctReal}</td>
      <td>${links}</td>
      ${delTd}
    </tr>
  `;
}

function capShort(c) {
  if (c >= 1000) return Math.round(c / 1000) + 'K';
  return String(c);
}

function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }

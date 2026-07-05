// Vista "Contabilidad" — el negocio prop: dinero invertido (compras / reintentos)
// vs retorno (payouts). KPIs (ROI, funding ratio, contadores), gráfico mensual,
// calendario de eventos, y pestañas Resumen / Calendario / Retiros / Compras.
// Independiente de la operativa: NO requiere asignar trades a las cuentas.

import { state } from '../state.js';
import { openModal } from '../components/modal.js';
import { kpiCard } from '../components/kpi-card.js';
import { openPurchaseModal } from '../components/purchase-modal.js';
import { openWithdrawalModal } from '../components/withdrawal-modal.js';
import { openCuentaEditModal, confirmDeleteCuenta } from '../components/cuenta-edit-modal.js';
import {
  fmtUsd, totalInvested, investmentStats, monthlyInvested, empresaStats,
  totalWithdrawn, totalWithdrawnNet, portfolioMonthlyWithdrawals,
  allWithdrawals, allPurchases, accountingEvents,
} from '../utils/account-stats.js';
import { MONTHS_ES_SHORT, MONTHS_ES, formatDateShort } from '../utils/date-helpers.js';

let activeTab = 'resumen';   // resumen | empresas | calendario | retiros | compras
let yearFilter = 'all';
let monthFilter = 'all';
let filterCuenta = 'all';
let empresaSel = '';         // pestaña Empresas: prop seleccionada ('' = ninguna)
let sortBy = 'beneficio';    // beneficio | estado | invertido | roi
let calAll = false;          // calendario: ver todos los eventos (lista) en vez de la rejilla
let calYear = null, calMonth = null;

const STATUS_LABEL = { activa: 'Activa', pausada: 'Pausada', pasada: 'Pasada', perdida: 'Quemada' };
const CONCEPT_LABEL = { challenge: 'Challenge', reset: 'Reset', reintento: 'Reintento', suscripcion: 'Suscripción', otro: 'Otro' };
const fmtRoi = v => !isFinite(v) ? '∞' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';

function currentRange() {
  if (monthFilter !== 'all') return { from: monthFilter + '-01', to: monthFilter + '-31' };
  if (yearFilter !== 'all') return { from: yearFilter + '-01-01', to: yearFilter + '-12-31' };
  return null;
}
function inRange(date) {
  const r = currentRange();
  if (!r) return true;
  return date >= r.from && date <= r.to;
}

function render(container) {
  const cuentas = state.cuentas;
  const dates = [...allPurchases(cuentas), ...allWithdrawals(cuentas)].map(x => x.date || '').filter(Boolean);
  const years = [...new Set(dates.map(d => d.substring(0, 4)))].sort();
  const months = [...new Set(dates.map(d => d.substring(0, 7)))].sort()
    .filter(m => yearFilter === 'all' || m.startsWith(yearFilter));

  const showPeriod = activeTab !== 'calendario';
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Contabilidad</h1>
        <div class="sub">Negocio prop · inversión y retorno</div>
      </div>
      <div class="page-actions">
        ${showPeriod ? `
        <select id="invYear" class="select">
          <option value="all" ${yearFilter === 'all' ? 'selected' : ''}>Todos los años</option>
          ${years.map(y => `<option value="${y}" ${yearFilter === y ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
        <select id="invMonth" class="select">
          <option value="all" ${monthFilter === 'all' ? 'selected' : ''}>Todos los meses</option>
          ${months.map(m => { const [y, mo] = m.split('-'); return `<option value="${m}" ${monthFilter === m ? 'selected' : ''}>${MONTHS_ES[+mo - 1]} ${y}</option>`; }).join('')}
        </select>` : ''}
        <button class="btn" id="invNueva">+ Nueva cuenta</button>
        <button class="btn" id="invRetiro">+ Retiro</button>
        <button class="btn primary" id="invCompra">+ Compra</button>
      </div>
    </div>

    ${cuentas.length === 0 ? emptyState() : `
      <div class="rg-tabs" id="invTabs">
        <button class="rg-tab ${activeTab === 'resumen' ? 'active' : ''}" data-tab="resumen">Resumen</button>
        <button class="rg-tab ${activeTab === 'empresas' ? 'active' : ''}" data-tab="empresas">Empresas</button>
        <button class="rg-tab ${activeTab === 'calendario' ? 'active' : ''}" data-tab="calendario">Calendario</button>
        <button class="rg-tab ${activeTab === 'retiros' ? 'active' : ''}" data-tab="retiros">Retiros</button>
        <button class="rg-tab ${activeTab === 'compras' ? 'active' : ''}" data-tab="compras">Compras</button>
      </div>
      <div id="invPanel"></div>
    `}
  `;

  // Wire header
  const yearSel = container.querySelector('#invYear');
  if (yearSel) yearSel.addEventListener('change', e => { yearFilter = e.target.value; monthFilter = 'all'; render(container); });
  const monthSel = container.querySelector('#invMonth');
  if (monthSel) monthSel.addEventListener('change', e => { monthFilter = e.target.value; render(container); });
  container.querySelector('#invNueva').addEventListener('click', () => openCuentaEditModal(null));
  container.querySelector('#invCompra').addEventListener('click', () => openPurchaseModal(null));
  container.querySelector('#invRetiro').addEventListener('click', () => openRetiroChooser());

  if (cuentas.length) {
    container.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { activeTab = b.dataset.tab; render(container); }));
    renderPanel(container);
  }
}

function renderPanel(container) {
  const panel = container.querySelector('#invPanel');
  if (!panel) return;
  if (activeTab === 'resumen') { panel.innerHTML = renderResumen(); wireResumen(container); requestAnimationFrame(() => paintChart(container)); }
  else if (activeTab === 'empresas') { panel.innerHTML = renderEmpresas(); wireEmpresas(container); }
  else if (activeTab === 'calendario') { panel.innerHTML = renderCalendario(); wireCalendario(container); }
  else if (activeTab === 'retiros') { panel.innerHTML = renderLista('retiros'); wireLista(container); }
  else { panel.innerHTML = renderLista('compras'); wireLista(container); }
}

// Ranking de props (agregado por empresa), ordenado por beneficio.
function renderRankingProps(cuentas) {
  const props = empresaStats(cuentas, currentRange());
  if (!props.length) return `<div class="prop-empty">No hay datos de props para el periodo seleccionado.</div>`;
  return `<div class="prop-rank">${props.map((p, i) => `
    <div class="prop-row">
      <div class="prop-rank-n">${i + 1}</div>
      <div class="prop-main">
        <div class="prop-name">${esc(p.empresa)}</div>
        <div class="prop-meta">
          <span>Retiradas <b>${fmtUsd(p.retiradoBruto)}</b></span>
          <span>Coste <b>${fmtUsd(p.invertido)}</b></span>
          <span>Media retiro <b>${fmtUsd(p.mediaRetiro)}</b></span>
          <span>${p.nCuentas} cuenta${p.nCuentas !== 1 ? 's' : ''} · ${p.fondeadas} fondeada${p.fondeadas !== 1 ? 's' : ''}</span>
        </div>
      </div>
      <div class="prop-ben ${p.beneficio >= 0 ? 'pos' : 'neg'}">${fmtUsd(p.beneficio, true)}</div>
    </div>`).join('')}</div>`;
}

function renderResumen() {
  const cuentas = state.cuentas;
  const s = investmentStats(cuentas, currentRange());
  const periodNote = currentRange() ? ' · periodo seleccionado' : '';
  return `
    <div class="kpi-grid">
      ${kpiCard({ label: 'Gastos totales', value: '-' + fmtUsd(s.gastosTotales), sub: 'compras' + periodNote, tone: 'red', icon: '🏦' })}
      ${kpiCard({ label: 'Ganancias (payouts)', value: fmtUsd(s.gananciasBrutas), sub: s.comisiones > 0 ? fmtUsd(s.comisiones) + ' en comisiones' : 'retiros brutos', tone: 'green', icon: '💵' })}
      ${kpiCard({ label: 'Beneficio neto', value: fmtUsd(s.beneficioNeto, true), sub: 'payouts netos − gastos', tone: s.beneficioNeto >= 0 ? 'green' : 'red', icon: '📈' })}
      ${kpiCard({ label: 'ROI', value: fmtRoi(s.roi), sub: 'beneficio ÷ gastos', tone: s.roi >= 0 ? 'green' : 'red', icon: '🎯' })}
      ${kpiCard({ label: 'Funding ratio', value: s.fundingRatio.toFixed(1) + '%', sub: `${s.fondeadas} fondeada${s.fondeadas !== 1 ? 's' : ''} de ${s.evaluaciones}`, tone: 'blue', icon: '⚡' })}
      ${kpiCard({ label: 'Cuentas live', value: `${s.live}`, sub: 'fondeadas activas', tone: 'purple', icon: '🟢' })}
    </div>

    <div class="bento">
      <div class="card col-7">
        <div class="card-title">Evolución mensual</div>
        <div class="card-sub">Comparativa de gastos (compras) vs ganancias (payouts)${periodNote}</div>
        <div class="chart-wrap" style="height:300px;"><canvas id="invChart"></canvas></div>
      </div>
      <div class="card col-5">
        <div class="card-title">Ranking de props</div>
        <div class="card-sub">Orden por beneficio acumulado${periodNote}</div>
        ${renderRankingProps(cuentas)}
      </div>
    </div>

    <div class="section-title-row">
      <div class="section-title" style="margin:0;">Detalle por cuenta</div>
      <select id="invSort" class="select">
        <option value="beneficio" ${sortBy === 'beneficio' ? 'selected' : ''}>Ordenar: Beneficio</option>
        <option value="estado" ${sortBy === 'estado' ? 'selected' : ''}>Ordenar: Estado</option>
        <option value="invertido" ${sortBy === 'invertido' ? 'selected' : ''}>Ordenar: Invertido</option>
        <option value="roi" ${sortBy === 'roi' ? 'selected' : ''}>Ordenar: ROI</option>
      </select>
    </div>
    <div class="card table-card" style="padding:0;">
      <table class="data-table inv-table">
        <thead><tr><th>Cuenta</th><th>Estado</th><th>Invertido</th><th>Payouts</th><th>Neto</th><th>Beneficio</th><th>ROI</th><th>Acciones</th></tr></thead>
        <tbody>${accountRows(cuentas)}</tbody>
      </table>
    </div>`;
}

const ST_ORDER = { activa: 0, pausada: 1, pasada: 2, perdida: 3 };
function sortCuentas(cuentas) {
  const ben = c => totalWithdrawnNet(c) - totalInvested(c);
  const roiVal = c => { const inv = totalInvested(c); const r = inv > 0 ? ben(c) / inv : (ben(c) > 0 ? Infinity : 0); return isFinite(r) ? r : 1e9; };
  const arr = [...cuentas];
  if (sortBy === 'estado') arr.sort((a, b) => (ST_ORDER[a.status] ?? 9) - (ST_ORDER[b.status] ?? 9) || ben(b) - ben(a));
  else if (sortBy === 'invertido') arr.sort((a, b) => totalInvested(b) - totalInvested(a));
  else if (sortBy === 'roi') arr.sort((a, b) => roiVal(b) - roiVal(a));
  else arr.sort((a, b) => ben(b) - ben(a));
  return arr;
}

function accountRows(cuentas) {
  const sorted = sortCuentas(cuentas);
  return sorted.map(c => {
    const inv = totalInvested(c);
    const bruto = totalWithdrawn(c);
    const neto = totalWithdrawnNet(c);
    const ben = neto - inv;
    const roi = inv > 0 ? (ben / inv) * 100 : (ben > 0 ? Infinity : 0);
    return `
      <tr>
        <td><div style="font-weight:600;">${esc(c.empresa)} ${esc(c.numero || '')}</div><span style="font-size:10px;color:var(--muted);font-family:var(--mono);">${esc(c.tipo)}</span></td>
        <td><span class="badge st-${c.status}">${STATUS_LABEL[c.status] || c.status}</span></td>
        <td class="mono">${fmtUsd(inv)}</td>
        <td class="mono">${fmtUsd(bruto)}</td>
        <td class="mono">${fmtUsd(neto)}</td>
        <td class="mono" style="color:${ben >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:600;">${fmtUsd(ben, true)}</td>
        <td class="mono" style="color:${roi >= 0 ? 'var(--green)' : 'var(--red)'};">${fmtRoi(roi)}</td>
        <td style="text-align:right;white-space:nowrap;">
          ${(c.fase !== 'fondeada' && c.status !== 'perdida') ? `<button class="btn ghost" data-cont-advance="${c.id}" title="Superar fase" style="padding:4px 7px;font-size:11px;">✓</button>` : ''}
          ${(c.fase !== 'fondeada' && c.status !== 'perdida') ? `<button class="btn ghost" data-cont-fondeada="${c.id}" title="Pasar a Fondeada directamente" style="padding:4px 7px;font-size:11px;">★</button>` : ''}
          ${(c.fase === 'fondeada' && c.status !== 'perdida') ? `<button class="btn ghost" data-cont-retiro="${c.id}" title="Registrar retiro" style="padding:4px 7px;font-size:11px;">💵</button>` : ''}
          ${c.status !== 'perdida' ? `<button class="btn ghost danger" data-cont-quemada="${c.id}" title="Marcar quemada" style="padding:4px 7px;font-size:11px;">✗</button>` : ''}
          <button class="btn ghost" data-cont-edit="${c.id}" title="Editar cuenta" style="padding:4px 7px;font-size:11px;">✏️</button>
          <button class="btn ghost danger" data-cont-delete="${c.id}" title="Borrar cuenta" style="padding:4px 7px;font-size:11px;">🗑</button>
        </td>
      </tr>`;
  }).join('');
}

function wireResumen(container) {
  const sortSel = container.querySelector('#invSort');
  if (sortSel) sortSel.addEventListener('change', e => { sortBy = e.target.value; render(container); });
  container.querySelectorAll('[data-cont-advance]').forEach(b =>
    b.addEventListener('click', () => state.advanceFase(b.dataset.contAdvance)));
  container.querySelectorAll('[data-cont-fondeada]').forEach(b =>
    b.addEventListener('click', () => {
      const c = state.cuentas.find(x => x.id === b.dataset.contFondeada);
      if (!c) return;
      openModal({
        title: 'Pasar a Fondeada',
        body: `¿Pasar <strong>${esc(c.empresa)} ${esc(c.numero || '')}</strong> directamente a <strong>Fondeada</strong> (saltando fases)?`,
        actions: [
          { label: 'Cancelar', onClick: cl => cl() },
          { label: 'Sí, a Fondeada', variant: 'primary', onClick: cl => { state.markFondeada(c.id); cl(); } },
        ],
      });
    }));
  container.querySelectorAll('[data-cont-retiro]').forEach(b =>
    b.addEventListener('click', () => {
      const c = state.cuentas.find(x => x.id === b.dataset.contRetiro);
      if (c) openWithdrawalModal(c);
    }));
  container.querySelectorAll('[data-cont-edit]').forEach(b =>
    b.addEventListener('click', () => {
      const c = state.cuentas.find(x => x.id === b.dataset.contEdit);
      if (c) openCuentaEditModal(c);
    }));
  container.querySelectorAll('[data-cont-delete]').forEach(b =>
    b.addEventListener('click', () => {
      const c = state.cuentas.find(x => x.id === b.dataset.contDelete);
      if (c) confirmDeleteCuenta(c);
    }));
  container.querySelectorAll('[data-cont-quemada]').forEach(b =>
    b.addEventListener('click', () => {
      const c = state.cuentas.find(x => x.id === b.dataset.contQuemada);
      if (!c) return;
      openModal({
        title: 'Marcar cuenta quemada',
        body: `¿Marcar <strong>${esc(c.empresa)} ${esc(c.numero || '')}</strong> como <strong>quemada</strong>? Reversible desde Editar.`,
        actions: [
          { label: 'Cancelar', onClick: cl => cl() },
          { label: 'Sí, quemada', variant: 'danger', onClick: cl => { state.markQuemada(c.id); cl(); } },
        ],
      });
    }));
}

// Listas de Retiros / Compras (con filtro por cuenta + periodo)
function renderLista(kind) {
  const cuentas = state.cuentas;
  const all = kind === 'retiros' ? allWithdrawals(cuentas) : allPurchases(cuentas);
  const items = all.filter(x => (filterCuenta === 'all' || x.cuentaId === filterCuenta) && inRange(x.date || ''));

  const filtro = `
    <div class="section-title-row">
      <div class="section-title" style="margin:0;">${kind === 'retiros' ? 'Retiros' : 'Compras'} (${items.length})</div>
      <select id="invFilterCuenta" class="select">
        <option value="all" ${filterCuenta === 'all' ? 'selected' : ''}>Todas las cuentas</option>
        ${cuentas.map(c => `<option value="${esc(c.id)}" ${filterCuenta === c.id ? 'selected' : ''}>${esc(c.empresa)} ${esc(c.numero || '')}</option>`).join('')}
      </select>
    </div>`;

  if (!items.length) return filtro + '<div class="empty">Sin movimientos para este filtro.</div>';

  if (kind === 'retiros') {
    const total = items.reduce((s, w) => s + Math.max(0, (w.amount || 0) - (w.commission || 0)), 0);
    return filtro + `
      <div class="card table-card" style="padding:0;">
        <table class="data-table inv-table">
          <thead><tr><th>Fecha</th><th>Cuenta</th><th>Bruto</th><th>Comisión</th><th>Neto</th><th>Nota</th><th></th></tr></thead>
          <tbody>${items.map(w => {
            const com = +(w.commission || 0);
            const net = Math.max(0, (w.amount || 0) - com);
            return `<tr>
              <td>${formatDateShort(w.date)}</td>
              <td>${esc(w.cuentaNombre)}</td>
              <td class="mono">${fmtUsd(w.amount)}</td>
              <td class="mono" style="color:var(--orange);">${com > 0 ? '−' + fmtUsd(com) : '–'}</td>
              <td class="mono" style="color:var(--green);">${fmtUsd(net)}</td>
              <td style="color:var(--muted);font-family:var(--mono);font-size:11px;">${esc(w.note || '–')}</td>
              <td style="text-align:right;"><button class="btn ghost danger" data-del-w="${w.id}" data-cid="${w.cuentaId}" style="padding:4px 8px;font-size:11px;">×</button></td>
            </tr>`;
          }).join('')}</tbody>
          <tfoot><tr><td colspan="4" style="text-align:right;color:var(--muted);font-size:11px;">Neto total</td><td class="mono" style="color:var(--green);font-weight:600;">${fmtUsd(total)}</td><td colspan="2"></td></tr></tfoot>
        </table>
      </div>`;
  }
  // compras
  const total = items.reduce((s, p) => s + (p.amount || 0), 0);
  return filtro + `
    <div class="card table-card" style="padding:0;">
      <table class="data-table inv-table">
        <thead><tr><th>Fecha</th><th>Cuenta</th><th>Concepto</th><th>Importe</th><th></th></tr></thead>
        <tbody>${items.map(p => {
          const legacy = String(p.id || '').startsWith('legacy-');
          return `<tr>
            <td>${formatDateShort(p.date)}</td>
            <td>${esc(p.cuentaNombre)}</td>
            <td><span class="badge">${CONCEPT_LABEL[p.concept] || p.concept || '–'}</span></td>
            <td class="mono" style="color:var(--red);">${fmtUsd(p.amount)}</td>
            <td style="text-align:right;white-space:nowrap;">
              <button class="btn ghost" data-edit-p="${p.id}" data-cid="${p.cuentaId}" title="Editar compra" style="padding:4px 8px;font-size:11px;">✏️</button>
              ${legacy ? '' : `<button class="btn ghost danger" data-del-p="${p.id}" data-cid="${p.cuentaId}" title="Borrar compra" style="padding:4px 8px;font-size:11px;">×</button>`}</td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot><tr><td colspan="3" style="text-align:right;color:var(--muted);font-size:11px;">Total</td><td class="mono" style="color:var(--red);font-weight:600;">${fmtUsd(total)}</td><td></td></tr></tfoot>
      </table>
    </div>`;
}

function wireLista(container) {
  const sel = container.querySelector('#invFilterCuenta');
  if (sel) sel.addEventListener('change', e => { filterCuenta = e.target.value; render(container); });
  container.querySelectorAll('[data-del-w]').forEach(b => b.addEventListener('click', () => {
    openModal({ title: 'Borrar retiro', body: '¿Borrar este retiro? No se puede deshacer.', actions: [
      { label: 'Cancelar', onClick: c => c() },
      { label: 'Borrar', variant: 'danger', onClick: c => { state.removeWithdrawal(b.dataset.cid, b.dataset.delW); c(); } },
    ] });
  }));
  container.querySelectorAll('[data-del-p]').forEach(b => b.addEventListener('click', () => {
    openModal({ title: 'Borrar compra', body: '¿Borrar esta compra? No se puede deshacer.', actions: [
      { label: 'Cancelar', onClick: c => c() },
      { label: 'Borrar', variant: 'danger', onClick: c => { state.removePurchase(b.dataset.cid, b.dataset.delP); c(); } },
    ] });
  }));
  container.querySelectorAll('[data-edit-p]').forEach(b => b.addEventListener('click', () => {
    const cuenta = state.cuentas.find(c => c.id === b.dataset.cid);
    if (!cuenta) return;
    const pid = b.dataset.editP;
    let compra = (cuenta.purchases || []).find(p => p.id === pid);
    // Compra legacy: no está en purchases[], reconstruimos su objeto desde el coste.
    if (!compra && pid.startsWith('legacy-')) {
      compra = { id: pid, date: new Date(cuenta.createdAt || Date.now()).toISOString().substring(0, 10), amount: cuenta.cost || 0, concept: 'challenge', note: 'Coste inicial' };
    }
    if (compra) openPurchaseModal(cuenta, () => render(container), compra);
  }));
}

// ── Pestaña Empresas: elegir una prop y ver sus movimientos ──
function renderEmpresas() {
  const cuentas = state.cuentas;
  const empresas = [...new Set(cuentas.map(c => (c.empresa || '').trim()).filter(Boolean))].sort();
  const selector = `
    <div class="emp-toolbar">
      <select id="empSelect" class="select">
        <option value="">Seleccionar empresa…</option>
        ${empresas.map(e => `<option value="${esc(e)}" ${empresaSel === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}
      </select>
    </div>`;

  if (!empresaSel) {
    return selector + `
      <div class="card emp-empty">
        <div style="font-size:34px;margin-bottom:10px;">🏢</div>
        <div style="font-weight:600;color:var(--text);">Elige una empresa para ver su actividad</div>
        <div style="font-size:12px;font-family:var(--mono);color:var(--muted);margin-top:6px;">Al seleccionar una prop verás sus retiros y compras filtrados.</div>
      </div>`;
  }

  const ids = new Set(cuentas.filter(c => (c.empresa || '').trim() === empresaSel).map(c => c.id));
  const retiros = allWithdrawals(cuentas).filter(w => ids.has(w.cuentaId) && inRange(w.date || ''));
  const compras = allPurchases(cuentas).filter(p => ids.has(p.cuentaId) && inRange(p.date || ''));
  const totRet = retiros.reduce((s, w) => s + Math.max(0, (w.amount || 0) - (w.commission || 0)), 0);
  const totCom = compras.reduce((s, p) => s + (p.amount || 0), 0);

  const retirosTable = retiros.length ? `
    <div class="card table-card" style="padding:0;">
      <table class="data-table inv-table">
        <thead><tr><th>Fecha</th><th>Cuenta</th><th>Bruto</th><th>Comisión</th><th>Neto</th><th>Nota</th><th></th></tr></thead>
        <tbody>${retiros.map(w => {
          const com = +(w.commission || 0);
          const net = Math.max(0, (w.amount || 0) - com);
          return `<tr>
            <td>${formatDateShort(w.date)}</td>
            <td>${esc(w.cuentaNombre)}</td>
            <td class="mono">${fmtUsd(w.amount)}</td>
            <td class="mono" style="color:var(--orange);">${com > 0 ? '−' + fmtUsd(com) : '–'}</td>
            <td class="mono" style="color:var(--green);">${fmtUsd(net)}</td>
            <td style="color:var(--muted);font-family:var(--mono);font-size:11px;">${esc(w.note || '–')}</td>
            <td style="text-align:right;"><button class="btn ghost danger" data-del-w="${w.id}" data-cid="${w.cuentaId}" style="padding:4px 8px;font-size:11px;">×</button></td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot><tr><td colspan="4" style="text-align:right;color:var(--muted);font-size:11px;">Neto total</td><td class="mono" style="color:var(--green);font-weight:600;">${fmtUsd(totRet)}</td><td colspan="2"></td></tr></tfoot>
      </table>
    </div>` : `<div class="card emp-empty" style="padding:24px;">Sin retiros para esta empresa${currentRange() ? ' en el periodo' : ''}.</div>`;

  const comprasTable = compras.length ? `
    <div class="card table-card" style="padding:0;">
      <table class="data-table inv-table">
        <thead><tr><th>Fecha</th><th>Cuenta</th><th>Concepto</th><th>Importe</th><th></th></tr></thead>
        <tbody>${compras.map(p => {
          const legacy = String(p.id || '').startsWith('legacy-');
          return `<tr>
            <td>${formatDateShort(p.date)}</td>
            <td>${esc(p.cuentaNombre)}</td>
            <td><span class="badge">${CONCEPT_LABEL[p.concept] || p.concept || '–'}</span></td>
            <td class="mono" style="color:var(--red);">${fmtUsd(p.amount)}</td>
            <td style="text-align:right;white-space:nowrap;">
              <button class="btn ghost" data-edit-p="${p.id}" data-cid="${p.cuentaId}" title="Editar compra" style="padding:4px 8px;font-size:11px;">✏️</button>
              ${legacy ? '' : `<button class="btn ghost danger" data-del-p="${p.id}" data-cid="${p.cuentaId}" title="Borrar compra" style="padding:4px 8px;font-size:11px;">×</button>`}</td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot><tr><td colspan="3" style="text-align:right;color:var(--muted);font-size:11px;">Total</td><td class="mono" style="color:var(--red);font-weight:600;">${fmtUsd(totCom)}</td><td></td></tr></tfoot>
      </table>
    </div>` : `<div class="card emp-empty" style="padding:24px;">Sin compras para esta empresa${currentRange() ? ' en el periodo' : ''}.</div>`;

  return selector + `
    <div class="section-title">Retiros · ${esc(empresaSel)}</div>
    ${retirosTable}
    <div class="section-title" style="margin-top:24px;">Compras · ${esc(empresaSel)}</div>
    ${comprasTable}`;
}

function wireEmpresas(container) {
  const sel = container.querySelector('#empSelect');
  if (sel) sel.addEventListener('change', e => { empresaSel = e.target.value; render(container); });
  // Reutiliza el cableado de borrar/editar de retiros y compras.
  wireLista(container);
}

function openRetiroChooser() {
  const fondeadas = state.cuentas.filter(c => c.fase === 'fondeada');
  if (!fondeadas.length) {
    openModal({ title: 'Sin cuentas fondeadas', body: 'Los retiros solo se registran en cuentas fondeadas. Marca una cuenta como Fondeada primero.', actions: [{ label: 'Entendido', variant: 'primary', onClick: c => c() }] });
    return;
  }
  if (fondeadas.length === 1) { openWithdrawalModal(fondeadas[0]); return; }
  openModal({
    title: 'Registrar retiro',
    body: `<div class="form" style="max-width:none;"><div class="form-field"><label class="form-label">Cuenta fondeada</label>
      <select class="form-input" id="rt-cuenta">${fondeadas.map(c => `<option value="${esc(c.id)}">${esc(c.empresa)} ${esc(c.numero || '')}</option>`).join('')}</select></div></div>`,
    actions: [
      { label: 'Cancelar', onClick: c => c() },
      { label: 'Continuar', variant: 'primary', onClick: close => {
        const id = document.getElementById('modal-root').querySelector('#rt-cuenta').value;
        const cuenta = fondeadas.find(x => x.id === id);
        close();
        if (cuenta) openWithdrawalModal(cuenta);
      } },
    ],
  });
}

function paintChart(container) {
  const canvas = container.querySelector('#invChart');
  if (!canvas) return;
  const cuentas = state.cuentas;
  const gastos = monthlyInvested(cuentas);
  const ganancias = portfolioMonthlyWithdrawals(cuentas);
  const r = currentRange();
  // Respetar el filtro de periodo (Año/Mes): un mes 'YYYY-MM' entra si su primer
  // día cae dentro del rango seleccionado.
  const monthInRange = m => !r || (m + '-01' >= r.from && m + '-01' <= r.to);
  const months = [...new Set([...gastos.map(g => g.month), ...ganancias.map(g => g.month)])]
    .filter(monthInRange).sort();
  if (!months.length) return;
  const gMap = Object.fromEntries(gastos.map(g => [g.month, g.usd]));
  const wMap = Object.fromEntries(ganancias.map(g => [g.month, g.usd]));
  const labels = months.map(m => MONTHS_ES_SHORT[+m.split('-')[1] - 1] + ' ' + m.substring(2, 4));
  const READ = k => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  Chart.getChart(canvas)?.destroy();
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Gastos', data: months.map(m => +(gMap[m] || 0).toFixed(2)), backgroundColor: READ('--red'), borderRadius: 8, borderSkipped: false, categoryPercentage: 0.7, barPercentage: 0.85 },
        { label: 'Ganancias', data: months.map(m => +(wMap[m] || 0).toFixed(2)), backgroundColor: READ('--green'), borderRadius: 8, borderSkipped: false, categoryPercentage: 0.7, barPercentage: 0.85 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 10, boxHeight: 10, padding: 16, usePointStyle: true, font: { family: "'Inter', sans-serif", size: 11 } } } },
      scales: {
        x: { grid: { display: false }, border: { display: false } },
        y: { ticks: { callback: v => '$' + v.toLocaleString('en-US') }, grid: { color: READ('--border') }, border: { display: false } },
      },
    },
  });
}

// ── Calendario de eventos ───────────────────────────────────
const EV_META = {
  compra:   { cls: 'ev-compra', label: 'Compra' },
  retiro:   { cls: 'ev-retiro', label: 'Retiro' },
  fondeada: { cls: 'ev-fond',   label: 'Fondeada' },
  quemada:  { cls: 'ev-quem',   label: 'Quemada' },
};

function ensureCalDate() {
  if (calYear == null) { const n = new Date(); calYear = n.getFullYear(); calMonth = n.getMonth(); }
}

function eventChip(e) {
  const m = EV_META[e.type] || { cls: '', label: e.type };
  const txt = e.type === 'compra' ? '-' + fmtUsd(e.amount)
    : e.type === 'retiro' ? '+' + fmtUsd(e.amount)
    : e.type === 'fondeada' ? '★ Fondeada' : '✗ Quemada';
  return `<span class="cont-ev ${m.cls}" title="${esc(e.cuentaNombre)} · ${m.label}">${txt}</span>`;
}

function calControls(isAll) {
  return `
    <div class="section-title-row" style="margin-top:0;">
      <div class="cal-controls">
        <button class="cal-btn" id="calPrev" ${isAll ? 'disabled' : ''}>‹</button>
        <span class="cal-month-label">${isAll ? 'Todos los eventos' : MONTHS_ES[calMonth] + ' ' + calYear}</span>
        <button class="cal-btn" id="calNext" ${isAll ? 'disabled' : ''}>›</button>
      </div>
      <button class="btn ${isAll ? 'primary' : ''}" id="calToggleAll">${isAll ? '◷ Ver por mes' : '☰ Ver todos'}</button>
    </div>`;
}

function renderCalendario() {
  ensureCalDate();
  const events = accountingEvents(state.cuentas);

  if (calAll) {
    if (!events.length) return calControls(true) + '<div class="empty">Aún no hay eventos.</div>';
    const sorted = [...events].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const groups = {};
    for (const e of sorted) { const m = (e.date || '').substring(0, 7); (groups[m] = groups[m] || []).push(e); }
    const html = Object.keys(groups).sort().reverse().map(mk => {
      const [y, mo] = mk.split('-');
      return `<div class="section-title">${MONTHS_ES[+mo - 1]} ${y}</div>
        <div class="card table-card" style="padding:0;"><table class="data-table inv-table">
          <tbody>${groups[mk].map(e => `<tr>
            <td>${formatDateShort(e.date)}</td>
            <td>${esc(e.cuentaNombre)}</td>
            <td>${eventChip(e)}</td>
          </tr>`).join('')}</tbody></table></div>`;
    }).join('');
    return calControls(true) + html;
  }

  const monthKey = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
  const monthEvents = events.filter(e => (e.date || '').startsWith(monthKey));
  const gastos = monthEvents.filter(e => e.type === 'compra').reduce((s, e) => s + (e.amount || 0), 0);
  const ganancias = monthEvents.filter(e => e.type === 'retiro').reduce((s, e) => s + (e.amount || 0), 0);
  const byDate = {};
  for (const e of monthEvents) (byDate[e.date] = byDate[e.date] || []).push(e);

  return calControls(false) + `
    <div class="cal-summary" style="grid-template-columns:repeat(3,1fr);">
      <div class="cs-card"><div class="cs-label">Gastos</div><div class="cs-val" style="color:var(--red);">-${fmtUsd(gastos)}</div></div>
      <div class="cs-card"><div class="cs-label">Ganancias</div><div class="cs-val" style="color:var(--green);">${fmtUsd(ganancias)}</div></div>
      <div class="cs-card"><div class="cs-label">Neto</div><div class="cs-val" style="color:${ganancias - gastos >= 0 ? 'var(--green)' : 'var(--red)'};">${fmtUsd(ganancias - gastos, true)}</div></div>
    </div>
    <div class="cont-cal">
      <div class="cont-cal-dow">${['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'].map(d => `<div>${d}</div>`).join('')}</div>
      <div class="cont-cal-grid">${buildMonthCells(byDate)}</div>
    </div>`;
}

function buildMonthCells(byDate) {
  const firstDow = (new Date(calYear, calMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push('<div class="cont-cal-cell empty"></div>');
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const evs = byDate[ds] || [];
    const isToday = today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === d;
    // Totales del día: ingresos (retiros, verde) y gastos (compras, rojo), en grande.
    const ingresos = evs.reduce((s, e) => s + (e.type === 'retiro' ? (e.amount || 0) : 0), 0);
    const gastos = evs.reduce((s, e) => s + (e.type === 'compra' ? (e.amount || 0) : 0), 0);
    const hasFond = evs.some(e => e.type === 'fondeada');
    const hasQuem = evs.some(e => e.type === 'quemada');
    const marks = `${hasFond ? '<span class="cont-day-mark f" title="Fondeada">★</span>' : ''}${hasQuem ? '<span class="cont-day-mark q" title="Quemada">✗</span>' : ''}`;
    const amounts = `${ingresos > 0 ? `<div class="cont-day-in">+${fmtUsd(ingresos)}</div>` : ''}${gastos > 0 ? `<div class="cont-day-out">-${fmtUsd(gastos)}</div>` : ''}`;
    const hasData = ingresos > 0 || gastos > 0 || hasFond || hasQuem;
    // Color de la casilla según el neto del día (como el calendario de trades):
    // verde si entra más de lo que sale, rojo si sale más.
    let netCls = '';
    if (ingresos > 0 || gastos > 0) {
      const net = ingresos - gastos;
      netCls = net > 0 ? 'ingreso' : net < 0 ? 'gasto' : 'be';
    }
    cells.push(`<div class="cont-cal-cell ${hasData ? 'has' : ''} ${netCls} ${isToday ? 'today' : ''}">
      <span class="cont-cal-num">${d}${marks}</span>
      <div class="cont-cal-amts">${amounts}</div>
    </div>`);
  }
  return cells.join('');
}

function wireCalendario(container) {
  const prev = container.querySelector('#calPrev');
  if (prev) prev.addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } render(container); });
  const next = container.querySelector('#calNext');
  if (next) next.addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } render(container); });
  const toggle = container.querySelector('#calToggleAll');
  if (toggle) toggle.addEventListener('click', () => { calAll = !calAll; render(container); });
}

function emptyState() {
  return `
    <div class="empty">
      <div class="big">🧮</div>
      <div>Aún no hay cuentas que analizar.</div>
      <div style="margin-top:8px;font-size:11px;color:var(--muted);">Pulsa <strong>+ Nueva cuenta</strong> y registra lo que pagaste para ver tu ROI y el calendario.</div>
    </div>`;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

export function contabilidadView(container) {
  render(container);
  return state.on(() => render(container));
}

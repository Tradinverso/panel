// Vista lista de cuentas. Muestra cards de cada cuenta con resumen rápido
// y permite filtrar por estado y fase, y crear/editar/borrar cuentas.

import { state } from '../state.js';
import { router } from '../router.js';
import { openCuentaEditModal, confirmDeleteCuenta } from '../components/cuenta-edit-modal.js';
import { accountStats, fmtUsd } from '../utils/account-stats.js';

let filterStatus = 'all';
let filterFase = 'all';

const FASE_LABEL = { challenge_1: 'Challenge 1ª', challenge_2: 'Challenge 2ª', fondeada: 'Fondeada' };
const STATUS_LABEL = { activa: 'Activa', pausada: 'Pausada', pasada: 'Pasada', perdida: 'Perdida' };
const STATUS_DOT = { activa: '🟢', pausada: '⏸', pasada: '✓', perdida: '✗' };
const FASE_CLASS = { challenge_1: 'fase-c1', challenge_2: 'fase-c2', fondeada: 'fase-fond' };
const STATUS_CLASS = { activa: 'st-activa', pausada: 'st-pausada', pasada: 'st-pasada', perdida: 'st-perdida' };

function render(container) {
  const all = state.cuentas;
  const filtered = all.filter(c =>
    (filterStatus === 'all' || c.status === filterStatus) &&
    (filterFase === 'all' || c.fase === filterFase)
  );

  const sortedFiltered = [...filtered].sort((a, b) => {
    // Activas primero, luego por fecha de creación
    if (a.status !== b.status) {
      const order = { activa: 0, pausada: 1, pasada: 2, perdida: 3 };
      return (order[a.status] || 9) - (order[b.status] || 9);
    }
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const activas = all.filter(c => c.status === 'activa').length;

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Mis cuentas</h1>
        <div class="sub">${all.length} cuenta${all.length !== 1 ? 's' : ''} · ${activas} activa${activas !== 1 ? 's' : ''}</div>
      </div>
      <div class="page-actions">
        <select id="cf-fase" class="select">
          <option value="all" ${filterFase === 'all' ? 'selected' : ''}>Todas las fases</option>
          <option value="challenge_1" ${filterFase === 'challenge_1' ? 'selected' : ''}>Challenge 1ª</option>
          <option value="challenge_2" ${filterFase === 'challenge_2' ? 'selected' : ''}>Challenge 2ª</option>
          <option value="fondeada" ${filterFase === 'fondeada' ? 'selected' : ''}>Fondeada</option>
        </select>
        <select id="cf-status" class="select">
          <option value="all" ${filterStatus === 'all' ? 'selected' : ''}>Todos los estados</option>
          <option value="activa"  ${filterStatus === 'activa'  ? 'selected' : ''}>Activas</option>
          <option value="pausada" ${filterStatus === 'pausada' ? 'selected' : ''}>Pausadas</option>
          <option value="pasada"  ${filterStatus === 'pasada'  ? 'selected' : ''}>Pasadas</option>
          <option value="perdida" ${filterStatus === 'perdida' ? 'selected' : ''}>Perdidas</option>
        </select>
        <button class="btn primary" id="newCuentaBtn">+ Nueva cuenta</button>
      </div>
    </div>

    ${all.length === 0
      ? emptyState()
      : `<div class="cuenta-grid">${sortedFiltered.map(c => card(c)).join('')}</div>`}
    ${all.length > 0 && sortedFiltered.length === 0 ? '<div class="empty">Ninguna cuenta coincide con los filtros.</div>' : ''}
  `;

  container.querySelector('#newCuentaBtn').addEventListener('click', () => {
    openCuentaEditModal(null, () => render(container));
  });
  container.querySelector('#cf-fase').addEventListener('change', e => {
    filterFase = e.target.value;
    render(container);
  });
  container.querySelector('#cf-status').addEventListener('change', e => {
    filterStatus = e.target.value;
    render(container);
  });

  container.querySelectorAll('[data-view-cuenta]').forEach(el => {
    el.addEventListener('click', e => {
      // Si el click viene de un botón interno, no navegar
      if (e.target.closest('[data-stop]')) return;
      router.go('#/cuenta/' + el.dataset.viewCuenta);
    });
  });
  container.querySelectorAll('[data-edit-cuenta]').forEach(b => {
    b.addEventListener('click', () => {
      const c = state.cuentas.find(x => x.id === b.dataset.editCuenta);
      if (c) openCuentaEditModal(c, () => render(container));
    });
  });
  container.querySelectorAll('[data-delete-cuenta]').forEach(b => {
    b.addEventListener('click', () => {
      const c = state.cuentas.find(x => x.id === b.dataset.deleteCuenta);
      if (c) confirmDeleteCuenta(c, () => render(container));
    });
  });
}

function emptyState() {
  return `
    <div class="empty">
      <div class="big">🏦</div>
      <div>Aún no tienes cuentas configuradas.</div>
      <div style="margin-top:8px;font-size:11px;color:var(--muted);">Crea tu primera cuenta para empezar a asignar trades y ver el equity en $.</div>
      <button class="btn primary" onclick="document.getElementById('newCuentaBtn')?.click()" style="margin-top:20px;">+ Crear primera cuenta</button>
    </div>
  `;
}

function card(c) {
  const s = accountStats(c, state.trades);
  const isFondeada = c.fase === 'fondeada';
  const equityColor = s.equityPct >= 0 ? 'var(--green)' : 'var(--red)';
  const profitColor = s.profitTotalUsd >= 0 ? 'var(--green)' : 'var(--red)';
  const ddColor = s.ddPct > 5 ? 'var(--red)' : s.ddPct > 2 ? 'var(--orange)' : 'var(--muted)';
  const wr = s.tp + s.sl > 0 ? s.wr.toFixed(0) + '%' : '–';
  const racha = s.currentSlStreak >= 3 ? `🔴 ${s.currentSlStreak} SL`
              : s.currentSlStreak === 2 ? `🟡 2 SL`
              : '✅ sin racha';

  return `
    <div class="cuenta-card ${STATUS_CLASS[c.status]}" data-view-cuenta="${c.id}">
      <div class="cuenta-card-head">
        <div>
          <div class="cuenta-card-title">${esc(c.empresa)} ${fmtCapitalShort(c.capital)} · ${esc(c.tipo)}</div>
          <div class="cuenta-card-meta">${c.numero ? '#' + esc(c.numero) + ' · ' : ''}<span class="badge ${FASE_CLASS[c.fase]}">${FASE_LABEL[c.fase]}</span> <span class="badge st-${c.status}">${STATUS_DOT[c.status]} ${STATUS_LABEL[c.status]}</span></div>
        </div>
        <div class="cuenta-card-actions" data-stop>
          <button class="btn ghost" data-edit-cuenta="${c.id}" title="Editar" data-stop>✏️</button>
          <button class="btn ghost danger" data-delete-cuenta="${c.id}" title="Borrar" data-stop>×</button>
        </div>
      </div>
      <div class="cuenta-card-body">
        <div class="cc-row">
          <span class="cc-label">Capital</span>
          <span class="cc-value">${fmtUsd(s.capital)}</span>
        </div>
        <div class="cc-row">
          <span class="cc-label">Equity</span>
          <span class="cc-value" style="color:${equityColor};">${fmtUsd(s.equityUsd)} <span style="font-size:11px;opacity:.7;">(${s.equityPct >= 0 ? '+' : ''}${s.equityPct.toFixed(2)}%)</span></span>
        </div>
        ${isFondeada ? `
        <div class="cc-row">
          <span class="cc-label">Profit total</span>
          <span class="cc-value" style="color:${profitColor};">${fmtUsd(s.profitTotalUsd, true)}</span>
        </div>
        <div class="cc-row">
          <span class="cc-label">Retirado</span>
          <span class="cc-value">${fmtUsd(s.totalWithdrawn)}</span>
        </div>` : ''}
        ${c.cost > 0 ? `
        <div class="cc-row">
          <span class="cc-label">Coste</span>
          <span class="cc-value" style="color:var(--muted);">${fmtUsd(c.cost)}</span>
        </div>` : ''}
        <div class="cc-row">
          <span class="cc-label">DD máx</span>
          <span class="cc-value" style="color:${ddColor};">-${s.ddPct.toFixed(2)}% (${fmtUsd(s.ddUsd)})</span>
        </div>
        <div class="cc-row">
          <span class="cc-label">Trades</span>
          <span class="cc-value">${s.count} · ${wr} WR · ${racha}</span>
        </div>
      </div>
    </div>
  `;
}

function fmtCapitalShort(c) {
  if (c >= 1000) return Math.round(c / 1000) + 'K';
  return String(c);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

export function cuentasListView(container) {
  render(container);
  return state.on(() => render(container));
}

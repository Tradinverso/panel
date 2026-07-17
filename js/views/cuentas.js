// Vista lista de cuentas. Muestra cards de cada cuenta con resumen rápido
// y permite filtrar por estado y fase, y crear/editar/borrar cuentas.

import { state } from '../state.js';
import { router } from '../router.js';
import { openCuentaEditModal, confirmDeleteCuenta } from '../components/cuenta-edit-modal.js';
import { openModal } from '../components/modal.js';
import { gestionTabs } from '../components/gestion-tabs.js';
import {
  accountStats, fmtUsd, advanceInfo,
  portfolioStats, portfolioEquityCurve, portfolioMonthlyWithdrawals,
} from '../utils/account-stats.js';
import { kpiCard } from '../components/kpi-card.js';
import { createEquity, createBar } from '../components/charts.js';
import { renderPills } from '../components/pills.js';
import { MONTHS_ES_SHORT } from '../utils/date-helpers.js';

let filterStatus = 'all';
let filterFase = 'all';
let filterTipo = 'all';   // 'all' | 'CFD' | 'Futuros'

const FASE_LABEL = { challenge_1: 'Challenge 1ª', challenge_2: 'Challenge 2ª', fondeada: 'Fondeada' };
const STATUS_LABEL = { activa: 'Activa', pausada: 'Pausada', pasada: 'Pasada', perdida: 'Perdida' };
const STATUS_DOT = { activa: '🟢', pausada: '⏸', pasada: '✓', perdida: '✗' };
const FASE_CLASS = { challenge_1: 'fase-c1', challenge_2: 'fase-c2', fondeada: 'fase-fond' };
const STATUS_CLASS = { activa: 'st-activa', pausada: 'st-pausada', pasada: 'st-pasada', perdida: 'st-perdida' };

function render(container) {
  const all = state.cuentas;

  // Subset filtrado por tipo (CFD/Futuros) — afecta a KPIs, charts y lista.
  const byType = filterTipo === 'all' ? all : all.filter(c => c.tipo === filterTipo);

  const filtered = byType.filter(c =>
    (filterStatus === 'all' || c.status === filterStatus) &&
    (filterFase === 'all' || c.fase === filterFase)
  );

  // Última actividad por cuenta = fecha del trade más reciente asignado.
  // Si no tiene trades, cae a la fecha de creación.
  const lastActivity = new Map();
  for (const c of all) {
    let maxDate = '';
    for (const t of state.trades) {
      if (Array.isArray(t.accounts) && t.accounts.some(a => a.accountId === c.id)) {
        if (t.date && t.date > maxDate) maxDate = t.date;
      }
    }
    lastActivity.set(c.id, maxDate);
  }

  const sortedFiltered = [...filtered].sort((a, b) => {
    // Activas primero, luego por actividad reciente (trade más nuevo)
    if (a.status !== b.status) {
      const order = { activa: 0, pausada: 1, pasada: 2, perdida: 3 };
      return (order[a.status] || 9) - (order[b.status] || 9);
    }
    const la = lastActivity.get(a.id) || '';
    const lb = lastActivity.get(b.id) || '';
    if (la !== lb) return lb.localeCompare(la); // más reciente primero
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const activas = byType.filter(c => c.status === 'activa').length;

  container.innerHTML = `
    ${gestionTabs('cuentas')}
    <div class="page-header">
      <div>
        <h1>Mis cuentas</h1>
        <div class="sub">${byType.length} cuenta${byType.length !== 1 ? 's' : ''} · ${activas} activa${activas !== 1 ? 's' : ''}</div>
      </div>
      <div class="page-actions">
        <div class="type-tabs" id="typeTabs"></div>
        <button class="btn primary" id="newCuentaBtn">+ Nueva cuenta</button>
      </div>
    </div>

    ${all.length === 0
      ? emptyState()
      : `
        <div class="kpi-grid" id="portfolioKpis"></div>

        <div class="section-title">Cartera</div>
        <div class="card" style="margin-bottom:24px;">
          <div class="card-title">Evolución del equity</div>
          <div class="card-sub">Suma de cuentas fondeadas activas</div>
          <div class="chart-wrap" style="height:240px;"><canvas id="portfolioEquity"></canvas></div>
        </div>

        <div class="section-title-row">
          <div class="section-title" style="margin:0;">Cuentas</div>
          <div style="display:flex;gap:8px;">
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
          </div>
        </div>
        <div class="cuentas-hint">💡 Para registrar retiros de propfirms anteriores: créalas como cuenta con estado <b>Pasada</b> o <b>Perdida</b> y añade los retiros desde su detalle.</div>

        ${sortedFiltered.length
          ? renderGroupedCards(sortedFiltered)
          : '<div class="empty">Ninguna cuenta coincide con los filtros.</div>'}
      `}
  `;

  // Tab CFD/Futuros
  const tabsEl = container.querySelector('#typeTabs');
  if (tabsEl) {
    renderPills(tabsEl, {
      name: 'tipo',
      options: [
        { value: 'all', label: 'Todas' },
        { value: 'CFD', label: 'CFD' },
        { value: 'Futuros', label: 'Futuros' },
      ],
      value: filterTipo,
      onChange: v => { filterTipo = v; render(container); },
    });
  }

  container.querySelector('#newCuentaBtn').addEventListener('click', () => {
    openCuentaEditModal(null, () => render(container));
  });

  if (all.length) {
    // KPIs globales sobre el subset filtrado por tipo
    paintPortfolioKpis(container, byType);

    // Charts — formateados en USD (compactos en eje, completos en tooltip)
    const usdAxis = v => {
      if (v == null || isNaN(v)) return '$0';
      const abs = Math.abs(v);
      if (abs >= 1000) return (v < 0 ? '-' : '') + '$' + (abs / 1000).toFixed(abs >= 10000 ? 0 : 1) + 'K';
      return (v < 0 ? '-' : '') + '$' + abs.toFixed(0);
    };
    // Gráfico en el siguiente frame (layout listo) para evitar lienzo en blanco.
    requestAnimationFrame(() => {
      const equityCanvas = container.querySelector('#portfolioEquity');
      if (!equityCanvas) return;
      const curve = portfolioEquityCurve(byType, state.trades);
      createEquity(equityCanvas, [
        { key: 'PORT', label: 'Equity cartera', data: curve },
      ], { formatter: usdAxis });
    });

    const faseEl = container.querySelector('#cf-fase');
    if (faseEl) faseEl.addEventListener('change', e => {
      filterFase = e.target.value;
      render(container);
    });
    const statusEl = container.querySelector('#cf-status');
    if (statusEl) statusEl.addEventListener('change', e => {
      filterStatus = e.target.value;
      render(container);
    });
  }

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
  container.querySelectorAll('[data-advance]').forEach(b => {
    b.addEventListener('click', () => state.advanceFase(b.dataset.advance));
  });
  container.querySelectorAll('[data-quemada]').forEach(b => {
    b.addEventListener('click', () => {
      const c = state.cuentas.find(x => x.id === b.dataset.quemada);
      if (!c) return;
      openModal({
        title: 'Marcar cuenta quemada',
        body: `¿Marcar <strong>${esc(c.empresa)} ${esc(c.numero || '')}</strong> como <strong>quemada</strong> (perdida)? Puedes revertirlo desde Editar.`,
        actions: [
          { label: 'Cancelar', onClick: close => close() },
          { label: 'Sí, quemada', variant: 'danger', onClick: close => { state.markQuemada(c.id); close(); } },
        ],
      });
    });
  });
}

function paintPortfolioKpis(container, cuentas) {
  const s = portfolioStats(cuentas, state.trades);
  const kpisEl = container.querySelector('#portfolioKpis');
  if (!kpisEl) return;
  kpisEl.innerHTML = [
    kpiCard({
      label: 'Capital fondeado',
      value: fmtUsd(s.capitalFondeado),
      sub: `${s.countActivasFondeadas} cuenta${s.countActivasFondeadas !== 1 ? 's' : ''} activa${s.countActivasFondeadas !== 1 ? 's' : ''}`,
      tone: 'blue',
    }),
    kpiCard({
      label: 'Capital en challenge',
      value: fmtUsd(s.capitalChallenge),
      sub: `${s.countActivasChallenge} challenge${s.countActivasChallenge !== 1 ? 's' : ''} activa${s.countActivasChallenge !== 1 ? 's' : ''}`,
      tone: 'purple',
    }),
    kpiCard({
      label: 'Profit fondeado',
      value: fmtUsd(s.profitFondeado, true),
      sub: 'desde inicio · cuentas activas',
      tone: s.profitFondeado >= 0 ? 'green' : 'red',
    }),
  ].join('');
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

// Agrupa las cuentas (ya filtradas+ordenadas) por fase en columnas tipo "tablero".
const FASE_ORDER = ['challenge_1', 'challenge_2', 'fondeada'];
const FASE_COL = {
  challenge_1: { label: 'Challenge 1ª', short: '1F', cls: 'g1' },
  challenge_2: { label: 'Challenge 2ª', short: '2F', cls: 'g2' },
  fondeada:    { label: 'Fondeada',     short: '★',  cls: 'gf' },
};

function renderGroupedCards(list) {
  const cols = FASE_ORDER.map(f => {
    const items = list.filter(c => c.fase === f);
    if (!items.length) return '';
    const g = FASE_COL[f];
    return `
      <div class="cuenta-col">
        <div class="cuenta-col-hdr">
          <span class="cuenta-gtag ${g.cls}">${g.short}</span>
          <span class="cuenta-col-title">${g.label}</span>
          <span class="cuenta-col-count">${items.length}</span>
        </div>
        <div class="cuenta-col-body">${items.map(card).join('')}</div>
      </div>`;
  }).join('');
  return `<div class="cuenta-cols">${cols}</div>`;
}

function card(c) {
  const s = accountStats(c, state.trades);
  const isFondeada = c.fase === 'fondeada';
  const adv = advanceInfo(c);
  const equityColor = s.equityPct >= 0 ? 'var(--green)' : 'var(--red)';
  const wr = s.tp + s.sl > 0 ? s.wr.toFixed(0) + '%' : '–';
  const racha = s.currentSlStreak >= 3 ? `🔴 ${s.currentSlStreak} SL`
              : s.currentSlStreak === 2 ? `🟡 2 SL` : '';

  const stat = (label, value, extra = '') =>
    `<div class="cuenta-stat"><span class="cuenta-stat-l">${label}</span><span class="cuenta-stat-v"${extra}>${value}</span></div>`;

  // Objetivo de la fase: % del capital (con $ derivado). Fallback al $ legacy.
  const objPct = c.targetPct > 0 ? c.targetPct : 0;
  const objUsd = objPct > 0 ? Math.round(s.capital * objPct / 100) : s.targetUsd;
  const objText = objPct > 0 ? `${+objPct.toFixed(2)}% · ${fmtUsd(objUsd)}` : (objUsd > 0 ? fmtUsd(objUsd) : '—');

  return `
    <div class="cuenta-card st-${c.status}" data-view-cuenta="${c.id}">
      <div class="cuenta-card-head">
        <div class="cuenta-card-id">
          <div class="cuenta-card-title">${esc(c.empresa)} <span class="cc-cap">${fmtCapitalShort(c.capital)}</span></div>
          <div class="cuenta-card-sub">${c.numero ? '#' + esc(c.numero) + ' · ' : ''}${esc(c.tipo)} · <span class="badge st-${c.status}">${STATUS_DOT[c.status]} ${STATUS_LABEL[c.status]}</span></div>
        </div>
        <div class="cuenta-card-actions" data-stop>
          <button class="btn ghost" data-edit-cuenta="${c.id}" title="Editar" data-stop>✏️</button>
          <button class="btn ghost danger" data-delete-cuenta="${c.id}" title="Borrar" data-stop>×</button>
        </div>
      </div>

      <div class="cuenta-equity" style="color:${equityColor};">
        ${fmtUsd(s.equityUsd)}
        <span class="cuenta-equity-pct">${s.equityPct >= 0 ? '+' : ''}${s.equityPct.toFixed(2)}%</span>
      </div>

      <div class="cuenta-stats">
        ${stat('Capital', fmtUsd(s.capital))}
        ${c.fase !== 'fondeada' ? stat('Objetivo', objText) : (objUsd > 0 ? stat('Objetivo', objText) : '')}
        ${s.ddLimitUsd > 0 ? stat('DD máx', fmtUsd(s.ddLimitUsd)) : ''}
        ${stat('Trades', `${s.count} · ${wr} WR`)}
        ${racha ? stat('Racha', racha) : ''}
      </div>

      ${(c.fase !== 'fondeada' || c.status !== 'perdida') ? `
      <div class="cuenta-card-foot" data-stop>
        ${adv ? `<button class="btn ghost" data-advance="${c.id}" data-stop>${adv.toFondeada ? '★' : '✓'} ${adv.label}</button>` : ''}
        ${c.status !== 'perdida' ? `<button class="btn ghost danger" data-quemada="${c.id}" data-stop>✗ Quemada</button>` : ''}
      </div>` : ''}
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
  // Resetear filtros al entrar a la vista: solo activas por defecto.
  // Si el usuario cambia el filtro durante la sesión, se respeta hasta salir y volver.
  filterStatus = 'activa';
  filterFase = 'all';
  filterTipo = 'all';
  render(container);
  return state.on(() => render(container));
}

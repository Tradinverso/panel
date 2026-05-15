// Detalle de una cuenta concreta. KPIs en $, equity curve, retiros (si fondeada),
// tabla de trades asignados con su $ P&L individual.

import { state } from '../state.js';
import { router } from '../router.js';
import { auth } from '../auth.js';
import { openCuentaEditModal, confirmDeleteCuenta } from '../components/cuenta-edit-modal.js';
import { openWithdrawalModal } from '../components/withdrawal-modal.js';
import { openModal } from '../components/modal.js';
import {
  accountStats, tradesForAccount, totalWithdrawn, accountEquityCurve,
  monthlyPnlUsd, fmtUsd, computeUsdPnl,
} from '../utils/account-stats.js';
import { kpiCard } from '../components/kpi-card.js';
import { sortChrono } from '../utils/calculations.js';
import { formatDateShort, MONTHS_ES_SHORT } from '../utils/date-helpers.js';

const FASE_LABEL = { challenge_1: 'Challenge 1ª', challenge_2: 'Challenge 2ª', fondeada: 'Fondeada' };
const STATUS_LABEL = { activa: 'Activa', pausada: 'Pausada', pasada: 'Pasada', perdida: 'Perdida' };
const STATUS_DOT = { activa: '🟢', pausada: '⏸', pasada: '✓', perdida: '✗' };

function render(container, cuentaId) {
  const cuenta = state.cuentas.find(c => c.id === cuentaId);
  if (!cuenta) {
    container.innerHTML = `
      <div class="page-header"><div><h1>Cuenta no encontrada</h1></div></div>
      <div class="empty">
        <div>La cuenta que buscas ya no existe o no tienes acceso.</div>
        <a class="btn primary" href="#/cuentas" style="margin-top:20px;display:inline-flex;">← Volver a cuentas</a>
      </div>
    `;
    return;
  }

  const s = accountStats(cuenta, state.trades);
  const isFondeada = cuenta.fase === 'fondeada';
  const items = tradesForAccount(cuenta, state.trades);
  const monthly = monthlyPnlUsd(cuenta, state.trades);
  const curve = accountEquityCurve(cuenta, state.trades);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>${esc(cuenta.empresa)} ${esc(cuenta.numero || '')}</h1>
        <div class="sub">
          <span class="badge fase-${cuenta.fase}">${FASE_LABEL[cuenta.fase]}</span>
          <span class="badge st-${cuenta.status}">${STATUS_DOT[cuenta.status]} ${STATUS_LABEL[cuenta.status]}</span>
          · ${esc(cuenta.tipo)} · Capital ${fmtUsd(cuenta.capital)}
          ${cuenta.cost > 0 ? `· Coste ${fmtUsd(cuenta.cost)}` : ''}
        </div>
      </div>
      <div class="page-actions">
        <a class="btn" href="#/cuentas">← Cuentas</a>
        <button class="btn" id="editCuentaBtn">✏️ Editar</button>
        <button class="btn danger" id="deleteCuentaBtn">× Borrar</button>
      </div>
    </div>

    ${cuenta.notes ? `<div class="card" style="margin-bottom:20px;"><div class="card-sub" style="margin-bottom:0;">📝 ${esc(cuenta.notes)}</div></div>` : ''}

    <div class="kpi-grid">
      ${kpiCard({ label: 'Capital nominal', value: fmtUsd(s.capital), sub: cuenta.tipo, tone: 'blue' })}
      ${kpiCard({ label: 'Equity actual', value: fmtUsd(s.equityUsd), sub: signedPct(s.equityPct) + ' vs capital', tone: s.equityPct >= 0 ? 'green' : 'red' })}
      ${kpiCard({ label: 'Profit total', value: fmtUsd(s.profitTotalUsd, true), sub: signedPct(s.profitTotalPct), tone: s.profitTotalUsd >= 0 ? 'green' : 'red' })}
      ${s.targetUsd > 0 ? kpiCard({ label: 'Target', value: fmtUsd(s.targetUsd), sub: signedPct(s.targetProgressPct, 0) + ' completado', tone: s.targetProgressPct >= 100 ? 'green' : 'orange' }) : ''}
      ${s.ddLimitUsd > 0 ? kpiCard({ label: 'DD máx (firma)', value: fmtUsd(s.ddLimitUsd), sub: s.ddLimitPctOfCapital ? s.ddLimitPctOfCapital.toFixed(1) + '% del capital nominal' : 'límite definido por la firma', tone: 'orange' }) : ''}
      ${isFondeada ? kpiCard({
        label: 'Total retirado',
        value: fmtUsd(s.totalWithdrawnNet),
        sub: (cuenta.withdrawals || []).length + ' retiros' + (s.totalCommissions > 0 ? ' · ' + fmtUsd(s.totalCommissions) + ' comisiones' : ''),
        tone: 'purple',
      }) : ''}
      ${kpiCard({ label: 'Trades', value: s.count, sub: `${s.tp} TP · ${s.sl} SL · ${s.be} BE`, tone: 'orange' })}
      ${kpiCard({ label: 'Winrate', value: (s.tp + s.sl > 0 ? s.wr.toFixed(0) + '%' : '–'), sub: 'TP / (TP+SL)', tone: 'orange' })}
      ${kpiCard({ label: 'Profit Factor', value: isFinite(s.pf) ? s.pf.toFixed(2) : '∞', sub: '$ wins / |$ losses|', tone: 'green' })}
      ${cuenta.cost > 0 && isFondeada ? kpiCard({ label: 'Net to pocket', value: fmtUsd(s.netToPocket, true), sub: 'retirado − coste', tone: s.netToPocket >= 0 ? 'green' : 'red' }) : ''}
    </div>

    ${(s.targetUsd > 0 || s.maxDdUsd > 0) ? renderProgressBars(s) : ''}

    <div class="section-title">Curva de equity</div>
    <div class="card" style="margin-bottom:20px;">
      <div class="card-title">Evolución del capital ($)</div>
      <div class="card-sub">Cada trade asignado mueve la curva. ${isFondeada ? 'Los retiros aparecen como caídas verticales.' : ''}</div>
      <div class="chart-wrap" style="height:240px;"><canvas id="cuenta-equity"></canvas></div>
    </div>

    ${monthly.length ? `
    <div class="card" style="margin-bottom:24px;">
      <div class="card-title">P&L mensual ($)</div>
      <div class="chart-wrap" style="height:200px;"><canvas id="cuenta-monthly"></canvas></div>
    </div>` : ''}

    ${isFondeada ? renderWithdrawalsSection(cuenta, s) : ''}

    <div class="section-title">Trades asignados (${items.length})</div>
    ${items.length === 0
      ? '<div class="card empty">Aún no hay trades asignados a esta cuenta. En Nuevo Trade, marca esta cuenta al guardar.</div>'
      : renderAccountTradesTable(items, cuenta)
    }
  `;

  // Wire up
  container.querySelector('#editCuentaBtn').addEventListener('click', () => {
    openCuentaEditModal(cuenta, () => render(container, cuentaId));
  });
  container.querySelector('#deleteCuentaBtn').addEventListener('click', () => {
    confirmDeleteCuenta(cuenta, () => router.go('#/cuentas'));
  });
  const newWBtn = container.querySelector('#newWithdrawalBtn');
  if (newWBtn) {
    newWBtn.addEventListener('click', () => {
      openWithdrawalModal(cuenta, () => render(container, cuentaId));
    });
  }
  container.querySelectorAll('[data-del-w]').forEach(b => {
    b.addEventListener('click', () => {
      const wId = b.dataset.delW;
      openModal({
        title: 'Borrar retiro',
        body: '¿Seguro que quieres borrar este retiro? Esta acción no se puede deshacer.',
        actions: [
          { label: 'Cancelar', onClick: c => c() },
          { label: 'Borrar', variant: 'danger', onClick: c => {
            state.removeWithdrawal(cuenta.id, wId);
            c();
          } },
        ],
      });
    });
  });

  // Charts
  paintEquityChart(container, curve);
  if (monthly.length) paintMonthlyChart(container, monthly);
}

function renderWithdrawalsSection(cuenta, stats) {
  const ws = [...(cuenta.withdrawals || [])].sort((a, b) => b.date.localeCompare(a.date));
  const subParts = [
    `${ws.length} retiro${ws.length !== 1 ? 's' : ''}`,
    `Bruto ${fmtUsd(stats.totalWithdrawn)}`,
    `Neto ${fmtUsd(stats.totalWithdrawnNet)}`,
  ];
  if (stats.totalCommissions > 0) subParts.push(`Comisiones ${fmtUsd(stats.totalCommissions)}`);
  return `
    <div class="section-title">Retiros</div>
    <div class="card" style="margin-bottom:24px;">
      <div class="card-head">
        <div>
          <div class="card-title">Retiros realizados</div>
          <div class="card-sub">${subParts.join(' · ')}</div>
        </div>
        <button class="btn primary" id="newWithdrawalBtn">+ Nuevo retiro</button>
      </div>
      ${ws.length === 0
        ? '<div class="empty" style="padding:30px 20px;">Aún no has registrado ningún retiro de esta cuenta.</div>'
        : `<table class="data-table"><thead><tr>
            <th>Fecha</th><th>Bruto</th><th>Comisión</th><th>Neto</th><th>Nota</th><th></th>
          </tr></thead><tbody>
            ${ws.map(w => {
              const comm = +(w.commission || 0);
              const net = Math.max(0, (w.amount || 0) - comm);
              const pct = comm > 0 && w.amount > 0 ? (comm / w.amount * 100) : 0;
              return `
              <tr>
                <td>${formatDateShort(w.date)}</td>
                <td style="font-family:var(--mono);font-size:12px;">${fmtUsd(w.amount)}</td>
                <td style="font-family:var(--mono);font-size:12px;color:var(--orange);">${comm > 0 ? '−' + fmtUsd(comm) + ' (' + pct.toFixed(1) + '%)' : '–'}</td>
                <td style="color:var(--zonas);font-weight:500;">${fmtUsd(net)}</td>
                <td style="color:var(--muted);font-family:var(--mono);font-size:11px;">${esc(w.note || '–')}</td>
                <td style="text-align:right;">
                  <button class="btn ghost danger" data-del-w="${w.id}" style="padding:4px 8px;font-size:11px;">×</button>
                </td>
              </tr>
            `;
            }).join('')}
          </tbody></table>`
      }
    </div>
  `;
}

function renderAccountTradesTable(items, cuenta) {
  const sorted = [...items].sort((a, b) => {
    if (a.trade.date !== b.trade.date) return a.trade.date.localeCompare(b.trade.date);
    return (a.trade.open_hour || 0) - (b.trade.open_hour || 0);
  });
  return `
    <div class="trade-table-wrap">
      <table class="trade-table">
        <thead><tr>
          <th>Fecha</th>
          <th>Hora</th>
          <th>Estrategia</th>
          <th>Activo</th>
          <th>Setup</th>
          <th>Zona</th>
          <th>Riesgo</th>
          <th>% sistema</th>
          <th>$ P&L</th>
          <th>Resultado</th>
        </tr></thead>
        <tbody>
          ${sorted.map(({ trade: t, riskPct, usdPnl }) => {
            const pctColor = t.pnl_pct >= 0 ? 'var(--green)' : 'var(--red)';
            const usdColor = usdPnl >= 0 ? 'var(--green)' : 'var(--red)';
            return `<tr>
              <td>${formatDateShort(t.date)}</td>
              <td>${t.open_str || '–'}</td>
              <td><span class="strat-pill ${t.sheet === 'ZONAS' ? 'zonas' : t.sheet === 'LIQUIDEZ' ? 'liquidez' : 'nasdaq'}">${t.sheet.charAt(0) + t.sheet.slice(1).toLowerCase()}</span></td>
              <td>${t.pair || '–'}</td>
              <td>${t.setup || '–'}</td>
              <td>${(Array.isArray(t.zone) ? t.zone.join(' · ') : t.zone) || '–'}</td>
              <td style="font-family:var(--mono);font-size:12px;color:var(--muted);">${riskPct}%</td>
              <td style="color:${pctColor};">${t.pnl_pct >= 0 ? '+' : ''}${t.pnl_pct.toFixed(2)}%</td>
              <td style="color:${usdColor};font-weight:500;">${fmtUsd(usdPnl, true)}</td>
              <td><span class="res-pill res-${t.result.toLowerCase()}">${t.result}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function paintEquityChart(container, curve) {
  const canvas = container.querySelector('#cuenta-equity');
  if (!canvas) return;
  const READ = key => getComputedStyle(document.documentElement).getPropertyValue(key).trim();
  Chart.getChart(canvas)?.destroy();
  Chart.defaults.color = READ('--muted');
  Chart.defaults.borderColor = READ('--border');
  Chart.defaults.font.family = "'DM Mono', monospace";

  // Marcar puntos de retiro con un color distinto
  const pointBg = curve.map(p => p.type === 'withdrawal' ? READ('--zonas') : 'transparent');
  const pointRadius = curve.map(p => p.type === 'withdrawal' ? 5 : 0);

  new Chart(canvas, {
    type: 'line',
    data: {
      labels: curve.map(p => p.x),
      datasets: [{
        label: 'Equity',
        data: curve.map(p => p.y),
        borderColor: READ('--green'),
        backgroundColor: 'rgba(0,212,170,0.06)',
        tension: 0.2,
        pointRadius,
        pointBackgroundColor: pointBg,
        borderWidth: 2,
        fill: true,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const p = curve[ctx.dataIndex];
              const t = p.type === 'withdrawal' ? '🔻 Retiro' : p.type === 'start' ? 'Capital inicial' : 'Trade';
              return `${t}: $${ctx.raw.toLocaleString('en-US')}`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8, autoSkip: true }, grid: { color: READ('--border') } },
        y: { ticks: { callback: v => '$' + v.toLocaleString('en-US') }, grid: { color: READ('--border') } },
      },
    },
  });
}

function paintMonthlyChart(container, monthly) {
  const canvas = container.querySelector('#cuenta-monthly');
  if (!canvas) return;
  const READ = key => getComputedStyle(document.documentElement).getPropertyValue(key).trim();
  Chart.getChart(canvas)?.destroy();

  const labels = monthly.map(m => {
    const [y, mo] = m.month.split('-');
    return MONTHS_ES_SHORT[+mo - 1] + ' ' + y.substring(2);
  });
  const data = monthly.map(m => +m.usd.toFixed(2));
  const colors = data.map(v => v >= 0 ? READ('--green') : READ('--red'));

  new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 6, borderSkipped: false }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: READ('--border') } },
        y: { ticks: { callback: v => '$' + v.toLocaleString('en-US') }, grid: { color: READ('--border') } },
      },
    },
  });
}

function signedPct(v, digits = 2) {
  if (v == null || isNaN(v)) return '0%';
  return (v >= 0 ? '+' : '') + v.toFixed(digits) + '%';
}

function signedDelta(v) {
  if (v == null || isNaN(v) || v === 0) return '$0';
  return (v >= 0 ? '+$' : '-$') + Math.abs(v).toLocaleString('en-US');
}

function renderProgressBars(s) {
  const bars = [];
  if (s.targetUsd > 0) {
    const pct = Math.max(0, Math.min(100, s.targetProgressPct));
    const color = s.targetProgressPct >= 100 ? 'var(--green)' : 'var(--accent)';
    bars.push(`
      <div class="prog-row">
        <div class="prog-head">
          <span><strong>🎯 Target</strong> · ${fmtUsd(s.profitTotalUsd, true)} de ${fmtUsd(s.targetUsd)}</span>
          <span style="color:${color};font-weight:600;">${s.targetProgressPct.toFixed(0)}%</span>
        </div>
        <div class="prog-track"><div class="prog-fill" style="width:${pct}%;background:${color};"></div></div>
      </div>
    `);
  }
  // DD consumido: solo cuenta cuando equity < capital nominal (no penaliza tener
  // la cuenta en positivo). Para CFD es exacto; para futuros es estimación optimista.
  if (s.ddLimitUsd > 0) {
    const pct = Math.max(0, Math.min(100, s.ddConsumedPct));
    const color = s.ddConsumedPct >= 80 ? 'var(--red)' : s.ddConsumedPct >= 50 ? 'var(--orange)' : 'var(--green)';
    bars.push(`
      <div class="prog-row">
        <div class="prog-head">
          <span><strong>🛑 DD consumido</strong> · ${fmtUsd(s.ddConsumedUsd)} de ${fmtUsd(s.ddLimitUsd)}</span>
          <span style="color:${color};font-weight:600;">${s.ddConsumedPct.toFixed(0)}%</span>
        </div>
        <div class="prog-track"><div class="prog-fill" style="width:${pct}%;background:${color};"></div></div>
      </div>
    `);
  }
  return bars.length
    ? `<div class="card" style="margin-bottom:24px;"><div class="card-title">Progreso</div><div class="card-sub">Avance hacia los límites de la cuenta</div>${bars.join('')}</div>`
    : '';
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

export function cuentaDetailView(container, cuentaId) {
  if (!cuentaId) {
    router.go('#/cuentas');
    return;
  }
  render(container, cuentaId);
  return state.on(() => render(container, cuentaId));
}

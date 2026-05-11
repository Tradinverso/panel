import { state } from '../state.js';
import { auth } from '../auth.js';
import { router } from '../router.js';
import {
  winrate, pnlPct, pnlPctReal, profitFactor, maxDrawdown, maxStreak, bestTpStreakPnl,
  equityCurve, equityCurveReal, monthlyPnl, activeDays, tradeCounts, durationStats,
  wrByHour, wrByDay, statsByGroup, longVsShort,
} from '../utils/calculations.js';
import { fmtPct, fmtPctNoSign, fmtNum } from '../utils/number-format-es.js';
import {
  formatDateShort, MONTHS_ES, MONTHS_ES_SHORT, yearMonth,
} from '../utils/date-helpers.js';
import { kpiCard, kpiCardComposite } from '../components/kpi-card.js';
import { createEquity, createDonut, createBar, createHourBar, createDayBar, createLongShort } from '../components/charts.js';
import { renderHeatmap } from '../components/heatmap.js';
import { renderConnectionBadge, cleanupConnectionBadge } from '../components/connection-badge.js';
import { renderPills } from '../components/pills.js';

const STRAT_LABELS = { ZONAS: 'Forex + Oro', LIQUIDEZ: 'EUR/USD', NASDAQ: 'NQ Futuros' };

let monthFilter = 'all';
let yearFilter = 'all';
let perfMode = 'sistema'; // 'sistema' | 'real'

function render(container) {
  const allTrades = state.trades;

  if (!allTrades.length) {
    container.innerHTML = impersonationBanner() + emptyState();
    wireImpersonation(container);
    return;
  }

  const filtered = filterTrades(allTrades, yearFilter, monthFilter);
  container.innerHTML = impersonationBanner() + renderShell(allTrades, filtered);
  wireImpersonation(container);

  const yf = container.querySelector('#yearFilter');
  const mf = container.querySelector('#monthFilter');
  yf.addEventListener('change', () => { yearFilter = yf.value; monthFilter = 'all'; render(container); });
  mf.addEventListener('change', () => { monthFilter = mf.value; render(container); });

  // Connection badge (live)
  const connEl = container.querySelector('#connBadge');
  if (connEl) renderConnectionBadge(connEl);

  // Toggle Sistema/Real
  const perfToggleEl = container.querySelector('#perfToggle');
  if (perfToggleEl) {
    renderPills(perfToggleEl, {
      name: 'perfMode',
      options: [{ value: 'sistema', label: 'Sistema' }, { value: 'real', label: 'Real' }],
      value: perfMode,
      onChange: v => { perfMode = v; render(container); },
    });
  }

  paintKpis(container, filtered);
  paintEquity(container, filtered);
  paintMonthly(container, allTrades);
  ['ZONAS', 'LIQUIDEZ', 'NASDAQ'].forEach(s => paintStrategy(container, s, filtered));
  paintTiming(container, filtered);
  paintDirectionAndPairs(container, filtered);
  paintStreaks(container, filtered);
  paintDurations(container, filtered);
}

function impersonationBanner() {
  if (!state.viewAsUid || !state.viewAsProfile) return '';
  const p = state.viewAsProfile;
  const n = state.trades.length;
  return `
    <div class="imp-banner">
      <div class="imp-banner-icon">📝</div>
      <div class="imp-banner-text">
        Editando como <strong>${escapeHtml(p.nombre || p.email)}</strong>
        <span class="meta">${n} trades · cualquier cambio se guarda en SU cuenta</span>
      </div>
      <button class="btn" id="exitImpBtn">Volver a Mis Alumnos</button>
    </div>
  `;
}

function wireImpersonation(container) {
  const btn = container.querySelector('#exitImpBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await state.exitViewAs();
    router.go('#/admin');
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

export function dashboardView(container) {
  render(container);
  const unsubState = state.on(() => render(container));
  return () => {
    cleanupConnectionBadge();
    unsubState();
  };
}

// ── Empty state ──────────────────────────────────────────────
function emptyState() {
  const userName = state.viewAsUid && state.viewAsProfile
    ? (state.viewAsProfile.nombre || state.viewAsProfile.email.split('@')[0])
    : auth.displayName();
  const userSuffix = userName ? ` <span style="color:var(--muted);font-weight:400;">·</span> <span style="color:var(--text);font-weight:500;">${escapeHtml(userName)}</span>` : '';
  const writableActions = state.readOnly ? '' : `
      <a class="btn primary" href="#/importar" style="margin-top:20px;display:inline-flex;">Importar datos</a>
      <a class="btn" href="#/nuevo" style="margin-top:20px;margin-left:8px;display:inline-flex;">Nuevo trade</a>
  `;
  return `
    <div class="page-header">
      <div>
        <h1>Tradinverso <span>·</span> Dashboard${userSuffix}</h1>
        <div class="sub">Sin datos aún</div>
      </div>
    </div>
    <div class="empty">
      <div class="big">📈</div>
      <div>Aún no hay trades${state.readOnly ? '' : '. Importa tu histórico desde Google Sheets o crea un trade nuevo'}.</div>
      ${writableActions}
    </div>
  `;
}

// ── Filter helpers ───────────────────────────────────────────
function filterTrades(trades, year, month) {
  return trades.filter(t => {
    if (year !== 'all' && !t.date.startsWith(year)) return false;
    if (month !== 'all' && !t.date.startsWith(month)) return false;
    return true;
  });
}

// ── Shell HTML ───────────────────────────────────────────────
function renderShell(allTrades, filtered) {
  const years = [...new Set(allTrades.map(t => t.date.substring(0, 4)))].sort();
  const months = [...new Set(allTrades.map(t => yearMonth(t.date)))].sort()
    .filter(m => yearFilter === 'all' || m.startsWith(yearFilter));
  const dates = filtered.map(t => t.date).sort();
  const first = dates.length ? formatDateShort(dates[0]) : '';
  const last = dates.length ? formatDateShort(dates[dates.length - 1]) : '';
  const userName = state.viewAsUid && state.viewAsProfile
    ? (state.viewAsProfile.nombre || state.viewAsProfile.email.split('@')[0])
    : auth.displayName();
  return `
    <div class="page-header">
      <div>
        <h1>Tradinverso <span>·</span> Dashboard${userName ? ` <span style="color:var(--muted);font-weight:400;">·</span> <span style="color:var(--text);font-weight:500;">${escapeHtml(userName)}</span>` : ''}</h1>
        <div class="sub">${filtered.length} trades · ${first} → ${last}</div>
      </div>
      <div class="page-actions">
        <select id="yearFilter" class="select">
          <option value="all" ${yearFilter === 'all' ? 'selected' : ''}>Todos los años</option>
          ${years.map(y => `<option value="${y}" ${yearFilter === y ? 'selected' : ''}>${y}</option>`).join('')}
        </select>
        <select id="monthFilter" class="select">
          <option value="all" ${monthFilter === 'all' ? 'selected' : ''}>Todos los meses</option>
          ${months.map(m => {
            const [y, mo] = m.split('-');
            return `<option value="${m}" ${monthFilter === m ? 'selected' : ''}>${MONTHS_ES[+mo - 1]} ${y}</option>`;
          }).join('')}
        </select>
        <span class="conn-badge online" id="connBadge"><span class="conn-dot"></span><span>En vivo</span></span>
      </div>
    </div>

    <div class="kpi-grid" id="kpis"></div>

    <div class="section-title-row">
      <div class="section-title" style="margin:0;">Rendimiento</div>
      <div class="perf-toggle" id="perfToggle"></div>
    </div>
    <div class="grid-2-1">
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Curva de equity (P&L acumulado)</div>
            <div class="card-sub">Por estrategia · ${perfMode === 'real' ? 'P&L real (riesgo aplicado)' : 'Sistema 1R normalizado'}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <span class="strat-pill zonas">Zonas</span>
            <span class="strat-pill liquidez">Liquidez</span>
            <span class="strat-pill nasdaq">Nasdaq</span>
          </div>
        </div>
        <div class="chart-wrap" style="height:220px;"><canvas id="equityChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">P&L mensual</div>
        <div class="card-sub">${perfMode === 'real' ? 'Porcentaje según riesgo real' : 'Porcentaje sistema 1R'}</div>
        <div class="chart-wrap" style="height:220px;"><canvas id="monthlyChart"></canvas></div>
      </div>
    </div>

    <div class="section-title">Por estrategia</div>
    <div class="grid-3" id="stratGrid">
      ${['ZONAS', 'LIQUIDEZ', 'NASDAQ'].map(s => stratCardShell(s)).join('')}
    </div>

    <div class="section-title">Timing</div>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">Winrate por franja horaria</div>
        <div class="card-sub">Hora de apertura · Línea = nº trades</div>
        <div class="chart-wrap" style="height:200px;"><canvas id="hourChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Winrate por día de semana</div>
        <div class="card-sub">WR + nº trades por día</div>
        <div class="chart-wrap" style="height:200px;"><canvas id="dayChart"></canvas></div>
      </div>
    </div>

    <div class="section-title">Mapa de calor</div>
    <div class="card" style="margin-bottom:24px;">
      <div class="card-title">WR por día y hora</div>
      <div class="card-sub">Verde = WR alto · Rojo = WR bajo · Gris = sin trades</div>
      <div id="heatmap" style="margin-top:14px;"></div>
    </div>

    <div class="section-title">Dirección y pares</div>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">Long vs Short por estrategia</div>
        <div class="card-sub">Winrate según dirección</div>
        <div class="chart-wrap" style="height:200px;"><canvas id="lsChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Rendimiento por par</div>
        <div class="card-sub">Pares con ≥1 trade</div>
        <table class="data-table"><thead><tr>
          <th>Par</th><th>Trades</th><th>WR</th><th>P&L sist.</th><th>P&L real</th><th>PF</th><th>Señal</th>
        </tr></thead><tbody id="pairsTbody"></tbody></table>
      </div>
    </div>

    <div class="section-title">Rachas y drawdown</div>
    <div class="card" style="margin-bottom:24px;">
      <div class="card-title" style="margin-bottom:14px;">Rachas consecutivas y DD por estrategia y par</div>
      <table class="data-table"><thead><tr>
        <th>Métrica</th><th>Global</th>
        <th style="color:var(--liquidez)">Liquidez</th>
        <th style="color:var(--nasdaq)">Nasdaq</th>
        <th style="color:var(--zonas)">Zonas</th>
        <th style="color:#C084FC">GBP/USD</th>
        <th style="color:#60A5FA">EUR/USD</th>
        <th style="color:#FBBF24">XAU/USD</th>
      </tr></thead><tbody id="streakTbody"></tbody></table>
    </div>

    <div class="section-title">Duración de trades</div>
    <div class="card" style="margin-bottom:24px;">
      <div class="card-title" style="margin-bottom:14px;">Duración media por estrategia y resultado</div>
      <table class="data-table"><thead><tr>
        <th>Estrategia</th><th>Media</th><th>Media TP</th><th>Media SL</th><th>Máxima</th><th>Mínima</th>
      </tr></thead><tbody id="durTbody"></tbody></table>
    </div>
  `;
}

function stratCardShell(s) {
  const cls = { ZONAS: 'zonas', LIQUIDEZ: 'liquidez', NASDAQ: 'nasdaq' }[s];
  return `
    <div class="card" data-strat="${s}">
      <div class="card-title">${s.charAt(0) + s.slice(1).toLowerCase()}</div>
      <div class="card-sub" data-field="sub">– trades</div>
      <div class="mini-stats">
        <div><div class="mini-stat-val" data-field="wr" style="color:var(--${cls});">–</div><div class="mini-stat-lbl">Winrate</div></div>
        <div><div class="mini-stat-val" data-field="pnl" style="color:var(--green);">–</div><div class="mini-stat-lbl">P&L sist.</div></div>
        <div><div class="mini-stat-val" data-field="pnlReal" style="color:var(--green);">–</div><div class="mini-stat-lbl">P&L real</div></div>
        <div><div class="mini-stat-val" data-field="pf" style="color:var(--orange);">–</div><div class="mini-stat-lbl">Profit Factor</div></div>
      </div>
      <div class="chart-wrap" style="height:130px;"><canvas data-field="donut"></canvas></div>
    </div>
  `;
}

// ── Painters ─────────────────────────────────────────────────
function paintKpis(container, trades) {
  const c = tradeCounts(trades);
  const wr = winrate(trades);
  const pnl = pnlPct(trades);
  const pnlReal = pnlPctReal(trades);
  const dd = maxDrawdown(trades);
  const tpStreak = maxStreak(trades, 'TP');
  const tpStreakPct = bestTpStreakPnl(trades);
  const days = activeDays(trades);
  const avgPerDay = days > 0 ? (c.total / days).toFixed(1) : '0';
  container.querySelector('#kpis').innerHTML = [
    kpiCard({ label: 'Winrate global', value: wr.toFixed(1) + '%', sub: `${c.tp} TP · ${c.sl} SL · ${c.be} BE`, tone: 'orange' }),
    kpiCard({ label: 'P&L sistema', value: fmtPct(pnl, 1), sub: 'trades al 1%', tone: pnl >= 0 ? 'green' : 'red' }),
    kpiCard({ label: 'P&L real', value: fmtPct(pnlReal, 1), sub: 'según riesgo real', tone: pnlReal >= 0 ? 'green' : 'red' }),
    kpiCard({ label: 'DD máximo', value: '-' + dd.toFixed(1) + '%', sub: 'equity combinada', tone: 'red' }),
    kpiCardComposite({ label: 'Racha TP máx', primary: tpStreak, secondary: 'TP · ' + fmtPct(tpStreakPct, 1), sub: 'consecutivos · acumulado', tone: 'green' }),
    kpiCard({ label: 'Días activos', value: days, sub: `${c.total} trades · ${avgPerDay}/día`, tone: 'purple' }),
  ].join('');
}

function paintEquity(container, trades) {
  const curve = perfMode === 'real' ? equityCurveReal : equityCurve;
  const datasets = [
    { key: 'ALL', label: 'Global', data: curve(trades) },
    { key: 'ZONAS', label: 'Zonas', data: curve(trades.filter(t => t.sheet === 'ZONAS')) },
    { key: 'LIQUIDEZ', label: 'Liquidez', data: curve(trades.filter(t => t.sheet === 'LIQUIDEZ')) },
    { key: 'NASDAQ', label: 'Nasdaq', data: curve(trades.filter(t => t.sheet === 'NASDAQ')) },
  ];
  createEquity(container.querySelector('#equityChart'), datasets);
}

function paintMonthly(container, allTrades) {
  const data = monthlyPnl(allTrades);
  const labels = data.map(d => MONTHS_ES_SHORT[+d.month.split('-')[1] - 1]);
  const values = data.map(d => +(perfMode === 'real' ? d.pnlReal : d.pnl).toFixed(2));
  createBar(container.querySelector('#monthlyChart'), labels, values);
}

function paintStrategy(container, sheet, trades) {
  const sub = trades.filter(t => t.sheet === sheet);
  const card = container.querySelector(`[data-strat="${sheet}"]`);
  if (!card) return;
  const c = tradeCounts(sub);
  const subPnl = pnlPct(sub);
  const subPnlReal = pnlPctReal(sub);
  card.querySelector('[data-field="wr"]').textContent = fmtPctNoSign(winrate(sub));
  const pnlEl = card.querySelector('[data-field="pnl"]');
  pnlEl.textContent = fmtPct(subPnl, 1);
  pnlEl.style.color = subPnl >= 0 ? 'var(--green)' : 'var(--red)';
  const pnlRealEl = card.querySelector('[data-field="pnlReal"]');
  pnlRealEl.textContent = fmtPct(subPnlReal, 1);
  pnlRealEl.style.color = subPnlReal >= 0 ? 'var(--green)' : 'var(--red)';
  card.querySelector('[data-field="pf"]').textContent = fmtNum(profitFactor(sub));
  card.querySelector('[data-field="sub"]').textContent = `${sub.length} trades · ${STRAT_LABELS[sheet]}`;
  createDonut(card.querySelector('[data-field="donut"]'), c.tp, c.sl, c.be);
}

function paintTiming(container, trades) {
  createHourBar(container.querySelector('#hourChart'), wrByHour(trades));
  createDayBar(container.querySelector('#dayChart'), wrByDay(trades));
  renderHeatmap(container.querySelector('#heatmap'), trades);
}

function paintDirectionAndPairs(container, trades) {
  const ls = ['ZONAS', 'LIQUIDEZ', 'NASDAQ'].map(sheet => ({
    label: sheet.charAt(0) + sheet.slice(1).toLowerCase(),
    ...longVsShort(trades.filter(t => t.sheet === sheet)),
  }));
  createLongShort(container.querySelector('#lsChart'), ls);

  // Pairs table — split EUR/USD by strategy when present in both ZONAS and LIQUIDEZ
  const pairKey = t => {
    let p = t.pair || '';
    if (p === 'EUR/USD' && t.sheet === 'LIQUIDEZ') return 'EUR/USD (Liquidez)';
    if (p === 'EUR/USD' && t.sheet === 'ZONAS') return 'EUR/USD (Zonas)';
    return p || '–';
  };
  const stats = statsByGroup(trades, pairKey).filter(p => p.total >= 1).sort((a, b) => b.total - a.total);
  container.querySelector('#pairsTbody').innerHTML = stats.map(p => {
    const wrColor = p.wr >= 50 ? 'var(--green)' : 'var(--red)';
    const pnlColor = p.pnl >= 0 ? 'var(--green)' : 'var(--red)';
    const pnlRealColor = p.pnlReal >= 0 ? 'var(--green)' : 'var(--red)';
    const pfColor = p.pf >= 2.0 ? 'var(--green)' : p.pf >= 1.5 ? 'var(--orange)' : 'var(--red)';
    const signal = p.wr >= 50 ? '<span style="color:var(--green)">✓</span>' : '<span style="color:var(--red)">!</span>';
    return `<tr>
      <td>${p.key}</td>
      <td>${p.total}</td>
      <td style="color:${wrColor}">${p.wr.toFixed(0)}%</td>
      <td style="color:${pnlColor}">${fmtPct(p.pnl, 1)}</td>
      <td style="color:${pnlRealColor}">${fmtPct(p.pnlReal, 1)}</td>
      <td style="color:${pfColor};font-weight:500;">${isFinite(p.pf) ? p.pf.toFixed(2) : '∞'}</td>
      <td>${signal}</td>
    </tr>`;
  }).join('') + `<tr style="border-top:1px solid var(--border);">
    <td colspan="7" style="color:var(--muted);font-size:10px;font-family:var(--mono);line-height:1.8;">
      PF: <span style="color:var(--green);font-weight:600;">&gt;2.0 muy bueno</span> ·
      <span style="color:var(--orange);font-weight:600;">1.5–2.0 bueno</span> ·
      <span style="color:var(--red);font-weight:600;">&lt;1.5 mejorable</span>
    </td>
  </tr>`;
}

function paintStreaks(container, trades) {
  const groups = {
    Global: trades,
    Liquidez: trades.filter(t => t.sheet === 'LIQUIDEZ'),
    Nasdaq: trades.filter(t => t.sheet === 'NASDAQ'),
    Zonas: trades.filter(t => t.sheet === 'ZONAS'),
    'GBP/USD': trades.filter(t => t.sheet === 'ZONAS' && t.pair === 'GBP/USD'),
    'EUR/USD': trades.filter(t => t.sheet === 'ZONAS' && t.pair === 'EUR/USD'),
    'XAU/USD': trades.filter(t => t.sheet === 'ZONAS' && t.pair === 'XAU/USD'),
  };
  const keys = Object.keys(groups);
  const tpStreak = keys.map(k => maxStreak(groups[k], 'TP'));
  const tpStreakPct = keys.map(k => bestTpStreakPnl(groups[k]));
  const slStreak = keys.map(k => maxStreak(groups[k], 'SL'));
  const dd = keys.map(k => maxDrawdown(groups[k]));

  const rows = [
    { label: 'Racha máx TP consecutivos', vals: tpStreak.map(v => v + ' TP'), color: 'var(--green)' },
    { label: '% acumulado racha TP', vals: tpStreakPct.map(v => fmtPct(v, 1)), color: 'var(--green)' },
    { label: 'Racha máx SL consecutivos', vals: slStreak.map(v => v + ' SL'), color: 'var(--red)' },
    { label: 'DD máximo acumulado', vals: dd.map(v => '-' + v.toFixed(1) + '%'), color: 'var(--red)' },
  ];
  container.querySelector('#streakTbody').innerHTML = rows.map(r => `
    <tr>
      <td style="color:var(--muted);font-family:var(--mono);font-size:11px;">${r.label}</td>
      ${r.vals.map((v, i) => `<td style="color:${r.color};font-weight:${i === 0 ? '600' : '500'};">${v}</td>`).join('')}
    </tr>
  `).join('');
}

function paintDurations(container, trades) {
  const rows = [
    ['ZONAS', durationStats(trades.filter(t => t.sheet === 'ZONAS')), 'zonas'],
    ['LIQUIDEZ', durationStats(trades.filter(t => t.sheet === 'LIQUIDEZ')), 'liquidez'],
    ['NASDAQ', durationStats(trades.filter(t => t.sheet === 'NASDAQ')), 'nasdaq'],
  ];
  const global = durationStats(trades);
  container.querySelector('#durTbody').innerHTML = rows.map(([name, d, cls]) => `
    <tr>
      <td><span class="strat-pill ${cls}">${name}</span></td>
      <td>${d.avg} min</td>
      <td style="color:var(--green)">${d.tp} min</td>
      <td style="color:var(--red)">${d.sl} min</td>
      <td>${d.max} min</td>
      <td>${d.min} min</td>
    </tr>
  `).join('') + `
    <tr style="background:var(--hover);">
      <td><strong>Global</strong></td>
      <td><strong>${global.avg} min</strong></td>
      <td style="color:var(--green)"><strong>${global.tp} min</strong></td>
      <td style="color:var(--red)"><strong>${global.sl} min</strong></td>
      <td>${global.max} min</td>
      <td>${global.min} min</td>
    </tr>
  `;
}


import { state } from '../state.js';
import {
  winrate, pnlPct, pnlPctReal, profitFactor, maxDrawdown, maxStreak, bestTpStreakPnl,
  equityCurve, equityCurveReal, monthlyPnl, tradeCounts, durationStats,
  wrByHour, wrByDay, statsByGroup, longVsShort,
} from '../utils/calculations.js';
import { fmtPct, fmtPctNoSign, fmtNum } from '../utils/number-format-es.js';
import { MONTHS_ES_SHORT } from '../utils/date-helpers.js';
import { kpiCard } from '../components/kpi-card.js';
import { createEquity, createDonut, createBar, createHourBar, createDayBar, createLongShort } from '../components/charts.js';
import { renderHeatmap } from '../components/heatmap.js';
import { renderTradeTable } from '../components/trade-table.js';
import { renderPills } from '../components/pills.js';
import { strategyTabs } from '../components/strategy-tabs.js';

import { STRATEGIES as STRAT_META } from '../utils/strategy-config.js';

let perfMode = 'sistema'; // 'sistema' | 'real'

// Filtros de análisis — TODOS arriba y filtrando TODO (KPIs, gráficas y tabla),
// mismo patrón que Backtesting. Compartidos entre las 3 estrategias; se
// auto-resetean si el valor no existe en la activa.
let fYear = 'all', fMonth = 'all', fPair = 'all', fSetup = 'all', fZone = 'all', fEntry = 'all', fRes = 'all';

function hasIn(v, x) {
  return Array.isArray(v) ? v.includes(x) : v === x;
}

function filtro(trades) {
  return trades.filter(t => {
    if (fYear !== 'all' && !(t.date || '').startsWith(fYear)) return false;
    if (fMonth !== 'all' && !(t.date || '').startsWith(fMonth)) return false;
    if (fPair !== 'all' && t.pair !== fPair) return false;
    if (fSetup !== 'all' && t.setup !== fSetup) return false;
    if (fZone !== 'all' && !hasIn(t.zone, fZone)) return false;
    if (fEntry !== 'all' && !hasIn(t.entry, fEntry)) return false;
    if (fRes !== 'all' && t.result !== fRes) return false;
    return true;
  });
}

function hayFiltros() {
  return fYear !== 'all' || fMonth !== 'all' || fPair !== 'all'
    || fSetup !== 'all' || fZone !== 'all' || fEntry !== 'all' || fRes !== 'all';
}

function filtrosHtml(allSheet) {
  const years = [...new Set(allSheet.map(t => (t.date || '').substring(0, 4)))].filter(Boolean).sort();
  if (fYear !== 'all' && !years.includes(fYear)) { fYear = 'all'; fMonth = 'all'; }
  const months = [...new Set(allSheet.map(t => (t.date || '').substring(0, 7)))].filter(Boolean).sort()
    .filter(m => fYear === 'all' || m.startsWith(fYear));
  if (fMonth !== 'all' && !months.includes(fMonth)) fMonth = 'all';
  const pairs = [...new Set(allSheet.map(t => t.pair).filter(Boolean))].sort();
  if (fPair !== 'all' && !pairs.includes(fPair)) fPair = 'all';
  const zones = [...new Set(allSheet.flatMap(t => Array.isArray(t.zone) ? t.zone : [t.zone]).filter(Boolean))].sort();
  if (fZone !== 'all' && !zones.includes(fZone)) fZone = 'all';
  const entries = [...new Set(allSheet.flatMap(t => Array.isArray(t.entry) ? t.entry : [t.entry]).filter(Boolean))].sort();
  if (fEntry !== 'all' && !entries.includes(fEntry)) fEntry = 'all';

  const sel = (id, value, options) => `
    <select id="${id}" class="select">
      ${options.map(o => `<option value="${o.v}" ${o.v === value ? 'selected' : ''}>${o.l}</option>`).join('')}
    </select>`;

  return `
    <div class="td-filters">
      ${sel('stYearF', fYear, [{ v: 'all', l: 'Todos los años' }, ...years.map(y => ({ v: y, l: y }))])}
      ${sel('stMonthF', fMonth, [{ v: 'all', l: 'Todos los meses' }, ...months.map(m => ({ v: m, l: `${MONTHS_ES_SHORT[+m.split('-')[1] - 1]} ${m.substring(0, 4)}` }))])}
      ${pairs.length > 1 ? sel('stPairF', fPair, [{ v: 'all', l: 'Todos los pares' }, ...pairs.map(p => ({ v: p, l: p }))]) : ''}
      ${sel('stSetupF', fSetup, [{ v: 'all', l: 'Todas las direcciones' }, { v: 'LONG', l: 'LONG' }, { v: 'SHORT', l: 'SHORT' }])}
      ${zones.length > 1 ? sel('stZoneF', fZone, [{ v: 'all', l: 'Todas las zonas' }, ...zones.map(z => ({ v: z, l: z }))]) : ''}
      ${entries.length > 1 ? sel('stEntryF', fEntry, [{ v: 'all', l: 'Todas las entradas' }, ...entries.map(e => ({ v: e, l: e }))]) : ''}
      ${sel('stResF', fRes, [{ v: 'all', l: 'Todos los resultados' }, { v: 'TP', l: 'Solo TP' }, { v: 'SL', l: 'Solo SL' }, { v: 'BE', l: 'Solo BE' }])}
      ${hayFiltros() ? '<button class="btn ghost" id="stClearF">× Limpiar filtros</button>' : ''}
    </div>`;
}

function wireFiltros(container, sheet) {
  const on = (id, fn) => {
    const el = container.querySelector(id);
    if (el) el.addEventListener('change', () => { fn(el.value); render(container, sheet); });
  };
  on('#stYearF', v => { fYear = v; fMonth = 'all'; });
  on('#stMonthF', v => { fMonth = v; });
  on('#stPairF', v => { fPair = v; });
  on('#stSetupF', v => { fSetup = v; });
  on('#stZoneF', v => { fZone = v; });
  on('#stEntryF', v => { fEntry = v; });
  on('#stResF', v => { fRes = v; });
  const clear = container.querySelector('#stClearF');
  if (clear) clear.addEventListener('click', () => {
    fYear = fMonth = fPair = fSetup = fZone = fEntry = fRes = 'all';
    render(container, sheet);
  });
}

function render(container, sheet) {
  const meta = STRAT_META[sheet];
  const allSheet = state.trades.filter(t => t.sheet === sheet);
  const all = filtro(allSheet);

  if (!allSheet.length) {
    container.innerHTML = `
      ${strategyTabs(sheet)}
      <div class="page-header">
        <div>
          <h1>${meta.label} <span style="color:${meta.color}">·</span> Análisis</h1>
          <div class="sub">${meta.desc}</div>
        </div>
      </div>
      <div class="empty">
        <div class="big">📊</div>
        <div>Aún no hay trades de ${meta.label}.</div>
        <a class="btn primary" href="#/nuevo" style="margin-top:20px;display:inline-flex;">Añadir trade</a>
      </div>
    `;
    return;
  }

  // Con trades en la estrategia pero ninguno que pase los filtros
  if (!all.length) {
    container.innerHTML = `
      ${strategyTabs(sheet)}
      <div class="page-header">
        <div>
          <h1>${meta.label} <span style="color:${meta.color}">·</span> Análisis</h1>
          <div class="sub">0 de ${allSheet.length} trades con esos filtros</div>
        </div>
        <div class="page-actions">
          <a class="btn primary" href="#/nuevo">+ Nuevo trade</a>
        </div>
        ${filtrosHtml(allSheet)}
      </div>
      <div class="empty">
        <div class="big">🔍</div>
        <div>Ningún trade de ${meta.label} pasa esos filtros. Ajústalos arriba o límpialos.</div>
      </div>`;
    wireFiltros(container, sheet);
    return;
  }

  const c = tradeCounts(all);
  const wr = winrate(all);
  const pnl = pnlPct(all);
  const pnlReal = pnlPctReal(all);
  const pf = profitFactor(all);
  const dd = maxDrawdown(all);
  const tpS = maxStreak(all, 'TP');
  const slS = maxStreak(all, 'SL');

  container.innerHTML = `
    ${strategyTabs(sheet)}
    <div class="page-header">
      <div>
        <h1>${meta.label} <span style="color:${meta.color}">·</span> Análisis</h1>
        <div class="sub">${meta.desc} · ${all.length}${all.length !== allSheet.length ? ` de ${allSheet.length}` : ''} trades</div>
      </div>
      <div class="page-actions">
        <a class="btn primary" href="#/nuevo">+ Nuevo trade</a>
      </div>
      ${filtrosHtml(allSheet)}
    </div>

    <div class="kpi-grid">
      ${kpiCard({ label: 'Trades', value: c.total, sub: `${c.tp} TP · ${c.sl} SL · ${c.be} BE`, tone: 'blue' })}
      ${kpiCard({ label: 'Winrate', value: fmtPctNoSign(wr), sub: 'TP / (TP+SL)', tone: (c.tp + c.sl) > 0 && wr < 40 ? 'red' : 'blue' })}
      ${kpiCard({ label: 'P&L sistema', value: fmtPct(pnl, 1), sub: 'Sistema 1R', tone: pnl >= 0 ? 'green' : 'red' })}
      ${kpiCard({ label: 'P&L real', value: fmtPct(pnlReal, 1), sub: 'según riesgo real', tone: pnlReal >= 0 ? 'green' : 'red' })}
      ${kpiCard({ label: 'Profit Factor', value: isFinite(pf) ? pf.toFixed(2) : '∞', sub: 'wins / |losses|', tone: 'purple' })}
      ${kpiCard({ label: 'DD máximo', value: '-' + dd.toFixed(1) + '%', sub: `Racha SL ${slS}`, tone: 'red' })}
    </div>

    <div class="section-title-row">
      <div class="section-title" style="margin:0;">Rendimiento</div>
      <div class="perf-toggle" id="perfToggle"></div>
    </div>
    <div class="grid-2-1">
      <div class="card">
        <div class="card-title">Curva de equity</div>
        <div class="card-sub">P&L acumulado · ${perfMode === 'real' ? 'Real (riesgo aplicado)' : 'Sistema 1R'}</div>
        <div class="chart-wrap" style="height:220px;"><canvas id="equityChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Distribución resultado</div>
        <div class="card-sub">TP / SL / BE</div>
        <div class="chart-wrap" style="height:160px;"><canvas id="donut"></canvas></div>
        <div style="display:flex;justify-content:center;gap:14px;margin-top:12px;font-size:11px;font-family:var(--mono);">
          <span style="color:var(--green)">${c.tp} TP</span>
          <span style="color:var(--red)">${c.sl} SL</span>
          <span style="color:var(--orange)">${c.be} BE</span>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:24px;">
      <div class="card-title">P&L mensual</div>
      <div class="card-sub">Por mes · ${perfMode === 'real' ? 'Real (riesgo aplicado)' : 'Sistema 1R'}</div>
      <div class="chart-wrap" style="height:180px;"><canvas id="monthlyChart"></canvas></div>
    </div>

    ${meta.pairs.length > 1 ? `
    <div class="section-title">Por par</div>
    <div class="card" style="margin-bottom:24px;">
      <div class="card-title">Rendimiento por par</div>
      <table class="data-table"><thead><tr>
        <th>Par</th><th>Trades</th><th>WR</th><th>P&L sist.</th><th>P&L real</th><th>PF</th><th>Racha TP</th><th>DD</th>
      </tr></thead><tbody id="pairsTbody"></tbody></table>
    </div>` : ''}

    <div class="section-title">Por zona</div>
    <div class="card" style="margin-bottom:24px;">
      <div class="card-title">Rendimiento por zona</div>
      <table class="data-table"><thead><tr>
        <th>Zona</th><th>Trades</th><th>WR</th><th>P&L sist.</th><th>P&L real</th><th>PF</th>
      </tr></thead><tbody id="zonesTbody"></tbody></table>
    </div>

    ${meta.entries ? `
    <div class="section-title">Por tipo de entrada</div>
    <div class="card" style="margin-bottom:24px;">
      <div class="card-title">Rendimiento por entrada</div>
      <table class="data-table"><thead><tr>
        <th>Entrada</th><th>Trades</th><th>WR</th><th>P&L sist.</th><th>P&L real</th><th>PF</th>
      </tr></thead><tbody id="entriesTbody"></tbody></table>
    </div>` : ''}

    <div class="section-title">Long vs Short</div>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">Por dirección</div>
        <div class="card-sub">Winrate Long vs Short</div>
        <div class="chart-wrap" style="height:200px;"><canvas id="lsChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Detalle</div>
        <div class="card-sub">Métricas por dirección</div>
        <table class="data-table"><thead><tr>
          <th>Dirección</th><th>Trades</th><th>WR</th><th>P&L sist.</th><th>P&L real</th>
        </tr></thead><tbody id="lsTbody"></tbody></table>
      </div>
    </div>

    <div class="section-title">Timing</div>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">WR por franja horaria</div>
        <div class="card-sub">Hora apertura · Línea = nº trades</div>
        <div class="chart-wrap" style="height:200px;"><canvas id="hourChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">WR por día de semana</div>
        <div class="card-sub">WR + nº trades</div>
        <div class="chart-wrap" style="height:200px;"><canvas id="dayChart"></canvas></div>
      </div>
    </div>

    <div class="section-title">Mapa de calor</div>
    <div class="card" style="margin-bottom:24px;">
      <div class="card-title">WR por día y hora</div>
      <div class="card-sub">Verde = WR alto · Rojo = WR bajo · Gris = sin trades</div>
      <div id="heatmap" style="margin-top:14px;"></div>
    </div>

    <div class="section-title">Duración</div>
    <div class="card" style="margin-bottom:24px;">
      <div class="card-title">Duración de trades</div>
      <table class="data-table"><thead><tr>
        <th>Métrica</th><th>Media</th><th>Media TP</th><th>Media SL</th><th>Máxima</th><th>Mínima</th>
      </tr></thead><tbody id="durTbody"></tbody></table>
    </div>

    <div class="section-title">Trades</div>
    <div id="tradeTable"></div>
  `;

  wireFiltros(container, sheet);

  // Toggle Sistema/Real
  const perfToggleEl = container.querySelector('#perfToggle');
  if (perfToggleEl) {
    renderPills(perfToggleEl, {
      name: 'perfMode',
      options: [{ value: 'sistema', label: 'Sistema' }, { value: 'real', label: 'Real' }],
      value: perfMode,
      onChange: v => { perfMode = v; render(container, sheet); },
    });
  }

  // Charts — en el siguiente frame (layout listo) para evitar lienzo en blanco.
  const eqCurve = perfMode === 'real' ? equityCurveReal : equityCurve;
  requestAnimationFrame(() => {
    if (!container.querySelector('#equityChart')) return;
    createEquity(container.querySelector('#equityChart'),
      [{ key: sheet, label: meta.label, data: eqCurve(all) }]);
    createDonut(container.querySelector('#donut'), c.tp, c.sl, c.be);
    const m = monthlyPnl(all);
    createBar(container.querySelector('#monthlyChart'),
      m.map(d => MONTHS_ES_SHORT[+d.month.split('-')[1] - 1] + ' ' + d.month.substring(2, 4)),
      m.map(d => +(perfMode === 'real' ? d.pnlReal : d.pnl).toFixed(2)));
    // Timing — mismo frame: estos tres se creaban en síncrono y a veces
    // salían en blanco en el primer pintado (el bug que este rAF evita).
    createHourBar(container.querySelector('#hourChart'), wrByHour(all));
    createDayBar(container.querySelector('#dayChart'), wrByDay(all));
    renderHeatmap(container.querySelector('#heatmap'), all);
  });

  // Pairs (only ZONAS)
  if (meta.pairs.length > 1) {
    const ps = statsByGroup(all, t => t.pair).filter(p => meta.pairs.includes(p.key)).sort((a, b) => b.total - a.total);
    container.querySelector('#pairsTbody').innerHTML = ps.map(p => {
      const tpStreak = maxStreak(p.trades, 'TP');
      const ddP = maxDrawdown(p.trades);
      return tableRow([
        p.key, p.total,
        coloredPct(p.wr, 50),
        coloredSignedPct(p.pnl),
        coloredSignedPct(p.pnlReal),
        coloredPF(p.pf),
        `${tpStreak} TP`,
        `<span style="color:var(--red)">-${ddP.toFixed(1)}%</span>`,
      ]);
    }).join('');
  }

  // Zones (cuenta por la PRIMARIA — la primera del array si hay varias)
  const zs = statsByGroup(all, t => (Array.isArray(t.zone) ? t.zone[0] : t.zone) || '–').sort((a, b) => b.total - a.total);
  container.querySelector('#zonesTbody').innerHTML = zs.map(z => tableRow([
    z.key, z.total, coloredPct(z.wr, 50), coloredSignedPct(z.pnl), coloredSignedPct(z.pnlReal), coloredPF(z.pf),
  ])).join('') || '<tr><td colspan="6" class="empty">Sin datos</td></tr>';

  // Entries (cuenta por la PRIMARIA — la primera del array si hay varias)
  if (meta.entries) {
    const es = statsByGroup(all, t => (Array.isArray(t.entry) ? t.entry[0] : t.entry) || '–').sort((a, b) => b.total - a.total);
    container.querySelector('#entriesTbody').innerHTML = es.map(e => tableRow([
      e.key, e.total, coloredPct(e.wr, 50), coloredSignedPct(e.pnl), coloredSignedPct(e.pnlReal), coloredPF(e.pf),
    ])).join('') || '<tr><td colspan="6" class="empty">Sin datos</td></tr>';
  }

  // L/S
  requestAnimationFrame(() => {
    const lsCanvas = container.querySelector('#lsChart');
    if (lsCanvas) createLongShort(lsCanvas, [{ label: meta.label, ...longVsShort(all) }]);
  });
  const ls = longVsShort(all);
  const longSub = all.filter(t => t.setup === 'LONG');
  const shortSub = all.filter(t => t.setup === 'SHORT');
  const lsReal = { long: pnlPctReal(longSub), short: pnlPctReal(shortSub) };
  container.querySelector('#lsTbody').innerHTML = ['long', 'short'].map(d => {
    const x = ls[d];
    return tableRow([d.toUpperCase(), x.n, coloredPct(x.wr, 50), coloredSignedPct(x.pnl), coloredSignedPct(lsReal[d])]);
  }).join('');

  // Duration
  const d = durationStats(all);
  container.querySelector('#durTbody').innerHTML = `
    <tr>
      <td><span class="strat-pill ${meta.cls}">${meta.label}</span></td>
      <td>${d.avg} min</td>
      <td style="color:var(--green)">${d.tp} min</td>
      <td style="color:var(--red)">${d.sl} min</td>
      <td>${d.max} min</td>
      <td>${d.min} min</td>
    </tr>
  `;

  // Trade table
  renderTradeTable(container.querySelector('#tradeTable'), all, { canDelete: true });
}

function tableRow(cells) {
  return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
}
function coloredPct(v, threshold) {
  const c = v >= threshold ? 'var(--green)' : 'var(--red)';
  return `<span style="color:${c}">${v.toFixed(0)}%</span>`;
}
function coloredSignedPct(v) {
  const c = v >= 0 ? 'var(--green)' : 'var(--red)';
  return `<span style="color:${c}">${fmtPct(v, 1)}</span>`;
}
function coloredPF(pf) {
  if (!isFinite(pf)) return '<span style="color:var(--green)">∞</span>';
  const c = pf >= 2 ? 'var(--green)' : pf >= 1.5 ? 'var(--orange)' : 'var(--red)';
  return `<span style="color:${c};font-weight:500">${pf.toFixed(2)}</span>`;
}

export function strategyView(container, sheet) {
  render(container, sheet);
  return state.on(() => render(container, sheet));
}

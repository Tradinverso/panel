// Sección BACKTESTING — histórico de operaciones backtesteadas por estrategia,
// SEPARADO del journal real (state.backtests / users/{uid}/backtests).
// Un ítem en el menú, las 3 estrategias como pestañas; cada una con sus KPIs,
// gráficos y tabla, y su botón "+ Nuevo trade" (una operación backtesteada).
// Sin sensaciones, plan, riesgo real ni cuentas — y sin alimentar diagnóstico,
// dashboard, calendario ni rotación.

import { state } from '../state.js';
import {
  tradeCounts, winrate, pnlPct, profitFactor, maxDrawdown, maxStreak,
  equityCurve, monthlyPnl, wrByHour, wrByDay, longVsShort, statsByGroup,
  durationStats, avgRR, expectancy,
} from '../utils/calculations.js';
import { fmtPct, fmtPctNoSign, fmtNum } from '../utils/number-format-es.js';
import { MONTHS_ES_SHORT } from '../utils/date-helpers.js';
import { STRATEGIES, modelLabel } from '../utils/strategy-config.js';
import { kpiCard, kpiCardComposite } from '../components/kpi-card.js';
import { createEquity, createDonut, createBar, createHourBar, createDayBar, createLongShort } from '../components/charts.js';
import { renderHeatmap } from '../components/heatmap.js';
import { renderTradeTable } from '../components/trade-table.js';
import { backtestTabs } from '../components/backtest-tabs.js';
import { openBacktestFormModal } from '../components/backtest-form-modal.js';
import { openViewTradeModal } from '../components/trade-view-modal.js';
import {
  newPeriod, monthsOf, inPeriod, periodActive, clampPeriod, periodHtml, wirePeriod,
} from '../components/period-filter.js';

// Filtros — TODOS arriba y filtrando TODO (KPIs, gráficas y tablas), no solo
// el listado. Compartidos entre las 3 pestañas; se auto-resetean si el valor
// no existe en la estrategia activa.
let btPeriod = newPeriod();   // rango de meses { from, to }
let btPair = 'all', btSetup = 'all', btZone = 'all', btEntry = 'all', btRes = 'all';
let btModel = 'all';   // modelo de entrada ('' = sin modelo) — solo estrategias con modelos
let btSheetF = 'all';  // filtro de estrategia — solo en la pestaña No tomados

export function backtestView(container, sheet) {
  render(container, sheet);
  const unsub = state.on(() => render(container, sheet));
  return unsub;
}

function hasZone(t, z) {
  return Array.isArray(t.zone) ? t.zone.includes(z) : t.zone === z;
}
function hasEntry(t, e) {
  return Array.isArray(t.entry) ? t.entry.includes(e) : t.entry === e;
}

function filtro(trades) {
  return trades.filter(t => {
    if (!inPeriod(t.date, btPeriod)) return false;
    if (btPair !== 'all' && t.pair !== btPair) return false;
    if (btSetup !== 'all' && t.setup !== btSetup) return false;
    if (btZone !== 'all' && !hasZone(t, btZone)) return false;
    if (btEntry !== 'all' && !hasEntry(t, btEntry)) return false;
    if (btRes !== 'all' && t.result !== btRes) return false;
    if (btSheetF !== 'all' && t.sheet !== btSheetF) return false;
    if (btModel !== 'all' && (!STRATEGIES[t.sheet]?.models || (t.model || '') !== btModel)) return false;
    return true;
  });
}

function hayFiltros() {
  return periodActive(btPeriod) || btPair !== 'all' || btSheetF !== 'all' || btModel !== 'all'
    || btSetup !== 'all' || btZone !== 'all' || btEntry !== 'all' || btRes !== 'all';
}

// Barra única de filtros bajo el encabezado. Opciones derivadas de los DATOS
// de la estrategia (no solo de la config: los imports pueden traer variantes).
function filtrosHtml(allSheet, meta, esNoTomados = false) {
  const months = monthsOf(allSheet);
  // Modelos: de los trades de estrategias que los tienen (en No tomados se
  // mezclan estrategias, y un trade de Zonas no es "sin modelo", es que no aplica).
  const conModelos = allSheet.filter(t => STRATEGIES[t.sheet]?.models);
  const models = conModelos.length
    ? [...new Set(conModelos.map(t => t.model || ''))].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b))
    : [];
  if (btModel !== 'all' && !models.includes(btModel)) btModel = 'all';
  clampPeriod(btPeriod, months);

  const pairs = [...new Set(allSheet.map(t => t.pair).filter(Boolean))].sort();
  if (btPair !== 'all' && !pairs.includes(btPair)) btPair = 'all';
  const zones = [...new Set(allSheet.flatMap(t => Array.isArray(t.zone) ? t.zone : [t.zone]).filter(Boolean))].sort();
  if (btZone !== 'all' && !zones.includes(btZone)) btZone = 'all';
  const entries = [...new Set(allSheet.flatMap(t => Array.isArray(t.entry) ? t.entry : [t.entry]).filter(Boolean))].sort();
  if (btEntry !== 'all' && !entries.includes(btEntry)) btEntry = 'all';

  const sel = (id, value, options) => `
    <select id="${id}" class="select">
      ${options.map(o => `<option value="${o.v}" ${o.v === value ? 'selected' : ''}>${o.l}</option>`).join('')}
    </select>`;

  return `
    <div class="td-filters">
      ${periodHtml(months, btPeriod, { idFrom: 'btFromF', idTo: 'btToF' })}
      ${pairs.length > 1 ? sel('btPairF', btPair, [{ v: 'all', l: 'Todos los pares' }, ...pairs.map(p => ({ v: p, l: p }))]) : ''}
      ${sel('btSetupF', btSetup, [{ v: 'all', l: 'Todas las direcciones' }, { v: 'LONG', l: 'LONG' }, { v: 'SHORT', l: 'SHORT' }])}
      ${models.length > 1 ? sel('btModelF', btModel, [{ v: 'all', l: 'Todos los modelos' }, ...models.map(m => ({ v: m, l: modelLabel(m) }))]) : ''}
      ${zones.length > 1 ? sel('btZoneF', btZone, [{ v: 'all', l: 'Todas las zonas' }, ...zones.map(z => ({ v: z, l: z }))]) : ''}
      ${entries.length > 1 ? sel('btEntryF', btEntry, [{ v: 'all', l: 'Todas las entradas' }, ...entries.map(e => ({ v: e, l: e }))]) : ''}
      ${sel('btResF', btRes, [{ v: 'all', l: 'Todos los resultados' }, { v: 'TP', l: 'Solo TP' }, { v: 'SL', l: 'Solo SL' }, { v: 'BE', l: 'Solo BE' }])}
      ${esNoTomados ? sel('btSheetF', btSheetF, [{ v: 'all', l: 'Todas las estrategias' },
        ...Object.keys(STRATEGIES).map(k => ({ v: k, l: STRATEGIES[k].label }))]) : ''}
      ${hayFiltros() ? '<button class="btn ghost" id="btClearF">× Limpiar filtros</button>' : ''}
    </div>`;
}

// Pestaña "No tomados": no es una estrategia, así que se le fabrica un meta con
// lo único que la vista necesita (label para títulos/gráficas y pairs para
// decidir si tiene sentido la tabla "Por par" — aquí siempre, porque mezcla las
// tres estrategias).
const NO_TOMADOS_META = {
  label: 'No tomados',
  pairs: ['EUR/USD', 'GBP/USD', 'XAU/USD', 'NQ'],
};

function render(container, sheet) {
  const esNoTomados = sheet === 'NO_TOMADOS';
  const meta = esNoTomados ? NO_TOMADOS_META : STRATEGIES[sheet];
  if (!esNoTomados && !meta.models) btModel = 'all';
  // Separación estricta: un trade NO TOMADO no aparece —ni cuenta— en la
  // estrategia a la que pertenece. Si no lo entraste, no valida nada de la
  // operativa; solo sirve para repasar lo que se escapó, y para eso está su
  // propia pestaña.
  const allSheet = esNoTomados
    ? state.backtests.filter(t => t.not_taken === true)
    : state.backtests.filter(t => t.sheet === sheet && t.not_taken !== true);
  if (!esNoTomados) btSheetF = 'all';   // el filtro de estrategia solo vive ahí
  const all = filtro(allSheet);
  const c = tradeCounts(all);
  const decisive = c.tp + c.sl;

  const titulo = esNoTomados
    ? 'Backtesting <span>·</span> No tomados'
    : `Backtesting <span>·</span> ${meta.label}`;
  // También se crea desde aquí: el formulario lleva dentro el selector de
  // estrategia y nace ya marcado como no tomado. Se crea donde va a vivir, en
  // vez de crearlo en su estrategia y verlo desaparecer de allí al guardar.
  const botonNuevo = `<button class="btn primary" id="btNewBtn">+ ${esNoTomados ? 'Nuevo no tomado' : 'Nuevo trade'}</button>`;
  const subtituloBase = esNoTomados
    ? 'Trades que se escaparon · NO cuentan en las estadísticas de cada estrategia'
    : 'Histórico de backtests · separado de tu journal real';

  if (!allSheet.length) {
    container.innerHTML = `
      ${backtestTabs(sheet)}
      <div class="page-header">
        <div>
          <h1>${titulo}</h1>
          <div class="sub">${subtituloBase}</div>
        </div>
        <div class="page-actions">${botonNuevo}</div>
      </div>
      <div class="empty">
        <div class="big">${esNoTomados ? '👀' : '🧪'}</div>
        <div>${esNoTomados
          ? 'Aún no has registrado ningún trade <b>no tomado</b>.<br>Cuando una señal aparezca y no entres, dale a <b>+ Nuevo no tomado</b>:<br>eliges la estrategia dentro y queda aquí, sin ensuciar sus estadísticas.'
          : `Aún no hay backtests de ${meta.label}. Registra aquí tus operaciones backtesteadas<br>para validar la operativa con datos — sin mezclarlas con tu cuenta real.<br><br>¿Los tienes en tu plantilla de Sheets? <a href="#/bt-importar">Impórtalos de golpe →</a>`}</div>
      </div>`;
    wire(container, sheet);
    return;
  }

  // Con datos en la estrategia pero ninguno que pase los filtros
  if (!all.length) {
    container.innerHTML = `
      ${backtestTabs(sheet)}
      <div class="page-header">
        <div>
          <h1>${titulo}</h1>
          <div class="sub">0 de ${allSheet.length} ${esNoTomados ? 'no tomados' : 'backtests'} con esos filtros</div>
        </div>
        <div class="page-actions">${botonNuevo}</div>
        ${filtrosHtml(allSheet, meta, esNoTomados)}
      </div>
      <div class="empty">
        <div class="big">🔍</div>
        <div>Ninguno pasa esos filtros. Ajústalos arriba o límpialos.</div>
      </div>`;
    wire(container, sheet);
    return;
  }

  const wr = winrate(all);
  const pnl = pnlPct(all);
  const pf = profitFactor(all);
  const dd = maxDrawdown(all);
  const rr = avgRR(all);
  const exp = expectancy(all);
  const tpStreak = maxStreak(all, 'TP');
  const slStreakMax = maxStreak(all, 'SL');

  container.innerHTML = `
    ${backtestTabs(sheet)}
    <div class="page-header">
      <div>
        <h1>${titulo}</h1>
        <div class="sub">${all.length}${all.length !== allSheet.length ? ` de ${allSheet.length}` : ''} ${esNoTomados ? (all.length === 1 ? 'no tomado' : 'no tomados') : (all.length === 1 ? 'backtest' : 'backtests')} · ${subtituloBase}</div>
      </div>
      <div class="page-actions">${botonNuevo}</div>
      ${filtrosHtml(allSheet, meta, esNoTomados)}
    </div>

    <div class="kpi-grid">
      ${kpiCard({ label: 'Backtests', value: all.length, sub: `${c.tp} TP · ${c.sl} SL · ${c.be} BE`, tone: 'blue' })}
      ${kpiCard({ label: 'Winrate', value: decisive ? wr.toFixed(1) + '%' : '–', sub: 'TP / (TP+SL)', tone: decisive > 0 && wr < 40 ? 'red' : 'blue' })}
      ${kpiCard({ label: 'P&L acumulado', value: fmtPct(pnl, 1), sub: 'trades al 1%', tone: pnl >= 0 ? 'green' : 'red' })}
      ${kpiCard({ label: 'Profit factor', value: decisive ? (isFinite(pf) ? fmtNum(pf) : '∞') : '–', sub: 'bruto ganado / bruto perdido', tone: !decisive ? 'blue' : pf >= 2 ? 'green' : pf >= 1.5 ? 'orange' : 'red' })}
      ${kpiCard({ label: 'Esperanza / trade', value: decisive ? fmtPct(exp.value, 2) : '–', sub: decisive ? `media TP ${fmtPct(exp.avgWin, 1)} · media SL −${fmtPctNoSign(exp.avgLoss)}` : 'sin trades decisivos', tone: exp.value >= 0 ? 'green' : 'red' })}
      ${kpiCard({ label: 'RR medio', value: rr > 0 ? fmtNum(rr) : '–', sub: rr > 0 ? 'riesgo : beneficio medio' : 'sin RR registrado', tone: 'blue' })}
      ${kpiCard({ label: 'DD máximo', value: (dd > 0 ? '−' : '') + dd.toFixed(1) + '%', sub: 'sobre la curva acumulada', tone: 'red' })}
      ${kpiCardComposite({ label: 'Rachas máx', primary: `${tpStreak} TP`, secondary: `· ${slStreakMax} SL`, sub: 'máximos seguidos en todo el histórico', tone: 'purple' })}
    </div>

    <div class="section-title">Rendimiento</div>
    <div class="grid-2-1">
      <div class="card">
        <div class="card-title">Curva de equity (P&L acumulado)</div>
        <div class="card-sub">Sistema 1R normalizado</div>
        <div class="chart-wrap" style="height:280px;"><canvas id="btEquity"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">P&L mensual</div>
        <div class="chart-wrap" style="height:280px;"><canvas id="btMonthly"></canvas></div>
      </div>
    </div>

    <div class="section-title">Desglose</div>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">Distribución TP / SL / BE</div>
        <div class="chart-wrap" style="height:180px;"><canvas id="btDonut"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Long vs Short</div>
        <div class="card-sub">Winrate según dirección</div>
        <div class="chart-wrap" style="height:180px;"><canvas id="btLs"></canvas></div>
      </div>
    </div>

    ${meta.pairs.length > 1 ? `
    <div class="card table-card" style="margin-bottom:24px;">
      <div class="card-title">Por par</div>
      <table class="data-table"><thead><tr>
        <th>Par</th><th>Trades</th><th>WR</th><th>P&L</th><th>PF</th>
      </tr></thead><tbody id="btPairs"></tbody></table>
    </div>` : ''}

    <div class="grid-2">
      <div class="card table-card">
        <div class="card-title">Por zona</div>
        <table class="data-table"><thead><tr>
          <th>Zona</th><th>Trades</th><th>WR</th><th>P&L</th><th>PF</th>
        </tr></thead><tbody id="btZones"></tbody></table>
      </div>
      <div class="card table-card">
        <div class="card-title">Por entrada</div>
        <table class="data-table"><thead><tr>
          <th>Entrada</th><th>Trades</th><th>WR</th><th>P&L</th><th>PF</th>
        </tr></thead><tbody id="btEntries"></tbody></table>
      </div>
    </div>

    ${all.some(t => STRATEGIES[t.sheet]?.models) ? `
    <div class="card table-card" style="margin-top:16px;">
      <div class="card-title">Por modelo de entrada${esNoTomados ? ' <span style="color:var(--muted);font-weight:400;">(Nasdaq)</span>' : ''}</div>
      <table class="data-table"><thead><tr>
        <th>Modelo</th><th>Trades</th><th>WR</th><th>P&L</th><th>PF</th>
      </tr></thead><tbody id="btModels"></tbody></table>
    </div>` : ''}

    <div class="section-title">Timing</div>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">Winrate por franja horaria</div>
        <div class="card-sub">Hora de apertura · Línea = nº trades</div>
        <div class="chart-wrap" style="height:200px;"><canvas id="btHour"></canvas></div>
      </div>
      <div class="card">
        <div class="card-title">Winrate por día de semana</div>
        <div class="chart-wrap" style="height:200px;"><canvas id="btDay"></canvas></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:24px;">
      <div class="card-title">WR por día y hora</div>
      <div class="card-sub">Verde = WR alto · Rojo = WR bajo · Gris = sin trades</div>
      <div id="btHeatmap" style="margin-top:14px;"></div>
    </div>

    <div class="section-title">Duración</div>
    <div class="card table-card" style="margin-bottom:24px;">
      <table class="data-table"><thead><tr>
        <th>Media</th><th>Media TP</th><th>Media SL</th><th>Máxima</th><th>Mínima</th>
      </tr></thead><tbody id="btDur"></tbody></table>
    </div>

    <div class="section-title">Backtests (${all.length})</div>
    <div id="btTable"></div>
  `;

  wire(container, sheet);

  // Tablas HTML (síncronas)
  paintGroupTable(container.querySelector('#btPairs'), statsByGroup(all, t => t.pair || '–'));
  paintGroupTable(container.querySelector('#btZones'), statsByGroup(all, t => (Array.isArray(t.zone) ? t.zone[0] : t.zone) || '–'));
  paintGroupTable(container.querySelector('#btEntries'), statsByGroup(all, t => (Array.isArray(t.entry) ? t.entry[0] : t.entry) || '–'));
  paintGroupTable(container.querySelector('#btModels'),
    statsByGroup(all.filter(t => STRATEGIES[t.sheet]?.models), t => modelLabel(t.model)));
  const d = durationStats(all);
  const durEl = container.querySelector('#btDur');
  if (durEl) durEl.innerHTML = `<tr>
    <td>${d.avg} min</td>
    <td style="color:var(--green)">${d.tp} min</td>
    <td style="color:var(--red)">${d.sl} min</td>
    <td>${d.max} min</td><td>${d.min} min</td>
  </tr>`;

  // Tabla de backtests: variante sin Sens./Plan/Cuentas/% real, con acciones
  // redirigidas al almacén de backtests (¡nunca al journal!).
  renderTradeTable(container.querySelector('#btTable'), all, {
    canDelete: true,
    variant: 'backtest',
    // Sin barra de filtros propia: los filtros de arriba ya filtran TODO
    // (incluida esta tabla) — evitamos el doble juego de selects y el scroll.
    showFilters: false,
    emptyMsg: 'Sin backtests.',
    // Ver en modo backtest: sin filas del journal, y Editar abre el formulario
    // de backtest (jamás el editor del journal real).
    // OJO: la estrategia sale del backtest (bt.sheet), no de `sheet` — en la
    // pestaña No tomados `sheet` vale 'NO_TOMADOS', que no es una estrategia.
    onView: t => openViewTradeModal(t, { variant: 'backtest', onEdit: bt => openBacktestFormModal(bt.sheet, bt, null) }),
    // Doble clic en la fila → directo al formulario de backtest
    onEdit: bt => openBacktestFormModal(bt.sheet, bt, null),
    onDelete: id => state.removeBacktest(id),
  });

  // Charts en el siguiente frame (layout listo) para evitar lienzos en blanco
  requestAnimationFrame(() => {
    if (!container.querySelector('#btEquity')) return;   // la vista cambió
    createEquity(container.querySelector('#btEquity'),
      [{ key: esNoTomados ? 'ALL' : sheet, label: meta.label, data: equityCurve(all) }]);
    const m = monthlyPnl(all);
    createBar(container.querySelector('#btMonthly'),
      m.map(x => MONTHS_ES_SHORT[+x.month.split('-')[1] - 1] + ' ' + x.month.substring(2, 4)),
      m.map(x => +x.pnl.toFixed(2)));
    createDonut(container.querySelector('#btDonut'), c.tp, c.sl, c.be);
    createLongShort(container.querySelector('#btLs'), [{ label: meta.label, ...longVsShort(all) }]);
    createHourBar(container.querySelector('#btHour'), wrByHour(all));
    createDayBar(container.querySelector('#btDay'), wrByDay(all));
    renderHeatmap(container.querySelector('#btHeatmap'), all);
  });
}

function wire(container, sheet) {
  const btn = container.querySelector('#btNewBtn');
  if (btn) btn.addEventListener('click', () => {
    if (sheet === 'NO_TOMADOS') {
      // Sin estrategia fija: se elige dentro. Si hay uno filtrado, se precarga.
      openBacktestFormModal(btSheetF !== 'all' ? btSheetF : null, null, null, null,
        { pickSheet: true, notTaken: true });
    } else {
      openBacktestFormModal(sheet, null, null);
    }
  });

  // Filtros: todos re-renderizan la vista entera (KPIs + gráficas + tabla)
  const on = (id, fn) => {
    const el = container.querySelector(id);
    if (el) el.addEventListener('change', () => { fn(el.value); render(container, sheet); });
  };
  wirePeriod(container, btPeriod, () => render(container, sheet), { idFrom: 'btFromF', idTo: 'btToF' });
  on('#btPairF', v => { btPair = v; });
  on('#btSetupF', v => { btSetup = v; });
  on('#btZoneF', v => { btZone = v; });
  on('#btEntryF', v => { btEntry = v; });
  on('#btResF', v => { btRes = v; });
  on('#btSheetF', v => { btSheetF = v; });
  on('#btModelF', v => { btModel = v; });
  const clear = container.querySelector('#btClearF');
  if (clear) clear.addEventListener('click', () => {
    btPeriod = newPeriod();
    btPair = btSetup = btZone = btEntry = btRes = btSheetF = btModel = 'all';
    render(container, sheet);
  });
}

function paintGroupTable(tbody, groups) {
  if (!tbody) return;
  const rows = groups.filter(g => g.total >= 1).sort((a, b) => b.total - a.total);
  tbody.innerHTML = rows.length ? rows.map(g => {
    const wrColor = g.wr >= 50 ? 'var(--green)' : 'var(--red)';
    const pnlColor = g.pnl >= 0 ? 'var(--green)' : 'var(--red)';
    const pfColor = g.pf >= 2 ? 'var(--green)' : g.pf >= 1.5 ? 'var(--orange)' : 'var(--red)';
    return `<tr>
      <td>${esc(g.key)}</td>
      <td>${g.total}</td>
      <td style="color:${wrColor}">${g.wr.toFixed(0)}%</td>
      <td style="color:${pnlColor}">${fmtPct(g.pnl, 1)}</td>
      <td style="color:${pfColor};font-weight:500;">${isFinite(g.pf) ? g.pf.toFixed(2) : '∞'}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" class="empty">Sin datos</td></tr>';
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

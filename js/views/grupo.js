// Vista "Stats grupales" (solo admin). Agrega los trades de los alumnos
// seleccionados por grupo (GENERAL / Avanzados / Intermedios / Principiantes
// / Sin nivel) y muestra KPIs + gráficos + ranking. No usa USD ni cuentas —
// solo % y conteos sobre trades.

import { auth } from '../auth.js';
import { sync } from '../sync.js';
import { router } from '../router.js';
import {
  winrate, pnlPct, pnlPctReal, profitFactor, maxDrawdown,
  maxStreak, currentSlStreak, equityCurve, equityCurveReal,
  monthlyPnl, tradeCounts, wrByHour, wrByDay, statsByGroup,
  longVsShort, activeDays,
} from '../utils/calculations.js';
import { sensacionStats, withSensacion, TODAS as SENS_TODAS, POSITIVAS, NEGATIVAS } from '../utils/sensaciones.js';
import { fmtPct, fmtPctNoSign, fmtNum } from '../utils/number-format-es.js';
import { MONTHS_ES, MONTHS_ES_SHORT, formatDateShort, yearMonth } from '../utils/date-helpers.js';
import { convertTradesTz, DEFAULT_TZ } from '../utils/timezone.js';
import { kpiCard } from '../components/kpi-card.js';
import { createEquity, createDonut, createBar, createHourBar, createDayBar, createLongShort } from '../components/charts.js';
import { renderHeatmap } from '../components/heatmap.js';
import { renderPills } from '../components/pills.js';

const STORAGE_KEY = 'tradinverso_grupo_filter';

let cache = null;          // [{uid, profile, trades}, ...] de sync.listStudents()
let yearFilter = 'all';
let monthFilter = 'all';
let perfMode = 'sistema';  // toggle Sistema/Real en gráficos de rendimiento
let sortKey = 'pnlSistema';
let sortDir = 'desc';      // 'asc' | 'desc'

function loadSelectedGroups() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(v) && v.length) return v;
  } catch (e) { /* ignore */ }
  return ['general'];
}
let selectedGroups = loadSelectedGroups();
function saveSelectedGroups() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedGroups)); } catch (e) { /* ignore */ }
}

export function grupoView(container) {
  if (!auth.isAdmin()) {
    router.go('#/dashboard');
    return;
  }
  render(container);
}

async function render(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Stats grupales</h1>
        <div class="sub" id="grupoSub">Cargando alumnos…</div>
      </div>
      <div class="page-actions" id="grupoActions"></div>
    </div>
    <div id="grupoBody">
      <div class="loader"><div class="spinner"></div><div>Cargando alumnos…</div></div>
    </div>
  `;

  try {
    if (!cache) cache = await sync.listStudents();
    paint(container);
  } catch (e) {
    container.querySelector('#grupoBody').innerHTML = `
      <div class="empty">
        <div class="big">⚠</div>
        <div>Error cargando datos: ${escapeHtml(e.message || String(e))}</div>
      </div>
    `;
  }
}

function paint(container) {
  const students = cache || [];

  // 1. Filtrar alumnos por grupos seleccionados
  const studentsSel = filterStudentsByGroups(students, selectedGroups);

  // 2. Agregar trades + aplicar filtro temporal
  // Cada alumno escribe en SU huso: se convierten al del admin para que las
  // estadísticas por hora del grupo sean comparables. Solo afecta a la vista.
  const adminTz = auth.timezone();
  const allTrades = studentsSel.flatMap(s =>
    convertTradesTz(s.trades || [], (s.profile && s.profile.timezone) || DEFAULT_TZ, adminTz)
      .map(t => ({ ...t, _ownerUid: s.uid })));
  const filtered = filterByPeriod(allTrades, yearFilter, monthFilter);

  // ── Sub header + filtros temporales ───────────────────────
  const years = [...new Set(students.flatMap(s => (s.trades || []).map(t => (t.date || '').substring(0, 4))).filter(Boolean))].sort();
  const months = [...new Set(students.flatMap(s => (s.trades || []).map(t => yearMonth(t.date))).filter(Boolean))].sort()
    .filter(m => yearFilter === 'all' || m.startsWith(yearFilter));

  container.querySelector('#grupoSub').textContent = `${studentsSel.length} de ${students.length} alumnos · ${filtered.length} trades`;
  container.querySelector('#grupoActions').innerHTML = `
    <button class="btn" id="grupoRefresh">↻ Refrescar</button>
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
  `;

  container.querySelector('#grupoRefresh').addEventListener('click', async () => {
    cache = null;
    render(container);
  });
  container.querySelector('#yearFilter').addEventListener('change', e => {
    yearFilter = e.target.value;
    monthFilter = 'all';
    paint(container);
  });
  container.querySelector('#monthFilter').addEventListener('change', e => {
    monthFilter = e.target.value;
    paint(container);
  });

  // ── Body ──────────────────────────────────────────────────
  const body = container.querySelector('#grupoBody');
  body.innerHTML = `
    <div class="grupo-tabs-wrap">
      <div class="grupo-tabs-label">Grupos</div>
      <div class="grupo-tabs" id="grupoTabs"></div>
    </div>

    ${filtered.length === 0
      ? `<div class="empty"><div class="big">📊</div><div>Sin trades en el período / grupos seleccionados.</div></div>`
      : `
        <div class="kpi-grid" id="grupoKpis"></div>

        <div class="section-title-row">
          <div class="section-title" style="margin:0;">Rendimiento</div>
          <div class="perf-toggle" id="grupoPerfToggle"></div>
        </div>
        <div class="grid-2-1">
          <div class="card">
            <div class="card-title">Curva de equity (P&L acumulado)</div>
            <div class="card-sub">${perfMode === 'real' ? 'Real (riesgo aplicado)' : 'Sistema 1R'} · media por alumno</div>
            <div class="chart-wrap" style="height:240px;"><canvas id="grupoEquity"></canvas></div>
          </div>
          <div class="card">
            <div class="card-title">P&L mensual</div>
            <div class="card-sub">${perfMode === 'real' ? 'Real (riesgo aplicado)' : 'Sistema 1R'} · media por alumno</div>
            <div class="chart-wrap" style="height:240px;"><canvas id="grupoMonthly"></canvas></div>
          </div>
        </div>

        <div class="section-title">Por estrategia</div>
        <div class="grid-3" id="grupoStrats"></div>

        <div class="section-title">Timing</div>
        <div class="grid-2">
          <div class="card">
            <div class="card-title">Winrate por franja horaria</div>
            <div class="card-sub">Hora apertura · Línea = nº trades</div>
            <div class="chart-wrap" style="height:200px;"><canvas id="grupoHour"></canvas></div>
          </div>
          <div class="card">
            <div class="card-title">Winrate por día semana</div>
            <div class="card-sub">WR + nº trades</div>
            <div class="chart-wrap" style="height:200px;"><canvas id="grupoDay"></canvas></div>
          </div>
        </div>

        <div class="card" style="margin-bottom:24px;">
          <div class="card-title">Mapa de calor (WR por día y hora)</div>
          <div class="card-sub">Verde = WR alto · Rojo = WR bajo</div>
          <div id="grupoHeatmap" style="margin-top:14px;"></div>
        </div>

        <div class="section-title">Dirección y pares</div>
        <div class="grid-2">
          <div class="card">
            <div class="card-title">Long vs Short por estrategia</div>
            <div class="card-sub">Winrate según dirección</div>
            <div class="chart-wrap" style="height:200px;"><canvas id="grupoLs"></canvas></div>
          </div>
          <div class="card">
            <div class="card-title">Rendimiento por par</div>
            <div class="card-sub">Pares con ≥1 trade</div>
            <table class="data-table"><thead><tr>
              <th>Par</th><th>Trades</th><th>WR</th><th>P&L sist.</th><th>P&L real</th><th>PF</th>
            </tr></thead><tbody id="grupoPairs"></tbody></table>
          </div>
        </div>

        <div class="section-title">Sensaciones</div>
        <div class="grid-2">
          <div class="card">
            <div class="card-title">Distribución</div>
            <div class="card-sub">Frecuencia por estado mental</div>
            <div id="grupoSensDist"></div>
          </div>
          <div class="card">
            <div class="card-title">Rendimiento por sensación</div>
            <div class="card-sub">WR · P&L · PF</div>
            <div id="grupoSensTable"></div>
          </div>
        </div>

        <div class="section-title">Ranking por alumno</div>
        <div class="card" style="margin-bottom:24px;">
          <table class="data-table grupo-ranking-table"><thead id="grupoRankHead"></thead><tbody id="grupoRankBody"></tbody></table>
        </div>
      `}
  `;

  // ── Selector de grupos (chips) ────────────────────────────
  renderPills(body.querySelector('#grupoTabs'), {
    name: 'grupo',
    options: [
      { value: 'general',      label: 'GENERAL' },
      { value: 'avanzado',     label: 'Avanzados' },
      { value: 'intermedio',   label: 'Intermedios' },
      { value: 'principiante', label: 'Principiantes' },
      { value: 'sin_nivel',    label: 'Sin nivel' },
    ],
    // pill-group nativo es single-select; replicamos multi-select sobreescribiendo.
    value: selectedGroups[0] || 'general',
    onChange: () => {}, // ignoramos el default — controlamos clicks manualmente abajo
  });
  // Tras renderPills, configuramos comportamiento multi-select y estado inicial.
  const tabsEl = body.querySelector('#grupoTabs');
  setMultiSelectActive(tabsEl, selectedGroups);
  tabsEl.addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if (!pill) return;
    e.stopImmediatePropagation();
    const v = pill.dataset.val;
    if (selectedGroups.includes(v)) {
      selectedGroups = selectedGroups.filter(x => x !== v);
    } else {
      selectedGroups = [...selectedGroups, v];
    }
    // Garantizar que siempre hay al menos un grupo seleccionado
    if (!selectedGroups.length) selectedGroups = ['general'];
    saveSelectedGroups();
    paint(container);
  }, true); // capture phase para anticipar al listener interno de renderPills

  // ── Si no hay trades, paramos aquí ────────────────────────
  if (!filtered.length) return;

  // ── Toggle Sistema/Real ───────────────────────────────────
  renderPills(body.querySelector('#grupoPerfToggle'), {
    name: 'perfMode',
    options: [
      { value: 'sistema', label: 'Sistema' },
      { value: 'real',    label: 'Real' },
    ],
    value: perfMode,
    onChange: v => { perfMode = v; paint(container); },
  });

  // ── KPIs ──────────────────────────────────────────────────
  paintKpis(body, filtered, studentsSel);

  // Divisor para calcular MEDIA por alumno (no suma)
  const nStudents = Math.max(1, studentsSel.length);

  // ── Charts: equity + monthly (en MEDIA por alumno) ─────────
  const eqCurve = perfMode === 'real' ? equityCurveReal : equityCurve;
  const avgCurve = trades => eqCurve(trades).map(p => ({ x: p.x, y: +(p.y / nStudents).toFixed(2) }));
  createEquity(body.querySelector('#grupoEquity'), [
    { key: 'ALL', label: 'Global', data: avgCurve(filtered) },
    { key: 'ZONAS',    label: 'Zonas',    data: avgCurve(filtered.filter(t => t.sheet === 'ZONAS')) },
    { key: 'LIQUIDEZ', label: 'Liquidez', data: avgCurve(filtered.filter(t => t.sheet === 'LIQUIDEZ')) },
    { key: 'NASDAQ',   label: 'Nasdaq',   data: avgCurve(filtered.filter(t => t.sheet === 'NASDAQ')) },
  ]);
  const m = monthlyPnl(filtered);
  createBar(body.querySelector('#grupoMonthly'),
    m.map(d => MONTHS_ES_SHORT[+d.month.split('-')[1] - 1] + ' ' + d.month.substring(2, 4)),
    m.map(d => +((perfMode === 'real' ? d.pnlReal : d.pnl) / nStudents).toFixed(2)));

  // ── Por estrategia ────────────────────────────────────────
  body.querySelector('#grupoStrats').innerHTML = ['ZONAS', 'LIQUIDEZ', 'NASDAQ'].map(s => stratCard(s, filtered.filter(t => t.sheet === s), nStudents)).join('');
  ['ZONAS', 'LIQUIDEZ', 'NASDAQ'].forEach(s => {
    const sub = filtered.filter(t => t.sheet === s);
    const c = tradeCounts(sub);
    const donut = body.querySelector(`[data-strat-donut="${s}"]`);
    if (donut) createDonut(donut, c.tp, c.sl, c.be);
  });

  // ── Timing ────────────────────────────────────────────────
  createHourBar(body.querySelector('#grupoHour'), wrByHour(filtered));
  createDayBar(body.querySelector('#grupoDay'), wrByDay(filtered));
  renderHeatmap(body.querySelector('#grupoHeatmap'), filtered);

  // ── Long vs Short + pares ─────────────────────────────────
  const ls = ['ZONAS', 'LIQUIDEZ', 'NASDAQ'].map(sheet => ({
    label: sheet.charAt(0) + sheet.slice(1).toLowerCase(),
    ...longVsShort(filtered.filter(t => t.sheet === sheet)),
  }));
  createLongShort(body.querySelector('#grupoLs'), ls);

  const byPair = statsByGroup(filtered, t => t.pair || '–').filter(p => p.total >= 1).sort((a, b) => b.total - a.total);
  body.querySelector('#grupoPairs').innerHTML = byPair.map(p => {
    const avgPnl = p.pnl / nStudents;
    const avgPnlReal = p.pnlReal / nStudents;
    const wrColor = p.wr >= 50 ? 'var(--green)' : 'var(--red)';
    const pnlColor = avgPnl >= 0 ? 'var(--green)' : 'var(--red)';
    const pnlRealColor = avgPnlReal >= 0 ? 'var(--green)' : 'var(--red)';
    const pfColor = p.pf >= 2 ? 'var(--green)' : p.pf >= 1.5 ? 'var(--orange)' : 'var(--red)';
    return `<tr>
      <td>${escapeHtml(p.key)}</td>
      <td>${p.total}</td>
      <td style="color:${wrColor}">${p.wr.toFixed(0)}%</td>
      <td style="color:${pnlColor}">${fmtPct(avgPnl, 1)}</td>
      <td style="color:${pnlRealColor}">${fmtPct(avgPnlReal, 1)}</td>
      <td style="color:${pfColor};font-weight:500;">${isFinite(p.pf) ? p.pf.toFixed(2) : '∞'}</td>
    </tr>`;
  }).join('');

  // ── Sensaciones (P&L también en media por alumno) ─────────
  paintSensDist(body.querySelector('#grupoSensDist'), filtered);
  paintSensTable(body.querySelector('#grupoSensTable'), filtered, nStudents);

  // ── Ranking por alumno ────────────────────────────────────
  paintRanking(body, studentsSel);
}

// ───────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────

function filterStudentsByGroups(students, groups) {
  if (groups.includes('general')) return students;
  return students.filter(s => {
    const lvl = s.profile?.level || '';
    if (!lvl && groups.includes('sin_nivel')) return true;
    return groups.includes(lvl);
  });
}

function filterByPeriod(trades, year, month) {
  return trades.filter(t => {
    if (!t.date) return false;
    if (year !== 'all' && !t.date.startsWith(year)) return false;
    if (month !== 'all' && !t.date.startsWith(month)) return false;
    return true;
  });
}

function setMultiSelectActive(container, values) {
  container.querySelectorAll('.pill').forEach(p => {
    p.classList.toggle('active', values.includes(p.dataset.val));
  });
}

function paintKpis(body, trades, students) {
  const n = Math.max(1, students.length);
  const c = tradeCounts(trades);
  const wr = winrate(trades);
  const pnlAvg = pnlPct(trades) / n;
  const pnlRealAvg = pnlPctReal(trades) / n;
  const days = activeDays(trades);
  const slStreak = maxStreak(trades, 'SL');
  body.querySelector('#grupoKpis').innerHTML = [
    kpiCard({ label: 'Alumnos', value: students.length, sub: `${c.total} trades`, tone: 'blue' }),
    kpiCard({ label: 'Winrate global', value: fmtPctNoSign(wr, 1), sub: `${c.tp} TP · ${c.sl} SL · ${c.be} BE`, tone: wr >= 50 ? 'green' : wr >= 40 ? 'orange' : 'red' }),
    kpiCard({ label: 'P&L sistema', value: fmtPct(pnlAvg, 1), sub: 'media por alumno · al 1%', tone: pnlAvg >= 0 ? 'green' : 'red' }),
    kpiCard({ label: 'P&L real', value: fmtPct(pnlRealAvg, 1), sub: 'media por alumno · riesgo real', tone: pnlRealAvg >= 0 ? 'green' : 'red' }),
    kpiCard({ label: 'Días operados', value: days, sub: `${(c.total / Math.max(1, days)).toFixed(1)} trades/día`, tone: 'purple' }),
    kpiCard({ label: 'Racha SL máx', value: slStreak + ' SL', sub: 'peor del grupo', tone: 'red' }),
  ].join('');
}

function stratCard(sheet, sub, nStudents) {
  const cls = { ZONAS: 'zonas', LIQUIDEZ: 'liquidez', NASDAQ: 'nasdaq' }[sheet];
  const label = sheet.charAt(0) + sheet.slice(1).toLowerCase();
  const n = Math.max(1, nStudents);
  const c = tradeCounts(sub);
  const wr = winrate(sub);
  const pnlAvg = pnlPct(sub) / n;
  const pnlRealAvg = pnlPctReal(sub) / n;
  const pf = profitFactor(sub);
  return `
    <div class="card">
      <div class="card-title">${label}</div>
      <div class="card-sub">${c.total} trades · media por alumno</div>
      <div class="mini-stats">
        <div><div class="mini-stat-val" style="color:var(--${cls});">${fmtPctNoSign(wr, 0)}</div><div class="mini-stat-lbl">Winrate</div></div>
        <div><div class="mini-stat-val" style="color:${pnlAvg >= 0 ? 'var(--green)' : 'var(--red)'};">${fmtPct(pnlAvg, 1)}</div><div class="mini-stat-lbl">P&L sist.</div></div>
        <div><div class="mini-stat-val" style="color:${pnlRealAvg >= 0 ? 'var(--green)' : 'var(--red)'};">${fmtPct(pnlRealAvg, 1)}</div><div class="mini-stat-lbl">P&L real</div></div>
        <div><div class="mini-stat-val" style="color:var(--orange);">${fmtNum(pf)}</div><div class="mini-stat-lbl">Profit Factor</div></div>
      </div>
      <div class="chart-wrap" style="height:130px;"><canvas data-strat-donut="${sheet}"></canvas></div>
    </div>
  `;
}

function paintSensDist(container, trades) {
  const stats = sensacionStats(trades);
  const ws = withSensacion(trades);
  if (!ws.length) {
    container.innerHTML = '<div class="empty">Sin trades con sensación registrada</div>';
    return;
  }
  const total = ws.length;
  const max = Math.max(...[...stats.values()].map(d => d.total));
  container.innerHTML = SENS_TODAS.filter(s => stats.has(s)).map(s => {
    const d = stats.get(s);
    const pct = Math.round(d.total / total * 100);
    const w = Math.round(d.total / max * 100);
    const color = POSITIVAS.includes(s) ? 'var(--green)' : NEGATIVAS.includes(s) ? 'var(--red)' : 'var(--orange)';
    return `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <span style="min-width:160px;"><span class="sens-pill" data-s="${escapeAttr(s)}">${escapeHtml(s)}</span></span>
        <div style="flex:1;height:8px;background:var(--card2);border-radius:4px;overflow:hidden;">
          <div style="width:${w}%;height:100%;background:${color};border-radius:4px;"></div>
        </div>
        <span style="font-family:var(--mono);font-size:11px;color:var(--muted);min-width:60px;text-align:right;">${d.total} (${pct}%)</span>
      </div>
    `;
  }).join('');
}

function paintSensTable(container, trades, nStudents) {
  const stats = sensacionStats(trades);
  if (!stats.size) {
    container.innerHTML = '<div class="empty">Sin trades con sensación registrada</div>';
    return;
  }
  const n = Math.max(1, nStudents || 1);
  container.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Sensación</th><th>Trades</th><th>WR</th><th>P&L <span style="color:var(--muted);font-weight:400;font-size:9px;">(media)</span></th><th>PF</th><th>TP/SL/BE</th></tr></thead>
      <tbody>
        ${SENS_TODAS.filter(s => stats.has(s)).map(s => {
          const d = stats.get(s);
          const avgPnl = d.pnl / n;
          const wrColor = d.wr >= 50 ? 'var(--green)' : d.wr >= 40 ? 'var(--orange)' : 'var(--red)';
          const pnlColor = avgPnl >= 0 ? 'var(--green)' : 'var(--red)';
          const pfColor = !isFinite(d.pf) ? 'var(--green)' : d.pf >= 2 ? 'var(--green)' : d.pf >= 1.5 ? 'var(--orange)' : 'var(--red)';
          return `<tr>
            <td><span class="sens-pill" data-s="${escapeAttr(s)}">${escapeHtml(s)}</span></td>
            <td>${d.total}</td>
            <td style="color:${wrColor};font-weight:500;">${fmtPctNoSign(d.wr, 0)}</td>
            <td style="color:${pnlColor};font-weight:500;">${fmtPct(avgPnl, 1)}</td>
            <td style="color:${pfColor};font-weight:500;">${isFinite(d.pf) ? d.pf.toFixed(2) : '∞'}</td>
            <td style="font-family:var(--mono);font-size:11px;">
              <span style="color:var(--green)">${d.tp}</span> /
              <span style="color:var(--red)">${d.sl}</span> /
              <span style="color:var(--orange)">${d.be}</span>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

const LEVEL_LABEL = { avanzado: 'Avanzado', intermedio: 'Intermedio', principiante: 'Principiante', '': '—' };
const LEVEL_ORDER = { avanzado: 0, intermedio: 1, principiante: 2, '': 3 };

function paintRanking(body, students) {
  // Construir filas con stats individuales del alumno (en el período filtrado).
  const rows = students.map(s => {
    const trs = filterByPeriod(s.trades || [], yearFilter, monthFilter);
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthTrades = (s.trades || []).filter(t => (t.date || '').startsWith(ym));
    return {
      uid: s.uid,
      nombre: s.profile?.nombre || s.profile?.email?.split('@')[0] || '—',
      level: s.profile?.level || '',
      count: trs.length,
      wr: winrate(trs),
      pnlSistema: pnlPct(trs),
      pnlReal: pnlPctReal(trs),
      slStreak: currentSlStreak(trs),
      pnlMes: pnlPct(monthTrades),
    };
  });

  // Ordenar
  rows.sort((a, b) => {
    if (sortKey === 'level') {
      return ((LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9)) * (sortDir === 'asc' ? 1 : -1);
    }
    if (sortKey === 'nombre') {
      return a.nombre.localeCompare(b.nombre, 'es') * (sortDir === 'asc' ? 1 : -1);
    }
    return ((a[sortKey] ?? 0) - (b[sortKey] ?? 0)) * (sortDir === 'asc' ? 1 : -1);
  });

  const cols = [
    { key: 'level',      label: 'Nivel' },
    { key: 'nombre',     label: 'Nombre' },
    { key: 'count',      label: 'Trades' },
    { key: 'wr',         label: 'WR' },
    { key: 'pnlSistema', label: 'P&L sist.' },
    { key: 'pnlReal',    label: 'P&L real' },
    { key: 'slStreak',   label: 'Racha SL' },
    { key: 'pnlMes',     label: 'P&L mes' },
  ];

  body.querySelector('#grupoRankHead').innerHTML = `
    <tr>
      ${cols.map(c => {
        const active = c.key === sortKey;
        const arrow = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
        return `<th data-sort="${c.key}" class="grupo-rank-th${active ? ' active' : ''}">${c.label}${arrow}</th>`;
      }).join('')}
    </tr>
  `;
  body.querySelector('#grupoRankBody').innerHTML = rows.map(r => {
    const wrColor = r.wr >= 50 ? 'var(--green)' : r.wr >= 40 ? 'var(--orange)' : 'var(--red)';
    const pnlSysColor = r.pnlSistema >= 0 ? 'var(--green)' : 'var(--red)';
    const pnlRealColor = r.pnlReal >= 0 ? 'var(--green)' : 'var(--red)';
    const pnlMesColor = r.pnlMes >= 0 ? 'var(--green)' : 'var(--red)';
    const slColor = r.slStreak >= 3 ? 'var(--red)' : r.slStreak >= 1 ? 'var(--orange)' : 'var(--muted)';
    return `<tr>
      <td><span class="grupo-level-pill l-${r.level || 'none'}">${LEVEL_LABEL[r.level]}</span></td>
      <td><strong>${escapeHtml(r.nombre)}</strong></td>
      <td>${r.count}</td>
      <td style="color:${wrColor};font-weight:500;">${r.count ? fmtPctNoSign(r.wr, 0) : '–'}</td>
      <td style="color:${pnlSysColor};font-weight:500;">${r.count ? fmtPct(r.pnlSistema, 1) : '–'}</td>
      <td style="color:${pnlRealColor};font-weight:500;">${r.count ? fmtPct(r.pnlReal, 1) : '–'}</td>
      <td style="color:${slColor};font-family:var(--mono);">${r.slStreak > 0 ? r.slStreak + ' SL' : '–'}</td>
      <td style="color:${pnlMesColor};font-weight:500;">${r.pnlMes ? fmtPct(r.pnlMes, 1) : '–'}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="${cols.length}" class="empty">Sin alumnos en este grupo.</td></tr>`;

  body.querySelectorAll('[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const newKey = th.dataset.sort;
      if (sortKey === newKey) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortKey = newKey; sortDir = 'desc'; }
      // Re-render solo el ranking
      paintRanking(body, students);
    });
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/"/g, '&quot;');
}

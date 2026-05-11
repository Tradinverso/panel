import { state } from '../state.js';
import { MONTHS_ES } from '../utils/date-helpers.js';
import { fmtPct } from '../utils/number-format-es.js';
import { renderTradeTable } from '../components/trade-table.js';
import { tradeRealPnl } from '../utils/calculations.js';
import { computeUsdPnl, fmtUsd } from '../utils/account-stats.js';

let calYear = null, calMonth = null;
let stratFilter = 'all';
let selectedDay = null;

export function calendarView(container) {
  if (calYear == null) {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
  }
  render(container);
  return state.on(() => render(container));
}

function render(container) {
  const all = state.trades;
  const monthTrades = all.filter(t => {
    if (stratFilter !== 'all' && t.sheet !== stratFilter) return false;
    return true;
  });
  const dayIndex = buildDayIndex(monthTrades, state.cuentas);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Calendario <span>·</span> ${MONTHS_ES[calMonth]} ${calYear}</h1>
        <div class="sub">P&L diario · Círculo naranja = 5+ trades en el día (sobreoperar)</div>
      </div>
      <div class="page-actions">
        <select id="stratF" class="select">
          <option value="all" ${stratFilter === 'all' ? 'selected' : ''}>Todas las estrategias</option>
          <option value="ZONAS" ${stratFilter === 'ZONAS' ? 'selected' : ''}>Zonas</option>
          <option value="LIQUIDEZ" ${stratFilter === 'LIQUIDEZ' ? 'selected' : ''}>Liquidez</option>
          <option value="NASDAQ" ${stratFilter === 'NASDAQ' ? 'selected' : ''}>Nasdaq</option>
        </select>
        <div class="cal-controls">
          <button class="cal-btn" id="prev">‹</button>
          <span class="cal-month-label">${MONTHS_ES[calMonth]} ${calYear}</span>
          <button class="cal-btn" id="next">›</button>
        </div>
      </div>
    </div>

    <div class="cal-summary" id="calSummary"></div>

    <div class="cal-wrap">
      <div class="cal-dow-row">
        <div class="cal-dow">LUN</div>
        <div class="cal-dow">MAR</div>
        <div class="cal-dow">MIÉ</div>
        <div class="cal-dow">JUE</div>
        <div class="cal-dow">VIE</div>
        <div class="cal-dow">SÁB</div>
        <div class="cal-dow">DOM</div>
      </div>
      <div class="cal-grid" id="calGrid"></div>
    </div>

    <div class="cal-legend" style="margin-top:12px;">
      <div class="cl-item"><div class="cl-dot" style="background:var(--green);"></div>Positivo</div>
      <div class="cl-item"><div class="cl-dot" style="background:var(--red);"></div>Negativo</div>
      <div class="cl-item"><div class="cl-dot" style="background:var(--orange);"></div>Break even</div>
      <div class="cl-item"><span class="cal-warn" style="position:static;">5</span> 5+ trades</div>
    </div>

    <div class="section-title">${selectedDay ? `Trades del ${selectedDay}` : 'Trades del mes'}</div>
    <div id="dayTrades"></div>
  `;

  container.querySelector('#prev').addEventListener('click', () => navigate(container, -1));
  container.querySelector('#next').addEventListener('click', () => navigate(container, 1));
  container.querySelector('#stratF').addEventListener('change', e => {
    stratFilter = e.target.value;
    selectedDay = null;
    render(container);
  });

  paintCalendar(container, dayIndex);
}

function navigate(container, dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0) { calMonth = 11; calYear--; }
  selectedDay = null;
  render(container);
}

function buildDayIndex(trades, cuentas = []) {
  const cuentaMap = new Map(cuentas.map(c => [c.id, c]));
  const map = {};
  for (const t of trades) {
    if (!map[t.date]) map[t.date] = { trades: [], pnl: 0, pnlReal: 0, usd: 0, count: 0, tp: 0, sl: 0, be: 0 };
    const d = map[t.date];
    d.trades.push(t);
    d.count++;
    if (t.result !== 'BE') {
      d.pnl += t.pnl_pct || 0;
      d.pnlReal += tradeRealPnl(t);
      // USD real solo de cuentas FONDEADAS (las challenge no son dinero cobrable)
      if (Array.isArray(t.accounts)) {
        for (const a of t.accounts) {
          const c = cuentaMap.get(a.accountId);
          if (c && c.fase === 'fondeada') {
            d.usd += computeUsdPnl(t.pnl_pct, a.riskPct, c.capital);
          }
        }
      }
    }
    if (t.result === 'TP') d.tp++;
    else if (t.result === 'SL') d.sl++;
    else d.be++;
  }
  return map;
}

function paintCalendar(container, dayIndex) {
  const grid = container.querySelector('#calGrid');
  grid.innerHTML = '';
  const firstDow = (new Date(calYear, calMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prevLast = new Date(calYear, calMonth, 0).getDate();
  const today = new Date();
  let mTrades = 0, mTp = 0, mSl = 0, mPnl = 0, mPnlReal = 0, mUsd = 0, mOver = 0;

  for (let i = firstDow - 1; i >= 0; i--) {
    grid.appendChild(emptyCell(prevLast - i, 'other'));
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${calYear}-${pad(calMonth + 1)}-${pad(d)}`;
    const data = dayIndex[ds];
    const isToday = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
    const cell = document.createElement('div');
    let cls = 'cal-cell';
    if (data) {
      cls += ' has-data ' + (data.pnl > 0 ? 'profit' : data.pnl < 0 ? 'loss' : 'be');
      mTrades += data.count; mTp += data.tp; mSl += data.sl; mPnl += data.pnl; mPnlReal += data.pnlReal; mUsd += data.usd;
      if (data.count >= 5) mOver++;
    }
    if (isToday) cls += ' cal-today';
    if (selectedDay === ds) cls += ' selected';
    cell.className = cls;
    if (data) {
      const usdLine = data.usd !== 0
        ? `<div class="cal-pnl-usd">${fmtUsd(data.usd, true)}</div>`
        : '';
      cell.innerHTML = `
        <span class="cal-num">${d}</span>
        <div class="cal-pnl">${fmtPct(data.pnl)}</div>
        <div class="cal-pnl-real">real ${fmtPct(data.pnlReal)}</div>
        ${usdLine}
        <div class="cal-meta">${data.count} trade${data.count > 1 ? 's' : ''} · ${data.tp}T ${data.sl}S${data.be > 0 ? ' ' + data.be + 'BE' : ''}</div>
        ${data.count >= 5 ? `<div class="cal-warn">${data.count}</div>` : ''}
      `;
      cell.addEventListener('click', () => {
        selectedDay = ds;
        render(container);
      });
    } else {
      cell.innerHTML = `<span class="cal-num">${d}</span>`;
    }
    grid.appendChild(cell);
  }
  const rem = (7 - (firstDow + daysInMonth) % 7) % 7;
  for (let i = 1; i <= rem; i++) grid.appendChild(emptyCell(i, 'other'));

  const wr = (mTp + mSl) > 0 ? mTp / (mTp + mSl) * 100 : 0;
  const sumDiv = container.querySelector('#calSummary');
  sumDiv.innerHTML = `
    <div class="cs-card">
      <div class="cs-label">Trades del mes</div>
      <div class="cs-val">${mTrades || '–'}</div>
      <div class="cs-sub">${mTrades > 0 ? `${mTp}TP · ${mSl}SL` : '–'}</div>
    </div>
    <div class="cs-card">
      <div class="cs-label">Winrate</div>
      <div class="cs-val" style="color:${wr >= 55 ? 'var(--green)' : wr < 45 ? 'var(--red)' : 'var(--orange)'};">${mTrades > 0 ? wr.toFixed(1) + '%' : '–'}</div>
      <div class="cs-sub">del mes</div>
    </div>
    <div class="cs-card">
      <div class="cs-label">P&L sistema</div>
      <div class="cs-val" style="color:${mPnl > 0 ? 'var(--green)' : mPnl < 0 ? 'var(--red)' : 'var(--orange)'};">${mTrades > 0 ? fmtPct(mPnl) : '–'}</div>
      <div class="cs-sub">% sistema 1R</div>
    </div>
    <div class="cs-card">
      <div class="cs-label">P&L real</div>
      <div class="cs-val" style="color:${mPnlReal > 0 ? 'var(--green)' : mPnlReal < 0 ? 'var(--red)' : 'var(--orange)'};">${mTrades > 0 ? fmtPct(mPnlReal) : '–'}</div>
      <div class="cs-sub">según riesgo real</div>
    </div>
    <div class="cs-card">
      <div class="cs-label">USD mes</div>
      <div class="cs-val" style="color:${mUsd > 0 ? 'var(--green)' : mUsd < 0 ? 'var(--red)' : 'var(--orange)'};">${mUsd !== 0 ? fmtUsd(mUsd, true) : '–'}</div>
      <div class="cs-sub">solo fondeadas</div>
    </div>
    <div class="cs-card">
      <div class="cs-label">Sobreoperar</div>
      <div class="cs-val" style="color:${mOver > 2 ? 'var(--red)' : mOver > 0 ? 'var(--orange)' : 'var(--green)'};">${mOver}</div>
      <div class="cs-sub">días con 5+ trades</div>
    </div>
  `;

  // Day trades panel
  const tradesEl = container.querySelector('#dayTrades');
  if (selectedDay && dayIndex[selectedDay]) {
    renderTradeTable(tradesEl, dayIndex[selectedDay].trades, { canDelete: true, emptyMsg: 'Sin trades este día' });
  } else {
    const monthStr = `${calYear}-${pad(calMonth + 1)}`;
    const monthList = state.trades.filter(t => t.date.startsWith(monthStr) && (stratFilter === 'all' || t.sheet === stratFilter));
    if (monthList.length) {
      renderTradeTable(tradesEl, monthList, { canDelete: true });
    } else {
      tradesEl.innerHTML = '<div class="empty">Sin trades en este mes</div>';
    }
  }
}

function pad(n) { return String(n).padStart(2, '0'); }
function emptyCell(num, extra) {
  const c = document.createElement('div');
  c.className = `cal-cell ${extra}`;
  c.innerHTML = `<span class="cal-num">${num}</span>`;
  return c;
}

import { state } from '../state.js';
import { MONTHS_ES } from '../utils/date-helpers.js';
import { fmtPct } from '../utils/number-format-es.js';
import { renderTradeTable } from '../components/trade-table.js';
import { tradeRealPnl } from '../utils/calculations.js';
import { openReflectionModal } from './psicologia.js';

let calYear = null, calMonth = null;
let stratFilter = 'all';
let selectedDay = null;
let selectedWeek = null;  // ISO 'YYYY-MM-DD' del lunes de la semana seleccionada

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
  const dayIndex = buildDayIndex(monthTrades);

  const titleText = selectedDay
    ? `Trades del ${selectedDay}`
    : selectedWeek
      ? `Trades de la semana del ${selectedWeek}`
      : 'Trades del mes';

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
        <div class="cal-dow cal-dow-sem">SEM</div>
      </div>
      <div class="cal-grid" id="calGrid"></div>
    </div>

    <div class="cal-legend" style="margin-top:12px;">
      <div class="cl-item"><div class="cl-dot" style="background:var(--green);"></div>Positivo</div>
      <div class="cl-item"><div class="cl-dot" style="background:var(--red);"></div>Negativo</div>
      <div class="cl-item"><div class="cl-dot" style="background:var(--orange);"></div>Break even</div>
      <div class="cl-item"><span class="cal-warn" style="position:static;">5</span> 5+ trades</div>
    </div>

    <div class="section-title">${titleText}</div>
    <div id="dayTrades"></div>
  `;

  container.querySelector('#prev').addEventListener('click', () => navigate(container, -1));
  container.querySelector('#next').addEventListener('click', () => navigate(container, 1));
  container.querySelector('#stratF').addEventListener('change', e => {
    stratFilter = e.target.value;
    selectedDay = null;
    selectedWeek = null;
    render(container);
  });

  paintCalendar(container, dayIndex);
}

function navigate(container, dir) {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0) { calMonth = 11; calYear--; }
  selectedDay = null;
  selectedWeek = null;
  render(container);
}

function buildDayIndex(trades) {
  const map = {};
  for (const t of trades) {
    if (!map[t.date]) map[t.date] = { trades: [], pnl: 0, pnlReal: 0, count: 0, tp: 0, sl: 0, be: 0 };
    const d = map[t.date];
    d.trades.push(t);
    d.count++;
    if (t.result !== 'BE') {
      d.pnl += t.pnl_pct || 0;
      d.pnlReal += tradeRealPnl(t);
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
  const today = new Date();
  let mTrades = 0, mTp = 0, mSl = 0, mPnl = 0, mPnlReal = 0, mOver = 0;

  // Fechas que tienen reflexión diaria — para mostrar el icono 📝 en la celda
  const reflexDates = new Set(
    (state.reflections || []).filter(r => r.type === 'daily').map(r => r.period)
  );

  // Cursor sobre el lunes de la primera fila (puede caer en el mes anterior)
  const cursor = new Date(calYear, calMonth, 1);
  cursor.setDate(cursor.getDate() - firstDow);

  // Última fila a pintar: la que contiene el último día del mes
  const lastDay = new Date(calYear, calMonth, daysInMonth);
  const lastDayDow = (lastDay.getDay() + 6) % 7;
  const endOfLastRow = new Date(lastDay);
  endOfLastRow.setDate(endOfLastRow.getDate() + (6 - lastDayDow));

  while (cursor <= endOfLastRow) {
    let wTrades = 0, wTp = 0, wSl = 0, wBe = 0, wPnl = 0, wPnlReal = 0;
    const mondayISO = isoOf(cursor);

    // 7 celdas de día (lun → dom)
    for (let i = 0; i < 7; i++) {
      const ds = isoOf(cursor);
      const dayNum = cursor.getDate();
      const inMonth = cursor.getMonth() === calMonth && cursor.getFullYear() === calYear;
      const data = dayIndex[ds];
      const isToday = inMonth && dayNum === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();

      const cell = document.createElement('div');
      let cls = 'cal-cell';
      if (!inMonth) cls += ' other';
      if (selectedWeek === mondayISO) cls += ' in-week';

      if (inMonth && data) {
        cls += ' has-data ' + (data.pnl > 0 ? 'profit' : data.pnl < 0 ? 'loss' : 'be');
        // Solo trades del mes actual cuentan para el resumen del mes
        mTrades += data.count; mTp += data.tp; mSl += data.sl;
        mPnl += data.pnl; mPnlReal += data.pnlReal;
        if (data.count >= 5) mOver++;
      }
      if (isToday) cls += ' cal-today';
      if (selectedDay === ds) cls += ' selected';
      cell.className = cls;

      // Acumulado de la semana — incluye días del mes vecino (la semana es la semana)
      if (data) {
        wTrades += data.count; wTp += data.tp; wSl += data.sl; wBe += data.be;
        wPnl += data.pnl; wPnlReal += data.pnlReal;
      }

      const hasReflex = inMonth && reflexDates.has(ds);
      const reflexBtn = hasReflex
        ? `<button class="cal-reflex-btn" data-reflex="${ds}" title="Ver reflexión del día">📝</button>`
        : '';

      if (inMonth && data) {
        cell.innerHTML = `
          ${reflexBtn}
          <span class="cal-num">${dayNum}</span>
          <div class="cal-body">
            <div class="cal-pnl">${fmtPct(data.pnl)}</div>
            <div class="cal-pnl-real">real ${fmtPct(data.pnlReal)}</div>
            <div class="cal-meta">${data.count} trade${data.count > 1 ? 's' : ''} · ${data.tp}T ${data.sl}S${data.be > 0 ? ' ' + data.be + 'BE' : ''}</div>
          </div>
          ${data.count >= 5 ? `<div class="cal-warn">${data.count}</div>` : ''}
        `;
        cell.addEventListener('click', () => {
          selectedDay = ds;
          selectedWeek = null;
          render(container);
        });
      } else {
        cell.innerHTML = `${reflexBtn}<span class="cal-num">${dayNum}</span>`;
      }

      const reflexBtnEl = cell.querySelector('.cal-reflex-btn');
      if (reflexBtnEl) {
        reflexBtnEl.addEventListener('click', e => {
          e.stopPropagation();
          openReflectionModal('daily', ds);
        });
      }

      grid.appendChild(cell);
      cursor.setDate(cursor.getDate() + 1);
    }

    // 8ª celda: resumen de semana
    const wWr = (wTp + wSl) > 0 ? wTp / (wTp + wSl) * 100 : 0;
    const wkCell = document.createElement('div');
    let wkCls = 'cal-week-summary';
    if (selectedWeek === mondayISO) wkCls += ' selected';
    if (wTrades === 0) wkCls += ' empty';
    wkCell.className = wkCls;
    wkCell.dataset.weekMonday = mondayISO;
    if (wTrades > 0) {
      const wrColor = wWr >= 55 ? 'var(--green)' : wWr < 45 ? 'var(--red)' : 'var(--orange)';
      const pnlColor = wPnl > 0 ? 'var(--green)' : wPnl < 0 ? 'var(--red)' : 'var(--orange)';
      const pnlRealColor = wPnlReal > 0 ? 'var(--green)' : wPnlReal < 0 ? 'var(--red)' : 'var(--orange)';
      const breakdown = `${wTp}T · ${wSl}S${wBe > 0 ? ' · ' + wBe + 'BE' : ''}`;
      wkCell.innerHTML = `
        <div class="cws-top">${wTrades} tr · <span class="cws-wr" style="color:${wrColor};">${wWr.toFixed(0)}% WR</span></div>
        <div class="cws-bd">${breakdown}</div>
        <div class="cws-pnl" style="color:${pnlColor};"><span class="cws-lbl">sis</span>${fmtPct(wPnl, 1)}</div>
        <div class="cws-pnl" style="color:${pnlRealColor};"><span class="cws-lbl">rl</span>${fmtPct(wPnlReal, 1)}</div>
      `;
    } else {
      wkCell.innerHTML = `<div class="cws-empty">–</div>`;
    }
    wkCell.addEventListener('click', () => {
      selectedWeek = selectedWeek === mondayISO ? null : mondayISO;
      selectedDay = null;
      render(container);
    });
    grid.appendChild(wkCell);
  }

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
      <div class="cs-label">Sobreoperar</div>
      <div class="cs-val" style="color:${mOver > 2 ? 'var(--red)' : mOver > 0 ? 'var(--orange)' : 'var(--green)'};">${mOver}</div>
      <div class="cs-sub">días con 5+ trades</div>
    </div>
  `;

  // Panel de trades inferior: día > semana > mes
  const tradesEl = container.querySelector('#dayTrades');
  if (selectedDay && dayIndex[selectedDay]) {
    renderTradeTable(tradesEl, dayIndex[selectedDay].trades, { canDelete: true, emptyMsg: 'Sin trades este día' });
  } else if (selectedWeek) {
    const monday = selectedWeek;
    const sunday = isoPlusDays(monday, 6);
    const weekList = state.trades.filter(t =>
      t.date >= monday && t.date <= sunday &&
      (stratFilter === 'all' || t.sheet === stratFilter)
    );
    if (weekList.length) {
      renderTradeTable(tradesEl, weekList, { canDelete: true });
    } else {
      tradesEl.innerHTML = '<div class="empty">Sin trades esta semana</div>';
    }
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

function isoOf(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isoPlusDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return isoOf(dt);
}

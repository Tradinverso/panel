// Vista "Psicología": reflexiones del trader a tres niveles (diaria, semanal,
// mensual). Cada reflexión va acompañada de los stats del período (TP/SL/BE,
// P&L sistema, P&L real, USD de cuentas fondeadas) para correlacionar emoción
// con resultados.

import { state } from '../state.js';
import { openModal } from '../components/modal.js';
import { renderPills } from '../components/pills.js';
import {
  periodStats, mondayOf, sundayOf, firstDayOfMonth, lastDayOfMonth,
  todayISO, weeksOfYear, isoWeekNumber, fmtWeekRange,
} from '../utils/period-stats.js';
import { MONTHS_ES, MONTHS_ES_SHORT } from '../utils/date-helpers.js';
import { fmtPct } from '../utils/number-format-es.js';
import { fmtUsd } from '../utils/account-stats.js';

let tab = 'daily'; // 'daily' | 'weekly' | 'monthly'
let calYear = null;
let calMonth = null;
let listYear = null;
let showEmptyWeeks = false;

export function psicologiaView(container) {
  if (calYear == null) {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    listYear = now.getFullYear();
  }
  render(container);
  // Igual que tabla-datos: no re-renderizamos si hay un textarea/input enfocado
  // para no romper la edición.
  const unsub = state.on(() => {
    const focused = document.activeElement;
    if (focused && container.contains(focused) &&
        ['INPUT', 'SELECT', 'TEXTAREA'].includes(focused.tagName)) {
      return;
    }
    render(container);
  });
  return unsub;
}

function render(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Psicología</h1>
        <div class="sub">Reflexiones diaria · semanal · mensual con stats del período</div>
      </div>
      <div class="page-actions">
        <div class="psico-tabs" id="psicoTabs"></div>
      </div>
    </div>
    <div id="psicoBody"></div>
  `;

  // Tabs
  renderPills(container.querySelector('#psicoTabs'), {
    name: 'tab',
    options: [
      { value: 'daily',   label: 'Diaria' },
      { value: 'weekly',  label: 'Semanal' },
      { value: 'monthly', label: 'Mensual' },
    ],
    value: tab,
    onChange: v => { tab = v; render(container); },
  });

  const body = container.querySelector('#psicoBody');
  if (tab === 'daily') renderDaily(body);
  else if (tab === 'weekly') renderWeekly(body);
  else renderMonthly(body);
}

// ─── DIARIA ──────────────────────────────────────────────────

function renderDaily(body) {
  body.innerHTML = `
    <div class="psico-nav">
      <button class="cal-btn" id="prevMonth">‹</button>
      <span class="cal-month-label">${MONTHS_ES[calMonth]} ${calYear}</span>
      <button class="cal-btn" id="nextMonth">›</button>
    </div>
    <div class="psico-cal-wrap">
      <div class="cal-dow-row">
        <div class="cal-dow">LUN</div>
        <div class="cal-dow">MAR</div>
        <div class="cal-dow">MIÉ</div>
        <div class="cal-dow">JUE</div>
        <div class="cal-dow">VIE</div>
        <div class="cal-dow">SÁB</div>
        <div class="cal-dow">DOM</div>
      </div>
      <div class="cal-grid" id="psicoGrid"></div>
    </div>
  `;

  body.querySelector('#prevMonth').addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    render(body.parentElement);
  });
  body.querySelector('#nextMonth').addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    render(body.parentElement);
  });

  paintDailyGrid(body);
}

function paintDailyGrid(body) {
  const grid = body.querySelector('#psicoGrid');
  const firstDow = (new Date(calYear, calMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prevLast = new Date(calYear, calMonth, 0).getDate();
  const today = todayISO();

  let html = '';
  for (let i = firstDow - 1; i >= 0; i--) {
    html += `<div class="cal-cell other"><span class="cal-num">${prevLast - i}</span></div>`;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${calYear}-${pad(calMonth + 1)}-${pad(d)}`;
    const stats = periodStats(state.trades, state.cuentas, ds, ds);
    const hasReflex = !!findReflection('daily', ds);
    const isToday = ds === today;

    let cls = 'cal-cell psico-day';
    if (stats.count) cls += ' has-data ' + (stats.pnlSistema > 0 ? 'profit' : stats.pnlSistema < 0 ? 'loss' : 'be');
    if (hasReflex) cls += ' has-reflex';
    if (isToday) cls += ' cal-today';

    const tpStr = stats.tp > 0 ? `${stats.tp}T` : '';
    const slStr = stats.sl > 0 ? `${stats.sl}S` : '';
    const beStr = stats.be > 0 ? `${stats.be}BE` : '';
    const breakdown = [tpStr, slStr, beStr].filter(Boolean).join(' ');

    html += `
      <div class="${cls}" data-day="${ds}">
        <div class="psico-day-head">
          <span class="cal-num">${d}</span>
          ${hasReflex ? '<span class="psico-reflex-dot" title="Reflexión guardada">📝</span>' : ''}
        </div>
        ${stats.count ? `
          <div class="psico-day-body">
            <div class="psico-day-pnl">${fmtPct(stats.pnlSistema, 1)}</div>
            <div class="psico-day-meta">${stats.count} trade${stats.count > 1 ? 's' : ''}${breakdown ? ' · ' + breakdown : ''}</div>
          </div>
        ` : '<div class="psico-day-body empty">–</div>'}
      </div>
    `;
  }
  const rem = (7 - (firstDow + daysInMonth) % 7) % 7;
  for (let i = 1; i <= rem; i++) html += `<div class="cal-cell other"><span class="cal-num">${i}</span></div>`;

  grid.innerHTML = html;

  grid.querySelectorAll('[data-day]').forEach(el => {
    el.addEventListener('click', () => openDailyModal(el.dataset.day));
  });
}

function openDailyModal(ds) {
  openReflectionModal('daily', ds);
}

// Punto de entrada: abre el modal en modo LECTURA si ya hay una reflexión
// guardada, o directamente en EDICIÓN si está vacía (no tiene sentido abrir
// el modo lectura sobre un texto inexistente). Exportado para que otras
// vistas (ej. calendario operativo) puedan reusarlo.
export function openReflectionModal(type, period) {
  const existing = findReflection(type, period);
  const content = existing && existing.content ? existing.content : '';
  const initialMode = content.trim() ? 'read' : 'edit';
  renderReflectionModal(type, period, content, initialMode);
}

// Resuelve título, label, placeholder según el tipo de reflexión.
function reflectionMeta(type, period) {
  if (type === 'daily') {
    return {
      dateFrom: period,
      dateTo: period,
      title: formatLongDate(period),
      label: `Reflexión diaria · ${period}`,
      placeholder: '¿Cómo te has sentido hoy? ¿Has seguido el plan? ¿Qué has aprendido?',
      statsTitle: 'Resultados del día',
    };
  } else if (type === 'weekly') {
    const dateFrom = period;
    const dateTo = sundayOf(period);
    const weekNum = isoWeekNumber(period);
    return {
      dateFrom, dateTo,
      title: `Semana ${weekNum} · ${fmtWeekRange(period)}`,
      label: `Reflexión semanal · ${dateFrom} a ${dateTo}`,
      placeholder: '¿Cómo te ha ido la semana? ¿Qué patrones has visto? ¿Qué cambiarás?',
      statsTitle: 'Resultados de la semana',
    };
  } else {
    const dateFrom = firstDayOfMonth(period);
    const dateTo = lastDayOfMonth(period);
    const [y, m] = period.split('-').map(Number);
    return {
      dateFrom, dateTo,
      title: `${MONTHS_ES[m - 1]} ${y}`,
      label: `Reflexión mensual · ${period}`,
      placeholder: '¿Cómo ha sido el mes? ¿Has cumplido tus objetivos? ¿Qué llevas al siguiente?',
      statsTitle: 'Resultados del mes',
    };
  }
}

// Renderiza el modal en modo 'read' (texto formateado, solo lectura) o
// 'edit' (textarea grande editable). Se llama recursivamente al cambiar
// entre modos (openModal hace closeModal interno, así que reemplaza in-place).
function renderReflectionModal(type, period, content, mode) {
  const meta = reflectionMeta(type, period);
  const stats = periodStats(state.trades, state.cuentas, meta.dateFrom, meta.dateTo);
  const existingNow = findReflection(type, period);
  const hasExisting = !!existingNow;

  const body = `
    <div class="psico-modal-grid">
      <div class="psico-stats-panel">
        <div class="psico-stats-title">${meta.statsTitle}</div>
        ${renderStatsBlock(stats)}
      </div>
      <div class="psico-textarea-wrap">
        <label class="form-label" style="margin-bottom:6px;">Tu reflexión</label>
        ${mode === 'read'
          ? `<div class="psico-read-view">${escapeHtml(content)}</div>`
          : `<textarea id="psicoReflexionText" class="form-textarea psico-textarea-big" placeholder="${escapeAttr(meta.placeholder)}">${escapeHtml(content)}</textarea>`
        }
      </div>
    </div>
  `;

  // Actions: dependen del modo
  const actions = [{ label: 'Cerrar', onClick: close => close() }];
  if (hasExisting && mode === 'read') {
    actions.push({
      label: 'Borrar',
      variant: 'danger',
      onClick: close => {
        state.deleteReflection(`${type}-${period}`);
        close();
      },
    });
    actions.push({
      label: '✏️ Editar',
      variant: 'primary',
      onClick: () => renderReflectionModal(type, period, content, 'edit'),
    });
  } else {
    // Modo edición
    if (hasExisting) {
      actions.push({
        label: 'Borrar',
        variant: 'danger',
        onClick: close => {
          state.deleteReflection(`${type}-${period}`);
          close();
        },
      });
    }
    actions.push({
      label: 'Guardar',
      variant: 'primary',
      onClick: close => {
        const ta = document.getElementById('psicoReflexionText');
        const newContent = ta ? ta.value : '';
        if (newContent.trim() === '') {
          if (hasExisting) state.deleteReflection(`${type}-${period}`);
          close();
        } else {
          state.saveReflection(type, period, newContent);
          // Volvemos al modo lectura con el contenido recién guardado
          renderReflectionModal(type, period, newContent, 'read');
        }
      },
    });
  }

  openModal({ title: meta.title, meta: meta.label, size: 'lg', body, actions });

  // Si entramos en edit, montamos el autoresize y damos foco al textarea
  if (mode === 'edit') {
    setTimeout(() => {
      const ta = document.getElementById('psicoReflexionText');
      if (!ta) return;
      autoResizeTextarea(ta);
      ta.addEventListener('input', () => autoResizeTextarea(ta));
      ta.focus();
      // Cursor al final
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
    }, 50);
  }
}

// Ajusta la altura del textarea para que muestre TODO el contenido sin scrollbar
// interno. El scroll, si hace falta, se delega al modal contenedor.
function autoResizeTextarea(ta) {
  ta.style.height = 'auto';
  // +2px para evitar que aparezca un mini-scroll por rounding
  ta.style.height = (ta.scrollHeight + 2) + 'px';
}

// ─── SEMANAL ─────────────────────────────────────────────────

function renderWeekly(body) {
  const years = availableYears();
  const weeks = weeksOfYear(listYear);

  body.innerHTML = `
    <div class="psico-nav">
      <select id="psicoYear" class="select">
        ${years.map(y => `<option value="${y}" ${y === listYear ? 'selected' : ''}>${y}</option>`).join('')}
      </select>
      <label class="psico-empty-toggle">
        <input type="checkbox" id="showEmpty" ${showEmptyWeeks ? 'checked' : ''}>
        Mostrar semanas sin actividad
      </label>
    </div>

    <div class="psico-list">
      ${weeks.map(monday => renderWeekRow(monday)).filter(Boolean).join('') || '<div class="empty">No hay semanas para mostrar.</div>'}
    </div>
  `;

  body.querySelector('#psicoYear').addEventListener('change', e => {
    listYear = +e.target.value;
    render(body.parentElement);
  });
  body.querySelector('#showEmpty').addEventListener('change', e => {
    showEmptyWeeks = e.target.checked;
    render(body.parentElement);
  });

  wireRows(body, 'weekly');
}

function renderWeekRow(monday) {
  const sunday = sundayOf(monday);
  const stats = periodStats(state.trades, state.cuentas, monday, sunday);
  const existing = findReflection('weekly', monday);
  const isEmpty = stats.count === 0 && !existing;

  if (isEmpty && !showEmptyWeeks) return '';

  const weekNum = isoWeekNumber(monday);
  return `
    <div class="psico-row clickable" data-type="weekly" data-period="${monday}">
      <div class="psico-row-head">
        <div>
          <span class="psico-row-title">Sem. ${weekNum}</span>
          <span class="psico-row-sub">${fmtWeekRange(monday)}</span>
          ${existing ? '<span class="psico-reflex-dot" title="Reflexión guardada">📝</span>' : ''}
        </div>
        <div class="psico-stats-inline">${renderStatsInline(stats)}</div>
      </div>
      ${renderRowPreview(existing, 'la semana')}
    </div>
  `;
}

// ─── MENSUAL ─────────────────────────────────────────────────

function renderMonthly(body) {
  const years = availableYears();
  body.innerHTML = `
    <div class="psico-nav">
      <select id="psicoYear" class="select">
        ${years.map(y => `<option value="${y}" ${y === listYear ? 'selected' : ''}>${y}</option>`).join('')}
      </select>
    </div>

    <div class="psico-list">
      ${Array.from({ length: 12 }, (_, i) => renderMonthRow(listYear, i)).reverse().join('')}
    </div>
  `;

  body.querySelector('#psicoYear').addEventListener('change', e => {
    listYear = +e.target.value;
    render(body.parentElement);
  });

  wireRows(body, 'monthly');
}

function renderMonthRow(year, monthIdx) {
  const ym = `${year}-${pad(monthIdx + 1)}`;
  const stats = periodStats(state.trades, state.cuentas, firstDayOfMonth(ym), lastDayOfMonth(ym));
  const existing = findReflection('monthly', ym);
  return `
    <div class="psico-row clickable" data-type="monthly" data-period="${ym}">
      <div class="psico-row-head">
        <div>
          <span class="psico-row-title">${MONTHS_ES[monthIdx]} ${year}</span>
          ${existing ? '<span class="psico-reflex-dot" title="Reflexión guardada">📝</span>' : ''}
        </div>
        <div class="psico-stats-inline">${renderStatsInline(stats)}</div>
      </div>
      ${renderRowPreview(existing, 'el mes')}
    </div>
  `;
}

// Render del preview en la fila (semanal/mensual). Si hay reflexión, muestra
// las primeras líneas truncadas; si no, un placeholder "haz click para escribir".
function renderRowPreview(reflection, periodLabel) {
  if (!reflection || !reflection.content || !reflection.content.trim()) {
    return `<div class="psico-row-preview empty">Sin reflexión — haz click para escribir sobre ${periodLabel}</div>`;
  }
  return `<div class="psico-row-preview">${escapeHtml(reflection.content)}</div>`;
}

// ─── Wiring de filas: ahora click → abre el modal grande ──────

function wireRows(body, type) {
  body.querySelectorAll('.psico-row').forEach(row => {
    row.addEventListener('click', () => {
      const period = row.dataset.period;
      openReflectionModal(type, period);
    });
  });
}

// ─── Render helpers ──────────────────────────────────────────

function renderStatsBlock(s) {
  if (s.count === 0) {
    return '<div class="psico-stats-empty">Sin trades en este período.</div>';
  }
  const pnlSysColor = s.pnlSistema >= 0 ? 'var(--green)' : 'var(--red)';
  const pnlRealColor = s.pnlReal >= 0 ? 'var(--green)' : 'var(--red)';
  const wrColor = s.wr >= 40 ? 'var(--green)' : 'var(--red)';

  // Plan seguido: contar dentro/fuera/sin marcar
  const trades = s.trades || [];
  const inPlan = trades.filter(t => t.plan_followed === true).length;
  const outOfPlan = trades.filter(t => t.plan_followed === false).length;
  const noMarked = trades.length - inPlan - outOfPlan;
  const planParts = [];
  if (inPlan > 0) planParts.push(`<span style="color:var(--green);">✓ ${inPlan}</span>`);
  if (outOfPlan > 0) planParts.push(`<span style="color:var(--red);">✗ ${outOfPlan}</span>`);
  if (noMarked > 0) planParts.push(`<span style="color:var(--muted);">— ${noMarked}</span>`);
  const planHtml = planParts.join(' · ') || '<span style="color:var(--muted);">sin marcar</span>';

  // Sensaciones: contar y mostrar pills con frecuencia
  const sensCount = {};
  for (const t of trades) {
    if (t.sensacion) sensCount[t.sensacion] = (sensCount[t.sensacion] || 0) + 1;
  }
  const sensEntries = Object.entries(sensCount).sort((a, b) => b[1] - a[1]);
  const sensHtml = sensEntries.length
    ? sensEntries.map(([sen, n]) =>
        `<span class="sens-pill" data-s="${escapeAttr(sen)}" style="font-size:9px;padding:1px 6px;">${escapeHtml(sen)}${n > 1 ? ' ×' + n : ''}</span>`
      ).join(' ')
    : '<span style="color:var(--muted);">—</span>';

  return `
    <div class="psico-stat-row"><span class="psico-stat-lbl">Trades</span><span class="psico-stat-val">${s.count} <span style="color:var(--muted);font-size:10px;">(${s.tp}T·${s.sl}S·${s.be}BE)</span></span></div>
    <div class="psico-stat-row"><span class="psico-stat-lbl">Winrate</span><span class="psico-stat-val" style="color:${wrColor};">${s.wr.toFixed(0)}%</span></div>
    <div class="psico-stat-row"><span class="psico-stat-lbl">P&L sistema</span><span class="psico-stat-val" style="color:${pnlSysColor};">${fmtPct(s.pnlSistema, 1)}</span></div>
    <div class="psico-stat-row"><span class="psico-stat-lbl">P&L real</span><span class="psico-stat-val" style="color:${pnlRealColor};">${fmtPct(s.pnlReal, 1)}</span></div>
    <div class="psico-stat-row"><span class="psico-stat-lbl">Plan</span><span class="psico-stat-val">${planHtml}</span></div>
    <div class="psico-stat-row psico-stat-stack">
      <span class="psico-stat-lbl">Sensaciones</span>
      <span class="psico-stat-sens-list">${sensHtml}</span>
    </div>
  `;
}

function renderStatsInline(s) {
  if (s.count === 0) {
    return '<span class="psico-chip empty">Sin trades</span>';
  }
  const pnlSysColor = s.pnlSistema >= 0 ? 'var(--green)' : 'var(--red)';
  const pnlRealColor = s.pnlReal >= 0 ? 'var(--green)' : 'var(--red)';
  const usdColor = s.usdFondeadas > 0 ? 'var(--green)' : s.usdFondeadas < 0 ? 'var(--red)' : 'var(--muted)';
  const wrColor = s.wr >= 40 ? 'var(--green)' : 'var(--red)';

  const parts = [
    `<span class="psico-chip neutral"><strong>${s.count}</strong> trades</span>`,
  ];
  if (s.tp > 0) parts.push(`<span class="psico-chip" style="color:var(--green);"><strong>${s.tp}</strong> TP</span>`);
  if (s.sl > 0) parts.push(`<span class="psico-chip" style="color:var(--red);"><strong>${s.sl}</strong> SL</span>`);
  if (s.be > 0) parts.push(`<span class="psico-chip" style="color:var(--orange);"><strong>${s.be}</strong> BE</span>`);
  parts.push(`<span class="psico-chip" style="color:${wrColor};"><strong>${s.wr.toFixed(0)}%</strong> WR</span>`);
  parts.push(`<span class="psico-chip" style="color:${pnlSysColor};"><strong>${fmtPct(s.pnlSistema, 1)}</strong> sist</span>`);
  parts.push(`<span class="psico-chip" style="color:${pnlRealColor};"><strong>${fmtPct(s.pnlReal, 1)}</strong> real</span>`);
  if (s.usdFondeadas !== 0) {
    parts.push(`<span class="psico-chip" style="color:${usdColor};"><strong>${fmtUsd(s.usdFondeadas, true)}</strong> USD</span>`);
  }
  return parts.join('');
}

function findReflection(type, period) {
  return state.reflections.find(r => r.type === type && r.period === period);
}

function availableYears() {
  const set = new Set();
  set.add(new Date().getFullYear());
  for (const t of state.trades) {
    const y = +(t.date || '').substring(0, 4);
    if (y >= 2000) set.add(y);
  }
  for (const r of state.reflections) {
    const y = +(r.period || '').substring(0, 4);
    if (y >= 2000) set.add(y);
  }
  return [...set].sort((a, b) => b - a);
}

function formatLongDate(ds) {
  const [y, m, d] = ds.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const DOW = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return `${DOW[date.getDay()]} ${d} ${MONTHS_ES[m - 1]} ${y}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/"/g, '&quot;');
}

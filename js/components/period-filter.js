// Selector de periodo compartido — rango "Desde → Hasta" por meses.
//
// Sustituye a los cinco pares Año+Mes que estaban duplicados en dashboard,
// estrategias, backtesting, contabilidad y grupo. Aquellos filtraban con
// date.startsWith('2025') o startsWith('2025-03'), una comparación de texto por
// el principio: por eso solo dejaban elegir un año o un mes COMPLETOS y era
// imposible pedir "de enero a marzo".
//
// Aquí el estado es { from, to } con meses 'YYYY-MM' (o 'all' en cualquiera de
// los extremos, que significa "sin límite por ese lado"). Como 'YYYY-MM' ordena
// igual alfabéticamente que cronológicamente, el rango se resuelve comparando
// strings, sin construir Dates.

import { MONTHS_ES_SHORT } from '../utils/date-helpers.js';

export function newPeriod() {
  return { from: 'all', to: 'all' };
}

// Meses presentes en los datos, ordenados y sin repetir.
export function monthsOf(rows) {
  return [...new Set(rows.map(r => String(r.date || '').substring(0, 7)).filter(Boolean))].sort();
}

export function inPeriod(date, sel) {
  const ym = String(date || '').substring(0, 7);
  if (!ym) return false;
  // El rango se normaliza AQUÍ, no solo en clampPeriod: las vistas filtran antes
  // de repintar los desplegables, así que un rango invertido (Desde posterior a
  // Hasta, momentáneo mientras el usuario cambia un extremo) daba cero
  // resultados aunque los selects ya se hubieran corregido.
  let { from, to } = sel;
  if (from !== 'all' && to !== 'all' && from > to) { const t = from; from = to; to = t; }
  if (from !== 'all' && ym < from) return false;
  if (to !== 'all' && ym > to) return false;
  return true;
}

export function periodActive(sel) {
  return sel.from !== 'all' || sel.to !== 'all';
}

// Sanea el rango contra los meses que existen de verdad. Necesario porque el
// estado vive a nivel de módulo y sobrevive a un wipe, una reimportación o un
// cambio de alumno: sin esto filtraría en silencio por un mes ya inexistente.
// Si el rango viene invertido (Desde mayor que Hasta) se da la vuelta, en vez
// de enseñar cero resultados sin explicar por qué.
export function clampPeriod(sel, months) {
  if (!months.length) { sel.from = 'all'; sel.to = 'all'; return sel; }
  // Un extremo que no está en la lista NO se tira: se ajusta al mes válido más
  // cercano hacia dentro del rango (Hasta Dic-24 sin datos en diciembre → Nov-24).
  // Tirarlo perdía el filtro en silencio, y además dejaría el <select> sin la
  // opción correspondiente, mostrando algo distinto de lo que se está aplicando.
  if (sel.from !== 'all' && !months.includes(sel.from)) {
    sel.from = months.find(m => m >= sel.from) || 'all';
  }
  if (sel.to !== 'all' && !months.includes(sel.to)) {
    sel.to = [...months].reverse().find(m => m <= sel.to) || 'all';
  }
  if (sel.from !== 'all' && sel.to !== 'all' && sel.from > sel.to) {
    const t = sel.from; sel.from = sel.to; sel.to = t;
  }
  return sel;
}

export function monthLabel(ym) {
  const [y, m] = String(ym).split('-');
  return `${MONTHS_ES_SHORT[+m - 1]} ${y.substring(2)}`;
}

// Etiqueta legible del periodo, para cabeceras y textos de "sin resultados".
export function periodLabel(sel) {
  if (sel.from === 'all' && sel.to === 'all') return 'todo el histórico';
  if (sel.from !== 'all' && sel.to !== 'all') {
    return sel.from === sel.to ? monthLabel(sel.from) : `${monthLabel(sel.from)} → ${monthLabel(sel.to)}`;
  }
  return sel.from !== 'all' ? `desde ${monthLabel(sel.from)}` : `hasta ${monthLabel(sel.to)}`;
}

export function periodHtml(months, sel, { idFrom = 'pfFrom', idTo = 'pfTo' } = {}) {
  const opts = (id, value, allLabel) => `
    <select id="${id}" class="select" title="${allLabel}">
      <option value="all" ${value === 'all' ? 'selected' : ''}>${allLabel}</option>
      ${months.map(m => `<option value="${m}" ${value === m ? 'selected' : ''}>${monthLabel(m)}</option>`).join('')}
    </select>`;
  return opts(idFrom, sel.from, 'Desde el principio') + opts(idTo, sel.to, 'Hasta el final');
}

// `onChange` se llama tras mutar `sel`; la vista solo tiene que repintar.
//
// Si el usuario deja el rango del revés, se EMPUJA el otro extremo en vez de
// intercambiarlos: poner "Desde" en un mes posterior a "Hasta" mueve "Hasta"
// a ese mismo mes. Intercambiar reescribía el extremo que el usuario acababa de
// elegir, y su siguiente clic acababa produciendo un rango que nadie había
// pedido (p. ej. quedarse con todo el histórico al ir de Nov-24 a Ene-Mar-25).
export function wirePeriod(container, sel, onChange, { idFrom = 'pfFrom', idTo = 'pfTo' } = {}) {
  const from = container.querySelector('#' + idFrom);
  const to = container.querySelector('#' + idTo);
  if (from) from.addEventListener('change', () => {
    sel.from = from.value;
    if (sel.from !== 'all' && sel.to !== 'all' && sel.from > sel.to) sel.to = sel.from;
    onChange();
  });
  if (to) to.addEventListener('change', () => {
    sel.to = to.value;
    if (sel.from !== 'all' && sel.to !== 'all' && sel.to < sel.from) sel.from = sel.to;
    onChange();
  });
}

// ── Periodo anterior equivalente, para las comparativas del dashboard ──
// Devuelve un rango de la MISMA longitud justo antes del actual, o null si no
// hay un "antes" con el que medir (periodo abierto por los dos lados).
export function prevPeriod(sel, months) {
  if (!months.length) return null;
  if (sel.from === 'all' && sel.to === 'all') return null;
  const from = sel.from !== 'all' ? sel.from : months[0];
  const to = sel.to !== 'all' ? sel.to : months[months.length - 1];
  const n = monthDiff(from, to) + 1;              // longitud en meses
  const prevTo = addMonths(from, -1);
  const prevFrom = addMonths(from, -n);
  return { range: { from: prevFrom, to: prevTo }, ref: refLabel(from, to, n) };
}

function refLabel(from, to, n) {
  if (n === 1) return 'vs mes anterior';
  // Año natural completo → "vs 2024", como antes de que esto fuera un rango.
  if (n === 12 && from.endsWith('-01') && to.endsWith('-12')) {
    return 'vs ' + (Number(from.substring(0, 4)) - 1);
  }
  return `vs los ${n} meses previos`;
}

function monthDiff(a, b) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

function addMonths(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = total % 12 + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

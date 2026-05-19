// Stats agregadas para un rango de fechas. Usado por la vista Psicología
// para mostrar el resumen del día / semana / mes al lado de cada reflexión.

import { tradeCounts, winrate, pnlPct, pnlPctReal } from './calculations.js';
import { accountUsd } from './account-stats.js';

// Suma del USD del trade sumando solo cuentas FONDEADAS (criterio consistente
// con el calendario: el dinero real solo cuenta en cuentas en fase 'fondeada').
function usdFundedFor(trade, cuentaMap) {
  if (!Array.isArray(trade.accounts) || !trade.accounts.length) return 0;
  let sum = 0;
  for (const a of trade.accounts) {
    const c = cuentaMap.get(a.accountId);
    if (c && c.fase === 'fondeada') {
      sum += accountUsd(trade, a, c.capital);
    }
  }
  return sum;
}

// dateFrom / dateTo en 'YYYY-MM-DD' (inclusivos).
export function periodStats(trades, cuentas, dateFrom, dateTo) {
  const cuentaMap = new Map((cuentas || []).map(c => [c.id, c]));
  const sub = trades.filter(t => {
    const d = t.date || '';
    return d >= dateFrom && d <= dateTo;
  });
  const counts = tradeCounts(sub);
  let usd = 0;
  for (const t of sub) {
    if (t.result === 'BE') continue;
    usd += usdFundedFor(t, cuentaMap);
  }
  return {
    count: counts.total,
    tp: counts.tp,
    sl: counts.sl,
    be: counts.be,
    wr: winrate(sub),
    pnlSistema: pnlPct(sub),
    pnlReal: pnlPctReal(sub),
    usdFondeadas: usd,
    trades: sub,
  };
}

// ─── Helpers de fechas ────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

// Parse 'YYYY-MM-DD' a un Date local (sin shift por timezone).
function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Lunes de la semana ISO (semana empieza en lunes).
// Si la fecha es domingo, devuelve el lunes ANTERIOR.
export function mondayOf(dateStr) {
  const d = parseISO(dateStr);
  const dow = d.getDay(); // 0=Domingo, 1=Lunes, ..., 6=Sábado
  const diff = dow === 0 ? -6 : 1 - dow; // Lunes = -0, Martes = -1, ..., Domingo = -6
  d.setDate(d.getDate() + diff);
  return fmtISO(d);
}

// Domingo de la semana (último día), dado el lunes.
export function sundayOf(mondayStr) {
  const d = parseISO(mondayStr);
  d.setDate(d.getDate() + 6);
  return fmtISO(d);
}

// 'YYYY-MM' → primer día del mes 'YYYY-MM-01'
export function firstDayOfMonth(ym) {
  return `${ym}-01`;
}

// 'YYYY-MM' → último día del mes 'YYYY-MM-DD'
export function lastDayOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate(); // día 0 del mes siguiente = último del actual
  return `${ym}-${pad(lastDay)}`;
}

// Hoy en 'YYYY-MM-DD' (local).
export function todayISO() {
  return fmtISO(new Date());
}

// Genera todas las semanas (lunes) que contienen al menos un día del año.
// Devuelve array de strings 'YYYY-MM-DD' (lunes), de más reciente a más antiguo.
export function weeksOfYear(year) {
  const result = [];
  // Empezamos en el lunes que contiene al 1 de enero (puede ser de diciembre anterior).
  const firstMonday = mondayOf(`${year}-01-01`);
  let cur = parseISO(firstMonday);
  while (true) {
    const sunday = parseISO(fmtISO(cur));
    sunday.setDate(sunday.getDate() + 6);
    if (sunday.getFullYear() > year && cur.getFullYear() > year) break;
    if (cur.getFullYear() < year && sunday.getFullYear() < year) {
      cur.setDate(cur.getDate() + 7);
      continue;
    }
    result.push(fmtISO(cur));
    cur.setDate(cur.getDate() + 7);
    if (cur.getFullYear() > year + 1) break; // seguridad
  }
  return result.reverse(); // más reciente primero
}

// Número de semana ISO (1-53). Útil solo para mostrar al usuario.
export function isoWeekNumber(dateStr) {
  const d = parseISO(dateStr);
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target) / 604800000);
}

// Formato corto del rango 'dd-dd MMM' o 'dd MMM - dd MMM' si cruza meses.
export function fmtWeekRange(mondayStr) {
  const lun = parseISO(mondayStr);
  const dom = new Date(lun);
  dom.setDate(dom.getDate() + 6);
  const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  if (lun.getMonth() === dom.getMonth()) {
    return `${lun.getDate()}-${dom.getDate()} ${MESES[lun.getMonth()]}`;
  }
  return `${lun.getDate()} ${MESES[lun.getMonth()]} - ${dom.getDate()} ${MESES[dom.getMonth()]}`;
}

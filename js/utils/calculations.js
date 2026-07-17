import { dayOfWeekIndex, hourSlots, dateCompare, yearMonth } from './date-helpers.js';

export function sortChrono(trades) {
  return [...trades].sort((a, b) => {
    const d = dateCompare(a.date, b.date);
    if (d !== 0) return d;
    return (a.open_hour || 0) - (b.open_hour || 0);
  });
}

export function tradeCounts(trades) {
  let tp = 0, sl = 0, be = 0;
  for (const t of trades) {
    if (t.result === 'TP') tp++;
    else if (t.result === 'SL') sl++;
    else be++;
  }
  return { total: trades.length, tp, sl, be };
}

// WR = TP / (TP + SL) * 100, excludes BE
export function winrate(trades) {
  let tp = 0, decisive = 0;
  for (const t of trades) {
    if (t.result === 'TP') { tp++; decisive++; }
    else if (t.result === 'SL') decisive++;
  }
  return decisive > 0 ? (tp / decisive) * 100 : 0;
}

// Sum of pnl_pct excluding BE
export function pnlPct(trades) {
  let s = 0;
  for (const t of trades) if (t.result !== 'BE') s += t.pnl_pct || 0;
  return s;
}

// P&L real por trade = pnl_pct × risk_real_pct (default risk = 1).
// Métrica por idea/trade (independiente de en cuántas cuentas se metió).
export function tradeRealPnl(t) {
  if (!t || t.result === 'BE') return 0;
  const r = typeof t.risk_real_pct === 'number' && isFinite(t.risk_real_pct) ? t.risk_real_pct : 1;
  return (t.pnl_pct || 0) * r;
}

// Sum of real P&L excluding BE
export function pnlPctReal(trades) {
  let s = 0;
  for (const t of trades) if (t.result !== 'BE') s += tradeRealPnl(t);
  return s;
}

// PF = sum(TP pnl) / |sum(SL pnl)|
export function profitFactor(trades) {
  let wins = 0, losses = 0;
  for (const t of trades) {
    if (t.result === 'TP') wins += t.pnl_pct || 0;
    else if (t.result === 'SL') losses += Math.abs(t.pnl_pct || 0);
  }
  return losses > 0 ? wins / losses : (wins > 0 ? Infinity : 0);
}

// Returns max drawdown in pp
export function maxDrawdown(trades) {
  const sorted = sortChrono(trades.filter(t => t.result !== 'BE'));
  let equity = 0, peak = 0, maxDD = 0;
  for (const t of sorted) {
    equity += t.pnl_pct || 0;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

// Cumulative equity curve as [{x: date, y: pct}]
export function equityCurve(trades) {
  const sorted = sortChrono(trades);
  let cum = 0;
  return sorted.map(t => {
    if (t.result !== 'BE') cum += t.pnl_pct || 0;
    return { x: t.date, y: +cum.toFixed(2) };
  });
}

// Cumulative equity curve usando P&L real (pnl_pct × risk_real_pct)
export function equityCurveReal(trades) {
  const sorted = sortChrono(trades);
  let cum = 0;
  return sorted.map(t => {
    if (t.result !== 'BE') cum += tradeRealPnl(t);
    return { x: t.date, y: +cum.toFixed(2) };
  });
}

// Max consecutive streak of given result type
export function maxStreak(trades, type) {
  const sorted = sortChrono(trades);
  let max = 0, cur = 0;
  for (const t of sorted) {
    if (t.result === type) { cur++; if (cur > max) max = cur; }
    else if (t.result === 'BE') { /* doesn't break streak */ }
    else cur = 0;
  }
  return max;
}

// Best % accumulated during a TP streak
export function bestTpStreakPnl(trades) {
  const sorted = sortChrono(trades);
  let best = 0, cur = 0;
  for (const t of sorted) {
    if (t.result === 'TP') { cur += t.pnl_pct || 0; if (cur > best) best = cur; }
    else if (t.result === 'SL') cur = 0;
  }
  return best;
}

// ── Plan seguido (trading plan) ──────────────────────────────
// plan_followed: true (en plan) / false (fuera) / null (no registrado)

// Trades que tienen plan_followed marcado (no null) — base para stats de plan
function tradesWithPlan(trades) {
  return trades.filter(t => t.plan_followed === true || t.plan_followed === false);
}

// {inPlan, outOfPlan, total, pctInPlan}. Solo cuenta trades con plan_followed
// marcado (true/false). Los que tienen null se ignoran.
export function planStats(trades) {
  const sub = tradesWithPlan(trades);
  const inPlan = sub.filter(t => t.plan_followed === true).length;
  const outOfPlan = sub.length - inPlan;
  return {
    inPlan,
    outOfPlan,
    total: sub.length,
    pctInPlan: sub.length > 0 ? (inPlan / sub.length) * 100 : 0,
  };
}

// Racha activa de trades CONSECUTIVOS dentro del plan (desde el último hacia atrás).
// Trades con plan_followed null se SALTAN (no rompen, no cuentan).
export function currentInPlanStreak(trades) {
  const sorted = sortChrono(trades);
  let n = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const v = sorted[i].plan_followed;
    if (v === true) n++;
    else if (v === false) break;
  }
  return n;
}

// Racha activa de trades CONSECUTIVOS fuera del plan.
export function currentOutOfPlanStreak(trades) {
  const sorted = sortChrono(trades);
  let n = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const v = sorted[i].plan_followed;
    if (v === false) n++;
    else if (v === true) break;
  }
  return n;
}

// Comparativa de rendimiento entre trades dentro/fuera del plan.
// Trades con plan_followed null se IGNORAN (no entran en ningún grupo).
export function planComparisonStats(trades) {
  const inPlan = trades.filter(t => t.plan_followed === true);
  const outOfPlan = trades.filter(t => t.plan_followed === false);
  const statsFor = (sub) => {
    const c = tradeCounts(sub);
    return {
      total: sub.length,
      tp: c.tp, sl: c.sl, be: c.be,
      wr: winrate(sub),
      pnlSistema: pnlPct(sub),
      pnlReal: pnlPctReal(sub),
    };
  };
  return {
    inPlan: statsFor(inPlan),
    outOfPlan: statsFor(outOfPlan),
  };
}

// Current SL streak from end (chronological)
export function currentSlStreak(trades) {
  const sorted = sortChrono(trades);
  let n = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].result === 'SL') n++;
    else if (sorted[i].result === 'TP') break;
  }
  return n;
}

// Duration stats — only TP/SL, dur > 0 and < 720 (12h ceiling)
export function durationStats(trades) {
  const t = trades.filter(x => x.dur != null && x.dur > 0 && x.dur < 720 && x.result !== 'BE');
  if (!t.length) return { avg: 0, tp: 0, sl: 0, max: 0, min: 0, count: 0 };
  const avg = t.reduce((a, x) => a + x.dur, 0) / t.length;
  const tp = t.filter(x => x.result === 'TP');
  const sl = t.filter(x => x.result === 'SL');
  return {
    avg: Math.round(avg),
    tp: tp.length ? Math.round(tp.reduce((a, x) => a + x.dur, 0) / tp.length) : 0,
    sl: sl.length ? Math.round(sl.reduce((a, x) => a + x.dur, 0) / sl.length) : 0,
    max: Math.max(...t.map(x => x.dur)),
    min: Math.min(...t.map(x => x.dur)),
    count: t.length,
  };
}

// WR per hour-slot (bandas de 1h, rango ampliado a los datos)
export function wrByHour(trades) {
  return hourSlots(trades).map(s => {
    const sub = trades.filter(t => t.open_hour != null && t.open_hour >= s.from && t.open_hour < s.to);
    return {
      label: s.label,
      n: sub.length,
      wr: winrate(sub),
      pnl: pnlPct(sub),
    };
  });
}

// WR per weekday (Mon..Fri)
export function wrByDay(trades) {
  const labels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
  return labels.map((label, i) => {
    const sub = trades.filter(t => dayOfWeekIndex(t.date) === i);
    return {
      label,
      n: sub.length,
      wr: winrate(sub),
      pnl: pnlPct(sub),
    };
  });
}

// Long vs Short stats per strategy
export function longVsShort(trades) {
  const lo = trades.filter(t => t.setup === 'LONG');
  const sh = trades.filter(t => t.setup === 'SHORT');
  return {
    long: { n: lo.length, wr: winrate(lo), pnl: pnlPct(lo) },
    short: { n: sh.length, wr: winrate(sh), pnl: pnlPct(sh) },
  };
}

// Per-pair stats (or any group key)
export function statsByGroup(trades, keyFn) {
  const map = new Map();
  for (const t of trades) {
    const k = keyFn(t);
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(t);
  }
  const result = [];
  for (const [k, arr] of map) {
    const c = tradeCounts(arr);
    result.push({
      key: k,
      total: arr.length,
      tp: c.tp,
      sl: c.sl,
      be: c.be,
      wr: winrate(arr),
      pnl: pnlPct(arr),
      pnlReal: pnlPctReal(arr),
      pf: profitFactor(arr),
      trades: arr,
    });
  }
  return result;
}

// Monthly P&L grouping
export function monthlyPnl(trades) {
  const months = {};
  for (const t of trades) {
    const m = yearMonth(t.date);
    if (!m) continue;
    if (!months[m]) months[m] = { pnl: 0, pnlReal: 0, total: 0, tp: 0, sl: 0 };
    if (t.result !== 'BE') {
      months[m].pnl += t.pnl_pct || 0;
      months[m].pnlReal += tradeRealPnl(t);
    }
    if (t.result === 'TP') months[m].tp++;
    else if (t.result === 'SL') months[m].sl++;
    months[m].total++;
  }
  return Object.keys(months).sort().map(m => ({ month: m, ...months[m] }));
}

// Active days set
export function activeDays(trades) {
  return new Set(trades.map(t => t.date)).size;
}

// Average RR (only trades with rr set)
export function avgRR(trades) {
  const t = trades.filter(x => x.rr != null && !isNaN(x.rr) && x.rr > 0);
  if (!t.length) return 0;
  return t.reduce((a, x) => a + x.rr, 0) / t.length;
}

// Expectancy: % esperado por trade en el largo plazo.
// E = (WR × media_TP) − (LR × |media_SL|)
// Devuelve { value, wr, lr, avgWin, avgLoss, count }.
// Ignora BE (no son ni ganadores ni perdedores).
export function expectancy(trades) {
  const tp = trades.filter(t => t.result === 'TP');
  const sl = trades.filter(t => t.result === 'SL');
  const decisive = tp.length + sl.length;
  if (decisive === 0) {
    return { value: 0, wr: 0, lr: 0, avgWin: 0, avgLoss: 0, count: 0 };
  }
  const wr = tp.length / decisive;
  const lr = sl.length / decisive;
  const avgWin  = tp.length ? tp.reduce((a, t) => a + (t.pnl_pct || 0), 0) / tp.length : 0;
  const avgLoss = sl.length ? Math.abs(sl.reduce((a, t) => a + (t.pnl_pct || 0), 0) / sl.length) : 0;
  return {
    value: (wr * avgWin) - (lr * avgLoss),
    wr, lr, avgWin, avgLoss,
    count: decisive,
  };
}

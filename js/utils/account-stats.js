// Cálculos por cuenta. Convierten el % del sistema (asumiendo 1% de riesgo)
// a importes reales en USD según capital y riesgo asignado por cuenta.
//
//   $ P&L (trade en cuenta) = pnl_pct × riskPct × capital / 100
//
// Para cuentas fondeadas, los retiros se restan al equity actual pero NO
// del profit total (que mide lo que has ganado en bruto, antes de retirar).

import { sortChrono } from './calculations.js';

// Devuelve [{ trade, riskPct, usdPnl }] solo de los trades que están
// asignados a esta cuenta (ignora trades sin asignación).
export function tradesForAccount(account, allTrades) {
  if (!account || !Array.isArray(allTrades)) return [];
  const out = [];
  for (const t of allTrades) {
    if (!Array.isArray(t.accounts)) continue;
    const a = t.accounts.find(x => x.accountId === account.id);
    if (!a) continue;
    const usdPnl = computeUsdPnl(t.pnl_pct, a.riskPct, account.capital);
    out.push({ trade: t, riskPct: a.riskPct, usdPnl });
  }
  return out;
}

export function computeUsdPnl(pnl_pct, riskPct, capital) {
  if (pnl_pct == null || isNaN(pnl_pct)) return 0;
  if (riskPct == null || isNaN(riskPct)) return 0;
  if (capital == null || isNaN(capital)) return 0;
  return pnl_pct * riskPct * capital / 100;
}

export function totalWithdrawn(account) {
  if (!account || !Array.isArray(account.withdrawals)) return 0;
  return account.withdrawals.reduce((sum, w) => sum + (w.amount || 0), 0);
}

// Estadísticas completas de la cuenta.
export function accountStats(account, allTrades) {
  const empty = {
    capital: account?.capital || 0,
    cost: account?.cost || 0,
    profitBrutoUsd: 0,
    totalWithdrawn: 0,
    netToPocket: 0,
    equityUsd: account?.capital || 0,
    equityPct: 0,
    profitTotalUsd: 0,
    profitTotalPct: 0,
    ddUsd: 0,
    ddPct: 0,
    peakUsd: account?.capital || 0,
    count: 0, tp: 0, sl: 0, be: 0,
    wr: 0, pf: 0,
    currentSlStreak: 0,
    rachaTpStreak: 0,
  };
  if (!account) return empty;

  const items = tradesForAccount(account, allTrades);
  const capital = account.capital || 0;
  const cost = account.cost || 0;
  const profitBruto = items.reduce((s, x) => s + x.usdPnl, 0);
  const withdrawn = totalWithdrawn(account);
  const equity = capital + profitBruto - withdrawn;
  const equityPct = capital > 0 ? ((equity - capital) / capital) * 100 : 0;
  const netToPocket = withdrawn - cost;

  // Cuentas TP/SL/BE
  let tp = 0, sl = 0, be = 0;
  for (const x of items) {
    if (x.trade.result === 'TP') tp++;
    else if (x.trade.result === 'SL') sl++;
    else be++;
  }
  const decisive = tp + sl;
  const wr = decisive > 0 ? (tp / decisive) * 100 : 0;

  // Profit Factor en $
  let wins = 0, losses = 0;
  for (const x of items) {
    if (x.trade.result === 'TP') wins += x.usdPnl;
    else if (x.trade.result === 'SL') losses += Math.abs(x.usdPnl);
  }
  const pf = losses > 0 ? wins / losses : (wins > 0 ? Infinity : 0);

  // DD basado en la curva de equity (con retiros)
  const events = buildEvents(account, items);
  let runningEquity = capital;
  let peak = capital;
  let maxDD = 0;
  for (const ev of events) {
    runningEquity += ev.delta;
    if (runningEquity > peak) peak = runningEquity;
    const dd = peak - runningEquity;
    if (dd > maxDD) maxDD = dd;
  }
  const ddPct = peak > 0 ? (maxDD / peak) * 100 : 0;

  // Rachas (sobre los trades ordenados)
  const sortedTrades = sortChrono(items.map(x => x.trade));
  let curSL = 0;
  for (let i = sortedTrades.length - 1; i >= 0; i--) {
    if (sortedTrades[i].result === 'SL') curSL++;
    else if (sortedTrades[i].result === 'TP') break;
  }

  return {
    capital, cost,
    profitBrutoUsd: profitBruto,
    totalWithdrawn: withdrawn,
    netToPocket,
    equityUsd: equity,
    equityPct,
    profitTotalUsd: profitBruto,
    profitTotalPct: capital > 0 ? (profitBruto / capital) * 100 : 0,
    ddUsd: maxDD,
    ddPct,
    peakUsd: peak,
    count: items.length, tp, sl, be,
    wr, pf,
    currentSlStreak: curSL,
  };
}

// Curva de equity ordenada cronológicamente. Cada punto incluye el delta
// del evento (trade o retiro). Útil para gráfico Chart.js.
export function accountEquityCurve(account, allTrades) {
  const events = buildEvents(account, tradesForAccount(account, allTrades));
  const capital = account.capital || 0;
  let equity = capital;
  const points = [{ x: 'inicio', y: capital, type: 'start' }];
  for (const ev of events) {
    equity += ev.delta;
    points.push({ x: ev.date, y: +equity.toFixed(2), type: ev.type });
  }
  return points;
}

// Eventos cronológicos: trades + retiros, todos como deltas al equity.
function buildEvents(account, items) {
  const events = [];
  for (const x of items) {
    events.push({
      date: x.trade.date,
      type: 'trade',
      delta: x.usdPnl,
      result: x.trade.result,
    });
  }
  for (const w of (account.withdrawals || [])) {
    events.push({
      date: w.date,
      type: 'withdrawal',
      delta: -w.amount,
      note: w.note,
    });
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}

// Agrupación por mes en USD para el chart de barras
export function monthlyPnlUsd(account, allTrades) {
  const items = tradesForAccount(account, allTrades);
  const months = {};
  for (const x of items) {
    const m = x.trade.date.substring(0, 7);
    if (!months[m]) months[m] = 0;
    months[m] += x.usdPnl;
  }
  return Object.keys(months).sort().map(m => ({ month: m, usd: months[m] }));
}

// Formato $ con miles + 2 decimales si necesarios. Ej: 102450.5 → "$102,450.50"
export function fmtUsd(v, withSign = false) {
  if (v == null || isNaN(v)) return '$0';
  const abs = Math.abs(v);
  const fmt = abs.toLocaleString('en-US', {
    minimumFractionDigits: abs < 100 ? 2 : 0,
    maximumFractionDigits: 2,
  });
  const sign = withSign && v >= 0 ? '+' : (v < 0 ? '-' : '');
  return `${sign}$${fmt}`;
}

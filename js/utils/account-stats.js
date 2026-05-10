// Cálculos por cuenta. Convierten el % del sistema (asumiendo 1% de riesgo)
// a importes reales en USD según capital y riesgo asignado por cuenta,
// y restan comisiones específicas de esa cuenta.
//
//   $ P&L gross (trade en cuenta) = pnl_pct × riskPct × capital / 100
//   $ P&L neto                    = $ P&L gross − commission
//
// initialBalance permite añadir una cuenta que ya estaba operando con un
// saldo distinto al capital nominal. La equity de partida es initialBalance,
// no capital.
//
//   Equity = initialBalance + Σ($ P&L neto) − Σ retiros

import { sortChrono } from './calculations.js';

// Devuelve [{ trade, riskPct, commission, usdGross, usdNet }] solo de los
// trades que están asignados a esta cuenta.
export function tradesForAccount(account, allTrades) {
  if (!account || !Array.isArray(allTrades)) return [];
  const out = [];
  for (const t of allTrades) {
    if (!Array.isArray(t.accounts)) continue;
    const a = t.accounts.find(x => x.accountId === account.id);
    if (!a) continue;
    const usdGross = computeUsdPnl(t.pnl_pct, a.riskPct, account.capital);
    const commission = a.commission || 0;
    out.push({
      trade: t,
      riskPct: a.riskPct,
      commission,
      usdGross,
      usdNet: usdGross - commission,
    });
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

// Suma de todas las comisiones cobradas en esta cuenta.
export function totalCommissions(account, allTrades) {
  return tradesForAccount(account, allTrades).reduce((s, x) => s + x.commission, 0);
}

// Estadísticas completas de la cuenta.
export function accountStats(account, allTrades) {
  const empty = {
    capital: account?.capital || 0,
    initialBalance: account?.initialBalance || account?.capital || 0,
    cost: account?.cost || 0,
    profitBrutoUsd: 0,
    totalCommissions: 0,
    totalWithdrawn: 0,
    netToPocket: 0,
    equityUsd: account?.initialBalance || account?.capital || 0,
    equityPct: 0,
    profitTotalUsd: 0,
    profitTotalPct: 0,
    ddUsd: 0,
    ddPct: 0,
    peakUsd: account?.initialBalance || account?.capital || 0,
    count: 0, tp: 0, sl: 0, be: 0,
    wr: 0, pf: 0,
    currentSlStreak: 0,
  };
  if (!account) return empty;

  const items = tradesForAccount(account, allTrades);
  const capital = account.capital || 0;
  const initial = account.initialBalance != null ? account.initialBalance : capital;
  const cost = account.cost || 0;

  // Profit bruto = suma de P&L gross (sin restar comisiones)
  const profitGross = items.reduce((s, x) => s + x.usdGross, 0);
  const commissions = items.reduce((s, x) => s + x.commission, 0);
  const profitNet = profitGross - commissions;
  const withdrawn = totalWithdrawn(account);

  // Equity = saldo inicial + profit neto - retiros
  const equity = initial + profitNet - withdrawn;
  // % de retorno se mide vs initialBalance (lo que tenía cuando empezaste)
  const equityPct = initial > 0 ? ((equity - initial) / initial) * 100 : 0;
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

  // Profit Factor en $ neto (con comisiones)
  let wins = 0, losses = 0;
  for (const x of items) {
    if (x.usdNet > 0) wins += x.usdNet;
    else if (x.usdNet < 0) losses += Math.abs(x.usdNet);
  }
  const pf = losses > 0 ? wins / losses : (wins > 0 ? Infinity : 0);

  // DD basado en la curva de equity (con retiros y comisiones)
  const events = buildEvents(account, items);
  let runningEquity = initial;
  let peak = initial;
  let maxDD = 0;
  for (const ev of events) {
    runningEquity += ev.delta;
    if (runningEquity > peak) peak = runningEquity;
    const dd = peak - runningEquity;
    if (dd > maxDD) maxDD = dd;
  }
  const ddPct = peak > 0 ? (maxDD / peak) * 100 : 0;

  // Racha SL actual
  const sortedTrades = sortChrono(items.map(x => x.trade));
  let curSL = 0;
  for (let i = sortedTrades.length - 1; i >= 0; i--) {
    if (sortedTrades[i].result === 'SL') curSL++;
    else if (sortedTrades[i].result === 'TP') break;
  }

  return {
    capital,
    initialBalance: initial,
    cost,
    profitBrutoUsd: profitGross,
    totalCommissions: commissions,
    totalWithdrawn: withdrawn,
    netToPocket,
    equityUsd: equity,
    equityPct,
    profitTotalUsd: profitNet,                          // neto de comisiones
    profitTotalPct: initial > 0 ? (profitNet / initial) * 100 : 0,
    ddUsd: maxDD,
    ddPct,
    peakUsd: peak,
    count: items.length, tp, sl, be,
    wr, pf,
    currentSlStreak: curSL,
  };
}

// Curva de equity ordenada cronológicamente. Cada punto incluye el delta
// del evento (trade, retiro). El primer punto es el saldo inicial.
export function accountEquityCurve(account, allTrades) {
  const events = buildEvents(account, tradesForAccount(account, allTrades));
  const initial = account.initialBalance != null ? account.initialBalance : (account.capital || 0);
  let equity = initial;
  const points = [{ x: 'inicio', y: initial, type: 'start' }];
  for (const ev of events) {
    equity += ev.delta;
    points.push({ x: ev.date, y: +equity.toFixed(2), type: ev.type });
  }
  return points;
}

// Eventos cronológicos: trades (con comisiones ya aplicadas) + retiros.
function buildEvents(account, items) {
  const events = [];
  for (const x of items) {
    events.push({
      date: x.trade.date,
      type: 'trade',
      delta: x.usdNet,
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

// Agrupación por mes en USD para el chart de barras (neto, con comisiones)
export function monthlyPnlUsd(account, allTrades) {
  const items = tradesForAccount(account, allTrades);
  const months = {};
  for (const x of items) {
    const m = x.trade.date.substring(0, 7);
    if (!months[m]) months[m] = 0;
    months[m] += x.usdNet;
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

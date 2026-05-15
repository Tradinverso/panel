// Cálculos por cuenta. Convierten el % del sistema (asumiendo 1% de riesgo)
// a importes reales en USD según capital y riesgo asignado por cuenta.
//
//   $ P&L (trade en cuenta) = pnl_pct × riskPct × capital / 100
//
// Equity = initialBalance + Σ trades − Σ retiros
//
// Profit total = equity − capital nominal (cubre TODO: trades + diff de
// initialBalance vs capital + ajustes manuales del broker). Esto es lo que
// el usuario ve como "lo que has ganado en total con esta cuenta".

import { sortChrono } from './calculations.js';

// Devuelve [{ trade, riskPct, usdPnl }] solo de los trades asignados a esta cuenta.
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
  const emptyMaxDd = account?.maxDdUsd || 0;
  const emptyCapital = account?.capital || 0;
  const empty = {
    capital: emptyCapital,
    initialBalance: account?.initialBalance || emptyCapital,
    cost: account?.cost || 0,
    targetUsd: account?.targetUsd || 0,
    maxDdUsd: emptyMaxDd,
    profitFromTrades: 0,
    totalWithdrawn: 0,
    netToPocket: 0,
    equityUsd: account?.initialBalance || emptyCapital,
    equityPct: 0,
    profitTotalUsd: 0,
    profitTotalPct: 0,
    targetProgressPct: 0,
    // DD límite definido por la firma — fijo, NO se calcula desde trades
    ddLimitUsd: emptyMaxDd,
    ddLimitPctOfCapital: emptyCapital > 0 ? (emptyMaxDd / emptyCapital) * 100 : 0,
    count: 0, tp: 0, sl: 0, be: 0,
    wr: 0, pf: 0,
    currentSlStreak: 0,
  };
  if (!account) return empty;

  const items = tradesForAccount(account, allTrades);
  const capital = account.capital || 0;
  const initial = account.initialBalance != null ? account.initialBalance : capital;
  const cost = account.cost || 0;
  const targetUsd = account.targetUsd || 0;
  const maxDdUsd = account.maxDdUsd || 0;

  const profitFromTrades = items.reduce((s, x) => s + x.usdPnl, 0);
  const withdrawn = totalWithdrawn(account);

  // Equity = saldo inicial + profit por trades − retiros
  const equity = initial + profitFromTrades - withdrawn;

  // Profit total = TODO lo ganado vs el capital nominal (incluye diff inicial,
  // trades, ajustes broker, etc). Es lo que el usuario quiere ver.
  const profitTotalUsd = equity - capital;
  const profitTotalPct = capital > 0 ? (profitTotalUsd / capital) * 100 : 0;
  const equityPct = profitTotalPct;

  // Progreso hacia target (si está definido)
  const targetProgressPct = targetUsd > 0 ? (profitTotalUsd / targetUsd) * 100 : 0;

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
    if (x.usdPnl > 0) wins += x.usdPnl;
    else if (x.usdPnl < 0) losses += Math.abs(x.usdPnl);
  }
  const pf = losses > 0 ? wins / losses : (wins > 0 ? Infinity : 0);

  // DD límite definido por la firma — fijo, NO se calcula desde trades.
  // El cálculo dinámico anterior daba falsos drawdowns cuando la cuenta entraba
  // con beneficio. Ahora solo mostramos lo que la firma define como límite.
  const ddLimitUsd = maxDdUsd;
  const ddLimitPctOfCapital = capital > 0 ? (maxDdUsd / capital) * 100 : 0;

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
    targetUsd,
    maxDdUsd,
    profitFromTrades,
    totalWithdrawn: withdrawn,
    netToPocket,
    equityUsd: equity,
    equityPct,
    profitTotalUsd,
    profitTotalPct,
    targetProgressPct,
    ddLimitUsd,
    ddLimitPctOfCapital,
    count: items.length, tp, sl, be,
    wr, pf,
    currentSlStreak: curSL,
  };
}

// Curva de equity ordenada cronológicamente.
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

// ──────────────────────────────────────────────────────────────
// Agregaciones a nivel cartera (portfolio): suma de múltiples cuentas.
// Usadas en la vista "Mis cuentas" para mostrar KPIs globales y gráficos
// combinados.
// ──────────────────────────────────────────────────────────────

// Devuelve los 6 totales clave de la cartera.
//
// - capitalFondeado / equityFondeado / profitFondeado:
//     solo cuentas con fase='fondeada' && status='activa' (las que están
//     "vivas" y generando dinero real).
// - totalWithdrawn / totalCost / netToPocket:
//     TODAS las cuentas del subset (incluye históricas pasadas/perdidas), porque
//     los retiros y costes históricos cuentan para el neto real.
//
// El caller puede pre-filtrar `cuentas` por tipo (CFD/Futuros) antes de llamar.
export function portfolioStats(cuentas, allTrades) {
  const fondeadasActivas = cuentas.filter(c => c.fase === 'fondeada' && c.status === 'activa');
  const challengeActivas = cuentas.filter(
    c => (c.fase === 'challenge_1' || c.fase === 'challenge_2') && c.status === 'activa'
  );
  let capitalFondeado = 0;
  let equityFondeado = 0;
  let profitFondeado = 0;
  for (const c of fondeadasActivas) {
    const s = accountStats(c, allTrades);
    capitalFondeado += s.capital;
    equityFondeado += s.equityUsd;
    profitFondeado += s.profitTotalUsd;
  }
  let capitalChallenge = 0;
  for (const c of challengeActivas) {
    capitalChallenge += c.capital || 0;
  }
  let totalWithdrawnAll = 0;
  let totalCostAll = 0;
  for (const c of cuentas) {
    totalWithdrawnAll += totalWithdrawn(c);
    totalCostAll += (c.cost || 0);
  }
  return {
    capitalFondeado,
    capitalChallenge,
    equityFondeado,
    equityPct: capitalFondeado > 0 ? ((equityFondeado - capitalFondeado) / capitalFondeado) * 100 : 0,
    profitFondeado,
    totalWithdrawn: totalWithdrawnAll,
    totalCost: totalCostAll,
    netToPocket: totalWithdrawnAll - totalCostAll,
    countActivasFondeadas: fondeadasActivas.length,
    countActivasChallenge: challengeActivas.length,
    countTotal: cuentas.length,
  };
}

// Curva combinada de equity de TODAS las cuentas fondeadas activas. Empieza
// en la suma de los initialBalance y va acumulando eventos cronológicamente.
export function portfolioEquityCurve(cuentas, allTrades) {
  const subset = cuentas.filter(c => c.fase === 'fondeada' && c.status === 'activa');
  if (!subset.length) return [];

  const startBalance = subset.reduce((sum, c) => {
    const init = c.initialBalance != null ? c.initialBalance : (c.capital || 0);
    return sum + init;
  }, 0);

  const allEvents = [];
  for (const c of subset) {
    const items = tradesForAccount(c, allTrades);
    for (const x of items) {
      allEvents.push({ date: x.trade.date, delta: x.usdPnl, type: 'trade' });
    }
    for (const w of (c.withdrawals || [])) {
      allEvents.push({ date: w.date, delta: -(w.amount || 0), type: 'withdrawal' });
    }
  }
  allEvents.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  let equity = startBalance;
  const points = [{ x: 'inicio', y: +startBalance.toFixed(2), type: 'start' }];
  for (const ev of allEvents) {
    equity += ev.delta;
    points.push({ x: ev.date, y: +equity.toFixed(2), type: ev.type });
  }
  return points;
}

// Suma de retiros por mes a lo largo de TODAS las cuentas (incl. históricas).
// Devuelve [{ month: 'YYYY-MM', usd }].
export function portfolioMonthlyWithdrawals(cuentas) {
  const months = {};
  for (const c of cuentas) {
    for (const w of (c.withdrawals || [])) {
      const m = (w.date || '').substring(0, 7);
      if (!m) continue;
      months[m] = (months[m] || 0) + (w.amount || 0);
    }
  }
  return Object.keys(months).sort().map(m => ({ month: m, usd: months[m] }));
}

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

// Cálculos por cuenta.
//
// Cada asignación de trade-a-cuenta persiste el $ P&L directamente:
//   t.accounts = [{accountId, usdPnl}]
//
// Trades antiguos (legacy) persistían un factor de escala `riskPct` y el USD
// se derivaba con: USD = pnl_pct × riskPct × capital / 100. Mantenemos ese
// fallback en `accountUsd()` para que los trades históricos sigan computando.
//
// Equity = initialBalance + Σ trades − Σ retiros
//
// Profit total = equity − capital nominal (cubre TODO: trades + diff de
// initialBalance vs capital + ajustes manuales del broker). Esto es lo que
// el usuario ve como "lo que has ganado en total con esta cuenta".

import { sortChrono } from './calculations.js';

// USD del trade en esta cuenta. Prioriza `usdPnl` (modelo nuevo); si no existe
// deriva del `riskPct` legacy.
export function accountUsd(trade, assignment, capital) {
  if (!assignment) return 0;
  if (typeof assignment.usdPnl === 'number' && isFinite(assignment.usdPnl)) {
    return assignment.usdPnl;
  }
  return computeUsdPnl(trade.pnl_pct, assignment.riskPct, capital);
}

// Devuelve [{ trade, usdPnl }] solo de los trades asignados a esta cuenta.
export function tradesForAccount(account, allTrades) {
  if (!account || !Array.isArray(allTrades)) return [];
  const out = [];
  for (const t of allTrades) {
    if (!Array.isArray(t.accounts)) continue;
    const a = t.accounts.find(x => x.accountId === account.id);
    if (!a) continue;
    const usdPnl = accountUsd(t, a, account.capital);
    out.push({ trade: t, usdPnl });
  }
  return out;
}

// Botón "avanzar de fase": si el siguiente paso ya funda la cuenta (2ª fase, o
// cuentas de 1 sola fase), el botón dice "Fondear" en vez de "Superar fase".
export function advanceInfo(cuenta) {
  if (!cuenta || cuenta.fase === 'fondeada') return null;
  const toFondeada = cuenta.fase === 'challenge_2' || (cuenta.fase === 'challenge_1' && cuenta.numFases === 1);
  return { toFondeada, label: toFondeada ? 'Fondear' : 'Superar fase' };
}

// Igual que tradesForAccount pero solo los trades de la FASE actual (desde
// equityBaseAt). Al superar fase, el equity/stats se reinician al capital.
// Sin base definida (1ª fase) devuelve todos.
export function tradesForAccountPhase(account, allTrades) {
  const all = tradesForAccount(account, allTrades);
  const base = account && account.equityBaseAt;
  return base ? all.filter(x => (x.trade && x.trade.date || '') >= base) : all;
}

// Legacy: USD = pnl_pct × riskPct × capital / 100. Solo se usa como fallback
// para trades antiguos que no tienen `usdPnl` persistido.
export function computeUsdPnl(pnl_pct, riskPct, capital) {
  if (pnl_pct == null || isNaN(pnl_pct)) return 0;
  if (riskPct == null || isNaN(riskPct)) return 0;
  if (capital == null || isNaN(capital)) return 0;
  return pnl_pct * riskPct * capital / 100;
}

// Suma BRUTA — total descontado del equity de la cuenta (sin importar comisión).
export function totalWithdrawn(account) {
  if (!account || !Array.isArray(account.withdrawals)) return 0;
  return account.withdrawals.reduce((sum, w) => sum + (w.amount || 0), 0);
}

// Suma NETA — lo que de verdad llegó al bolsillo (amount - commission por retiro).
export function totalWithdrawnNet(account) {
  if (!account || !Array.isArray(account.withdrawals)) return 0;
  return account.withdrawals.reduce(
    (sum, w) => sum + Math.max(0, (w.amount || 0) - (w.commission || 0)),
    0
  );
}

// Suma de comisiones pagadas en retiros (lo que se quedó el broker).
export function totalWithdrawalCommissions(account) {
  if (!account || !Array.isArray(account.withdrawals)) return 0;
  return account.withdrawals.reduce((sum, w) => sum + (w.commission || 0), 0);
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
    totalWithdrawnNet: 0,
    totalCommissions: 0,
    netToPocket: 0,
    equityUsd: account?.initialBalance || emptyCapital,
    equityPct: 0,
    profitTotalUsd: 0,
    profitTotalPct: 0,
    targetProgressPct: 0,
    // DD límite definido por la firma — fijo, NO se calcula desde trades
    ddLimitUsd: emptyMaxDd,
    ddLimitPctOfCapital: emptyCapital > 0 ? (emptyMaxDd / emptyCapital) * 100 : 0,
    ddConsumedUsd: 0,
    ddConsumedPct: 0,
    count: 0, tp: 0, sl: 0, be: 0,
    wr: 0, pf: 0,
    currentSlStreak: 0,
  };
  if (!account) return empty;

  // Solo cuentan los trades de la FASE actual: al superar fase se reinicia el
  // equity al capital (equityBaseAt = fecha de inicio de la fase).
  const items = tradesForAccountPhase(account, allTrades);
  const capital = account.capital || 0;
  const initial = account.initialBalance != null ? account.initialBalance : capital;
  const cost = account.cost || 0;
  const targetUsd = account.targetUsd || 0;
  const maxDdUsd = account.maxDdUsd || 0;

  const profitFromTrades = items.reduce((s, x) => s + x.usdPnl, 0);
  const withdrawn = totalWithdrawn(account);           // bruto
  const withdrawnNet = totalWithdrawnNet(account);     // neto al bolsillo
  const commissionsPaid = totalWithdrawalCommissions(account);

  // Equity = saldo inicial + profit por trades − retiros BRUTOS
  // (el bruto es lo que el broker descontó realmente del balance)
  const equity = initial + profitFromTrades - withdrawn;

  // Profit total = TODO lo ganado vs el capital nominal (incluye diff inicial,
  // trades, ajustes broker, etc). Es lo que el usuario quiere ver.
  const profitTotalUsd = equity - capital;
  const profitTotalPct = capital > 0 ? (profitTotalUsd / capital) * 100 : 0;
  const equityPct = profitTotalPct;

  // Progreso hacia target (si está definido)
  const targetProgressPct = targetUsd > 0 ? (profitTotalUsd / targetUsd) * 100 : 0;

  // Neto a bolsillo = retirado NETO − coste de la cuenta (fees/challenges)
  const netToPocket = withdrawnNet - cost;

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

  // DD límite definido por la firma — fijo. NO calculamos peak/maxDD desde la curva
  // (eso daba falsos drawdowns cuando la cuenta entraba con beneficio). En su lugar
  // calculamos cuánto te has acercado al "suelo": capital_nominal − maxDdUsd.
  // Si equity ≥ capital_nominal → DD consumido = 0% (estás por encima del piso).
  // Si equity < capital_nominal → consumido = capital_nominal − equity (en USD).
  // Para CFD esto es exacto (DD fijo desde nominal). Para futuros es una estimación
  // optimista (el trailing real podría haber consumido más si peakeaste arriba).
  const ddLimitUsd = maxDdUsd;
  const ddLimitPctOfCapital = capital > 0 ? (maxDdUsd / capital) * 100 : 0;
  const ddConsumedUsd = Math.max(0, capital - equity);
  const ddConsumedPct = maxDdUsd > 0 ? (ddConsumedUsd / maxDdUsd) * 100 : 0;

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
    totalWithdrawn: withdrawn,           // bruto (descontado del equity)
    totalWithdrawnNet: withdrawnNet,     // neto al bolsillo
    totalCommissions: commissionsPaid,   // suma de comisiones broker
    netToPocket,
    equityUsd: equity,
    equityPct,
    profitTotalUsd,
    profitTotalPct,
    targetProgressPct,
    ddLimitUsd,
    ddLimitPctOfCapital,
    ddConsumedUsd,
    ddConsumedPct,
    count: items.length, tp, sl, be,
    wr, pf,
    currentSlStreak: curSL,
  };
}

// Curva de equity ordenada cronológicamente.
export function accountEquityCurve(account, allTrades) {
  const events = buildEvents(account, tradesForAccountPhase(account, allTrades));
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
  let totalWithdrawnNetAll = 0;    // NETO al bolsillo — lo que se muestra en KPIs
  let totalCommissionsAll = 0;
  let totalCostAll = 0;
  for (const c of cuentas) {
    totalWithdrawnNetAll += totalWithdrawnNet(c);
    totalCommissionsAll += totalWithdrawalCommissions(c);
    totalCostAll += (c.cost || 0);
  }
  return {
    capitalFondeado,
    capitalChallenge,
    equityFondeado,
    equityPct: capitalFondeado > 0 ? ((equityFondeado - capitalFondeado) / capitalFondeado) * 100 : 0,
    profitFondeado,
    totalWithdrawn: totalWithdrawnNetAll,    // el campo público es NETO (lo que llega al bolsillo)
    totalCommissions: totalCommissionsAll,   // suma de comisiones pagadas en retiros
    totalCost: totalCostAll,
    netToPocket: totalWithdrawnNetAll - totalCostAll,
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

// ──────────────────────────────────────────────────────────────
// Inversión (negocio prop): coste de compra/reintentos vs payouts.
// ──────────────────────────────────────────────────────────────

// Total invertido en una cuenta: suma de compras; si no hay compras,
// fallback al coste legacy (campo `cost`).
export function totalInvested(account) {
  if (!account) return 0;
  if (Array.isArray(account.purchases) && account.purchases.length) {
    return account.purchases.reduce((s, p) => s + (p.amount || 0), 0);
  }
  return account.cost || 0;
}

// Compras de una cuenta (con fallback del coste legacy fechado en createdAt).
function purchasesOf(c) {
  if (Array.isArray(c.purchases) && c.purchases.length) return c.purchases;
  if (c.cost > 0) {
    return [{ id: 'legacy-' + c.id, date: new Date(c.createdAt || Date.now()).toISOString().substring(0, 10), amount: c.cost, concept: 'challenge', note: 'Coste inicial' }];
  }
  return [];
}

// Lista plana de TODOS los retiros con referencia a su cuenta (orden fecha desc).
export function allWithdrawals(cuentas) {
  const out = [];
  for (const c of cuentas) {
    for (const w of (c.withdrawals || [])) {
      out.push({ ...w, cuentaId: c.id, cuentaNombre: `${c.empresa} ${c.numero || ''}`.trim() });
    }
  }
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// Lista plana de TODAS las compras con referencia a su cuenta (orden fecha desc).
export function allPurchases(cuentas) {
  const out = [];
  for (const c of cuentas) {
    for (const p of purchasesOf(c)) {
      out.push({ ...p, cuentaId: c.id, cuentaNombre: `${c.empresa} ${c.numero || ''}`.trim() });
    }
  }
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// Lista plana de TODOS los eventos contables (compra / retiro / fondeada /
// quemada) con su fecha, para el calendario de Contabilidad.
export function accountingEvents(cuentas) {
  const out = [];
  for (const c of cuentas) {
    const nombre = `${c.empresa} ${c.numero || ''}`.trim();
    for (const p of purchasesOf(c)) out.push({ date: p.date, type: 'compra', cuentaId: c.id, cuentaNombre: nombre, amount: p.amount || 0 });
    for (const w of (c.withdrawals || [])) out.push({ date: w.date, type: 'retiro', cuentaId: c.id, cuentaNombre: nombre, amount: w.amount || 0 });
    if (c.fundedAt) out.push({ date: c.fundedAt, type: 'fondeada', cuentaId: c.id, cuentaNombre: nombre, amount: 0 });
    if (c.burnedAt) out.push({ date: c.burnedAt, type: 'quemada', cuentaId: c.id, cuentaNombre: nombre, amount: 0 });
  }
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// Agregados del negocio prop sobre TODAS las cuentas.
// range opcional {from,to} (YYYY-MM-DD) filtra gastos/ganancias por fecha;
// los contadores (live/pasadas/quemadas/funding) son SIEMPRE globales.
export function investmentStats(cuentas, range) {
  const f = range && range.from, t = range && range.to;
  const inR = d => (!f || d >= f) && (!t || d <= t);
  let gastosTotales = 0, gananciasBrutas = 0, gananciasNetas = 0, comisiones = 0;
  let evaluaciones = 0, live = 0, pasadas = 0, quemadas = 0, fondeadas = 0;
  for (const c of cuentas) {
    for (const p of purchasesOf(c)) if (inR(p.date || '')) gastosTotales += p.amount || 0;
    for (const w of (c.withdrawals || [])) {
      if (!inR(w.date || '')) continue;
      const amt = w.amount || 0, com = w.commission || 0;
      gananciasBrutas += amt; comisiones += com; gananciasNetas += Math.max(0, amt - com);
    }
    // contadores globales
    evaluaciones += (Array.isArray(c.purchases) && c.purchases.length) ? c.purchases.length : 1;
    if (c.fase === 'fondeada') fondeadas++;
    if (c.fase === 'fondeada' && c.status === 'activa') live++;
    if (c.status === 'pasada') pasadas++;
    if (c.status === 'perdida') quemadas++;
  }
  const beneficioNeto = gananciasNetas - gastosTotales;
  const roi = gastosTotales > 0 ? (beneficioNeto / gastosTotales) * 100 : (beneficioNeto > 0 ? Infinity : 0);
  const fundingRatio = evaluaciones > 0 ? (fondeadas / evaluaciones) * 100 : 0;
  return {
    gastosTotales, gananciasBrutas, gananciasNetas, comisiones,
    beneficioNeto, roi, fundingRatio,
    evaluaciones, live, pasadas, quemadas, fondeadas,
    countTotal: cuentas.length,
  };
}

// Agregado por EMPRESA (prop firm) para el "Ranking de props".
// range opcional {from,to} filtra importes (invertido/retirado); los contadores
// de cuentas (nCuentas/fondeadas/live/quemadas) reflejan el estado actual.
// Devuelve un array ordenado por beneficio desc.
export function empresaStats(cuentas, range) {
  const f = range && range.from, t = range && range.to;
  const inR = d => (!f || d >= f) && (!t || d <= t);
  const map = new Map();
  for (const c of cuentas) {
    const key = (c.empresa || '—').trim() || '—';
    if (!map.has(key)) map.set(key, {
      empresa: key, invertido: 0, retiradoBruto: 0, retiradoNeto: 0,
      nRetiros: 0, nCompras: 0, nCuentas: 0, fondeadas: 0, live: 0, quemadas: 0,
    });
    const e = map.get(key);
    e.nCuentas++;
    if (c.fase === 'fondeada') e.fondeadas++;
    if (c.fase === 'fondeada' && c.status === 'activa') e.live++;
    if (c.status === 'perdida') e.quemadas++;
    for (const p of purchasesOf(c)) if (inR(p.date || '')) { e.invertido += p.amount || 0; e.nCompras++; }
    for (const w of (c.withdrawals || [])) {
      if (!inR(w.date || '')) continue;
      const amt = w.amount || 0, com = w.commission || 0;
      e.retiradoBruto += amt; e.retiradoNeto += Math.max(0, amt - com); e.nRetiros++;
    }
  }
  return [...map.values()].map(e => {
    const beneficio = e.retiradoNeto - e.invertido;
    return {
      ...e,
      beneficio,
      roi: e.invertido > 0 ? (beneficio / e.invertido) * 100 : (beneficio > 0 ? Infinity : 0),
      mediaRetiro: e.nRetiros ? e.retiradoBruto / e.nRetiros : 0,
      mediaExamen: e.nCompras ? e.invertido / e.nCompras : 0,
    };
  }).sort((a, b) => b.beneficio - a.beneficio);
}

// Compras por mes a lo largo de TODAS las cuentas → [{ month:'YYYY-MM', usd }].
export function monthlyInvested(cuentas) {
  const months = {};
  for (const c of cuentas) {
    for (const p of (c.purchases || [])) {
      const m = (p.date || '').substring(0, 7);
      if (!m) continue;
      months[m] = (months[m] || 0) + (p.amount || 0);
    }
    // Cuentas con coste legacy sin compras: imputar al mes de creación.
    if ((!c.purchases || !c.purchases.length) && c.cost > 0) {
      const m = new Date(c.createdAt || Date.now()).toISOString().substring(0, 7);
      months[m] = (months[m] || 0) + c.cost;
    }
  }
  return Object.keys(months).sort().map(m => ({ month: m, usd: months[m] }));
}

export function monthlyPnlUsd(account, allTrades) {
  const items = tradesForAccountPhase(account, allTrades);
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

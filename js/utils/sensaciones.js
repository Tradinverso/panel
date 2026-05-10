import { winrate, pnlPct, profitFactor, sortChrono } from './calculations.js';

export const POSITIVAS = ['Seguro - Confiado', 'Convencido - Calma'];
export const NEUTRALES = ['Dudoso - Inseguro'];
export const NEGATIVAS = ['Fomo - Acelerado', 'Venganza - Rabia', 'Miedo - Parálisis'];
export const TODAS = [...POSITIVAS, ...NEUTRALES, ...NEGATIVAS];

const CLASSIFY = new Map();
POSITIVAS.forEach(s => CLASSIFY.set(s, 'positiva'));
NEUTRALES.forEach(s => CLASSIFY.set(s, 'neutral'));
NEGATIVAS.forEach(s => CLASSIFY.set(s, 'negativa'));

export function classify(s) {
  return CLASSIFY.get(s) || null;
}

export function withSensacion(trades) {
  return trades.filter(t => t.sensacion && CLASSIFY.has(t.sensacion));
}

export function groupByEmotion(trades) {
  const positivas = [], neutrales = [], negativas = [];
  for (const t of trades) {
    const c = classify(t.sensacion);
    if (c === 'positiva') positivas.push(t);
    else if (c === 'neutral') neutrales.push(t);
    else if (c === 'negativa') negativas.push(t);
  }
  return { positivas, neutrales, negativas };
}

// { sensacion → {total, tp, sl, be, pnl, wr, pf} }
export function sensacionStats(trades) {
  const map = new Map();
  for (const t of trades) {
    if (!CLASSIFY.has(t.sensacion)) continue;
    if (!map.has(t.sensacion)) map.set(t.sensacion, []);
    map.get(t.sensacion).push(t);
  }
  const result = new Map();
  for (const [s, arr] of map) {
    let tp = 0, sl = 0, be = 0;
    for (const t of arr) {
      if (t.result === 'TP') tp++;
      else if (t.result === 'SL') sl++;
      else be++;
    }
    result.set(s, {
      total: arr.length,
      tp, sl, be,
      pnl: pnlPct(arr),
      wr: winrate(arr),
      pf: profitFactor(arr),
      trades: arr,
    });
  }
  return result;
}

// Max consecutive SL streak by sensacion
export function maxSlStreakBySensacion(trades) {
  const sorted = sortChrono(trades);
  const result = new Map(); // sens → max streak
  let cur = { s: '', n: 0 };
  for (const t of sorted) {
    if (t.result === 'SL') {
      if (cur.s === t.sensacion) cur.n++;
      else cur = { s: t.sensacion, n: 1 };
      const prev = result.get(t.sensacion) || 0;
      if (cur.n > prev) result.set(t.sensacion, cur.n);
    } else {
      cur = { s: '', n: 0 };
    }
  }
  return result;
}

// Diagnóstico técnico + emocional.
//
// Filosofía:
//   - ALERTAS = situación que pide acción (activa, reciente, o patrón histórico negativo)
//     · DANGER (rojo): crítica → para o cambia AHORA
//     · WARNING (naranja): vigilar → no es urgente pero está mal
//   - INSIGHTS = información positiva o neutra (mejores patrones, métricas en verde)
//
// Una alerta vieja sin recurrencia reciente NO se muestra (stale, no accionable).

import {
  winrate, pnlPct, currentSlStreak, sortChrono, statsByGroup,
  wrByHour, longVsShort, avgRR,
  planStats, currentInPlanStreak, currentOutOfPlanStreak,
} from './calculations.js';
import {
  withSensacion, groupByEmotion, sensacionStats,
  classify, NEGATIVAS,
} from './sensaciones.js';
import { tzHourDiff } from './timezone.js';
import { auth } from '../auth.js';

const A = (type, icon, title, body) => ({ type, icon, title, body });
const danger  = (icon, title, body) => A('danger', icon, title, body);
const warn    = (icon, title, body) => A('warning', icon, title, body);
const success = (icon, title, body) => A('success', icon, title, body);

// ── Helpers temporales ─────────────────────────────────────
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
function pad(n) { return String(n).padStart(2, '0'); }

function daysBetween(yyyy_mm_dd1, yyyy_mm_dd2) {
  const a = new Date(yyyy_mm_dd1);
  const b = typeof yyyy_mm_dd2 === 'string' ? new Date(yyyy_mm_dd2) : yyyy_mm_dd2;
  return Math.round((b - a) / 86400000);
}

function recentTrades(trades, days) {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days + 1);
  const cutoffStr = `${cutoff.getFullYear()}-${pad(cutoff.getMonth() + 1)}-${pad(cutoff.getDate())}`;
  return trades.filter(t => t.date >= cutoffStr);
}

function todaysTrades(trades) {
  const t = todayStr();
  return trades.filter(x => x.date === t);
}

function lastOperatedDate(trades) {
  if (!trades.length) return null;
  const dates = [...new Set(trades.map(t => t.date))].sort();
  return dates[dates.length - 1];
}

// ── Punto de entrada ───────────────────────────────────────
export function buildAlerts(trades) {
  const tecAlertas = [];
  const tecInsights = [];
  const emoAlertas = [];
  const emoInsights = [];
  const planAlertas = [];
  const planInsights = [];

  if (!trades.length) return { tecAlertas, tecInsights, emoAlertas, emoInsights, planAlertas, planInsights };

  const globalWR = winrate(trades);
  const today = todayStr();
  const lastOp = lastOperatedDate(trades);
  const daysSinceLast = lastOp ? daysBetween(lastOp, today) : Infinity;
  const isActiveTrader = daysSinceLast <= 7;

  // ═══════════════════════════════════════════════════════════
  // ALERTAS TÉCNICAS
  // ═══════════════════════════════════════════════════════════

  // ── Racha SL activa (consecutivos AHORA) ──
  const slStreak = currentSlStreak(trades);
  if (slStreak >= 5) {
    tecAlertas.push(danger('🛑',
      `Racha activa de ${slStreak} SL — Protocolo Reseteo`,
      `Para 24h obligatorio. Revisa journaling y valida plan antes de volver.`));
  } else if (slStreak >= 3) {
    tecAlertas.push(danger('!',
      `Racha activa de ${slStreak} SL consecutivos`,
      `Revisa el contexto antes del siguiente trade. Puede ser señal de mercado o de mente.`));
  } else if (slStreak === 2) {
    tecAlertas.push(warn('⏳',
      `2 SL consecutivos — precaución`,
      `Un SL más activaría la alerta de racha. Evalúa bien el siguiente setup.`));
  }

  // ── Racha SL activa por estrategia (≥3) ──
  for (const sheet of ['ZONAS', 'LIQUIDEZ', 'NASDAQ']) {
    const stTrades = trades.filter(t => t.sheet === sheet);
    const cur = currentSlStreak(stTrades);
    if (cur >= 5) {
      tecAlertas.push(danger('🛑',
        `${sheet}: ${cur} SL consecutivos — Protocolo Reseteo`,
        `Pausa esta estrategia 24h, revisa los setups recientes.`));
    } else if (cur >= 3) {
      tecAlertas.push(danger('!',
        `${sheet}: ${cur} SL consecutivos`,
        `Considera pausar esta estrategia hasta entender la causa.`));
    }
  }

  // ── HOY: sobreoperar ──
  const todays = todaysTrades(trades);
  if (todays.length >= 5) {
    tecAlertas.push(danger('🛑',
      `HOY llevas ${todays.length} trades — para`,
      `Tu regla: máx 5 trades/día. Has llegado al límite.`));
  } else if (todays.length === 4) {
    tecAlertas.push(warn('⏳',
      `HOY llevas 4 trades — un más y estás al límite`,
      `Solo opera el siguiente si es un setup A+, sin compromiso.`));
  }

  // ── HOY: más de 3 SL ──
  const todaySL = todays.filter(t => t.result === 'SL').length;
  if (todaySL >= 4) {
    tecAlertas.push(danger('🛑',
      `HOY ya ${todaySL} SL — para`,
      `Más de 3 SL en el día. Cierra plataforma y revisa journaling.`));
  }

  // ── HOY: sensación negativa de alto riesgo (FOMO / Venganza / Miedo) ──
  const BAD_EMOTIONS = new Set(['Fomo - Acelerado', 'Venganza - Rabia', 'Miedo - Parálisis']);
  const todayBadEmotion = todays.filter(t => BAD_EMOTIONS.has(t.sensacion));
  if (todayBadEmotion.length) {
    const sensList = [...new Set(todayBadEmotion.map(t => t.sensacion))].join(' / ');
    tecAlertas.push(danger('🚨',
      `HOY operando con "${sensList}" — para`,
      `Detectada sensación negativa de alto riesgo. Cierra plataforma antes de seguir; no es momento de operar.`));
  }

  // ── HOY: límite de drawdown diario (P&L sistema acumulado del día) ──
  const DAILY_DD_LIMIT = -3; // % sistema acumulado en el día
  const todayPnl = todays.reduce((s, t) => s + (t.result !== 'BE' ? (t.pnl_pct || 0) : 0), 0);
  if (todayPnl <= DAILY_DD_LIMIT) {
    tecAlertas.push(danger('📉',
      `HOY ${todayPnl.toFixed(1)}% acumulado — para`,
      `Has alcanzado el límite diario de drawdown (${DAILY_DD_LIMIT}%). Cierra plataforma y revisa journaling.`));
  }

  // ═══════════════════════════════════════════════════════════
  // ALERTAS E INSIGHTS DEL TRADING PLAN (categoría separada)
  // ═══════════════════════════════════════════════════════════

  // ── HOY: trades fuera del plan ──
  const todayOut = todays.filter(t => t.plan_followed === false).length;
  if (todayOut >= 2) {
    planAlertas.push(danger('📋',
      `HOY ${todayOut} trades fuera del plan`,
      `Revisa la disciplina de ejecución. Cierra plataforma si vuelve a pasar.`));
  } else if (todayOut === 1) {
    planAlertas.push(warn('📋',
      `HOY 1 trade fuera del plan`,
      `Atento — un trade más sin plan activaría la alerta crítica.`));
  }

  // ── Últimos 7 días: más de 3 trades fuera del plan ──
  const last7 = recentTrades(trades, 7);
  const last7Out = last7.filter(t => t.plan_followed === false).length;
  if (last7Out > 3) {
    planAlertas.push(danger('📋',
      `Últimos 7 días: ${last7Out} trades fuera del plan`,
      `Patrón problemático — revisa tu disciplina antes de seguir operando.`));
  }

  // ── Racha activa fuera del plan (siempre visible si ≥1; color escala) ──
  const outStreak = currentOutOfPlanStreak(trades);
  if (outStreak >= 3) {
    planAlertas.push(danger('🚫',
      `Racha activa: ${outStreak} trades seguidos fuera del plan`,
      `Para. Vuelve al journaling y revisa qué está pasando antes del siguiente trade.`));
  } else if (outStreak === 2) {
    planAlertas.push(warn('🚫',
      `Racha activa: 2 trades seguidos fuera del plan`,
      `Un trade más y se activa la alerta crítica.`));
  } else if (outStreak === 1) {
    planAlertas.push(warn('🚫',
      `Racha activa: 1 trade fuera del plan`,
      `Recuerda: la disciplina es lo que marca la diferencia.`));
  }

  // ── Racha activa DENTRO del plan (siempre visible si ≥1; verde si ≥5) ──
  const inStreak = currentInPlanStreak(trades);
  if (inStreak >= 5) {
    planInsights.push(success('✅',
      `Racha activa: ${inStreak} trades seguidos dentro del plan`,
      `Disciplina excelente — mantén el ritmo.`));
  } else if (inStreak >= 1) {
    planInsights.push(success('🟢',
      `Racha activa: ${inStreak} trade${inStreak > 1 ? 's' : ''} dentro del plan`,
      inStreak >= 3
        ? `Vas por buen camino — apunta a los 5 seguidos.`
        : `Sigue ejecutando con disciplina.`));
  }

  // ── Insight global de % en plan (necesita ≥10 trades marcados) ──
  const ps = planStats(trades);
  if (ps.total >= 10) {
    if (ps.pctInPlan >= 80) {
      planInsights.push(success('📋',
        `${ps.pctInPlan.toFixed(0)}% de trades dentro del plan`,
        `${ps.inPlan} de ${ps.total} respetaron tu trading plan. Sigue así.`));
    } else if (ps.pctInPlan < 60) {
      planAlertas.push(warn('📋',
        `Solo ${ps.pctInPlan.toFixed(0)}% de trades dentro del plan`,
        `${ps.outOfPlan} de ${ps.total} no siguieron el plan. Patrón a corregir.`));
    }
  }

  // ── Racha de DÍAS operados negativos seguidos (activa) ──
  const dayPnl = {};
  for (const t of trades) {
    if (t.result !== 'BE') dayPnl[t.date] = (dayPnl[t.date] || 0) + (t.pnl_pct || 0);
  }
  const operatedDays = Object.keys(dayPnl).sort();
  let currentNegDayStreak = 0;
  for (let i = operatedDays.length - 1; i >= 0; i--) {
    if (dayPnl[operatedDays[i]] < 0) currentNegDayStreak++;
    else break;
  }
  if (currentNegDayStreak >= 3 && isActiveTrader) {
    tecAlertas.push(danger('🛑',
      `Racha activa: ${currentNegDayStreak} días operados seguidos en rojo`,
      `Último día: ${operatedDays[operatedDays.length - 1]}. Activa Protocolo Reseteo.`));
  } else if (currentNegDayStreak === 2 && isActiveTrader) {
    tecAlertas.push(warn('⏳',
      `2 días operados seguidos en rojo`,
      `Cuidado con la siguiente sesión.`));
  }

  // ── Sobreoperar reciente (≥5 trades algún día en últimos 14, sin contar hoy) ──
  const recent14 = recentTrades(trades, 14);
  const dayCount14 = {};
  for (const t of recent14) dayCount14[t.date] = (dayCount14[t.date] || 0) + 1;
  const overDays14 = Object.entries(dayCount14).filter(([d, n]) => n >= 5 && d !== today);
  if (overDays14.length) {
    const worst = overDays14.sort((a, b) => b[1] - a[1])[0];
    tecAlertas.push(warn('⏳',
      `Sobreoperar reciente: ${overDays14.length} día${overDays14.length > 1 ? 's' : ''} con 5+ trades (últimos 14)`,
      `Peor: ${worst[0]} con ${worst[1]} trades. Tu regla: máx 5/día.`));
  }

  // ── Sobreoperar por sesión (3+ misma estrategia mismo día) ──
  const dayStratCount14 = {};
  for (const t of recent14) {
    const k = `${t.date}|${t.sheet}`;
    dayStratCount14[k] = (dayStratCount14[k] || 0) + 1;
  }
  const overSess14 = Object.entries(dayStratCount14).filter(([, n]) => n >= 3);
  if (overSess14.length >= 2) {
    tecAlertas.push(warn('⏳',
      `Sobreoperar por sesión: ${overSess14.length} sesiones con 3+ trades (últimos 14 días)`,
      `Recomendado máx 2/sesión.`));
  }

  // ── Tendencia 4 semanas vs histórico ──
  const last28 = recentTrades(trades, 28);
  if (last28.length >= 5 && trades.length >= 30) {
    const recentWR = winrate(last28);
    const diff = recentWR - globalWR;
    if (diff <= -8) {
      tecAlertas.push(danger('📉',
        `Tendencia 4 semanas en bajada (${diff.toFixed(0)}pp)`,
        `WR reciente ${recentWR.toFixed(0)}% vs ${globalWR.toFixed(0)}% histórico. Algo está cambiando.`));
    } else if (diff >= 8) {
      tecInsights.push(success('📈',
        `Tendencia 4 semanas mejorando (+${diff.toFixed(0)}pp)`,
        `WR reciente ${recentWR.toFixed(0)}% vs ${globalWR.toFixed(0)}% histórico. Vas en buena dirección.`));
    }
  }

  // ── Peor par (DANGER, va a Alertas) ──
  const byPair = statsByGroup(trades, t => t.pair).filter(p => p.total >= 5);
  if (byPair.length) {
    const worst = [...byPair].sort((a, b) => a.wr - b.wr)[0];
    if (worst.wr < globalWR - 10) {
      const sev = worst.wr < globalWR - 20 ? danger : warn;
      tecAlertas.push(sev('🚫',
        `Peor par: ${worst.key} — ${worst.wr.toFixed(0)}% WR`,
        `${worst.total} trades, ${(worst.wr - globalWR).toFixed(0)}pp bajo tu media (${globalWR.toFixed(0)}%). Reduce o elimina.`));
    }
  }

  // ── Peor franja horaria (DANGER, va a Alertas) ──
  // Con bandas de 1h cada franja tiene menos trades que con las de 2h → bajamos
  // el mínimo para que los insights sigan saliendo.
  const hours = wrByHour(trades).filter(h => h.n >= 3);
  if (hours.length) {
    const worstH = [...hours].sort((a, b) => a.wr - b.wr)[0];
    if (worstH.wr < globalWR - 8) {
      const sev = worstH.wr < globalWR - 15 ? danger : warn;
      tecAlertas.push(sev('🕐',
        `Peor franja: ${worstH.label} — ${worstH.wr.toFixed(0)}% WR`,
        `${worstH.n} trades, ${(worstH.wr - globalWR).toFixed(0)}pp bajo tu media. Evita o reduce tamaño.`));
    }
  }

  // ── RR medio bajo objetivo (WARNING, va a Alertas) ──
  const tradesWithRR = trades.filter(t => t.rr != null && t.rr > 0);
  if (tradesWithRR.length >= 10) {
    const rr = avgRR(tradesWithRR);
    if (rr < 2.0) {
      tecAlertas.push(warn('📊',
        `RR medio ${rr.toFixed(2)} bajo objetivo 1:2`,
        `${tradesWithRR.length} trades con RR registrado. Trabaja parciales y trailing para mejorar.`));
    } else {
      tecInsights.push(success('📊',
        `RR medio ${rr.toFixed(2)} cumple objetivo 1:2`,
        `${tradesWithRR.length} trades con RR registrado. Buena gestión.`));
    }
  }

  // ── Cobertura emocional baja (WARNING, va a Alertas) ──
  const withSens = withSensacion(trades);
  const coverage = trades.length > 0 ? (withSens.length / trades.length * 100) : 0;
  if (coverage < 60) {
    tecAlertas.push(warn('🧠',
      `Cobertura emocional baja: ${coverage.toFixed(0)}%`,
      `Solo ${withSens.length}/${trades.length} trades con sensación. Sin esto el diagnóstico emocional pierde valor.`));
  } else if (coverage >= 90) {
    tecInsights.push(success('🧠',
      `Cobertura emocional alta: ${coverage.toFixed(0)}%`,
      `${withSens.length}/${trades.length} trades con sensación. Excelente disciplina.`));
  }

  // ═══════════════════════════════════════════════════════════
  // INSIGHTS TÉCNICOS — solo cosas positivas / informativas
  // ═══════════════════════════════════════════════════════════

  // Mejor par
  if (byPair.length) {
    const best = [...byPair].sort((a, b) => b.wr - a.wr)[0];
    if (best.wr > globalWR + 5) {
      tecInsights.push(success('✓',
        `Mejor par: ${best.key} — ${best.wr.toFixed(0)}% WR`,
        `${best.total} trades, +${(best.wr - globalWR).toFixed(0)}pp sobre tu media. Concentra operativa aquí.`));
    }
  }

  // Mejor franja
  if (hours.length) {
    const bestH = [...hours].sort((a, b) => b.wr - a.wr)[0];
    if (bestH.wr > globalWR + 8) {
      tecInsights.push(success('🕐',
        `Mejor franja: ${bestH.label} — ${bestH.wr.toFixed(0)}% WR`,
        `${bestH.n} trades. Concentra operativa en esta hora.`));
    }
  }

  // Londres vs NY. Las ventanas están definidas en hora de MADRID; como cada
  // usuario ve sus horas en su huso local, se trasladan a su hora.
  const d = tzHourDiff('Europe/Madrid', auth.timezone());
  const inWin = (h, from, to) => {
    const f = ((from + d) % 24 + 24) % 24, t2 = ((to + d) % 24 + 24) % 24;
    return f <= t2 ? (h >= f && h < t2) : (h >= f || h < t2); // ventana que cruza medianoche
  };
  const london = trades.filter(t => t.open_hour != null && inWin(t.open_hour, 8, 12));
  const ny = trades.filter(t => t.open_hour != null && inWin(t.open_hour, 14, 18));
  if (london.length >= 5 && ny.length >= 5) {
    const lwr = winrate(london), nwr = winrate(ny);
    if (Math.abs(lwr - nwr) >= 10) {
      const dom = lwr > nwr ? 'Londres' : 'Nueva York';
      const domWR = Math.max(lwr, nwr);
      const weakWR = Math.min(lwr, nwr);
      tecInsights.push(success('🌍',
        `${dom} es tu mejor sesión — ${domWR.toFixed(0)}% vs ${weakWR.toFixed(0)}%`,
        `Diferencia ${(domWR - weakWR).toFixed(0)}pp. Prioriza ${dom}.`));
    }
  }

  // Días positivos ratio
  if (operatedDays.length >= 5) {
    const dayVals = operatedDays.map(d => dayPnl[d]);
    const win = dayVals.filter(p => p > 0).length;
    const loss = dayVals.filter(p => p < 0).length;
    const total = dayVals.length;
    const dayWR = win / total * 100;
    const ratio = loss > 0 ? (win / loss).toFixed(2) : '∞';
    if (dayWR >= 60) {
      tecInsights.push(success('✓',
        `Días positivos: ${dayWR.toFixed(0)}% — ratio ${ratio}:1`,
        `${win} días positivos · ${loss} negativos · ${total - win - loss} BE.`));
    } else if (dayWR < 50) {
      tecAlertas.push(warn('⚖️',
        `Días positivos: solo ${dayWR.toFixed(0)}% — ratio ${ratio}:1`,
        `${win} positivos vs ${loss} negativos. Tienes que mejorar la consistencia diaria.`));
    } else {
      tecInsights.push(A('warning', '⚖️',
        `Días positivos: ${dayWR.toFixed(0)}% — ratio ${ratio}:1`,
        `${win} positivos · ${loss} negativos · ${total - win - loss} BE.`));
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ALERTAS EMOCIONALES
  // ═══════════════════════════════════════════════════════════

  if (withSens.length < 3) {
    emoAlertas.push(warn('🧠',
      `Pocos datos emocionales (${withSens.length} trades con sensación)`,
      `Registra al menos 3 trades con sensación para empezar a ver diagnóstico emocional.`));
    return { tecAlertas, tecInsights, emoAlertas, emoInsights, planAlertas, planInsights };
  }

  const sensWR = winrate(withSens);
  const sensStats = sensacionStats(withSens);
  const valid = [...sensStats].filter(([, d]) => d.total >= 3);

  // ── Racha activa de SL con misma sensación (cualquiera, prioridad si negativa) ──
  const sortedAll = sortChrono(withSens);
  let curSens = { sens: '', n: 0 };
  for (let i = sortedAll.length - 1; i >= 0; i--) {
    const t = sortedAll[i];
    if (t.result === 'SL') {
      if (curSens.n === 0) curSens = { sens: t.sensacion, n: 1 };
      else if (curSens.sens === t.sensacion) curSens.n++;
      else break;
    } else if (t.result === 'TP') {
      break;
    }
  }
  if (curSens.n >= 3 && isActiveTrader) {
    const sev = NEGATIVAS.includes(curSens.sens) ? danger : warn;
    emoAlertas.push(sev('🚨',
      `Racha activa: ${curSens.n} SL seguidos con "${curSens.sens}"`,
      `Estado emocional ${NEGATIVAS.includes(curSens.sens) ? 'negativo' : ''} provocando pérdidas consecutivas. Para y reflexiona.`));
  }

  // ── Última operación: SL desde estado negativo ──
  const lastWithSens = sortedAll[sortedAll.length - 1];
  if (lastWithSens && isActiveTrader && lastWithSens.result === 'SL' && NEGATIVAS.includes(lastWithSens.sensacion)) {
    emoAlertas.push(warn('⚠',
      `Última operación: SL desde "${lastWithSens.sensacion}"`,
      `Tu último trade lo cerraste en pérdidas operando con sensación negativa. Si la siguiente vas igual, no operes.`));
  }

  // ── Peor sensación global (DANGER si negativa, WARNING si neutra) ──
  if (valid.length > 1) {
    const worst = [...valid].sort((a, b) => a[1].wr - b[1].wr)[0];
    if (worst[1].wr < sensWR - 5) {
      const sev = NEGATIVAS.includes(worst[0]) ? danger : warn;
      emoAlertas.push(sev('⚠',
        `Peor sensación: "${worst[0]}" — ${worst[1].wr.toFixed(0)}% WR (${worst[1].total} trades)`,
        `Cae ${(sensWR - worst[1].wr).toFixed(0)}pp bajo tu media (${sensWR.toFixed(0)}%). Si te detectas así, no operes.`));
    }
  }

  // ── "Dudoso - Inseguro" propio (DANGER por la regla "si hay duda no se opera") ──
  const dudoso = sensStats.get('Dudoso - Inseguro');
  if (dudoso && dudoso.total >= 3 && dudoso.wr < sensWR - 5) {
    emoAlertas.push(danger('❓',
      `"Dudoso - Inseguro" — ${dudoso.wr.toFixed(0)}% WR (${dudoso.total} trades)`,
      `Si hay duda no se opera. Cae ${(sensWR - dudoso.wr).toFixed(0)}pp bajo tu media.`));
  }

  // ── Por estrategia: peor sensación (umbral ≥8pp) ──
  for (const sheet of ['ZONAS', 'LIQUIDEZ', 'NASDAQ']) {
    const st = withSens.filter(t => t.sheet === sheet);
    if (st.length < 3) continue;
    const stWR = winrate(st);
    const stStats = sensacionStats(st);
    const stValid = [...stStats].filter(([, d]) => d.total >= 3);
    if (stValid.length < 2) continue;
    const worst = [...stValid].sort((a, b) => a[1].wr - b[1].wr)[0];
    if (worst[1].wr < stWR - 8) {
      const sev = NEGATIVAS.includes(worst[0]) ? danger : warn;
      emoAlertas.push(sev('⚠',
        `${sheet} — peor sensación "${worst[0]}" (${worst[1].wr.toFixed(0)}% WR)`,
        `${(worst[1].wr - stWR).toFixed(0)}pp bajo media de ${sheet}. Evita esta estrategia desde este estado.`));
    }
  }

  // ── Positivos vs negativos cuando negativos ganan ──
  const { positivas, negativas } = groupByEmotion(withSens);
  if (positivas.length >= 3 && negativas.length >= 3) {
    const pwr = winrate(positivas), nwr = winrate(negativas);
    const diff = pwr - nwr;
    if (diff <= 0) {
      emoAlertas.push(warn('⚠',
        `Operas igual o peor desde positivos (${pwr.toFixed(0)}%) que negativos (${nwr.toFixed(0)}%)`,
        `Algo no encaja. Revisa si confundes etiquetas o si el problema es técnico, no emocional.`));
    }
  }

  // ═══════════════════════════════════════════════════════════
  // INSIGHTS EMOCIONALES — solo positivos
  // ═══════════════════════════════════════════════════════════

  // Mejor sensación global
  if (valid.length) {
    const best = [...valid].sort((a, b) => b[1].wr - a[1].wr)[0];
    if (best[1].wr > sensWR + 5) {
      emoInsights.push(success('✨',
        `Mejor sensación: "${best[0]}" — ${best[1].wr.toFixed(0)}% WR (${best[1].total} trades)`,
        `+${(best[1].wr - sensWR).toFixed(0)}pp sobre tu media. Cuando estés así, opera con confianza.`));
    }
  }

  // Positivos > negativos
  if (positivas.length >= 3 && negativas.length >= 3) {
    const pwr = winrate(positivas), nwr = winrate(negativas);
    const diff = pwr - nwr;
    if (diff > 0) {
      emoInsights.push(success('💚',
        `Estados positivos ${pwr.toFixed(0)}% WR vs negativos ${nwr.toFixed(0)}% WR`,
        `Ganas ${diff.toFixed(0)}pp operando desde estado positivo. ${positivas.length} positivos vs ${negativas.length} negativos.`));
    }
  }

  // Por estrategia: mejor sensación
  for (const sheet of ['ZONAS', 'LIQUIDEZ', 'NASDAQ']) {
    const st = withSens.filter(t => t.sheet === sheet);
    if (st.length < 3) continue;
    const stWR = winrate(st);
    const stStats = sensacionStats(st);
    const stValid = [...stStats].filter(([, d]) => d.total >= 3);
    if (!stValid.length) continue;
    const best = [...stValid].sort((a, b) => b[1].wr - a[1].wr)[0];
    if (best[1].wr > stWR + 8) {
      emoInsights.push(success('✓',
        `${sheet} — mejor sensación "${best[0]}" (${best[1].wr.toFixed(0)}% WR)`,
        `+${(best[1].wr - stWR).toFixed(0)}pp sobre media de ${sheet} con ${best[1].total} trades.`));
    }
  }

  return { tecAlertas, tecInsights, emoAlertas, emoInsights, planAlertas, planInsights };
}

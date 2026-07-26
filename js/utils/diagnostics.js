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
  winrate, currentSlStreak, sortChrono, statsByGroup,
  wrByHour, wrByDay, avgRR, tradeRealPnl,
  planStats, currentInPlanStreak, currentOutOfPlanStreak,
} from './calculations.js';
import {
  withSensacion, groupByEmotion, sensacionStats,
  NEGATIVAS,
} from './sensaciones.js';
import { tzHourDiff, todayLocal } from './timezone.js';
import { auth } from '../auth.js';

// ═══════════════════════════════════════════════════════════════
// UMBRALES — todas las medidas del diagnóstico en un solo sitio.
// Para ajustar cualquier regla, cambia el número aquí; el resto del
// fichero solo referencia esta tabla.
// Los mínimos de muestra evitan ruido: un WR sobre 3-4 trades es azar
// (con <30 trades, un 55% real puede aparentar entre 35% y 75%).
// ═══════════════════════════════════════════════════════════════
const UMBRALES = {
  // HOY — protección de la sesión
  maxTradesDia: 5,          // trades/día: al llegar aquí, parar (regla de la academia)
  avisoTradesDia: 4,        //   aviso previo
  slDia: 3,                 // SL en el día → parar (regla de las 3 pérdidas)
  avisoSlDia: 2,            //   aviso previo
  ddDiario: -3,             // % de P&L REAL acumulado en el día → parar
  ventanaVenganzaMin: 15,   // reentrar ≤X min tras cerrar un SL = posible venganza

  // Rachas activas (consecutivos desde el último trade)
  rachaSl: { aviso: 2, alerta: 3, protocolo: 5 },
  rachaFueraPlan: { aviso: 2, alerta: 3 },

  // Mínimos de muestra (anti-ruido)
  minPar: 10,               // trades por par para comparar su WR
  minFranja: 8,             // trades por franja horaria
  minDia: 5,                // trades por día de la semana (insight mejor día)
  minSens: 5,               // trades por sensación
  minSesion: 5,             // trades por sesión Londres/NY
  minCobertura: 10,         // trades en la ventana antes de evaluar cobertura emocional
  ventanaCobertura: 50,     // la cobertura se mide sobre los últimos N trades: los
                            // antiguos (de antes de existir el campo sensación) no
                            // deben penalizar el porcentaje para siempre

  // Diferencias vs la media (puntos porcentuales)
  difPar: { aviso: 10, alerta: 20, mejor: 5 },
  difFranja: { aviso: 8, alerta: 15, mejor: 8 },
  difSens: 5,               // sensación vs media emocional
  difSensSheet: 8,          // sensación dentro de una estrategia
  difSesion: 10,            // Londres vs NY

  // Métricas de calidad
  tendencia: { dias: 28, minReciente: 5, minTotal: 30, pp: 8 },
  rr: { min: 10, objetivo: 2.0 },
  cobertura: { baja: 60, alta: 90 },
  plan: { min: 10, bien: 80, mal: 60 },
  diasPositivos: { min: 5, bien: 60, mal: 50 },
  sesiones: { londres: [8, 12], ny: [14, 18] },   // hora Madrid (se traslada al huso del usuario)
};

const A = (type, icon, title, body) => ({ type, icon, title, body });
const danger  = (icon, title, body) => A('danger', icon, title, body);
const warn    = (icon, title, body) => A('warning', icon, title, body);
const success = (icon, title, body) => A('success', icon, title, body);

// Marca una alerta como GRAVE: es la que enciende el badge rojo de "Diagnóstico"
// en el menú y la columna Alertas de Mis Alumnos. Solo conducta aguda (rachas
// de SL, límites del día, plan incumplido). Los patrones analíticos (peor
// par/franja/sensación, tendencia) siguen siendo rojos DENTRO del Diagnóstico,
// pero no encienden avisos fuera — minimalismo: si el badge sale, es serio.
const critico = a => ({ ...a, grave: true });

// ── Helpers temporales ─────────────────────────────────────
// "Hoy" en el huso del PERFIL (los trades se convierten a él al cargar). Con el
// huso del navegador, cerca de medianoche "hoy" no cuadraría con las fechas de
// los trades ni con el checklist (que ya usa el huso del perfil).
const todayStr = () => todayLocal(auth.timezone());
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

// "HH:MM" → minutos desde medianoche (null si falta o no parsea)
function toMin(s) {
  if (!s || !/^\d{1,2}:\d{2}/.test(s)) return null;
  const [h, m] = String(s).split(':').map(Number);
  return h * 60 + m;
}

// Reentradas "en caliente" de HOY: trades abiertos ≤ventana minutos después
// de cerrar un SL del mismo día. Lo usan la alerta de venganza y el semáforo.
// La reentrada rápida por sí sola es evidencia circunstancial (puede ser un
// segundo setup legítimo) → aviso. Solo es GRAVE si el propio trade la
// confirma: sensación negativa (Venganza/FOMO/Miedo) o fuera del plan.
function casosVenganzaHoy(todays) {
  const conHoras = todays.filter(t => toMin(t.open_str) != null)
    .sort((a, b) => toMin(a.open_str) - toMin(b.open_str));
  let ultimoSlCierre = null, casos = 0, confirmados = 0, primerGap = null, primerGapConf = null;
  for (const t of conHoras) {
    const open = toMin(t.open_str);
    if (ultimoSlCierre != null) {
      const gap = open - ultimoSlCierre;
      if (gap >= 0 && gap <= UMBRALES.ventanaVenganzaMin) {
        casos++;
        if (primerGap == null) primerGap = gap;
        if (NEGATIVAS.includes(t.sensacion) || t.plan_followed === false) {
          confirmados++;
          if (primerGapConf == null) primerGapConf = gap;   // gap del caso CONFIRMADO
        }
      }
    }
    if (t.result === 'SL' && toMin(t.close_str) != null) ultimoSlCierre = toMin(t.close_str);
  }
  return { casos, confirmados, primerGap, primerGapConf };
}

// Dentro de cada lista, lo rojo arriba, luego naranja, luego verde.
// El sort es estable: a igual severidad se conserva el orden de las reglas.
const SEV_RANK = { danger: 0, warning: 1, success: 2 };
function ordenarPorSeveridad(result) {
  Object.values(result).forEach(arr => arr.sort((a, b) => (SEV_RANK[a.type] ?? 9) - (SEV_RANK[b.type] ?? 9)));
  return result;
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
  // Solo para traders activos: si el último trade es de hace semanas, una
  // racha "activa" antigua no es accionable — sería una alerta fantasma.
  const slStreak = isActiveTrader ? currentSlStreak(trades) : 0;
  if (slStreak >= UMBRALES.rachaSl.protocolo) {
    tecAlertas.push(critico(danger('🛑',
      `Racha activa de ${slStreak} SL — Protocolo Reseteo`,
      `Para 24h obligatorio. Revisa journaling y valida plan antes de volver.`)));
  } else if (slStreak >= UMBRALES.rachaSl.alerta) {
    tecAlertas.push(critico(danger('!',
      `Racha activa de ${slStreak} SL consecutivos`,
      `Revisa el contexto antes del siguiente trade. Puede ser señal de mercado o de mente.`)));
  } else if (slStreak === UMBRALES.rachaSl.aviso) {
    tecAlertas.push(warn('⏳',
      `2 SL consecutivos — precaución`,
      `Un SL más activaría la alerta de racha. Evalúa bien el siguiente setup.`));
  }

  // ── Racha SL activa por estrategia ──
  if (isActiveTrader) {
    for (const sheet of ['ZONAS', 'LIQUIDEZ', 'NASDAQ']) {
      const stTrades = trades.filter(t => t.sheet === sheet);
      const cur = currentSlStreak(stTrades);
      if (cur >= UMBRALES.rachaSl.protocolo) {
        tecAlertas.push(critico(danger('🛑',
          `${sheet}: ${cur} SL consecutivos — Protocolo Reseteo`,
          `Pausa esta estrategia 24h, revisa los setups recientes.`)));
      } else if (cur >= UMBRALES.rachaSl.alerta) {
        tecAlertas.push(critico(danger('!',
          `${sheet}: ${cur} SL consecutivos`,
          `Considera pausar esta estrategia hasta entender la causa.`)));
      }
    }
  }

  // ── HOY: sobreoperar ──
  const todays = todaysTrades(trades);
  if (todays.length >= UMBRALES.maxTradesDia) {
    tecAlertas.push(critico(danger('🛑',
      `HOY llevas ${todays.length} trades — para`,
      `Tu regla: máx ${UMBRALES.maxTradesDia} trades/día. Has llegado al límite.`)));
  } else if (todays.length === UMBRALES.avisoTradesDia) {
    tecAlertas.push(warn('⏳',
      `HOY llevas ${UMBRALES.avisoTradesDia} trades — uno más y estás al límite`,
      `Solo opera el siguiente si es un setup A+, sin compromiso.`));
  }

  // ── HOY: SL acumulados (regla de las 3 pérdidas: al 3º se para el día) ──
  const todaySL = todays.filter(t => t.result === 'SL').length;
  if (todaySL >= UMBRALES.slDia) {
    tecAlertas.push(critico(danger('🛑',
      `HOY ya ${todaySL} SL — para`,
      `${UMBRALES.slDia} SL en el día es el límite. Cierra plataforma y revisa journaling.`)));
  } else if (todaySL === UMBRALES.avisoSlDia) {
    tecAlertas.push(warn('⏳',
      `HOY llevas ${UMBRALES.avisoSlDia} SL — uno más y toca parar`,
      `El siguiente solo si es un setup A+ con la cabeza fría.`));
  }

  // ── HOY: sensación negativa de alto riesgo (FOMO / Venganza / Miedo) ──
  const badEmotions = new Set(NEGATIVAS);
  const todayBadEmotion = todays.filter(t => badEmotions.has(t.sensacion));
  if (todayBadEmotion.length) {
    const sensList = [...new Set(todayBadEmotion.map(t => t.sensacion))].join(' / ');
    tecAlertas.push(critico(danger('🚨',
      `HOY operando con "${sensList}" — para`,
      `Detectada sensación negativa de alto riesgo. Cierra plataforma antes de seguir; no es momento de operar.`)));
  }

  // ── HOY: límite de drawdown diario ──
  // Sobre P&L REAL (pnl_pct × riesgo real): si arriesgas 0.5% por trade, el
  // -3% de verdad son 6 SL, no 3. Con riesgo 1 en todo, igual que antes.
  const todayPnl = todays.reduce((s, t) => s + tradeRealPnl(t), 0);
  if (todayPnl <= UMBRALES.ddDiario) {
    tecAlertas.push(critico(danger('📉',
      `HOY ${todayPnl.toFixed(1)}% acumulado — para`,
      `Has alcanzado el límite diario de drawdown (${UMBRALES.ddDiario}%). Cierra plataforma y revisa journaling.`)));
  }

  // ── HOY: reentrada en caliente tras un SL ──
  // Grave SOLO si el trade la confirma (sensación negativa o fuera del plan);
  // la reentrada rápida a secas puede ser un segundo setup legítimo → aviso.
  const venganza = casosVenganzaHoy(todays);
  if (venganza.confirmados) {
    tecAlertas.push(critico(danger('🔥',
      venganza.confirmados > 1
        ? `HOY ${venganza.confirmados} trades de venganza — para`
        : `HOY trade de venganza — para`,
      `Reentraste a los ${venganza.primerGapConf} min de un SL y el trade va con sensación negativa o fuera del plan. Cierra plataforma.`)));
  } else if (venganza.casos) {
    tecAlertas.push(warn('🔥',
      `HOY reentrada rápida tras un SL`,
      `Reentraste a los ${venganza.primerGap} min de cerrar un SL. Si era un setup nuevo válido, bien — pero vigila la impulsividad.`));
  }

  // ═══════════════════════════════════════════════════════════
  // ALERTAS E INSIGHTS DEL TRADING PLAN (categoría separada)
  // ═══════════════════════════════════════════════════════════

  // ── HOY: trades fuera del plan ──
  const todayOut = todays.filter(t => t.plan_followed === false).length;
  if (todayOut >= 2) {
    planAlertas.push(critico(danger('📋',
      `HOY ${todayOut} trades fuera del plan`,
      `Revisa la disciplina de ejecución. Cierra plataforma si vuelve a pasar.`)));
  } else if (todayOut === 1) {
    planAlertas.push(warn('📋',
      `HOY 1 trade fuera del plan`,
      `Atento — un trade más sin plan activaría la alerta crítica.`));
  }

  // ── Últimos 7 días: más de 3 trades fuera del plan ──
  const last7 = recentTrades(trades, 7);
  const last7Out = last7.filter(t => t.plan_followed === false).length;
  if (last7Out > 3) {
    planAlertas.push(critico(danger('📋',
      `Últimos 7 días: ${last7Out} trades fuera del plan`,
      `Patrón problemático — revisa tu disciplina antes de seguir operando.`)));
  }

  // ── Racha activa fuera del plan (desde 2: un solo trade suelto es ruido) ──
  const outStreak = currentOutOfPlanStreak(trades);
  if (outStreak >= UMBRALES.rachaFueraPlan.alerta) {
    planAlertas.push(critico(danger('🚫',
      `Racha activa: ${outStreak} trades seguidos fuera del plan`,
      `Para. Vuelve al journaling y revisa qué está pasando antes del siguiente trade.`)));
  } else if (outStreak === UMBRALES.rachaFueraPlan.aviso) {
    planAlertas.push(warn('🚫',
      `Racha activa: 2 trades seguidos fuera del plan`,
      `Un trade más y se activa la alerta crítica.`));
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

  // ── Insight global de % en plan (necesita mínimo de trades marcados) ──
  const ps = planStats(trades);
  if (ps.total >= UMBRALES.plan.min) {
    if (ps.pctInPlan >= UMBRALES.plan.bien) {
      planInsights.push(success('📋',
        `${ps.pctInPlan.toFixed(0)}% de trades dentro del plan`,
        `${ps.inPlan} de ${ps.total} respetaron tu trading plan. Sigue así.`));
    } else if (ps.pctInPlan < UMBRALES.plan.mal) {
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
    tecAlertas.push(critico(danger('🛑',
      `Racha activa: ${currentNegDayStreak} días operados seguidos en rojo`,
      `Último día: ${operatedDays[operatedDays.length - 1]}. Activa Protocolo Reseteo.`)));
  } else if (currentNegDayStreak === 2 && isActiveTrader) {
    tecAlertas.push(warn('⏳',
      `2 días operados seguidos en rojo`,
      `Cuidado con la siguiente sesión.`));
  }

  // ── Sobreoperar reciente (días al límite en últimos 14, sin contar hoy) ──
  const recent14 = recentTrades(trades, 14);
  const dayCount14 = {};
  for (const t of recent14) dayCount14[t.date] = (dayCount14[t.date] || 0) + 1;
  const overDays14 = Object.entries(dayCount14).filter(([d, n]) => n >= UMBRALES.maxTradesDia && d !== today);
  if (overDays14.length) {
    const worst = overDays14.sort((a, b) => b[1] - a[1])[0];
    tecAlertas.push(warn('⏳',
      `Sobreoperar reciente: ${overDays14.length} día${overDays14.length > 1 ? 's' : ''} con ${UMBRALES.maxTradesDia}+ trades (últimos 14)`,
      `Peor: ${worst[0]} con ${worst[1]} trades. Tu regla: máx ${UMBRALES.maxTradesDia}/día.`));
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
  const last28 = recentTrades(trades, UMBRALES.tendencia.dias);
  if (last28.length >= UMBRALES.tendencia.minReciente && trades.length >= UMBRALES.tendencia.minTotal) {
    const recentWR = winrate(last28);
    const diff = recentWR - globalWR;
    if (diff <= -UMBRALES.tendencia.pp) {
      tecAlertas.push(danger('📉',
        `Tendencia 4 semanas en bajada (${diff.toFixed(0)}pp)`,
        `WR reciente ${recentWR.toFixed(0)}% vs ${globalWR.toFixed(0)}% histórico. Algo está cambiando.`));
    } else if (diff >= UMBRALES.tendencia.pp) {
      tecInsights.push(success('📈',
        `Tendencia 4 semanas mejorando (+${diff.toFixed(0)}pp)`,
        `WR reciente ${recentWR.toFixed(0)}% vs ${globalWR.toFixed(0)}% histórico. Vas en buena dirección.`));
    }
  }

  // ── Peor par (DANGER, va a Alertas) ──
  const byPair = statsByGroup(trades, t => t.pair).filter(p => p.total >= UMBRALES.minPar);
  if (byPair.length) {
    const worst = [...byPair].sort((a, b) => a.wr - b.wr)[0];
    if (worst.wr < globalWR - UMBRALES.difPar.aviso) {
      const sev = worst.wr < globalWR - UMBRALES.difPar.alerta ? danger : warn;
      tecAlertas.push(sev('🚫',
        `Peor par: ${worst.key} — ${worst.wr.toFixed(0)}% WR`,
        `${worst.total} trades, ${(worst.wr - globalWR).toFixed(0)}pp bajo tu media (${globalWR.toFixed(0)}%). Reduce o elimina.`));
    }
  }

  // ── Peor franja horaria (DANGER, va a Alertas) ──
  const hours = wrByHour(trades).filter(h => h.n >= UMBRALES.minFranja);
  if (hours.length) {
    const worstH = [...hours].sort((a, b) => a.wr - b.wr)[0];
    if (worstH.wr < globalWR - UMBRALES.difFranja.aviso) {
      const sev = worstH.wr < globalWR - UMBRALES.difFranja.alerta ? danger : warn;
      tecAlertas.push(sev('🕐',
        `Peor franja: ${worstH.label} — ${worstH.wr.toFixed(0)}% WR`,
        `${worstH.n} trades, ${(worstH.wr - globalWR).toFixed(0)}pp bajo tu media. Evita o reduce tamaño.`));
    }
  }

  // ── RR medio bajo objetivo (WARNING, va a Alertas) ──
  const tradesWithRR = trades.filter(t => t.rr != null && t.rr > 0);
  if (tradesWithRR.length >= UMBRALES.rr.min) {
    const rr = avgRR(tradesWithRR);
    if (rr < UMBRALES.rr.objetivo) {
      tecAlertas.push(warn('📊',
        `RR medio ${rr.toFixed(2)} bajo objetivo 1:${UMBRALES.rr.objetivo}`,
        `${tradesWithRR.length} trades con RR registrado. Trabaja parciales y trailing para mejorar.`));
    } else {
      tecInsights.push(success('📊',
        `RR medio ${rr.toFixed(2)} cumple objetivo 1:${UMBRALES.rr.objetivo}`,
        `${tradesWithRR.length} trades con RR registrado. Buena gestión.`));
    }
  }

  // ── Cobertura emocional — sobre los ÚLTIMOS trades, no todo el histórico:
  //    mide el hábito ACTUAL. Los trades de antes de que existiera el campo
  //    sensación no deben penalizar el porcentaje para siempre. ──
  const withSens = withSensacion(trades);
  const ventanaCob = sortChrono(trades).slice(-UMBRALES.ventanaCobertura);
  const ventanaCobSens = withSensacion(ventanaCob);
  const coverage = ventanaCob.length ? (ventanaCobSens.length / ventanaCob.length * 100) : 0;
  if (ventanaCob.length >= UMBRALES.minCobertura) {
    if (coverage < UMBRALES.cobertura.baja) {
      tecAlertas.push(warn('🧠',
        `Cobertura emocional baja: ${coverage.toFixed(0)}% (últimos ${ventanaCob.length} trades)`,
        `Solo ${ventanaCobSens.length} de tus últimos ${ventanaCob.length} trades llevan sensación. Sin esto el diagnóstico emocional pierde valor.`));
    } else if (coverage >= UMBRALES.cobertura.alta) {
      tecInsights.push(success('🧠',
        `Cobertura emocional alta: ${coverage.toFixed(0)}% (últimos ${ventanaCob.length} trades)`,
        `${ventanaCobSens.length} de tus últimos ${ventanaCob.length} trades con sensación. Excelente disciplina.`));
    }
  }

  // ═══════════════════════════════════════════════════════════
  // INSIGHTS TÉCNICOS — solo cosas positivas / informativas
  // ═══════════════════════════════════════════════════════════

  // Mejor par
  if (byPair.length) {
    const best = [...byPair].sort((a, b) => b.wr - a.wr)[0];
    if (best.wr > globalWR + UMBRALES.difPar.mejor) {
      tecInsights.push(success('✓',
        `Mejor par: ${best.key} — ${best.wr.toFixed(0)}% WR`,
        `${best.total} trades, +${(best.wr - globalWR).toFixed(0)}pp sobre tu media. Concentra operativa aquí.`));
    }
  }

  // Mejor franja
  if (hours.length) {
    const bestH = [...hours].sort((a, b) => b.wr - a.wr)[0];
    if (bestH.wr > globalWR + UMBRALES.difFranja.mejor) {
      tecInsights.push(success('🕐',
        `Mejor franja: ${bestH.label} — ${bestH.wr.toFixed(0)}% WR`,
        `${bestH.n} trades. Concentra operativa en esta hora.`));
    }
  }

  // Mejor día de la semana (espejo del de mejor franja)
  const days = wrByDay(trades).filter(dd => dd.n >= UMBRALES.minDia);
  if (days.length) {
    const bestD = [...days].sort((a, b) => b.wr - a.wr)[0];
    if (bestD.wr > globalWR + UMBRALES.difFranja.mejor) {
      tecInsights.push(success('📅',
        `Tu mejor día: ${bestD.label} — ${bestD.wr.toFixed(0)}% WR`,
        `${bestD.n} trades, +${(bestD.wr - globalWR).toFixed(0)}pp sobre tu media.`));
    }
  }

  // Londres vs NY. Las ventanas están definidas en hora de MADRID; como cada
  // usuario ve sus horas en su huso local, se trasladan a su hora.
  const d = tzHourDiff('Europe/Madrid', auth.timezone());
  const inWin = (h, from, to) => {
    const f = ((from + d) % 24 + 24) % 24, t2 = ((to + d) % 24 + 24) % 24;
    return f <= t2 ? (h >= f && h < t2) : (h >= f || h < t2); // ventana que cruza medianoche
  };
  const [lonFrom, lonTo] = UMBRALES.sesiones.londres;
  const [nyFrom, nyTo] = UMBRALES.sesiones.ny;
  const london = trades.filter(t => t.open_hour != null && inWin(t.open_hour, lonFrom, lonTo));
  const ny = trades.filter(t => t.open_hour != null && inWin(t.open_hour, nyFrom, nyTo));
  if (london.length >= UMBRALES.minSesion && ny.length >= UMBRALES.minSesion) {
    const lwr = winrate(london), nwr = winrate(ny);
    if (Math.abs(lwr - nwr) >= UMBRALES.difSesion) {
      const dom = lwr > nwr ? 'Londres' : 'Nueva York';
      const domWR = Math.max(lwr, nwr);
      const weakWR = Math.min(lwr, nwr);
      tecInsights.push(success('🌍',
        `${dom} es tu mejor sesión — ${domWR.toFixed(0)}% vs ${weakWR.toFixed(0)}%`,
        `Diferencia ${(domWR - weakWR).toFixed(0)}pp. Prioriza ${dom}.`));
    }
  }

  // Días positivos ratio
  if (operatedDays.length >= UMBRALES.diasPositivos.min) {
    const dayVals = operatedDays.map(d => dayPnl[d]);
    const win = dayVals.filter(p => p > 0).length;
    const loss = dayVals.filter(p => p < 0).length;
    const total = dayVals.length;
    const dayWR = win / total * 100;
    const ratio = loss > 0 ? (win / loss).toFixed(2) : '∞';
    if (dayWR >= UMBRALES.diasPositivos.bien) {
      tecInsights.push(success('✓',
        `Días positivos: ${dayWR.toFixed(0)}% — ratio ${ratio}:1`,
        `${win} días positivos · ${loss} negativos · ${total - win - loss} BE.`));
    } else if (dayWR < UMBRALES.diasPositivos.mal) {
      tecAlertas.push(warn('⚖️',
        `Días positivos: solo ${dayWR.toFixed(0)}% — ratio ${ratio}:1`,
        `${win} positivos vs ${loss} negativos. Tienes que mejorar la consistencia diaria.`));
    } else {
      // Zona media (50-60%): es una advertencia, así que va a Alertas — antes
      // se colaba como "insight" naranja en la columna de positivos.
      tecAlertas.push(warn('⚖️',
        `Días positivos: ${dayWR.toFixed(0)}% — ratio ${ratio}:1`,
        `${win} positivos · ${loss} negativos · ${total - win - loss} BE. Margen de mejora en consistencia.`));
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ALERTAS EMOCIONALES
  // ═══════════════════════════════════════════════════════════

  if (withSens.length < 3) {
    emoAlertas.push(warn('🧠',
      `Pocos datos emocionales (${withSens.length} trades con sensación)`,
      `Registra al menos 3 trades con sensación para empezar a ver diagnóstico emocional.`));
    return ordenarPorSeveridad({ tecAlertas, tecInsights, emoAlertas, emoInsights, planAlertas, planInsights });
  }

  const sensWR = winrate(withSens);
  const sensStats = sensacionStats(withSens);
  const valid = [...sensStats].filter(([, d]) => d.total >= UMBRALES.minSens);

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
    const esNegativa = NEGATIVAS.includes(curSens.sens);
    const alerta = (esNegativa ? danger : warn)('🚨',
      `Racha activa: ${curSens.n} SL seguidos con "${curSens.sens}"`,
      `Estado emocional ${esNegativa ? 'negativo' : ''} provocando pérdidas consecutivas. Para y reflexiona.`);
    // Racha de SL desde estado negativo = conducta aguda → grave
    emoAlertas.push(esNegativa ? critico(alerta) : alerta);
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
    if (worst[1].wr < sensWR - UMBRALES.difSens) {
      const sev = NEGATIVAS.includes(worst[0]) ? danger : warn;
      emoAlertas.push(sev('⚠',
        `Peor sensación: "${worst[0]}" — ${worst[1].wr.toFixed(0)}% WR (${worst[1].total} trades)`,
        `Cae ${(sensWR - worst[1].wr).toFixed(0)}pp bajo tu media (${sensWR.toFixed(0)}%). Si te detectas así, no operes.`));
    }
  }

  // ── "Dudoso - Inseguro" propio (DANGER por la regla "si hay duda no se opera") ──
  const dudoso = sensStats.get('Dudoso - Inseguro');
  if (dudoso && dudoso.total >= UMBRALES.minSens && dudoso.wr < sensWR - UMBRALES.difSens) {
    emoAlertas.push(danger('❓',
      `"Dudoso - Inseguro" — ${dudoso.wr.toFixed(0)}% WR (${dudoso.total} trades)`,
      `Si hay duda no se opera. Cae ${(sensWR - dudoso.wr).toFixed(0)}pp bajo tu media.`));
  }

  // ── Por estrategia: peor sensación ──
  for (const sheet of ['ZONAS', 'LIQUIDEZ', 'NASDAQ']) {
    const st = withSens.filter(t => t.sheet === sheet);
    if (st.length < 3) continue;
    const stWR = winrate(st);
    const stStats = sensacionStats(st);
    const stValid = [...stStats].filter(([, d]) => d.total >= UMBRALES.minSens);
    if (stValid.length < 2) continue;
    const worst = [...stValid].sort((a, b) => a[1].wr - b[1].wr)[0];
    if (worst[1].wr < stWR - UMBRALES.difSensSheet) {
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
    if (best[1].wr > sensWR + UMBRALES.difSens) {
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
    const stValid = [...stStats].filter(([, d]) => d.total >= UMBRALES.minSens);
    if (!stValid.length) continue;
    const best = [...stValid].sort((a, b) => b[1].wr - a[1].wr)[0];
    if (best[1].wr > stWR + UMBRALES.difSensSheet) {
      emoInsights.push(success('✓',
        `${sheet} — mejor sensación "${best[0]}" (${best[1].wr.toFixed(0)}% WR)`,
        `+${(best[1].wr - stWR).toFixed(0)}pp sobre media de ${sheet} con ${best[1].total} trades.`));
    }
  }

  return ordenarPorSeveridad({ tecAlertas, tecInsights, emoAlertas, emoInsights, planAlertas, planInsights });
}

// Nº de alertas GRAVES activas (marcadas con `critico`): rachas de SL, límites
// del día y plan incumplido. Lo usan el badge de "Diagnóstico" en el menú y la
// columna Alertas de Mis Alumnos. Los rojos analíticos (peor par/franja/
// sensación, tendencia) NO cuentan: si el badge se enciende, es serio de verdad.
export function countDangerAlerts(trades) {
  const r = buildAlerts(trades);
  return [...r.tecAlertas, ...r.emoAlertas, ...r.planAlertas].filter(a => a.grave).length;
}

// Semáforo del día: ¿puede operar HOY este trader?
//   'stop'  (rojo)    = una regla DURA de hoy: algo que has hecho hoy obliga a parar.
//   'warn'  (naranja) = hay alguna alerta importante activa en el Diagnóstico
//                       (racha de SL, plan incumplido…) o estás cerca de un límite del día.
//   'ok'    (verde)   = ninguna alerta importante ni regla del día — vía libre de verdad.
// Coherencia clave: naranja ⟺ el badge rojo del menú "Diagnóstico" está encendido.
// Usa los mismos UMBRALES/alertas que el resto — un solo criterio en toda la app.
export function todayStatus(trades) {
  const stops = [], warns = [];
  const todays = todaysTrades(trades);
  const todaySL = todays.filter(t => t.result === 'SL').length;
  const todayPnl = todays.reduce((s, t) => s + tradeRealPnl(t), 0);
  const badEmotions = new Set(NEGATIVAS);

  // ── ROJO: reglas duras de HOY (para AHORA) ──
  if (todaySL >= UMBRALES.slDia) stops.push(`${todaySL} SL hoy`);
  if (todays.length >= UMBRALES.maxTradesDia) stops.push(`${todays.length} trades hoy (máx ${UMBRALES.maxTradesDia})`);
  if (todayPnl <= UMBRALES.ddDiario) stops.push(`${todayPnl.toFixed(1)}% hoy (límite ${UMBRALES.ddDiario}%)`);
  if (todays.some(t => badEmotions.has(t.sensacion))) stops.push('sensación negativa hoy');
  const veng = casosVenganzaHoy(todays);
  if (veng.confirmados) stops.push('trade de venganza hoy');

  // ── NARANJA: avisos del día (cerca de un límite) ──
  if (todaySL === UMBRALES.avisoSlDia) warns.push(`${todaySL} SL hoy`);
  if (todays.length === UMBRALES.avisoTradesDia) warns.push(`${todays.length} trades hoy`);
  if (!veng.confirmados && veng.casos) warns.push('reentrada rápida tras un SL');

  // ── NARANJA: alertas GRAVES activas del Diagnóstico que no son parada de hoy
  //    (racha de SL, plan incumplido, racha de días en rojo…). Así el semáforo
  //    NUNCA está verde si el Diagnóstico tiene una alerta importante. ──
  if (!stops.length) {
    const n = countDangerAlerts(trades);
    if (n) warns.push(`${n} alerta${n > 1 ? 's' : ''} importante${n > 1 ? 's' : ''} en tu diagnóstico`);
  }

  if (stops.length) return { level: 'stop', reasons: stops };
  if (warns.length) return { level: 'warn', reasons: [...new Set(warns)] };
  return { level: 'ok', reasons: [] };
}

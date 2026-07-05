// Lógica de escalado de riesgo por niveles + perfiles.
// Port directo de la matemática del dashboard PHP del compañero (api.php),
// adaptada a la app: el "balance" NO se introduce a mano — se deriva del equity
// de la cuenta (initialBalance + trades − retiros) vía accountStats().
//
// Modelo:
//   - Cada cuenta tiene un riesgo_base (ej. 0.005 = 0,5%) y un multiplicador
//     (ej. 1.3). Con eso se generan 7 niveles de riesgo escalado:
//       pct(i) = riesgo_base × multiplicador^(i-1)
//   - El NIVEL ACTIVO se calcula desde el drawdown de la cuenta:
//       · cuenta en positivo  → Nivel 1 siempre
//       · cuenta en negativo  → sube de nivel cuando la pérdida acumulada
//         supera los umbrales acumulados (suma de los pct de niveles previos).
//   - Es una gestión de recuperación: cuanto más abajo, más riesgo para
//     recuperar antes.

export const NUM_NIVELES = 7;

// Perfiles built-in (presets de solo lectura, siempre disponibles).
// riesgoBase en fracción (0.005 = 0,5%), multiplicador como factor.
export const PERFILES_BUILTIN = [
  { id: 'builtin-conservador', nombre: 'Conservador',  riesgoBase: 0.0030, multiplicador: 1.200, descripcion: 'Riesgo bajo, escalada suave', builtin: true },
  { id: 'builtin-estandar',    nombre: 'Estándar',     riesgoBase: 0.0050, multiplicador: 1.300, descripcion: 'Perfil por defecto equilibrado', builtin: true },
  { id: 'builtin-agresivo',    nombre: 'Agresivo',     riesgoBase: 0.0075, multiplicador: 1.400, descripcion: 'Mayor riesgo base, escalada rápida', builtin: true },
  { id: 'builtin-lucid',       nombre: 'LUCID (fijo)', riesgoBase: 0.0050, multiplicador: 1.000, descripcion: 'Sin escalada, riesgo fijo en todos los niveles', builtin: true },
];

// Defaults para una cuenta sin configuración de riesgo explícita.
export const RIESGO_DEFAULTS = { riesgoBase: 0.0050, multiplicador: 1.300 };

// Genera los 7 niveles de riesgo de una cuenta.
// Devuelve [{ nivel, pct, importe }] donde:
//   pct     = fracción de riesgo de ese nivel (0.0065 = 0,65%)
//   importe = capital × pct (riesgo sugerido en $ para el próximo trade)
export function calcNiveles(riesgoBase, multiplicador, capital) {
  const rb = Number(riesgoBase) || RIESGO_DEFAULTS.riesgoBase;
  const mul = Number(multiplicador) || RIESGO_DEFAULTS.multiplicador;
  const cap = Number(capital) || 0;
  const niveles = [];
  for (let i = 1; i <= NUM_NIVELES; i++) {
    const pct = round(rb * Math.pow(mul, i - 1), 6);
    niveles.push({ nivel: i, pct, importe: round(cap * pct, 2) });
  }
  return niveles;
}

// Nivel activo a partir del equity actual y el capital nominal.
//   - equity ≥ capital  → Nivel 1 (la cuenta está en positivo).
//   - equity < capital  → sube de nivel a medida que la pérdida acumulada
//     (en % del capital) supera la suma acumulada de los pct de los niveles.
// `niveles` es la salida de calcNiveles().
export function calcNivelActivo(equityUsd, capital, niveles) {
  const cap = Number(capital) || 0;
  if (cap <= 0 || !Array.isArray(niveles) || !niveles.length) return 1;
  const pctPerdida = (Number(equityUsd) - cap) / cap;
  if (pctPerdida >= 0) return 1;

  let acumulado = 0;
  for (let i = 0; i < niveles.length; i++) {
    acumulado += niveles[i].pct;
    if (Math.abs(pctPerdida) <= acumulado) return i + 1;
  }
  return niveles.length; // pérdida superior a todos los umbrales → nivel máximo
}

// Resuelve la configuración de riesgo efectiva de una cuenta.
// Prioridad: campos propios de la cuenta → perfil asignado → defaults.
// `perfiles` es la lista combinada (built-in + custom).
export function resolveRiesgoConfig(cuenta, perfiles = []) {
  if (!cuenta) return { ...RIESGO_DEFAULTS, perfil: null };
  const perfil = cuenta.perfilId
    ? perfiles.find(p => p.id === cuenta.perfilId) || null
    : null;
  const riesgoBase = numOr(cuenta.riesgoBase, perfil ? perfil.riesgoBase : RIESGO_DEFAULTS.riesgoBase);
  const multiplicador = numOr(cuenta.multiplicador, perfil ? perfil.multiplicador : RIESGO_DEFAULTS.multiplicador);
  return { riesgoBase, multiplicador, perfil };
}

function numOr(v, fallback) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isFinite(n) && n > 0 ? n : fallback;
}

function round(v, decimals) {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

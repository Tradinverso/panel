// Lógica de escalado de riesgo por niveles + perfiles.
// Port directo de la matemática del dashboard PHP del compañero (api.php),
// adaptada a la app: el "balance" NO se introduce a mano — se deriva del equity
// de la cuenta (initialBalance + trades − retiros) vía accountStats().
//
// Modelo (operativa de la academia — por RACHA de resultados, no por drawdown):
//   - Cada cuenta tiene un riesgo_base (ej. 0.005 = 0,5%) y un multiplicador
//     (ej. 1.3). Con eso se generan 7 niveles de riesgo escalado:
//       pct(i) = riesgo_base × multiplicador^(i-1)
//   - El NIVEL ACTIVO sube con la racha de SL consecutivos:
//       · se empieza en Nivel 1
//       · cada SL sube un nivel (más riesgo para recuperar antes)
//       · un TP resetea a Nivel 1
//       · un BE es neutro (mantiene el nivel)
//     Tope en el último nivel (N7).

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

// Nivel activo a partir de la RACHA de SL consecutivos de la cuenta.
//   nivel = racha + 1  (0 SL → N1 · 1 SL → N2 · … · tope en numNiveles).
// La racha se obtiene con currentSlStreak() sobre los trades de la fase actual
// de la cuenta (SL suma, TP corta, BE se salta). Un TP → racha 0 → N1.
export function calcNivelActivo(slStreak, numNiveles = NUM_NIVELES) {
  const s = Math.max(0, Math.floor(Number(slStreak) || 0));
  const max = Number(numNiveles) || NUM_NIVELES;
  return Math.min(s + 1, max);
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

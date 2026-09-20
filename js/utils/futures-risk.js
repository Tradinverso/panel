// Gestión de riesgo de FUTUROS — separada del modelo de CFD (risk-levels.js).
//
// En futuros no hay niveles ni multiplicadores: cada cuenta elige UNA gestión
// de una lista cerrada (4 para challenges, 3 para fondeadas) con un riesgo fijo
// en dólares. Las cifras son las de la tabla de la academia, para cuentas de
// 50.000 $; en cuentas de otro tamaño se escalan en proporción al capital.
//
// La rotación funciona igual que en CFD (SL → siguiente, TP/BE → se queda),
// pero por UNIDADES: un grupo de copiado (varias cuentas que replican el mismo
// trade) o una cuenta suelta, que es un grupo de una. Así, con 16 cuentas en 4
// grupos, un SL en el grupo 1 pasa la rotación al grupo 2 entero.
//
// Módulo puro (sin imports): lo usan state.js, la vista de Riesgo y el
// componente de asignar cuentas a un trade.

export const BASE_CAPITAL = 50000;

// refs: riesgo según el RR del trade, tal cual la tabla (RR 1:2 → menos riesgo,
// RR 1:1,5 → más). Se usan los valores de la tabla y no la fórmula
// objetivo ÷ RR: así el alumno ve exactamente las cifras de los vídeos.
export const GESTIONES_FUTUROS = [
  // ── Challenges ──
  { id: 'ch-conservadora', fase: 'challenge', nombre: 'Conservadora', pct: '0,6–1 %',
    min: 300, max: 500, refs: [], nota: 'Primeras evaluaciones' },
  { id: 'ch-bajo', fase: 'challenge', nombre: 'Riesgo bajo', pct: '1–1,4 %',
    min: 500, max: 700, objetivo: 1000,
    refs: [{ rr: 2, usd: 500 }, { rr: 1.5, usd: 700 }] },
  { id: 'ch-medio', fase: 'challenge', nombre: 'Riesgo medio', pct: '1,2–1,5 %',
    min: 600, max: 750, objetivo: 1200, consistencia: '40%',
    refs: [{ rr: 2, usd: 600 }, { rr: 1.7, usd: 750 }] },
  { id: 'ch-alto', fase: 'challenge', nombre: 'Riesgo alto', pct: '1,5–2 %',
    min: 750, max: 1000, objetivo: 1500, objetivoNota: '2 TP', consistencia: '50%',
    refs: [{ rr: 2, usd: 750 }, { rr: 1.5, usd: 1000 }] },
  // ── Fondeadas ──
  { id: 'fo-conservadora', fase: 'fondeada', nombre: 'Conservadora', pct: '0,6–1 %',
    min: 300, max: 500, refs: [], consistencia: 'Con o sin regla',
    nota: 'Crecimiento estable y retiros constantes' },
  { id: 'fo-agresiva-con', fase: 'fondeada', nombre: 'Agresiva con consistencia', pct: '1,3–1,4 %',
    min: 650, max: 700, refs: [], rrRango: '1,5–2', consistencia: 'Con regla',
    nota: '30% del límite de pérdida. Avance rápido cumpliendo la regla de consistencia' },
  { id: 'fo-agresiva-sin', fase: 'fondeada', nombre: 'Agresiva sin consistencia', pct: '1,5–2 %',
    min: 750, max: 1000, refs: [], rrRango: '1,5–2', consistencia: 'Sin regla',
    nota: '40–50% del límite de pérdida. Colchón rápido y después días mínimos' },
];

const DEFAULT_POR_FASE = { challenge: 'ch-conservadora', fondeada: 'fo-conservadora' };

// ── Gestiones personalizadas ──
// Además de las 7 de la academia, cada usuario puede crear las suyas (se guardan
// en su config: futGestionesCustom). Mismo formato; `custom: true` las marca
// como editables/borrables. Las funciones de abajo reciben esa lista: el módulo
// sigue sin depender de state.
export function todasGestiones(custom = []) {
  return [...GESTIONES_FUTUROS, ...(Array.isArray(custom) ? custom : []).map(sanitizeGestion).filter(Boolean)];
}

export function sanitizeGestion(g) {
  if (!g || !g.id || !g.nombre) return null;
  const num = v => { const n = Number(v); return isFinite(n) && n > 0 ? n : null; };
  const min = num(g.min), max = num(g.max) || min;
  if (!min) return null;
  const refs = (Array.isArray(g.refs) ? g.refs : [])
    .map(r => ({ rr: num(r && r.rr), usd: num(r && r.usd) }))
    .filter(r => r.rr && r.usd);
  return {
    id: String(g.id), custom: true,
    fase: g.fase === 'fondeada' ? 'fondeada' : 'challenge',
    nombre: String(g.nombre).trim().slice(0, 40),
    min, max: Math.max(min, max),
    pct: `${fmtPct(min)}${max && max !== min ? '–' + fmtPct(max) : ''} %`,
    objetivo: num(g.objetivo) || undefined,
    consistencia: g.consistencia ? String(g.consistencia).trim().slice(0, 30) : undefined,
    nota: g.nota ? String(g.nota).trim().slice(0, 120) : undefined,
    refs,
  };
}

// % sobre 50.000 con coma decimal: 750 → "1,5"
function fmtPct(usd) {
  return String(+(usd / BASE_CAPITAL * 100).toFixed(2)).replace('.', ',');
}

export function faseGestion(cuenta) {
  return cuenta && cuenta.fase === 'fondeada' ? 'fondeada' : 'challenge';
}

export function gestionesDeFase(fase, custom = []) {
  return todasGestiones(custom).filter(g => g.fase === fase);
}

// Gestión que se aplica a la cuenta. Si no tiene ninguna elegida, o la que
// tiene es de otra fase (p. ej. acaba de pasar de challenge a fondeada), se
// usa la conservadora de su fase y se marca `pendiente` para que la vista pida
// elegir una.
// Si la gestión elegida era personalizada y se ha borrado, también cae aquí.
export function gestionEfectiva(cuenta, custom = []) {
  const fase = faseGestion(cuenta);
  const elegida = todasGestiones(custom).find(g => g.id === (cuenta && cuenta.futGestion));
  if (elegida && elegida.fase === fase) return { gestion: elegida, pendiente: false };
  return {
    gestion: GESTIONES_FUTUROS.find(g => g.id === DEFAULT_POR_FASE[fase]),
    pendiente: true,
  };
}

export function escala(cuenta) {
  const cap = Number(cuenta && cuenta.capital) || 0;
  return cap > 0 ? cap / BASE_CAPITAL : 1;
}

// Riesgo en $ para el próximo trade de la cuenta. Con el RR del trade y una
// gestión con referencias, el valor de la tabla más cercano a ese RR; sin RR o
// sin referencias, el mínimo de la gestión (la opción prudente). Escalado al
// capital de la cuenta.
export function riesgoSugerido(cuenta, rr, custom = []) {
  const { gestion } = gestionEfectiva(cuenta, custom);
  let base = gestion.min;
  let ref = null;
  const r = Number(rr);
  if (gestion.refs.length && isFinite(r) && r > 0) {
    ref = gestion.refs.reduce((best, x) => (Math.abs(x.rr - r) < Math.abs(best.rr - r) ? x : best));
    base = ref.usd;
  }
  return { usd: Math.round(base * escala(cuenta)), ref, gestion };
}

// Texto corto del riesgo de una gestión para una cuenta (escalado).
//   "750 $ (RR 1:2) · 1.000 $ (RR 1:1,5)"  ó  "300–500 $"
// "1.000 $", como la tabla de la academia. Punto de miles siempre:
// toLocaleString('es-ES') no lo pone en números de 4 cifras.
export function usdEs(v) {
  return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' $';
}

export function riesgoTexto(gestion, cuenta) {
  const k = escala(cuenta);
  const usd = v => usdEs(v * k);
  const rr = v => String(v).replace('.', ',');
  if (gestion.refs.length) return gestion.refs.map(x => `${usd(x.usd)} (RR 1:${rr(x.rr)})`).join(' · ');
  return gestion.min === gestion.max ? usd(gestion.min) : `${usd(gestion.min).replace(' $', '')}–${usd(gestion.max)}`;
}

// ── Rotación por unidades (grupo de copiado o cuenta suelta) ──
// `orden` = claves de unidad en el orden elegido por el usuario (config). Las
// unidades que aún no están en él van al final, por antigüedad.
export function unidadKey(cuenta) {
  const g = String(cuenta.grupo || '').trim();
  return g ? 'g:' + g : 'c:' + cuenta.id;
}

export function unidadesRotacion(cuentas, orden = []) {
  const enRot = (cuentas || []).filter(c =>
    c.tipo === 'Futuros' && c.status === 'activa' && c.enRotacion !== false);
  const map = new Map();
  for (const c of enRot) {
    const key = unidadKey(c);
    if (!map.has(key)) map.set(key, { key, grupo: String(c.grupo || '').trim() || null, cuentas: [] });
    map.get(key).cuentas.push(c);
  }
  const pos = k => { const i = orden.indexOf(k); return i < 0 ? 1e9 : i; };
  const born = u => Math.min(...u.cuentas.map(c => c.createdAt || 0));
  const units = [...map.values()];
  units.forEach(u => u.cuentas.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
  return units.sort((a, b) => pos(a.key) - pos(b.key) || born(a) - born(b));
}

export function unidadActiva(units, activaKey) {
  return units.find(u => u.key === activaKey) || units[0] || null;
}

// Nombre visible de una unidad: el grupo, o la cuenta suelta.
export function unidadNombre(u) {
  if (u.grupo) return u.grupo;
  const c = u.cuentas[0];
  return `${c.empresa || 'Cuenta'}${c.numero ? ' #' + c.numero : ''}`;
}

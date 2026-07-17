// Zonas horarias — soporte multi-país (alumnos en LATAM + coach en España).
//
// MODELO (importante): las horas de los trades se guardan tal cual las escribe
// el autor (texto plano 'HH:MM'), SIN reescribir nunca lo ya guardado — la clave
// de identidad/dedupe de un trade incluye date+open_str (ver state.js), así que
// tocarlas rompería la importación. En su lugar:
//   · El huso del autor vive en su PERFIL (profile.timezone).
//   · Los trades nuevos se estampan con `entry_tz`.
//   · El huso EFECTIVO de un trade = entry_tz || perfil del dueño || Europe/Madrid.
//   · La conversión se hace SOLO al mostrar/calcular, hacia el huso del usuario
//     logueado. Para un alumno viendo lo suyo es no-op (mismo huso).

export const DEFAULT_TZ = 'Europe/Madrid';

// Lista curada: España + LATAM (donde están los alumnos) + referencias de mercado.
export const TIMEZONES = [
  { tz: 'Europe/Madrid', label: 'España (Madrid)' },
  { tz: 'Atlantic/Canary', label: 'España (Canarias)' },
  { tz: 'America/Argentina/Buenos_Aires', label: 'Argentina (Buenos Aires)' },
  { tz: 'America/Costa_Rica', label: 'Costa Rica' },
  { tz: 'America/Mexico_City', label: 'México (CDMX)' },
  { tz: 'America/Bogota', label: 'Colombia (Bogotá)' },
  { tz: 'America/Lima', label: 'Perú (Lima)' },
  { tz: 'America/Santiago', label: 'Chile (Santiago)' },
  { tz: 'America/Caracas', label: 'Venezuela (Caracas)' },
  { tz: 'America/Guayaquil', label: 'Ecuador (Guayaquil)' },
  { tz: 'America/Montevideo', label: 'Uruguay (Montevideo)' },
  { tz: 'America/Asuncion', label: 'Paraguay (Asunción)' },
  { tz: 'America/La_Paz', label: 'Bolivia (La Paz)' },
  { tz: 'America/Santo_Domingo', label: 'Rep. Dominicana' },
  { tz: 'America/Panama', label: 'Panamá' },
  { tz: 'America/Guatemala', label: 'Guatemala' },
  { tz: 'America/New_York', label: 'EE. UU. (Nueva York)' },
  { tz: 'America/Chicago', label: 'EE. UU. (Chicago)' },
  { tz: 'Europe/London', label: 'Reino Unido (Londres)' },
  { tz: 'UTC', label: 'UTC' },
];

// ── Núcleo: offset real de una zona en un instante dado (respeta horario de verano) ──
// Devuelve minutos que hay que SUMAR a UTC para obtener la hora local de esa zona.
function tzOffsetMinutes(tz, instant) {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p = {};
    for (const part of dtf.formatToParts(instant)) p[part.type] = part.value;
    // Ojo: en hour12:false algunos motores devuelven '24' a medianoche.
    const hour = p.hour === '24' ? 0 : +p.hour;
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, hour, +p.minute, +p.second);
    return Math.round((asUTC - instant.getTime()) / 60000);
  } catch (_) {
    return 0; // zona inválida → sin desplazamiento (no rompemos la app)
  }
}

// 'YYYY-MM-DD' + 'HH:MM' interpretados en `tz` → instante real (Date/UTC).
export function zonedToInstant(dateStr, timeStr, tz) {
  const [y, m, d] = String(dateStr || '').split('-').map(Number);
  const [hh, mm] = String(timeStr || '00:00').split(':').map(Number);
  if (!y || !m || !d) return null;
  // Aproximación + corrección: partimos del "como si fuese UTC" y restamos el
  // offset de la zona en ese instante (iterando una vez para bordes de DST).
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  let inst = new Date(guess - tzOffsetMinutes(tz, new Date(guess)) * 60000);
  inst = new Date(guess - tzOffsetMinutes(tz, inst) * 60000);
  return inst;
}

// Instante → { date:'YYYY-MM-DD', time:'HH:MM' } en la zona `tz`.
export function instantToZoned(instant, tz) {
  const off = tzOffsetMinutes(tz, instant);
  const shifted = new Date(instant.getTime() + off * 60000);
  const p = n => String(n).padStart(2, '0');
  return {
    date: `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())}`,
    time: `${p(shifted.getUTCHours())}:${p(shifted.getUTCMinutes())}`,
  };
}

// Huso efectivo de un trade: el estampado al crearlo, o el del perfil de su dueño.
export function tradeTz(trade, ownerTz) {
  return (trade && trade.entry_tz) || ownerTz || DEFAULT_TZ;
}

// Convierte las horas de UN trade de `fromTz` a `toTz`. Devuelve una COPIA;
// nunca muta ni persiste (lo guardado se queda como está).
// Puede cambiar el día (p.ej. 21:00 en Argentina = 02:00 del día siguiente en Madrid).
export function convertTradeTz(trade, fromTz, toTz) {
  if (!trade || !fromTz || !toTz || fromTz === toTz) return trade;
  const inst = zonedToInstant(trade.date, trade.open_str, fromTz);
  if (!inst) return trade;
  const open = instantToZoned(inst, toTz);
  const out = { ...trade, date: open.date, open_str: open.time, open_hour: hhmmToDecimal(open.time) };
  if (trade.close_str) {
    // El cierre se reconstruye desde la apertura + duración: así se respeta el
    // cruce de medianoche que ya calculaba durationMinutes().
    const dur = typeof trade.dur === 'number' ? trade.dur : 0;
    const closeInst = new Date(inst.getTime() + dur * 60000);
    out.close_str = instantToZoned(closeInst, toTz).time;
  }
  return out;
}

// Convierte una lista de trades de un mismo dueño. `fromTz` es el huso del
// perfil del dueño; cada trade puede sobrescribirlo con su propio entry_tz
// (p.ej. si el alumno se mudó de país), por eso NO se corta aquí por fromTz.
export function convertTradesTz(trades, fromTz, toTz) {
  if (!Array.isArray(trades) || !toTz) return trades;
  return trades.map(t => convertTradeTz(t, tradeTz(t, fromTz), toTz));
}

function hhmmToDecimal(s) {
  const m = String(s || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
}

// Fecha de HOY en la zona indicada (o la del navegador).
// Sustituye a `new Date().toISOString().substring(0,10)`, que devuelve el día
// EQUIVOCADO fuera de UTC (un UTC-3 pasadas las 21:00 veía la fecha de mañana).
export function todayLocal(tz) {
  const now = new Date();
  if (tz) return instantToZoned(now, tz).date;
  const p = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

// Etiqueta legible con el offset actual, p.ej. "Argentina (Buenos Aires) · UTC-3".
export function tzLabel(tz) {
  const found = TIMEZONES.find(t => t.tz === tz);
  const name = found ? found.label : (tz || '—');
  if (!tz) return name;
  const off = tzOffsetMinutes(tz, new Date());
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const h = Math.floor(abs / 60), m = abs % 60;
  return `${name} · UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

// Diferencia en HORAS entre dos zonas ahora mismo (toTz - fromTz).
// Sirve para trasladar ventanas de sesión definidas en una zona (p.ej. Londres
// 08–12 hora Madrid) a la hora local del usuario.
export function tzHourDiff(fromTz, toTz, instant = new Date()) {
  if (!fromTz || !toTz || fromTz === toTz) return 0;
  return (tzOffsetMinutes(toTz, instant) - tzOffsetMinutes(fromTz, instant)) / 60;
}

// Zona detectada por el navegador (para proponerla por defecto).
export function guessTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ; }
  catch (_) { return DEFAULT_TZ; }
}

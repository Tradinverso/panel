// Parse various date formats → 'YYYY-MM-DD' or null
export function parseDate(s) {
  if (!s) return null;
  s = String(s).replace(/^"|"$/g, '').trim();
  if (!s) return null;

  // Google Sheets gviz "Date(Y,M,D)" with M zero-indexed
  const gviz = s.match(/^Date\((\d+),(\d+),(\d+)\)$/);
  if (gviz) {
    return `${gviz[1]}-${pad(+gviz[2] + 1)}-${pad(+gviz[3])}`;
  }

  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);

  // DD/MM/YY or DD/MM/YYYY
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (m) return buildDate(m[3], m[2], m[1]);

  // DD-MM-YY or DD-MM-YYYY
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})$/);
  if (m) return buildDate(m[3], m[2], m[1]);

  // Try Date constructor as fallback
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return null;
}

function pad(n) { return String(n).padStart(2, '0'); }

function buildDate(year, month, day) {
  let y = parseInt(year, 10);
  if (y < 100) y += y >= 70 ? 1900 : 2000;
  return `${y}-${pad(month)}-${pad(day)}`;
}

// 'HH:MM' → decimal hour (9.5 = 09:30) or null
export function parseTime(s) {
  if (!s) return null;
  s = String(s).replace(/"/g, '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
}

// 'HH:MM' → minutes since midnight
export function timeToMinutes(s) {
  const h = parseTime(s);
  return h == null ? null : Math.round(h * 60);
}

// minutes between open and close strings
export function durationMinutes(openStr, closeStr) {
  const o = timeToMinutes(openStr);
  const c = timeToMinutes(closeStr);
  if (o == null || c == null) return null;
  let d = c - o;
  if (d < 0) d += 24 * 60;
  return d;
}

// Decimal hour → 'HH:MM'
export function hourToString(h) {
  if (h == null) return '';
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${pad(hh)}:${pad(mm)}`;
}

// 'YYYY-MM-DD' → JS Date in local timezone (no time skew)
export function toDate(yyyymmdd) {
  if (!yyyymmdd) return null;
  const m = yyyymmdd.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

export function formatDateEs(yyyymmdd) {
  const d = toDate(yyyymmdd);
  if (!d) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatDateShort(yyyymmdd) {
  const d = toDate(yyyymmdd);
  if (!d) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

// 0=Mon..4=Fri, null otherwise
export function dayOfWeekIndex(yyyymmdd) {
  const d = toDate(yyyymmdd);
  if (!d) return null;
  const dow = d.getDay(); // 0=Sun..6=Sat
  if (dow === 0 || dow === 6) return null;
  return dow - 1;
}

export const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
export const DAYS_ES_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
export const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
export const MONTHS_ES_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ── Franjas horarias: bandas de 1 hora ─────────────────────────
// El rango se AJUSTA A LOS DATOS: va de la primera a la última hora con trades.
// Así no se malgasta espacio en horas vacías de los extremos (si operas de 7 a
// 20, no se pintan las 0-6 ni las 21-23), pero los huecos INTERMEDIOS sí se
// mantienen (si no operas a las 12 pero sí a las 11 y 13, las 12 aparecen
// vacías: esa ausencia es información).
export const HOUR_FROM = 6;   // rango por defecto cuando aún no hay datos
export const HOUR_TO = 22;    // exclusivo: la última banda es 21-22h

const pad2 = h => String(h).padStart(2, '0');

// `step` = tamaño de la banda en horas. La gráfica de barras usa 1h; el mapa de
// calor usa 2h a propósito: al dividir por hora Y por día, sus celdas tienen ~5
// veces menos trades, y con 1h la mayoría quedaría con 1-2 trades (un 0%/100%
// que parece señal pero es ruido).
export function hourSlots(trades, step = 1) {
  let lo = null, hi = null;
  if (Array.isArray(trades)) {
    for (const t of trades) {
      const h = t && t.open_hour;
      if (h == null || isNaN(h)) continue;
      const f = Math.floor(h);
      if (lo === null || f < lo) lo = f;
      if (hi === null || f + 1 > hi) hi = f + 1;
    }
  }
  // Sin datos → rango por defecto, para no dejar el gráfico vacío del todo.
  if (lo === null) { lo = HOUR_FROM; hi = HOUR_TO; }
  // Alinear a múltiplos del paso (con 2h: 06-08, 08-10…, no 07-09).
  lo = Math.max(0, Math.floor(lo / step) * step);
  hi = Math.min(24, Math.ceil(hi / step) * step);
  if (hi <= lo) hi = Math.min(24, lo + step);
  const out = [];
  for (let h = lo; h < hi; h += step) {
    const to = Math.min(24, h + step);
    out.push({ label: step === 1 ? pad2(h) : `${pad2(h)}-${pad2(to)}`, from: h, to });
  }
  return out;
}

// Rango base fijo (por si algo lo necesita sin datos).
export const HOUR_SLOTS = hourSlots(null);

export function hourSlot(decimalHour, slots = HOUR_SLOTS) {
  if (decimalHour == null) return null;
  for (const s of slots) if (decimalHour >= s.from && decimalHour < s.to) return s.label;
  return null;
}

// Compare two YYYY-MM-DD strings
export function dateCompare(a, b) {
  return String(a).localeCompare(String(b));
}

// 'YYYY-MM' for grouping
export function yearMonth(yyyymmdd) {
  return yyyymmdd ? yyyymmdd.substring(0, 7) : '';
}

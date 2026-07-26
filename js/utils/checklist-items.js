// Checklist pre-sesión — puntos definidos por el coach, iguales para todos
// los alumnos. Para cambiarlos, edita esta lista (igual que protocolos-fijos).
// El estado (marcado/no) es local al navegador de cada alumno y se REACTIVA
// por tramos de sesión, no solo a diario (se opera en dos sesiones).

import { storage } from '../storage.js';
import { auth } from '../auth.js';
import { tzHourDiff } from './timezone.js';

// daily: true → se responde UNA vez al día, en el primer checklist que se haga
// (en el tramo que sea); ya no vuelve a salir en las siguientes sesiones.
// daily: false → se repite en cada tramo (Londres y NY re-arman).
export const CHECKLIST_ITEMS = [
  { text: 'He dormido bien', daily: true },
  { text: 'Noticias del día revisadas', daily: false },
  { text: 'Estado emocional OK', daily: false },
  { text: 'Cuentas y gestión del riesgo revisadas', daily: false },
  { text: 'Protocolo preoperativo hecho', daily: false },
];

// Re-armados del checklist en HORA MADRID: apertura de Londres (7:30) y de
// Nueva York (14:00). Se trasladan al huso del alumno igual que las sesiones
// del diagnóstico. La medianoche LOCAL re-arma siempre (cambia la fecha).
const REARME_MADRID = [7.5, 14];

// Fecha y hora ACTUALES en el huso del perfil del alumno (no el del navegador:
// si viaja o usa un PC con otro huso, los re-armados dispararían a deshora
// porque los límites sí están convertidos al huso del perfil).
function nowInUserTz() {
  const d = new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: auth.timezone(), hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(d);
    const get = t => (parts.find(p => p.type === t) || {}).value;
    return {
      date: `${get('year')}-${get('month')}-${get('day')}`,
      hour: (+get('hour') % 24) + (+get('minute')) / 60,
    };
  } catch (e) {
    // Huso inválido o no configurado → hora local del navegador
    return {
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      hour: d.getHours() + d.getMinutes() / 60,
    };
  }
}

// Clave del tramo actual: 'YYYY-MM-DD|pN'. Completar el checklist vale para
// este tramo; al cruzar medianoche o un re-armado, la clave cambia y el
// checklist vuelve a "pendiente" aunque ya se hubiera hecho antes.
export function currentChecklistKey() {
  const now = nowInUserTz();
  const d = tzHourDiff('Europe/Madrid', auth.timezone());
  const bounds = REARME_MADRID
    .map(h => ((h + d) % 24 + 24) % 24)
    .sort((a, b) => a - b);
  let period = 0;
  for (const b of bounds) if (now.hour >= b) period++;
  return `${now.date}|p${period}`;
}

// Clave de los puntos DIARIOS (ej. "he dormido bien"): una por día natural.
export function dailyChecklistKey() {
  return `${nowInUserTz().date}|daily`;
}

// ¿Está completo el checklist ACTUAL? Cada punto se comprueba en su ámbito:
// los diarios contra la clave del día, los de sesión contra la del tramo.
export function checklistCompleto() {
  const tramo = storage.getChecklist(currentChecklistKey());
  const daily = storage.getChecklist(dailyChecklistKey());
  return CHECKLIST_ITEMS.every((it, i) => (it.daily ? daily[i] : tramo[i]));
}

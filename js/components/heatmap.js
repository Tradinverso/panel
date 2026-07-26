import { dayOfWeekIndex, hourSlots, DAYS_ES } from '../utils/date-helpers.js';
import { winrate } from '../utils/calculations.js';

export function renderHeatmap(container, trades) {
  container.className = 'heatmap';
  container.innerHTML = '';
  // Bandas de 2h (no 1h como las barras): este mapa divide por hora Y por día,
  // así que sus celdas tienen ~5x menos trades; con 1h la mayoría quedaría con
  // 1-2 trades y un 0%/100% que parece señal pero es ruido.
  // Ajustadas SOLO a los trades que pinta (lun-vie con hora): si no, un trade de
  // fin de semana crearía una fila vacía en el borde.
  const counted = (trades || []).filter(t => dayOfWeekIndex(t.date) != null && t.open_hour != null);
  const SLOTS = hourSlots(counted, 2);
  const matrix = SLOTS.map(() => DAYS_ES.map(() => ({ tp: 0, sl: 0, total: 0 })));
  for (const t of trades) {
    const di = dayOfWeekIndex(t.date);
    if (di == null) continue;
    if (t.open_hour == null) continue;
    for (let h = 0; h < SLOTS.length; h++) {
      const s = SLOTS[h];
      if (t.open_hour >= s.from && t.open_hour < s.to) {
        matrix[h][di].total++;
        if (t.result === 'TP') matrix[h][di].tp++;
        else if (t.result === 'SL') matrix[h][di].sl++;
        break;
      }
    }
  }
  // Header
  container.appendChild(div('hm-corner', ''));
  for (const d of DAYS_ES) container.appendChild(div('hm-day-label', d));
  // Body
  // En claro los colores puros del degradado rojo→verde se lavan sobre tarjeta
  // blanca: se oscurece el texto y se suaviza el tinte de fondo.
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  SLOTS.forEach((slot, hi) => {
    container.appendChild(div('hm-hour-label', slot.label + 'h'));
    matrix[hi].forEach(cell => {
      const c = div('hm-cell', '');
      const decisive = cell.tp + cell.sl;
      if (cell.total === 0) {
        c.textContent = '–';
      } else if (decisive === 0) {
        // Solo BE: ni bueno ni malo. Antes wr=0 lo pintaba rojo (parecía mala
        // franja); se deja neutro con su recuento en el tooltip.
        c.textContent = 'BE';
        c.title = `${cell.total} trades en BE`;
      } else {
        const wr = cell.tp / decisive;
        const r = Math.round(255 * (1 - wr));
        const g = Math.round(71 * (1 - wr) + 212 * wr);
        const b = Math.round(87 * (1 - wr) + 170 * wr);
        const k = light ? 0.66 : 1;
        c.style.background = `rgba(${r},${g},${b},${light ? 0.16 : 0.25})`;
        c.style.color = `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
        c.textContent = Math.round(wr * 100) + '%';
        c.title = `${cell.tp}TP / ${cell.sl}SL · ${cell.total} trades`;
      }
      container.appendChild(c);
    });
  });
}

function div(cls, txt) {
  const d = document.createElement('div');
  d.className = cls;
  d.textContent = txt;
  return d;
}

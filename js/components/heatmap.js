import { dayOfWeekIndex, HOUR_SLOTS, DAYS_ES } from '../utils/date-helpers.js';
import { winrate } from '../utils/calculations.js';

export function renderHeatmap(container, trades) {
  container.className = 'heatmap';
  container.innerHTML = '';
  const matrix = HOUR_SLOTS.map(() => DAYS_ES.map(() => ({ tp: 0, sl: 0, total: 0 })));
  for (const t of trades) {
    const di = dayOfWeekIndex(t.date);
    if (di == null) continue;
    if (t.open_hour == null) continue;
    for (let h = 0; h < HOUR_SLOTS.length; h++) {
      const s = HOUR_SLOTS[h];
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
  HOUR_SLOTS.forEach((slot, hi) => {
    container.appendChild(div('hm-hour-label', slot.label.replace('h', '')));
    matrix[hi].forEach(cell => {
      const c = div('hm-cell', '');
      if (cell.total === 0) {
        c.textContent = '–';
      } else {
        const decisive = cell.tp + cell.sl;
        const wr = decisive > 0 ? cell.tp / decisive : 0;
        const r = Math.round(255 * (1 - wr));
        const g = Math.round(71 * (1 - wr) + 212 * wr);
        const b = Math.round(87 * (1 - wr) + 170 * wr);
        c.style.background = `rgba(${r},${g},${b},0.25)`;
        c.style.color = `rgb(${r},${g},${b})`;
        c.textContent = decisive > 0 ? Math.round(wr * 100) + '%' : '–';
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

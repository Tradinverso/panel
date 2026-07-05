// Chart.js wrappers — each destroys any chart on the canvas before creating a new one
// Charts are destroyed via Chart.getChart(canvas)?.destroy() to avoid memory leaks on re-render.
// Estilo "Glass Command Center": degradados, curvas suaves, barras redondeadas,
// tooltips de cristal. Solo estética — datos y firmas intactos.

const READ = key => getComputedStyle(document.documentElement).getPropertyValue(key).trim();

// Desactivar la animación de Chart.js globalmente. El motor de animación daba
// "this._fn is not a function" y dejaba el gráfico en blanco hasta refrescar.
// Sin animación, cada gráfico se dibuja entero y al instante (más fiable).
if (typeof Chart !== 'undefined') Chart.defaults.animation = false;

// Convierte un color (#rgb / #rrggbb) a rgba con alpha. Si ya es rgb/rgba lo deja.
function rgba(color, a) {
  const c = (color || '').trim();
  if (c.startsWith('rgb')) return c;
  let h = c.replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  const n = parseInt(h, 16);
  if (isNaN(n)) return c;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// Degradado vertical para rellenos de área / barras.
function vGrad(canvas, color, a0, a1) {
  const ctx = canvas.getContext('2d');
  const h = canvas.clientHeight || canvas.height || 240;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgba(color, a0));
  g.addColorStop(1, rgba(color, a1));
  return g;
}

function defaults() {
  Chart.defaults.color = READ('--muted');
  Chart.defaults.borderColor = READ('--border');
  Chart.defaults.font.family = "'DM Mono', monospace";
  Chart.defaults.font.size = 11;
  // Tooltips de cristal, legibles (cuerpo en Inter)
  const tt = Chart.defaults.plugins.tooltip;
  tt.backgroundColor = rgba(READ('--card'), 0.92);
  tt.titleColor = READ('--text-strong');
  tt.bodyColor = READ('--text');
  tt.borderColor = READ('--glass-border');
  tt.borderWidth = 1;
  tt.cornerRadius = 10;
  tt.padding = 10;
  tt.titleFont = { family: "'Inter', sans-serif", weight: '600', size: 12 };
  tt.bodyFont = { family: "'Inter', sans-serif", size: 12 };
  tt.usePointStyle = true;
}

// Eje X tenue (sin líneas verticales), eje Y con rejilla suave.
function softScales(yFmt) {
  return {
    x: { grid: { display: false }, ticks: { maxTicksLimit: 8, autoSkip: true }, border: { display: false } },
    y: { ticks: yFmt ? { callback: yFmt } : {}, grid: { color: READ('--border') }, border: { display: false } },
  };
}

export function createEquity(canvas, datasets, opts = {}) {
  defaults();
  Chart.getChart(canvas)?.destroy();
  const GREEN = READ('--green'), Z = READ('--zonas'), L = READ('--liquidez'), N = READ('--nasdaq');
  const palette = { ALL: GREEN, ZONAS: Z, LIQUIDEZ: L, NASDAQ: N, PORT: READ('--cyan') };
  const fmt = typeof opts.formatter === 'function' ? opts.formatter : (v => v.toFixed(1) + '%');
  return new Chart(canvas, {
    type: 'line',
    data: {
      datasets: datasets.map(d => {
        const primary = d.key === 'ALL' || d.key === 'PORT';
        const color = palette[d.key] || GREEN;
        return {
          label: d.label,
          data: d.data,
          borderColor: color,
          backgroundColor: primary ? vGrad(canvas, color, 0.30, 0) : 'transparent',
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: color,
          pointHoverBorderColor: rgba(color, 0.3),
          pointHoverBorderWidth: 6,
          borderWidth: primary ? 2.5 : 1.5,
          borderDash: primary ? [] : [4, 3],
          fill: primary,
        };
      }),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.parsed.y)}` } },
      },
      scales: softScales(fmt),
    },
  });
}

export function createDonut(canvas, tp, sl, be) {
  defaults();
  Chart.getChart(canvas)?.destroy();
  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['TP', 'SL', 'BE'],
      datasets: [{
        data: [tp, sl, be],
        backgroundColor: [READ('--green'), READ('--red'), READ('--dim')],
        borderColor: READ('--card2'),
        borderWidth: 3,
        spacing: 2,
        hoverOffset: 6,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '74%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}` } } },
    },
  });
}

export function createBar(canvas, labels, data, opts = {}) {
  defaults();
  Chart.getChart(canvas)?.destroy();
  const GREEN = READ('--green'), RED = READ('--red');
  const colors = data.map(v => v >= 0 ? vGrad(canvas, GREEN, 0.95, 0.35) : vGrad(canvas, RED, 0.95, 0.35));
  const fmt = typeof opts.formatter === 'function' ? opts.formatter : (v => v + '%');
  const { formatter, ...restOpts } = opts;
  return new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 8, borderSkipped: false, categoryPercentage: 0.7, barPercentage: 0.82 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.parsed.y)}` } },
      },
      scales: softScales(fmt),
      ...restOpts,
    },
  });
}

export function createHourBar(canvas, hourData) {
  defaults();
  Chart.getChart(canvas)?.destroy();
  const GREEN = READ('--green'), RED = READ('--red'), ORANGE = READ('--orange'), BLUE = READ('--cyan');
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: hourData.map(h => h.label),
      datasets: [
        {
          label: 'WR %',
          data: hourData.map(h => +h.wr.toFixed(1)),
          backgroundColor: hourData.map(h => vGrad(canvas, h.wr >= 55 ? GREEN : h.wr < 42 ? RED : ORANGE, 0.95, 0.3)),
          borderRadius: 8, borderSkipped: false, yAxisID: 'y', categoryPercentage: 0.7, barPercentage: 0.82,
        },
        {
          label: 'N°',
          data: hourData.map(h => h.n),
          type: 'line', borderColor: BLUE,
          backgroundColor: 'transparent',
          tension: 0.4, pointRadius: 0, pointHoverRadius: 4,
          pointBackgroundColor: BLUE,
          borderWidth: 2, yAxisID: 'y2',
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, border: { display: false } },
        y: { ticks: { callback: v => v + '%' }, grid: { color: READ('--border') }, border: { display: false }, min: 0, max: 110 },
        y2: { position: 'right', grid: { display: false }, border: { display: false }, ticks: { color: BLUE } },
      },
    },
  });
}

export function createDayBar(canvas, dayData) {
  defaults();
  Chart.getChart(canvas)?.destroy();
  const GREEN = READ('--green'), RED = READ('--red'), ORANGE = READ('--orange'), BLUE = READ('--cyan');
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: dayData.map(d => d.label),
      datasets: [
        {
          label: 'WR %',
          data: dayData.map(d => +d.wr.toFixed(1)),
          backgroundColor: dayData.map(d => vGrad(canvas, d.wr >= 55 ? GREEN : d.wr < 48 ? RED : ORANGE, 0.95, 0.3)),
          borderRadius: 8, borderSkipped: false, yAxisID: 'y', categoryPercentage: 0.7, barPercentage: 0.82,
        },
        {
          label: 'N°',
          data: dayData.map(d => d.n),
          type: 'line', borderColor: BLUE,
          backgroundColor: 'transparent',
          tension: 0.4, pointRadius: 0, pointHoverRadius: 4,
          pointBackgroundColor: BLUE,
          borderWidth: 2, yAxisID: 'y2',
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, border: { display: false } },
        y: { ticks: { callback: v => v + '%' }, grid: { color: READ('--border') }, border: { display: false }, min: 0, max: 100 },
        y2: { position: 'right', grid: { display: false }, border: { display: false }, ticks: { color: BLUE } },
      },
    },
  });
}

export function createLongShort(canvas, lsData) {
  defaults();
  Chart.getChart(canvas)?.destroy();
  const GREEN = READ('--green'), RED = READ('--red');
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: lsData.map(d => d.label),
      datasets: [
        { label: 'Long', data: lsData.map(d => +d.long.wr.toFixed(1)), backgroundColor: vGrad(canvas, GREEN, 0.95, 0.3), borderRadius: 6, borderSkipped: false, categoryPercentage: 0.7, barPercentage: 0.85 },
        { label: 'Short', data: lsData.map(d => +d.short.wr.toFixed(1)), backgroundColor: vGrad(canvas, RED, 0.95, 0.3), borderRadius: 6, borderSkipped: false, categoryPercentage: 0.7, barPercentage: 0.85 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 10, boxHeight: 10, padding: 16, usePointStyle: true, font: { family: "'Inter', sans-serif", size: 11 } } } },
      scales: {
        x: { grid: { display: false }, border: { display: false } },
        y: { ticks: { callback: v => v + '%' }, grid: { color: READ('--border') }, border: { display: false }, min: 0, max: 100 },
      },
    },
  });
}

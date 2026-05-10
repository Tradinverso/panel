// Chart.js wrappers — each destroys any chart on the canvas before creating a new one
// Charts are destroyed via Chart.getChart(canvas)?.destroy() to avoid memory leaks on re-render.

const READ = key => getComputedStyle(document.documentElement).getPropertyValue(key).trim();

function defaults() {
  Chart.defaults.color = READ('--muted');
  Chart.defaults.borderColor = READ('--border');
  Chart.defaults.font.family = "'DM Mono', monospace";
  Chart.defaults.font.size = 11;
}

export function createEquity(canvas, datasets) {
  defaults();
  Chart.getChart(canvas)?.destroy();
  const GREEN = READ('--green'), Z = READ('--zonas'), L = READ('--liquidez'), N = READ('--nasdaq');
  const palette = { ALL: GREEN, ZONAS: Z, LIQUIDEZ: L, NASDAQ: N };
  return new Chart(canvas, {
    type: 'line',
    data: {
      datasets: datasets.map(d => ({
        label: d.label,
        data: d.data,
        borderColor: palette[d.key] || GREEN,
        backgroundColor: d.key === 'ALL' ? 'rgba(0,212,170,0.06)' : 'transparent',
        tension: 0.3,
        pointRadius: 0,
        borderWidth: d.key === 'ALL' ? 2 : 1.5,
        borderDash: d.key === 'ALL' ? [] : [4, 3],
        fill: d.key === 'ALL',
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
      scales: {
        x: { type: 'category', ticks: { maxTicksLimit: 8, autoSkip: true }, grid: { color: READ('--border') } },
        y: { ticks: { callback: v => v.toFixed(1) + '%' }, grid: { color: READ('--border') } },
      },
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
        backgroundColor: [READ('--green'), READ('--red'), READ('--muted')],
        borderWidth: 0,
        hoverOffset: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '72%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}` } } },
    },
  });
}

export function createBar(canvas, labels, data, opts = {}) {
  defaults();
  Chart.getChart(canvas)?.destroy();
  const GREEN = READ('--green'), RED = READ('--red');
  const colors = data.map(v => v >= 0 ? GREEN : RED);
  return new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 6, borderSkipped: false }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: READ('--border') } },
        y: { ticks: { callback: v => v + '%' }, grid: { color: READ('--border') } },
      },
      ...opts,
    },
  });
}

export function createHourBar(canvas, hourData) {
  defaults();
  Chart.getChart(canvas)?.destroy();
  const GREEN = READ('--green'), RED = READ('--red'), ORANGE = READ('--orange'), BLUE = READ('--accent');
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: hourData.map(h => h.label),
      datasets: [
        {
          label: 'WR %',
          data: hourData.map(h => +h.wr.toFixed(1)),
          backgroundColor: hourData.map(h => h.wr >= 55 ? GREEN : h.wr < 42 ? RED : ORANGE),
          borderRadius: 6, borderSkipped: false, yAxisID: 'y',
        },
        {
          label: 'N°',
          data: hourData.map(h => h.n),
          type: 'line', borderColor: BLUE,
          backgroundColor: 'transparent',
          tension: 0.4, pointRadius: 4,
          pointBackgroundColor: BLUE,
          borderWidth: 1.5, yAxisID: 'y2',
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: READ('--border') } },
        y: { ticks: { callback: v => v + '%' }, grid: { color: READ('--border') }, min: 0, max: 110 },
        y2: { position: 'right', grid: { display: false }, ticks: { color: BLUE } },
      },
    },
  });
}

export function createDayBar(canvas, dayData) {
  defaults();
  Chart.getChart(canvas)?.destroy();
  const GREEN = READ('--green'), RED = READ('--red'), ORANGE = READ('--orange'), BLUE = READ('--accent');
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: dayData.map(d => d.label),
      datasets: [
        {
          label: 'WR %',
          data: dayData.map(d => +d.wr.toFixed(1)),
          backgroundColor: dayData.map(d => d.wr >= 55 ? GREEN : d.wr < 48 ? RED : ORANGE),
          borderRadius: 6, borderSkipped: false, yAxisID: 'y',
        },
        {
          label: 'N°',
          data: dayData.map(d => d.n),
          type: 'line', borderColor: BLUE,
          backgroundColor: 'transparent',
          tension: 0.4, pointRadius: 4,
          pointBackgroundColor: BLUE,
          borderWidth: 1.5, yAxisID: 'y2',
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: READ('--border') } },
        y: { ticks: { callback: v => v + '%' }, grid: { color: READ('--border') }, min: 0, max: 100 },
        y2: { position: 'right', grid: { display: false }, ticks: { color: BLUE } },
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
        { label: 'Long', data: lsData.map(d => +d.long.wr.toFixed(1)), backgroundColor: GREEN, borderRadius: 4, borderSkipped: false },
        { label: 'Short', data: lsData.map(d => +d.short.wr.toFixed(1)), backgroundColor: RED, borderRadius: 4, borderSkipped: false },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 10, boxHeight: 10, padding: 16, font: { size: 11 } } } },
      scales: {
        x: { grid: { color: READ('--border') } },
        y: { ticks: { callback: v => v + '%' }, grid: { color: READ('--border') }, min: 0, max: 100 },
      },
    },
  });
}

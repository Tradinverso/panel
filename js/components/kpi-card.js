// `trend` (opcional): comparación con el periodo anterior.
//   { delta: number, text: '+3,2pp', better: true|false }
// `better` decide el color (no el signo): en el DD máximo, bajar es mejor.
export function kpiCard({ label, value, sub = '', tone = 'green', icon = '', trend = null }) {
  return `
    <div class="kpi-card ${tone}">
      ${icon ? `<span class="kpi-icon ${tone}">${icon}</span>` : ''}
      <div class="kpi-label">${label}</div>
      <div class="kpi-value ${tone}">${value}</div>
      ${trend ? trendPill(trend) : ''}
      ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
    </div>
  `;
}

function trendPill(t) {
  if (!t || t.delta == null || !isFinite(t.delta)) return '';
  const flat = Math.abs(t.delta) < 0.05;
  if (flat) return `<div class="kpi-trend"><span class="stat-trend flat">= igual</span><span class="kt-ref">${t.ref || ''}</span></div>`;
  const up = t.delta > 0;
  const cls = t.better ? 'up' : 'down';
  return `<div class="kpi-trend">
    <span class="stat-trend ${cls}">${up ? '▲' : '▼'} ${t.text}</span>
    <span class="kt-ref">${t.ref || ''}</span>
  </div>`;
}

// Composite KPI: value + secondary indicator on the right (e.g. Racha TP + %)
export function kpiCardComposite({ label, primary, secondary, sub = '', tone = 'green' }) {
  return `
    <div class="kpi-card ${tone}">
      <div class="kpi-label">${label}</div>
      <div style="display:flex;align-items:baseline;gap:8px;line-height:1;">
        <span class="kpi-value ${tone}">${primary}</span>
        ${secondary ? `<span style="color:var(--muted);font-size:13px;font-weight:400;">${secondary}</span>` : ''}
      </div>
      ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
    </div>
  `;
}

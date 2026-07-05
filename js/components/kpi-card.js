export function kpiCard({ label, value, sub = '', tone = 'green', icon = '' }) {
  return `
    <div class="kpi-card ${tone}">
      ${icon ? `<span class="kpi-icon ${tone}">${icon}</span>` : ''}
      <div class="kpi-label">${label}</div>
      <div class="kpi-value ${tone}">${value}</div>
      ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
    </div>
  `;
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

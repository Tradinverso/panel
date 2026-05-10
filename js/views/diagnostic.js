import { state } from '../state.js';
import { buildAlerts } from '../utils/diagnostics.js';
import { sensacionStats, withSensacion, TODAS, POSITIVAS, NEGATIVAS } from '../utils/sensaciones.js';
import { fmtPct, fmtPctNoSign } from '../utils/number-format-es.js';

function render(container) {
  const trades = state.trades;
  if (!trades.length) {
    container.innerHTML = `
      <div class="page-header"><div><h1>Diagnóstico</h1><div class="sub">Sin datos</div></div></div>
      <div class="empty">Aún no hay trades. Importa o registra para ver el diagnóstico.</div>
    `;
    return;
  }

  const a = buildAlerts(trades);
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Diagnóstico</h1>
        <div class="sub">Alertas técnicas y emocionales basadas en ${trades.length} trades</div>
      </div>
    </div>

    <div class="grid-2">
      <div>
        <div style="font-size:15px;font-weight:600;margin-bottom:14px;letter-spacing:-0.2px;">Técnico</div>
        <div class="card" style="margin-bottom:14px;">
          <div class="card-title" style="margin-bottom:14px;">Alertas</div>
          <div id="tecAlertas">${renderList(a.tecAlertas, 'Sin alertas técnicas activas ✓')}</div>
        </div>
        <div class="card">
          <div class="card-title" style="margin-bottom:14px;">Insights</div>
          <div id="tecInsights">${renderList(a.tecInsights, '–')}</div>
        </div>
      </div>
      <div>
        <div style="font-size:15px;font-weight:600;margin-bottom:14px;letter-spacing:-0.2px;">Emocional</div>
        <div class="card" style="margin-bottom:14px;">
          <div class="card-title" style="margin-bottom:14px;">Alertas</div>
          <div id="emoAlertas">${renderList(a.emoAlertas, 'Sin alertas emocionales activas ✓')}</div>
        </div>
        <div class="card">
          <div class="card-title" style="margin-bottom:14px;">Insights</div>
          <div id="emoInsights">${renderList(a.emoInsights, '–')}</div>
        </div>
      </div>
    </div>

    <div class="section-title">Sensaciones — distribución y rendimiento</div>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">Distribución</div>
        <div class="card-sub">Frecuencia por estado mental</div>
        <div id="sensDist"></div>
      </div>
      <div class="card">
        <div class="card-title">Rendimiento por sensación</div>
        <div class="card-sub">WR · P&L · Profit Factor</div>
        <div id="sensTable"></div>
      </div>
    </div>
  `;

  paintSensDist(container.querySelector('#sensDist'), trades);
  paintSensTable(container.querySelector('#sensTable'), trades);
}

function renderList(items, emptyText) {
  if (!items.length) return `<div style="color:var(--muted);font-family:var(--mono);font-size:11px;padding:8px 0;">${emptyText}</div>`;
  return items.map(a => `
    <div class="alert ${a.type}">
      <div class="alert-icon">${a.icon}</div>
      <div>
        <div class="alert-title">${a.title}</div>
        <div class="alert-body">${a.body}</div>
      </div>
    </div>
  `).join('');
}

function paintSensDist(container, trades) {
  const stats = sensacionStats(trades);
  const ws = withSensacion(trades);
  if (!ws.length) {
    container.innerHTML = '<div class="empty">Sin trades con sensación registrada</div>';
    return;
  }
  const total = ws.length;
  const max = Math.max(...[...stats.values()].map(d => d.total));
  container.innerHTML = TODAS.filter(s => stats.has(s)).map(s => {
    const d = stats.get(s);
    const pct = Math.round(d.total / total * 100);
    const w = Math.round(d.total / max * 100);
    return `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <span style="min-width:160px;"><span class="sens-pill" data-s="${s}">${s}</span></span>
        <div style="flex:1;height:8px;background:var(--card2);border-radius:4px;overflow:hidden;">
          <div style="width:${w}%;height:100%;background:${barColor(s)};border-radius:4px;"></div>
        </div>
        <span style="font-family:var(--mono);font-size:11px;color:var(--muted);min-width:60px;text-align:right;">${d.total} (${pct}%)</span>
      </div>
    `;
  }).join('');
}

function paintSensTable(container, trades) {
  const stats = sensacionStats(trades);
  if (!stats.size) {
    container.innerHTML = '<div class="empty">Sin trades con sensación registrada</div>';
    return;
  }
  container.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Sensación</th><th>Trades</th><th>WR</th><th>P&L</th><th>PF</th><th>TP/SL/BE</th>
      </tr></thead>
      <tbody>
        ${TODAS.filter(s => stats.has(s)).map(s => {
          const d = stats.get(s);
          const wrColor = d.wr >= 50 ? 'var(--green)' : d.wr >= 40 ? 'var(--orange)' : 'var(--red)';
          const pnlColor = d.pnl >= 0 ? 'var(--green)' : 'var(--red)';
          const pfColor = !isFinite(d.pf) ? 'var(--green)' : d.pf >= 2 ? 'var(--green)' : d.pf >= 1.5 ? 'var(--orange)' : 'var(--red)';
          return `<tr>
            <td><span class="sens-pill" data-s="${s}">${s}</span></td>
            <td>${d.total}</td>
            <td style="color:${wrColor};font-weight:500;">${fmtPctNoSign(d.wr, 0)}</td>
            <td style="color:${pnlColor};font-weight:500;">${fmtPct(d.pnl, 1)}</td>
            <td style="color:${pfColor};font-weight:500;">${isFinite(d.pf) ? d.pf.toFixed(2) : '∞'}</td>
            <td style="font-family:var(--mono);font-size:11px;">
              <span style="color:var(--green)">${d.tp}</span> /
              <span style="color:var(--red)">${d.sl}</span> /
              <span style="color:var(--orange)">${d.be}</span>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

function barColor(s) {
  if (POSITIVAS.includes(s)) return 'var(--green)';
  if (NEGATIVAS.includes(s)) return 'var(--red)';
  return 'var(--orange)';
}

export function diagnosticView(container) {
  render(container);
  return state.on(() => render(container));
}

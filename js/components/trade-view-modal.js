// Modal de SOLO LECTURA: muestra todos los datos del trade como texto plano.
// No hay inputs; un botón "Editar" delega al modal de edición existente.

import { openModal } from './modal.js';
import { openEditTradeModal } from './trade-edit-modal.js';
import { tradeRealPnl } from '../utils/calculations.js';
import { state } from '../state.js';
import { fmtPct } from '../utils/number-format-es.js';
import { formatDateEs } from '../utils/date-helpers.js';
import { STRATEGIES } from '../utils/strategy-config.js';

const STRAT_LABEL = { ZONAS: 'Zonas', LIQUIDEZ: 'Liquidez', NASDAQ: 'Nasdaq' };

export function openViewTradeModal(trade) {
  const meta = STRATEGIES[trade.sheet] || {};
  const realPnl = tradeRealPnl(trade);
  const resColor = trade.result === 'TP' ? 'var(--green)' : trade.result === 'SL' ? 'var(--red)' : 'var(--orange)';

  // Cuentas asignadas en formato legible
  const cuentasHtml = (Array.isArray(trade.accounts) && trade.accounts.length)
    ? trade.accounts.map(a => {
        const c = state.cuentas.find(x => x.id === a.accountId);
        if (!c) return `<div>${escapeHtml(a.accountId.substring(0, 8))}… · ${a.riskPct}%</div>`;
        return `<div>${escapeHtml(c.empresa)} ${capShort(c.capital)}${c.numero ? ' #' + escapeHtml(c.numero) : ''} · ${a.riskPct}%</div>`;
      }).join('')
    : '<span style="color:var(--muted);">— Sin asignar —</span>';

  // Links
  const linksHtml = (trade.url1 || trade.url2)
    ? [
        trade.url1 ? `<a href="${escapeAttr(trade.url1)}" target="_blank" rel="noopener">${trade.sheet === 'ZONAS' ? 'TradingView' : 'HTF'}</a>` : '',
        trade.url2 ? `<a href="${escapeAttr(trade.url2)}" target="_blank" rel="noopener">LTF</a>` : '',
      ].filter(Boolean).join(' · ')
    : '<span style="color:var(--muted);">—</span>';

  const reflexionHtml = (trade.reflexion || '').trim()
    ? `<div class="trade-view-reflex">${escapeHtml(trade.reflexion)}</div>`
    : '<span style="color:var(--muted);">— Sin reflexión —</span>';

  const sensHtml = trade.sensacion
    ? `<span class="sens-pill" data-s="${escapeAttr(trade.sensacion)}">${escapeHtml(trade.sensacion)}</span>`
    : '<span style="color:var(--muted);">—</span>';

  const risk = typeof trade.risk_real_pct === 'number' && isFinite(trade.risk_real_pct) ? trade.risk_real_pct : 1;

  openModal({
    title: 'Trade · ' + (STRAT_LABEL[trade.sheet] || trade.sheet),
    meta: `${formatDateEs(trade.date)} · ${trade.pair || ''} · ${trade.setup || ''} · ${trade.result}`,
    body: `
      <dl class="trade-view-grid">
        <dt>Fecha</dt><dd>${formatDateEs(trade.date)}</dd>
        <dt>Hora</dt><dd>${escapeHtml(trade.open_str || '–')}${trade.close_str ? ' → ' + escapeHtml(trade.close_str) : ''}${trade.dur != null ? ` <span style="color:var(--muted);">(${trade.dur} min)</span>` : ''}</dd>
        <dt>Estrategia</dt><dd><span class="strat-pill ${(trade.sheet || '').toLowerCase()}">${STRAT_LABEL[trade.sheet] || trade.sheet}</span></dd>
        <dt>Par</dt><dd>${escapeHtml(trade.pair || '–')}</dd>
        <dt>Setup</dt><dd>${escapeHtml(trade.setup || '–')}</dd>
        <dt>Zona</dt><dd>${escapeHtml((Array.isArray(trade.zone) ? trade.zone.join(' · ') : trade.zone) || '–')}</dd>
        ${meta.showEntry ? `<dt>Entrada</dt><dd>${escapeHtml((Array.isArray(trade.entry) ? trade.entry.join(' · ') : trade.entry) || '–')}</dd>` : ''}
        ${trade.rr != null ? `<dt>RR</dt><dd>${trade.rr}</dd>` : ''}
        ${trade.pips != null ? `<dt>Pips SL</dt><dd>${trade.pips}</dd>` : ''}
        <dt>Resultado</dt><dd><span class="res-pill res-${(trade.result || '').toLowerCase()}">${trade.result || '–'}</span></dd>
        <dt>% P&L sistema</dt><dd><strong style="color:${resColor};">${fmtPct(trade.pnl_pct)}</strong></dd>
        <dt>Riesgo real</dt><dd>${fmtPct(risk)}</dd>
        <dt>% P&L real</dt><dd><strong style="color:${resColor};">${fmtPct(realPnl)}</strong></dd>
        <dt>Sensación</dt><dd>${sensHtml}</dd>
        <dt>Cuentas</dt><dd>${cuentasHtml}</dd>
        <dt>Links</dt><dd>${linksHtml}</dd>
        <dt>Reflexión</dt><dd>${reflexionHtml}</dd>
      </dl>
    `,
    actions: [
      { label: 'Cerrar', onClick: close => close() },
      {
        label: 'Editar',
        variant: 'primary',
        onClick: close => { close(); openEditTradeModal(trade); },
      },
    ],
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/"/g, '&quot;');
}
function capShort(c) {
  if (c >= 1000) return Math.round(c / 1000) + 'K';
  return String(c);
}

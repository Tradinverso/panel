import { formatDateShort } from '../utils/date-helpers.js';
import { fmtPct } from '../utils/number-format-es.js';
import { sortChrono } from '../utils/calculations.js';
import { openModal } from './modal.js';
import { openEditTradeModal } from './trade-edit-modal.js';
import { state } from '../state.js';
import { router } from '../router.js';

const STRAT_LABEL = { ZONAS: 'Zonas', LIQUIDEZ: 'Liquidez', NASDAQ: 'Nasdaq' };
const STRAT_CLS = { ZONAS: 'zonas', LIQUIDEZ: 'liquidez', NASDAQ: 'nasdaq' };

export function renderTradeTable(container, trades, opts = {}) {
  const { canDelete = false, emptyMsg = 'No hay trades.' } = opts;
  if (!trades.length) {
    container.innerHTML = `<div class="empty"><div>${emptyMsg}</div></div>`;
    return;
  }
  const sorted = sortChrono(trades);
  const wrap = document.createElement('div');
  wrap.className = 'trade-table-wrap';
  wrap.innerHTML = `
    <table class="trade-table">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Hora</th>
          <th>Estrategia</th>
          <th>Activo</th>
          <th>Setup</th>
          <th>Zona</th>
          <th>Entrada</th>
          <th>Sensación</th>
          <th>Cuentas</th>
          <th>Resultado</th>
          <th>Dur.</th>
          <th>% P&L</th>
          <th>Links</th>
          <th>📝</th>
          <th></th>
          ${canDelete ? '<th></th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${sorted.map(t => row(t, canDelete)).join('')}
      </tbody>
    </table>
  `;
  container.innerHTML = '';
  container.appendChild(wrap);

  // Reflexion modal
  wrap.querySelectorAll('.reflex-btn').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.id;
      const t = trades.find(x => x.id === id);
      if (!t) return;
      openModal({
        title: 'Reflexión del trade',
        meta: `${formatDateShort(t.date)} · ${STRAT_LABEL[t.sheet]} · ${t.pair || ''}`,
        body: t.reflexion || '<span style="color:var(--muted)">(sin reflexión registrada)</span>',
      });
    });
  });

  // Edit modal
  wrap.querySelectorAll('.edit-btn').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.id;
      const t = trades.find(x => x.id === id);
      if (!t) return;
      openEditTradeModal(t);
    });
  });

  if (canDelete) {
    wrap.querySelectorAll('.del-btn').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.dataset.id;
        openModal({
          title: 'Eliminar trade',
          body: '¿Seguro que quieres eliminar este trade? Esta acción no se puede deshacer.',
          actions: [
            { label: 'Cancelar', onClick: close => close() },
            { label: 'Eliminar', variant: 'danger', onClick: close => { state.remove(id); close(); } },
          ],
        });
      });
    });
  }
}

function row(t, canDelete) {
  const sens = t.sensacion ? `<span class="sens-pill" data-s="${t.sensacion}">${t.sensacion}</span>` : '<span style="color:var(--dim)">–</span>';
  const cuentas = (Array.isArray(t.accounts) && t.accounts.length)
    ? t.accounts.map(a => {
        const c = state.cuentas.find(x => x.id === a.accountId);
        const label = c ? (c.empresa.substring(0, 4).toUpperCase() + (c.capital >= 1000 ? Math.round(c.capital / 1000) + 'K' : '')) : '?';
        return `<span class="acc-badge" title="${c ? c.empresa + ' ' + (c.numero || '') + ' · ' + a.riskPct + '%' : 'Cuenta no encontrada'}">${label}</span>`;
      }).join(' ')
    : '<span style="color:var(--dim)">–</span>';
  const links = (t.url1 || t.url2)
    ? [
        t.url1 ? `<a class="url-icon" href="${escAttr(t.url1)}" target="_blank" rel="noopener" title="${t.sheet === 'ZONAS' ? 'TradingView' : 'HTF'}">${t.sheet === 'ZONAS' ? 'L' : 'H'}</a>` : '',
        t.url2 ? `<a class="url-icon" href="${escAttr(t.url2)}" target="_blank" rel="noopener" title="LTF">L</a>` : '',
      ].join('')
    : '<span style="color:var(--dim)">–</span>';
  const dur = t.dur != null ? t.dur + 'm' : '–';
  const pct = t.result === 'BE' ? '<span style="color:var(--orange)">0.00%</span>' : `<span style="color:${t.pnl_pct >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtPct(t.pnl_pct)}</span>`;
  const reflexBtn = (t.reflexion || '').trim()
    ? `<button class="reflex-btn" data-id="${t.id}" title="Ver reflexión">📝</button>`
    : '<span style="color:var(--dim)">–</span>';
  const editBtn = `<button class="edit-btn" data-id="${t.id}" title="Editar trade">✏️</button>`;
  const delTd = canDelete
    ? `<td><button class="btn ghost danger del-btn" data-id="${t.id}" style="padding:4px 8px;font-size:11px;">×</button></td>`
    : '';
  return `
    <tr>
      <td>${formatDateShort(t.date)}</td>
      <td>${t.open_str || '–'}</td>
      <td><span class="strat-pill ${STRAT_CLS[t.sheet]}">${STRAT_LABEL[t.sheet] || t.sheet}</span></td>
      <td>${t.pair || '–'}</td>
      <td>${t.setup || '–'}</td>
      <td>${t.zone || '–'}</td>
      <td>${t.entry || '–'}</td>
      <td>${sens}</td>
      <td>${cuentas}</td>
      <td><span class="res-pill res-${t.result.toLowerCase()}">${t.result}</span></td>
      <td>${dur}</td>
      <td>${pct}</td>
      <td>${links}</td>
      <td>${reflexBtn}</td>
      <td>${editBtn}</td>
      ${delTd}
    </tr>
  `;
}

function escAttr(s) { return String(s).replace(/"/g, '&quot;'); }

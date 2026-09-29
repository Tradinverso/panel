// Modal de RESET de una cuenta de prop firm: vuelve a empezar desde el capital
// nominal. Pide la fecha, lo que costó el reset (0 si fue gratis) y la fase en
// la que vuelve a empezar. La lógica vive en state.resetCuenta.

import { state } from '../state.js';
import { openModal } from './modal.js';
import { auth } from '../auth.js';
import { todayLocal } from '../utils/timezone.js';
import { fmtUsd } from '../utils/account-stats.js';

const FASE_LABEL = { challenge_1: 'Challenge 1ª fase', challenge_2: 'Challenge 2ª fase', fondeada: 'Fondeada' };

export function openResetCuentaModal(cuenta, onDone = () => {}) {
  if (!cuenta || cuenta.fase === 'propia') return;
  const today = todayLocal(auth.timezone());
  const fases = cuenta.numFases === 1
    ? ['challenge_1', 'fondeada']
    : ['challenge_1', 'challenge_2', 'fondeada'];
  if (!fases.includes(cuenta.fase)) fases.push(cuenta.fase);

  openModal({
    title: `↺ Reset · ${esc(cuenta.empresa)} ${esc(cuenta.numero || '')}`,
    body: `
      <div class="form" style="max-width:none;gap:14px;white-space:normal;">
        <div style="font-size:13px;line-height:1.55;color:var(--text);">
          La cuenta vuelve a empezar en <strong>${fmtUsd(cuenta.capital)}</strong> y queda <strong>activa</strong>.
          <div style="font-size:11px;color:var(--muted);font-family:var(--mono);margin-top:6px;">
            Los trades anteriores no se borran: dejan de contar para el equity y las estadísticas de esta cuenta. El reset queda en el historial.
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Coste del reset ($)</label>
            <input class="form-input" type="number" step="1" min="0" id="rs-cost" placeholder="0">
            <div style="font-size:10px;color:var(--muted);font-family:var(--mono);margin-top:4px;">Déjalo vacío o en 0 si fue gratis. Si costó, sale en Contabilidad.</div>
          </div>
          <div class="form-field">
            <label class="form-label">Fecha</label>
            <input class="form-input" type="date" id="rs-date" value="${today}" max="${today}">
          </div>
        </div>
        <div class="form-field">
          <label class="form-label">Vuelve a empezar en</label>
          <select class="form-input" id="rs-fase">
            ${fases.map(f => `<option value="${f}" ${f === cuenta.fase ? 'selected' : ''}>${FASE_LABEL[f]}${f === cuenta.fase ? ' (la actual)' : ''}</option>`).join('')}
          </select>
        </div>
        <div id="rs-err" class="auth-error" style="display:none;"></div>
      </div>
    `,
    actions: [
      { label: 'Cancelar', onClick: close => close() },
      {
        label: '↺ Resetear cuenta',
        variant: 'primary',
        onClick: close => {
          const root = document.getElementById('modal-root');
          const errEl = root.querySelector('#rs-err');
          const rawCost = root.querySelector('#rs-cost').value;
          const cost = rawCost === '' ? 0 : parseFloat(rawCost);
          const date = root.querySelector('#rs-date').value || today;
          const fase = root.querySelector('#rs-fase').value;
          if (isNaN(cost) || cost < 0) {
            errEl.textContent = '⚠ El coste no puede ser negativo.';
            errEl.style.display = 'flex';
            return;
          }
          state.resetCuenta(cuenta.id, { date, cost, fase, ts: date === today ? Date.now() : null });
          close();
          onDone();
        },
      },
    ],
  });
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

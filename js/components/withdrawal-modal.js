// Modal para registrar un retiro de una cuenta fondeada.

import { state } from '../state.js';
import { openModal } from './modal.js';

export function openWithdrawalModal(cuenta, onSaved = () => {}) {
  if (!cuenta) return;
  if (cuenta.fase !== 'fondeada') return;

  const today = new Date().toISOString().substring(0, 10);
  const data = { date: today, amount: '', note: '' };

  openModal({
    title: `Nuevo retiro · ${esc(cuenta.empresa)} ${esc(cuenta.numero || '')}`,
    body: `
      <div class="form" style="max-width:none;gap:14px;">
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Fecha <span class="required">*</span></label>
            <input class="form-input" type="date" id="w-date" value="${data.date}">
          </div>
          <div class="form-field">
            <label class="form-label">Importe ($) <span class="required">*</span></label>
            <input class="form-input" type="number" step="0.01" min="0.01" id="w-amount" placeholder="500.00">
          </div>
        </div>
        <div class="form-field">
          <label class="form-label">Nota</label>
          <input class="form-input" type="text" id="w-note" placeholder="Primer retiro mensual, fee retiro…">
        </div>
        <div id="w-err" class="auth-error" style="display:none;"></div>
      </div>
    `,
    actions: [
      { label: 'Cancelar', onClick: close => close() },
      {
        label: 'Registrar retiro',
        variant: 'primary',
        onClick: close => {
          const root = document.getElementById('modal-root');
          const errEl = root.querySelector('#w-err');
          const showErr = msg => { errEl.textContent = '⚠ ' + msg; errEl.style.display = 'flex'; };
          errEl.style.display = 'none';

          const date = root.querySelector('#w-date').value;
          const amount = parseFloat(root.querySelector('#w-amount').value);
          const note = root.querySelector('#w-note').value.trim();

          if (!date) return showErr('Falta la fecha.');
          if (!amount || amount <= 0) return showErr('El importe debe ser mayor que 0.');

          state.addWithdrawal(cuenta.id, { date, amount, note });
          close();
          if (typeof onSaved === 'function') onSaved();
        },
      },
    ],
  });

  setTimeout(() => {
    const root = document.getElementById('modal-root');
    if (root) root.querySelector('#w-amount')?.focus();
  }, 0);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

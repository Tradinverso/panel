// Modal para registrar una COMPRA / reintento de una cuenta (challenge fee,
// reset, reintento...). Si se pasa `cuenta`, registra sobre ella; si se pasa
// null, muestra un selector de cuenta.

import { state } from '../state.js';
import { openModal } from './modal.js';

const CONCEPTOS = [
  { value: 'challenge', label: 'Challenge / evaluación' },
  { value: 'reset', label: 'Reset' },
  { value: 'reintento', label: 'Reintento' },
  { value: 'suscripcion', label: 'Suscripción (mensual)' },
  { value: 'otro', label: 'Otro' },
];

// `existing` (opcional): compra ya guardada → el modal entra en modo edición
// (precarga los campos, oculta el selector de cuenta y actualiza en vez de crear).
export function openPurchaseModal(cuenta = null, onSaved = () => {}, existing = null) {
  const isEdit = !!existing;
  const today = new Date().toISOString().substring(0, 10);
  const cuentas = state.cuentas;
  if (!cuenta && !cuentas.length) return;

  const cuentaSelector = (cuenta || isEdit) ? '' : `
    <div class="form-field">
      <label class="form-label">Cuenta <span class="required">*</span></label>
      <select class="form-input" id="p-cuenta">
        ${cuentas.map(c => `<option value="${esc(c.id)}">${esc(c.empresa)} ${esc(c.numero || '')}</option>`).join('')}
      </select>
    </div>`;

  const dateVal = isEdit ? (existing.date || today) : today;
  const amountVal = isEdit ? existing.amount : '';
  const noteVal = isEdit ? (existing.note || '') : '';
  const conceptVal = isEdit ? existing.concept : '';

  openModal({
    title: isEdit
      ? 'Editar compra'
      : (cuenta ? `Registrar compra · ${esc(cuenta.empresa)} ${esc(cuenta.numero || '')}` : 'Registrar compra'),
    body: `
      <div class="form" style="max-width:none;gap:14px;">
        ${cuentaSelector}
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Fecha <span class="required">*</span></label>
            <input class="form-input" type="date" id="p-date" value="${esc(dateVal)}">
          </div>
          <div class="form-field">
            <label class="form-label">Importe pagado ($) <span class="required">*</span></label>
            <input class="form-input" type="number" step="0.01" min="0.01" id="p-amount" placeholder="99.00" value="${esc(amountVal)}">
          </div>
        </div>
        <div class="form-field">
          <label class="form-label">Concepto</label>
          <select class="form-input" id="p-concept">
            ${CONCEPTOS.map(c => `<option value="${c.value}" ${c.value === conceptVal ? 'selected' : ''}>${c.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label class="form-label">Nota</label>
          <input class="form-input" type="text" id="p-note" placeholder="Opcional…" value="${esc(noteVal)}">
        </div>
        <div id="p-err" class="auth-error" style="display:none;"></div>
      </div>
    `,
    actions: [
      { label: 'Cancelar', onClick: close => close() },
      {
        label: isEdit ? 'Guardar cambios' : 'Registrar compra',
        variant: 'primary',
        onClick: close => {
          const root = document.getElementById('modal-root');
          const errEl = root.querySelector('#p-err');
          const showErr = msg => { errEl.textContent = '⚠ ' + msg; errEl.style.display = 'flex'; };
          errEl.style.display = 'none';

          const cuentaId = isEdit ? cuenta.id : (cuenta ? cuenta.id : root.querySelector('#p-cuenta').value);
          const date = root.querySelector('#p-date').value;
          const amount = parseFloat(root.querySelector('#p-amount').value);
          const concept = root.querySelector('#p-concept').value;
          const note = root.querySelector('#p-note').value.trim();

          if (!cuentaId) return showErr('Selecciona una cuenta.');
          if (!date) return showErr('Falta la fecha.');
          if (!amount || amount <= 0) return showErr('El importe debe ser mayor que 0.');

          if (isEdit) state.updatePurchase(cuentaId, existing.id, { date, amount, concept, note });
          else state.addPurchase(cuentaId, { date, amount, concept, note });
          close();
          if (typeof onSaved === 'function') onSaved();
        },
      },
    ],
  });

  setTimeout(() => {
    const root = document.getElementById('modal-root');
    root?.querySelector('#p-amount')?.focus();
  }, 0);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

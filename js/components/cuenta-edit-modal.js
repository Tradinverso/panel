// Modal para crear o editar una cuenta fondeada / challenge.

import { state } from '../state.js';
import { renderPills } from './pills.js';
import { openModal, closeModal } from './modal.js';
import { tradesForAccount, totalWithdrawn } from '../utils/account-stats.js';

const FASE_OPTIONS = [
  { value: 'challenge_1', label: 'Challenge 1ª fase' },
  { value: 'challenge_2', label: 'Challenge 2ª fase' },
  { value: 'fondeada',    label: 'Fondeada' },
];

const STATUS_OPTIONS = [
  { value: 'activa',  label: 'Activa' },
  { value: 'pausada', label: 'Pausada' },
  { value: 'pasada',  label: 'Pasada' },
  { value: 'perdida', label: 'Perdida' },
];

const TIPO_OPTIONS = ['CFD', 'Futuros'];

export function openCuentaEditModal(cuenta = null, onSaved = () => {}) {
  const isNew = !cuenta;
  // Si es edición y la cuenta tiene trades asignados, advertir al cambiar capital
  const tradesUsing = cuenta ? tradesForAccount(cuenta, state.trades).length : 0;
  const data = {
    empresa: cuenta?.empresa || '',
    tipo: cuenta?.tipo || 'CFD',
    numero: cuenta?.numero || '',
    capital: cuenta?.capital != null ? String(cuenta.capital) : '',
    cost: cuenta?.cost != null ? String(cuenta.cost) : '',
    defaultRiskPct: cuenta?.defaultRiskPct != null ? String(cuenta.defaultRiskPct) : '1.0',
    fase: cuenta?.fase || 'challenge_1',
    status: cuenta?.status || 'activa',
    notes: cuenta?.notes || '',
  };
  const originalCapital = cuenta?.capital;

  openModal({
    title: isNew ? 'Nueva cuenta' : `Editar cuenta · ${cuenta.empresa} ${cuenta.numero}`,
    body: `
      <div class="form" style="max-width:none;gap:14px;">
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Empresa <span class="required">*</span></label>
            <input class="form-input" type="text" id="ce-empresa" value="${esc(data.empresa)}" placeholder="FTMO, MyForexFunds, My5ers…">
          </div>
          <div class="form-field">
            <label class="form-label">Tipo <span class="required">*</span></label>
            <div data-field="tipo"></div>
          </div>
        </div>

        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Nº de cuenta</label>
            <input class="form-input" type="text" id="ce-numero" value="${esc(data.numero)}" placeholder="1234567">
          </div>
          <div class="form-field">
            <label class="form-label">Capital ($) <span class="required">*</span></label>
            <input class="form-input" type="number" step="100" id="ce-capital" value="${esc(data.capital)}" placeholder="50000">
            ${tradesUsing > 0 ? `
              <div id="capital-warn" style="display:none;font-size:11px;color:var(--orange);font-family:var(--mono);margin-top:6px;line-height:1.5;background:var(--orange-bg);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,165,2,0.3);">
                ⚠ Esta cuenta tiene <strong>${tradesUsing} trade${tradesUsing !== 1 ? 's' : ''}</strong> asignados. Si cambias el capital, todos los <strong>$ P&L históricos se recalcularán</strong> con el nuevo valor. Para escalado/upgrade es mejor crear una cuenta nueva.
              </div>
            ` : ''}
          </div>
        </div>

        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Coste de la cuenta ($)</label>
            <input class="form-input" type="number" step="1" id="ce-cost" value="${esc(data.cost)}" placeholder="99 (challenge fee, resets…)">
          </div>
          <div class="form-field">
            <label class="form-label">Riesgo por defecto (%)</label>
            <input class="form-input" type="number" step="0.1" id="ce-risk" value="${esc(data.defaultRiskPct)}" placeholder="1.0">
          </div>
        </div>

        <div class="form-field">
          <label class="form-label">Fase <span class="required">*</span></label>
          <div data-field="fase"></div>
        </div>

        <div class="form-field">
          <label class="form-label">Estado <span class="required">*</span></label>
          <div data-field="status"></div>
        </div>

        <div class="form-field">
          <label class="form-label">Notas</label>
          <textarea class="form-textarea" id="ce-notes" placeholder="Reglas particulares, fecha de challenge, etc.">${esc(data.notes)}</textarea>
        </div>

        <div id="ce-err" class="auth-error" style="display:none;"></div>
      </div>
    `,
    actions: [
      { label: 'Cancelar', onClick: close => close() },
      {
        label: isNew ? 'Crear cuenta' : 'Guardar cambios',
        variant: 'primary',
        onClick: close => doSave(cuenta, data, close, onSaved),
      },
    ],
  });

  // Pills tras render
  setTimeout(() => {
    const root = document.getElementById('modal-root');
    if (!root) return;
    renderPills(root.querySelector('[data-field="tipo"]'), {
      name: 'tipo', options: TIPO_OPTIONS, value: data.tipo,
      onChange: v => data.tipo = v,
    });
    renderPills(root.querySelector('[data-field="fase"]'), {
      name: 'fase',
      options: FASE_OPTIONS,
      value: data.fase,
      onChange: v => data.fase = v,
    });
    renderPills(root.querySelector('[data-field="status"]'), {
      name: 'status',
      options: STATUS_OPTIONS,
      value: data.status,
      onChange: v => data.status = v,
    });
    // Inputs sync
    root.querySelector('#ce-empresa').addEventListener('input', e => data.empresa = e.target.value);
    root.querySelector('#ce-numero').addEventListener('input', e => data.numero = e.target.value);
    root.querySelector('#ce-cost').addEventListener('input', e => data.cost = e.target.value);
    root.querySelector('#ce-risk').addEventListener('input', e => data.defaultRiskPct = e.target.value);
    root.querySelector('#ce-notes').addEventListener('input', e => data.notes = e.target.value);

    // Capital con aviso si ha cambiado y hay trades
    const capInput = root.querySelector('#ce-capital');
    const capWarn = root.querySelector('#capital-warn');
    capInput.addEventListener('input', e => {
      data.capital = e.target.value;
      if (capWarn) {
        const newCap = parseFloat(data.capital);
        const changed = !isNaN(newCap) && newCap !== originalCapital;
        capWarn.style.display = changed ? 'block' : 'none';
      }
    });
  }, 0);
}

function doSave(cuenta, data, close, onSaved) {
  const root = document.getElementById('modal-root');
  const errEl = root.querySelector('#ce-err');
  const showErr = msg => { errEl.textContent = '⚠ ' + msg; errEl.style.display = 'flex'; };
  errEl.style.display = 'none';

  const empresa = String(data.empresa || '').trim();
  if (!empresa) return showErr('La empresa es obligatoria.');
  const capital = parseFloat(data.capital);
  if (!capital || capital <= 0) return showErr('El capital debe ser mayor que 0.');
  const cost = data.cost === '' ? 0 : parseFloat(data.cost);
  if (isNaN(cost) || cost < 0) return showErr('El coste no puede ser negativo.');
  const risk = parseFloat(data.defaultRiskPct);
  if (!risk || risk <= 0 || risk > 100) return showErr('El riesgo debe estar entre 0 y 100.');

  const payload = {
    ...(cuenta || {}),
    empresa,
    tipo: data.tipo || 'CFD',
    numero: String(data.numero || '').trim(),
    capital,
    cost,
    defaultRiskPct: risk,
    fase: data.fase || 'challenge_1',
    status: data.status || 'activa',
    notes: String(data.notes || '').trim(),
  };

  let saved;
  if (cuenta) {
    saved = state.updateCuenta(cuenta.id, payload);
  } else {
    saved = state.addCuenta(payload);
  }
  close();
  if (typeof onSaved === 'function') onSaved(saved);
}

export function confirmDeleteCuenta(cuenta, onDeleted = () => {}) {
  const tradesUsing = tradesForAccount(cuenta, state.trades).length;
  const withdrawalsCount = (cuenta.withdrawals || []).length;
  const withdrawalsTotal = totalWithdrawn(cuenta);

  const consequences = [];
  if (tradesUsing > 0) {
    consequences.push(`<strong>${tradesUsing} trade${tradesUsing !== 1 ? 's' : ''}</strong> tienen esta cuenta asignada — los trades se mantendrán en el sistema, solo se quitará la asignación.`);
  }
  if (withdrawalsCount > 0) {
    consequences.push(`<strong>${withdrawalsCount} retiro${withdrawalsCount !== 1 ? 's' : ''}</strong> registrados (total $${withdrawalsTotal.toFixed(2)}) — se borrarán con la cuenta.`);
  }

  openModal({
    title: 'Borrar cuenta',
    body: `
      <p>Vas a borrar la cuenta <strong>${esc(cuenta.empresa)} ${esc(cuenta.numero || '')}</strong> ($${cuenta.capital.toLocaleString('en-US')}).</p>
      ${consequences.length ? `<ul style="margin:14px 0;padding-left:20px;line-height:1.8;font-size:13px;">${consequences.map(c => `<li>${c}</li>`).join('')}</ul>` : '<p style="font-size:12px;color:var(--muted);margin-top:10px;">Esta cuenta no tiene trades ni retiros asignados.</p>'}
      <p style="font-size:12px;color:var(--muted);margin-top:10px;">Esta acción no se puede deshacer.</p>
    `,
    actions: [
      { label: 'Cancelar', onClick: close => close() },
      {
        label: 'Sí, borrar cuenta',
        variant: 'danger',
        onClick: close => {
          state.deleteCuenta(cuenta.id);
          close();
          if (typeof onDeleted === 'function') onDeleted();
        },
      },
    ],
  });
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

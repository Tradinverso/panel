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
    initialBalance: cuenta?.initialBalance != null ? String(cuenta.initialBalance) : '',
    cost: cuenta?.cost != null ? String(cuenta.cost) : '',
    targetUsd: cuenta?.targetUsd != null && cuenta.targetUsd > 0 ? String(cuenta.targetUsd) : '',
    maxDdUsd: cuenta?.maxDdUsd != null && cuenta.maxDdUsd > 0 ? String(cuenta.maxDdUsd) : '',
    fase: cuenta?.fase || 'challenge_1',
    status: cuenta?.status || 'activa',
    notes: cuenta?.notes || '',
  };
  const originalCapital = cuenta?.capital;
  // Saldo inicial fue editado manualmente? (true si edición existente o null/!= capital)
  let initialBalanceManual = !isNew && cuenta?.initialBalance != null && cuenta.initialBalance !== cuenta.capital;

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
            <label class="form-label">Capital nominal ($) <span class="required">*</span></label>
            <input class="form-input" type="number" step="100" id="ce-capital" value="${esc(data.capital)}" placeholder="50000">
            <div style="font-size:10px;color:var(--muted);font-family:var(--mono);margin-top:4px;">El tamaño que dice el broker (FTMO 100K, MFF 50K…). Usado para sizing de trades.</div>
            ${tradesUsing > 0 ? `
              <div id="capital-warn" style="display:none;font-size:11px;color:var(--orange);font-family:var(--mono);margin-top:6px;line-height:1.5;background:var(--orange-bg);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,165,2,0.3);">
                ⚠ Esta cuenta tiene <strong>${tradesUsing} trade${tradesUsing !== 1 ? 's' : ''}</strong> asignados. Si cambias el capital nominal, todos los <strong>$ P&L históricos se recalcularán</strong>.
              </div>
            ` : ''}
          </div>
        </div>

        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Saldo actual ($)</label>
            <input class="form-input" type="number" step="0.01" id="ce-initbal" value="${esc(data.initialBalance)}" placeholder="${esc(data.capital) || 'igual al capital'}">
            <div style="font-size:11px;color:var(--muted);font-family:var(--mono);margin-top:4px;line-height:1.5;">
              Lo que tiene la cuenta AHORA en el broker. Editable cuando quieras: si el broker no coincide con los trades calculados, ajústalo aquí. Por defecto = capital nominal.
            </div>
          </div>
          <div class="form-field"></div>
        </div>

        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Target ($)</label>
            <input class="form-input" type="number" step="100" id="ce-target" value="${esc(data.targetUsd)}" placeholder="ej. 5000">
            <div style="font-size:11px;color:var(--muted);font-family:var(--mono);margin-top:4px;line-height:1.5;">
              Profit en $ que necesitas para pasar el challenge (o weekly target en fondeada). Opcional.
            </div>
          </div>
          <div class="form-field">
            <label class="form-label">DD máximo permitido por la firma ($)</label>
            <input class="form-input" type="number" step="100" id="ce-maxdd" value="${esc(data.maxDdUsd)}" placeholder="ej. 8000">
            <div style="font-size:11px;color:var(--muted);font-family:var(--mono);margin-top:4px;line-height:1.5;">
              Límite fijo en $ que define la prop firm (ej. en CFD un 8% sobre el capital nominal, en futuros el DD trailing que te marquen). Opcional.
            </div>
          </div>
        </div>

        <div class="form-field">
          <label class="form-label">Coste de la cuenta ($)</label>
          <input class="form-input" type="number" step="1" id="ce-cost" value="${esc(data.cost)}" placeholder="99 (challenge fee, resets…)">
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
    root.querySelector('#ce-notes').addEventListener('input', e => data.notes = e.target.value);

    // Capital con aviso si ha cambiado y hay trades, y auto-sync de saldo inicial
    const capInput = root.querySelector('#ce-capital');
    const capWarn = root.querySelector('#capital-warn');
    const initBalInput = root.querySelector('#ce-initbal');
    capInput.addEventListener('input', e => {
      data.capital = e.target.value;
      if (capWarn) {
        const newCap = parseFloat(data.capital);
        const changed = !isNaN(newCap) && newCap !== originalCapital;
        capWarn.style.display = changed ? 'block' : 'none';
      }
      // Si el usuario no ha tocado manualmente saldo inicial, lo sincronizamos
      if (!initialBalanceManual && initBalInput) {
        initBalInput.placeholder = data.capital || 'igual al capital';
      }
    });
    initBalInput.addEventListener('input', e => {
      data.initialBalance = e.target.value;
      initialBalanceManual = e.target.value !== '';
    });

    const targetInput = root.querySelector('#ce-target');
    if (targetInput) targetInput.addEventListener('input', e => data.targetUsd = e.target.value);
    const maxDdInput = root.querySelector('#ce-maxdd');
    if (maxDdInput) maxDdInput.addEventListener('input', e => data.maxDdUsd = e.target.value);
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
  // initialBalance opcional: si vacío, usa capital
  const initialBalance = data.initialBalance === '' || data.initialBalance == null
    ? capital
    : parseFloat(data.initialBalance);
  if (isNaN(initialBalance) || initialBalance < 0) return showErr('El saldo inicial no puede ser negativo.');
  const cost = data.cost === '' ? 0 : parseFloat(data.cost);
  if (isNaN(cost) || cost < 0) return showErr('El coste no puede ser negativo.');
  const targetUsd = data.targetUsd === '' || data.targetUsd == null ? 0 : parseFloat(data.targetUsd);
  if (isNaN(targetUsd) || targetUsd < 0) return showErr('El target no puede ser negativo.');
  const maxDdUsd = data.maxDdUsd === '' || data.maxDdUsd == null ? 0 : parseFloat(data.maxDdUsd);
  if (isNaN(maxDdUsd) || maxDdUsd < 0) return showErr('El max DD no puede ser negativo.');

  const payload = {
    ...(cuenta || {}),
    empresa,
    tipo: data.tipo || 'CFD',
    numero: String(data.numero || '').trim(),
    capital,
    initialBalance,
    cost,
    targetUsd,
    maxDdUsd,
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

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

const FASES_OPTIONS = [
  { value: '1', label: '1 fase' },
  { value: '2', label: '2 fases' },
];

export function openCuentaEditModal(cuenta = null, onSaved = () => {}) {
  const isNew = !cuenta;
  // Si es edición y la cuenta tiene trades asignados, advertir al cambiar capital
  const tradesUsing = cuenta ? tradesForAccount(cuenta, state.trades).length : 0;
  const today = new Date().toISOString().substring(0, 10);
  // Primera compra (coste inicial) para poder editar su fecha/importe al editar la
  // cuenta. Puede ser real (purchases[0]) o legacy (el campo `cost` sintetizado).
  const initialPurchase = cuenta
    ? (cuenta.purchases && cuenta.purchases.length
        ? cuenta.purchases[0]
        : (cuenta.cost > 0
            ? { id: 'legacy-' + cuenta.id, date: new Date(cuenta.createdAt || Date.now()).toISOString().substring(0, 10), amount: cuenta.cost }
            : null))
    : null;
  const data = {
    empresa: cuenta?.empresa || '',
    tipo: cuenta?.tipo || 'CFD',
    numero: cuenta?.numero || '',
    capital: cuenta?.capital != null ? String(cuenta.capital) : '',
    initialBalance: cuenta?.initialBalance != null ? String(cuenta.initialBalance) : '',
    cost: initialPurchase ? String(initialPurchase.amount) : (cuenta?.cost != null && cuenta.cost > 0 ? String(cuenta.cost) : ''),
    costDate: initialPurchase ? (initialPurchase.date || today) : today,
    targetPct: cuenta?.targetPct > 0
      ? String(cuenta.targetPct)
      : (cuenta?.targetUsd > 0 && cuenta?.capital ? String(+(cuenta.targetUsd / cuenta.capital * 100).toFixed(2)) : ''),
    maxDdUsd: cuenta?.maxDdUsd != null && cuenta.maxDdUsd > 0 ? String(cuenta.maxDdUsd) : '',
    fase: cuenta?.fase || 'challenge_1',
    status: cuenta?.status || 'activa',
    numFases: cuenta?.numFases === 1 ? 1 : 2,
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
            ${tradesUsing > 0 ? `
              <div id="capital-warn" style="display:none;font-size:11px;color:var(--orange);font-family:var(--mono);margin-top:6px;line-height:1.5;background:var(--orange-bg);padding:8px 10px;border-radius:6px;border:1px solid rgba(255,165,2,0.3);">
                ⚠ Esta cuenta tiene <strong>${tradesUsing} trade${tradesUsing !== 1 ? 's' : ''}</strong> asignados. Si cambias el capital nominal, todos los <strong>$ P&L históricos se recalcularán</strong>.
              </div>
            ` : ''}
          </div>
        </div>

        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Fases del challenge <span class="required">*</span></label>
            <div data-field="fases"></div>
          </div>
          <div class="form-field">
            <label class="form-label">${isNew ? 'Coste pagado ($)' : 'Primera compra · coste ($)'}</label>
            <input class="form-input" type="number" step="1" id="ce-cost" value="${esc(data.cost)}" placeholder="99">
            <div style="font-size:10px;color:var(--muted);font-family:var(--mono);margin-top:4px;">${isNew ? 'Se registra como la primera compra de la cuenta (Contabilidad).' : 'Edita el coste inicial (primera compra).'}</div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">${isNew ? 'Fecha del pago' : 'Fecha de la primera compra'}</label>
            <input class="form-input" type="date" id="ce-cost-date" value="${esc(data.costDate)}">
            <div style="font-size:10px;color:var(--muted);font-family:var(--mono);margin-top:4px;">${isNew ? 'Fecha de esa primera compra. Editable luego en Contabilidad → Compras.' : 'Cambia la fecha en la que compraste la cuenta.'}</div>
          </div>
          <div class="form-field"></div>
        </div>

        <details class="ce-advanced">
          <summary>Opciones avanzadas</summary>
          <div class="form-field" style="margin-top:12px;">
            <label class="form-label">Saldo actual ($)</label>
            <input class="form-input" type="number" step="0.01" id="ce-initbal" value="${esc(data.initialBalance)}" placeholder="${esc(data.capital) || 'igual al capital'}">
            <div style="font-size:11px;color:var(--muted);font-family:var(--mono);margin-top:4px;line-height:1.5;">Lo que tiene la cuenta AHORA en el broker. Por defecto = capital nominal.</div>
          </div>
          <div class="form-row">
            <div class="form-field">
              <label class="form-label">Objetivo (% del capital)</label>
              <input class="form-input" type="number" step="0.5" id="ce-targetpct" value="${esc(data.targetPct)}" placeholder="ej. 8 = 8%">
              <div style="font-size:10px;color:var(--muted);font-family:var(--mono);margin-top:4px;">Profit para superar fase. Se calcula sobre el capital.</div>
            </div>
            <div class="form-field">
              <label class="form-label">DD máximo firma ($)</label>
              <input class="form-input" type="number" step="100" id="ce-maxdd" value="${esc(data.maxDdUsd)}" placeholder="ej. 8000">
            </div>
          </div>
          ${isNew ? '' : `
          <div class="form-field">
            <label class="form-label">Fase actual</label>
            <div data-field="fase"></div>
          </div>
          <div class="form-field">
            <label class="form-label">Estado</label>
            <div data-field="status"></div>
          </div>`}
          <div class="form-field">
            <label class="form-label">Notas</label>
            <textarea class="form-textarea" id="ce-notes" placeholder="Reglas particulares, fecha de challenge, etc.">${esc(data.notes)}</textarea>
          </div>
        </details>

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
    renderPills(root.querySelector('[data-field="fases"]'), {
      name: 'fases', options: FASES_OPTIONS, value: String(data.numFases),
      onChange: v => data.numFases = +v,
    });
    const faseEl = root.querySelector('[data-field="fase"]');
    if (faseEl) renderPills(faseEl, {
      name: 'fase', options: FASE_OPTIONS, value: data.fase,
      onChange: v => data.fase = v,
    });
    const statusEl = root.querySelector('[data-field="status"]');
    if (statusEl) renderPills(statusEl, {
      name: 'status', options: STATUS_OPTIONS, value: data.status,
      onChange: v => data.status = v,
    });
    // Inputs sync
    root.querySelector('#ce-empresa').addEventListener('input', e => data.empresa = e.target.value);
    root.querySelector('#ce-numero').addEventListener('input', e => data.numero = e.target.value);
    root.querySelector('#ce-cost').addEventListener('input', e => data.cost = e.target.value);
    root.querySelector('#ce-cost-date')?.addEventListener('input', e => data.costDate = e.target.value);
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

    const targetInput = root.querySelector('#ce-targetpct');
    if (targetInput) targetInput.addEventListener('input', e => data.targetPct = e.target.value);
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
  const targetPct = data.targetPct === '' || data.targetPct == null ? 0 : parseFloat(data.targetPct);
  if (isNaN(targetPct) || targetPct < 0) return showErr('El objetivo (%) no puede ser negativo.');
  const targetUsd = targetPct > 0 ? Math.round(capital * targetPct / 100) : 0;
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
    targetPct,
    maxDdUsd,
    fase: data.fase || 'challenge_1',
    status: data.status || 'activa',
    numFases: data.numFases === 1 ? 1 : 2,
    notes: String(data.notes || '').trim(),
  };

  let saved;
  if (cuenta) {
    // La primera compra (coste inicial) puede editarse aquí. El coste vive en
    // purchases[], no en el campo legacy `cost`. Calculamos la primera compra
    // ANTES de updateCuenta (que pone cost a 0).
    const first = (cuenta.purchases && cuenta.purchases.length)
      ? cuenta.purchases[0]
      : (cuenta.cost > 0 ? { id: 'legacy-' + cuenta.id } : null);
    payload.cost = 0;
    saved = state.updateCuenta(cuenta.id, payload);
    if (cost > 0) {
      if (first) state.updatePurchase(cuenta.id, first.id, { date: data.costDate, amount: cost });
      else state.addPurchase(cuenta.id, { date: data.costDate, amount: cost, concept: 'challenge', note: 'Coste inicial' });
    }
  } else {
    // Coste inicial → primera compra (no como campo `cost` legacy).
    if (cost > 0) {
      payload.purchases = [{
        date: data.costDate || new Date().toISOString().substring(0, 10),
        amount: cost, concept: 'challenge', note: 'Coste inicial',
      }];
      payload.cost = 0;
    }
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

// Modal para registrar un retiro de una cuenta fondeada.
//
// Campos:
//   - Fecha
//   - Importe bruto ($): lo que descuenta el broker del equity de la cuenta
//   - Comisión (%): porcentaje del bruto que se queda el broker (opcional)
//   - Nota
//
// Internamente se guarda `commission` ya en $ (no en %). El % es solo input UX.
// Resumen en vivo muestra "Comisión: $X · Neto a tu bolsillo: $Y".

import { state } from '../state.js';
import { openModal } from './modal.js';

export function openWithdrawalModal(cuenta, onSaved = () => {}) {
  if (!cuenta) return;
  if (cuenta.fase !== 'fondeada') return;

  const today = new Date().toISOString().substring(0, 10);
  const data = { date: today, amount: '', commissionPct: '', note: '' };

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
            <label class="form-label">Importe bruto ($) <span class="required">*</span></label>
            <input class="form-input" type="number" step="0.01" min="0.01" id="w-amount" placeholder="500.00">
            <div style="font-size:10px;color:var(--muted);font-family:var(--mono);margin-top:4px;">Se descuenta del equity de la cuenta.</div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Comisión broker (%)</label>
            <input class="form-input" type="number" step="0.1" min="0" max="100" id="w-comm-pct" placeholder="10 = 10% del bruto">
            <div style="font-size:10px;color:var(--muted);font-family:var(--mono);margin-top:4px;">Opcional. Lo que se queda el broker (no llega a tu bolsillo).</div>
          </div>
          <div class="form-field">
            <label class="form-label">Resumen</label>
            <div id="w-summary" style="padding:8px 10px;background:var(--card2);border:1px solid var(--border);border-radius:6px;font-family:var(--mono);font-size:12px;line-height:1.6;color:var(--muted);">
              Introduce el importe…
            </div>
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
          const commPctRaw = root.querySelector('#w-comm-pct').value;
          const commPct = commPctRaw === '' ? 0 : parseFloat(commPctRaw);
          const note = root.querySelector('#w-note').value.trim();

          if (!date) return showErr('Falta la fecha.');
          if (!amount || amount <= 0) return showErr('El importe debe ser mayor que 0.');
          if (isNaN(commPct) || commPct < 0 || commPct > 100) return showErr('La comisión debe estar entre 0 y 100.');

          const commissionUsd = +(amount * commPct / 100).toFixed(2);
          state.addWithdrawal(cuenta.id, { date, amount, commission: commissionUsd, note });
          close();
          if (typeof onSaved === 'function') onSaved();
        },
      },
    ],
  });

  setTimeout(() => {
    const root = document.getElementById('modal-root');
    if (!root) return;
    const amountInp = root.querySelector('#w-amount');
    const commInp = root.querySelector('#w-comm-pct');
    const summaryEl = root.querySelector('#w-summary');

    function updateSummary() {
      const a = parseFloat(amountInp.value);
      const p = parseFloat(commInp.value);
      if (!isFinite(a) || a <= 0) {
        summaryEl.textContent = 'Introduce el importe…';
        summaryEl.style.color = 'var(--muted)';
        return;
      }
      const commPct = isFinite(p) && p >= 0 ? p : 0;
      const commUsd = a * commPct / 100;
      const net = a - commUsd;
      summaryEl.innerHTML = `
        <div>Comisión: <strong style="color:var(--orange);">$${commUsd.toFixed(2)}</strong></div>
        <div>Neto a tu bolsillo: <strong style="color:var(--green);">$${net.toFixed(2)}</strong></div>
      `;
      summaryEl.style.color = 'var(--text)';
    }
    amountInp.addEventListener('input', updateSummary);
    commInp.addEventListener('input', updateSummary);
    amountInp.focus();
  }, 0);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

import { state } from '../state.js';
import { renderPills } from '../components/pills.js';
import { openModal, closeModal } from '../components/modal.js';
import { renderCuentaAssign } from '../components/cuenta-assign.js';
import { router } from '../router.js';
import { TODAS as SENS_OPTIONS } from '../utils/sensaciones.js';
import { parseTime, durationMinutes, formatDateEs } from '../utils/date-helpers.js';
import { fmtPct } from '../utils/number-format-es.js';
import { STRATEGIES as STRAT_META } from '../utils/strategy-config.js';

export function newTradeView(container) {
  let sheet = 'ZONAS';
  let formData = init(sheet);

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Nuevo trade</h1>
        <div class="sub">Selecciona la estrategia y rellena el formulario</div>
      </div>
    </div>
    <div class="strat-chooser pill-group" id="stratChooser"></div>
    <div class="card" id="formWrap"></div>
  `;

  const stratC = container.querySelector('#stratChooser');
  renderPills(stratC, {
    name: 'sheet',
    options: ['ZONAS', 'LIQUIDEZ', 'NASDAQ'],
    value: sheet,
    onChange: v => { sheet = v; formData = init(sheet); rerender(); },
  });

  const formWrap = container.querySelector('#formWrap');
  function rerender() { renderForm(formWrap, sheet, formData, () => formData); }
  rerender();
}

function init(sheet) {
  const today = new Date().toISOString().substring(0, 10);
  const meta = STRAT_META[sheet];
  return {
    sheet,
    date: today,
    open_str: '',
    close_str: '',
    pair: meta.pairs.length === 1 ? meta.pairs[0] : '',
    setup: '',
    zone: '',
    // Si la estrategia tiene una sola entrada posible, autoseleccionar.
    // (ej. ZONAS con 'STOP LIMIT' como única opción)
    entry: meta.entries && meta.entries.length === 1 ? meta.entries[0] : '',
    rr: '',
    pips: '',
    pnl_pct: '',
    risk_real_pct: '1',
    sensacion: '',
    url1: '',
    url2: '',
    reflexion: '',
    accounts: [],
  };
}

function renderForm(wrap, sheet, data, getter) {
  const meta = STRAT_META[sheet];
  wrap.innerHTML = `
    <div class="form">
      <div class="form-row">
        ${!meta.pairFixed ? `<div class="form-field">
          <label class="form-label">Par <span class="required">*</span></label>
          <div data-field="pair"></div>
        </div>` : `<div class="form-field">
          <label class="form-label">Par</label>
          <div class="form-input" style="background:var(--card);">${meta.pairs[0]}</div>
        </div>`}
        <div class="form-field">
          <label class="form-label">Setup <span class="required">*</span></label>
          <div data-field="setup"></div>
        </div>
      </div>

      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Zona <span class="required">*</span></label>
          <div data-field="zone"></div>
        </div>
        ${meta.showEntry ? `<div class="form-field">
          <label class="form-label">Tipo de entrada <span class="required">*</span></label>
          <div data-field="entry"></div>
        </div>` : ''}
      </div>

      <div class="form-row cols-3">
        <div class="form-field">
          <label class="form-label">Fecha <span class="required">*</span></label>
          <input class="form-input" type="date" data-input="date" value="${data.date}">
        </div>
        <div class="form-field">
          <label class="form-label">Hora apertura <span class="required">*</span></label>
          <input class="form-input" type="time" data-input="open_str" value="${data.open_str}">
        </div>
        <div class="form-field">
          <label class="form-label">Hora cierre</label>
          <input class="form-input" type="time" data-input="close_str" value="${data.close_str}">
        </div>
      </div>

      <div class="form-row cols-3">
        <div class="form-field">
          <label class="form-label">% P&L sistema <span class="required">*</span></label>
          <input class="form-input" type="number" step="0.01" data-input="pnl_pct" value="${data.pnl_pct}" placeholder="2.00 = TP / -1.00 = SL">
        </div>
        <div class="form-field">
          <label class="form-label">Riesgo real (%)</label>
          <input class="form-input" type="number" step="0.01" min="0" data-input="risk_real_pct" value="${data.risk_real_pct}" placeholder="1.00">
        </div>
        ${meta.showRR ? `<div class="form-field">
          <label class="form-label">RR</label>
          <input class="form-input" type="number" step="0.1" data-input="rr" value="${data.rr}" placeholder="2">
        </div>` : ''}
        ${meta.showPip ? `<div class="form-field">
          <label class="form-label">${sheet === 'ZONAS' ? 'Pips SL' : 'Pip SL'}</label>
          <input class="form-input" type="number" step="0.1" data-input="pips" value="${data.pips}" placeholder="5.0">
        </div>` : ''}
      </div>

      <div class="form-field">
        <label class="form-label">Sensación <span class="required">*</span></label>
        <div data-field="sensacion"></div>
      </div>

      ${meta.links.map(l => `
        <div class="form-field">
          <label class="form-label">${l.label}</label>
          <input class="form-input" type="url" data-input="${l.key}" value="${data[l.key] || ''}" placeholder="https://www.tradingview.com/x/...">
        </div>
      `).join('')}

      <div class="form-field">
        <label class="form-label">Reflexión</label>
        <textarea class="form-textarea" data-input="reflexion" placeholder="Notas sobre el trade, lo que hiciste bien o mal, qué aprender...">${data.reflexion}</textarea>
      </div>

      <div class="form-field">
        <label class="form-label">Asignación a cuentas (opcional)</label>
        <div id="cuentaAssignBox"></div>
      </div>

      <div class="form-actions">
        <button class="btn" type="button" id="cancelBtn">Cancelar</button>
        <button class="btn primary" type="button" id="saveBtn">Guardar trade</button>
      </div>
    </div>
  `;

  // Pills wiring
  if (!meta.pairFixed) {
    renderPills(wrap.querySelector('[data-field="pair"]'), {
      name: 'pair', options: meta.pairs, value: data.pair,
      variant: STRAT_META[sheet].pairFixed ? '' : '',
      onChange: v => data.pair = v,
    });
  } else {
    data.pair = meta.pairs[0];
  }
  renderPills(wrap.querySelector('[data-field="setup"]'), {
    name: 'setup', options: ['LONG', 'SHORT'], value: data.setup,
    onChange: v => data.setup = v,
  });
  renderPills(wrap.querySelector('[data-field="zone"]'), {
    name: 'zone', options: meta.zones, value: data.zone,
    onChange: v => data.zone = v,
  });
  if (meta.showEntry) {
    renderPills(wrap.querySelector('[data-field="entry"]'), {
      name: 'entry', options: meta.entries, value: data.entry,
      onChange: v => data.entry = v,
    });
  }
  renderPills(wrap.querySelector('[data-field="sensacion"]'), {
    name: 'sensacion', options: SENS_OPTIONS, value: data.sensacion,
    variant: 'sens',
    onChange: v => data.sensacion = v,
  });

  // Inputs
  wrap.querySelectorAll('[data-input]').forEach(el => {
    el.addEventListener('input', () => {
      const k = el.dataset.input;
      data[k] = el.value;
    });
  });

  // Asignación a cuentas
  const assignBox = wrap.querySelector('#cuentaAssignBox');
  if (assignBox) {
    renderCuentaAssign(assignBox, data.accounts || [], (accs) => {
      data.accounts = accs;
    }, {
      getDefaultRisk: () => {
        const n = parseFloat(data.risk_real_pct);
        return isFinite(n) && n > 0 ? n : 1;
      },
    });
  }

  // Actions
  wrap.querySelector('#cancelBtn').addEventListener('click', () => router.go('#/dashboard'));
  wrap.querySelector('#saveBtn').addEventListener('click', () => attemptSave(sheet, data, wrap));
}

function attemptSave(sheet, data, wrap) {
  const errors = validate(sheet, data);
  // Clear previous errors
  wrap.querySelectorAll('.form-error').forEach(e => e.remove());
  wrap.querySelectorAll('.error').forEach(e => e.classList.remove('error'));
  if (errors.length) {
    for (const err of errors) {
      const target = wrap.querySelector(`[data-input="${err.field}"], [data-field="${err.field}"]`);
      if (target) {
        target.classList.add('error');
        const msg = document.createElement('div');
        msg.className = 'form-error';
        msg.textContent = err.msg;
        target.parentNode.appendChild(msg);
      }
    }
    return;
  }
  // Build trade and show confirmation modal
  const trade = buildTrade(sheet, data);
  openModal({
    title: 'Confirmar nuevo trade',
    meta: `${sheet} · ${trade.pair} · ${trade.setup}`,
    body: confirmBody(trade),
    actions: [
      { label: 'Cancelar', onClick: close => close() },
      {
        label: 'Confirmar y guardar', variant: 'primary',
        onClick: close => {
          state.add(trade);
          close();
          router.go('#/dashboard');
        },
      },
    ],
  });
}

function validate(sheet, data) {
  const meta = STRAT_META[sheet];
  const errs = [];
  if (!meta.pairFixed && !data.pair) errs.push({ field: 'pair', msg: 'Selecciona el par' });
  if (!data.setup) errs.push({ field: 'setup', msg: 'Selecciona LONG o SHORT' });
  if (!data.zone) errs.push({ field: 'zone', msg: 'Selecciona la zona' });
  if (meta.showEntry && !data.entry) errs.push({ field: 'entry', msg: 'Selecciona el tipo de entrada' });
  if (!data.date) errs.push({ field: 'date', msg: 'Fecha obligatoria' });
  if (!data.open_str) errs.push({ field: 'open_str', msg: 'Hora apertura obligatoria' });
  const pnl = parseFloat(data.pnl_pct);
  if (data.pnl_pct === '' || isNaN(pnl)) errs.push({ field: 'pnl_pct', msg: '% P&L numérico obligatorio' });
  if (!data.sensacion) errs.push({ field: 'sensacion', msg: 'Selecciona la sensación' });
  return errs;
}

function buildTrade(sheet, data) {
  const pnl_pct = +parseFloat(data.pnl_pct).toFixed(4);
  const result = pnl_pct > 0.2 ? 'TP' : pnl_pct < -0.2 ? 'SL' : 'BE';
  const riskRawNum = parseFloat(data.risk_real_pct);
  const risk_real_pct = isFinite(riskRawNum) && riskRawNum >= 0 ? +riskRawNum.toFixed(4) : 1;
  return {
    sheet,
    date: data.date,
    pnl_pct,
    risk_real_pct,
    result,
    open_str: data.open_str,
    close_str: data.close_str,
    open_hour: parseTime(data.open_str),
    dur: durationMinutes(data.open_str, data.close_str),
    setup: data.setup,
    pair: data.pair,
    zone: data.zone,
    entry: data.entry || '',
    rr: data.rr ? parseFloat(data.rr) : null,
    pips: data.pips ? parseFloat(data.pips) : null,
    sensacion: data.sensacion,
    url1: data.url1 || '',
    url2: data.url2 || '',
    reflexion: data.reflexion || '',
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
  };
}

function confirmBody(t) {
  // Resumen de cuentas asignadas
  let cuentasLine = '';
  if (Array.isArray(t.accounts) && t.accounts.length) {
    const lines = t.accounts.map(a => {
      const c = state.cuentas.find(x => x.id === a.accountId);
      if (!c) return `${a.accountId.substring(0, 6)}… (no encontrada) · ${a.riskPct}%`;
      return `${c.empresa} ${capShort(c.capital)}${c.numero ? ' #' + c.numero : ''} · ${a.riskPct}%`;
    });
    cuentasLine = `<dt>Cuentas</dt><dd>${lines.join('<br>')}</dd>`;
  }
  return `
    <dl class="confirm-grid">
      <dt>Fecha</dt><dd>${formatDateEs(t.date)}</dd>
      <dt>Hora</dt><dd>${t.open_str}${t.close_str ? ' → ' + t.close_str : ''}${t.dur != null ? ` (${t.dur} min)` : ''}</dd>
      <dt>Par</dt><dd>${t.pair}</dd>
      <dt>Setup</dt><dd>${t.setup}</dd>
      <dt>Zona</dt><dd>${t.zone}</dd>
      ${t.entry ? `<dt>Entrada</dt><dd>${t.entry}</dd>` : ''}
      ${t.rr != null ? `<dt>RR</dt><dd>${t.rr}</dd>` : ''}
      ${t.pips != null ? `<dt>Pips</dt><dd>${t.pips}</dd>` : ''}
      <dt>% P&L sistema</dt><dd><strong style="color:${t.result === 'TP' ? 'var(--green)' : t.result === 'SL' ? 'var(--red)' : 'var(--orange)'};">${fmtPct(t.pnl_pct)}</strong> · <span class="res-pill res-${t.result.toLowerCase()}">${t.result}</span></dd>
      <dt>Riesgo real</dt><dd>${fmtPct(t.risk_real_pct)}</dd>
      <dt>% P&L real</dt><dd><strong style="color:${t.result === 'TP' ? 'var(--green)' : t.result === 'SL' ? 'var(--red)' : 'var(--orange)'};">${fmtPct(t.pnl_pct * t.risk_real_pct)}</strong></dd>
      <dt>Sensación</dt><dd><span class="sens-pill" data-s="${t.sensacion}">${t.sensacion}</span></dd>
      ${cuentasLine}
      ${t.reflexion ? `<dt>Reflexión</dt><dd style="white-space:pre-wrap;">${t.reflexion}</dd>` : ''}
    </dl>
  `;
}

function capShort(c) {
  if (c >= 1000) return Math.round(c / 1000) + 'K';
  return String(c);
}

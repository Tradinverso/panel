// Modal de edición de un trade existente.
// Reusa la misma estructura de pills + inputs que el formulario de Nuevo Trade,
// pero compacto en un modal. Al guardar, llama a state.update(id, patch).

import { state } from '../state.js';
import { renderPills } from './pills.js';
import { openModal, closeModal } from './modal.js';
import { renderCuentaAssign } from './cuenta-assign.js';
import { TODAS as SENS_OPTIONS } from '../utils/sensaciones.js';
import { parseTime, durationMinutes, hourToString } from '../utils/date-helpers.js';
import { STRATEGIES } from '../utils/strategy-config.js';

export function openEditTradeModal(trade) {
  const meta = STRATEGIES[trade.sheet];
  if (!meta) return;

  // Estado mutable del formulario
  const data = {
    date: trade.date || '',
    open_str: trade.open_str || '',
    close_str: trade.close_str || '',
    pair: trade.pair || (meta.pairs.length === 1 ? meta.pairs[0] : ''),
    setup: trade.setup || '',
    zone: Array.isArray(trade.zone) ? [...trade.zone] : (trade.zone ? [trade.zone] : []),
    entry: Array.isArray(trade.entry) ? [...trade.entry] : (trade.entry ? [trade.entry] : []),
    model: trade.model || '',
    rr: trade.rr != null ? String(trade.rr) : '',
    pips: trade.pips != null ? String(trade.pips) : '',
    pnl_pct: trade.pnl_pct != null ? String(trade.pnl_pct) : '',
    risk_real_pct: trade.risk_real_pct != null ? String(trade.risk_real_pct) : '1',
    plan_followed: trade.plan_followed === true || trade.plan_followed === false ? trade.plan_followed : null,
    sensacion: trade.sensacion || '',
    url1: trade.url1 || '',
    url2: trade.url2 || '',
    reflexion: trade.reflexion || '',
    accounts: Array.isArray(trade.accounts) ? trade.accounts.slice() : [],
  };

  const pipLabel = meta.pipLabel || (trade.sheet === 'ZONAS' ? 'Pips SL' : 'Pip SL');

  openModal({
    title: `Editar trade · ${meta.label}`,
    meta: `${trade.date} · ${trade.pair || ''} · ${trade.setup || ''} · ${trade.result}`,
    body: `
      <div class="form" style="max-width:none;gap:14px;">
        <div class="form-row">
          ${!meta.pairFixed ? `<div class="form-field">
            <label class="form-label">Par</label>
            <div data-field="pair"></div>
          </div>` : (meta.models ? `<div class="form-field">
          <label class="form-label">Modelo de entrada${trade.model ? ' <span class="required">*</span>' : ''}</label>
          <div data-field="model"></div>
          ${trade.model ? '' : `<div style="font-size:10px;color:var(--muted);font-family:var(--mono);margin-top:4px;">
            Trade anterior a los modelos de entrada: puedes asignarle uno o dejarlo sin modelo.
          </div>`}
        </div>` : '')}
          <div class="form-field">
            <label class="form-label">Setup</label>
            <div data-field="setup"></div>
          </div>
        </div>

        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Zona${meta.zonesMulti ? ' <span style="color:var(--muted);font-size:11px;">(varias permitidas)</span>' : ''}</label>
            <div data-field="zone"></div>
            ${!meta.zonesMulti && data.zone.filter(x => meta.zones.includes(x)).length > 1 ? `
              <div class="legacy-note" data-multi="zone">
                Este trade tenía varias: "${escapeHtml(data.zone.filter(x => meta.zones.includes(x)).join(' + '))}". Ahora es una sola:
                al elegir una zona quedará solo esa, o
                <button type="button" class="legacy-quitar" data-multi-keep="zone">quedarme con ${escapeHtml(data.zone.filter(x => meta.zones.includes(x))[0])}</button>
              </div>` : ''}
            ${data.zone.some(x => !meta.zones.includes(x)) ? `
              <div class="legacy-note" data-legacy="zone">
                Valor antiguo "${escapeHtml(data.zone.filter(x => !meta.zones.includes(x)).join(', '))}" (ya no está en la lista).
                Se sustituye en cuanto elijas una zona, o
                <button type="button" class="legacy-quitar" data-legacy-quitar="zone">quitarlo</button>
              </div>` : ''}
          </div>
          ${meta.showEntry ? `<div class="form-field">
            <label class="form-label">Entrada${meta.entriesMulti ? ' <span style="color:var(--muted);font-size:11px;">(varias permitidas)</span>' : ''}</label>
            <div data-field="entry"></div>
            ${!meta.entriesMulti && data.entry.filter(x => meta.entries.includes(x)).length > 1 ? `
              <div class="legacy-note" data-multi="entry">
                Este trade tenía varias: "${escapeHtml(data.entry.filter(x => meta.entries.includes(x)).join(' + '))}". Ahora es una sola:
                al elegir una entrada quedará solo esa, o
                <button type="button" class="legacy-quitar" data-multi-keep="entry">quedarme con ${escapeHtml(data.entry.filter(x => meta.entries.includes(x))[0])}</button>
              </div>` : ''}
            ${data.entry.some(x => !meta.entries.includes(x)) ? `
              <div class="legacy-note" data-legacy="entry">
                Valor antiguo "${escapeHtml(data.entry.filter(x => !meta.entries.includes(x)).join(', '))}" (ya no está en la lista).
                Se sustituye en cuanto elijas una entrada, o
                <button type="button" class="legacy-quitar" data-legacy-quitar="entry">quitarlo</button>
              </div>` : ''}
          </div>` : ''}
        </div>

        <div class="form-row cols-3">
          <div class="form-field">
            <label class="form-label">Fecha</label>
            <input class="form-input" type="date" data-input="date" value="${escapeAttr(data.date)}">
          </div>
          <div class="form-field">
            <label class="form-label">Apertura</label>
            <input class="form-input" type="time" data-input="open_str" value="${escapeAttr(data.open_str)}">
          </div>
          <div class="form-field">
            <label class="form-label">Cierre</label>
            <input class="form-input" type="time" data-input="close_str" value="${escapeAttr(data.close_str)}">
          </div>
        </div>

        <div class="form-row cols-3">
          <div class="form-field">
            <label class="form-label">% P&L sistema</label>
            <input class="form-input" type="number" step="0.01" data-input="pnl_pct" value="${escapeAttr(data.pnl_pct)}">
          </div>
          <div class="form-field">
            <label class="form-label">Riesgo real (%)</label>
            <input class="form-input" type="number" step="0.01" min="0" data-input="risk_real_pct" value="${escapeAttr(data.risk_real_pct)}">
          </div>
          ${meta.showRR ? `<div class="form-field">
            <label class="form-label">RR</label>
            <input class="form-input" type="number" step="0.1" data-input="rr" value="${escapeAttr(data.rr)}">
          </div>` : ''}
          ${meta.showPip ? `<div class="form-field">
            <label class="form-label">${pipLabel}</label>
            <input class="form-input" type="number" step="0.1" data-input="pips" value="${escapeAttr(data.pips)}">
          </div>` : ''}
        </div>

        <div class="form-field">
          <label class="form-label">¿Has seguido el plan? <span class="required">*</span></label>
          <div data-field="plan_followed"></div>
        </div>

        <div class="form-field">
          <label class="form-label">Sensación al ejecutar</label>
          <div data-field="sensacion"></div>
        </div>

        ${meta.links.map(l => `
          <div class="form-field">
            <label class="form-label">${escapeHtml(l.label)}</label>
            <input class="form-input" type="url" data-input="${l.key}" value="${escapeAttr(data[l.key] || '')}">
          </div>
        `).join('')}

        <div class="form-field">
          <label class="form-label">Reflexión</label>
          <textarea class="form-textarea" data-input="reflexion">${escapeHtml(data.reflexion)}</textarea>
        </div>

        <div class="form-field">
          <label class="form-label">Asignación a cuentas</label>
          <div id="cuentaAssignBoxEdit"></div>
        </div>

        <div id="editErr" class="auth-error" style="display:none;"></div>
      </div>
    `,
    actions: [
      { label: 'Cancelar', onClick: close => close() },
      {
        label: 'Guardar cambios',
        variant: 'primary',
        onClick: close => doSave(trade, data, close),
      },
    ],
  });

  // Wire pills (después del openModal porque necesitan el DOM creado)
  setTimeout(() => {
    const root = document.getElementById('modal-root');
    if (!root) return;

    if (!meta.pairFixed) {
      const pairEl = root.querySelector('[data-field="pair"]');
      if (pairEl) renderPills(pairEl, {
        name: 'pair', options: meta.pairs, value: data.pair,
        onChange: v => data.pair = v,
      });
    }

    const setupEl = root.querySelector('[data-field="setup"]');
    if (setupEl) renderPills(setupEl, {
      name: 'setup', options: ['LONG', 'SHORT'], value: data.setup,
      onChange: v => data.setup = v,
    });

    const zoneEl = root.querySelector('[data-field="zone"]');
    if (zoneEl) renderPills(zoneEl, {
      name: 'zone', options: meta.zones, value: data.zone, variant: meta.zonesCols ? `cols-${meta.zonesCols}` : '',
      multi: !!meta.zonesMulti,
      // Con selección múltiple, un valor antiguo (sin botón) seguía guardado
      // al marcar otros: PD + PDH/PDL. Al elegir de la lista, se sustituye.
      onChange: v => { data.zone = limpiar(meta.zonesMulti ? v : (v ? [v] : []), meta.zones); quitarAviso('zone'); },
    });

    if (meta.showEntry) {
      const entryEl = root.querySelector('[data-field="entry"]');
      if (entryEl) renderPills(entryEl, {
        name: 'entry', options: meta.entries, value: data.entry, variant: meta.entriesCols ? `cols-${meta.entriesCols}` : '', rowStarts: meta.entriesRowStarts || [],
        multi: !!meta.entriesMulti,
        onChange: v => { data.entry = limpiar(meta.entriesMulti ? v : (v ? [v] : []), meta.entries); quitarAviso('entry'); },
      });
    }
    // "quitarlo": elimina los valores antiguos sin tocar el resto
    root.querySelectorAll('[data-multi-keep]').forEach(b => b.addEventListener('click', () => {
      const f = b.dataset.multiKeep;
      const lista = f === 'zone' ? meta.zones : meta.entries;
      data[f] = limpiar(data[f], lista).slice(0, 1);
      quitarAviso(f);
    }));
    root.querySelectorAll('[data-legacy-quitar]').forEach(b => b.addEventListener('click', () => {
      const f = b.dataset.legacyQuitar;
      data[f] = limpiar(data[f], f === 'zone' ? meta.zones : meta.entries);
      quitarAviso(f);
    }));
    function quitarAviso(f) { root.querySelectorAll(`[data-legacy="${f}"], [data-multi="${f}"]`).forEach(e => e.remove()); }
    if (meta.models) {
      renderPills(root.querySelector('[data-field="model"]'), {
        name: 'model',
        // "Sin modelo" solo para trades que nunca lo tuvieron: editar uno antiguo
        // no obliga a clasificarlo, pero un modelo ya puesto no se puede quitar.
        options: trade.model ? meta.models : [...meta.models, { value: '', label: 'Sin modelo' }],
        value: data.model || '',
        onChange: v => { data.model = v || ''; },
      });
    }

    const sensEl = root.querySelector('[data-field="sensacion"]');
    if (sensEl) renderPills(sensEl, {
      name: 'sensacion', options: SENS_OPTIONS, value: data.sensacion,
      variant: 'sens',
      onChange: v => data.sensacion = v,
    });

    const planEl = root.querySelector('[data-field="plan_followed"]');
    if (planEl) renderPills(planEl, {
      name: 'plan_followed',
      options: [
        { value: 'yes', label: '✓ Sí' },
        { value: 'no',  label: '✗ No' },
      ],
      value: data.plan_followed === true ? 'yes' : data.plan_followed === false ? 'no' : '',
      onChange: v => { data.plan_followed = v === 'yes' ? true : v === 'no' ? false : null; },
    });

    // Inputs (sincronización bidireccional con `data`)
    root.querySelectorAll('[data-input]').forEach(el => {
      el.addEventListener('input', () => {
        data[el.dataset.input] = el.value;
      });
    });

    // Asignación de cuentas
    const assignBox = root.querySelector('#cuentaAssignBoxEdit');
    let caEdit = null;
    if (assignBox) {
      caEdit = renderCuentaAssign(assignBox, data.accounts || [], (accs) => {
        data.accounts = accs;
      }, {
        getDefaultRisk: () => {
          const n = parseFloat(data.risk_real_pct);
          return isFinite(n) && n > 0 ? n : 1;
        },
        getPnlPct: () => {
          const n = parseFloat(data.pnl_pct);
          return isFinite(n) ? n : 0;
        },
        // Futuros: el riesgo de la tabla depende del RR. Ya no se apunta, pero en
        // un TP la R conseguida (% P&L, en R) es el RR. En SL/BE no se sabe → NaN
        // y la gestión usa su mínimo (editable).
        getRR: () => { const p = parseFloat(data.pnl_pct); return p > 0.2 ? p : NaN; },
      });
    }
  }, 0);
}

function doSave(trade, data, close) {
  const root = document.getElementById('modal-root');
  const errEl = root.querySelector('#editErr');
  const showErr = (msg) => { errEl.textContent = '⚠ ' + msg; errEl.style.display = 'flex'; };
  errEl.style.display = 'none';

  const pnl = parseFloat(data.pnl_pct);
  if (data.pnl_pct === '' || isNaN(pnl)) return showErr('El % P&L tiene que ser un número.');
  if (!data.date) return showErr('Falta la fecha.');
  if (!data.setup) return showErr('Falta el setup (LONG o SHORT).');
  if (data.plan_followed !== true && data.plan_followed !== false) return showErr('Indica si has seguido el plan (Sí o No).');
  const metaSave = STRATEGIES[trade.sheet] || {};
  if (metaSave.models && trade.model && !data.model) return showErr('Selecciona el modelo de entrada.');

  const pnl_pct = +pnl.toFixed(4);
  const result = pnl_pct > 0.2 ? 'TP' : pnl_pct < -0.2 ? 'SL' : 'BE';
  const riskRawNum = parseFloat(data.risk_real_pct);
  const risk_real_pct = isFinite(riskRawNum) && riskRawNum >= 0 ? +riskRawNum.toFixed(4) : 1;

  const patch = {
    date: data.date,
    pnl_pct,
    risk_real_pct,
    result,
    open_str: data.open_str || '',
    close_str: data.close_str || '',
    open_hour: parseTime(data.open_str),
    dur: durationMinutes(data.open_str, data.close_str),
    setup: data.setup,
    pair: data.pair || trade.pair,
    zone: Array.isArray(data.zone) ? data.zone : (data.zone ? [data.zone] : []),
    entry: Array.isArray(data.entry) ? data.entry : (data.entry ? [data.entry] : []),
    model: data.model || '',
    rr: data.rr ? parseFloat(data.rr) : null,
    pips: data.pips ? parseFloat(data.pips) : null,
    sensacion: data.sensacion || '',
    plan_followed: data.plan_followed === true || data.plan_followed === false ? data.plan_followed : null,
    url1: data.url1 || '',
    url2: data.url2 || '',
    reflexion: data.reflexion || '',
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
  };

  state.update(trade.id, patch);
  close();
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/"/g, '&quot;');
}

// Deja solo los valores que están en la lista actual de la estrategia.
function limpiar(valores, lista) {
  return (valores || []).filter(v => lista.includes(v));
}

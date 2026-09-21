// Formulario de backtest (modal) — crear o editar UNA operación backtesteada.
// Deliberadamente separado de new-trade.js: mismo esqueleto strategy-driven
// (par/setup/zona/entrada/tiempos/P&L/RR/enlaces/notas) pero SIN sensación,
// plan, riesgo real ni cuentas, y guardando en state.backtests (colección
// aparte) — jamás en el journal real ni en la rotación.

import { state } from '../state.js';
import { auth } from '../auth.js';
import { openModal } from './modal.js';
import { renderPills } from './pills.js';
import { STRATEGIES, modelLabel } from '../utils/strategy-config.js';
import { todayLocal } from '../utils/timezone.js';
import { formatDateEs, durationMinutes } from '../utils/date-helpers.js';
import { fmtPct } from '../utils/number-format-es.js';

// `existing` = backtest a editar (null → nuevo). `onSaved` se llama tras guardar.
// `draft` = estado del formulario a restaurar. Lo usa el paso de confirmación:
// como openModal() no apila (cierra el modal anterior), volver desde la
// confirmación implica reabrir este formulario, y sin el draft se perdería todo
// lo escrito.
// `opts.pickSheet` → la estrategia se elige DENTRO del formulario (pestaña
//   "No tomados", que no pertenece a ninguna).
// `opts.notTaken` → alta ya marcada como no tomada.
//
// Al crear no se pregunta "¿se tomó?": lo dice el sitio desde el que abres el
// formulario. Al EDITAR sí aparece, para poder corregir el error en cualquiera
// de las dos direcciones (si no, un trade mal marcado se quedaría atrapado en
// su pestaña para siempre).
export function openBacktestFormModal(sheet, existing, onSaved, draft = null, opts = {}) {
  const { pickSheet = false, notTaken = false } = opts;
  // Con pickSheet y sin estrategia elegida aún, se arranca por la primera.
  const sheetActual = sheet || (draft && draft.sheet) || Object.keys(STRATEGIES)[0];
  sheet = sheetActual;
  const meta = STRATEGIES[sheet];
  // Modelo obligatorio en Nasdaq, salvo al editar un backtest anterior a los
  // modelos (importado o registrado antes): no se obliga a clasificarlo.
  const modeloOpcional = !!(existing && !existing.model);
  const data = draft ? cloneData(draft) : existing ? {
    pair: existing.pair || '',
    setup: existing.setup || '',
    zone: Array.isArray(existing.zone) ? [...existing.zone] : [],
    entry: Array.isArray(existing.entry) ? [...existing.entry] : [],
    model: existing.model || '',
    date: existing.date || todayLocal(auth.timezone()),
    open_str: existing.open_str || '',
    close_str: existing.close_str || '',
    pnl_pct: existing.pnl_pct != null ? String(existing.pnl_pct) : '',
    rr: existing.rr != null ? String(existing.rr) : '',
    not_taken: existing.not_taken === true,
    url1: existing.url1 || '',
    url2: existing.url2 || '',
    reflexion: existing.reflexion || '',
  } : {
    pair: meta.pairs.length === 1 ? meta.pairs[0] : '',
    setup: '',
    zone: [],
    entry: meta.entries && meta.entries.length === 1 ? [meta.entries[0]] : [],
    model: '',
    date: todayLocal(auth.timezone()),
    open_str: '',
    close_str: '',
    pnl_pct: '',
    rr: '',
    not_taken: notTaken === true,
    url1: '',
    url2: '',
    reflexion: '',
  };

  const body = `
    <div class="form nt-form">
      ${pickSheet ? `
      <div class="nt-section">
        <div class="nt-section-title">Estrategia</div>
        <div data-field="sheet"></div>
      </div>` : ''}
      <div class="nt-section">
        <div class="nt-section-title">Operativa</div>
        <div class="form-row">
          ${!meta.pairFixed ? `<div class="form-field">
            <label class="form-label">Par <span class="required">*</span></label>
            <div data-field="pair"></div>
          </div>` : (meta.models ? `<div class="form-field">
          <label class="form-label">Modelo de entrada${modeloOpcional ? '' : ' <span class="required">*</span>'}</label>
          <div data-field="model"></div>
        </div>` : '')}
          <div class="form-field">
            <label class="form-label">Setup <span class="required">*</span></label>
            <div data-field="setup"></div>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Zona <span class="required">*</span></label>
            <div data-field="zone"></div>
            ${!meta.zonesMulti && data.zone.filter(x => meta.zones.includes(x)).length > 1 ? `
              <div class="legacy-note" data-multi="zone">
                Este trade tenía varias: "${esc(data.zone.filter(x => meta.zones.includes(x)).join(' + '))}". Ahora es una sola:
                al elegir una zona quedará solo esa, o
                <button type="button" class="legacy-quitar" data-multi-keep="zone">quedarme con ${esc(data.zone.filter(x => meta.zones.includes(x))[0])}</button>
              </div>` : ''}
            ${data.zone.some(x => !meta.zones.includes(x)) ? `
              <div class="legacy-note" data-legacy="zone">
                Valor antiguo "${esc(data.zone.filter(x => !meta.zones.includes(x)).join(', '))}" (ya no está en la lista).
                Se sustituye en cuanto elijas una zona, o
                <button type="button" class="legacy-quitar" data-legacy-quitar="zone">quitarlo</button>
              </div>` : ''}
          </div>
          ${meta.showEntry ? `<div class="form-field">
            <label class="form-label">Tipo de entrada <span class="required">*</span></label>
            <div data-field="entry"></div>
            ${!meta.entriesMulti && data.entry.filter(x => meta.entries.includes(x)).length > 1 ? `
              <div class="legacy-note" data-multi="entry">
                Este trade tenía varias: "${esc(data.entry.filter(x => meta.entries.includes(x)).join(' + '))}". Ahora es una sola:
                al elegir una entrada quedará solo esa, o
                <button type="button" class="legacy-quitar" data-multi-keep="entry">quedarme con ${esc(data.entry.filter(x => meta.entries.includes(x))[0])}</button>
              </div>` : ''}
            ${data.entry.some(x => !meta.entries.includes(x)) ? `
              <div class="legacy-note" data-legacy="entry">
                Valor antiguo "${esc(data.entry.filter(x => !meta.entries.includes(x)).join(', '))}" (ya no está en la lista).
                Se sustituye en cuanto elijas una entrada, o
                <button type="button" class="legacy-quitar" data-legacy-quitar="entry">quitarlo</button>
              </div>` : ''}
          </div>` : ''}
        </div>
      </div>

      <div class="nt-section">
        <div class="nt-section-title">Tiempos</div>
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
      </div>

      <div class="nt-section">
        <div class="nt-section-title">Resultado</div>
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">% P&L <span class="required">*</span></label>
            <input class="form-input" type="number" step="0.01" data-input="pnl_pct" value="${data.pnl_pct}" placeholder="2.00 = TP · -1.00 = SL · 0 = BE">
            <div class="bti-hint">El resultado sale del %: más de +0,20% es TP, menos de -0,20% es SL, y entre medias (0 incluido) es <b>BE</b>.</div>
          </div>
          ${meta.showRR ? `<div class="form-field">
            <label class="form-label">RR</label>
            <input class="form-input" type="number" step="0.1" data-input="rr" value="${data.rr}" placeholder="2">
          </div>` : ''}
        </div>
        ${existing ? `
        <div class="form-field">
          <label class="form-label">¿Se tomó el trade?</label>
          <div data-field="not_taken"></div>
          <div class="bti-hint">Los <b>no tomados</b> viven en su pestaña y no cuentan en las estadísticas de la estrategia. Cambiarlo aquí mueve el trade de sección.</div>
        </div>` : ''}
      </div>

      <div class="nt-section">
        <div class="nt-section-title">Notas y enlaces</div>
        ${meta.links.map(l => `
          <div class="form-field">
            <label class="form-label">${l.label}</label>
            <input class="form-input" type="url" data-input="${l.key}" value="${esc(data[l.key] || '')}" placeholder="https://www.tradingview.com/x/...">
          </div>
        `).join('')}
        <div class="form-field">
          <label class="form-label">Notas</label>
          <textarea class="form-textarea" data-input="reflexion" placeholder="Qué viste en este backtest, contexto, observaciones...">${esc(data.reflexion)}</textarea>
        </div>
      </div>

      <div id="btErr" class="auth-error" style="display:none;"></div>
    </div>`;

  openModal({
    title: existing ? 'Editar backtest' : (data.not_taken ? 'Nuevo trade NO TOMADO' : 'Nuevo trade de backtesting'),
    meta: data.not_taken
      ? `${meta.label} · no cuenta en las estadísticas de la estrategia`
      : `${meta.label} · histórico de backtesting (separado del journal real)`,
    size: 'lg',
    body,
    actions: [
      { label: 'Cancelar', onClick: close => close() },
      {
        label: existing ? 'Guardar cambios' : 'Guardar backtest', variant: 'primary',
        onClick: close => {
          const err = validate(meta, data, modeloOpcional);
          const errEl = document.getElementById('modal-root').querySelector('#btErr');
          if (err) {
            errEl.textContent = '⚠ ' + err;
            errEl.style.display = 'flex';
            return;
          }
          const payload = buildPayload(sheet, meta, data);
          // Editar guarda directo (igual que el modal de edición del journal).
          // Al crear pasamos por la confirmación, como en Nuevo trade.
          if (existing) {
            state.updateBacktest(existing.id, payload);
            close();
            if (onSaved) onSaved();
            return;
          }
          openConfirm(sheet, meta, payload, data, onSaved, opts);
        },
      },
    ],
  });

  // ── Wiring (sobre #modal-root) ──
  const root = document.getElementById('modal-root');

  if (!meta.pairFixed) {
    renderPills(root.querySelector('[data-field="pair"]'), {
      name: 'pair', options: meta.pairs, value: data.pair,
      onChange: v => data.pair = v,
    });
  }
  renderPills(root.querySelector('[data-field="setup"]'), {
    name: 'setup', options: ['LONG', 'SHORT'], value: data.setup,
    onChange: v => data.setup = v,
  });
  renderPills(root.querySelector('[data-field="zone"]'), {
    name: 'zone', options: meta.zones, value: data.zone, variant: meta.zonesCols ? `cols-${meta.zonesCols}` : '',
    multi: !!meta.zonesMulti,
    // Al elegir de la lista, un valor antiguo se sustituye (ver trade-edit-modal).
    onChange: v => { data.zone = limpiar(meta.zonesMulti ? v : (v ? [v] : []), meta.zones); quitarAviso('zone'); },
  });
  if (meta.showEntry) {
    renderPills(root.querySelector('[data-field="entry"]'), {
      name: 'entry', options: meta.entries, value: data.entry, variant: meta.entriesCols ? `cols-${meta.entriesCols}` : '', rowStarts: meta.entriesRowStarts || [],
      multi: !!meta.entriesMulti,
      onChange: v => { data.entry = limpiar(meta.entriesMulti ? v : (v ? [v] : []), meta.entries); quitarAviso('entry'); },
    });
  }
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
      options: modeloOpcional ? [...meta.models, { value: '', label: 'Sin modelo' }] : meta.models,
      value: data.model || '',
      onChange: v => { data.model = v || ''; },
    });
  }
  if (pickSheet) {
    renderPills(root.querySelector('[data-field="sheet"]'), {
      name: 'sheet',
      options: Object.keys(STRATEGIES).map(k => ({ value: k, label: STRATEGIES[k].label })),
      value: sheet,
      // Cambiar de estrategia cambia par/zonas/entradas, así que hay que
      // reconstruir el formulario: se reabre con el borrador adaptado.
      onChange: v => { if (v !== sheet) openBacktestFormModal(v, existing, onSaved, draftForSheet(data, v), opts); },
    });
  }
  const notTakenEl = root.querySelector('[data-field="not_taken"]');
  if (notTakenEl) renderPills(notTakenEl, {
    name: 'not_taken',
    options: [{ value: 'si', label: '✓ Tomado' }, { value: 'no', label: '✗ No tomado' }],
    value: data.not_taken ? 'no' : 'si',
    onChange: v => { data.not_taken = v === 'no'; },
  });
  root.querySelectorAll('[data-input]').forEach(el => {
    el.addEventListener('input', () => { data[el.dataset.input] = el.value; });
  });
}

function buildPayload(sheet, meta, data) {
  return {
    sheet,
    pair: meta.pairFixed ? meta.pairs[0] : data.pair,
    setup: data.setup,
    zone: data.zone,
    entry: data.entry,
    model: meta.models ? (data.model || '') : '',
    date: data.date,
    open_str: data.open_str,
    close_str: data.close_str,
    pnl_pct: parseFloat(data.pnl_pct),
    rr: data.rr !== '' && isFinite(parseFloat(data.rr)) ? parseFloat(data.rr) : null,
    not_taken: data.not_taken === true,
    url1: data.url1.trim(),
    url2: (data.url2 || '').trim(),
    reflexion: data.reflexion,
    entry_tz: auth.hasTimezone() ? auth.timezone() : null,
  };
}

// Paso de confirmación antes de crear el backtest. "Volver" reabre el
// formulario con lo escrito intacto (ver nota del `draft` arriba).
function openConfirm(sheet, meta, payload, data, onSaved, opts = {}) {
  openModal({
    title: payload.not_taken ? 'Confirmar trade NO TOMADO' : 'Confirmar nuevo backtest',
    meta: `${meta.label} · ${payload.pair} · ${payload.setup} · ${payload.not_taken ? 'irá a la pestaña No tomados' : 'no entra en el journal real'}`,
    body: confirmBody(payload),
    actions: [
      { label: 'Volver', onClick: () => openBacktestFormModal(sheet, null, onSaved, data, opts) },
      {
        label: 'Confirmar y guardar', variant: 'primary',
        onClick: close => {
          state.addBacktest(payload);
          close();
          if (onSaved) onSaved();
        },
      },
    ],
  });
}

function confirmBody(b) {
  const result = b.pnl_pct > 0.2 ? 'TP' : b.pnl_pct < -0.2 ? 'SL' : 'BE';
  const color = result === 'TP' ? 'var(--green)' : result === 'SL' ? 'var(--red)' : 'var(--orange)';
  const dur = durationMinutes(b.open_str, b.close_str);
  return `
    <dl class="confirm-grid">
      <dt>Fecha</dt><dd>${formatDateEs(b.date)}</dd>
      <dt>Hora</dt><dd>${esc(b.open_str)}${b.close_str ? ' → ' + esc(b.close_str) : ''}${dur != null ? ` (${dur} min)` : ''}</dd>
      <dt>Par</dt><dd>${esc(b.pair)}</dd>
      <dt>Setup</dt><dd>${esc(b.setup)}</dd>
      ${STRATEGIES[b.sheet].models ? `<dt>Modelo</dt><dd>${esc(modelLabel(b.model))}</dd>` : ''}
      <dt>Zona</dt><dd>${esc((b.zone || []).join(' · '))}</dd>
      ${b.entry && b.entry.length ? `<dt>Entrada</dt><dd>${esc(b.entry.join(' · '))}</dd>` : ''}
      ${b.rr != null ? `<dt>RR</dt><dd>${b.rr}</dd>` : ''}
      <dt>Ejecución</dt><dd>${b.not_taken ? '<span class="nt-tag">✗ No tomado</span>' : '<span style="color:var(--green);">✓ Tomado</span>'}</dd>
      <dt>% P&L</dt><dd><strong style="color:${color};">${fmtPct(b.pnl_pct)}</strong> · <span class="res-pill res-${result.toLowerCase()}">${result}</span></dd>
      ${b.reflexion ? `<dt>Notas</dt><dd style="white-space:pre-wrap;">${esc(b.reflexion)}</dd>` : ''}
    </dl>
  `;
}

// zone/entry son arrays y el formulario los muta por referencia: copiarlos para
// que el draft no quede acoplado al modal que lo generó.
function cloneData(d) {
  return { ...d, zone: [...(d.zone || [])], entry: [...(d.entry || [])] };
}

// Al cambiar de estrategia dentro del formulario se conserva todo lo que NO
// depende de ella (fechas, horas, %, RR, enlaces, notas) y se sueltan par, zona
// y entrada, que sí. Mismo criterio que el "Nuevo trade" del journal.
function draftForSheet(d, sheet) {
  const meta = STRATEGIES[sheet];
  return {
    ...cloneData(d),
    sheet,
    pair: meta.pairs.length === 1 ? meta.pairs[0] : '',
    zone: [],
    entry: meta.entries && meta.entries.length === 1 ? [meta.entries[0]] : [],
    model: '',
  };
}

function validate(meta, data, modeloOpcional = false) {
  if (!meta.pairFixed && !data.pair) return 'Selecciona el par.';
  if (!data.setup) return 'Selecciona el setup (LONG/SHORT).';
  if (!data.zone || !data.zone.length) return 'Selecciona la zona.';
  if (meta.showEntry && (!data.entry || !data.entry.length)) return 'Selecciona el tipo de entrada.';
  if (meta.models && !modeloOpcional && !data.model) return 'Selecciona el modelo de entrada.';
  if (!data.date) return 'Pon la fecha.';
  if (!data.open_str) return 'Pon la hora de apertura.';
  const pnl = parseFloat(data.pnl_pct);
  if (!isFinite(pnl)) return 'Pon el % de P&L: positivo = TP, negativo = SL, 0 = BE.';
  return null;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// Deja solo los valores que están en la lista actual de la estrategia.
function limpiar(valores, lista) {
  return (valores || []).filter(v => lista.includes(v));
}

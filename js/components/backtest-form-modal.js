// Formulario de backtest (modal) — crear o editar UNA operación backtesteada.
// Deliberadamente separado de new-trade.js: mismo esqueleto strategy-driven
// (par/setup/zona/entrada/tiempos/P&L/RR/enlaces/notas) pero SIN sensación,
// plan, riesgo real ni cuentas, y guardando en state.backtests (colección
// aparte) — jamás en el journal real ni en la rotación.

import { state } from '../state.js';
import { auth } from '../auth.js';
import { openModal } from './modal.js';
import { renderPills } from './pills.js';
import { STRATEGIES } from '../utils/strategy-config.js';
import { todayLocal } from '../utils/timezone.js';

// `existing` = backtest a editar (null → nuevo). `onSaved` se llama tras guardar.
export function openBacktestFormModal(sheet, existing, onSaved) {
  const meta = STRATEGIES[sheet];
  const data = existing ? {
    pair: existing.pair || '',
    setup: existing.setup || '',
    zone: Array.isArray(existing.zone) ? [...existing.zone] : [],
    entry: Array.isArray(existing.entry) ? [...existing.entry] : [],
    date: existing.date || todayLocal(auth.timezone()),
    open_str: existing.open_str || '',
    close_str: existing.close_str || '',
    pnl_pct: existing.pnl_pct != null ? String(existing.pnl_pct) : '',
    rr: existing.rr != null ? String(existing.rr) : '',
    url1: existing.url1 || '',
    url2: existing.url2 || '',
    reflexion: existing.reflexion || '',
  } : {
    pair: meta.pairs.length === 1 ? meta.pairs[0] : '',
    setup: '',
    zone: [],
    entry: meta.entries && meta.entries.length === 1 ? [meta.entries[0]] : [],
    date: todayLocal(auth.timezone()),
    open_str: '',
    close_str: '',
    pnl_pct: '',
    rr: '',
    url1: '',
    url2: '',
    reflexion: '',
  };

  const body = `
    <div class="form nt-form">
      <div class="nt-section">
        <div class="nt-section-title">Operativa</div>
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
            <input class="form-input" type="number" step="0.01" data-input="pnl_pct" value="${data.pnl_pct}" placeholder="2.00 = TP / -1.00 = SL">
          </div>
          <div class="form-field">
            <label class="form-label">RR</label>
            <input class="form-input" type="number" step="0.1" data-input="rr" value="${data.rr}" placeholder="2">
          </div>
        </div>
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
    title: existing ? 'Editar backtest' : 'Nuevo trade de backtesting',
    meta: `${meta.label} · histórico de backtesting (separado del journal real)`,
    size: 'lg',
    body,
    actions: [
      { label: 'Cancelar', onClick: close => close() },
      {
        label: existing ? 'Guardar cambios' : 'Guardar backtest', variant: 'primary',
        onClick: close => {
          const err = validate(meta, data);
          const errEl = document.getElementById('modal-root').querySelector('#btErr');
          if (err) {
            errEl.textContent = '⚠ ' + err;
            errEl.style.display = 'flex';
            return;
          }
          const payload = {
            sheet,
            pair: meta.pairFixed ? meta.pairs[0] : data.pair,
            setup: data.setup,
            zone: data.zone,
            entry: data.entry,
            date: data.date,
            open_str: data.open_str,
            close_str: data.close_str,
            pnl_pct: parseFloat(data.pnl_pct),
            rr: data.rr !== '' && isFinite(parseFloat(data.rr)) ? parseFloat(data.rr) : null,
            url1: data.url1.trim(),
            url2: (data.url2 || '').trim(),
            reflexion: data.reflexion,
            entry_tz: auth.hasTimezone() ? auth.timezone() : null,
          };
          if (existing) state.updateBacktest(existing.id, payload);
          else state.addBacktest(payload);
          close();
          if (onSaved) onSaved();
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
    name: 'zone', options: meta.zones, value: data.zone,
    multi: !!meta.zonesMulti,
    onChange: v => { data.zone = meta.zonesMulti ? v : (v ? [v] : []); },
  });
  if (meta.showEntry) {
    renderPills(root.querySelector('[data-field="entry"]'), {
      name: 'entry', options: meta.entries, value: data.entry,
      multi: !!meta.entriesMulti,
      onChange: v => { data.entry = meta.entriesMulti ? v : (v ? [v] : []); },
    });
  }
  root.querySelectorAll('[data-input]').forEach(el => {
    el.addEventListener('input', () => { data[el.dataset.input] = el.value; });
  });
}

function validate(meta, data) {
  if (!meta.pairFixed && !data.pair) return 'Selecciona el par.';
  if (!data.setup) return 'Selecciona el setup (LONG/SHORT).';
  if (!data.zone || !data.zone.length) return 'Selecciona la zona.';
  if (meta.showEntry && (!data.entry || !data.entry.length)) return 'Selecciona el tipo de entrada.';
  if (!data.date) return 'Pon la fecha.';
  if (!data.open_str) return 'Pon la hora de apertura.';
  const pnl = parseFloat(data.pnl_pct);
  if (!isFinite(pnl)) return 'Pon el % de P&L (positivo = TP, negativo = SL).';
  return null;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

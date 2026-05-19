// Sub-componente reutilizable: "asignar trade a una o varias cuentas".
// Usado en new-trade.js y trade-edit-modal.js.
//
// Modelo: cada asignación guarda el $ P&L directamente — el usuario solo
// introduce dólares, no porcentajes. Los trades legacy (con `riskPct` en vez
// de `usdPnl`) se migran al USD equivalente la primera vez que se editan.
//
// renderCuentaAssign(container, initial, onChange, opts) → { get, refresh }
//   - container: DOM element donde renderizar
//   - initial: array [{accountId, usdPnl}] o legacy [{accountId, riskPct}]
//   - onChange: callback(currentArray) cada vez que cambia
//   - opts.getDefaultRisk: () => number — riesgo % a usar al añadir cuenta
//     (se aplica como factor para calcular el USD inicial usando el pnl_pct
//     actual del trade)
//   - opts.getPnlPct: () => number — pnl_pct actual del trade. Solo se usa
//     para calcular el USD inicial al AÑADIR una cuenta y para migrar
//     asignaciones legacy. NO se recalcula al cambiar pnl_pct: el USD que
//     introduce el usuario queda congelado.
//   - return.get(): devuelve el array actual
//   - return.refresh(): re-pinta (útil al añadir/quitar cuentas)

import { state } from '../state.js';

export function renderCuentaAssign(container, initial = [], onChange = () => {}, opts = {}) {
  function currentPnlPct() {
    if (typeof opts.getPnlPct !== 'function') return 0;
    const v = opts.getPnlPct();
    return typeof v === 'number' && isFinite(v) ? v : 0;
  }

  // Normaliza la entrada: si viene `usdPnl` lo usa; si solo viene `riskPct`
  // (formato legacy) deriva el USD equivalente con el pnl_pct actual.
  function normalize(arr) {
    const cuentas = state.cuentas || [];
    const pnlPct = currentPnlPct();
    return (Array.isArray(arr) ? arr : [])
      .filter(a => a && a.accountId)
      .map(a => {
        if (typeof a.usdPnl === 'number' && isFinite(a.usdPnl)) {
          return { accountId: a.accountId, usdPnl: a.usdPnl };
        }
        // Legacy: deriva USD desde riskPct
        const c = cuentas.find(x => x.id === a.accountId);
        const cap = c ? c.capital : 0;
        const riskPct = typeof a.riskPct === 'number' ? a.riskPct : 1;
        const usd = pnlPct * riskPct * cap / 100;
        return { accountId: a.accountId, usdPnl: +usd.toFixed(2) };
      });
  }

  let assigned = normalize(initial);

  function fmtUsdValue(v) {
    if (!isFinite(v)) return '';
    return v.toFixed(2);
  }

  function paint() {
    const cuentas = state.cuentas || [];
    const activas = cuentas.filter(c => c.status === 'activa');
    const noCuentas = cuentas.length === 0;

    if (noCuentas) {
      container.innerHTML = `
        <div style="padding:14px;background:var(--card2);border:1px dashed var(--border);border-radius:8px;font-size:12px;color:var(--muted);font-family:var(--mono);">
          Aún no tienes cuentas configuradas.
          <a href="#/cuentas" style="color:var(--accent);">Crea una primero →</a>
          o guarda este trade solo en el sistema.
        </div>
      `;
      return;
    }

    const usedIds = new Set(assigned.map(a => a.accountId));
    const disponibles = activas.filter(c => !usedIds.has(c.id));

    container.innerHTML = `
      ${assigned.length === 0
        ? '<div style="font-size:11px;color:var(--muted);font-family:var(--mono);margin-bottom:10px;">Sin asignar — el trade solo cuenta en el sistema. Añade abajo si quieres asignarlo a una cuenta real.</div>'
        : ''
      }
      <div class="ca-list">
        ${assigned.map((a, i) => {
          const c = cuentas.find(x => x.id === a.accountId);
          if (!c) {
            return `<div class="ca-row ca-orphan">
              <span class="ca-label">⚠ Cuenta borrada (id ${a.accountId.substring(0, 6)}...)</span>
              <button type="button" class="ca-x" data-remove="${i}">×</button>
            </div>`;
          }
          return `<div class="ca-row">
            <span class="ca-label">${esc(c.empresa)} ${capShort(c.capital)} <span class="ca-meta">${c.numero ? '#' + esc(c.numero) : ''}</span></span>
            <span class="ca-usd">
              P&L
              <input type="number" step="0.01" value="${fmtUsdValue(a.usdPnl)}" data-usd="${i}" class="ca-usd-input">
              $
            </span>
            <button type="button" class="ca-x" data-remove="${i}" title="Quitar">×</button>
          </div>`;
        }).join('')}
      </div>
      ${disponibles.length > 0 ? `
        <div class="ca-add">
          <select class="select" id="ca-select">
            <option value="">+ Añadir cuenta…</option>
            ${disponibles.map(c => `<option value="${c.id}">${esc(c.empresa)} ${capShort(c.capital)}${c.numero ? ' #' + esc(c.numero) : ''}</option>`).join('')}
          </select>
        </div>
      ` : (assigned.length > 0
            ? '<div style="font-size:11px;color:var(--muted);font-family:var(--mono);margin-top:8px;">Todas las cuentas activas están asignadas.</div>'
            : '')}
    `;

    // Wire: remove
    container.querySelectorAll('[data-remove]').forEach(b => {
      b.addEventListener('click', () => {
        const i = parseInt(b.dataset.remove, 10);
        assigned.splice(i, 1);
        onChange(currentArray());
        paint();
      });
    });

    // Wire: input USD → guarda el valor introducido tal cual
    container.querySelectorAll('[data-usd]').forEach(inp => {
      inp.addEventListener('input', () => {
        const i = parseInt(inp.dataset.usd, 10);
        const usd = parseFloat(inp.value);
        if (isNaN(usd)) return;
        assigned[i].usdPnl = +usd.toFixed(2);
        onChange(currentArray());
      });
    });

    const sel = container.querySelector('#ca-select');
    if (sel) {
      sel.addEventListener('change', () => {
        const id = sel.value;
        if (!id) return;
        const c = cuentas.find(x => x.id === id);
        if (!c) return;
        // USD inicial: aplicamos el riesgo nominal default sobre el pnl_pct.
        // Si pnl_pct=0 (BE) o no se ha introducido aún, sale 0 — el usuario lo edita.
        const def = typeof opts.getDefaultRisk === 'function' ? opts.getDefaultRisk() : 1;
        const risk = isFinite(def) && def > 0 ? def : 1;
        const pnlPct = currentPnlPct();
        const usd = +(pnlPct * risk * (c.capital || 0) / 100).toFixed(2);
        assigned.push({ accountId: id, usdPnl: usd });
        onChange(currentArray());
        paint();
      });
    }
  }

  function currentArray() {
    return assigned.map(a => ({
      accountId: a.accountId,
      usdPnl: a.usdPnl,
    }));
  }

  paint();

  return {
    get: currentArray,
    refresh: paint,
  };
}

function capShort(c) {
  if (c >= 1000) return Math.round(c / 1000) + 'K';
  return String(c);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

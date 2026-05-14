// Sub-componente reutilizable: "asignar trade a una o varias cuentas".
// Usado en new-trade.js y trade-edit-modal.js.
//
// renderCuentaAssign(container, initial, onChange, opts) → { get, refresh }
//   - container: DOM element donde renderizar
//   - initial: array [{accountId, riskPct}] (puede estar vacío)
//   - onChange: callback(currentArray) cada vez que cambia
//   - opts.getDefaultRisk: () => number — riesgo % a usar al añadir cuenta
//   - opts.getPnlPct: () => number — pnl_pct actual del trade (para calcular USD)
//   - return.get(): devuelve el array actual
//   - return.refresh(): re-pinta (útil cuando cambia pnl_pct externamente)

import { state } from '../state.js';

export function renderCuentaAssign(container, initial = [], onChange = () => {}, opts = {}) {
  // Mantenemos una copia mutable
  let assigned = (Array.isArray(initial) ? initial : [])
    .filter(a => a && a.accountId)
    .map(a => ({
      accountId: a.accountId,
      riskPct: a.riskPct || 1.0,
    }));

  function currentPnlPct() {
    if (typeof opts.getPnlPct !== 'function') return 0;
    const v = opts.getPnlPct();
    return typeof v === 'number' && isFinite(v) ? v : 0;
  }

  // USD = pnl_pct × riskPct × capital / 100
  function computeUsd(pnlPct, riskPct, capital) {
    if (!isFinite(pnlPct) || !isFinite(riskPct) || !isFinite(capital)) return 0;
    return pnlPct * riskPct * capital / 100;
  }
  // riskPct = USD × 100 / (pnl_pct × capital)
  function computeRiskFromUsd(usd, pnlPct, capital) {
    if (!isFinite(usd) || !isFinite(pnlPct) || !isFinite(capital)) return NaN;
    if (pnlPct === 0 || capital === 0) return NaN;
    return usd * 100 / (pnlPct * capital);
  }

  function fmtUsdValue(v) {
    if (!isFinite(v)) return '';
    return v.toFixed(2);
  }

  function paint() {
    const cuentas = state.cuentas || [];
    const activas = cuentas.filter(c => c.status === 'activa');
    const noCuentas = cuentas.length === 0;
    const pnlPct = currentPnlPct();
    const usdDisabled = pnlPct === 0;

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

    // IDs ya asignados (para excluir del desplegable)
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
          const usd = computeUsd(pnlPct, a.riskPct, c.capital);
          const usdAttrs = usdDisabled
            ? 'disabled title="Introduce el % P&L del trade primero"'
            : '';
          return `<div class="ca-row">
            <span class="ca-label">${esc(c.empresa)} ${capShort(c.capital)} <span class="ca-meta">${c.numero ? '#' + esc(c.numero) : ''}</span></span>
            <span class="ca-risk">
              Riesgo
              <input type="number" step="0.01" min="0" max="100" value="${a.riskPct}" data-risk="${i}" class="ca-risk-input">
              %
            </span>
            <span class="ca-usd">
              P&L
              <input type="number" step="0.01" value="${usdDisabled ? '' : fmtUsdValue(usd)}" data-usd="${i}" class="ca-usd-input" ${usdAttrs}>
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

    // Wire: input % riesgo → recalcula USD
    container.querySelectorAll('[data-risk]').forEach(inp => {
      inp.addEventListener('input', () => {
        const i = parseInt(inp.dataset.risk, 10);
        const v = parseFloat(inp.value);
        if (!isNaN(v) && v >= 0 && v <= 100) {
          assigned[i].riskPct = v;
          onChange(currentArray());
          // Sincronizar el input USD de esa fila
          const c = state.cuentas.find(x => x.id === assigned[i].accountId);
          if (c && !usdDisabled) {
            const usdInp = container.querySelector(`[data-usd="${i}"]`);
            if (usdInp) usdInp.value = fmtUsdValue(computeUsd(pnlPct, v, c.capital));
          }
        }
      });
    });

    // Wire: input USD → recalcula riesgo %
    container.querySelectorAll('[data-usd]').forEach(inp => {
      inp.addEventListener('input', () => {
        if (usdDisabled) return;
        const i = parseInt(inp.dataset.usd, 10);
        const usd = parseFloat(inp.value);
        if (isNaN(usd)) return;
        const c = state.cuentas.find(x => x.id === assigned[i].accountId);
        if (!c) return;
        const newRisk = computeRiskFromUsd(usd, pnlPct, c.capital);
        if (!isFinite(newRisk) || newRisk < 0) return;
        // Permitimos cualquier valor (incluso > 100) — el usuario sabrá si es absurdo.
        const newRiskRounded = +newRisk.toFixed(4);
        assigned[i].riskPct = newRiskRounded;
        onChange(currentArray());
        // Sincronizar el input % de esa fila
        const riskInp = container.querySelector(`[data-risk="${i}"]`);
        if (riskInp) riskInp.value = newRiskRounded;
      });
    });

    const sel = container.querySelector('#ca-select');
    if (sel) {
      sel.addEventListener('change', () => {
        const id = sel.value;
        if (!id) return;
        const c = cuentas.find(x => x.id === id);
        if (!c) return;
        const def = typeof opts.getDefaultRisk === 'function' ? opts.getDefaultRisk() : 1;
        const risk = isFinite(def) && def > 0 ? def : 1;
        assigned.push({ accountId: id, riskPct: risk });
        onChange(currentArray());
        paint();
      });
    }
  }

  function currentArray() {
    return assigned.map(a => ({
      accountId: a.accountId,
      riskPct: a.riskPct,
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

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
//   - opts.getPnlPct: () => number — pnl_pct actual del trade, para calcular el
//     USD de cada cuenta y migrar asignaciones legacy. Si el formulario llama a
//     recalc() al cambiar el % P&L o el riesgo, el USD de las cuentas que puso
//     la app se actualiza; el que el usuario escribió a mano no se toca.
//   - opts.getRR: () => number — RR del trade. En cuentas de FUTUROS elige el
//     riesgo de la tabla de su gestión (RR 1:2 → 750 $, RR 1:1,5 → 1.000 $…).
//   - return.get(): devuelve el array actual
//   - return.refresh(): re-pinta (útil al añadir/quitar cuentas)
//   - return.recalc(): el % P&L o el riesgo del trade han cambiado
//
// Futuros: el USD inicial es R × riesgo en $ de la gestión de la cuenta (el
// pnl_pct del trade va en R: +2 = TP de 2R). Y se puede añadir un GRUPO de
// copiado entero de una vez: cada cuenta con su propia gestión.

import { state } from '../state.js';
import { riesgoSugerido, gestionEfectiva, usdEs } from '../utils/futures-risk.js';

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

  // `auto`: el $ lo calcula la app y se RECALCULA al cambiar el % P&L o el
  // riesgo del trade (antes se congelaba al marcar la cuenta, y si la marcabas
  // antes de rellenar el riesgo se quedaba al 1%). Al escribir el $ a mano deja
  // de ser auto. Lo ya guardado (al editar un trade) entra como manual: no se
  // toca lo que el alumno guardó.
  let assigned = normalize(initial).map(a => ({ ...a, auto: false }));

  function riesgoCfd() {
    const def = typeof opts.getDefaultRisk === 'function' ? opts.getDefaultRisk() : 1;
    return isFinite(def) && def > 0 ? def : 1;
  }

  // Riesgo en $ que se usa para la cuenta y de dónde sale (para enseñarlo).
  function riesgoDe(c) {
    if (c.tipo === 'Futuros') {
      const rr = typeof opts.getRR === 'function' ? opts.getRR() : NaN;
      const custom = state.config.futGestionesCustom;
      const { pendiente } = gestionEfectiva(c, custom);
      const r = riesgoSugerido(c, rr, custom);
      return { usd: r.usd, texto: `${usdEs(r.usd)} · gestión ${r.gestion.nombre}${pendiente ? ' (elige gestión en Riesgo Futuros)' : ''}`, pendiente };
    }
    const pct = riesgoCfd();
    const usd = pct * (c.capital || 0) / 100;
    return { usd, texto: `${String(+pct.toFixed(2)).replace('.', ',')} % de ${usdEs(c.capital || 0)} = ${usdEs(usd)}`, pendiente: false };
  }

  // USD al añadir una cuenta (y al recalcular): R × riesgo en $. CFD: riesgo
  // real % sobre el capital. Futuros: el de su gestión (el riesgo real % no
  // se usa). Si pnl_pct aún es 0 sale 0.
  function usdInicial(c) {
    return +(currentPnlPct() * riesgoDe(c).usd).toFixed(2);
  }

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
    // Grupos de copiado con alguna cuenta aún sin asignar
    const grupos = [...new Set(disponibles.filter(c => c.tipo === 'Futuros' && c.grupo).map(c => c.grupo))].sort();

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
          const rg = riesgoDe(c);
          return `<div class="ca-row">
            <span class="ca-label">${esc(c.empresa)} ${capShort(c.capital)} <span class="ca-meta">${c.numero ? '#' + esc(c.numero) : ''}${c.tipo === 'Futuros' && c.grupo ? ' · ' + esc(c.grupo) : ''}</span>
              <span class="ca-hint${rg.pendiente ? ' warn' : ''}" data-hint="${i}">${a.auto
                ? `Riesgo: ${esc(rg.texto)}`
                : `✎ $ fijado a mano · <a href="#" data-auto="${i}" title="Volver a calcularlo con el % P&L y el riesgo">recalcular (${esc(rg.texto)})</a>`}</span>
            </span>
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
        <div class="ca-add" style="display:flex;gap:8px;flex-wrap:wrap;">
          <select class="select" id="ca-select">
            <option value="">+ Añadir cuenta…</option>
            ${disponibles.map(c => `<option value="${c.id}">${esc(c.empresa)} ${capShort(c.capital)}${c.numero ? ' #' + esc(c.numero) : ''}</option>`).join('')}
          </select>
          ${grupos.length ? `<select class="select" id="ca-grupo">
            <option value="">+ Añadir grupo de copiado…</option>
            ${grupos.map(g => `<option value="${esc(g)}">${esc(g)} (${disponibles.filter(c => c.tipo === 'Futuros' && c.grupo === g).length})</option>`).join('')}
          </select>` : ''}
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
        if (assigned[i].auto) {
          // Escrito a mano: ya no se recalcula solo (sin repintar: perdería el foco)
          assigned[i].auto = false;
          const c = cuentas.find(x => x.id === assigned[i].accountId);
          const h = container.querySelector(`[data-hint="${i}"]`);
          if (c && h) h.innerHTML = `✎ $ fijado a mano · <a href="#" data-auto="${i}">recalcular (${esc(riesgoDe(c).texto)})</a>`;
          wireAuto();
        }
        onChange(currentArray());
      });
    });
    wireAuto();

    const sel = container.querySelector('#ca-select');
    if (sel) {
      sel.addEventListener('change', () => {
        const id = sel.value;
        if (!id) return;
        const c = cuentas.find(x => x.id === id);
        if (!c) return;
        assigned.push({ accountId: id, usdPnl: usdInicial(c), auto: true });
        onChange(currentArray());
        paint();
      });
    }

    // Grupo de copiado: añade todas sus cuentas activas aún sin asignar, cada
    // una con el riesgo de SU gestión (pueden ser distintas dentro del grupo).
    const selGrupo = container.querySelector('#ca-grupo');
    if (selGrupo) {
      selGrupo.addEventListener('change', () => {
        const g = selGrupo.value;
        if (!g) return;
        for (const c of disponibles.filter(x => x.tipo === 'Futuros' && x.grupo === g)) {
          assigned.push({ accountId: c.id, usdPnl: usdInicial(c), auto: true });
        }
        onChange(currentArray());
        paint();
      });
    }
  }

  // "recalcular": vuelve a calcular el $ de esa cuenta y a seguir los cambios.
  function wireAuto() {
    container.querySelectorAll('[data-auto]').forEach(l => {
      if (l.dataset.wired) return;
      l.dataset.wired = '1';
      l.addEventListener('click', e => {
        e.preventDefault();
        const a = assigned[parseInt(l.dataset.auto, 10)];
        const c = (state.cuentas || []).find(x => x.id === a.accountId);
        if (!c) return;
        a.auto = true;
        a.usdPnl = usdInicial(c);
        onChange(currentArray());
        paint();
      });
    });
  }

  // El % P&L o el riesgo del trade han cambiado: recalcula las cuentas cuyo $
  // pone la app (no las escritas a mano) y el texto del riesgo usado.
  function recalc() {
    const cuentas = state.cuentas || [];
    let cambio = false;
    assigned.forEach((a, i) => {
      const c = cuentas.find(x => x.id === a.accountId);
      if (!c) return;
      if (a.auto) {
        const usd = usdInicial(c);
        if (usd !== a.usdPnl) { a.usdPnl = usd; cambio = true; }
        const inp = container.querySelector(`[data-usd="${i}"]`);
        if (inp) inp.value = fmtUsdValue(usd);
      }
      const h = container.querySelector(`[data-hint="${i}"]`);
      const rg = riesgoDe(c);
      if (h) {
        h.classList.toggle('warn', rg.pendiente);
        h.innerHTML = a.auto
          ? `Riesgo: ${esc(rg.texto)}`
          : `✎ $ fijado a mano · <a href="#" data-auto="${i}">recalcular (${esc(rg.texto)})</a>`;
      }
    });
    wireAuto();
    if (cambio) onChange(currentArray());
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
    recalc,
  };
}

function capShort(c) {
  if (c >= 1000) { const k = c / 1000; return (k % 1 === 0 ? k : +k.toFixed(1)) + 'K'; }
  return String(c);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

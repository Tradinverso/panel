// Vista "Riesgo / Rotación" — asesor de gestión de riesgo por niveles + rotación
// de cuentas. SOLO LECTURA respecto a los trades: el balance y el drawdown se
// derivan del equity de cada cuenta (accountStats), no se introducen a mano.
// Los trades se siguen registrando en "Nuevo trade".
//
// Aporta sobre la vista "Cuentas":
//   · Nivel de riesgo activo de cada cuenta según su drawdown.
//   · Riesgo % e importe sugerido para el PRÓXIMO trade.
//   · Secuencia de rotación (SL → siguiente cuenta, TP → se queda).
//   · Perfiles de riesgo reutilizables.

import { state } from '../state.js';
import { openModal } from '../components/modal.js';
import { renderPills } from '../components/pills.js';
import { gestionTabs } from '../components/gestion-tabs.js';
import { accountStats, fmtUsd } from '../utils/account-stats.js';
import {
  calcNiveles, calcNivelActivo, resolveRiesgoConfig,
  PERFILES_BUILTIN,
} from '../utils/risk-levels.js';

let activeTab = 'cuentas';   // cuentas | resumen | gestionar | perfiles
let filterTipo = 'all';      // all | CFD | Futuros
const openAccordions = new Set();

const GRUPOS = [
  { fase: 'challenge_1', label: '1ª Fase',  short: '1F', cls: 'g1' },
  { fase: 'challenge_2', label: '2ª Fase',  short: '2F', cls: 'g2' },
  { fase: 'fondeada',    label: 'Fondeada', short: '★',  cls: 'gf' },
];
const FASE_TO_GRUPO = Object.fromEntries(GRUPOS.map(g => [g.fase, g]));

// ── Helpers de datos ────────────────────────────────────────
// Solo las cuentas ACTIVAS entran en el módulo de riesgo. Las pausadas, pasadas
// o perdidas no se gestionan aquí (no tiene sentido asignarles riesgo/rotación).
function cuentasActivas() {
  return state.cuentas.filter(c => c.status === 'activa');
}
// Subconjunto que ven las pestañas: activas filtradas por tipo (CFD/Futuros).
function cuentasModulo() {
  return cuentasActivas().filter(c => filterTipo === 'all' || c.tipo === filterTipo);
}

// Perfiles disponibles = 4 presets (siempre presentes, desde código) + perfiles
// custom del usuario. Si el usuario edita un preset, su versión guardada (mismo
// id) SOBREESCRIBE al preset. Así los presets aparecen siempre, aunque la
// persistencia falle, y siguen siendo editables.
function allPerfiles() {
  const stored = new Map(state.perfiles.map(p => [p.id, p]));
  const presets = PERFILES_BUILTIN.map(b => stored.get(b.id) || b);
  const customs = state.perfiles.filter(p => !isPresetId(p.id));
  return [...presets, ...customs];
}

function isPresetId(id) {
  return PERFILES_BUILTIN.some(b => b.id === id);
}

// ¿El usuario ha editado (guardado una versión propia de) este preset?
function isPresetOverridden(id) {
  return isPresetId(id) && state.perfiles.some(p => p.id === id);
}

// Cuentas activas en rotación, ordenadas por orden de rotación y antigüedad.
function rotacionList() {
  return cuentasModulo()
    .filter(c => c.enRotacion !== false)
    .sort((a, b) => (a.rotacionOrden || 0) - (b.rotacionOrden || 0) || (a.createdAt || 0) - (b.createdAt || 0));
}

function activaId() {
  const rot = rotacionList();
  const id = state.config.rotacionActivaId;
  if (id && rot.some(c => c.id === id)) return id;
  return rot.length ? rot[0].id : null;
}

// Calcula todo lo derivado de una cuenta (equity, nivel, próximo riesgo).
function riskOf(cuenta) {
  const stats = accountStats(cuenta, state.trades);
  const { riesgoBase, multiplicador, perfil } = resolveRiesgoConfig(cuenta, allPerfiles());
  const niveles = calcNiveles(riesgoBase, multiplicador, cuenta.capital);
  const nivelActual = calcNivelActivo(stats.equityUsd, cuenta.capital, niveles);
  const proxNivel = niveles[nivelActual - 1] || niveles[0];
  const pctCuenta = cuenta.capital > 0 ? (stats.equityUsd - cuenta.capital) / cuenta.capital : 0;
  return { stats, equity: stats.equityUsd, riesgoBase, multiplicador, perfil, niveles, nivelActual, proxNivel, pctCuenta };
}

function statusOf(pct) {
  if (pct >= 0) return 'ok';
  if (pct >= -0.02) return 'warn';
  if (pct >= -0.05) return 'danger';
  return 'limit';
}

const pf = n => (n >= 0 ? '+' : '') + (n * 100).toFixed(2) + '%';

// ── Render principal ────────────────────────────────────────
function render(container) {
  const activas = cuentasActivas();
  const cuentas = cuentasModulo();

  container.innerHTML = `
    ${gestionTabs('riesgo')}
    <div class="page-header">
      <div>
        <h1>Riesgo / Rotación</h1>
        <div class="sub">Escalado de riesgo por niveles · ${cuentas.length} cuenta${cuentas.length !== 1 ? 's' : ''} activa${cuentas.length !== 1 ? 's' : ''}${filterTipo !== 'all' ? ` · ${esc(filterTipo)}` : ''}</div>
      </div>
      ${activas.length ? `<div class="page-actions"><div class="type-tabs" id="rgTypeTabs"></div></div>` : ''}
    </div>

    ${activas.length === 0 ? emptyState() : `
      <div class="rg-tabs" id="rgTabs">
        ${tabBtn('cuentas', 'Cuentas')}
        ${tabBtn('resumen', 'Resumen')}
        ${tabBtn('gestionar', 'Gestionar')}
        ${tabBtn('perfiles', 'Perfiles')}
      </div>
      ${cuentas.length === 0
        ? '<div class="empty">No tienes cuentas activas de este tipo.</div>'
        : '<div id="rgPanel"></div>'}
    `}
  `;

  const typeTabsEl = container.querySelector('#rgTypeTabs');
  if (typeTabsEl) {
    renderPills(typeTabsEl, {
      name: 'rgTipo',
      options: [
        { value: 'all', label: 'Todas' },
        { value: 'CFD', label: 'CFD' },
        { value: 'Futuros', label: 'Futuros' },
      ],
      value: filterTipo,
      onChange: v => { filterTipo = v; render(container); },
    });
  }

  if (activas.length) {
    container.querySelectorAll('[data-tab]').forEach(b => {
      b.addEventListener('click', () => { activeTab = b.dataset.tab; render(container); });
    });
    if (cuentas.length) renderPanel(container);
  }
}

function tabBtn(id, label) {
  return `<button class="rg-tab ${activeTab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`;
}

function renderPanel(container) {
  const panel = container.querySelector('#rgPanel');
  if (!panel) return;
  if (activeTab === 'cuentas')   { panel.innerHTML = renderCuentasTab();   wireCuentasTab(container); }
  else if (activeTab === 'resumen')   { panel.innerHTML = renderResumenTab(); }
  else if (activeTab === 'gestionar') { panel.innerHTML = renderGestionarTab(); wireGestionarTab(container); }
  else if (activeTab === 'perfiles')  { panel.innerHTML = renderPerfilesTab();  wirePerfilesTab(container); }
}

// ── TAB: Cuentas (banner rotación + cards) ──────────────────
function renderCuentasTab() {
  const rot = rotacionList();
  const actId = activaId();
  const activa = state.cuentas.find(c => c.id === actId);

  let banner = '';
  if (activa) {
    const r = riskOf(activa);
    const idx = rot.findIndex(c => c.id === actId);
    const seq = Array.from({ length: Math.min(rot.length, 4) }, (_, i) => rot[(idx + i) % rot.length]);
    banner = `
      <div class="rg-banner">
        <div>
          <div class="rg-banner-label">Cuenta activa</div>
          <div class="rg-banner-name">${esc(activa.empresa)} ${activa.numero ? '#' + esc(activa.numero) : ''}</div>
          <div class="rg-banner-meta">${fmtUsd(r.equity)} · ${pf(r.pctCuenta)} · Nivel ${r.nivelActual} · Próx. riesgo <b>${(r.proxNivel.pct * 100).toFixed(2)}%</b> (${fmtUsd(r.proxNivel.importe)})</div>
        </div>
        <div class="rg-seq">
          ${seq.map((c, i) => `
            ${i > 0 ? '<span class="rg-arr">→</span>' : ''}
            <span class="rg-pill ${i === 0 ? 'cur' : i === 1 ? 'nxt' : ''}">${esc(c.empresa)}</span>
          `).join('')}
        </div>
      </div>
      <div class="rg-advisor">
        💡 Próximo trade en <b>${esc(activa.empresa)}</b>: arriésga <b>${(r.proxNivel.pct * 100).toFixed(2)}%</b> ≈ <b>${fmtUsd(r.proxNivel.importe)}</b>.
        Regístralo en <a href="#/nuevo">Nuevo trade</a>; con SL la rotación pasa a la siguiente cuenta.
      </div>
    `;
  }

  const cards = GRUPOS.map(g => {
    const gr = cuentasModulo().filter(c => c.fase === g.fase);
    if (!gr.length) return '';
    return `
      <div class="rg-group">
        <div class="rg-group-hdr">
          <span class="rg-gtag ${g.cls}">${g.short}</span>
          <span class="rg-group-title">${g.label}</span>
          <span class="rg-group-count">${gr.length}</span>
        </div>
        <div class="rg-group-body">${gr.map(c => cuentaCard(c, actId)).join('')}</div>
      </div>`;
  }).join('');

  return banner + `<div class="rg-groups">${cards}</div>`;
}

function cuentaCard(c, actId) {
  const r = riskOf(c);
  const isAct = c.id === actId;
  const excl = c.enRotacion === false;
  return `
    <div class="rg-card ${statusOf(r.pctCuenta)} ${isAct ? 'activa' : ''}" data-card="${c.id}">
      <div class="rg-card-top">
        <span class="rg-card-name">${esc(c.empresa)}${c.numero ? ' #' + esc(c.numero) : ''}</span>
        <div class="rg-card-tags">
          ${isAct ? '<span class="rg-tag-active">Activa</span>' : ''}
          ${excl ? '<span class="rg-tag-excl">Excluida</span>' : ''}
        </div>
      </div>
      ${r.perfil ? `<div class="rg-card-perfil"><span>${esc(r.perfil.nombre)}</span></div>` : ''}
      <div class="rg-card-bal">${fmtUsd(r.equity)}</div>
      <div class="rg-card-row">
        <span class="rg-card-pct ${r.pctCuenta >= 0 ? 'pos' : 'neg'}">${pf(r.pctCuenta)}</span>
        <span class="nlvl n${r.nivelActual}">N${r.nivelActual}</span>
      </div>
      <div class="rg-card-risk">
        <span>Próx. riesgo</span>
        <strong>${(r.proxNivel.pct * 100).toFixed(2)}% · ${fmtUsd(r.proxNivel.importe)}</strong>
      </div>
    </div>`;
}

function wireCuentasTab(container) {
  container.querySelectorAll('[data-card]').forEach(el => {
    el.addEventListener('click', () => {
      activeTab = 'gestionar';
      openAccordions.add(el.dataset.card);
      render(container);
    });
  });
}

// ── TAB: Resumen (KPIs + alertas + tabla) ───────────────────
function renderResumenTab() {
  const cuentas = cuentasModulo();
  const totalCap = cuentas.reduce((s, c) => s + (c.capital || 0), 0);
  const totalBal = cuentas.reduce((s, c) => s + riskOf(c).equity, 0);
  const pnl = totalBal - totalCap;
  const pnlPct = totalCap > 0 ? pnl / totalCap : 0;
  const pos = cuentas.filter(c => riskOf(c).equity > c.capital).length;
  const neg = cuentas.filter(c => riskOf(c).equity < c.capital).length;

  const alertas = buildAlertas();

  const filas = cuentas.map(c => {
    const r = riskOf(c);
    const ben = r.equity - c.capital;
    const g = FASE_TO_GRUPO[c.fase] || GRUPOS[0];
    return `
      <tr>
        <td><div style="font-weight:700;">${esc(c.empresa)}</div><span class="rg-gtag ${g.cls}" style="font-size:9px;">${g.short} ${g.label}</span></td>
        <td class="mono">${fmtUsd(c.capital)}</td>
        <td class="mono" style="font-weight:700;">${fmtUsd(r.equity)}</td>
        <td class="mono" style="color:${ben >= 0 ? 'var(--green)' : 'var(--red)'};">${fmtUsd(ben, true)}</td>
        <td class="mono" style="color:${r.pctCuenta >= 0 ? 'var(--green)' : r.pctCuenta >= -0.03 ? 'var(--orange)' : 'var(--red)'};font-weight:700;">${pf(r.pctCuenta)}</td>
        <td><span class="nlvl n${r.nivelActual}">N${r.nivelActual}</span></td>
        <td class="mono">${(r.proxNivel.pct * 100).toFixed(2)}% · ${fmtUsd(r.proxNivel.importe)}</td>
      </tr>`;
  }).join('');

  return `
    <div class="kpi-grid">
      <div class="kpi-card blue">
        <div class="kpi-label">Balance total</div>
        <div class="kpi-value ${totalBal >= totalCap ? 'green' : 'red'}">${fmtUsd(totalBal)}</div>
        <div class="kpi-sub">Capital: ${fmtUsd(totalCap)}</div>
      </div>
      <div class="kpi-card ${pnl >= 0 ? 'green' : 'red'}">
        <div class="kpi-label">P&L total</div>
        <div class="kpi-value ${pnl >= 0 ? 'green' : 'red'}">${fmtUsd(pnl, true)}</div>
        <div class="kpi-sub">${pf(pnlPct)} sobre capital</div>
      </div>
      <div class="kpi-card purple">
        <div class="kpi-label">Cuentas</div>
        <div class="kpi-value">${cuentas.length}</div>
        <div class="kpi-sub"><span style="color:var(--green);">▲${pos}</span> · <span style="color:var(--red);">▼${neg}</span></div>
      </div>
    </div>

    <div class="section-title">Alertas</div>
    <div class="rg-alertas">${alertas.map(a => `
      <div class="rg-alerta ${a.t}">
        <span class="rg-alerta-icon">${a.i}</span>
        <div><div class="rg-alerta-title">${a.ti}</div><div class="rg-alerta-desc">${a.d}</div></div>
      </div>`).join('')}</div>

    <div class="section-title">Detalle</div>
    <div class="card table-card" style="padding:0;">
      <table class="data-table rg-table">
        <thead><tr><th>Cuenta</th><th>Capital</th><th>Balance</th><th>P&L</th><th>%</th><th>Nivel</th><th>Próx. riesgo</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;
}

function buildAlertas() {
  const out = [];
  for (const c of cuentasModulo()) {
    const r = riskOf(c);
    const p = r.pctCuenta;
    const nom = esc(c.empresa);
    if (p <= -0.05)      out.push({ t: 'critical', i: '🔴', ti: `${nom} — Límite crítico`, d: `Pérdida del ${(Math.abs(p) * 100).toFixed(2)}%. Considera pausar.` });
    else if (p <= -0.03) out.push({ t: 'danger',   i: '🟠', ti: `${nom} — Alto riesgo`,   d: `Pérdida del ${(Math.abs(p) * 100).toFixed(2)}%. Nivel ${r.nivelActual} activo.` });
    else if (p <= -0.015) out.push({ t: 'warn',    i: '🟡', ti: `${nom} — Atención`,      d: `Pérdida del ${(Math.abs(p) * 100).toFixed(2)}%. Monitorizar.` });
    if (r.nivelActual >= 6) out.push({ t: 'danger', i: '⚡', ti: `${nom} — Nivel ${r.nivelActual}`, d: `Riesgo elevado. Próximo: ${(r.proxNivel.pct * 100).toFixed(2)}%.` });

    // Objetivo de ganancia (targetUsd) y límite de pérdida (maxDdUsd)
    const ben = r.equity - c.capital;
    if (c.targetUsd > 0) {
      const prog = ben / c.targetUsd;
      if (prog >= 1)       out.push({ t: 'ok', i: '🎯', ti: `${nom} — ¡Objetivo alcanzado!`, d: `Ganancia ${fmtUsd(ben)} de ${fmtUsd(c.targetUsd)}.` });
      else if (prog >= 0.8) out.push({ t: 'ok', i: '📈', ti: `${nom} — Cerca del objetivo`,  d: `${Math.round(prog * 100)}% completado (${fmtUsd(ben)} de ${fmtUsd(c.targetUsd)}).` });
    }
    if (c.maxDdUsd > 0 && ben < 0) {
      const prog = Math.abs(ben) / c.maxDdUsd;
      if (prog >= 1)        out.push({ t: 'critical', i: '⛔', ti: `${nom} — Límite de pérdida alcanzado`, d: `Drawdown máximo de ${fmtUsd(c.maxDdUsd)} alcanzado.` });
      else if (prog >= 0.8) out.push({ t: 'danger',   i: '⚠️', ti: `${nom} — Cerca del límite`,          d: `${Math.round(prog * 100)}% del límite (${fmtUsd(Math.abs(ben))} / ${fmtUsd(c.maxDdUsd)}).` });
    }
  }
  if (!out.length) out.push({ t: 'ok', i: '✅', ti: 'Todo en orden', d: 'Sin alertas activas.' });
  return out;
}

// ── TAB: Gestionar (config por cuenta + rotación) ───────────
function renderGestionarTab() {
  const rot = rotacionList();
  const actId = activaId();
  const perfilOpts = allPerfiles();

  const acordeones = cuentasModulo().map(c => {
    const r = riskOf(c);
    const g = FASE_TO_GRUPO[c.fase] || GRUPOS[0];
    const open = openAccordions.has(c.id);
    return `
      <div class="rg-acc">
        <div class="rg-acc-hdr" data-acc="${c.id}">
          <div class="rg-acc-l">
            <span class="rg-acc-name">${esc(c.empresa)}${c.numero ? ' #' + esc(c.numero) : ''}</span>
            <span class="nlvl n${r.nivelActual}">N${r.nivelActual}</span>
            <span class="rg-gtag ${g.cls}">${g.short}</span>
            ${c.id === actId ? '<span class="rg-tag-active">Activa</span>' : ''}
            ${r.perfil ? `<span class="rg-acc-perfil">${esc(r.perfil.nombre)}</span>` : ''}
            <span class="rg-acc-meta">${fmtUsd(r.equity)} · ${pf(r.pctCuenta)}</span>
          </div>
          <span class="rg-chev ${open ? 'open' : ''}">⌄</span>
        </div>
        <div class="rg-acc-body ${open ? 'open' : ''}">
          <div class="rg-acc-actions">
            <button class="btn ${c.id === actId ? 'primary' : ''}" data-set-activa="${c.id}" ${c.id === actId ? 'disabled' : ''}>Poner activa</button>
            <button class="btn" data-next-sl="${c.id}" title="Simula un SL: pasa la rotación a la siguiente cuenta (no registra ningún trade)">Siguiente (SL) →</button>
            <label class="rg-toggle">
              <input type="checkbox" data-rot="${c.id}" ${c.enRotacion !== false ? 'checked' : ''}>
              <span>En rotación</span>
            </label>
          </div>

          <div class="rg-field-grid">
            <div>
              <div class="rg-flabel">Perfil de riesgo</div>
              <select class="select" data-perfil="${c.id}">
                <option value="">— Personalizado —</option>
                ${perfilOpts.map(p => `<option value="${p.id}" ${c.perfilId === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}
              </select>
            </div>
            <div>
              <div class="rg-flabel">Riesgo base (%)</div>
              <input class="form-input mono" type="number" step="0.001" min="0.001" data-rb="${c.id}" value="${(r.riesgoBase * 100).toFixed(3)}">
            </div>
            <div>
              <div class="rg-flabel">Multiplicador</div>
              <input class="form-input mono" type="number" step="0.01" min="1" data-mu="${c.id}" value="${r.multiplicador.toFixed(3)}">
            </div>
            <div style="display:flex;align-items:flex-end;">
              <button class="btn primary" data-save-cfg="${c.id}" style="width:100%;">Guardar config</button>
            </div>
          </div>

          <div class="rg-flabel" style="margin-top:14px;">Tabla de niveles</div>
          <table class="data-table rg-niv-table">
            <thead><tr><th>Nivel</th><th>% Riesgo</th><th>Importe</th><th>Si SL</th><th>Si TP</th></tr></thead>
            <tbody>${r.niveles.map(n => `
              <tr class="${r.nivelActual === n.nivel ? 'arow' : ''}">
                <td><span class="nlvl n${n.nivel}">N${n.nivel}</span></td>
                <td class="mono" style="color:var(--accent);font-weight:700;">${(n.pct * 100).toFixed(3)}%</td>
                <td class="mono">${fmtUsd(n.importe)}</td>
                <td style="color:var(--red);">↑ N${Math.min(n.nivel + 1, 7)}</td>
                <td style="color:var(--green);">↓ N1</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }).join('');

  const ordenBlock = rot.length > 1 ? `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-title">Orden de rotación</div>
      <div class="card-sub">Sube o baja las cuentas para fijar el orden. Con SL salta a la siguiente.</div>
      <div class="rg-orden">
        ${rot.map((c, i) => `
          <div class="rg-orden-item">
            <span class="rg-orden-num">${i + 1}</span>
            <span class="rg-orden-name">${esc(c.empresa)}${c.numero ? ' #' + esc(c.numero) : ''}</span>
            <div class="rg-orden-actions">
              <button class="btn ghost" data-rot-up="${c.id}" ${i === 0 ? 'disabled' : ''} title="Subir">▲</button>
              <button class="btn ghost" data-rot-down="${c.id}" ${i === rot.length - 1 ? 'disabled' : ''} title="Bajar">▼</button>
            </div>
          </div>`).join('')}
      </div>
    </div>` : '';

  return `
    ${ordenBlock}
    <div class="rg-hint">La cuenta activa avanza con "Siguiente (SL)" sin registrar ningún trade. Cambiar el perfil o los valores recalcula los niveles al instante.</div>
    ${acordeones}`;
}

function wireGestionarTab(container) {
  const rotIds = () => rotacionList().map(c => c.id);
  container.querySelectorAll('[data-rot-up]').forEach(b => b.addEventListener('click', () => {
    const ids = rotIds(); const i = ids.indexOf(b.dataset.rotUp);
    if (i > 0) { [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; state.reorderRotacion(ids); }
  }));
  container.querySelectorAll('[data-rot-down]').forEach(b => b.addEventListener('click', () => {
    const ids = rotIds(); const i = ids.indexOf(b.dataset.rotDown);
    if (i >= 0 && i < ids.length - 1) { [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; state.reorderRotacion(ids); }
  }));

  container.querySelectorAll('[data-acc]').forEach(h => {
    h.addEventListener('click', e => {
      if (e.target.closest('input,button,select,a,label')) return;
      const id = h.dataset.acc;
      if (openAccordions.has(id)) openAccordions.delete(id); else openAccordions.add(id);
      render(container);
    });
  });

  container.querySelectorAll('[data-set-activa]').forEach(b => {
    b.addEventListener('click', () => { state.setConfig({ rotacionActivaId: b.dataset.setActiva }); });
  });

  container.querySelectorAll('[data-next-sl]').forEach(b => {
    b.addEventListener('click', () => {
      const rot = rotacionList();
      if (rot.length < 2) return;
      const from = b.dataset.nextSl;
      let idx = rot.findIndex(c => c.id === from);
      if (idx < 0) idx = rot.findIndex(c => c.id === activaId());
      const next = rot[(idx + 1) % rot.length];
      state.setConfig({ rotacionActivaId: next.id });
    });
  });

  container.querySelectorAll('[data-rot]').forEach(chk => {
    chk.addEventListener('change', () => {
      state.updateCuenta(chk.dataset.rot, { enRotacion: chk.checked });
    });
  });

  // Al elegir perfil, autocompletar riesgo/multiplicador en los inputs (no guarda aún).
  container.querySelectorAll('[data-perfil]').forEach(sel => {
    sel.addEventListener('change', () => {
      const id = sel.dataset.perfil;
      const p = allPerfiles().find(x => x.id === sel.value);
      if (p) {
        const rb = container.querySelector(`[data-rb="${id}"]`);
        const mu = container.querySelector(`[data-mu="${id}"]`);
        if (rb) rb.value = (p.riesgoBase * 100).toFixed(3);
        if (mu) mu.value = p.multiplicador.toFixed(3);
      }
    });
  });

  container.querySelectorAll('[data-save-cfg]').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.saveCfg;
      const rb = parseFloat(container.querySelector(`[data-rb="${id}"]`).value) / 100;
      const mu = parseFloat(container.querySelector(`[data-mu="${id}"]`).value);
      const perfilId = container.querySelector(`[data-perfil="${id}"]`).value || null;
      if (!isFinite(rb) || rb <= 0 || !isFinite(mu) || mu < 1) { flash(container, 'Valores no válidos', 'err'); return; }
      openAccordions.add(id);
      state.updateCuenta(id, { riesgoBase: rb, multiplicador: mu, perfilId });
      flash(container, 'Config de riesgo guardada');
    });
  });
}

// ── TAB: Perfiles (presets + custom) ────────────────────────
function renderPerfilesTab() {
  const list = allPerfiles().map(p => {
    const niveles = calcNiveles(p.riesgoBase, p.multiplicador, 100000);
    const asoc = cuentasModulo().filter(c => c.perfilId === p.id);
    const preset = isPresetId(p.id);
    const overridden = isPresetOverridden(p.id);
    return `
      <div class="rg-perfil">
        <div class="rg-perfil-hdr">
          <div>
            <div class="rg-perfil-name">${esc(p.nombre)} ${preset ? '<span class="rg-preset">predeterminado</span>' : ''}</div>
            ${p.descripcion ? `<div class="rg-perfil-desc">${esc(p.descripcion)}</div>` : ''}
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn" data-edit-perfil="${p.id}">Editar</button>
            ${preset
              ? (overridden ? `<button class="btn" data-restore-perfil="${p.id}" title="Volver a los valores originales">Restaurar</button>` : '')
              : `<button class="btn danger" data-del-perfil="${p.id}">Eliminar</button>`}
          </div>
        </div>
        <div class="rg-perfil-pills">
          <span class="rg-ppill b">Base ${(p.riesgoBase * 100).toFixed(3)}%</span>
          <span class="rg-ppill g">×${p.multiplicador.toFixed(2)}</span>
          ${asoc.length ? `<span class="rg-ppill">${asoc.map(c => esc(c.empresa)).join(', ')}</span>` : ''}
        </div>
        <div class="rg-niv-preview">${niveles.map(n => `<div class="np"><div class="np-lbl">N${n.nivel}</div><div class="np-val">${(n.pct * 100).toFixed(2)}%</div></div>`).join('')}</div>
      </div>`;
  }).join('');

  return `
    <div class="section-title-row">
      <div class="section-title" style="margin:0;">Perfiles de riesgo</div>
      <button class="btn primary" id="newPerfilBtn">+ Nuevo perfil</button>
    </div>
    <div class="rg-hint">Los 4 <b>predeterminados</b> siempre están disponibles y puedes editarlos (luego "Restaurar" los devuelve a su valor original). Crea perfiles propios para tus configuraciones.</div>
    ${list}`;
}

function wirePerfilesTab(container) {
  const newBtn = container.querySelector('#newPerfilBtn');
  if (newBtn) newBtn.addEventListener('click', () => openPerfilModal(null, container));

  container.querySelectorAll('[data-edit-perfil]').forEach(b => {
    b.addEventListener('click', () => {
      const p = allPerfiles().find(x => x.id === b.dataset.editPerfil);
      if (p) openPerfilModal(p, container);
    });
  });

  container.querySelectorAll('[data-del-perfil]').forEach(b => {
    b.addEventListener('click', () => {
      const p = allPerfiles().find(x => x.id === b.dataset.delPerfil);
      if (!p) return;
      openModal({
        title: 'Eliminar perfil',
        body: `¿Eliminar el perfil <strong>${esc(p.nombre)}</strong>? Las cuentas que lo usen pasarán a configuración personalizada.`,
        actions: [
          { label: 'Cancelar', onClick: c => c() },
          { label: 'Eliminar', variant: 'danger', onClick: c => { state.deletePerfil(p.id); c(); } },
        ],
      });
    });
  });

  // Restaurar un preset editado a sus valores originales: borra el override
  // guardado (las cuentas siguen apuntando al preset, que vuelve al default).
  container.querySelectorAll('[data-restore-perfil]').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.restorePerfil;
      state.deletePerfil(id, { keepAssignments: true });
    });
  });
}

function openPerfilModal(perfil, container) {
  const editing = !!perfil;
  openModal({
    title: editing ? 'Editar perfil' : 'Nuevo perfil',
    body: `
      <div class="form" style="max-width:none;">
        <div class="form-field">
          <label class="form-label">Nombre <span class="required">*</span></label>
          <input class="form-input" id="pfNombre" value="${editing ? esc(perfil.nombre) : ''}" placeholder="ej: Agresivo 2%">
        </div>
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Riesgo base (%)</label>
            <input class="form-input mono" id="pfRb" type="number" step="0.001" value="${editing ? (perfil.riesgoBase * 100).toFixed(3) : '0.500'}">
          </div>
          <div class="form-field">
            <label class="form-label">Multiplicador</label>
            <input class="form-input mono" id="pfMu" type="number" step="0.01" value="${editing ? perfil.multiplicador.toFixed(3) : '1.300'}">
          </div>
        </div>
        <div class="form-field">
          <label class="form-label">Descripción</label>
          <input class="form-input" id="pfDesc" value="${editing ? esc(perfil.descripcion || '') : ''}" placeholder="Opcional…">
        </div>
      </div>
    `,
    actions: [
      { label: 'Cancelar', onClick: c => c() },
      { label: editing ? 'Actualizar' : 'Crear', variant: 'primary', onClick: c => {
        const root = document.getElementById('modal-root');
        const nombre = root.querySelector('#pfNombre').value.trim();
        const rb = parseFloat(root.querySelector('#pfRb').value) / 100;
        const mu = parseFloat(root.querySelector('#pfMu').value);
        const desc = root.querySelector('#pfDesc').value.trim();
        if (!nombre) { root.querySelector('#pfNombre').focus(); return; }
        const payload = { nombre, riesgoBase: rb, multiplicador: mu, descripcion: desc };
        if (editing) {
          // Si ya hay una versión guardada (custom u override), actualízala;
          // si es un preset que se edita por primera vez, créalo con SU id
          // (override). Para custom nuevos, addPerfil genera un id.
          if (state.perfiles.some(x => x.id === perfil.id)) state.updatePerfil(perfil.id, payload);
          else state.addPerfil({ ...payload, id: perfil.id });
        } else {
          state.addPerfil(payload);
        }
        c();
      } },
    ],
  });
}

// ── Utilidades ──────────────────────────────────────────────
function emptyState() {
  return `
    <div class="empty">
      <div class="big">🎯</div>
      <div>No tienes cuentas activas.</div>
      <div style="margin-top:8px;font-size:11px;color:var(--muted);">Solo las cuentas con estado <b>Activa</b> aparecen aquí. Crea o reactiva cuentas en <a href="#/cuentas">Cuentas</a> para ver su nivel de riesgo y la rotación.</div>
    </div>`;
}

function flash(container, msg, type = 'ok') {
  const ex = document.querySelector('.rg-flash');
  if (ex) ex.remove();
  const el = document.createElement('div');
  el.className = 'rg-flash flash import-result ' + type;
  el.textContent = msg;
  el.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;max-width:320px;';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

export function riesgoView(container) {
  render(container);
  return state.on(() => render(container));
}

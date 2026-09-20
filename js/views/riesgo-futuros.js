// Riesgo / Rotación — sección FUTUROS.
//
// Distinta de la de CFD (riesgo.js): aquí no hay niveles ni multiplicadores.
// Cada cuenta tiene una gestión de riesgo fijo en $ (utils/futures-risk.js) y
// la rotación va por UNIDADES: grupos de copiado o cuentas sueltas.
//
// Pestañas:
//   · Rotación  → unidad activa, lo que toca arriesgar en cada cuenta, y todas
//                 las cuentas agrupadas por unidad.
//   · Gestionar → orden de rotación, y por cuenta: gestión, grupo, en rotación.
//   · Gestiones → la tabla de la academia, como referencia.

import { state } from '../state.js';
import { openModal } from '../components/modal.js';
import { accountStats, fmtUsd } from '../utils/account-stats.js';
import {
  todasGestiones, sanitizeGestion, gestionesDeFase, gestionEfectiva, faseGestion, riesgoTexto,
  unidadesRotacion, unidadActiva, unidadNombre, BASE_CAPITAL, usdEs,
} from '../utils/futures-risk.js';

let futTab = 'rotacion';   // rotacion | gestionar | gestiones

const FASE = {
  challenge_1: { short: '1F', cls: 'g1', label: '1ª Fase' },
  challenge_2: { short: '2F', cls: 'g2', label: '2ª Fase' },
  fondeada:    { short: '★',  cls: 'gf', label: 'Fondeada' },
};

// Todas las cuentas de futuros activas (también las que están fuera de la rotación).
export function cuentasFuturos() {
  return state.cuentas
    .filter(c => c.status === 'activa' && c.tipo === 'Futuros')
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

// Gestiones personalizadas del usuario (config). Se pasan a todas las
// funciones de futures-risk para que cuenten igual que las 7 de la academia.
function custom() {
  return state.config.futGestionesCustom || [];
}

function units() {
  return unidadesRotacion(state.cuentas, state.config.futRotacionOrden || []);
}

function gruposExistentes() {
  return [...new Set(cuentasFuturos().map(c => c.grupo).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

const pf = n => (n >= 0 ? '+' : '') + (n * 100).toFixed(2) + '%';

// ── Render ───────────────────────────────────────────────────
export function renderFuturos(el, rerender) {
  const cuentas = cuentasFuturos();
  if (!cuentas.length) {
    el.innerHTML = `<div class="empty">No tienes cuentas de <b>Futuros</b> activas.<br>
      <span style="font-size:11px;color:var(--muted);">Al crear o editar una cuenta en <a href="#/cuentas">Cuentas</a>, elige el tipo <b>Futuros</b>.</span></div>`;
    return;
  }
  el.innerHTML = `
    <div class="rg-tabs">
      ${tab('rotacion', 'Rotación')}
      ${tab('gestionar', 'Gestionar')}
      ${tab('gestiones', 'Gestiones')}
    </div>
    <div id="futPanel"></div>`;
  el.querySelectorAll('[data-fut-tab]').forEach(b =>
    b.addEventListener('click', () => { futTab = b.dataset.futTab; rerender(); }));

  const panel = el.querySelector('#futPanel');
  if (futTab === 'gestionar') { panel.innerHTML = gestionarHtml(); wireGestionar(panel); }
  else if (futTab === 'gestiones') { panel.innerHTML = gestionesHtml(); wireGestiones(panel); }
  else { panel.innerHTML = rotacionHtml(); wireRotacion(panel); }
}

function tab(id, label) {
  return `<button class="rg-tab ${futTab === id ? 'active' : ''}" data-fut-tab="${id}">${label}</button>`;
}

// ── Pestaña Rotación ─────────────────────────────────────────
function rotacionHtml() {
  const us = units();
  const act = unidadActiva(us, state.config.futRotacionActiva);
  let banner = '';
  if (act) {
    const idx = us.indexOf(act);
    const seq = Array.from({ length: Math.min(us.length, 4) }, (_, i) => us[(idx + i) % us.length]);
    banner = `
      <div class="rg-banner">
        <div>
          <div class="rg-banner-label">${act.grupo ? 'Grupo activo' : 'Cuenta activa'}</div>
          <div class="rg-banner-name">${esc(unidadNombre(act))}</div>
          <div class="rg-banner-meta">${act.cuentas.length} cuenta${act.cuentas.length !== 1 ? 's' : ''}${us.length > 1 ? ` · con SL pasa a <b>${esc(unidadNombre(us[(idx + 1) % us.length]))}</b>` : ''}</div>
        </div>
        <div class="rg-seq">
          ${seq.map((u, i) => `${i > 0 ? '<span class="rg-arr">→</span>' : ''}
            <span class="rg-pill ${i === 0 ? 'cur' : i === 1 ? 'nxt' : ''}">${esc(unidadNombre(u))}</span>`).join('')}
        </div>
      </div>
      <div class="rg-advisor">
        💡 Próximo trade en <b>${esc(unidadNombre(act))}</b> — riesgo por cuenta:
        <ul class="fut-risk-list">
          ${act.cuentas.map(c => {
            const { gestion, pendiente } = gestionEfectiva(c, custom());
            return `<li><b>${esc(c.empresa)}${c.numero ? ' #' + esc(c.numero) : ''}</b> · ${esc(gestion.nombre)}${pendiente ? ' <span class="fut-pend">elige gestión</span>' : ''} → <b>${riesgoTexto(gestion, c)}</b></li>`;
          }).join('')}
        </ul>
        Regístralo en <a href="#/nuevo">Nuevo trade</a>${act.grupo ? ' asignándolo al grupo' : ''}; con SL la rotación pasa a la siguiente.
      </div>`;
  } else {
    banner = `<div class="rg-hint">Ninguna cuenta de futuros está en rotación. Actívalas en <b>Gestionar</b>.</div>`;
  }

  // Todas las cuentas, agrupadas por unidad (las que están fuera de rotación, al final)
  const enRot = new Set(us.flatMap(u => u.cuentas.map(c => c.id)));
  const fuera = cuentasFuturos().filter(c => !enRot.has(c.id));
  const bloques = us.map(u => bloqueUnidad(unidadNombre(u), u.cuentas, u === act, !!u.grupo));
  if (fuera.length) bloques.push(bloqueUnidad('Fuera de rotación', fuera, false, true));
  return banner + `<div class="rg-groups">${bloques.join('')}</div>`;
}

function bloqueUnidad(titulo, cuentas, activa, esGrupo) {
  return `
    <div class="rg-group">
      <div class="rg-group-hdr">
        <span class="rg-group-title">${esc(titulo)}</span>
        ${activa ? '<span class="rg-tag-active">Activa</span>' : ''}
        ${esGrupo ? `<span class="rg-group-count">${cuentas.length}</span>` : ''}
      </div>
      <div class="rg-group-body">${cuentas.map(cardCuenta).join('')}</div>
    </div>`;
}

function cardCuenta(c) {
  const st = accountStats(c, state.trades);
  const pct = c.capital > 0 ? (st.equityUsd - c.capital) / c.capital : 0;
  const { gestion, pendiente } = gestionEfectiva(c, custom());
  const f = FASE[c.fase] || FASE.challenge_1;
  return `
    <div class="rg-card ${pct >= 0 ? 'ok' : pct >= -0.02 ? 'warn' : 'danger'}">
      <div class="rg-card-top">
        <span class="rg-card-name">${esc(c.empresa)}${c.numero ? ' #' + esc(c.numero) : ''}</span>
        <div class="rg-card-tags"><span class="rg-gtag ${f.cls}">${f.short}</span></div>
      </div>
      <div class="rg-card-perfil"><span>${esc(gestion.nombre)}</span>${pendiente ? ' <span class="fut-pend">elige gestión</span>' : ''}</div>
      <div class="rg-card-bal">${fmtUsd(st.equityUsd)}</div>
      <div class="rg-card-row"><span class="rg-card-pct ${pct >= 0 ? 'pos' : 'neg'}">${pf(pct)}</span></div>
      <div class="rg-card-risk"><span>Riesgo por trade</span><strong>${riesgoTexto(gestion, c)}</strong></div>
    </div>`;
}

function wireRotacion() { /* solo lectura */ }

// ── Pestaña Gestionar ────────────────────────────────────────
function gestionarHtml() {
  const us = units();
  const act = unidadActiva(us, state.config.futRotacionActiva);
  const grupos = gruposExistentes();

  const orden = us.length ? `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-title">Orden de rotación</div>
      <div class="card-sub">Cada fila es un grupo de copiado o una cuenta suelta. Con SL se pasa a la siguiente; con TP se sigue en la misma.</div>
      <div class="rg-orden">
        ${us.map((u, i) => `
          <div class="rg-orden-item">
            <span class="rg-orden-num">${i + 1}</span>
            <span class="rg-orden-name">${esc(unidadNombre(u))}${u.grupo ? ` <span style="color:var(--muted);font-weight:400;">· ${u.cuentas.length} cuenta${u.cuentas.length !== 1 ? 's' : ''}</span>` : ''}
              ${u === act ? '<span class="rg-tag-active" style="margin-left:6px;">Activa</span>' : ''}</span>
            <div class="rg-orden-actions">
              ${u === act ? '' : `<button class="btn ghost" data-fut-activa="${esc(u.key)}" title="Poner activa">●</button>`}
              <button class="btn ghost" data-fut-up="${esc(u.key)}" ${i === 0 ? 'disabled' : ''} title="Subir">▲</button>
              <button class="btn ghost" data-fut-down="${esc(u.key)}" ${i === us.length - 1 ? 'disabled' : ''} title="Bajar">▼</button>
            </div>
          </div>`).join('')}
      </div>
      ${us.length > 1 ? '<button class="btn" id="futNextSl" style="margin-top:10px;" title="Pasa la rotación a la siguiente sin registrar ningún trade">Siguiente (SL) →</button>' : ''}
    </div>` : '';

  const filas = cuentasFuturos().map(c => {
    const { gestion, pendiente } = gestionEfectiva(c, custom());
    const f = FASE[c.fase] || FASE.challenge_1;
    const opts = gestionesDeFase(faseGestion(c), custom());
    return `
      <tr>
        <td><div style="font-weight:700;">${esc(c.empresa)}${c.numero ? ' #' + esc(c.numero) : ''}</div>
            <span class="rg-gtag ${f.cls}" style="font-size:9px;">${f.short} ${f.label}</span>
            <span class="mono" style="font-size:10px;color:var(--muted);margin-left:4px;">${fmtUsd(c.capital)}</span></td>
        <td>
          <select class="select" data-fut-gestion="${c.id}">
            ${opts.map(g => `<option value="${g.id}" ${g.id === gestion.id && !pendiente ? 'selected' : ''}>${esc(g.nombre)} (${g.pct})</option>`).join('')}
            ${pendiente ? '<option value="" selected disabled>— Elige gestión —</option>' : ''}
          </select>
          <div class="mono" style="font-size:10px;color:var(--muted);margin-top:4px;">${riesgoTexto(gestion, c)}</div>
        </td>
        <td>
          <select class="select" data-fut-grupo="${c.id}">
            <option value="" ${!c.grupo ? 'selected' : ''}>Sin grupo</option>
            ${grupos.map(g => `<option value="${esc(g)}" ${c.grupo === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}
            <option value="__nuevo__">+ Nuevo grupo…</option>
          </select>
        </td>
        <td style="text-align:center;">
          <label class="rg-toggle"><input type="checkbox" data-fut-rot="${c.id}" ${c.enRotacion !== false ? 'checked' : ''}><span>En rotación</span></label>
        </td>
      </tr>`;
  }).join('');

  return `
    ${orden}
    <div class="card table-card" style="padding:0;">
      <table class="data-table rg-table fut-table">
        <thead><tr><th>Cuenta</th><th>Gestión de riesgo</th><th>Grupo de copiado</th><th></th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
    <div class="rg-hint" style="margin-top:12px;">La gestión se elige por cuenta: dentro de un grupo cada cuenta puede llevar la suya.
      Las cantidades son para ${usdEs(BASE_CAPITAL)}; en cuentas de otro tamaño se escalan solas. Al pasar a fondeada se pide elegir una de fondeada.</div>`;
}

function wireGestionar(panel) {
  const keys = () => units().map(u => u.key);
  const setOrden = ks => state.setConfig({ futRotacionOrden: ks });

  panel.querySelectorAll('[data-fut-up]').forEach(b => b.addEventListener('click', () => {
    const ks = keys(); const i = ks.indexOf(b.dataset.futUp);
    if (i > 0) { [ks[i - 1], ks[i]] = [ks[i], ks[i - 1]]; setOrden(ks); }
  }));
  panel.querySelectorAll('[data-fut-down]').forEach(b => b.addEventListener('click', () => {
    const ks = keys(); const i = ks.indexOf(b.dataset.futDown);
    if (i >= 0 && i < ks.length - 1) { [ks[i + 1], ks[i]] = [ks[i], ks[i + 1]]; setOrden(ks); }
  }));
  panel.querySelectorAll('[data-fut-activa]').forEach(b => b.addEventListener('click', () =>
    state.setConfig({ futRotacionActiva: b.dataset.futActiva })));
  const next = panel.querySelector('#futNextSl');
  if (next) next.addEventListener('click', () => {
    const us = units(); const act = unidadActiva(us, state.config.futRotacionActiva);
    if (us.length > 1 && act) state.setConfig({ futRotacionActiva: us[(us.indexOf(act) + 1) % us.length].key });
  });

  panel.querySelectorAll('[data-fut-gestion]').forEach(sel => sel.addEventListener('change', () => {
    if (sel.value) state.updateCuenta(sel.dataset.futGestion, { futGestion: sel.value });
  }));
  panel.querySelectorAll('[data-fut-rot]').forEach(chk => chk.addEventListener('change', () =>
    state.updateCuenta(chk.dataset.futRot, { enRotacion: chk.checked })));
  panel.querySelectorAll('[data-fut-grupo]').forEach(sel => sel.addEventListener('change', () => {
    const id = sel.dataset.futGrupo;
    if (sel.value !== '__nuevo__') { state.updateCuenta(id, { grupo: sel.value }); return; }
    pedirNombreGrupo(nombre => state.updateCuenta(id, { grupo: nombre }), () => {
      const c = state.cuentas.find(x => x.id === id);
      sel.value = c && c.grupo ? c.grupo : '';
    });
  }));
}

// Un grupo existe mientras tenga alguna cuenta: crearlo es asignarle la primera.
// Nombre propuesto para un grupo nuevo: la primera letra libre (Grupo A, B, C…).
function siguienteNombreGrupo() {
  const usados = new Set(gruposExistentes());
  for (const l of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!usados.has(`Grupo ${l}`)) return `Grupo ${l}`;
  return `Grupo ${usados.size + 1}`;
}

function pedirNombreGrupo(onOk, onCancel) {
  openModal({
    title: 'Nuevo grupo de copiado',
    body: `<div class="form-field">
        <label class="form-label">Nombre del grupo</label>
        <input class="form-input" id="futGrupoNombre" value="${esc(siguienteNombreGrupo())}" maxlength="30">
        <div id="futGrupoErr" class="auth-error" style="display:none;margin-top:8px;"></div>
      </div>`,
    actions: [
      { label: 'Cancelar', onClick: close => { close(); onCancel(); } },
      { label: 'Crear y asignar', variant: 'primary', onClick: close => {
        const inp = document.getElementById('futGrupoNombre');
        const nombre = (inp.value || '').trim();
        const err = document.getElementById('futGrupoErr');
        if (!nombre) { err.textContent = 'Pon un nombre.'; err.style.display = 'flex'; return; }
        close(); onOk(nombre);
      } },
    ],
  });
  setTimeout(() => { const i = document.getElementById('futGrupoNombre'); if (i) { i.focus(); i.select(); } }, 30);
}

// ── Pestaña Gestiones (las 7 de la academia + personalizadas) ─
function gestionesHtml() {
  const tabla = (fase, titulo) => `
    <div class="section-title-row">
      <div class="section-title" style="margin:0;">${titulo}</div>
      <button class="btn" data-fut-nueva="${fase}">+ Nueva gestión</button>
    </div>
    <div class="card table-card" style="padding:0;margin-bottom:16px;">
      <table class="data-table rg-table">
        <thead><tr><th>Gestión</th><th>%</th><th>Riesgo por trade</th><th>Objetivo por TP</th><th>Consistencia</th><th></th><th></th></tr></thead>
        <tbody>${todasGestiones(custom()).filter(g => g.fase === fase).map(g => `
          <tr>
            <td style="font-weight:700;">${esc(g.nombre)}${g.custom ? ' <span class="fut-custom">personalizada</span>' : ''}</td>
            <td class="mono">${g.pct}</td>
            <td class="mono">${riesgoTexto(g, { capital: BASE_CAPITAL })}${g.rrRango ? ` <span style="color:var(--muted);">· RR ${g.rrRango}</span>` : ''}</td>
            <td class="mono">${g.objetivo ? usdEs(g.objetivo) + (g.objetivoNota ? ` (${g.objetivoNota})` : '') : '—'}</td>
            <td class="mono">${esc(g.consistencia || '—')}</td>
            <td style="font-size:11px;color:var(--muted);">${esc(g.nota || '')}</td>
            <td style="white-space:nowrap;">${g.custom ? `
              <button class="btn ghost" data-fut-edit="${esc(g.id)}" title="Editar">✏️</button>
              <button class="btn ghost danger" data-fut-del="${esc(g.id)}" title="Borrar">×</button>` : ''}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  return `
    <div class="rg-hint" style="margin-bottom:12px;">Cantidades para cuentas de ${usdEs(BASE_CAPITAL)}; en cuentas de otro tamaño se escalan en proporción.
      Las de la academia no se pueden modificar; puedes crear las tuyas y asignarlas en <b>Gestionar</b>.</div>
    ${tabla('challenge', 'Challenges')}
    ${tabla('fondeada', 'Fondeadas')}`;
}

function wireGestiones(panel) {
  panel.querySelectorAll('[data-fut-nueva]').forEach(b =>
    b.addEventListener('click', () => abrirGestionModal(null, b.dataset.futNueva)));
  panel.querySelectorAll('[data-fut-edit]').forEach(b =>
    b.addEventListener('click', () => abrirGestionModal(custom().find(g => g.id === b.dataset.futEdit))));
  panel.querySelectorAll('[data-fut-del]').forEach(b => b.addEventListener('click', () => {
    const g = custom().find(x => x.id === b.dataset.futDel);
    if (!g) return;
    const usan = cuentasFuturos().filter(c => c.futGestion === g.id);
    openModal({
      title: 'Borrar gestión',
      body: `Vas a borrar la gestión <b>${esc(g.nombre)}</b>.` + (usan.length
        ? `<br><br>La usan <b>${usan.length} cuenta${usan.length !== 1 ? 's' : ''}</b>: pasarán a la conservadora de su fase y quedarán marcadas para que elijas otra.`
        : ''),
      actions: [
        { label: 'Cancelar', onClick: close => close() },
        { label: 'Borrar', variant: 'danger', onClick: close => {
          state.setConfig({ futGestionesCustom: custom().filter(x => x.id !== g.id) });
          close();
        } },
      ],
    });
  }));
}

// Crear / editar una gestión personalizada. Cantidades para 50.000 $, como las
// de la academia; las referencias por RR son opcionales (sin ellas se usa el
// riesgo mínimo).
function abrirGestionModal(g, faseNueva) {
  const d = g || { fase: faseNueva || 'challenge', refs: [] };
  const ref = i => (d.refs && d.refs[i]) || {};
  const refRow = i => `
    <div style="display:flex;gap:6px;align-items:center;font-family:var(--mono);font-size:12px;">RR 1:
      <input class="form-input mono" type="number" step="0.1" min="0.1" id="gRr${i}" value="${ref(i).rr || ''}" placeholder="${i ? '1.5' : '2'}" style="width:72px;">
      → <input class="form-input mono" type="number" step="1" min="1" id="gUsd${i}" value="${ref(i).usd || ''}" placeholder="${i ? '1000' : '750'}" style="width:92px;"> $</div>`;
  openModal({
    title: g ? 'Editar gestión' : 'Nueva gestión',
    meta: `Cantidades para cuentas de ${usdEs(BASE_CAPITAL)}`,
    body: `
      <div class="form" style="max-width:none;gap:12px;">
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Nombre <span class="required">*</span></label>
            <input class="form-input" id="gNombre" value="${esc(d.nombre || '')}" maxlength="40" placeholder="Mi gestión">
          </div>
          <div class="form-field">
            <label class="form-label">Para</label>
            <select class="select" id="gFase">
              <option value="challenge" ${d.fase !== 'fondeada' ? 'selected' : ''}>Challenges</option>
              <option value="fondeada" ${d.fase === 'fondeada' ? 'selected' : ''}>Fondeadas</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Riesgo mínimo por trade ($) <span class="required">*</span></label>
            <input class="form-input mono" type="number" min="1" step="1" id="gMin" value="${d.min || ''}" placeholder="300">
          </div>
          <div class="form-field">
            <label class="form-label">Riesgo máximo por trade ($)</label>
            <input class="form-input mono" type="number" min="1" step="1" id="gMax" value="${d.max && d.max !== d.min ? d.max : ''}" placeholder="igual al mínimo">
          </div>
        </div>
        <div class="form-field">
          <label class="form-label">Riesgo según el RR (opcional)</label>
          <div class="form-row">${refRow(0)}${refRow(1)}</div>
          <div class="bti-hint">Si lo rellenas, al registrar un trade se usa el importe del RR más cercano al del trade.</div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Objetivo por TP ($)</label>
            <input class="form-input mono" type="number" min="1" step="1" id="gObj" value="${d.objetivo || ''}" placeholder="opcional">
          </div>
          <div class="form-field">
            <label class="form-label">Consistencia</label>
            <input class="form-input" id="gCons" value="${esc(d.consistencia || '')}" maxlength="30" placeholder="p. ej. 40%">
          </div>
        </div>
        <div class="form-field">
          <label class="form-label">Nota</label>
          <input class="form-input" id="gNota" value="${esc(d.nota || '')}" maxlength="120" placeholder="opcional">
        </div>
        <div id="gErr" class="auth-error" style="display:none;"></div>
      </div>`,
    actions: [
      { label: 'Cancelar', onClick: close => close() },
      { label: g ? 'Guardar cambios' : 'Crear gestión', variant: 'primary', onClick: close => {
        const v = id => document.getElementById(id).value.trim();
        const err = document.getElementById('gErr');
        const fail = m => { err.textContent = '⚠ ' + m; err.style.display = 'flex'; };
        const min = parseFloat(v('gMin'));
        const max = v('gMax') ? parseFloat(v('gMax')) : min;
        if (!v('gNombre')) return fail('Ponle un nombre.');
        if (!(min > 0)) return fail('El riesgo mínimo tiene que ser mayor que 0.');
        if (!(max >= min)) return fail('El riesgo máximo no puede ser menor que el mínimo.');
        // Filas de RR: se ignoran las vacías; una a medias es un error.
        const filas = [0, 1].map(i => ({ rr: v('gRr' + i).replace(',', '.'), usd: v('gUsd' + i) })).filter(r => r.rr || r.usd);
        const refs = filas.map(r => ({ rr: parseFloat(r.rr), usd: parseFloat(r.usd) }));
        if (refs.some(r => !(r.rr > 0) || !(r.usd > 0))) return fail('En "Riesgo según el RR" rellena el RR y el importe de cada fila, o déjala vacía.');
        const nueva = sanitizeGestion({
          id: g ? g.id : 'cu-' + Date.now().toString(36),
          nombre: v('gNombre'), fase: v('gFase'), min, max, refs,
          objetivo: parseFloat(v('gObj')) || undefined, consistencia: v('gCons'), nota: v('gNota'),
        });
        state.setConfig({ futGestionesCustom: [...custom().filter(x => x.id !== nueva.id), nueva] });
        close();
      } },
    ],
  });
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

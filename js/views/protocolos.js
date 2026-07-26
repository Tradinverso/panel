// Vista "Protocolos" (3ª pestaña de Psicotrading). Dos bloques:
//   1) Protocolos FIJOS de Tradinverso (iguales para todos, por enlace) —
//      js/utils/protocolos-fijos.js, solo lectura.
//   2) Protocolos PROPIOS del alumno — lista editable (añadir/editar/borrar),
//      guardada en el sub-array `protocolos` del doc del Plan de trading.
// Reutiliza renderMarkdown, embedUrl y docBlock del Plan.

import { state } from '../state.js';
import { renderMarkdown } from '../utils/markdown.js';
import { embedUrl, docBlock } from './plan.js';
import { psicotradingTabs } from '../components/psicotrading-tabs.js';
import { PROTOCOLOS_FIJOS } from '../utils/protocolos-fijos.js';
import { openModal } from '../components/modal.js';
import { attachDictation } from '../utils/dictation.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Tarjeta de un protocolo FIJO (solo enlace): título, descripción y "Abrir".
function fijoCard(p) {
  const canEmbed = embedUrl(p.url);
  return `
    <a class="card plan-doc-cta" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">
      <span class="pd-icon">📄</span>
      <span class="pd-text">
        <strong>${esc(p.titulo || 'Protocolo')}</strong>
        <small>${esc(p.desc || (canEmbed ? 'Documento de Tradinverso' : 'Enlace externo'))} · se abre en una pestaña nueva</small>
      </span>
      <span class="pd-arrow">↗</span>
    </a>`;
}

// Tarjeta de un protocolo PROPIO del alumno: título, contenido, enlace, acciones.
function propioCard(p) {
  const hasContent = !!(p.content && p.content.trim());
  return `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-head">
        <div class="card-title">${esc(p.titulo || 'Protocolo sin título')}</div>
        <div style="display:flex;gap:6px;">
          <button class="btn ghost" data-edit="${p.id}" title="Editar" style="padding:5px 9px;">✏️</button>
          <button class="btn ghost danger" data-del="${p.id}" title="Borrar" style="padding:5px 9px;">🗑</button>
        </div>
      </div>
      ${hasContent ? `<div class="md-content" style="margin-top:12px;">${renderMarkdown(p.content)}</div>` : ''}
      ${p.docUrl ? docBlock(p.docUrl, 'protocolo') : ''}
    </div>`;
}

function render(container) {
  const fijos = Array.isArray(PROTOCOLOS_FIJOS) ? PROTOCOLOS_FIJOS.filter(p => p && p.url) : [];
  const propios = (state.tradingPlan && Array.isArray(state.tradingPlan.protocolos)) ? state.tradingPlan.protocolos : [];

  const fijosBlock = fijos.length ? `
    <div class="section-title">Protocolos de Tradinverso</div>
    <div class="medita-list" style="margin-bottom:26px;">${fijos.map(fijoCard).join('')}</div>` : '';

  const propiosBlock = `
    <div class="section-title-row">
      <div class="section-title" style="margin:0;">Tus protocolos</div>
      <button class="btn primary" id="protoNew">+ Nuevo protocolo</button>
    </div>
    ${propios.length
      ? propios.map(propioCard).join('')
      : `<div class="empty" style="padding:32px 20px;">
           <div class="big">📋</div>
           <div>Aún no has añadido protocolos propios.</div>
           <div style="margin-top:8px;font-size:11px;color:var(--muted);">Tus reglas: antes de operar, tras un SL, gestión del tilt… Escríbelas o pega un enlace de tu Drive.</div>
         </div>`}
  `;

  container.innerHTML = `
    ${psicotradingTabs('protocolos')}
    <div class="page-header">
      <div>
        <h1>Protocolos</h1>
        <div class="sub">Los protocolos de Tradinverso y los tuyos propios</div>
      </div>
    </div>
    ${fijosBlock}
    ${propiosBlock}
  `;

  const newBtn = container.querySelector('#protoNew');
  if (newBtn) newBtn.addEventListener('click', () => openEditor(null));
  container.querySelectorAll('[data-edit]').forEach(b =>
    b.addEventListener('click', () => openEditor(propios.find(p => p.id === b.dataset.edit))));
  container.querySelectorAll('[data-del]').forEach(b =>
    b.addEventListener('click', () => confirmDelete(propios.find(p => p.id === b.dataset.del))));
}

// Modal para crear/editar un protocolo propio.
function openEditor(proto) {
  const isNew = !proto;
  const p = proto || { titulo: '', content: '', docUrl: '' };
  openModal({
    title: isNew ? 'Nuevo protocolo' : 'Editar protocolo',
    size: 'lg',
    body: `
      <div class="form" style="max-width:none;gap:14px;">
        <div class="form-field">
          <label class="form-label">Título <span class="required">*</span></label>
          <input class="form-input" id="pTitulo" type="text" placeholder="Ej: Protocolo tras un SL" value="${esc(p.titulo)}">
        </div>
        <div class="form-field">
          <label class="form-label">Enlace a documento (opcional)</label>
          <input class="form-input" id="pUrl" type="url" placeholder="https://drive.google.com/..." value="${esc(p.docUrl)}">
          <div style="font-size:10px;color:var(--muted);font-family:var(--mono);margin-top:4px;">Google Drive/Docs compartido como “Cualquiera con el enlace”.</div>
        </div>
        <div class="form-field">
          <label class="form-label">Contenido (Markdown)</label>
          <textarea class="form-textarea" id="pText" style="min-height:260px;font-family:var(--mono);line-height:1.7;" placeholder="# Título · **negrita** · - lista · [texto](https://…)">${esc(p.content)}</textarea>
        </div>
        <div id="pErr" class="auth-error" style="display:none;"></div>
      </div>`,
    actions: [
      { label: 'Cancelar', onClick: close => close() },
      {
        label: isNew ? 'Añadir' : 'Guardar', variant: 'primary',
        onClick: close => {
          const root = document.getElementById('modal-root');
          const titulo = root.querySelector('#pTitulo').value.trim();
          const docUrl = root.querySelector('#pUrl').value.trim();
          const content = root.querySelector('#pText').value;
          if (!titulo) {
            const e = root.querySelector('#pErr');
            e.textContent = '⚠ Ponle un título al protocolo.'; e.style.display = 'flex';
            return;
          }
          if (isNew) state.addProtocolo({ titulo, docUrl, content });
          else state.updateProtocolo(p.id, { titulo, docUrl, content });
          close();
        },
      },
    ],
  });
  attachDictation(document.getElementById('modal-root').querySelector('#pText'));
}

function confirmDelete(proto) {
  if (!proto) return;
  openModal({
    title: 'Borrar protocolo',
    body: `¿Borrar <strong>${esc(proto.titulo || 'este protocolo')}</strong>? No se puede deshacer.`,
    actions: [
      { label: 'Cancelar', onClick: close => close() },
      { label: 'Borrar', variant: 'danger', onClick: close => { state.removeProtocolo(proto.id); close(); } },
    ],
  });
}

export function protocolosView(container) {
  render(container);
  return state.on(() => render(container));
}

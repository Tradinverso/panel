// Vista "Plan de trading" — un plan por usuario en texto Markdown editable,
// con un enlace opcional a un documento externo (Google Doc/PDF). Reutiliza el
// patrón de texto-largo-por-usuario de Psicología. Persistencia en
// users/{uid}/tradingPlan/data vía state.saveTradingPlan.

import { state } from '../state.js';
import { renderMarkdown } from '../utils/markdown.js';

let editing = false;

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function render(container) {
  const plan = state.tradingPlan || {};
  const hasContent = !!(plan.content && plan.content.trim());
  const hasUrl = !!plan.docUrl;

  if (editing) {
    container.innerHTML = `
      <div class="page-header">
        <div><h1>Plan de trading</h1><div class="sub">Edición · formato Markdown</div></div>
        <div class="page-actions">
          <button class="btn" id="planCancel">Cancelar</button>
          <button class="btn primary" id="planSave">Guardar</button>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <div class="form-field">
          <label class="form-label">Enlace a documento (opcional)</label>
          <input class="form-input" id="planUrl" type="url" placeholder="https://drive.google.com/... o https://docs.google.com/..." value="${esc(plan.docUrl || '')}">
          <div style="font-size:10px;color:var(--muted);font-family:var(--mono);margin-top:4px;">Pega tu enlace de Google Drive/Docs. Compártelo como <strong>“Cualquiera con el enlace”</strong> para verlo aquí en grande sin salir de la app.</div>
        </div>
      </div>
      <div class="card">
        <div class="card-head">
          <div>
            <div class="card-title">Tu plan</div>
            <div class="card-sub"># Título · ## Subtítulo · **negrita** · *cursiva* · - lista · [texto](https://…)</div>
          </div>
        </div>
        <textarea class="form-textarea" id="planText" style="min-height:440px;font-family:var(--mono);line-height:1.7;">${esc(plan.content || '')}</textarea>
      </div>
    `;
    const ta = container.querySelector('#planText');
    container.querySelector('#planCancel').addEventListener('click', () => { editing = false; render(container); });
    container.querySelector('#planSave').addEventListener('click', () => {
      const content = ta.value;
      const docUrl = container.querySelector('#planUrl').value.trim();
      state.saveTradingPlan({ content, docUrl, updatedAt: Date.now() });
      editing = false;
      render(container);
    });
    ta.focus();
    return;
  }

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Plan de trading</h1>
        <div class="sub">${plan.updatedAt ? 'Actualizado ' + fmtDate(plan.updatedAt) : 'Tu plan de trading personal'}</div>
      </div>
      <div class="page-actions">
        <button class="btn primary" id="planEdit">${hasContent || hasUrl ? '✏️ Editar' : '+ Escribir plan'}</button>
      </div>
    </div>
    ${hasContent ? `<div class="card md-content" style="margin-bottom:16px;">${renderMarkdown(plan.content)}</div>` : ''}
    ${hasUrl ? docBlock(plan.docUrl) : ''}
    ${(!hasContent && !hasUrl)
      ? `<div class="empty">
           <div class="big">📋</div>
           <div>Aún no has escrito tu plan de trading.</div>
           <div style="margin-top:8px;font-size:11px;color:var(--muted);">Escríbelo aquí (formato Markdown) o pega el <strong>enlace de tu Google Drive/Docs</strong> para verlo directamente aquí.</div>
         </div>`
      : ''}
  `;
  container.querySelector('#planEdit').addEventListener('click', () => { editing = true; render(container); });
}

// Convierte un enlace de Google Drive/Docs en su URL embebible (/preview).
// Devuelve null si no se puede embeber (otro dominio, carpeta, etc.).
function embedUrl(url) {
  let u;
  try { u = new URL(url); } catch (_) { return null; }
  if (u.hostname === 'docs.google.com') {
    const m = u.pathname.match(/\/(document|spreadsheets|presentation)\/d\/([^/]+)/);
    if (m) return `https://docs.google.com/${m[1]}/d/${m[2]}/preview`;
  }
  if (u.hostname === 'drive.google.com') {
    const m = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
    const id = u.searchParams.get('id');
    if (id) return `https://drive.google.com/file/d/${id}/preview`;
  }
  return null;
}

// Bloque grande del documento: vista previa embebida si es Drive/Docs,
// o un botón grande para abrirlo en pestaña nueva.
function docBlock(url) {
  const embed = embedUrl(url);
  if (embed) {
    return `
      <div class="card" style="padding:0;overflow:hidden;">
        <div class="card-head" style="padding:14px 16px;">
          <div class="card-title">📄 Documento del plan</div>
          <a class="btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Abrir en Drive ↗</a>
        </div>
        <iframe class="plan-embed" src="${esc(embed)}" loading="lazy" allowfullscreen></iframe>
        <div class="plan-embed-note">¿No se ve? El documento debe estar compartido como <strong>“Cualquiera con el enlace”</strong> en Drive.</div>
      </div>`;
  }
  return `
    <a class="card plan-doc-cta" href="${esc(url)}" target="_blank" rel="noopener noreferrer">
      <span class="pd-icon">📄</span>
      <span class="pd-text"><strong>Abrir documento</strong><small>Tu plan está en un enlace externo · se abre en una pestaña nueva</small></span>
      <span class="pd-arrow">↗</span>
    </a>`;
}

export function tradingPlanView(container) {
  editing = false;
  render(container);
  // No re-renderizar mientras se edita (borraría el textarea).
  return state.on(() => { if (!editing) render(container); });
}

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
          <input class="form-input" id="planUrl" type="url" placeholder="https://docs.google.com/..." value="${esc(plan.docUrl || '')}">
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
        ${hasUrl ? `<a class="btn" href="${esc(plan.docUrl)}" target="_blank" rel="noopener noreferrer">📄 Abrir documento</a>` : ''}
        <button class="btn primary" id="planEdit">${hasContent || hasUrl ? '✏️ Editar' : '+ Escribir plan'}</button>
      </div>
    </div>
    ${hasContent
      ? `<div class="card md-content">${renderMarkdown(plan.content)}</div>`
      : `<div class="empty">
           <div class="big">📋</div>
           <div>Aún no has escrito tu plan de trading.</div>
           <div style="margin-top:8px;font-size:11px;color:var(--muted);">Define tus reglas, setups, gestión del riesgo y rutina. Acepta formato Markdown.</div>
         </div>`}
  `;
  container.querySelector('#planEdit').addEventListener('click', () => { editing = true; render(container); });
}

export function tradingPlanView(container) {
  editing = false;
  render(container);
  // No re-renderizar mientras se edita (borraría el textarea).
  return state.on(() => { if (!editing) render(container); });
}

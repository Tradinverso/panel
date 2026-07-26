// Vista "Meditaciones" — reproductor de audios locales (assets/audio/) para la
// parte de psicología. 3ª pieza de Psicotrading. Usa <audio> nativo: robusto,
// accesible y sin librerías. Los MP3 y la lista se gestionan en
// js/utils/meditaciones.js.

import { MEDITACIONES } from '../utils/meditaciones.js';
import { psicotradingTabs } from '../components/psicotrading-tabs.js';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function meditacionesView(container) {
  const items = Array.isArray(MEDITACIONES) ? MEDITACIONES : [];

  const list = items.length
    ? `<div class="medita-list">${items.map(m => `
        <div class="medita-card">
          <div class="medita-head">
            <div class="medita-icon">🎧</div>
            <div class="medita-meta">
              <div class="medita-title">${esc(m.titulo)}</div>
              ${m.autor ? `<div class="medita-author">${esc(m.autor)}</div>` : ''}
              ${m.desc ? `<div class="medita-desc">${esc(m.desc)}</div>` : ''}
            </div>
          </div>
          <audio class="medita-audio" controls preload="none" src="${esc(m.src)}"></audio>
        </div>`).join('')}</div>`
    : `<div class="empty">
         <div class="big">🎧</div>
         <div>Aún no hay meditaciones disponibles.</div>
         <div style="margin-top:8px;font-size:11px;color:var(--muted);">Pronto encontrarás aquí audios guiados para preparar tu mente antes de operar.</div>
       </div>`;

  container.innerHTML = `
    ${psicotradingTabs('meditaciones')}
    <div class="page-header">
      <div>
        <h1>Meditaciones</h1>
        <div class="sub">Audios guiados para operar con la mente en calma</div>
      </div>
    </div>
    ${list}
  `;
}

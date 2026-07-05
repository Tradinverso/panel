// Generic modal — used for trade reflection viewer + confirmation dialogs

const root = () => document.getElementById('modal-root');

export function openModal({ title = '', meta = '', body = '', actions = [], size = '' }) {
  closeModal();
  const el = document.createElement('div');
  el.className = 'modal-overlay active';
  const sizeClass = size === 'lg' ? ' modal-lg' : (size === 'xl' ? ' modal-xl' : '');
  el.innerHTML = `
    <div class="modal${sizeClass}">
      <button class="modal-close" data-close>×</button>
      ${title ? `<div class="modal-title">${title}</div>` : ''}
      ${meta ? `<div class="modal-meta">${meta}</div>` : ''}
      <div class="modal-body">${body}</div>
      ${actions.length ? `<div class="modal-actions">${actions.map((a, i) =>
        `<button class="btn ${a.variant || ''}" data-action="${i}">${a.label}</button>`).join('')}</div>` : ''}
    </div>
  `;
  // Cerrar al pulsar el fondo SOLO si el mousedown también empezó en el fondo.
  // Evita que el modal se cierre al arrastrar para seleccionar texto dentro de
  // un campo y soltar el ratón fuera del cuadro.
  let downOnBackdrop = false;
  el.addEventListener('mousedown', e => { downOnBackdrop = (e.target === el); });
  el.addEventListener('click', e => {
    if (e.target.matches('[data-close]')) { closeModal(); return; }
    if (e.target === el) { if (downOnBackdrop) closeModal(); return; }
    const idx = e.target.getAttribute && e.target.getAttribute('data-action');
    if (idx != null) {
      const a = actions[+idx];
      if (a && a.onClick) a.onClick(closeModal);
    }
  });
  document.body.style.overflow = 'hidden';
  root().appendChild(el);
  document.addEventListener('keydown', escListener);
}

export function closeModal() {
  const r = root();
  if (r) r.innerHTML = '';
  document.body.style.overflow = '';
  document.removeEventListener('keydown', escListener);
}

function escListener(e) {
  if (e.key === 'Escape') closeModal();
}

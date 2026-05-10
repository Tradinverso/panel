import { theme } from '../theme.js';
import { router } from '../router.js';
import { state } from '../state.js';
import { auth } from '../auth.js';

// hideInViewAs: oculto cuando admin está viendo/editando a un alumno
// (Ajustes muestra info personal del admin, así que no tiene sentido).
// Importar y Nuevo trade SÍ se permiten — admin puede dar de alta datos a alumnos.
const NAV_BASE = [
  { section: 'Operativa' },
  { path: '#/dashboard',  label: 'Dashboard',   icon: '📊', class: '' },
  { path: '#/nuevo',      label: 'Nuevo trade', icon: '✏️', class: '' },
  { path: '#/calendario', label: 'Calendario',  icon: '📅', class: '' },
  { path: '#/cuentas',    label: 'Cuentas',     icon: '🏦', class: '', countActiveCuentas: true },

  { section: 'Estrategias' },
  { path: '#/zonas',    label: 'Zonas',    icon: '🎯', class: 'zonas',    sheet: 'ZONAS' },
  { path: '#/liquidez', label: 'Liquidez', icon: '💧', class: 'liquidez', sheet: 'LIQUIDEZ' },
  { path: '#/nasdaq',   label: 'Nasdaq',   icon: '🚀', class: 'nasdaq',   sheet: 'NASDAQ' },

  { section: 'Análisis' },
  { path: '#/diagnostico', label: 'Diagnóstico', icon: '🩺', class: '' },

  { section: 'Datos' },
  { path: '#/importar', label: 'Importar', icon: '📥', class: '' },
  { path: '#/ajustes',  label: 'Ajustes',  icon: '⚙️', class: '' },
];

const NAV_ADMIN = [
  { section: 'Admin' },
  { path: '#/admin', label: 'Mis Alumnos', icon: '👥', class: '' },
];

let unsubAuth = null;
let unsubState = null;

export function renderSidebar(container) {
  if (!container) return;

  // Suscripciones a auth (nombre/role) y state (contadores de trades, modo readOnly)
  if (!unsubAuth)  unsubAuth  = auth.on(() => renderSidebar(container));
  if (!unsubState) unsubState = state.on(() => renderSidebar(container));

  if (!auth.currentUser) {
    container.innerHTML = '';
    return;
  }

  const current = router.current();
  const counts = countsBySheet();
  const inViewAs = !!state.viewAsUid;

  // En viewAs solo ocultamos Ajustes (muestra info del admin). Importar y
  // Nuevo trade siguen visibles porque admin puede dar de alta datos a alumnos.
  let nav = NAV_BASE.filter(item => !inViewAs || !item.hideInViewAs);
  if (auth.isAdmin()) nav = nav.concat(NAV_ADMIN);

  const initial = (auth.displayName() || '?').charAt(0).toUpperCase();

  // Indicador de contexto: a quién pertenece la vista actual.
  // Si admin está en viewAs → "Viendo a [Alumno]" con icono y opción de volver.
  // Si normal → solo el nombre del usuario.
  const viewingContext = inViewAs && state.viewAsProfile
    ? `<div class="brand-context viewing-as">
         <div class="bc-label">📍 VIENDO A</div>
         <div class="bc-name">${escapeHtml(state.viewAsProfile.nombre || state.viewAsProfile.email)}</div>
         <button class="bc-exit" id="exitViewAsTopBtn" title="Volver a tu cuenta">↩ Volver</button>
       </div>`
    : `<div class="brand-context">
         <div class="bc-name-self">${escapeHtml(auth.displayName())}</div>
       </div>`;

  container.innerHTML = `
    <a href="${auth.isAdmin() && !inViewAs ? '#/admin' : '#/dashboard'}" class="brand">
      <div class="brand-logo">T</div>
      <div class="brand-text">
        <span class="brand-line1">Journaling</span>
        <span class="brand-line2">Tradinverso</span>
      </div>
    </a>
    ${viewingContext}
    <nav class="nav">
      ${nav.map(item => {
        if (item.section) return `<div class="nav-section">${item.section}</div>`;
        const active = item.path === current ? 'active' : '';
        let meta = '';
        if (item.sheet) {
          meta = `<span class="nav-meta">${counts[item.sheet] || 0}</span>`;
        } else if (item.countActiveCuentas) {
          const n = state.cuentas.filter(c => c.status === 'activa').length;
          meta = n ? `<span class="nav-meta">${n}</span>` : '';
        }
        return `
          <a href="${item.path}" class="nav-item ${item.class} ${active}">
            <span class="nav-icon">${item.icon}</span>
            <span class="nav-label">${item.label}</span>
            ${meta}
          </a>`;
      }).join('')}
    </nav>
    <button class="theme-toggle" id="themeToggle" title="Cambiar tema">
      <span class="theme-toggle-icon">${theme.current() === 'dark' ? '🌙' : '☀️'}</span>
      <span>${theme.current() === 'dark' ? 'Modo oscuro' : 'Modo claro'}</span>
    </button>
    <div class="user-block">
      <div class="user-avatar">${escapeHtml(initial)}</div>
      <div class="user-info">
        <div class="user-name">${escapeHtml(auth.displayName())}</div>
        <div class="user-email">${escapeHtml(auth.currentUser.email)}</div>
      </div>
      <button class="user-logout" id="logoutBtn" title="Cerrar sesión">⏻</button>
    </div>
  `;

  container.querySelector('#themeToggle').addEventListener('click', () => {
    theme.toggle();
    renderSidebar(container);
  });
  container.querySelector('#logoutBtn').addEventListener('click', async () => {
    try { await auth.signOut(); } catch (e) { console.error(e); }
  });
  const exitBtn = container.querySelector('#exitViewAsTopBtn');
  if (exitBtn) {
    exitBtn.addEventListener('click', async () => {
      await state.exitViewAs();
      router.go('#/admin');
    });
  }
}

function countsBySheet() {
  const c = { ZONAS: 0, LIQUIDEZ: 0, NASDAQ: 0 };
  for (const t of state.trades) if (c[t.sheet] != null) c[t.sheet]++;
  return c;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

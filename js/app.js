// Bootstrap principal. Orquesta auth → carga de datos → router.

import './firebase.js';                  // init Firebase ANTES que nada
import { auth } from './auth.js';
import { state } from './state.js';
import { theme } from './theme.js';
import { router } from './router.js';
import { renderSidebar } from './components/sidebar.js';
import { maybeShowMigrationPrompt } from './components/migrate-modal.js';

import { dashboardView } from './views/dashboard.js';
import { newTradeView } from './views/new-trade.js';
import { strategyView } from './views/strategy.js';
import { calendarView } from './views/calendar.js';
import { diagnosticView } from './views/diagnostic.js';
import { importView } from './views/import-table.js';
import { tablaDatosView } from './views/tabla-datos.js';
import { settingsView } from './views/settings.js';
import { psicologiaView } from './views/psicologia.js';
import { loginView } from './views/login.js';
import { adminView } from './views/admin.js';
import { grupoView } from './views/grupo.js';
import { cuentasListView } from './views/cuentas.js';
import { cuentaDetailView } from './views/cuenta.js';
import { riesgoView } from './views/riesgo.js';
import { tradingPlanView } from './views/plan.js';
import { contabilidadView } from './views/contabilidad.js';

theme.init();

const view = document.getElementById('view');
const sidebar = document.getElementById('sidebar');

// ── Sidebar móvil (off-canvas con hamburguesa) ──────────────
const navToggle = document.getElementById('navToggle');
const navScrim = document.getElementById('navScrim');
const closeNav = () => document.body.classList.remove('sidebar-open');
if (navToggle) navToggle.addEventListener('click', () => document.body.classList.toggle('sidebar-open'));
if (navScrim) navScrim.addEventListener('click', closeNav);

// Splash mientras Firebase resuelve la sesión inicial
showSplash();

// Registro de rutas
router
  .add('#/login',       (_, c) => loginView(c))
  .add('#/dashboard',   (_, c) => dashboardView(c))
  .add('#/nuevo',       (_, c) => newTradeView(c))
  .add('#/zonas',       (_, c) => strategyView(c, 'ZONAS'))
  .add('#/liquidez',    (_, c) => strategyView(c, 'LIQUIDEZ'))
  .add('#/nasdaq',      (_, c) => strategyView(c, 'NASDAQ'))
  .add('#/calendario',  (_, c) => calendarView(c))
  .add('#/diagnostico', (_, c) => diagnosticView(c))
  .add('#/psicologia',  (_, c) => psicologiaView(c))
  .add('#/importar',    (_, c) => importView(c))
  .add('#/tabla',       (_, c) => tablaDatosView(c))
  .add('#/ajustes',     (_, c) => settingsView(c))
  .add('#/admin',       (_, c) => adminView(c))
  .add('#/grupo',       (_, c) => grupoView(c))
  .add('#/cuentas',     (_, c) => cuentasListView(c))
  .add('#/cuenta',      (params, c) => cuentaDetailView(c, params.id))
  .add('#/riesgo',      (_, c) => riesgoView(c))
  .add('#/plan',        (_, c) => tradingPlanView(c))
  .add('#/contabilidad', (_, c) => contabilidadView(c));

router.onChange(() => { renderSidebar(sidebar); closeNav(); });

// Cuando cambia el estado de auth: cargar datos + arrancar router
let started = false;
let lastUid = null;

auth.on(async () => {
  hideSplash();
  document.body.dataset.auth = auth.currentUser ? 'true' : 'false';

  if (!auth.currentUser) {
    state.trades = [];
    state.viewAsUid = null;
    state.viewAsProfile = null;
    state.readOnly = false;
    state.emit();
    renderSidebar(sidebar);
    if (!started) { router.start(view, '#/login'); started = true; }
    else { router.go('#/login'); }
    lastUid = null;
    return;
  }

  // Usuario autenticado
  if (auth.currentUser.uid !== lastUid) {
    lastUid = auth.currentUser.uid;
    await state.loadFromCloud();
    // Después de cargar, ofrece migrar localStorage si hay datos
    maybeShowMigrationPrompt();
  }

  renderSidebar(sidebar);

  if (!started) {
    router.start(view, auth.isAdmin() ? '#/admin' : '#/dashboard');
    started = true;
  } else {
    // Si veníamos de #/login → al área correspondiente
    const path = router.current();
    if (path === '#/login') router.go(auth.isAdmin() ? '#/admin' : '#/dashboard');
  }
});

auth.init();

// ── PWA: registrar service worker (habilita "Instalar app") ──
// Ruta relativa para que funcione bajo cualquier subcarpeta (p. ej. /panelprueba/).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ── Splash helpers ──────────────────────────────────────────
function showSplash() {
  if (document.getElementById('boot-splash')) return;
  const el = document.createElement('div');
  el.id = 'boot-splash';
  el.className = 'boot-splash';
  el.innerHTML = `
    <img src="assets/logo.png" alt="Tradinverso" class="splash-logo"
         onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'brand-logo',textContent:'T'}))">
    <div class="boot-splash-text">Cargando…</div>
  `;
  document.body.appendChild(el);
}
function hideSplash() {
  const el = document.getElementById('boot-splash');
  if (el) el.remove();
}

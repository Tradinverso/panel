// Hash-based router con guarda de auth + role.

import { auth } from './auth.js';
import { state } from './state.js';

const routes = new Map();
let currentCleanup = null;
let onChange = null;

const PUBLIC_ROUTES = new Set(['#/login']);
const ADMIN_ROUTES = new Set(['#/admin', '#/grupo']);

export const router = {
  add(path, handler) { routes.set(path, handler); return this; },

  start(container, fallback = '#/dashboard') {
    const handle = () => {
      let hash = window.location.hash || fallback;
      const [hashOnly] = hash.split('?');
      let path = hashOnly;
      let params = {};

      // ── Soporte path-param: si la ruta no existe pero un prefijo sí,
      // extraer el resto como params.id (ej. #/cuenta/abc → path=#/cuenta, id=abc) ──
      if (!routes.has(path)) {
        for (const registered of routes.keys()) {
          if (path.startsWith(registered + '/')) {
            params.id = path.slice(registered.length + 1);
            path = registered;
            break;
          }
        }
      }

      // ── Guarda de autenticación ────────────────────────────
      if (!auth.currentUser && !PUBLIC_ROUTES.has(path)) {
        if (path !== '#/login') { window.location.hash = '#/login'; return; }
      }
      if (auth.currentUser && PUBLIC_ROUTES.has(path)) {
        window.location.hash = auth.isAdmin() ? '#/admin' : '#/dashboard';
        return;
      }
      if (ADMIN_ROUTES.has(path) && !auth.isAdmin()) {
        window.location.hash = '#/dashboard';
        return;
      }
      // Módulo de Riesgo desactivado por el usuario → redirige a Cuentas.
      if (path === '#/riesgo' && state.config && state.config.riskModuleEnabled === false) {
        window.location.hash = '#/cuentas';
        return;
      }

      const handler = routes.get(path) || routes.get(fallback);
      if (currentCleanup) { try { currentCleanup(); } catch (e) {} currentCleanup = null; }
      container.innerHTML = '';
      const cleanup = handler ? handler(params, container) : null;
      if (typeof cleanup === 'function') currentCleanup = cleanup;
      if (onChange) onChange(path);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', handle);
    if (!window.location.hash) window.location.hash = fallback;
    handle();
  },

  go(path) {
    if (window.location.hash === path) {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else {
      window.location.hash = path;
    }
  },

  reload() {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  },

  onChange(fn) { onChange = fn; },
  current() { return (window.location.hash || '').split('?')[0]; },
};

// Barra de pestañas que unifica la sección operativa: Cuentas ↔ Riesgo.
// Son enlaces de navegación (cada uno es su propia ruta/vista) marcando la
// activa. La pestaña "Riesgo" se oculta si el módulo está desactivado.

import { state } from '../state.js';

export function gestionTabs(active) {
  const riskOn = !(state.config && state.config.riskModuleEnabled === false);
  return `
    <div class="rg-tabs gestion-tabs">
      <a class="rg-tab ${active === 'cuentas' ? 'active' : ''}" href="#/cuentas">🏦 Cuentas</a>
      ${riskOn ? `<a class="rg-tab ${active === 'riesgo' ? 'active' : ''}" href="#/riesgo">🛡️ Riesgo</a>` : ''}
    </div>`;
}

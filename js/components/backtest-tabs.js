// Barra de pestañas de la sección Backtesting: las 3 estrategias, cada una con
// su histórico de backtests. Mismo patrón que strategy-tabs (enlaces de
// navegación, la activa con el color de su estrategia).

import { STRATEGIES } from '../utils/strategy-config.js';

// IMPORTAR es la 4ª pestaña (rejilla editable para volcar Sheets/CSV).
// Está en BACKTEST_ROUTES para que el sidebar marque activo el ítem
// "Backtesting" también en esa ruta (match usa Object.values de este mapa).
export const BACKTEST_ROUTES = {
  ZONAS: '#/bt-zonas',
  LIQUIDEZ: '#/bt-liquidez',
  NASDAQ: '#/bt-nasdaq',
  IMPORTAR: '#/bt-importar',
};

export function backtestTabs(active) {
  return `
    <div class="rg-tabs gestion-tabs strat-tabs">
      ${Object.keys(BACKTEST_ROUTES).map(k => {
        const meta = STRATEGIES[k] || { label: k === 'IMPORTAR' ? '⬆ Importar' : k };
        const on = active === k;
        return `<a class="rg-tab ${on ? 'active' : ''}" href="${BACKTEST_ROUTES[k]}"
                   ${on && meta.color ? `style="--tab-accent:${meta.color};"` : ''}>${meta.label}</a>`;
      }).join('')}
    </div>`;
}

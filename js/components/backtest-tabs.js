// Barra de pestañas de la sección Backtesting: las 3 estrategias, cada una con
// su histórico de backtests. Mismo patrón que strategy-tabs (enlaces de
// navegación, la activa con el color de su estrategia).

import { STRATEGIES } from '../utils/strategy-config.js';

// Tras las 3 estrategias van NO TOMADOS (trades que se escaparon, aparte para
// que no contaminen la validación de cada estrategia) e IMPORTAR (rejilla para
// volcar Sheets/CSV). Ambas están en BACKTEST_ROUTES para que el sidebar marque
// activo el ítem "Backtesting" también en esas rutas (match usa Object.values).
export const BACKTEST_ROUTES = {
  ZONAS: '#/bt-zonas',
  LIQUIDEZ: '#/bt-liquidez',
  NASDAQ: '#/bt-nasdaq',
  NO_TOMADOS: '#/bt-no-tomados',
  IMPORTAR: '#/bt-importar',
};

export function backtestTabs(active) {
  return `
    <div class="rg-tabs gestion-tabs strat-tabs">
      ${Object.keys(BACKTEST_ROUTES).map(k => {
        const EXTRA = { IMPORTAR: '⬆ Importar', NO_TOMADOS: '✗ No tomados' };
        const meta = STRATEGIES[k] || { label: EXTRA[k] || k };
        const on = active === k;
        return `<a class="rg-tab ${on ? 'active' : ''}" href="${BACKTEST_ROUTES[k]}"
                   ${on && meta.color ? `style="--tab-accent:${meta.color};"` : ''}>${meta.label}</a>`;
      }).join('')}
    </div>`;
}

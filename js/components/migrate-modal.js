// Si el usuario tiene trades en localStorage de la era pre-Firebase
// y su cuenta en la nube está vacía, ofrece migrarlos.

import { state } from '../state.js';
import { auth } from '../auth.js';
import { sync } from '../sync.js';
import { openModal, closeModal } from './modal.js';

const LS_KEY = 'tradinverso_trades';
const DISMISS_KEY = 'tradinverso_migration_dismissed';

export function maybeShowMigrationPrompt() {
  if (!auth.currentUser) return;
  if (localStorage.getItem(DISMISS_KEY) === 'true') return;

  let local;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    local = JSON.parse(raw);
  } catch (e) { return; }

  if (!Array.isArray(local) || local.length === 0) return;

  // Si la cuenta cloud ya tiene trades, no preguntamos
  if (state.trades.length > 0) {
    // Marcamos como descartado para no preguntar otra vez en este navegador
    localStorage.setItem(DISMISS_KEY, 'true');
    return;
  }

  openModal({
    title: 'Migrar datos locales a la nube',
    body: `
      <p style="margin-bottom:12px;">
        Tienes <strong>${local.length} trades</strong> guardados localmente en este navegador
        (de antes de activar el login con Firebase).
      </p>
      <p style="margin-bottom:8px;">
        ¿Quieres importarlos a tu cuenta en la nube? Después se borrarán del navegador.
      </p>
      <p style="font-size:11px;color:var(--muted);font-family:var(--mono);">
        Si dices que no, se quedarán en localStorage pero no se preguntará otra vez.
      </p>
    `,
    actions: [
      {
        label: 'No, ignorar',
        onClick: close => {
          localStorage.setItem(DISMISS_KEY, 'true');
          close();
        },
      },
      {
        label: `Sí, importar ${local.length}`,
        variant: 'primary',
        onClick: async close => {
          try {
            await sync.saveTradesBatch(auth.uid(), local);
            localStorage.removeItem(LS_KEY);
            localStorage.setItem(DISMISS_KEY, 'true');
            await state.loadFromCloud();
            close();
            openModal({
              title: 'Migración completa',
              body: `<strong>${local.length} trades</strong> importados a la nube.`,
              actions: [{ label: 'Cerrar', variant: 'primary', onClick: c => c() }],
            });
          } catch (err) {
            console.error('Migración falló:', err);
            close();
            openModal({
              title: 'Error en la migración',
              body: 'No se pudieron subir los trades a la nube. Tus datos locales siguen intactos. Detalle: ' + (err.message || err),
              actions: [{ label: 'Cerrar', onClick: c => c() }],
            });
          }
        },
      },
    ],
  });
}

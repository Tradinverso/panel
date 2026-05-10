// Indicador 🟢/🟡 de estado de conexión. Se actualiza con eventos online/offline.

let unsubs = [];

export function renderConnectionBadge(container) {
  if (!container) return;
  paint(container);
  const onChange = () => paint(container);
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  unsubs.push(() => window.removeEventListener('online', onChange));
  unsubs.push(() => window.removeEventListener('offline', onChange));
}

function paint(container) {
  const online = navigator.onLine;
  container.className = 'conn-badge ' + (online ? 'online' : 'offline');
  container.innerHTML = `
    <span class="conn-dot"></span>
    <span>${online ? 'En vivo' : 'Sin conexión'}</span>
  `;
}

export function cleanupConnectionBadge() {
  unsubs.forEach(fn => { try { fn(); } catch (e) {} });
  unsubs = [];
}

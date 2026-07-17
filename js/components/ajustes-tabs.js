// Barra de pestañas que unifica Ajustes ↔ Importar ↔ Tabla en una sola sección.
// Son enlaces de navegación (cada uno es su propia ruta/vista), marcando la
// activa. Mismo patrón que gestion-tabs (Cuentas/Riesgo).

export function ajustesTabs(active) {
  const tab = (id, path, label) =>
    `<a class="rg-tab ${active === id ? 'active' : ''}" href="${path}">${label}</a>`;
  return `
    <div class="rg-tabs gestion-tabs">
      ${tab('ajustes', '#/ajustes', '⚙️ Ajustes')}
      ${tab('importar', '#/importar', '📥 Importar')}
      ${tab('tabla', '#/tabla', '🗃️ Tabla')}
    </div>`;
}

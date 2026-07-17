// Iconos de línea (estilo Feather/Lucide) en SVG.
//
// Sustituyen a los emojis: los emojis los dibuja cada sistema operativo a su
// manera (no coinciden entre Windows/Mac/móvil), no se pueden teñir con el color
// de marca y rompen la coherencia visual. Estos heredan `currentColor`, así que
// se adaptan solos al tema y al estado activo.

const svg = paths => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const ICONS = {
  // ── Navegación ──
  dashboard: svg('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>'),
  nuevo:     svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  calendario: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  zonas:     svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>'),
  liquidez:  svg('<path d="M12 2.7 6.7 8a7.5 7.5 0 1 0 10.6 0Z"/>'),
  nasdaq:    svg('<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>'),
  cuentas:   svg('<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/><circle cx="17" cy="15" r="1.2"/>'),
  contabilidad: svg('<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8"/><path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h4"/>'),
  diagnostico: svg('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
  reflexiones: svg('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z"/>'),
  plan:      svg('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>'),
  ajustes:   svg('<circle cx="12" cy="12" r="3"/><path d="M19.9 14.6a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>'),
  alumnos:   svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>'),
  grupo:     svg('<path d="M12 20V10M18 20V4M6 20v-4"/>'),

  // ── Extras del sidebar ──
  formacion: svg('<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c0 1.1 2.7 2.5 6 2.5s6-1.4 6-2.5v-5"/>'),
  noticias:  svg('<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9h4"/><path d="M10 6h8M10 10h8M10 14h5"/>'),
  reloj:     svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  aviso:     svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>'),
  luna:      svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>'),
  sol:       svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  salir:     svg('<path d="M18.4 6.6a9 9 0 1 1-12.8 0"/><path d="M12 2v10"/>'),
  colapsar:  svg('<path d="m15 18-6-6 6-6"/>'),
  volver:    svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),

  // Globo de la marca (el del logo de Tradinverso)
  globo: `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <circle cx="24" cy="24" r="20" stroke="currentColor" stroke-width="2.6"/>
    <ellipse cx="24" cy="24" rx="8.5" ry="20" stroke="currentColor" stroke-width="2.2"/>
    <line x1="4" y1="24" x2="44" y2="24" stroke="currentColor" stroke-width="2.2"/>
    <path d="M9 12.5c4 2.6 9.2 4.1 15 4.1s11-1.5 15-4.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M9 35.5c4-2.6 9.2-4.1 15-4.1s11 1.5 15 4.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
  </svg>`,
};

export function icon(name) {
  return ICONS[name] || '';
}

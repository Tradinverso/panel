// Configuración de estrategias compartida entre new-trade, strategy view y edit modal.
// Todas las opciones de pills (par / zona / entrada) viven aquí para mantener
// consistencia entre formularios.

// Zonas comunes a LIQUIDEZ y NASDAQ (operativa de liquidez)
const LIQ_NQ_ZONES = [
  'BSL/SSL', 'ASIA', 'LONDON', 'PDH/PDL', 'PWH/PWL',
  'CONT', 'IRL', 'ORB', 'FVG', 'MECHA', 'VOL',
];

// Entradas comunes a LIQUIDEZ y NASDAQ
const LIQ_NQ_ENTRIES = [
  'BPR', 'FVG', 'IFVG', 'ENVOL', 'MARKET', 'LIMIT', 'CHOCH',
];

export const STRATEGIES = {
  ZONAS: {
    label: 'Zonas',
    color: 'var(--zonas)',
    cls: 'zonas',
    desc: 'Reacciones en zonas técnicas en EUR/USD, GBP/USD y XAU/USD',
    pairs: ['EUR/USD', 'GBP/USD', 'XAU/USD'],
    pairFixed: false,
    zones: ['> 7 días', 'Entre 2 y 7 días', '< 2 días', 'Retest'],
    entries: ['Clásica', 'Otras', 'Volumen'],
    zonesMulti: false,
    entriesMulti: false,
    showRR: false,
    showPip: false,
    showEntry: true,
    links: [{ key: 'url1', label: 'Link TradingView' }],
  },
  LIQUIDEZ: {
    label: 'Liquidez',
    color: 'var(--liquidez)',
    cls: 'liquidez',
    desc: 'Operativa de liquidez en EUR/USD y GBP/USD · puntos líquidos, rangos y noticias',
    pairs: ['EUR/USD', 'GBP/USD'],
    pairFixed: false,
    zones: LIQ_NQ_ZONES,
    entries: LIQ_NQ_ENTRIES,
    zonesMulti: true,
    entriesMulti: true,
    showRR: true,
    showPip: false,
    showEntry: true,
    links: [
      { key: 'url1', label: 'Link HTF' },
      { key: 'url2', label: 'Link LTF' },
    ],
  },
  NASDAQ: {
    label: 'Nasdaq',
    color: 'var(--nasdaq)',
    cls: 'nasdaq',
    desc: 'Operativa de liquidez en NQ Futuros · sesión Nueva York',
    pairs: ['NQ'],
    pairFixed: true,
    zones: LIQ_NQ_ZONES,
    entries: LIQ_NQ_ENTRIES,
    zonesMulti: true,
    entriesMulti: true,
    showRR: true,
    showPip: false,
    showEntry: true,
    links: [
      { key: 'url1', label: 'Link HTF' },
      { key: 'url2', label: 'Link LTF' },
    ],
  },
};

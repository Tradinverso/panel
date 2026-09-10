// Configuración de estrategias compartida entre new-trade, strategy view y edit modal.
// Todas las opciones de pills (par / zona / entrada) viven aquí para mantener
// consistencia entre formularios.

// Zonas de la operativa de liquidez (LIQUIDEZ)
const LIQ_ZONES = [
  'BSL/SSL', 'ASIA', 'LONDON', 'PDH/PDL', 'PWH/PWL',
  'CONT', 'IRL', 'ORB', 'FVG', 'MECHA', 'VOL',
];

// Entradas de la operativa de liquidez (LIQUIDEZ)
const LIQ_ENTRIES = [
  'BPR', 'FVG', 'IFVG', 'ENVOL', 'MARKET', 'LIMIT', 'CHOCH',
];

// NASDAQ tiene las suyas: sin MECHA/VOL en zonas ni LIMIT/CHOCH en entradas.
// Listas propias, no un filtrado de las de LIQUIDEZ, para que cada estrategia
// pueda evolucionar sin arrastrar a la otra. Los trades ya guardados con esos
// valores NO se tocan: se siguen viendo y filtrando (las opciones de los
// filtros salen de los datos, no de esta config).
const NQ_ZONES = LIQ_ZONES.filter(z => z !== 'MECHA' && z !== 'VOL');
const NQ_ENTRIES = LIQ_ENTRIES.filter(e => e !== 'LIMIT' && e !== 'CHOCH');

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
    links: [
      { key: 'url1', label: 'Link M1' },
      { key: 'url2', label: 'Link M15' },
    ],
  },
  LIQUIDEZ: {
    label: 'Liquidez',
    color: 'var(--liquidez)',
    cls: 'liquidez',
    desc: 'Operativa de liquidez en EUR/USD y GBP/USD · puntos líquidos, rangos y noticias',
    pairs: ['EUR/USD', 'GBP/USD'],
    pairFixed: false,
    zones: LIQ_ZONES,
    entries: LIQ_ENTRIES,
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
    zones: NQ_ZONES,
    entries: NQ_ENTRIES,
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

// Configuración de estrategias compartida entre new-trade, strategy view y edit modal.
// Todas las opciones de pills (par / zona / entrada) viven aquí para mantener
// consistencia entre formularios.

// Zonas de LIQUIDEZ, en cuadrícula fija de 3 columnas (zonesCols): cada grupo
// de 3 es una fila. Sin CONT ni ORB, y el FVG es solo el de temporalidad alta.
// Los trades antiguos con valores retirados (CONT, ORB, "FVG" a secas) se
// conservan tal cual y se siguen pudiendo filtrar.
const LIQ_ZONES = [
  'ASIA',    'LONDON',  'MECHA',
  'PDH/PDL', 'PWH/PWL', 'BSL/SSL',
  'IRL',     'FVG HTF', 'VOL',
];

// Entradas de LIQUIDEZ, cuadrícula de 3: ENVOL y LIMIT abren fila
// (entriesRowStarts) → IFVG · FVG · BPR / ENVOL · CHOCH / LIMIT. Sin MARKET.
const LIQ_ENTRIES = ['IFVG', 'FVG', 'BPR', 'ENVOL', 'CHOCH', 'LIMIT'];

// NASDAQ tiene las suyas: sin MECHA/VOL/CONT en zonas ni LIMIT/CHOCH/MARKET en
// entradas. CONT sale porque la continuación ya es un modelo de entrada (M4):
// tenerla también como zona duplicaba el dato.
// Listas propias, no un filtrado de las de LIQUIDEZ, para que cada estrategia
// pueda evolucionar sin arrastrar a la otra. Los trades ya guardados con esos
// valores NO se tocan: se siguen viendo y filtrando (las opciones de los
// filtros salen de los datos, no de esta config).
// FVG se parte por temporalidad: no es lo mismo un FVG de 15 min que uno de 1H,
// 4H o diario. Los trades antiguos con "FVG" a secas se conservan tal cual (no
// se puede saber de cuál eran).
//
// Lista explícita y en este ORDEN: se pinta como una cuadrícula fija de 3
// columnas (zonesCols), así que cada grupo de 3 es una fila del formulario.
const NQ_ZONES = [
  'ORB',     'ASIA',    'LONDON',     // sesiones / rango de apertura
  'BSL/SSL', 'PDH/PDL', 'PWH/PWL',    // liquidez
  'IRL',     'FVG M15', 'FVG HTF',    // interna / imbalances
  // CONT: entrada en continuación, que no sale de ninguna zona concreta.
  // Sola en la última fila.
  'CONT',
];
// Orden explícito, en cuadrícula de 3 columnas: IFVG · ENVOL arriba y
// FVG · BPR · BAG abajo (FVG abre fila: entriesRowStarts).
const NQ_ENTRIES = ['IFVG', 'ENVOL', 'FVG', 'BPR', 'BAG'];

// Modelos de entrada de NASDAQ. Se guarda el código (M1…M4), no el texto: si
// mañana se renombra un modelo, los trades ya registrados siguen apuntando al
// mismo y cambian de nombre solos.
const NQ_MODELS = [
  { value: 'M1', label: '1 · ORB' },
  { value: 'M2', label: '2 · AMD + IFVG' },
  { value: 'M3', label: '3 · Liquidez externa' },
  { value: 'M4', label: '4 · Continuación' },
];

// Nombre visible de un modelo guardado. Códigos desconocidos se muestran tal
// cual (nunca se pierden) y vacío es "sin modelo" — los trades anteriores a que
// existiera este campo.
const MODEL_LABELS = Object.fromEntries(NQ_MODELS.map(m => [m.value, m.label]));
export function modelLabel(code) {
  if (!code) return 'Sin modelo';
  return MODEL_LABELS[code] || code;
}

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
    zonesCols: 3,
    entries: LIQ_ENTRIES,
    entriesCols: 3,
    entriesRowStarts: ['ENVOL', 'LIMIT'],
    // Una sola zona y un solo tipo de entrada por trade: las estadísticas por
    // zona/entrada solo cuentan el PRIMER valor, así que con varios el trade
    // caía en una u otra según el orden de los clics. Los trades antiguos con
    // varios se conservan; al editarlos y elegir uno, queda solo ese.
    zonesMulti: false,
    entriesMulti: false,
    // Sin campo RR: el % P&L ya es la R conseguida, y el RR planeado no aporta
    // (el "RR medio" se calcula de los TP realizados, ver calculations.avgRR).
    showRR: false,
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
    zonesCols: 3,   // cuadrícula fija de 3 columnas: mismas filas en cualquier ancho
    entries: NQ_ENTRIES,
    entriesCols: 3,
    entriesRowStarts: ['FVG'],
    // Solo NASDAQ tiene modelos: en el resto de estrategias el campo no aparece.
    models: NQ_MODELS,
    // Una sola zona y un solo tipo de entrada por trade: las estadísticas por
    // zona/entrada solo cuentan el PRIMER valor, así que con varios el trade
    // caía en una u otra según el orden de los clics. Los trades antiguos con
    // varios se conservan; al editarlos y elegir uno, queda solo ese.
    zonesMulti: false,
    entriesMulti: false,
    // Sin campo RR: el % P&L ya es la R conseguida, y el RR planeado no aporta
    // (el "RR medio" se calcula de los TP realizados, ver calculations.avgRR).
    showRR: false,
    showPip: false,
    showEntry: true,
    links: [
      { key: 'url1', label: 'Link HTF' },
      { key: 'url2', label: 'Link LTF' },
    ],
  },
};

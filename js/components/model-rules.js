// Conecta el selector de MODELO con la entrada y la zona del formulario, según
// meta.modelRules (strategy-config.js). Lo usan Nuevo trade, Editar trade y el
// formulario de backtest.
//
//   · Siempre: las entradas que el modelo no admite quedan desactivadas.
//   · Al CAMBIAR de modelo (auto=true): se quitan las entradas no admitidas,
//     si el modelo solo admite una se marca sola (MRA Limit → LIMIT), y se
//     añade la zona del modelo (MRA → ASIA) sin quitar las que ya hubiera.

import { entradasBloqueadas } from '../utils/strategy-config.js';

export function aplicarReglasModelo(meta, data, pills, auto) {
  if (!meta || !meta.modelRules) return;
  const rule = meta.modelRules[data.model];
  const bloq = entradasBloqueadas(meta, data.model);
  if (pills.entry) pills.entry.disable(bloq);
  if (!auto || !rule) return;

  let entry = (data.entry || []).filter(e => !bloq.includes(e));
  if (rule.entries && rule.entries.length === 1) entry = [rule.entries[0]];
  data.entry = entry;
  if (pills.entry) pills.entry.set(meta.entriesMulti ? entry : (entry[0] || ''));

  if (rule.zone && !(data.zone || []).includes(rule.zone)) {
    data.zone = meta.zonesMulti ? [...(data.zone || []), rule.zone] : [rule.zone];
    if (pills.zone) pills.zone.set(meta.zonesMulti ? data.zone : rule.zone);
  }
}

// State en memoria + sincronización con Firestore.
// Patrón: actualización local INMEDIATA (síncrona desde la perspectiva del
// caller) + escritura a Firestore en background (fire-and-forget).
// Errores de red se loguean pero no rompen el flujo del usuario.

import { uuid } from './utils/uuid.js';
import { parseTime, durationMinutes } from './utils/date-helpers.js';
import { sync } from './sync.js';
import { auth } from './auth.js';

const SENS_VALID = new Set([
  'Seguro - Confiado',
  'Convencido - Calma',
  'Dudoso - Inseguro',
  'Fomo - Acelerado',
  'Venganza - Rabia',
  'Miedo - Parálisis',
  'Sin registrar',
]);

function deriveResult(pnl_pct) {
  if (pnl_pct == null || isNaN(pnl_pct)) return 'BE';
  if (pnl_pct > 0.2) return 'TP';
  if (pnl_pct < -0.2) return 'SL';
  return 'BE';
}

// Migración/normalización de valores legacy del campo `entry`. Mapea a la
// forma canónica actual usada en pills (case-insensitive).
const ENTRY_CANONICAL = {
  // ZONAS: legacy → nuevo
  'stop limit': 'Clásica',
  'vol': 'Volumen',
  // ZONAS: case variants del nuevo set
  'clasica': 'Clásica',
  'clásica': 'Clásica',
  'otras': 'Otras',
  'volumen': 'Volumen',
  // LIQ/NAS: case variants
  'bpr': 'BPR',
  'fvg': 'FVG',
  'ifvg': 'IFVG',
  'envol': 'ENVOL',
  'market': 'MARKET',
  'limit': 'LIMIT',
  'choch': 'CHOCH',
};

function canonicalEntry(s) {
  const trimmed = String(s || '').trim();
  if (!trimmed) return '';
  return ENTRY_CANONICAL[trimmed.toLowerCase()] || trimmed;
}

// Migración/normalización del campo `zone`. Mapea valores legacy a la
// forma canónica actual (case-insensitive).
const ZONE_CANONICAL = {
  // ZONAS: legacy '< 7 días' → 'Entre 2 y 7 días' (decisión del usuario)
  '< 7 días': 'Entre 2 y 7 días',
  '<7 días':  'Entre 2 y 7 días',
};

function canonicalZone(s) {
  const trimmed = String(s || '').trim();
  if (!trimmed) return '';
  return ZONE_CANONICAL[trimmed.toLowerCase()] || ZONE_CANONICAL[trimmed] || trimmed;
}

// Convierte un valor (string, array, null) a array de strings no vacíos.
function toStrArr(v) {
  if (Array.isArray(v)) return v.map(x => String(x || '').trim()).filter(Boolean);
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

function sanitizeTrade(t) {
  if (!t) return null;
  const pnl_pct = typeof t.pnl_pct === 'number' ? t.pnl_pct : (parseFloat(t.pnl_pct) || 0);
  const risk_real_raw = typeof t.risk_real_pct === 'number'
    ? t.risk_real_pct
    : (t.risk_real_pct != null && t.risk_real_pct !== '' ? parseFloat(t.risk_real_pct) : NaN);
  const risk_real_pct = isFinite(risk_real_raw) && risk_real_raw >= 0 ? risk_real_raw : 1;
  const open_str = t.open_str || '';
  const close_str = t.close_str || '';
  // Modelo nuevo: accounts: [{accountId, usdPnl}] — el $ que entra a esa
  // cuenta queda persistido tal cual. Trades legacy (con `riskPct` y sin
  // `usdPnl`) se conservan intactos para que `accountUsd()` haga el fallback
  // — se migran al editar o se siguen leyendo como antes.
  const accounts = Array.isArray(t.accounts)
    ? t.accounts
        .filter(a => a && a.accountId)
        .map(a => {
          const out = { accountId: a.accountId };
          if (typeof a.usdPnl === 'number' && isFinite(a.usdPnl)) {
            out.usdPnl = a.usdPnl;
          } else if (typeof a.riskPct === 'number' && a.riskPct > 0) {
            out.riskPct = a.riskPct;
          } else {
            out.riskPct = 1.0;
          }
          return out;
        })
    : [];
  return {
    id: t.id || uuid(),
    sheet: t.sheet,
    date: t.date,
    result: t.result || deriveResult(pnl_pct),
    pnl_pct,
    risk_real_pct,
    // ¿Se ha seguido el trading plan? true / false / null (no registrado)
    plan_followed: (t.plan_followed === true || t.plan_followed === false) ? t.plan_followed : null,
    open_hour: t.open_hour != null ? t.open_hour : parseTime(open_str),
    open_str,
    close_str,
    dur: t.dur != null ? t.dur : durationMinutes(open_str, close_str),
    setup: t.setup || '',
    pair: t.pair || '',
    zone: toStrArr(t.zone).map(canonicalZone),
    entry: toStrArr(t.entry).map(canonicalEntry),
    rr: t.rr != null ? t.rr : null,
    pips: t.pips != null ? t.pips : null,
    sensacion: SENS_VALID.has(t.sensacion) ? t.sensacion : '',
    url1: t.url1 || '',
    url2: t.url2 || '',
    reflexion: t.reflexion || '',
    accounts,
    createdAt: t.createdAt || Date.now(),
  };
}

const VALID_FASE = new Set(['challenge_1', 'challenge_2', 'fondeada']);
const VALID_STATUS = new Set(['activa', 'pausada', 'pasada', 'perdida']);
const VALID_REFL_TYPE = new Set(['daily', 'weekly', 'monthly']);

function sanitizeCuenta(c) {
  if (!c) return null;
  const capital = typeof c.capital === 'number' ? c.capital : (parseFloat(c.capital) || 0);
  // initialBalance: saldo de la cuenta cuando empezaste a trackearla.
  // Default = capital nominal (cuenta fresca). Si la cuenta ya tenía profit
  // antes de meterla aquí, se setea > capital.
  const initialBalance = c.initialBalance != null
    ? (typeof c.initialBalance === 'number' ? c.initialBalance : parseFloat(c.initialBalance) || capital)
    : capital;
  return {
    id: c.id || uuid(),
    empresa: String(c.empresa || '').trim(),
    tipo: c.tipo === 'Futuros' ? 'Futuros' : 'CFD',
    numero: String(c.numero || '').trim(),
    capital,
    initialBalance,
    cost: typeof c.cost === 'number' ? c.cost : (parseFloat(c.cost) || 0),
    targetUsd: c.targetUsd != null ? (typeof c.targetUsd === 'number' ? c.targetUsd : parseFloat(c.targetUsd) || 0) : 0,
    targetPct: typeof c.targetPct === 'number' ? c.targetPct : (parseFloat(c.targetPct) || 0),  // objetivo como % del capital
    maxDdUsd: c.maxDdUsd != null ? (typeof c.maxDdUsd === 'number' ? c.maxDdUsd : parseFloat(c.maxDdUsd) || 0) : 0,
    status: VALID_STATUS.has(c.status) ? c.status : 'activa',
    fase: VALID_FASE.has(c.fase) ? c.fase : 'challenge_1',
    numFases: c.numFases === 1 ? 1 : 2,   // nº de fases del challenge (1 ó 2)
    fundedAt: c.fundedAt || null,         // fecha en que pasó a fondeada (calendario)
    burnedAt: c.burnedAt || null,         // fecha en que se quemó (calendario)
    withdrawals: Array.isArray(c.withdrawals)
      ? c.withdrawals
          .filter(w => w && w.amount > 0)
          .map(w => ({
            id: w.id || uuid(),
            date: w.date || new Date().toISOString().substring(0, 10),
            amount: typeof w.amount === 'number' ? w.amount : (parseFloat(w.amount) || 0),
            commission: typeof w.commission === 'number' && w.commission >= 0
              ? w.commission
              : (parseFloat(w.commission) || 0),
            note: String(w.note || '').trim(),
          }))
      : [],
    notes: String(c.notes || '').trim(),
    // ── Inversión: historial de compras/reintentos de la cuenta ──
    purchases: Array.isArray(c.purchases)
      ? c.purchases.map(sanitizePurchase).filter(Boolean)
      : [],
    // ── Módulo de Riesgo/Rotación (escalado por niveles) ──────
    // Config de riesgo de la cuenta. Defaults retrocompatibles: cuentas viejas
    // sin estos campos arrancan con el perfil "Estándar" (0,5% × 1,3) en rotación.
    riesgoBase: numPos(c.riesgoBase, 0.0050),
    multiplicador: numPos(c.multiplicador, 1.300),
    perfilId: c.perfilId != null && c.perfilId !== '' ? String(c.perfilId) : null,
    enRotacion: c.enRotacion === false ? false : true,
    rotacionOrden: typeof c.rotacionOrden === 'number' ? c.rotacionOrden : (parseFloat(c.rotacionOrden) || 0),
    createdAt: c.createdAt || Date.now(),
  };
}

const VALID_CONCEPT = new Set(['challenge', 'reset', 'reintento', 'suscripcion', 'otro']);

function sanitizePurchase(p) {
  if (!p) return null;
  const amount = typeof p.amount === 'number' ? p.amount : (parseFloat(p.amount) || 0);
  if (!(amount > 0)) return null;
  return {
    id: p.id || uuid(),
    date: p.date || new Date().toISOString().substring(0, 10),
    amount,
    concept: VALID_CONCEPT.has(p.concept) ? p.concept : 'challenge',
    note: String(p.note || '').trim(),
  };
}

// Coerción a número estrictamente positivo, con fallback.
function numPos(v, fallback) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isFinite(n) && n > 0 ? n : fallback;
}

const PERFIL_ID_RE = /^[A-Za-z0-9_-]+$/;

function sanitizePerfil(p) {
  if (!p) return null;
  const nombre = String(p.nombre || '').trim();
  if (!nombre) return null;
  const id = p.id && PERFIL_ID_RE.test(p.id) ? p.id : uuid();
  return {
    id,
    nombre,
    riesgoBase: numPos(p.riesgoBase, 0.0050),
    multiplicador: numPos(p.multiplicador, 1.300),
    descripcion: String(p.descripcion || '').trim(),
  };
}

function sanitizeTradingPlan(p) {
  p = p || {};
  const docUrl = String(p.docUrl || '').trim();
  return {
    content: String(p.content || ''),
    docUrl: /^https?:\/\//i.test(docUrl) ? docUrl : '',
    updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0,
  };
}

function sanitizeReflection(r) {
  if (!r) return null;
  if (!VALID_REFL_TYPE.has(r.type)) return null;
  const period = String(r.period || '').trim();
  if (!period) return null;
  return {
    id: r.id || `${r.type}-${period}`,
    type: r.type,
    period,
    content: String(r.content || ''),
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now(),
  };
}

const listeners = new Set();

function targetUid() {
  return state.viewAsUid || auth.uid();
}

// readOnly indica que estás viendo a otro usuario (admin viewAs).
// Permitimos escrituras siempre (van a viewAsUid), pero las views
// pueden usar el flag para mostrar avisos "estás editando a X".
function ignoreIfReadOnly(_action) {
  return false;
}

function fireAndForget(p, label) {
  if (!p || typeof p.then !== 'function') return;
  p.catch(err => console.error(`[sync] ${label} falló:`, err));
}

export const state = {
  trades: [],
  cuentas: [],
  reflections: [],
  perfiles: [],       // perfiles de riesgo CUSTOM del usuario (los built-in van en código)
  config: {},         // preferencias del usuario (users/{uid}/config/data)
  tradingPlan: {},    // plan de trading del usuario (users/{uid}/tradingPlan/data)
  viewAsUid: null,    // null = ves tus propios trades; uid = admin viendo a alumno
  viewAsProfile: null,// perfil del alumno que se está viendo (banner)
  readOnly: false,    // true cuando viewAsUid != null
  loading: false,

  // ── Carga inicial / recarga desde Firestore ──────────────
  async loadFromCloud() {
    const uid = auth.uid();
    if (!uid) {
      this.trades = [];
      this.cuentas = [];
      this.reflections = [];
      this.perfiles = [];
      this.config = {};
      this.tradingPlan = {};
      this.emit();
      return;
    }
    this.loading = true;
    this.emit();
    try {
      const [trades, cuentas, reflections, perfiles, config, tradingPlan] = await Promise.all([
        sync.loadTrades(uid),
        sync.loadCuentas(uid),
        sync.loadReflections(uid),
        // Colecciones nuevas: si las reglas de Firestore aún no las cubren, no
        // deben tumbar la carga entera (caen a su valor por defecto).
        sync.loadPerfiles(uid).catch(() => []),
        sync.loadConfig(uid).catch(() => ({})),
        sync.loadTradingPlan(uid).catch(() => ({})),
      ]);
      this.trades = trades.map(sanitizeTrade).filter(Boolean);
      this.cuentas = cuentas.map(sanitizeCuenta).filter(Boolean);
      this.reflections = reflections.map(sanitizeReflection).filter(Boolean);
      this.perfiles = perfiles.map(sanitizePerfil).filter(Boolean);
      this.config = config || {};
      this.tradingPlan = sanitizeTradingPlan(tradingPlan);
    } catch (e) {
      console.error('[state] Error cargando datos:', e);
      this.trades = [];
      this.cuentas = [];
      this.reflections = [];
      this.perfiles = [];
      this.config = {};
      this.tradingPlan = {};
    }
    this.loading = false;
    this.viewAsUid = null;
    this.viewAsProfile = null;
    this.readOnly = false;
    this.emit();
  },

  // ── Modo impersonation (admin viendo alumno) ─────────────
  async viewAs(studentUid, profile) {
    if (!auth.isAdmin()) throw new Error('Solo admin puede ver como alumno');
    this.loading = true;
    this.emit();
    try {
      const [trades, cuentas, reflections, perfiles, config, tradingPlan] = await Promise.all([
        sync.loadStudentTrades(studentUid),
        sync.loadCuentas(studentUid),
        sync.loadReflections(studentUid),
        sync.loadPerfiles(studentUid).catch(() => []),
        sync.loadConfig(studentUid).catch(() => ({})),
        sync.loadTradingPlan(studentUid).catch(() => ({})),
      ]);
      this.trades = trades.map(sanitizeTrade).filter(Boolean);
      this.cuentas = cuentas.map(sanitizeCuenta).filter(Boolean);
      this.reflections = reflections.map(sanitizeReflection).filter(Boolean);
      this.perfiles = perfiles.map(sanitizePerfil).filter(Boolean);
      this.config = config || {};
      this.tradingPlan = sanitizeTradingPlan(tradingPlan);
      this.viewAsUid = studentUid;
      this.viewAsProfile = profile;
      this.readOnly = true;
    } catch (e) {
      console.error('[state] Error cargando alumno:', e);
      this.trades = [];
      this.cuentas = [];
      this.reflections = [];
      this.perfiles = [];
      this.config = {};
      this.tradingPlan = {};
    }
    this.loading = false;
    this.emit();
  },

  async exitViewAs() {
    return this.loadFromCloud();
  },

  // ── Mutaciones ───────────────────────────────────────────
  add(trade) {
    if (ignoreIfReadOnly('add')) return null;
    const t = sanitizeTrade(trade);
    if (!t) return null;
    this.trades.push(t);
    this.emit();
    fireAndForget(sync.saveTrade(targetUid(), t), 'saveTrade');
    return t;
  },

  addMany(trades) {
    if (ignoreIfReadOnly('addMany')) return { added: 0, dup: 0 };
    let added = 0, dup = 0;
    const existing = new Set(this.trades.map(dedupKey));
    const toUpload = [];
    for (const t of trades) {
      const sanitized = sanitizeTrade(t);
      if (!sanitized || !sanitized.date || !sanitized.sheet) continue;
      const k = dedupKey(sanitized);
      if (existing.has(k)) { dup++; continue; }
      existing.add(k);
      this.trades.push(sanitized);
      toUpload.push(sanitized);
      added++;
    }
    this.emit();
    if (toUpload.length) fireAndForget(sync.saveTradesBatch(targetUid(), toUpload), 'saveTradesBatch');
    return { added, dup };
  },

  remove(id) {
    if (ignoreIfReadOnly('remove')) return;
    this.trades = this.trades.filter(t => t.id !== id);
    this.emit();
    fireAndForget(sync.deleteTrade(targetUid(), id), 'deleteTrade');
  },

  update(id, patch) {
    if (ignoreIfReadOnly('update')) return null;
    const i = this.trades.findIndex(t => t.id === id);
    if (i < 0) return null;
    this.trades[i] = sanitizeTrade({ ...this.trades[i], ...patch });
    this.emit();
    fireAndForget(sync.saveTrade(targetUid(), this.trades[i]), 'saveTrade(update)');
    return this.trades[i];
  },

  removeBySheet(sheet) {
    if (ignoreIfReadOnly('removeBySheet')) return 0;
    const before = this.trades.length;
    this.trades = this.trades.filter(t => t.sheet !== sheet);
    const removed = before - this.trades.length;
    this.emit();
    fireAndForget(sync.removeTradesBySheet(targetUid(), sheet), 'removeTradesBySheet');
    return removed;
  },

  // Reemplaza el array entero. Si fromCloud=true, no escribe nada
  // (acabamos de cargar desde Firestore). Si fromCloud=false (típico
  // tras "borrar todo" desde Ajustes), escribe el wipe a Firestore.
  replaceAll(trades, { fromCloud = false } = {}) {
    if (ignoreIfReadOnly('replaceAll')) return;
    this.trades = trades.map(sanitizeTrade).filter(Boolean);
    this.emit();
    if (!fromCloud) {
      const uid = targetUid();
      if (!uid) return;
      // Wipe + re-upload. Para "borrar todo" trades estará vacío.
      fireAndForget((async () => {
        await sync.wipeAllTrades(uid);
        if (this.trades.length) await sync.saveTradesBatch(uid, this.trades);
      })(), 'replaceAll');
    }
  },

  // ── Cuentas (CRUD optimista) ─────────────────────────────
  addCuenta(cuenta) {
    const c = sanitizeCuenta(cuenta);
    if (!c) return null;
    this.cuentas.push(c);
    this.emit();
    fireAndForget(sync.saveCuenta(targetUid(), c), 'saveCuenta');
    return c;
  },

  updateCuenta(id, patch) {
    const i = this.cuentas.findIndex(c => c.id === id);
    if (i < 0) return null;
    this.cuentas[i] = sanitizeCuenta({ ...this.cuentas[i], ...patch });
    this.emit();
    fireAndForget(sync.saveCuenta(targetUid(), this.cuentas[i]), 'saveCuenta(update)');
    return this.cuentas[i];
  },

  deleteCuenta(id) {
    // 1. Limpiar referencias en trades (quitar la asignación de esta cuenta)
    const tradesAffected = [];
    this.trades.forEach((t, idx) => {
      if (Array.isArray(t.accounts) && t.accounts.some(a => a.accountId === id)) {
        const newAccounts = t.accounts.filter(a => a.accountId !== id);
        this.trades[idx] = { ...t, accounts: newAccounts };
        tradesAffected.push(this.trades[idx]);
      }
    });
    // 2. Borrar la cuenta del array local
    this.cuentas = this.cuentas.filter(c => c.id !== id);
    this.emit();
    // 3. Persistir en background: borrar cuenta + actualizar trades modificados
    const uid = targetUid();
    fireAndForget(sync.deleteCuenta(uid, id), 'deleteCuenta');
    if (tradesAffected.length) {
      fireAndForget(sync.saveTradesBatch(uid, tradesAffected), 'saveTradesBatch(deleteCuenta cleanup)');
    }
  },

  // ── Ciclo de vida de la cuenta ───────────────────────────
  // Avanza de fase: challenge_1 → (1 fase ? fondeada : challenge_2) → fondeada.
  advanceFase(cuentaId) {
    const c = this.cuentas.find(x => x.id === cuentaId);
    if (!c) return null;
    let next = c.fase;
    if (c.fase === 'challenge_1') next = c.numFases === 1 ? 'fondeada' : 'challenge_2';
    else if (c.fase === 'challenge_2') next = 'fondeada';
    else return c; // ya fondeada
    const patch = { fase: next, status: 'activa' };
    // Registrar la fecha de fondeo la primera vez (para el calendario de Contabilidad).
    if (next === 'fondeada' && !c.fundedAt) patch.fundedAt = new Date().toISOString().substring(0, 10);
    return this.updateCuenta(cuentaId, patch);
  },

  markQuemada(cuentaId) {
    const c = this.cuentas.find(x => x.id === cuentaId);
    const patch = { status: 'perdida' };
    if (c && !c.burnedAt) patch.burnedAt = new Date().toISOString().substring(0, 10);
    return this.updateCuenta(cuentaId, patch);
  },

  // Reordena la rotación: asigna rotacionOrden = posición a cada id de la lista.
  reorderRotacion(orderedIds) {
    orderedIds.forEach((id, i) => {
      const c = this.cuentas.find(x => x.id === id);
      if (c && c.rotacionOrden !== i) this.updateCuenta(id, { rotacionOrden: i });
    });
  },

  // Salta directamente a Fondeada (sin pasar fase a fase).
  markFondeada(cuentaId) {
    const c = this.cuentas.find(x => x.id === cuentaId);
    if (!c) return null;
    const patch = { fase: 'fondeada', status: 'activa' };
    if (!c.fundedAt) patch.fundedAt = new Date().toISOString().substring(0, 10);
    return this.updateCuenta(cuentaId, patch);
  },

  // ── Retiros (siempre dentro de una cuenta) ───────────────
  addWithdrawal(cuentaId, withdrawal) {
    const cuenta = this.cuentas.find(c => c.id === cuentaId);
    if (!cuenta) return null;
    const w = {
      id: withdrawal.id || uuid(),
      date: withdrawal.date || new Date().toISOString().substring(0, 10),
      amount: typeof withdrawal.amount === 'number' ? withdrawal.amount : parseFloat(withdrawal.amount) || 0,
      commission: typeof withdrawal.commission === 'number' && withdrawal.commission >= 0
        ? withdrawal.commission
        : (parseFloat(withdrawal.commission) || 0),
      note: String(withdrawal.note || '').trim(),
    };
    if (w.amount <= 0) return null;
    return this.updateCuenta(cuentaId, {
      withdrawals: [...(cuenta.withdrawals || []), w],
    });
  },

  removeWithdrawal(cuentaId, withdrawalId) {
    const cuenta = this.cuentas.find(c => c.id === cuentaId);
    if (!cuenta) return null;
    return this.updateCuenta(cuentaId, {
      withdrawals: (cuenta.withdrawals || []).filter(w => w.id !== withdrawalId),
    });
  },

  // ── Compras / reintentos (historial de inversión de la cuenta) ──
  addPurchase(cuentaId, purchase) {
    const cuenta = this.cuentas.find(c => c.id === cuentaId);
    if (!cuenta) return null;
    const p = sanitizePurchase(purchase);
    if (!p) return null;
    const existing = [...(cuenta.purchases || [])];
    // Migración: si la cuenta tenía coste legacy y aún no hay compras,
    // sembrar ese coste como primera compra para no perderlo ni duplicarlo.
    const patch = {};
    if (existing.length === 0 && cuenta.cost > 0) {
      existing.push(sanitizePurchase({
        date: new Date(cuenta.createdAt || Date.now()).toISOString().substring(0, 10),
        amount: cuenta.cost,
        concept: 'challenge',
        note: 'Coste inicial',
      }));
      patch.cost = 0; // el coste ya vive como compra
    }
    existing.push(p);
    patch.purchases = existing;
    return this.updateCuenta(cuentaId, patch);
  },

  removePurchase(cuentaId, purchaseId) {
    const cuenta = this.cuentas.find(c => c.id === cuentaId);
    if (!cuenta) return null;
    return this.updateCuenta(cuentaId, {
      purchases: (cuenta.purchases || []).filter(p => p.id !== purchaseId),
    });
  },

  updatePurchase(cuentaId, purchaseId, patch) {
    const cuenta = this.cuentas.find(c => c.id === cuentaId);
    if (!cuenta) return null;
    const existing = cuenta.purchases || [];
    const isReal = existing.some(p => p.id === purchaseId);
    // Compra "legacy": el coste vive en el campo viejo `cost` (no en purchases[]),
    // se muestra como fila sintética `legacy-<id>`. Al editarla la materializamos
    // como primera compra real con los valores editados y ponemos cost a 0.
    if (!isReal) {
      const p = sanitizePurchase({
        date: patch.date,
        amount: patch.amount != null ? patch.amount : cuenta.cost,
        concept: patch.concept || 'challenge',
        note: patch.note != null ? patch.note : 'Coste inicial',
      });
      if (!p) return null;
      return this.updateCuenta(cuentaId, { purchases: [p, ...existing], cost: 0 });
    }
    const purchases = existing.map(p =>
      p.id === purchaseId ? (sanitizePurchase({ ...p, ...patch, id: purchaseId }) || p) : p
    );
    return this.updateCuenta(cuentaId, { purchases });
  },

  // ── Reflexiones de psicología ────────────────────────────
  saveReflection(type, period, content) {
    if (!VALID_REFL_TYPE.has(type) || !period) return null;
    const id = `${type}-${period}`;
    const r = sanitizeReflection({ id, type, period, content, updatedAt: Date.now() });
    if (!r) return null;
    const i = this.reflections.findIndex(x => x.id === id);
    if (i >= 0) this.reflections[i] = r;
    else this.reflections.push(r);
    this.emit();
    fireAndForget(sync.saveReflection(targetUid(), r), 'saveReflection');
    return r;
  },

  deleteReflection(id) {
    const before = this.reflections.length;
    this.reflections = this.reflections.filter(r => r.id !== id);
    if (this.reflections.length === before) return;
    this.emit();
    fireAndForget(sync.deleteReflection(targetUid(), id), 'deleteReflection');
  },

  // ── Perfiles de riesgo (CRUD optimista) ──────────────────
  addPerfil(perfil) {
    const p = sanitizePerfil(perfil);
    if (!p) return null;
    this.perfiles.push(p);
    this.emit();
    fireAndForget(sync.savePerfil(targetUid(), p), 'savePerfil');
    return p;
  },

  updatePerfil(id, patch) {
    const i = this.perfiles.findIndex(p => p.id === id);
    if (i < 0) return null;
    this.perfiles[i] = sanitizePerfil({ ...this.perfiles[i], ...patch, id });
    this.emit();
    fireAndForget(sync.savePerfil(targetUid(), this.perfiles[i]), 'savePerfil(update)');
    return this.perfiles[i];
  },

  deletePerfil(id, { keepAssignments = false } = {}) {
    // Desasignar el perfil de cualquier cuenta que lo use (espejo del PHP).
    // keepAssignments=true al "restaurar" un preset: la cuenta sigue apuntando
    // al preset, que vuelve a sus valores por defecto al quitar el override.
    const cuentasAfectadas = [];
    if (!keepAssignments) {
      this.cuentas.forEach((c, idx) => {
        if (c.perfilId === id) {
          this.cuentas[idx] = sanitizeCuenta({ ...c, perfilId: null });
          cuentasAfectadas.push(this.cuentas[idx]);
        }
      });
    }
    this.perfiles = this.perfiles.filter(p => p.id !== id);
    this.emit();
    const uid = targetUid();
    fireAndForget(sync.deletePerfil(uid, id), 'deletePerfil');
    cuentasAfectadas.forEach(c => fireAndForget(sync.saveCuenta(uid, c), 'saveCuenta(deletePerfil cleanup)'));
  },

  // ── Config del usuario (merge optimista) ─────────────────
  setConfig(patch) {
    this.config = { ...this.config, ...patch };
    this.emit();
    fireAndForget(sync.saveConfig(targetUid(), patch), 'saveConfig');
    return this.config;
  },

  // Mapa id→cuenta del contexto actual (propio o alumno en viewAs). Lo usan los
  // cálculos de "P&L real" ponderado por capital.
  cuentaMap() {
    return new Map(this.cuentas.map(c => [c.id, c]));
  },

  // ── Plan de trading (merge optimista) ────────────────────
  saveTradingPlan(patch) {
    const next = sanitizeTradingPlan({ ...this.tradingPlan, ...patch });
    this.tradingPlan = next;
    this.emit();
    fireAndForget(sync.saveTradingPlan(targetUid(), next), 'saveTradingPlan');
    return next;
  },

  // ── Bus de eventos ───────────────────────────────────────
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit() { listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); },
};

function dedupKey(t) {
  return `${t.sheet}|${t.date}|${t.open_str || ''}|${t.pair || ''}|${t.setup || ''}`;
}

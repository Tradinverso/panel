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
  // accounts: [{accountId, riskPct}] — el balance de la cuenta se ajusta
  // editándola directamente; no usamos comisiones por trade.
  const accounts = Array.isArray(t.accounts)
    ? t.accounts
        .filter(a => a && a.accountId)
        .map(a => ({
          accountId: a.accountId,
          riskPct: typeof a.riskPct === 'number' && a.riskPct > 0 ? a.riskPct : 1.0,
        }))
    : [];
  return {
    id: t.id || uuid(),
    sheet: t.sheet,
    date: t.date,
    result: t.result || deriveResult(pnl_pct),
    pnl_pct,
    risk_real_pct,
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
    maxDdUsd: c.maxDdUsd != null ? (typeof c.maxDdUsd === 'number' ? c.maxDdUsd : parseFloat(c.maxDdUsd) || 0) : 0,
    status: VALID_STATUS.has(c.status) ? c.status : 'activa',
    fase: VALID_FASE.has(c.fase) ? c.fase : 'challenge_1',
    withdrawals: Array.isArray(c.withdrawals)
      ? c.withdrawals
          .filter(w => w && w.amount > 0)
          .map(w => ({
            id: w.id || uuid(),
            date: w.date || new Date().toISOString().substring(0, 10),
            amount: typeof w.amount === 'number' ? w.amount : (parseFloat(w.amount) || 0),
            note: String(w.note || '').trim(),
          }))
      : [],
    notes: String(c.notes || '').trim(),
    createdAt: c.createdAt || Date.now(),
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
      this.emit();
      return;
    }
    this.loading = true;
    this.emit();
    try {
      const [trades, cuentas, reflections] = await Promise.all([
        sync.loadTrades(uid),
        sync.loadCuentas(uid),
        sync.loadReflections(uid),
      ]);
      this.trades = trades.map(sanitizeTrade).filter(Boolean);
      this.cuentas = cuentas.map(sanitizeCuenta).filter(Boolean);
      this.reflections = reflections.map(sanitizeReflection).filter(Boolean);
    } catch (e) {
      console.error('[state] Error cargando datos:', e);
      this.trades = [];
      this.cuentas = [];
      this.reflections = [];
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
      const [trades, cuentas, reflections] = await Promise.all([
        sync.loadStudentTrades(studentUid),
        sync.loadCuentas(studentUid),
        sync.loadReflections(studentUid),
      ]);
      this.trades = trades.map(sanitizeTrade).filter(Boolean);
      this.cuentas = cuentas.map(sanitizeCuenta).filter(Boolean);
      this.reflections = reflections.map(sanitizeReflection).filter(Boolean);
      this.viewAsUid = studentUid;
      this.viewAsProfile = profile;
      this.readOnly = true;
    } catch (e) {
      console.error('[state] Error cargando alumno:', e);
      this.trades = [];
      this.cuentas = [];
      this.reflections = [];
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

  // ── Retiros (siempre dentro de una cuenta) ───────────────
  addWithdrawal(cuentaId, withdrawal) {
    const cuenta = this.cuentas.find(c => c.id === cuentaId);
    if (!cuenta) return null;
    const w = {
      id: withdrawal.id || uuid(),
      date: withdrawal.date || new Date().toISOString().substring(0, 10),
      amount: typeof withdrawal.amount === 'number' ? withdrawal.amount : parseFloat(withdrawal.amount) || 0,
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

  // ── Bus de eventos ───────────────────────────────────────
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  emit() { listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); },
};

function dedupKey(t) {
  return `${t.sheet}|${t.date}|${t.open_str || ''}|${t.pair || ''}|${t.setup || ''}`;
}

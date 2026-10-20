// Capa de Firestore. Toda la I/O contra la base de datos pasa por aquí.
// Las views NO importan Firebase directamente — siempre vía sync o auth.

import { db, ADMIN_EMAIL } from './firebase.js';
import {
  doc, getDoc, setDoc, deleteDoc, getDocs, collection,
  serverTimestamp, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const FIRESTORE_BATCH_LIMIT = 500;

export const sync = {
  // ── Profile ────────────────────────────────────────────────
  async loadProfile(user) {
    const ref = doc(db, 'users', user.uid, 'profile', 'data');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      if (data.blocked === true) {
        const err = new Error('Tu acceso está pausado. Escríbenos para reactivarlo.');
        err.code = 'auth/account-blocked';
        throw err;
      }
      return data;
    }
    // Primer login: crear perfil con role inferido del email
    const profile = {
      email: user.email,
      nombre: user.email.split('@')[0],
      role: user.email === ADMIN_EMAIL ? 'admin' : 'student',
      createdAt: serverTimestamp(),
    };
    await setDoc(ref, profile);
    return { ...profile, createdAt: new Date() };
  },

  async updateProfile(uid, patch) {
    await setDoc(doc(db, 'users', uid, 'profile', 'data'), patch, { merge: true });
  },

  // PAUSAR el acceso de un alumno (p. ej. deja de pagar): marca su profile como
  // bloqueado. No borra nada (trades, cuentas, reflexiones se conservan). No
  // puede entrar, y las reglas de Firestore le cierran sus datos hasta que se
  // reactive. Sale de la lista de activos y pasa a "Pausados".
  async blockStudent(uid) {
    if (!uid) throw new Error('uid requerido');
    await setDoc(
      doc(db, 'users', uid, 'profile', 'data'),
      { blocked: true, blockedAt: serverTimestamp() },
      { merge: true }
    );
  },

  // ELIMINAR DEFINITIVAMENTE (solo admin, solo alumnos ya pausados). Borra
  // todos sus datos y lo saca del listado. No se puede deshacer.
  // Su CUENTA DE ACCESO (Authentication) no se puede borrar desde la app (hace
  // falta un servidor): se deja su profile reducido a una marca de "eliminado"
  // y bloqueado, para que si entra con ella no vea nada ni se le cree un
  // journal nuevo. La cuenta se quita a mano en la consola de Firebase.
  async deleteStudentCompletely(uid) {
    if (!uid) throw new Error('uid requerido');
    const COLS = ['trades', 'backtests', 'cuentas', 'reflections', 'perfiles', 'config', 'tradingPlan'];
    const borrados = {};
    for (const c of COLS) {
      const snap = await getDocs(collection(db, 'users', uid, c));
      const ids = snap.docs.map(d => d.id);
      for (let i = 0; i < ids.length; i += FIRESTORE_BATCH_LIMIT) {
        const batch = writeBatch(db);
        for (const id of ids.slice(i, i + FIRESTORE_BATCH_LIMIT)) batch.delete(doc(db, 'users', uid, c, id));
        await batch.commit();
      }
      borrados[c] = ids.length;
    }
    const pRef = doc(db, 'users', uid, 'profile', 'data');
    const pSnap = await getDoc(pRef);
    const p = pSnap.exists() ? pSnap.data() : {};
    await setDoc(pRef, {
      email: p.email || '', nombre: p.nombre || '', role: 'student',
      blocked: true, deleted: true, deletedAt: serverTimestamp(),
    });
    // Sin el documento padre deja de salir en el listado de alumnos.
    await deleteDoc(doc(db, 'users', uid));
    return borrados;
  },

  // REACTIVAR: vuelve a entrar con su misma contraseña y lo encuentra todo igual.
  async unblockStudent(uid) {
    if (!uid) throw new Error('uid requerido');
    await setDoc(
      doc(db, 'users', uid, 'profile', 'data'),
      { blocked: false, unblockedAt: serverTimestamp() },
      { merge: true }
    );
  },

  // ── Config ─────────────────────────────────────────────────
  async loadConfig(uid) {
    const snap = await getDoc(doc(db, 'users', uid, 'config', 'data'));
    return snap.exists() ? snap.data() : {};
  },

  async saveConfig(uid, patch) {
    await setDoc(doc(db, 'users', uid, 'config', 'data'), patch, { merge: true });
  },

  // ── Plan de trading (doc único por usuario) ────────────────
  async loadTradingPlan(uid) {
    const snap = await getDoc(doc(db, 'users', uid, 'tradingPlan', 'data'));
    return snap.exists() ? snap.data() : {};
  },

  async saveTradingPlan(uid, patch) {
    await setDoc(doc(db, 'users', uid, 'tradingPlan', 'data'), patch, { merge: true });
  },

  // ── Trades ─────────────────────────────────────────────────
  async loadTrades(uid) {
    const snap = await getDocs(collection(db, 'users', uid, 'trades'));
    return snap.docs.map(d => d.data());
  },

  async saveTrade(uid, trade) {
    if (!trade.id) throw new Error('Trade necesita id');
    await setDoc(doc(db, 'users', uid, 'trades', trade.id), trade);
  },

  async deleteTrade(uid, tradeId) {
    await deleteDoc(doc(db, 'users', uid, 'trades', tradeId));
  },

  async saveTradesBatch(uid, trades) {
    for (let i = 0; i < trades.length; i += FIRESTORE_BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const t of trades.slice(i, i + FIRESTORE_BATCH_LIMIT)) {
        if (!t.id) continue;
        batch.set(doc(db, 'users', uid, 'trades', t.id), t);
      }
      await batch.commit();
    }
  },

  async deleteTradesBatch(uid, tradeIds) {
    for (let i = 0; i < tradeIds.length; i += FIRESTORE_BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const id of tradeIds.slice(i, i + FIRESTORE_BATCH_LIMIT)) {
        batch.delete(doc(db, 'users', uid, 'trades', id));
      }
      await batch.commit();
    }
  },

  async removeTradesBySheet(uid, sheet) {
    const all = await this.loadTrades(uid);
    const ids = all.filter(t => t.sheet === sheet).map(t => t.id);
    if (ids.length) await this.deleteTradesBatch(uid, ids);
    return ids.length;
  },

  async wipeAllTrades(uid) {
    const all = await this.loadTrades(uid);
    const ids = all.map(t => t.id);
    if (ids.length) await this.deleteTradesBatch(uid, ids);
    return ids.length;
  },

  // ── Backtests ──────────────────────────────────────────────
  // Colección SEPARADA de `trades` a propósito: los backtests no deben
  // contaminar dashboard, diagnóstico, calendario, rotación ni stats grupales
  // (listStudents solo lee `trades`, así que la separación es a prueba de balas).
  async loadBacktests(uid) {
    const snap = await getDocs(collection(db, 'users', uid, 'backtests'));
    return snap.docs.map(d => d.data());
  },

  async saveBacktest(uid, bt) {
    if (!bt.id) throw new Error('Backtest necesita id');
    await setDoc(doc(db, 'users', uid, 'backtests', bt.id), bt);
  },

  async deleteBacktest(uid, btId) {
    await deleteDoc(doc(db, 'users', uid, 'backtests', btId));
  },

  async saveBacktestsBatch(uid, items) {
    for (let i = 0; i < items.length; i += FIRESTORE_BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const b of items.slice(i, i + FIRESTORE_BATCH_LIMIT)) {
        if (!b.id) continue;
        batch.set(doc(db, 'users', uid, 'backtests', b.id), b);
      }
      await batch.commit();
    }
  },

  async deleteBacktestsBatch(uid, ids) {
    for (let i = 0; i < ids.length; i += FIRESTORE_BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const id of ids.slice(i, i + FIRESTORE_BATCH_LIMIT)) {
        batch.delete(doc(db, 'users', uid, 'backtests', id));
      }
      await batch.commit();
    }
  },

  async wipeAllBacktests(uid) {
    const all = await this.loadBacktests(uid);
    const ids = all.map(b => b.id);
    if (ids.length) await this.deleteBacktestsBatch(uid, ids);
    return ids.length;
  },

  // ── Cuentas (scaffold para gestión de cuentas futura) ─────
  async loadCuentas(uid) {
    const snap = await getDocs(collection(db, 'users', uid, 'cuentas'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async saveCuenta(uid, cuenta) {
    if (!cuenta.id) throw new Error('Cuenta necesita id');
    await setDoc(doc(db, 'users', uid, 'cuentas', cuenta.id), cuenta);
  },

  async deleteCuenta(uid, cuentaId) {
    await deleteDoc(doc(db, 'users', uid, 'cuentas', cuentaId));
  },

  async wipeAllCuentas(uid) {
    const all = await this.loadCuentas(uid);
    const ids = all.map(c => c.id);
    for (let i = 0; i < ids.length; i += FIRESTORE_BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const id of ids.slice(i, i + FIRESTORE_BATCH_LIMIT)) {
        batch.delete(doc(db, 'users', uid, 'cuentas', id));
      }
      await batch.commit();
    }
    return ids.length;
  },

  // ── Perfiles de riesgo (módulo de Riesgo/Rotación) ─────────
  // Solo persistimos los perfiles CUSTOM del usuario. Los presets built-in
  // viven en código (risk-levels.js PERFILES_BUILTIN) y no se guardan.
  async loadPerfiles(uid) {
    const snap = await getDocs(collection(db, 'users', uid, 'perfiles'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async savePerfil(uid, perfil) {
    if (!perfil.id) throw new Error('Perfil necesita id');
    await setDoc(doc(db, 'users', uid, 'perfiles', perfil.id), perfil);
  },

  async deletePerfil(uid, perfilId) {
    await deleteDoc(doc(db, 'users', uid, 'perfiles', perfilId));
  },

  async wipeAllPerfiles(uid) {
    const all = await this.loadPerfiles(uid);
    const ids = all.map(p => p.id);
    for (let i = 0; i < ids.length; i += FIRESTORE_BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const id of ids.slice(i, i + FIRESTORE_BATCH_LIMIT)) {
        batch.delete(doc(db, 'users', uid, 'perfiles', id));
      }
      await batch.commit();
    }
    return ids.length;
  },

  // ── Reflexiones de psicología (diaria/semanal/mensual) ─────
  async loadReflections(uid) {
    const snap = await getDocs(collection(db, 'users', uid, 'reflections'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },

  async saveReflection(uid, r) {
    if (!r.id) throw new Error('Reflection necesita id');
    await setDoc(doc(db, 'users', uid, 'reflections', r.id), r);
  },

  async deleteReflection(uid, id) {
    await deleteDoc(doc(db, 'users', uid, 'reflections', id));
  },

  async wipeAllReflections(uid) {
    const all = await this.loadReflections(uid);
    const ids = all.map(r => r.id);
    for (let i = 0; i < ids.length; i += FIRESTORE_BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const id of ids.slice(i, i + FIRESTORE_BATCH_LIMIT)) {
        batch.delete(doc(db, 'users', uid, 'reflections', id));
      }
      await batch.commit();
    }
    return ids.length;
  },

  // ── Admin: listado de alumnos + sus métricas ──────────────
  // includePaused: también los pausados (Mis Alumnos los enseña aparte y el
  // backup los guarda). Por defecto no: las estadísticas grupales son de activos.
  async listStudents({ includePaused = false } = {}) {
    const usersSnap = await getDocs(collection(db, 'users'));
    const result = [];
    for (const userDoc of usersSnap.docs) {
      try {
        const profileSnap = await getDoc(doc(db, 'users', userDoc.id, 'profile', 'data'));
        if (!profileSnap.exists()) continue;
        const profile = profileSnap.data();
        if (profile.role !== 'student') continue;
        if (profile.blocked === true && !includePaused) continue;
        const tradesSnap = await getDocs(collection(db, 'users', userDoc.id, 'trades'));
        const trades = tradesSnap.docs.map(d => d.data());
        result.push({ uid: userDoc.id, profile, trades });
      } catch (e) {
        console.warn('Saltando usuario por reglas o error:', userDoc.id, e.message);
      }
    }
    return result;
  },

  // Gestor de alumnos: el mismo listado pero SOLO con el perfil (sin trades,
  // que las reglas tampoco le dejan leer).
  async listStudentsBasic() {
    const usersSnap = await getDocs(collection(db, 'users'));
    const profiles = await Promise.all(usersSnap.docs.map(async userDoc => {
      try {
        const snap = await getDoc(doc(db, 'users', userDoc.id, 'profile', 'data'));
        if (!snap.exists()) return null;
        const profile = snap.data();
        // Con los pausados: el gestor también puede reactivarlos.
        if (profile.role !== 'student') return null;
        return { uid: userDoc.id, profile };
      } catch (e) {
        console.warn('Saltando usuario por reglas o error:', userDoc.id, e.message);
        return null;
      }
    }));
    return profiles.filter(Boolean);
  },

  async loadStudentTrades(studentUid) {
    return this.loadTrades(studentUid);
  },

  async loadStudentProfile(studentUid) {
    const snap = await getDoc(doc(db, 'users', studentUid, 'profile', 'data'));
    return snap.exists() ? snap.data() : null;
  },
};

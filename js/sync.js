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
        const err = new Error('Cuenta bloqueada por el administrador.');
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

  // Soft delete: marca el profile del alumno como bloqueado. No borra datos
  // (trades, cuentas, reflexiones se conservan). El alumno deja de aparecer en
  // listStudents y no puede iniciar sesión.
  async blockStudent(uid) {
    if (!uid) throw new Error('uid requerido');
    await setDoc(
      doc(db, 'users', uid, 'profile', 'data'),
      { blocked: true, blockedAt: serverTimestamp() },
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
  async listStudents() {
    const usersSnap = await getDocs(collection(db, 'users'));
    const result = [];
    for (const userDoc of usersSnap.docs) {
      try {
        const profileSnap = await getDoc(doc(db, 'users', userDoc.id, 'profile', 'data'));
        if (!profileSnap.exists()) continue;
        const profile = profileSnap.data();
        if (profile.role !== 'student') continue;
        if (profile.blocked === true) continue;
        const tradesSnap = await getDocs(collection(db, 'users', userDoc.id, 'trades'));
        const trades = tradesSnap.docs.map(d => d.data());
        result.push({ uid: userDoc.id, profile, trades });
      } catch (e) {
        console.warn('Saltando usuario por reglas o error:', userDoc.id, e.message);
      }
    }
    return result;
  },

  async loadStudentTrades(studentUid) {
    return this.loadTrades(studentUid);
  },

  async loadStudentProfile(studentUid) {
    const snap = await getDoc(doc(db, 'users', studentUid, 'profile', 'data'));
    return snap.exists() ? snap.data() : null;
  },
};

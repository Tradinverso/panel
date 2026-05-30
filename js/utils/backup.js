// Backup manual del admin: descarga un JSON con TODOS los datos de TODOS los
// alumnos (profile, trades, cuentas, reflections). Recordatorio guardado en
// localStorage para avisar si llevas mucho tiempo sin hacer backup.

import { sync } from '../sync.js';
import { auth } from '../auth.js';

const STORAGE_KEY = 'tradinverso_last_backup';

// Genera el objeto de backup. onProgress(current, total) opcional para UI.
// Incluye al admin actual (sus propios trades/cuentas/reflexiones) además
// de todos los alumnos — listStudents filtra por role==='student' y
// dejaba al admin fuera.
export async function generateBackup(onProgress = () => {}) {
  const students = await sync.listStudents();
  const adminUid = auth.currentUser?.uid;
  const adminAlreadyIn = adminUid && students.some(s => s.uid === adminUid);
  const includeAdmin = adminUid && !adminAlreadyIn;

  const total = students.length + (includeAdmin ? 1 : 0);
  const result = [];
  let i = 0;

  if (includeAdmin) {
    i++;
    onProgress(i, total);
    const [trades, cuentas, reflections] = await Promise.all([
      sync.loadTrades(adminUid).catch(() => []),
      sync.loadCuentas(adminUid).catch(() => []),
      sync.loadReflections(adminUid).catch(() => []),
    ]);
    result.push({
      uid: adminUid,
      profile: auth.profile || { email: auth.currentUser.email, role: 'admin' },
      trades,
      cuentas,
      reflections,
    });
  }

  for (const s of students) {
    i++;
    onProgress(i, total);
    const [cuentas, reflections] = await Promise.all([
      sync.loadCuentas(s.uid).catch(() => []),
      sync.loadReflections(s.uid).catch(() => []),
    ]);
    result.push({
      uid: s.uid,
      profile: s.profile,
      trades: s.trades || [],
      cuentas,
      reflections,
    });
  }
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    exported_by: auth.currentUser?.email || 'unknown',
    students_count: total,
    students: result,
  };
}

// Descarga el JSON como archivo .json en el navegador.
export function downloadBackup(data) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().substring(0, 10);
  a.href = url;
  a.download = `tradinverso-backup-${today}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function getLastBackupDate() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

export function setLastBackupDate(date = new Date()) {
  try { localStorage.setItem(STORAGE_KEY, date.toISOString()); } catch (e) { /* quota / etc */ }
}

export function daysSinceLastBackup() {
  const last = getLastBackupDate();
  if (!last) return Infinity;
  return Math.floor((Date.now() - last.getTime()) / 86400000);
}

export function formatBackupDate(d) {
  if (!d) return 'nunca';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── RESTORE ──────────────────────────────────────────────────

// Parsea un File seleccionado por el usuario y valida la estructura.
export function parseBackupFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('No se ha seleccionado archivo.')); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || typeof data !== 'object') throw new Error('JSON malformado');
        if (data.version !== 1) throw new Error('Versión de backup no soportada (' + data.version + ')');
        if (!Array.isArray(data.students)) throw new Error('Estructura inválida: falta "students"');
        resolve(data);
      } catch (e) {
        reject(new Error('Backup inválido — ' + e.message));
      }
    };
    reader.onerror = () => reject(new Error('Error leyendo el archivo'));
    reader.readAsText(file);
  });
}

// Devuelve un resumen agregado del backup (sin tocar Firestore).
export function summarizeBackup(data) {
  let trades = 0, cuentas = 0, reflections = 0;
  for (const s of (data.students || [])) {
    trades += (s.trades?.length || 0);
    cuentas += (s.cuentas?.length || 0);
    reflections += (s.reflections?.length || 0);
  }
  return {
    students: data.students?.length || 0,
    trades, cuentas, reflections,
    exported_at: data.exported_at,
    exported_by: data.exported_by,
  };
}

// Restaura los datos del backup a Firestore.
//   - mode='merge'  → upsert (no borra nada que no esté en el backup)
//   - mode='replace' → wipe completo de trades/cuentas/reflections por alumno, luego escribe
// onProgress(current, total, label) opcional.
export async function restoreBackup(data, mode = 'merge', onProgress = () => {}) {
  if (!data || data.version !== 1 || !Array.isArray(data.students)) {
    throw new Error('Datos de backup inválidos.');
  }
  const total = data.students.length;
  const stats = { students: 0, trades: 0, cuentas: 0, reflections: 0 };

  for (let i = 0; i < total; i++) {
    const s = data.students[i];
    if (!s || !s.uid) continue;
    const label = s.profile?.nombre || s.profile?.email || s.uid.substring(0, 8) + '…';
    onProgress(i + 1, total, label);

    // Replace: wipe primero
    if (mode === 'replace') {
      await Promise.all([
        sync.wipeAllTrades(s.uid),
        sync.wipeAllCuentas(s.uid),
        sync.wipeAllReflections(s.uid),
      ]);
    }

    // Profile (siempre merge — no se "wipea")
    if (s.profile) {
      try { await sync.updateProfile(s.uid, s.profile); } catch (e) { console.warn('profile fallo', s.uid, e.message); }
    }

    // Trades en batch
    if (Array.isArray(s.trades) && s.trades.length) {
      const valid = s.trades.filter(t => t && t.id);
      if (valid.length) {
        await sync.saveTradesBatch(s.uid, valid);
        stats.trades += valid.length;
      }
    }

    // Cuentas
    for (const c of (s.cuentas || [])) {
      if (c && c.id) {
        try { await sync.saveCuenta(s.uid, c); stats.cuentas++; } catch (e) { console.warn('cuenta fallo', c.id, e.message); }
      }
    }

    // Reflections
    for (const r of (s.reflections || [])) {
      if (r && r.id) {
        try { await sync.saveReflection(s.uid, r); stats.reflections++; } catch (e) { console.warn('reflection fallo', r.id, e.message); }
      }
    }

    stats.students++;
  }
  return stats;
}

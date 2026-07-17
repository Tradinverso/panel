// Wrapper sobre Firebase Auth. Mantiene currentUser + profile en memoria
// y emite eventos cuando cambian. Las views usan auth.* en vez de Firebase
// directamente para no acoplarse al SDK.

import { auth as fbAuth, db, firebaseConfig } from './firebase.js';
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut,
  createUserWithEmailAndPassword, updatePassword, getAuth,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { setDoc, doc, serverTimestamp, getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { guessTz } from './utils/timezone.js';
import { sync } from './sync.js';

const listeners = new Set();

export const auth = {
  currentUser: null,    // FirebaseUser | null
  profile: null,        // { email, nombre, role, createdAt } | null
  ready: false,         // true after first onAuthStateChanged fires
  _blockedNotice: null, // mensaje a mostrar en login si el alumno fue expulsado por bloqueo

  init() {
    onAuthStateChanged(fbAuth, async (user) => {
      this.currentUser = user;
      if (user) {
        try {
          this.profile = await sync.loadProfile(user);
        } catch (e) {
          if (e?.code === 'auth/account-blocked') {
            // Profile marcado como bloqueado: forzar logout y dejar aviso
            // para que login.js lo muestre.
            await fbSignOut(fbAuth);
            this.currentUser = null;
            this.profile = null;
            this._blockedNotice = 'Cuenta bloqueada por el administrador.';
            this.ready = true;
            this.emit();
            return;
          }
          console.error('No se pudo cargar el perfil:', e);
          this.profile = {
            email: user.email,
            nombre: user.email.split('@')[0],
            role: 'student',
          };
        }
      } else {
        this.profile = null;
      }
      this.ready = true;
      this.emit();
    });
  },

  isAdmin() { return this.profile?.role === 'admin'; },
  isStudent() { return this.profile?.role === 'student'; },
  uid() { return this.currentUser?.uid || null; },
  // Huso del usuario LOGUEADO. Sobrevive a viewAs (this.profile nunca se toca al
  // impersonar), así que el admin siempre puede convertir a SU hora.
  // Si no lo ha configurado, se usa el del navegador.
  timezone() { return this.profile?.timezone || guessTz(); },
  hasTimezone() { return !!this.profile?.timezone; },
  displayName() {
    if (this.profile?.nombre) return this.profile.nombre;
    if (this.currentUser?.email) return this.currentUser.email.split('@')[0];
    return '';
  },

  async signIn(email, password) {
    return signInWithEmailAndPassword(fbAuth, email, password);
  },

  async signOut() {
    return fbSignOut(fbAuth);
  },

  async sendPasswordReset(email) {
    return sendPasswordResetEmail(fbAuth, email);
  },

  // Crea un alumno nuevo SIN romper la sesión del admin actual.
  // Usa una segunda app de Firebase aislada SOLO para el createUser y la
  // escritura inicial del profile. La escritura se hace con la Firestore
  // del secondary app (autenticada como el nuevo alumno), porque las reglas
  // exigen request.auth.uid == uid para escribir users/{uid}/profile/data.
  async createStudent(email, password, nombre) {
    if (!this.isAdmin()) throw new Error('Solo admin puede crear alumnos');
    const secondaryName = 'admin-creator-' + Date.now();
    const secondary = initializeApp(firebaseConfig, secondaryName);
    const secondaryAuth = getAuth(secondary);
    const secondaryDb = getFirestore(secondary);
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      // Aquí secondaryAuth ya está autenticado como el nuevo alumno
      await setDoc(doc(secondaryDb, 'users', cred.user.uid, 'profile', 'data'), {
        email,
        nombre: nombre || email.split('@')[0],
        role: 'student',
        createdAt: serverTimestamp(),
      });
      // Stub en users/{uid}: necesario para que el doc aparezca en
      // getDocs(collection('users')) — Firestore no lista padres con
      // solo subcolecciones y sin campos propios.
      await setDoc(doc(secondaryDb, 'users', cred.user.uid), {
        uid: cred.user.uid,
        email,
      }, { merge: true });
      await fbSignOut(secondaryAuth);
      return cred.user.uid;
    } finally {
      try { await deleteApp(secondary); } catch (e) { /* ignore */ }
    }
  },

  async changePassword(newPassword) {
    if (!this.currentUser) throw new Error('No hay usuario activo');
    return updatePassword(this.currentUser, newPassword);
  },

  async updateName(nombre) {
    if (!this.currentUser) throw new Error('No hay usuario activo');
    await sync.updateProfile(this.currentUser.uid, { nombre });
    this.profile = { ...this.profile, nombre };
    this.emit();
  },

  // Guarda el huso SIEMPRE en el perfil del usuario logueado (nunca en el del
  // alumno que se esté viendo: no se usa targetUid a propósito).
  async updateTimezone(timezone) {
    if (!this.currentUser) throw new Error('No hay usuario activo');
    await sync.updateProfile(this.currentUser.uid, { timezone });
    this.profile = { ...this.profile, timezone };
    this.emit();
  },

  on(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  emit() {
    listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  },
};

// Mensajes de error en español a partir del código de Firebase
export function authErrorMsg(err) {
  const code = err?.code || '';
  switch (code) {
    case 'auth/invalid-email':         return 'El email no tiene un formato válido.';
    case 'auth/user-disabled':         return 'Esta cuenta está deshabilitada.';
    case 'auth/user-not-found':        return 'No existe una cuenta con ese email.';
    case 'auth/wrong-password':        return 'Email o contraseña incorrectos.';
    case 'auth/invalid-credential':    return 'Email o contraseña incorrectos.';
    case 'auth/too-many-requests':     return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
    case 'auth/network-request-failed':return 'Sin conexión. Comprueba tu internet.';
    case 'auth/email-already-in-use':  return 'Ya existe una cuenta con ese email.';
    case 'auth/weak-password':         return 'La contraseña debe tener al menos 6 caracteres.';
    case 'auth/requires-recent-login': return 'Vuelve a iniciar sesión para cambiar la contraseña.';
    case 'auth/missing-email':         return 'Introduce un email.';
    case 'auth/account-blocked':       return 'Cuenta bloqueada por el administrador.';
    default: return err?.message || 'Error desconocido.';
  }
}

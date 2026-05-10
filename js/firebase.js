// Firebase initialization. Single source of truth for app, auth, db.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAFEcGvTiz-alfMmZLs0wPXCJwcC2knKwM",
  authDomain: "tradinverso-dashboard.firebaseapp.com",
  projectId: "tradinverso-dashboard",
  storageBucket: "tradinverso-dashboard.firebasestorage.app",
  messagingSenderId: "360073891724",
  appId: "1:360073891724:web:f621100eec7428bba7d0a9",
};

export const ADMIN_EMAIL = 'tradinverso@gmail.com';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Caché offline (IndexedDB). Solo una pestaña tendrá persistencia activa
// cuando hay varias abiertas; las demás siguen funcionando sin caché.
enableIndexedDbPersistence(db).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('Firestore: persistence solo activa en una pestaña a la vez.');
  } else if (err.code === 'unimplemented') {
    console.warn('Firestore: el navegador no soporta persistencia offline.');
  } else {
    console.error('Firestore persistence error:', err);
  }
});

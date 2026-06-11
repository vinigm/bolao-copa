// Configuração do Firebase — projeto bolao-copa2026-a46d7.
// Pegar em: https://console.firebase.google.com/u/0/project/bolao-copa2026-a46d7/settings/general
// > Seus apps > app Web > Configuração SDK > "Config".
//
// Obs.: deixar a apiKey aqui é normal/seguro num app web do Firebase. A proteção
// real vem das regras do Firestore (firestore.rules) + whitelist de e-mails (auth.js)
// + "Domínios autorizados" no Authentication.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';

const firebaseConfig = {
  // TODO: colar aqui a config do console (ver link acima).
  apiKey: 'COLE_AQUI',
  authDomain: 'bolao-copa2026-a46d7.firebaseapp.com',
  projectId: 'bolao-copa2026-a46d7',
  storageBucket: 'bolao-copa2026-a46d7.firebasestorage.app',
  messagingSenderId: 'COLE_AQUI',
  appId: 'COLE_AQUI',
};

export const app = initializeApp(firebaseConfig);

// Firestore com cache offline persistente (palpite feito sem sinal sincroniza depois).
let _db;
try {
  _db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch (e) {
  console.warn('[Bolão] persistência offline indisponível, usando memória:', e?.message || e);
  const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js');
  _db = getFirestore(app);
}

export const db = _db;
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

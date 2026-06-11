// Login com Google + whitelist fixa (só Vini e Vivi).

import {
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import { auth, googleProvider } from './firebase-config.js';
import { PLAYERS } from './players.js';

export function setupAuthGate({ onAuthorized }) {
  const gate = document.getElementById('auth-gate');
  const btnLogin = document.getElementById('btn-login');
  const btnLogout = document.getElementById('btn-logout');
  const errEl = document.getElementById('auth-error');
  const appEl = document.getElementById('app');

  function showGate(msg) {
    gate.hidden = false;
    appEl.hidden = true;
    if (msg) { errEl.textContent = msg; errEl.hidden = false; } else errEl.hidden = true;
  }
  function hideGate() {
    gate.hidden = true;
    appEl.hidden = false;
  }

  btnLogin?.addEventListener('click', async () => {
    errEl.hidden = true;
    try {
      // Só popup: signInWithRedirect quebra no Safari/iOS (storage partitioning).
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      const code = e?.code || '';
      if (code === 'auth/cancelled-popup-request' || code === 'auth/popup-closed-by-user') return;
      const msg = code === 'auth/popup-blocked'
        ? 'O navegador bloqueou a janelinha de login. Permita pop-ups deste site e toque de novo.'
        : 'Não consegui entrar. Abra o site direto no Safari/Chrome (não pelo navegador dentro de outro app) e tente de novo.';
      errEl.textContent = msg; errEl.hidden = false;
      console.error('[Bolão] login erro', code, e?.message || e);
    }
  });

  btnLogout?.addEventListener('click', async () => {
    await signOut(auth);
    location.reload();
  });

  onAuthStateChanged(auth, async (user) => {
    if (!user) { showGate(); return; }
    const email = (user.email || '').toLowerCase();
    const player = PLAYERS[email];
    if (!player) {
      showGate('Esse bolão é só do Vini e da Vivi. 🙃');
      await signOut(auth);
      return;
    }
    hideGate();
    onAuthorized?.({ user, email, player });
  });
}

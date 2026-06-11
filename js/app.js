// Bolão da Copa 2026 — Vini × Vivi.
// Dados no Firestore:
//   palpites/{email}   → { name, picks: { [matchId]: {h, a} } }
//   bolao/resultados   → { results: { [matchId]: {h, a} } }

import {
  doc, setDoc, onSnapshot, deleteField,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import { db } from './firebase-config.js';
import { setupAuthGate } from './auth.js';
import { PLAYERS, PLAYER_EMAILS } from './players.js';
import { MATCHES } from './matches.js';

const TZ = 'America/Sao_Paulo';

// A numeração oficial FIFA não é estritamente cronológica — pra exibir, ordena por data.
const ORDERED = [...MATCHES].sort((a, b) => (new Date(a.utc) - new Date(b.utc)) || (a.id - b.id));

// Modo demo (?demo=1): sem login nem Firestore, com dados fake — só pra
// desenvolver/testar o visual.
const DEMO = new URLSearchParams(location.search).has('demo');

const state = {
  me: null,                 // email logado
  picks: {},                // email → { matchId: {h,a} }
  results: {},              // matchId → {h,a}
  stageFilter: '',
  scrolled: false,
};

// ---------- pontuação ----------

export function points(pick, res) {
  if (!pick || !res) return null;
  if (pick.h === res.h && pick.a === res.a) return 3;
  return Math.sign(pick.h - pick.a) === Math.sign(res.h - res.a) ? 1 : 0;
}

function totals(email) {
  let pts = 0, exatos = 0, vencedor = 0, jogos = 0;
  for (const m of MATCHES) {
    const p = points(state.picks[email]?.[m.id], state.results[m.id]);
    if (p === null) continue;
    jogos++; pts += p;
    if (p === 3) exatos++;
    if (p === 1) vencedor++;
  }
  return { pts, exatos, vencedor, jogos };
}

// ---------- helpers de data ----------

function kickoff(m) { return new Date(m.utc).getTime(); }
function isLocked(m) { return Date.now() >= kickoff(m); }

function dayKey(m) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(m.utc));
}
function dayLabel(m) {
  const s = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(m.utc));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function hourLabel(m) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
    .format(new Date(m.utc));
}
function todayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}

// ---------- gravação no Firestore ----------

const saveTimers = {};

function savePick(matchId, h, a) {
  const email = state.me;
  if (DEMO) {
    if (h === null || a === null) delete state.picks[email][matchId];
    else state.picks[email][matchId] = { h, a };
    renderPlacarGeral(); renderRanking();
    return;
  }
  clearTimeout(saveTimers[matchId]);
  saveTimers[matchId] = setTimeout(() => {
    const ref = doc(db, 'palpites', email);
    const value = (h === null || a === null) ? deleteField() : { h, a };
    setDoc(ref, { name: PLAYERS[email].name, picks: { [matchId]: value } }, { merge: true })
      .catch((e) => console.error('[Bolão] erro salvando palpite', e));
  }, 500);
}

function saveResult(matchId, h, a) {
  if (DEMO) {
    if (h === null || a === null) delete state.results[matchId];
    else state.results[matchId] = { h, a };
    renderPlacarGeral(); renderRanking();
    return;
  }
  clearTimeout(saveTimers['r' + matchId]);
  saveTimers['r' + matchId] = setTimeout(() => {
    const ref = doc(db, 'bolao', 'resultados');
    const value = (h === null || a === null) ? deleteField() : { h, a };
    setDoc(ref, { results: { [matchId]: value } }, { merge: true })
      .catch((e) => console.error('[Bolão] erro salvando resultado', e));
  }, 500);
}

// ---------- render ----------

function scoreInputs(matchId, kind, pick, disabled) {
  const v = (x) => (x === 0 || x ? x : '');
  return `
    <input type="number" inputmode="numeric" min="0" max="30" class="score"
      data-match="${matchId}" data-kind="${kind}" data-side="h" value="${v(pick?.h)}" ${disabled ? 'disabled' : ''}>
    <span class="score-x">×</span>
    <input type="number" inputmode="numeric" min="0" max="30" class="score"
      data-match="${matchId}" data-kind="${kind}" data-side="a" value="${v(pick?.a)}" ${disabled ? 'disabled' : ''}>`;
}

function ptsBadge(p) {
  if (p === null) return '';
  const cls = p === 3 ? 'pts-3' : p === 1 ? 'pts-1' : 'pts-0';
  const txt = p === 3 ? '+3 🎯' : p === 1 ? '+1 ✅' : '0 ❌';
  return `<span class="pts ${cls}">${txt}</span>`;
}

function matchCard(m) {
  const locked = isLocked(m);
  const res = state.results[m.id] || null;

  const rows = PLAYER_EMAILS.map((email) => {
    const pl = PLAYERS[email];
    const mine = email === state.me;
    const pick = state.picks[email]?.[m.id] || null;
    let body;
    if (!locked && !mine) {
      body = `<span class="secret">🙈 segredo</span>`;
    } else {
      body = scoreInputs(m.id, 'pick', pick, !mine || locked);
    }
    const badge = locked ? ptsBadge(points(pick, res)) : '';
    return `
      <div class="row row-${pl.color}">
        <span class="row-label">${pl.emoji} ${pl.name}</span>
        <span class="row-body">${body}</span>
        ${badge}
      </div>`;
  }).join('');

  const resultRow = locked ? `
    <div class="row row-result">
      <span class="row-label">🏟️ Placar</span>
      <span class="row-body">${scoreInputs(m.id, 'result', res, false)}</span>
    </div>` : `
    <div class="row row-open">
      <span class="open-note">🔓 palpites abertos até ${hourLabel(m)}</span>
    </div>`;

  return `
    <article class="match" id="match-${m.id}">
      <div class="match-meta">
        <span class="stage-badge">${m.stage}</span>
        <span class="match-venue">📍 ${m.venue} · ${hourLabel(m)}</span>
      </div>
      <div class="match-teams">
        <span class="team team-h">${m.homeFlag} ${m.home}</span>
        <span class="team-vs">×</span>
        <span class="team team-a">${m.away} ${m.awayFlag}</span>
      </div>
      ${rows}
      ${resultRow}
    </article>`;
}

function renderJogos() {
  const el = document.getElementById('view-jogos');
  const matches = ORDERED.filter((m) => !state.stageFilter || m.stage === state.stageFilter);
  let html = '', lastDay = '';
  for (const m of matches) {
    const dk = dayKey(m);
    if (dk !== lastDay) {
      lastDay = dk;
      html += `<h2 class="day-header" data-day="${dk}">${dayLabel(m)}</h2>`;
    }
    html += matchCard(m);
  }
  el.innerHTML = html || '<p class="empty">Nenhum jogo nessa fase.</p>';
}

function renderPlacarGeral() {
  const el = document.getElementById('placar-geral');
  const [e1, e2] = PLAYER_EMAILS;
  const t1 = totals(e1), t2 = totals(e2);
  const p1 = PLAYERS[e1], p2 = PLAYERS[e2];
  const lead1 = t1.pts > t2.pts || (t1.pts === t2.pts && t1.exatos > t2.exatos);
  const lead2 = t2.pts > t1.pts || (t2.pts === t1.pts && t2.exatos > t1.exatos);
  const crown = (lead) => (lead ? ' 👑' : '');
  el.innerHTML = `
    <span class="pg-side pg-${p1.color}">${p1.emoji} ${p1.name}${crown(lead1)}</span>
    <span class="pg-score">${t1.pts} × ${t2.pts}</span>
    <span class="pg-side pg-${p2.color}">${crown(lead2)}${p2.name} ${p2.emoji}</span>`;
}

function renderRanking() {
  const el = document.getElementById('view-ranking');
  const cards = PLAYER_EMAILS.map((email) => {
    const pl = PLAYERS[email];
    const t = totals(email);
    return `
      <div class="rank-card rank-${pl.color}">
        <div class="rank-name">${pl.emoji} ${pl.name}</div>
        <div class="rank-pts">${t.pts} <small>pts</small></div>
        <div class="rank-detail">
          <span>🎯 ${t.exatos} exatos</span>
          <span>✅ ${t.vencedor} vencedor</span>
          <span>⚽ ${t.jogos} jogos</span>
        </div>
      </div>`;
  }).join('');

  // últimos 5 jogos com resultado
  const done = ORDERED.filter((m) => state.results[m.id]).slice(-5).reverse();
  const hist = done.map((m) => {
    const r = state.results[m.id];
    const per = PLAYER_EMAILS.map((email) => {
      const pl = PLAYERS[email];
      const p = points(state.picks[email]?.[m.id], r);
      return `<span class="hist-pl">${pl.emoji} ${ptsBadge(p) || '<span class="pts">—</span>'}</span>`;
    }).join('');
    return `
      <div class="hist-row">
        <span class="hist-game">${m.homeFlag} ${r.h} × ${r.a} ${m.awayFlag}</span>
        ${per}
      </div>`;
  }).join('');

  el.innerHTML = `
    <div class="rank-wrap">${cards}</div>
    ${done.length ? `<h3 class="hist-title">Últimos jogos</h3>${hist}` : ''}`;
}

function renderAll() {
  renderPlacarGeral();
  renderJogos();
  renderRanking();
}

// ---------- interações ----------

function readPair(matchId, kind) {
  const get = (side) => {
    const inp = document.querySelector(`input[data-match="${matchId}"][data-kind="${kind}"][data-side="${side}"]`);
    const n = parseInt(inp?.value, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  return { h: get('h'), a: get('a') };
}

function setupInteractions() {
  document.querySelector('main').addEventListener('input', (e) => {
    const inp = e.target;
    if (!inp.classList.contains('score')) return;
    const matchId = inp.dataset.match;
    const kind = inp.dataset.kind;
    const { h, a } = readPair(matchId, kind);
    if ((h === null) !== (a === null)) return; // só salva par completo (ou limpeza total)
    if (kind === 'pick') savePick(matchId, h, a);
    else saveResult(matchId, h, a);
  });

  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
      const tab = btn.dataset.tab;
      for (const v of ['jogos', 'ranking', 'regras']) {
        document.getElementById(`view-${v}`).hidden = v !== tab;
      }
      document.getElementById('filters').style.display = tab === 'jogos' ? '' : 'none';
    });
  });

  document.getElementById('btn-hoje').addEventListener('click', () => scrollToToday(true));

  const sel = document.getElementById('stage-filter');
  const all = [...new Set(ORDERED.map((m) => m.stage))];
  const stages = [
    ...all.filter((s) => s.startsWith('Grupo')).sort(),
    ...all.filter((s) => !s.startsWith('Grupo')),
  ];
  for (const s of stages) {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    state.stageFilter = sel.value;
    renderJogos();
  });
}

function scrollToToday(smooth = false) {
  const tk = todayKey();
  const headers = [...document.querySelectorAll('.day-header')];
  const target = headers.find((h) => h.dataset.day >= tk) || headers[headers.length - 1];
  target?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
}

// ---------- snapshots ----------

function subscribe() {
  for (const email of PLAYER_EMAILS) {
    onSnapshot(doc(db, 'palpites', email), (snap) => {
      state.picks[email] = snap.data()?.picks || {};
      // eco local do próprio palpite não precisa re-render (evita perder o foco do input)
      if (email === state.me && snap.metadata.hasPendingWrites) { renderPlacarGeral(); return; }
      renderAll();
      maybeAutoScroll();
    });
  }
  onSnapshot(doc(db, 'bolao', 'resultados'), (snap) => {
    state.results = snap.data()?.results || {};
    if (snap.metadata.hasPendingWrites) { renderPlacarGeral(); renderRanking(); return; }
    renderAll();
    maybeAutoScroll();
  });
}

function maybeAutoScroll() {
  if (state.scrolled) return;
  state.scrolled = true;
  setTimeout(() => scrollToToday(false), 100);
}

// ---------- boot ----------

function boot({ player, email }) {
    state.me = email;
    document.getElementById('user-chip').textContent = `${player.emoji} ${player.name}`;
    renderAll();
    setupInteractions();
    if (!DEMO) subscribe();
    maybeAutoScroll();
    // destrava cards conforme os jogos começam (checa a cada minuto)
    setInterval(() => {
      if (document.activeElement?.classList?.contains('score')) return;
      renderJogos(); renderPlacarGeral();
    }, 60_000);
}

if (DEMO) {
  document.getElementById('auth-gate').hidden = true;
  document.getElementById('app').hidden = false;
  for (const e of PLAYER_EMAILS) state.picks[e] = {};
  const [e1, e2] = PLAYER_EMAILS;
  const m0 = MATCHES[0];
  state.picks[e1][m0.id] = { h: 2, a: 0 };
  state.picks[e2][m0.id] = { h: 1, a: 0 };
  state.results[m0.id] = { h: 2, a: 0 };
  boot({ player: PLAYERS[e1], email: e1 });
} else {
  setupAuthGate({ onAuthorized: boot });
}

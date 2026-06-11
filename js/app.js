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

// Modo demo (?demo=1): sem login nem Firestore, com dados fake — só pra
// desenvolver/testar o visual.
const DEMO = new URLSearchParams(location.search).has('demo');

// A numeração oficial FIFA não é estritamente cronológica — pra exibir, ordena por data.
const ORDERED = [...MATCHES].sort((a, b) => (new Date(a.utc) - new Date(b.utc)) || (a.id - b.id));

// Fases na ordem de exibição: grupos A–L, depois mata-mata em ordem cronológica.
const STAGES = (() => {
  const all = [...new Set(ORDERED.map((m) => m.stage))];
  return [
    ...all.filter((s) => s.startsWith('Grupo')).sort(),
    ...all.filter((s) => !s.startsWith('Grupo')),
  ];
})();

const state = {
  me: null,                 // email logado
  picks: {},                // email → { matchId: {h,a} }
  results: {},              // matchId → {h,a}
  stageFilter: '',
  selectedDay: null,        // dia selecionado no calendário (YYYY-MM-DD)
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

function fmtDay(date, opts) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, ...opts }).format(date);
}
function dayKey(m) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(m.utc));
}
function dayLabel(m) {
  const s = fmtDay(new Date(m.utc), { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function hourLabel(m) {
  return fmtDay(new Date(m.utc), { hour: '2-digit', minute: '2-digit' });
}
function todayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}

// ---------- gravação no Firestore (autosave com debounce + flush manual) ----------

const saveTimers = {};
const pendingSaves = new Map();

function schedule(key, fn) {
  clearTimeout(saveTimers[key]);
  pendingSaves.set(key, fn);
  saveTimers[key] = setTimeout(() => { pendingSaves.delete(key); fn(); }, 600);
}

function flushSaves() {
  for (const [key, fn] of pendingSaves) { clearTimeout(saveTimers[key]); fn(); }
  pendingSaves.clear();
}

function savePick(matchId, h, a) {
  const email = state.me;
  if (DEMO) {
    if (h === null || a === null) delete state.picks[email][matchId];
    else state.picks[email][matchId] = { h, a };
    renderPlacarGeral(); renderRanking();
    return;
  }
  schedule('p' + matchId, () => {
    const value = (h === null || a === null) ? deleteField() : { h, a };
    setDoc(doc(db, 'palpites', email), { name: PLAYERS[email].name, picks: { [matchId]: value } }, { merge: true })
      .catch((e) => console.error('[Bolão] erro salvando palpite', e));
  });
}

function saveResult(matchId, h, a) {
  if (DEMO) {
    if (h === null || a === null) delete state.results[matchId];
    else state.results[matchId] = { h, a };
    renderPlacarGeral(); renderRanking();
    return;
  }
  schedule('r' + matchId, () => {
    const value = (h === null || a === null) ? deleteField() : { h, a };
    setDoc(doc(db, 'bolao', 'resultados'), { results: { [matchId]: value } }, { merge: true })
      .catch((e) => console.error('[Bolão] erro salvando resultado', e));
  });
}

// ---------- render: tabela de jogos ----------

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

// Colunas dos jogadores: o usuário logado primeiro (no celular evita rolar pro lado).
function playerColumns() {
  return [...PLAYER_EMAILS].sort((a, b) => (a === state.me ? -1 : 0) - (b === state.me ? -1 : 0));
}

function matchRow(m, cols) {
  const locked = isLocked(m);
  const res = state.results[m.id] || null;

  const realCell = locked
    ? `<td class="cell-real">${scoreInputs(m.id, 'result', res, false)}</td>`
    : `<td class="cell-real"><span class="dash" title="abre quando o jogo começar">–</span></td>`;

  const pickCells = cols.map((email) => {
    const pl = PLAYERS[email];
    const mine = email === state.me;
    const pick = state.picks[email]?.[m.id] || null;
    let body;
    if (!locked && !mine) body = `<span class="secret" title="segredo até o jogo começar">🙈</span>`;
    else body = scoreInputs(m.id, 'pick', pick, !mine || locked);
    const badge = locked && res ? `<div class="cell-pts">${ptsBadge(points(pick, res))}</div>` : '';
    return `<td class="cell-pick cell-${pl.color}">${body}${badge}</td>`;
  }).join('');

  return `
    <tr class="match-row" id="match-${m.id}">
      <td class="cell-jogo">
        <div class="mt">${m.homeFlag} ${m.home} <span class="mvs">×</span> ${m.awayFlag} ${m.away}</div>
        <div class="md">${m.stage} · ${hourLabel(m)} · ${m.venue}</div>
      </td>
      ${realCell}
      ${pickCells}
    </tr>`;
}

function renderJogos() {
  const el = document.getElementById('view-jogos');
  const cols = playerColumns();
  const ncols = 2 + cols.length;

  const head = `
    <tr>
      <th class="col-jogo">Jogo</th>
      <th class="col-real">Real</th>
      ${cols.map((e) => `<th class="col-${PLAYERS[e].color}">${PLAYERS[e].emoji} ${PLAYERS[e].name}</th>`).join('')}
    </tr>`;

  // jogos em ordem cronológica, com um cabeçalho por dia
  let body = '', lastDay = '';
  for (const m of ORDERED) {
    if (state.stageFilter && m.stage !== state.stageFilter) continue;
    const dk = dayKey(m);
    if (dk !== lastDay) {
      lastDay = dk;
      body += `<tr class="stage-row" data-day="${dk}"><td colspan="${ncols}"><span class="stage-label">📅 ${dayLabel(m).toUpperCase()}</span></td></tr>`;
    }
    body += matchRow(m, cols);
  }

  el.innerHTML = `
    <div class="table-wrap">
      <table class="palpites-table">
        <thead>${head}</thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

// ---------- render: calendário ----------

const matchesByDay = (() => {
  const map = {};
  for (const m of ORDERED) (map[dayKey(m)] ||= []).push(m);
  return map;
})();

function renderCalendario() {
  const el = document.getElementById('view-calendario');
  const tk = todayKey();
  const months = [{ y: 2026, m: 5, label: 'Junho 2026' }, { y: 2026, m: 6, label: 'Julho 2026' }];
  const weekdays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  const grids = months.map(({ y, m, label }) => {
    const first = new Date(y, m, 1);
    const ndays = new Date(y, m + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < first.getDay(); i++) cells += '<div class="cal-cell cal-empty"></div>';
    for (let d = 1; d <= ndays; d++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const games = matchesByDay[key] || [];
      const classes = ['cal-cell'];
      if (games.length) classes.push('cal-has');
      if (key === tk) classes.push('cal-today');
      if (key === state.selectedDay) classes.push('cal-selected');
      cells += `
        <div class="${classes.join(' ')}" ${games.length ? `data-day="${key}"` : ''}>
          <span class="cal-num">${d}</span>
          ${games.length ? `<span class="cal-count">${games.length}⚽</span>` : ''}
        </div>`;
    }
    return `
      <div class="cal-month">
        <h3>${label}</h3>
        <div class="cal-grid">
          ${weekdays.map((w) => `<div class="cal-wd">${w}</div>`).join('')}
          ${cells}
        </div>
      </div>`;
  }).join('');

  const day = state.selectedDay;
  const games = day ? (matchesByDay[day] || []) : [];
  const detail = !day ? '<p class="cal-hint">Toque num dia pra ver os jogos. 👆</p>' : `
    <h3 class="cal-detail-title">${fmtDay(new Date(games[0].utc), { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
    ${games.map((m) => `
      <div class="cal-game">
        <span class="cal-game-hour">${hourLabel(m)}</span>
        <span class="cal-game-teams">${m.homeFlag} ${m.home} × ${m.away} ${m.awayFlag}</span>
        <span class="cal-game-meta">${m.stage} · ${m.venue}</span>
      </div>`).join('')}`;

  el.innerHTML = `<div class="cal-months">${grids}</div><div class="cal-detail">${detail}</div>`;
}

// ---------- render: placar geral e ranking ----------

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
  renderCalendario();
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

  // calendário: clique num dia mostra os jogos dele
  document.getElementById('view-calendario').addEventListener('click', (e) => {
    const cell = e.target.closest('[data-day]');
    if (!cell) return;
    state.selectedDay = cell.dataset.day;
    renderCalendario();
  });

  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === btn));
      const tab = btn.dataset.tab;
      for (const v of ['jogos', 'calendario', 'ranking', 'regras']) {
        document.getElementById(`view-${v}`).hidden = v !== tab;
      }
      document.getElementById('filters').style.display = tab === 'jogos' ? '' : 'none';
      document.getElementById('save-bar').style.display = tab === 'jogos' ? '' : 'none';
    });
  });

  document.getElementById('btn-hoje').addEventListener('click', () => {
    const tk = todayKey();
    const days = [...document.querySelectorAll('.stage-row[data-day]')];
    const target = days.find((d) => d.dataset.day >= tk) || days[days.length - 1];
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const sel = document.getElementById('stage-filter');
  for (const s of STAGES) {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    state.stageFilter = sel.value;
    renderJogos();
  });

  // o autosave já grava sozinho; o botão força a gravação imediata + feedback
  document.getElementById('btn-save').addEventListener('click', () => {
    flushSaves();
    const toast = document.getElementById('save-toast');
    toast.hidden = false;
    setTimeout(() => { toast.hidden = true; }, 2500);
  });
}

// ---------- snapshots ----------

function subscribe() {
  for (const email of PLAYER_EMAILS) {
    onSnapshot(doc(db, 'palpites', email), (snap) => {
      state.picks[email] = snap.data()?.picks || {};
      // eco local do próprio palpite não precisa re-render (evita perder o foco do input)
      if (email === state.me && snap.metadata.hasPendingWrites) { renderPlacarGeral(); return; }
      renderAll();
    });
  }
  onSnapshot(doc(db, 'bolao', 'resultados'), (snap) => {
    state.results = snap.data()?.results || {};
    if (snap.metadata.hasPendingWrites) { renderPlacarGeral(); renderRanking(); return; }
    renderAll();
  });
}

// ---------- boot ----------

function boot({ player, email }) {
  state.me = email;
  state.selectedDay = matchesByDay[todayKey()] ? todayKey() : null;
  document.getElementById('user-chip').textContent = `${player.emoji} ${player.name}`;
  renderAll();
  setupInteractions();
  if (!DEMO) subscribe();
  // destrava linhas conforme os jogos começam (checa a cada minuto)
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
  state.picks[e1][1] = { h: 2, a: 0 };
  state.picks[e2][1] = { h: 1, a: 0 };
  state.picks[e1][3] = { h: 1, a: 1 };
  state.picks[e2][3] = { h: 2, a: 1 };
  state.results[1] = { h: 2, a: 0 };
  boot({ player: PLAYERS[e1], email: e1 });
} else {
  setupAuthGate({ onAuthorized: boot });
}

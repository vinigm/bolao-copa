# ⚽ Bolão da Copa 2026 — Vini × Vivi × Antonio

Bolão de palpites dos jogos da Copa do Mundo 2026, entre amigos. 💚

**App:** https://vinigm.github.io/bolao-copa/

## Como funciona

- Cada um dá o palpite de placar antes do jogo começar (depois trava 🔒).
- Até o jogo começar, o palpite do outro fica secreto 🙈.
- Depois do jogo, qualquer um dos dois lança o placar oficial.
- Pontuação: **placar exato = 3 pts**, acertou o vencedor/empate = 1 pt.
- Desempate do bolão: mais placares exatos.

## Stack

Site estático sem build (HTML/CSS/JS ES modules) + Firebase via CDN (Firestore +
Auth Google) + PWA. Deploy: push na `main` → GitHub Pages.

Mesmo padrão do [figurinhas2026](https://github.com/vinigm/figurinhas2026):

- Login **só `signInWithPopup`** (redirect quebra no Safari/iOS).
- Mudou asset? **Bumpar `CACHE` no `sw.js`** (senão o PWA serve versão velha).
- Whitelist de e-mails em `js/players.js` **e** em `firestore.rules`.

## Dados (Firestore, projeto `bolao-copa2026-a46d7`)

| Doc | Conteúdo | Quem escreve |
|---|---|---|
| `palpites/{email}` | `{ name, picks: { matchId: {h, a} } }` | só o dono |
| `bolao/resultados` | `{ results: { matchId: {h, a} } }` | os dois |

A tabela dos 104 jogos está hardcoded em `js/matches.js` (id = numeração oficial
FIFA, horários em UTC, exibidos em horário de Brasília).

> Obs.: o "segredo" do palpite do outro é só visual (o Firestore deixa os dois
> lerem tudo). Bolão entre pessoas de confiança. 😄

## Setup do Firebase (feito uma vez)

1. Console → Authentication → Sign-in method → habilitar **Google**.
2. Authentication → Settings → Authorized domains → adicionar `vinigm.github.io`.
3. Firestore Database → criar banco (production mode) → Rules → colar `firestore.rules`.
4. Project settings → Your apps → criar app **Web** → copiar a config pro
   `js/firebase-config.js`.

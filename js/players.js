// Os dois jogadores do bolão. Pra adicionar mais gente no futuro:
// incluir aqui E na lista members() do firestore.rules.

export const PLAYERS = {
  'vinigm@gmail.com': { id: 'vini', name: 'Vini', emoji: '🦁', color: 'vini' },
  'victoria.cerutti@gmail.com': { id: 'vivi', name: 'Vivi', emoji: '🦋', color: 'vivi' },
  // Yahoo, mas o login é via Google: precisa ter conta Google associada a esse e-mail.
  'acrmello@yahoo.com': { id: 'antonio', name: 'Antonio', emoji: '🦅', color: 'antonio' },
};

export const PLAYER_EMAILS = Object.keys(PLAYERS);

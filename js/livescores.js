// Placar automático via API pública da ESPN (scoreboard da Copa, CORS liberado).
// Casa cada evento com nosso jogo pelo horário do pontapé inicial + nomes dos
// times (mapeados EN→PT). No mata-mata, enquanto nosso jogo ainda tem
// placeholder ("1º Grupo A"), o casamento cai pro horário sozinho.

import { MATCHES } from './matches.js';

const API = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

// displayName da ESPN → nome em js/matches.js (48 seleções, conferido na API)
const EN_PT = {
  'Algeria': 'Argélia', 'Argentina': 'Argentina', 'Australia': 'Austrália',
  'Austria': 'Áustria', 'Belgium': 'Bélgica', 'Bosnia-Herzegovina': 'Bósnia e Herzegovina',
  'Brazil': 'Brasil', 'Canada': 'Canadá', 'Cape Verde': 'Cabo Verde',
  'Colombia': 'Colômbia', 'Congo DR': 'RD Congo', 'Croatia': 'Croácia',
  'Curaçao': 'Curaçao', 'Czechia': 'República Tcheca', 'Ecuador': 'Equador',
  'Egypt': 'Egito', 'England': 'Inglaterra', 'France': 'França',
  'Germany': 'Alemanha', 'Ghana': 'Gana', 'Haiti': 'Haiti',
  'Iran': 'Irã', 'Iraq': 'Iraque', 'Ivory Coast': 'Costa do Marfim',
  'Japan': 'Japão', 'Jordan': 'Jordânia', 'Mexico': 'México',
  'Morocco': 'Marrocos', 'Netherlands': 'Holanda', 'New Zealand': 'Nova Zelândia',
  'Norway': 'Noruega', 'Panama': 'Panamá', 'Paraguay': 'Paraguai',
  'Portugal': 'Portugal', 'Qatar': 'Catar', 'Saudi Arabia': 'Arábia Saudita',
  'Scotland': 'Escócia', 'Senegal': 'Senegal', 'South Africa': 'África do Sul',
  'South Korea': 'Coreia do Sul', 'Spain': 'Espanha', 'Sweden': 'Suécia',
  'Switzerland': 'Suíça', 'Tunisia': 'Tunísia', 'Türkiye': 'Turquia',
  'United States': 'Estados Unidos', 'Uruguay': 'Uruguai', 'Uzbekistan': 'Uzbequistão',
};

const ts = (iso) => new Date(iso).getTime();

function matchEvent(ev) {
  const comp = ev.competitions?.[0];
  if (!comp) return null;
  const home = comp.competitors?.find((c) => c.homeAway === 'home');
  const away = comp.competitors?.find((c) => c.homeAway === 'away');
  if (!home || !away) return null;

  const hName = EN_PT[home.team?.displayName];
  const aName = EN_PT[away.team?.displayName];
  const when = ts(ev.date);
  const candidates = MATCHES.filter((m) => ts(m.utc) === when);

  let m = candidates.find((x) => x.home === hName && x.away === aName);
  let swapped = false;
  if (!m) { m = candidates.find((x) => x.home === aName && x.away === hName); swapped = !!m; }
  if (!m && candidates.length === 1) {
    // único jogo nesse horário (mata-mata com placeholder): casa pelo horário
    m = candidates[0];
    swapped = (m.away === hName || m.home === aName);
  }
  if (!m) return null;

  const hs = parseInt(home.score, 10), as = parseInt(away.score, 10);
  if (!Number.isFinite(hs) || !Number.isFinite(as)) return null;
  const st = comp.status?.type || {};
  return {
    id: m.id,
    h: swapped ? as : hs,
    a: swapped ? hs : as,
    state: st.state || '',                       // pre | in | post
    completed: !!st.completed,
    clock: comp.status?.displayClock || '',
  };
}

// dates: array de 'YYYYMMDD' (UTC). Busca o intervalo [min-1dia, max] numa
// requisição só — a ESPN agrupa por data dos EUA, então o dia anterior cobre
// os jogos de madrugada UTC.
export async function fetchScores(dates) {
  if (!dates.length) return [];
  const sorted = [...dates].sort();
  const min = sorted[0], max = sorted[sorted.length - 1];
  const d = new Date(Date.UTC(+min.slice(0, 4), +min.slice(4, 6) - 1, +min.slice(6, 8)));
  d.setUTCDate(d.getUTCDate() - 1);
  const minPrev = d.toISOString().slice(0, 10).replace(/-/g, '');
  const range = minPrev === max ? max : `${minPrev}-${max}`;
  const r = await fetch(`${API}?dates=${range}`);
  if (!r.ok) throw new Error(`ESPN ${r.status}`);
  const data = await r.json();
  return (data.events || []).map(matchEvent).filter(Boolean);
}

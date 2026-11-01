import { createMatch, addBot, startMatch, advance } from '../shared/engine.js';
const secs = [], power = [], timeouts = [];
let doubleDoses = 0, rounds = 0;
for (let i = 0; i < 60; i++) {
  let now = 1e6 + i;
  const s = createMatch({ seed: 1000 + i, now });
  while (s.players.length < 3) addBot(s);
  startMatch(s, now);
  let lastRound = 0;
  while (s.phase !== 'end') {
    advance(s, now); now += 500;
    if (s.phase === 'summon' && s.round !== lastRound) {
      lastRound = s.round; rounds++;
      secs.push(s.battle.seconds);
      for (const p of s.players) { power.push(p.fighter.power); if (p.dose.double) doubleDoses++; }
      if (s.battle.seconds >= 45) timeouts.push(1);
    }
  }
}
const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(p * (b.length - 1))].toFixed(1); };
console.log('battle sec p10/p50/p90:', q(secs, .1), q(secs, .5), q(secs, .9), 'timeouts', timeouts.length, '/', rounds);
console.log('fighter power p10/p50/p90:', q(power, .1), q(power, .5), q(power, .9));
console.log('double dose rate per player-round:', (doubleDoses / power.length).toFixed(3));

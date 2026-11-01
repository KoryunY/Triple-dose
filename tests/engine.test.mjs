import assert from 'node:assert/strict';
import { createMatch, addBot, addPlayer, startMatch, advance, act, viewFor } from '../shared/engine.js';
import { createBattle, stepBattle, runBattle } from '../shared/sim.js';

function playMatch(withHuman) {
  let now = 1_000_000;
  const s = createMatch({ seed: 42, now });
  if (withHuman) addPlayer(s, { id: 'me', name: 'Me' });
  while (s.players.length < 3) addBot(s);
  const r = withHuman ? act(s, 'me', { type: 'start' }, now) : startMatch(s, now);
  assert.ok(r.ok, r.error);
  let rounds = 0, steps = 0;
  const phases = new Set();
  while (s.phase !== 'end' && steps < 5000) {
    steps++;
    phases.add(s.phase);
    if (withHuman && s.phase === 'trade') act(s, 'me', { type: 'tradeDone' }, now);
    if (withHuman && s.phase === 'play' && !s.players[0].locked) {
      const me = s.players.find((p) => p.id === 'me');
      const v = viewFor(s, 'me');
      assert.equal(v.players.find((p) => p.id !== 'me').hand, undefined, 'others hands hidden');
      act(s, 'me', { type: 'play', cards: me.hand.slice(0, 2).map((c) => c.id), echoes: [] }, now);
    }
    advance(s, now);
    now += 500;
    if (s.phase === 'result') rounds = s.round;
  }
  assert.equal(s.phase, 'end', 'match ends');
  assert.ok(s.results.length === 3);
  return { s, rounds, phases, steps };
}

const a = playMatch(false);
console.log('bots-only rounds:', a.s.round, 'results:', a.s.results.map((r) => `${r.name}:${r.wins}`).join(' '), 'phases:', [...a.phases].join(','));
const b = playMatch(true);
console.log('with human rounds:', b.s.round, 'results:', b.s.results.map((r) => `${r.name}:${r.wins}`).join(' '));
console.log('log tail:\n  ' + b.s.log.slice(-8).map((l) => l.text).join('\n  '));

// determinism: same battle twice, and stepwise == runBattle
const bt = b.s.battle;
const r1 = runBattle(bt.units, bt.seed, { maxSeconds: 45 });
const r2 = runBattle(JSON.parse(JSON.stringify(bt.units)), bt.seed, { maxSeconds: 45 });
const bb = createBattle(bt.units, bt.seed, { maxSeconds: 45 });
while (!bb.done) stepBattle(bb);
assert.equal(r1.winner, r2.winner); assert.equal(r1.ticks, r2.ticks); assert.equal(bb.winner, r1.winner); assert.equal(bb.tick, r1.ticks);
assert.equal(r1.winner, bt.winner);
console.log('battle determinism ok; last battle seconds:', bt.seconds.toFixed(1), 'units:', bt.units.length);

// battle length distribution
const secs = [];
for (let i = 0; i < 30; i++) { const m = playMatch(false); for (const h of m.s.history) {} secs.push(m.s.round); }
console.log('rounds per bot match (30 runs): min', Math.min(...secs), 'max', Math.max(...secs), 'avg', (secs.reduce((x, y) => x + y) / secs.length).toFixed(2));

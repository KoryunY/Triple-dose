import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
const DB = '/tmp/claude-0/-home-claude/685427cb-867c-5dfc-94ba-d184cbdfa8fa/scratchpad/td-test.sqlite';
rmSync(DB, { force: true });
process.env.TD_LOCAL_DB = DB;
const guestApi = (await import('../api/guest.js')).default;
const matchApi = (await import('../api/match.js')).default;

async function call(h, method, data) {
  const req = { method, query: method === 'GET' ? data : {}, body: method === 'POST' ? data : {} };
  let out;
  const res = { s: 200, setHeader() {}, status(c) { this.s = c; return this; }, json(d) { out = { status: this.s, ...d }; } };
  await h(req, res);
  return out;
}

// three guests
const g = [];
for (const n of ['Ann', 'Ben', 'Cat']) g.push((await call(guestApi, 'POST', { name: n })).guest.id);
const created = await call(matchApi, 'POST', { op: 'create', guest: g[0], name: 'Ann', loadout: { patron: { id: 'rin', bond: 1 } } });
assert.equal(created.status, 200, JSON.stringify(created));
const code = created.code;
for (const i of [1, 2]) {
  const j = await call(matchApi, 'POST', { op: 'join', code, guest: g[i] });
  assert.equal(j.status, 200, JSON.stringify(j));
}
// 4th player refused
const g4 = (await call(guestApi, 'POST', { name: 'Dan' })).guest.id;
const j4 = await call(matchApi, 'POST', { op: 'join', code, guest: g4 });
assert.equal(j4.status, 400); console.log('4th player:', j4.error);
// non-host cannot start
const bad = await call(matchApi, 'POST', { op: 'act', code, guest: g[1], action: { type: 'start' } });
assert.equal(bad.status, 400); console.log('non-host start:', bad.error);
const st = await call(matchApi, 'POST', { op: 'act', code, guest: g[0], action: { type: 'start' } });
assert.equal(st.status, 200, JSON.stringify(st));
assert.equal(st.view.phase, 'roll');

// rejoin: guest lookup returns room
const look = await call(guestApi, 'GET', { id: g[2] });
assert.equal(look.room, code); console.log('rejoin lookup ok:', look.room);

// play through quickly by faking time: patch Date.now
let fake = Date.now();
const realNow = Date.now; Date.now = () => fake;
let view, loops = 0;
while (loops++ < 400) {
  for (const id of g) {
    view = (await call(matchApi, 'GET', { code, guest: id })).view;
    const me = view.players.find((p) => p.id === id);
    if (view.phase === 'trade' && !me.tradeDone) {
      if (id === g[0] && me.hand.length) {
        await call(matchApi, 'POST', { op: 'act', code, guest: id, action: { type: 'offer', to: g[1], give: me.hand[0].id, wantSuit: 'blade' } });
      }
      const offers = view.offers.filter((o) => o.to === id && o.status === 'open');
      for (const o of offers) {
        const card = me.hand.find((c) => c.suit === o.wantSuit);
        await call(matchApi, 'POST', { op: 'act', code, guest: id, action: { type: 'respond', offerId: o.id, accept: !!card, card: card?.id } });
      }
      await call(matchApi, 'POST', { op: 'act', code, guest: id, action: { type: 'tradeDone' } });
    }
    if (view.phase === 'play' && !me.locked) {
      await call(matchApi, 'POST', { op: 'act', code, guest: id, action: { type: 'play', cards: me.hand.slice(0, 2).map((c) => c.id) } });
    }
  }
  if (view.phase === 'end') break;
  fake += 1500;
}
Date.now = realNow;
assert.equal(view.phase, 'end');
console.log('online match finished in round', view.round, view.results.map((r) => `${r.name}#${r.place}`).join(' '));
console.log('trades:', view.history.length, 'log:', view.log.filter((l) => /traded|revealed|Edict/.test(l.text)).map((l) => l.text).slice(0, 4).join(' | '));
// host handoff: Ann goes silent -> after timeout someone else becomes host
fake += 60000; Date.now = () => fake;
const v2 = (await call(matchApi, 'GET', { code, guest: g[1] })).view;
Date.now = realNow;
console.log('host after Ann disconnects:', v2.hostId === g[1] ? 'Ben ✓' : v2.hostId);
console.log('ids', { ann: g[0], ben: g[1], cat: g[2], host: v2.hostId });

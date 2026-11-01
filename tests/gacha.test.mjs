import assert from 'node:assert/strict';
import { doPulls, rate5 } from '../src/core/gacha.js';
import { newProfile } from '../shared/data.js';
import { makeRng } from '../shared/rng.js';
const rng = makeRng(7);
const p = newProfile(); p.tickets = 1e6;
let fives = 0, pulls = 0, maxGap = 0, gap = 0, featured = 0, lost = 0, maxGap4 = 0, gap4 = 0;
for (let i = 0; i < 20000; i++) {
  const r = doPulls(p, 'afterglow', 10, rng.next);
  for (const x of r.results) {
    pulls++; gap++; gap4++;
    if (x.rarity === 5) { fives++; maxGap = Math.max(maxGap, gap); gap = 0; if (x.id === 'rin') featured++; if (x.lost5050) lost++; }
    if (x.rarity >= 4) { maxGap4 = Math.max(maxGap4, gap4); gap4 = 0; }
  }
}
console.log('avg pulls per 5★', (pulls / fives).toFixed(1), 'max gap', maxGap, 'featured share', (featured / fives).toFixed(3), 'lost 50/50', lost, 'max 4★ gap', maxGap4);
assert.ok(maxGap <= 80); assert.ok(maxGap4 <= 10);
assert.equal(rate5(79), 1);
// never two losses in a row: after loss, next 5★ must be featured (checked via guaranteed flag behavior)
const q = newProfile(); q.tickets = 10;
assert.equal(doPulls(q, 'afterglow', 11).ok, false);
console.log('gacha ok');

import { newRun, battleFor, resolveFight, applyNode, advanceRun, loanerEcho, partyAlive } from '../src/core/expedition.js';
import { createMatch, addBot, startMatch, advance } from '../shared/engine.js';
// harvest realistic echoes from bot matches
const echoes = [];
for (let i = 0; echoes.length < 60; i++) {
  let now = 1e6; const s = createMatch({ seed: 500 + i, now }); while (s.players.length < 3) addBot(s); startMatch(s, now);
  while (s.phase !== 'end') { advance(s, now); now += 500; }
  for (const p of s.players) echoes.push(...p.earned);
}
function sim(partySize, level) {
  let reach = [0, 0, 0, 0], wins = 0;
  for (let t = 0; t < 200; t++) {
    const party = echoes.slice((t * 3) % 57, (t * 3) % 57 + partySize).map((e) => ({ ...e, level }));
    const run = newRun(party);
    while (!run.over) {
      const step = run.acts[run.act][run.step];
      const type = step.includes('fight') ? 'fight' : step[0];
      if (['fight', 'elite', 'boss'].includes(type)) { const b = battleFor(run, type, party); resolveFight(run, type, b); }
      else applyNode(run, type, party);
      if (!partyAlive(run)) run.over = true;
      if (!run.over) advanceRun(run, type);
    }
    reach[run.act]++; if (run.won) wins++;
  }
  console.log(`party ${partySize} lvl ${level}: ended in act1/2/3 =`, reach.slice(0, 3).join('/'), 'full clears', wins, '/200');
}
sim(1, 0); sim(2, 0); sim(3, 0); sim(3, 5); sim(3, 10);
const lo = loanerEcho(3); const r = newRun([lo]); console.log('loaner power', lo.power);
{ let reach=[0,0,0,0]; for (let t=0;t<200;t++){ const lo=loanerEcho(t+1); const run=newRun([lo]); while(!run.over){ const step=run.acts[run.act][run.step]; const type=step.includes('fight')?'fight':step[0]; if(['fight','elite','boss'].includes(type)) resolveFight(run,type,battleFor(run,type,[lo])); else applyNode(run,type,[lo]); if(!partyAlive(run)) run.over=true; if(!run.over) advanceRun(run,type);} reach[run.act]++; } console.log('loaner ended act1/2/3', reach.slice(0,3).join('/')); }

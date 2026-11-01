// Expedition screen: pick a path through 3 acts, fight in the arena, collect buffs and rewards.

import { h, btn, svgEl, toast, modal, clearEl, confirmBox } from './dom.js';
import { getProfile, saveProfile, equippedEchoes } from '../core/profile.js';
import { newRun, loanerEcho, battleFor, resolveFight, applyNode, advanceRun, partyAlive, NODE_INFO } from '../core/expedition.js';
import { setView } from '../three/stage.js';
import { createArenaView } from '../three/arena.js';
import { createTableView } from '../three/table.js';
import { echoBadgeSVG } from '../art/echoBadge.js';
import { dosePop } from './parts.js';
import { audio } from '../audio/audio.js';

const ACT_NAMES = ['Act I — Back Alley', 'Act II — The Club', 'Act III — The House'];

export function openExpedition(nav) {
  const ui = document.getElementById('ui');
  const backdrop = createTableView();
  setView(backdrop);
  const root = h('div', { class: 'screen', style: { background: '#0a0710e0' } });
  ui.append(root);
  audio.music('menu');
  let arena = null;
  let fighting = false;

  function echoesFor(run) {
    const p = getProfile();
    return run.party.map((m) => (m.id === 'loaner' ? run.loaner : p.echoes.find((e) => e.id === m.id))).filter(Boolean);
  }

  function grant(reward) {
    const p = getProfile();
    p.dust += reward.dust || 0;
    p.tickets += reward.tickets || 0;
    p.fame += reward.fame || 0;
    const run = p.run;
    if (run) { run.earned.dust += reward.dust || 0; run.earned.tickets += reward.tickets || 0; run.earned.fame += reward.fame || 0; }
  }

  function start() {
    const p = getProfile();
    let party = equippedEchoes();
    let loaner = null;
    if (!party.length) { loaner = loanerEcho(Date.now() % 100000); party = [loaner]; }
    p.run = newRun(party);
    if (loaner) p.run.loaner = loaner;
    p.stats.expeditions += 1;
    saveProfile();
    render();
  }

  function render() {
    if (fighting) return;
    const p = getProfile();
    const run = p.run;
    clearEl(root);
    root.append(h('div', { class: 'topbar' }, btn('←', () => nav('home'), 'icon ghost'), h('h1', {}, 'Expedition'),
      h('span', { class: 'chip' }, '🎟 ', String(p.tickets)), h('span', { class: 'chip' }, '✦ ', String(p.dust))));

    if (!run) {
      const party = equippedEchoes();
      root.append(h('div', { class: 'col', style: { flex: 1, justifyContent: 'center' } },
        h('div', { class: 'big-title center' }, 'Expedition'),
        h('p', { class: 'center muted' }, 'Take your equipped Echoes through 3 acts of fights, dice and loot. Rewards are yours the moment you earn them.'),
        party.length ? h('div', { class: 'party', style: { justifyContent: 'center' } }, party.map((e) => h('div', { class: 'p' }, svgEl(echoBadgeSVG(e.parts)), e.name)))
          : h('p', { class: 'center small gold-t' }, 'No Echoes equipped — you\'ll get a loaner fighter. Win battles at the table to earn your own.'),
        h('p', { class: 'center small muted' }, `Best: Act ${p.stats.bestAct || 0} · Runs: ${p.stats.expeditions}`),
        btn('Start expedition', start, 'primary'),
        btn('Manage Echoes', () => nav('echoes'), 'ghost')));
      return;
    }

    if (run.over) {
      root.append(h('div', { class: 'col', style: { flex: 1, justifyContent: 'center', textAlign: 'center' } },
        h('div', { class: 'big-title' }, run.won ? 'The House falls!' : 'Run over'),
        h('p', { class: 'muted' }, run.won ? 'You cleared all three acts.' : `You reached ${ACT_NAMES[run.act]}.`),
        h('p', {}, `Earned: ✦${run.earned.dust} Dust · 🎟${run.earned.tickets} Tickets · ${run.earned.fame} Fame`),
        btn('Done', () => { p.run = null; saveProfile(); render(); }, 'primary')));
      return;
    }

    const echoes = echoesFor(run);
    root.append(h('div', { class: 'small muted' }, ACT_NAMES[run.act], ` · step ${run.step + 1}/${run.acts[run.act].length}`));
    root.append(h('div', { class: 'party', style: { marginTop: '6px' } }, run.party.map((m) => {
      const e = echoes.find((x) => x.id === m.id);
      return h('div', { class: 'p', style: { opacity: m.hpFrac > 0 ? 1 : 0.35 } }, svgEl(echoBadgeSVG(e?.parts)), e?.name || '?', h('div', { class: 'hp' }, h('i', { style: { width: `${Math.round(m.hpFrac * 100)}%` } })));
    })));
    if (run.buffs.length) root.append(h('div', { class: 'tags' }, run.buffs.map((b) => h('span', { class: `tag ${b.rare ? 'rare' : ''}`, title: b.desc }, b.name))));

    const map = h('div', { class: 'exp-map' });
    run.acts[run.act].forEach((step, i) => {
      const row = h('div', { class: 'exp-step' });
      for (const type of step) {
        const info = NODE_INFO[type];
        const avail = i === run.step;
        const done = i < run.step;
        const taken = run.path.some((x) => x.act === run.act && x.step === i && x.type === type);
        row.append(h('div', {
          class: `node${avail ? ' avail' : ''}${done ? ' done' : ''}${taken ? ' cur' : ''}${type === 'boss' ? ' boss' : ''}`,
          onClick: () => avail ? choose(type) : toast(info.desc),
        }, h('div', { class: 'ic' }, info.icon), info.name));
      }
      map.append(row);
    });
    root.append(map);
    root.append(h('div', { class: 'row' }, btn('Abandon run', async () => { if (await confirmBox('Abandon this run? You keep everything earned so far.', 'Abandon')) { run.over = true; saveProfile(); render(); } }, 'ghost small')));
    // scroll current step into view
    requestAnimationFrame(() => map.querySelector('.avail')?.scrollIntoView({ block: 'center' }));
  }

  async function choose(type) {
    const p = getProfile();
    const run = p.run;
    audio.sfx('tap');
    if (['fight', 'elite', 'boss'].includes(type)) {
      await fight(run, type);
    } else {
      const out = applyNode(run, type, echoesFor(run));
      grant(out.reward);
      if (out.dose) {
        audio.sfx(out.dose.double ? 'doubleDose' : out.dose.effects.some((e) => e.kind === 'rare') ? 'rare' : 'diceLand');
        const pop = dosePop(out.dose, { title: 'Run buff' });
        pop.style.zIndex = 11;
        document.body.append(pop);
        setTimeout(() => pop.remove(), 3500);
      } else {
        audio.sfx(type === 'treasure' ? 'coin' : 'heal');
        toast(out.text, 'good');
      }
      advanceRun(run, type);
    }
    p.stats.bestAct = Math.max(p.stats.bestAct || 0, run.act + (run.won ? 1 : 0));
    saveProfile();
    render();
  }

  function fight(run, type) {
    return new Promise((resolve) => {
      fighting = true;
      const echoes = echoesFor(run);
      const battle = battleFor(run, type, echoes);
      clearEl(root);
      root.style.background = 'transparent';
      root.style.pointerEvents = 'none';
      arena = createArenaView({ overlay: ui, onEvent: (e) => {
        if (e.t === 'hit') audio.sfx(e.crit ? 'crit' : 'hit', { pitch: (Math.random() - 0.5) * 3 });
        else if (e.t === 'proj') audio.sfx('projectile');
        else if (e.t === 'dodge' || e.t === 'miss') audio.sfx('dodge');
        else if (e.t === 'death') audio.sfx('death');
        else if (e.t === 'revive') audio.sfx('heal');
      } });
      setView(arena);
      audio.music('arena');
      const title = h('div', { class: 'banner' }, h('div', { class: 'big-title' }, type === 'boss' ? battle.units.find((u) => u.owner === 'enemy').name : NODE_INFO[type].name), h('div', { class: 'sub' }, ACT_NAMES[run.act]));
      document.body.append(title);
      setTimeout(() => title.remove(), 1800);
      const skip = btn('Skip ⏭', () => finish(), 'small ghost');
      Object.assign(skip.style, { position: 'fixed', right: '12px', bottom: 'calc(14px + env(safe-area-inset-bottom, 0px))', zIndex: 4, pointerEvents: 'auto' });
      ui.append(skip);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        skip.remove();
        const { won, reward } = resolveFight(run, type, battle);
        grant(reward);
        audio.sfx(won ? (type === 'boss' ? 'matchWin' : 'roundWin') : 'roundLose');
        const msg = h('div', { class: 'col center' },
          h('div', { class: 'big-title' }, won ? 'Victory' : 'Defeat'),
          won ? h('p', {}, [reward.dust && `✦${reward.dust} Dust`, reward.tickets && `🎟${reward.tickets} Tickets`, reward.fame && `${reward.fame} Fame`].filter(Boolean).join(' · ')) : h('p', { class: 'muted' }, 'Your party fell. The run is over — you keep what you earned.'),
          btn('Continue', () => { m.close(); }, 'primary'));
        const m = modal(msg, {
          cls: 'center', dismissable: false, onClose: () => {
            arena.destroy(); arena = null;
            setView(backdrop);
            audio.music('menu');
            root.style.background = '#0a0710e0';
            root.style.pointerEvents = '';
            fighting = false;
            if (won) advanceRun(run, type);
            if (!partyAlive(run)) run.over = true;
            saveProfile();
            resolve();
          },
        });
      };
      arena.start(battle, { startAt: Date.now() + 600, now: () => Date.now(), me: 'party', owners: [{ id: 'party', seat: 1 }, { id: 'enemy', seat: 0 }], onDone: finish });
    });
  }

  render();
  return {
    close() {
      arena?.destroy();
      root.remove();
    },
  };
}

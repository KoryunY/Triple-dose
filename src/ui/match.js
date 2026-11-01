// Match screen: lobby -> roll -> trade -> play -> summon -> battle -> result -> end.

import { h, btn, svgEl, toast, modal, confirmBox, clearEl, esc } from './dom.js';
import { cardEl, fighterPreview, dosePop, edictTags, statGrid } from './parts.js';
import { setView } from '../three/stage.js';
import { createTableView } from '../three/table.js';
import { createArenaView, SEAT_COLORS } from '../three/arena.js';
import { audio } from '../audio/audio.js';
import { buildFighter } from '../../shared/build.js';
import { SUITS, SUIT_IDS, MATCH, PERSONAS, GIRLS, EDICTS } from '../../shared/data.js';
import { suitIcon, diceFaceIcon } from '../art/icons.js';
import { portraitSVG } from '../art/portrait.js';
import { echoBadgeSVG } from '../art/echoBadge.js';
import { claimMatch } from '../core/profile.js';

const PHASE_NAMES = { lobby: 'Table', roll: 'Dose Roll', trade: 'Trade', play: 'Play your hand', summon: 'Summon', battle: 'Battle', result: 'Round over', end: 'Match over' };

export function openMatch(session, { onExit }) {
  const ui = document.getElementById('ui');
  const table = createTableView();
  const arena = createArenaView({ overlay: ui, onEvent: arenaSfx });
  setView(table);
  audio.music('table');

  const root = h('div', { class: 'pass', style: { position: 'fixed', inset: '0' } });
  ui.append(root);

  const top = h('div', { class: 'hud-top' });
  const phaseEl = h('div', { class: 'phase' }, h('b'), h('div', { class: 'timer' }, h('i')));
  const leaveBtn = btn('✕', leave, 'icon ghost');
  const soundBtn = btn(audio.muted ? '🔇' : '🔊', () => { audio.setMuted(!audio.muted); soundBtn.textContent = audio.muted ? '🔇' : '🔊'; }, 'icon ghost');
  top.append(leaveBtn, phaseEl, soundBtn);
  const scores = h('div', { class: 'scores' });
  const logEl = h('div', { class: 'log' });
  const seatLayer = h('div', { class: 'pass', style: { position: 'fixed', inset: '0', pointerEvents: 'none' } });
  const dock = h('div', { class: 'dock' });
  const overlayEl = h('div', { class: 'pass', style: { position: 'fixed', inset: '0', pointerEvents: 'none' } });
  root.append(seatLayer, top, scores, logEl, overlayEl, dock);

  let view = null;
  let phaseKey = '';
  let dockSig = '';
  let sel = [];            // selected card ids for play
  let selEchoes = [];
  let trade = { give: null, to: null, wantSuit: null };
  let busy = false;
  let closed = false;
  let lastLog = '';
  let arenaKey = '';
  const seatTags = new Map();
  let endModal = null;

  const off = session.on((v) => { view = v; render(); });
  session.onError = (e, n) => { if (n === 3) toast('Connection shaky — retrying…', 'bad'); if (session.closed) { toast(e.message, 'bad'); exit(); } };

  // frame loop for timers and seat tags
  let raf = requestAnimationFrame(frame);
  function frame() {
    if (closed) return;
    raf = requestAnimationFrame(frame);
    if (!view) return;
    const bar = phaseEl.querySelector('i');
    if (view.phaseEnds) {
      const total = view.phaseEnds - view.phaseStarted;
      const left = Math.max(0, view.phaseEnds - session.now());
      bar.style.width = `${Math.min(100, (left / total) * 100)}%`;
      bar.parentElement.style.visibility = view.phase === 'battle' ? 'hidden' : '';
      const secs = Math.ceil(left / 1000);
      const b = phaseEl.querySelector('b');
      const label = `${PHASE_NAMES[view.phase]}${['trade', 'play'].includes(view.phase) ? ` · ${secs}s` : ''}`;
      if (b.textContent !== label) b.textContent = label;
    } else {
      bar.parentElement.style.visibility = 'hidden';
    }
    if (view.phase !== 'battle') positionSeatTags();
  }

  // ------------------------------------------------------------ render
  function me() { return view.players.find((p) => p.id === session.me); }
  function isHost() { return view.hostId === session.me; }

  function render() {
    if (!view || closed) return;
    const key = `${view.matchNo}:${view.round}:${view.phase}`;
    if (key !== phaseKey) { const prev = phaseKey; phaseKey = key; enterPhase(view.phase, prev); }
    table.setPlayers(view.players, session.me);
    if (view.phase !== 'lobby' && view.round > 0) {
      for (const p of view.players) table.setDice(p.id, p.dose, `${view.matchNo}:${view.round}`, view.phase === 'roll');
    }
    table.hideDice(view.phase === 'lobby');
    renderScores();
    renderLog();
    renderSeatTags();
    renderDock();
  }

  function enterPhase(phase) {
    overlayEl.querySelectorAll('.dose-pop,.banner').forEach((e) => e.remove());
    if (phase !== 'battle') { setView(table); arena.leave(); audio.music('table'); }
    if (phase === 'roll') {
      sel = []; selEchoes = []; trade = { give: null, to: null, wantSuit: null };
      table.clearSummons();
      audio.sfx('diceRoll');
      const d = me()?.dose;
      setTimeout(() => {
        if (closed || !d || view.phase !== 'roll') return;
        const rare = d.effects.some((e) => e.kind === 'rare');
        audio.sfx(d.double ? 'doubleDose' : rare ? 'rare' : 'diceLand');
        const pop = dosePop(d);
        overlayEl.append(pop);
        setTimeout(() => pop.remove(), 4200);
      }, 1500);
    }
    if (phase === 'trade') audio.sfx('shuffle');
    if (phase === 'summon') {
      table.summon(view.players);
      audio.sfx('summon');
      const revealed = view.players.flatMap((p) => (p.playedCards || []).filter((c) => c.revealed && c.persona));
      if (revealed.length) setTimeout(() => audio.sfx('reveal'), 600);
    }
    if (phase === 'battle') startBattle();
    if (phase === 'result') {
      table.clearSummons();
      const last = view.history[view.history.length - 1];
      const w = view.players.find((p) => p.id === last?.winner);
      const mine = w?.id === session.me;
      audio.sfx(mine ? 'roundWin' : 'roundLose');
      banner(w ? (mine ? 'You win the round!' : `${w.name} wins`) : 'Nobody survived', mine ? 'Your fighter became an Echo' : w ? `${last.fighters.find((f) => f.id === w.id)?.name} became an Echo` : '');
      if (view.upcomingEdicts?.length) setTimeout(() => audio.sfx('edict'), 900);
    }
    if (phase === 'end') showEnd();
    if (phase === 'lobby') { endModal?.close(); endModal = null; table.clearSummons(); }
  }

  function banner(title, sub) {
    const b = h('div', { class: 'banner' }, h('div', { class: 'big-title' }, title), sub ? h('div', { class: 'sub' }, sub) : null);
    overlayEl.append(b);
    setTimeout(() => b.remove(), 3200);
  }

  function renderScores() {
    clearEl(scores);
    if (view.phase === 'lobby') return;
    for (const p of view.players) {
      const pips = h('span', { class: 'pips' }, Array.from({ length: MATCH.winsToTake }, (_, i) => h('i', { class: i < p.wins ? 'on' : '' })));
      const offline = session.kind === 'online' && !p.bot && session.online && !session.online.includes(p.id);
      scores.append(h('div', { class: `score${view.hostId === p.id ? ' host' : ''}${offline ? ' off' : ''}`, style: { borderColor: SEAT_COLORS[p.seat % 3] } },
        svgEl(portraitSVG(p.patron?.id, { variant: 'chibi' })), h('span', { class: 'nm' }, p.id === session.me ? 'You' : p.name), pips));
    }
    const ed = [...(view.edicts || [])];
    if (ed.length) scores.append(h('div', { class: 'tags', style: { width: '100%', justifyContent: 'center' } }, edictTags(ed, view.players)));
  }

  function renderLog() {
    const lines = view.log.slice(-2).map((l) => l.text);
    const sig = lines.join('|');
    if (sig === lastLog) return;
    lastLog = sig;
    clearEl(logEl);
    if (view.phase === 'battle') return;
    for (const l of lines) logEl.append(h('div', {}, l));
  }

  function renderSeatTags() {
    const ids = new Set(view.players.map((p) => p.id));
    for (const [id, el] of seatTags) if (!ids.has(id)) { el.remove(); seatTags.delete(id); }
    for (const p of view.players) {
      let el = seatTags.get(p.id);
      if (!el) { el = h('div', { class: 'seat-tag' }); seatTags.set(p.id, el); seatLayer.append(el); }
      const showDose = p.dose && !['lobby', 'roll'].includes(view.phase) || (view.phase === 'roll' && session.now() - view.phaseStarted > 1500);
      const st = view.phase === 'trade' ? (p.tradeDone ? 'done trading' : 'trading…') : view.phase === 'play' ? (p.locked ? 'locked in' : 'choosing…') : view.phase === 'lobby' ? (p.bot ? 'bot' : view.hostId === p.id ? 'host' : 'ready') : `${p.handCount} cards`;
      const sig = `${p.name}|${showDose ? p.dose?.smoke + p.dose?.drink : ''}|${st}|${p.locked}`;
      if (el.dataset.sig === sig) continue;
      el.dataset.sig = sig;
      el.className = `seat-tag${view.phase === 'play' && p.locked ? ' locked' : ''}`;
      el.style.borderColor = SEAT_COLORS[p.seat % 3];
      el.innerHTML = '';
      el.append(h('div', {}, p.id === session.me ? 'You' : p.name), h('div', { class: 'st' }, st));
      if (showDose && p.dose) el.append(h('div', { class: 'dose' }, svgEl(diceFaceIcon(p.dose.smoke)), svgEl(diceFaceIcon(p.dose.drink))));
    }
    positionSeatTags();
  }

  function positionSeatTags() {
    const w = window.innerWidth, hh = window.innerHeight;
    for (const [id, el] of seatTags) {
      const pos = table.seatScreen(id, w, hh);
      if (!pos || view.phase === 'battle') { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.left = `${Math.max(56, Math.min(w - 56, pos.x))}px`;
      el.style.top = `${pos.rel === 0 ? Math.min(pos.y, hh * 0.52) : pos.y}px`;
    }
  }

  // ------------------------------------------------------------ dock per phase
  function renderDock() {
    const m = me();
    if (!m) return;
    const sig = JSON.stringify([view.phase, view.round, m.hand?.map((c) => c.id + (c.persona || '') + (c.shimmer ? 's' : '')), m.locked, m.tradeDone, sel, selEchoes, trade, view.offers.map((o) => o.id + o.status), view.players.map((p) => p.id + p.bot), view.hostId, busy]);
    if (sig === dockSig) return;
    dockSig = sig;
    clearEl(dock);
    dock.style.display = '';
    const f = { lobby: dockLobby, roll: dockRoll, trade: dockTrade, play: dockPlay, summon: dockSummon, battle: () => { dock.style.display = 'none'; }, result: dockResult, end: dockResult }[view.phase];
    f?.(m);
  }

  function handRow(m, { selectable, selected = [], onTap, dimFn } = {}) {
    const row = h('div', { class: 'hand' });
    for (const c of m.hand || []) {
      row.append(cardEl(c, {
        selected: selected.includes(c.id),
        dim: dimFn ? dimFn(c) : false,
        onClick: selectable ? () => { audio.sfx('card'); onTap(c); } : () => showCardInfo(c),
      }));
    }
    if (!m.hand?.length) row.append(h('div', { class: 'muted small' }, 'No cards in hand'));
    return row;
  }

  function showCardInfo(c) {
    const s = SUITS[c.suit];
    const p = c.persona ? PERSONAS[c.persona] : null;
    modal(h('div', {},
      h('h2', {}, `${s.name} ${c.rank}`),
      h('p', { class: 'muted' }, s.desc),
      p ? h('p', {}, h('b', {}, `${p.glyph} ${p.name}: `), p.desc) : c.shimmer ? h('p', { class: 'gold-t' }, 'Something about this card feels… different. Play it with a matching suit, or win with it, to find out.') : h('p', { class: 'muted small' }, 'Cards may hide a secret persona. Play one with another card of the same suit, or win a battle with it, to reveal it.')));
  }

  function dockLobby(m) {
    const lob = h('div', {});
    if (session.kind === 'online') {
      const url = `${location.origin}/?room=${session.code}`;
      lob.append(h('div', { class: 'row', style: { justifyContent: 'space-between' } },
        h('div', {}, h('div', { class: 'small muted' }, 'Room code'), h('div', { class: 'code' }, session.code)),
        btn('Share invite', async () => {
          try {
            if (navigator.share) await navigator.share({ title: 'Triple Dose', text: `Join my table: ${session.code}`, url });
            else { await navigator.clipboard.writeText(url); toast('Invite link copied', 'good'); }
          } catch { /* cancelled */ }
        }, 'small cyan')));
    } else {
      lob.append(h('div', { class: 'small muted' }, 'Solo table — you vs two bots'));
    }
    for (const p of view.players) {
      lob.append(h('div', { class: 'seat-row', style: { borderColor: SEAT_COLORS[p.seat % 3] } },
        svgEl(portraitSVG(p.patron?.id, { variant: 'chibi' })),
        h('div', { class: 'grow' }, h('b', {}, `${p.id === session.me ? 'You' : p.name}${view.hostId === p.id ? ' ♛' : ''}`),
          h('div', { class: 'small muted' }, `${GIRLS[p.patron?.id]?.name || ''} · ${p.echoCount} Echo${p.echoCount === 1 ? '' : 'es'}`)),
        p.bot && isHost() ? btn('Remove', () => doAct({ type: 'removeBot', id: p.id }), 'small ghost') : null));
    }
    for (let i = view.players.length; i < 3; i++) lob.append(h('div', { class: 'seat-row muted' }, h('div', { class: 'grow' }, 'Empty seat — waiting for a player')));
    const acts = h('div', { class: 'actions' });
    if (isHost()) {
      if (view.players.length < 3) acts.append(btn('+ Add bot', () => doAct({ type: 'addBot' }), 'ghost'));
      acts.append(btn('Start match', () => doAct({ type: 'start' }), 'primary'));
    } else {
      acts.append(h('div', { class: 'info grow' }, 'Waiting for the host to start…'));
    }
    lob.append(acts);
    dock.append(lob);
  }

  function dockRoll(m) {
    dock.append(h('div', { class: 'info' }, 'Rolling the Smoke and Drink dice…'), handRow(m));
  }

  function dockTrade(m) {
    const others = view.players.filter((p) => p.id !== m.id);
    const incoming = view.offers.filter((o) => o.to === m.id && o.status === 'open');
    const outgoing = view.offers.filter((o) => o.from === m.id).slice(-3);
    const wrap = h('div', {});
    for (const o of incoming) {
      const from = view.players.find((p) => p.id === o.from);
      const mine = (m.hand || []).filter((c) => c.suit === o.wantSuit).sort((a, b) => a.rank - b.rank);
      wrap.append(h('div', { class: 'offer' },
        h('div', { class: 'grow' }, h('b', {}, from?.name), ' offers ', cardInline(o.giveCard), ' for any ', suitInline(o.wantSuit)),
        mine.length ? btn(`Give ${mine[0].rank}`, () => doAct({ type: 'respond', offerId: o.id, accept: true, card: mine[0].id }), 'small cyan') : h('span', { class: 'small muted' }, `no ${SUITS[o.wantSuit].name}`),
        btn('✕', () => doAct({ type: 'respond', offerId: o.id, accept: false }), 'small ghost')));
    }
    for (const o of outgoing) {
      const to = view.players.find((p) => p.id === o.to);
      wrap.append(h('div', { class: 'offer muted' }, h('div', { class: 'grow' }, `To ${to?.name}: `, cardInline(o.giveCard), ' → ', suitInline(o.wantSuit)),
        h('b', { class: o.status === 'accepted' ? 'gold-t' : '' }, o.status === 'accepted' ? `got ${SUITS[o.gotCard?.suit]?.name || ''} ${o.gotCard?.rank || ''}` : o.status),
        o.status === 'open' ? btn('Cancel', () => doAct({ type: 'cancelOffer', offerId: o.id }), 'small ghost') : null));
    }
    if (m.tradeDone) {
      wrap.append(h('div', { class: 'info' }, 'Done trading — waiting for others'), handRow(m));
      dock.append(wrap);
      return;
    }
    wrap.append(h('div', { class: 'info' }, trade.give ? 'Who and what suit do you want back?' : 'Trade: tap a card to offer (optional)'));
    wrap.append(handRow(m, { selectable: true, selected: trade.give ? [trade.give] : [], onTap: (c) => { trade.give = trade.give === c.id ? null : c.id; renderDock(); } }));
    if (trade.give) {
      wrap.append(h('div', { class: 'who-pick', style: { marginTop: '8px' } }, others.map((p) => h('button', { class: trade.to === p.id ? 'on' : '', style: { borderColor: trade.to === p.id ? SEAT_COLORS[p.seat % 3] : '' }, onClick: () => { trade.to = p.id; renderDock(); } }, p.name))));
      wrap.append(h('div', { class: 'suit-pick', style: { marginTop: '8px' } }, SUIT_IDS.map((s) => h('button', { class: trade.wantSuit === s ? 'on' : '', onClick: () => { trade.wantSuit = s; renderDock(); }, title: SUITS[s].name }, svgEl(suitIcon(s))))));
    }
    const acts = h('div', { class: 'actions' });
    if (trade.give) {
      const ready = trade.to && trade.wantSuit;
      const ob = btn('Send offer', async () => {
        const r = await doAct({ type: 'offer', to: trade.to, give: trade.give, wantSuit: trade.wantSuit });
        if (r.ok) { audio.sfx('trade'); trade = { give: null, to: null, wantSuit: null }; renderDock(); }
      }, 'cyan');
      ob.disabled = !ready;
      acts.append(ob);
    }
    acts.append(btn('Done trading', () => doAct({ type: 'tradeDone' }), trade.give ? 'ghost' : 'primary'));
    wrap.append(acts);
    dock.append(wrap);
  }

  function dockPlay(m) {
    const wrap = h('div', {});
    if (m.locked) {
      const cards = (m.play?.cards || []).map((id) => m.hand.find((c) => c.id === id)).filter(Boolean);
      wrap.append(h('div', { class: 'info' }, 'Locked in. Waiting for the others…'));
      wrap.append(h('div', { class: 'hand' }, cards.map((c) => cardEl(c, { selected: true }))));
      wrap.append(h('div', { class: 'actions' }, btn('Change', () => doAct({ type: 'unlock' }), 'ghost')));
      dock.append(wrap);
      return;
    }
    sel = sel.filter((id) => m.hand.some((c) => c.id === id));
    if (sel.length) {
      const cards = sel.map((id) => m.hand.find((c) => c.id === id));
      const edictMods = (view.edicts || []).filter((e) => e.id === 'ironCrown' && e.owner !== m.id).map(() => ({ stat: 'atk', mult: -0.2 }));
      const f = buildFighter(cards, m.dose, { patron: m.patron, edictMods, seed: 1 });
      // personas you don't know about yet stay a mystery in the preview
      const known = buildFighter(cards.map((c) => (c.persona ? c : { ...c, persona: null })), m.dose, { patron: m.patron, edictMods, seed: 1 });
      wrap.append(fighterPreview({ ...known, sources: f.sources.map((s) => (s.kind === 'persona' && !cards.some((c) => c.persona === s.id) ? { kind: 'persona', hidden: true } : s)) }, { title: 'Your summon (preview)', player: m }));
    } else {
      wrap.append(h('div', { class: 'info' }, `Pick 1–${MATCH.maxPlay} cards. Same suits combo; played cards are spent.`));
    }
    wrap.append(handRow(m, { selectable: true, selected: sel, onTap: (c) => {
      if (sel.includes(c.id)) sel = sel.filter((x) => x !== c.id);
      else if (sel.length < MATCH.maxPlay) sel = [...sel, c.id];
      else { toast(`Max ${MATCH.maxPlay} cards`); }
      renderDock();
    } }));
    const echoes = (m.echoes || []);
    if (echoes.length) {
      wrap.append(h('div', { class: 'small muted', style: { marginTop: '6px' } }, `Send Echoes (${selEchoes.length}/${m.echoSlots}) — each can fight once per match at ${Math.round(MATCH.echoPower * 100)}% power`));
      wrap.append(h('div', { class: 'echo-toggle' }, echoes.map((e) => h('div', {
        class: `echo-pill${selEchoes.includes(e.id) ? ' on' : ''}${e.used ? ' used' : ''}`,
        onClick: () => {
          if (selEchoes.includes(e.id)) selEchoes = selEchoes.filter((x) => x !== e.id);
          else if (selEchoes.length < m.echoSlots) selEchoes = [...selEchoes, e.id];
          else toast(`Only ${m.echoSlots} Echo slot${m.echoSlots > 1 ? 's' : ''}`);
          audio.sfx('tap');
          renderDock();
        },
      }, svgEl(echoBadgeSVG(e.parts)), `${e.name}${e.level ? ` +${e.level}` : ''}`))));
    }
    const lock = btn(sel.length ? `Lock in ${sel.length} card${sel.length > 1 ? 's' : ''}` : 'Pick cards', async () => {
      const r = await doAct({ type: 'play', cards: sel, echoes: selEchoes });
      if (r.ok) audio.sfx('cardPlay');
    }, 'primary');
    lock.disabled = !sel.length;
    wrap.append(h('div', { class: 'actions' }, lock));
    dock.append(wrap);
  }

  function dockSummon() {
    const list = h('div', { class: 'summons' });
    const order = [...view.players].sort((a, b) => (a.id === session.me ? -1 : b.id === session.me ? 1 : a.seat - b.seat));
    for (const p of order) {
      if (!p.fighter) continue;
      const el = fighterPreview(p.fighter, { title: `${p.fighter.name}`, player: p, cards: p.playedCards });
      el.style.borderColor = SEAT_COLORS[p.seat % 3];
      el.prepend(h('div', { class: 'small', style: { color: SEAT_COLORS[p.seat % 3], fontWeight: 800 } }, p.id === session.me ? 'YOU' : p.name.toUpperCase(), p.sentEchoes?.length ? ` + ${p.sentEchoes.length} Echo` : ''));
      list.append(el);
    }
    dock.style.background = 'none';
    dock.append(list);
  }

  function dockResult(m) {
    dock.style.background = '';
    const upcoming = view.upcomingEdicts || [];
    if (upcoming.length) dock.append(h('div', { class: 'tags', style: { justifyContent: 'center' } }, h('span', { class: 'small muted' }, 'Next round: '), edictTags(upcoming, view.players)));
    if (view.phase === 'end' && !endModal) dock.append(h('div', { class: 'actions' }, btn('Show results', showEnd, 'primary')));
    else dock.append(handRow(m));
  }

  // ------------------------------------------------------------ battle
  function startBattle() {
    if (!view.battle) return;
    const key = `${view.matchNo}:${view.battle.round}`;
    if (arenaKey === key) return;
    arenaKey = key;
    setView(arena);
    arena.enter();
    audio.music('arena');
    arena.start(view.battle, {
      startAt: view.phaseStarted,
      now: () => session.now(),
      me: session.me,
      owners: view.players.map((p) => ({ id: p.id, seat: p.seat })),
      onDone: () => {},
    });
  }

  function arenaSfx(e) {
    if (e.t === 'hit') audio.sfx(e.crit ? 'crit' : 'hit', { pitch: (Math.random() - 0.5) * 3 });
    else if (e.t === 'proj') audio.sfx('projectile');
    else if (e.t === 'dodge' || e.t === 'miss') audio.sfx('dodge');
    else if (e.t === 'death') audio.sfx('death');
    else if (e.t === 'revive') audio.sfx('heal');
    else if (e.t === 'overtime') { audio.sfx('edict'); banner('OVERTIME', 'Damage rising, healing fading'); }
  }

  // ------------------------------------------------------------ end of match
  function showEnd() {
    if (!view.results || endModal) return;
    const mine = view.results.find((r) => r.id === session.me);
    const m = me();
    let claim = null;
    if (mine) claim = claimMatch(`${session.kind}:${view.id}:${view.matchNo}`, mine, m?.earned || []);
    audio.sfx(mine?.place === 1 ? 'matchWin' : 'roundLose');
    const rows = view.results.map((r) => h('div', { class: 'seat-row' },
      h('b', { style: { width: '28px', fontSize: '20px', color: r.place === 1 ? 'var(--gold)' : '' } }, `#${r.place}`),
      h('div', { class: 'grow' }, h('b', {}, r.id === session.me ? 'You' : r.name), h('div', { class: 'small muted' }, `${r.wins} battle win${r.wins === 1 ? '' : 's'}`)),
      r.id === session.me ? h('div', { class: 'small gold-t', style: { textAlign: 'right' } }, `+${r.tickets} 🎟`, h('br'), `+${r.fame} Fame`) : null));
    const earned = (claim?.echoes || m?.earned || []);
    const content = h('div', {},
      h('div', { class: 'big-title center' }, mine?.place === 1 ? 'Victory!' : 'Match over'),
      h('div', { class: 'col', style: { marginTop: '10px' } }, rows),
      earned.length ? h('div', { style: { marginTop: '10px' } }, h('div', { class: 'small muted' }, `New Echoes (${earned.length})`), h('div', { class: 'echo-toggle' }, earned.map((e) => h('div', { class: 'echo-pill on' }, svgEl(echoBadgeSVG(e.parts)), e.name)))) : null,
      claim?.rankUp ? h('p', { class: 'gold-t center' }, `Fame rank up: ${claim.rankUp.name}! Echo slots: ${claim.rankUp.echoSlots}`) : null,
      h('div', { class: 'actions', style: { display: 'flex', gap: '8px', marginTop: '14px' } },
        btn('Leave table', () => { endModal?.close(); exit(); }, 'ghost'),
        isHost() ? btn('Play again', async () => { endModal?.close(); endModal = null; const r = await doAct({ type: 'restart' }); if (r.ok) await doAct({ type: 'start' }); }, 'primary') : h('div', { class: 'small muted grow center' }, 'Host can start a rematch')));
    endModal = modal(content, { cls: 'center', onClose: () => { renderDock(); } });
    dockSig = '';
  }

  // ------------------------------------------------------------ actions
  async function doAct(a) {
    if (busy) return { ok: false };
    busy = true;
    try {
      const r = await session.act(a);
      if (!r.ok && r.error) { toast(r.error, 'bad'); audio.sfx('error'); }
      return r;
    } finally {
      busy = false;
      dockSig = '';
      render();
    }
  }

  async function leave() {
    const mid = view && !['lobby', 'end'].includes(view.phase);
    if (mid && !(await confirmBox(session.kind === 'online' ? 'Leave the table? You can rejoin with the room code.' : 'Quit this match? Progress in this match is lost.', 'Leave'))) return;
    if (session.kind === 'online' && view?.phase === 'lobby') await session.leave();
    exit();
  }

  function exit() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    off();
    session.close();
    arena.destroy();
    table.clearSummons();
    endModal?.close();
    root.remove();
    onExit?.();
  }

  return { exit };
}

function cardInline(c) {
  if (!c) return '';
  return h('b', { style: { color: SUITS[c.suit].color } }, `${SUITS[c.suit].name} ${c.rank}`);
}
function suitInline(s) {
  return h('b', { style: { color: SUITS[s].color } }, SUITS[s].name);
}

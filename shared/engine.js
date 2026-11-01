// Triple Dose match engine — a pure state machine shared by solo (in-browser) and online (server) play.
//
//   lobby -> roll -> trade -> play -> summon -> battle -> result -> (next round: roll ...) -> end
//
// advance(state, now)        moves through phases when timers run out (and runs bots)
// act(state, playerId, a, now) applies a player action
// viewFor(state, playerId)   what one player is allowed to see

import { MATCH, SUIT_IDS, PERSONA_IDS, PERSONAS_PER_DECK, PERSONAS, EDICTS, GIRLS } from './data.js';
import { makeRng, hashSeed, randomSeed } from './rng.js';
import { rollDose, buildFighter, echoFromFighter, echoBattleStats, patronMods } from './build.js';
import { runBattle } from './sim.js';

const T = MATCH.timers;
const BOT_NAMES = ['Mira', 'Juno', 'Kai', 'Roux', 'Vex', 'Lark', 'Nyx', 'Ozzy', 'Pip', 'Sable'];
const BOT_PATRONS = ['rin', 'mireille', 'yuki', 'selene', 'aya', 'lumi', 'vera', 'kiki', 'nao', 'pia', 'tess'];

const rngFor = (s, ...parts) => makeRng(hashSeed(`${s.seed}:${parts.join(':')}`));

// ---------------------------------------------------------------- creation & lobby

export function createMatch({ id, seed, now = Date.now(), hostId = null } = {}) {
  return {
    id: id || `m${randomSeed().toString(36)}`,
    seed: seed || randomSeed(),
    phase: 'lobby',
    phaseEnds: 0,
    phaseStarted: now,
    round: 0,
    players: [],
    deck: [],
    discard: [],
    offers: [],
    offerSeq: 0,
    edicts: [],
    activeEdicts: [],
    battle: null,
    history: [],
    log: [],
    hostId,
    results: null,
    matchNo: 0,
    cardSeq: 0,
  };
}

export function addPlayer(state, { id, name, bot = false, patron = null, echoes = [], echoSlots = 1 }) {
  if (state.players.some((p) => p.id === id)) return { ok: true, rejoined: true };
  if (state.players.length >= MATCH.maxPlayers) return { ok: false, error: 'Table is full' };
  if (state.phase !== 'lobby') return { ok: false, error: 'Match already running' };
  const taken = new Set(state.players.map((p) => p.seat));
  const seat = [0, 1, 2].find((s) => !taken.has(s));
  state.players.push(newPlayer({ id, name, bot, patron, echoes, echoSlots, seat }));
  state.players.sort((a, b) => a.seat - b.seat);
  if (!state.hostId && !bot) state.hostId = id;
  log(state, `${name} sat down.`);
  return { ok: true };
}

function newPlayer({ id, name, bot, patron, echoes, echoSlots, seat }) {
  return {
    id, name: String(name || 'Guest').slice(0, 20), seat, bot: !!bot,
    patron: patron && GIRLS[patron.id] ? { id: patron.id, bond: Math.min(6, patron.bond || 0) } : { id: 'nao', bond: 0 },
    echoSlots: Math.max(1, Math.min(3, echoSlots || 1)),
    echoes: (echoes || []).slice(0, 3),
    usedEchoes: [],
    hand: [],
    wins: 0,
    play: null,
    locked: false,
    tradeDone: false,
    dose: null,
    fighter: null,
    earned: [],
  };
}

export function removePlayer(state, id) {
  const i = state.players.findIndex((p) => p.id === id);
  if (i < 0) return;
  const [p] = state.players.splice(i, 1);
  log(state, `${p.name} left.`);
  if (state.hostId === id) state.hostId = state.players.find((x) => !x.bot)?.id || null;
}

export function addBot(state) {
  const used = new Set(state.players.map((p) => p.name));
  const rng = makeRng(randomSeed());
  const name = BOT_NAMES.find((n) => !used.has(`${n} (bot)`)) || `Bot ${state.players.length + 1}`;
  return addPlayer(state, {
    id: `bot-${randomSeed().toString(36)}`,
    name: `${name} (bot)`,
    bot: true,
    patron: { id: rng.pick(BOT_PATRONS), bond: rng.int(3) },
    echoSlots: 1,
  });
}

// Host = first connected human by seat. `connected` is a Set of ids (online) or null (solo).
export function electHost(state, connected) {
  const humans = state.players.filter((p) => !p.bot);
  const alive = connected ? humans.filter((p) => connected.has(p.id)) : humans;
  const cand = (alive.length ? alive : humans)[0];
  const next = cand ? cand.id : null;
  if (next !== state.hostId) {
    state.hostId = next;
    if (cand) log(state, `${cand.name} is now the host.`);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- deck

function buildDeck(state) {
  const rng = rngFor(state, state.matchNo, 'deck');
  const cards = [];
  for (const suit of SUIT_IDS) {
    for (let rank = 1; rank <= 5; rank++) {
      for (let k = 0; k < 2; k++) cards.push({ id: `c${++state.cardSeq}`, suit, rank, persona: null, revealed: false, held: 0, known: false });
    }
  }
  rng.shuffle(cards);
  // hide personas inside random cards
  const pool = rng.shuffle([...PERSONA_IDS, ...PERSONA_IDS]).slice(0, PERSONAS_PER_DECK);
  const idx = rng.shuffle(cards.map((_, i) => i)).slice(0, PERSONAS_PER_DECK);
  idx.forEach((ci, k) => { cards[ci].persona = pool[k]; });
  return cards;
}

function draw(state, player, n, rng) {
  for (let i = 0; i < n; i++) {
    if (player.hand.length >= MATCH.maxHand) return;
    if (!state.deck.length) {
      if (!state.discard.length) return;
      state.deck = rng.shuffle(state.discard.map(resetCard));
      state.discard = [];
      log(state, 'The deck was reshuffled.');
    }
    player.hand.push(state.deck.pop());
  }
}

function resetCard(c) { return { ...c, revealed: false, held: 0, known: false }; }

// ---------------------------------------------------------------- phase helpers

function setPhase(state, phase, start, seconds) {
  state.phase = phase;
  state.phaseStarted = start;
  state.phaseEnds = seconds == null ? 0 : start + Math.round(seconds * 1000);
}

function log(state, text) {
  state.log.push({ r: state.round, text });
  if (state.log.length > 40) state.log.splice(0, state.log.length - 40);
}

export function startMatch(state, now) {
  if (state.players.length < 2) return { ok: false, error: 'Need at least 2 players (add a bot)' };
  state.matchNo += 1;
  state.seed = hashSeed(`${state.seed}:${state.matchNo}:${now}`);
  state.round = 0;
  state.deck = buildDeck(state);
  state.discard = [];
  state.history = [];
  state.edicts = [];
  state.activeEdicts = [];
  state.offers = [];
  state.results = null;
  state.battle = null;
  const rng = rngFor(state, 'start');
  for (const p of state.players) {
    Object.assign(p, { hand: [], wins: 0, play: null, locked: false, tradeDone: false, dose: null, fighter: null, earned: [], usedEchoes: [] });
    const extra = patronMods(p.patron).specials.extraCard ? 1 : 0;
    draw(state, p, MATCH.startHand + extra, rng);
  }
  log(state, 'The match begins. First to 3 battle wins takes it.');
  startRound(state, now);
  return { ok: true };
}

function startRound(state, now) {
  state.round += 1;
  const rng = rngFor(state, state.round, 'round');
  const leader = Math.max(...state.players.map((p) => p.wins));
  state.activeEdicts = state.edicts.filter((e) => e.round === state.round);
  for (const p of state.players) {
    if (state.round > 1) {
      // underdogs draw extra cards
      draw(state, p, MATCH.drawPerRound + Math.min(2, leader - p.wins), rng);
    }
    for (const c of p.hand) {
      c.held += 1;
      if (c.persona && c.held >= 4 && !c.known) c.known = true; // you've figured out what it is
    }
    p.play = null; p.locked = false; p.tradeDone = false; p.fighter = null;
    const velvet = state.activeEdicts.some((e) => e.id === 'velvetDecree' && e.owner === p.id);
    const shine = patronMods(p.patron).specials.shineFace;
    p.dose = rollDose(rngFor(state, state.round, 'dose', p.id), { advantage: velvet, shineFace: shine });
    if (p.dose.double) log(state, `${p.name} rolled a DOUBLE DOSE!`);
  }
  state.offers = [];
  state.battle = null;
  setPhase(state, 'roll', now, T.roll);
}

// ---------------------------------------------------------------- bots / auto-play

function bestPlay(state, p) {
  const hand = p.hand;
  if (!hand.length) return { cards: [], echoes: [] };
  const edictMods = edictModsFor(state, p);
  let best = null;
  const n = hand.length;
  const consider = (idxs) => {
    const cards = idxs.map((i) => hand[i]);
    const f = buildFighter(cards, p.dose, { patron: p.patron, edictMods, seed: 1 });
    // Keep some cards for later rounds when the hand is thin.
    const thin = n - cards.length < 3 ? 0.08 * cards.length : 0;
    const score = f.power * (1 - thin) * (1 - 0.03 * cards.length);
    if (!best || score > best.score) best = { score, cards: cards.map((c) => c.id) };
  };
  for (let i = 0; i < n; i++) {
    consider([i]);
    for (let j = i + 1; j < n; j++) {
      consider([i, j]);
      for (let k = j + 1; k < n; k++) consider([i, j, k]);
    }
  }
  const echoes = availableEchoes(p).slice(0, p.echoSlots).map((e) => e.id);
  return { cards: best.cards, echoes };
}

function availableEchoes(p) {
  return p.echoes.filter((e) => !p.usedEchoes.includes(e.id));
}

function runBots(state, now) {
  let changed = false;
  if (state.phase === 'trade') {
    // bots answer offers made to them
    for (const o of state.offers) {
      if (o.status !== 'open') continue;
      const target = state.players.find((p) => p.id === o.to);
      if (!target?.bot) continue;
      const mine = target.hand.filter((c) => c.suit === o.wantSuit).sort((a, b) => a.rank - b.rank)[0];
      const giver = state.players.find((p) => p.id === o.from);
      const give = giver?.hand.find((c) => c.id === o.give);
      if (mine && give && give.rank >= mine.rank) resolveOffer(state, o, mine.id);
      else { o.status = 'declined'; log(state, `${target.name} declined a trade.`); }
      changed = true;
    }
    for (const p of state.players) if (p.bot && !p.tradeDone) { p.tradeDone = true; changed = true; }
  }
  if (state.phase === 'play') {
    for (const p of state.players) {
      if (p.bot && !p.locked) { lockPlay(state, p, bestPlay(state, p)); changed = true; }
    }
  }
  return changed;
}

function maybeBotOffers(state) {
  const humans = state.players.filter((p) => !p.bot);
  if (!humans.length) return;
  for (const b of state.players) {
    if (!b.bot || b.hand.length < 2) continue;
    const rng = rngFor(state, state.round, 'botoffer', b.id);
    if (!rng.chance(0.35)) continue;
    const to = rng.pick(humans);
    const give = [...b.hand].sort((x, y) => x.rank - y.rank)[0];
    const counts = {};
    for (const c of b.hand) counts[c.suit] = (counts[c.suit] || 0) + 1;
    const wantSuit = Object.entries(counts).sort((x, y) => y[1] - x[1])[0][0];
    if (give.suit === wantSuit) continue;
    state.offers.push({ id: `o${++state.offerSeq}`, from: b.id, to: to.id, give: give.id, giveCard: pub(give), wantSuit, status: 'open' });
  }
}

// ---------------------------------------------------------------- trade

function resolveOffer(state, o, theirCardId) {
  const from = state.players.find((p) => p.id === o.from);
  const to = state.players.find((p) => p.id === o.to);
  const gi = from?.hand.findIndex((c) => c.id === o.give);
  const ti = to?.hand.findIndex((c) => c.id === theirCardId);
  if (!from || !to || gi < 0 || ti < 0 || to.hand[ti].suit !== o.wantSuit) { o.status = 'void'; return false; }
  const a = from.hand.splice(gi, 1)[0];
  const b = to.hand.splice(ti, 1)[0];
  // the new owner doesn't know the card's secret yet
  to.hand.push({ ...a, held: 0, known: a.revealed });
  from.hand.push({ ...b, held: 0, known: b.revealed });
  o.status = 'accepted';
  o.gotCard = pub(b);
  log(state, `${from.name} and ${to.name} traded cards.`);
  // any other open offer involving these cards is void
  for (const x of state.offers) {
    if (x !== o && x.status === 'open' && (x.give === a.id || x.give === b.id)) x.status = 'void';
  }
  return true;
}

// ---------------------------------------------------------------- play / summon / battle

function lockPlay(state, p, play) {
  const ids = (play.cards || []).filter((id) => p.hand.some((c) => c.id === id)).slice(0, MATCH.maxPlay);
  if (!ids.length && p.hand.length) ids.push(p.hand[0].id);
  const avail = availableEchoes(p).map((e) => e.id);
  const echoes = (play.echoes || []).filter((id) => avail.includes(id)).slice(0, p.echoSlots);
  p.play = { cards: ids, echoes };
  p.locked = true;
}

function edictModsFor(state, p) {
  const mods = [];
  for (const e of state.activeEdicts) {
    if (e.id === 'ironCrown' && e.owner !== p.id) mods.push({ stat: 'atk', mult: -0.2 });
  }
  return mods;
}

function summon(state, now) {
  const edictsNext = [];
  for (const p of state.players) {
    if (!p.locked) lockPlay(state, p, bestPlay(state, p));
    const cards = p.play.cards.map((id) => p.hand.find((c) => c.id === id)).filter(Boolean);
    // reveal personas played alongside a same-suit card
    for (const c of cards) {
      if (c.persona && !c.revealed && cards.some((o) => o !== c && o.suit === c.suit)) {
        c.revealed = true; c.known = true;
        log(state, `${p.name} revealed a hidden ${PERSONAS[c.persona].name}!`);
        const ed = PERSONAS[c.persona].edict;
        if (ed) edictsNext.push({ id: ed, owner: p.id, round: state.round + 1 });
      }
    }
    p.fighter = buildFighter(cards, p.dose, {
      patron: p.patron,
      edictMods: edictModsFor(state, p),
      seed: hashSeed(`${state.seed}:${state.round}:build:${p.id}`),
      name: fighterName(state, p, cards),
      owner: p.id,
    });
    p.playedCards = cards.map((c) => ({ ...c }));
    p.hand = p.hand.filter((c) => !p.play.cards.includes(c.id));
    for (const e of p.play.echoes) p.usedEchoes.push(e);
  }
  state.edicts.push(...edictsNext);
  for (const e of edictsNext) log(state, `Edict next round: ${EDICTS[e.id].name}.`);

  // battle units
  const units = [];
  for (const p of state.players) {
    const f = p.fighter;
    units.push({ uid: `${p.id}:main`, owner: p.id, name: f.name, kind: 'main', stats: f.stats, weapon: f.weapon, range: f.range, projectile: f.projectile, specials: f.specials, parts: f.parts });
    for (const eid of p.play.echoes) {
      const e = p.echoes.find((x) => x.id === eid);
      if (!e) continue;
      units.push({ uid: `${p.id}:e:${e.id}`, owner: p.id, name: e.name, kind: 'echo', stats: echoBattleStats(e, MATCH.echoPower), weapon: e.weapon, range: e.range, projectile: e.projectile, specials: { ...(e.specials || {}), clone: false }, parts: e.parts });
    }
  }
  const seed = hashSeed(`${state.seed}:${state.round}:battle`);
  const result = runBattle(units, seed, { maxSeconds: MATCH.battleMaxSeconds });
  state.battle = { round: state.round, seed, units, winner: result.winner, seconds: result.seconds, dmg: result.dmg, maxSeconds: MATCH.battleMaxSeconds };
  setPhase(state, 'summon', now, T.summon);
}

function fighterName(state, p, cards) {
  const rng = rngFor(state, state.round, 'name', p.id);
  const A = ['Ash', 'Velvet', 'Neon', 'Crimson', 'Hollow', 'Lucky', 'Midnight', 'Silver', 'Feral', 'Gilded', 'Static', 'Sour'];
  const B = { blade: ['Edge', 'Duelist', 'Ronin'], ember: ['Cinder', 'Pyre', 'Flare'], tide: ['Bulwark', 'Anchor', 'Undertow'], gale: ['Whisper', 'Dart', 'Zephyr'], bloom: ['Thorn', 'Petal', 'Briar'] };
  const suit = cards[0]?.suit || 'blade';
  return `${rng.pick(A)} ${rng.pick(B[suit])}`;
}

function finishBattle(state, now) {
  const b = state.battle;
  const winner = state.players.find((p) => p.id === b.winner);
  const edictsNext = [];
  if (winner) {
    winner.wins += 1;
    // the winner's fighter becomes an Echo
    const echo = echoFromFighter(winner.fighter, {
      id: `echo-${state.id}-${state.matchNo}-${state.round}`,
      name: winner.fighter.name,
      born: now,
    });
    winner.earned.push(echo);
    winner.echoes.push(echo);
    // victory reveals the winner's personas; revealed persona cards return to hand
    for (const c of winner.playedCards || []) {
      if (c.persona && !c.revealed) {
        log(state, `Victory revealed ${winner.name}'s ${PERSONAS[c.persona].name}!`);
        const ed = PERSONAS[c.persona].edict;
        if (ed) edictsNext.push({ id: ed, owner: winner.id, round: state.round + 1 });
      }
      if (c.persona && winner.hand.length < MATCH.maxHand) winner.hand.push({ ...c, revealed: true, known: true, held: 0 });
      else state.discard.push(c);
    }
    log(state, `${winner.name}'s ${winner.fighter.name} won round ${state.round} and became an Echo.`);
  } else {
    log(state, `Round ${state.round}: nobody survived.`);
  }
  for (const p of state.players) {
    if (p === winner) continue;
    for (const c of p.playedCards || []) state.discard.push(c);
  }
  state.edicts.push(...edictsNext);
  state.history.push({ round: state.round, winner: b.winner, fighters: state.players.map((p) => ({ id: p.id, name: p.fighter?.name, power: p.fighter?.power })) });

  const champ = state.players.find((p) => p.wins >= MATCH.winsToTake);
  if (champ) {
    const order = [...state.players].sort((a, c) => c.wins - a.wins || a.seat - c.seat);
    state.results = order.map((p, i) => ({
      id: p.id, name: p.name, place: i + 1, wins: p.wins,
      tickets: MATCH.rewards.tickets[i] || 0,
      fame: (MATCH.rewards.fame[i] || 0) + p.wins * MATCH.rewards.perRoundWin.fame,
    }));
    log(state, `${champ.name} wins the match!`);
    setPhase(state, 'end', now, null);
  } else {
    setPhase(state, 'result', now, T.resultPad);
  }
}

// ---------------------------------------------------------------- advance

export function advance(state, now = Date.now()) {
  let changed = false;
  for (let guard = 0; guard < 20; guard++) {
    if (runBots(state, now)) changed = true;
    const due = state.phaseEnds && now >= state.phaseEnds;
    const humans = state.players.filter((p) => !p.bot);
    const at = due ? state.phaseEnds : now; // chain from the deadline so every client stays in sync

    if (state.phase === 'roll' && due) {
      setPhase(state, 'trade', at, T.trade);
      maybeBotOffers(state);
      changed = true; continue;
    }
    if (state.phase === 'trade' && (due || humans.every((p) => p.tradeDone))) {
      for (const o of state.offers) if (o.status === 'open') o.status = 'expired';
      setPhase(state, 'play', at, T.play);
      changed = true; continue;
    }
    if (state.phase === 'play' && (due || state.players.every((p) => p.locked))) {
      summon(state, at);
      changed = true; continue;
    }
    if (state.phase === 'summon' && due) {
      setPhase(state, 'battle', at, state.battle.seconds + 1.5);
      changed = true; continue;
    }
    if (state.phase === 'battle' && due) {
      finishBattle(state, at);
      changed = true; continue;
    }
    if (state.phase === 'result' && due) {
      startRound(state, at);
      changed = true; continue;
    }
    break;
  }
  return changed;
}

// ---------------------------------------------------------------- actions

export function act(state, pid, a, now = Date.now()) {
  const p = state.players.find((x) => x.id === pid);
  if (!p) return { ok: false, error: 'You are not at this table' };
  const isHost = state.hostId === pid;
  switch (a.type) {
    case 'start':
      if (!isHost) return { ok: false, error: 'Only the host can start' };
      if (state.phase !== 'lobby') return { ok: false, error: 'Already started' };
      return startMatch(state, now);
    case 'restart':
      if (!isHost) return { ok: false, error: 'Only the host can restart' };
      for (const x of state.players) x.wins = 0;
      state.phase = 'lobby'; state.phaseEnds = 0; state.round = 0; state.battle = null; state.results = null;
      log(state, 'The host reset the table.');
      return { ok: true };
    case 'addBot':
      if (!isHost) return { ok: false, error: 'Only the host can add bots' };
      return addBot(state);
    case 'removeBot': {
      if (!isHost) return { ok: false, error: 'Only the host can remove bots' };
      if (state.phase !== 'lobby') return { ok: false, error: 'Not during a match' };
      const bot = state.players.find((x) => x.id === a.id && x.bot);
      if (bot) removePlayer(state, bot.id);
      return { ok: true };
    }
    case 'loadout': {
      if (state.phase !== 'lobby') return { ok: false, error: 'Change your loadout between matches' };
      if (a.patron && GIRLS[a.patron.id]) p.patron = { id: a.patron.id, bond: Math.min(6, a.patron.bond || 0) };
      if (Array.isArray(a.echoes)) p.echoes = a.echoes.slice(0, 3);
      if (a.echoSlots) p.echoSlots = Math.max(1, Math.min(3, a.echoSlots));
      if (a.name) p.name = String(a.name).slice(0, 20);
      return { ok: true };
    }
    case 'offer': {
      if (state.phase !== 'trade') return { ok: false, error: 'Trading is closed' };
      const to = state.players.find((x) => x.id === a.to);
      const give = p.hand.find((c) => c.id === a.give);
      if (!to || to === p || !give || !SUIT_IDS.includes(a.wantSuit)) return { ok: false, error: 'Bad offer' };
      if (state.offers.filter((o) => o.from === pid && o.status === 'open').length >= 2) return { ok: false, error: 'Max 2 open offers' };
      state.offers.push({ id: `o${++state.offerSeq}`, from: pid, to: to.id, give: give.id, giveCard: pub(give), wantSuit: a.wantSuit, status: 'open' });
      return { ok: true };
    }
    case 'respond': {
      const o = state.offers.find((x) => x.id === a.offerId);
      if (!o || o.to !== pid || o.status !== 'open') return { ok: false, error: 'Offer is gone' };
      if (state.phase !== 'trade') return { ok: false, error: 'Trading is closed' };
      if (!a.accept) { o.status = 'declined'; return { ok: true }; }
      return resolveOffer(state, o, a.card) ? { ok: true } : { ok: false, error: `You need a ${a.wantSuit || o.wantSuit} card` };
    }
    case 'cancelOffer': {
      const o = state.offers.find((x) => x.id === a.offerId && x.from === pid && x.status === 'open');
      if (o) o.status = 'cancelled';
      return { ok: true };
    }
    case 'tradeDone':
      p.tradeDone = true;
      return { ok: true };
    case 'play':
      if (state.phase !== 'play') return { ok: false, error: 'Not the play phase' };
      if (!Array.isArray(a.cards) || !a.cards.length) return { ok: false, error: 'Pick at least one card' };
      lockPlay(state, p, a);
      return { ok: true };
    case 'unlock':
      if (state.phase !== 'play') return { ok: false, error: 'Too late' };
      p.locked = false; p.play = null;
      return { ok: true };
    default:
      return { ok: false, error: 'Unknown action' };
  }
}

// ---------------------------------------------------------------- views

function pub(c) { return { id: c.id, suit: c.suit, rank: c.rank }; }

function cardView(c, owner) {
  const v = { id: c.id, suit: c.suit, rank: c.rank };
  if (c.revealed || (owner && c.known)) v.persona = c.persona;
  else if (owner && c.persona && c.held >= 2) v.shimmer = true; // you sense something
  if (c.revealed) v.revealed = true;
  return v;
}

export function viewFor(state, pid) {
  const showFighters = ['summon', 'battle', 'result', 'end'].includes(state.phase);
  return {
    id: state.id,
    phase: state.phase,
    phaseEnds: state.phaseEnds,
    phaseStarted: state.phaseStarted,
    round: state.round,
    hostId: state.hostId,
    you: pid,
    deckCount: state.deck.length,
    edicts: state.activeEdicts,
    upcomingEdicts: state.edicts.filter((e) => e.round > state.round),
    players: state.players.map((p) => {
      const me = p.id === pid;
      const out = {
        id: p.id, name: p.name, seat: p.seat, bot: p.bot, patron: p.patron, wins: p.wins,
        handCount: p.hand.length, locked: p.locked, tradeDone: p.tradeDone, dose: p.dose,
        echoSlots: p.echoSlots, echoCount: p.echoes.length - p.usedEchoes.length,
      };
      if (me) {
        out.hand = p.hand.map((c) => cardView(c, true));
        out.play = p.play;
        out.echoes = p.echoes.map((e) => ({ ...e, used: p.usedEchoes.includes(e.id) }));
        out.earned = p.earned;
      }
      if (showFighters && p.fighter) {
        out.fighter = { name: p.fighter.name, stats: p.fighter.stats, weapon: p.fighter.weapon, weaponSuit: p.fighter.weaponSuit, combos: p.fighter.combos, power: p.fighter.power, parts: p.fighter.parts, specials: p.fighter.specials, sources: p.fighter.sources.map((s) => (s.kind === 'persona' && s.hidden ? { kind: 'persona', hidden: true } : s)) };
        out.playedCards = (p.playedCards || []).map((c) => cardView(c, me));
        out.sentEchoes = p.play?.echoes || [];
      }
      return out;
    }),
    offers: state.offers.filter((o) => o.from === pid || o.to === pid),
    battle: ['battle', 'result', 'end'].includes(state.phase) || state.phase === 'summon' ? state.battle : null,
    history: state.history,
    log: state.log.slice(-12),
    results: state.results,
    matchNo: state.matchNo,
  };
}

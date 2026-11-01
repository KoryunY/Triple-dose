// Triple Dose — shared game data (used by the client and the server).
// Everything here is plain data so both sides compute identical results.

// ---------------------------------------------------------------- fighters

export const BASE_STATS = {
  hp: 230,       // health
  atk: 10,       // damage per hit
  spd: 2.2,      // move speed (arena units / s)
  aspd: 1.0,     // attacks per second
  crit: 0.05,    // crit chance 0..1
  critDmg: 1.5,  // crit multiplier
  dodge: 0.03,   // dodge chance 0..1
  lifesteal: 0,  // fraction of damage healed
  regen: 0,      // hp per second
  armor: 0,      // damage reduction 0..0.6
  accuracy: 1,   // chance an attack connects before dodge
};

// Short labels for the UI (keep these consistent everywhere).
export const STAT_LABELS = {
  hp: 'HP', atk: 'ATK', spd: 'SPD', aspd: 'ATK SPD', crit: 'CRIT', critDmg: 'CRIT DMG',
  dodge: 'DODGE', lifesteal: 'LIFESTEAL', regen: 'REGEN', armor: 'ARMOR', accuracy: 'ACCURACY',
};

export const STAT_CAPS = { crit: 0.75, dodge: 0.45, armor: 0.6, lifesteal: 0.5, accuracy: 1 };

// ---------------------------------------------------------------- suits

export const SUITS = {
  blade: {
    name: 'Blade', color: '#ff5a6e', weapon: 'sword', range: 1.7, projectile: false,
    perRank: { atk: 2.0, critDmg: 0.05 }, desc: 'Sword fighter. Hits hard, crits harder.',
  },
  ember: {
    name: 'Ember', color: '#ff9f1c', weapon: 'staff', range: 6, projectile: true,
    perRank: { atk: 1.5, crit: 0.02 }, desc: 'Fire staff. Ranged bolts, high crit chance.',
  },
  tide: {
    name: 'Tide', color: '#3fa7ff', weapon: 'mace', range: 1.8, projectile: false,
    perRank: { hp: 28, armor: 0.02 }, desc: 'Mace and shield. Tanky, armored.',
  },
  gale: {
    name: 'Gale', color: '#5be3a8', weapon: 'daggers', range: 1.5, projectile: false,
    perRank: { aspd: 0.08, spd: 0.15, dodge: 0.01 }, desc: 'Twin daggers. Fast and slippery.',
  },
  bloom: {
    name: 'Bloom', color: '#c77dff', weapon: 'bow', range: 7, projectile: true,
    perRank: { regen: 1.4, lifesteal: 0.02, hp: 12 }, desc: 'Bow. Ranged, heals itself over time.',
  },
};
export const SUIT_IDS = Object.keys(SUITS);

// Every card also adds a little raw power.
export const CARD_BASE_PER_RANK = { hp: 14, atk: 0.5 };

// ---------------------------------------------------------------- personas (hidden card identities)

// Hidden personas apply in battle even before anyone knows they're there.
// A persona is revealed when its card is played with another card of the same suit,
// or when the fighter carrying it wins a battle.
export const PERSONAS = {
  king: {
    name: 'King', glyph: '♔', desc: '+15% to all stats. Revealed: Edict "Iron Crown" — next round, every other fighter has −20% ATK.',
    mods: [{ stat: 'hp', mult: 0.15 }, { stat: 'atk', mult: 0.15 }, { stat: 'aspd', mult: 0.15 }, { stat: 'spd', mult: 0.15 }],
    edict: 'ironCrown',
  },
  queen: {
    name: 'Queen', glyph: '♕', desc: '+20% CRIT DMG, +8% LIFESTEAL. Revealed: Edict "Velvet Decree" — next round her owner rolls dice twice and keeps the rarer faces.',
    mods: [{ stat: 'critDmg', add: 0.2 }, { stat: 'lifesteal', add: 0.08 }],
    edict: 'velvetDecree',
  },
  jester: {
    name: 'Jester', glyph: '🃏', desc: 'Chaos: one random stat +40%, another −20%, every battle.',
    mods: [], special: 'chaos',
  },
  assassin: {
    name: 'Assassin', glyph: '🗡', desc: '+20% CRIT. First hit is always a crit.',
    mods: [{ stat: 'crit', add: 0.2 }], special: 'firstCrit',
  },
  knight: {
    name: 'Knight', glyph: '🛡', desc: '+30% HP, +10% ARMOR.',
    mods: [{ stat: 'hp', mult: 0.3 }, { stat: 'armor', add: 0.1 }],
  },
  priestess: {
    name: 'Priestess', glyph: '✚', desc: '+7 REGEN. Heals nearby allies 4.5 HP/s.',
    mods: [{ stat: 'regen', add: 7 }], special: 'healAura',
  },
  hermit: {
    name: 'Hermit', glyph: '☾', desc: '+15% DODGE.',
    mods: [{ stat: 'dodge', add: 0.15 }],
  },
  thief: {
    name: 'Thief', glyph: '✦', desc: '+15% LIFESTEAL. First hit steals 10% of the target\'s ATK.',
    mods: [{ stat: 'lifesteal', add: 0.15 }], special: 'steal',
  },
  twins: {
    name: 'Twins', glyph: '♊', desc: 'Spawns a small clone at 35% power.',
    mods: [], special: 'clone',
  },
  phoenix: {
    name: 'Phoenix', glyph: '🔥', desc: 'Revives once at 40% HP.',
    mods: [], special: 'revive',
  },
};
export const PERSONA_IDS = Object.keys(PERSONAS);
export const PERSONAS_PER_DECK = 12;

export const EDICTS = {
  ironCrown: { name: 'Iron Crown', desc: 'Every fighter except the King\'s owner has −20% ATK this round.' },
  velvetDecree: { name: 'Velvet Decree', desc: 'The Queen\'s owner rolls twice and keeps the rarer faces.' },
};

// ---------------------------------------------------------------- combos (from played cards)

export const COMBOS = {
  pair: { name: 'Pair', desc: 'Two cards of one suit: +10% to all stats.' },
  triad: { name: 'Triad', desc: 'Three cards of one suit: +25% to all stats.' },
  spectrum: { name: 'Spectrum', desc: 'Three different suits: +10% CRIT and +8% DODGE.' },
  run: { name: 'Run', desc: 'Three consecutive ranks: +20% ATK SPD.' },
};

// ---------------------------------------------------------------- dice (fictional stand-ins)

// Each die has 6 faces. Rarity: common faces repeat, the rare face appears once.
export const SMOKE_DIE = ['ash', 'ash', 'ash', 'pipe', 'pipe', 'herb'];
export const DRINK_DIE = ['water', 'water', 'water', 'fizz', 'fizz', 'shine'];

export const DICE_FACES = {
  ash:   { die: 'smoke', name: 'Ash Stick',  rare: false, status: 'steady' },
  pipe:  { die: 'smoke', name: 'Cloud Pipe', rare: false, status: 'cloud' },
  herb:  { die: 'smoke', name: 'Herb',       rare: true,  table: 'haze' },
  water: { die: 'drink', name: 'Water',      rare: false, status: 'hydrated' },
  fizz:  { die: 'drink', name: 'Fizz',       rare: false, status: 'wired' },
  shine: { die: 'drink', name: 'Moonshine',  rare: true,  table: 'lastCall' },
};

// Constant statuses from common faces.
export const STATUSES = {
  steady:   { name: 'Steady',   desc: '+10% ATK, −5% HP',              mods: [{ stat: 'atk', mult: 0.10 }, { stat: 'hp', mult: -0.05 }] },
  cloud:    { name: 'Cloud',    desc: '+8% DODGE, −5% SPD',            mods: [{ stat: 'dodge', add: 0.08 }, { stat: 'spd', mult: -0.05 }] },
  hydrated: { name: 'Hydrated', desc: '+3.5 REGEN, +5% HP',            mods: [{ stat: 'regen', add: 3.5 }, { stat: 'hp', mult: 0.05 }] },
  wired:    { name: 'Wired',    desc: '+12% ATK SPD, +10% SPD, −5% ARMOR', mods: [{ stat: 'aspd', mult: 0.12 }, { stat: 'spd', mult: 0.10 }, { stat: 'armor', add: -0.05 }] },
};

// Bonus when both faces are common.
export const COMMON_PAIRS = {
  'ash+water': { name: 'Clean Break',   desc: '+5% CRIT',      mods: [{ stat: 'crit', add: 0.05 }] },
  'ash+fizz':  { name: 'Rush Hour',     desc: '+6% ATK SPD',   mods: [{ stat: 'aspd', mult: 0.06 }] },
  'pipe+water':{ name: 'Spa Day',       desc: '+2.5 REGEN',    mods: [{ stat: 'regen', add: 2.5 }] },
  'pipe+fizz': { name: 'Bubble Lounge', desc: '+4% DODGE',     mods: [{ stat: 'dodge', add: 0.04 }] },
};

// Rare faces roll on a table: big swings, sometimes backfire.
export const RARE_TABLES = {
  haze: {
    name: 'Haze',
    outcomes: [
      { id: 'thirdEye',  name: 'Third Eye',  desc: '+20% CRIT',                  mods: [{ stat: 'crit', add: 0.2 }] },
      { id: 'couchLock', name: 'Couch Lock', desc: '−30% SPD, +35% HP',          mods: [{ stat: 'spd', mult: -0.3 }, { stat: 'hp', mult: 0.35 }] },
      { id: 'giggles',   name: 'Giggles',    desc: '+15% DODGE',                 mods: [{ stat: 'dodge', add: 0.15 }] },
      { id: 'munchies',  name: 'Munchies',   desc: '+15% LIFESTEAL',             mods: [{ stat: 'lifesteal', add: 0.15 }] },
      { id: 'paranoia',  name: 'Paranoia',   desc: '−10% ATK, +20% DODGE',       mods: [{ stat: 'atk', mult: -0.1 }, { stat: 'dodge', add: 0.2 }] },
      { id: 'zenBloom',  name: 'Zen Bloom',  desc: '+9 REGEN, +10% ARMOR',       mods: [{ stat: 'regen', add: 9 }, { stat: 'armor', add: 0.1 }] },
    ],
  },
  lastCall: {
    name: 'Last Call',
    outcomes: [
      { id: 'courage',   name: 'Liquid Courage', desc: '+30% ATK',                       mods: [{ stat: 'atk', mult: 0.3 }] },
      { id: 'goggles',   name: 'Blurry Eyes',    desc: '+60% CRIT DMG, −15% ACCURACY',   mods: [{ stat: 'critDmg', add: 0.6 }, { stat: 'accuracy', add: -0.15 }] },
      { id: 'berserk',   name: 'Berserk',        desc: '+30% ATK SPD, −20% HP',          mods: [{ stat: 'aspd', mult: 0.3 }, { stat: 'hp', mult: -0.2 }] },
      { id: 'blackout',  name: 'Blackout',       desc: 'Coin flip: +50% ATK or −15% to everything', coin: true,
        heads: [{ stat: 'atk', mult: 0.5 }],
        tails: [{ stat: 'hp', mult: -0.15 }, { stat: 'atk', mult: -0.15 }, { stat: 'aspd', mult: -0.15 }, { stat: 'spd', mult: -0.15 }] },
      { id: 'brawler',   name: 'Bar Brawler',    desc: '+15% ATK, +20% HP',              mods: [{ stat: 'atk', mult: 0.15 }, { stat: 'hp', mult: 0.2 }] },
      { id: 'hangover',  name: 'Hangover',       desc: '−20% SPD, +15% ARMOR',           mods: [{ stat: 'spd', mult: -0.2 }, { stat: 'armor', add: 0.15 }] },
    ],
  },
};
export const DOUBLE_DOSE = { name: 'DOUBLE DOSE', desc: 'Both rare faces! Both outcomes hit twice as hard.' };

// ---------------------------------------------------------------- match rules

export const MATCH = {
  maxPlayers: 3,
  winsToTake: 3,
  startHand: 6,
  drawPerRound: 2,
  maxHand: 8,
  maxPlay: 3,
  echoPower: 0.6,           // echoes fight at 60% of their stats
  timers: {                 // seconds
    roll: 6,
    trade: 20,
    play: 25,
    summon: 5,
    resultPad: 4,           // after battle replay ends
    matchEnd: 0,
  },
  battleMaxSeconds: 45,
  rewards: { tickets: [8, 4, 2], fame: [40, 20, 10], perRoundWin: { fame: 5 } },
};

// ---------------------------------------------------------------- fame

export const FAME_RANKS = [
  { name: 'Nobody', min: 0, echoSlots: 1 },
  { name: 'Local', min: 100, echoSlots: 1 },
  { name: 'Rising', min: 300, echoSlots: 2 },
  { name: 'Star', min: 700, echoSlots: 2 },
  { name: 'Icon', min: 1500, echoSlots: 3 },
  { name: 'Legend', min: 3000, echoSlots: 3 },
];

export function fameRank(fame = 0) {
  let r = FAME_RANKS[0];
  for (const rank of FAME_RANKS) if (fame >= rank.min) r = rank;
  const i = FAME_RANKS.indexOf(r);
  return { ...r, index: i, next: FAME_RANKS[i + 1] || null };
}

// ---------------------------------------------------------------- girls (gacha patrons)
// Original characters. `look` drives the procedural portrait art.

export const GIRLS = {
  rin: {
    name: 'Rin Kagerou', title: 'Afterglow Idol', rarity: 5, suit: 'ember',
    passive: { name: 'Afterglow', desc: 'Your fighters gain +{v}% CRIT DMG.', stat: 'critDmg', add: 0.15, perBond: 0.05, pct: true },
    look: { hair: '#ff4d2e', hair2: '#ffb347', hairStyle: 'twintails', eyes: '#ffcc33', skin: '#ffe2d0', outfit: '#2b1a2e', accent: '#ff9f1c', accessory: 'headphones', mood: 'smirk' },
    lore: 'A stage performer whose encores literally set the room on fire.',
  },
  mireille: {
    name: 'Mireille Vance', title: 'Undertow', rarity: 5, suit: 'tide',
    passive: { name: 'Undertow', desc: 'Your fighters gain +{v}% HP.', stat: 'hp', mult: 0.15, perBond: 0.04, pct: true },
    look: { hair: '#bfe6ff', hair2: '#3fa7ff', hairStyle: 'long', eyes: '#2b7bff', skin: '#fdeee6', outfit: '#0f2a4a', accent: '#7fd1ff', accessory: 'pearls', mood: 'calm' },
    lore: 'A harbor heiress who never loses a bet near the water.',
  },
  yuki: {
    name: 'Yuki Haneda', title: 'Tailwind', rarity: 5, suit: 'gale',
    passive: { name: 'Tailwind', desc: 'Your fighters gain +{v}% SPD and ATK SPD.', stat: 'aspd', mult: 0.12, also: { stat: 'spd', mult: 0.12 }, perBond: 0.03, pct: true },
    look: { hair: '#f4f7ff', hair2: '#5be3a8', hairStyle: 'ponytail', eyes: '#36d39a', skin: '#fff0e6', outfit: '#16362c', accent: '#5be3a8', accessory: 'goggles', mood: 'grin' },
    lore: 'Courier, thrill-seeker, and the fastest hands at any table.',
  },
  selene: {
    name: 'Selene Noct', title: 'Moonlit Pour', rarity: 5, suit: 'bloom',
    passive: { name: 'Moonlit Pour', desc: 'Your Drink die has an extra Moonshine face. Rare outcomes give +{v}% LIFESTEAL.', stat: 'lifesteal', add: 0.05, perBond: 0.02, pct: true, special: 'shineFace' },
    look: { hair: '#2a1e4a', hair2: '#c77dff', hairStyle: 'hime', eyes: '#c77dff', skin: '#f6e7f0', outfit: '#1d1030', accent: '#e0b0ff', accessory: 'crescent', mood: 'sly' },
    lore: 'Owns the bar. Owns the house. Probably owns you.',
  },
  // standard 5★ pool
  aya: {
    name: 'Aya Kurosaki', title: 'First Cut', rarity: 5, suit: 'blade', standard: true,
    passive: { name: 'First Cut', desc: 'First hit of each fighter always crits. +{v}% ATK.', stat: 'atk', mult: 0.05, perBond: 0.03, pct: true, special: 'firstCrit' },
    look: { hair: '#14141c', hair2: '#ff5a6e', hairStyle: 'bob', eyes: '#ff5a6e', skin: '#ffe9dc', outfit: '#1a1a24', accent: '#ff5a6e', accessory: 'hairpin', mood: 'stern' },
    lore: 'Bodyguard for hire. Charges by the cut.',
  },
  lumi: {
    name: 'Lumi Sato', title: 'Second Wind', rarity: 5, suit: 'bloom', standard: true,
    passive: { name: 'Second Wind', desc: 'Your main fighter revives once at {v}% HP.', special: 'revive', value: 0.3, perBond: 0.05, pct: true },
    look: { hair: '#ffd6e8', hair2: '#ff8fc7', hairStyle: 'side', eyes: '#ff8fc7', skin: '#fff1ea', outfit: '#3a1f33', accent: '#ffb3d9', accessory: 'halo', mood: 'smile' },
    lore: 'Night-shift medic. Has seen everything twice.',
  },
  vera: {
    name: 'Vera Holt', title: 'Bulwark', rarity: 5, suit: 'tide', standard: true,
    passive: { name: 'Bulwark', desc: 'Your fighters gain +{v}% ARMOR.', stat: 'armor', add: 0.08, perBond: 0.02, pct: true },
    look: { hair: '#c0c6d0', hair2: '#6a7a90', hairStyle: 'ponytail', eyes: '#8fb3ff', skin: '#f3dccb', outfit: '#232a36', accent: '#8fb3ff', accessory: 'scar', mood: 'stern' },
    lore: 'Retired champion. Came back for one more round. Then another.',
  },
  // 4★
  kiki: {
    name: 'Kiki', title: 'Card Shark', rarity: 4, suit: 'gale',
    passive: { name: 'Sleight', desc: 'Start each match with +1 card. +{v}% DODGE.', stat: 'dodge', add: 0.02, perBond: 0.01, pct: true, special: 'extraCard' },
    look: { hair: '#ffcf5a', hair2: '#ff9f1c', hairStyle: 'twintails', eyes: '#5be3a8', skin: '#ffe6d3', outfit: '#2b3a1a', accent: '#5be3a8', accessory: 'catEars', mood: 'grin' },
    lore: 'Never cheats. Never gets caught, either.',
  },
  nao: {
    name: 'Nao', title: 'Spark', rarity: 4, suit: 'ember',
    passive: { name: 'Spark', desc: '+{v}% CRIT.', stat: 'crit', add: 0.04, perBond: 0.01, pct: true },
    look: { hair: '#ff7a3d', hair2: '#ffd166', hairStyle: 'bob', eyes: '#ff7a3d', skin: '#ffe4d4', outfit: '#3a1a10', accent: '#ffd166', accessory: 'ribbon', mood: 'smile' },
    lore: 'Fireworks technician. Mostly legal.',
  },
  pia: {
    name: 'Pia', title: 'Lifeguard', rarity: 4, suit: 'tide',
    passive: { name: 'Lifeguard', desc: '+{v} REGEN.', stat: 'regen', add: 2.3, perBond: 0.7 },
    look: { hair: '#5fd3ff', hair2: '#1f8fff', hairStyle: 'ponytail', eyes: '#1f8fff', skin: '#f9dcc8', outfit: '#0d3a52', accent: '#5fd3ff', accessory: 'whistle', mood: 'smile' },
    lore: 'Saves swimmers by day, chips by night.',
  },
  tess: {
    name: 'Tess', title: 'Duelist', rarity: 4, suit: 'blade',
    passive: { name: 'Duelist', desc: '+{v}% CRIT DMG.', stat: 'critDmg', add: 0.1, perBond: 0.03, pct: true },
    look: { hair: '#8a2be2', hair2: '#ff5a6e', hairStyle: 'side', eyes: '#ff5a6e', skin: '#ffe8de', outfit: '#25122e', accent: '#ff5a6e', accessory: 'eyepatch', mood: 'smirk' },
    lore: 'Fencing club captain, expelled for "excessive flair".',
  },
};
export const GIRL_IDS = Object.keys(GIRLS);
export const STARTER_PATRON = 'nao';

export const BANNERS = [
  { id: 'afterglow', name: 'Afterglow Encore', featured: 'rin', rateUp4: ['nao', 'tess', 'kiki'], theme: ['#ff4d2e', '#2b1a2e'] },
  { id: 'undertow', name: 'Undertow', featured: 'mireille', rateUp4: ['pia', 'kiki', 'tess'], theme: ['#3fa7ff', '#0f2a4a'] },
  { id: 'tailwind', name: 'Tailwind Rush', featured: 'yuki', rateUp4: ['kiki', 'nao', 'pia'], theme: ['#5be3a8', '#16362c'] },
  { id: 'moonlit', name: 'Moonlit Pour', featured: 'selene', rateUp4: ['tess', 'pia', 'nao'], theme: ['#c77dff', '#1d1030'] },
  { id: 'standard', name: 'House Lights', standard: true, theme: ['#ffd166', '#1a1a24'] },
];

export const GACHA = {
  base5: 0.008,
  softPityStart: 66,
  softPityStep: 0.06,
  hardPity: 80,
  base4: 0.06,
  pity4: 10,
  rateUp4Share: 0.5,
  dustPer3: 15,
  dustPerDupe4Overflow: 40,
  dustPerDupe5Overflow: 150,
  maxBond: 6,
  startTickets: 30,
};

// ---------------------------------------------------------------- echoes & upgrades

export const ECHO = {
  maxStored: 40,
  maxLevel: 10,
  levelStatMult: 0.08,                  // +8% hp/atk per level
  levelCost: (lvl) => 20 + lvl * 15,    // dust to go from lvl -> lvl+1
  reforgeCost: 40,
};

// ---------------------------------------------------------------- profile defaults

export function newProfile() {
  return {
    v: 1,
    tickets: GACHA.startTickets,
    dust: 60,
    fame: 0,
    girls: { [STARTER_PATRON]: { bond: 0 } },
    patron: STARTER_PATRON,
    pity: { limited5: 0, limited4: 0, guaranteed: false, standard5: 0, standard4: 0 },
    pullHistory: [],
    echoes: [],
    equipped: [],
    stats: { matches: 0, wins: 0, roundWins: 0, expeditions: 0, bestAct: 0 },
  };
}

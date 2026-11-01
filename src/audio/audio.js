/**
 * Triple Dose: procedural WebAudio engine (music + sfx). No audio files, no libraries.
 *
 *   import { audio } from './audio/audio.js';
 *   button.addEventListener('pointerdown', () => audio.unlock());   // from a user gesture
 *   audio.music('menu');            // 'menu' | 'table' | 'arena' | 'gacha' | null (1.2 s crossfade)
 *   audio.sfx('hit', { pitch: -2, vol: 0.7 });   // returns true if it played
 *   audio.setMuted(true); audio.muted; audio.setVolume({ music: 0.4, sfx: 1 });
 *
 * Every call is a safe no-op before unlock(). A music() request made before unlock is
 * remembered and starts when unlock() runs. Settings persist in localStorage 'tripledose.audio'.
 *
 * CPU budget: music is scheduled with a 25 ms timer, 0.1 s ahead. Long-lived filters/buses
 * are created once per loop and reused. Each note is one or two short-lived oscillators that
 * disconnect themselves when they end. The context is suspended while the page is hidden or muted.
 */

const STORAGE_KEY = 'tripledose.audio';
const TICK_MS = 25;
const LOOKAHEAD = 0.1;
const XFADE = 1.2;
const MUSIC_LEVEL = 0.6;     // music bus gain at volume 1
const SFX_LEVEL = 1.0;       // sfx bus gain at volume 1
const SFX_RATE = 12;         // identical sfx refill rate per second
const SFX_BURST = 4;         // identical sfx allowed back-to-back before throttling
const MAX_SFX_VOICES = 20;   // concurrent sfx events (not oscillators)

// ---------------------------------------------------------------- utilities

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const NOTE_IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'C#4' -> 61 */
function nm(s) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error('bad note ' + s);
  return NOTE_IDX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (parseInt(m[3], 10) + 1) * 12;
}
const chordOf = (s) => s.trim().split(/\s+/).map(nm);
const fold = (m, lo, hi) => { while (m < lo) m += 12; while (m >= hi) m -= 12; return m; };

function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isHidden = () => typeof document !== 'undefined' && !!document.hidden;

// ---------------------------------------------------------------- settings

const settings = { muted: false, music: 0.5, sfx: 0.8 };
(function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const o = JSON.parse(raw);
    if (typeof o.muted === 'boolean') settings.muted = o.muted;
    if (Number.isFinite(o.music)) settings.music = clamp01(o.music);
    if (Number.isFinite(o.sfx)) settings.sfx = clamp01(o.sfx);
  } catch { /* storage unavailable */ }
})();
function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- engine state

let ctx = null;
let master, comp, musicBus, sfxBus, noiseBuf, sfxEchoIn;
let unlocked = false;
let desiredMode = null;
let current = null;          // active Track
const fading = [];           // tracks fading out
let timer = null;
let suspendTimer = null;
const sfxVoices = [];        // end times (ctx time) of active sfx events
const buckets = new Map();   // sfx throttle buckets
let errorsReported = 0;

function reportError(where, e) {
  if (errorsReported++ < 5) console.error('[audio] ' + where, e);
}

function initContext() {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return false;
  try { ctx = new AC({ latencyHint: 'interactive' }); } catch {
    try { ctx = new AC(); } catch { ctx = null; return false; }
  }

  comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 8;
  comp.ratio.value = 8;
  comp.attack.value = 0.003;
  comp.release.value = 0.15;

  master = ctx.createGain();
  master.gain.value = settings.muted ? 0 : 1;
  musicBus = ctx.createGain();
  sfxBus = ctx.createGain();
  musicBus.gain.value = settings.music * MUSIC_LEVEL;
  sfxBus.gain.value = settings.sfx * SFX_LEVEL;

  musicBus.connect(comp);
  sfxBus.connect(comp);
  comp.connect(master);
  master.connect(ctx.destination);

  // One second of white noise shared by every noise voice.
  const len = Math.floor(ctx.sampleRate);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  const r = mulberry32(1337);
  for (let i = 0; i < len; i++) data[i] = r() * 2 - 1;

  // Shared sfx echo send (sparkles and chimes): delay, damped feedback.
  sfxEchoIn = ctx.createGain();
  const dl = ctx.createDelay(1);
  dl.delayTime.value = 0.17;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 3800;
  sfxEchoIn.connect(dl);
  dl.connect(damp);
  damp.connect(fb);
  fb.connect(dl);
  damp.connect(sfxBus);
  return true;
}

// ---------------------------------------------------------------- voice helpers

function connectTo(node, dest) {
  if (Array.isArray(dest)) for (let i = 0; i < dest.length; i++) node.connect(dest[i]);
  else node.connect(dest);
}
const clampF = (f) => Math.min(Math.max(f, 20), ctx.sampleRate / 2 - 100);

/** attack / optional hold / exponential decay. Returns end time. */
function env(param, t, peak, a, d, hold = 0) {
  const p = Math.max(peak, 0.0002);
  a = Math.max(a, 0.001);
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(p, t + a);
  if (hold > 0) param.setValueAtTime(p, t + a + hold);
  param.exponentialRampToValueAtTime(0.0001, t + a + hold + d);
  return t + a + hold + d;
}

/** Plain oscillator voice. o: {type, f, f2, glide, detune, peak, a, d, hold} */
function tone(dest, t, o) {
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  const a = o.a ?? 0.005, d = o.d ?? 0.2, hold = o.hold ?? 0;
  osc.frequency.setValueAtTime(clampF(o.f), t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(clampF(o.f2), t + (o.glide ?? a + hold + d));
  if (o.detune) osc.detune.setValueAtTime(o.detune, t);
  const g = ctx.createGain();
  const end = env(g.gain, t, o.peak ?? 0.2, a, d, hold) + 0.02;
  osc.connect(g);
  connectTo(g, dest);
  osc.start(t);
  osc.stop(end);
  osc.onended = () => { try { g.disconnect(); } catch { /* */ } };
  return end;
}

/** Oscillator through a lowpass with its own envelope. o adds lp: [start, peak, end], q */
function synth(dest, t, o) {
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sawtooth';
  const a = o.a ?? 0.01, d = o.d ?? 0.2, hold = o.hold ?? 0;
  osc.frequency.setValueAtTime(clampF(o.f), t);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(clampF(o.f2), t + (o.glide ?? a + hold + d));
  if (o.detune) osc.detune.setValueAtTime(o.detune, t);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = o.q ?? 1;
  const [l0, l1, l2] = o.lp || [o.f * 2, o.f * 6, o.f * 2];
  lp.frequency.setValueAtTime(clampF(l0), t);
  lp.frequency.exponentialRampToValueAtTime(clampF(l1), t + Math.max(a, 0.02));
  lp.frequency.exponentialRampToValueAtTime(clampF(l2), t + a + hold + d);
  const g = ctx.createGain();
  const end = env(g.gain, t, o.peak ?? 0.1, a, d, hold) + 0.02;
  osc.connect(lp);
  lp.connect(g);
  connectTo(g, dest);
  osc.start(t);
  osc.stop(end);
  osc.onended = () => { try { lp.disconnect(); g.disconnect(); } catch { /* */ } };
  return end;
}

/** Filtered noise voice. o: {ftype, f, f2, glide, q, peak, a, d, hold} */
function noise(dest, t, o) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const a = o.a ?? 0.003, d = o.d ?? 0.1, hold = o.hold ?? 0;
  let head = src, filt = null;
  if (o.ftype) {
    filt = ctx.createBiquadFilter();
    filt.type = o.ftype;
    filt.frequency.setValueAtTime(clampF(o.f), t);
    if (o.f2) filt.frequency.exponentialRampToValueAtTime(clampF(o.f2), t + (o.glide ?? a + hold + d));
    if (o.q) filt.Q.value = o.q;
    src.connect(filt);
    head = filt;
  }
  const g = ctx.createGain();
  const end = env(g.gain, t, o.peak ?? 0.2, a, d, hold) + 0.02;
  head.connect(g);
  connectTo(g, dest);
  src.start(t, Math.random() * 0.9);
  src.stop(end);
  src.onended = () => { try { g.disconnect(); if (filt) filt.disconnect(); } catch { /* */ } };
  return end;
}

/** Many short noise ticks from ONE source/filter/gain (shuffle, dice rattle). */
function bursts(dest, t, o) {
  const times = o.times;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = o.ftype || 'bandpass';
  filt.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  const p = g.gain;
  p.setValueAtTime(0.0001, t);
  for (let i = 0; i < times.length; i++) {
    const bt = t + times[i];
    const f = o.f * (o.jitter ? 1 - o.jitter + Math.random() * 2 * o.jitter : 1);
    filt.frequency.setValueAtTime(clampF(f), bt);
    p.setValueAtTime(0.0001, bt);
    p.linearRampToValueAtTime(Math.max(o.peaks ? o.peaks[i] : o.peak, 0.0002), bt + 0.002);
    p.exponentialRampToValueAtTime(0.0001, bt + o.d);
  }
  const end = t + times[times.length - 1] + o.d + 0.02;
  src.connect(filt);
  filt.connect(g);
  connectTo(g, dest);
  src.start(t, Math.random() * 0.5);
  src.stop(end);
  src.onended = () => { try { filt.disconnect(); g.disconnect(); } catch { /* */ } };
  return end;
}

/** Unfiltered noise into a persistent (reused) filter: music hats/snares. */
function nz(dest, t, peak, a, d, off) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const g = ctx.createGain();
  const end = env(g.gain, t, peak, a, d) + 0.02;
  src.connect(g);
  g.connect(dest);
  src.start(t, off);
  src.stop(end);
  src.onended = () => { try { g.disconnect(); } catch { /* */ } };
}

// ---- music instrument voices

function epNote(dest, t, f, vel, dur, tine = true) {
  // Rhodes-ish: detuned sine body + quieter triangle tine that dies faster.
  tone(dest, t, { type: 'sine', f, detune: -5, peak: 0.1 * vel, a: 0.006, d: dur });
  if (tine) tone(dest, t, { type: 'triangle', f, detune: 6, peak: 0.05 * vel, a: 0.004, d: Math.min(dur * 0.45, 0.6) });
}
function kick(dest, t, peak, f0 = 140, f1 = 44, d = 0.3) {
  tone(dest, t, { type: 'sine', f: f0, f2: f1, glide: 0.09, peak, a: 0.002, d });
}
function bellNote(dest, t, f, peak, d) {
  tone(dest, t, { type: 'sine', f, peak, a: 0.003, d });
  tone(dest, t, { type: 'sine', f: f * 2.76, peak: peak * 0.28, a: 0.002, d: d * 0.3 });
}

// ---------------------------------------------------------------- music tracks

class Track {
  constructor(mode, def) {
    this.mode = mode;
    this.def = def;
    this.out = ctx.createGain();
    this.out.gain.value = 0.0001;
    this.out.connect(musicBus);
    this.stepDur = 60 / def.bpm / def.spb;
    this.stepsPerBar = def.spb * 4;
    this.loopSteps = this.stepsPerBar * def.bars;
    this.barDur = this.stepDur * this.stepsPerBar;
    this.step = 0;
    this.next = ctx.currentTime + 0.06;
    this.stopAt = Infinity;
    this.nodes = [];
    this.oscs = [];
    this.rng = mulberry32(def.seed);
    def.setup(this);
  }
  keep(n) { this.nodes.push(n); return n; }
  filter(type, f, q = 0.7, dest = this.out) {
    const b = this.keep(ctx.createBiquadFilter());
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    b.connect(dest);
    return b;
  }
  gain(v, dest = this.out) {
    const g = this.keep(ctx.createGain());
    g.gain.value = v;
    g.connect(dest);
    return g;
  }
  echo(time, feedback, damp, dest = this.out) {
    const input = this.keep(ctx.createGain());
    const dl = this.keep(ctx.createDelay(2));
    dl.delayTime.value = time;
    const fb = this.keep(ctx.createGain());
    fb.gain.value = feedback;
    const lp = this.keep(ctx.createBiquadFilter());
    lp.type = 'lowpass';
    lp.frequency.value = damp;
    input.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(dest);
    return input;
  }
  ramp(target, dur) {
    const p = this.out.gain, now = ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setValueAtTime(Math.max(p.value, 0.0001), now);
    p.linearRampToValueAtTime(Math.max(target, 0.0001), now + dur);
  }
  fadeIn() { this.ramp(this.def.level ?? 1, XFADE); }
  fadeOut() { this.ramp(0.0001, XFADE); this.stopAt = ctx.currentTime + XFADE + 0.05; }
  schedule(now, horizon) {
    // If the timer stalled (throttled tab, jank), skip ahead instead of bursting notes.
    if (this.next < now - 0.2) {
      const missed = Math.ceil((now - this.next) / this.stepDur);
      this.step += missed;
      this.next += missed * this.stepDur;
    }
    let guard = 0;
    while (this.next < horizon && guard++ < 32) {
      const s = this.step % this.loopSteps;
      try {
        this.def.play(this, this.next, (s / this.stepsPerBar) | 0, s % this.stepsPerBar, s);
      } catch (e) { reportError('music ' + this.mode, e); }
      this.step++;
      this.next += this.stepDur;
    }
  }
  dispose() {
    try { this.out.disconnect(); } catch { /* */ }
    for (const o of this.oscs) { try { o.stop(); } catch { /* */ } }
    for (const n of this.nodes) { try { n.disconnect(); } catch { /* */ } }
    this.nodes.length = 0;
    this.oscs.length = 0;
  }
}

const parseProg = (rows) => rows.map(([b, v, q]) => ({ root: nm(b), notes: v ? chordOf(v) : [], q }));

// --- MENU: mellow lo-fi lounge, 80 bpm, 16th grid, lazy swing.
const MENU_PROG = parseProg([
  ['D2', 'F3 A3 C4 E4'], ['G2', 'F3 B3 E4 A4'], ['C2', 'E3 G3 B3 D4'], ['A1', 'E3 G3 C4 D4'],
  ['F2', 'E3 A3 C4 G4'], ['E2', 'D3 G3 B3 D4'], ['D2', 'F3 A3 C4 E4'], ['G2', 'F3 A3 C4 D4'],
]);
const MENU = {
  bpm: 80, spb: 4, bars: 8, seed: 80801, level: 1,
  setup(tr) {
    const r = tr.rng;
    tr.keys = tr.filter('lowpass', 1700, 0.4);
    tr.hat = tr.filter('highpass', 6500, 0.6);
    tr.snare = tr.filter('bandpass', 1900, 0.8);
    tr.bass = tr.filter('lowpass', 420, 0.6);
    const comps = [
      [[0, 1, 2.4], [6, 0.55, 0.55], [10, 0.6, 0.9]],
      [[0, 1, 2.6], [7, 0.5, 0.6], [14, 0.45, 0.5]],
      [[0, 1, 3.0], [11, 0.55, 0.8]],
      [[0, 1, 1.8], [3, 0.45, 0.4], [10, 0.6, 1.0]],
    ];
    tr.comp = []; tr.bassPat = []; tr.kick7 = []; tr.hatV = [];
    for (let b = 0; b < 8; b++) {
      tr.comp.push(comps[(r() * comps.length) | 0]);
      tr.bassPat.push(r() < 0.5 ? 0 : 7);
      tr.kick7.push(r() < 0.35);
    }
    for (let s = 0; s < tr.loopSteps; s++) {
      const i = s % 16;
      tr.hatV.push(i % 2 === 0 ? 0.04 + r() * 0.03 : (r() < 0.18 ? 0.018 + r() * 0.012 : 0));
    }
  },
  play(tr, t, bar, i, s) {
    const ch = MENU_PROG[bar];
    const tt = t + ((i & 3) === 2 ? tr.stepDur * 0.3 : 0);
    const comp = tr.comp[bar];
    for (let h = 0; h < comp.length; h++) {
      if (comp[h][0] !== i) continue;
      const notes = i === 0 ? ch.notes : ch.notes.slice(-3);
      for (let n = 0; n < notes.length; n++) epNote(tr.keys, tt + n * 0.01, mtof(notes[n]), comp[h][1], comp[h][2], n >= notes.length - 2);
    }
    const hv = tr.hatV[s];
    if (hv) nz(tr.hat, tt, hv, 0.002, i % 4 === 0 ? 0.05 : 0.03, (s * 0.0137) % 0.9);
    if (i === 0 || i === 10 || (i === 7 && tr.kick7[bar])) kick(tr.out, tt, i === 0 ? 0.42 : 0.3, 110, 45, 0.28);
    if (i === 4 || i === 12) nz(tr.snare, tt, 0.11, 0.003, 0.13, (s * 0.031) % 0.9);
    if (i === 0) tone(tr.bass, tt, { type: 'triangle', f: mtof(ch.root), peak: 0.3, a: 0.01, d: 1.6 });
    if (i === 10) tone(tr.bass, tt, { type: 'triangle', f: mtof(ch.root + tr.bassPat[bar]), peak: 0.24, a: 0.01, d: 0.6 });
  },
};

// --- TABLE: smoky jazz lounge, 90 bpm, triplet grid (swing), walking bass, brushes.
const IV = { m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], 7: [0, 4, 7, 10], m7b5: [0, 3, 6, 10], alt: [0, 4, 8, 10] };
const TABLE_PROG = parseProg([
  ['C2', 'Eb3 G3 Bb3 D4', 'm7'], ['Ab1', 'C3 Eb3 G3', 'maj7'], ['F2', 'Ab3 C4 Eb4 G4', 'm7'], ['G1', 'B2 F3 Ab3', 'alt'],
  ['C2', 'Bb2 Eb3 G3 D4', 'm7'], ['Eb2', 'D3 G3 Bb3', 'maj7'], ['D2', 'C3 F3 Ab3', 'm7b5'], ['G1', 'F3 B3 Eb4', 'alt'],
]);
const TABLE = {
  bpm: 90, spb: 3, bars: 8, seed: 90902, level: 1,
  setup(tr) {
    const r = tr.rng;
    tr.keys = tr.filter('lowpass', 2200, 0.5);
    tr.bass = tr.filter('lowpass', 700, 0.9);
    tr.brush = tr.filter('bandpass', 2600, 0.6);
    tr.ride = tr.filter('highpass', 7000, 0.6);
    tr.vibe = tr.echo(tr.stepDur * 3, 0.3, 2500);
    tr.vibe.connect(tr.out);
    // Walking bass: root, chord tone, chord tone, approach to the next root.
    tr.walk = [];
    for (let b = 0; b < 8; b++) {
      const ch = TABLE_PROG[b], nx = TABLE_PROG[(b + 1) % 8], iv = IV[ch.q];
      const pick = () => iv[1 + ((r() * (iv.length - 1)) | 0)];
      const n0 = ch.root;
      let n1 = ch.root + pick();
      let n2 = ch.root + pick();
      if (n2 === n1) n2 = ch.root + 7;
      const n3 = r() < 0.75 ? nx.root + (r() < 0.5 ? 1 : -1) : nx.root + 7;
      tr.walk.push([n0, n1, n2, n3].map((n) => fold(n, 31, 50)));
    }
    const comps = [[[0, 0.8], [5, 0.6]], [[2, 0.6], [8, 0.7]], [[5, 0.7], [11, 0.5]], [[0, 0.8], [8, 0.6], [11, 0.4]]];
    tr.comp = [];
    tr.ghost = [];
    for (let b = 0; b < 8; b++) {
      tr.comp.push(comps[(r() * comps.length) | 0]);
      tr.ghost.push(r() < 0.4);
    }
  },
  play(tr, t, bar, i, s) {
    const ch = TABLE_PROG[bar];
    // ride "spang-a-lang" with swung upbeats
    const RIDE = [0.05, 0, 0, 0.065, 0, 0.03, 0.05, 0, 0, 0.065, 0, 0.03];
    if (RIDE[i]) nz(tr.ride, t, RIDE[i], 0.002, 0.07, (s * 0.023) % 0.9);
    if (i === 3 || i === 9) nz(tr.brush, t, 0.09, 0.012, 0.16, (s * 0.041) % 0.9);
    if (i === 0 || i === 6) nz(tr.brush, t, 0.035, 0.06, 0.22, (s * 0.017) % 0.9);
    if (i === 0 || i === 6) kick(tr.out, t, 0.2, 90, 48, 0.2);
    if (i % 3 === 0) {
      const n = tr.walk[bar][i / 3];
      tone(tr.bass, t, { type: 'triangle', f: mtof(n), peak: 0.34, a: 0.008, hold: 0.06, d: 0.42 });
    }
    if (i === 11 && tr.ghost[bar]) tone(tr.bass, t, { type: 'triangle', f: mtof(tr.walk[bar][3]), peak: 0.1, a: 0.005, d: 0.1 });
    const comp = tr.comp[bar];
    for (let h = 0; h < comp.length; h++) {
      if (comp[h][0] !== i) continue;
      for (let n = 0; n < ch.notes.length; n++) epNote(tr.keys, t + n * 0.006, mtof(ch.notes[n]), comp[h][1], 0.38, n >= ch.notes.length - 2);
    }
    if ((bar & 1) && i === 8) {
      const top = fold(ch.notes[ch.notes.length - 1] + 12, 72, 84);
      bellNote(tr.vibe, t, mtof(top), 0.05, 1.0);
    }
  },
};

// --- ARENA: driving synthwave battle loop, 128 bpm, 16th grid, side-chain pump.
const ARENA_PROG = [['A1', 3], ['F1', 4], ['C2', 4], ['G1', 4], ['A1', 3], ['F1', 4], ['D2', 3], ['E2', 4]]
  .map(([n, third]) => {
    const root = fold(nm(n), 33, 45);
    const triad = [0, third, 7];
    return {
      root, third,
      pad: triad.map((x) => fold(root + x, 55, 67)).sort((a, b) => a - b),
      stab: triad.map((x) => fold(root + x, 67, 79)).sort((a, b) => a - b),
    };
  });
const ARP = [0, 12, 7, 12, -1, 12, 7, 12, 0, 12, 7, 12, -1, 12, 7, 19]; // -1 = third + 12
const STABS = [[0, 3, 6, 10, 12], [0, 3, 6, 8, 11, 14], [2, 6, 10, 14], [0, 3, 6, 10]];
const ARENA = {
  bpm: 128, spb: 4, bars: 8, seed: 12812, level: 0.85,
  setup(tr) {
    const r = tr.rng;
    tr.pump = tr.gain(1);
    tr.bass = tr.filter('lowpass', 900, 5, tr.pump);
    tr.pad = tr.filter('lowpass', 1400, 0.6, tr.pump);
    tr.lead = tr.filter('lowpass', 3200, 1.5);
    const send = tr.gain(0.32, tr.echo(tr.stepDur * 3, 0.3, 2400));
    tr.lead.connect(send);
    tr.hat = tr.filter('highpass', 8000, 0.6);
    tr.clap = tr.filter('bandpass', 1500, 0.9);
    tr.crash = tr.filter('highpass', 4500, 0.5);
    tr.cut = [700, 900, 1100, 1500, 800, 1000, 1300, 1800];
    tr.stab = [];
    for (let b = 0; b < 8; b++) tr.stab.push(b === 7 ? STABS[3] : STABS[(r() * 3) | 0]);
    tr.hatV = [];
    for (let s = 0; s < tr.loopSteps; s++) tr.hatV.push(0.025 + r() * 0.025);
  },
  play(tr, t, bar, i, s) {
    const ch = ARENA_PROG[bar];
    if (i === 0) tr.bass.frequency.setTargetAtTime(tr.cut[bar], t, 0.3);
    if (i % 4 === 0) {
      kick(tr.out, t, 0.7, 150, 42, 0.32);
      const p = tr.pump.gain;
      p.setValueAtTime(0.3, t);
      p.linearRampToValueAtTime(1, t + 0.2);
    }
    if (i === 4 || i === 12) nz(tr.clap, t, 0.24, 0.002, 0.13, (s * 0.029) % 0.9);
    if (bar === 7 && i >= 12) nz(tr.clap, t, 0.08 + (i - 12) * 0.04, 0.002, 0.08, (s * 0.019) % 0.9);
    if (i % 4 === 2) nz(tr.hat, t, 0.09, 0.002, 0.09, (s * 0.013) % 0.9);
    else if (i & 1) nz(tr.hat, t, tr.hatV[s], 0.001, 0.025, (s * 0.011) % 0.9);
    if (bar === 0 && i === 0 && tr.step >= tr.loopSteps) nz(tr.crash, t, 0.1, 0.002, 1.1, 0.3);

    const a = ARP[i];
    const n = a < 0 ? ch.root + ch.third + 12 : ch.root + a;
    tone(tr.bass, t, { type: 'sawtooth', f: mtof(n), peak: 0.2, a: 0.003, d: 0.11 });

    if (i === 0) {
      for (let k = 0; k < 3; k++) {
        tone(tr.pad, t, { type: 'sawtooth', f: mtof(ch.pad[k]), detune: (k - 1) * 7, peak: 0.04, a: 0.25, hold: tr.barDur - 0.5, d: 0.5 });
      }
    }
    if (tr.stab[bar].indexOf(i) >= 0) {
      for (let k = 0; k < 3; k++) tone(tr.lead, t, { type: 'square', f: mtof(ch.stab[k]), peak: 0.045, a: 0.003, d: 0.15 });
    }
  },
};

// --- GACHA: shimmering ambient pad with bells, 72 bpm.
const GACHA_PROG = parseProg([
  ['E2', 'G#3 B3 D#4 F#4'], ['C#2', 'E3 G#3 B3 D#4'], ['A1', 'C#4 E4 G#4 D#5'], ['B1', 'E3 F#3 A3 C#4'],
  ['E2', 'G#3 B3 D#4 F#4'], ['G#1', 'F#3 B3 D#4'], ['A1', 'G#3 B3 C#4 E4'], ['B1', 'E3 G#3 C#4 F#4'],
]);
const GACHA = {
  bpm: 72, spb: 4, bars: 8, seed: 72072, level: 1,
  setup(tr) {
    const r = tr.rng;
    tr.pad = tr.filter('lowpass', 1500, 0.3);
    // slow filter shimmer: one LFO for the whole loop
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoAmt = tr.keep(ctx.createGain());
    lfoAmt.gain.value = 500;
    lfo.connect(lfoAmt);
    lfoAmt.connect(tr.pad.frequency);
    lfo.start();
    tr.oscs.push(lfo);
    tr.nodes.push(lfo);
    tr.bells = tr.gain(1);
    tr.bells.connect(tr.echo(tr.stepDur * 2, 0.38, 3000));
    tr.sub = tr.filter('lowpass', 300, 0.5);
    tr.bellPat = [];
    let last = -1;
    for (let b = 0; b < 8; b++) {
      const set = [];
      for (const n of GACHA_PROG[b].notes) { set.push(fold(n + 24, 76, 91)); }
      set.sort((x, y) => x - y);
      for (let i = 0; i < 16; i++) {
        let ev = null;
        if ((b === 3 || b === 7) && i >= 8) {
          ev = { m: set[(i - 8) % set.length] + (i >= 8 + set.length ? 12 : 0), v: 0.35 + (i - 8) * 0.03, run: true };
        } else if (i % 2 === 0 && r() < (i === 0 ? 0.65 : 0.27)) {
          let m = set[(r() * set.length) | 0];
          if (m === last) m = set[(set.indexOf(m) + 1) % set.length];
          last = m;
          ev = { m, v: 0.55 + r() * 0.45 };
        }
        tr.bellPat.push(ev);
      }
    }
  },
  play(tr, t, bar, i, s) {
    const ch = GACHA_PROG[bar];
    if (i === 0) {
      const hold = Math.max(tr.barDur - 1.0, 0.1);
      for (let n = 0; n < ch.notes.length; n++) {
        tone(tr.pad, t, { type: 'triangle', f: mtof(ch.notes[n]), detune: n % 2 ? 6 : -6, peak: 0.055, a: 1.0, hold, d: 1.8 });
      }
      const top = ch.notes[ch.notes.length - 1];
      tone(tr.pad, t, { type: 'sine', f: mtof(top + 12), detune: 9, peak: 0.03, a: 1.2, hold, d: 1.8 });
      tone(tr.sub, t, { type: 'sine', f: mtof(ch.root + 12), peak: 0.12, a: 0.8, hold, d: 1.6 });
    }
    const ev = tr.bellPat[s];
    if (ev) {
      if (ev.run) tone(tr.bells, t, { type: 'sine', f: mtof(ev.m), peak: 0.05 * ev.v, a: 0.003, d: 0.6 });
      else bellNote(tr.bells, t, mtof(ev.m), 0.07 * ev.v, 1.5);
    }
  },
};

const TRACKS = { menu: MENU, table: TABLE, arena: ARENA, gacha: GACHA };

// ---------------------------------------------------------------- scheduler

function shouldRun() { return !!ctx && unlocked && !settings.muted && !isHidden(); }

function tick() {
  if (!ctx) return;
  const now = ctx.currentTime;
  const horizon = now + LOOKAHEAD;
  if (current) current.schedule(now, horizon);
  for (let i = fading.length - 1; i >= 0; i--) {
    const tr = fading[i];
    if (now >= tr.stopAt) { tr.dispose(); fading.splice(i, 1); }
    else tr.schedule(now, Math.min(horizon, tr.stopAt));
  }
  if (!current && !fading.length) stopTimer();
}
function startTimer() {
  if (timer || !shouldRun() || (!current && !fading.length)) return;
  timer = setInterval(tick, TICK_MS);
  tick();
}
function stopTimer() {
  if (timer) { clearInterval(timer); timer = null; }
}

function applyMode() {
  if (!ctx) return;
  const mode = desiredMode;
  if (current && current.mode === mode) return;
  if (!current && !mode) return;
  if (current) { current.fadeOut(); fading.push(current); current = null; }
  while (fading.length > 2) fading.shift().dispose();
  if (mode) {
    try { current = new Track(mode, TRACKS[mode]); current.fadeIn(); } catch (e) { current = null; reportError('track ' + mode, e); }
  }
  startTimer();
}

function rampParam(p, v, dur = 0.08) {
  const now = ctx.currentTime;
  p.cancelScheduledValues(now);
  p.setValueAtTime(p.value, now);
  p.linearRampToValueAtTime(v, now + dur);
}

/** Suspend the context while hidden or muted (saves battery), resume otherwise. */
function updateRun() {
  if (!ctx) return;
  clearTimeout(suspendTimer);
  if (shouldRun()) {
    if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
    rampParam(master.gain, 1);
    startTimer();
  } else {
    rampParam(master.gain, 0);
    stopTimer();
    suspendTimer = setTimeout(() => {
      if (ctx && !shouldRun() && ctx.state === 'running') ctx.suspend().catch(() => {});
    }, 150);
  }
}

function onGesture() {
  // iOS can leave the context 'interrupted'/'suspended' after calls or app switches.
  if (shouldRun() && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
}

// ---------------------------------------------------------------- sfx

function takeToken(name) {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let b = buckets.get(name);
  if (!b) { b = { tok: SFX_BURST, last: now }; buckets.set(name, b); }
  b.tok = Math.min(SFX_BURST, b.tok + ((now - b.last) / 1000) * SFX_RATE);
  b.last = now;
  if (b.tok < 1) return false;
  b.tok -= 1;
  return true;
}

function makeKit(t0, P, out, vol) {
  let echoOut = null;
  const k = {
    end: t0,
    dest(echo) {
      if (!echo) return out;
      if (!echoOut) {
        echoOut = ctx.createGain();
        echoOut.gain.value = vol * 0.5;
        echoOut.connect(sfxEchoIn);
        k.echoOut = echoOut;
      }
      return [out, echoOut];
    },
    mark(e) { if (e > k.end) k.end = e; },
    tone(o, dt = 0, echo = false) {
      k.mark(tone(k.dest(echo), t0 + dt, { ...o, f: o.f * P, f2: o.f2 ? o.f2 * P : 0 }));
    },
    synth(o, dt = 0, echo = false) {
      const lp = o.lp ? o.lp.map((x) => x * P) : undefined;
      k.mark(synth(k.dest(echo), t0 + dt, { ...o, f: o.f * P, f2: o.f2 ? o.f2 * P : 0, lp }));
    },
    noise(o, dt = 0, echo = false) {
      k.mark(noise(k.dest(echo), t0 + dt, { ...o, f: (o.f || 1000) * P, f2: o.f2 ? o.f2 * P : 0 }));
    },
    bursts(o, dt = 0) { k.mark(bursts(out, t0 + dt, { ...o, f: o.f * P })); },
    bell(f, dt = 0, peak = 0.12, d = 0.8, echo = true) {
      k.tone({ type: 'sine', f, peak, a: 0.002, d }, dt, echo);
      k.tone({ type: 'sine', f: f * 2.76, peak: peak * 0.3, a: 0.001, d: d * 0.35 }, dt, echo);
    },
    brass(f, dt, dur, peak = 0.07, detune = 0) {
      k.synth({ type: 'sawtooth', f, detune, peak, a: 0.03, hold: Math.max(dur - 0.15, 0), d: 0.22, q: 1.2, lp: [f * 1.2, Math.min(f * 7, 9000), f * 2.5] }, dt);
    },
  };
  return k;
}

const F = (s) => mtof(nm(s));

const SFX = {
  tap(k) { k.tone({ type: 'sine', f: 1150, f2: 720, glide: 0.04, peak: 0.2, a: 0.002, d: 0.06 }); },
  hover(k) { k.tone({ type: 'sine', f: 2300, peak: 0.045, a: 0.003, d: 0.035 }); },
  card(k) {
    k.noise({ ftype: 'bandpass', f: 4200, f2: 1800, q: 1.2, peak: 0.32, a: 0.004, d: 0.07 });
    k.tone({ type: 'triangle', f: 520, f2: 380, peak: 0.05, a: 0.002, d: 0.04 });
  },
  cardPlay(k) {
    k.tone({ type: 'sine', f: 190, f2: 70, glide: 0.1, peak: 0.5, a: 0.002, d: 0.14 });
    k.noise({ ftype: 'bandpass', f: 2800, q: 0.9, peak: 0.28, a: 0.002, d: 0.05 });
    k.tone({ type: 'triangle', f: 880, peak: 0.05, a: 0.002, d: 0.12 }, 0.02);
  },
  shuffle(k) {
    const times = [], peaks = [];
    for (let i = 0; i < 10; i++) { times.push(i * 0.042 + Math.random() * 0.008); peaks.push(0.3 - i * 0.012); }
    k.bursts({ ftype: 'bandpass', f: 3200, q: 1.1, jitter: 0.3, d: 0.03, times, peaks });
    k.tone({ type: 'sine', f: 170, f2: 90, peak: 0.22, a: 0.002, d: 0.1 }, 0.44);
  },
  diceRoll(k) {
    const times = [], peaks = [];
    let t = 0, i = 0;
    while (t < 0.55 && i < 18) { times.push(t); peaks.push(0.34 * (1 - t * 1.1)); t += 0.03 + Math.random() * 0.05 * (1 + t * 2); i++; }
    k.bursts({ ftype: 'bandpass', f: 1800, q: 3, jitter: 0.45, d: 0.024, times, peaks });
    k.noise({ ftype: 'lowpass', f: 500, peak: 0.07, a: 0.05, d: 0.45 });
  },
  diceLand(k) {
    k.tone({ type: 'sine', f: 160, f2: 55, glide: 0.08, peak: 0.55, a: 0.001, d: 0.12 });
    k.noise({ ftype: 'bandpass', f: 1400, q: 1.5, peak: 0.24, a: 0.001, d: 0.035 });
    k.tone({ type: 'triangle', f: 1300, peak: 0.05, a: 0.001, d: 0.03 });
  },
  rare(k) {
    ['C6', 'E6', 'G6', 'C7', 'E7'].forEach((n, i) => k.bell(F(n), i * 0.055, 0.13, 0.5));
    k.noise({ ftype: 'highpass', f: 7000, peak: 0.05, a: 0.02, d: 0.5 }, 0.05);
  },
  doubleDose(k) {
    [0, 0.2].forEach((dt, h) => {
      const base = nm(h ? 'D4' : 'A3');
      k.tone({ type: 'sine', f: h ? 120 : 100, f2: 38, glide: 0.35, peak: 0.7, a: 0.002, d: 0.45 }, dt);
      [0, 7, 12, 16].forEach((x, j) => k.synth({ type: 'sawtooth', f: mtof(base + x), detune: (j - 1.5) * 6, peak: 0.06, a: 0.005, hold: 0.08, d: 0.5, q: 2, lp: [500, 5000, 900] }, dt));
      k.noise({ ftype: 'highpass', f: 3500, peak: 0.16, a: 0.002, d: 0.7 }, dt);
    });
    k.bell(F('E6'), 0.36, 0.1, 0.9);
    k.bell(F('A6'), 0.44, 0.08, 0.9);
  },
  trade(k) {
    k.tone({ type: 'triangle', f: 520, f2: 880, glide: 0.12, peak: 0.15, a: 0.005, d: 0.16 });
    k.tone({ type: 'triangle', f: 880, f2: 520, glide: 0.12, peak: 0.15, a: 0.005, d: 0.16 }, 0.1);
    k.noise({ ftype: 'bandpass', f: 1500, f2: 4000, q: 1, peak: 0.07, a: 0.05, d: 0.12 });
    k.bell(1760, 0.22, 0.07, 0.3);
  },
  reveal(k) {
    k.noise({ ftype: 'bandpass', f: 300, f2: 3500, glide: 0.7, q: 2, peak: 0.13, a: 0.65, d: 0.12 });
    k.tone({ type: 'sine', f: F('D2'), peak: 0.28, a: 0.4, hold: 0.3, d: 1.2 });
    k.tone({ type: 'triangle', f: F('D3'), peak: 0.08, a: 0.4, hold: 0.3, d: 1.1 });
    k.tone({ type: 'triangle', f: F('D4'), detune: -8, peak: 0.06, a: 0.5, hold: 0.2, d: 1.2 }, 0, true);
    k.tone({ type: 'triangle', f: F('G#4'), detune: 8, peak: 0.05, a: 0.5, hold: 0.2, d: 1.2 }, 0, true);
    k.bell(F('D6'), 0.7, 0.11, 1.4);
    k.bell(F('A6'), 0.78, 0.07, 1.2);
  },
  edict(k) {
    const seq = [[0, 0.12, ['G4', 'C5']], [0.16, 0.12, ['G4', 'C5']], [0.32, 0.6, ['C5', 'E5', 'G5']]];
    for (const [dt, dur, notes] of seq) notes.forEach((n, j) => k.brass(F(n), dt, dur, 0.065, (j - 1) * 5));
    k.tone({ type: 'sine', f: 95, f2: 60, glide: 0.3, peak: 0.35, a: 0.003, d: 0.5 }, 0.32);
  },
  summon(k) {
    k.noise({ ftype: 'bandpass', f: 250, f2: 3000, glide: 0.5, q: 1.5, peak: 0.22, a: 0.35, d: 0.25 });
    k.tone({ type: 'sine', f: 300, f2: 1200, glide: 0.5, peak: 0.05, a: 0.3, d: 0.2 });
    ['C5', 'G5', 'C6', 'E6', 'G6'].forEach((n, i) => k.bell(F(n), 0.25 + i * 0.07, 0.11, 0.6));
  },
  hit(k) {
    k.tone({ type: 'sine', f: 240, f2: 70, glide: 0.07, peak: 0.55, a: 0.001, d: 0.09 });
    k.noise({ ftype: 'bandpass', f: 1800, q: 0.8, peak: 0.33, a: 0.001, d: 0.05 });
  },
  crit(k) {
    k.tone({ type: 'sine', f: 180, f2: 40, glide: 0.16, peak: 0.85, a: 0.001, d: 0.22 });
    k.tone({ type: 'square', f: 120, f2: 60, peak: 0.07, a: 0.001, d: 0.08 });
    k.noise({ ftype: 'lowpass', f: 3500, peak: 0.42, a: 0.001, d: 0.12 });
    k.tone({ type: 'sine', f: 2093, peak: 0.09, a: 0.002, d: 0.6 }, 0.01, true);
    k.tone({ type: 'sine', f: 3136, peak: 0.045, a: 0.002, d: 0.45 }, 0.01);
  },
  dodge(k) { k.noise({ ftype: 'bandpass', f: 900, f2: 4500, glide: 0.14, q: 2.5, peak: 0.24, a: 0.06, d: 0.1 }); },
  heal(k) {
    ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => k.tone({ type: 'triangle', f: F(n), peak: 0.085, a: 0.01, d: 0.35 }, i * 0.06, true));
    k.tone({ type: 'sine', f: 400, f2: 800, glide: 0.4, peak: 0.06, a: 0.15, d: 0.3 });
    k.noise({ ftype: 'highpass', f: 6000, peak: 0.03, a: 0.1, d: 0.3 });
  },
  death(k) {
    k.synth({ type: 'sawtooth', f: 330, f2: 55, glide: 0.7, peak: 0.13, a: 0.01, hold: 0.1, d: 0.7, lp: [1200, 1400, 200] });
    k.tone({ type: 'sine', f: 120, f2: 40, peak: 0.4, a: 0.002, d: 0.5 });
    k.noise({ ftype: 'lowpass', f: 600, peak: 0.14, a: 0.002, d: 0.4 });
  },
  projectile(k) {
    k.tone({ type: 'triangle', f: 1400, f2: 350, glide: 0.13, peak: 0.11, a: 0.003, d: 0.13 });
    k.noise({ ftype: 'highpass', f: 3000, peak: 0.04, a: 0.002, d: 0.06 });
  },
  roundWin(k) {
    ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => {
      const last = i === 3;
      k.tone({ type: 'triangle', f: F(n), peak: 0.12, a: 0.005, d: last ? 0.6 : 0.2 }, [0, 0.08, 0.16, 0.26][i]);
      k.tone({ type: 'sine', f: F(n) * 2, peak: 0.035, a: 0.003, d: last ? 0.5 : 0.15 }, [0, 0.08, 0.16, 0.26][i], last);
    });
  },
  roundLose(k) {
    k.tone({ type: 'triangle', f: F('G4'), peak: 0.13, a: 0.01, d: 0.3 });
    k.tone({ type: 'triangle', f: F('Eb4'), peak: 0.13, a: 0.01, d: 0.3 }, 0.2);
    k.tone({ type: 'triangle', f: F('C4'), f2: F('C4') * 0.97, glide: 0.9, peak: 0.13, a: 0.01, d: 0.9 }, 0.4);
    k.tone({ type: 'sine', f: F('C3'), peak: 0.15, a: 0.02, d: 0.8 }, 0.4);
  },
  matchWin(k) {
    const mel = [['G4', 0, 0.1], ['C5', 0.12, 0.1], ['E5', 0.24, 0.1], ['G5', 0.36, 0.3], ['E5', 0.7, 0.12], ['G5', 0.84, 0.9]];
    for (const [n, dt, dur] of mel) k.brass(F(n), dt, dur, 0.09);
    ['C4', 'E4', 'G4'].forEach((n, j) => k.brass(F(n), 0.36, 1.3, 0.045, (j - 1) * 6));
    for (const dt of [0.36, 0.84]) {
      k.noise({ ftype: 'highpass', f: 4000, peak: 0.14, a: 0.002, d: 0.9 }, dt);
      k.tone({ type: 'sine', f: 100, f2: 55, glide: 0.3, peak: 0.4, a: 0.002, d: 0.45 }, dt);
    }
    ['C7', 'E7', 'G7'].forEach((n, i) => k.tone({ type: 'sine', f: F(n), peak: 0.05, a: 0.002, d: 0.4 }, 0.9 + i * 0.05, true));
  },
  pull(k) {
    k.synth({ type: 'sawtooth', f: 110, f2: 880, glide: 1.0, peak: 0.07, a: 0.9, d: 0.15, lp: [400, 1200, 4000] });
    k.tone({ type: 'sine', f: 220, f2: 1760, glide: 1.0, peak: 0.07, a: 0.9, d: 0.12 });
    k.noise({ ftype: 'bandpass', f: 400, f2: 6000, glide: 1.0, q: 1.5, peak: 0.13, a: 0.95, d: 0.1 });
    const times = [], peaks = [];
    let t = 0, gap = 0.14;
    while (t < 1.0) { times.push(t); peaks.push(0.02 + t * 0.05); t += gap; gap = Math.max(gap * 0.82, 0.03); }
    k.bursts({ ftype: 'highpass', f: 5000, q: 0.7, d: 0.02, times, peaks });
  },
  pull4(k) {
    k.tone({ type: 'sine', f: 100, f2: 45, glide: 0.3, peak: 0.5, a: 0.002, d: 0.4 });
    ['A4', 'B4', 'C5', 'E5'].forEach((n, j) => k.tone({ type: 'triangle', f: F(n), detune: (j - 1.5) * 6, peak: 0.05, a: 0.02, hold: 0.3, d: 0.9 }, 0, true));
    ['E5', 'A5', 'B5', 'E6'].forEach((n, i) => k.bell(F(n), 0.05 + i * 0.07, 0.11, 0.7));
    k.noise({ ftype: 'highpass', f: 6000, peak: 0.06, a: 0.02, d: 0.7 });
  },
  pull5(k) {
    k.tone({ type: 'sine', f: 90, f2: 35, glide: 0.5, peak: 0.9, a: 0.002, d: 0.7 });
    k.noise({ ftype: 'highpass', f: 3000, peak: 0.28, a: 0.002, d: 1.4 });
    ['C4', 'G4', 'C5', 'E5'].forEach((n, j) => k.synth({ type: 'sawtooth', f: F(n), detune: (j - 1.5) * 6, peak: 0.055, a: 0.01, hold: 0.5, d: 0.8, q: 1.2, lp: [600, 6000, 1500] }));
    ['C6', 'D6', 'E6', 'G6', 'A6', 'C7', 'D7', 'E7', 'G7'].forEach((n, i) => k.tone({ type: 'sine', f: F(n), peak: 0.08, a: 0.002, d: 0.6 }, 0.08 + i * 0.045, true));
    k.noise({ ftype: 'highpass', f: 8000, peak: 0.07, a: 0.3, d: 1.2 }, 0.2);
    k.bell(F('C7'), 0.5, 0.08, 1.2);
  },
  error(k) {
    k.synth({ type: 'square', f: 190, peak: 0.12, a: 0.003, hold: 0.06, d: 0.04, lp: [1400, 1400, 900] });
    k.synth({ type: 'square', f: 150, peak: 0.12, a: 0.003, hold: 0.08, d: 0.05, lp: [1400, 1400, 900] }, 0.12);
  },
  coin(k) {
    k.tone({ type: 'square', f: 988, peak: 0.06, a: 0.002, hold: 0.05, d: 0.02 });
    k.tone({ type: 'square', f: 1319, peak: 0.06, a: 0.002, hold: 0.07, d: 0.3 }, 0.07, true);
  },
};

// ---------------------------------------------------------------- public API

export const audio = {
  /** Call from a user gesture (pointerdown/click/keydown). Idempotent. */
  unlock() {
    if (!ctx && !initContext()) return Promise.resolve(false);
    if (!unlocked) {
      unlocked = true;
      try {
        // Old iOS: a silent buffer played inside the gesture unlocks output.
        const b = ctx.createBufferSource();
        b.buffer = ctx.createBuffer(1, 1, 22050);
        b.connect(ctx.destination);
        b.start(0);
      } catch { /* */ }
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', updateRun);
        for (const ev of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(ev, onGesture, { capture: true, passive: true });
      }
    }
    // Resume inside the gesture even if muted, so iOS marks the context unlocked.
    const p = ctx.state !== 'running' ? ctx.resume().catch(() => {}) : Promise.resolve();
    updateRun();
    applyMode();
    return p.then(() => true);
  },

  /** 'menu' | 'table' | 'arena' | 'gacha' | null. Crossfades ~1.2 s. */
  music(mode) {
    const m = mode == null ? null : String(mode);
    if (m !== null && !TRACKS[m]) { console.warn('[audio] unknown music mode', mode); return; }
    desiredMode = m;
    if (ctx && unlocked) applyMode();
  },

  /** Play a one-shot. opts: { pitch: semitones, vol: 0..1 }. Returns true if it played. */
  sfx(name, opts) {
    if (!ctx || !unlocked || settings.muted || isHidden() || ctx.state === 'closed') return false;
    const fn = SFX[name];
    if (!fn) return false;
    const vol = clamp01(opts && Number.isFinite(opts.vol) ? opts.vol : 1);
    if (vol <= 0) return false;
    const now = ctx.currentTime;
    while (sfxVoices.length && sfxVoices[0] <= now) sfxVoices.shift();
    if (sfxVoices.length >= MAX_SFX_VOICES) return false;
    if (!takeToken(name)) return false;
    const pitch = opts && Number.isFinite(opts.pitch) ? Math.max(-24, Math.min(24, opts.pitch)) : 0;
    const P = Math.pow(2, pitch / 12);
    const out = ctx.createGain();
    out.gain.value = vol;
    out.connect(sfxBus);
    const t0 = now + 0.005;
    const k = makeKit(t0, P, out, vol);
    try { fn(k); } catch (e) { reportError('sfx ' + name, e); }
    const end = Math.max(k.end, t0 + 0.05);
    let i = sfxVoices.length;
    while (i > 0 && sfxVoices[i - 1] > end) i--;
    sfxVoices.splice(i, 0, end);
    setTimeout(() => {
      try { out.disconnect(); if (k.echoOut) k.echoOut.disconnect(); } catch { /* */ }
    }, (end - now + 0.3) * 1000);
    return true;
  },

  setMuted(on) {
    settings.muted = !!on;
    saveSettings();
    updateRun();
  },
  get muted() { return settings.muted; },

  /** { music?: 0..1, sfx?: 0..1 } (partial updates allowed). */
  setVolume(v) {
    if (!v || typeof v !== 'object') return;
    if (Number.isFinite(v.music)) settings.music = clamp01(v.music);
    if (Number.isFinite(v.sfx)) settings.sfx = clamp01(v.sfx);
    saveSettings();
    if (ctx) {
      musicBus.gain.setTargetAtTime(settings.music * MUSIC_LEVEL, ctx.currentTime, 0.04);
      sfxBus.gain.setTargetAtTime(settings.sfx * SFX_LEVEL, ctx.currentTime, 0.04);
    }
  },
  get volume() { return { music: settings.music, sfx: settings.sfx }; },
  get mode() { return desiredMode; },
  get unlocked() { return unlocked; },
  get context() { return ctx; },
  /** Names accepted by sfx() and music(). */
  sfxNames: Object.keys(SFX),
  musicModes: Object.keys(TRACKS),

  /** Dev/test hook: engine internals. Not part of the game-facing API. */
  _debug() {
    return {
      state: ctx ? ctx.state : 'none',
      mode: current ? current.mode : null,
      fading: fading.length,
      sfxVoices: sfxVoices.length,
      timer: !!timer,
      master,
    };
  },
};

export default audio;

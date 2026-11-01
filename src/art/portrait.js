// Triple Dose — procedural anime portrait art.
// portraitSVG(girlIdOrObject, { variant: 'bust'|'splash'|'chibi', bg: true|false, theme: [c1, c2] })
// returns a self-contained SVG string. All ids are unique per call.
//
// The character is drawn in a canonical coordinate space: head centre ~(0,0),
// face spans x -76..76, chin at y 96, shoulders at y ~150. Each variant places
// that space into its own viewBox.

import { GIRLS, SUITS, BANNERS } from '../../shared/data.js';
import { mixColor, suitGlyph } from './icons.js';

let COUNTER = 0;

const mix = mixColor;
const lighten = (c, t) => mixColor(c, '#ffffff', t);
const darken = (c, t) => mixColor(c, '#000000', t);
const f = (n) => (Math.round(n * 10) / 10).toString();

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function luminance(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
function star4(cx, cy, r, w = 0.22) {
  const k = r * w;
  return `M${f(cx)},${f(cy - r)} Q${f(cx + k)},${f(cy - k)} ${f(cx + r)},${f(cy)} Q${f(cx + k)},${f(cy + k)} ${f(cx)},${f(cy + r)} Q${f(cx - k)},${f(cy + k)} ${f(cx - r)},${f(cy)} Q${f(cx - k)},${f(cy - k)} ${f(cx)},${f(cy - r)}Z`;
}

const DEFAULT_LOOK = {
  hair: '#6b4bff', hair2: '#ff8fc7', hairStyle: 'long', eyes: '#6b4bff', skin: '#ffe6d6',
  outfit: '#26203a', accent: '#ffd166', accessory: null, mood: 'smile',
};

// Outfit cut per girl (fallback: hash of the id).
const OUTFITS = ['hoodie', 'blazer', 'mandarin', 'sailor'];
const OUTFIT_OF = {
  rin: 'hoodie', yuki: 'hoodie', pia: 'hoodie',
  mireille: 'blazer', aya: 'blazer', tess: 'blazer',
  selene: 'mandarin', vera: 'mandarin',
  lumi: 'sailor', kiki: 'sailor', nao: 'sailor',
};

const MOODS = {
  //        lid  brow: [innerY, peakY, outerY]  raise right brow
  smirk: { lid: 5, brow: [-16, -22, -17], raiseR: 5, mouth: 'smirk' },
  calm:  { lid: 9, brow: [-15, -20, -16], raiseR: 0, mouth: 'calm' },
  grin:  { lid: 0, brow: [-21, -26, -20], raiseR: 0, mouth: 'grin' },
  sly:   { lid: 11, brow: [-14, -21, -19], raiseR: 2, mouth: 'sly' },
  stern: { lid: 7, brow: [-9, -17, -19], raiseR: 0, mouth: 'stern' },
  smile: { lid: 2, brow: [-19, -24, -19], raiseR: 0, mouth: 'smile' },
};

function resolveGirl(girl) {
  if (typeof girl === 'string') {
    const g = GIRLS[girl];
    return { key: girl, g: g || { name: girl, look: {} } };
  }
  const g = girl || {};
  const key = g.id || g.key || (Object.keys(GIRLS).find((k) => GIRLS[k] === g)) || g.name || 'girl';
  return { key, g };
}

function themeFor(key, g, look) {
  const b = BANNERS.find((x) => x.featured === key);
  if (b) return b.theme;
  const sc = SUITS[g.suit]?.color || look.accent;
  return [sc, darken(look.outfit, 0.2)];
}

// ---------------------------------------------------------------- palette
function palette(look) {
  const hairMid = mix(look.hair, look.hair2, 0.5);
  const darkHair = luminance(look.hair) < 0.2;
  return {
    ...look,
    hairLine: darkHair ? '#07060c' : darken(mix(hairMid, '#3a1840', 0.35), 0.55),
    hairBack: darken(mix(look.hair, look.hair2, 0.3), darkHair ? 0.1 : 0.22),
    hairShade: darkHair ? lighten(look.hair, 0.12) : darken(mix(look.hair, look.hair2, 0.4), 0.18),
    hairHi: darkHair ? mix(look.hair2, '#ffffff', 0.35) : lighten(look.hair, 0.75),
    skinShade: mix(look.skin, '#d9837a', 0.33),
    skinLine: mix(darken(look.skin, 0.55), '#7a2e3a', 0.4),
    blush: '#ff6f86',
    lash: darken(mix(look.hair, '#2a1030', 0.75), 0.55),
    outfitLine: darken(look.outfit, 0.55),
    outfitHi: lighten(look.outfit, 0.18),
    accentLine: darken(look.accent, 0.5),
  };
}

// ---------------------------------------------------------------- hair shapes
// Front fringe: alternating notch/tip points from right to left.
const FRINGES = {
  twintails: { pts: [[80, -28], [74, 14], [62, -30], [50, -6], [36, -36], [22, -8], [8, -40], [-6, 2], [-14, -38], [-30, -10], [-42, -34], [-56, -4], [-64, -28], [-76, 16], [-80, -28]], bend: 0 },
  long:      { pts: [[80, -26], [76, 30], [64, -30], [50, -2], [32, -40], [14, -6], [0, -50], [-14, -6], [-32, -40], [-50, -2], [-64, -30], [-76, 30], [-80, -26]], bend: 0 },
  ponytail:  { pts: [[80, -28], [76, 10], [66, -32], [56, -4], [42, -40], [26, -10], [12, -44], [-6, -6], [-18, -40], [-36, -12], [-48, -38], [-64, -6], [-70, -30], [-78, 12], [-80, -28]], bend: -5 },
  hime:      { pts: [[80, -34], [72, -26], [56, -30], [40, -28], [24, -30], [8, -28], [-8, -30], [-24, -28], [-40, -30], [-56, -28], [-72, -26], [-80, -34]], bend: 0, blunt: true },
  bob:       { pts: [[80, -26], [78, 18], [66, -26], [54, -2], [40, -30], [26, -6], [10, -32], [-4, -4], [-18, -32], [-32, -6], [-46, -30], [-58, -2], [-68, -26], [-78, 18], [-80, -26]], bend: 0 },
  side:      { pts: [[80, -40], [78, -4], [68, -44], [62, -10], [48, -48], [36, -14], [20, -50], [0, -14], [-12, -46], [-30, -2], [-44, -34], [-60, 6], [-68, -24], [-78, 22], [-80, -26]], bend: -9 },
};

function frontHairPath(style) {
  const fr = FRINGES[style] || FRINGES.long;
  let d = 'M-80,-26 C-98,-76 -58,-128 0,-128 C58,-128 98,-76 80,-26';
  const pts = fr.pts;
  d += ` L${pts[0][0]},${pts[0][1]}`;
  if (fr.blunt) {
    // straight-cut fringe with slight wave
    for (let i = 1; i < pts.length; i++) d += ` Q${f((pts[i - 1][0] + pts[i][0]) / 2)},${f(Math.max(pts[i - 1][1], pts[i][1]) + 3)} ${pts[i][0]},${pts[i][1]}`;
  } else {
    for (let i = 1; i + 1 < pts.length; i += 2) {
      const n0 = pts[i - 1], t = pts[i], n1 = pts[i + 1];
      const b = fr.bend;
      d += ` Q${f(n0[0] + (t[0] - n0[0]) * 0.15 + b)},${f(n0[1] + (t[1] - n0[1]) * 0.8)} ${t[0]},${t[1]}`;
      d += ` Q${f(n1[0] + (t[0] - n1[0]) * 0.3 + b)},${f(n1[1] + (t[1] - n1[1]) * 0.55)} ${n1[0]},${n1[1]}`;
    }
  }
  return d + ' Z';
}

// strand lines inside the fringe for texture
function fringeStrands(style) {
  const fr = FRINGES[style] || FRINGES.long;
  if (fr.blunt) {
    let s = '';
    for (let x = -64; x <= 64; x += 16) s += `M${x * 0.8},-80 Q${x * 0.95},-56 ${x},-32 `;
    return s;
  }
  let s = '';
  for (let i = 1; i < fr.pts.length; i += 2) {
    const t = fr.pts[i];
    const top = [t[0] * 0.6, -92];
    s += `M${f(top[0])},${top[1]} Q${f(t[0] * 0.95 + fr.bend)},${f((top[1] + t[1]) / 2)} ${f(t[0] + (t[0] > 0 ? -3 : 3))},${t[1] - 10} `;
  }
  return s;
}

// side locks (in front of face), mirrored
function sideLock(style) {
  switch (style) {
    case 'hime': return 'M-80,-34 C-86,10 -86,50 -84,92 L-62,92 C-64,50 -66,20 -64,-28 Z';
    case 'bob': return 'M-80,-30 C-90,10 -86,56 -66,86 C-62,72 -60,40 -58,-6 Z';
    case 'twintails': return 'M-80,-30 C-88,10 -84,52 -72,84 C-68,60 -64,30 -60,-10 Z';
    case 'ponytail': return 'M-80,-30 C-86,4 -84,40 -76,70 C-70,44 -66,20 -62,-10 Z';
    case 'side': return 'M-80,-30 C-90,20 -88,74 -80,118 C-70,80 -66,30 -60,-14 Z';
    default: return 'M-80,-30 C-90,24 -90,84 -84,140 C-72,96 -66,40 -58,-12 Z';
  }
}

// back hair layer (behind head and body)
function backHair(style, B) {
  const L = Math.min(B, 330);
  switch (style) {
    case 'long':
      return `M-84,-70 C-110,-10 -118,80 -132,170 C-140,230 -150,${L - 30} -142,${L} L-118,${L - 18} L-100,${L + 4} L-76,${L - 14} L-44,${L - 8} L0,${L - 20} L44,${L - 8} L76,${L - 14} L100,${L + 4} L118,${L - 18} L142,${L} C150,${L - 30} 140,230 132,170 C118,80 110,-10 84,-70 C60,-120 -60,-120 -84,-70 Z`;
    case 'hime':
      return `M-86,-70 C-104,-20 -106,60 -108,150 L-110,${L - 10} L110,${L - 10} L108,150 C106,60 104,-20 86,-70 C60,-120 -60,-120 -86,-70 Z`;
    case 'bob':
      return 'M-88,-60 C-110,-10 -110,60 -92,96 C-80,112 -60,104 -48,96 L48,96 C60,104 80,112 92,96 C110,60 110,-10 88,-60 C60,-120 -60,-120 -88,-60 Z';
    case 'side':
      return 'M-86,-64 C-104,-10 -104,70 -94,120 L94,120 C104,70 104,-10 86,-64 C60,-120 -60,-120 -86,-64 Z';
    default: // twintails / ponytail: short back
      return 'M-86,-64 C-102,-10 -100,50 -88,80 L88,80 C100,50 102,-10 86,-64 C60,-120 -60,-120 -86,-64 Z';
  }
}

function tails(style, P, ids) {
  const stroke = `stroke="${P.hairLine}" stroke-width="2.4" stroke-linejoin="round"`;
  if (style === 'twintails') {
    const tail = 'M78,-86 C120,-104 160,-60 162,10 C164,80 150,160 134,230 C130,250 122,262 112,270 C122,240 124,214 120,190 C112,220 100,236 90,246 C104,200 110,150 108,100 C106,50 96,10 80,-40 Z';
    const strands = 'M96,-70 C130,-40 140,40 128,150 M110,-50 C124,0 124,80 116,180';
    const one = `<path d="${tail}" fill="url(#${ids}hb)" ${stroke}/><path d="${strands}" fill="none" stroke="${P.hairLine}" stroke-width="1.6" opacity=".45"/><path d="M120,-78 C146,-56 152,-10 150,30" fill="none" stroke="${P.hairHi}" stroke-width="5" stroke-linecap="round" opacity=".5"/>`;
    return `<g>${one}</g><g transform="scale(-1,1)">${one}</g>`;
  }
  if (style === 'ponytail') {
    return `<path d="M40,-110 C90,-150 150,-120 160,-50 C170,20 160,100 150,170 C146,196 136,214 124,226 C132,190 132,160 128,130 C118,160 108,180 96,190 C112,140 118,90 112,40 C106,-10 84,-60 40,-90 Z" fill="url(#${ids}hb)" ${stroke}/>
<path d="M70,-118 C120,-120 146,-60 140,40 M60,-96 C100,-80 124,-20 120,80" fill="none" stroke="${P.hairLine}" stroke-width="1.6" opacity=".45"/>
<path d="M98,-126 C134,-118 152,-80 154,-36" fill="none" stroke="${P.hairHi}" stroke-width="5" stroke-linecap="round" opacity=".5"/>`;
  }
  return '';
}

// tie / scrunchie for tails
function tailTies(style, P) {
  const tie = (x, y, r) => `<g transform="translate(${x},${y}) rotate(${r})"><rect x="-9" y="-12" width="18" height="24" rx="7" fill="${P.accent}" stroke="${P.accentLine}" stroke-width="2"/><rect x="-6" y="-9" width="4" height="18" rx="2" fill="${lighten(P.accent, 0.5)}" opacity=".7"/></g>`;
  if (style === 'twintails') return tie(84, -80, -30) + tie(-84, -80, 30);
  if (style === 'ponytail') return tie(54, -114, -50);
  return '';
}

// side-tail (in front of the body) for the 'side' style
function sideTail(P, ids) {
  return `<path d="M-74,8 C-110,30 -122,90 -118,150 C-116,190 -124,230 -136,262 C-110,246 -98,214 -96,180 C-90,214 -96,240 -104,260 C-72,232 -70,190 -74,150 C-80,100 -76,60 -56,30 Z" fill="url(#${ids}hb)" stroke="${P.hairLine}" stroke-width="2.4" stroke-linejoin="round"/>
<path d="M-90,40 C-108,80 -108,140 -102,200 M-76,50 C-90,100 -88,160 -84,220" fill="none" stroke="${P.hairLine}" stroke-width="1.5" opacity=".45"/>
<path d="M-104,60 C-112,90 -112,120 -110,150" fill="none" stroke="${P.hairHi}" stroke-width="4.5" stroke-linecap="round" opacity=".5"/>
<g transform="translate(-78,22) rotate(28)"><rect x="-13" y="-8" width="26" height="16" rx="6" fill="${P.accent}" stroke="${P.accentLine}" stroke-width="2"/><circle cx="0" cy="0" r="3.5" fill="${lighten(P.accent, 0.6)}"/></g>`;
}

// glossy "angel ring" highlight band
function hiBand(style) {
  const y0 = style === 'side' ? -84 : -80;
  let top = `M-66,${y0 + 14} Q0,${y0 - 30} 66,${y0 + 14}`;
  const n = 11;
  let bottom = '';
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    const x = -60 + 120 * t;
    const yb = y0 + 24 - 26 * Math.sin(Math.PI * t) + (i % 2 ? 8 : -2);
    bottom += ` L${f(x)},${f(yb)}`;
  }
  return top + bottom + ' Z';
}

// ---------------------------------------------------------------- face parts
function eyeShapes(lid) {
  const l = lid;
  const white = `M-21,${f(-6 + l * 0.5)} C-16,${f(-24 + l)} 12,${f(-29 + l)} 24,${f(-14 + l * 0.7)} C27,4 19,24 3,26 C-12,26 -21,12 -21,${f(-6 + l * 0.5)} Z`;
  const lash = `M-24,${f(-3 + l * 0.5)} C-18,${f(-25 + l)} 12,${f(-33 + l)} 27,${f(-16 + l * 0.7)} L33,${f(-21 + l * 0.7)} L29,${f(-8 + l * 0.7)} C17,${f(-23 + l)} -12,${f(-22 + l)} -21,${f(1 + l * 0.5)} Z`;
  const shade = `M-21,${f(-6 + l * 0.5)} C-16,${f(-24 + l)} 12,${f(-29 + l)} 24,${f(-14 + l * 0.7)} L24,${f(-2 + l * 0.6)} C12,${f(-14 + l)} -10,${f(-12 + l)} -21,${f(4 + l * 0.5)} Z`;
  const crease = `M-14,${f(-30 + l)} C0,${f(-37 + l)} 14,${f(-36 + l)} 24,${f(-27 + l * 0.8)}`;
  return { white, lash, shade, crease };
}

function eyePair(P, ids, mood, hideLeft) {
  const m = MOODS[mood] || MOODS.smile;
  const S = eyeShapes(m.lid);
  const ex = 38, ey = 20;
  const one = `<path d="${S.white}" fill="#fffaf7"/>
<g clip-path="url(#${ids}ec)">
<ellipse cx="2" cy="4" rx="15.5" ry="21" fill="url(#${ids}ir)" stroke="${darken(P.eyes, 0.55)}" stroke-width="1.5"/>
<ellipse cx="2" cy="13" rx="10" ry="8" fill="${lighten(P.eyes, 0.55)}" opacity=".55"/>
<ellipse cx="2" cy="5" rx="7" ry="10" fill="${darken(P.eyes, 0.7)}"/>
<path d="${S.shade}" fill="${darken(P.eyes, 0.5)}" opacity=".35"/>
</g>
<path d="${S.lash}" fill="${P.lash}"/>
<path d="M4,26 C13,25 19,19 22,11" fill="none" stroke="${P.lash}" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>
<path d="${S.crease}" fill="none" stroke="${P.skinLine}" stroke-width="1.5" stroke-linecap="round" opacity=".45"/>`;
  const hl = (cx) => `<ellipse cx="${cx - 6}" cy="${ey - 4 + m.lid * 0.4}" rx="5.5" ry="6" fill="#fff"/><circle cx="${cx + 6}" cy="${ey + 13}" r="2.6" fill="#fff" opacity=".9"/>`;
  let s = `<g transform="translate(${ex},${ey})">${one}</g>${hl(ex + 2)}`;
  if (!hideLeft) s += `<g transform="translate(${-ex},${ey}) scale(-1,1)">${one}</g>${hl(-ex - 2)}`;
  return s;
}

function brows(P, mood) {
  const m = MOODS[mood] || MOODS.smile;
  const [iy, py, oy] = m.brow;
  const one = (r) => `M14,${iy - r} Q30,${py - 3 - r} 54,${oy - r} Q32,${py + 1 - r} 14,${iy + 3 - r} Z`;
  const c = darken(mix(P.hair, P.hairLine, 0.5), 0.15);
  return `<path d="${one(m.raiseR)}" fill="${c}" stroke="${c}" stroke-width="1.2" stroke-linejoin="round"/><path d="${one(0)}" transform="scale(-1,1)" fill="${c}" stroke="${c}" stroke-width="1.2" stroke-linejoin="round"/>`;
}

function mouth(P, mood) {
  const m = (MOODS[mood] || MOODS.smile).mouth;
  const line = P.skinLine;
  const dark = mix('#7a1f35', P.skinLine, 0.3);
  const st = `stroke="${line}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"`;
  switch (m) {
    case 'smirk':
      return `<path d="M-9,74 Q2,78 13,70" fill="none" ${st}/><path d="M12,67 Q15,70 13,73" fill="none" stroke="${line}" stroke-width="1.6" stroke-linecap="round"/>`;
    case 'calm':
      return `<path d="M-7,74 Q0,77 7,74" fill="none" ${st}/>`;
    case 'grin':
      return `<path d="M-15,70 Q0,74 15,70 Q11,88 0,89 Q-11,88 -15,70 Z" fill="${dark}" ${st}/><path d="M-13,71 Q0,74.5 13,71 L12,75 Q0,77.5 -12,75 Z" fill="#fff"/><path d="M-7,84 Q0,79 7,84 Q4,88 0,88 Q-4,88 -7,84 Z" fill="#ff8a9e"/>`;
    case 'sly':
      return `<path d="M-10,72 Q-5,77 0,73 Q5,77 10,72" fill="none" ${st}/><path d="M11,71 Q13,69 12,67" fill="none" stroke="${line}" stroke-width="1.5" stroke-linecap="round"/>`;
    case 'stern':
      return `<path d="M-8,76 Q0,74 8,76" fill="none" ${st}/>`;
    default: // smile
      return `<path d="M-10,71 Q0,75 10,71 Q7,82 0,82 Q-7,82 -10,71 Z" fill="${dark}" ${st}/><path d="M-5,79 Q0,76 5,79 Q3,82 0,82 Q-3,82 -5,79 Z" fill="#ff8a9e"/>`;
  }
}

// ---------------------------------------------------------------- body / outfit
function body(P, ids, cut, B, splash) {
  const sil = `M-24,116 C-46,130 -92,134 -124,150 C-154,165 -166,200 -170,${B} L170,${B} C166,200 154,165 124,150 C92,134 46,130 24,116 Z`;
  const ol = `stroke="${P.outfitLine}" stroke-width="2.4" stroke-linejoin="round"`;
  const acc = P.accent;
  let s = `<path d="${sil}" fill="url(#${ids}of)" ${ol}/>`;
  // arm / torso fold shading
  s += `<path d="M-118,190 C-112,240 -110,300 -112,${B} M118,190 C112,240 110,300 112,${B}" fill="none" stroke="${P.outfitLine}" stroke-width="2" opacity=".6"/>`;
  s += `<path d="M124,150 C150,164 164,200 170,${B} L134,${B} C134,240 130,190 124,150 Z" fill="${P.outfitLine}" opacity=".28"/>`;
  if (splash) {
    s += `<path d="M-100,${B} C-96,330 -90,300 -84,290 M100,${B} C96,330 90,300 84,290" fill="none" stroke="${P.outfitLine}" stroke-width="2" opacity=".5"/>`;
  }
  const shirt = mix('#f7f2f6', P.accent, 0.08);
  switch (cut) {
    case 'hoodie': {
      s += `<path d="M-70,134 C-60,104 60,104 70,134 C52,156 -52,156 -70,134 Z" fill="${P.outfitHi}" ${ol}/>`;
      s += `<path d="M-30,118 C-30,140 30,140 30,118 L30,140 C14,152 -14,152 -30,140 Z" fill="${darken(P.outfit, 0.2)}"/>`;
      s += `<path d="M0,146 L0,${B}" stroke="${acc}" stroke-width="4"/><path d="M0,146 L0,${B}" stroke="${P.accentLine}" stroke-width="1" stroke-dasharray="2 3"/>`;
      s += `<rect x="-4" y="150" width="8" height="16" rx="3" fill="${lighten(acc, 0.3)}" stroke="${P.accentLine}" stroke-width="1.5"/>`;
      s += `<path d="M-16,146 C-18,170 -20,190 -22,212 M16,146 C18,170 20,190 22,212" fill="none" stroke="${lighten(acc, 0.2)}" stroke-width="3" stroke-linecap="round"/>`;
      s += `<circle cx="-22" cy="214" r="4" fill="${acc}"/><circle cx="22" cy="214" r="4" fill="${acc}"/>`;
      s += `<path d="M-124,150 C-150,164 -162,196 -166,240 M124,150 C150,164 162,196 166,240" fill="none" stroke="${acc}" stroke-width="5" opacity=".9"/>`;
      break;
    }
    case 'blazer': {
      s += `<path d="M-26,118 L0,232 L26,118 Z" fill="${shirt}" stroke="${P.outfitLine}" stroke-width="1.6"/>`;
      s += `<path d="M-6,146 L6,146 L10,214 L0,228 L-10,214 Z" fill="${acc}" stroke="${P.accentLine}" stroke-width="1.6"/><path d="M-7,138 L7,138 L6,148 L-6,148 Z" fill="${darken(acc, 0.15)}" stroke="${P.accentLine}" stroke-width="1.5"/>`;
      s += `<path d="M-24,114 L-6,150 L0,134 Z M24,114 L6,150 L0,134 Z" fill="#fff" stroke="${P.outfitLine}" stroke-width="1.6" stroke-linejoin="round"/>`;
      const lapel = `M-28,120 L-56,148 L-42,160 L-54,170 L-6,262 L-2,250 L-22,146 Z`;
      s += `<path d="${lapel}" fill="${P.outfitHi}" ${ol}/><path d="${lapel}" transform="scale(-1,1)" fill="${P.outfitHi}" ${ol}/>`;
      s += `<path d="M-56,148 L-42,160 L-54,170" fill="none" stroke="${acc}" stroke-width="2.5"/><path d="M56,148 L42,160 L54,170" fill="none" stroke="${acc}" stroke-width="2.5"/>`;
      s += `<circle cx="0" cy="266" r="4.5" fill="${acc}" stroke="${P.accentLine}" stroke-width="1.4"/>`;
      break;
    }
    case 'mandarin': {
      s += `<path d="M-30,104 L-32,134 C-12,142 12,142 32,134 L30,104 C12,112 -12,112 -30,104 Z" fill="${P.outfitHi}" ${ol}/>`;
      s += `<path d="M-32,132 C-12,140 12,140 32,132" fill="none" stroke="${acc}" stroke-width="3"/><path d="M-30,106 C-12,113 12,113 30,106" fill="none" stroke="${acc}" stroke-width="2.5"/>`;
      s += `<path d="M2,140 C26,144 52,154 70,176 C60,200 46,212 30,220" fill="none" stroke="${acc}" stroke-width="3.5" stroke-linecap="round"/>`;
      for (const [x, y] of [[26, 146], [52, 160], [56, 196]]) {
        s += `<path d="M${x - 9},${y} H${x + 9}" stroke="${lighten(acc, 0.3)}" stroke-width="3" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="3.4" fill="${acc}" stroke="${P.accentLine}" stroke-width="1.2"/>`;
      }
      s += `<path d="M-124,150 C-100,140 -60,132 -32,130 M124,150 C100,140 60,132 32,130" fill="none" stroke="${acc}" stroke-width="2.5" opacity=".85"/>`;
      s += `<path d="M-40,180 Q-60,196 -48,214 Q-36,200 -40,180 Z" fill="${acc}" opacity=".5"/><path d="M-62,206 Q-80,214 -74,232 Q-60,224 -62,206 Z" fill="${acc}" opacity=".35"/>`;
      break;
    }
    default: { // sailor
      const top = mix(P.outfit, '#ffffff', 0.86);
      s += `<path d="${sil}" fill="${top}" ${ol}/>`;
      s += `<path d="M124,150 C150,164 164,200 170,${B} L134,${B} C134,240 130,190 124,150 Z" fill="${mix(top, P.outfit, 0.25)}"/>`;
      s += `<path d="M-118,190 C-112,240 -110,300 -112,${B} M118,190 C112,240 110,300 112,${B}" fill="none" stroke="${mix(top, P.outfit, 0.4)}" stroke-width="2"/>`;
      const col = 'M-24,116 L-98,140 L-120,160 L-94,190 L0,236 L94,190 L120,160 L98,140 L24,116 L0,176 Z';
      s += `<path d="${col}" fill="${P.outfit}" ${ol}/>`;
      s += `<path d="M-104,154 L-90,180 L0,224 L90,180 L104,154" fill="none" stroke="${acc}" stroke-width="3"/><path d="M-98,148 L-84,172 L0,214 L84,172 L98,148" fill="none" stroke="${acc}" stroke-width="2" opacity=".75"/>`;
      s += `<path d="M0,212 L-26,206 L-30,226 L0,222 L30,226 L26,206 Z" fill="${acc}" stroke="${P.accentLine}" stroke-width="1.8" stroke-linejoin="round"/>`;
      s += `<path d="M-6,220 L-18,262 L-6,256 L0,266 L6,256 L18,262 L6,220 Z" fill="${acc}" stroke="${P.accentLine}" stroke-width="1.8" stroke-linejoin="round"/><circle cx="0" cy="216" r="7" fill="${darken(acc, 0.12)}" stroke="${P.accentLine}" stroke-width="1.8"/>`;
    }
  }
  return s;
}

// ---------------------------------------------------------------- accessories
function accessory(kind, P, ids, layer) {
  const a = P.accent, al = P.accentLine;
  const back = layer === 'back', face = layer === 'face', front = layer === 'front';
  switch (kind) {
    case 'catEars': {
      if (!back) return '';
      const ear = `<path d="M-90,-62 L-86,-150 L-34,-112 Z" fill="url(#${ids}hf)" stroke="${P.hairLine}" stroke-width="2.4" stroke-linejoin="round"/><path d="M-80,-80 L-80,-132 L-48,-108 Z" fill="#ffb3c7"/><path d="M-80,-120 L-70,-100" stroke="${P.hairLine}" stroke-width="1.4" opacity=".5"/>`;
      return `<g>${ear}</g><g transform="scale(-1,1)">${ear}</g>`;
    }
    case 'eyepatch':
      if (!face) return '';
      return `<path d="M-86,-6 L-56,6 M-20,4 L72,-44" stroke="#1b1720" stroke-width="4" stroke-linecap="round"/>
<path d="M-64,2 C-62,-10 -16,-12 -14,4 C-14,32 -24,46 -39,46 C-56,46 -66,30 -64,2 Z" fill="#221c28" stroke="#0c0a10" stroke-width="2"/>
<path d="M-58,2 C-50,-4 -26,-4 -20,4" fill="none" stroke="#5a4c66" stroke-width="2" opacity=".7"/>
<path d="${star4(-39, 20, 10)}" fill="${a}"/>`;
    case 'scar':
      if (!face) return '';
      return `<g stroke="${mix(P.skinLine, '#c0485a', 0.4)}" stroke-linecap="round" fill="none"><path d="M-64,36 L-34,64" stroke-width="3"/><path d="M-58,36 L-62,46 M-50,44 L-55,53 M-42,52 L-47,61" stroke-width="1.8"/></g><path d="M-63,35 L-35,63" stroke="#fff" stroke-width="1" opacity=".45"/>`;
    case 'headphones':
      if (!front) return '';
      return `<path d="M-92,8 C-104,-92 -60,-142 0,-142 C60,-142 104,-92 92,8" fill="none" stroke="${darken(P.outfit, 0.2)}" stroke-width="12" stroke-linecap="round"/>
<path d="M-92,8 C-104,-92 -60,-142 0,-142 C60,-142 104,-92 92,8" fill="none" stroke="${a}" stroke-width="5" stroke-linecap="round"/>
${[-1, 1].map((k) => `<g transform="translate(${k * 92},14)"><rect x="-17" y="-28" width="34" height="56" rx="15" fill="${darken(P.outfit, 0.1)}" stroke="${darken(P.outfit, 0.6)}" stroke-width="2.4"/><rect x="${k > 0 ? -2 : -12}" y="-20" width="14" height="40" rx="7" fill="${a}" stroke="${al}" stroke-width="1.6"/><circle cx="${k * 5 - 0}" cy="0" r="3.4" fill="#fff"/><path d="M${k > 0 ? 4 : -10},-14 v10" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".6"/></g>`).join('')}`;
    case 'pearls': {
      if (!front) return '';
      let s = '';
      for (let i = 0; i <= 14; i++) {
        const t = Math.PI * (i / 14);
        const x = -40 * Math.cos(t), y = 122 + 26 * Math.sin(t);
        s += `<circle cx="${f(x)}" cy="${f(y)}" r="4.6" fill="#fdf8ff" stroke="${darken(a, 0.35)}" stroke-width="1.2"/><circle cx="${f(x - 1.4)}" cy="${f(y - 1.6)}" r="1.4" fill="#fff"/>`;
      }
      return s + `<path d="M0,148 l7,10 l-7,12 l-7,-12 Z" fill="${a}" stroke="${al}" stroke-width="1.5"/><path d="M0,151 l3,7 l-3,6" fill="none" stroke="#fff" stroke-width="1.2" opacity=".8"/>`;
    }
    case 'goggles':
      if (!front) return '';
      return `<path d="M-90,-48 C-80,-96 80,-96 90,-48" fill="none" stroke="${darken(P.outfit, 0.3)}" stroke-width="12" stroke-linecap="round"/>
<path d="M-12,-92 Q0,-98 12,-92" stroke="${darken(P.outfit, 0.4)}" stroke-width="6" fill="none"/>
${[-1, 1].map((k) => `<g transform="translate(${k * 32},-88)"><circle r="23" fill="#d7dbe4" stroke="#3c4252" stroke-width="2.4"/><circle r="17" fill="url(#${ids}gl)" stroke="${al}" stroke-width="2"/><path d="M-9,-8 Q-4,-13 4,-12" stroke="#fff" stroke-width="3.5" stroke-linecap="round" fill="none"/><circle cx="7" cy="7" r="2" fill="#fff" opacity=".8"/></g>`).join('')}`;
    case 'crescent':
      if (!front) return '';
      return `<g transform="translate(-60,-86) rotate(-20) scale(1.25)"><circle r="20" fill="#fff6d0" opacity=".18"/><path d="M0,-22 A22,22 0 1,0 0,22 A15,15 0 1,1 0,-22 Z" fill="url(#${ids}gd)" stroke="#8a5a12" stroke-width="2"/><path d="M-4,26 L-4,44" stroke="#c9a14a" stroke-width="1.5"/><path d="${star4(-4, 50, 7)}" fill="#ffe9a6" stroke="#8a5a12" stroke-width="1"/><circle cx="-14" cy="-6" r="2.5" fill="#fff" opacity=".8"/></g>`;
    case 'hairpin':
      if (!front) return '';
      return `<g transform="translate(56,-50)">${[-30, 30].map((r) => `<rect x="-20" y="-3.5" width="40" height="7" rx="3.5" transform="rotate(${r})" fill="${a}" stroke="${al}" stroke-width="1.8"/>`).join('')}<circle r="5.5" fill="${lighten(a, 0.5)}" stroke="${al}" stroke-width="1.6"/></g>`;
    case 'halo':
      if (!front) return '';
      return `<ellipse cx="0" cy="-150" rx="60" ry="14" fill="none" stroke="${lighten(a, 0.4)}" stroke-width="14" opacity=".22"/>
<ellipse cx="0" cy="-150" rx="60" ry="14" fill="none" stroke="${lighten(a, 0.7)}" stroke-width="5.5"/>
<ellipse cx="0" cy="-150" rx="60" ry="14" fill="none" stroke="#fff" stroke-width="1.8"/>
<path d="${star4(52, -164, 8)}" fill="#fff"/>`;
    case 'ribbon':
      if (!front) return '';
      return `<g transform="translate(58,-98) rotate(18)">
<path d="M0,0 C-8,-30 -40,-30 -40,-6 C-40,14 -14,12 0,0 Z M0,0 C8,-30 40,-30 40,-6 C40,14 14,12 0,0 Z" fill="${a}" stroke="${al}" stroke-width="2.2" stroke-linejoin="round"/>
<path d="M0,0 L-14,34 L-6,30 L-2,38 L4,6 Z M0,0 L16,32 L8,30 L4,36 L-2,6 Z" fill="${darken(a, 0.12)}" stroke="${al}" stroke-width="2" stroke-linejoin="round"/>
<path d="M-6,-4 C-14,-18 -30,-20 -32,-8 M6,-4 C14,-18 30,-20 32,-8" fill="none" stroke="${darken(a, 0.25)}" stroke-width="1.6"/>
<rect x="-7" y="-8" width="14" height="15" rx="5" fill="${lighten(a, 0.2)}" stroke="${al}" stroke-width="2"/></g>`;
    case 'whistle':
      if (!front) return '';
      return `<path d="M-22,122 C-20,160 -8,186 4,200 M22,122 C20,160 14,186 8,200" fill="none" stroke="${a}" stroke-width="3"/>
<g transform="translate(8,210) rotate(-18)"><path d="M-12,-8 H16 Q22,-8 22,-2 V2 H8 A12,12 0 1,1 -12,-8 Z" fill="#e6ebf2" stroke="#4a5262" stroke-width="2"/><circle cx="-3" cy="4" r="4" fill="#4a5262"/><path d="M-10,-4 H14" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="-8" cy="-10" r="3" fill="none" stroke="${a}" stroke-width="2"/></g>`;
    default:
      return '';
  }
}

// ---------------------------------------------------------------- the character
function character(P, ids, look, key, B, mode) {
  const style = look.hairStyle;
  const cut = OUTFIT_OF[key] || OUTFITS[hashStr(String(key)) % OUTFITS.length];
  const splash = mode === 'splash';
  const hl = `stroke="${P.hairLine}" stroke-width="2.4" stroke-linejoin="round"`;
  const sl = `stroke="${P.skinLine}" stroke-width="2.2" stroke-linejoin="round"`;
  const face = 'M-76,-40 C-78,10 -70,46 -44,72 C-28,88 -12,96 0,96 C12,96 28,88 44,72 C70,46 78,10 76,-40 C70,-100 -70,-100 -76,-40 Z';
  const front = frontHairPath(style);
  const lock = sideLock(style);
  const hideLeft = look.accessory === 'eyepatch';
  let s = '';

  // defs local to character
  s += `<defs>
<clipPath id="${ids}fc"><path d="${face}"/></clipPath>
<clipPath id="${ids}hc"><path d="${front}"/></clipPath>
<clipPath id="${ids}ec"><path d="${eyeShapes((MOODS[look.mood] || MOODS.smile).lid).white}"/></clipPath>
</defs>`;

  // back hair + tails
  s += `<path d="${backHair(style, B)}" fill="url(#${ids}hb)" ${hl}/>`;
  if (style === 'long' || style === 'hime') {
    const L = Math.min(B, 330);
    s += `<path d="M-100,0 C-110,80 -120,180 -124,${L - 30} M100,0 C110,80 120,180 124,${L - 30} M-60,40 C-70,120 -76,200 -70,${L - 40} M60,40 C70,120 76,200 70,${L - 40}" fill="none" stroke="${P.hairLine}" stroke-width="1.6" opacity=".4"/>`;
  }
  s += tails(style, P, ids);
  s += accessory(look.accessory, P, ids, 'back');

  // neck + body
  s += `<path d="M-22,60 L-24,128 C-10,138 10,138 24,128 L22,60 Z" fill="${P.skin}" ${sl}/>`;
  s += `<path d="M-24,60 L24,60 L24,104 Q0,120 -24,104 Z" fill="${P.skinShade}"/>`;
  s += body(P, ids, cut, B, splash);
  // re-draw neck base over collar for cuts that open at the neck
  if (cut === 'blazer' || cut === 'sailor') s += `<path d="M-22,96 L-24,124 L0,150 L24,124 L22,96 Z" fill="${P.skin}"/><path d="M-24,124 L0,150 L24,124" fill="none" ${sl}/><path d="M-22,96 L-24,124 M22,96 L24,124" fill="none" ${sl}/><path d="M-24,98 L24,98 L24,108 Q0,122 -24,108 Z" fill="${P.skinShade}"/>`;

  // suit badge on chest
  if (mode !== 'chibi') s += `<g transform="translate(${cut === 'mandarin' ? -70 : 66},${cut === 'sailor' ? 196 : 186}) scale(.42) translate(-32,-32)" opacity=".95">${suitGlyph(look._suit || 'bloom', P.accent, { ink: P.outfitLine })}</g>`;

  // ears
  s += `<path d="M72,-2 C88,-8 92,16 84,30 C80,38 74,40 70,36 Z" fill="${P.skin}" ${sl}/><path d="M-72,-2 C-88,-8 -92,16 -84,30 C-80,38 -74,40 -70,36 Z" fill="${P.skin}" ${sl}/>`;
  s += `<path d="M76,8 C84,8 84,22 78,28 M-76,8 C-84,8 -84,22 -78,28" fill="none" stroke="${P.skinShade}" stroke-width="2.5"/>`;

  // face
  s += `<path d="${face}" fill="url(#${ids}sk)" ${sl}/>`;
  // hair shadow on face
  s += `<g clip-path="url(#${ids}fc)"><path d="${front}" transform="translate(1,6)" fill="${P.skinShade}" opacity=".6"/><path d="${lock}" transform="translate(8,4)" fill="${P.skinShade}" opacity=".7"/><path d="${lock}" transform="scale(-1,1) translate(8,4)" fill="${P.skinShade}" opacity=".7"/></g>`;
  // blush
  s += `<ellipse cx="-46" cy="50" rx="14" ry="6.5" fill="${P.blush}" opacity=".32"/><ellipse cx="46" cy="50" rx="14" ry="6.5" fill="${P.blush}" opacity=".32"/>`;
  s += `<path d="M-52,48 l-3,5 M-46,48 l-3,5 M-40,48 l-3,5 M52,48 l-3,5 M46,48 l-3,5 M40,48 l-3,5" stroke="${mix(P.blush, P.skinLine, 0.4)}" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>`;
  // eyes, brows, nose, mouth
  s += eyePair(P, ids, look.mood, hideLeft);
  s += brows(P, look.mood);
  s += `<path d="M3,52 Q6,57 1,59" fill="none" stroke="${P.skinLine}" stroke-width="1.8" stroke-linecap="round" opacity=".7"/>`;
  s += mouth(P, look.mood);
  s += accessory(look.accessory, P, ids, 'face');

  // side tail in front of body
  if (style === 'side') s += sideTail(P, ids);

  // front hair
  s += `<path d="${lock}" fill="url(#${ids}hf)" ${hl}/>`;
  s += `<path d="${lock}" transform="scale(-1,1)" fill="url(#${ids}hf)" ${hl}/>`;
  s += `<path d="${front}" fill="url(#${ids}hf)" ${hl}/>`;
  s += `<g clip-path="url(#${ids}hc)">
<path d="M10,-140 C70,-120 104,-60 96,10 L70,10 C78,-40 60,-96 10,-140 Z" fill="${P.hairShade}" opacity=".45"/>
<path d="${hiBand(style)}" fill="${P.hairHi}" opacity=".6"/>
<path d="${fringeStrands(style)}" fill="none" stroke="${P.hairLine}" stroke-width="1.5" opacity=".4"/>
</g>`;
  s += `<path d="M-74,-14 C-80,20 -80,50 -78,80 M74,-14 C80,20 80,50 78,80" fill="none" stroke="${P.hairHi}" stroke-width="3" stroke-linecap="round" opacity=".35"/>`;
  s += tailTies(style, P);
  s += accessory(look.accessory, P, ids, 'front');
  return s;
}

// ---------------------------------------------------------------- backgrounds
function bokeh(r, n, W, H, c, maxR = 40) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r() * H, rad = 4 + r() * maxR, o = 0.06 + r() * 0.2;
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rad)}" fill="${c}" opacity="${f(o * 100) / 100}"${r() > 0.6 ? ` stroke="${c}" stroke-width="1.5" fill-opacity=".25"` : ''}/>`;
  }
  return s;
}
function sparkles(r, n, W, H, c) {
  let s = '';
  for (let i = 0; i < n; i++) s += `<path d="${star4(r() * W, r() * H, 4 + r() * 10)}" fill="${c}" opacity="${f((0.4 + r() * 0.6) * 100) / 100}"/>`;
  return s;
}

function splashBg(ids, theme, suit, r) {
  const [c1, c2] = theme;
  const light = lighten(c1, 0.55);
  let rays = '';
  const cx = 300, cy = 260;
  for (let i = 0; i < 14; i++) {
    const a0 = (i / 14) * Math.PI * 2 + 0.1, w = 0.07 + (i % 3) * 0.035;
    const R = 1100;
    rays += `M${cx},${cy} L${f(cx + R * Math.cos(a0))},${f(cy + R * Math.sin(a0))} L${f(cx + R * Math.cos(a0 + w))},${f(cy + R * Math.sin(a0 + w))} Z `;
  }
  return `<defs>
<linearGradient id="${ids}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(c2, c1, 0.45)}"/><stop offset=".55" stop-color="${c2}"/><stop offset="1" stop-color="${darken(c2, 0.55)}"/></linearGradient>
<radialGradient id="${ids}gw" cx="300" cy="300" r="380" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${light}" stop-opacity=".85"/><stop offset=".35" stop-color="${c1}" stop-opacity=".55"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></radialGradient>
<linearGradient id="${ids}fd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${darken(c2, 0.6)}" stop-opacity="0"/><stop offset="1" stop-color="${darken(c2, 0.6)}" stop-opacity=".95"/></linearGradient>
<linearGradient id="${ids}rb" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c1}" stop-opacity="0"/><stop offset=".5" stop-color="${c1}" stop-opacity=".35"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></linearGradient>
</defs>
<rect width="600" height="900" fill="url(#${ids}bg)"/>
<path d="${rays}" fill="${light}" opacity=".08"/>
<path d="M-50,520 L650,250 L650,350 L-50,620 Z" fill="url(#${ids}rb)" opacity=".7"/>
<path d="M-50,640 L650,390 L650,410 L-50,660 Z" fill="${c1}" opacity=".18"/>
<circle cx="300" cy="300" r="380" fill="url(#${ids}gw)"/>
<g transform="translate(300,330) scale(6.6) translate(-32,-32)" opacity=".13">${suitGlyph(suit, light, { ink: light, strokeWidth: 1 })}</g>
<circle cx="300" cy="300" r="250" fill="none" stroke="${light}" stroke-width="2" opacity=".3"/>
<circle cx="300" cy="300" r="274" fill="none" stroke="${light}" stroke-width="1.2" stroke-dasharray="3 9" opacity=".45"/>
${bokeh(r, 22, 600, 900, light, 46)}
${sparkles(r, 10, 600, 760, '#ffffff')}`;
}

// ---------------------------------------------------------------- main
export function portraitSVG(girlIdOrObject, opts = {}) {
  const { key, g } = resolveGirl(girlIdOrObject);
  const look = { ...DEFAULT_LOOK, ...(g.look || {}) };
  if (!['twintails', 'long', 'ponytail', 'hime', 'bob', 'side'].includes(look.hairStyle)) look.hairStyle = 'long';
  look._suit = g.suit || 'bloom';
  const variant = opts.variant || 'bust';
  const showBg = opts.bg !== false;
  const theme = opts.theme || themeFor(key, g, look);
  const ids = `td${(++COUNTER).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const P = palette(look);
  const r = rng(hashStr(String(key) + variant));

  const B = variant === 'splash' ? 400 : variant === 'chibi' ? 160 : 290;
  const shared = `<defs>
<linearGradient id="${ids}hf" x1="0" y1="-130" x2="0" y2="${Math.min(B, 330)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${P.hair}"/><stop offset=".42" stop-color="${mix(P.hair, P.hair2, 0.45)}"/><stop offset="1" stop-color="${P.hair2}"/></linearGradient>
<linearGradient id="${ids}hb" x1="0" y1="-130" x2="0" y2="${Math.min(B, 330)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${P.hairBack}"/><stop offset=".5" stop-color="${darken(mix(P.hair, P.hair2, 0.6), 0.2)}"/><stop offset="1" stop-color="${darken(P.hair2, 0.12)}"/></linearGradient>
<linearGradient id="${ids}sk" x1="0" y1="-60" x2="0" y2="96" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${lighten(P.skin, 0.25)}"/><stop offset="1" stop-color="${P.skin}"/></linearGradient>
<linearGradient id="${ids}ir" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${darken(P.eyes, 0.55)}"/><stop offset=".5" stop-color="${P.eyes}"/><stop offset="1" stop-color="${lighten(P.eyes, 0.45)}"/></linearGradient>
<linearGradient id="${ids}of" x1="0" y1="110" x2="0" y2="${B}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${P.outfitHi}"/><stop offset="1" stop-color="${darken(P.outfit, 0.25)}"/></linearGradient>
<linearGradient id="${ids}gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${lighten(P.accent, 0.6)}"/><stop offset="1" stop-color="${darken(P.accent, 0.2)}"/></linearGradient>
<linearGradient id="${ids}gd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2b8"/><stop offset=".5" stop-color="#ffcc4d"/><stop offset="1" stop-color="#c58a1a"/></linearGradient>
</defs>`;

  let W, H, bgMarkup = '', place;
  if (variant === 'splash') {
    W = 600; H = 900;
    place = 'translate(300,318) scale(1.5)';
    if (showBg) bgMarkup = splashBg(ids, theme, look._suit, r);
  } else if (variant === 'chibi') {
    W = 120; H = 120;
    place = 'translate(60,68) scale(.4)';
    if (showBg) bgMarkup = `<defs><radialGradient id="${ids}cb" cx=".5" cy=".4" r=".65"><stop offset="0" stop-color="${lighten(theme[0], 0.35)}"/><stop offset="1" stop-color="${theme[1]}"/></radialGradient></defs><circle cx="60" cy="60" r="58" fill="url(#${ids}cb)" stroke="${theme[0]}" stroke-width="3"/>`;
  } else {
    W = 400; H = 480;
    place = 'translate(200,206)';
    if (showBg) {
      const [c1, c2] = theme;
      bgMarkup = `<defs><radialGradient id="${ids}bb" cx="200" cy="190" r="340" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${lighten(c1, 0.35)}"/><stop offset=".45" stop-color="${mix(c1, c2, 0.5)}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs>
<rect width="400" height="480" fill="url(#${ids}bb)"/>
<g transform="translate(318,96) scale(2.4) translate(-32,-32)" opacity=".16">${suitGlyph(look._suit, '#ffffff', { ink: '#ffffff', strokeWidth: 1 })}</g>
${bokeh(r, 9, 400, 480, lighten(c1, 0.6), 28)}${sparkles(r, 4, 400, 300, '#fff')}`;
    }
  }

  let ch = `<g transform="${place}">${character(P, ids, look, key, B, variant)}</g>`;
  if (variant === 'chibi') {
    ch = `<defs><clipPath id="${ids}cc"><circle cx="60" cy="60" r="${showBg ? 58 : 60}"/></clipPath></defs><g clip-path="url(#${ids}cc)">${ch}</g>`;
  }
  let fg = '';
  if (variant === 'splash' && showBg) {
    fg = `<rect y="640" width="600" height="260" fill="url(#${ids}fd)"/>${sparkles(r, 6, 600, 900, lighten(theme[0], 0.7))}`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${shared}${bgMarkup}${ch}${fg}</svg>`;
}

export const PORTRAIT_VARIANTS = ['bust', 'splash', 'chibi'];

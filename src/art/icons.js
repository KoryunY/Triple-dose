// Triple Dose — UI icon art (procedural SVG strings).
// All icons use viewBox 0 0 64 64 unless noted, and are designed to read at 20–64px.

import { SUITS, DICE_FACES, PERSONAS, STAT_LABELS } from '../../shared/data.js';

let UID = 0;
const uid = (p) => `${p}${(++UID).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------------------------------------------------------------- color utils
function hex2rgb(h) {
  h = String(h).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgb2hex(a) {
  return '#' + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
export function mixColor(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  return rgb2hex(A.map((v, i) => v + (B[i] - v) * t));
}
const lighten = (c, t) => mixColor(c, '#ffffff', t);
const darken = (c, t) => mixColor(c, '#000000', t);

const svg = (inner, vb = '0 0 64 64', extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" ${extra}>${inner}</svg>`;

function starPoints(cx, cy, n, ro, ri, rot = -90) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? ri : ro;
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

// ---------------------------------------------------------------- suits

/** Inner markup (64x64 space) of a suit glyph. Exported for the portrait backgrounds. */
export function suitGlyph(suitId, color, opts = {}) {
  const c = color || SUITS[suitId]?.color || '#ffffff';
  const ink = opts.ink || darken(c, 0.55);
  const hi = lighten(c, 0.55);
  const sw = opts.strokeWidth ?? 2.5;
  const st = `stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"`;
  switch (suitId) {
    case 'blade':
      return `<g transform="rotate(45 32 32)">
<path d="M32,3 L37.5,12 L37,40 L27,40 L26.5,12 Z" fill="${lighten(c, 0.7)}" ${st}/>
<path d="M32,6 L32,38" stroke="${c}" stroke-width="2.5"/>
<rect x="18" y="39" width="28" height="6" rx="3" fill="${c}" ${st}/>
<rect x="29" y="45" width="6" height="11" rx="1.5" fill="${darken(c, 0.25)}" ${st}/>
<circle cx="32" cy="58.5" r="3.6" fill="${c}" ${st}/></g>`;
    case 'ember':
      return `<path d="M32,3 C40,15 53,23 51,40 C50,52 42,61 32,61 C22,61 13,53 13,42 C13,32 19,26 24,17 C26,25 28,29 32,31 C35,23 30,13 32,3 Z" fill="${c}" ${st}/>
<path d="M32,30 C38,38 43,44 41,51 C40,56 36,59 32,59 C27,59 23,55 23,50 C23,43 29,38 32,30 Z" fill="${lighten(c, 0.5)}"/>
<path d="M32,42 C35,46 37,49 36,53 C35,56 33,57 32,57 C30,57 28,55 28,53 C28,49 30,46 32,42 Z" fill="#fff6d6"/>`;
    case 'tide':
      return `<path d="M32,3 C40,17 53,29 53,42 C53,53 44,61 32,61 C20,61 11,53 11,42 C11,29 24,17 32,3 Z" fill="${c}" ${st}/>
<path d="M15,44 Q21.5,37 28,44 T41,44 T52,42 C51,52 43,59 32,59 C22,59 15,53 15,44 Z" fill="${darken(c, 0.2)}"/>
<path d="M15,44 Q21.5,37 28,44 T41,44 T52,42" fill="none" stroke="${hi}" stroke-width="2.5" stroke-linecap="round"/>
<path d="M22,30 C24,24 27,20 29,17" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".8"/>`;
    case 'gale':
      return `<g fill="none" stroke-linecap="round">
<path d="M6,24 H38 C47,24 51,16 46,11 C41,6 33,9 34,16" stroke="${ink}" stroke-width="${7 + sw}"/>
<path d="M6,36 H48 C57,36 59,47 52,51 C46,55 39,50 42,44" stroke="${ink}" stroke-width="${7 + sw}"/>
<path d="M12,48 H30" stroke="${ink}" stroke-width="${7 + sw}"/>
<path d="M6,24 H38 C47,24 51,16 46,11 C41,6 33,9 34,16" stroke="${c}" stroke-width="7"/>
<path d="M6,36 H48 C57,36 59,47 52,51 C46,55 39,50 42,44" stroke="${c}" stroke-width="7"/>
<path d="M12,48 H30" stroke="${c}" stroke-width="7"/>
<path d="M10,23 H30" stroke="${hi}" stroke-width="2"/></g>`;
    case 'bloom': {
      let petals = '';
      for (let i = 0; i < 5; i++) {
        petals += `<ellipse cx="32" cy="17" rx="10" ry="14" transform="rotate(${i * 72} 32 33)" fill="${c}" ${st}/>`;
      }
      let inner = '';
      for (let i = 0; i < 5; i++) {
        inner += `<ellipse cx="32" cy="21" rx="4" ry="7" transform="rotate(${i * 72} 32 33)" fill="${hi}" opacity=".7"/>`;
      }
      return `${petals}${inner}<circle cx="32" cy="33" r="7.5" fill="#ffe08a" ${st}/><circle cx="30" cy="31" r="2.2" fill="#fff"/>`;
    }
    default:
      return `<circle cx="32" cy="32" r="20" fill="${c}" ${st}/>`;
  }
}

export function suitIcon(suitId) {
  return svg(suitGlyph(suitId));
}

// ---------------------------------------------------------------- dice faces

const GOLD = '#ffd166';

function rareFrame(id) {
  return {
    defs: `<radialGradient id="${id}g"><stop offset="0" stop-color="#ffe9a6" stop-opacity=".75"/><stop offset=".6" stop-color="${GOLD}" stop-opacity=".25"/><stop offset="1" stop-color="${GOLD}" stop-opacity="0"/></radialGradient>
<linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".5" stop-color="${GOLD}"/><stop offset="1" stop-color="#b8860b"/></linearGradient>`,
    back: `<circle cx="32" cy="32" r="31" fill="url(#${id}g)"/>`,
    front: `<circle cx="32" cy="32" r="29.5" fill="none" stroke="url(#${id}r)" stroke-width="2.5"/>
<polygon points="${starPoints(54, 10, 4, 6, 1.6)}" fill="#fff6d0"/><polygon points="${starPoints(9, 50, 4, 4, 1.2)}" fill="#fff6d0"/>`,
  };
}

export function diceFaceIcon(faceId) {
  const id = uid('df');
  const rare = !!DICE_FACES[faceId]?.rare;
  const ink = '#2a1b2e';
  let body = '';
  switch (faceId) {
    case 'ash':
      body = `<line x1="9" y1="53" x2="46" y2="30" stroke="${ink}" stroke-width="10.5" stroke-linecap="round"/>
<line x1="10" y1="52.4" x2="44" y2="31.3" stroke="#f3eee6" stroke-width="7"/>
<line x1="10" y1="52.4" x2="20" y2="46.2" stroke="#d6965a" stroke-width="7"/>
<line x1="12" y1="49.6" x2="17" y2="46.5" stroke="#b97a42" stroke-width="1.5"/>
<circle cx="46" cy="30" r="7" fill="#ffb347" opacity=".45"/>
<line x1="43.5" y1="31.6" x2="47.5" y2="29.1" stroke="#ff5a1f" stroke-width="7"/>
<circle cx="47" cy="29.2" r="1.8" fill="#fff1a8"/>
<path d="M49,22 C43,17 53,13 47,8 C44,5 46,2 50,1.5" fill="none" stroke="#d9d3e6" stroke-width="2.8" stroke-linecap="round" opacity=".85"/>`;
      break;
    case 'pipe':
      body = `<path d="M47,30 C58,30 61,42 55,50 C53,53 50,54 47,53" fill="none" stroke="${ink}" stroke-width="5.5" stroke-linecap="round"/>
<path d="M47,30 C58,30 61,42 55,50 C53,53 50,54 47,53" fill="none" stroke="#c77dff" stroke-width="3" stroke-linecap="round"/>
<rect x="43" y="50" width="6" height="6" rx="2" fill="#ffd166" stroke="${ink}" stroke-width="1.8"/>
<rect x="28.5" y="16" width="7" height="20" fill="#d9b25a" stroke="${ink}" stroke-width="2"/>
<rect x="26" y="26" width="12" height="3.5" rx="1.5" fill="#ffd166" stroke="${ink}" stroke-width="1.8"/>
<path d="M33,29 H46" stroke="${ink}" stroke-width="4.5"/><path d="M33,29 H46" stroke="#d9b25a" stroke-width="2"/>
<path d="M22,60 C12,60 10,49 17,43 C21,39 26,38 27,34 H37 C38,38 43,39 47,43 C54,49 52,60 42,60 Z" fill="#5fd3ff" fill-opacity=".55" stroke="${ink}" stroke-width="2.2"/>
<path d="M14,50 C20,47 26,52 32,50 S44,47 50,50 C51,56 47,60 42,60 H22 C17,60 14,56 14,50 Z" fill="#3fa7ff" opacity=".8"/>
<path d="M19,46 C18,49 18,52 19,55" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none" opacity=".8"/>
<path d="M23,10 L41,10 L37,17 L27,17 Z" fill="#b5703c" stroke="${ink}" stroke-width="2"/>
<rect x="27" y="7" width="10" height="3.5" rx="1.5" fill="#ff7a3d"/>
<circle cx="24" cy="5" r="3" fill="#e9e3f3" opacity=".8"/><circle cx="19" cy="7" r="2" fill="#e9e3f3" opacity=".6"/>`;
      break;
    case 'herb': {
      const leaf = 'M32,35 C21,28 21,13 32,4 C43,13 43,28 32,35 Z';
      const lc = '#4cc96a';
      body = `<path d="M32,34 Q30,48 25,59" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>
<path d="M32,34 Q30,48 25,59" fill="none" stroke="#2f9e4f" stroke-width="2.5" stroke-linecap="round"/>
<g stroke="${ink}" stroke-width="2.2" stroke-linejoin="round">
<path d="${leaf}" transform="rotate(-58 32 36) translate(0 3) scale(1 .9)" fill="${lc}"/>
<path d="${leaf}" transform="rotate(58 32 36) translate(0 3) scale(1 .9)" fill="${lc}"/>
<path d="${leaf}" fill="#5fe07c"/></g>
<path d="M32,32 V9" stroke="#2f9e4f" stroke-width="1.8" stroke-linecap="round"/>
<path d="M28,10 C27,14 27,18 28,21" stroke="#d8ffd9" stroke-width="2" stroke-linecap="round" fill="none"/>`;
      break;
    }
    case 'water':
      body = `<path d="M17,9 L47,9 L43,56 Q42.5,59 39,59 L25,59 Q21.5,59 21,56 Z" fill="#dff4ff" fill-opacity=".35" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/>
<path d="M19.4,25 C25,22 30,27 35,24 C39,22 42,23 44.6,24.5 L43,56 Q42.5,59 39,59 L25,59 Q21.5,59 21,56 Z" fill="#3fa7ff" opacity=".85"/>
<path d="M19.4,25 C25,22 30,27 35,24 C39,22 42,23 44.6,24.5" fill="none" stroke="#bfe6ff" stroke-width="2"/>
<rect x="27" y="30" width="10" height="10" rx="2" transform="rotate(14 32 35)" fill="#e6f7ff" opacity=".7"/>
<path d="M22,14 L25,52" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>
<circle cx="36" cy="48" r="1.6" fill="#fff" opacity=".8"/><circle cx="31" cy="52" r="1.1" fill="#fff" opacity=".8"/>`;
      break;
    case 'fizz':
      body = `<path d="M27,4 H37 V12 C37,18 45,21 45,30 V56 Q45,60 41,60 H23 Q19,60 19,56 V30 C19,21 27,18 27,12 Z" fill="#5be3a8" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/>
<rect x="26" y="2" width="12" height="6" rx="2" fill="#ff5a6e" stroke="${ink}" stroke-width="2"/>
<rect x="19.5" y="34" width="25" height="13" fill="#ff9f1c" stroke="${ink}" stroke-width="1.8"/>
<polygon points="${starPoints(32, 40.5, 5, 5, 2.2)}" fill="#fff6d0"/>
<path d="M23,28 V54" stroke="#e6fff3" stroke-width="2.5" stroke-linecap="round" opacity=".75"/>
<g fill="#e9fff6" stroke="${ink}" stroke-width="1.2"><circle cx="49" cy="12" r="3.4"/><circle cx="54" cy="21" r="2.2"/><circle cx="47" cy="24" r="1.6"/><circle cx="16" cy="12" r="2.2"/></g>`;
      break;
    case 'shine':
      body = `<path d="M44,27 C57,25 59,43 47,47" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>
<path d="M44,27 C57,25 59,43 47,47" fill="none" stroke="#c98652" stroke-width="3.5" stroke-linecap="round"/>
<path d="M24,22 C24,17 26,14 28,12 H36 C38,14 40,17 40,22 C47,25 53,33 52,44 C51,53 46,59 40,60 H24 C18,59 13,53 12,44 C11,33 17,25 24,22 Z" fill="#c07a44" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/>
<path d="M14,42 C24,46 40,46 50,42 C50,52 45,59 40,60 H24 C19,59 14,52 14,42 Z" fill="#9c5a2e" opacity=".7"/>
<path d="M14,34 C24,37 40,37 50,34" stroke="#e8c28f" stroke-width="2" fill="none"/>
<rect x="27" y="6" width="10" height="7" rx="2" fill="#e9d2a6" stroke="${ink}" stroke-width="2"/>
<path d="M35.5,38 A9,9 0 1,1 35.5,54 A7,7 0 1,0 35.5,38 Z" fill="#fff6d0" stroke="${ink}" stroke-width="1.2"/>
<path d="M18,30 C17,34 17,38 18,42" stroke="#f0c592" stroke-width="2.2" stroke-linecap="round" fill="none"/>`;
      break;
    default:
      body = `<circle cx="32" cy="32" r="22" fill="#888" stroke="${ink}" stroke-width="2"/>`;
  }
  if (rare) {
    const f = rareFrame(id);
    return svg(`<defs>${f.defs}</defs>${f.back}${body}${f.front}`);
  }
  return svg(body);
}

// ---------------------------------------------------------------- personas (gold line style)

const PERSONA_PATHS = {
  king: `<path d="M10,46 L13,19 L23,31 L32,12 L41,31 L51,19 L54,46 Z"/><path d="M11,52 H53"/><circle cx="13" cy="17" r="3"/><circle cx="32" cy="10" r="3"/><circle cx="51" cy="17" r="3"/><circle cx="32" cy="38" r="3.5"/>`,
  queen: `<path d="M9,48 Q32,40 55,48 L52,30 Q45,37 41,29 L32,13 L23,29 Q19,37 12,30 Z"/><path d="M12,54 Q32,47 52,54"/><path d="M32,24 L36,31 L32,38 L28,31 Z"/><circle cx="12" cy="27" r="2.6"/><circle cx="52" cy="27" r="2.6"/><circle cx="32" cy="9" r="2.6"/>`,
  jester: `<path d="M12,44 C11,31 8,23 4,17 C14,18 22,26 26,36 C25,23 28,13 32,7 C36,13 39,23 38,36 C42,26 50,18 60,17 C56,23 53,31 52,44 Z"/><path d="M11,44 H53 V52 H11 Z"/><path d="M22,48 l3,-3 l3,3 l-3,3 Z M36,48 l3,-3 l3,3 l-3,3 Z"/><circle cx="4" cy="17" r="3"/><circle cx="32" cy="6" r="3"/><circle cx="60" cy="17" r="3"/>`,
  assassin: `<g transform="rotate(-35 32 32)"><path d="M32,3 L38,13 L36.5,38 H27.5 L26,13 Z"/><path d="M32,9 V35"/><path d="M17,40 Q32,35 47,40"/><path d="M29,42 H35 V53 H29 Z"/><circle cx="32" cy="57.5" r="3.5"/></g>`,
  knight: `<path d="M32,5 L54,13 V30 C54,44 44,54 32,60 C20,54 10,44 10,30 V13 Z"/><path d="M32,14 V51 M19,28 H45"/>`,
  priestess: `<circle cx="32" cy="16" r="11"/><path d="M32,7 V25 M24,15 H40"/><path d="M32,27 V60"/><path d="M26,60 H38"/><path d="M21,33 C16,31 12,33 9,37 C14,37 18,39 21,42 M43,33 C48,31 52,33 55,37 C50,37 46,39 43,42"/>`,
  hermit: `<circle cx="32" cy="8" r="3"/><path d="M32,11 V14"/><path d="M24,23 L32,14 L40,23 Z"/><path d="M21,23 H43 L45,49 H19 Z"/><path d="M18,49 H46 V54 H18 Z"/><path d="M34,28 A8,8 0 1,0 34,44 A6,6 0 1,1 34,28 Z"/>`,
  thief: `<path d="M6,28 C14,20 26,22 32,28 C38,22 50,20 58,28 C59,40 48,45 40,41 C36,39 34,37 32,37 C30,37 28,39 24,41 C16,45 5,40 6,28 Z"/><path d="M15,31 C18,28 23,28 26,31 C23,34 18,34 15,31 Z M38,31 C41,28 46,28 49,31 C46,34 41,34 38,31 Z"/><path d="M6,30 L1,39 M58,30 L63,39"/>`,
  twins: `<circle cx="22" cy="20" r="8"/><circle cx="42" cy="20" r="8"/><path d="M8,56 C8,40 36,40 36,56"/><path d="M28,56 C28,40 56,40 56,56"/><path d="M8,56 H56"/>`,
  phoenix: `<circle cx="32" cy="14" r="4"/><path d="M35,13 L39,14 L35,16"/><path d="M32,19 C37,24 37,32 32,41 C27,32 27,24 32,19 Z"/><path d="M29,27 C20,19 10,22 3,12 C6,27 15,34 29,34 M35,27 C44,19 54,22 61,12 C58,27 49,34 35,34"/><path d="M32,41 C25,48 29,54 23,61 M32,41 C31,50 33,54 32,61 M32,41 C39,48 35,54 41,61"/>`,
};

export function personaIcon(personaId) {
  const p = PERSONA_PATHS[personaId] || `<circle cx="32" cy="32" r="20"/><text x="32" y="40" text-anchor="middle" font-size="22" fill="${GOLD}" stroke="none">${(PERSONAS[personaId]?.glyph) || '?'}</text>`;
  return svg(`<g fill="none" stroke="#1a0f1f" stroke-width="6.5" stroke-linejoin="round" stroke-linecap="round" opacity=".55">${p}</g>
<g fill="${GOLD}" fill-opacity=".16" stroke="${GOLD}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${p}</g>`);
}

// ---------------------------------------------------------------- stats

export function statIcon(statKey) {
  const ink = '#1d1424';
  const s = `stroke="${ink}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"`;
  let b = '';
  switch (statKey) {
    case 'hp':
      b = `<path d="M32,56 C16,44 6,34 6,22 C6,13 13,7 21,7 C26,7 30,10 32,14 C34,10 38,7 43,7 C51,7 58,13 58,22 C58,34 48,44 32,56 Z" fill="#ff4d6d" ${s}/>
<path d="M14,20 C14,16 17,13 21,13" stroke="#ffd0d8" stroke-width="3.5" stroke-linecap="round" fill="none"/>`;
      break;
    case 'atk':
      b = suitGlyph('blade', '#ff9f1c', { ink });
      break;
    case 'spd':
      b = `<path d="M4,22 H16 M2,31 H16 M6,40 H17" stroke="#5fd3ff" stroke-width="3.5" stroke-linecap="round"/>
<path d="M22,8 H38 V34 L54,41 C59,43 59,52 54,52 H22 Z" fill="#5fd3ff" ${s}/>
<path d="M22,46 H58" stroke="${ink}" stroke-width="2.5"/><path d="M22,46 H57 V52 H22 Z" fill="#e8f8ff" ${s}/>
<path d="M38,12 C46,8 52,10 56,14 C50,14 46,16 42,20" fill="#fff" ${s}/>`;
      break;
    case 'aspd':
      b = `<g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M10,12 L28,32 L10,52 M32,12 L50,32 L32,52" stroke="${ink}" stroke-width="12"/>
<path d="M10,12 L28,32 L10,52 M32,12 L50,32 L32,52" stroke="#ffd166" stroke-width="7"/></g>`;
      break;
    case 'crit':
      b = `<circle cx="32" cy="32" r="24" fill="#fff" ${s}/><circle cx="32" cy="32" r="17" fill="#ff5a6e"/><circle cx="32" cy="32" r="10" fill="#fff"/><circle cx="32" cy="32" r="4.5" fill="#ff5a6e"/>
<path d="M32,2 V14 M32,50 V62 M2,32 H14 M50,32 H62" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>`;
      break;
    case 'critDmg':
      b = `<polygon points="${starPoints(32, 32, 8, 29, 13)}" fill="#ff9f1c" ${s}/><polygon points="${starPoints(32, 32, 8, 17, 8, -67.5)}" fill="#ffe066"/><circle cx="32" cy="32" r="5" fill="#fff"/>`;
      break;
    case 'dodge':
      b = `<path d="M4,30 H14 M2,40 H12 M6,50 H15" stroke="#c9b6ff" stroke-width="3.5" stroke-linecap="round"/>
<path d="M20,57 V28 C20,15 28,7 37,7 C47,7 55,15 55,28 V57 L49,51 L43,57 L37,51 L31,57 L26,51 Z" fill="#e9e1ff" ${s}/>
<ellipse cx="32" cy="27" rx="3" ry="4.5" fill="${ink}"/><ellipse cx="44" cy="27" rx="3" ry="4.5" fill="${ink}"/>`;
      break;
    case 'lifesteal':
      b = `<path d="M32,4 C40,18 52,29 52,41 C52,52 43,60 32,60 C21,60 12,52 12,41 C12,29 24,18 32,4 Z" fill="#c1121f" ${s}/>
<path d="M26,46 C22,42 18,39 18,35 C18,32 20,30 23,30 C25,30 26,31 27,33 C28,31 29,30 31,30 C34,30 36,32 36,35 C36,39 32,42 27,46 Z" fill="#ff8fa3" transform="translate(5 2)"/>
<path d="M21,26 C23,21 26,17 28,14" stroke="#ffb3c1" stroke-width="3" stroke-linecap="round" fill="none"/>`;
      break;
    case 'regen':
      b = `<path d="M24,10 H40 V24 H54 V40 H40 V54 H24 V40 H10 V24 H24 Z" fill="#4cd97b" ${s}/>
<path d="M40,24 C42,12 52,6 60,6 C60,16 54,24 40,24 Z" fill="#a6f4b8" ${s}/><path d="M27,14 V22" stroke="#d8ffe2" stroke-width="3" stroke-linecap="round"/>`;
      break;
    case 'armor':
      b = `<path d="M32,4 L55,12 V30 C55,45 45,55 32,61 C19,55 9,45 9,30 V12 Z" fill="#8fb3ff" ${s}/>
<path d="M32,11 L48,17 V30 C48,41 41,49 32,53 Z" fill="#5b7fd6"/><path d="M15,17 V30" stroke="#e6eeff" stroke-width="3" stroke-linecap="round"/>`;
      break;
    case 'accuracy':
      b = `<path d="M3,32 C12,18 22,12 32,12 C42,12 52,18 61,32 C52,46 42,52 32,52 C22,52 12,46 3,32 Z" fill="#fff" ${s}/>
<circle cx="32" cy="32" r="13" fill="#36d39a" stroke="${ink}" stroke-width="2"/><circle cx="32" cy="32" r="6" fill="${ink}"/><circle cx="28" cy="28" r="3" fill="#fff"/>`;
      break;
    default:
      b = `<circle cx="32" cy="32" r="22" fill="#888" ${s}/><text x="32" y="38" font-size="14" text-anchor="middle" fill="#fff" font-family="sans-serif">${(STAT_LABELS[statKey] || '?').slice(0, 3)}</text>`;
  }
  return svg(b);
}

// ---------------------------------------------------------------- card back

export function cardBackSVG() {
  const id = uid('cb');
  const g = GOLD;
  let lattice = '';
  return svg(`<defs>
<linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a1f6e"/><stop offset=".5" stop-color="#2a0f45"/><stop offset="1" stop-color="#170828"/></linearGradient>
<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset=".45" stop-color="${g}"/><stop offset="1" stop-color="#a87412"/></linearGradient>
<radialGradient id="${id}r" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#9b4dff" stop-opacity=".55"/><stop offset="1" stop-color="#9b4dff" stop-opacity="0"/></radialGradient>
<pattern id="${id}p" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0,5 H10 M5,0 V10" stroke="${g}" stroke-width=".5" opacity=".28"/><circle cx="5" cy="5" r=".9" fill="${g}" opacity=".45"/></pattern>
</defs>
<rect x="1" y="1" width="98" height="138" rx="8" fill="url(#${id}a)" stroke="url(#${id}g)" stroke-width="2"/>
<rect x="7" y="7" width="86" height="126" rx="5" fill="url(#${id}p)" stroke="url(#${id}g)" stroke-width="1"/>
<rect x="10" y="10" width="80" height="120" rx="4" fill="none" stroke="${g}" stroke-width=".5" opacity=".6"/>
<circle cx="50" cy="70" r="40" fill="url(#${id}r)"/>
<g fill="url(#${id}g)">
<path d="M50,16 l4,6 l-4,6 l-4,-6 Z"/><path d="M50,112 l4,6 l-4,6 l-4,-6 Z"/>
<path d="M12,12 h10 l-10,10 Z"/><path d="M88,12 h-10 l10,10 Z"/><path d="M12,128 h10 l-10,-10 Z"/><path d="M88,128 h-10 l10,-10 Z"/>
</g>
<path d="M50,34 L80,70 L50,106 L20,70 Z" fill="#1b0a2e" stroke="url(#${id}g)" stroke-width="1.6"/>
<path d="M50,40 L75,70 L50,100 L25,70 Z" fill="none" stroke="${g}" stroke-width=".6" opacity=".7"/>
<circle cx="50" cy="70" r="19" fill="#2a0f45" stroke="url(#${id}g)" stroke-width="1.6"/>
<text x="50" y="77.5" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-style="italic" font-size="20" fill="url(#${id}g)" letter-spacing="-1">TD</text>
<g fill="${g}"><circle cx="38" cy="96" r="1.8"/><circle cx="50" cy="96" r="1.8"/><circle cx="62" cy="96" r="1.8"/><circle cx="38" cy="44" r="1.8"/><circle cx="50" cy="44" r="1.8"/><circle cx="62" cy="44" r="1.8"/></g>
<path d="M22,30 Q34,26 38,18 M78,30 Q66,26 62,18 M22,110 Q34,114 38,122 M78,110 Q66,114 62,122" fill="none" stroke="${g}" stroke-width=".9" opacity=".75"/>`, '0 0 100 140');
}

// ---------------------------------------------------------------- stars

export function starsSVG(n = 5, opts = {}) {
  n = Math.max(1, Math.min(10, n | 0));
  const id = uid('st');
  const base = opts.color || (n >= 5 ? GOLD : n === 4 ? '#c77dff' : '#5fb8ff');
  let stars = '';
  for (let i = 0; i < n; i++) {
    stars += `<polygon points="${starPoints(12 + i * 24, 12.5, 5, 10.5, 4.6)}" fill="url(#${id})" stroke="${darken(base, 0.55)}" stroke-width="1.4" stroke-linejoin="round"/>`;
  }
  return svg(`<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(base, 0.65)}"/><stop offset=".55" stop-color="${base}"/><stop offset="1" stop-color="${darken(base, 0.25)}"/></linearGradient></defs>${stars}`, `0 0 ${n * 24} 24`);
}

// ---------------------------------------------------------------- logo

export function logoSVG() {
  const id = uid('lg');
  const pink = '#ff4fd8', cyan = '#5ff0ff', gold = GOLD;
  const font = `font-family="'Arial Black','Segoe UI Black',Impact,system-ui,sans-serif" font-weight="900"`;
  const letter = (ch, x) => `<text x="${x}" y="152" text-anchor="middle" ${font} font-size="96">${ch}</text>`;
  const dose = letter('D', 86) + letter('S', 246) + letter('E', 318);
  return svg(`<defs>
<filter id="${id}f" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<linearGradient id="${id}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#ffd6f6"/></linearGradient>
<linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#c9fbff"/></linearGradient>
</defs>
<g filter="url(#${id}f)">
<text x="200" y="58" text-anchor="middle" ${font} font-size="44" letter-spacing="10" fill="url(#${id}c)" stroke="${cyan}" stroke-width="2.5">TRIPLE</text>
<g fill="url(#${id}t)" stroke="${pink}" stroke-width="3.5" stroke-linejoin="round">${dose}</g>
<g transform="translate(166 118) rotate(-14)">
<rect x="-33" y="-33" width="66" height="66" rx="14" fill="#2a0f3a" stroke="${pink}" stroke-width="4.5"/>
<circle cx="-15" cy="-15" r="7" fill="${gold}"/><circle cx="0" cy="0" r="7" fill="${gold}"/><circle cx="15" cy="15" r="7" fill="${gold}"/>
</g>
</g>
<path d="M60,72 H130 M270,72 H340" stroke="${cyan}" stroke-width="2" stroke-linecap="round" opacity=".7"/>
<g fill="#fff"><polygon points="${starPoints(356, 96, 4, 9, 2)}"/><polygon points="${starPoints(40, 32, 4, 6, 1.5)}"/></g>`, '0 0 400 170');
}

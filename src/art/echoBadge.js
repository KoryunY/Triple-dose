// Small 2D badge of a fighter/echo, drawn from its parts (for lists — cheaper than 3D).

const WEAPON_PATH = {
  sword: '<path d="M70 34 L76 28 L78 30 L72 36 Z M66 40 L74 32" stroke="#e8eef8" stroke-width="3" stroke-linecap="round"/><path d="M62 40 L70 48" stroke="#8a5a33" stroke-width="3"/>',
  staff: '<line x1="72" y1="30" x2="66" y2="74" stroke="#5a3a22" stroke-width="3"/><circle cx="72" cy="28" r="5" fill="#ffb347"/><circle cx="72" cy="28" r="8" fill="#ff9f1c" opacity=".35"/>',
  mace: '<line x1="70" y1="42" x2="66" y2="62" stroke="#5a3a22" stroke-width="3"/><circle cx="71" cy="39" r="6" fill="#d0d6e2"/><ellipse cx="28" cy="54" rx="9" ry="11" fill="PRIMARY" stroke="#0006"/>',
  daggers: '<path d="M68 52 L78 40" stroke="#e8eef8" stroke-width="3" stroke-linecap="round"/><path d="M32 52 L22 40" stroke="#e8eef8" stroke-width="3" stroke-linecap="round"/>',
  bow: '<path d="M26 30 Q14 52 26 74" fill="none" stroke="#8a5a33" stroke-width="3"/><line x1="26" y1="30" x2="26" y2="74" stroke="#eee" stroke-width="1"/>',
};

export function echoBadgeSVG(parts = {}, opts = {}) {
  const p = parts;
  const prim = p.primary || '#ff5a6e';
  const sec = p.secondary || '#3fa7ff';
  const skin = p.skin || '#f2c9a8';
  const bulk = p.bulk || 1;
  const bw = 22 * bulk;
  const aura = p.aura ? `<ellipse cx="50" cy="90" rx="30" ry="6" fill="none" stroke="${p.aura.color}" stroke-width="3" opacity=".8"/>` : '';
  const legW = p.legs === 'heavy' ? 9 : p.legs === 'runner' ? 5 : 7;
  let head = `<path d="M38 22 Q50 8 62 22 L62 26 L38 26 Z" fill="${sec}"/>`;
  if (p.head === 'helm') head = `<path d="M37 26 Q50 6 63 26 Z" fill="#b7bcc8"/><rect x="48" y="6" width="4" height="10" fill="${prim}"/>`;
  if (p.head === 'hood') head = `<path d="M34 30 L50 4 L66 30 Z" fill="${shade(prim)}"/>`;
  if (p.head === 'horns') head += `<path d="M40 18 L32 6 L44 15 Z M60 18 L68 6 L56 15 Z" fill="#2a2030"/>`;
  if (p.head === 'crown') head += `<path d="M40 16 L42 6 L46 12 L50 4 L54 12 L58 6 L60 16 Z" fill="#ffd166"/>`;
  if (p.head === 'mask') head = `<path d="M38 22 Q50 8 62 22 L62 26 L38 26 Z" fill="#15151c"/><rect x="38" y="24" width="24" height="5" fill="#15151c"/>`;
  let torso = `<rect x="${50 - bw}" y="38" width="${bw * 2}" height="28" rx="6" fill="${prim}"/><rect x="47" y="38" width="6" height="28" fill="${sec}"/>`;
  if (p.body === 'robe') torso = `<path d="M${50 - bw * 0.8} 38 L${50 + bw * 0.8} 38 L${50 + bw * 1.3} 76 L${50 - bw * 1.3} 76 Z" fill="${prim}"/><rect x="${50 - bw * 0.9}" y="52" width="${bw * 1.8}" height="4" fill="${sec}"/>`;
  if (p.body === 'plate') torso = `<rect x="${50 - bw}" y="38" width="${bw * 2}" height="28" rx="4" fill="#c9ced8"/><rect x="${50 - bw}" y="60" width="${bw * 2}" height="6" fill="${prim}"/><circle cx="${50 - bw}" cy="40" r="7" fill="${prim}"/><circle cx="${50 + bw}" cy="40" r="7" fill="${prim}"/>`;
  if (p.body === 'coat') torso = `<path d="M${50 - bw} 38 L${50 + bw} 38 L${50 + bw * 1.1} 74 L${50 - bw * 1.1} 74 Z" fill="${prim}"/><path d="M42 38 L50 46 L58 38" fill="none" stroke="${sec}" stroke-width="3"/>`;
  const weapon = (WEAPON_PATH[p.weapon] || '').replace('PRIMARY', prim);
  const eye = p.eye || '#ffffff';
  const bg = opts.bg ? `<rect width="100" height="100" rx="14" fill="${opts.bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg}${aura}
<rect x="${44 - legW / 2}" y="64" width="${legW}" height="24" rx="3" fill="${shade(sec)}"/><rect x="${56 - legW / 2}" y="64" width="${legW}" height="24" rx="3" fill="${shade(sec)}"/>
${torso}
<circle cx="50" cy="26" r="12" fill="${skin}"/>${head}
<rect x="44" y="26" width="3" height="4" fill="${eye}"/><rect x="53" y="26" width="3" height="4" fill="${eye}"/>
${weapon}</svg>`;
}

function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * 0.65), g = Math.round(((n >> 8) & 255) * 0.65), b = Math.round((n & 255) * 0.65);
  return `rgb(${r},${g},${b})`;
}

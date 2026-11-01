import { GIRLS } from '../../shared/data.js';
export function portraitSVG(id, o = {}) {
  const g = typeof id === 'object' ? id : GIRLS[id] || GIRLS.nao; const l = g.look;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 480"><rect width="400" height="480" fill="${o.bg ? l.outfit : 'none'}"/><circle cx="200" cy="200" r="110" fill="${l.skin}"/><path d="M80 210 Q200 40 320 210 L320 150 Q200 20 80 150Z" fill="${l.hair}"/><circle cx="160" cy="210" r="16" fill="${l.eyes}"/><circle cx="240" cy="210" r="16" fill="${l.eyes}"/><rect x="110" y="320" width="180" height="160" rx="40" fill="${l.outfit}"/></svg>`;
}

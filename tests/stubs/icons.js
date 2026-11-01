const box = (c, t) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="${c}"/><text x="32" y="40" font-size="22" text-anchor="middle" fill="#000">${t}</text></svg>`;
export const suitIcon = (s) => box('#f5a', s[0].toUpperCase());
export const diceFaceIcon = (f) => box('#5af', f[0]);
export const personaIcon = (p) => box('#fd6', p[0]);
export const statIcon = (s) => box('#aaa', s[0]);
export const cardBackSVG = () => box('#609', 'TD');
export const starsSVG = (n) => box('#fd6', n);
export const logoSVG = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 60"><text x="150" y="42" font-size="36" text-anchor="middle" fill="#ff5a8a" font-weight="900">TRIPLE DOSE</text></svg>`;

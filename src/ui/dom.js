// Tiny DOM helpers — no framework, fast on low-end phones.

import { audio } from '../audio/audio.js';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function btn(label, onClick, cls = '') {
  return h('button', {
    class: `btn ${cls}`,
    onClick: (e) => { audio.sfx('tap'); onClick?.(e); },
  }, label);
}

export function svgEl(svg, cls = '') {
  const s = h('span', { class: `svg ${cls}`, html: svg });
  return s;
}

let toastTimer;
export function toast(msg, kind = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 2600);
}

export function modal(content, { onClose, cls = '', dismissable = true } = {}) {
  const root = document.getElementById('modal-root');
  const back = h('div', { class: `modal-back ${cls}` });
  const box = h('div', { class: 'modal' }, content);
  back.append(box);
  const close = () => { back.classList.add('out'); setTimeout(() => back.remove(), 180); onClose?.(); };
  if (dismissable) back.addEventListener('click', (e) => { if (e.target === back) close(); });
  root.append(back);
  return { close, box };
}

export function confirmBox(text, yesLabel = 'Yes') {
  return new Promise((resolve) => {
    let m;
    const yes = btn(yesLabel, () => { m.close(); resolve(true); }, 'primary');
    const no = btn('Cancel', () => { m.close(); resolve(false); }, 'ghost');
    m = modal(h('div', { class: 'confirm' }, h('p', {}, text), h('div', { class: 'row' }, no, yes)), { onClose: () => resolve(false) });
  });
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function fmtPct(v) { return `${Math.round(v * 100)}%`; }

export function clearEl(el) { while (el.firstChild) el.firstChild.remove(); return el; }

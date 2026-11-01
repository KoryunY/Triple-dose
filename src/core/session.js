// A match session the UI can drive. Two flavours with one interface:
//   LocalSession  — solo vs bots, engine runs in the browser (works offline)
//   RemoteSession — online room, engine runs on the server; we poll it
//
// session.view          latest view (what this player can see)
// session.now()         clock aligned to the match clock
// session.act(action)   -> Promise<{ok, error}>
// session.on(fn)        subscribe to view updates; returns unsubscribe
// session.close()

import { createMatch, addPlayer, addBot, advance, act, viewFor } from '../../shared/engine.js';
import { getGuest, playerName, loadout } from './profile.js';

class Emitter {
  constructor() { this.fns = new Set(); }
  on(fn) { this.fns.add(fn); if (this.view) fn(this.view); return () => this.fns.delete(fn); }
  emit(v) { this.view = v; for (const fn of this.fns) fn(v); }
}

export class LocalSession extends Emitter {
  constructor({ bots = 2, speed = 1 } = {}) {
    super();
    this.kind = 'solo';
    this.me = 'me';
    this.speed = speed;          // dev/testing: ?speed=4 runs the match clock faster
    this.t0 = Date.now();
    this.state = createMatch({ now: this.now() });
    addPlayer(this.state, { id: 'me', name: playerName(), ...loadout() });
    for (let i = 0; i < bots; i++) addBot(this.state);
    this.state.hostId = 'me';
    this.emit(viewFor(this.state, this.me));
    this.timer = setInterval(() => this.tick(), 200);
  }
  now() { return this.t0 + (Date.now() - this.t0) * this.speed; }
  tick() {
    if (advance(this.state, this.now())) this.emit(viewFor(this.state, this.me));
  }
  async act(a) {
    if (a.type === 'start' || a.type === 'restart') {
      // refresh loadout from the profile (echoes earned last match, new patron)
      if (this.state.phase === 'lobby' || a.type === 'restart') act(this.state, this.me, { type: 'loadout', name: playerName(), ...loadout() });
    }
    const r = act(this.state, this.me, a, this.now());
    if (a.type === 'restart' && r.ok) act(this.state, this.me, { type: 'loadout', name: playerName(), ...loadout() });
    advance(this.state, this.now());
    this.emit(viewFor(this.state, this.me));
    return r;
  }
  close() { clearInterval(this.timer); this.fns.clear(); }
}

export class RemoteSession extends Emitter {
  constructor(code, initialView, serverNow) {
    super();
    this.kind = 'online';
    this.code = code;
    this.me = getGuest().id;
    this.offset = serverNow ? serverNow - Date.now() : 0;
    this.failures = 0;
    this.closed = false;
    this.inflight = false;
    if (initialView) this.emit(initialView);
    this.loop();
  }
  now() { return Date.now() + this.offset; }

  async loop() {
    while (!this.closed) {
      await this.poll();
      const fast = ['trade', 'play', 'lobby'].includes(this.view?.phase);
      const hidden = typeof document !== 'undefined' && document.hidden;
      await sleep(hidden ? 4000 : fast ? 900 : 1300);
    }
  }

  async poll() {
    if (this.inflight) return;
    this.inflight = true;
    try {
      const t0 = Date.now();
      const res = await fetch(`/api/match?code=${encodeURIComponent(this.code)}&guest=${encodeURIComponent(this.me)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw Object.assign(new Error(data.error || 'Connection problem'), { status: res.status });
      this.sync(data, t0);
      this.failures = 0;
      this.online = data.online || [];
    } catch (e) {
      this.failures++;
      if (e.status === 404 || e.status === 403) { this.error = e.message; this.closed = true; }
      this.onError?.(e, this.failures);
    } finally {
      this.inflight = false;
    }
  }

  sync(data, t0) {
    if (data.serverNow) {
      const rtt = Date.now() - t0;
      const est = data.serverNow + rtt / 2 - Date.now();
      this.offset = this.offset ? this.offset * 0.7 + est * 0.3 : est;
    }
    if (data.view) this.emit(data.view);
  }

  async act(action) {
    try {
      const t0 = Date.now();
      const res = await fetch('/api/match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'act', code: this.code, guest: this.me, action }),
      });
      const data = await res.json();
      this.sync(data, t0);
      return res.ok ? { ok: true } : { ok: false, error: data.error };
    } catch (e) {
      return { ok: false, error: 'Connection problem' };
    }
  }

  async leave() {
    try {
      await fetch('/api/match', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'leave', code: this.code, guest: this.me }) });
    } catch { /* ignore */ }
  }

  close() { this.closed = true; this.fns.clear(); }
}

export async function createOnline() {
  const res = await fetch('/api/match', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'create', guest: getGuest().id, name: playerName(), loadout: loadout() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not create a room');
  return new RemoteSession(data.code, data.view, data.serverNow);
}

export async function joinOnline(code) {
  const res = await fetch('/api/match', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'join', code: code.toUpperCase().trim(), guest: getGuest().id, name: playerName(), loadout: loadout() }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not join');
  return new RemoteSession(data.code, data.view, data.serverNow);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

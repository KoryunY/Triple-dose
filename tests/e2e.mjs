// Headless mobile playthrough with screenshots. Usage:
//   TD_URL=http://127.0.0.1:5199 OUT=/path node tests/e2e.mjs [solo|gacha|expedition|online]
import { createRequire } from 'node:module';
const require = createRequire('/opt/npm-tools/node_modules/');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const { chromium, devices } = require('playwright-core');

const URL = process.env.TD_URL || 'http://127.0.0.1:5199';
const OUT = process.env.OUT || '.';
const mode = process.argv[2] || 'solo';
const errors = [];

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
async function phone(name = 'p') {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] PAGEERROR ${e.message}`));
  return page;
}
const shot = (page, n) => page.screenshot({ path: `${OUT}/${n}.png` });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function tapText(page, text, opts = {}) {
  const el = page.getByRole('button', { name: text, exact: !!opts.exact }).first();
  await el.waitFor({ timeout: opts.timeout || 15000 });
  await el.click();
}
async function phaseName(page) { return (await page.locator('.phase b').first().textContent().catch(() => '')) || ''; }

if (mode === 'solo') {
  const page = await phone();
  await page.goto(`${URL}/?speed=${process.env.SPEED || 3}`);
  await wait(1500);
  await shot(page, '01-home');
  await tapText(page, 'Play vs bots');
  await wait(800);
  await shot(page, '02-lobby');
  await tapText(page, 'Start match');
  await wait(900);
  await shot(page, '03-roll');
  await wait(1200);
  await shot(page, '04-dose');
  let seen = new Set();
  for (let i = 0; i < 400; i++) {
    try {
    const ph = await phaseName(page);
    const key = ph.split(' ·')[0];
    if (ph.startsWith('Trade') && !seen.has('trade')) {
      seen.add('trade');
      // offer a trade: tap a card, pick a player, a suit, send
      await page.locator('.dock .card').first().click({ timeout: 3000 });
      await page.locator('.who-pick button').first().click({ timeout: 3000 });
      await page.locator('.suit-pick button').nth(2).click({ timeout: 3000 });
      await shot(page, '05-trade');
      await tapText(page, 'Send offer').catch(() => {});
      await wait(300);
      await tapText(page, 'Done trading').catch(() => {});
    } else if (ph.startsWith('Trade')) {
      await tapText(page, 'Done trading', { timeout: 1500 }).catch(() => {});
    }
    if (ph.startsWith('Play') ) {
      const cards = page.locator('.dock .hand .card');
      const n = await cards.count();
      if (n) {
        await cards.nth(0).click({ timeout: 3000 });
        if (n > 2) await cards.nth(1).click({ timeout: 3000 });
        if (!seen.has('play')) { seen.add('play'); await shot(page, '06-play'); }
        const pills = page.locator('.echo-pill:not(.used)');
        if (await pills.count()) await pills.first().click();
        await page.getByRole('button', { name: /Lock in/ }).click({ timeout: 3000 }).catch(() => {});
      }
    }
    if (key === 'Summon' && !seen.has('summon')) { seen.add('summon'); await wait(700); await shot(page, '07-summon'); }
    if (key === 'Battle' && !seen.has('battle')) { seen.add('battle'); await wait(2500); await shot(page, '08-battle'); await wait(3000); await shot(page, '09-battle2'); }
    if (key === 'Round over' && !seen.has('result')) { seen.add('result'); await shot(page, '10-result'); }
    if (key === 'Match over') { await wait(600); await shot(page, '11-end'); break; }
    } catch (e) { console.log('step error:', e.message.split('\n')[0]); }
    await wait(350);
  }
  console.log('final phase:', await phaseName(page));
  // back home: echoes screen
  await page.getByRole('button', { name: 'Leave table' }).click().catch(() => {});
  await wait(800);
  await tapText(page, 'Echoes', { timeout: 5000 }).catch(() => {});
  await wait(600);
  await shot(page, '12-echoes');
}

if (mode === 'gacha') {
  const page = await phone();
  await page.goto(URL);
  await wait(1200);
  await tapText(page, 'Banners');
  await wait(900);
  await shot(page, '20-banner');
  await page.locator('.banner-tabs button').nth(3).click();
  await wait(500);
  await shot(page, '21-banner-moonlit');
  await page.getByRole('button', { name: /Pull ×10/ }).click();
  await wait(700);
  await shot(page, '22-pull-anim');
  for (let i = 0; i < 12; i++) {
    const rv = page.locator('.reveal');
    if (await rv.count()) { if (i === 0) await shot(page, '23-reveal'); await rv.first().click(); await wait(500); }
    else break;
  }
  await wait(500);
  await shot(page, '24-results');
  await page.getByRole('button', { name: 'OK' }).click().catch(() => {});
  await page.getByRole('button', { name: '←' }).first().click();
  await wait(400);
  await tapText(page, 'Girls');
  await wait(600);
  await shot(page, '25-girls');
}

if (mode === 'expedition') {
  const page = await phone();
  await page.goto(URL);
  await wait(1200);
  await tapText(page, 'Expedition');
  await wait(600);
  await shot(page, '30-exp-start');
  await tapText(page, 'Start expedition');
  await wait(600);
  await shot(page, '31-exp-map');
  for (let i = 0; i < 4; i++) {
    await page.locator('.node.avail').first().click();
    await wait(2500);
    await shot(page, `32-exp-step${i}`);
    const skip = page.getByRole('button', { name: /Skip/ });
    if (await skip.count()) { await skip.click(); await wait(600); }
    await page.getByRole('button', { name: 'Continue' }).click({ timeout: 3000 }).catch(() => {});
    await wait(500);
  }
  await shot(page, '33-exp-after');
}

if (mode === 'online') {
  const a = await phone('A'), b = await phone('B');
  await a.goto(URL); await b.goto(URL);
  await wait(1500);
  await tapText(a, 'Online table');
  await tapText(a, 'Create a table');
  await wait(2000);
  const code = (await a.locator('.code').textContent()).trim();
  console.log('room', code);
  await b.goto(`${URL}/?room=${code}`);
  await wait(3000);
  await shot(a, '40-online-lobby-host');
  await shot(b, '41-online-lobby-guest');
  await tapText(a, '+ Add bot');
  await wait(1500);
  await tapText(a, 'Start match');
  await wait(3500);
  await shot(b, '42-online-roll-guest');
  for (let i = 0; i < 60; i++) {
    for (const p of [a, b]) {
      const ph = await phaseName(p);
      if (ph.startsWith('Trade')) await tapText(p, 'Done trading', { timeout: 800 }).catch(() => {});
      if (ph.startsWith('Play')) {
        const c = p.locator('.dock .hand .card');
        if (await c.count()) { await c.first().click().catch(() => {}); await p.getByRole('button', { name: /Lock in/ }).click({ timeout: 800 }).catch(() => {}); }
      }
    }
    const ph = await phaseName(b);
    if (ph.startsWith('Battle')) { await wait(2500); await shot(b, '43-online-battle-guest'); await shot(a, '44-online-battle-host'); break; }
    await wait(700);
  }
}

await browser.close();
console.log(errors.length ? `ERRORS (${errors.length}):\n${errors.slice(0, 20).join('\n')}` : 'no console errors');

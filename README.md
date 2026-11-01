# Triple Dose

A 3-player mobile party game: roll the Smoke & Drink dice, trade and secretly play hidden-persona cards, summon fighters that auto-battle in a 3D arena, keep winners as **Echoes**, pull anime-girl patrons on gacha banners, and push through a roguelike **Expedition**.

Full rules and systems: [DESIGN.md](DESIGN.md).

## Play

- **Solo vs bots** works offline in the browser.
- **Online tables** (up to 3 players, bots fill empty seats) need the database keys below.

## Run locally

```bash
npm install
npm run dev:local   # full game incl. online rooms, using a local SQLite file
npm test            # engine, gacha, online API and expedition balance tests
```

## Deploy (Vercel + Cloudflare D1)

The Vercel project needs these environment variables:

| Variable | Value |
|---|---|
| `CF_ACCOUNT_ID` | Your Cloudflare account ID |
| `CF_API_TOKEN` | A Cloudflare API token with **Account → D1 → Edit** |
| `CF_D1_DATABASE_ID` | Optional; defaults to the `triple-dose` database |

The schema is in `db/schema.sql` (already applied to the `triple-dose` D1 database).

## Layout

```
shared/   engine.js (match state machine), sim.js (deterministic battle), build.js (fighters & dice), data.js (all numbers)
api/      match.js (online rooms), guest.js (guest accounts + profile backup), _d1.js (DB access)
src/      three/ (table, arena, fighters), ui/ (screens), core/ (profile, gacha, sessions, expedition), art/, audio/
tests/    unit tests + headless e2e (tests/e2e.mjs)
```

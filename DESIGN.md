# Triple Dose — Game Design

A 3-player mobile party game: **dice + hidden-card drafting + auto-battler**, wrapped in an **anime gacha** meta with a **roguelike** mode and **Fame** progression. Everything uses fictional stand-ins for real substances.

## The table

- Up to 3 seats. First to sit is **host**; if the host disconnects, the next connected seat takes over.
- Host starts, restarts, and can fill empty seats with bots. Solo mode = you + 2 bots, fully offline.
- Your **patron** (a gacha girl) sits behind your chair and gives a passive to every fighter you summon.

## A round

| Phase | Time | What happens |
|---|---|---|
| Dose Roll | 6s | Everyone rolls a Smoke die and a Drink die. |
| Trade | 20s | Offer one card to a player for "any card of suit X". Optional. Ends early when everyone's done. |
| Play | 25s | Everyone secretly locks 1–3 cards (+ optional Echoes) at the same time. |
| Summon | 5s | Cards become fighters; same-suit plays reveal hidden personas. |
| Battle | ~15–40s | Deterministic auto-battle, free-for-all. Replayed identically on every phone. |
| Result | 4s | Winner gets a battle win; their fighter becomes an **Echo**. |

First to **3 battle wins** takes the match. Underdogs draw extra cards (+1 per win behind the leader, max +2).

## Dice

| Smoke die | Faces | Effect |
|---|---|---|
| Ash Stick | 3 | **Steady**: +10% ATK, −5% HP |
| Cloud Pipe | 2 | **Cloud**: +8% DODGE, −5% SPD |
| Herb (rare) | 1 | Rolls on **Haze**: Third Eye, Couch Lock, Giggles, Munchies, Paranoia, Zen Bloom |

| Drink die | Faces | Effect |
|---|---|---|
| Water | 3 | **Hydrated**: +REGEN, +5% HP |
| Fizz | 2 | **Wired**: +12% ATK SPD, +10% SPD, −5% ARMOR |
| Moonshine (rare) | 1 | Rolls on **Last Call**: Liquid Courage, Blurry Eyes, Berserk, Blackout (coin flip), Bar Brawler, Hangover |

- Two common faces also grant a pair bonus (Clean Break, Rush Hour, Spa Day, Bubble Lounge).
- **DOUBLE DOSE**: both rare faces → both outcomes at ×2 (good or bad).

## Cards

- 50-card deck: 5 suits × ranks 1–5 × 2. Start with 6, draw 2 per round (max 8).
- **Suits** set the weapon and stat focus:
  - Blade = sword, ATK/CRIT DMG
  - Ember = fire staff, ranged, CRIT
  - Tide = mace + shield, HP/ARMOR
  - Gale = twin daggers, ATK SPD/SPD/DODGE
  - Bloom = bow, ranged, REGEN/LIFESTEAL
- **Combos**:
  - Pair (+10% all)
  - Triad (+25% all)
  - Spectrum (3 suits: +CRIT, +DODGE)
  - Run (3 consecutive ranks: +20% ATK SPD)
- **Hidden personas** (12 per deck):
  - The personas are King, Queen, Jester, Assassin, Knight, Priestess, Hermit, Thief, Twins and Phoenix.
  - They apply **even while hidden** — you notice "something's off" in battle.
  - Revealed by playing with a same-suit card, or by winning with it.
  - A card held for 2 rounds shimmers; after 4 rounds you know what it is.
  - Winning returns revealed persona cards to your hand.
- **Edicts**: a revealed King triggers *Iron Crown* (others −20% ATK next round). A revealed Queen triggers *Velvet Decree* (her owner rolls with advantage next round).

## Fighters (read the buffs from the body)

- **Head = CRIT**: horns/mask when high, crown for royals.
- **Body = HP/ARMOR**: plate, coat or robe; bulk scales with HP.
- **Legs = SPD** (runner/heavy).
- **Arms = ATK SPD**.
- **Weapon = suit**.
- **Aura = dose**: haze green, moonshine violet, double-dose gold.

## Echoes

- Won fighters are saved as Echoes.
- Equip by Fame rank: 1 slot, then 2 at Rising, then 3 at Icon.
- In matches, each Echo can join one battle per match at 60% power.
- Level up with Dust (+8% HP/ATK per level, max 10). Release them for Dust.

## Gacha (no real money)

- **Banners**: 4 limited (Rin, Mireille, Yuki, Selene) and 1 standard (Aya, Lumi, Vera).
- **5★ rates**: 0.8% base, soft pity from 66, hard pity 80. 50/50 with guarantee carry-over.
- **4★ rates**: every 10 pulls, 50% rate-up. 3★ = Dust.
- **Duplicates** raise Bond (max 6), strengthening the girl's passive.
- **Tickets** come from matches (8/4/2) and expeditions. New players start with 30.

## Expedition (roguelike)

- 3 acts × 5 branching steps + a boss.
- **Nodes**: Brawl, Elite, Dose (a run-long dice buff), Lounge (heal), Stash (loot).
- Your party is your equipped Echoes; you get a loaner if you have none.
- HP carries between fights. Enemies scale with act and party size.

## Fame ranks

Nobody → Local (100) → Rising (300, 2 slots) → Star (700) → Icon (1500, 3 slots) → Legend (3000).

## Tech

- **Client**: Vite + Three.js. Low-poly toon models, no shadows, adaptive resolution. Procedural SVG art and WebAudio music/SFX (no asset downloads).
- **Shared engine**: `shared/engine.js` is a pure state machine used by both solo (in-browser) and online (server). The battle sim (`shared/sim.js`) uses only seeded RNG and IEEE-exact math, so it replays identically everywhere.
- **Online**:
  - Vercel Functions (`api/match.js`) keep match state in Cloudflare D1, advanced lazily on each poll.
  - Optimistic version checks prevent clobbering.
  - Presence via `room_players.last_seen` drives host handoff.
- **Profile**: kept in localStorage and backed up to D1 (`guests.data`) when online.

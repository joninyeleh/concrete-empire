# Concrete Empire

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/joninyeleh/concrete-empire/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/joninyeleh/concrete-empire/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game, built for the [make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01).

**The story.** Vic rolled into **Velmora** with $40 and a busted sedan. **Rosa** runs the streets from her bar, and she has work for anyone hungry enough. Do her jobs, earn your empire — one score at a time.

## What is in the game

- **A living city, on foot and by car.** Six districts with their own look — neon Downtown, Old Town, the Harbor, Riverside Park, Empire Plaza, the Suburbs — filled with traffic cars driving the roads and pedestrians walking the sidewalks.
- **Arcade driving with weight.** Accelerate, brake, steer, drift with the handbrake, skid marks, sparks and smoke, screen shake on crashes.
- **Stealable cars — and more to drive.** Walk up to a parked car or a traffic car and press **E** to take it. A fast Comet GT is parked in Old Town — and one can be bought at the garage for $800. A work van waits by the Greasy Wrench Garage (slow, tough) and a bike by Riverside Park (fast, twitchy), each with its own handling.
- **Wanted level, 0–5 stars.** Stealing cars, punching people and running pedestrians over draws the Velmora PD. Police cars chase and ram; on-foot cops chase you down. At **4+ stars the PD seals streets with roadblocks** — two cop cars and a striped barricade ahead of you. Get caught and you are busted (lose 20% of your cash); drop to 0 health and you wake up in St. Mary's. Lay low and the heat decays.
- **Seven missions with distinct mechanics**, handed out by Rosa with dialogue:
  1. **The Pickup** — collect a package at Harbor Dock 7 and bring it back.
  2. **Hot Wheels** — steal a sports car and lose the heat.
  3. **The Drop** — a timed 90-second delivery across town.
  4. **Turf War** — brawl four rivals in Riverside Park.
  5. **The Big Score** — crack the Empire Bank vault and escape a 3-star chase to the safehouse.
  6. **Midnight Grand Prix** — a street race against three rival drivers through four checkpoints, against a 150-second clock.
  7. **Getaway Driver** — pick up Rosa's crew at the garage, then shake three stars and reach the safehouse clean.
- **A city that turns to night.** A slow dusk-to-night cycle: the violet wash deepens, streetlights and headlights come on, and Downtown neon burns brighter after dark.
- **In-game radio.** Two stations, both synthesized live with WebAudio oscillators — **NEON DRIVE 104.7** (synthwave) and **VELMORA LO-FI 88.3** (lo-fi). Press **R** to cycle them.
- **Combat.** Punch on foot (J or F), ram with cars, and find a bat pickup for double damage.
- **Cash that matters.** Repair your ride at the Greasy Wrench Garage ($150), buy the Comet GT ($800), and grab pickups scattered around the city: cash, health, armor, the bat. Near-misses in traffic pay $10.
- **HUD + minimap.** Wanted stars, cash, health, armor, speed, current objective with a waypoint arrow and distance, and a live minimap of Velmora.
- **Start screen + save.** New Game / Continue, and progress (cash, missions done, position) saves to localStorage.
- **Sound, no files.** All audio is synthesized WebAudio: pickup blips, crash thuds, jingles, a two-tone police siren while you are wanted, and the two-station radio.

## Play

Open `game/index.html` in a desktop browser, or serve the `game/` folder over HTTP and open it there. No build step, no network requests — the game runs fully offline.

### Controls

| Keys | Action |
| --- | --- |
| WASD / arrows | Move / drive |
| Shift | Sprint (on foot) |
| Space | Handbrake (in a car) |
| E | Enter / steal a car, get out |
| J or F | Punch |
| B | Buy the Comet GT / repair at the garage |
| R | Cycle the radio (synthwave → lo-fi → off) |
| Enter | Confirm / dismiss dialogue |
| P or Esc | Pause |
| M | Mute |

## Structure

- `game/` — the game (static files; `game/index.html` is the entry point, `game/src/` is the source)
  - `config.js` — tuning, city layout, districts, missions, pickups
  - `random.js` — seeded RNG
  - `input.js` — keyboard input
  - `world.js` — city generation, traffic and pedestrian AI, police, roadblocks, race rivals, physics, collisions
  - `render.js` — the dusk/neon canvas renderer, night cycle, HUD, minimap, screens
  - `main.js` — game state, missions, wanted system, radio, save/load, audio
  - `shots.js` — deterministic staged scenes for screenshots (`?shot=start|play|drive|mission|race|night`)
- `main.ts` — builds the submission dossier
- `vendor/makefun-game.ts` — make.fun dossier builder (unmodified)
- `screenshots/` — four screenshots of the game (the first by name is the cover)

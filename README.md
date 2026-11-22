# Concrete Empire

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![Rank](https://make.fun/badge/gta6-01/joninyeleh/concrete-empire/rank.svg)](https://make.fun/bounty/gta6-01)
[![Reward](https://make.fun/badge/gta6-01/joninyeleh/concrete-empire/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game, built for the [make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01).

Explore a living city on foot and by car, steal cars, dodge the police as your wanted level rises, and work through missions and story. HUD and minimap included; progress saves.

## Play

Open `game/index.html` in a desktop browser, or serve the `game/` folder over HTTP and open it there. No build step, no network requests — the game runs fully offline.

## Structure

- `game/` — the game (static files, `index.html` is the entry point)
- `main.ts` — builds the submission dossier
- `vendor/makefun-game.ts` — make.fun dossier builder (unmodified)
- `screenshots/` — screenshots of the game

# vice-harbor

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Andri172/vice-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Andri172/vice-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An open-world crime story in the invented city of Meridian Bay. You are Jax
Rook, an ex-wheelman back in town with a debt to pay and a fixer who never
runs out of jobs. Steal cars, outrun the Harbor Precinct, and work five story
missions for Eddie Kwan — from a quiet pickup at the garage to a shootout on
the docks with Vince Marko's crew.

Everything in the game is original: the city, the characters, the story, the
art (drawn in code) and the sound (synthesized with Web Audio). Nothing is
copied from any existing game, and the game loads no files from the network.

## Run it

```sh
node serve.ts
```

## How to play

Open `game/index.html` in a desktop browser, or serve it locally:

```
node serve.ts
```

then open http://localhost:8080. No build step and no install.

| Key | Action |
| --- | --- |
| WASD | Move on foot / drive |
| Mouse | Aim, click to shoot |
| E | Enter or exit a car, advance dialogue |
| SHIFT | Run |
| SPACE | Handbrake (drift) |
| P | Pause |
| M | Mute |
| ENTER | Start / continue on the title screen |
| R | Recover after being busted or wasted |

## What is in the game

- **A city**: a 9x9 road grid with varied buildings, parks, parking lots,
  street lamps, hydrants and crates, plus seven named story locations
  (Meridian General, Kwan's Garage, Eddie's Bar, the Chop Shop, the Hideout,
  the Harbor Precinct and the Docks).
- **On foot and by car**: walking and running with building collision;
  driving with acceleration, braking, reverse, steering and handbrake drift;
  cars take damage and smoke when wrecked.
- **Traffic and pedestrians**: cars follow the road grid and queue behind
  each other; pedestrians walk the sidewalks and flee from gunfire and fast
  cars.
- **Wanted system**: five stars earned by car theft, hitting pedestrians,
  shooting near police and ramming patrol cars. Police cars pursue and ram;
  foot officers chase and can bust you. The heat decays when nobody sees you.
- **Combat**: a pistol with mouse aim, muzzle flash, tracers and hit
  feedback; gang members shoot back.
- **Five story missions**: Back in the Harbor, The Comet Job, Hot Pursuit,
  Three Drops (timed) and Dockside Showdown, with dialogue, on-screen
  objectives, a map marker, cash rewards and a completion screen with stats.
- **HUD**: health, cash, wanted stars, car speed and damage, mission
  objective with an off-screen arrow, and a live minimap.
- **Day and night**: a full cycle with a night tint, glowing street lamps
  and car headlights.
- **Sound**: synthesized engine hum, gunshots, crashes, sirens, pickups and
  a generated bass-line music loop. No audio files.
- **Save**: progress (cash, mission, position, stats) saves to localStorage
  automatically and can be continued from the title screen.

## Layout

- `game/index.html` — the page, a fixed 1280x720 canvas.
- `game/src/config.js` — constants, city layout, car types, key bindings.
- `game/src/util.js` — math, seeded random, collision helpers.
- `game/src/audio.js` — synthesized effects and music.
- `game/src/world.js` — city generation, drawing and the minimap.
- `game/src/entities.js` — player, cars, traffic AI, police, pedestrians,
  combat, particles and the wanted system.
- `game/src/missions.js` — the story and the five missions.
- `game/src/game.js` — main loop, input, camera, HUD, screens and saves.
- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json`.
- `screenshots/` — four real renders of the running game.

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

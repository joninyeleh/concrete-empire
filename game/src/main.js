// Concrete Empire — game state, missions, wanted system, audio, save/load.
// The game is an original 2D top-down open-world crime game set in Velmora.
import {
  SAVE_KEY, START_CASH, CITY, PLACES, RACE_CPS, PRICES, VEHICLES,
  ON_FOOT_SPEED, SPRINT_SPEED, RIVAL_SPEED, MISSIONS, RADIO_STATIONS,
} from './config.js';
import { makeRng, hashSeed } from './random.js';
import { createInput } from './input.js';
import {
  buildCity, makeCar, makePed, makePickup, collideBuildings,
  nearestRoadPoint, driveCar, updateTraffic, updatePeds, updatePolice, inWater,
} from './world.js';
import { drawGame } from './render.js';
import { applyShot } from './shots.js';

const SAVE_VERSION = 1;

export class Game {
  constructor(canvas, ctx, params, rng) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.rng = rng;
    this.input = createInput();
    this.screen = 'title';
    this.time = 0;
    this.cash = START_CASH;
    this.wanted = 0;
    this.wantedTimer = 0;
    this.missionsDone = [];
    this.mission = null;
    this.missionTimer = 0;
    this.retryIndex = null;
    this.nextIndex = -1;
    this.nextTimer = 0;
    this.radioStation = null;
    this.dialogue = null;
    this.banner = null;
    this.prompt = '';
    this.toasts = [];
    this.saveExists = false;
    this.raceCar = null;
    this.shake = 0;
    this.muted = false;
    this.owned = { comet: false, safehouse: false };
    this.endTimer = 0;
    this.cam = { x: 0, y: 0, w: 1280, h: 720 };
    this.audio = null;
    this.master = null;
    this.sirenTimer = null;
    this.sirenHigh = false;
    this.radioStep = 0;
    this.radioNext = 0;
    this.radioTimer = null;

    try {
      this.saveExists = !!window.localStorage.getItem(SAVE_KEY);
    } catch (e) {
      this.saveExists = false;
    }

    const city = buildCity(rng);
    this.world = {
      player: {
        x: PLACES.spawn.x, y: PLACES.spawn.y, angle: 0,
        hp: 100, armor: 0, inCar: null, hasBat: false, punchT: 0,
      },
      cars: [], peds: [], pickups: [], particles: [], skids: [],
      buildings: city.buildings, lamps: city.lamps, trees: city.trees, water: city.water,
      police: [], roadblock: null,
    };
    this.spawnWorld();

    // Debug / screenshot hooks from the URL.
    if (params.has('shot')) {
      applyShot(this, params.get('shot'));
    } else if (params.get('debug') === 'drive') {
      this.screen = 'play';
      const car = makeCar('sedan', this.world.player.x + 56, this.world.player.y, 'none', 0);
      this.world.cars.push(car);
    } else if (params.get('debug') === 'ped') {
      this.screen = 'play';
      const ped = makePed(this.world.player.x + 42, this.world.player.y, { debugPed: true });
      this.world.peds.push(ped);
    }

    window.addEventListener('keydown', () => this.ensureAudio());
  }

  spawnWorld() {
    const { rng, world } = this;
    // Parked cars the player can take.
    world.cars.push(makeCar('sports', PLACES.cometSpot.x, PLACES.cometSpot.y, 'none', 0.4));
    world.cars.push(makeCar('van', PLACES.vanSpot.x, PLACES.vanSpot.y, 'none', -0.3));
    world.cars.push(makeCar('bike', PLACES.bikeSpot.x, PLACES.bikeSpot.y, 'none', 0));
    for (let i = 0; i < 4; i += 1) {
      // Keep random parked cars clear of the signature spots (Comet GT, van,
      // bike, garage, spawn) so each one is unambiguous to approach.
      const keepClear = [PLACES.cometSpot, PLACES.vanSpot, PLACES.bikeSpot, PLACES.spawn, PLACES.garage];
      let p = null;
      for (let tries = 0; tries < 12; tries += 1) {
        const cand = nearestRoadPoint(rng.range(300, 2900), rng.range(300, 1900));
        cand.x += rng.range(-30, 30);
        cand.y += rng.range(-30, 30);
        const clear = keepClear.every((s) => Math.hypot(cand.x - s.x, cand.y - s.y) > 220);
        if (clear) { p = cand; break; }
      }
      if (!p) continue;
      world.cars.push(makeCar(rng.pick(['sedan', 'sedan', 'van']), p.x, p.y, 'none', rng.range(0, Math.PI * 2)));
    }
    // Traffic.
    for (let i = 0; i < 10; i += 1) {
      const horizontal = rng.next() < 0.5;
      const car = makeCar(rng.pick(['sedan', 'sedan', 'sedan', 'van']), 0, 0, 'traffic', 0);
      if (horizontal) {
        car.road = 'x';
        car.line = rng.pick([240, 560, 880, 1200, 1520, 1840]);
        car.x = rng.range(200, 3000);
        car.y = car.line + (rng.next() < 0.5 ? -14 : 14);
        car.dir = rng.next() < 0.5 ? 0 : 2;
      } else {
        car.road = 'y';
        car.line = rng.pick([240, 560, 880, 1200, 1520, 1840, 2160, 2480, 2800]);
        car.y = rng.range(200, 2000);
        car.x = car.line + (rng.next() < 0.5 ? -14 : 14);
        car.dir = rng.next() < 0.5 ? 1 : 3;
      }
      car.angle = [0, Math.PI / 2, Math.PI, -Math.PI / 2][car.dir];
      world.cars.push(car);
    }
    // Pedestrians.
    const pedColors = ['#e67e22', '#9b59b6', '#1abc9c', '#e84393', '#f39c12', '#00cec9'];
    for (let i = 0; i < 16; i += 1) {
      const horizontal = rng.next() < 0.5;
      const ped = makePed(0, 0, { color: rng.pick(pedColors), speed: rng.range(42, 68) });
      if (horizontal) {
        ped.road = 'x';
        ped.line = rng.pick([240, 560, 880, 1200, 1520, 1840]);
        ped.x = rng.range(200, 3000);
        ped.y = ped.line + (rng.next() < 0.5 ? -46 : 46);
        ped.dir = rng.next() < 0.5 ? 0 : 2;
      } else {
        ped.road = 'y';
        ped.line = rng.pick([240, 560, 880, 1200, 1520, 1840, 2160, 2480, 2800]);
        ped.y = rng.range(200, 2000);
        ped.x = ped.line + (rng.next() < 0.5 ? -46 : 46);
        ped.dir = rng.next() < 0.5 ? 1 : 3;
      }
      ped.side = rng.next() < 0.5 ? 1 : -1;
      world.peds.push(ped);
    }
    // Pickups scattered around the city.
    const kinds = ['cash', 'cash', 'health', 'health', 'armor', 'armor', 'bat', 'cash', 'health', 'armor', 'cash', 'bat'];
    for (const kind of kinds) {
      const p = nearestRoadPoint(rng.range(260, 2960), rng.range(260, 1960));
      world.pickups.push(makePickup(kind, p.x + rng.range(-40, 40), p.y + rng.range(-40, 40)));
    }
  }

  // --- Day/night ---------------------------------------------------------------
  // The active roadblock, if any (lives in the world, exposed for tests).
  get roadblock() {
    return this.world.roadblock;
  }

  // Triangle wave over a 360-second cycle: 0 at dawn, 1 at deep night, 0 again.
  night01() {
    const u = ((this.time % 360) + 360) % 360 / 360;
    return u < 0.5 ? u * 2 : (1 - u) * 2;
  }

  // --- Wanted ---------------------------------------------------------------------
  setWanted(n) {
    this.wanted = Math.max(0, Math.min(5, n));
    this.wantedTimer = 0;
    if (this.wanted === 0) this.stopSiren();
  }

  addWanted(n) {
    if (this.wanted >= 5) return;
    this.setWanted(this.wanted + n);
    this.wantedTimer = 0;
  }

  busted() {
    if (this.screen !== 'play') return;
    const p = this.world.player;
    if (p.inCar) {
      p.inCar.driver = 'none';
      p.inCar.parked = true;
      p.inCar = null;
    }
    this.cash = Math.floor(this.cash * 0.8);
    this.setWanted(0);
    this.mission = null;
    this.retryIndex = -1;
    this.screen = 'busted';
    this.endTimer = 2.5;
    this.save();
  }

  wasted() {
    if (this.screen !== 'play') return;
    const p = this.world.player;
    if (p.inCar) {
      p.inCar.driver = 'none';
      p.inCar.parked = true;
      p.inCar = null;
    }
    this.setWanted(0);
    this.mission = null;
    this.screen = 'wasted';
    this.endTimer = 2.5;
    this.save();
  }

  respawn(at) {
    const p = this.world.player;
    p.x = at.x;
    p.y = at.y;
    p.hp = 100;
    p.angle = 0;
    p.inCar = null;
    this.screen = 'play';
    this.save();
  }

  // --- Save / load ------------------------------------------------------------------
  save() {
    try {
      const p = this.world.player;
      const data = {
        v: SAVE_VERSION,
        cash: this.cash,
        missionsDone: this.missionsDone,
        px: Math.round(p.x), py: Math.round(p.y),
        hp: p.hp, armor: p.armor,
        owned: this.owned, hasBat: p.hasBat,
        time: Math.round(this.time),
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      this.saveExists = true;
    } catch (e) {
      // Storage unavailable (private mode, etc.) — the game still plays.
    }
  }

  loadSaveData() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  newGame() {
    const p = this.world.player;
    this.cash = START_CASH;
    this.missionsDone = [];
    this.owned = { comet: false, safehouse: false };
    p.hp = 100;
    p.armor = 0;
    p.hasBat = false;
    p.x = PLACES.spawn.x;
    p.y = PLACES.spawn.y;
    p.angle = 0;
    p.inCar = null;
    this.time = 0;
    this.setWanted(0);
    this.screen = 'play';
    this.startMission(0);
  }

  continueSave() {
    const d = this.loadSaveData();
    if (!d) return;
    const p = this.world.player;
    this.cash = typeof d.cash === 'number' ? d.cash : START_CASH;
    this.missionsDone = Array.isArray(d.missionsDone) ? d.missionsDone : [];
    p.x = typeof d.px === 'number' ? d.px : PLACES.spawn.x;
    p.y = typeof d.py === 'number' ? d.py : PLACES.spawn.y;
    p.hp = typeof d.hp === 'number' ? d.hp : 100;
    p.armor = typeof d.armor === 'number' ? d.armor : 0;
    p.hasBat = !!d.hasBat;
    this.owned = d.owned || { comet: false, safehouse: false };
    this.time = typeof d.time === 'number' ? d.time : 0;
    this.setWanted(0);
    this.screen = 'play';
    const next = this.missionsDone.length;
    if (next < MISSIONS.length) this.startMission(next);
  }

  // --- Missions ------------------------------------------------------------------
  clearMissionEntities() {
    const { world } = this;
    for (let i = world.peds.length - 1; i >= 0; i -= 1) {
      if (world.peds[i].state === 'rival') world.peds.splice(i, 1);
    }
    for (let i = world.cars.length - 1; i >= 0; i -= 1) {
      if (world.cars[i].driver === 'rival') world.cars.splice(i, 1);
    }
    if (this.raceCar && this.world.player.inCar !== this.raceCar) {
      const i = world.cars.indexOf(this.raceCar);
      if (i >= 0) world.cars.splice(i, 1);
    }
    this.raceCar = null;
  }

  startMission(index) {
    if (index < 0 || index >= MISSIONS.length) return;
    this.clearMissionEntities();
    const def = MISSIONS[index];
    const p = this.world.player;
    const m = {
      def, index, step: 'go', target: null, objective: '',
      timed: false, rivals: [], crackT: 0, cpIndex: 0,
    };
    this.mission = m;
    this.missionTimer = 0;
    this.retryIndex = null;

    if (def.id === 'pickup') {
      m.target = { x: PLACES.dock.x, y: PLACES.dock.y, label: PLACES.dock.label };
      m.objective = 'Pick up the package at Harbor Dock 7';
    } else if (def.id === 'hotwheels') {
      m.step = 'steal';
      m.target = { x: PLACES.cometSpot.x, y: PLACES.cometSpot.y, label: 'Comet GT' };
      m.objective = 'Steal the Comet GT in Old Town';
    } else if (def.id === 'drop') {
      m.target = { x: PLACES.dropTarget.x, y: PLACES.dropTarget.y, label: PLACES.dropTarget.label };
      m.objective = 'Deliver the package across town';
      m.timed = true;
      this.missionTimer = 90;
    } else if (def.id === 'turf') {
      m.step = 'fight';
      m.target = { x: PLACES.park.x, y: PLACES.park.y, label: PLACES.park.label };
      m.objective = 'Take down 4 rivals in Riverside Park (0/4)';
      for (let i = 0; i < 4; i += 1) {
        const rival = makePed(PLACES.park.x + (i - 1.5) * 70, PLACES.park.y + (i % 2) * 60 - 30, {
          state: 'rival', hp: 60, color: '#c0392b', speed: 150,
        });
        this.world.peds.push(rival);
        m.rivals.push(rival);
      }
    } else if (def.id === 'score') {
      m.step = 'bank';
      m.target = { x: PLACES.bank.x, y: PLACES.bank.y, label: PLACES.bank.label };
      m.objective = 'Get to Empire Bank';
    } else if (def.id === 'streetrace') {
      // The player gets a lent race car for the Grand Prix.
      if (p.inCar) {
        p.inCar.driver = 'none';
        p.inCar.parked = true;
        p.inCar = null;
      }
      const car = makeCar('race', PLACES.raceStart.x, PLACES.raceStart.y + 60, 'player', 0);
      car.hp = 100;
      this.world.cars.push(car);
      this.raceCar = car;
      p.inCar = car;
      p.x = car.x;
      p.y = car.y;
      p.angle = 0;
      m.step = 'line';
      m.target = { x: PLACES.raceStart.x, y: PLACES.raceStart.y, label: 'Start Line' };
      m.objective = 'Get to the start line';
      const spots = [
        { x: 1434, y: 880 }, { x: 1400, y: 920 }, { x: 1468, y: 920 },
      ];
      for (let i = 0; i < 3; i += 1) {
        const rival = makeCar('race', spots[i].x, spots[i].y, 'rival', 0);
        rival.waiting = true;
        rival.cpIndex = 0;
        rival.color = ['#e74c3c', '#3498db', '#f39c12'][i];
        this.world.cars.push(rival);
        m.rivals.push(rival);
      }
    } else if (def.id === 'getaway') {
      m.target = { x: PLACES.garage.x, y: PLACES.garage.y, label: PLACES.garage.label };
      m.objective = "Pick up Rosa's crew at the garage";
    }
    this.dialogue = { text: def.intro, who: 'Rosa' };
    this.blip(660, 0.12);
  }

  completeMission() {
    const m = this.mission;
    if (!m) return;
    const first = !this.mission.rivals || this.mission.rivals.every((r) => !r.finished);
    let reward = m.def.reward;
    if (m.def.id === 'streetrace' && !first) reward = 600;
    this.cash += reward;
    this.missionsDone.push(m.def.id);
    this.banner = { text: 'MISSION COMPLETE', sub: `${m.def.name}  —  $${reward.toLocaleString()}`, t: 3 };
    this.dialogue = { text: m.def.outro, who: 'Rosa' };
    this.jingle();
    const next = m.index + 1;
    this.mission = null;
    this.raceCar = null;
    this.save();
    if (next < MISSIONS.length) {
      this.nextIndex = next;
      this.nextTimer = 1.6;
    } else {
      this.banner = { text: 'CONCRETE EMPIRE COMPLETE', sub: 'Every job done. Velmora is yours, Vic.', t: 5 };
    }
  }

  failMission(reason) {
    const m = this.mission;
    if (!m) return;
    this.banner = { text: 'MISSION FAILED', sub: reason, t: 3 };
    this.dialogue = { text: "Rosa: That didn't work. Shake it off and come see me when you're ready to run it back.", who: 'Rosa' };
    this.retryIndex = m.index;
    this.mission = null;
    this.raceCar = null;
    this.tone(180, 0.4, 'sawtooth', 0.16);
  }

  onTargetReached() {
    const m = this.mission;
    if (!m) return;
    const p = this.world.player;
    if (m.def.id === 'pickup') {
      if (m.step === 'go') {
        m.step = 'return';
        m.target = { x: PLACES.rosa.x, y: PLACES.rosa.y, label: PLACES.rosa.label };
        m.objective = "Bring the package back to Rosa's Bar";
        this.addToast('Package secured!');
        this.blip(880, 0.1);
      } else {
        this.completeMission();
      }
    } else if (m.def.id === 'hotwheels') {
      if (m.step === 'garage') {
        if (this.wanted === 0) {
          this.completeMission();
        } else {
          m.objective = 'Lose the heat first, then bring it to the garage!';
        }
      }
    } else if (m.def.id === 'drop') {
      this.completeMission();
    } else if (m.def.id === 'score') {
      if (m.step === 'bank') {
        m.step = 'vault';
        m.crackT = 3;
        m.objective = 'Cracking the vault… stay close!';
        this.addToast('Cracking the vault…');
      } else if (m.step === 'escape') {
        this.completeMission();
      }
    } else if (m.def.id === 'streetrace') {
      if (m.step === 'line') {
        m.step = 'racing';
        m.timed = true;
        this.missionTimer = 150;
        for (const r of m.rivals) r.waiting = false;
        m.cpIndex = 0;
        m.target = { ...RACE_CPS[0] };
        m.objective = 'Race! 4 checkpoints, then the finish';
        this.addToast('GO! GO! GO!');
        this.jingle();
      } else if (m.step === 'racing') {
        m.cpIndex += 1;
        if (m.cpIndex >= RACE_CPS.length) {
          this.completeMission();
        } else {
          m.target = { ...RACE_CPS[m.cpIndex] };
          m.objective = `${RACE_CPS[m.cpIndex].label} — ${m.cpIndex} of 5`;
          this.blip(990, 0.1);
        }
      }
    } else if (m.def.id === 'getaway') {
      if (m.step === 'go') {
        m.step = 'escape';
        this.setWanted(3);
        m.target = { x: PLACES.safehouse.x, y: PLACES.safehouse.y, label: PLACES.safehouse.label };
        m.objective = 'Lose the heat, then reach the safehouse';
        this.addToast("The crew is in — now run!");
      } else if (m.step === 'escape') {
        if (this.wanted === 0) {
          this.completeMission();
        } else {
          m.objective = 'Lose the heat first, then reach the safehouse!';
        }
      }
    }
    void p;
  }

  updateMission(dt) {
    const m = this.mission;
    if (!m) {
      if (this.nextIndex >= 0) {
        this.nextTimer -= dt;
        if (this.nextTimer <= 0) {
          const i = this.nextIndex;
          this.nextIndex = -1;
          this.startMission(i);
        }
      }
      return;
    }
    if (m.timed) {
      this.missionTimer -= dt;
      if (this.missionTimer <= 0) {
        this.failMission('Out of time!');
        return;
      }
    }
    const p = this.world.player;
    // Hot Wheels: stealing the sports car advances the mission.
    if (m.def.id === 'hotwheels' && m.step === 'steal' && p.inCar && p.inCar.kind === 'sports') {
      m.step = 'garage';
      m.target = { x: PLACES.garage.x, y: PLACES.garage.y, label: PLACES.garage.label };
      m.objective = 'Bring it to the Greasy Wrench — no heat!';
      this.addToast('Nice ride. Now lose the heat!');
    }
    // Turf War: count the rivals still standing.
    if (m.def.id === 'turf') {
      const down = m.rivals.filter((r) => r.hp <= 0).length;
      m.objective = `Take down 4 rivals in Riverside Park (${down}/4)`;
      if (down >= 4) {
        this.completeMission();
        return;
      }
    }
    // The Big Score: stand at the bank while the vault cracks.
    if (m.def.id === 'score' && m.step === 'vault') {
      const d = Math.hypot(p.x - PLACES.bank.x, p.y - PLACES.bank.y);
      if (d < 110) {
        m.crackT -= dt;
        m.objective = `Cracking the vault… ${Math.max(0, Math.ceil(m.crackT))}s`;
        if (m.crackT <= 0) {
          m.step = 'escape';
          this.setWanted(3);
          m.target = { x: PLACES.safehouse.x, y: PLACES.safehouse.y, label: PLACES.safehouse.label };
          m.objective = 'Escape to the safehouse!';
          this.addToast('Vault cracked! The PD is coming!');
        }
      } else {
        m.objective = 'Get back to the bank vault!';
      }
    }
    // Reaching the current target.
    if (m.target) {
      const d = Math.hypot(p.x - m.target.x, p.y - m.target.y);
      if (d < 65) this.onTargetReached();
    }
  }

  updateRivals(dt) {
    const m = this.mission;
    if (!m || m.def.id !== 'streetrace') return;
    for (const r of m.rivals) {
      if (r.waiting || r.finished) continue;
      if (r.cpIndex >= RACE_CPS.length) {
        r.finished = true;
        continue;
      }
      const t = RACE_CPS[r.cpIndex];
      const dx = t.x - r.x;
      const dy = t.y - r.y;
      const d = Math.hypot(dx, dy);
      if (d < 70) {
        r.cpIndex += 1;
        continue;
      }
      const want = Math.atan2(dy, dx);
      let diff = want - r.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 1.8));
      driveCar(r, 1, steer, false, dt, this.world.buildings, this.world.cars);
      const sp = Math.hypot(r.vx, r.vy);
      if (sp > RIVAL_SPEED) {
        r.vx *= RIVAL_SPEED / sp;
        r.vy *= RIVAL_SPEED / sp;
      }
    }
  }

  addToast(text) {
    this.toasts.push({ text, life: 2.6 });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  // --- Player ------------------------------------------------------------------
  punch() {
    const p = this.world.player;
    const range = 54;
    let best = null;
    let bestD = Infinity;
    for (const ped of this.world.peds) {
      if (ped.state === 'down') continue;
      const dx = ped.x - p.x;
      const dy = ped.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > range) continue;
      let diff = Math.atan2(dy, dx) - p.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > 1.9) continue;
      if (d < bestD) { bestD = d; best = ped; }
    }
    this.tone(160, 0.07, 'square', 0.12);
    if (!best) return;
    const dmg = p.hasBat ? 50 : 25;
    const firstHit = best.state === 'walk' && best.fleeT <= 0;
    best.hp -= dmg;
    best.hitT = 0.2;
    if (best.state === 'rival') {
      // Rivals stand their ground and keep fighting.
    } else {
      best.fleeT = 1.6;
      best.fleeX = p.x;
      best.fleeY = p.y;
      if (firstHit) this.addWanted(1);
    }
    if (best.hp <= 0) {
      best.hp = 0;
      best.state = 'down';
      if (best.state !== 'rival' && best.fleeT > 0) this.addWanted(1);
    }
    this.spawnSparks(best.x, best.y, 4);
  }

  tryEnterCar() {
    const p = this.world.player;
    let best = null;
    let bestD = 82;
    for (const car of this.world.cars) {
      if (car.driver !== 'none' && car.driver !== 'traffic') continue;
      if (car.hp <= 0) continue;
      const d = Math.hypot(car.x - p.x, car.y - p.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (!best) return;
    if (best.driver === 'traffic') {
      this.addWanted(1);
      this.addToast('Car stolen! +1★');
    }
    best.driver = 'player';
    best.parked = false;
    p.inCar = best;
    p.x = best.x;
    p.y = best.y;
    p.angle = best.angle;
    this.blip(440, 0.08);
  }

  tryBuy() {
    const p = this.world.player;
    const nearGarage = Math.hypot(p.x - PLACES.garage.x, p.y - PLACES.garage.y) < 110;
    const nearSafe = Math.hypot(p.x - PLACES.safehouse.x, p.y - PLACES.safehouse.y) < 110;
    if (nearGarage && p.inCar && p.inCar.hp < 100) {
      if (this.cash >= PRICES.repair) {
        this.cash -= PRICES.repair;
        p.inCar.hp = 100;
        this.addToast(`Repaired! -$${PRICES.repair}`);
        this.jingle();
      } else {
        this.addToast('Not enough cash to repair!');
      }
      return;
    }
    if (nearGarage && !this.owned.comet) {
      if (this.cash >= PRICES.comet) {
        this.cash -= PRICES.comet;
        this.owned.comet = true;
        const car = makeCar('sports', PLACES.garage.x + 60, PLACES.garage.y + 40, 'none', 0);
        this.world.cars.push(car);
        this.addToast('Comet GT bought! It is parked at the garage.');
        this.jingle();
        this.save();
      } else {
        this.addToast(`Comet GT costs $${PRICES.comet} — you have $${this.cash}.`);
      }
      return;
    }
    if (nearSafe && !this.owned.safehouse) {
      if (this.cash >= PRICES.safehouse) {
        this.cash -= PRICES.safehouse;
        this.owned.safehouse = true;
        this.addToast('Safehouse bought! The heat fades faster here.');
        this.jingle();
        this.save();
      } else {
        this.addToast(`Safehouse costs $${PRICES.safehouse}.`);
      }
    }
  }

  collectPickups() {
    const p = this.world.player;
    for (const pk of this.world.pickups) {
      if (pk.taken) continue;
      if (Math.hypot(pk.x - p.x, pk.y - p.y) > 32) continue;
      pk.taken = true;
      pk.respawnT = 60;
      if (pk.kind === 'cash') {
        const amount = 40 + Math.floor(this.rng.next() * 41);
        this.cash += amount;
        this.addToast(`+$${amount}`);
      } else if (pk.kind === 'health') {
        p.hp = Math.min(100, p.hp + 40);
        this.addToast('+40 Health');
      } else if (pk.kind === 'armor') {
        p.armor = Math.min(100, p.armor + 50);
        this.addToast('+50 Armor');
      } else if (pk.kind === 'bat') {
        p.hasBat = true;
        this.addToast('Baseball bat! Double punch damage.');
      }
      this.blip(990, 0.1);
    }
  }

  updatePickups(dt) {
    for (const pk of this.world.pickups) {
      if (!pk.taken) continue;
      pk.respawnT -= dt;
      if (pk.respawnT <= 0) {
        const p = nearestRoadPoint(this.rng.range(260, 2960), this.rng.range(260, 1960));
        pk.x = p.x + this.rng.range(-40, 40);
        pk.y = p.y + this.rng.range(-40, 40);
        pk.taken = false;
      }
    }
  }

  spawnSparks(x, y, n) {
    for (let i = 0; i < n; i += 1) {
      this.world.particles.push({
        x, y,
        vx: this.rng.range(-120, 120), vy: this.rng.range(-120, 120),
        life: 0.4, max: 0.4, color: '#ffd76a', size: 3,
      });
    }
  }

  spawnSmoke(x, y) {
    this.world.particles.push({
      x: x + this.rng.range(-8, 8), y: y + this.rng.range(-8, 8),
      vx: this.rng.range(-20, 20), vy: this.rng.range(-50, -10),
      life: 0.9, max: 0.9, color: '#777', size: 6,
    });
  }

  updateParticles(dt) {
    const { particles, skids } = this.world;
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const pt = particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) particles.splice(i, 1);
    }
    for (let i = skids.length - 1; i >= 0; i -= 1) {
      skids[i].life -= dt * 0.25;
      if (skids[i].life <= 0) skids.splice(i, 1);
    }
    if (particles.length > 220) particles.splice(0, particles.length - 220);
    if (skids.length > 140) skids.splice(0, skids.length - 140);
  }

  updatePrompt() {
    const p = this.world.player;
    if (this.retryIndex !== null && this.retryIndex >= 0) {
      this.prompt = 'ENTER — Retry mission';
      return;
    }
    if (!p.inCar) {
      let best = null;
      let bestD = 82;
      for (const car of this.world.cars) {
        if (car.driver !== 'none' && car.driver !== 'traffic') continue;
        if (car.hp <= 0) continue;
        const d = Math.hypot(car.x - p.x, car.y - p.y);
        if (d < bestD) { bestD = d; best = car; }
      }
      if (best) {
        this.prompt = best.driver === 'traffic' ? 'E — Steal car' : `E — Get in the ${VEHICLES[best.kind].name}`;
        return;
      }
      if (Math.hypot(p.x - PLACES.garage.x, p.y - PLACES.garage.y) < 110) {
        if (!this.owned.comet) {
          this.prompt = `B — Buy Comet GT $${PRICES.comet}`;
          return;
        }
      }
      if (Math.hypot(p.x - PLACES.safehouse.x, p.y - PLACES.safehouse.y) < 110 && !this.owned.safehouse) {
        this.prompt = `B — Buy Safehouse $${PRICES.safehouse}`;
        return;
      }
    } else if (p.inCar.hp < 100 && Math.hypot(p.x - PLACES.garage.x, p.y - PLACES.garage.y) < 110) {
      this.prompt = `B — Repair $${PRICES.repair}`;
      return;
    }
    this.prompt = '';
  }

  updatePlayer(dt) {
    const p = this.world.player;
    if (p.inCar) {
      this.updateDriving(dt);
      return;
    }
    const mv = this.input.moveVector();
    const sprint = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const speed = sprint ? SPRINT_SPEED : ON_FOOT_SPEED;
    const ox = p.x;
    const oy = p.y;
    p.x += mv.x * speed * dt;
    p.y += mv.y * speed * dt;
    if (mv.x !== 0 || mv.y !== 0) p.angle = Math.atan2(mv.y, mv.x);
    collideBuildings(p, 13, this.world.buildings);
    if (inWater(p.x, p.y, this.world.water)) {
      p.x = ox;
      p.y = oy;
    }
    p.punchT = Math.max(0, (p.punchT || 0) - dt);
    if ((this.input.pressed('KeyJ') || this.input.pressed('KeyF')) && p.punchT <= 0) {
      p.punchT = 0.35;
      this.punch();
    }
    if (this.input.pressed('KeyE')) this.tryEnterCar();
    if (this.input.pressed('KeyB')) this.tryBuy();
    this.collectPickups();
  }

  updateDriving(dt) {
    const p = this.world.player;
    const car = p.inCar;
    // The car follows the player position, so scripted teleports move it too.
    car.x = p.x;
    car.y = p.y;
    const throttle = (this.input.isDown('KeyW') || this.input.isDown('ArrowUp') ? 1 : 0)
      + (this.input.isDown('KeyS') || this.input.isDown('ArrowDown') ? -1 : 0);
    const steer = (this.input.isDown('KeyD') || this.input.isDown('ArrowRight') ? 1 : 0)
      + (this.input.isDown('KeyA') || this.input.isDown('ArrowLeft') ? -1 : 0);
    const hand = this.input.isDown('Space');
    const impact = driveCar(car, throttle, steer, hand, dt, this.world.buildings, this.world.cars);
    if (impact > 220) {
      this.crashSound();
      this.shake = Math.max(this.shake, 7);
      this.spawnSparks(car.x, car.y, 6);
    }
    if (hand && Math.hypot(car.vx, car.vy) > 120) {
      this.world.skids.push({ x: car.x, y: car.y, angle: car.angle, life: 1 });
      if (Math.random() < dt * 22) this.spawnSmoke(car.x - Math.cos(car.angle) * 18, car.y - Math.sin(car.angle) * 18);
    }
    if (car.hp < 35 && Math.random() < dt * 6) {
      this.spawnSmoke(car.x, car.y - 10);
    }
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (this.input.pressed('KeyE')) {
      const side = car.angle + Math.PI / 2;
      p.x = car.x + Math.cos(side) * 36;
      p.y = car.y + Math.sin(side) * 36;
      p.inCar = null;
      car.driver = 'none';
      car.parked = true;
      car.vx = 0;
      car.vy = 0;
      return;
    }
    // Running pedestrians over.
    const sp = Math.hypot(car.vx, car.vy);
    for (const ped of this.world.peds) {
      if (ped.state === 'down') continue;
      if (Math.hypot(ped.x - car.x, ped.y - car.y) < car.r + 10 && sp > 120) {
        ped.hp = 0;
        ped.state = 'down';
        this.addWanted(2);
        this.addToast('Pedestrian down! +2★');
        this.crashSound();
      }
    }
    // Near-miss bonus in traffic.
    for (const other of this.world.cars) {
      if (other === car || other.driver !== 'traffic') continue;
      const d = Math.hypot(other.x - car.x, other.y - car.y);
      if (d < 58 && d > 34 && sp > 200 && (other.nearMissT || 0) <= 0) {
        other.nearMissT = 2;
        this.cash += 10;
        this.addToast('Near miss! +$10');
        this.blip(880, 0.06);
      }
      if (other.nearMissT) other.nearMissT -= dt;
    }
    if (car.hp <= 0) {
      this.addToast('Your car is wrecked!');
      p.inCar = null;
      p.x = car.x + 36;
      p.y = car.y;
      car.driver = 'none';
      car.parked = true;
      if (car === this.raceCar) this.failMission('Your race car is wrecked!');
    }
    if (this.input.pressed('KeyB')) this.tryBuy();
    this.collectPickups();
  }

  // --- Audio: everything synthesized with WebAudio, no audio files ------------
  ensureAudio() {
    if (this.audio) {
      if (this.audio.state === 'suspended') this.audio.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.audio = new AC();
      this.master = this.audio.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.audio.destination);
      this.radioNext = this.audio.currentTime + 0.1;
      this.radioTimer = window.setInterval(() => this.radioTick(), 40);
    } catch (e) {
      this.audio = null;
    }
  }

  tone(freq, dur, type = 'square', vol = 0.1, when = 0) {
    if (!this.audio || !this.master) return;
    try {
      const t = this.audio.currentTime + when;
      const o = this.audio.createOscillator();
      const g = this.audio.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.05);
    } catch (e) {
      // Audio is best-effort.
    }
  }

  blip(freq, dur = 0.08) {
    this.tone(freq, dur, 'square', 0.09);
  }

  jingle() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.13, i * 0.1));
  }

  crashSound() {
    this.tone(95, 0.25, 'sawtooth', 0.18);
    this.tone(60, 0.3, 'square', 0.13, 0.03);
  }

  startSiren() {
    if (!this.audio || this.sirenTimer) return;
    this.sirenTimer = window.setInterval(() => {
      if (!this.audio) return;
      this.sirenHigh = !this.sirenHigh;
      this.tone(this.sirenHigh ? 950 : 700, 0.38, 'sine', 0.045);
    }, 400);
  }

  stopSiren() {
    if (this.sirenTimer) {
      window.clearInterval(this.sirenTimer);
      this.sirenTimer = null;
    }
  }

  cycleRadio() {
    if (!this.radioStation) {
      this.radioStation = RADIO_STATIONS[0];
    } else if (this.radioStation === RADIO_STATIONS[0]) {
      this.radioStation = RADIO_STATIONS[1];
    } else {
      this.radioStation = null;
    }
    this.radioStep = 0;
    if (this.audio) this.radioNext = this.audio.currentTime + 0.05;
    this.blip(this.radioStation ? 1200 : 300, 0.06);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    this.addToast(this.muted ? 'Muted' : 'Sound on');
  }

  // Tiny step sequencer: two synthesized stations, no samples.
  radioTick() {
    if (!this.audio || !this.radioStation || this.muted) return;
    const synth = this.radioStation === RADIO_STATIONS[0];
    const stepDur = synth ? 60 / 112 / 2 : 60 / 76 / 2;
    while (this.radioNext < this.audio.currentTime + 0.15) {
      const when = Math.max(0, this.radioNext - this.audio.currentTime);
      const s = this.radioStep % 16;
      if (synth) {
        // Synthwave: driving bass arpeggio in A minor + a pad every bar.
        const bass = [55, 55, 65.41, 82.41, 55, 49, 82.41, 73.42, 55, 55, 65.41, 98, 82.41, 73.42, 65.41, 49][s];
        this.tone(bass * 2, stepDur * 0.9, 'sawtooth', 0.05, when);
        if (s === 0) {
          [220, 261.63, 329.63].forEach((f) => this.tone(f, stepDur * 8, 'triangle', 0.02, when));
        }
        if (s % 4 === 2) this.tone(880, 0.05, 'square', 0.02, when);
      } else {
        // Lo-fi: slow jazzy chords, one per bar, soft triangle.
        const chords = [
          [220, 261.63, 329.63, 392],
          [174.61, 220, 261.63, 349.23],
          [130.81, 196, 261.63, 329.63],
          [196, 246.94, 293.66, 392],
        ];
        const chord = chords[Math.floor(this.radioStep / 16) % 4];
        if (s % 8 === 0) {
          chord.forEach((f) => this.tone(f, stepDur * 8, 'triangle', 0.03, when));
        }
        if (s % 2 === 0) this.tone(chord[0] / 2, stepDur, 'sine', 0.05, when);
      }
      this.radioStep += 1;
      this.radioNext += stepDur;
    }
  }

  // --- Main loop -------------------------------------------------------------------
  update(dt) {
    const input = this.input;
    if (this.screen === 'title') {
      if (input.pressed('Enter')) {
        this.ensureAudio();
        this.newGame();
      } else if (input.pressed('KeyC') && this.saveExists) {
        this.ensureAudio();
        this.continueSave();
      }
      input.endFrame();
      return;
    }
    if (this.screen === 'pause') {
      if (input.pressed('KeyP') || input.pressed('Escape') || input.pressed('Enter')) {
        this.screen = 'play';
      }
      input.endFrame();
      return;
    }
    if (this.screen === 'busted' || this.screen === 'wasted') {
      this.endTimer -= dt;
      if (this.endTimer <= 0 || input.pressed('Enter')) {
        this.respawn(this.screen === 'busted' ? PLACES.rosa : PLACES.hospital);
      }
      input.endFrame();
      return;
    }
    if (this.screen !== 'play') {
      input.endFrame();
      return;
    }

    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 28);
    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }
    for (const t of this.toasts) t.life -= dt;
    this.toasts = this.toasts.filter((t) => t.life > 0);

    if (this.dialogue && input.pressed('Enter')) this.dialogue = null;
    if (this.retryIndex !== null && this.retryIndex >= 0 && input.pressed('Enter')) {
      const i = this.retryIndex;
      this.retryIndex = null;
      this.startMission(i);
      input.endFrame();
      return;
    }
    if (input.pressed('KeyP') || input.pressed('Escape')) {
      this.screen = 'pause';
      input.endFrame();
      return;
    }
    if (input.pressed('KeyM')) this.toggleMute();
    if (input.pressed('KeyR')) this.cycleRadio();

    this.updatePlayer(dt);
    if (this.screen !== 'play') {
      input.endFrame();
      return;
    }
    updateTraffic(this.world, dt, this.rng);
    updatePeds(this.world, dt, this.rng);
    updatePolice(this.world, dt, this);
    if (this.screen !== 'play') {
      input.endFrame();
      return;
    }
    this.updateRivals(dt);
    this.updateMission(dt);
    this.updatePickups(dt);
    this.updateParticles(dt);

    // The heat decays if Vic keeps his nose clean.
    if (this.wanted > 0) {
      this.wantedTimer += dt;
      if (this.wantedTimer > 25) {
        this.wanted -= 1;
        this.wantedTimer = 0;
        if (this.wanted === 0) this.stopSiren();
      }
    }
    if (this.wanted > 0) this.startSiren();
    else this.stopSiren();

    // Safehouse owners cool off faster.
    if (this.owned.safehouse && this.wanted > 0) {
      const p = this.world.player;
      if (Math.hypot(p.x - PLACES.safehouse.x, p.y - PLACES.safehouse.y) < 130) {
        this.wantedTimer += dt * 2;
      }
    }

    this.updatePrompt();
    const p = this.world.player;
    if (p.hp <= 0) this.wasted();
    input.endFrame();
  }

  draw() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    drawGame(this.ctx, this, W, H);
  }
}

// --- Boot ----------------------------------------------------------------------------
function boot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);
  const params = new URLSearchParams(window.location.search);
  const seedText = params.get('seed') || '1';
  const rng = makeRng(hashSeed(`velmora-${seedText}`));
  const game = new Game(canvas, ctx, params, rng);
  window.__game = game;
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt);
    game.draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

boot();

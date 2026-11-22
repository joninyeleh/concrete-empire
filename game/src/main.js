// Concrete Empire — boot, the one loop, and the rules that tie the world together:
// the player on foot and in cars, the wanted level and the police, the five jobs
// from Rosa, cash and the things it buys, pickups, saving, juice and sound.
//
// ?seed=N fixes the city. ?shot=start|play|drive|mission (with &seed=N) stages
// that scene instead of running the loop, keeps it playing under an autopilot,
// and sets window.__shotReady for a screenshot.

import {
  BLOCK, CAR, CAR_MAX_HP, CITY_NAME, GRID, MISSIONS, NEAR_MISS, PICKUPS, PLACES,
  PLAYER, ROAD, SAVE_KEY, STEP, STORY, VIEW, WANTED_DECAY_SECONDS, WANTED_MAX,
  WANTED_UNSEEN_SECONDS, BUSTED_HOLD_SECONDS, SIGHT_RANGE, placeApproach, placeCenter, roadLine,
} from './config.js';
import { createRandom, clamp, dist, pick, range, rangeInt, angleDiff } from './random.js';
import {
  ACTION_BUY, ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH,
  createInput,
} from './input.js';
import {
  EVENT_CAR_DEAD, EVENT_COP_TOUCH, EVENT_CRASH, EVENT_PED_DOWN, addParticles,
  buildCity, makeCar, makePed, moveCircle, nearestCop, populate, randomRoadPoint,
  randomSidewalkPoint, snapToRoad, stepWorld, witnessed,
} from './world.js';
import {
  SCREEN_BUSTED, SCREEN_DONE, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED,
  createRenderer,
} from './render.js';
import { autopilotInput, stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;
/** No input at all: the title screen's backdrop and frozen screens step with this. */
const NO_INPUT = {
  move: () => ({ x: 0, y: 0 }),
  sprinting: () => false,
  handbrake: () => false,
  takeActions: () => 0,
};

// ---- Sound -----------------------------------------------------------------

function createAudio() {
  let ctx = null;
  let master = null;
  let sirenOsc = null;
  let sirenGain = null;
  let engineOsc = null;
  let engineGain = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }
  function tone(freq, dur, type, vol, when, slideTo) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + (when || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }
  function noise(dur, vol, cutoff) {
    if (!ensure() || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff || 800;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }
  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    blip(freq) { tone(freq || 880, 0.1, 'square', 0.1); },
    coin() {
      tone(988, 0.09, 'square', 0.1);
      tone(1319, 0.16, 'square', 0.1, 0.09);
    },
    thud() { noise(0.14, 0.3, 320); },
    crash() {
      noise(0.35, 0.5, 900);
      tone(70, 0.3, 'sawtooth', 0.18, 0, 38);
    },
    jingle() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'square', 0.1, i * 0.11));
    },
    fail() {
      tone(330, 0.2, 'sawtooth', 0.12);
      tone(220, 0.35, 'sawtooth', 0.12, 0.18);
    },
    /** Two-tone siren while wanted; call every frame with the wanted level. */
    siren(wanted, time) {
      if (!ensure() || muted) return;
      if (wanted <= 0) {
        if (sirenOsc) {
          sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
          const osc = sirenOsc;
          setTimeout(() => { try { osc.stop(); } catch { /* already stopped */ } }, 400);
          sirenOsc = null;
          sirenGain = null;
        }
        return;
      }
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0.045;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
      }
      sirenOsc.frequency.value = Math.floor(time * 2.2) % 2 === 0 ? 715 : 540;
    },
    /** Engine hum tied to the player's speed; call every frame. */
    engine(speed01, driving) {
      if (!ensure() || muted) return;
      if (!driving) {
        if (engineOsc) {
          engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
        }
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        engineOsc.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.value = 52 + speed01 * 95;
      engineGain.gain.setTargetAtTime(0.02 + speed01 * 0.02, ctx.currentTime, 0.1);
    },
  };
}

// ---- Game ------------------------------------------------------------------

export function createGame(seed) {
  const rng = createRandom(seed);
  const audio = createAudio();
  const game = {
    seed,
    rng,
    audio,
    world: null,
    screen: SCREEN_TITLE,
    time: 0,
    camera: { x: 0, y: 0 },
    shake: 0,
    cash: 40,
    armor: 0,
    batTimer: 0,
    wanted: 0,
    seenTimer: 0,
    decayTimer: 0,
    bustedTimer: 0,
    bustedLoss: 0,
    missionsDone: [],
    missionIndex: 0,
    mission: null,
    missionTimer: 0,
    missionDelay: 0,
    dialogue: null,
    dialogueQueue: [],
    popups: [],
    prompt: null,
    pickupTimer: PICKUPS.respawnSeconds,
    inSafehouse: false,
    sportsCar: null,
    garagePoint: null,
    safehousePoint: null,
    showControls: false,
    controlsTimer: 0,
    saveExists: false,
    muted: false,
    story: STORY,
    shotMode: null,
  };

  // Spawn points on sidewalks, clear of traffic: the bar's corner, and the hospital corner.
  const SPAWN_BAR = { x: roadLine(1) + 20, y: roadLine(4) - 116 };
  const SPAWN_HOSPITAL = { x: roadLine(1) - 116, y: roadLine(6) - 116 };

  const world = {
    city: buildCity(rng),
    rng,
    player: {
      x: 0, y: 0, angle: -Math.PI / 2, hp: PLAYER.maxHealth,
      hurtTimer: 0, inCar: null, punchCd: 0, punchAnim: 0,
    },
    cars: [],
    peds: [],
    pickups: [],
    particles: [],
    skids: [],
    time: 0,
    events: 0,
    rivalsDown: 0,
    lastPedDown: null,
  };
  game.world = world;

  // Named places, in world coordinates.
  game.safehousePoint = placeApproach('safehouse');
  game.garagePoint = { x: roadLine(5), y: placeCenter('garage').y };

  function popup(text, color) {
    game.popups.push({ text, color: color || '#ffffff', at: game.time });
    if (game.popups.length > 5) game.popups.shift();
  }
  game.popup = popup;

  function say(speaker, text) {
    game.dialogueQueue.push({ speaker, text });
  }
  game.say = say;

  // ---- Spawning ------------------------------------------------------------

  function spawnPlayerAt(x, y) {
    const p = world.player;
    p.x = x;
    p.y = y;
    p.angle = -Math.PI / 2;
    p.hp = PLAYER.maxHealth;
    p.hurtTimer = 0;
    p.inCar = null;
    p.punchCd = 0;
    p.punchAnim = 0;
  }

  function spawnSportsCar() {
    const c = placeCenter('sportsCar');
    const car = makeCar(rng, 'sport', roadLine(4), c.y, Math.PI / 2, 'none');
    car.color = '#d42a2a';
    car.speed = 0;
    world.cars.push(car);
    game.sportsCar = car;
    return car;
  }

  function spawnPickup() {
    const roll = rng();
    const kind = roll < 0.45 ? 'cash' : roll < 0.7 ? 'health' : roll < 0.85 ? 'armor' : 'bat';
    const point = randomSidewalkPoint(rng);
    world.pickups.push({ kind, x: point.x, y: point.y });
  }

  function reset(newSeed) {
    game.seed = newSeed;
    game.rng = createRandom(newSeed);
    world.rng = game.rng;
    world.city = buildCity(game.rng);
    world.cars = [];
    world.peds = [];
    world.pickups = [];
    world.particles = [];
    world.skids = [];
    world.time = 0;
    world.rivalsDown = 0;
    world.lastPedDown = null;
    game.time = 0;
    game.wanted = 0;
    game.seenTimer = 0;
    game.decayTimer = 0;
    game.bustedTimer = 0;
    game.armor = 0;
    game.batTimer = 0;
    game.mission = null;
    game.missionTimer = 0;
    game.missionDelay = 0;
    game.dialogue = null;
    game.dialogueQueue = [];
    game.popups = [];
    game.prompt = null;
    game.pickupTimer = PICKUPS.respawnSeconds;
    game.inSafehouse = false;
    game.screen = SCREEN_TITLE;
    game.shake = 0;
    const bar = placeCenter('rosasBar');
    spawnPlayerAt(SPAWN_BAR.x, SPAWN_BAR.y);
    populate(world, world.player.x, world.player.y);
    spawnSportsCar();
    for (let i = 0; i < PICKUPS.startCount; i += 1) spawnPickup();
    // The camera starts over Downtown for the title backdrop.
    game.camera.x = clamp(placeCenter('bank').x - VIEW.w / 2, 0, 2592 - VIEW.w);
    game.camera.y = clamp(placeCenter('bank').y - VIEW.h / 2, 0, 2592 - VIEW.h);
    return game;
  }
  game.reset = reset;

  // ---- Save / load ---------------------------------------------------------

  function save() {
    try {
      const p = world.player;
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        cash: game.cash,
        missionsDone: game.missionsDone,
        px: p.inCar ? p.inCar.x : p.x,
        py: p.inCar ? p.inCar.y : p.y,
        hp: Math.max(1, Math.round(p.hp)),
        armor: Math.round(game.armor),
      }));
      game.saveExists = true;
    } catch {
      // Storage can be off: the game still plays, it just does not persist.
    }
  }
  game.save = save;

  function loadSave() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data.cash !== 'number' || !Array.isArray(data.missionsDone)) return null;
      return data;
    } catch {
      return null;
    }
  }
  game.loadSave = loadSave;

  // ---- Wanted & police -----------------------------------------------------

  function nearestPlayerPos() {
    const p = world.player;
    return p.inCar ? { x: p.inCar.x, y: p.inCar.y } : { x: p.x, y: p.y };
  }

  function spawnCopCar(ahead) {
    const pos = nearestPlayerPos();
    let point;
    if (ahead) {
      const p = world.player;
      const heading = p.inCar ? p.inCar.angle : p.angle;
      point = snapToRoad(pos.x + Math.cos(heading) * 620, pos.y + Math.sin(heading) * 620);
    } else {
      point = randomRoadPoint(rng, 0);
      let tries = 0;
      while (dist(point.x, point.y, pos.x, pos.y) < 420 && tries < 10) {
        point = randomRoadPoint(rng, 0);
        tries += 1;
      }
    }
    const car = makeCar(rng, 'police', point.x, point.y, 0, 'cop');
    world.cars.push(car);
    return car;
  }
  game.spawnCopCar = spawnCopCar;

  function spawnCopPed() {
    const pos = nearestPlayerPos();
    const point = randomSidewalkPoint(rng);
    let tries = 0;
    while (dist(point.x, point.y, pos.x, pos.y) < 220 && tries < 10) {
      const p2 = randomSidewalkPoint(rng);
      point.x = p2.x;
      point.y = p2.y;
      tries += 1;
    }
    const ped = makePed(rng, point.x, point.y, 'cop');
    world.peds.push(ped);
    return ped;
  }

  function countCops() {
    let cars = 0;
    let foot = 0;
    for (const car of world.cars) if (car.driver === 'cop') cars += 1;
    for (const ped of world.peds) if (ped.kind === 'cop') foot += 1;
    return { cars, foot };
  }

  function ensureCops() {
    const want = game.wanted;
    const wantCars = Math.min(4, want);
    const wantFoot = want >= 2 ? Math.min(3, want - 1) : 0;
    const have = countCops();
    for (let i = have.cars; i < wantCars; i += 1) spawnCopCar(want >= 4);
    for (let i = have.foot; i < wantFoot; i += 1) spawnCopPed();
    if (want === 0) {
      // No heat, no heat: far-off cops drive away and despawn.
      const pos = nearestPlayerPos();
      world.cars = world.cars.filter((car) => car.driver !== 'cop' || dist(car.x, car.y, pos.x, pos.y) < 900);
      world.peds = world.peds.filter((ped) => ped.kind !== 'cop' || dist(ped.x, ped.y, pos.x, pos.y) < 900);
    } else {
      // Too many cops for the current heat: the furthest ones leave.
      const pos = nearestPlayerPos();
      const cops = world.cars.filter((car) => car.driver === 'cop');
      if (cops.length > wantCars) {
        cops.sort((a, b) => dist(b.x, b.y, pos.x, pos.y) - dist(a.x, a.y, pos.x, pos.y));
        for (let i = wantCars; i < cops.length; i += 1) {
          const index = world.cars.indexOf(cops[i]);
          if (index >= 0) world.cars.splice(index, 1);
        }
      }
      const foot = world.peds.filter((ped) => ped.kind === 'cop');
      if (foot.length > wantFoot) {
        foot.sort((a, b) => dist(b.x, b.y, pos.x, pos.y) - dist(a.x, a.y, pos.x, pos.y));
        for (let i = wantFoot; i < foot.length; i += 1) {
          const index = world.peds.indexOf(foot[i]);
          if (index >= 0) world.peds.splice(index, 1);
        }
      }
    }
  }

  function addWanted(n) {
    if (n <= 0) return;
    game.wanted = Math.min(WANTED_MAX, game.wanted + n);
    game.seenTimer = 0;
    game.decayTimer = 0;
    ensureCops();
  }
  game.addWanted = addWanted;

  function setWanted(n) {
    game.wanted = clamp(n, 0, WANTED_MAX);
    game.seenTimer = 0;
    game.decayTimer = 0;
    ensureCops();
  }
  game.setWanted = setWanted;

  function updateWanted(dt) {
    const pos = nearestPlayerPos();
    const near = nearestCop(world, pos.x, pos.y);
    const seen = near.cop !== null && near.dist < SIGHT_RANGE;
    if (seen) {
      game.seenTimer = 0;
      game.decayTimer = 0;
      return;
    }
    if (game.wanted === 0) return;
    game.seenTimer += dt;
    if (game.seenTimer < WANTED_UNSEEN_SECONDS) return;
    game.decayTimer += dt * (game.inSafehouse ? 3 : 1);
    while (game.decayTimer >= WANTED_DECAY_SECONDS && game.wanted > 0) {
      game.wanted -= 1;
      game.decayTimer -= WANTED_DECAY_SECONDS;
    }
    ensureCops();
  }

  // ---- Missions ------------------------------------------------------------

  function startMission(index) {
    const def = MISSIONS[index];
    if (!def) return;
    // The marker sits where the player can actually stand: the road in front of
    // the place — except the turf war, which is fought inside the park itself.
    const target = def.type === 'fight' ? placeCenter(def.place) : placeApproach(def.place);
    game.mission = {
      def,
      title: def.title,
      objective: def.objective,
      target: { x: target.x, y: target.y, label: PLACES[def.place].name },
      step: 'go',
      timer: def.timeLimit || 0,
      holdTimer: 0,
      rivalsLeft: def.rivals || 0,
    };
    game.missionTimer = def.timeLimit || 0;
    game.missionIndex = index;
    if (def.type === 'fight') {
      const park = placeCenter('park');
      for (let i = 0; i < def.rivals; i += 1) {
        const rival = makePed(rng, park.x + range(rng, -90, 90), park.y + range(rng, -90, 90), 'rival');
        rival.speed = 150;
        rival.punchCd = 0;
        world.peds.push(rival);
      }
    }
    say('ROSA', def.brief);
  }
  game.startMission = startMission;

  function completeMission() {
    const m = game.mission;
    if (!m) return;
    game.cash += m.def.reward;
    popup(`+$${m.def.reward} — ${m.def.title.toUpperCase()} DONE`, '#7be495');
    audio.jingle();
    game.missionsDone.push(m.def.id);
    game.mission = null;
    game.missionTimer = 0;
    save();
    if (game.missionsDone.length >= MISSIONS.length) {
      game.missionDelay = 1.4;
      game.pendingDone = true;
    } else {
      game.missionDelay = 3;
    }
  }

  function failMission(reason) {
    const m = game.mission;
    if (!m) return;
    popup(`JOB FAILED — ${reason}`, '#ff8a7a');
    audio.fail();
    game.mission = null;
    game.missionTimer = 0;
    game.missionDelay = 5; // Rosa calls again with the same job.
  }

  function updateMission(dt) {
    const m = game.mission;
    if (!m) {
      if (game.missionDelay > 0) {
        game.missionDelay -= dt;
        if (game.missionDelay <= 0) {
          if (game.pendingDone) {
            game.pendingDone = false;
            game.screen = SCREEN_DONE;
            return;
          }
          if (game.missionIndex < MISSIONS.length) startMission(game.missionIndex);
        }
      }
      return;
    }
    const p = world.player;
    const pos = nearestPlayerPos();
    const def = m.def;
    const atTarget = dist(pos.x, pos.y, m.target.x, m.target.y) < 70;

    if (def.type === 'collect') {
      if (m.step === 'go' && atTarget) {
        m.step = 'return';
        const back = placeApproach(def.returnPlace);
        m.target = { x: back.x, y: back.y, label: PLACES[def.returnPlace].name };
        m.objective = def.objectiveReturn;
        popup('Package secured', '#ffd23e');
        audio.coin();
      } else if (m.step === 'return' && atTarget) {
        completeMission();
      }
    } else if (def.type === 'steal') {
      if (m.step === 'go' && p.inCar === game.sportsCar) {
        m.step = 'escape';
        m.objective = def.objectiveReturn;
        popup('The Comet GT is yours — lose them!', '#ffd23e');
      } else if (m.step === 'escape' && game.wanted === 0) {
        completeMission();
      }
    } else if (def.type === 'timed') {
      game.missionTimer -= dt;
      m.timer = game.missionTimer;
      if (atTarget) {
        completeMission();
      } else if (game.missionTimer <= 0) {
        failMission('Out of time.');
      }
    } else if (def.type === 'fight') {
      if (m.rivalsLeft <= 0) completeMission();
    } else if (def.type === 'heist') {
      if (m.step === 'go' && atTarget) {
        m.step = 'hold';
        m.objective = 'Crack the vault — stay in the marker';
        m.holdTimer = 0;
      } else if (m.step === 'hold') {
        if (atTarget) {
          m.holdTimer += dt;
          if (m.holdTimer >= def.holdSeconds) {
            m.step = 'escape';
            const safe = placeApproach(def.returnPlace);
            m.target = { x: safe.x, y: safe.y, label: PLACES[def.returnPlace].name };
            m.objective = def.objectiveReturn;
            setWanted(3);
            popup('THE VAULT IS OPEN — RUN!', '#ff8a7a');
            audio.crash();
          }
        } else {
          m.holdTimer = Math.max(0, m.holdTimer - dt * 2);
        }
      } else if (m.step === 'escape' && atTarget) {
        completeMission();
      }
    }
  }

  // ---- Combat & cars -------------------------------------------------------

  function doPunch() {
    const p = world.player;
    if (p.punchCd > 0 || p.inCar) return;
    p.punchCd = PLAYER.punchCooldown;
    p.punchAnim = 0.18;
    const damage = PLAYER.punchDamage * (game.batTimer > 0 ? PICKUPS.batDamage : 1);
    let hitSomething = false;
    let crimeSeen = false;
    for (const ped of world.peds) {
      if (ped.state === 'down') continue;
      const d = dist(p.x, p.y, ped.x, ped.y);
      if (d > PLAYER.punchRange + 12) continue;
      const toPed = Math.atan2(ped.y - p.y, ped.x - p.x);
      if (Math.abs(angleDiff(p.angle, toPed)) > PLAYER.punchArc) continue;
      hitSomething = true;
      ped.hp -= damage;
      addParticles(world, ped.x, ped.y, 8, ['#ffffff', '#ffd23e'], 160, 0.35, 3);
      audio.thud();
      game.shake = Math.max(game.shake, 5);
      if (ped.kind === 'rival') {
        if (ped.hp <= 0) {
          ped.state = 'down';
          ped.stateTimer = 6;
          game.cash += 25;
          popup('+$25 TURF', '#ffd23e');
          if (game.mission && game.mission.def.type === 'fight') {
            game.mission.rivalsLeft = Math.max(0, game.mission.rivalsLeft - 1);
          }
        } else {
          ped.state = 'flee';
          ped.stateTimer = 1.5;
        }
      } else if (ped.kind === 'cop') {
        addWanted(1);
        if (ped.hp <= 0) {
          ped.state = 'down';
          ped.stateTimer = 6;
        } else {
          ped.state = 'flee';
          ped.stateTimer = 1;
        }
      } else {
        if (ped.hp <= 0) {
          ped.state = 'down';
          ped.stateTimer = 5;
        } else {
          ped.state = 'flee';
          ped.stateTimer = 3;
        }
        if (witnessed(world, p.x, p.y)) crimeSeen = true;
      }
    }
    if (crimeSeen) addWanted(1);
    if (!hitSomething) {
      // A swing at the air still makes a little noise.
      audio.thud();
    }
  }

  function nearestCar(maxD) {
    const p = world.player;
    let best = null;
    let bestD = maxD;
    for (const car of world.cars) {
      if (car.hp <= 0) continue;
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function enterCar(car) {
    const p = world.player;
    if (car.driver === 'traffic') {
      // The driver is thrown out and runs for it.
      const driver = makePed(rng, car.x + 26, car.y + 10, 'citizen');
      driver.state = 'flee';
      driver.stateTimer = 4;
      driver.target = { x: car.x + 300, y: car.y - 200 };
      world.peds.push(driver);
      if (witnessed(world, p.x, p.y)) {
        addWanted(1);
        popup('CARJACKING!', '#ff8a7a');
      }
    }
    car.driver = 'player';
    p.inCar = car;
    p.x = car.x;
    p.y = car.y;
    audio.blip(520);
  }

  function exitCar() {
    const p = world.player;
    const car = p.inCar;
    if (!car) return;
    car.driver = 'none';
    const nx = -Math.sin(car.angle);
    const ny = Math.cos(car.angle);
    let spot = moveCircle(world.city, car.x + nx * 30, car.y + ny * 30, 0, 0, 13);
    if (spot.x === car.x + nx * 30 && spot.y === car.y + ny * 30) {
      p.x = spot.x;
      p.y = spot.y;
    } else {
      spot = moveCircle(world.city, car.x - nx * 30, car.y - ny * 30, 0, 0, 13);
      p.x = spot.x;
      p.y = spot.y;
    }
    p.inCar = null;
    p.angle = car.angle;
  }

  function buyOrRepair() {
    const p = world.player;
    // Buy the showroom Comet GT, clean: no heat.
    const car = game.sportsCar;
    if (!p.inCar && car && car.driver === 'none' && dist(p.x, p.y, car.x, car.y) < 70 && game.cash >= PICKUPS.sportsCarPrice) {
      game.cash -= PICKUPS.sportsCarPrice;
      popup(`Comet GT bought — $${PICKUPS.sportsCarPrice}, no heat`, '#7be495');
      audio.jingle();
      enterCar(car);
      if (game.mission && game.mission.def.type === 'steal' && game.mission.step === 'go') {
        completeMission();
      }
      return;
    }
    // Repair at the garage.
    if (p.inCar && dist(p.inCar.x, p.inCar.y, game.garagePoint.x, game.garagePoint.y) < 90
      && p.inCar.hp < CAR_MAX_HP && game.cash >= PICKUPS.repairCost) {
      game.cash -= PICKUPS.repairCost;
      p.inCar.hp = CAR_MAX_HP;
      addParticles(world, p.inCar.x, p.inCar.y, 16, ['#7be495', '#ffd23e'], 140, 0.6, 4);
      popup(`Ride repaired — $${PICKUPS.repairCost}`, '#7be495');
      audio.jingle();
    }
  }

  // ---- Pickups, safehouse, near misses -------------------------------------

  function updatePickups(dt) {
    const p = world.player;
    const pos = nearestPlayerPos();
    const radius = p.inCar ? 36 : 26;
    for (let i = world.pickups.length - 1; i >= 0; i -= 1) {
      const pk = world.pickups[i];
      if (dist(pos.x, pos.y, pk.x, pk.y) > radius) continue;
      world.pickups.splice(i, 1);
      if (pk.kind === 'cash') {
        const amount = rangeInt(rng, PICKUPS.cashMin, PICKUPS.cashMax);
        game.cash += amount;
        popup(`+$${amount}`, '#7be495');
        audio.coin();
      } else if (pk.kind === 'health') {
        p.hp = Math.min(PLAYER.maxHealth, p.hp + PICKUPS.healthHeal);
        popup(`+${PICKUPS.healthHeal} HP`, '#7be495');
        audio.coin();
      } else if (pk.kind === 'armor') {
        game.armor = PICKUPS.armorAmount;
        popup('ARMOR UP', '#9db8f5');
        audio.coin();
      } else {
        game.batTimer = PICKUPS.batSeconds;
        popup(`BAT — ${PICKUPS.batSeconds}s of double damage`, '#e8c98a');
        audio.coin();
      }
    }
    game.pickupTimer -= dt;
    if (game.pickupTimer <= 0) {
      game.pickupTimer = PICKUPS.respawnSeconds;
      if (world.pickups.length < PICKUPS.maxCount) {
        const roll = rng();
        const kind = roll < 0.45 ? 'cash' : roll < 0.7 ? 'health' : roll < 0.85 ? 'armor' : 'bat';
        const point = randomSidewalkPoint(rng);
        world.pickups.push({ kind, x: point.x, y: point.y });
      }
    }
  }

  function updateSafehouse(dt) {
    const pos = nearestPlayerPos();
    const inside = dist(pos.x, pos.y, game.safehousePoint.x, game.safehousePoint.y) < 130;
    if (inside && !game.inSafehouse) {
      game.inSafehouse = true;
      save();
      popup('Safehouse — progress saved', '#7be495');
    } else if (!inside) {
      game.inSafehouse = false;
    }
    if (inside) {
      const p = world.player;
      p.hp = Math.min(PLAYER.maxHealth, p.hp + 3 * dt);
    }
  }

  function updateNearMiss(dt) {
    const p = world.player;
    if (!p.inCar) return;
    const speed = Math.sqrt(p.inCar.vx * p.inCar.vx + p.inCar.vy * p.inCar.vy);
    if (speed < NEAR_MISS.minSpeed) return;
    for (const car of world.cars) {
      if (car.driver !== 'traffic') continue;
      car.nearMissCd = Math.max(0, (car.nearMissCd || 0) - dt);
      const d = dist(p.inCar.x, p.inCar.y, car.x, car.y);
      if (d >= 30 && d <= NEAR_MISS.range && car.nearMissCd <= 0) {
        car.nearMissCd = NEAR_MISS.cooldown;
        game.cash += NEAR_MISS.reward;
        popup(`+$${NEAR_MISS.reward} NEAR MISS`, '#ffd23e');
        audio.blip(1200);
      }
    }
  }

  // ---- Busted / wasted -------------------------------------------------------

  function loseCash(fraction) {
    const loss = Math.floor(game.cash * fraction);
    game.cash -= loss;
    return loss;
  }

  function busted() {
    game.bustedLoss = loseCash(0.2);
    game.wanted = 0;
    world.player.hp = PLAYER.maxHealth;
    world.player.inCar = null;
    world.cars = world.cars.filter((car) => car.driver !== 'cop');
    world.peds = world.peds.filter((ped) => ped.kind !== 'cop');
    const bar = placeCenter('rosasBar');
    spawnPlayerAt(SPAWN_BAR.x, SPAWN_BAR.y);
    if (game.mission) failMission('Busted by the Velmora PD.');
    game.missionDelay = 5;
    game.screen = SCREEN_BUSTED;
    say('ROSA', 'ROSA: Bail is paid. Do not get caught again — it comes out of your cut.');
    save();
  }

  function wasted() {
    game.bustedLoss = loseCash(0.2);
    game.wanted = 0;
    world.player.hp = PLAYER.maxHealth;
    world.player.inCar = null;
    world.cars = world.cars.filter((car) => car.driver !== 'cop');
    world.peds = world.peds.filter((ped) => ped.kind !== 'cop');
    spawnPlayerAt(SPAWN_HOSPITAL.x, SPAWN_HOSPITAL.y);
    if (game.mission) failMission('You woke up in St. Mary\'s.');
    game.missionDelay = 5;
    game.screen = SCREEN_WASTED;
    say('ROSA', "ROSA: The hospital bill is on me. This time. Don't make it a habit.");
    save();
  }

  // ---- One fixed step of play ------------------------------------------------

  function stepPlay(dt, input) {
    const p = world.player;
    const actions = input.takeActions();

    // Pause first: it leaves play immediately.
    if (actions & ACTION_PAUSE) {
      game.screen = SCREEN_PAUSED;
      return;
    }

    // Dialogue: Enter dismisses it (it also fades on its own after 8 seconds).
    // E is never hijacked by dialogue — it always does its car action.
    if (game.dialogue) {
      if (actions & ACTION_CONFIRM) game.dialogue = null;
    } else if (game.dialogueQueue.length > 0) {
      game.dialogue = { ...game.dialogueQueue.shift(), t: 8 };
    }
    if (game.dialogue) {
      game.dialogue.t -= dt;
      if (game.dialogue.t <= 0) game.dialogue = null;
    }

    if (actions & ACTION_MUTE) {
      game.muted = !game.muted;
      audio.setMuted(game.muted);
      popup(game.muted ? 'Sound off (M to unmute)' : 'Sound on', '#ffffff');
    }

    // Timers.
    if (p.punchCd > 0) p.punchCd -= dt;
    if (p.punchAnim > 0) p.punchAnim -= dt;
    if (p.hurtTimer > 0) p.hurtTimer -= dt;
    if (game.crashCd > 0) game.crashCd -= dt;
    if (game.batTimer > 0) game.batTimer -= dt;
    if (game.showControls) {
      game.controlsTimer -= dt;
      if (game.controlsTimer <= 0) game.showControls = false;
    }
    for (const ped of world.peds) {
      if (ped.punchCd > 0) ped.punchCd -= dt;
    }

    // Enter / exit / steal / buy / repair.
    if (actions & ACTION_ENTER) {
      if (p.inCar) exitCar();
      else {
        const car = nearestCar(60);
        if (car) enterCar(car);
      }
    }
    if (actions & ACTION_BUY) buyOrRepair();
    if (actions & ACTION_PUNCH) doPunch();

    // Move the player on foot, or let the world drive their car.
    if (p.inCar) {
      p.x = p.inCar.x;
      p.y = p.inCar.y;
      p.angle = p.inCar.angle;
    } else {
      const move = input.move();
      const speed = input.sprinting() ? PLAYER.sprint : PLAYER.walk;
      if (move.x !== 0 || move.y !== 0) {
        p.angle = Math.atan2(move.y, move.x);
      }
      const moved = moveCircle(world.city, p.x, p.y, move.x * speed * dt, move.y * speed * dt, PLAYER.radius);
      p.x = moved.x;
      p.y = moved.y;
    }

    // Rivals chase and swing at the player during the turf war.
    if (game.mission && game.mission.def.type === 'fight') {
      for (const ped of world.peds) {
        if (ped.kind !== 'rival' || ped.state === 'down') continue;
        const d = dist(ped.x, ped.y, p.x, p.y);
        if (d < 500) {
          ped.target = { x: p.x, y: p.y };
          ped.speed = 150;
          if (d < 30 && ped.punchCd <= 0 && !p.inCar) {
            ped.punchCd = 0.9;
            damagePlayer(6);
            audio.thud();
          }
        }
      }
    }

    const events = stepWorld(world, input, dt);
    if (events & EVENT_CRASH) {
      game.shake = Math.max(game.shake, 13);
      audio.crash();
      // Crashes hurt, but not every frame of a pile-up: half a second between hits.
      if (game.crashCd <= 0) {
        game.crashCd = 0.5;
        damagePlayer(4);
      }
    }
    if (events & EVENT_PED_DOWN) {
      const ped = world.lastPedDown;
      if (ped) {
        if (ped.kind === 'cop') addWanted(2);
        else if (witnessed(world, ped.x, ped.y)) addWanted(1);
        if (ped.kind !== 'rival') popup(ped.kind === 'cop' ? 'You ran over a cop!' : 'Pedestrian down!', '#ff8a7a');
      }
      game.shake = Math.max(game.shake, 8);
    }
    if (events & EVENT_COP_TOUCH) {
      game.bustedTimer += dt;
      if (game.bustedTimer >= BUSTED_HOLD_SECONDS) {
        game.bustedTimer = 0;
        busted();
        return;
      }
    } else {
      game.bustedTimer = Math.max(0, game.bustedTimer - dt * 2);
    }
    if (events & EVENT_CAR_DEAD) {
      const wreck = p.inCar;
      p.inCar = null;
      if (wreck) {
        p.x = wreck.x + 30;
        p.y = wreck.y;
      }
      game.shake = 20;
      popup('Your ride is wrecked!', '#ff8a7a');
    }

    updatePickups(dt);
    updateSafehouse(dt);
    updateNearMiss(dt);
    updateWanted(dt);
    updateMission(dt);

    // Hurt flash and the siren follow the wanted level.
    if (p.hp <= 0) {
      wasted();
      return;
    }
    audio.siren(game.wanted, game.time);
    const driving = p.inCar !== null;
    const speed01 = driving ? clamp(Math.sqrt(p.inCar.vx ** 2 + p.inCar.vy ** 2) / 660, 0, 1) : 0;
    audio.engine(speed01, driving);

    // Camera follows the player; shake decays.
    const target = nearestPlayerPos();
    const tx = clamp(target.x - VIEW.w / 2, 0, 2592 - VIEW.w);
    const ty = clamp(target.y - VIEW.h / 2, 0, 2592 - VIEW.h);
    game.camera.x += (tx - game.camera.x) * Math.min(1, 5 * dt);
    game.camera.y += (ty - game.camera.y) * Math.min(1, 5 * dt);
    game.shake = Math.max(0, game.shake - 42 * dt);

    // The contextual prompt line.
    game.prompt = computePrompt();
    game.time += dt;
  }

  function damagePlayer(amount) {
    const p = world.player;
    if (game.armor > 0) {
      const absorbed = Math.min(game.armor, amount);
      game.armor -= absorbed;
      amount -= absorbed;
    }
    p.hp -= amount;
    p.hurtTimer = 0.5;
  }

  function computePrompt() {
    const p = world.player;
    if (p.inCar) {
      if (dist(p.inCar.x, p.inCar.y, game.garagePoint.x, game.garagePoint.y) < 90
        && p.inCar.hp < CAR_MAX_HP && game.cash >= PICKUPS.repairCost) {
        return `B — Repair ride ($${PICKUPS.repairCost})`;
      }
      const speed = Math.sqrt(p.inCar.vx * p.inCar.vx + p.inCar.vy * p.inCar.vy);
      if (speed < 50) return 'E — Get out';
      return null;
    }
    if (game.inSafehouse) return 'Safehouse — the heat fades here';
    const car = nearestCar(60);
    if (car) {
      if (car === game.sportsCar) {
        return game.cash >= PICKUPS.sportsCarPrice
          ? `E — Steal the Comet GT · B — Buy it ($${PICKUPS.sportsCarPrice}, no heat)`
          : 'E — Steal the Comet GT';
      }
      return car.driver === 'traffic' ? 'E — Steal car' : 'E — Get in';
    }
    return null;
  }

  function stepTitle(dt) {
    // The city lives behind the menu: traffic and pedestrians keep moving.
    stepWorld(world, NO_INPUT, dt);
    // Slow pan across Downtown.
    const span = 2592 - VIEW.w;
    game.camera.x = (Math.sin(game.time * 0.045) * 0.5 + 0.5) * span;
    game.camera.y = clamp(placeCenter('bank').y - VIEW.h / 2, 0, 2592 - VIEW.h);
    game.time += dt;
  }

  function startNew() {
    game.cash = 40;
    game.missionsDone = [];
    game.missionIndex = 0;
    game.armor = 0;
    game.batTimer = 0;
    game.pendingDone = false;
    reset(game.seed);
    spawnPlayerAt(SPAWN_BAR.x, SPAWN_BAR.y);
    game.screen = SCREEN_PLAY;
    game.showControls = true;
    game.controlsTimer = 22;
    game.missionDelay = 2;
    say('ROSA', "ROSA: Vic. Welcome to Velmora. First job is at the Harbor — don't keep me waiting.");
    audio.unlock();
  }
  game.startNew = startNew;

  function startContinue(data) {
    game.cash = data.cash;
    game.missionsDone = data.missionsDone.slice();
    game.missionIndex = data.missionsDone.length;
    game.armor = data.armor || 0;
    reset(game.seed);
    spawnPlayerAt(data.px, data.py);
    world.player.hp = data.hp || PLAYER.maxHealth;
    game.screen = SCREEN_PLAY;
    game.showControls = true;
    game.controlsTimer = 22;
    game.missionDelay = 2;
    say('ROSA', 'ROSA: Back again. The city missed you. It says so on the walls.');
    audio.unlock();
  }
  game.startContinue = startContinue;

  // Reachable from the loop and from the screenshot staging.
  game.stepPlay = stepPlay;
  game.stepTitle = stepTitle;

  reset(seed);
  game.saveExists = loadSave() !== null;

  return game;
}

// ---- Boot --------------------------------------------------------------------

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const debug = params.get('debug');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const game = createGame(seed);
const renderer = createRenderer(canvas);
const input = createInput(canvas);
// Dev hook: automated tests read the live state through this (never used by the game itself).
window.__game = game;

/** Test setups behind ?debug=drive|ped: auto-start and put the player next to a car / a pedestrian. */
function applyDebug(kind) {
  game.startNew();
  const p = game.world.player;
  if (kind === 'drive') {
    let best = null;
    let bestD = Infinity;
    for (const car of game.world.cars) {
      if (car.driver !== 'none' || car.hp <= 0) continue;
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (best) {
      p.x = best.x + 40;
      p.y = best.y;
    }
  } else if (kind === 'ped') {
    const ped = makePed(game.rng, p.x + 30, p.y, 'citizen');
    ped.speed = 0; // stays put, so a punch can reach it
    ped.debugPed = true; // tests track this ped by identity, not by index
    game.world.peds.push(ped);
    p.angle = 0; // face the pedestrian, so a punch lands
  }
}

function announce(message) {
  status.textContent = message;
}

function runShot(name) {
  stageShot(name, game);
  let painted = 0;
  function frame() {
    // Keep the staged scene alive under the autopilot while the screenshot waits.
    if (game.screen === SCREEN_PLAY) {
      let acc = 1 / 60;
      while (acc >= STEP) {
        game.stepPlay(STEP, autopilotInput(game));
        acc -= STEP;
      }
    }
    renderer.draw(game);
    painted += 1;
    if (painted < 2) requestAnimationFrame(frame);
    else window.__shotReady = true;
  }
  requestAnimationFrame(frame);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  announce(`Concrete Empire. Press Enter to start. ${CITY_NAME} awaits.`);
  if (debug) applyDebug(debug);

  function handleTitleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      game.muted = !game.muted;
      game.audio.setMuted(game.muted);
    }
    if (game.screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) game.startNew();
    } else if (game.screen === SCREEN_BUSTED || game.screen === SCREEN_WASTED || game.screen === SCREEN_DONE) {
      if (actions & ACTION_CONFIRM) {
        game.screen = SCREEN_PLAY;
        announce('Back on the streets.');
      }
    }
  }

  // Continue is on KeyC, which is not in the shared input map: listen for it here.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC' && !event.repeat) {
      if (game.screen === SCREEN_TITLE && game.saveExists) {
        const data = game.loadSave();
        if (data) game.startContinue(data);
      }
    }
  });

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (game.screen === SCREEN_TITLE) {
      handleTitleActions();
      while (accumulator >= STEP) {
        game.stepTitle(STEP);
        accumulator -= STEP;
      }
    } else if (game.screen === SCREEN_PLAY) {
      // One-shot actions are taken inside stepPlay; the loop only feeds it steps.
      while (accumulator >= STEP && game.screen === SCREEN_PLAY) {
        game.stepPlay(STEP, input);
        accumulator -= STEP;
      }
      if (game.screen === SCREEN_PAUSED) accumulator = 0;
    } else if (game.screen === SCREEN_PAUSED) {
      const actions = input.takeActions();
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        game.screen = SCREEN_PLAY;
        announce('Playing.');
      }
      accumulator = 0;
    } else {
      handleTitleActions();
      accumulator = 0;
    }
    renderer.draw(game);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.screen === SCREEN_PLAY) {
      game.screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  requestAnimationFrame(frame);
}

// The game object needs its step functions reachable from the loop and staging.
if (shot) runShot(shot);
else runGame();

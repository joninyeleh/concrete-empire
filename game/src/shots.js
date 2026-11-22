// Screenshot staging behind ?shot=start|play|drive|mission. Each scene plays the
// real rules forward from a fresh world under a simple autopilot (steer toward the
// mission marker, or cruise the road ahead), so the frame is what a short game
// really looks like — and the same seed always gives the same frame.

import { STEP, placeApproach, placeCenter, roadLine } from './config.js';
import { angleDiff, clamp, dist } from './random.js';
import { makeCar, makePed, randomSidewalkPoint, snapToRoad } from './world.js';

/** Where the autopilot wants to go: the mission marker, or the road ahead. */
function autopilotTarget(game) {
  const p = game.world.player;
  const pos = p.inCar ? { x: p.inCar.x, y: p.inCar.y } : { x: p.x, y: p.y };
  if (game.mission && game.mission.target) {
    const t = game.mission.target;
    if (dist(pos.x, pos.y, t.x, t.y) < 120) return null;
    const dx = t.x - pos.x;
    const dy = t.y - pos.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    return snapToRoad(pos.x + (dx / d) * 420, pos.y + (dy / d) * 420);
  }
  const heading = p.inCar ? p.inCar.angle : p.angle;
  return snapToRoad(pos.x + Math.cos(heading) * 420, pos.y + Math.sin(heading) * 420);
}

/** Synthetic input for a staged scene: drive or walk toward the autopilot target. */
export function autopilotInput(game) {
  const p = game.world.player;
  const target = autopilotTarget(game);
  // Stuck detection: if the player barely moved, sidestep for a moment.
  const st = game.autoState || (game.autoState = { lx: p.x, ly: p.y, stuck: 0, detour: 0, dir: 1 });
  const moved = dist(p.x, p.y, st.lx, st.ly);
  st.lx = p.x;
  st.ly = p.y;
  if (moved < 1.5) st.stuck += STEP;
  else st.stuck = 0;
  if (st.stuck > 0.6) {
    st.detour = 0.8;
    st.dir = -st.dir;
    st.stuck = 0;
  }
  let move = { x: 0, y: 0 };
  if (target) {
    if (p.inCar) {
      const desired = Math.atan2(target.y - p.inCar.y, target.x - p.inCar.x);
      const turn = angleDiff(p.inCar.angle, desired);
      move = { x: clamp(turn * 2, -1, 1), y: turn > 2.4 || turn < -2.4 ? 0.4 : -1 };
    } else {
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      let mx = dx / d;
      let my = dy / d;
      if (st.detour > 0) {
        st.detour -= STEP;
        const px = -my * st.dir;
        const py = mx * st.dir;
        mx = px;
        my = py;
      }
      move = { x: mx, y: my };
    }
  }
  return {
    move: () => move,
    sprinting: () => false,
    handbrake: () => false,
    takeActions: () => 0,
  };
}

/** Run the game forward `seconds` under the autopilot. */
function simulate(game, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    game.stepPlay(STEP, autopilotInput(game));
    if (game.screen !== 'play') break;
  }
}

function extraPedsNear(game, x, y, count) {
  const rng = game.rng;
  for (let i = 0; i < count; i += 1) {
    let point = randomSidewalkPoint(rng);
    let tries = 0;
    while (dist(point.x, point.y, x, y) > 260 && tries < 12) {
      point = randomSidewalkPoint(rng);
      tries += 1;
    }
    game.world.peds.push(makePed(rng, point.x, point.y, 'citizen'));
  }
}

function putPlayerInCar(game, car) {
  const p = game.world.player;
  car.driver = 'player';
  p.inCar = car;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
}

/**
 * Set `game` to the named scene (start, play, drive or mission) and leave it
 * playing under the autopilot, so the screenshot catches a live moment.
 */
export function stageShot(name, game) {
  const rng = game.rng;
  game.reset(game.seed);
  const world = game.world;
  const p = world.player;

  if (name !== 'play' && name !== 'drive' && name !== 'mission') {
    // Title: four seconds of the living city behind the neon logo.
    game.screen = 'title';
    for (let i = 0; i < 4 / STEP; i += 1) game.stepTitle(STEP);
    return;
  }

  game.screen = 'play';
  game.showControls = false;
  game.cash = 1240;

  if (name === 'play') {
    // On foot on a busy Downtown street, job one already on the phone.
    p.x = roadLine(3);
    p.y = roadLine(2) + 30;
    p.angle = 0;
    extraPedsNear(game, p.x, p.y, 6);
    game.startMission(0);
    game.missionDelay = 0;
    simulate(game, 4.5);
    return;
  }

  if (name === 'drive') {
    // Behind the wheel on the long east–west road through Downtown, two stars
    // up and two cop cars closing in from behind.
    const car = makeCar(rng, 'sport', roadLine(1), roadLine(3), 0, 'none');
    car.color = '#d42a2a';
    world.cars.push(car);
    putPlayerInCar(game, car);
    for (let i = 0; i < 2; i += 1) {
      const cop = makeCar(rng, 'police', car.x - 480 - i * 150, roadLine(3), 0, 'cop');
      world.cars.push(cop);
    }
    game.setWanted(2);
    simulate(game, 2.0);
    return;
  }

  // Mission: mid-heist at Empire Bank — Vic is standing in the vault marker,
  // the crack is almost done, and the objective is on screen.
  game.startMission(4);
  game.missionDelay = 0;
  const bank = placeApproach('bank');
  game.mission.step = 'hold';
  game.mission.objective = 'Crack the vault — stay in the marker';
  game.mission.holdTimer = 0.5;
  p.x = bank.x;
  p.y = bank.y;
  p.angle = -Math.PI / 2;
  extraPedsNear(game, p.x, p.y, 3);
  // The heist has already drawn attention: three stars, and a cop car closing
  // in from down the road.
  game.setWanted(3);
  const cop = makeCar(rng, 'police', bank.x - 800, roadLine(3), 0, 'cop');
  world.cars.push(cop);
  // A little life on the street: two cars passing the bank.
  for (let i = 0; i < 2; i += 1) {
    const pass = makeCar(rng, i === 0 ? 'taxi' : 'sedan', bank.x - 320 - i * 260, roadLine(3), 0, 'traffic');
    pass.target = { x: bank.x + 700, y: roadLine(3) };
    pass.dirIndex = 0;
    world.cars.push(pass);
  }
  simulate(game, 0.6);
}

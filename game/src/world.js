// The city and everything that moves in it: buildings, roads, traffic, pedestrians
// and police. No drawing and no browser here — this module owns the rules and the
// state, and returns what happened as small event flags so the caller can react.
// The player itself lives in main.js; this file moves the rest of the world.

import {
  BLOCK, CAR, CAR_MAX_HP, COLS, COLORS, GRID, PED_COUNT, PED_SPEED, ROAD, ROWS,
  SIGHT_RANGE, TRAFFIC_COUNT, TRAFFIC_SPEED, WORLD_H, WORLD_W, blockAt, districtAt,
  placeCenter, roadLine,
} from './config.js';
import { angleDiff, clamp, dist, pick, range, rangeInt } from './random.js';

export const EVENT_PED_DOWN = 1; // the player's car knocked a pedestrian down
export const EVENT_CRASH = 2; // the player's car hit something hard
export const EVENT_COP_TOUCH = 4; // an on-foot cop is holding the player
export const EVENT_CAR_DEAD = 8; // the player's car was wrecked

const DIRS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

// ---- City ------------------------------------------------------------------

/** One city block: its district, its buildings and its trees. */
function buildBlock(random, col, row) {
  const district = districtAt(col, row);
  const x = ROAD + col * GRID;
  const y = ROAD + row * GRID;
  const block = { col, row, x, y, district, buildings: [], trees: [] };
  const inset = 26;

  function addBuilding(bx, by, bw, bh, color) {
    block.buildings.push({ x: bx, y: by, w: bw, h: bh, color });
  }

  if (district === 'park') {
    for (let i = 0; i < 12; i += 1) {
      block.trees.push({ x: x + range(random, 24, BLOCK - 24), y: y + range(random, 24, BLOCK - 24), r: range(random, 10, 18) });
    }
  } else if (district === 'plaza') {
    addBuilding(x + BLOCK / 2 - 30, y + BLOCK / 2 - 30, 60, 60, '#8d8880');
    for (let i = 0; i < 6; i += 1) {
      block.trees.push({ x: x + range(random, 30, BLOCK - 30), y: y + range(random, 30, BLOCK - 30), r: range(random, 9, 14) });
    }
  } else if (district === 'downtown') {
    if (random() < 0.5) {
      addBuilding(x + inset, y + inset, BLOCK - inset * 2, BLOCK - inset * 2, pick(random, COLORS.building.downtown));
    } else {
      const split = range(random, 0.42, 0.58) * BLOCK;
      addBuilding(x + inset, y + inset, split - inset - 8, BLOCK - inset * 2, pick(random, COLORS.building.downtown));
      addBuilding(x + split + 8, y + inset, BLOCK - split - inset - 8, BLOCK - inset * 2, pick(random, COLORS.building.downtown));
    }
  } else if (district === 'harbor') {
    for (let i = 0; i < rangeInt(random, 3, 5); i += 1) {
      addBuilding(
        x + range(random, inset, BLOCK - 90),
        y + range(random, inset, BLOCK - 50),
        range(random, 56, 84), range(random, 30, 44),
        pick(random, COLORS.building.harbor),
      );
    }
  } else if (district === 'oldtown') {
    const count = rangeInt(random, 2, 3);
    for (let i = 0; i < count; i += 1) {
      addBuilding(
        x + range(random, inset, BLOCK - 130),
        y + range(random, inset, BLOCK - 110),
        range(random, 80, 120), range(random, 70, 100),
        pick(random, COLORS.building.oldtown),
      );
    }
  } else {
    // Suburb: small houses with gardens.
    for (let i = 0; i < 3; i += 1) {
      addBuilding(
        x + range(random, inset, BLOCK - 90),
        y + range(random, inset, BLOCK - 80),
        range(random, 54, 72), range(random, 46, 64),
        pick(random, COLORS.building.suburb),
      );
    }
    for (let i = 0; i < 4; i += 1) {
      block.trees.push({ x: x + range(random, 24, BLOCK - 24), y: y + range(random, 24, BLOCK - 24), r: range(random, 9, 15) });
    }
  }
  return block;
}

/** The whole city for a seed: blocks, plus a flat list of every building for collisions. */
export function buildCity(random) {
  const blocks = [];
  const buildings = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const block = buildBlock(random, col, row);
      blocks.push(block);
      for (const b of block.buildings) buildings.push(b);
    }
  }
  return { blocks, buildings };
}

// ---- Collision -------------------------------------------------------------

/** True when a circle of radius `r` at (x, y) touches any building. */
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    const cx = clamp(x, b.x, b.x + b.w);
    const cy = clamp(y, b.y, b.y + b.h);
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

/**
 * Move a circle by (dx, dy), sliding along walls: try the full move, then x only,
 * then y only. The world edge counts as a wall, so nothing leaves the city.
 */
export function moveCircle(city, x, y, dx, dy, r) {
  const inBounds = (nx, ny) => nx >= r && nx <= WORLD_W - r && ny >= r && ny <= WORLD_H - r;
  if (inBounds(x + dx, y + dy) && !hitsBuilding(city, x + dx, y + dy, r)) return { x: x + dx, y: y + dy, blocked: false };
  if (inBounds(x + dx, y) && !hitsBuilding(city, x + dx, y, r)) return { x: x + dx, y, blocked: true };
  if (inBounds(x, y + dy) && !hitsBuilding(city, x, y + dy, r)) return { x, y: y + dy, blocked: true };
  return { x, y, blocked: true };
}

// ---- Spawn helpers ---------------------------------------------------------

/** A random point on a road centreline (optionally near a given point). */
export function randomRoadPoint(random, near) {
  const vertical = random() < 0.5;
  const line = roadLine(rangeInt(random, 0, vertical ? COLS : ROWS));
  const along = near === undefined ? range(random, ROAD, (vertical ? WORLD_H : WORLD_W) - ROAD)
    : clamp(near + range(random, -260, 260), ROAD, (vertical ? WORLD_H : WORLD_W) - ROAD);
  return vertical ? { x: line, y: along } : { x: along, y: line };
}

/** A random point on a block's sidewalk ring (walkable, clear of buildings). */
export function randomSidewalkPoint(random) {
  const col = rangeInt(random, 0, COLS - 1);
  const row = rangeInt(random, 0, ROWS - 1);
  const bx = ROAD + col * GRID;
  const by = ROAD + row * GRID;
  const side = rangeInt(random, 0, 3);
  const t = range(random, 8, BLOCK - 8);
  if (side === 0) return { x: bx + t, y: by + 10 };
  if (side === 1) return { x: bx + t, y: by + BLOCK - 10 };
  if (side === 2) return { x: bx + 10, y: by + t };
  return { x: bx + BLOCK - 10, y: by + t };
}

/** The nearest point on a road centreline to (x, y). */
export function snapToRoad(x, y) {
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i <= COLS; i += 1) {
    const lx = roadLine(i);
    const d = Math.abs(x - lx);
    if (d < bestD) { bestD = d; best = { x: lx, y }; }
  }
  for (let i = 0; i <= ROWS; i += 1) {
    const ly = roadLine(i);
    const d = Math.abs(y - ly);
    if (d < bestD) { bestD = d; best = { x, y: ly }; }
  }
  return best;
}

// ---- Entities --------------------------------------------------------------

export function makeCar(random, kind, x, y, angle, driver) {
  const palette = COLORS.car[kind] || COLORS.car.sedan;
  return {
    kind, x, y, angle,
    vx: 0, vy: 0,
    hp: CAR_MAX_HP,
    smokeTimer: 0,
    skidPrev: null,
    speed: kind === 'police' ? TRAFFIC_SPEED + 60 : range(random, TRAFFIC_SPEED - 30, TRAFFIC_SPEED + 30),
    color: kind === 'police' ? COLORS.car.police[0] : pick(random, palette),
    driver, // 'traffic' | 'player' | 'cop' | 'none'
    target: null,
    dirIndex: 0,
    stuck: 0,
    flash: 0, // police lightbar phase
  };
}

export function makePed(random, x, y, kind) {
  return {
    kind: kind || 'citizen', // 'citizen' | 'cop' | 'rival'
    x, y,
    angle: range(random, 0, Math.PI * 2),
    speed: range(random, PED_SPEED - 14, PED_SPEED + 18),
    color: kind === 'cop' ? COLORS.cop : kind === 'rival' ? '#7a2e2e' : pick(random, COLORS.ped),
    state: 'walk', // 'walk' | 'flee' | 'down'
    target: null,
    stateTimer: 0,
    vx: 0, vy: 0,
    hp: kind === 'rival' ? 50 : 100,
    stuck: 0,
  };
}

// ---- Traffic ---------------------------------------------------------------

function pickTrafficTarget(car, rng) {
  // From the current target (an intersection), head straight, left or right — never back.
  const options = [0, -1, 1];
  const turn = pick(rng, [0, 0, 0, -1, 1]);
  car.dirIndex = (car.dirIndex + turn + 4) % 4;
  const d = DIRS[car.dirIndex];
  const from = car.target || { x: car.x, y: car.y };
  return { x: clamp(from.x + d.x * GRID, ROAD / 2, WORLD_W - ROAD / 2), y: clamp(from.y + d.y * GRID, ROAD / 2, WORLD_H - ROAD / 2) };
}

function carAhead(world, car) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let nearest = Infinity;
  for (const other of world.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const forward = dx * fx + dy * fy;
    if (forward < 0 || forward > 90) continue;
    const side = Math.abs(dx * -fy + dy * fx);
    if (side < 26 && forward < nearest) nearest = forward;
  }
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    const forward = dx * fx + dy * fy;
    if (forward < 0 || forward > 55) continue;
    const side = Math.abs(dx * -fy + dy * fx);
    if (side < 22 && forward < nearest) nearest = forward;
  }
  return nearest;
}

function stepTrafficCar(world, car, dt) {
  if (car.driver === 'player' || car.driver === 'cop') return;
  if (!car.target) {
    car.target = snapToRoad(car.x, car.y);
    car.dirIndex = Math.round(car.angle / (Math.PI / 2)) % 4;
    if (car.dirIndex < 0) car.dirIndex += 4;
  }
  const ahead = carAhead(world, car);
  const want = ahead < 45 ? 0 : ahead < 90 ? car.speed * 0.4 : car.speed;
  const desired = Math.atan2(car.target.y - car.y, car.target.x - car.x);
  const turn = angleDiff(car.angle, desired);
  car.angle += clamp(turn, -2.2 * dt, 2.2 * dt);
  car.x += Math.cos(car.angle) * want * dt;
  car.y += Math.sin(car.angle) * want * dt;
  if (dist(car.x, car.y, car.target.x, car.target.y) < 30) {
    car.target = pickTrafficTarget(car, world.rng);
  }
}

// ---- Pedestrians -----------------------------------------------------------

// A knocked-down pedestrian slides to a stop, then gets up (fleeing) if still alive.
function stepDownPed(world, ped, dt) {
  ped.stateTimer -= dt;
  ped.x += ped.vx * dt;
  ped.y += ped.vy * dt;
  ped.vx *= 1 - Math.min(1, 4 * dt);
  ped.vy *= 1 - Math.min(1, 4 * dt);
  const fixed = moveCircle(world.city, ped.x, ped.y, 0, 0, 10);
  ped.x = fixed.x;
  ped.y = fixed.y;
  if (ped.stateTimer <= 0 && ped.hp > 0) {
    ped.state = ped.kind === 'cop' ? 'walk' : 'flee';
    ped.stateTimer = 3;
  }
}

function stepPed(world, ped, dt) {
  if (ped.state === 'down') {
    stepDownPed(world, ped, dt);
    return;
  }
  if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 14) {
    ped.target = randomSidewalkPoint(world.rng);
  }
  const speed = ped.state === 'flee' ? ped.speed * 1.9 : ped.speed;
  const desired = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
  ped.angle += clamp(angleDiff(ped.angle, desired), -4 * dt, 4 * dt);
  const ox = ped.x;
  const oy = ped.y;
  const moved = moveCircle(world.city, ped.x, ped.y, Math.cos(ped.angle) * speed * dt, Math.sin(ped.angle) * speed * dt, 10);
  ped.x = moved.x;
  ped.y = moved.y;
  if (moved.blocked) {
    ped.stuck += dt;
    if (ped.stuck > 0.8) {
      ped.target = randomSidewalkPoint(world.rng);
      ped.stuck = 0;
    }
  } else {
    ped.stuck = 0;
  }
  if (ped.state === 'flee') {
    ped.stateTimer -= dt;
    if (ped.stateTimer <= 0) ped.state = 'walk';
  }
  // A pedestrian walks away from a fast car bearing down on them.
  for (const car of world.cars) {
    const cs = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
    if (car.driver === 'traffic' && cs < 60) continue;
    if (dist(ped.x, ped.y, car.x, car.y) < 70 && cs > 60 && ped.state !== 'flee') {
      ped.state = 'flee';
      ped.stateTimer = 2.5;
      ped.target = { x: ped.x + (ped.x - car.x), y: ped.y + (ped.y - car.y) };
    }
  }
}

// ---- Police ----------------------------------------------------------------

function stepCopCar(world, car, dt) {
  if (car.driver !== 'cop') return;
  const player = world.player;
  const px = player.inCar ? player.inCar.x : player.x;
  const py = player.inCar ? player.inCar.y : player.y;
  const d = dist(car.x, car.y, px, py);
  // Close in: drive straight at the player. Far off: head for the nearest road point to them.
  const target = d < 170 ? { x: px, y: py } : snapToRoad(px, py);
  const desired = Math.atan2(target.y - car.y, target.x - car.x);
  car.angle += clamp(angleDiff(car.angle, desired), -2.6 * dt, 2.6 * dt);
  // After a ram, a cop backs off for a moment instead of grinding on the bumper:
  // the chase breathes — catch up, ram, fall back, catch up again.
  if (d < 55) car.ramCd = 1.1;
  if (car.ramCd > 0) car.ramCd -= dt;
  const speed = CAR.maxSpeed.police * (car.ramCd > 0 ? 0.55 : 1);
  car.x += Math.cos(car.angle) * speed * dt;
  car.y += Math.sin(car.angle) * speed * dt;
  car.flash += dt;
  car.x = clamp(car.x, 20, WORLD_W - 20);
  car.y = clamp(car.y, 20, WORLD_H - 20);
  // Cop cars do not drive through buildings: slide along them, and back out when stuck.
  if (hitsBuilding(world.city, car.x, car.y, 18)) {
    car.x -= Math.cos(car.angle) * speed * dt * 2;
    car.y -= Math.sin(car.angle) * speed * dt * 2;
    car.angle += 0.9 * dt;
  }
}

function stepCopPed(world, ped, dt) {
  if (ped.state === 'down') {
    stepDownPed(world, ped, dt);
    return;
  }
  const player = world.player;
  const px = player.inCar ? player.inCar.x : player.x;
  const py = player.inCar ? player.inCar.y : player.y;
  const desired = Math.atan2(py - ped.y, px - ped.x);
  ped.angle += clamp(angleDiff(ped.angle, desired), -5 * dt, 5 * dt);
  const speed = 198;
  const moved = moveCircle(world.city, ped.x, ped.y, Math.cos(ped.angle) * speed * dt, Math.sin(ped.angle) * speed * dt, 10);
  ped.x = moved.x;
  ped.y = moved.y;
}

// ---- Collisions ------------------------------------------------------------

function collideCars(world) {
  const cars = world.cars;
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const min = 34;
      if (d === 0 || d >= min) continue;
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rel > 0) {
        // Separate along the normal: a shove, not a full stop — a cop ramming the
        // player from behind pushes them forward, which is how a chase should feel.
        const impulse = rel * 0.5;
        a.vx -= nx * impulse;
        a.vy -= ny * impulse;
        b.vx += nx * impulse;
        b.vy += ny * impulse;
      }
      if (rel > 120) {
        const playerHit = a.driver === 'player' || b.driver === 'player';
        if (playerHit) {
          world.events |= EVENT_CRASH;
          const victim = a.driver === 'player' ? a : b;
          victim.hp -= rel / 45;
          addParticles(world, (a.x + b.x) / 2, (a.y + b.y) / 2, 8, ['#ffd23e', '#ff8833'], 180, 0.4, 3);
          if (victim.hp <= 0) killCar(world, victim);
        }
      }
    }
  }
}

function collideCarPeds(world) {
  const player = world.player;
  for (const car of world.cars) {
    const cs = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
    const moving = car.driver === 'traffic' ? car.speed : cs;
    for (const ped of world.peds) {
      if (ped.state === 'down') continue;
      const d = dist(car.x, car.y, ped.x, ped.y);
      if (d > 26) continue;
      if (moving < 60) {
        // A slow car just nudges the pedestrian aside.
        const nx = (ped.x - car.x) / (d || 1);
        const ny = (ped.y - car.y) / (d || 1);
        ped.x += nx * 8;
        ped.y += ny * 8;
        continue;
      }
      // Knocked down: flung away from the car, out of action for a while.
      const nx = (ped.x - car.x) / (d || 1);
      const ny = (ped.y - car.y) / (d || 1);
      ped.state = 'down';
      ped.stateTimer = 4;
      ped.vx = nx * 260;
      ped.vy = ny * 260;
      ped.hp -= 60;
      world.lastPedDown = ped;
      if (car.driver === 'player') {
        world.events |= EVENT_PED_DOWN;
        if (ped.kind === 'rival') world.rivalsDown = (world.rivalsDown || 0) + 1;
      }
    }
    // The player's car hitting the on-foot player is impossible (they are in it); a
    // traffic or cop car hitting the on-foot player hurts.
    if (!player.inCar && car.driver !== 'player') {
      const d = dist(car.x, car.y, player.x, player.y);
      if (d < 24 && moving > 60) {
        player.hp -= CAR.damageOnHit;
        player.hurtTimer = 0.6;
        const nx = (player.x - car.x) / (d || 1);
        const ny = (player.y - car.y) / (d || 1);
        const moved = moveCircle(world.city, player.x, player.y, nx * 26, ny * 26, 13);
        player.x = moved.x;
        player.y = moved.y;
        world.events |= EVENT_CRASH;
      }
    }
  }
}

// ---- Juice: particles & skid marks ------------------------------------------

/** Burst of `count` particles from (x, y). Colours are single strings or arrays. */
export function addParticles(world, x, y, count, color, speed, life, size) {
  for (let i = 0; i < count; i += 1) {
    const a = world.rng() * Math.PI * 2;
    const s = speed * (0.3 + world.rng() * 0.7);
    world.particles.push({
      x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: life * (0.5 + world.rng() * 0.5), maxLife: life,
      color: Array.isArray(color) ? color[Math.floor(world.rng() * color.length)] : color,
      size: size * (0.6 + world.rng() * 0.8),
    });
  }
  if (world.particles.length > 400) world.particles.splice(0, world.particles.length - 400);
}

/** One fading skid-mark segment. */
export function addSkid(world, x1, y1, x2, y2) {
  world.skids.push({ x1, y1, x2, y2, life: 6 });
  if (world.skids.length > 220) world.skids.shift();
}

function stepFx(world, dt) {
  for (let i = world.particles.length - 1; i >= 0; i -= 1) {
    const p = world.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - Math.min(1, 2 * dt);
    p.vy *= 1 - Math.min(1, 2 * dt);
    p.life -= dt;
    if (p.life <= 0) world.particles.splice(i, 1);
  }
  for (let i = world.skids.length - 1; i >= 0; i -= 1) {
    world.skids[i].life -= dt;
    if (world.skids[i].life <= 0) world.skids.splice(i, 1);
  }
  // A damaged car smokes until it is repaired or wrecked.
  for (const car of world.cars) {
    if (car.hp > 0 && car.hp < 45) {
      car.smokeTimer -= dt;
      if (car.smokeTimer <= 0) {
        car.smokeTimer = 0.12;
        addParticles(world, car.x, car.y - 6, 2, ['#888888', '#666666', '#aaaaaa'], 40, 1.4, 6);
      }
    }
  }
}

/** Wreck a car: it stops dead, smokes, and can no longer be driven. */
function killCar(world, car) {
  if (car.hp > 0) return;
  car.hp = 0;
  car.vx = 0;
  car.vy = 0;
  car.speed = 0;
  if (car.driver === 'player') world.events |= EVENT_CAR_DEAD;
  car.driver = 'none';
  addParticles(world, car.x, car.y, 26, ['#ffcc33', '#ff8833', '#888888'], 260, 0.9, 5);
}

// ---- Player car physics ----------------------------------------------------

export function stepPlayerCar(world, car, input, dt) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  let forward = car.vx * fx + car.vy * fy;
  let lateral = car.vx * -fy + car.vy * fx;
  const move = input.move();
  // Steering: full lock turns the car faster when it is moving; reversing flips it.
  const speedFactor = clamp(Math.abs(forward) / 220, 0, 1);
  const steerDir = forward < -5 ? -1 : 1;
  car.angle += move.x * CAR.steer * speedFactor * steerDir * dt * (input.handbrake() ? 1.5 : 1);
  if (move.y < 0) forward += CAR.accel * dt;
  else if (move.y > 0) forward -= (forward > 0 ? CAR.brake : CAR.accel * 0.6) * dt;
  else forward -= forward * 0.6 * dt; // coast
  const max = CAR.maxSpeed[car.kind] || CAR.maxSpeed.sedan;
  forward = clamp(forward, -CAR.reverseMax, max);
  const grip = input.handbrake() ? CAR.handbrakeGrip : CAR.grip;
  lateral *= Math.max(0, 1 - grip * dt);
  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  car.vx = nfx * forward + -nfy * lateral;
  car.vy = nfy * forward + nfx * lateral;
  const speed = Math.sqrt(car.vx * car.vx + car.vy * car.vy);
  // Handbrake at speed lays skid marks from the rear wheels.
  if (input.handbrake() && Math.abs(forward) > 200) {
    const bx = car.x - nfx * 16;
    const by = car.y - nfy * 16;
    const lx = bx - nfy * 9;
    const ly = by + nfx * 9;
    const rx = bx + nfy * 9;
    const ry = by - nfx * 9;
    if (car.skidPrev) {
      addSkid(world, car.skidPrev.lx, car.skidPrev.ly, lx, ly);
      addSkid(world, car.skidPrev.rx, car.skidPrev.ry, rx, ry);
    }
    car.skidPrev = { lx, ly, rx, ry };
  } else {
    car.skidPrev = null;
  }
  const moved = moveCircle(world.city, car.x, car.y, car.vx * dt, car.vy * dt, 18);
  if (moved.blocked && speed > 120) {
    world.events |= EVENT_CRASH;
    const damage = (speed - 120) / 9;
    car.hp -= damage;
    addParticles(world, car.x + nfx * 20, car.y + nfy * 20, 10, ['#ffd23e', '#ff8833', '#ffffff'], 220, 0.5, 3);
    car.vx *= 0.4;
    car.vy *= 0.4;
    if (car.hp <= 0) killCar(world, car);
  }
  car.x = moved.x;
  car.y = moved.y;
}

// ---- Witnesses -------------------------------------------------------------

/** True when any pedestrian or cop is close enough to have seen something at (x, y). */
export function witnessed(world, x, y) {
  for (const ped of world.peds) {
    if (ped.state !== 'down' && dist(ped.x, ped.y, x, y) < SIGHT_RANGE) return true;
  }
  for (const car of world.cars) {
    if (car.driver === 'cop' && dist(car.x, car.y, x, y) < SIGHT_RANGE) return true;
  }
  return false;
}

/** The nearest cop car or on-foot cop to (x, y), and how far away it is. */
export function nearestCop(world, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const car of world.cars) {
    if (car.driver !== 'cop') continue;
    const d = dist(car.x, car.y, x, y);
    if (d < bestD) { bestD = d; best = car; }
  }
  for (const ped of world.peds) {
    if (ped.kind !== 'cop' || ped.state === 'down') continue;
    const d = dist(ped.x, ped.y, x, y);
    if (d < bestD) { bestD = d; best = ped; }
  }
  return { cop: best, dist: bestD };
}

// ---- World step ------------------------------------------------------------

/**
 * Advance the world one fixed step. The player (on foot) is moved by the caller;
 * this moves traffic, pedestrians, cops, the player's car and resolves collisions.
 * Returns the event flags raised this step (EVENT_*).
 */
export function stepWorld(world, input, dt) {
  world.events = 0;
  world.time += dt;
  for (const car of world.cars) {
    if (car.driver === 'player') stepPlayerCar(world, car, input, dt);
    else if (car.driver === 'cop') stepCopCar(world, car, dt);
    else if (car.driver === 'traffic') stepTrafficCar(world, car, dt);
  }
  for (const ped of world.peds) {
    if (ped.kind === 'cop') stepCopPed(world, ped, dt);
    else stepPed(world, ped, dt);
  }
  collideCars(world);
  collideCarPeds(world);
  stepFx(world, dt);
  // An on-foot cop touching the player starts the busted clock (main.js reads it).
  const player = world.player;
  if (!player.inCar) {
    for (const ped of world.peds) {
      if (ped.kind === 'cop' && ped.state !== 'down' && dist(ped.x, ped.y, player.x, player.y) < 26) {
        world.events |= EVENT_COP_TOUCH;
        break;
      }
    }
  }
  return world.events;
}

/** Which way a road point runs: 'v' for a vertical road, 'h' for horizontal. */
function roadOrientation(x, y) {
  for (let l = 0; l <= COLS; l += 1) {
    if (Math.abs(x - roadLine(l)) < 1) return 'v';
  }
  for (let l = 0; l <= ROWS; l += 1) {
    if (Math.abs(y - roadLine(l)) < 1) return 'h';
  }
  return null;
}

/** Spawn the ambient traffic and pedestrians for a fresh world, clear of (x, y). */
export function populate(world, clearX, clearY) {
  const rng = world.rng;
  world.cars = [];
  world.peds = [];
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    let point = randomRoadPoint(rng);
    let tries = 0;
    while (dist(point.x, point.y, clearX, clearY) < 320 && tries < 12) {
      point = randomRoadPoint(rng);
      tries += 1;
    }
    const kind = pick(rng, ['sedan', 'sedan', 'sedan', 'taxi', 'sport', 'truck']);
    // A traffic car faces along its road, never across it.
    const vertical = roadOrientation(point.x, point.y) === 'v';
    const dirIndex = vertical ? pick(rng, [1, 3]) : pick(rng, [0, 2]);
    const car = makeCar(rng, kind, point.x, point.y, dirIndex * (Math.PI / 2), 'traffic');
    car.dirIndex = dirIndex;
    car.target = { x: point.x + DIRS[dirIndex].x * GRID, y: point.y + DIRS[dirIndex].y * GRID };
    world.cars.push(car);
  }
  for (let i = 0; i < PED_COUNT; i += 1) {
    const point = randomSidewalkPoint(rng);
    world.peds.push(makePed(rng, point.x, point.y, 'citizen'));
  }
  // A few parked cars along the roads, for the player to find — facing along the road.
  for (let i = 0; i < 6; i += 1) {
    const point = randomRoadPoint(rng);
    const vertical = roadOrientation(point.x, point.y) === 'v';
    const angle = vertical ? (rng() < 0.5 ? -Math.PI / 2 : Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
    const off = vertical ? { x: 30, y: 0 } : { x: 0, y: 30 };
    const side = rng() < 0.5 ? 1 : -1;
    const car = makeCar(rng, pick(rng, ['sedan', 'sedan', 'taxi', 'sport']), point.x + off.x * side, point.y + off.y * side, angle, 'none');
    car.speed = 0;
    world.cars.push(car);
  }
}

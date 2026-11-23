// Concrete Empire — city generation, entity factories, physics, and the
// simple AI that makes Velmora feel alive: traffic, pedestrians, police.
import {
  CITY, ROADS_X, ROADS_Y, ROAD_W, DISTRICTS, VEHICLES, TRAFFIC_SPEED,
  COP_FOOT_SPEED, RIVAL_SPEED,
} from './config.js';

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  }
  return DISTRICTS[0];
}

export function nearestRoadPoint(x, y) {
  let bx = ROADS_X[0];
  let bd = Infinity;
  for (const rx of ROADS_X) {
    const d = Math.abs(rx - x);
    if (d < bd) { bd = d; bx = rx; }
  }
  let by = ROADS_Y[0];
  bd = Infinity;
  for (const ry of ROADS_Y) {
    const d = Math.abs(ry - y);
    if (d < bd) { bd = d; by = ry; }
  }
  return { x: bx, y: by };
}

export function onRoad(x, y) {
  const half = ROAD_W / 2 + 6;
  for (const rx of ROADS_X) if (Math.abs(x - rx) < half) return true;
  for (const ry of ROADS_Y) if (Math.abs(y - ry) < half) return true;
  return false;
}

// --- City generation ---------------------------------------------------------
export function buildCity(rng) {
  const buildings = [];
  const lamps = [];
  const trees = [];
  const water = [];

  // Harbor water along the south-west edge, with wooden docks.
  water.push({ x: 0, y: 1900, w: 420, h: 300 });
  water.push({ x: 0, y: 1560, w: 180, h: 340 });

  // Buildings fill the blocks between roads. The park block and the water
  // blocks stay open.
  for (let ix = 0; ix < ROADS_X.length - 1; ix += 1) {
    for (let iy = 0; iy < ROADS_Y.length - 1; iy += 1) {
      const x0 = ROADS_X[ix] + ROAD_W / 2 + 14;
      const y0 = ROADS_Y[iy] + ROAD_W / 2 + 14;
      const x1 = ROADS_X[ix + 1] - ROAD_W / 2 - 14;
      const y1 = ROADS_Y[iy + 1] - ROAD_W / 2 - 14;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const d = districtAt(cx, cy);
      // Riverside Park block: trees, not buildings.
      if (cx > 2100 && cy < 900) {
        for (let t = 0; t < 14; t += 1) {
          trees.push({ x: x0 + rng.range(20, x1 - x0 - 20), y: y0 + rng.range(20, y1 - y0 - 20), r: rng.range(10, 18) });
        }
        continue;
      }
      // Harbor water blocks: skip.
      if (cx < 500 && cy > 1800) continue;
      const count = rng.int(1, 3);
      for (let b = 0; b < count; b += 1) {
        const w = rng.range(90, Math.min(190, x1 - x0 - 20));
        const h = rng.range(80, Math.min(170, y1 - y0 - 20));
        const bx = x0 + rng.range(0, Math.max(1, x1 - x0 - w));
        const by = y0 + rng.range(0, Math.max(1, y1 - y0 - h));
        const tall = d.neon && rng.next() < 0.35;
        buildings.push({
          x: bx, y: by, w, h,
          color: d.roof,
          top: tall ? '#2b2b3a' : d.roof,
          tall,
          neon: d.neon && rng.next() < 0.5,
          neonColor: rng.pick(['#ff2d78', '#00e5ff', '#ffe600', '#7c4dff']),
        });
      }
      // A couple of trees in suburban blocks.
      if (d.name === 'Suburbs' || d.name === 'Riverside Park') {
        trees.push({ x: x0 + rng.range(10, 60), y: y0 + rng.range(10, 60), r: 12 });
        trees.push({ x: x1 - rng.range(10, 60), y: y1 - rng.range(10, 60), r: 14 });
      }
    }
  }

  // Street lamps at every other intersection.
  for (let ix = 0; ix < ROADS_X.length; ix += 1) {
    for (let iy = 0; iy < ROADS_Y.length; iy += 1) {
      if ((ix + iy) % 2 === 0) {
        lamps.push({ x: ROADS_X[ix] + ROAD_W / 2 + 8, y: ROADS_Y[iy] - ROAD_W / 2 - 8 });
      }
    }
  }
  return { buildings, lamps, trees, water };
}

// --- Entity factories ----------------------------------------------------------
export function makeCar(kind, x, y, driver = 'none', angle = 0) {
  const def = VEHICLES[kind] || VEHICLES.sedan;
  return {
    kind, x, y, angle, driver,
    vx: 0, vy: 0, hp: 100, color: def.color,
    max: def.max, accel: def.accel, turn: def.turn,
    r: kind === 'bike' ? 14 : 19,
    // traffic AI state
    dir: 0, road: 'x', line: y, turnAt: 0, stuck: 0,
    // rival race state
    cpIndex: 0, waiting: false, finished: false,
    parked: driver === 'none',
    contact: 0,
  };
}

export function makePed(x, y, opts = {}) {
  return {
    x, y,
    angle: opts.angle ?? 0,
    hp: opts.hp ?? 100,
    state: opts.state ?? 'walk',
    speed: opts.speed ?? 55,
    dir: opts.dir ?? 0,
    road: opts.road ?? 'x',
    line: opts.line ?? y,
    side: opts.side ?? 1,
    color: opts.color ?? '#e67e22',
    debugPed: !!opts.debugPed,
    fleeX: 0, fleeY: 0, fleeT: 0,
    attackT: 0, hitT: 0,
  };
}

export function makePickup(kind, x, y) {
  return { kind, x, y, taken: false, bob: Math.random() * 6 };
}

// --- Collision helpers ---------------------------------------------------------
function circleHitsRect(x, y, r, b) {
  const cx = Math.max(b.x, Math.min(x, b.x + b.w));
  const cy = Math.max(b.y, Math.min(y, b.y + b.h));
  const dx = x - cx;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  return d2 < r * r ? { cx, cy, dx, dy, d: Math.sqrt(d2) } : null;
}

// Push a circle out of every building it overlaps. Returns true if it hit.
export function collideBuildings(ent, r, buildings) {
  let hit = false;
  for (const b of buildings) {
    const h = circleHitsRect(ent.x, ent.y, r, b);
    if (!h) continue;
    hit = true;
    if (h.d < 0.001) {
      ent.y = b.y - r - 1;
      continue;
    }
    const push = (r - h.d) / h.d;
    ent.x += h.dx * push;
    ent.y += h.dy * push;
    if (ent.vx !== undefined) {
      // Kill the velocity component that points into the wall.
      const nx = h.dx / h.d;
      const ny = h.dy / h.d;
      const into = ent.vx * nx + ent.vy * ny;
      if (into < 0) {
        ent.vx -= into * nx * 1.6;
        ent.vy -= into * ny * 1.6;
      }
    }
  }
  ent.x = Math.max(20, Math.min(CITY.W - 20, ent.x));
  ent.y = Math.max(20, Math.min(CITY.H - 20, ent.y));
  return hit;
}

export function inWater(x, y, water) {
  for (const w of water) {
    if (x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) return true;
  }
  return false;
}

// --- Car physics ---------------------------------------------------------------
// Drive a car with throttle (-1..1), steering (-1..1) and handbrake.
// Returns an impact speed when the car smacked a building this frame.
export function driveCar(car, throttle, steer, handbrake, dt, buildings, cars) {
  const def = VEHICLES[car.kind] || VEHICLES.sedan;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const forwardSpeed = car.vx * fx + car.vy * fy;
  const speed = Math.hypot(car.vx, car.vy);
  car.hitT = Math.max(0, (car.hitT || 0) - dt);

  // Steering bites harder the faster the car goes (up to a point).
  const grip = Math.min(1, Math.abs(forwardSpeed) / 90);
  car.angle += steer * def.turn * grip * dt * (forwardSpeed < 0 ? -1 : 1);

  const nfx = Math.cos(car.angle);
  const nfy = Math.sin(car.angle);
  const accel = def.accel * (throttle >= 0 ? throttle : throttle * 0.7);
  car.vx += nfx * accel * dt;
  car.vy += nfy * accel * dt;

  // Lateral grip: kill sideways slide, unless the handbrake is on (drift).
  const rx = -nfy;
  const ry = nfx;
  const lateral = car.vx * rx + car.vy * ry;
  const lateralKeep = handbrake ? 0.86 : 0.12;
  car.vx -= rx * lateral * (1 - lateralKeep);
  car.vy -= ry * lateral * (1 - lateralKeep);

  // Rolling drag and handbrake.
  const drag = throttle === 0 ? 1.4 : 0.35;
  const damp = Math.max(0, 1 - (drag + (handbrake ? 2.2 : 0)) * dt);
  car.vx *= damp;
  car.vy *= damp;

  // Top speed (reverse is slower).
  const fwd = car.vx * nfx + car.vy * nfy;
  const top = fwd >= 0 ? def.max : def.max * 0.42;
  if (Math.abs(fwd) > top) {
    const excess = Math.abs(fwd) - top;
    const s = fwd > 0 ? 1 : -1;
    car.vx -= nfx * excess * s;
    car.vy -= nfy * excess * s;
  }

  const px = car.x;
  const py = car.y;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  const hitBuilding = collideBuildings(car, car.r, buildings);
  let impact = 0;
  if (hitBuilding) {
    impact = Math.hypot(car.vx - 0, car.vy - 0);
    const moved = Math.hypot(car.x - px, car.y - py);
    impact = Math.max(0, (speed - moved / Math.max(dt, 0.001)) * 0.9);
    if (impact > 220) {
      car.hp = Math.max(0, car.hp - Math.round((impact - 200) / 14));
    }
  }
  // Gentle car-car separation.
  for (const other of cars) {
    if (other === car) continue;
    const dx = car.x - other.x;
    const dy = car.y - other.y;
    const d = Math.hypot(dx, dy);
    const min = car.r + other.r - 2;
    if (d > 0.01 && d < min) {
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      car.x += nx * push;
      car.y += ny * push;
      other.x -= nx * push;
      other.y -= ny * push;
      const rel = Math.abs((car.vx - other.vx) * nx + (car.vy - other.vy) * ny);
      // Collision damage is rate-limited: a long scrape is one crash, not
      // sixty per second.
      if (rel > 160 && (car.hitT || 0) <= 0) {
        car.hp = Math.max(0, car.hp - 4);
        other.hp = Math.max(0, other.hp - 4);
        car.hitT = 0.5;
        other.hitT = 0.5;
      }
    }
  }
  return impact;
}

// --- Traffic AI ------------------------------------------------------------------
function randomTurn(rng, dir) {
  // 0 = east, 1 = south, 2 = west, 3 = north. Never reverse.
  const options = [dir, (dir + 1) % 4, (dir + 3) % 4];
  return rng.pick(options);
}

export function updateTraffic(world, dt, rng) {
  for (const car of world.cars) {
    if (car.driver !== 'traffic') continue;
    const dirs = [
      { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 },
    ];
    const d = dirs[car.dir];
    // Car ahead on the same lane? Slow down.
    let blocked = false;
    for (const other of world.cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const ahead = dx * d.x + dy * d.y;
      const side = Math.abs(dx * -d.y + dy * d.x);
      if (ahead > 0 && ahead < 85 && side < 26) { blocked = true; break; }
    }
    const target = blocked ? 0 : TRAFFIC_SPEED;
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const cur = car.vx * fx + car.vy * fy;
    const accel = target > cur ? 130 : -260;
    car.vx += fx * accel * dt;
    car.vy += fy * accel * dt;
    // Steer toward the road line.
    const want = Math.atan2(d.y, d.x);
    let diff = want - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
    car.x += car.vx * dt;
    car.y += car.vy * dt;
    collideBuildings(car, car.r, world.buildings);

    // At an intersection, maybe turn onto another road.
    const nearX = ROADS_X.find((rx) => Math.abs(car.x - rx) < 26);
    const nearY = ROADS_Y.find((ry) => Math.abs(car.y - ry) < 26);
    if (nearX !== undefined && nearY !== undefined && car.turnAt <= 0) {
      car.dir = randomTurn(rng, car.dir);
      car.turnAt = 1.2;
      const nd = dirs[car.dir];
      // Snap onto the new road's centerline.
      if (nd.x !== 0) car.y = nearY;
      else car.x = nearX;
    }
    car.turnAt -= dt;
  }
}

// --- Pedestrian AI -----------------------------------------------------------------
export function updatePeds(world, dt, rng) {
  for (const ped of world.peds) {
    if (ped.state === 'down') continue;
    // A debug pedestrian is a stationary test dummy: it never walks away.
    if (ped.debugPed) continue;
    if (ped.state === 'cop') {
      // Foot cop: run straight at the player.
      const p = world.player;
      const dx = p.x - ped.x;
      const dy = p.y - ped.y;
      const d = Math.hypot(dx, dy) || 1;
      ped.angle = Math.atan2(dy, dx);
      ped.x += (dx / d) * COP_FOOT_SPEED * dt;
      ped.y += (dy / d) * COP_FOOT_SPEED * dt;
      collideBuildings(ped, 13, world.buildings);
      continue;
    }
    if (ped.state === 'rival') {
      // Turf rival: walk at the player and swing when close.
      const p = world.player;
      const dx = p.x - ped.x;
      const dy = p.y - ped.y;
      const d = Math.hypot(dx, dy) || 1;
      ped.angle = Math.atan2(dy, dx);
      if (d > 34) {
        ped.x += (dx / d) * 150 * dt;
        ped.y += (dy / d) * 150 * dt;
      }
      ped.attackT -= dt;
      if (d < 40 && ped.attackT <= 0) {
        ped.attackT = 0.9;
        p.hp = Math.max(0, p.hp - (p.armor > 0 ? 4 : 8));
        if (p.armor > 0) p.armor = Math.max(0, p.armor - 4);
        ped.swing = 0.25;
      }
      if (ped.swing > 0) ped.swing -= dt;
      collideBuildings(ped, 13, world.buildings);
      continue;
    }
    if (ped.fleeT > 0) {
      ped.fleeT -= dt;
      const dx = ped.x - ped.fleeX;
      const dy = ped.y - ped.fleeY;
      const d = Math.hypot(dx, dy) || 1;
      ped.angle = Math.atan2(dy, dx);
      ped.x += (dx / d) * 215 * dt;
      ped.y += (dy / d) * 215 * dt;
      collideBuildings(ped, 13, world.buildings);
      continue;
    }
    // Stroll along the sidewalk.
    const dirs = [
      { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 0, y: -1 },
    ];
    const d = dirs[ped.dir];
    ped.x += d.x * ped.speed * dt;
    ped.y += d.y * ped.speed * dt;
    ped.angle = Math.atan2(d.y, d.x);
    // Keep on the sidewalk: nudge back toward the lane line.
    if (ped.road === 'x') {
      const targetY = ped.line + ped.side * (ROAD_W / 2 + 14);
      ped.y += (targetY - ped.y) * Math.min(1, 3 * dt);
    } else {
      const targetX = ped.line + ped.side * (ROAD_W / 2 + 14);
      ped.x += (targetX - ped.x) * Math.min(1, 3 * dt);
    }
    collideBuildings(ped, 13, world.buildings);
    // Turn at intersections sometimes.
    const nearX = ROADS_X.find((rx) => Math.abs(ped.x - rx) < 22);
    const nearY = ROADS_Y.find((ry) => Math.abs(ped.y - ry) < 22);
    if (nearX !== undefined && nearY !== undefined && rng.next() < dt * 0.5) {
      ped.dir = randomTurn(rng, ped.dir);
      if (dirs[ped.dir].x !== 0) {
        ped.road = 'x';
        ped.line = nearY;
      } else {
        ped.road = 'y';
        ped.line = nearX;
      }
      ped.side = rng.next() < 0.5 ? 1 : -1;
    }
    // A fast car nearby spooks the pedestrian.
    for (const car of world.cars) {
      const sp = Math.hypot(car.vx, car.vy);
      const dd = Math.hypot(car.x - ped.x, car.y - ped.y);
      if (sp > 170 && dd < 95) {
        ped.fleeT = 1.6;
        ped.fleeX = car.x;
        ped.fleeY = car.y;
        break;
      }
    }
  }
}

// --- Police ----------------------------------------------------------------------
export function updatePolice(world, dt, game) {
  const want = game.wanted;
  const player = world.player;
  const inCar = !!player.inCar;

  // Desired number of pursuit cars.
  const wantCars = want > 0 ? Math.min(want, 3) : 0;
  let copCars = world.police.filter((u) => u.car);
  // Spawn more cop cars as needed.
  while (copCars.length < wantCars) {
    const ang = game.rng.range(0, Math.PI * 2);
    const sx = Math.max(60, Math.min(CITY.W - 60, player.x + Math.cos(ang) * 520));
    const sy = Math.max(60, Math.min(CITY.H - 60, player.y + Math.sin(ang) * 520));
    const near = nearestRoadPoint(sx, sy);
    const car = makeCar('police', near.x, near.y, 'police', Math.atan2(player.y - near.y, player.x - near.x));
    world.cars.push(car);
    const unit = { car, ped: null, contact: 0 };
    world.police.push(unit);
    copCars.push(unit);
  }
  // Remove extra cop cars when the heat drops.
  while (copCars.length > wantCars) {
    const unit = copCars.pop();
    const ci = world.cars.indexOf(unit.car);
    if (ci >= 0) world.cars.splice(ci, 1);
    if (unit.ped) {
      const pi = world.peds.indexOf(unit.ped);
      if (pi >= 0) world.peds.splice(pi, 1);
    }
    const ui = world.police.indexOf(unit);
    if (ui >= 0) world.police.splice(ui, 1);
  }

  for (const unit of world.police) {
    const car = unit.car;
    if (!car) continue;
    if (inCar) {
      // Foot cop goes back to the car when the player drives off.
      if (unit.ped) {
        const pi = world.peds.indexOf(unit.ped);
        if (pi >= 0) world.peds.splice(pi, 1);
        unit.ped = null;
      }
      // Chase the player's car: steer at it, floor it.
      const dx = player.x - car.x;
      const dy = player.y - car.y;
      const d = Math.hypot(dx, dy) || 1;
      const wantAngle = Math.atan2(dy, dx);
      let diff = wantAngle - car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 1.6));
      driveCar(car, 1, steer, false, dt, world.buildings, world.cars);
      // Ramming the player: contact while the player is slow means a bust.
      const pcar = player.inCar;
      const pd = Math.hypot(car.x - pcar.x, car.y - pcar.y);
      const pspeed = Math.hypot(pcar.vx, pcar.vy);
      if (pd < 48 && pspeed < 40) {
        unit.contact += dt;
        if (unit.contact > 2) game.busted();
      } else {
        unit.contact = Math.max(0, unit.contact - dt);
      }
      if (pd < 46 && pspeed > 60) {
        pcar.hp = Math.max(0, pcar.hp - 12 * dt);
        game.shake = Math.max(game.shake, 5);
      }
    } else {
      // Player on foot: the cop parks and chases on foot.
      const dx = player.x - car.x;
      const dy = player.y - car.y;
      const d = Math.hypot(dx, dy) || 1;
      if (!unit.ped && d < 170) {
        const ped = makePed(car.x, car.y, { state: 'cop', color: '#2c4a6b', speed: COP_FOOT_SPEED });
        world.peds.push(ped);
        unit.ped = ped;
        car.parked = true;
      }
      if (unit.ped) {
        const pd = Math.hypot(unit.ped.x - player.x, unit.ped.y - player.y);
        if (pd < 26) game.busted();
      } else {
        // Drive toward the player until close enough to deploy.
        const wantAngle = Math.atan2(dy, dx);
        let diff = wantAngle - car.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const steer = Math.max(-1, Math.min(1, diff * 1.6));
        if (d > 130) driveCar(car, 1, steer, false, dt, world.buildings, world.cars);
      }
    }
  }

  // Roadblocks seal the streets at four stars and above.
  if (want >= 4 && !world.roadblock) {
    const ahead = player.angle;
    const bx = player.x + Math.cos(ahead) * 260;
    const by = player.y + Math.sin(ahead) * 260;
    const near = nearestRoadPoint(bx, by);
    world.roadblock = { x: near.x, y: near.y, angle: ahead };
    const perp = ahead + Math.PI / 2;
    for (const s of [-1, 1]) {
      const bc = makeCar('police', near.x + Math.cos(perp) * 46 * s, near.y + Math.sin(perp) * 46 * s, 'block', ahead);
      bc.parked = true;
      world.cars.push(bc);
    }
  }
  if (want < 4 && world.roadblock) {
    world.roadblock = null;
    for (let i = world.cars.length - 1; i >= 0; i -= 1) {
      if (world.cars[i].driver === 'block') world.cars.splice(i, 1);
    }
  }
}

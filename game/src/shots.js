// Concrete Empire — deterministic staged scenes for screenshots.
// ?shot=start|race|night|mission&seed=1 loads the game straight into a
// composed moment instead of the title screen.
import { PLACES, RACE_CPS } from './config.js';
import { makeCar } from './world.js';

export function applyShot(game, name) {
  const { world } = game;
  const p = world.player;
  game.screen = 'play';
  game.dialogue = null;

  if (name === 'start') {
    // Vic on foot outside Rosa's bar at dusk, first job on the board.
    game.time = 30;
    p.x = PLACES.spawn.x;
    p.y = PLACES.spawn.y;
    p.angle = 0.4;
    game.startMission(0);
    const car = makeCar('sedan', p.x + 90, p.y + 50, 'none', 0.3);
    world.cars.push(car);
    return;
  }

  if (name === 'race') {
    // Mid-race: Vic's race car pulling away from the pack at dusk.
    game.time = 100;
    game.missionsDone = ['pickup', 'hotwheels', 'drop', 'turf', 'score'];
    game.startMission(5);
    const m = game.mission;
    m.step = 'racing';
    m.timed = true;
    game.missionTimer = 135;
    m.cpIndex = 0;
    m.target = { ...RACE_CPS[0] };
    m.objective = 'Race! 4 checkpoints, then the finish';
    const car = game.raceCar;
    car.x = 1900;
    car.y = 880;
    car.angle = 0;
    car.vx = 300;
    car.vy = 0;
    p.x = car.x;
    p.y = car.y;
    p.angle = 0;
    const spots = [
      { x: 1720, y: 850 }, { x: 1660, y: 905 }, { x: 1760, y: 925 },
    ];
    m.rivals.forEach((r, i) => {
      r.waiting = false;
      r.cpIndex = 0;
      r.x = spots[i].x;
      r.y = spots[i].y;
      r.angle = 0;
      r.vx = 250;
      r.vy = 0;
    });
    game.dialogue = null;
    return;
  }

  if (name === 'night') {
    // Deep night in Downtown: neon, headlights, a timed delivery running.
    game.time = 180;
    game.missionsDone = ['pickup', 'hotwheels'];
    game.startMission(2);
    const car = makeCar('sedan', 1700, 1200, 'player', 0);
    car.vx = 230;
    world.cars.push(car);
    p.inCar = car;
    p.x = car.x;
    p.y = car.y;
    p.angle = 0;
    game.dialogue = null;
    return;
  }

  if (name === 'mission') {
    // The Big Score, mid-escape: three stars, PD cruisers closing in.
    game.time = 150;
    game.missionsDone = ['pickup', 'hotwheels', 'drop', 'turf'];
    game.startMission(4);
    const m = game.mission;
    m.step = 'escape';
    m.crackT = 0;
    game.setWanted(3);
    m.target = { x: PLACES.safehouse.x, y: PLACES.safehouse.y, label: PLACES.safehouse.label };
    m.objective = 'Escape to the safehouse!';
    const car = makeCar('sports', 2000, 1200, 'player', 0);
    car.vx = 200;
    car.vy = 0;
    world.cars.push(car);
    p.inCar = car;
    p.x = car.x;
    p.y = car.y;
    p.angle = 0;
    for (const [cx, cy] of [[1620, 1150], [1680, 1290]]) {
      const cop = makeCar('police', cx, cy, 'police', Math.atan2(p.y - cy, p.x - cx));
      cop.vx = 200;
      world.cars.push(cop);
      world.police.push({ car: cop, ped: null, contact: 0 });
    }
    game.dialogue = null;
  }
}

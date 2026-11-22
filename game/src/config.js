// Concrete Empire — tuning, city layout, palette and mission definitions.
// All numbers are in world pixels; the view is 1280x720 and the camera follows the player.

export const VIEW = { w: 1280, h: 720 };
export const STEP = 1 / 60;

// ---- City grid -------------------------------------------------------------
export const BLOCK = 320; // side of one city block, in pixels
export const ROAD = 96; // width of one road
export const COLS = 6; // blocks across
export const ROWS = 6; // blocks down
export const WORLD_W = COLS * BLOCK + (COLS + 1) * ROAD; // 2592
export const WORLD_H = ROWS * BLOCK + (ROWS + 1) * ROAD; // 2592
export const GRID = BLOCK + ROAD; // distance between neighbouring road centrelines

/** Centreline coordinate of road `i` (0..COLS for vertical roads, 0..ROWS for horizontal). */
export function roadLine(i) {
  return ROAD / 2 + i * GRID;
}
/** Which block column/row a world point sits in, or null when the point is on a road. */
export function blockAt(x, y) {
  const col = Math.floor((x - ROAD) / GRID);
  const row = Math.floor((y - ROAD) / GRID);
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  const lx = x - (ROAD + col * GRID);
  const ly = y - (ROAD + row * GRID);
  if (lx < 0 || lx >= BLOCK || ly < 0 || ly >= BLOCK) return null;
  return { col, row };
}
/** True when the point is on asphalt (a road or an intersection). */
export function isRoad(x, y) {
  return blockAt(x, y) === null && x >= 0 && x < WORLD_W && y >= 0 && y < WORLD_H;
}

// ---- Districts -------------------------------------------------------------
export function districtAt(col, row) {
  if (col >= 4 && row <= 1) return 'harbor';
  if (col <= 1 && row <= 2) return 'oldtown';
  if ((col === 2 && row <= 1) || (col === 2 && row === 4)) return 'park';
  if (col >= 2 && col <= 3 && row <= 2) return 'downtown';
  if (col === 2 && row === 2) return 'plaza';
  return 'suburb';
}
export const DISTRICT_NAMES = {
  downtown: 'Downtown',
  oldtown: 'Old Town',
  harbor: 'Harbor',
  park: 'Riverside Park',
  plaza: 'Empire Plaza',
  suburb: 'The Suburbs',
};

// Named places, by block. The missions and the save spawn use these.
export const PLACES = {
  rosasBar: { col: 1, row: 3, name: "Rosa's Bar" },
  harborPickup: { col: 5, row: 0, name: 'Harbor Dock 7' },
  sportsCar: { col: 3, row: 1, name: 'Downtown Showroom' },
  bank: { col: 3, row: 2, name: 'Empire Bank' },
  safehouse: { col: 0, row: 5, name: 'Safehouse' },
  park: { col: 2, row: 1, name: 'Riverside Park' },
  garage: { col: 4, row: 4, name: 'Greasy Wrench Garage' },
};

// ---- Identity: the city, the fixer, the hook --------------------------------
export const CITY_NAME = 'Velmora';
export const PLAYER_NAME = 'Vic';
export const STORY = [
  'Vic rolled into Velmora with $40 and a busted sedan.',
  "Rosa runs the streets from her bar. Do her jobs,",
  'earn your empire — one score at a time.',
];

// ---- Pickups & cash that matters --------------------------------------------
export const PICKUPS = {
  startCount: 14,
  maxCount: 14,
  respawnSeconds: 45,
  cashMin: 50,
  cashMax: 150,
  healthHeal: 40,
  armorAmount: 60, // damage absorbed before health takes a hit
  batSeconds: 90, // a picked-up bat doubles punch damage this long
  batDamage: 2,
  repairCost: 150,
  sportsCarPrice: 800,
};
export const NEAR_MISS = { reward: 10, minSpeed: 220, range: 46, cooldown: 2 };
export const CAR_MAX_HP = 100;
/** World centre of a named place's block. */
export function placeCenter(key) {
  const p = PLACES[key];
  return { x: ROAD + p.col * GRID + BLOCK / 2, y: ROAD + p.row * GRID + BLOCK / 2 };
}
/** A reachable point for a named place: the road just south of its block, at the block's centre x. */
export function placeApproach(key) {
  const p = PLACES[key];
  return { x: ROAD + p.col * GRID + BLOCK / 2, y: roadLine(p.row + 1) };
}

// ---- Palette ---------------------------------------------------------------
export const COLORS = {
  ground: '#6f7f5e',
  sidewalk: '#8f8d82',
  road: '#2e3138',
  roadLine: '#d9c25a',
  crosswalk: '#c9c7bd',
  parkGrass: '#4d7a45',
  tree: '#2e5a30',
  treeTop: '#3f7a3a',
  plazaStone: '#a49e90',
  player: '#ffd23e',
  playerOutline: '#1c1a14',
  ped: ['#e06a5a', '#5aa3e0', '#7ac74f', '#e0a35a', '#b06ad4', '#e05a9a', '#5ad4c0'],
  cop: '#2b3a55',
  building: {
    downtown: ['#4d5f7d', '#5d6f8d', '#46586e', '#6b7d9c'],
    oldtown: ['#8a6a4e', '#7d5f49', '#96714f'],
    harbor: ['#5e6e62', '#6e7d6a', '#55655e'],
    suburb: ['#a89880', '#b3a284', '#9c8c74'],
    park: [],
    plaza: [],
  },
  roof: '#3a3f47',
  car: {
    sedan: ['#c94f4f', '#4f7ec9', '#c9c94f', '#7a7a80', '#c98a4f'],
    taxi: ['#e8c33a'],
    sport: ['#d42a2a', '#1f9d55', '#e8e8e8'],
    truck: ['#8a8f96'],
    police: ['#20242c'],
  },
  policeLightA: '#ff2e2e',
  policeLightB: '#2e6bff',
  marker: '#ffd23e',
  markerRing: '#ffffff',
  neon: ['#ff2ea6', '#00e5ff', '#ffe600', '#ff6b00', '#7CFC00'],
  duskSky: '#1c2030', // drawn over the city at dusk: a translucent violet wash
  windowLit: '#ffd98a',
  windowDark: '#2a3242',
};

// ---- Player ----------------------------------------------------------------
export const PLAYER = {
  radius: 13,
  walk: 175,
  sprint: 268,
  punchRange: 36,
  punchArc: 1.1, // radians either side of facing
  punchDamage: 25,
  punchCooldown: 0.38,
  maxHealth: 100,
};

// ---- Cars ------------------------------------------------------------------
export const CAR = {
  length: 46,
  width: 22,
  accel: 430,
  brake: 640,
  reverseMax: 170,
  steer: 2.7, // radians per second at full lock, scaled by speed
  grip: 5.2, // how fast sideways velocity bleeds off (lower = more drift)
  handbrakeGrip: 1.4,
  maxSpeed: { sedan: 520, taxi: 500, sport: 660, truck: 400, police: 610 },
  damageOnHit: 14,
};

// ---- Traffic & pedestrians -------------------------------------------------
export const TRAFFIC_COUNT = 14;
export const PED_COUNT = 26;
export const TRAFFIC_SPEED = 150;
export const PED_SPEED = 62;

// ---- Wanted level ----------------------------------------------------------
export const WANTED_MAX = 5;
export const WANTED_UNSEEN_SECONDS = 10; // unseen this long before stars start dropping
export const WANTED_DECAY_SECONDS = 6; // one star per this many unseen seconds
export const BUSTED_HOLD_SECONDS = 1.2; // a cop must hold the player this long to bust them
export const SIGHT_RANGE = 380; // cops and witnesses notice crimes inside this range

// ---- Missions --------------------------------------------------------------
export const MISSIONS = [
  {
    id: 'pickup',
    title: 'The Pickup',
    reward: 300,
    type: 'collect',
    place: 'harborPickup',
    returnPlace: 'rosasBar',
    brief: "ROSA: First job, kid. A package is waiting at Harbor Dock 7. Bring it back to my bar. No heroes — just walk in, grab it, walk out.",
    objective: 'Pick up the package at Harbor Dock 7',
    objectiveReturn: "Bring the package back to Rosa's Bar",
  },
  {
    id: 'hotwheels',
    title: 'Hot Wheels',
    reward: 500,
    type: 'steal',
    place: 'sportsCar',
    brief: 'ROSA: A red Comet GT is parked outside the Downtown showroom. Take it. The owner will call the cops — lose them and the car is yours.',
    objective: 'Steal the red Comet GT',
    objectiveReturn: 'Lose the heat — get your wanted level to zero',
  },
  {
    id: 'drop',
    title: 'The Drop',
    reward: 700,
    type: 'timed',
    place: 'safehouse',
    timeLimit: 90,
    brief: 'ROSA: Ninety seconds. A buyer is waiting at the Safehouse and he does not wait. Drive like the whole city owes you money.',
    objective: 'Reach the Safehouse before the timer runs out',
  },
  {
    id: 'turf',
    title: 'Turf War',
    reward: 900,
    type: 'fight',
    place: 'park',
    rivals: 4,
    brief: 'ROSA: The Vipers think Riverside Park is theirs. It is not. Go remind them — fists only, no noise. Four of them, then the park is ours.',
    objective: 'Deal with the 4 Vipers in Riverside Park',
  },
  {
    id: 'score',
    title: 'The Big Score',
    reward: 2000,
    type: 'heist',
    place: 'bank',
    returnPlace: 'safehouse',
    holdSeconds: 5,
    brief: 'ROSA: Last one. Empire Bank, the vault, five seconds of nerve. Then every cop in the city will want you — get to the Safehouse and we are rich.',
    objective: 'Reach Empire Bank and crack the vault',
    objectiveReturn: 'Escape to the Safehouse with the money',
  },
];

export const SAVE_KEY = 'concrete-empire-save-v1';

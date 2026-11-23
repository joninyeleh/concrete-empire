// Concrete Empire — tuning, city layout, districts, missions, economy.
// All numbers are the game's own design; nothing here is copied from any
// other game's data.
export const SAVE_KEY = 'concrete-empire-save-v1';
export const START_CASH = 40;

export const CITY = { W: 3200, H: 2200 };
export const ROADS_X = [240, 560, 880, 1200, 1520, 1840, 2160, 2480, 2800];
export const ROADS_Y = [240, 560, 880, 1200, 1520, 1840];
export const ROAD_W = 64;

export const DISTRICTS = [
  { name: 'Old Town', x0: 0, y0: 0, x1: 1000, y1: 1000, ground: '#8a7f6a', roof: '#6e5f4c', neon: false },
  { name: 'Riverside Park', x0: 2000, y0: 0, x1: 3200, y1: 1000, ground: '#4d7a45', roof: '#3c6336', neon: false },
  { name: 'Downtown', x0: 1000, y0: 700, x1: 2100, y1: 1500, ground: '#5d5a68', roof: '#3f3d4a', neon: true },
  { name: 'Harbor', x0: 0, y0: 1500, x1: 1000, y1: 2200, ground: '#6b6f66', roof: '#54584e', neon: false },
  { name: 'Empire Plaza', x0: 2100, y0: 1000, x1: 3200, y1: 2200, ground: '#7a7268', roof: '#5d564c', neon: false },
  { name: 'Suburbs', x0: 1000, y0: 1500, x1: 2100, y1: 2200, ground: '#7d8a5f', roof: '#66744c', neon: false },
];

// Named places. Coordinates sit on or next to roads so every target is
// reachable by car or on foot.
export const PLACES = {
  rosa: { x: 1520, y: 880, label: "Rosa's Bar" },
  spawn: { x: 1500, y: 880 },
  dock: { x: 400, y: 1900, label: 'Harbor Dock 7' },
  garage: { x: 600, y: 600, label: 'Greasy Wrench Garage' },
  bank: { x: 2400, y: 1200, label: 'Empire Bank' },
  safehouse: { x: 2700, y: 1900, label: 'Safehouse' },
  park: { x: 2500, y: 500, label: 'Riverside Park' },
  hospital: { x: 1200, y: 1900, label: "St. Mary's Hospital" },
  cometSpot: { x: 450, y: 450 },
  vanSpot: { x: 640, y: 640 },
  bikeSpot: { x: 2400, y: 560 },
  raceStart: { x: 1434, y: 880 },
  dropTarget: { x: 2800, y: 1900, label: 'Drop-off Point' },
};

// Street-race route: four checkpoints around the city, then back to the
// start line for the finish.
export const RACE_CPS = [
  { x: 2480, y: 560, label: 'Checkpoint 1' },
  { x: 2800, y: 1520, label: 'Checkpoint 2' },
  { x: 1200, y: 1840, label: 'Checkpoint 3' },
  { x: 560, y: 1200, label: 'Checkpoint 4' },
  { x: 1434, y: 880, label: 'Finish Line' },
];

export const PRICES = { repair: 150, comet: 800, safehouse: 1200 };
export const REPAIR_COST = 150;
export const COMET_COST = 800;
export const SAFEHOUSE_COST = 1200;

// Vehicle handling. max = top speed in px/s, accel = px/s^2,
// turn = radians per second at full speed.
export const VEHICLES = {
  sedan: { max: 300, accel: 260, turn: 2.7, color: '#c0392b', name: 'Sedan' },
  sports: { max: 385, accel: 340, turn: 3.1, color: '#f1c40f', name: 'Comet GT' },
  van: { max: 215, accel: 200, turn: 2.1, color: '#7f8c8d', name: 'Van' },
  bike: { max: 405, accel: 380, turn: 3.7, color: '#8e44ad', name: 'Bike' },
  police: { max: 345, accel: 320, turn: 3.1, color: '#2c4a6b', name: 'PD Cruiser' },
  race: { max: 400, accel: 360, turn: 3.3, color: '#e74c3c', name: 'Race Car' },
};

export const ON_FOOT_SPEED = 175;
export const SPRINT_SPEED = 265;
export const COP_FOOT_SPEED = 212;
export const TRAFFIC_SPEED = 135;
export const RIVAL_SPEED = 235;

// Mission definitions, in the order Rosa hands them out.
export const MISSIONS = [
  {
    id: 'pickup', name: 'The Pickup', reward: 300,
    intro: "Rosa: Vic, baby. A package is sitting at Harbor Dock 7. Bring it back to me and don't get curious.",
    outro: 'Rosa: Clean work. The empire starts with small favors, Vic.',
  },
  {
    id: 'hotwheels', name: 'Hot Wheels', reward: 500,
    intro: "Rosa: I need a Comet GT. There is one parked in Old Town — take it, and bring it to the Greasy Wrench with no heat on you.",
    outro: 'Rosa: She purrs, huh? Keep her warm for me.',
  },
  {
    id: 'drop', name: 'The Drop', reward: 600,
    intro: 'Rosa: Ninety seconds. A package, a drop-off on the far side of town. Drive like the rent is due.',
    outro: 'Rosa: On time. The client is happy, which means I am happy.',
  },
  {
    id: 'turf', name: 'Turf War', reward: 700,
    intro: 'Rosa: The Riverside crew thinks the park is theirs. Go remind them whose town this is. Fists work. A bat works better.',
    outro: 'Rosa: The park is ours again. They will think twice next time.',
  },
  {
    id: 'score', name: 'The Big Score', reward: 1500,
    intro: 'Rosa: Empire Bank. Walk in, crack the vault, walk out rich. The whole PD will be on you — get to the safehouse.',
    outro: 'Rosa: Look at you. A hundred and fifty grand richer and still breathing.',
  },
  {
    id: 'streetrace', name: 'Midnight Grand Prix', reward: 1200,
    intro: 'Rosa: Midnight race, four checkpoints, three rivals who think they own these streets. Win it and the town talks about you.',
    outro: 'Rosa: Champion of Velmora! The streets are yours tonight.',
  },
  {
    id: 'getaway', name: 'Getaway Driver', reward: 1500,
    intro: "Rosa: My crew is waiting at the garage and the PD is already circling. Pick them up, shake three stars, and bring it home clean.",
    outro: 'Rosa: That was beautiful driving, Vic. The empire is real now.',
  },
];

export const PICKUP_DEFS = [
  { kind: 'cash', color: '#2ecc71', label: '$' },
  { kind: 'health', color: '#e74c3c', label: '+' },
  { kind: 'armor', color: '#3498db', label: 'A' },
  { kind: 'bat', color: '#d35400', label: 'B' },
];

export const RADIO_STATIONS = ['NEON DRIVE 104.7', 'VELMORA LO-FI 88.3'];

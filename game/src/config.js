// VICE HARBOR — an original open-world crime game built for make.fun gta6-01.
// All names, places, tuning numbers and art in this file are original work.
// This file holds the shared namespace and every constant the game runs on.

var VH = window.VH || (window.VH = {});

VH.CFG = {
  // Viewport the game renders at (canvas is fixed 1280x720, CSS scales it).
  viewW: 1280,
  viewH: 720,

  // City layout: a grid of square blocks separated by roads.
  blocks: 9,          // blocks per side
  block: 240,         // block size in pixels
  road: 72,           // road width in pixels
  lane: 18,           // lane offset from a road centre line
  sidewalk: 12,       // sidewalk strip width inside each block edge

  // Player on foot.
  walkSpeed: 155,
  runSpeed: 235,
  playerRadius: 13,
  playerHealth: 100,

  // Driving.
  carAccel: 250,
  carBrake: 480,
  carReverseMax: 130,
  carMaxSpeed: 330,
  carTurnRate: 2.7,
  carRadius: 17,
  carHealth: 100,

  // Traffic and pedestrians.
  trafficSpeedMin: 55,
  trafficSpeedMax: 95,
  trafficCount: 26,
  pedSpeedMin: 32,
  pedSpeedMax: 58,
  pedCount: 34,
  pedRadius: 9,

  // Police and wanted.
  maxWanted: 5,
  wantedDecaySeconds: 12,
  bustDistance: 30,
  bustHoldSeconds: 1.4,

  // Combat.
  bulletSpeed: 920,
  bulletLife: 0.55,
  fireInterval: 0.22,
  gunDamage: 1,

  // Day / night: one full cycle lasts this many real seconds.
  dayLengthSeconds: 360,

  // Save slot.
  saveKey: 'vice-harbor-save-v1',

  // Identity of the game and its city (all invented).
  title: 'VICE HARBOR',
  subtitle: 'an open-world crime story in Meridian Bay',
  cityName: 'Vice Harbor',
  playerName: 'Jax Rook',
  fixerName: 'Eddie Kwan',
  rivalName: 'Vince Marko',
  rivalCrew: 'The Breakers',
  detectiveName: 'Detective Dana Holt',
};

// World size is derived from the grid so every module agrees on it.
VH.CFG.world = VH.CFG.blocks * VH.CFG.block + (VH.CFG.blocks + 1) * VH.CFG.road;

// Street names for the minimap and mission text (invented).
VH.STREETS = [
  'Harbor Ave', 'Meridian St', 'Gull Way', 'Tide Blvd', 'Anchor Rd',
  'Copper Ln', 'Marlin St', 'Beacon Ave', 'Sailor Row', 'Dune St',
];

// Car colours and names (invented models, no real brands).
VH.CAR_TYPES = [
  { name: 'Civic', kind: 'sedan', color: '#c94f43', top: 320 },
  { name: 'Drifter', kind: 'coupe', color: '#3f7fb8', top: 350 },
  { name: 'Hauler', kind: 'truck', color: '#8a7a5a', top: 300 },
  { name: 'Comet GT', kind: 'sports', color: '#e8b93b', top: 430 },
  { name: 'Vagabond', kind: 'van', color: '#5f8f6a', top: 290 },
  { name: 'Sable', kind: 'sedan', color: '#7a5fb0', top: 320 },
  { name: 'Patrol', kind: 'police', color: '#22262e', top: 380 },
];

// Keys used by the game (KeyboardEvent.code values).
VH.KEYS = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
  run: 'ShiftLeft', enterCar: 'KeyE', handbrake: 'Space',
  pause: 'KeyP', escape: 'Escape', mute: 'KeyM',
  advance: 'KeyE', start: 'Enter',
};

// Centre line of road number i (roads run 0..blocks in each direction).
VH.roadAt = function (i) {
  return i * (VH.CFG.block + VH.CFG.road) + VH.CFG.road / 2;
};

// Block rectangle (top-left x, y and size) for block column i, row j.
VH.blockRect = function (i, j) {
  var o = VH.CFG.road + i * (VH.CFG.block + VH.CFG.road);
  var p = VH.CFG.road + j * (VH.CFG.block + VH.CFG.road);
  return { x: o, y: p, w: VH.CFG.block, h: VH.CFG.block };
};

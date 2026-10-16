export const SCENE = {
  background: 0x252525,
  fogColor: 0x252525,
  fogDensity: 0.0068,
  ground: 0x1e1e22,
};

export const LIGHTS = {
  hemi: { sky: 0x888888, ground: 0x333333, intensity: 0.8 },
  dir: {
    color: 0xffffff,
    intensity: 1.0,
    position: [42, 56, 26],
    // 1024 covers the whole 209 m set at ~8 px/m, which is enough for a contact
    // shadow; 2048 measured ~40% slower under software rasterization.
    shadowMap: 1024,
    shadowExtent: 130,
  },
};

export const MOTION = {
  maxSpeed: 30, // m/s
  acceleration: 2, // m/s^2
  deceleration: 3, // m/s^2
};

export const CAMERA = {
  fov: 45,
  near: 0.5,
  far: 1200,
  startOffset: [34, 11, -30],
  minDistance: 14,
  maxDistance: 220,
};

export const TRACK = {
  gauge: 1.435,
  sleeperSpacing: 0.62,
  sleeperSize: [2.7, 0.16, 0.28],
  span: 460, // geometric length; the scroll wraps by one spacing so it reads infinite
  ballast: { width: 3.7, height: 0.36, color: 0x4a4a52 },
  slab: { offsetX: 5.0, width: 3.0, height: 0.3, color: 0x6b6b73 },
  rail: { width: 0.08, height: 0.16, color: 0x9aa0a6 },
  groundY: 0,
};

export const CATENARY = {
  spacing: 20,
  mastHeight: 8.4,
  mastRadius: 0.16,
  armLength: 3.4,
  wireHeight: 5.4,
  color: 0x5a5f66,
  offsetX: -3.1,
};

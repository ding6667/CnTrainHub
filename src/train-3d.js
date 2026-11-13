import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * CR400BF 高寒平台车体。局部坐标：+Y 上，鼻锥朝 -Z，轨顶面 y = 0。
 * 涂装画在 CanvasTexture 上，v 按车体高度分段映射，把像素预算集中在侧墙。
 */

const DIM = {
  headLength: 25.85,
  middleLength: 25.0,
  gap: 1.036,
  floorY: 0.94,
  roofY: 4.05,
  noseLength: 9.9,
  halfWidth: 1.68,
};

const HALF_PROFILE = [
  [0, 4.05],
  [0.62, 4.04],
  [1.12, 3.98],
  [1.44, 3.86],
  [1.61, 3.7],
  [1.68, 3.48],
  [1.68, 3.1],
  [1.68, 2.6],
  [1.68, 2.1],
  [1.66, 1.62],
  [1.6, 1.24],
  [1.47, 1.04],
  [1.17, 0.96],
  [0, 0.94],
];

const RING = (() => {
  const pts = HALF_PROFILE.slice();
  for (let i = HALF_PROFILE.length - 2; i >= 1; i -= 1) pts.push([-HALF_PROFILE[i][0], HALF_PROFILE[i][1]]);
  return pts;
})();

// v 分段：车顶 0–0.13，侧墙 0.13–0.44，车底 0.44–0.5，左半镜像。
const V_SHOULDER = 0.13;
const V_SILL = 0.44;
const vOfY = (y) => {
  if (y >= 3.48) return (V_SHOULDER * (DIM.roofY - y)) / (DIM.roofY - 3.48);
  if (y >= 1.0) return V_SHOULDER + ((V_SILL - V_SHOULDER) * (3.48 - y)) / 2.48;
  return V_SILL + ((0.5 - V_SILL) * (1.0 - y)) / (1.0 - DIM.floorY);
};
const RING_V = RING.map(([x, y], i) => (i <= HALF_PROFILE.length - 1 ? vOfY(y) : 1 - vOfY(y)));
RING_V.push(1);

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (t) => t * t * (3 - 2 * t);

/** 鼻锥：越靠前越窄越低，尖端收成圆钝子弹头，不是一块竖直挡板。 */
function sectionAt(z, length, isHead) {
  if (!isHead) {
    const edge = clamp01(Math.min(z + length / 2, length / 2 - z) / 0.55);
    const k = smooth(edge);
    return { sx: 0.955 + 0.045 * k, topY: DIM.roofY - (1 - k) * 0.05, botY: DIM.floorY + (1 - k) * 0.02 };
  }
  const d = z + length / 2;
  const t = clamp01(d / DIM.noseLength);
  // 宽度按 t^0.78 收，高度按 t^1.5 抬：鼻尖压低拉长，风挡后段才快速溜上车顶。
  const sx = 0.13 + 0.87 * Math.pow(t, 0.78);
  const topY = 1.45 + (DIM.roofY - 1.45) * Math.pow(t, 1.5);
  const botY = DIM.floorY + 0.1 * Math.pow(1 - t, 2.2);
  return { sx, topY, botY };
}

const ringPoint = (i, sec) => {
  const [x, y] = RING[i % RING.length];
  const ny = sec.botY + ((y - DIM.floorY) / (DIM.roofY - DIM.floorY)) * (sec.topY - sec.botY);
  return [x * sec.sx, ny];
};

function noseSections(length) {
  const zs = [];
  const n = 32;
  for (let i = 0; i <= n; i += 1) zs.push(-length / 2 + DIM.noseLength * Math.pow(i / n, 1.6));
  const start = -length / 2 + DIM.noseLength;
  for (let i = 1; i <= 8; i += 1) zs.push(start + ((length / 2 - start) * i) / 8);
  return zs;
}

function buildBodyGeometry(isHead, length) {
  const zs = isHead
    ? noseSections(length)
    : Array.from({ length: 17 }, (_, i) => -length / 2 + (length * i) / 16);

  const positions = [];
  const uvs = [];
  const indices = [];
  const cols = RING.length + 1;

  for (const z of zs) {
    const sec = sectionAt(z, length, isHead);
    for (let i = 0; i <= RING.length; i += 1) {
      const [x, y] = ringPoint(i, sec);
      positions.push(x, y, z);
      uvs.push((z + length / 2) / length, RING_V[i]);
    }
  }
  for (let s = 0; s < zs.length - 1; s += 1) {
    for (let i = 0; i < RING.length; i += 1) {
      const a = s * cols + i;
      const c = (s + 1) * cols + i;
      indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }

  const addCap = (z, front) => {
    const sec = sectionAt(z, length, isHead);
    const u = (z + length / 2) / length;
    const center = positions.length / 3;
    positions.push(0, (sec.topY + sec.botY) / 2, z);
    uvs.push(u, vOfY((DIM.roofY + DIM.floorY) / 2));
    const start = positions.length / 3;
    for (let i = 0; i <= RING.length; i += 1) {
      const [x, y] = ringPoint(i, sec);
      positions.push(x, y, z);
      uvs.push(u, RING_V[i]);
    }
    for (let i = 0; i < RING.length; i += 1) {
      if (front) indices.push(center, start + i, start + i + 1);
      else indices.push(center, start + i + 1, start + i);
    }
  };
  addCap(zs[0], true);
  addCap(zs[zs.length - 1], false);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** 司机室风挡：贴鼻锥上表面外扩 2 cm 的曲面玻璃，后缘收成水滴尾，不留硬切边。 */
function buildCanopyGeometry(length) {
  const rows = 18;
  const cols = 13;
  const positions = [];
  const uvs = [];
  const indices = [];

  const ringAt = (r) => {
    const i0 = Math.floor(r) % RING.length;
    const i1 = (i0 + 1) % RING.length;
    const f = r - Math.floor(r);
    return [
      RING[i0][0] + (RING[i1][0] - RING[i0][0]) * f,
      RING[i0][1] + (RING[i1][1] - RING[i0][1]) * f,
      RING_V[i0] + (RING_V[i1] - RING_V[i0]) * f,
    ];
  };

  for (let s = 0; s <= rows; s += 1) {
    const t = s / rows;
    const z = -length / 2 + 0.42 + 8.1 * Math.pow(t, 1.15);
    const sec = sectionAt(z, length, true);
    // 右半 0..6 号截面点，后段向车顶中心收拢
    const span = 6 * (1 - Math.pow(t, 1.7)) + 0.35;
    for (let c = 0; c < cols; c += 1) {
      const j = c <= 6 ? c : cols - 1 - c;
      const sign = c <= 6 ? 1 : -1;
      const [rx, ry, rv] = ringAt((j * span) / 6);
      const ny = sec.botY + ((ry - DIM.floorY) / (DIM.roofY - DIM.floorY)) * (sec.topY - sec.botY);
      positions.push(sign * rx * sec.sx, ny, z);
      uvs.push((z + length / 2) / length, sign > 0 ? rv : 1 - rv);
    }
  }
  for (let s = 0; s < rows; s += 1) {
    for (let c = 0; c < cols - 1; c += 1) {
      const a = s * cols + c;
      const b = (s + 1) * cols + c;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  for (let i = 0; i < pos.count; i += 1) {
    pos.setXYZ(i, pos.getX(i) + nor.getX(i) * 0.024, pos.getY(i) + nor.getY(i) * 0.024, pos.getZ(i) + nor.getZ(i) * 0.024);
  }
  pos.needsUpdate = true;
  return geo;
}

/** 侧窗 / 车门布局，几何与贴图共用同一份，保证窗框对得上玻璃。 */
function layout(isHead, length) {
  const half = length / 2;
  if (isHead) {
    return {
      cab: { z0: -half + 6.5, z1: -half + 8.7, y0: 2.34, y1: 3.04 },
      doors: [-half + 11.9, half - 2.9],
      windows: Array.from({ length: 7 }, (_, i) => -half + 13.9 + i * 1.46),
      winW: 1.12,
    };
  }
  return {
    cab: null,
    doors: [-half + 2.9, half - 2.9],
    windows: Array.from({ length: 11 }, (_, i) => -7.1 + i * 1.42),
    winW: 1.1,
  };
}

const WIN_Y0 = 2.3;
const WIN_Y1 = 3.02;

function quadZ(z0, z1, y0, y1, x, tint) {
  const g = new THREE.BufferGeometry();
  const s = Math.sign(x);
  // 面朝车外的绕序
  const v = s > 0 ? [z1, y0, z0, y0, z0, y1, z1, y1] : [z0, y0, z1, y0, z1, y1, z0, y1];
  const pos = [];
  for (let i = 0; i < 4; i += 1) pos.push(x, v[i * 2 + 1], v[i * 2]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([s, 0, 0, s, 0, 0, s, 0, 0, s, 0, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(Array(4).fill(tint).flat(), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

function buildGlassGeometry(isHead, length, seed) {
  const L = layout(isHead, length);
  const parts = [];
  let n = seed;
  const tint = () => {
    n = (n * 1103515245 + 12345) % 2147483648;
    const r = n / 2147483648;
    return [0.5 + r * 0.42, 0.54 + r * 0.36, 0.62 + r * 0.28];
  };
  for (const side of [-1, 1]) {
    const x = side * (DIM.halfWidth + 0.014);
    for (const z of L.windows) parts.push(quadZ(z - L.winW / 2, z + L.winW / 2, WIN_Y0, WIN_Y1, x, tint()));
    for (const z of L.doors) parts.push(quadZ(z - 0.26, z + 0.26, 2.32, 3.0, x, tint()));
    if (L.cab) {
      const c = L.cab;
      const g = new THREE.BufferGeometry();
      const pts = [
        [c.z0, c.y0 + 0.16],
        [c.z1, c.y0],
        [c.z1, c.y1],
        [c.z0 + 0.34, c.y1],
      ];
      const pos = [];
      const order = side > 0 ? [0, 1, 2, 3] : [3, 2, 1, 0];
      for (const i of order) pos.push(x, pts[i][1], pts[i][0]);
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(Array(4).fill([side, 0, 0]).flat(), 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(Array(4).fill([0.5, 0.55, 0.62]).flat(), 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      parts.push(g);
    }
  }
  return mergeGeometries(parts);
}

function buildCanopyGlass(length) {
  const canopy = buildCanopyGeometry(length);
  canopy.setAttribute('color', new THREE.Float32BufferAttribute(Array(canopy.attributes.position.count).fill([1, 1, 1]).flat(), 3));
  return canopy;
}

const box = (w, h, d, x, y, z) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
};

const cyl = (r, h, seg, x, y, z, axis = 'y') => {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
};

const strut = (from, to, r, seg = 6) => {
  const dir = new THREE.Vector3().subVectors(to, from);
  const g = new THREE.CylinderGeometry(r, r, dir.length(), seg);
  g.translate(0, dir.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  g.translate(from.x, from.y, from.z);
  return g;
};

/** 裙板：薄地板 + 分段裙板 + 格栅，转向架处断开让轮对露出来。 */
function buildSkirtGeometry(isHead, length) {
  const half = length / 2;
  const inset = isHead ? 5.4 : 4.2;
  const bogies = [-(half - inset), half - inset];
  const parts = [];
  const z0 = isHead ? -half + 5.0 : -half + 0.35;
  const z1 = half - 0.35;

  parts.push(box(2.62, 0.16, z1 - z0, 0, 0.9, (z0 + z1) / 2));
  let cursor = z0;
  for (const bz of bogies) {
    const a = bz - 1.85;
    const b = bz + 1.85;
    if (a > cursor + 0.2) {
      const len = a - cursor;
      parts.push(box(3.02, 0.44, len, 0, 0.66, cursor + len / 2));
      for (let i = 0; i < Math.floor(len / 1.5); i += 1) {
        parts.push(box(3.06, 0.2, 0.62, 0, 0.68, cursor + 0.75 + i * 1.5));
      }
    }
    cursor = b;
  }
  if (z1 > cursor + 0.2) {
    const len = z1 - cursor;
    parts.push(box(3.02, 0.44, len, 0, 0.66, cursor + len / 2));
  }
  if (isHead) {
    parts.push(box(2.1, 0.34, 3.4, 0, 0.78, -half + 3.4));
    parts.push(box(1.5, 0.26, 1.5, 0, 0.66, -half + 1.5));
    parts.push(box(0.5, 0.3, 0.5, 0, 0.72, -half + 0.62));
  }
  return mergeGeometries(parts);
}

/** 转向架：构架 + 轮对 + 轴箱 + 一系弹簧，轮径 0.92 m 落在轨顶。 */
function buildBogieGeometry(isHead, length) {
  const half = length / 2;
  const inset = isHead ? 5.4 : 4.2;
  const parts = [];
  for (const bz of [-(half - inset), half - inset]) {
    for (const sx of [-1, 1]) {
      parts.push(box(0.16, 0.42, 3.0, sx * 1.02, 0.62, bz));
      parts.push(box(0.2, 0.2, 0.5, sx * 1.02, 0.86, bz));
    }
    parts.push(box(2.0, 0.24, 0.44, 0, 0.78, bz));
    parts.push(box(1.9, 0.2, 0.3, 0, 0.5, bz));
    for (const dz of [-1.25, 1.25]) {
      parts.push(cyl(0.07, 1.72, 6, 0, 0.46, bz + dz, 'x'));
      for (const sx of [-1, 1]) {
        parts.push(cyl(0.46, 0.13, 10, sx * 0.715, 0.46, bz + dz, 'x'));
        parts.push(box(0.22, 0.3, 0.34, sx * 0.9, 0.62, bz + dz));
        parts.push(cyl(0.09, 0.18, 4, sx * 0.9, 0.82, bz + dz));
      }
    }
    parts.push(box(0.5, 0.22, 0.9, 0.55, 0.56, bz + 0.4));
  }
  return mergeGeometries(parts);
}

function buildRoofGeometry(isHead, length) {
  const parts = [];
  const z0 = isHead ? -length / 2 + 8.6 : -length / 2 + 0.6;
  const z1 = length / 2 - 0.6;
  parts.push(box(2.24, 0.13, z1 - z0, 0, 4.06, (z0 + z1) / 2));
  const units = isHead ? [1.6, 6.4] : [-7.4, -1.2, 5.2];
  for (const z of units) parts.push(box(1.86, 0.24, 3.1, 0, 4.16, z));
  for (const z of units) parts.push(box(1.5, 0.06, 2.6, 0, 4.3, z));
  const ants = isHead ? [[-1.0, -1.6], [1.0, 3.2], [-1.0, 9.4]] : [[-1.0, -9.6], [1.0, -4.4], [-1.0, 1.8], [1.0, 8.6]];
  for (const [ax, az] of ants) {
    parts.push(box(0.2, 0.06, 0.2, ax, 4.12, az));
    parts.push(box(0.06, 0.22, 0.06, ax, 4.24, az));
  }
  return mergeGeometries(parts);
}

/** 受电弓：底架 + 下臂 + 上臂 + 弓头滑板，升弓时滑板贴到 5.4 m 接触线。 */
function buildPantoGeometry(z, raised) {
  const parts = [];
  for (const x of [-0.62, 0.62]) parts.push(box(0.2, 0.16, 0.9, x, 4.2, z));
  parts.push(box(1.6, 0.1, 0.28, 0, 4.24, z + 0.4));
  parts.push(box(1.6, 0.1, 0.28, 0, 4.24, z - 0.4));
  for (const x of [-0.5, 0.5]) parts.push(cyl(0.11, 0.2, 8, x, 4.34, z + 0.4));
  if (raised) {
    for (const x of [-0.46, 0.46]) {
      parts.push(strut(new THREE.Vector3(x, 4.4, z + 0.4), new THREE.Vector3(x * 0.72, 5.02, z - 0.34), 0.055));
      parts.push(strut(new THREE.Vector3(x * 0.72, 5.02, z - 0.34), new THREE.Vector3(x * 0.6, 5.3, z + 0.16), 0.045));
      parts.push(strut(new THREE.Vector3(x, 4.4, z - 0.3), new THREE.Vector3(x * 0.72, 4.98, z - 0.3), 0.03));
    }
    parts.push(box(1.9, 0.06, 0.1, 0, 5.34, z + 0.16));
    parts.push(box(1.9, 0.05, 0.26, 0, 5.38, z + 0.16));
    for (const x of [-0.95, 0.95]) {
      parts.push(strut(new THREE.Vector3(x, 5.36, z + 0.16), new THREE.Vector3(x * 1.12, 5.2, z + 0.16), 0.03));
    }
  } else {
    for (const x of [-0.46, 0.46]) {
      parts.push(strut(new THREE.Vector3(x, 4.4, z + 0.4), new THREE.Vector3(x * 0.8, 4.56, z - 0.5), 0.055));
      parts.push(strut(new THREE.Vector3(x * 0.8, 4.56, z - 0.5), new THREE.Vector3(x * 0.7, 4.46, z + 0.42), 0.045));
    }
    parts.push(box(1.9, 0.06, 0.26, 0, 4.5, z + 0.44));
  }
  return mergeGeometries(parts);
}

// ---------------------------------------------------------------- livery ---

const TEX_W = 3072;
const TEX_H = 768;
const PX_SHOULDER = V_SHOULDER * TEX_H;
const PX_SILL = V_SILL * TEX_H;
const PX_PER_M = (PX_SILL - PX_SHOULDER) / 2.48;
const yPx = (y) => PX_SHOULDER + (3.48 - y) * PX_PER_M;

const PALETTES = {
  dragon: { red: '#d21f26', redDeep: '#8d151c', redLight: '#ef3b34', gold: '#e3a63a', goldDeep: '#b8791f', ink: '#0d1116' },
  phoenix: { red: '#c9a227', redDeep: '#8f6f14', redLight: '#e8c65a', gold: '#f0d27a', goldDeep: '#a8801a', ink: '#0d1116' },
};

function bodyBase(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, TEX_H);
  g.addColorStop(0, '#6f7880');
  g.addColorStop(0.06, '#98a2ab');
  g.addColorStop(0.13, '#adb7c0');
  g.addColorStop(0.2, '#c4ccd4');
  g.addColorStop(0.31, '#c6ced6');
  g.addColorStop(0.44, '#8b939b');
  g.addColorStop(0.5, '#6e767e');
  g.addColorStop(0.56, '#8b939b');
  g.addColorStop(0.69, '#c6ced6');
  g.addColorStop(0.8, '#c4ccd4');
  g.addColorStop(0.87, '#adb7c0');
  g.addColorStop(0.94, '#98a2ab');
  g.addColorStop(1, '#6f7880');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
}

/** 一条起伏的飘带：中心线正弦，厚度随相位呼吸，两端收尖。 */
function ribbon(ctx, x0, x1, mid, amp, thick, phase, cycles, fill, taper = 0) {
  const N = 200;
  const top = [];
  const bot = [];
  for (let i = 0; i <= N; i += 1) {
    const t = i / N;
    const x = x0 + (x1 - x0) * t;
    const a = Math.sin(cycles * Math.PI * 2 * t + phase);
    const c = mid + amp * a;
    const breathe = 0.58 + 0.42 * (0.5 + 0.5 * Math.cos(cycles * Math.PI * 2 * t + phase + 1.1));
    let w = thick * breathe;
    if (taper > 0) w *= Math.min(1, Math.min(t, 1 - t) / taper);
    top.push([x, c - w / 2]);
    bot.push([x, c + w / 2]);
  }
  ctx.beginPath();
  ctx.moveTo(top[0][0], top[0][1]);
  for (const [x, y] of top.slice(1)) ctx.lineTo(x, y);
  for (let i = bot.length - 1; i >= 0; i -= 1) ctx.lineTo(bot[i][0], bot[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function bandGradient(ctx, y0, y1, light, dark) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, light);
  g.addColorStop(0.55, dark);
  g.addColorStop(1, light);
  return g;
}

/** 龙凤呈祥：红金双色飘带，一节车一个波峰一个波谷，带流星尾焰式分支。 */
function dragonRibbons(ctx, P, x0, x1, phase) {
  const top = yPx(2.04);
  const bot = yPx(1.0);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, top, x1 - x0, bot - top);
  ctx.clip();

  const mid = (top + bot) / 2 + 4;
  const span = x1 - x0;
  const u = (t) => x0 + span * t;

  ribbon(ctx, x0, x1, mid - 34, 26, 8, phase + 0.9, 1, P.goldDeep, 0.06);
  ribbon(ctx, x0, x1, mid - 26, 31, 17, phase + 0.45, 1, bandGradient(ctx, top, bot, P.gold, P.goldDeep), 0.04);
  ribbon(ctx, x0, x1, mid + 2, 34, 74, phase, 1, bandGradient(ctx, top, bot, P.redLight, P.redDeep), 0.025);
  ribbon(ctx, x0, x1, mid + 30, 27, 16, phase - 0.5, 1, P.red, 0.07);
  ribbon(ctx, x0, x1, mid + 42, 22, 6, phase - 0.95, 1, P.goldDeep, 0.12);

  // 尾焰分支：从主带波峰甩出去的两道细红丝
  ctx.strokeStyle = P.red;
  ctx.lineCap = 'round';
  for (const [t0, dir] of [[0.18, -1], [0.72, 1]]) {
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(u(t0), mid + 2 + 34 * Math.sin(Math.PI * 2 * t0 + phase));
    ctx.quadraticCurveTo(u(t0 + 0.1 * dir), mid - 30, u(t0 + 0.24 * dir), mid - 38);
    ctx.stroke();
  }
  ctx.restore();
}

function phoenixRibbons(ctx, P, x0, x1) {
  const top = yPx(2.04);
  const bot = yPx(1.0);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, top, x1 - x0, bot - top);
  ctx.clip();
  const y = yPx(1.92);
  ctx.fillStyle = bandGradient(ctx, y - 10, y + 26, P.redLight, P.redDeep);
  ctx.fillRect(x0, y, x1 - x0, 22);
  ctx.fillStyle = P.goldDeep;
  ctx.fillRect(x0, y + 26, x1 - x0, 4);
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.fillRect(x0, y + 22, x1 - x0, 3);
  ctx.restore();
}

function liveryTexture(kind, variant, palette, label) {
  const P = PALETTES[palette] ?? PALETTES.dragon;
  const isHead = kind === 'head';
  const length = isHead ? DIM.headLength : DIM.middleLength;
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');
  const L = layout(isHead, length);
  const uPx = (z) => ((z + length / 2) / length) * TEX_W;

  bodyBase(ctx);

  // 板缝
  ctx.strokeStyle = 'rgba(120,132,144,.16)';
  ctx.lineWidth = 2;
  for (let z = -length / 2 + 1.6; z < length / 2; z += 2.4) {
    if (isHead && z < -length / 2 + DIM.noseLength) continue;
    ctx.beginPath();
    ctx.moveTo(uPx(z), PX_SHOULDER + 4);
    ctx.lineTo(uPx(z), PX_SILL - 2);
    ctx.stroke();
  }

  const bandTop = yPx(3.14);
  const bandBot = yPx(2.06);
  const noseEnd = isHead ? uPx(-length / 2 + DIM.noseLength) : 0;

  // 黑色窗带
  ctx.fillStyle = P.ink;
  ctx.fillRect(noseEnd, bandTop, TEX_W - noseEnd, bandBot - bandTop);
  ctx.fillStyle = 'rgba(255,255,255,.07)';
  ctx.fillRect(noseEnd, bandTop, TEX_W - noseEnd, 3);

  // 窗框 + 门框（玻璃是独立网格，这里只画框）
  ctx.strokeStyle = 'rgba(150,164,178,.5)';
  ctx.lineWidth = 2.5;
  for (const z of L.windows) {
    const x = uPx(z - L.winW / 2);
    ctx.strokeRect(x, yPx(WIN_Y1), uPx(z + L.winW / 2) - x, yPx(WIN_Y0) - yPx(WIN_Y1));
  }
  for (const z of L.doors) {
    const x0 = uPx(z - 0.72);
    const x1 = uPx(z + 0.72);
    ctx.strokeStyle = 'rgba(120,134,148,.75)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x0, bandTop + 3, x1 - x0, yPx(1.06) - bandTop - 3);
    ctx.beginPath();
    ctx.moveTo((x0 + x1) / 2, bandTop + 3);
    ctx.lineTo((x0 + x1) / 2, yPx(1.06));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(150,164,178,.5)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(uPx(z - 0.26), yPx(3.0), uPx(z + 0.26) - uPx(z - 0.26), yPx(2.32) - yPx(3.0));
  }

  if (palette === 'dragon') dragonRibbons(ctx, P, isHead ? noseEnd * 0.42 : 0, TEX_W, variant ? Math.PI : 0);
  else phoenixRibbons(ctx, P, isHead ? noseEnd * 0.42 : 0, TEX_W);

  if (isHead) {
    const canopyEdge = [
      [0, yPx(1.42)],
      [TEX_W * 0.09, yPx(1.78)],
      [TEX_W * 0.2, yPx(2.34)],
      [TEX_W * 0.3, yPx(2.95)],
      [noseEnd * 0.97, PX_SHOULDER],
    ];
    const trace = () => {
      ctx.beginPath();
      ctx.moveTo(canopyEdge[0][0], canopyEdge[0][1]);
      for (let i = 1; i < canopyEdge.length - 1; i += 1) {
        const [x, y] = canopyEdge[i];
        const [nx, ny] = canopyEdge[i + 1];
        ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
      }
      ctx.lineTo(canopyEdge[canopyEdge.length - 1][0], canopyEdge[canopyEdge.length - 1][1]);
    };

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(noseEnd * 0.97, 0);
    ctx.lineTo(noseEnd * 0.97, PX_SHOULDER);
    for (let i = canopyEdge.length - 2; i >= 0; i -= 1) {
      const [x, y] = canopyEdge[i];
      const [px, py] = canopyEdge[i + 1];
      ctx.quadraticCurveTo(px, py, (x + px) / 2, (y + py) / 2);
    }
    ctx.lineTo(0, yPx(1.42));
    ctx.closePath();
    const cg = ctx.createLinearGradient(0, 0, 0, yPx(1.4));
    cg.addColorStop(0, '#05080b');
    cg.addColorStop(0.55, '#0e161d');
    cg.addColorStop(1, '#1d2a34');
    ctx.fillStyle = cg;
    ctx.fill();

    ctx.lineJoin = 'round';
    ctx.strokeStyle = palette === 'dragon' ? P.red : P.red;
    ctx.lineWidth = 9;
    trace();
    ctx.stroke();
    ctx.strokeStyle = P.gold;
    ctx.lineWidth = 3;
    ctx.save();
    ctx.translate(0, 9);
    trace();
    ctx.stroke();
    ctx.restore();

    // 司机室侧窗框
    const c = L.cab;
    ctx.beginPath();
    ctx.moveTo(uPx(c.z0), yPx(c.y0 + 0.16));
    ctx.lineTo(uPx(c.z1), yPx(c.y0));
    ctx.lineTo(uPx(c.z1), yPx(c.y1));
    ctx.lineTo(uPx(c.z0 + 0.34), yPx(c.y1));
    ctx.closePath();
    ctx.fillStyle = '#0a0f14';
    ctx.fill();
    ctx.strokeStyle = palette === 'dragon' ? P.red : P.gold;
    ctx.lineWidth = 5;
    ctx.stroke();

    // 头灯位置（实体灯罩另有网格，这里画灯腔）
    for (const s of [-1, 1]) {
      const x = uPx(-length / 2 + 1.5);
      const y = yPx(2.593);
      ctx.fillStyle = '#0a0e12';
      ctx.beginPath();
      ctx.roundRect(x - 46, y - 12 + s * 0, 92, 24, 8);
      ctx.fill();
    }
    // 鼻尖下方的排障器阴影
    ctx.fillStyle = 'rgba(60,70,80,.55)';
    ctx.fillRect(0, yPx(1.12), uPx(-length / 2 + 2.2), yPx(1.0) - yPx(1.12));
  }

  // 右半镜像到左半（图形对称），文字随后单独画，避免反字
  ctx.save();
  ctx.translate(0, TEX_H);
  ctx.scale(1, -1);
  ctx.drawImage(canvas, 0, 0, TEX_W, TEX_H / 2, 0, 0, TEX_W, TEX_H / 2);
  ctx.restore();

  const text = (str, z, y, font, color, mirrorRight = true) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = 'alphabetic';
    const x = uPx(z);
    // 左侧（-X）：u 与屏幕同向，正常绘制
    ctx.save();
    ctx.translate(x, TEX_H - y);
    ctx.scale(1, -1);
    ctx.fillText(str, 0, 0);
    ctx.restore();
    // 右侧（+X）：u 与屏幕反向，需要水平镜像
    ctx.save();
    ctx.translate(x, y);
    if (mirrorRight) ctx.scale(-1, 1);
    ctx.fillText(str, 0, 0);
    ctx.restore();
  };

  const gold = palette === 'dragon' ? '#e8b44a' : '#d8b23c';
  if (isHead) {
    text('复兴号', -length / 2 + 17.4, yPx(3.36), '700 46px "Microsoft YaHei","Segoe UI",sans-serif', gold);
    text('CR', -length / 2 + 10.6, yPx(2.62), '800 40px "Segoe UI",sans-serif', '#f2f5f8');
    text(label, -length / 2 + 13.2, yPx(1.34), '600 22px "Segoe UI",sans-serif', '#4a545e');
  } else {
    text('复兴号', -1.0, yPx(3.36), '700 34px "Microsoft YaHei","Segoe UI",sans-serif', gold);
    text(label, -8.6, yPx(1.34), '600 20px "Segoe UI",sans-serif', '#4a545e');
    text('ZE', 6.4, yPx(1.34), '600 20px "Segoe UI",sans-serif', '#4a545e');
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // 画布第 0 行直接对应 v=0（车顶）。默认的 flipY 会把上下半张对调，
  // 左右侧文字就会跑到反侧并被镜像。
  tex.flipY = false;
  tex.anisotropy = 8;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// ----------------------------------------------------------------- train ---

export function buildTrain(cfg) {
  const headLen = cfg.set?.headLength ?? DIM.headLength;
  const midLen = cfg.set?.middleLength ?? DIM.middleLength;
  const gap = cfg.set?.gap ?? DIM.gap;
  const formation = Math.max(2, cfg.formation ?? 8);
  const palette = cfg.livery ?? 'dragon';
  const keys = ['Head', ...Array(formation - 2).fill('Middle'), 'Head'];

  const total = keys.reduce((s, k) => s + (k === 'Head' ? headLen : midLen) + gap, 0) - gap;
  const headZ = -total / 2 + headLen / 2;

  const headGeo = buildBodyGeometry(true, headLen);
  const midGeo = buildBodyGeometry(false, midLen);
  const headGlass = buildGlassGeometry(true, headLen, 7);
  const midGlassA = buildGlassGeometry(false, midLen, 31);
  const midGlassB = buildGlassGeometry(false, midLen, 97);

  const buckets = { head: [], midA: [], midB: [], glass: [], canopy: [], skirt: [], bogie: [], roof: [], pantoUp: [], pantoDown: [] };
  const matrix = new THREE.Matrix4();
  const put = (list, geo, m) => {
    geo.applyMatrix4(m);
    list.push(geo);
  };

  let front = -total / 2;
  let midIndex = 0;
  keys.forEach((key, i) => {
    const isHead = key === 'Head';
    const len = isHead ? headLen : midLen;
    const rot = i === keys.length - 1 ? Math.PI : 0;
    matrix.makeRotationY(rot);
    matrix.setPosition(0, 0, front + len / 2);

    const variant = !isHead && midIndex % 2 === 1;
    put(isHead ? buckets.head : variant ? buckets.midB : buckets.midA, (isHead ? headGeo : midGeo).clone(), matrix);
    put(buckets.glass, (isHead ? headGlass : variant ? midGlassB : midGlassA).clone(), matrix);
    if (isHead) put(buckets.canopy, buildCanopyGlass(len), matrix);
    put(buckets.skirt, buildSkirtGeometry(isHead, len), matrix);
    put(buckets.bogie, buildBogieGeometry(isHead, len), matrix);
    put(buckets.roof, buildRoofGeometry(isHead, len), matrix);

    if (i === 2 || i === keys.length - 3) {
      const pz = isHead ? 2.0 : 2.4;
      put(buckets.pantoUp, buildPantoGeometry(pz, true), matrix);
      put(buckets.pantoDown, buildPantoGeometry(pz, false), matrix);
    }
    if (i < keys.length - 1) {
      const gz = front + len + gap / 2;
      const g = box(2.86, 2.5, gap + 0.16, 0, 2.32, gz);
      buckets.bogie.push(g);
      buckets.bogie.push(box(2.94, 0.1, gap + 0.2, 0, 3.6, gz));
    }
    if (!isHead) midIndex += 1;
    front += len + gap;
  });

  headGeo.dispose();
  midGeo.dispose();
  headGlass.dispose();
  midGlassA.dispose();
  midGlassB.dispose();

  const label = cfg.name ?? 'CR400BF-GZ';
  const bodyMat = (tex) =>
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.26, metalness: 0.4, envMapIntensity: 1.25 });

  const materials = {
    head: bodyMat(liveryTexture('head', 0, palette, label)),
    midA: bodyMat(liveryTexture('mid', 0, palette, label)),
    midB: bodyMat(liveryTexture('mid', 1, palette, label)),
    glass: new THREE.MeshStandardMaterial({
      color: 0x05080c,
      roughness: 0.14,
      metalness: 0.15,
      envMapIntensity: 0.5,
      vertexColors: true,
      emissive: new THREE.Color(0xffbe7a),
      emissiveIntensity: 0,
    }),
    canopy: new THREE.MeshStandardMaterial({
      color: 0x04070a,
      roughness: 0.34,
      metalness: 0.1,
      envMapIntensity: 0.16,
      vertexColors: true,
    }),
    skirt: new THREE.MeshStandardMaterial({ color: 0x8e979f, roughness: 0.62, metalness: 0.35 }),
    bogie: new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.8, metalness: 0.3 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x767e86, roughness: 0.45, metalness: 0.5 }),
    panto: new THREE.MeshStandardMaterial({ color: 0x9aa2aa, roughness: 0.45, metalness: 0.6 }),
    lampF: new THREE.MeshBasicMaterial({ color: 0xfff2d2 }),
    lampR: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
  };

  const group = new THREE.Group();
  group.name = 'consist';
  const add = (name, geos, mat, shadow = true) => {
    if (!geos.length) return null;
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.name = name;
    mesh.castShadow = shadow;
    mesh.receiveShadow = false;
    group.add(mesh);
    return mesh;
  };

  const meshes = {
    head: add('body-head', buckets.head, materials.head),
    midA: add('body-mid-a', buckets.midA, materials.midA),
    midB: add('body-mid-b', buckets.midB, materials.midB),
    glass: add('glass', buckets.glass, materials.glass, false),
    canopy: add('canopy', buckets.canopy, materials.canopy, false),
    skirt: add('skirt', buckets.skirt, materials.skirt),
    bogie: add('bogie', buckets.bogie, materials.bogie),
    roof: add('roof', buckets.roof, materials.roof),
    pantoUp: add('panto-up', buckets.pantoUp, materials.panto),
    pantoDown: add('panto-down', buckets.pantoDown, materials.panto),
  };
  meshes.pantoDown.visible = false;

  // 头灯 / 尾灯：贴在鼻锥斜面上的灯罩
  const lampGeos = (sign) => {
    const list = [];
    const z = -total / 2 + 1.5;
    const sec = sectionAt(-headLen / 2 + 1.5, headLen, true);
    const yc = 2.593;
    const y = sec.botY + ((yc - DIM.floorY) / (DIM.roofY - DIM.floorY)) * (sec.topY - sec.botY);
    const x = DIM.halfWidth * sec.sx;
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.42, 0.11, 0.07);
      g.rotateY(s * 0.62);
      g.translate(s * (x + 0.02), y, sign * z);
      list.push(g);
    }
    return list;
  };
  meshes.lampF = add('lamp-front', lampGeos(1), materials.lampF, false);
  meshes.lampR = add('lamp-rear', lampGeos(-1), materials.lampR, false);

  const glowPoints = [];
  const glowColors = [];
  const lz = -total / 2 + 1.42;
  const lsec = sectionAt(-headLen / 2 + 1.5, headLen, true);
  const ly = lsec.botY + ((2.593 - DIM.floorY) / (DIM.roofY - DIM.floorY)) * (lsec.topY - lsec.botY);
  const lx = DIM.halfWidth * lsec.sx + 0.06;
  for (const s of [-1, 1]) {
    glowPoints.push(s * lx, ly, lz, s * lx, ly, -lz);
    glowColors.push(1, 0.93, 0.76, 1, 0.16, 0.14);
  }

  return {
    group,
    total,
    headZ,
    cars: keys.length,
    materials,
    meshes,
    lampPositions: glowPoints,
    lampColors: glowColors,
    setPanto(raised) {
      meshes.pantoUp.visible = raised;
      meshes.pantoDown.visible = !raised;
    },
    setWireframe(on) {
      for (const m of Object.values(materials)) m.wireframe = on;
    },
    dispose() {
      group.traverse((o) => o.geometry?.dispose());
      for (const m of Object.values(materials)) {
        m.map?.dispose();
        m.dispose();
      }
    },
  };
}
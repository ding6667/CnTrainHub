import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildFamilyTrain } from './train-families.js';

/**
 * CR400BF 高寒平台车体。局部坐标：+Y 上，鼻锥朝 -Z，轨顶面 y = 0。
 * 涂装画在 CanvasTexture 上，v 按车体高度分段映射，把像素预算集中在侧墙。
 * 其余平台（CRH5 / CRH380B / CR200J）在 train-families.js 里单独建模。
 *
 * ============================================================================
 * 实车核对结论（2026-11 联网逐轮检索 + 实车照片比对，配色为近似复刻）
 * ----------------------------------------------------------------------------
 * 第 1 轮 · CR400BF-GZ / BF-Z「龙凤呈祥」侧视、前脸
 *  - 银灰金属漆车身、前端「龙形」钝楔长鼻（不是细针尖）：鼻尖收成宽圆弧，
 *    宽度早早鼓起；黑色整体式风挡，鼻锥有红金眉线由风挡下缘向车侧甩出。
 *  - 「国旗红 / 故宫红 / 祥龙黄」三色「凤尾」上下舞动、交织缠绕：一道宽红
 *    主带沿车侧作大波浪，波峰拱到黑窗带下缘、波谷压到裙板上沿；金带贴红带
 *    上缘平行扫过，另有金细丝与尾焰分支。每节车一个完整周期，列车间连续。
 *  - 金色立体「复兴号」字样 + 白色「CR」标识。
 *  来源 https://new.qq.com/rain/a/20240109A09A3K00
 *       https://www.toutiao.com/article/7345686197182251557
 *       https://m.gmw.cn/toutiao/2024-01/07/content_1303623203.htm
 *       https://epaper.ynet.com/images/2021-06/26/A04/bjbqb20210626A04.pdf
 *  实车照片（腾讯图集 gz3 / 维基哈局图集）：
 *       https://commons.wikimedia.org/wiki/Category:Electric_multiple_units_of_China_Railway_Harbin_Group
 *  核对要点：黑窗带内确实有银色竖直窗间柱（不是一条纯黑长带）；节间为深色
 *  贯通风挡；车顶可见受电弓与空调罩；侧墙有板缝与金属拉丝质感。
 * ----------------------------------------------------------------------------
 * 第 2 轮 · CR400BF-G / GS「金凤凰 / 冰凤凰」侧视、前脸
 *  - 白色底色，「一粗一细」两条金色腰线压在黑色侧窗带下方；前窗与两侧司机
 *    室观察窗周围用金线描边。
 *  - 车头正面两条金色色带如「凤凰展翅」：从鼻尖向两侧沿风挡上扬，夹着黑色
 *    风挡，鼻侧另有小金色圆徽。风挡内有雨刷。
 *  - 全列 26 个塞拉门；裙板通风格栅为「V 型迷宫」式；车顶主要高压部件集成
 *    在密封高压设备箱；4M4T 8 辆编组、全长 208~209 m。
 *  来源 https://www.toutiao.com/article/6924105458986861060
 *       https://m.thepaper.cn/rss_newsDetail_9833911
 *       https://baike.baidu.com/item/%E5%A4%8D%E5%85%B4%E5%8F%B7CR400BF-G%E5%9E%8B%E7%94%B5%E5%8A%9B%E5%8A%A8%E8%BD%A6%E7%BB%84/64344195
 *       https://wap.peopleapp.com/article/6117954/6026843
 *  实车照片（人民日报图集 jfh4 雪地高架侧视 / jfh5 库内双车头特写）：
 *       https://rmrbcmsonline.peopleapp.com/upload/ueditor/image/20210122/1611306071434611.jpg
 * ----------------------------------------------------------------------------
 * 车门几何口径（务必与客流 / 停站 / 相机共用同一套数据，不另造一套）
 *  src/journey/core.js 的 createTrainSpec 由 carLengths 推导：
 *      doorZ = [front + 2.2, front + len - 2.2]（每节车两端内收 2.2 m）；
 *      passengers.js 的 splitByCar / doorMids 取两门中点作为乘降目标 z。
 *  故本文件 DOOR_INSET = 2.2，中间车两门 = [-half+2.2, half-2.2]。
 *  头车前端 2.2 m 落在司机室鼻锥内（不能开客室门），改为司机登乘门（内收至
 *  鼻锥之后），后端门仍用 half-2.2；乘降目标取两门中点≈车厢中心，不受影响。
 * ============================================================================
 */

const DIM = {
  headLength: 25.85,
  middleLength: 25.0,
  gap: 1.036,
  floorY: 0.94,
  roofY: 4.05,
  shoulderY: 3.48,
  vLow: 1.0,
  noseLength: 9.2,
  halfWidth: 1.68,
};

// 车门内收量，与 journey/core.js createTrainSpec 的 doorZ 一致。
const DOOR_INSET = 2.2;

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

/** 鼻锥：饱满的圆钝楔形长鼻（宽度早早鼓起、鼻尖收成宽圆弧），不是竖直挡板也不是针尖。 */
function sectionAt(z, length, isHead) {
  if (!isHead) {
    const edge = clamp01(Math.min(z + length / 2, length / 2 - z) / 0.55);
    const k = smooth(edge);
    return { sx: 0.955 + 0.045 * k, topY: DIM.roofY - (1 - k) * 0.05, botY: DIM.floorY + (1 - k) * 0.02 };
  }
  const d = z + length / 2;
  const t = clamp01(d / DIM.noseLength);
  const arc = Math.sin((t * Math.PI) / 2);
  const sx = 0.4 + 0.6 * Math.pow(arc, 0.72);
  const topY = 1.2 + (DIM.roofY - 1.2) * Math.pow(arc, 1.05);
  const botY = 0.82 + 0.12 * t;
  return { sx, topY, botY };
}

const ringPoint = (i, sec) => {
  const [x, y] = RING[i % RING.length];
  const ny = sec.botY + ((y - DIM.floorY) / (DIM.roofY - DIM.floorY)) * (sec.topY - sec.botY);
  return [x * sec.sx, ny];
};

function noseSections(length) {
  const zs = [];
  const n = 16; // 16 段足够表现钝楔长鼻的连续曲率，把面数预算让给车顶/转向架细节
  for (let i = 0; i <= n; i += 1) zs.push(-length / 2 + DIM.noseLength * Math.pow(i / n, 1.5));
  const start = -length / 2 + DIM.noseLength;
  for (let i = 1; i <= 5; i += 1) zs.push(start + ((length / 2 - start) * i) / 5);
  return zs;
}

function buildBodyGeometry(isHead, length) {
  const zs = isHead
    ? noseSections(length)
    : Array.from({ length: 8 }, (_, i) => -length / 2 + (length * i) / 7);

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

/** 司机室整体风挡：贴鼻锥上表面外扩 2.4 cm 的曲面玻璃，后缘收成横向宽弧。 */
function buildCanopyGeometry(length) {
  const rows = 14;
  const cols = 13;
  const positions = [];
  const uvs = [];
  const colors = [];
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
    const z = -length / 2 + 0.35 + 4.65 * Math.pow(t, 1.1);
    const sec = sectionAt(z, length, true);
    const span = 6 - 3 * Math.pow(t, 1.5);
    // 风挡随纵向位置由暗到略亮，横向靠边反光更强，避免一整片死黑
    const lo = 0.10 + 0.10 * t;
    for (let c = 0; c < cols; c += 1) {
      const j = c <= 6 ? c : cols - 1 - c;
      const sign = c <= 6 ? 1 : -1;
      const [rx, ry, rv] = ringAt((j * span) / 6);
      const ny = sec.botY + ((ry - DIM.floorY) / (DIM.roofY - DIM.floorY)) * (sec.topY - sec.botY);
      positions.push(sign * rx * sec.sx, ny, z);
      uvs.push((z + length / 2) / length, sign > 0 ? rv : 1 - rv);
      // 沿横向也带一点渐变，中间更暗、靠边反光更强
      const edge = Math.abs(c - 6) / 6;
      const g = lo * (0.75 + 0.35 * edge);
      colors.push(g * 0.9, g * 1.02, g * 1.2);
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
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
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
      cab: { z0: -half + 6.2, z1: -half + 9.0, y0: 2.3, y1: 3.1, tipY0: 2.76, tipY1: 2.92 },
      doors: [-half + DIM.noseLength + 2.6, half - DOOR_INSET],
      doorKinds: ['crew', 'passenger'],
      windows: Array.from({ length: 7 }, (_, i) => -half + 13.9 + i * 1.46),
      winW: 1.12,
    };
  }
  return {
    cab: null,
    doors: [-half + DOOR_INSET, half - DOOR_INSET],
    doorKinds: ['passenger', 'passenger'],
    windows: Array.from({ length: 11 }, (_, i) => -7.1 + i * 1.42),
    winW: 1.1,
  };
}

const WIN_Y0 = 2.26;
const WIN_Y1 = 3.04;

/** 车窗玻璃：四角顶点色做上亮下暗的渐变，模拟天空反射，不再是纯黑平板。 */
function quadZ(z0, z1, y0, y1, x, top, bot) {
  const g = new THREE.BufferGeometry();
  const s = Math.sign(x);
  const v = s > 0 ? [z1, y0, z0, y0, z0, y1, z1, y1] : [z0, y0, z1, y0, z1, y1, z0, y1];
  const pos = [];
  for (let i = 0; i < 4; i += 1) pos.push(x, v[i * 2 + 1], v[i * 2]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([s, 0, 0, s, 0, 0, s, 0, 0, s, 0, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  // 顶点 0/1 是下沿、2/3 是上沿；横向再让一侧略亮形成斜向反光
  g.setAttribute('color', new THREE.Float32BufferAttribute([
    bot[0] * 0.82, bot[1] * 0.82, bot[2] * 0.82,
    bot[0], bot[1], bot[2],
    top[0], top[1], top[2],
    top[0] * 0.8, top[1] * 0.8, top[2] * 0.8,
  ], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

function buildGlassGeometry(isHead, length, seed) {
  const L = layout(isHead, length);
  const parts = [];
  let n = seed;
  const jitter = () => {
    n = (n * 1103515245 + 12345) % 2147483648;
    return n / 2147483648;
  };
  for (const side of [-1, 1]) {
    const x = side * (DIM.halfWidth + 0.014);
    for (const z of L.windows) {
      const r = jitter();
      const top = [0.10 + r * 0.05, 0.14 + r * 0.05, 0.19 + r * 0.06];
      const bot = [0.022 + r * 0.012, 0.032 + r * 0.014, 0.046 + r * 0.016];
      parts.push(quadZ(z - L.winW / 2, z + L.winW / 2, WIN_Y0, WIN_Y1, x, top, bot));
    }
    // 车门玻璃（比客室窗窄）
    for (const z of L.doors) parts.push(quadZ(z - 0.26, z + 0.26, 2.34, 3.0, x, [0.12, 0.16, 0.21], [0.03, 0.045, 0.06]));
    if (L.cab) {
      const c = L.cab;
      const g = new THREE.BufferGeometry();
      const pts = [
        [c.z0, c.tipY0],
        [c.z1, c.y0],
        [c.z1, c.y1],
        [c.z0 + 0.2, c.tipY1],
      ];
      const pos = [];
      const order = side > 0 ? [0, 1, 2, 3] : [3, 2, 1, 0];
      for (const i of order) pos.push(x, pts[i][1], pts[i][0]);
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(Array(4).fill([side, 0, 0]).flat(), 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute([
        0.03, 0.04, 0.055, 0.04, 0.055, 0.075, 0.11, 0.15, 0.2, 0.08, 0.11, 0.15,
      ], 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      parts.push(g);
    }
  }
  return mergeGeometries(parts);
}

function buildCanopyGlass(length) {
  return buildCanopyGeometry(length);
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

const strut = (from, to, r, seg = 5) => {
  const dir = new THREE.Vector3().subVectors(to, from);
  const g = new THREE.CylinderGeometry(r, r, dir.length(), seg);
  g.translate(0, dir.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  g.translate(from.x, from.y, from.z);
  return g;
};

/** 顶点色上色：让同一材质内的轮对 / 构架 / 绝缘子等分出材质层次，不增加 draw call。 */
const COLOR_CACHE = new Map();
function tint(geo, hex) {
  let c = COLOR_CACHE.get(hex);
  if (!c) {
    const col = new THREE.Color(hex);
    c = [col.r, col.g, col.b];
    COLOR_CACHE.set(hex, c);
  }
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** 裙板：薄地板 + 分段裙板 + V 型迷宫通风格栅，转向架处断开让轮对露出来。 */
function buildSkirtGeometry(isHead, length) {
  const half = length / 2;
  const inset = isHead ? 5.4 : 4.2;
  const bogies = [-(half - inset), half - inset];
  const parts = [];
  const z0 = isHead ? -half + 5.0 : -half + 0.35;
  const z1 = half - 0.35;

  parts.push(tint(box(2.62, 0.16, z1 - z0, 0, 0.9, (z0 + z1) / 2), 0x6d767e));
  let cursor = z0;
  const vent = (cz, len) => {
    // 每段裙板外板 + 凹进去的暗色格栅底；横向叶片由 lowerBody() 画在涂装里，
    // 既省三角面又能保持 V 型迷宫格栅的细密观感。
    parts.push(tint(box(3.02, 0.44, len, 0, 0.66, cz + len / 2), 0x939ca4));
    const vents = Math.max(1, Math.floor(len / 2.6));
    for (let i = 0; i < vents; i += 1) {
      const vz = cz + (len * (i + 0.5)) / vents;
      for (const sx of [-1, 1]) {
        parts.push(tint(box(0.06, 0.3, 0.72, sx * 1.53, 0.68, vz), 0x2b3138));
      }
    }
  };
  for (const bz of bogies) {
    const a = bz - 1.85;
    const b = bz + 1.85;
    if (a > cursor + 0.2) vent(cursor, a - cursor);
    cursor = b;
  }
  if (z1 > cursor + 0.2) vent(cursor, z1 - cursor);
  if (isHead) {
    // 排障器 / 车钩罩底座：鼻锥下方一整块深灰整流罩
    parts.push(tint(box(2.1, 0.34, 3.4, 0, 0.78, -half + 3.4), 0x3a424a));
    parts.push(tint(box(1.62, 0.28, 1.7, 0, 0.64, -half + 1.65), 0x454d55));
    parts.push(tint(box(0.54, 0.34, 0.6, 0, 0.72, -half + 0.62), 0x2e353c));
  }
  return mergeGeometries(parts);
}

/**
 * 转向架：轮对（含制动盘/轮缘高光）+ 构架 + 轴箱 + 一系钢簧 + 液压减震器 +
 * 二系空气弹簧 + 牵引电机/齿轮箱。轮径 0.92 m 落在轨顶，绝不是几块黑方块。
 */
function buildBogieGeometry(isHead, length) {
  const half = length / 2;
  const inset = isHead ? 5.4 : 4.2;
  const parts = [];
  const FRAME = 0x2a2f35, WHEEL = 0x30353b, RIM = 0x8b949b, DISC = 0x8c4a3a;
  const BOX = 0x3b4249, DAMPER = 0x9aa2aa, MOTOR = 0x2f353b;
  for (const bz of [-(half - inset), half - inset]) {
    // 构架：两条侧梁 + 一条横梁 + 中央摇枕
    for (const sx of [-1, 1]) parts.push(tint(box(0.15, 0.34, 3.0, sx * 1.04, 0.66, bz), FRAME));
    parts.push(tint(box(2.0, 0.22, 0.42, 0, 0.8, bz), FRAME));
    parts.push(tint(box(0.56, 0.26, 0.86, 0.5, 0.5, bz + 0.42), MOTOR));
    for (const dz of [-1.25, 1.25]) {
      // 车轴 + 每侧车轮、亮轮缘、制动盘、轴箱（两侧都给，保证任意机位可见）
      parts.push(tint(cyl(0.07, 1.78, 4, 0, 0.46, bz + dz, 'x'), 0x555b62));
      for (const sx of [-1, 1]) {
        parts.push(tint(cyl(0.46, 0.13, 6, sx * 0.715, 0.46, bz + dz, 'x'), WHEEL));
        parts.push(tint(cyl(0.465, 0.035, 6, sx * 0.735, 0.46, bz + dz, 'x'), RIM));
        parts.push(tint(cyl(0.30, 0.045, 6, sx * 0.9, 0.46, bz + dz, 'x'), DISC));
        parts.push(tint(box(0.24, 0.3, 0.34, sx * 0.94, 0.56, bz + dz), BOX));
      }
      // 一只斜置液压减震器（每轮对一处，保留辨识度）
      parts.push(tint(strut(
        new THREE.Vector3(1.02, 0.72, bz + dz),
        new THREE.Vector3(0.84, 0.98, bz + dz * 0.55), 0.035, 4), DAMPER));
    }
  }
  return mergeGeometries(parts);
}

/** 车顶：通长空调罩 + 空调机组（带格栅顶）+ 密封高压设备箱 + 天线。 */
function buildRoofGeometry(isHead, length) {
  const parts = [];
  const z0 = isHead ? -length / 2 + 8.6 : -length / 2 + 0.6;
  const z1 = length / 2 - 0.6;
  const COWL = 0x8b949c, UNIT = 0xa3abb2, GRILLE = 0x414a52, HV = 0x6d767e, ANT = 0x353b41;
  parts.push(tint(box(2.26, 0.12, z1 - z0, 0, 4.06, (z0 + z1) / 2), COWL));
  const units = isHead ? [1.6, 6.4] : [-7.4, -1.2, 5.2];
  for (const z of units) {
    parts.push(tint(box(1.9, 0.24, 3.1, 0, 4.16, z), UNIT));
    parts.push(tint(box(1.56, 0.05, 2.7, 0, 4.3, z), GRILLE));
    parts.push(tint(box(1.5, 0.02, 0.06, 0, 4.33, z), 0x70787f));
  }
  // 密封高压设备箱（高寒型特征）
  parts.push(tint(box(1.5, 0.2, 1.5, 0, 4.17, isHead ? -1.2 : 9.6), HV));
  const ants = isHead ? [[-1.0, -1.6], [1.0, 3.2], [-1.0, 9.4]] : [[-1.0, -9.6], [1.0, -4.4], [-1.0, 1.8], [1.0, 8.6]];
  for (const [ax, az] of ants) {
    parts.push(tint(box(0.22, 0.06, 0.22, ax, 4.12, az), ANT));
    parts.push(tint(cyl(0.022, 0.26, 4, ax, 4.28, az), 0x9aa2aa));
  }
  return mergeGeometries(parts);
}

/**
 * 受电弓：底架 + 支持绝缘子（深棕瓷）+ 下臂/上臂 + 弓头滑板/碳条 + 平衡杆。
 * 静态升弓时碳条贴到 5.4 m 接触线；绝缘子/碳条用顶点色压暗，与金属臂分层。
 */
function buildPantoGeometry(z, raised) {
  const parts = [];
  const BASE = 0x6a727a, PORCELAIN = 0x4a3428, ARM = 0xa7afb6, ARM2 = 0x8d959d, STRIP = 0x1c1f22, HORN = 0xb8c0c6;
  for (const x of [-0.62, 0.62]) parts.push(tint(box(0.2, 0.16, 0.9, x, 4.2, z), BASE));
  for (const dz of [-0.4, 0.4]) parts.push(tint(box(1.6, 0.1, 0.26, 0, 4.25, z + dz), BASE));
  // 4 只支持绝缘子
  for (const x of [-0.5, 0.5]) {
    for (const dz of [-0.4, 0.4]) {
      parts.push(tint(cyl(0.11, 0.2, 8, x, 4.36, z + dz), PORCELAIN));
      parts.push(tint(cyl(0.13, 0.03, 8, x, 4.46, z + dz), 0x2c2622));
    }
  }
  if (raised) {
    for (const x of [-0.46, 0.46]) {
      // 下臂（粗）+ 上臂（细）+ 平衡拉杆
      parts.push(tint(strut(new THREE.Vector3(x, 4.5, z + 0.4), new THREE.Vector3(x * 0.72, 5.04, z - 0.34), 0.062), ARM));
      parts.push(tint(strut(new THREE.Vector3(x * 0.72, 5.04, z - 0.34), new THREE.Vector3(x * 0.6, 5.3, z + 0.16), 0.045), ARM2));
      parts.push(tint(strut(new THREE.Vector3(x, 4.5, z - 0.3), new THREE.Vector3(x * 0.72, 5.0, z - 0.3), 0.028), ARM2));
    }
    parts.push(tint(box(1.9, 0.05, 0.1, 0, 5.34, z + 0.16), HORN));
    parts.push(tint(box(1.9, 0.045, 0.22, 0, 5.38, z + 0.16), STRIP));
    for (const x of [-0.95, 0.95]) {
      parts.push(tint(strut(new THREE.Vector3(x, 5.36, z + 0.16), new THREE.Vector3(x * 1.12, 5.2, z + 0.16), 0.028), HORN));
    }
  } else {
    for (const x of [-0.46, 0.46]) {
      parts.push(tint(strut(new THREE.Vector3(x, 4.5, z + 0.4), new THREE.Vector3(x * 0.8, 4.62, z - 0.5), 0.062), ARM));
      parts.push(tint(strut(new THREE.Vector3(x * 0.8, 4.62, z - 0.5), new THREE.Vector3(x * 0.7, 4.52, z + 0.42), 0.045), ARM2));
    }
    parts.push(tint(box(1.9, 0.05, 0.22, 0, 4.56, z + 0.44), STRIP));
  }
  return mergeGeometries(parts);
}

/** 车头灯罩 / 车钩罩 / 排障器，归入深色底盘 bucket（与转向架同材质，顶点色区分）。 */
function buildNoseDetailGeometry(total, headLen) {
  const parts = [];
  const z = -total / 2 + 1.5;
  const sec = sectionAt(-headLen / 2 + 1.5, headLen, true);
  const yc = 2.593;
  const y = sec.botY + ((yc - DIM.floorY) / (DIM.roofY - DIM.floorY)) * (sec.topY - sec.botY);
  const x = DIM.halfWidth * sec.sx;
  for (const s of [-1, 1]) {
    // 深色灯腔（比亮灯罩略大，露出暗色边框）
    const g = new THREE.BoxGeometry(0.68, 0.26, 0.06);
    g.rotateY(s * 0.62);
    g.translate(s * (x - 0.01), y, z);
    parts.push(tint(g, 0x14181c));
    // 标志灯（车头下方小红色灯腔）
    parts.push(tint(box(0.18, 0.11, 0.05, s * (x - 0.18), y - 0.34, z + 0.05), 0x2a1416));
  }
  // 车钩罩：鼻尖下方的圆钝整流罩 + 排障器横梁
  const coupler = new THREE.SphereGeometry(0.42, 10, 7);
  coupler.scale(1, 0.7, 0.62);
  coupler.translate(0, 0.92, -total / 2 + 0.42);
  parts.push(tint(coupler, 0x5b646c));
  parts.push(tint(box(1.5, 0.16, 0.34, 0, 0.6, -total / 2 + 0.42), 0x2f363d));
  return mergeGeometries(parts);
}

// ---------------------------------------------------------------- livery ---

// 3072×768、flipY=false、v 0–0.5 为 +X 侧并镜像到 0.5–1、文字左右分别镜像绘制，
// 这条既有口径保持不变；本轮把像素预算进一步用在「分层清晰度」上，而不是加贴图。
const TEX_W = 3072;
const TEX_H = 768;
const PX_SHOULDER = V_SHOULDER * TEX_H;
const PX_SILL = V_SILL * TEX_H;
const PX_PER_M = (PX_SILL - PX_SHOULDER) / 2.48;
const yPx = (y) => PX_SHOULDER + (3.48 - y) * PX_PER_M;

const PALETTES = {
  // 龙凤呈祥：中国红为底，国旗红/故宫红/祥龙黄 + 橘红/赭石龙凤云纹 + 亮金立体字。
  dragon: {
    red: '#c8161d', redDeep: '#7d0f16', redLight: '#f0433a', redBase: '#d21f26',
    orange: '#ef6a2a', ochre: '#a4471f',
    gold: '#e3a63a', goldDeep: '#a8771c', goldLight: '#f7d98a', goldHi: '#fff0c0', ink: '#0a0f14',
  },
  // 金凤凰：银白底 + 上下两条金线（一粗一细）+ 黑色魏碑「复兴号」。
  phoenix: { red: '#c9a227', redDeep: '#8f6f14', redLight: '#e8c65a', gold: '#e8c65a', goldDeep: '#a8801a', goldLight: '#f7e6a8', ink: '#0a0f14' },
};

function bodyBase(ctx, white) {
  // 渐变范围必须是整张 TEX_H：色标 0.13/0.44 才能对应 v 的肩部/侧墙下缘。
  // 金凤凰是银白底 + 金线；龙凤呈祥这里只铺车顶/下缘的银灰金属漆，
  // 侧墙主体由 dragonRibbons() 改画「中国红」底（两套一眼可辨）。
  const g = ctx.createLinearGradient(0, 0, 0, TEX_H);
  if (white) {
    g.addColorStop(0, '#8b949d');
    g.addColorStop(0.05, '#bcc6ce');
    g.addColorStop(0.13, '#e9eff4');
    g.addColorStop(0.17, '#ffffff');
    g.addColorStop(0.27, '#f4f8fb');
    g.addColorStop(0.36, '#e7edf2');
    g.addColorStop(0.44, '#c9d2da');
    g.addColorStop(0.5, '#a9b2ba');
  } else {
    g.addColorStop(0, '#5b656e');
    g.addColorStop(0.05, '#8d98a2');
    g.addColorStop(0.13, '#b8c2cb');
    g.addColorStop(0.17, '#d6dee5');
    g.addColorStop(0.27, '#c8d1d9');
    g.addColorStop(0.36, '#b0bac3');
    g.addColorStop(0.44, '#8b949d');
    g.addColorStop(0.5, '#69727b');
  }
  g.addColorStop(1, white ? '#a9b2ba' : '#69727b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  // 程序化金属拉丝：细密半透明竖纹，消除「塑料平板」感
  ctx.save();
  for (let x = 0; x < TEX_W; x += 6) {
    ctx.globalAlpha = x % 18 === 0 ? 0.055 : 0.028;
    ctx.fillStyle = x % 12 === 0 ? '#ffffff' : '#1c242c';
    ctx.fillRect(x, 0, 1, TEX_H / 2);
  }
  ctx.restore();
  // 肩部通长高光
  const h = ctx.createLinearGradient(0, yPx(3.66), 0, yPx(3.4));
  h.addColorStop(0, 'rgba(255,255,255,0)');
  h.addColorStop(0.5, 'rgba(255,255,255,.28)');
  h.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = h;
  ctx.fillRect(0, yPx(3.66), TEX_W, yPx(3.4) - yPx(3.66));
}

function panelSeams(ctx, length, uPx, noseEnd, isHead) {
  // 水平腰带：窗上沿、窗下沿、裙板上沿，各一道亮线 + 一道暗影
  for (const yy of [yPx(3.58), yPx(3.2), yPx(2.0), yPx(1.08)]) {
    ctx.fillStyle = 'rgba(255,255,255,.26)';
    ctx.fillRect(0, yy, TEX_W, 2);
    ctx.fillStyle = 'rgba(26,36,46,.20)';
    ctx.fillRect(0, yy + 2, TEX_W, 2);
  }
  // 竖向板缝 + 铆点
  for (let z = -length / 2 + 2.4; z < length / 2 - 1; z += 2.6) {
    const x = uPx(z);
    if (isHead && x < noseEnd) continue;
    ctx.fillStyle = 'rgba(28,38,50,.18)';
    ctx.fillRect(x, PX_SHOULDER + 6, 2, PX_SILL - PX_SHOULDER - 10);
    ctx.fillStyle = 'rgba(255,255,255,.20)';
    ctx.fillRect(x + 2, PX_SHOULDER + 6, 1.5, PX_SILL - PX_SHOULDER - 10);
    for (const yy of [yPx(3.5), yPx(1.16)]) {
      ctx.fillStyle = 'rgba(40,50,60,.35)';
      ctx.beginPath(); ctx.arc(x + 1, yy, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }
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

/**
 * 龙凤呈祥（2021-06-25 京哈高铁投用涂装，team-lead 补充资料）：
 * 以「中国红」为底，金/橘红/赭石色的金龙 + 金凤上下翻腾交织，车头凤尾羽向上
 * 延展盘旋、从车头一路演绎到车身，龙凤云纹贯穿整列；整体喜庆华贵、有绸缎立体感。
 * 与金凤凰「银白底 + 一条细金线」必须一眼可辨 —— 故这里把红色铺满侧墙主体，
 * 而不是在银灰底上画一条细红带。车顶/裙板仍留银灰，避免整片死红。
 * 先铺红底，再盖黑窗带（带内保持黑、带上下露出红金），最后叠金凤尾羽与云纹。
 */
function dragonRibbons(ctx, P, x0, x1, phase) {
  const top = yPx(3.5);
  const bot = yPx(1.02);
  const M = PX_PER_M;
  const span = x1 - x0;
  const u = (t) => x0 + span * t;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, top, x1 - x0, bot - top);
  ctx.clip();

  // 1) 中国红主底：竖向渐变（上缘亮国旗红、中部饱和中国红、下缘深故宫红）
  const base = ctx.createLinearGradient(0, top, 0, bot);
  base.addColorStop(0, '#ef4033');
  base.addColorStop(0.26, P.redBase);
  base.addColorStop(0.62, '#b4161c');
  base.addColorStop(1, P.redDeep);
  ctx.fillStyle = base;
  ctx.fillRect(x0, top, x1 - x0, bot - top);

  // 2) 绸缎起伏：几道大波浪明暗，让红底有立体褶皱而非平板
  for (let k = 0; k < 3; k += 1) {
    const g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, 'rgba(255,190,140,0)');
    g.addColorStop(0.5, k === 1 ? 'rgba(255,170,110,.12)' : 'rgba(120,8,18,.16)');
    g.addColorStop(1, 'rgba(60,0,10,0)');
    ribbon(ctx, x0, x1, yPx(2.2) + (k - 1) * 0.5 * M, 0.55 * M, 1.9 * M, phase + k * 1.25, 1, g, 0);
  }

  // 3) 金龙 + 金凤：多条金色波浪主线上下翻腾交织
  const bg = (a, b) => bandGradient(ctx, top, bot, a, b);
  ribbon(ctx, x0, x1, yPx(2.0), 0.95 * M, 0.44 * M, phase, 1, bg(P.goldLight, P.goldDeep), 0.03); // 金凤主带
  ribbon(ctx, x0, x1, yPx(2.0), 0.95 * M, 0.07 * M, phase, 1, 'rgba(255,244,200,.75)', 0.05);      // 金带高光芯
  ribbon(ctx, x0, x1, yPx(1.52), 0.8 * M, 0.2 * M, phase - 0.7, 1, bg(P.gold, P.goldDeep), 0.05);  // 金龙
  ribbon(ctx, x0, x1, yPx(2.72), 0.7 * M, 0.14 * M, phase + 0.6, 1, P.goldLight, 0.06);            // 上层金云

  // 4) 龙凤云纹：橘红 / 赭石细丝交织，压在红底上作暗纹
  for (let k = 0; k < 3; k += 1) {
    ribbon(ctx, x0, x1, yPx(1.3) + k * 0.3 * M, 0.9 * M, 0.055 * M, phase - 0.4 - k * 0.5, 1,
      k === 1 ? 'rgba(239,106,42,.5)' : 'rgba(120,32,14,.42)', 0.1);
  }

  // 5) 凤尾羽：从主带波峰甩出的羽状弧线组（扇形、由粗渐细），沿整列延展
  ctx.lineCap = 'round';
  for (const [t0, dir] of [[0.14, -1], [0.5, 1], [0.82, -1]]) {
    for (let f = 0; f < 4; f += 1) {
      const y0 = yPx(1.75) + f * 0.17 * M;
      ctx.strokeStyle = f % 2 ? 'rgba(247,217,138,.8)' : 'rgba(227,166,58,.72)';
      ctx.lineWidth = 7 - f * 1.35;
      ctx.beginPath();
      ctx.moveTo(u(t0), y0);
      ctx.quadraticCurveTo(u(t0 + 0.09 * dir), y0 - 0.75 * M, u(t0 + 0.21 * dir), y0 - 1.2 * M - f * 0.1 * M);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 金凤凰：白底 + 一粗一细双金腰线（带阴影/高光），车头凤凰展翅 V 形另在 noseArt 画。 */
function phoenixRibbons(ctx, P, x0, x1) {
  const y = yPx(1.98);
  // 阴影 + 主粗金线 + 分隔暗线 + 细金线 + 顶高光
  ctx.fillStyle = 'rgba(60,42,8,.32)';
  ctx.fillRect(x0, y + 11, x1 - x0, 22);
  ctx.fillStyle = bandGradient(ctx, y, y + 17, P.goldLight, P.goldDeep);
  ctx.fillRect(x0, y, x1 - x0, 17);
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.fillRect(x0, y, x1 - x0, 2.5);
  ctx.fillStyle = P.goldDeep;
  ctx.fillRect(x0, y + 17, x1 - x0, 3);
  ctx.fillStyle = P.gold;
  ctx.fillRect(x0, y + 27, x1 - x0, 4.5);
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.fillRect(x0, y + 27, x1 - x0, 1.5);
}

/** 黑色窗带 + 逐扇车窗（深色渐变玻璃、斜向反光、亮窗框）+ 窗间银色立柱。 */
function windowBand(ctx, P, L, uPx, noseEnd, bandTop, bandBot) {
  // 通长黑窗带
  ctx.fillStyle = P.ink;
  ctx.fillRect(noseEnd, bandTop, TEX_W - noseEnd, bandBot - bandTop);
  ctx.fillStyle = 'rgba(255,255,255,.09)';
  ctx.fillRect(noseEnd, bandTop, TEX_W - noseEnd, 3);
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(noseEnd, bandBot - 4, TEX_W - noseEnd, 4);

  const wy0 = yPx(WIN_Y0), wy1 = yPx(WIN_Y1);
  for (const z of L.windows) {
    const x0 = uPx(z - L.winW / 2);
    const x1 = uPx(z + L.winW / 2);
    const w = x1 - x0;
    // 玻璃：上沿偏冷亮（天光）、下沿近黑的竖向渐变
    const gg = ctx.createLinearGradient(0, wy1, 0, wy0);
    gg.addColorStop(0, '#1c2a36');
    gg.addColorStop(0.4, '#0e1720');
    gg.addColorStop(1, '#05090d');
    ctx.fillStyle = gg;
    ctx.fillRect(x0, wy1, w, wy0 - wy1);
    // 斜向反光条（半透明白）
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, wy1, w, wy0 - wy1); ctx.clip();
    const rg = ctx.createLinearGradient(x0, wy1, x0 + w, wy0);
    rg.addColorStop(0, 'rgba(190,214,236,0)');
    rg.addColorStop(0.42, 'rgba(190,214,236,.16)');
    rg.addColorStop(0.52, 'rgba(190,214,236,.16)');
    rg.addColorStop(0.68, 'rgba(190,214,236,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(x0, wy1, w, wy0 - wy1);
    ctx.restore();
    // 亮银窗框 + 内暗影
    ctx.strokeStyle = 'rgba(12,20,28,.85)';
    ctx.lineWidth = 5;
    ctx.strokeRect(x0 - 1, wy1 - 1, w + 2, wy0 - wy1 + 2);
    ctx.strokeStyle = 'rgba(198,210,220,.75)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x0, wy1, w, wy0 - wy1);
    // 窗下沿亮线
    ctx.fillStyle = 'rgba(220,230,238,.35)';
    ctx.fillRect(x0, wy0 - 2, w, 2);
  }
  // 窗间银色立柱：把连续黑带切成一节节，实车侧视里最关键的「分隔」
  const all = L.windows.slice().sort((a, b) => a - b);
  for (let i = 0; i < all.length - 1; i += 1) {
    const mid = (all[i] + all[i + 1]) / 2;
    const x = uPx(mid);
    const pw = uPx(all[i + 1] - L.winW / 2) - uPx(all[i] + L.winW / 2);
    if (pw < 4) continue;
    const pg = ctx.createLinearGradient(x - pw / 2, 0, x + pw / 2, 0);
    pg.addColorStop(0, 'rgba(150,162,172,.55)');
    pg.addColorStop(0.5, 'rgba(206,216,224,.8)');
    pg.addColorStop(1, 'rgba(120,132,142,.5)');
    ctx.fillStyle = pg;
    ctx.fillRect(x - pw / 2, bandTop + 2, pw, bandBot - bandTop - 4);
  }
}

/** 车门：门缝、门框、双扇中缝、门玻璃、把手、踏板与车门标识，分层画清。 */
function doors(ctx, L, uPx, isHead, isDragon) {
  for (let k = 0; k < L.doors.length; k += 1) {
    const z = L.doors[k];
    const crew = L.doorKinds[k] === 'crew';
    const dw = crew ? 0.62 : 0.78;
    const x0 = uPx(z - dw);
    const x1 = uPx(z + dw);
    const w = x1 - x0;
    const yT = yPx(3.14);
    const yB = yPx(0.98);
    // 门洞凹影
    ctx.fillStyle = 'rgba(18,26,34,.42)';
    ctx.fillRect(x0 - 3, yT - 2, w + 6, yB - yT + 6);
    // 门板：金凤凰是银灰塞拉门；龙凤呈祥是金红饰面门（红底车上白色门太跳）
    const dg = ctx.createLinearGradient(x0, 0, x1, 0);
    if (isDragon) {
      dg.addColorStop(0, '#8e1119');
      dg.addColorStop(0.5, '#ba2026');
      dg.addColorStop(1, '#790d14');
    } else {
      dg.addColorStop(0, '#aeb9c1');
      dg.addColorStop(0.5, '#c6d0d7');
      dg.addColorStop(1, '#9ba6ae');
    }
    ctx.fillStyle = dg;
    ctx.fillRect(x0, yT, w, yB - yT);
    // 门框双线
    ctx.strokeStyle = 'rgba(40,52,64,.85)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x0, yT, w, yB - yT);
    ctx.strokeStyle = isDragon ? 'rgba(255,228,160,.85)' : 'rgba(240,246,250,.75)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0 + 3, yT + 3, w - 6, yB - yT - 6);
    // 双扇中缝
    const mx = (x0 + x1) / 2;
    ctx.fillStyle = 'rgba(28,38,48,.7)';
    ctx.fillRect(mx - 1.5, yT + 3, 3, yB - yT - 6);
    // 门玻璃（细长）
    const gx0 = crew ? x0 + 9 : x0 + 16;
    const gx1 = crew ? x1 - 9 : x1 - 16;
    const gy0 = yPx(2.96), gy1 = yPx(2.34);
    const wg = ctx.createLinearGradient(0, gy0, 0, gy1);
    wg.addColorStop(0, '#1a2833');
    wg.addColorStop(1, '#060a0e');
    ctx.fillStyle = wg;
    ctx.fillRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
    ctx.strokeStyle = 'rgba(198,210,220,.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
    // 把手（竖条 + 高光）+ 按钮
    ctx.fillStyle = '#3a444d';
    ctx.fillRect(mx + 7, yPx(2.5), 5, yPx(2.05) - yPx(2.5));
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillRect(mx + 7, yPx(2.5), 1.5, yPx(2.05) - yPx(2.5));
    ctx.fillStyle = '#d8b23c';
    ctx.beginPath(); ctx.arc(mx - 12, yPx(2.18), 3.2, 0, Math.PI * 2); ctx.fill();
    // 踏板 / 低站台补偿器：门下方一小级带黄色安全边
    const sy = yPx(0.98);
    ctx.fillStyle = 'rgba(30,40,50,.5)';
    ctx.fillRect(x0 - 4, sy, w + 8, 8);
    const sg = ctx.createLinearGradient(0, sy, 0, sy + 14);
    sg.addColorStop(0, '#8f99a1');
    sg.addColorStop(1, '#5c656d');
    ctx.fillStyle = sg;
    ctx.fillRect(x0, sy + 1, w, 12);
    ctx.fillStyle = '#e0b43a';
    ctx.fillRect(x0, sy + 1, w, 3);
    // 车门标识（黄色方块 + 车厢号）
    ctx.fillStyle = '#d8a72c';
    ctx.fillRect(x1 - 24, yT + 8, 15, 15);
    ctx.fillStyle = '#20262c';
    ctx.font = '700 11px "Segoe UI",sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(k + 1), x1 - 21, yT + 15.5);
    // GZ「龙凤呈祥」独有：头车司机登乘门（司机室侧门）用金色门框 + 圆形司徽强调；
    // 金凤凰无此强调。徽记只用几何线条，避免贴图镜像后出现反字。
    if (crew && isDragon) {
      ctx.strokeStyle = 'rgba(227,166,58,.92)';
      ctx.lineWidth = 4;
      ctx.strokeRect(x0 - 2, yT - 2, w + 4, yB - yT + 4);
      ctx.strokeStyle = 'rgba(255,240,192,.75)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(x0 + 3, yT + 3, w - 6, yB - yT - 6);
      const cx = (x0 + x1) / 2, cy = yPx(1.86);
      ctx.fillStyle = 'rgba(90,54,8,.85)';
      ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 6, cy + 2); ctx.lineTo(cx + 6, cy + 2);
      ctx.moveTo(cx, cy - 6); ctx.lineTo(cx - 4, cy + 2);
      ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 4, cy + 2);
      ctx.stroke();
    }
  }
}

/** 车体下缘：裙板分块、通风格栅暗格、车底阴影，让下缘不再是一条空白银带。 */
function lowerBody(ctx, isHead, length, uPx, noseEnd) {
  const yTop = yPx(1.1);
  // 裙板上沿深色压条
  ctx.fillStyle = 'rgba(28,36,44,.55)';
  ctx.fillRect(0, yTop, TEX_W, 6);
  // 分块 + 格栅
  for (let z = -length / 2 + 0.6; z < length / 2 - 0.6; z += 1.62) {
    const x = uPx(z);
    if (isHead && x < noseEnd) continue;
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    ctx.fillRect(x, yTop + 8, 2, 26);
    ctx.fillStyle = 'rgba(20,28,36,.30)';
    ctx.fillRect(x + 6, yTop + 12, 62, 4);
    ctx.fillRect(x + 6, yTop + 20, 62, 4);
    ctx.fillRect(x + 6, yTop + 28, 62, 4);
    ctx.fillStyle = 'rgba(200,210,218,.22)';
    ctx.fillRect(x + 6, yTop + 10, 62, 1.5);
  }
  // 最下缘车底阴影
  const bg = ctx.createLinearGradient(0, yTop + 34, 0, TEX_H / 2);
  bg.addColorStop(0, 'rgba(20,28,36,0)');
  bg.addColorStop(1, 'rgba(12,18,24,.7)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, yTop + 34, TEX_W, TEX_H / 2 - yTop - 34);
}

/** 车头：整体黑风挡（带反光/雨刷）、司机室侧窗、红金/金凤凰眉线、灯腔、排障器阴影。 */
function noseArt(ctx, P, L, uPx, length, noseEnd, palette) {
  const isPhoenix = palette !== 'dragon';
  const half = length / 2;
  const canopyEdge = [
    [0, yPx(1.5)],
    [TEX_W * 0.07, yPx(1.95)],
    [TEX_W * 0.13, yPx(2.5)],
    [TEX_W * 0.17, yPx(3.0)],
    [TEX_W * 0.2, PX_SHOULDER],
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

  // 风挡黑区（沿鼻锥上缘渐窄），带竖向反光渐变
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(noseEnd * 0.82, 0);
  ctx.lineTo(noseEnd * 0.82, PX_SHOULDER);
  ctx.lineTo(TEX_W * 0.2, PX_SHOULDER);
  for (let i = canopyEdge.length - 2; i >= 0; i -= 1) {
    const [x, y] = canopyEdge[i];
    const [px, py] = canopyEdge[i + 1];
    ctx.quadraticCurveTo(px, py, (x + px) / 2, (y + py) / 2);
  }
  ctx.lineTo(0, yPx(1.42));
  ctx.closePath();
  const cg = ctx.createLinearGradient(0, 0, 0, yPx(1.4));
  cg.addColorStop(0, '#04070a');
  cg.addColorStop(0.55, '#0e161d');
  cg.addColorStop(1, '#26333d');
  ctx.fillStyle = cg;
  ctx.fill();
  // 风挡玻璃斜向反光
  ctx.save();
  ctx.clip();
  const rg = ctx.createLinearGradient(0, 0, noseEnd, yPx(1.4));
  rg.addColorStop(0, 'rgba(150,180,210,0)');
  rg.addColorStop(0.45, 'rgba(150,180,210,.14)');
  rg.addColorStop(0.6, 'rgba(150,180,210,0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, noseEnd, TEX_H / 2);
  // 雨刷：两道斜置细杆
  ctx.strokeStyle = 'rgba(20,26,32,.85)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(noseEnd * 0.1, yPx(1.9)); ctx.lineTo(noseEnd * 0.32, yPx(2.75));
  ctx.moveTo(noseEnd * 0.3, yPx(1.85)); ctx.lineTo(noseEnd * 0.5, yPx(2.6));
  ctx.stroke();
  ctx.restore();

  // 眉线：龙凤呈祥是红/金/白三道；金凤凰是「凤凰展翅」粗金 V 形 + 金细线
  ctx.lineJoin = 'round';
  if (isPhoenix) {
    ctx.strokeStyle = P.goldDeep;
    ctx.lineWidth = 26;
    trace(); ctx.stroke();
    ctx.strokeStyle = bandGradient(ctx, 0, yPx(1.4), P.goldLight, P.gold);
    ctx.lineWidth = 18;
    trace(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,248,214,.85)';
    ctx.lineWidth = 3;
    ctx.save(); ctx.translate(0, 11); trace(); ctx.stroke(); ctx.restore();
  } else {
    ctx.strokeStyle = P.redDeep;
    ctx.lineWidth = 22;
    trace(); ctx.stroke();
    ctx.strokeStyle = P.red;
    ctx.lineWidth = 13;
    trace(); ctx.stroke();
    ctx.strokeStyle = P.gold;
    ctx.lineWidth = 5;
    ctx.save(); ctx.translate(0, 12); trace(); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = 'rgba(244,247,250,.85)';
    ctx.lineWidth = 2.5;
    ctx.save(); ctx.translate(0, 20); trace(); ctx.stroke(); ctx.restore();
  }

  // 司机室侧窗：由后至前逐渐变窄的黑色楔形，带一根竖梃
  const c = L.cab;
  ctx.beginPath();
  ctx.moveTo(uPx(c.z0), yPx(c.tipY0));
  ctx.lineTo(uPx(c.z1), yPx(c.y0));
  ctx.lineTo(uPx(c.z1), yPx(c.y1));
  ctx.lineTo(uPx(c.z0 + 0.2), yPx(c.tipY1));
  ctx.closePath();
  ctx.fillStyle = '#080d12';
  ctx.fill();
  ctx.strokeStyle = isPhoenix ? P.gold : P.red;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(uPx(c.z0), yPx(c.tipY1));
  ctx.lineTo(uPx(c.z1), yPx(c.y1));
  ctx.stroke();
  ctx.strokeStyle = isPhoenix ? P.goldLight : P.gold;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(uPx(c.z0), yPx(c.tipY0));
  ctx.lineTo(uPx(c.z1), yPx(c.y0));
  ctx.stroke();
  // 侧窗竖梃
  ctx.strokeStyle = 'rgba(170,184,196,.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const zm = (c.z0 + c.z1) / 2;
  ctx.moveTo(uPx(zm), yPx(2.42));
  ctx.lineTo(uPx(zm + 0.1), yPx(3.02));
  ctx.stroke();
  // 金凤凰「凤眼」：司机室侧窗上缘一条由粗渐细、向车头收尖的金色描线
  if (isPhoenix) {
    const lerp = (a, b, t) => a + (b - a) * t;
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i += 1) {
      const t0 = i / 5, t1 = (i + 1) / 5;
      ctx.strokeStyle = i < 3 ? P.gold : P.goldLight;
      ctx.lineWidth = 10 - i * 1.7;
      ctx.beginPath();
      ctx.moveTo(uPx(lerp(c.z1, c.z0, t0)), yPx(lerp(c.y1, c.tipY1, t0)));
      ctx.lineTo(uPx(lerp(c.z1, c.z0, t1)), yPx(lerp(c.y1, c.tipY1, t1)));
      ctx.stroke();
    }
  }

  // 头灯灯腔（亮灯罩另有网格，这里画暗腔 + 内部反光片）
  for (const s of [-1, 1]) {
    const x = uPx(-half + 1.5);
    const y = yPx(2.593) + s * 0;
    ctx.fillStyle = '#0a0e12';
    ctx.beginPath();
    ctx.roundRect(x - 52, y - 15, 104, 30, 9);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,140,158,.35)';
    ctx.beginPath();
    ctx.roundRect(x - 46, y - 9, 92, 8, 4);
    ctx.fill();
    // 标志灯腔
    ctx.fillStyle = '#2a1214';
    ctx.beginPath();
    ctx.roundRect(x - 18, y + 34, 36, 11, 5);
    ctx.fill();
  }
  // 鼻尖下方的排障器 / 车钩罩阴影
  ctx.fillStyle = 'rgba(50,60,70,.6)';
  ctx.fillRect(0, yPx(1.12), uPx(-half + 2.2), yPx(1.0) - yPx(1.12));
  ctx.strokeStyle = 'rgba(210,220,228,.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(uPx(-half + 0.7), yPx(0.92), uPx(-half + 1.5) - uPx(-half + 0.7), 9, 0, 0, Math.PI * 2);
  ctx.stroke();
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
  const noseEnd = isHead ? uPx(-length / 2 + DIM.noseLength) : 0;

  bodyBase(ctx, palette !== 'dragon');
  panelSeams(ctx, length, uPx, noseEnd, isHead);

  const bandTop = yPx(3.16);
  const bandBot = yPx(2.06);

  // 龙凤呈祥飘带先画：波峰拱到窗带之上、波谷压到裙板，随后黑窗带盖住带内部分
  if (palette === 'dragon') dragonRibbons(ctx, P, isHead ? noseEnd * 0.42 : 0, TEX_W, variant ? 0 : Math.PI);

  windowBand(ctx, P, L, uPx, noseEnd, bandTop, bandBot);
  doors(ctx, L, uPx, isHead, palette === 'dragon');

  if (palette !== 'dragon') phoenixRibbons(ctx, P, isHead ? noseEnd * 0.42 : 0, TEX_W);

  if (isHead) noseArt(ctx, P, L, uPx, length, noseEnd, palette);
  lowerBody(ctx, isHead, length, uPx, noseEnd);

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

  const isDragon = palette === 'dragon';
  const wei = '"STKaiti","KaiTi","STWeibei","Microsoft YaHei","Segoe UI",serif';
  const hei = '"Microsoft YaHei","Segoe UI",sans-serif';
  // 暗色字（白底金凤凰用黑魏碑；红底龙凤呈祥的小字用浅金以便可读）
  const dark = isDragon ? '#f3dca0' : '#1b2026';
  const cr = isDragon ? '#fff4dd' : '#1c3557';
  const fuxingBig = `700 52px ${isDragon ? hei : wei}`;
  const fuxingSmall = `700 38px ${isDragon ? hei : wei}`;

  // 「复兴号」：龙凤呈祥是亮金立体字（多层错位叠印模拟运动感光色变幻与凸起）；
  // 金凤凰是黑色魏碑体（实车核对）。
  const fuxing = (z, y, font) => {
    if (isDragon) {
      text('复兴号', z, y + 2, font, '#5a3608');           // 深棕投影（凸起厚度）
      text('复兴号', z - 1, y, font, '#a8771c');           // 暗金侧边
      text('复兴号', z, y - 1, font, '#e3a63a');           // 主金
      text('复兴号', z + 0.4, y - 2, font, '#ffe9a8');     // 亮金高光
      text('复兴号', z + 1, y - 3, font, 'rgba(255,255,255,.55)'); // 顶缘反光
    } else {
      text('复兴号', z, y, font, '#171b20');               // 黑色魏碑体
    }
  };

  if (isHead) {
    fuxing(-length / 2 + 17.0, yPx(3.4), fuxingBig);
    text('CR', -length / 2 + 10.4, yPx(2.6), '800 44px "Segoe UI",sans-serif', cr);
    text(label, -length / 2 + 13.2, yPx(1.32), `600 22px "Segoe UI",sans-serif`, dark);
    text('ZY 01', -length / 2 + 21.5, yPx(1.32), '600 20px "Segoe UI",sans-serif', dark);
  } else {
    fuxing(-1.0, yPx(3.4), fuxingSmall);
    text(label, -8.6, yPx(1.3), '600 21px "Segoe UI",sans-serif', dark);
    text(variant ? 'ZE 02' : 'ZE 01', 6.4, yPx(1.3), '600 20px "Segoe UI",sans-serif', dark);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // 画布第 0 行直接对应 v=0（车顶）。默认 flipY 会把上下半张对调，
  // 左右侧文字会跑到反侧并被镜像，故必须 false。
  tex.flipY = false;
  tex.anisotropy = 8;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// ----------------------------------------------------------------- train ---

/**
 * 金属漆程序化微表面：以物体空间坐标做哈希，给 roughness 与 normal 加极细微
 * 扰动（各向同性拉丝感），避免整车像一块均匀的塑料。不占贴图、不增 draw call。
 */
function metalFinish(mat) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTrPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTrPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vTrPos;
float trHash(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 31.32); return fract((p.x + p.y) * p.z); }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
{
  float n = trHash(floor(vTrPos * 9.0));
  roughnessFactor = clamp(roughnessFactor + (n - 0.5) * 0.13, 0.04, 1.0);
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float a = trHash(floor(vTrPos * 13.0) + 5.0) - 0.5;
  float b = trHash(floor(vTrPos * 13.0) + 19.0) - 0.5;
  normal = normalize(normal + vec3(a, b, 0.0) * 0.03);
}`);
  };
  mat.customProgramCacheKey = () => 'cnth-metal-v1';
  return mat;
}

export function buildTrain(cfg) {
  if (cfg.model && cfg.model !== 'cr400bf') return buildFamilyTrain(cfg);
  const headLen = cfg.set?.headLength ?? DIM.headLength;
  const midLen = cfg.set?.middleLength ?? DIM.middleLength;
  const gap = cfg.set?.gap ?? DIM.gap;
  const formation = Math.max(2, cfg.formation ?? 8);
  const palette = cfg.livery ?? 'dragon';
  const pantoCars = cfg.pantoCars ?? [2, formation - 3];
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

    if (pantoCars.includes(i)) {
      const pz = isHead ? 2.0 : 2.4;
      put(buckets.pantoUp, buildPantoGeometry(pz, true), matrix);
      put(buckets.pantoDown, buildPantoGeometry(pz, false), matrix);
    }
    if (i < keys.length - 1) {
      // ★ gz 必须相对「本节车厢中心」：put() 会再左乘本节矩阵（平移 = front+len/2），
      //   用绝对里程会把风挡甩到车外（实测 z 到 -170 ~ +144 m，正好悬在司机视角
      //   正前方变成一块黑板）。
      const gz = (len + gap) / 2;
      // 节间风挡：多道深浅相间的褶皱 + 顶板，深色橡胶质感
      const h = DIM.roofY - DIM.floorY - 0.16;
      put(buckets.bogie, tint(box(2.84, h, gap + 0.16, 0, (DIM.roofY + DIM.floorY) / 2, gz), 0x23282e), matrix);
      const folds = 5;
      for (let f = 0; f < folds; f += 1) {
        const fz = gz - gap / 2 + (gap * (f + 0.5)) / folds;
        put(buckets.bogie, tint(box(2.92, h - 0.06, 0.07, 0, (DIM.roofY + DIM.floorY) / 2, fz), f % 2 ? 0x3c434a : 0x171b20), matrix);
      }
      put(buckets.bogie, tint(box(2.96, 0.09, gap + 0.2, 0, DIM.roofY - 0.06, gz), 0x2b3138), matrix);
    }
    if (!isHead) midIndex += 1;
    front += len + gap;
  });

  // 车头灯罩 / 车钩罩 / 排障器归入深色底盘 bucket
  buckets.bogie.push(buildNoseDetailGeometry(total, headLen));

  headGeo.dispose();
  midGeo.dispose();
  headGlass.dispose();
  midGlassA.dispose();
  midGlassB.dispose();

  const label = cfg.name ?? 'CR400BF-GZ';
  const bodyMat = (tex) => metalFinish(new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.3, metalness: 0.46, envMapIntensity: 1.2,
  }));

  const materials = {
    head: bodyMat(liveryTexture('head', 0, palette, label)),
    midA: bodyMat(liveryTexture('mid', 0, palette, label)),
    midB: bodyMat(liveryTexture('mid', 1, palette, label)),
    glass: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.13,
      metalness: 0.2,
      envMapIntensity: 0.85,
      vertexColors: true,
      emissive: new THREE.Color(0xffbe7a),
      emissiveIntensity: 0,
    }),
    canopy: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.22,
      envMapIntensity: 0.7,
      vertexColors: true,
    }),
    skirt: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.32, vertexColors: true }),
    bogie: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.32, vertexColors: true }),
    roof: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.5, vertexColors: true }),
    panto: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.62, vertexColors: true }),
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
  if (meshes.pantoDown) meshes.pantoDown.visible = false;

  // 头灯 / 尾灯：贴在鼻锥斜面上的亮灯罩
  const lampGeos = (sign) => {
    const list = [];
    const z = -total / 2 + 1.5;
    const sec = sectionAt(-headLen / 2 + 1.5, headLen, true);
    const yc = 2.593;
    const y = sec.botY + ((yc - DIM.floorY) / (DIM.roofY - DIM.floorY)) * (sec.topY - sec.botY);
    const x = DIM.halfWidth * sec.sx;
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.58, 0.18, 0.075);
      g.rotateY(s * 0.62);
      g.translate(s * (x + 0.04), y, sign * z);
      list.push(g);
      // 下方标志灯
      const m = new THREE.BoxGeometry(0.16, 0.09, 0.06);
      m.rotateY(s * 0.62);
      m.translate(s * (x - 0.18), y - 0.34, sign * (z + 0.05));
      list.push(m);
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
      if (meshes.pantoUp) meshes.pantoUp.visible = raised;
      if (meshes.pantoDown) meshes.pantoDown.visible = !raised;
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

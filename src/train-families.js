import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 哈尔滨局另外四个车型的程序化车体：CRH5A / CRH5G（Pendolino 平台）、
 * CRH380BG（Velaro 高寒型）、CR200J3-C（动力集中鼓形车体 · AD钙涂装）。
 *
 * 局部坐标与 CR400BF 一致：+Y 上、+Z 车尾、车头朝 -Z、轨顶面 y=0。
 * 涂装统一画在 3072×768 CanvasTexture 上：v 0–0.13 车顶、0.13–0.44 侧墙、
 * 0.44–0.5 车底是 +X 侧，0.5–1 是镜像的 -X 侧；画完上半张再垂直镜像。
 *
 * 外观依据（2025–2026 年公开照片与资料，配色为近似复刻，不是厂修色卡）：
 *  - CRH5A/CRH5G：白色车身，窗台下方一条细深蓝腰线并在车头微微上扬收尖；
 *    独立圆角小方窗（无通长黑窗带）、每节车每侧一处端门、扁圆钝楔形车头 +
 *    黑色前风挡与叶形司机室侧窗；CRH5G 除车钩整流罩外外观/涂装与 CRH5A 一致。
 *  - CRH380BG：8 辆 4M4T、白底 + 深蓝细腰线，车头有蓝色箭形上扬；
 *    通长黑色窗带（头车观光区为大块黑窗）、门上椭圆窗、鼻尖圆形车钩罩。
 *  - CR200J3-C：2022 年后的"AD钙"涂装——白/银车身、国槐绿窗带与前脸、
 *    窗带下红色双细线并在头车扬起两道弧、石墨灰车顶与风挡、金色路徽与
 *    "复兴号"、白色 CR 标识；9 辆短编 = 1 动力车 + 7 拖车 + 1 控制车。
 */

const TEX_W = 3072;
const TEX_H = 768;
const V_SHOULDER = 0.13;
const V_SILL = 0.44;
const PX_SHOULDER = V_SHOULDER * TEX_H;
const PX_SILL = V_SILL * TEX_H;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (t) => t * t * (3 - 2 * t);

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

// --------------------------------------------------------------- families ---

const PROFILE = {
  crh5: [
    [0, 3.95], [0.52, 3.945], [0.98, 3.9], [1.3, 3.82], [1.48, 3.66], [1.57, 3.42],
    [1.6, 3.05], [1.6, 2.55], [1.6, 2.05], [1.58, 1.62], [1.52, 1.28], [1.4, 1.08],
    [1.1, 0.99], [0, 0.98],
  ],
  crh380b: [
    [0, 3.89], [0.6, 3.88], [1.1, 3.82], [1.42, 3.7], [1.58, 3.54], [1.6325, 3.3],
    [1.6325, 2.9], [1.6325, 2.4], [1.6325, 1.9], [1.62, 1.52], [1.55, 1.24], [1.4, 1.06],
    [1.1, 0.98], [0, 0.95],
  ],
  cr200j: [
    [0, 4.15], [0.58, 4.14], [1.06, 4.08], [1.4, 3.96], [1.58, 3.76], [1.68, 3.45],
    [1.68, 3.0], [1.68, 2.4], [1.66, 1.95], [1.6, 1.65], [1.5, 1.46], [1.34, 1.37],
    [1.06, 1.33], [0, 1.32],
  ],
};

const DIM = {
  crh5: { floorY: 0.98, roofY: 3.95, shoulderY: 3.38, vLow: 1.0, halfWidth: 1.6, noseLength: 5.4, wheelR: 0.445 },
  crh380b: { floorY: 0.95, roofY: 3.89, shoulderY: 3.3, vLow: 1.0, halfWidth: 1.6325, noseLength: 8.2, wheelR: 0.46 },
  cr200j: { floorY: 1.32, roofY: 4.15, shoulderY: 3.45, vLow: 1.32, halfWidth: 1.68, noseLength: 3.9, wheelR: 0.625 },
};

const NOSE = {
  // 短而扁的圆钝楔形（"驴脸"/"鳄鱼"），鼻尖低、车顶自鼻尖就上拱。
  crh5: (t, d) => {
    const a = Math.sin((t * Math.PI) / 2);
    return { sx: 0.36 + 0.64 * Math.pow(a, 0.62), topY: 1.72 + (d.roofY - 1.72) * Math.pow(a, 1.22), botY: 0.78 + 0.2 * t };
  },
  // 低伏修长的海豚型，前窗倾角大，鼻尖是明显的圆形车钩罩。
  crh380b: (t, d) => {
    const a = Math.sin((t * Math.PI) / 2);
    // 实车鼻锥是低伏但饱满的圆钝楔形，不是细长针尖：宽度早早鼓起，
    // 车顶自鼻尖就平滑上拱，鼻尖另有一只白色圆形车钩罩。
    return { sx: 0.44 + 0.56 * Math.pow(a, 0.55), topY: 1.42 + (d.roofY - 1.42) * Math.pow(a, 0.82), botY: 0.84 + 0.16 * t };
  },
  // 动力集中鼓形车体：短而饱满的斜面司机室，前脸接近竖直。
  cr200j: (t, d) => {
    const a = Math.sin((t * Math.PI) / 2);
    return { sx: 0.64 + 0.36 * Math.pow(a, 0.7), topY: 2.2 + (d.roofY - 2.2) * Math.pow(a, 1.05), botY: 0.9 + 0.34 * t };
  },
};

const spread = (z0, n, step) => Array.from({ length: n }, (_, i) => z0 + i * step);

function layout(kind, length, fam) {
  const half = length / 2;
  const isNose = kind !== 'mid' && kind !== 'trailer';
  if (fam === 'crh5') {
    return isNose
      ? {
        windows: spread(-half + 8.2, 9, 1.72), winW: 1.02, winY0: 2.18, winY1: 2.92,
        doors: [-half + 6.8],
        cab: [[-half + 1.75, 2.62], [-half + 4.5, 2.4], [-half + 4.5, 3.12], [-half + 2.35, 3.16]],
      }
      : {
        windows: spread(-9.8, 12, 1.75), winW: 1.02, winY0: 2.18, winY1: 2.92,
        doors: [half - 1.9], cab: null,
      };
  }
  if (fam === 'crh380b') {
    return isNose
      ? {
        windows: spread(-half + 13.2, 7, 1.55), winW: 1.16, winY0: 2.3, winY1: 3.02,
        doors: [half - 2.4],
        cab: [[-half + 2.1, 2.72], [-half + 6.8, 2.46], [-half + 6.8, 3.3], [-half + 3.1, 3.36]],
      }
      : {
        windows: spread(-8.5, 12, 1.5), winW: 1.16, winY0: 2.3, winY1: 3.02,
        doors: [-half + 2.2, half - 2.2], cab: null,
      };
  }
  // cr200j
  if (kind === 'power') {
    return {
      windows: spread(-half + 6.2, 6, 1.8), winW: 1.12, winY0: 2.3, winY1: 2.94,
      doors: [half - 1.6],
      cab: [[-half + 1.5, 3.02], [-half + 3.1, 2.94], [-half + 3.1, 3.48], [-half + 1.8, 3.52]],
    };
  }
  if (kind === 'control') {
    return {
      windows: spread(-half + 6.6, 9, 1.8), winW: 1.12, winY0: 2.3, winY1: 2.94,
      doors: [half - 1.6],
      cab: [[-half + 1.5, 3.02], [-half + 3.1, 2.94], [-half + 3.1, 3.48], [-half + 1.8, 3.52]],
    };
  }
  return {
    windows: spread(-half + 3.0, 12, 1.8), winW: 1.12, winY0: 2.3, winY1: 2.94,
    doors: [-half + 1.5, half - 1.5], cab: null,
  };
}

const CANOPY = {
  crh5: { z0: 0.5, z1: 4.9, span0: 5.7, span1: 2.5 },
  crh380b: { z0: 0.45, z1: 7.5, span0: 6.2, span1: 3.0 },
  cr200j: { z0: 0.35, z1: 3.1, span0: 5.2, span1: 4.2 },
};

const COLORS = {
  crh5: {
    blue: '#1b4f8f', blueLight: '#3f7fbf', ink: '#111a23', body: '#f4f7fa',
    skirt: 0x9aa3ac, bogie: 0x252a30, roof: 0xc8cfd6, panto: 0x9aa2aa,
    bellows: 0x3b4148, nose: 0xe9edf1,
  },
  crh380b: {
    blue: '#173a86', blueLight: '#3b6cc0', ink: '#0b1017', body: '#f7f9fb',
    skirt: 0x929ba4, bogie: 0x24282e, roof: 0xc3cbd3, panto: 0x9aa2aa,
    bellows: 0x3a4047, nose: 0xeef1f4,
  },
  cr200j: {
    green: '#1f5b3c', greenDark: '#123a27', red: '#b4272b', gold: '#d9ad45', ink: '#0b1410',
    skirt: 0x35413a, bogie: 0x252a2c, roof: 0x3d4348, panto: 0x8f979e,
    bellows: 0x4a453c, nose: 0xe8ecec,
  },
};

// ------------------------------------------------------------------ livery ---

const baseOf = (key) => (key === 'crh5g' ? 'crh5' : key);

function makeEnv(ctx, key, kind, length, variant, label) {
  const base = baseOf(key);
  const d = DIM[base];
  const P = COLORS[base];
  const L = layout(kind, length, base);
  const isNose = kind !== 'mid' && kind !== 'trailer';
  const pxPerM = (PX_SILL - PX_SHOULDER) / (d.shoulderY - d.vLow);
  const yPx = (y) => PX_SHOULDER + (d.shoulderY - y) * pxPerM;
  const uPx = (z) => ((z + length / 2) / length) * TEX_W;
  const noseEnd = isNose ? uPx(-length / 2 + d.noseLength) : 0;
  return { ctx, key, kind, length, variant, label, d, P, L, isNose, yPx, uPx, pxPerM, noseEnd };
}

function whiteBase(E, tint = '#f4f7fa') {
  const { ctx } = E;
  const g = ctx.createLinearGradient(0, 0, 0, TEX_H);
  g.addColorStop(0, '#7f8992');
  g.addColorStop(0.06, '#b9c2ca');
  g.addColorStop(0.13, tint);
  g.addColorStop(0.3, '#ffffff');
  g.addColorStop(0.42, '#f0f3f6');
  g.addColorStop(0.5, '#c9d0d7');
  g.addColorStop(0.58, '#f0f3f6');
  g.addColorStop(0.7, '#ffffff');
  g.addColorStop(0.87, tint);
  g.addColorStop(0.94, '#b9c2ca');
  g.addColorStop(1, '#7f8992');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
}

function panelSeams(E) {
  const { ctx, length, uPx, yPx, noseEnd, d } = E;
  ctx.strokeStyle = 'rgba(112,128,142,.17)';
  ctx.lineWidth = 2;
  for (let z = -length / 2 + 2.2; z < length / 2; z += 2.6) {
    const x = uPx(z);
    if (x < noseEnd) continue;
    ctx.beginPath();
    ctx.moveTo(x, PX_SHOULDER + 5);
    ctx.lineTo(x, PX_SILL - 3);
    ctx.stroke();
  }
  void yPx; void d;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** CRH5A / CRH5G：白底、细蓝腰线、独立小窗、一处端门、叶形司机室侧窗。 */
function paintCRH5(E) {
  const { ctx, P, L, yPx, uPx, length, isNose, noseEnd, label, variant, key } = E;
  whiteBase(E, '#f5f8fa');
  panelSeams(E);

  // 蓝色腰线：位于窗台下方，车头段轻轻上扬并收尖
  const yy = yPx(2.02);
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (isNose) {
    ctx.moveTo(0, yPx(2.42));
    ctx.quadraticCurveTo(noseEnd * 0.5, yPx(2.18), noseEnd * 1.15, yy);
    ctx.lineTo(TEX_W, yy);
  } else {
    ctx.moveTo(0, yy);
    ctx.lineTo(TEX_W, yy);
  }
  ctx.strokeStyle = P.blue;
  ctx.lineWidth = 10;
  ctx.stroke();
  ctx.strokeStyle = P.blueLight;
  ctx.lineWidth = 3;
  ctx.stroke();

  // 独立圆角小窗
  for (const z of L.windows) {
    const x = uPx(z - L.winW / 2);
    const w = uPx(z + L.winW / 2) - x;
    roundRect(ctx, x, yPx(L.winY1), w, yPx(L.winY0) - yPx(L.winY1), 11);
    ctx.fillStyle = P.ink;
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,164,178,.75)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // 每节车一侧一处塞拉门
  for (const z of L.doors) {
    const x0 = uPx(z - 0.72);
    const x1 = uPx(z + 0.72);
    ctx.strokeStyle = 'rgba(110,124,138,.85)';
    ctx.lineWidth = 3;
    roundRect(ctx, x0, yPx(3.12), x1 - x0, yPx(1.06) - yPx(3.12), 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo((x0 + x1) / 2, yPx(3.12));
    ctx.lineTo((x0 + x1) / 2, yPx(1.06));
    ctx.stroke();
    roundRect(ctx, uPx(z - 0.26), yPx(2.98), uPx(z + 0.26) - uPx(z - 0.26), yPx(2.36) - yPx(2.98), 5);
    ctx.fillStyle = '#16222e';
    ctx.fill();
  }

  if (isNose) {
    // 前风挡黑区：沿鼻锥上缘的一条渐窄黑色带，随后由曲面玻璃网格覆盖
    const half = length / 2;
    const edge = [
      [0, yPx(2.42)],
      [uPx(-half + 1.2), yPx(2.46)],
      [uPx(-half + 3.1), yPx(3.06)],
      [uPx(-half + 5.0), yPx(3.52)],
      [noseEnd, PX_SHOULDER],
    ];
    ctx.beginPath();
    ctx.moveTo(0, PX_SHOULDER * 0.35);
    ctx.lineTo(noseEnd * 0.92, PX_SHOULDER * 0.35);
    ctx.lineTo(edge[4][0], edge[4][1]);
    for (let i = edge.length - 2; i >= 0; i -= 1) ctx.lineTo(edge[i][0], edge[i][1]);
    ctx.closePath();
    const cg = ctx.createLinearGradient(0, 0, 0, yPx(2.4));
    cg.addColorStop(0, '#05090d');
    cg.addColorStop(0.6, '#0e1720');
    cg.addColorStop(1, '#22303c');
    ctx.fillStyle = cg;
    ctx.fill();
    // 风挡下缘银白饰条
    ctx.beginPath();
    ctx.moveTo(edge[0][0], edge[0][1]);
    for (let i = 1; i < edge.length; i += 1) ctx.lineTo(edge[i][0], edge[i][1]);
    ctx.strokeStyle = 'rgba(226,233,239,.9)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // 叶形司机室侧窗
    ctx.beginPath();
    ctx.moveTo(uPx(L.cab[0][0]), yPx(L.cab[0][1]));
    for (let i = 1; i < L.cab.length; i += 1) ctx.lineTo(uPx(L.cab[i][0]), yPx(L.cab[i][1]));
    ctx.closePath();
    ctx.fillStyle = '#0a1016';
    ctx.fill();
    ctx.strokeStyle = 'rgba(210,220,230,.8)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 头灯灯腔
    ctx.fillStyle = '#101720';
    for (const s of [-1, 1]) {
      const x = uPx(-half + 1.1);
      const y = yPx(1.68) + s * 0;
      roundRect(ctx, x - 34, y - 10, 68, 20, 9);
      ctx.fill();
    }
    // 鼻尖下方的排障器阴影
    ctx.fillStyle = 'rgba(70,82,94,.45)';
    ctx.fillRect(0, yPx(1.12), uPx(-half + 2.3), yPx(0.98) - yPx(1.12));
  }

  // 高寒型的设备舱做了密封，裙板上方压一条浅灰密封带（唯一外观差异）
  if (key === 'crh5g') {
    ctx.fillStyle = 'rgba(122,136,150,.3)';
    ctx.fillRect(noseEnd, yPx(1.36), TEX_W - noseEnd, 7);
  }
  void label; void variant;
}

/** CRH380BG：白底 + 通长黑窗带 + 蓝色细腰线与车头箭形上扬。 */
function paintCRH380B(E) {
  const { ctx, P, L, yPx, uPx, length, isNose, noseEnd } = E;
  whiteBase(E, '#f8fafb');
  panelSeams(E);

  const bandTop = yPx(3.14);
  const bandBot = yPx(2.12);
  ctx.fillStyle = P.ink;
  ctx.fillRect(noseEnd * 0.55, bandTop, TEX_W - noseEnd * 0.55, bandBot - bandTop);
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  ctx.fillRect(noseEnd * 0.55, bandTop, TEX_W - noseEnd * 0.55, 3);

  // 窗带内逐扇窗框（玻璃是独立网格）
  for (const z of L.windows) {
    const x = uPx(z - L.winW / 2);
    const w = uPx(z + L.winW / 2) - x;
    ctx.strokeStyle = 'rgba(146,160,174,.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, yPx(3.02), w, yPx(2.3) - yPx(3.02));
  }

  // 端门 + 门上椭圆窗
  for (const z of L.doors) {
    const x0 = uPx(z - 0.72);
    const x1 = uPx(z + 0.72);
    ctx.strokeStyle = 'rgba(110,124,138,.8)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x0, bandTop + 3, x1 - x0, yPx(1.08) - bandTop - 3);
    ctx.beginPath();
    ctx.ellipse(uPx(z), yPx(2.66), (x1 - x0) * 0.3, yPx(2.42) - yPx(2.92), 0, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0f14';
    ctx.fill();
  }

  // 深蓝细腰线（窗带下缘）
  const yy = yPx(2.03);
  ctx.beginPath();
  ctx.moveTo(noseEnd * 0.35, yy);
  ctx.lineTo(TEX_W, yy);
  ctx.strokeStyle = P.blue;
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.strokeStyle = P.blueLight;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  if (isNose) {
    const half = length / 2;
    // 头车观光区的大块黑窗（前缘斜切）
    ctx.beginPath();
    ctx.moveTo(noseEnd * 0.62, yPx(3.28));
    ctx.lineTo(uPx(-half + 12.6), yPx(3.16));
    ctx.lineTo(uPx(-half + 12.6), bandBot);
    ctx.lineTo(noseEnd * 0.92, yPx(2.36));
    ctx.closePath();
    ctx.fillStyle = '#0a1016';
    ctx.fill();
    ctx.strokeStyle = 'rgba(180,192,204,.55)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // 司机室侧窗（细长楔形）
    ctx.beginPath();
    ctx.moveTo(uPx(L.cab[0][0]), yPx(L.cab[0][1]));
    for (let i = 1; i < L.cab.length; i += 1) ctx.lineTo(uPx(L.cab[i][0]), yPx(L.cab[i][1]));
    ctx.closePath();
    ctx.fillStyle = '#070c12';
    ctx.fill();
    // 车头蓝色箭形：腰线在鼻锥后方分叉成上下两支，形成实车的 V 形箭头
    const uJ = uPx(-half + 6.4);
    const yJ = yPx(2.03);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = P.blue;
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(uJ, yJ);
    ctx.lineTo(uPx(-half + 0.7), yPx(2.92));
    ctx.moveTo(uJ, yJ);
    ctx.lineTo(uPx(-half + 4.5), yPx(1.62));
    ctx.stroke();
    ctx.strokeStyle = P.blueLight;
    ctx.lineWidth = 3;
    ctx.stroke();
    // 前风挡：只压在鼻锥上缘的一条黑色带，车头侧面保持白色
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(noseEnd * 0.9, 0);
    ctx.lineTo(noseEnd, yPx(3.2));
    ctx.lineTo(0, yPx(2.95));
    ctx.closePath();
    const cg = ctx.createLinearGradient(0, 0, 0, yPx(2.9));
    cg.addColorStop(0, '#04070b');
    cg.addColorStop(1, '#1b2836');
    ctx.fillStyle = cg;
    ctx.fill();
    // 灯腔（斜置四边形）
    ctx.fillStyle = '#101820';
    ctx.beginPath();
    ctx.moveTo(uPx(-half + 0.8), yPx(2.12));
    ctx.lineTo(uPx(-half + 2.3), yPx(2.2));
    ctx.lineTo(uPx(-half + 2.0), yPx(1.86));
    ctx.lineTo(uPx(-half + 0.7), yPx(1.82));
    ctx.closePath();
    ctx.fill();
    // 鼻尖圆形车钩罩的浅色阴影
    ctx.fillStyle = 'rgba(150,164,178,.35)';
    ctx.fillRect(0, yPx(1.2), uPx(-half + 1.6), yPx(0.96) - yPx(1.2));
  }
}

/** CR200J3-C："AD钙"白/银车身 + 国槐绿窗带 + 红色双细线与头车上扬双弧。 */
function paintCR200J(E) {
  const { ctx, P, L, yPx, uPx, length, isNose, noseEnd } = E;
  whiteBase(E, '#eef1f2');

  // 国槐绿盲窗带
  const gTop = yPx(3.04);
  const gBot = yPx(1.98);
  const gg = ctx.createLinearGradient(0, gTop, 0, gBot);
  gg.addColorStop(0, P.greenDark);
  gg.addColorStop(0.35, P.green);
  gg.addColorStop(1, '#17492f');
  ctx.fillStyle = gg;
  ctx.fillRect(0, gTop, TEX_W, gBot - gTop);
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.fillRect(0, gTop, TEX_W, 3);

  // 独立车窗（绿带上的矩形窗，带浅色窗框）
  for (const z of L.windows) {
    const x = uPx(z - L.winW / 2);
    const w = uPx(z + L.winW / 2) - x;
    roundRect(ctx, x, yPx(L.winY1), w, yPx(L.winY0) - yPx(L.winY1), 5);
    ctx.fillStyle = '#0c1512';
    ctx.fill();
    ctx.strokeStyle = 'rgba(206,216,210,.55)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // 端门（浅色门框 + 门上小窗）
  for (const z of L.doors) {
    const x0 = uPx(z - 0.66);
    const x1 = uPx(z + 0.66);
    ctx.strokeStyle = 'rgba(96,108,104,.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x0, yPx(3.12), x1 - x0, yPx(1.2) - yPx(3.12));
    roundRect(ctx, uPx(z - 0.24), yPx(2.94), uPx(z + 0.24) - uPx(z - 0.24), yPx(2.42) - yPx(2.94), 4);
    ctx.fillStyle = '#13231b';
    ctx.fill();
  }

  // 红色双细线：贯穿全列，头车从腰线分出两道平行上扬的弧（不是实心三角）
  const half = length / 2;
  const uJ = isNose ? uPx(-half + 9.4) : 0;
  const redY = [yPx(1.88), yPx(1.78)];
  for (const y of redY) {
    ctx.beginPath();
    ctx.moveTo(uJ, y);
    ctx.lineTo(TEX_W, y);
    ctx.strokeStyle = P.red;
    ctx.lineWidth = 7;
    ctx.stroke();
  }
  if (isNose) {
    const wave = (dy) => {
      ctx.beginPath();
      ctx.moveTo(uJ, yPx(1.84) + dy);
      ctx.bezierCurveTo(
        uPx(-half + 6.4), yPx(1.78) + dy,
        uPx(-half + 3.0), yPx(2.86) + dy,
        uPx(-half + 0.8), yPx(2.68) + dy,
      );
      ctx.strokeStyle = P.red;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      ctx.stroke();
    };
    wave(0);
    wave(-19);
    // 车顶石墨灰风挡罩：下缘用曲线，避免出现尖锐黑三角
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(noseEnd * 0.92, 0);
    ctx.bezierCurveTo(noseEnd * 0.9, yPx(3.5), noseEnd * 0.5, yPx(3.28), 0, yPx(2.92));
    ctx.closePath();
    const cg = ctx.createLinearGradient(0, 0, 0, yPx(2.9));
    cg.addColorStop(0, '#1c2226');
    cg.addColorStop(1, '#39424a');
    ctx.fillStyle = cg;
    ctx.fill();
    // 绿色前脸：边界走两段贝塞尔，下方留白色保险杠
    ctx.beginPath();
    ctx.moveTo(0, yPx(2.88));
    ctx.bezierCurveTo(noseEnd * 0.55, yPx(3.02), noseEnd * 1.05, yPx(2.7), noseEnd * 1.18, yPx(1.72));
    ctx.bezierCurveTo(noseEnd * 1.2, yPx(1.4), noseEnd * 0.9, yPx(1.28), 0, yPx(1.3));
    ctx.closePath();
    ctx.fillStyle = P.green;
    ctx.fill();
    // 金色中国铁路路徽（示意：圆环 + 横向与"人"字笔划）
    ctx.save();
    ctx.translate(uPx(-half + 1.15), yPx(2.12));
    ctx.strokeStyle = P.gold;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-22, 5);
    ctx.lineTo(22, 5);
    ctx.moveTo(0, -18);
    ctx.lineTo(-13, 5);
    ctx.moveTo(0, -18);
    ctx.lineTo(13, 5);
    ctx.stroke();
    ctx.restore();
    // 司机室侧窗
    ctx.beginPath();
    ctx.moveTo(uPx(L.cab[0][0]), yPx(L.cab[0][1]));
    for (let i = 1; i < L.cab.length; i += 1) ctx.lineTo(uPx(L.cab[i][0]), yPx(L.cab[i][1]));
    ctx.closePath();
    ctx.fillStyle = '#0b1215';
    ctx.fill();
    // 灯腔
    ctx.fillStyle = '#0d1518';
    roundRect(ctx, uPx(-half + 0.55) - 28, yPx(2.42) - 14, 56, 28, 12);
    ctx.fill();
  }

  // 车体下缘的墨绿裙板
  ctx.fillStyle = 'rgba(24,72,47,.9)';
  ctx.fillRect(0, yPx(1.32), TEX_W, yPx(1.1) - yPx(1.32));
}

const PAINT = { crh5: paintCRH5, crh5g: paintCRH5, crh380b: paintCRH380B, cr200j: paintCR200J };

function drawTexts(E) {
  const { ctx, key, kind, isNose, length, uPx, yPx, label, variant } = E;
  const text = (str, z, y, font, color) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = 'alphabetic';
    const x = uPx(z);
    ctx.save();
    ctx.translate(x, TEX_H - y);
    ctx.scale(1, -1);
    ctx.fillText(str, 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.fillText(str, 0, 0);
    ctx.restore();
  };
  const half = length / 2;
  if (key === 'crh200j' || key === 'cr200j') {
    text('复兴号', isNose ? -half + 8.6 : -1.4, yPx(3.38), '700 40px "Microsoft YaHei","Segoe UI",sans-serif', '#b08c36');
    text('CR', isNose ? -half + 5.2 : -9.4, yPx(2.22), '800 38px "Segoe UI",sans-serif', '#f1f5f2');
    text(label, isNose ? -half + 12.8 : 4.2, yPx(1.52), '600 21px "Segoe UI",sans-serif', '#5a6460');
    if (!isNose) text(variant ? 'ZE 02' : 'ZE 01', -7.2, yPx(1.52), '600 20px "Segoe UI",sans-serif', '#5a6460');
    return;
  }
  const navy = '#1c3557';
  if (key === 'crh380b') {
    text('和谐号', isNose ? -half + 8.2 : -1.2, yPx(3.42), '700 34px "Microsoft YaHei","Segoe UI",sans-serif', navy);
    text('CRH', isNose ? -half + 5.0 : -8.8, yPx(1.72), '800 34px "Segoe UI",sans-serif', navy);
    text(label, isNose ? -half + 12.4 : -1.0, yPx(1.56), '600 22px "Segoe UI",sans-serif', '#4c5762');
  } else {
    text('和谐号', isNose ? -half + 9.4 : -1.0, yPx(3.4), '700 34px "Microsoft YaHei","Segoe UI",sans-serif', navy);
    text('CRH', isNose ? -half + 5.6 : -9.0, yPx(1.72), '800 40px "Segoe UI",sans-serif', '#16202b');
    text(label, isNose ? -half + 8.0 : 3.6, yPx(1.5), '600 21px "Segoe UI",sans-serif', '#4c5762');
  }
  void kind;
}

function liveryTexture(key, kind, length, variant, label) {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');
  const E = makeEnv(ctx, key, kind, length, variant, label);
  PAINT[key](E);
  // 上半张（+X 侧）镜像到下半张（-X 侧）
  ctx.save();
  ctx.translate(0, TEX_H);
  ctx.scale(1, -1);
  ctx.drawImage(canvas, 0, 0, TEX_W, TEX_H / 2, 0, 0, TEX_W, TEX_H / 2);
  ctx.restore();
  drawTexts(E);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.anisotropy = 8;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// --------------------------------------------------------------- geometry ---

function makeRing(key) {
  const half = PROFILE[key];
  const pts = half.slice();
  for (let i = half.length - 2; i >= 1; i -= 1) pts.push([-half[i][0], half[i][1]]);
  return { ring: pts, halfLen: half.length };
}

function vOfY(y, d) {
  if (y >= d.shoulderY) return (V_SHOULDER * (d.roofY - y)) / (d.roofY - d.shoulderY);
  if (y >= d.vLow) return V_SHOULDER + ((V_SILL - V_SHOULDER) * (d.shoulderY - y)) / (d.shoulderY - d.vLow);
  return V_SILL + ((0.5 - V_SILL) * (d.vLow - y)) / Math.max(0.02, d.vLow - d.floorY);
}

function makeRingV(ring, halfLen, d) {
  const v = ring.map(([, y], i) => (i < halfLen ? vOfY(y, d) : 1 - vOfY(y, d)));
  v.push(1);
  return v;
}

function sectionAt(z, length, hasNose, key, d) {
  const half = length / 2;
  if (!hasNose) {
    const edge = clamp01(Math.min(z + half, half - z) / 0.42);
    const k = smooth(edge);
    return { sx: 0.96 + 0.04 * k, topY: d.roofY - (1 - k) * 0.03, botY: d.floorY + (1 - k) * 0.01 };
  }
  return NOSE[key === 'crh5g' ? 'crh5' : key](clamp01((z + half) / d.noseLength), d);
}

function ringPoint(i, sec, ring, d) {
  const [x, y] = ring[i % ring.length];
  const ny = sec.botY + ((y - d.floorY) / (d.roofY - d.floorY)) * (sec.topY - sec.botY);
  return [x * sec.sx, ny];
}

function noseSections(length, d) {
  const zs = [];
  const n = 32;
  for (let i = 0; i <= n; i += 1) zs.push(-length / 2 + d.noseLength * Math.pow(i / n, 1.55));
  const start = -length / 2 + d.noseLength;
  for (let i = 1; i <= 8; i += 1) zs.push(start + ((length / 2 - start) * i) / 8);
  return zs;
}

function buildBodyGeometry(kind, length, key, d, ring, ringV) {
  const hasNose = kind !== 'mid' && kind !== 'trailer';
  const zs = hasNose ? noseSections(length, d) : Array.from({ length: 17 }, (_, i) => -length / 2 + (length * i) / 16);
  const positions = [];
  const uvs = [];
  const indices = [];
  const cols = ring.length + 1;
  for (const z of zs) {
    const sec = sectionAt(z, length, hasNose, key, d);
    for (let i = 0; i <= ring.length; i += 1) {
      const [x, y] = ringPoint(i, sec, ring, d);
      positions.push(x, y, z);
      uvs.push((z + length / 2) / length, ringV[i]);
    }
  }
  for (let s = 0; s < zs.length - 1; s += 1) {
    for (let i = 0; i < ring.length; i += 1) {
      const a = s * cols + i;
      const c = (s + 1) * cols + i;
      indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const addCap = (z, front) => {
    const sec = sectionAt(z, length, hasNose, key, d);
    const u = (z + length / 2) / length;
    const center = positions.length / 3;
    positions.push(0, (sec.topY + sec.botY) / 2, z);
    uvs.push(u, 0.25);
    const start = positions.length / 3;
    for (let i = 0; i <= ring.length; i += 1) {
      const [x, y] = ringPoint(i, sec, ring, d);
      positions.push(x, y, z);
      uvs.push(u, ringV[i]);
    }
    for (let i = 0; i < ring.length; i += 1) {
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

function buildCanopyGeometry(kind, length, key, d, ring, ringV) {
  const C = CANOPY[key === 'crh5g' ? 'crh5' : key];
  const rows = 18;
  const cols = 13;
  const positions = [];
  const uvs = [];
  const indices = [];
  const ringAt = (r) => {
    const i0 = Math.floor(r) % ring.length;
    const i1 = (i0 + 1) % ring.length;
    const f = r - Math.floor(r);
    return [
      ring[i0][0] + (ring[i1][0] - ring[i0][0]) * f,
      ring[i0][1] + (ring[i1][1] - ring[i0][1]) * f,
      ringV[i0] + (ringV[i1] - ringV[i0]) * f,
    ];
  };
  for (let s = 0; s <= rows; s += 1) {
    const t = s / rows;
    const z = -length / 2 + C.z0 + (C.z1 - C.z0) * Math.pow(t, 1.08);
    const sec = sectionAt(z, length, true, key, d);
    const span = C.span0 - (C.span0 - C.span1) * Math.pow(t, 1.4);
    for (let c = 0; c < cols; c += 1) {
      const j = c <= 6 ? c : cols - 1 - c;
      const sign = c <= 6 ? 1 : -1;
      const [rx, ry, rv] = ringAt((j * span) / 6);
      const ny = sec.botY + ((ry - d.floorY) / (d.roofY - d.floorY)) * (sec.topY - sec.botY);
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
  geo.setAttribute('color', new THREE.Float32BufferAttribute(Array(positions.length / 3).fill([1, 1, 1]).flat(), 3));
  geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  for (let i = 0; i < pos.count; i += 1) {
    pos.setXYZ(i, pos.getX(i) + nor.getX(i) * 0.024, pos.getY(i) + nor.getY(i) * 0.024, pos.getZ(i) + nor.getZ(i) * 0.024);
  }
  pos.needsUpdate = true;
  return geo;
}

function quadZ(z0, z1, y0, y1, x, tint) {
  const g = new THREE.BufferGeometry();
  const s = Math.sign(x);
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

function buildGlassGeometry(kind, length, key, d, seed) {
  const L = layout(kind, length, key);
  const parts = [];
  let n = seed;
  const tint = () => {
    n = (n * 1103515245 + 12345) % 2147483648;
    const r = n / 2147483648;
    return key === 'cr200j'
      ? [0.2 + r * 0.16, 0.3 + r * 0.18, 0.24 + r * 0.16]
      : [0.24 + r * 0.2, 0.3 + r * 0.22, 0.4 + r * 0.24];
  };
  for (const side of [-1, 1]) {
    const x = side * (d.halfWidth + 0.015);
    for (const z of L.windows) parts.push(quadZ(z - L.winW / 2, z + L.winW / 2, L.winY0, L.winY1, x, tint()));
    for (const z of L.doors) parts.push(quadZ(z - 0.24, z + 0.24, 2.42, 2.94, x, tint()));
    if (L.cab) {
      const g = new THREE.BufferGeometry();
      const pos = [];
      const order = side > 0 ? [0, 1, 2, 3] : [3, 2, 1, 0];
      for (const i of order) pos.push(x, L.cab[i][1], L.cab[i][0]);
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(Array(4).fill([side, 0, 0]).flat(), 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(Array(4).fill([0.45, 0.52, 0.58]).flat(), 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      parts.push(g);
    }
  }
  return mergeGeometries(parts);
}

function buildSkirtGeometry(kind, length, key, d) {
  const half = length / 2;
  const hasNose = kind !== 'mid' && kind !== 'trailer';
  const inset = key === 'cr200j' ? 3.6 : hasNose ? 5.0 : 4.1;
  const bogies = [-(half - inset), half - inset];
  const parts = [];
  const z0 = hasNose ? -half + d.noseLength * 0.85 : -half + 0.35;
  const z1 = half - 0.35;
  parts.push(box(2.5, 0.14, z1 - z0, 0, d.floorY - 0.06, (z0 + z1) / 2));
  let cursor = z0;
  for (const bz of bogies) {
    const a = bz - 1.8;
    const b = bz + 1.8;
    if (a > cursor + 0.2) {
      const len = a - cursor;
      parts.push(box(d.halfWidth * 1.86, 0.42, len, 0, d.floorY - 0.32, cursor + len / 2));
      for (let i = 0; i < Math.floor(len / 1.6); i += 1) {
        parts.push(box(d.halfWidth * 1.9, 0.18, 0.6, 0, d.floorY - 0.3, cursor + 0.8 + i * 1.6));
      }
    }
    cursor = b;
  }
  if (z1 > cursor + 0.2) {
    const len = z1 - cursor;
    parts.push(box(d.halfWidth * 1.86, 0.42, len, 0, d.floorY - 0.32, cursor + len / 2));
  }
  if (hasNose) {
    parts.push(box(1.9, 0.3, 2.6, 0, d.floorY - 0.22, -half + d.noseLength * 0.5));
  }
  return mergeGeometries(parts);
}

function buildBogieGeometry(kind, length, key, d) {
  const half = length / 2;
  const hasNose = kind !== 'mid' && kind !== 'trailer';
  const inset = key === 'cr200j' ? 3.6 : hasNose ? 5.0 : 4.1;
  const w = d.wheelR;
  const k = w / 0.46;
  const parts = [];
  for (const bz of [-(half - inset), half - inset]) {
    for (const sx of [-1, 1]) {
      parts.push(box(0.16, 0.42 * k, 3.0, sx * 1.02, 0.62 * k, bz));
      parts.push(box(0.2, 0.2, 0.5, sx * 1.02, 0.86 * k, bz));
    }
    parts.push(box(2.0, 0.24, 0.44, 0, 0.78 * k, bz));
    parts.push(box(1.9, 0.2, 0.3, 0, 0.5 * k, bz));
    for (const dz of [-1.25, 1.25]) {
      parts.push(cyl(0.07, 1.72, 6, 0, w, bz + dz, 'x'));
      for (const sx of [-1, 1]) {
        parts.push(cyl(w, 0.13, 10, sx * 0.715, w, bz + dz, 'x'));
        parts.push(box(0.22, 0.3, 0.34, sx * 0.9, 0.62 * k, bz + dz));
        parts.push(cyl(0.09, 0.18, 4, sx * 0.9, 0.82 * k, bz + dz));
      }
    }
    parts.push(box(0.5, 0.22, 0.9, 0.55, 0.56 * k, bz + 0.4));
  }
  return mergeGeometries(parts);
}

function buildRoofGeometry(kind, length, key, d) {
  const hasNose = kind !== 'mid' && kind !== 'trailer';
  const parts = [];
  const z0 = hasNose ? -length / 2 + (key === 'cr200j' ? 3.6 : d.noseLength) : -length / 2 + 0.6;
  const z1 = length / 2 - 0.6;
  parts.push(box(2.1, 0.12, z1 - z0, 0, d.roofY + 0.02, (z0 + z1) / 2));
  const count = Math.max(2, Math.floor((z1 - z0) / 7));
  for (let i = 0; i < count; i += 1) {
    const z = z0 + ((z1 - z0) * (i + 0.5)) / count;
    parts.push(box(1.72, 0.22, 2.6, 0, d.roofY + 0.14, z));
    parts.push(box(1.42, 0.05, 2.1, 0, d.roofY + 0.27, z));
  }
  return mergeGeometries(parts);
}

function buildPantoGeometry(z, raised, baseY, topY) {
  const parts = [];
  const H = topY - baseY;
  for (const x of [-0.62, 0.62]) parts.push(box(0.2, 0.14, 0.9, x, baseY + 0.02, z));
  parts.push(box(1.6, 0.09, 0.28, 0, baseY + 0.06, z + 0.4));
  parts.push(box(1.6, 0.09, 0.28, 0, baseY + 0.06, z - 0.4));
  for (const x of [-0.5, 0.5]) parts.push(cyl(0.11, 0.18, 8, x, baseY + 0.16, z + 0.4));
  if (raised) {
    for (const x of [-0.46, 0.46]) {
      parts.push(strut(new THREE.Vector3(x, baseY + 0.22, z + 0.4), new THREE.Vector3(x * 0.72, baseY + H * 0.55, z - 0.34), 0.055));
      parts.push(strut(new THREE.Vector3(x * 0.72, baseY + H * 0.55, z - 0.34), new THREE.Vector3(x * 0.6, topY - 0.08, z + 0.16), 0.045));
      parts.push(strut(new THREE.Vector3(x, baseY + 0.22, z - 0.3), new THREE.Vector3(x * 0.72, baseY + H * 0.5, z - 0.3), 0.03));
    }
    parts.push(box(1.9, 0.06, 0.1, 0, topY - 0.04, z + 0.16));
    parts.push(box(1.9, 0.05, 0.26, 0, topY, z + 0.16));
  } else {
    for (const x of [-0.46, 0.46]) {
      parts.push(strut(new THREE.Vector3(x, baseY + 0.22, z + 0.4), new THREE.Vector3(x * 0.8, baseY + 0.36, z - 0.5), 0.055));
    }
    parts.push(box(1.9, 0.06, 0.26, 0, baseY + 0.3, z + 0.44));
  }
  return mergeGeometries(parts);
}

function buildNoseDetails(kind, length, key, d) {
  const parts = [];
  if (kind === 'mid' || kind === 'trailer') return parts;
  if (key === 'crh380b') {
    // 鼻尖那只显眼的白色圆形车钩罩，侧面看是 CRH380B 的辨识特征
    const s = new THREE.SphereGeometry(0.66, 14, 10);
    s.scale(1, 0.92, 0.52);
    s.translate(0, 1.2, -length / 2 + 0.26);
    parts.push(s);
  }
  if (key === 'crh5' || key === 'crh5g') {
    parts.push(box(1.05, 0.26, 0.5, 0, 0.86, -length / 2 + 0.42));
  }
  if (key === 'cr200j') {
    parts.push(box(2.2, 0.22, 0.5, 0, 0.92, -length / 2 + 0.3));
  }
  void d;
  return parts;
}

// ------------------------------------------------------------------ train ---

const KINDS = {
  crh5: (n) => ['head', ...Array(n - 2).fill('mid'), 'head'],
  crh5g: (n) => ['head', ...Array(n - 2).fill('mid'), 'head'],
  crh380b: (n) => ['head', ...Array(n - 2).fill('mid'), 'head'],
  cr200j: (n) => ['power', ...Array(n - 2).fill('trailer'), 'control'],
};

export function buildFamilyTrain(cfg) {
  const key = FAMILIES[cfg.model] ? cfg.model : 'crh5';
  const base = baseOf(key);
  const d = DIM[base];
  const P = COLORS[base];
  const n = Math.max(2, cfg.formation ?? 8);
  const gap = cfg.set?.gap ?? 0.6;
  const lengths = cfg.carLengths
    ? cfg.carLengths.slice(0, n)
    : Array.from({ length: n }, (_, i) => (i === 0 || i === n - 1 ? cfg.set?.headLength ?? 25.8 : cfg.set?.middleLength ?? 25));
  const kinds = KINDS[key](n);
  const total = lengths.reduce((a, b) => a + b, 0) + gap * (n - 1);
  const headZ = -total / 2 + lengths[0] / 2;
  const pantoCars = cfg.pantoCars ?? [2, n - 3];
  const label = cfg.name ?? key.toUpperCase();

  const { ring, halfLen } = makeRing(base);
  const ringV = makeRingV(ring, halfLen, d);
  const geoCache = new Map();
  const geoFor = (kind, length) => {
    const id = `${kind}:${length}`;
    if (!geoCache.has(id)) {
      geoCache.set(id, {
        body: buildBodyGeometry(kind, length, base, d, ring, ringV),
        glass: buildGlassGeometry(kind, length, base, d, kind === 'power' ? 7 : 31),
        canopy: kind === 'mid' || kind === 'trailer' ? null : buildCanopyGeometry(kind, length, base, d, ring, ringV),
        skirt: buildSkirtGeometry(kind, length, base, d),
        bogie: buildBogieGeometry(kind, length, base, d),
        roof: buildRoofGeometry(kind, length, base, d),
        nose: buildNoseDetails(kind, length, base, d),
      });
    }
    return geoCache.get(id);
  };

  const buckets = { head: [], midA: [], midB: [], glass: [], canopy: [], skirt: [], bogie: [], roof: [], pantoUp: [], pantoDown: [], bellows: [], nose: [] };
  const matrix = new THREE.Matrix4();
  const put = (list, geo, m) => {
    const g = geo.clone();
    g.applyMatrix4(m);
    list.push(g);
  };
  const carCenters = [];
  let front = -total / 2;
  let midIndex = 0;
  const baseY = d.roofY + 0.16;
  const topY = 5.36;

  kinds.forEach((kind, i) => {
    const len = lengths[i];
    const isNose = kind !== 'mid' && kind !== 'trailer';
    const rot = i === n - 1 ? Math.PI : 0;
    matrix.makeRotationY(rot);
    matrix.setPosition(0, 0, front + len / 2);
    carCenters.push(front + len / 2);

    const G = geoFor(kind, len);
    const variant = !isNose && midIndex % 2 === 1;
    put(isNose ? buckets.head : variant ? buckets.midB : buckets.midA, G.body, matrix);
    put(buckets.glass, G.glass, matrix);
    if (G.canopy) put(buckets.canopy, G.canopy, matrix);
    put(buckets.skirt, G.skirt, matrix);
    put(buckets.bogie, G.bogie, matrix);
    put(buckets.roof, G.roof, matrix);
    for (const g of G.nose) put(buckets.nose, g, matrix);
    if (base === 'crh380b' && isNose) {
      // 车钩罩外圈压一道深色密封圈，白罩才不会融进白车头
      const ring = new THREE.TorusGeometry(0.66, 0.045, 6, 20);
      ring.translate(0, 1.2, -len / 2 + 0.04);
      put(buckets.bogie, ring, matrix);
    }

    if (pantoCars.includes(i)) {
      const pz = key === 'cr200j' ? -len / 2 + 5.4 : 2.3;
      put(buckets.pantoUp, buildPantoGeometry(pz, true, baseY, topY), matrix);
      put(buckets.pantoDown, buildPantoGeometry(pz, false, baseY, topY), matrix);
    }
    if (i < n - 1) {
      const gz = front + len + gap / 2;
      // 外风挡窄而藏在车体轮廓内，不能冒出车顶变成一块黄板
      const h = d.roofY - d.floorY - 0.14;
      put(buckets.bellows, box(d.halfWidth * 1.7, h, gap + 0.14, 0, (d.roofY + d.floorY) / 2, gz), matrix);
      put(buckets.bellows, box(d.halfWidth * 1.74, 0.07, gap + 0.16, 0, d.roofY - 0.05, gz), matrix);
    }
    if (!isNose) midIndex += 1;
    front += len + gap;
  });

  for (const g of geoCache.values()) {
    g.body.dispose(); g.glass.dispose(); g.canopy?.dispose(); g.skirt.dispose(); g.bogie.dispose(); g.roof.dispose();
    for (const p of g.nose) p.dispose();
  }

  const bodyMat = (tex) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.34, metalness: 0.32, envMapIntensity: 1.1 });
  const headLen = lengths[0];
  const midLen = lengths.find((_, i) => kinds[i] === 'mid' || kinds[i] === 'trailer') ?? lengths[0];
  const materials = {
    head: bodyMat(liveryTexture(key, kinds[0], headLen, 0, label)),
    midA: bodyMat(liveryTexture(key, 'trailer', midLen, 0, label)),
    midB: bodyMat(liveryTexture(key, 'trailer', midLen, 1, label)),
    glass: new THREE.MeshStandardMaterial({
      color: 0x070d14, roughness: 0.32, metalness: 0.08, envMapIntensity: 0.25,
      vertexColors: true, emissive: new THREE.Color(0x1a2a38), emissiveIntensity: 0,
    }),
    canopy: new THREE.MeshStandardMaterial({ color: 0x04070a, roughness: 0.34, metalness: 0.1, envMapIntensity: 0.16, vertexColors: true }),
    skirt: new THREE.MeshStandardMaterial({ color: P.skirt, roughness: 0.62, metalness: 0.32 }),
    bogie: new THREE.MeshStandardMaterial({ color: P.bogie, roughness: 0.8, metalness: 0.3 }),
    roof: new THREE.MeshStandardMaterial({ color: P.roof, roughness: 0.48, metalness: 0.45 }),
    panto: new THREE.MeshStandardMaterial({ color: P.panto, roughness: 0.45, metalness: 0.6 }),
    bellows: new THREE.MeshStandardMaterial({ color: P.bellows, roughness: 0.75, metalness: 0.18 }),
    nose: new THREE.MeshStandardMaterial({ color: P.nose, roughness: 0.4, metalness: 0.28 }),
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
    bellows: add('bellows', buckets.bellows, materials.bellows),
    nose: add('nose-detail', buckets.nose, materials.nose),
  };
  if (meshes.pantoDown) meshes.pantoDown.visible = false;

  // 头灯 / 尾灯：贴在鼻锥两侧（CR200J 是三角灯组，CRH5/380B 是斜置灯带）
  const lampZ = total / 2 - (key === 'cr200j' ? 1.0 : key === 'crh380b' ? 1.4 : 1.1);
  const lampY = key === 'cr200j' ? 2.42 : key === 'crh380b' ? 1.98 : 1.68;
  const sec = sectionAt(-headLen / 2 + (total / 2 - lampZ), headLen, true, key, d);
  const lampLy = sec.botY + ((lampY - d.floorY) / (d.roofY - d.floorY)) * (sec.topY - sec.botY);
  const lampLx = d.halfWidth * sec.sx + 0.03;
  const lampGeos = (sign) => {
    const list = [];
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(key === 'cr200j' ? 0.34 : 0.46, key === 'cr200j' ? 0.3 : 0.13, 0.08);
      g.rotateY(s * (key === 'crh380b' ? 0.7 : 0.55));
      g.translate(s * lampLx, lampLy, sign * (-lampZ));
      list.push(g);
    }
    return list;
  };
  meshes.lampF = add('lamp-front', lampGeos(1), materials.lampF, false);
  meshes.lampR = add('lamp-rear', lampGeos(-1), materials.lampR, false);

  const lampPositions = [];
  const lampColors = [];
  for (const s of [-1, 1]) {
    lampPositions.push(s * lampLx, lampLy, -lampZ, s * lampLx, lampLy, lampZ);
    lampColors.push(1, 0.93, 0.76, 1, 0.16, 0.14);
  }

  return {
    group,
    total,
    headZ,
    cars: n,
    carCenters,
    materials,
    meshes,
    lampPositions,
    lampColors,
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

export const FAMILIES = { crh5: true, crh5g: true, crh380b: true, cr200j: true };

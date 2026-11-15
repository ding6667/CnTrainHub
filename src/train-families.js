import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 哈尔滨局另外三个平台（四车型）的程序化车体：
 *   CRH5A / CRH5G（Pendolino 平台）、CRH380BG（Velaro 高寒型）、
 *   CR200J3-C（动力集中鼓形车体 · AD钙涂装）。
 *
 * 局部坐标与 CR400BF 一致：+Y 上、+Z 车尾、车头朝 -Z、轨顶面 y=0。
 * 涂装统一画在 3072×768 CanvasTexture 上：v 0–0.13 车顶、0.13–0.44 侧墙、
 * 0.44–0.5 车底是 +X 侧，0.5–1 是镜像的 -X 侧；画完上半张再垂直镜像，
 * flipY=false，文字左右分别镜像绘制 —— 这条既有口径保持不变。
 *
 * ============================================================================
 * 实车核对结论（2026-11 联网逐轮检索 + 实车照片比对，配色为近似复刻）
 * ----------------------------------------------------------------------------
 * 第 3 轮 · CRH5A / CRH5G 标准「驴」头（侧视 + 前脸照片核对）
 *  - 白色车身、窗台下方一条较粗的深蓝腰线，车头段上扬收成尖；首组进口车曾
 *    为蓝色涂装，后统一白色。独立圆角小方窗（无通长黑窗带）、窗间有明显白
 *    色立柱；每节车每侧端部塞拉门，门附近有「低站台补偿器」伸出的踏板，
 *    部分资料记载黄色车门为显著标识。
 *  - 车头是高大扁圆的钝楔「驴脸」：大面积黑色整体风挡（可见雨刷）、叶形司机
 *    室侧窗、鼻尖有显眼的圆形车钩整流罩轮廓；车灯是两道上斜的「驴耳朵」式
 *    杏仁形灯组（下缘带红色标志灯）。车顶为单元式空调 + 受电弓（DSA250）。
 *  - CRH5G 标准型：车钩整流罩处不伸出车钩导向杆，外观/涂装与 CRH5A 几无二致；
 *    2017 年换装「海豚」流线头型的技术提升型不在本模型范围。
 *  来源 https://baike.baidu.com/item/CRH5
 *       https://baike.baidu.com/item/%E5%92%8C%E8%AB%A7%E8%99%9FCRH5A%E5%9E%8B%E5%8B%95%E8%BB%8A%E7%B5%84/64849987
 *       http://mp.weixin.qq.com/s?__biz=MzE5OTEwMTkwMA==&mid=2247487229&idx=1&sn=42695b3a3612a33ed83c36157befc084
 *       http://mp.weixin.qq.com/s?__biz=Mzk1NzU5ODUxMA==&mid=2247487314&idx=1&sn=2c67ce7fbfb07797d0d93323c91e5330
 *  实车照片（下关站 CRH5A-5028 / CRH5G-5167）：
 *       http://www.xiaguanzhan.com/xz/uploadfiles/CRH5A-5028.jpg
 *       http://www.xiaguanzhan.com/xz/uploadfiles/CRH5G-5167.jpg
 * ----------------------------------------------------------------------------
 * 第 4 轮 · CRH380BG（侧视照片核对）
 *  - ICE3 / Velaro 血统的低伏修长「海豚」圆钝长鼻；白底 + 深蓝细腰线，腰线在
 *    车头分叉成上下两支形成蓝色 V 形箭头上扬；鼻尖是显眼的白色圆形车钩罩
 *    （外压深色密封圈）。
 *  - 通长黑色窗带，但带内逐扇窗有银色竖梃分隔；头车观光区为大块斜切黑窗；
 *    门上椭圆窗；裙板有一排排通风格栅。车顶空调罩 + 受电弓。
 *  来源 https://www.railpictures.net/viewphoto.php?id=850800&showexif=1
 *       https://commons.wikimedia.org/wiki/Category:China_Railway_CRH380BG
 *       https://commons.wikimedia.org/w/index.php?title=Category:Electric_multiple_units_of_China_Railway_Harbin_Group
 *  实车照片（下关站 CRH380BG-5717 侧视）：
 *       http://www.xiaguanzhan.com/xz/uploadfiles/CRH380BG-5717.jpg
 * ----------------------------------------------------------------------------
 * 第 5 轮 · CR200J3-C「AD钙」（前脸 + 侧面照片核对）
 *  - 2022 年后新涂装：中国白 / 长城灰车身 + 国槐绿宽盲窗带与前脸 + 窗带下方
 *    中国红双细线（头车扬起两道弧）+ 石墨灰车顶与风挡 + 金色路徽与「复兴号」
 *    + 白色 CR 标识。四主色：中国红 / 中国白 / 长城灰 / 国槐绿。
 *  - 前脸为饱满的鼓形圆钝面：上半石墨灰风挡罩（大曲面黑玻璃、可见雨刷），
 *    下半国槐绿面罩中央有一道白色 V 形箭，绿色面上是金色圆形路徽；两侧各
 *    一组上扬的双联 LED 头灯；底部白色保险杠与排障器。
 *  - 1M8T 短编 = 1 动力车 + 7 拖车 + 1 控制车；车体宽 3.36 m、高 4.43 m，
 *    拖车轮径 880 mm。窗带上的车窗为独立矩形（带浅色窗框）。
 *  来源 https://news.cnr.cn/local/dftj/20250627/t20250627_527231922.shtml
 *       https://www.sxrtv.com/webs/hotnews/content_206995.shtml
 *       https://www.toutiao.com/article/7574664124932637193
 *       https://www.china-emu.cn/Trains/Model/Detail-10111-101-58.html
 *       https://baike.baidu.com/item/%E5%A4%8D%E5%85%B4%E5%8F%B7CR200J%E5%9E%8B%E7%94%B5%E5%8A%9B%E5%8A%A8%E8%BD%A6%E7%BB%84/23722145
 *  实车照片（央广网 2025-06-27 图集，ad1 前脸 / ad3 侧面）：
 *       https://mediabluk.cnr.cn/img/cnr/CNRCDP/2025/0627/3e9d8b06c2db6175099888693092049511.jpg
 * ----------------------------------------------------------------------------
 * 车门几何口径：与 src/journey/core.js createTrainSpec 的 doorZ 一致 ——
 *   doorZ = [front+2.2, front+len-2.2]；本文件 DOOR_INSET=2.2，中间/拖车两门
 *   = [-half+2.2, half-2.2]，头/动力/控制车前端门内收到鼻锥之后（司机登乘门）。
 *   passengers.js 取两门中点作乘降目标，故与客流/停站数据同源，不另造一套。
 * ============================================================================
 */

const TEX_W = 3072;
const TEX_H = 768;
const V_SHOULDER = 0.13;
const V_SILL = 0.44;
const PX_SHOULDER = V_SHOULDER * TEX_H;
const PX_SILL = V_SILL * TEX_H;
const DOOR_INSET = 2.2;

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
const strut = (from, to, r, seg = 4) => {
  const dir = new THREE.Vector3().subVectors(to, from);
  const g = new THREE.CylinderGeometry(r, r, dir.length(), seg);
  g.translate(0, dir.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  g.translate(from.x, from.y, from.z);
  return g;
};

/** 顶点色上色：同一材质内给轮对 / 绝缘子 / 风挡褶皱等分出材质层次，不增加 draw call。 */
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
    return { sx: 0.4 + 0.6 * Math.pow(a, 0.6), topY: 1.72 + (d.roofY - 1.72) * Math.pow(a, 1.22), botY: 0.78 + 0.2 * t };
  },
  // 低伏修长的海豚型，前窗倾角大，鼻尖是明显的圆形车钩罩。
  crh380b: (t, d) => {
    const a = Math.sin((t * Math.PI) / 2);
    return { sx: 0.46 + 0.54 * Math.pow(a, 0.55), topY: 1.42 + (d.roofY - 1.42) * Math.pow(a, 0.82), botY: 0.84 + 0.16 * t };
  },
  // 动力集中鼓形车体：短而饱满的斜面司机室，前脸接近竖直。
  cr200j: (t, d) => {
    const a = Math.sin((t * Math.PI) / 2);
    return { sx: 0.66 + 0.34 * Math.pow(a, 0.7), topY: 2.2 + (d.roofY - 2.2) * Math.pow(a, 1.05), botY: 0.9 + 0.34 * t };
  },
};

const spread = (z0, n, step) => Array.from({ length: n }, (_, i) => z0 + i * step);

function layout(kind, length, fam) {
  const half = length / 2;
  const isNose = kind !== 'mid' && kind !== 'trailer';
  if (fam === 'crh5') {
    return isNose
      ? {
        windows: spread(-half + 8.4, 9, 1.72), winW: 1.02, winY0: 2.18, winY1: 2.92,
        doors: [-half + DIM.crh5.noseLength + 1.0, half - DOOR_INSET],
        doorKinds: ['crew', 'passenger'],
        cab: [[-half + 1.75, 2.62], [-half + 4.5, 2.4], [-half + 4.5, 3.12], [-half + 2.35, 3.16]],
      }
      : {
        windows: spread(-8.7, 11, 1.72), winW: 1.02, winY0: 2.18, winY1: 2.92,
        doors: [-half + DOOR_INSET, half - DOOR_INSET], doorKinds: ['passenger', 'passenger'], cab: null,
      };
  }
  if (fam === 'crh380b') {
    return isNose
      ? {
        windows: spread(-half + 13.2, 7, 1.55), winW: 1.16, winY0: 2.3, winY1: 3.02,
        doors: [-half + DIM.crh380b.noseLength + 1.0, half - DOOR_INSET],
        doorKinds: ['crew', 'passenger'],
        cab: [[-half + 2.1, 2.72], [-half + 6.8, 2.46], [-half + 6.8, 3.3], [-half + 3.1, 3.36]],
      }
      : {
        windows: spread(-8.5, 12, 1.5), winW: 1.16, winY0: 2.3, winY1: 3.02,
        doors: [-half + DOOR_INSET, half - DOOR_INSET], doorKinds: ['passenger', 'passenger'], cab: null,
      };
  }
  // cr200j
  if (kind === 'power') {
    return {
      windows: spread(-half + 6.2, 6, 1.8), winW: 1.12, winY0: 2.3, winY1: 2.94,
      doors: [-half + DIM.cr200j.noseLength + 1.2, half - DOOR_INSET],
      doorKinds: ['crew', 'passenger'],
      cab: [[-half + 1.5, 3.02], [-half + 3.1, 2.94], [-half + 3.1, 3.48], [-half + 1.8, 3.52]],
    };
  }
  if (kind === 'control') {
    return {
      windows: spread(-half + 6.6, 9, 1.8), winW: 1.12, winY0: 2.3, winY1: 2.94,
      doors: [-half + DIM.cr200j.noseLength + 1.2, half - DOOR_INSET],
      doorKinds: ['crew', 'passenger'],
      cab: [[-half + 1.5, 3.02], [-half + 3.1, 2.94], [-half + 3.1, 3.48], [-half + 1.8, 3.52]],
    };
  }
  return {
    windows: spread(-8.6, 11, 1.72), winW: 1.12, winY0: 2.3, winY1: 2.94,
    doors: [-half + DOOR_INSET, half - DOOR_INSET], doorKinds: ['passenger', 'passenger'], cab: null,
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
    gold: '#d8a72c', skirt: 0x9aa3ac, bogie: 0x252a30, roof: 0xc8cfd6, panto: 0x9aa2aa,
    bellows: 0x3b4148, nose: 0xe9edf1,
  },
  crh380b: {
    blue: '#173a86', blueLight: '#3b6cc0', ink: '#0b1017', body: '#f7f9fb',
    gold: '#c9a227', skirt: 0x929ba4, bogie: 0x24282e, roof: 0xc3cbd3, panto: 0x9aa2aa,
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
  return { ctx, key, base, kind, length, variant, label, d, P, L, isNose, yPx, uPx, pxPerM, noseEnd };
}

function whiteBase(E, tint = '#f4f7fa') {
  const { ctx } = E;
  // 渐变范围必须是整张 TEX_H：色标 0.13/0.44 才能对应 v 的肩部/侧墙下缘，
  // 否则侧墙会被钳到最后一个色标而整体发暗。
  const g = ctx.createLinearGradient(0, 0, 0, TEX_H);
  g.addColorStop(0, '#7f8992');
  g.addColorStop(0.06, '#b9c2ca');
  g.addColorStop(0.13, tint);
  g.addColorStop(0.2, '#ffffff');
  g.addColorStop(0.31, '#f7fafc');
  g.addColorStop(0.44, '#d7dee4');
  g.addColorStop(0.5, '#aeb7be');
  g.addColorStop(1, '#aeb7be');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, TEX_W, TEX_H);
  // 程序化金属/烤漆细纹，消除塑料平板感
  ctx.save();
  for (let x = 0; x < TEX_W; x += 7) {
    ctx.globalAlpha = x % 21 === 0 ? 0.05 : 0.024;
    ctx.fillStyle = x % 14 === 0 ? '#ffffff' : '#38424a';
    ctx.fillRect(x, 0, 1, TEX_H / 2);
  }
  ctx.restore();
  // 肩部高光
  const h = ctx.createLinearGradient(0, E.yPx(E.d.shoulderY + 0.16), 0, E.yPx(E.d.shoulderY - 0.12));
  h.addColorStop(0, 'rgba(255,255,255,0)');
  h.addColorStop(0.5, 'rgba(255,255,255,.3)');
  h.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = h;
  ctx.fillRect(0, E.yPx(E.d.shoulderY + 0.16), TEX_W, E.yPx(E.d.shoulderY - 0.12) - E.yPx(E.d.shoulderY + 0.16));
}

function panelSeams(E) {
  const { ctx, length, uPx, yPx, noseEnd, d } = E;
  // 水平腰带（窗上、窗下、裙板上沿）
  for (const yy of [yPx(d.shoulderY + 0.06), yPx(3.2), yPx(2.0), yPx(d.vLow + 0.06)]) {
    ctx.fillStyle = 'rgba(255,255,255,.3)';
    ctx.fillRect(0, yy, TEX_W, 2);
    ctx.fillStyle = 'rgba(40,54,66,.16)';
    ctx.fillRect(0, yy + 2, TEX_W, 2);
  }
  // 竖向板缝 + 铆点
  for (let z = -length / 2 + 2.2; z < length / 2 - 1; z += 2.6) {
    const x = uPx(z);
    if (x < noseEnd) continue;
    ctx.fillStyle = 'rgba(60,76,92,.14)';
    ctx.fillRect(x, PX_SHOULDER + 6, 2, PX_SILL - PX_SHOULDER - 10);
    ctx.fillStyle = 'rgba(255,255,255,.24)';
    ctx.fillRect(x + 2, PX_SHOULDER + 6, 1.5, PX_SILL - PX_SHOULDER - 10);
    for (const yy of [yPx(d.shoulderY - 0.02), yPx(d.vLow + 0.1)]) {
      ctx.fillStyle = 'rgba(60,72,84,.3)';
      ctx.beginPath(); ctx.arc(x + 1, yy, 1.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  void d;
}

/** 车底下缘：裙板分块 + 通风格栅横格 + 车底阴影。 */
function lowerBody(E) {
  const { ctx, isNose, length, uPx, noseEnd, d } = E;
  const yTop = E.yPx(d.vLow + 0.08);
  ctx.fillStyle = 'rgba(28,36,44,.5)';
  ctx.fillRect(0, yTop, TEX_W, 6);
  for (let z = -length / 2 + 0.6; z < length / 2 - 0.6; z += 1.62) {
    const x = uPx(z);
    if (isNose && x < noseEnd) continue;
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(x, yTop + 8, 2, 26);
    ctx.fillStyle = 'rgba(20,28,36,.28)';
    for (let k = 0; k < 3; k += 1) ctx.fillRect(x + 6, yTop + 12 + k * 8, 62, 4);
    ctx.fillStyle = 'rgba(205,215,223,.24)';
    ctx.fillRect(x + 6, yTop + 10, 62, 1.5);
  }
  const bg = ctx.createLinearGradient(0, yTop + 34, 0, TEX_H / 2);
  bg.addColorStop(0, 'rgba(20,28,36,0)');
  bg.addColorStop(1, 'rgba(12,18,24,.7)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, yTop + 34, TEX_W, TEX_H / 2 - yTop - 34);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** 逐扇车窗：深色渐变玻璃 + 斜向反光 + 亮窗框（独立小窗与通长窗带共用）。 */
function paintWindows(E, glassTop, glassBot) {
  const { ctx, P, L, yPx, uPx } = E;
  for (const z of L.windows) {
    const x = uPx(z - L.winW / 2);
    const w = uPx(z + L.winW / 2) - x;
    const y0 = yPx(L.winY0), y1 = yPx(L.winY1);
    const gg = ctx.createLinearGradient(0, y1, 0, y0);
    gg.addColorStop(0, glassTop);
    gg.addColorStop(1, glassBot);
    roundRect(ctx, x, y1, w, y0 - y1, 8);
    ctx.fillStyle = gg;
    ctx.fill();
    // 斜向反光
    ctx.save();
    roundRect(ctx, x, y1, w, y0 - y1, 8);
    ctx.clip();
    const rg = ctx.createLinearGradient(x, y1, x + w, y0);
    rg.addColorStop(0, 'rgba(190,214,236,0)');
    rg.addColorStop(0.45, 'rgba(190,214,236,.18)');
    rg.addColorStop(0.55, 'rgba(190,214,236,.18)');
    rg.addColorStop(0.7, 'rgba(190,214,236,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(x, y1, w, y0 - y1);
    ctx.restore();
    // 框 + 下沿亮线
    ctx.strokeStyle = 'rgba(20,30,40,.8)';
    ctx.lineWidth = 4;
    roundRect(ctx, x - 1, y1 - 1, w + 2, y0 - y1 + 2, 9);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(198,210,220,.8)';
    ctx.lineWidth = 2.5;
    roundRect(ctx, x, y1, w, y0 - y1, 8);
    ctx.stroke();
    ctx.fillStyle = 'rgba(225,235,242,.4)';
    ctx.fillRect(x + 3, y0 - 3, w - 6, 2);
  }
  void P;
}

/** 车门：门框、双扇中缝、门玻璃、把手、踏板（含黄色安全边）、车门标识。 */
function paintDoors(E, bandTop) {
  const { ctx, L, yPx, uPx, d } = E;
  for (let k = 0; k < L.doors.length; k += 1) {
    const z = L.doors[k];
    const crew = L.doorKinds[k] === 'crew';
    const dw = crew ? 0.6 : 0.72;
    const x0 = uPx(z - dw), x1 = uPx(z + dw);
    const w = x1 - x0;
    const yT = yPx(3.12), yB = yPx(d.vLow + 0.04);
    ctx.fillStyle = 'rgba(20,28,36,.4)';
    ctx.fillRect(x0 - 3, yT - 2, w + 6, yB - yT + 6);
    const dg = ctx.createLinearGradient(x0, 0, x1, 0);
    dg.addColorStop(0, '#c2cbd2');
    dg.addColorStop(0.5, '#dde5ea');
    dg.addColorStop(1, '#b0bac2');
    ctx.fillStyle = dg;
    ctx.fillRect(x0, yT, w, yB - yT);
    ctx.strokeStyle = 'rgba(40,52,64,.85)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x0, yT, w, yB - yT);
    ctx.strokeStyle = 'rgba(255,255,255,.8)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0 + 3, yT + 3, w - 6, yB - yT - 6);
    const mx = (x0 + x1) / 2;
    ctx.fillStyle = 'rgba(28,38,48,.72)';
    ctx.fillRect(mx - 1.5, yT + 3, 3, yB - yT - 6);
    // 门玻璃
    const gx0 = crew ? x0 + 8 : x0 + 14, gx1 = crew ? x1 - 8 : x1 - 14;
    const gy0 = yPx(2.96), gy1 = yPx(2.4);
    const wg = ctx.createLinearGradient(0, gy0, 0, gy1);
    wg.addColorStop(0, '#1a2833');
    wg.addColorStop(1, '#070c11');
    ctx.fillStyle = wg;
    roundRect(ctx, gx0, gy0, gx1 - gx0, gy1 - gy0, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(198,210,220,.75)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 把手 + 按钮
    ctx.fillStyle = '#3a444d';
    ctx.fillRect(mx + 6, yPx(2.5), 5, yPx(2.05) - yPx(2.5));
    ctx.fillStyle = '#d8b23c';
    ctx.beginPath(); ctx.arc(mx - 11, yPx(2.18), 3, 0, Math.PI * 2); ctx.fill();
    // 踏板
    ctx.fillStyle = 'rgba(30,40,50,.5)';
    ctx.fillRect(x0 - 4, yB, w + 8, 8);
    ctx.fillStyle = '#8f99a1';
    ctx.fillRect(x0, yB + 1, w, 11);
    ctx.fillStyle = '#e0b43a';
    ctx.fillRect(x0, yB + 1, w, 3);
    // 车门标识块
    ctx.fillStyle = '#d8a72c';
    ctx.fillRect(x1 - 22, yT + 8, 14, 14);
    ctx.fillStyle = '#20262c';
    ctx.font = '700 10px "Segoe UI",sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(k + 1), x1 - 19, yT + 15);
  }
  void bandTop;
}

/** CRH5A / CRH5G：白底、粗蓝腰线（车头上扬收尖）、独立圆角小窗、两处端门、
 *  叶形司机室侧窗、圆形车钩整流罩轮廓、驴耳朵斜灯组、雨刷与 CRH 标识。 */
function paintCRH5(E) {
  const { ctx, P, L, yPx, uPx, length, isNose, noseEnd, key } = E;
  whiteBase(E, '#f5f8fa');
  panelSeams(E);

  // 蓝色腰线：窗台下方，车头段上扬并收尖（实车照片里蓝线在鼻侧收成箭头）
  const yy = yPx(2.02);
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (isNose) {
    ctx.moveTo(0, yPx(2.46));
    ctx.quadraticCurveTo(noseEnd * 0.5, yPx(2.2), noseEnd * 1.15, yy);
    ctx.lineTo(TEX_W, yy);
  } else {
    ctx.moveTo(0, yy);
    ctx.lineTo(TEX_W, yy);
  }
  ctx.strokeStyle = P.blue;
  ctx.lineWidth = 13;
  ctx.stroke();
  ctx.strokeStyle = P.blueLight;
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  paintWindows(E, '#22384c', '#080d12');
  paintDoors(E, yPx(3.16));

  if (isNose) {
    const half = length / 2;
    // 前风挡黑区：沿鼻锥上缘渐窄，带竖向反光渐变
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
    cg.addColorStop(1, '#26333d');
    ctx.fillStyle = cg;
    ctx.fill();
    // 风挡反光 + 雨刷
    ctx.save();
    ctx.clip();
    const rg = ctx.createLinearGradient(0, 0, noseEnd, yPx(2.4));
    rg.addColorStop(0, 'rgba(150,180,210,0)');
    rg.addColorStop(0.45, 'rgba(150,180,210,.15)');
    rg.addColorStop(0.6, 'rgba(150,180,210,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, noseEnd, TEX_H / 2);
    ctx.strokeStyle = 'rgba(18,24,30,.85)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(noseEnd * 0.12, yPx(2.1)); ctx.lineTo(noseEnd * 0.34, yPx(2.85));
    ctx.moveTo(noseEnd * 0.32, yPx(2.05)); ctx.lineTo(noseEnd * 0.52, yPx(2.72));
    ctx.stroke();
    ctx.restore();
    // 风挡下缘银白饰条
    ctx.beginPath();
    ctx.moveTo(edge[0][0], edge[0][1]);
    for (let i = 1; i < edge.length; i += 1) ctx.lineTo(edge[i][0], edge[i][1]);
    ctx.strokeStyle = 'rgba(226,233,239,.9)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // 叶形司机室侧窗 + 竖梃
    ctx.beginPath();
    ctx.moveTo(uPx(L.cab[0][0]), yPx(L.cab[0][1]));
    for (let i = 1; i < L.cab.length; i += 1) ctx.lineTo(uPx(L.cab[i][0]), yPx(L.cab[i][1]));
    ctx.closePath();
    ctx.fillStyle = '#0a1016';
    ctx.fill();
    ctx.strokeStyle = 'rgba(210,220,230,.8)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(170,184,196,.5)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const cm = (L.cab[0][0] + L.cab[1][0]) / 2;
    ctx.moveTo(uPx(cm), yPx(2.55)); ctx.lineTo(uPx(cm + 0.1), yPx(3.02));
    ctx.stroke();

    // 「驴耳朵」上斜杏仁形头灯组（暗腔 + 反光片 + 下缘红色标志灯）
    for (const s of [-1, 1]) {
      const x = uPx(-half + 1.35);
      const y = yPx(1.78) + s * 0;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.42);
      ctx.fillStyle = '#101720';
      ctx.beginPath(); ctx.roundRect(-58, -13, 116, 26, 12); ctx.fill();
      ctx.fillStyle = 'rgba(150,172,192,.4)';
      ctx.beginPath(); ctx.roundRect(-50, -8, 100, 8, 4); ctx.fill();
      ctx.fillStyle = '#7a1a1e';
      ctx.beginPath(); ctx.roundRect(28, 6, 22, 6, 3); ctx.fill();
      ctx.restore();
    }
    // 鼻尖大圆形车钩整流罩轮廓（CRH5 的辨识特征）+ 排障器阴影
    ctx.strokeStyle = 'rgba(70,84,96,.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(uPx(-half + 0.95), yPx(1.42), uPx(-half + 2.1) - uPx(-half + 0.95), 34, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(70,82,94,.45)';
    ctx.fillRect(0, yPx(1.12), uPx(-half + 2.3), yPx(0.98) - yPx(1.12));
  }

  // 高寒型的设备舱做了密封，裙板上方压一条浅灰密封带（唯一外观差异）
  if (key === 'crh5g') {
    ctx.fillStyle = 'rgba(122,136,150,.3)';
    ctx.fillRect(noseEnd, yPx(1.36), TEX_W - noseEnd, 7);
  }
  lowerBody(E);
  void E.label; void E.variant;
}

/** CRH380BG：白底 + 通长黑窗带（带银色窗间柱）+ 蓝色细腰线与车头 V 形箭头上扬、
 *  门上椭圆窗、鼻尖圆形车钩罩、观光区大块黑窗。 */
function paintCRH380B(E) {
  const { ctx, P, L, yPx, uPx, length, isNose, noseEnd } = E;
  whiteBase(E, '#f8fafb');
  panelSeams(E);

  const bandTop = yPx(3.14), bandBot = yPx(2.1);
  ctx.fillStyle = P.ink;
  ctx.fillRect(noseEnd * 0.55, bandTop, TEX_W - noseEnd * 0.55, bandBot - bandTop);
  ctx.fillStyle = 'rgba(255,255,255,.09)';
  ctx.fillRect(noseEnd * 0.55, bandTop, TEX_W - noseEnd * 0.55, 3);
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(noseEnd * 0.55, bandBot - 4, TEX_W - noseEnd * 0.55, 4);

  // 窗带内逐扇窗（渐变玻璃 + 反光 + 亮框 + 银色窗间柱）
  paintWindows(E, '#1e2c3a', '#060a0e');
  const sorted = L.windows.slice().sort((a, b) => a - b);
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const mid = (sorted[i] + sorted[i + 1]) / 2;
    const x = uPx(mid);
    const pw = uPx(sorted[i + 1] - L.winW / 2) - uPx(sorted[i] + L.winW / 2);
    if (pw < 4) continue;
    const pg = ctx.createLinearGradient(x - pw / 2, 0, x + pw / 2, 0);
    pg.addColorStop(0, 'rgba(150,162,172,.5)');
    pg.addColorStop(0.5, 'rgba(212,222,230,.82)');
    pg.addColorStop(1, 'rgba(120,132,142,.5)');
    ctx.fillStyle = pg;
    ctx.fillRect(x - pw / 2, bandTop + 2, pw, bandBot - bandTop - 4);
  }

  // 端门 + 门上椭圆窗
  for (const z of L.doors) {
    const x0 = uPx(z - 0.72), x1 = uPx(z + 0.72);
    ctx.strokeStyle = 'rgba(60,76,92,.85)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x0, bandTop + 3, x1 - x0, yPx(1.08) - bandTop - 3);
    ctx.fillStyle = 'rgba(28,38,48,.7)';
    ctx.fillRect((x0 + x1) / 2 - 1.5, bandTop + 3, 3, yPx(1.08) - bandTop - 6);
    ctx.beginPath();
    ctx.ellipse(uPx(z), yPx(2.66), (x1 - x0) * 0.3, yPx(2.42) - yPx(2.92), 0, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0f14';
    ctx.fill();
    ctx.strokeStyle = 'rgba(198,210,220,.7)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // 踏板
    ctx.fillStyle = '#8f99a1';
    ctx.fillRect(x0, yPx(1.08), x1 - x0, 8);
    ctx.fillStyle = '#e0b43a';
    ctx.fillRect(x0, yPx(1.08), x1 - x0, 2.5);
  }

  // 深蓝细腰线（窗带下缘）+ 亮蓝细线 + 白高光
  const yy = yPx(2.03);
  ctx.beginPath();
  ctx.moveTo(noseEnd * 0.35, yy);
  ctx.lineTo(TEX_W, yy);
  ctx.strokeStyle = 'rgba(20,32,60,.45)';
  ctx.lineWidth = 16;
  ctx.stroke();
  ctx.strokeStyle = P.blue;
  ctx.lineWidth = 11;
  ctx.stroke();
  ctx.strokeStyle = P.blueLight;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.3)';
  ctx.lineWidth = 1.5;
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
    // 车头蓝色箭形：腰线在鼻锥后方分叉成上下两支的 V 形箭头
    const uJ = uPx(-half + 6.4);
    const yJ = yPx(2.03);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = P.blue;
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.moveTo(uJ, yJ);
    ctx.lineTo(uPx(-half + 0.7), yPx(2.92));
    ctx.moveTo(uJ, yJ);
    ctx.lineTo(uPx(-half + 4.5), yPx(1.62));
    ctx.stroke();
    ctx.strokeStyle = P.blueLight;
    ctx.lineWidth = 3.5;
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
    // 鼻尖圆形车钩罩的浅色阴影 + 轮廓
    ctx.fillStyle = 'rgba(150,164,178,.35)';
    ctx.fillRect(0, yPx(1.2), uPx(-half + 1.6), yPx(0.96) - yPx(1.2));
    ctx.strokeStyle = 'rgba(80,94,108,.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(uPx(-half + 0.75), yPx(1.18), uPx(-half + 1.5) - uPx(-half + 0.75), 16, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  lowerBody(E);
}

/** CR200J3-C："AD钙"白/银车身 + 国槐绿宽盲窗带 + 红色双细线与头车上扬双弧、
 *  石墨灰风挡、绿色前脸白色 V 箭、金色路徽、双联斜置头灯。 */
function paintCR200J(E) {
  const { ctx, P, L, yPx, uPx, length, isNose, noseEnd } = E;
  whiteBase(E, '#eef1f2');

  // 国槐绿盲窗带（比旧版更宽）
  const gTop = yPx(3.06), gBot = yPx(1.94);
  const gg = ctx.createLinearGradient(0, gTop, 0, gBot);
  gg.addColorStop(0, P.greenDark);
  gg.addColorStop(0.32, P.green);
  gg.addColorStop(1, '#164a30');
  ctx.fillStyle = gg;
  ctx.fillRect(0, gTop, TEX_W, gBot - gTop);
  ctx.fillStyle = 'rgba(255,255,255,.13)';
  ctx.fillRect(0, gTop, TEX_W, 3);
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.fillRect(0, gBot - 4, TEX_W, 4);

  // 独立车窗（绿带上的深色矩形窗 + 浅色窗框 + 反光）
  paintWindows(E, '#16241d', '#060d09');
  paintDoors(E, gTop);

  // 红色双细线：贯穿全列；头车从腰线分出两道平行上扬的弧
  const half = length / 2;
  const uJ = isNose ? uPx(-half + 9.4) : 0;
  const redY = [yPx(1.88), yPx(1.76)];
  for (const y of redY) {
    ctx.beginPath();
    ctx.moveTo(uJ, y);
    ctx.lineTo(TEX_W, y);
    ctx.strokeStyle = P.red;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(uJ, y - 2.5); ctx.lineTo(TEX_W, y - 2.5);
    ctx.stroke();
  }
  // 金细线紧贴红双线下方
  ctx.beginPath();
  ctx.moveTo(uJ, yPx(1.66));
  ctx.lineTo(TEX_W, yPx(1.66));
  ctx.strokeStyle = P.gold;
  ctx.lineWidth = 2.5;
  ctx.stroke();

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
    // 车顶石墨灰风挡罩：下缘曲线，带玻璃反光与雨刷
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(noseEnd * 0.92, 0);
    ctx.bezierCurveTo(noseEnd * 0.9, yPx(3.5), noseEnd * 0.5, yPx(3.28), 0, yPx(2.92));
    ctx.closePath();
    const cg = ctx.createLinearGradient(0, 0, 0, yPx(2.9));
    cg.addColorStop(0, '#161c21');
    cg.addColorStop(0.6, '#28323a');
    cg.addColorStop(1, '#3c474f');
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.save();
    ctx.clip();
    const rg = ctx.createLinearGradient(0, 0, noseEnd, yPx(2.9));
    rg.addColorStop(0, 'rgba(150,180,210,0)');
    rg.addColorStop(0.45, 'rgba(150,180,210,.14)');
    rg.addColorStop(0.62, 'rgba(150,180,210,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, noseEnd, TEX_H / 2);
    ctx.strokeStyle = 'rgba(16,22,26,.85)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(noseEnd * 0.14, yPx(2.1)); ctx.lineTo(noseEnd * 0.4, yPx(2.9));
    ctx.moveTo(noseEnd * 0.38, yPx(2.05)); ctx.lineTo(noseEnd * 0.6, yPx(2.78));
    ctx.stroke();
    ctx.restore();
    // 绿色前脸：边界走两段贝塞尔，下方留白色保险杠
    ctx.beginPath();
    ctx.moveTo(0, yPx(2.88));
    ctx.bezierCurveTo(noseEnd * 0.55, yPx(3.02), noseEnd * 1.05, yPx(2.7), noseEnd * 1.18, yPx(1.72));
    ctx.bezierCurveTo(noseEnd * 1.2, yPx(1.4), noseEnd * 0.9, yPx(1.28), 0, yPx(1.3));
    ctx.closePath();
    const fg = ctx.createLinearGradient(0, yPx(2.88), 0, yPx(1.3));
    fg.addColorStop(0, '#28734a');
    fg.addColorStop(1, P.greenDark);
    ctx.fillStyle = fg;
    ctx.fill();
    // 白色 V 形箭（实车前脸中央的白色折线）
    ctx.strokeStyle = 'rgba(240,244,240,.92)';
    ctx.lineWidth = 12;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(uPx(-half + 0.5), yPx(1.5));
    ctx.lineTo(uPx(-half + 2.4), yPx(2.1));
    ctx.lineTo(uPx(-half + 4.3), yPx(1.5));
    ctx.stroke();
    // 金色中国铁路路徽（示意：圆环 + 横向与"人"字笔划）
    ctx.save();
    ctx.translate(uPx(-half + 1.15), yPx(2.16));
    ctx.strokeStyle = P.gold;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-22, 5); ctx.lineTo(22, 5);
    ctx.moveTo(0, -18); ctx.lineTo(-13, 5);
    ctx.moveTo(0, -18); ctx.lineTo(13, 5);
    ctx.stroke();
    ctx.restore();
    // 司机室侧窗
    ctx.beginPath();
    ctx.moveTo(uPx(L.cab[0][0]), yPx(L.cab[0][1]));
    for (let i = 1; i < L.cab.length; i += 1) ctx.lineTo(uPx(L.cab[i][0]), yPx(L.cab[i][1]));
    ctx.closePath();
    ctx.fillStyle = '#0b1215';
    ctx.fill();
    ctx.strokeStyle = 'rgba(210,220,214,.7)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // 双联斜置 LED 头灯腔（每侧两枚）
    for (const k of [0, 1]) {
      const x = uPx(-half + 0.6) + k * 34;
      const y = yPx(2.42) - k * 10;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.5);
      ctx.fillStyle = '#0d1518';
      ctx.beginPath(); ctx.roundRect(-16, -22, 32, 44, 12); ctx.fill();
      ctx.fillStyle = 'rgba(200,224,238,.45)';
      ctx.beginPath(); ctx.roundRect(-10, -16, 20, 12, 6); ctx.fill();
      ctx.restore();
    }
  }
  // 车体下缘的墨绿裙板
  ctx.fillStyle = 'rgba(24,72,47,.9)';
  ctx.fillRect(0, yPx(1.32), TEX_W, yPx(1.1) - yPx(1.32));
  lowerBody(E);
}

const PAINT = { crh5: paintCRH5, crh5g: paintCRH5, crh380b: paintCRH380B, cr200j: paintCR200J };

function drawTexts(E) {
  const { ctx, key, base, isNose, length, uPx, yPx, label, variant } = E;
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
  if (base === 'cr200j') {
    text('复兴号', isNose ? -half + 8.6 : -1.4, yPx(3.42), '700 42px "Microsoft YaHei","Segoe UI",sans-serif', '#b08c36');
    text('CR', isNose ? -half + 5.2 : -9.4, yPx(2.22), '800 40px "Segoe UI",sans-serif', '#f1f5f2');
    text(label, isNose ? -half + 12.8 : 4.2, yPx(1.52), '600 21px "Segoe UI",sans-serif', '#5a6460');
    if (!isNose) text(variant ? 'ZE 02' : 'ZE 01', -7.2, yPx(1.52), '600 20px "Segoe UI",sans-serif', '#5a6460');
    return;
  }
  const navy = '#1c3557';
  if (base === 'crh380b') {
    text('和谐号', isNose ? -half + 8.2 : -1.2, yPx(3.46), '700 36px "Microsoft YaHei","Segoe UI",sans-serif', navy);
    // CRH 蓝色飞梭标识（示意）
    text('CRH', isNose ? -half + 5.0 : -8.8, yPx(1.72), '800 36px "Segoe UI",sans-serif', navy);
    text(label, isNose ? -half + 12.4 : -1.0, yPx(1.56), '600 22px "Segoe UI",sans-serif', '#4c5762');
  } else {
    text('和谐号', isNose ? -half + 9.4 : -1.0, yPx(3.44), '700 36px "Microsoft YaHei","Segoe UI",sans-serif', navy);
    text('CRH', isNose ? -half + 5.6 : -9.0, yPx(1.72), '800 42px "Segoe UI",sans-serif', '#16202b');
    text(label, isNose ? -half + 8.0 : 3.6, yPx(1.5), '600 21px "Segoe UI",sans-serif', '#4c5762');
  }
  void key; void E.kind;
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
  const n = 18;
  for (let i = 0; i <= n; i += 1) zs.push(-length / 2 + d.noseLength * Math.pow(i / n, 1.55));
  const start = -length / 2 + d.noseLength;
  for (let i = 1; i <= 5; i += 1) zs.push(start + ((length / 2 - start) * i) / 5);
  return zs;
}

function buildBodyGeometry(kind, length, key, d, ring, ringV) {
  const hasNose = kind !== 'mid' && kind !== 'trailer';
  const zs = hasNose ? noseSections(length, d) : Array.from({ length: 8 }, (_, i) => -length / 2 + (length * i) / 7);
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
  const rows = 14;
  const cols = 13;
  const positions = [];
  const uvs = [];
  const colors = [];
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
      const edge = Math.abs(c - 6) / 6;
      const g = (0.09 + 0.09 * t) * (0.75 + 0.35 * edge);
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

/** 车窗玻璃：四角顶点色做上亮下暗的竖向渐变 + 一侧略亮的斜向反光。 */
function quadZ(z0, z1, y0, y1, x, top, bot) {
  const g = new THREE.BufferGeometry();
  const s = Math.sign(x);
  const v = s > 0 ? [z1, y0, z0, y0, z0, y1, z1, y1] : [z0, y0, z1, y0, z1, y1, z0, y1];
  const pos = [];
  for (let i = 0; i < 4; i += 1) pos.push(x, v[i * 2 + 1], v[i * 2]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([s, 0, 0, s, 0, 0, s, 0, 0, s, 0, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute([
    bot[0] * 0.82, bot[1] * 0.82, bot[2] * 0.82,
    bot[0], bot[1], bot[2],
    top[0], top[1], top[2],
    top[0] * 0.8, top[1] * 0.8, top[2] * 0.8,
  ], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

function buildGlassGeometry(kind, length, key, d, seed) {
  const L = layout(kind, length, key);
  const parts = [];
  let n = seed;
  const jitter = () => {
    n = (n * 1103515245 + 12345) % 2147483648;
    return n / 2147483648;
  };
  for (const side of [-1, 1]) {
    const x = side * (d.halfWidth + 0.015);
    for (const z of L.windows) {
      const r = jitter();
      const top = key === 'cr200j'
        ? [0.09 + r * 0.04, 0.14 + r * 0.05, 0.10 + r * 0.04]
        : [0.10 + r * 0.05, 0.14 + r * 0.05, 0.2 + r * 0.06];
      const bot = [0.022 + r * 0.012, 0.032 + r * 0.014, 0.046 + r * 0.016];
      parts.push(quadZ(z - L.winW / 2, z + L.winW / 2, L.winY0, L.winY1, x, top, bot));
    }
    // 车门玻璃
    for (const z of L.doors) parts.push(quadZ(z - 0.24, z + 0.24, 2.42, 2.94, x, [0.12, 0.16, 0.21], [0.03, 0.045, 0.06]));
    if (L.cab) {
      const g = new THREE.BufferGeometry();
      const pos = [];
      const order = side > 0 ? [0, 1, 2, 3] : [3, 2, 1, 0];
      for (const i of order) pos.push(x, L.cab[i][1], L.cab[i][0]);
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

function buildSkirtGeometry(kind, length, key, d) {
  const half = length / 2;
  const hasNose = kind !== 'mid' && kind !== 'trailer';
  const inset = key === 'cr200j' ? 3.6 : hasNose ? 5.0 : 4.1;
  const bogies = [-(half - inset), half - inset];
  const parts = [];
  const z0 = hasNose ? -half + d.noseLength * 0.85 : -half + 0.35;
  const z1 = half - 0.35;
  parts.push(tint(box(2.5, 0.14, z1 - z0, 0, d.floorY - 0.06, (z0 + z1) / 2), 0x6d767e));
  let cursor = z0;
  const vent = (cz, len) => {
    parts.push(tint(box(d.halfWidth * 1.86, 0.42, len, 0, d.floorY - 0.32, cz + len / 2), 0x939ca4));
    const vents = Math.max(1, Math.floor(len / 2.6));
    for (let i = 0; i < vents; i += 1) {
      const vz = cz + (len * (i + 0.5)) / vents;
      for (const sx of [-1, 1]) parts.push(tint(box(0.06, 0.3, 0.7, sx * d.halfWidth * 0.96, d.floorY - 0.3, vz), 0x2b3138));
    }
  };
  for (const bz of bogies) {
    const a = bz - 1.8;
    const b = bz + 1.8;
    if (a > cursor + 0.2) vent(cursor, a - cursor);
    cursor = b;
  }
  if (z1 > cursor + 0.2) vent(cursor, z1 - cursor);
  if (hasNose) {
    // 排障器 / 车钩罩底座
    parts.push(tint(box(1.9, 0.3, 2.6, 0, d.floorY - 0.22, -half + d.noseLength * 0.5), 0x3a424a));
  }
  return mergeGeometries(parts);
}

/** 转向架：轮对（车轮/轮缘/制动盘/轴箱/减震器）+ 构架 + 牵引电机，不是黑方块。 */
function buildBogieGeometry(kind, length, key, d) {
  const half = length / 2;
  const hasNose = kind !== 'mid' && kind !== 'trailer';
  const inset = key === 'cr200j' ? 3.6 : hasNose ? 5.0 : 4.1;
  const w = d.wheelR;
  const k = w / 0.46;
  const parts = [];
  const FRAME = 0x2a2f35, WHEEL = 0x30353b, RIM = 0x8b949b, DISC = 0x8c4a3a;
  const BOX = 0x3b4249, DAMPER = 0x9aa2aa, MOTOR = 0x2f353b;
  for (const bz of [-(half - inset), half - inset]) {
    for (const sx of [-1, 1]) parts.push(tint(box(0.15, 0.34 * k, 3.0, sx * 1.02, 0.66 * k, bz), FRAME));
    parts.push(tint(box(1.96, 0.22, 0.42, 0, 0.8 * k, bz), FRAME));
    parts.push(tint(box(0.54, 0.26 * k, 0.86, 0.5, 0.5 * k, bz + 0.42), MOTOR));
    for (const dz of [-1.25, 1.25]) {
      parts.push(tint(cyl(0.07, 1.72, 4, 0, w, bz + dz, 'x'), 0x555b62));
      for (const sx of [-1, 1]) {
        parts.push(tint(cyl(w, 0.13, 6, sx * 0.715, w, bz + dz, 'x'), WHEEL));
        parts.push(tint(cyl(w * 1.01, 0.035, 6, sx * 0.735, w, bz + dz, 'x'), RIM));
        parts.push(tint(cyl(w * 0.66, 0.045, 6, sx * 0.9, w, bz + dz, 'x'), DISC));
        parts.push(tint(box(0.24, 0.3 * k, 0.34, sx * 0.94, 0.56 * k, bz + dz), BOX));
      }
      parts.push(tint(strut(
        new THREE.Vector3(1.02, 0.72 * k, bz + dz),
        new THREE.Vector3(0.84, 0.98 * k, bz + dz * 0.55), 0.035, 4), DAMPER));
    }
  }
  return mergeGeometries(parts);
}

function buildRoofGeometry(kind, length, key, d) {
  const hasNose = kind !== 'mid' && kind !== 'trailer';
  const parts = [];
  const z0 = hasNose ? -length / 2 + (key === 'cr200j' ? 3.6 : d.noseLength) : -length / 2 + 0.6;
  const z1 = length / 2 - 0.6;
  const COWL = 0x8b949c, UNIT = 0xa3abb2, GRILLE = 0x414a52, ANT = 0x353b41;
  parts.push(tint(box(2.1, 0.12, z1 - z0, 0, d.roofY + 0.02, (z0 + z1) / 2), COWL));
  const count = Math.max(2, Math.floor((z1 - z0) / 7));
  for (let i = 0; i < count; i += 1) {
    const z = z0 + ((z1 - z0) * (i + 0.5)) / count;
    parts.push(tint(box(1.72, 0.22, 2.6, 0, d.roofY + 0.14, z), UNIT));
    parts.push(tint(box(1.42, 0.05, 2.1, 0, d.roofY + 0.27, z), GRILLE));
    parts.push(tint(box(1.4, 0.02, 0.06, 0, d.roofY + 0.3, z), 0x70787f));
  }
  // 天线 / 高压设备
  const ants = [[-0.9, z0 + 1.4], [0.9, z1 - 1.4]];
  for (const [ax, az] of ants) {
    parts.push(tint(box(0.2, 0.06, 0.2, ax, d.roofY + 0.08, az), ANT));
    parts.push(tint(cyl(0.022, 0.24, 4, ax, d.roofY + 0.22, az), 0x9aa2aa));
  }
  return mergeGeometries(parts);
}

/** 受电弓：底架 + 绝缘子 + 下臂/上臂 + 碳滑板（静态升弓贴 5.36 m 接触线）。 */
function buildPantoGeometry(z, raised, baseY, topY) {
  const parts = [];
  const H = topY - baseY;
  const BASE = 0x6a727a, PORCELAIN = 0x4a3428, ARM = 0xa7afb6, ARM2 = 0x8d959d, STRIP = 0x1c1f22, HORN = 0xb8c0c6;
  for (const x of [-0.62, 0.62]) parts.push(tint(box(0.2, 0.14, 0.9, x, baseY + 0.02, z), BASE));
  for (const dz of [-0.4, 0.4]) parts.push(tint(box(1.6, 0.09, 0.28, 0, baseY + 0.06, z + dz), BASE));
  for (const x of [-0.5, 0.5]) {
    for (const dz of [-0.4, 0.4]) {
      parts.push(tint(cyl(0.11, 0.18, 6, x, baseY + 0.16, z + dz), PORCELAIN));
      parts.push(tint(cyl(0.13, 0.03, 6, x, baseY + 0.26, z + dz), 0x2c2622));
    }
  }
  if (raised) {
    for (const x of [-0.46, 0.46]) {
      parts.push(tint(strut(new THREE.Vector3(x, baseY + 0.32, z + 0.4), new THREE.Vector3(x * 0.72, baseY + H * 0.55, z - 0.34), 0.06), ARM));
      parts.push(tint(strut(new THREE.Vector3(x * 0.72, baseY + H * 0.55, z - 0.34), new THREE.Vector3(x * 0.6, topY - 0.08, z + 0.16), 0.045), ARM2));
      parts.push(tint(strut(new THREE.Vector3(x, baseY + 0.32, z - 0.3), new THREE.Vector3(x * 0.72, baseY + H * 0.5, z - 0.3), 0.028), ARM2));
    }
    parts.push(tint(box(1.9, 0.06, 0.1, 0, topY - 0.04, z + 0.16), HORN));
    parts.push(tint(box(1.9, 0.05, 0.26, 0, topY, z + 0.16), STRIP));
    for (const x of [-0.95, 0.95]) {
      parts.push(tint(strut(new THREE.Vector3(x, topY - 0.02, z + 0.16), new THREE.Vector3(x * 1.12, topY - 0.18, z + 0.16), 0.028, 4), HORN));
    }
  } else {
    for (const x of [-0.46, 0.46]) {
      parts.push(tint(strut(new THREE.Vector3(x, baseY + 0.32, z + 0.4), new THREE.Vector3(x * 0.8, baseY + 0.46, z - 0.5), 0.06), ARM));
      parts.push(tint(strut(new THREE.Vector3(x * 0.8, baseY + 0.46, z - 0.5), new THREE.Vector3(x * 0.7, baseY + 0.36, z + 0.42), 0.045), ARM2));
    }
    parts.push(tint(box(1.9, 0.06, 0.26, 0, baseY + 0.4, z + 0.44), STRIP));
  }
  return mergeGeometries(parts);
}

/** 车头立体件：CRH380B 白色圆形车钩罩、CRH5 扁圆整流罩、CR200J 排障器横梁。 */
function buildNoseDetails(kind, length, key, d) {
  const parts = [];
  if (kind === 'mid' || kind === 'trailer') return parts;
  if (key === 'crh380b') {
    const s = new THREE.SphereGeometry(0.66, 10, 7);
    s.scale(1, 0.92, 0.52);
    s.translate(0, 1.2, -length / 2 + 0.26);
    parts.push(tint(s, 0xeef1f4));
  }
  if (key === 'crh5' || key === 'crh5g') {
    const s = new THREE.SphereGeometry(0.5, 10, 7);
    s.scale(1.5, 0.8, 0.5);
    s.translate(0, 0.94, -length / 2 + 0.36);
    parts.push(tint(s, 0xdde3e8));
  }
  if (key === 'cr200j') {
    parts.push(tint(box(2.2, 0.22, 0.5, 0, 0.92, -length / 2 + 0.3), 0xdfe6e6));
    parts.push(tint(box(1.6, 0.16, 0.34, 0, 0.62, -length / 2 + 0.34), 0x2f363d));
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

/**
 * 金属漆程序化微表面：物体空间哈希给 roughness / normal 加极细微扰动，
 * 避免整车像一块均匀塑料。不占贴图、不增 draw call。
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
      const seal = new THREE.TorusGeometry(0.66, 0.045, 6, 16);
      seal.translate(0, 1.2, -len / 2 + 0.04);
      put(buckets.bogie, tint(seal, 0x23282e), matrix);
    }

    if (pantoCars.includes(i)) {
      const pz = key === 'cr200j' ? -len / 2 + 5.4 : 2.3;
      put(buckets.pantoUp, buildPantoGeometry(pz, true, baseY, topY), matrix);
      put(buckets.pantoDown, buildPantoGeometry(pz, false, baseY, topY), matrix);
    }
    if (i < n - 1) {
      const gz = front + len + gap / 2;
      const h = d.roofY - d.floorY - 0.14;
      // 节间风挡：深色主体 + 明暗相间的褶皱 + 顶板
      put(buckets.bellows, tint(box(d.halfWidth * 1.7, h, gap + 0.14, 0, (d.roofY + d.floorY) / 2, gz), 0x23282e), matrix);
      const folds = 4;
      for (let f = 0; f < folds; f += 1) {
        const fz = gz - gap / 2 + (gap * (f + 0.5)) / folds;
        put(buckets.bellows, tint(box(d.halfWidth * 1.76, h - 0.06, 0.06, 0, (d.roofY + d.floorY) / 2, fz), f % 2 ? 0x424950 : 0x171b20), matrix);
      }
      put(buckets.bellows, tint(box(d.halfWidth * 1.78, 0.08, gap + 0.16, 0, d.roofY - 0.05, gz), 0x2b3138), matrix);
    }
    if (!isNose) midIndex += 1;
    front += len + gap;
  });

  for (const g of geoCache.values()) {
    g.body.dispose(); g.glass.dispose(); g.canopy?.dispose(); g.skirt.dispose(); g.bogie.dispose(); g.roof.dispose();
    for (const p of g.nose) p.dispose();
  }

  const bodyMat = (tex) => metalFinish(new THREE.MeshStandardMaterial({
    map: tex, roughness: 0.34, metalness: 0.34, envMapIntensity: 1.1,
  }));
  const headLen = lengths[0];
  const midLen = lengths.find((_, i) => kinds[i] === 'mid' || kinds[i] === 'trailer') ?? lengths[0];
  const materials = {
    head: bodyMat(liveryTexture(key, kinds[0], headLen, 0, label)),
    midA: bodyMat(liveryTexture(key, 'trailer', midLen, 0, label)),
    midB: bodyMat(liveryTexture(key, 'trailer', midLen, 1, label)),
    glass: new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.14, metalness: 0.2, envMapIntensity: 0.8,
      vertexColors: true, emissive: new THREE.Color(0x1a2a38), emissiveIntensity: 0,
    }),
    canopy: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.22, metalness: 0.2, envMapIntensity: 0.6, vertexColors: true }),
    skirt: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.32, vertexColors: true }),
    bogie: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78, metalness: 0.32, vertexColors: true }),
    roof: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.48, vertexColors: true }),
    panto: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.62, vertexColors: true }),
    bellows: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.12, vertexColors: true }),
    nose: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.3, vertexColors: true }),
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

  // 头灯 / 尾灯：贴在鼻锥两侧（CR200J 双联三角灯组，CRH5/380B 斜置灯带）
  const lampZ = total / 2 - (key === 'cr200j' ? 1.0 : key === 'crh380b' ? 1.4 : 1.1);
  const lampY = key === 'cr200j' ? 2.42 : key === 'crh380b' ? 1.98 : 1.68;
  const sec = sectionAt(-headLen / 2 + (total / 2 - lampZ), headLen, true, key, d);
  const lampLy = sec.botY + ((lampY - d.floorY) / (d.roofY - d.floorY)) * (sec.topY - sec.botY);
  const lampLx = d.halfWidth * sec.sx + 0.03;
  const lampGeos = (sign) => {
    const list = [];
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(key === 'cr200j' ? 0.36 : 0.56, key === 'cr200j' ? 0.32 : 0.17, 0.085);
      g.rotateY(s * (key === 'crh380b' ? 0.7 : 0.55));
      if (key === 'cr200j') g.rotateZ(0.5);
      g.translate(s * lampLx, lampLy, sign * (-lampZ));
      list.push(g);
      // 第二枚（AD钙双联灯）
      if (key === 'cr200j') {
        const m = new THREE.BoxGeometry(0.28, 0.24, 0.07);
        m.rotateY(s * 0.55); m.rotateZ(0.5);
        m.translate(s * lampLx, lampLy - 0.34, sign * (-lampZ + 0.12));
        list.push(m);
      }
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

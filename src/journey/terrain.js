/**
 * 哈尔滨市区粗略底图 + 郊外可循环地形。
 *
 * 【资料来源】方位、河流走向、地表特征依据下列公开资料核实（2026-11-13 联网调研）：
 *  1. 国际在线/黑龙江日报《雪落江湾》（松花江自西南来向东北去、江南/江北、太阳岛、江北湿地）
 *     https://hlj.cri.cn/n/20211210/d7752c32-7a44-e978-2d88-a4f0742a7899.html
 *  2. 百度百科《道外区》（松花江道外段"西南—东北"流向、河宽 400–1000 m、江北太阳岛）
 *     https://baike.baidu.com/item/道外区/11036852
 *  3. 哈尔滨市地图资料《从松花江到百年街区…》（江水把市区切成南北，道里/道外/南岗沿江铺开）
 *     https://www.dituk.com/hangyedongtai/6654.html
 *  4. 呼兰区政府《魅力呼兰》（呼兰区在市区北部、松花江北岸、呼兰河下游）
 *     https://www.hulan.gov.cn/hebhlq/c110644/web_mlhl.shtml
 *  5. 人民日报客户端《呼兰河，是条什么河？》（于呼兰区东南兰河屯一带汇入松花江）
 *     https://www.peopleapp.com/rmharticle/30019571442
 *  6. Wikiwand《太阳岛 (哈尔滨)》（太阳岛 45.7910N / 126.5900E，松花江中的河岛/湿地）
 *     https://www.wikiwand.com/zh/太阳岛_(哈尔滨)
 *  7. 国家林草局《绿进黄沙退…三北工程实践》（黑土地农田防护林"网带片"、格子状林网）
 *     https://www.forestry.gov.cn/c/www/kp/573905.jhtml
 *  8. 央广网《聚焦北大荒｜白雪、黑土、红农机》（薄雪覆稻茬、笔直垄线、黑白交错、残茬暖黄）
 *     https://hlj.cnr.cn/nyst/20261027/t20261027_527854508.shtml
 *
 * 【声明】本文件是「示意级近似」，不是测绘数据：江面/岸线/道路/城区都只是少量控制点的
 * 简化折线/多边形，河宽、面块、路宽都做了示意放大，只保证"西南→东北"走向、江南/江北
 * 分区、各区相对方位、两桥与干道位置大致符合现实。郊外重复地形与经纬度无关，只按
 * CHUNK.ruralPeriod 保证里程一致。几何与贴图全部程序化生成，不使用任何第三方图片素材，
 * 运行时也不 fetch 任何静态资产。
 *
 * 坐标口径沿用 config.js：1 单位 = 1 米，x 向东、z 向南，轨顶 y = 0。
 * 本模块所有几何都压在 y < 0（江面≈-3、地面≈-0.7），不会和轨道穿插。
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { geoToXY, CHUNK, CITY_RADIUS_M } from './config.js';

// ==================================================================== 常量 ==
// 下面是真实经纬度（[lon, lat]），代码里统一通过 geoToXY 转成局部米坐标。
// 全是简化示意折线/多边形，控制点很少，别拿它当导航用。

/**
 * 水系：松花江市区段自「西南 → 东北」（经度递增＝向东，纬度递增＝向北），
 * 呼兰河在市区东北方（下游）、从北岸（左岸）向东南汇入松花江。
 * width 是示意河宽（米），已经放大过，便于低精度下看得出。
 */
export const WATERWAYS = [
  {
    name: '松花江（市区段，西南→东北）',
    kind: 'river',
    width: 700,
    points: [
      [126.44, 45.686], // 西南入境（四方台西南，上游）
      [126.50, 45.716], // 群力北
      [126.548, 45.744],
      [126.587, 45.765], // 松花江公路大桥江心
      [126.612, 45.781], // 斯大林公园 / 防洪纪念塔对岸江心
      [126.624, 45.788], // 滨洲铁路桥（老江桥）
      [126.651, 45.800], // 道外江畔下游
      [126.678, 45.836], // 松浦大桥方向
      [126.700, 45.888],
      [126.716, 45.949], // 呼兰河口汇流处（东北端）
    ],
  },
  {
    name: '呼兰河（下游，市区东北方北岸汇入）',
    kind: 'tributary',
    width: 300,
    points: [
      [126.690, 45.990], // 北/西北上游（呼兰区方向）
      [126.700, 45.972],
      [126.706, 45.960],
      [126.716, 45.949], // 汇入松花江
    ],
  },
];

/** 主要干道 / 跨江桥 / 铁路走廊，同样是简化折线（示意级）。 */
export const ROADS = [
  { name: '友谊路（道里，沿江南岸）', kind: 'arterial', width: 36, points: [[126.590, 45.774], [126.620, 45.774], [126.640, 45.780]] },
  { name: '中山路（南岗→香坊，西北-东南）', kind: 'arterial', width: 44, points: [[126.632, 45.756], [126.655, 45.740], [126.680, 45.726]] },
  { name: '红军街（哈尔滨站前，南北）', kind: 'arterial', width: 30, points: [[126.625, 45.760], [126.628, 45.748]] },
  { name: '红旗大街（道外→香坊，南北）', kind: 'arterial', width: 34, points: [[126.652, 45.786], [126.660, 45.745], [126.672, 45.710]] },
  { name: '大直街 / 学府路（南岗，东西）', kind: 'arterial', width: 30, points: [[126.590, 45.735], [126.650, 45.735]] },
  { name: '松北大道（江北）', kind: 'arterial', width: 40, points: [[126.548, 45.800], [126.560, 45.815], [126.575, 45.828]] },
  { name: '松花江公路大桥（跨江，道里↔松北）', kind: 'bridge', width: 26, points: [[126.587, 45.758], [126.587, 45.792]] },
  { name: '滨洲铁路桥 / 老江桥（跨江，斯大林公园↔太阳岛）', kind: 'bridge', width: 20, points: [[126.624, 45.778], [126.624, 45.800]] },
  { name: '滨洲铁路走廊（过江，示意）', kind: 'rail', width: 56, points: [[126.626, 45.735], [126.625, 45.760], [126.624, 45.788], [126.620, 45.815]] },
];

/** 主要城区面块（简化多边形，不同颜色区分）。太阳岛单列，压低 y 露出江面当江心洲。 */
export const URBAN_ZONES = [
  { name: '道里区（西·江南·铁路西）', color: 0xb9a98c, y: -0.62, poly: [[126.548, 45.786], [126.612, 45.786], [126.614, 45.740], [126.560, 45.730], [126.540, 45.758]] },
  { name: '道外区（东·江南·铁路东）', color: 0xa89b82, y: -0.62, poly: [[126.626, 45.790], [126.672, 45.790], [126.678, 45.748], [126.630, 45.742]] },
  { name: '南岗区（南）', color: 0x9c8f7a, y: -0.62, poly: [[126.590, 45.740], [126.660, 45.740], [126.670, 45.700], [126.600, 45.695]] },
  { name: '香坊区（东南）', color: 0x8f8872, y: -0.62, poly: [[126.665, 45.742], [126.720, 45.740], [126.730, 45.700], [126.672, 45.698]] },
  { name: '松北区（江北·偏西）', color: 0x8a9a7e, y: -0.62, poly: [[126.500, 45.815], [126.590, 45.815], [126.596, 45.792], [126.510, 45.792]] },
  { name: '群力新区（西南·江南）', color: 0x9aa692, y: -0.62, poly: [[126.505, 45.730], [126.548, 45.730], [126.548, 45.700], [126.508, 45.700]] },
  { name: '太阳岛（江北·滨洲桥西·江心洲）', color: 0x7f9884, y: -2.8, poly: [[126.578, 45.788], [126.606, 45.789], [126.614, 45.798], [126.598, 45.804], [126.580, 45.799]] },
];

// ==================================================================== 主题 ==
// 三套主题各自的雪 / 土地 / 水 / 雾色。郊外地表与市区底图共用，applyTheme 时整体换色。
const PALETTES = {
  day: {
    land: 0xc2c9b8, soil: 0x6a5947, snow: 0xf3f7fc, grass: 0x9aa06a,
    stubble: 0xc2a35e, water: 0x6f93b0, ridge: 0x463a2e,
    treeTint: 0xffffff, urbanTint: 0xffffff, haze: 0xcbdce9, shore: 0x5b5344,
  },
  dusk: {
    land: 0x8b8272, soil: 0x4a3c34, snow: 0xdcbfae, grass: 0x7a7752,
    stubble: 0xa8813f, water: 0x53536e, ridge: 0x322820,
    treeTint: 0xbfae9f, urbanTint: 0xcab4a6, haze: 0x7b6f7d, shore: 0x453d38,
  },
  night: {
    land: 0x4a5560, soil: 0x2b3038, snow: 0x8296ad, grass: 0x3f4a46,
    stubble: 0x5f5a54, water: 0x273b58, ridge: 0x1a2028,
    treeTint: 0x8398b2, urbanTint: 0x93a6c0, haze: 0x101d2e, shore: 0x2a3440,
  },
};

/** 兼容三种传法：'day' 字符串、{ id }、config.js 的 THEMES 对象（靠中文 label 认）。 */
function resolvePalette(theme) {
  const byId = (id) => PALETTES[String(id).toLowerCase()] || null;
  if (typeof theme === 'string') return byId(theme) || PALETTES.day;
  if (theme && typeof theme === 'object') {
    if (theme.id && byId(theme.id)) return byId(theme.id);
    const label = String(theme.label || '');
    if (label.includes('暮')) return PALETTES.dusk;
    if (label.includes('夜')) return PALETTES.night;
    if (label.includes('昼') || label.includes('晴')) return PALETTES.day;
  }
  return PALETTES.day;
}

// 走廊/桥梁只是示意条带，颜色贴近地表即可；原先 rail 用近黑 0x4a4640，
// 56 m 宽的带子在近景透视下会变成一条横贯画面的黑色跑道。
const ROAD_COLOR = { arterial: 0x9c9688, bridge: 0x8b8478, rail: 0x8a8576 };
const UP = new THREE.Vector3(0, 1, 0);
// 河槽：江心到 d<RIVER_FLAT 压到最深，FLAT→FLAT+TRANS 是岸坡，之外是平地。
// 河槽过渡带收窄一点：原来 500 m 的深褐湿泥岸坡在画面里会变成一整条突兀黑带
const RIVER_FLAT = 360;
const RIVER_TRANS = 240;
const RIVER_BANK_HALF = 850; // 岸线画在岸顶附近

// ==================================================================== 工具 ==
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** 经纬度数组 → 米坐标数组 {x,z}[]。 */
const toXY = (pts) => pts.map(([lon, lat]) => geoToXY(lon, lat));

/** 点到「一组折线」的最近距离，用来在地面上压出河槽。 */
function minDistToWaterways(px, pz, lines) {
  let best = Infinity;
  for (const pts of lines) {
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz || 1;
      let t = ((px - a.x) * dx + (pz - a.z) * dz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - (a.x + dx * t);
      const ez = pz - (a.z + dz * t);
      const d = ex * ex + ez * ez;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

/** 统一的带顶点色的索引几何，方便 mergeGeometries 合并同类面块。 */
function makeGeom(pos, col, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

/** 折线 → 有宽度的水平条带（水面、道路、铁路都用它），带单一顶点色。 */
function ribbonGeometry(pts, halfW, y, colorHex) {
  const n = pts.length;
  const pos = [];
  const col = [];
  const idx = [];
  const c = new THREE.Color(colorHex);
  for (let i = 0; i < n; i += 1) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const nx = -dz;
    const nz = dx; // 左右法线
    pos.push(pts[i].x + nx * halfW, y, pts[i].z + nz * halfW);
    pos.push(pts[i].x - nx * halfW, y, pts[i].z - nz * halfW);
    col.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  for (let i = 0; i < n - 1; i += 1) {
    const a = 2 * i;
    const b = a + 1;
    const c2 = a + 2;
    const d = a + 3;
    idx.push(a, b, c2, b, d, c2);
  }
  return makeGeom(pos, col, idx);
}

/** 多边形 → 水平面片（城区面块、太阳岛）。用 ShapeUtils 自带三角化，不引第三方。 */
function polygonGeometry(poly, y, colorHex) {
  const contour = poly.map((p) => new THREE.Vector2(p.x, p.z));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const pos = [];
  const col = [];
  const idx = [];
  const c = new THREE.Color(colorHex);
  for (const p of poly) {
    pos.push(p.x, y, p.z);
    col.push(c.r, c.g, c.b);
  }
  for (const f of faces) idx.push(f[0], f[1], f[2]);
  return makeGeom(pos, col, idx);
}

/** 沿江两岸画一条细线当岸线，返回 LineSegments 用的几何。 */
function bankLines(pts, halfW, y) {
  const n = pts.length;
  const left = [];
  const right = [];
  for (let i = 0; i < n; i += 1) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const nx = -dz;
    const nz = dx;
    left.push(new THREE.Vector3(pts[i].x + nx * halfW, y, pts[i].z + nz * halfW));
    right.push(new THREE.Vector3(pts[i].x - nx * halfW, y, pts[i].z - nz * halfW));
  }
  const v = [];
  for (let i = 0; i < n - 1; i += 1) v.push(left[i], left[i + 1], right[i], right[i + 1]);
  return new THREE.BufferGeometry().setFromPoints(v);
}

/** 市区地面：一张大网格，按到水系的距离把江带压成下凹河槽，露出下方 -3 的江面。 */
function baseGroundGeometry() {
  const seg = 120;
  const g = new THREE.PlaneGeometry(2 * CITY_RADIUS_M, 2 * CITY_RADIUS_M, seg, seg);
  g.rotateX(-Math.PI / 2); // 转到 XZ 平面，法线朝 +Y
  const lines = WATERWAYS.map((w) => toXY(w.points));
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const land = new THREE.Color(0xa8b09a); // 平地中性色（真正的主题色靠材质 color 乘）
  // 江面本身由 water 条带表现；河槽底只做轻微下凹和一点点色差，
  // 不再用近黑的湿泥色，否则 60 km 网格会拉出一条突兀的深褐长带。
  const bottom = new THREE.Color(0x939f8b);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const k = smoothstep(RIVER_FLAT, RIVER_FLAT + RIVER_TRANS, minDistToWaterways(x, z, lines));
    pos.setY(i, -3.2 + k * 2.5); // 江内 -3.2，陆地 -0.7
    tmp.copy(bottom).lerp(land, k);
    col[i * 3] = tmp.r;
    col[i * 3 + 1] = tmp.g;
    col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** 程序化田块贴图：灰度垄线 + 斑驳明暗，颜色全靠材质 color 染成黑土。只用 1 张纹理。 */
function fieldTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d');
  const r = rng(9182);
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(0, 0, S, S);
  // 竖条 = 沿 z（列车前进方向）伸展的长垄线
  for (let x = 0; x < S; x += 10) {
    const g = Math.floor(120 + r() * 70);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(x, 0, 5, S);
    ctx.fillStyle = 'rgba(214,212,200,0.28)';
    ctx.fillRect(x + 5, 0, 2, S);
  }
  // 残雪 / 土块的斑驳噪点
  for (let i = 0; i < 300; i += 1) {
    const g = Math.floor(90 + r() * 140);
    ctx.fillStyle = `rgba(${g},${g},${g},0.35)`;
    ctx.fillRect(r() * S, r() * S, 2 + r() * 10, 2 + r() * 10);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** 田块用的水平小面片，uv 放大让每块里垄线密度固定。 */
function fieldQuad() {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 6);
  return g;
}

function patchQuad() {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** 一棵防护林树：树干 + 两层锥形树冠 + 雪顶，顶点色区分，合并成一个几何给 InstancedMesh。 */
function treeGeometry() {
  const parts = [];
  const paint = (g, hex) => {
    const c = new THREE.Color(hex);
    const arr = [];
    for (let i = 0; i < g.attributes.position.count; i += 1) arr.push(c.r, c.g, c.b);
    g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
    return g;
  };
  const trunk = new THREE.CylinderGeometry(0.18, 0.28, 2.0, 5);
  trunk.translate(0, 1.0, 0);
  parts.push(paint(trunk, 0x4a3c30));
  for (const [rad, h, yy] of [[1.7, 3.6, 2.8], [1.15, 2.8, 4.8]]) {
    const cone = new THREE.ConeGeometry(rad, h, 6);
    cone.translate(0, yy, 0);
    parts.push(paint(cone, 0x35503c));
    const cap = new THREE.ConeGeometry(rad * 0.8, h * 0.5, 6);
    cap.translate(0, yy + h * 0.26, 0);
    parts.push(paint(cap, 0xe6eef5));
  }
  return mergeGeometries(parts);
}

// ============================================================ 市区底图 ======
/**
 * 生成市区底图。返回 Group + 它用到的材质（方便 buildTerrain 统一换色 / 释放）。
 * 合并后只有 4 个 draw call：地面基底、面块、水面、岸线。
 */
function makeBaseGroup(palette) {
  const group = new THREE.Group();
  group.name = 'harbin-base';

  const groundMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: palette.urbanTint, fog: true });
  const ground = new THREE.Mesh(baseGroundGeometry(), groundMat);
  ground.name = 'base-ground';
  group.add(ground);

  // 城区面块 + 太阳岛 + 干道 + 桥 + 铁路走廊，全部按顶点色合并成一个 mesh
  const decalParts = [];
  for (const z of URBAN_ZONES) decalParts.push(polygonGeometry(toXY(z.poly), z.y, z.color));
  for (const r of ROADS) decalParts.push(ribbonGeometry(toXY(r.points), r.width / 2, -0.6, ROAD_COLOR[r.kind] || 0x8a8a80));
  const decalGeo = mergeGeometries(decalParts);
  decalParts.forEach((g) => g.dispose());
  const decalMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: palette.urbanTint, side: THREE.DoubleSide, fog: true });
  const decal = new THREE.Mesh(decalGeo, decalMat);
  decal.name = 'base-decals';
  group.add(decal);

  // 松花江 + 呼兰河水面：顶点色画成白色，实际颜色由材质 color（主题水色）决定
  const waterParts = WATERWAYS.map((w) => ribbonGeometry(toXY(w.points), w.width / 2, -3.0, 0xffffff));
  const waterGeo = mergeGeometries(waterParts);
  waterParts.forEach((g) => g.dispose());
  const waterMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: palette.water, side: THREE.DoubleSide, fog: true });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.name = 'base-water';
  group.add(water);

  const shoreMat = new THREE.LineBasicMaterial({ color: palette.shore, fog: true });
  const shore = new THREE.LineSegments(bankLines(toXY(WATERWAYS[0].points), RIVER_BANK_HALF, -0.66), shoreMat);
  shore.name = 'base-shore';
  group.add(shore);

  return { group, materials: { groundMat, decalMat, waterMat, shoreMat } };
}

/** 独立导出：市区粗略真实底图（晴昼配色、静态、不随里程滚动）。调用方负责回收。 */
export function buildHarbinBase() {
  const { group } = makeBaseGroup(PALETTES.day);
  group.userData.dispose = () => {
    group.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
  };
  return group;
}

// ============================================================ 郊外地形 ======
/**
 * 郊外可重复覆盖地形。
 *  - 整块内容挂在 ruralRoot 一个 Object3D 下，scroll() 只改它的 position.z = travel % 400，
 *    和 detail-city.js 一样取模无缝循环，绝不每帧重算实例矩阵。
 *  - 重复元素（田块 / 斑块 / 防护林）全是 InstancedMesh，同材质几何合并。
 *  - 整个模块 draw call ≈ 8（郊外 4 + 市区底图 4），只 1 张程序化纹理。
 */
export function buildTerrain(theme = 'day') {
  let palette = resolvePalette(theme);
  const group = new THREE.Group();
  group.name = 'terrain';

  // ---- 市区底图（互斥显示用，默认藏着，大部分时间跑在郊外）----
  const base = makeBaseGroup(palette);
  const baseRoot = base.group;
  baseRoot.visible = false;
  group.add(baseRoot);

  // ---- 郊外重复块 ----
  const ruralRoot = new THREE.Group();
  ruralRoot.name = 'rural-repeat';
  group.add(ruralRoot);

  const period = CHUNK.ruralPeriod; // 400
  const N = 14; // 铺 14 个周期 = ±2800 m，盖住 ahead 7 块 / behind 2 块的视野
  const halfZ = (N * period) / 2;
  const r = rng(20261113);

  const landMat = new THREE.MeshBasicMaterial({ color: palette.land, fog: true });
  const landGeo = new THREE.PlaneGeometry(1400, N * period + period);
  landGeo.rotateX(-Math.PI / 2);
  const land = new THREE.Mesh(landGeo, landMat);
  land.position.y = -0.72; // 最底一层：雪原 / 休耕土地
  ruralRoot.add(land);

  const fieldTex = fieldTexture();
  const soilMat = new THREE.MeshBasicMaterial({ map: fieldTex, color: palette.soil, fog: true });
  const patchMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }); // 颜色全在 instanceColor
  const treeMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: palette.treeTint, fog: true });
  const fieldGeo = fieldQuad();
  const patchGeo = patchQuad();
  const treeGeo = treeGeometry();

  // ---- 先摆好「一个周期」里都有哪些东西，再按 N 个周期复制（矩阵一次性写好）----
  const bFields = [];
  const bPatches = [];
  const bTrees = [];

  // 黑土田块：线路两侧各 4 块，长边沿 z，垄线朝天际舒展
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k += 1) {
      bFields.push({ x: side * (70 + k * 130 + 60), z: (r() - 0.5) * 20, w: 120, d: 340 });
    }
  }
  // 地表斑块：残雪 / 枯草 / 收割残茬 / 田埂 / 湿地水泡，靠类别上不同色
  const pickPatch = (v) => (v < 0.42 ? 'snow' : v < 0.62 ? 'grass' : v < 0.80 ? 'stubble' : v < 0.90 ? 'ridge' : 'water');
  for (let i = 0; i < 24; i += 1) {
    const side = r() < 0.5 ? -1 : 1;
    const kind = pickPatch(r());
    let w;
    let h;
    if (kind === 'ridge') { w = 2 + r() * 3; h = 120 + r() * 180; } // 细长田埂沿 z
    else if (kind === 'water') { w = 18 + r() * 46; h = 18 + r() * 46; } // 低平水泡子
    else { w = 8 + r() * 40; h = 8 + r() * 40; }
    bPatches.push({ x: side * (50 + r() * 520), z: (r() - 0.5) * period * 0.9, w, h, kind });
  }
  // 防护林带：沿 x 分几列纵向成排，形成黑土地常见的格子状林网
  for (const side of [-1, 1]) {
    for (const bx of [90, 230, 370, 500]) {
      for (let j = 0; j < 3; j += 1) {
        bTrees.push({
          x: side * bx + (r() - 0.5) * 10,
          z: -period / 2 + (j + 0.5) * (period / 3) + (r() - 0.5) * 18,
          s: 0.7 + r() * 0.7,
          rot: r() * Math.PI,
        });
      }
    }
  }

  const fields = new THREE.InstancedMesh(fieldGeo, soilMat, bFields.length * N);
  const patches = new THREE.InstancedMesh(patchGeo, patchMat, bPatches.length * N);
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, bTrees.length * N);
  fields.frustumCulled = false;
  patches.frustumCulled = false;
  trees.frustumCulled = false;

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const patchKinds = new Array(patches.count);
  let fi = 0;
  let pi = 0;
  let ti = 0;
  for (let c = 0; c < N; c += 1) {
    const z0 = -halfZ + c * period;
    for (const f of bFields) {
      v.set(f.x, -0.66, f.z + z0);
      q.identity();
      scl.set(f.w, 1, f.d);
      fields.setMatrixAt(fi++, m4.compose(v, q, scl));
    }
    for (const p of bPatches) {
      v.set(p.x, -0.63, p.z + z0);
      q.identity();
      scl.set(p.w, 1, p.h);
      patches.setMatrixAt(pi, m4.compose(v, q, scl));
      patchKinds[pi] = p.kind;
      pi += 1;
    }
    for (const t of bTrees) {
      v.set(t.x, -0.7, t.z + z0);
      q.setFromAxisAngle(UP, t.rot);
      scl.set(t.s, t.s, t.s);
      trees.setMatrixAt(ti++, m4.compose(v, q, scl));
    }
  }
  fields.instanceMatrix.needsUpdate = true;
  patches.instanceMatrix.needsUpdate = true;
  trees.instanceMatrix.needsUpdate = true;
  ruralRoot.add(fields, patches, trees);

  // 斑块颜色按类别取主题色。只在换主题时重刷一次，不是每帧，也不动矩阵。
  function paintPatches(pal) {
    const c = new THREE.Color();
    for (let i = 0; i < patches.count; i += 1) {
      c.setHex(pal[patchKinds[i]]);
      patches.setColorAt(i, c);
    }
    if (patches.instanceColor) patches.instanceColor.needsUpdate = true;
  }
  paintPatches(palette);

  function applyTheme(t) {
    palette = resolvePalette(t);
    // 郊外：雪 / 土地 / 水 / 雾色
    landMat.color.setHex(palette.land).lerp(new THREE.Color(palette.haze), 0.12);
    soilMat.color.setHex(palette.soil);
    treeMat.color.setHex(palette.treeTint);
    paintPatches(palette);
    // 市区底图：整体 tint 随主题冷暖明暗，水面单独换成主题水色
    base.materials.groundMat.color.setHex(palette.urbanTint);
    base.materials.decalMat.color.setHex(palette.urbanTint);
    base.materials.waterMat.color.setHex(palette.water);
    base.materials.shoreMat.color.setHex(palette.shore);
  }

  /** travel 是真实里程（米）。列车沿 -Z 前进，地形整体往 +Z 平移，取模即无缝。 */
  function scroll(travel) {
    ruralRoot.position.z = travel % period;
  }

  /**
   * 让集成层互斥显示「市区底图 urban」与「郊外重复块 rural」。
   * 把某一组打开时自动关掉另一组，保证同时最多只显示一组。
   */
  function setVisible(kind, on) {
    const k = String(kind).toLowerCase();
    const urban = k === 'urban' || k === 'city' || k === 'base' || k === 'harbin' || k === '市区';
    const rural = k === 'rural' || k === 'countryside' || k === 'repeat' || k === '郊外';
    if (urban) {
      baseRoot.visible = on;
      if (on) ruralRoot.visible = false;
    } else if (rural) {
      ruralRoot.visible = on;
      if (on) baseRoot.visible = false;
    }
  }

  /** 释放本模块独占的几何 / 材质 / 纹理。 */
  function dispose() {
    group.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    fieldTex.dispose();
  }

  return { group, scroll, applyTheme, setVisible, dispose };
}

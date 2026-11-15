/**
 * 哈尔滨市区粗略底图 + 郊外可循环地形 + 沿线路放样的「路权带」地表。
 *
 * 版本：three 0.180，addon 走 'three/addons/*'（这里只用 BufferGeometryUtils.mergeGeometries）。
 * 口径沿用 config.js：1 单位 = 1 米，x 向东、z 向南，轨顶 y = 0。
 * 本模块所有几何都压在 y < 0（江面≈-3、地面≈-0.9、路基面≈-0.66），不会和轨道穿插、不高于站台。
 * 与 track.js 对齐：CRTSⅢ 轨道实体顶 0、底 -0.61、覆盖到 x≈±4.05（每股中心 ±2.5、底座半宽 1.55）；
 * 本模块地面层一律压到 -0.66 以下，1:1.5 边坡从道床坡脚 x≥5.8 才起坡，绝不横穿轨道体积。
 * 外观是「示意级近似」，不是测绘数据：河宽、面块、路宽、路基高差都做了示意放大，只保证方位、
 * 江南北分区、堤/堑放坡方向和 1:1.5 坡率大致符合现实。几何与贴图全部程序化生成，运行时不 fetch 任何静态资产。
 *
 * ==================================================================================
 * 【★ 二轮结构修正（2026-11-15，lead 补发）：哈大高铁 73.32% 是桥梁高架】
 *  哈大高铁 921 km 中桥梁 162 座共 662.765 km（占 73.32%），地面线路不到 20%，
 *  旧版「13 种地表铺满沿线」本身就不像哈尔滨局。改为：郊外每 400 m 周期里
 *  40 m 路基平段 + 40 m 下沉过渡 + 320 m 高架桥 + 20 m 回升过渡（地面相关约 20%）；
 *  32.6 m 双线简支箱梁（顶板 12.6、梁高 3.05、桥面 12、防护墙）+ 矩形桥墩(18 m)，
 *  用 2 个 InstancedMesh 按 400 m 周期重复、随 ruralRoot 的 travel%400 滚动；
 *  桥下地面 quad 逐顶点按 bridgeBlendAt 连续缓坡下沉到 -22；路权带 ribbon 在桥梁段
 *  横向收拢到桥面宽并贴到桥面下（被箱梁盖住，y 几乎不变 → 无硬切陡峭白面）。
 *  来源：peopleapp.com 哈大高铁桥梁占比（lead 二轮检索）。
 *  分块模数：400 m 块内 11 跨 32.6 m 铺到 398.6 m，块边界落伸缩缝、不切跨中；
 *  轨道板 5.6 / 栅栏 3 / 声屏障 2 / 接触网柱 49 m 均由 track.js 锚定绝对里程网格。
 *  预算：精简约 80% 防护林树实例(24→6/周期)换桥梁几何，terrain 净面数不增反降。
 *
 * 【★ 本次写实升级（2026-11-15）：13 种地表「在画面里看得出差异」（收敛到 20% 路基段）】
 *  旧版郊外大地面是一整块单色 Plane + 少量纯色 InstancedMesh 斑块，俯瞰就是大片单一浅色，
 *  README 声称的 13 种地表几乎分辨不出。本次改为：
 *   1) 一张 4×4 程序化 CanvasTexture 图集（1024²，每格 256²），16 格画 13 类地表的
 *      「噪声 + 条纹 + 斑块」图案（黑土垄作/残雪、雪原、草地、湿地水泡、防护林下、
 *      沙质河滩、城市铺装、道砟路肩、路堤/路堑边坡、排水沟、护坡骨架·植草格、枯草残茬、
 *      混凝土…）。近白底 + 暗/亮图案，交给顶点色染主题色。
 *   2) 郊外地面改为「合并 BufferGeometry 的 quad 网格」：横向 18 带 × 纵向每 400m 周期
 *      10 段，每个 quad 独立 UV 指向图集某一格 + 独立顶点色；相邻 2×2 quad 归为同一
 *      类形成「田块」，俯瞰就是彩色的地块马赛克，不再是纯色平板。
 *   3) 路权带 ribbon 也挂同一张图集：横断面 16 个分带各自映射到对应地表子格，沿 z
 *      UV 平铺 + 顶点色轻微行扰动，边坡/排水沟/骨架/林下都有纹理，不再是纯色带。
 *   4) 主题切换只重刷顶点色 / 材质 tint，绝不新建贴图；周期内容用「段号对周期取模」
 *      保证每 400m 完全重复，scroll(travel % 400) 跳变恰好一个周期 → 无缝。
 *
 * 【★ 消除滚动顿挫（2026-11-15）】旧 System 每 20 m 才用 sampleLocal 放样一次 ribbon，
 *  中间帧 ribbon 顶点与根节点都不动 → 地面相对列车「静止 20 m 再突然跳 20 m」。改为
 *  **每帧轻量重放样**：ribbon 是预分配 BufferGeometry、MeshBasicMaterial 不需要法线，
 *  writeRibbon 只重写 position（5120 顶点），无 new Geometry / 无 dispose / 无 computeNormals，
 *  既连续又不会掉帧。郊外 quad 与防护林仍走 travel%400 周期平移、不做逐帧重建。
 *
 * 【资料来源 · 方位与河流走向（v1 已核实，2026-11-13，原样保留，方位不得画反）】
 *  1. 国际在线/黑龙江日报《雪落江湾》 https://hlj.cri.cn/n/20211210/d7752c32-7a44-e978-2d88-a4f0742a7899.html
 *  2. 百度百科《道外区》 https://baike.baidu.com/item/道外区/11036852
 *  3. 哈尔滨市地图资料 https://www.dituk.com/hangyedongtai/6654.html
 *  4. 呼兰区政府《魅力呼兰》 https://www.hulan.gov.cn/hebhlq/c110644/web_mlhl.shtml
 *  5. 人民日报客户端《呼兰河，是条什么河？》 https://www.peopleapp.com/rmharticle/30019571442
 *  6. Wikiwand《太阳岛 (哈尔滨)》 https://www.wikiwand.com/zh/太阳岛_(哈尔滨)
 *  7. 国家林草局《三北工程实践》（黑土地农田防护林"网带片"、格子状林网） https://www.forestry.gov.cn/c/www/kp/573905.jhtml
 *  8. 央广网《聚焦北大荒》（薄雪覆稻茬、笔直垄线、黑白交错） https://hlj.cnr.cn/nyst/20261027/t20261027_527854508.shtml
 *
 * 【资料来源 · 地表与路基工程（标题 + URL + 关键事实）】
 *  A. 《中度和剧烈侵蚀黑土作物地上与地下生长发育的差异》/ 中国水土保持科学
 *     https://zgstbckx.xml-journal.net/cn/article/pdf/preview/10267.pdf 垄宽 110 cm（垄台70+垄沟40）。
 *  B. 《A1-01 传统耕作制度-垄作》 https://365kepu.com/wapcolumnnews/34 垄沟/垄台交替、竖向长垄线。
 *  C. 央视网《"天空地"立体监测》 https://news.cctv.cn/2026/06/25/ARTIE0f1rzZMLxCr6h8F1un3260625.shtml 环形垄顺等高线、坡顶土发黄坡底深黑。
 *  D. 中国气象局《东北降雪偏多与农业影响》 https://www.cma.gov.cn/2011xwzx/2011xqxxw/2011xqxyw/201304/t20130403_209836.html 冬季黑白交错残雪+冻土。
 *  E. 央广网《春回黑土地 科技备耕忙》 https://www.cnr.cn/hlj/nyst/20250312/t20250312_527097688.shtml 残雪斑块与裸露黑土、积雪深约 320 mm。
 *  F. 《松嫩平原湿地演变》/ 地质与资源 http://www.dzyzy.cn/cn/article/doi/10.13686/j.cnki.dzyzy.2023.01.012 湖泡星罗棋布、芦苇沼泽。
 *  G. 国家林草局《扎龙湿地》 https://www.forestry.gov.cn/c/www/sd/24968.jhtml 芦苇沼泽内陆湿地。
 *  H. DB23/T 3454-2023《农田防护林营造技术规程》 https://bzchaxun.com/view/6110051014000000.html 主带间距 400–800 m、副带 600–1200 m、格子状林网。
 *  I. 科普中国《铁路复式路堤》 https://www.kepuchina.cn/wiki/ct/201802/t20180225_553547.shtml 路堤边坡 1:1.50~1:1.75。
 *  J. 《建设项目环境影响报告表》（引铁路路基设计规范） https://xzspglj.taiyuan.gov.cn/uploadfiles/202103/17/2021031715470056081697.docx H>3 m 浆砌片石截水骨架内植草。
 *  K. 《高速铁路路基排水设施怎么布置》 https://www.guifan.net/zhishi/2021/34160.html 路堤天然护道外设排水沟、路堑侧沟/天沟。
 *  L. 国家铁路局《铁路站场道路和排水设计规范》 https://biaozhun.tdpress.com/front/getFileImage?id=36c801f8c0ba4448ad92474ef0f3a9bf 梯形截水沟底宽 0.4 m、深 0.2–0.4 m。
 *  M. 东北网《冰城地标》 https://heilongjiang.dbw.cn/system/2011/11/07/053495784.shtml 滨江带状公园、人工堤防与滩地、站前铺装广场。
 *  N. 长赣高铁环评《路堤边坡防护典型设计图》
 *     https://www.hunan.gov.cn/hnszf/xxgk/tzgg/szbm/202307/29404201/files/470e006bc6b947ff8c5563ea4267081d.pdf
 *     边坡高 >4 m 用 M10 浆砌片石拱形截水骨架内植草、主骨架间距 3 m、坡面每 10 m 一条横向排水槽。
 *  O. 《高速铁路路基边坡防护施工方案》 https://www.bzko.com/sgzzsj/349092.html 截水沟 0.4×0.4 m、正六边形空心块 C25。
 *
 * 【分工】钢轨/扣件/CRTSⅢ 轨道板/接触网/防护栅栏/护栏/声屏障由 track.js 负责；本模块只在
 *  RAIL.fenceOffset(12 m) 一线铺「防护林下草地」地面，绝不另画一套栅栏。
 * ==================================================================================
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { geoToXY, CHUNK, CITY_RADIUS_M, ORIGIN } from './config.js';
import { SYSTEM_PHASE, RAIL, clamp, hash32 } from './core.js';

// ==================================================================== 常量 ==
// 真实经纬度（[lon, lat]），统一通过 geoToXY 转成局部米坐标。全是简化示意折线/多边形。
// 【v1 方位不得改变】松花江市区段自西南→东北、太阳岛在江北、呼兰河在东北方北岸汇入。

export const WATERWAYS = [
  {
    name: '松花江（市区段，西南→东北）', kind: 'river', width: 700,
    points: [
      [126.44, 45.686], [126.50, 45.716], [126.548, 45.744], [126.587, 45.765],
      [126.612, 45.781], [126.624, 45.788], [126.651, 45.800], [126.678, 45.836],
      [126.700, 45.888], [126.716, 45.949],
    ],
  },
  {
    name: '呼兰河（下游，市区东北方北岸汇入）', kind: 'tributary', width: 300,
    points: [[126.690, 45.990], [126.700, 45.972], [126.706, 45.960], [126.716, 45.949]],
  },
];

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
// 三套主题各自的地面色。键名 = 地面类型 id / atlas 格 id，applyTheme 统一换色，绝不新建贴图。
const PALETTES = {
  day: {
    land: 0xc2c9b8, soil: 0x6a5947, snow: 0xf3f7fc, grass: 0x9aa06a,
    stubble: 0xc2a35e, water: 0x6f93b0, ridge: 0x463a2e,
    wetland: 0x6e8d88, sandbar: 0xc9bf98, forestFloor: 0x76845a,
    ballast: 0x8c8578, pavement: 0xa39c90, concrete: 0xc0bbb0,
    embankment: 0x8a6f4c, cutting: 0x5c4836, ditch: 0x4a5b53, frame: 0x9a9878,
    treeTint: 0xffffff, urbanTint: 0xffffff, haze: 0xcbdce9, shore: 0x5b5344,
  },
  dusk: {
    land: 0x8b8272, soil: 0x4a3c34, snow: 0xdcbfae, grass: 0x7a7752,
    stubble: 0xa8813f, water: 0x53536e, ridge: 0x322820,
    wetland: 0x4a5a5e, sandbar: 0x9c8f72, forestFloor: 0x5a5c42,
    ballast: 0x66605a, pavement: 0x736c62, concrete: 0x8c827a,
    embankment: 0x634c38, cutting: 0x3d3128, ditch: 0x39443f, frame: 0x6e6a54,
    treeTint: 0xbfae9f, urbanTint: 0xcab4a6, haze: 0x7b6f7d, shore: 0x453d38,
  },
  night: {
    land: 0x4a5560, soil: 0x2b3038, snow: 0x8296ad, grass: 0x3f4a46,
    stubble: 0x5f5a54, water: 0x273b58, ridge: 0x1a2028,
    wetland: 0x2f4550, sandbar: 0x5f5f58, forestFloor: 0x36433a,
    ballast: 0x434851, pavement: 0x4a5058, concrete: 0x5c6470,
    embankment: 0x3c3a3a, cutting: 0x242830, ditch: 0x27363a, frame: 0x454b46,
    treeTint: 0x8398b2, urbanTint: 0x93a6c0, haze: 0x101d2e, shore: 0x2a3440,
  },
};

function themeKey(theme) {
  const byId = (id) => (PALETTES[String(id).toLowerCase()] ? String(id).toLowerCase() : null);
  if (typeof theme === 'string') return byId(theme) || 'day';
  if (theme && typeof theme === 'object') {
    if (theme.id && byId(theme.id)) return byId(theme.id);
    const label = String(theme.label || '');
    if (label.includes('暮')) return 'dusk';
    if (label.includes('夜')) return 'night';
    if (label.includes('昼') || label.includes('晴')) return 'day';
  }
  return 'day';
}
function resolvePalette(theme) { return PALETTES[themeKey(theme)]; }

const ROAD_COLOR = { arterial: 0x9c9688, bridge: 0x8b8478, rail: 0x8a8576 };
const PAVEMENT_HEX = 0x9c968a;
const CONCRETE_HEX = 0xbcb6a8;
const SANDBAR_HEX = 0xc9bf98;
const UP = new THREE.Vector3(0, 1, 0);
const RIVER_FLAT = 360, RIVER_TRANS = 240, RIVER_BANK_HALF = 850;

// 路权带（沿轨道两侧放样）几何常量。宽约 110 m（半宽 55），符合任务 60~120 m 口径。
const RIBBON_ROWS = 160;
const RIBBON_HALF = 55;
const RIBBON_AHEAD = 800;
const RIBBON_BEHIND = 2800;
const SLOPE_RATIO = 1.5;       // 高铁路堤/路堑边坡坡率 1:1.5（资料 I/N）
const RIBBON_PHASE = (hash32('terrain:slope') % 628) / 100;

// ================================================ 地表图集（13+ 类可见）====
/** atlas 4×4 共 16 格，下标 = 图集格号。前 13 类对应 README 的 13 种地表，后 3 补充。
 *  SURFACE_IDS[格号] = 类型 id（与 PALETTES 键一致），ATLAS_INDEX 反查。 */
const SURFACE_IDS = [
  'soil',          // 0 黑土垄作/残雪
  'snow',          // 1 雪原·休耕地
  'grass',         // 2 草地
  'wetland',       // 3 湿地水泡
  'forestFloor',   // 4 防护林下草地
  'sandbar',       // 5 沙质河滩
  'pavement',      // 6 城市铺装
  'ballast',       // 7 道砟路肩
  'embankment',    // 8 路堤边坡土体
  'cutting',       // 9 路堑边坡
  'ditch',         // 10 排水沟(侧沟·天沟)
  'frame',         // 11 护坡骨架·植草格
  'stubble',       // 12 枯草/残茬
  'concrete',      // 13 站台周边混凝土
  'ridge',         // 14 田埂/裸土
  'land',          // 15 郊外浅色底（备用）
];
const ATLAS_INDEX = {};
SURFACE_IDS.forEach((id, i) => { ATLAS_INDEX[id] = i; });
const ATLAS_N = 4;

/** 图集某一格的 UV 区间（留 2% padding，避免 mipmap 串到相邻格）。 */
function atlasUV(idx) {
  const col = idx % ATLAS_N, row = Math.floor(idx / ATLAS_N);
  return [
    (col + 0.02) / ATLAS_N, (row + 0.02) / ATLAS_N,
    (col + 0.98) / ATLAS_N, (row + 0.98) / ATLAS_N,
  ];
}

/** 郊外地块类型加权表：农田/草地/残雪主导，湿地/河滩/铺装/路堑/骨架等点缀，
 *  保证 13 类都会在俯瞰里出现，又不会大面积铺不协调的城市铺装。 */
const SURFACE_MIX_IDS = [
  'soil', 'soil', 'soil', 'stubble', 'stubble', 'grass', 'grass', 'grass',
  'snow', 'snow', 'forestFloor', 'forestFloor', 'wetland', 'sandbar',
  'pavement', 'concrete', 'ballast', 'embankment', 'cutting', 'ditch',
  'frame', 'ridge', 'land',
];
/** 同一 2×2 quad 块归为同一类 → 形成连片「田块」而非椒盐噪点；段号对周期取模保证可循环。 */
function pickSurface(band, segInPeriod) {
  const h = hash32(`surf:${Math.floor(band / 2)}:${Math.floor(segInPeriod / 2)}`);
  return ATLAS_INDEX[SURFACE_MIX_IDS[h % SURFACE_MIX_IDS.length]] ?? ATLAS_INDEX.land;
}

/** 程序化地表图集：16 格，每格「噪声 + 条纹 + 斑块」。
 *  近白底（让顶点色/主题色主导），图案用半透明黑/白叠加；只用 fillRect/arc/fill，
 *  兼容最朴素的 canvas stub。document 不存在时返回 null（材质不挂 map，几何照常）。 */
function makeSurfaceAtlas() {
  if (typeof document === 'undefined') return null;
  try {
    const S = 1024, G = S / ATLAS_N;
    const cv = document.createElement('canvas');
    if (!cv || !cv.getContext) return null;
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d');
    if (!g) return null;
    const rnd = rng(9182);
    const rect = (x, y, w, h, style) => { g.fillStyle = style; g.fillRect(x, y, w, h); };
    const dot = (x, y, r, style) => { g.fillStyle = style; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
    for (let idx = 0; idx < SURFACE_IDS.length; idx += 1) {
      const ox = (idx % ATLAS_N) * G, oy = Math.floor(idx / ATLAS_N) * G;
      rect(ox, oy, G, G, '#ecebe5'); // 近白底
      // 通用细噪点（所有格都有，避免纯色）
      for (let i = 0; i < 260; i += 1) {
        const v = 200 + Math.floor(rnd() * 50);
        dot(ox + rnd() * G, oy + rnd() * G, 0.5 + rnd() * 1.6,
          `rgba(${v},${v - 2},${v - 6},${0.25 + rnd() * 0.4})`);
      }
      switch (idx) {
        case 0: // 黑土垄作/残雪：竖向明暗长垄线 + 沟里残雪亮线（资料 A/B/C）
          for (let x = 0; x < G; x += 12) {
            const v = 90 + Math.floor(rnd() * 60);
            rect(ox + x, oy, 6, G, `rgba(${v},${v - 4},${v - 10},0.55)`);
            rect(ox + x + 6, oy, 2, G, 'rgba(255,255,255,0.5)'); // 残雪
          }
          for (let i = 0; i < 26; i += 1) rect(ox + rnd() * G, oy + rnd() * G, 3 + rnd() * 9, 2 + rnd() * 5, 'rgba(240,244,248,0.6)');
          break;
        case 1: // 雪原/休耕：蓝灰残雪斑 + 冻土暗斑（资料 D/E）
          for (let i = 0; i < 60; i += 1) {
            const light = rnd() < 0.62;
            rect(ox + rnd() * G, oy + rnd() * G, 8 + rnd() * 30, 5 + rnd() * 18,
              light ? 'rgba(255,255,255,0.65)' : 'rgba(96,104,116,0.28)');
          }
          break;
        case 2: // 草地：深浅草丛短线
          for (let i = 0; i < 520; i += 1) {
            const v = 90 + Math.floor(rnd() * 90);
            rect(ox + rnd() * G, oy + rnd() * G, 1 + rnd() * 2, 3 + rnd() * 6,
              `rgba(${v - 20},${v + 10},${v - 25},0.5)`);
          }
          break;
        case 3: // 湿地水泡：青灰水平波纹 + 芦苇草边斑（资料 F/G）
          for (let y = 0; y < G; y += 9) rect(ox, oy + y, G, 1, 'rgba(120,150,160,0.32)');
          for (let i = 0; i < 30; i += 1) rect(ox + rnd() * G, oy + rnd() * G, 6 + rnd() * 20, 2 + rnd() * 4, 'rgba(70,100,70,0.5)');
          break;
        case 4: // 防护林下：落叶斑 + 竖向树影条（资料 H）
          for (let x = 0; x < G; x += 26) rect(ox + x, oy, 4, G, 'rgba(50,60,45,0.3)');
          for (let i = 0; i < 90; i += 1) dot(ox + rnd() * G, oy + rnd() * G, 1 + rnd() * 3, 'rgba(120,110,70,0.5)');
          break;
        case 5: // 沙质河滩：细沙噪点 + 水平水痕（资料 M）
          for (let y = 0; y < G; y += 16) rect(ox, oy + y, G, 2, 'rgba(150,140,110,0.35)');
          for (let i = 0; i < 420; i += 1) dot(ox + rnd() * G, oy + rnd() * G, 0.5 + rnd(), 'rgba(120,110,90,0.4)');
          break;
        case 6: // 城市铺装：方砖网格缝（资料 M）
          for (let x = 0; x < G; x += 32) rect(ox + x, oy, 2, G, 'rgba(90,88,84,0.5)');
          for (let y = 0; y < G; y += 32) rect(ox, oy + y, G, 2, 'rgba(90,88,84,0.5)');
          break;
        case 7: // 道砟路肩：密集碎石点
          for (let i = 0; i < 900; i += 1) {
            const v = 110 + Math.floor(rnd() * 90);
            dot(ox + rnd() * G, oy + rnd() * G, 1 + rnd() * 2.4, `rgba(${v},${v - 4},${v - 10},0.7)`);
          }
          break;
        case 8: // 路堤边坡土：斜向草纹/雨痕（用错位短横线模拟斜纹，避免 rotate）
          for (let y = 0; y < G; y += 10) for (let x = 0; x < G; x += 14) {
            rect(ox + x + (y % 20), oy + y, 7, 2, 'rgba(80,95,60,0.35)');
          }
          break;
        case 9: // 路堑边坡：深褐岩块 + 水平层理
          for (let y = 0; y < G; y += 20) rect(ox, oy + y, G, 2, 'rgba(60,50,42,0.4)');
          for (let i = 0; i < 40; i += 1) rect(ox + rnd() * G, oy + rnd() * G, 6 + rnd() * 20, 4 + rnd() * 10, 'rgba(70,64,58,0.5)');
          break;
        case 10: // 排水沟：水平水流纹 + 上下沟壁阴影（资料 K/L/O）
          rect(ox, oy, G, 14, 'rgba(40,55,50,0.45)');
          rect(ox, oy + G - 14, G, 14, 'rgba(40,55,50,0.45)');
          for (let y = 20; y < G - 20; y += 7) rect(ox, oy + y, G, 1, 'rgba(120,160,170,0.4)');
          break;
        case 11: // 护坡骨架·植草格：混凝土网格骨架 + 格内草点（资料 J/N/O）
          for (let x = 0; x < G; x += 64) rect(ox + x, oy, 6, G, 'rgba(150,148,140,0.7)');
          for (let y = 0; y < G; y += 64) rect(ox, oy + y, G, 6, 'rgba(150,148,140,0.7)');
          for (let i = 0; i < 260; i += 1) dot(ox + rnd() * G, oy + rnd() * G, 0.8 + rnd() * 1.6, 'rgba(80,110,60,0.5)');
          break;
        case 12: // 枯草/残茬：竖向茬秆短线 + 残雪点
          for (let i = 0; i < 360; i += 1) rect(ox + rnd() * G, oy + rnd() * G, 1.5, 4 + rnd() * 6, 'rgba(120,95,55,0.5)');
          for (let i = 0; i < 30; i += 1) dot(ox + rnd() * G, oy + rnd() * G, 1 + rnd() * 2, 'rgba(255,255,255,0.7)');
          break;
        case 13: // 混凝土：大分缝 + 气泡点
          for (let x = 0; x < G; x += 84) rect(ox + x, oy, 2, G, 'rgba(110,108,104,0.4)');
          for (let y = 0; y < G; y += 84) rect(ox, oy + y, G, 2, 'rgba(110,108,104,0.4)');
          break;
        case 14: // 田埂/裸土：细横纹
          for (let y = 0; y < G; y += 7) rect(ox, oy + y, G, 1, 'rgba(80,66,52,0.4)');
          break;
        default: // 15 郊外浅色底：稀疏细噪点
          for (let i = 0; i < 120; i += 1) dot(ox + rnd() * G, oy + rnd() * G, 0.5 + rnd(), 'rgba(120,120,110,0.3)');
          break;
      }
      // 格边框：压暗 2px，进一步防 mipmap 串格
      rect(ox, oy, G, 2, 'rgba(120,120,110,0.35)');
      rect(ox, oy + G - 2, G, 2, 'rgba(120,120,110,0.35)');
      rect(ox, oy, 2, G, 'rgba(120,120,110,0.35)');
      rect(ox + G - 2, oy, 2, G, 'rgba(120,120,110,0.35)');
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.ClampToEdgeWrapping; // UV 已限制在子格内，无需 repeat
    t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  } catch (e) { return null; }
}

// ==================================================================== 工具 ==
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
const toXY = (pts) => pts.map(([lon, lat]) => geoToXY(lon, lat));

function minDistToWaterways(px, pz, lines) {
  let best = Infinity;
  for (const pts of lines) {
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const l2 = dx * dx + dz * dz || 1;
      let t = ((px - a.x) * dx + (pz - a.z) * dz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = px - (a.x + dx * t), ez = pz - (a.z + dz * t);
      const d = ex * ex + ez * ez;
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}
function makeGeom(pos, col, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
function ribbonGeometry(pts, halfW, y, colorHex) {
  const n = pts.length, pos = [], col = [], idx = [];
  const c = new THREE.Color(colorHex);
  for (let i = 0; i < n; i += 1) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const nx = -dz, nz = dx;
    pos.push(pts[i].x + nx * halfW, y, pts[i].z + nz * halfW);
    pos.push(pts[i].x - nx * halfW, y, pts[i].z - nz * halfW);
    col.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  for (let i = 0; i < n - 1; i += 1) {
    const a = 2 * i, b = a + 1, c2 = a + 2, d = a + 3;
    idx.push(a, b, c2, b, d, c2);
  }
  return makeGeom(pos, col, idx);
}
function polygonGeometry(poly, y, colorHex) {
  const contour = poly.map((p) => new THREE.Vector2(p.x, p.z));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const pos = [], col = [], idx = [];
  const c = new THREE.Color(colorHex);
  for (const p of poly) { pos.push(p.x, y, p.z); col.push(c.r, c.g, c.b); }
  for (const f of faces) idx.push(f[0], f[1], f[2]);
  return makeGeom(pos, col, idx);
}
function rectPoly(cx, cz, w, h) {
  return [
    { x: cx - w / 2, z: cz - h / 2 }, { x: cx + w / 2, z: cz - h / 2 },
    { x: cx + w / 2, z: cz + h / 2 }, { x: cx - w / 2, z: cz + h / 2 },
  ];
}
function offsetPolyline(pts, d) {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    return { x: p.x - dz * d, z: p.z + dx * d };
  });
}
function bankLines(pts, halfW, y) {
  const n = pts.length, left = [], right = [];
  for (let i = 0; i < n; i += 1) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const nx = -dz, nz = dx;
    left.push(new THREE.Vector3(pts[i].x + nx * halfW, y, pts[i].z + nz * halfW));
    right.push(new THREE.Vector3(pts[i].x - nx * halfW, y, pts[i].z - nz * halfW));
  }
  const v = [];
  for (let i = 0; i < n - 1; i += 1) v.push(left[i], left[i + 1], right[i], right[i + 1]);
  return new THREE.BufferGeometry().setFromPoints(v);
}
function baseGroundGeometry() {
  const seg = 64;
  const g = new THREE.PlaneGeometry(2 * CITY_RADIUS_M, 2 * CITY_RADIUS_M, seg, seg);
  g.rotateX(-Math.PI / 2);
  const lines = WATERWAYS.map((w) => toXY(w.points));
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const land = new THREE.Color(0xa8b09a), bottom = new THREE.Color(0x939f8b), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i), z = pos.getZ(i);
    const k = smoothstep(RIVER_FLAT, RIVER_FLAT + RIVER_TRANS, minDistToWaterways(x, z, lines));
    pos.setY(i, -3.2 + k * 2.5);
    tmp.copy(bottom).lerp(land, k);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** 一棵防护林树：树干 + 两层锥形树冠 + 雪顶，顶点色区分，合并给 InstancedMesh。 */
function treeGeometry() {
  const parts = [];
  const paint = (g, hex) => {
    const c = new THREE.Color(hex), arr = [];
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
/** 生成市区底图（v1 行为保留）：4 个 draw call，方位/面块/江面/岸线不变。 */
function makeBaseGroup(palette) {
  const group = new THREE.Group();
  group.name = 'harbin-base';
  const groundMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: palette.urbanTint, fog: true });
  const ground = new THREE.Mesh(baseGroundGeometry(), groundMat);
  ground.name = 'base-ground';
  group.add(ground);
  const decalParts = [];
  for (const z of URBAN_ZONES) decalParts.push(polygonGeometry(toXY(z.poly), z.y, z.color));
  for (const r of ROADS) decalParts.push(ribbonGeometry(toXY(r.points), r.width / 2, -0.6, ROAD_COLOR[r.kind] || 0x8a8a80));
  const st = geoToXY(ORIGIN.lon, ORIGIN.lat);
  decalParts.push(polygonGeometry(rectPoly(st.x, st.z, 300, 200), -0.60, PAVEMENT_HEX));
  decalParts.push(polygonGeometry(rectPoly(st.x, st.z, 170, 96), -0.58, CONCRETE_HEX));
  const riverPts = toXY(WATERWAYS[0].points);
  const halfRiver = WATERWAYS[0].width / 2;
  decalParts.push(ribbonGeometry(offsetPolyline(riverPts, halfRiver + 26), 26, -0.64, SANDBAR_HEX));
  decalParts.push(ribbonGeometry(offsetPolyline(riverPts, -halfRiver - 26), 26, -0.64, SANDBAR_HEX));
  const decalGeo = mergeGeometries(decalParts);
  decalParts.forEach((g) => g.dispose());
  const decalMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: palette.urbanTint, side: THREE.DoubleSide, fog: true });
  const decal = new THREE.Mesh(decalGeo, decalMat);
  decal.name = 'base-decals';
  group.add(decal);
  const waterParts = WATERWAYS.map((w) => ribbonGeometry(toXY(w.points), w.width / 2, -3.0, 0xffffff));
  const waterGeo = mergeGeometries(waterParts);
  waterParts.forEach((g) => g.dispose());
  const waterMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: palette.water, side: THREE.DoubleSide, fog: true });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.name = 'base-water';
  group.add(water);
  const shoreMat = new THREE.LineBasicMaterial({ color: palette.shore, fog: true });
  const shore = new THREE.LineSegments(bankLines(riverPts, RIVER_BANK_HALF, -0.66), shoreMat);
  shore.name = 'base-shore';
  group.add(shore);
  return { group, materials: { groundMat, decalMat, waterMat, shoreMat } };
}

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

// ======================================================== 路权带横断面 ======
/**
 * 「路权带」横断面：沿轨道中心向两侧各 55 m，用 17 个横向节点把不同地面类型分带。
 * 边坡按 1:1.5 坡率放坡、高差 H 随里程起伏，且路堤/路堑交替（资料 I/N）。
 * 【与 track.js 的几何边界】地面层基准 SHOULDER_Y=-0.66（比轨道底 -0.61 还低），
 * 1:1.5 边坡从道床坡脚 x=5.8 之外才起坡；x≤5.73 的地面只是被轨道盖住的垫层，
 * 绝不横穿轨道体积，也不与轨道面 z-fighting。坡脚外的「护坡骨架·植草格」对应资料 J/N/O。
 * 横向节点【数量固定 17 个】（右半 9 + 左半镜像 8），x 严格递增。
 */
function rightBands(s) {
  const H = clamp(0.5 + 1.4 * (0.5 + 0.5 * Math.sin(s / 300 + RIBBON_PHASE)), 0.5, 1.9);
  const W = SLOPE_RATIO * H;
  const isCut = Math.sin(s / 520 + RIBBON_PHASE) > 0;
  const SHOULDER_Y = -0.66;
  const BALLAST_FOOT = 5.8;
  const shoulderX = RAIL.ballastWidth / 2 + 1.0; // 3.6 道砟路肩/护道示意带
  const crestX = BALLAST_FOOT;
  const toeX = crestX + W;
  const soil = 'embankment';
  let crestY, toeY;
  if (!isCut) { crestY = SHOULDER_Y; toeY = SHOULDER_Y - H; }
  else { crestY = SHOULDER_Y - H; toeY = SHOULDER_Y; }
  const ditchY = toeY - 0.22;
  return [
    { x: 0, y: SHOULDER_Y, type: 'ballast' },
    { x: shoulderX, y: SHOULDER_Y, type: 'ballast' },
    { x: crestX, y: crestY, type: soil },
    { x: toeX, y: toeY, type: soil },
    { x: toeX + 1.2, y: ditchY, type: 'ditch' },
    { x: toeX + 2.4, y: toeY, type: 'frame' },
    { x: RAIL.fenceOffset, y: -0.60, type: 'forestFloor' },
    { x: 30, y: -0.68, type: 'grass' },
    { x: RIBBON_HALF, y: -0.72, type: 'land' },
  ];
}
function crossSection(s) {
  const right = rightBands(s);
  const left = right.slice(1).reverse().map((b) => ({ x: -b.x, y: b.y, type: b.type }));
  return left.concat(right);
}
const RIBBON_COLS = crossSection(0).length;                 // 17
const BAND_TYPES = crossSection(0).map((b) => b.type);      // 每列固定类型
const RIBBON_BANDS = RIBBON_COLS - 1;                       // 16 条分带
/** 每条分带映射到 atlas 格（用左列类型），供 UV 初始化与顶点色刷色。 */
const BAND_ATLAS = BAND_TYPES.slice(0, RIBBON_BANDS).map((t) => ATLAS_INDEX[t] ?? ATLAS_INDEX.land);

/** ribbon 用「每条分带独立 2 列顶点」：这样每个分带能各自指向 atlas 子格，
 *  相邻分带 UV 不共享、不会串格插值。顶点数 = 16 带 ×2 列 ×160 行 = 5120。
 *  index 只生成一次；position/color 预分配，writeRibbon / paintRibbon 只重写属性。 */
function makeRibbonGeometry() {
  const V = RIBBON_BANDS * 2 * RIBBON_ROWS;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(V * 3), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(V * 2), 2));
  const uvArr = g.attributes.uv.array;
  const idx = [];
  for (let b = 0; b < RIBBON_BANDS; b += 1) {
    const L = (b * 2) * RIBBON_ROWS, R = (b * 2 + 1) * RIBBON_ROWS;
    const [u0, v0, u1, v1] = atlasUV(BAND_ATLAS[b]);
    for (let s = 0; s < 2; s += 1) {
      const u = s ? u1 : u0;
      for (let r = 0; r < RIBBON_ROWS; r += 1) {
        const vi = (b * 2 + s) * RIBBON_ROWS + r;
        uvArr[vi * 2] = u;
        // V 在子格内沿里程平铺（每 ~8 行一个周期）；子格图案是噪声/条纹，接缝不明显。
        uvArr[vi * 2 + 1] = v0 + (v1 - v0) * ((r * 0.13) % 1);
      }
    }
    for (let r = 0; r < RIBBON_ROWS - 1; r += 1) {
      const a = L + r, c = R + r, a2 = L + r + 1, c2 = R + r + 1;
      idx.push(a, a2, c, c, a2, c2);
    }
  }
  g.setIndex(idx);
  return g;
}

// ======================================================== 郊外地面网格 ======
const GROUND_BANDS = 18;         // 横向分带
const GROUND_HALF = 700;         // 半宽（米）
const GROUND_SEG_PER_PERIOD = 10; // 每 400 m 周期纵向分段数

// ---- 桥梁高架（lead 二轮补发：哈大高铁 921 km 中桥梁 162 座 662.765 km，占 73.32%）----
// 平原段以 32.6 m 双线简支箱梁高架为主，地面路基段只保留约 20%（车站两端/隧道口）。
// 为保证 travel%400 无缝，桥梁/路基按 400 m 周期重复（每周期 40 m 路基 + 40 m
// 下沉过渡 + 320 m 高架桥 + 20 m 回升过渡），地面相关里程约 20%、高架约 80%，
// 是对「连续高架 + 车站两端路基」的示意级近似。
const BRIDGE = Object.freeze({
  spanLen: 32.6,        // 标准简支箱梁跨长
  deckHalf: 12.6 / 2,   // 顶板宽 12.6 m
  deckY: -0.62,         // 桥面（略低于 CRTS 底座底 -0.61，杜绝 z-fighting）
  girderH: 3.05,        // 梁高 3.0~3.05 m
  pierH: 18,            // 矩形/圆端形桥墩墩高示意
  groundY: -22,         // 桥梁段地面压到桥下（ground quad 连续缓坡下沉）
  subgradeSegs: 1,      // 每周期前 1 段(40 m)=10% 路基平段，其余为过渡+高架
});
/** 桥梁/路基过渡权重 0(路基)~1(桥梁)：下沉段 40 m、回升段 20 m 用 smoothstep 渐变，
 *  形成真实「桥台/路桥过渡段」缓坡，避免 ribbon/地面在硬切处突降 20 m 产生陡峭白面；
 *  周期边界(p→0)连续回到路基。供 ribbon 与地面 quad 逐顶点使用。 */
function bridgeBlendAt(s, period) {
  const p = ((s % period) + period) % period;
  const subLen = BRIDGE.subgradeSegs * (period / GROUND_SEG_PER_PERIOD);
  const enter = smoothstep(subLen - 20, subLen + 20, p); // 20→60 下沉
  const leave = 1 - smoothstep(period - 20, period, p);  // 380→400 回升
  return clamp(enter * leave, 0, 1);
}

/** 桥梁构件用的带位移 box（terrain.js 没有 track.js 的 box 工具，这里自带一份）。 */
function partBox(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}
/** 桥梁构件合并几何：BoxGeometry 自带 position/normal/uv，合并后覆盖 UV 指向 atlas
 *  的 concrete 格、并加浅灰混凝土顶点色（材质仍由主题 tint 统一调色）。 */
function bridgePartGeometry(parts) {
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  const [u0, v0, u1, v1] = atlasUV(ATLAS_INDEX.concrete);
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  const n = g.attributes.position.count;
  const uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  const c = new THREE.Color(0xb8b6ae);
  for (let i = 0; i < n; i += 1) {
    uv[i * 2] = cu; uv[i * 2 + 1] = cv;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
/** 单跨 32.6 m 双线简支箱梁：顶板 + 2 腹板 + 双侧防护墙（0.1 m 梁缝留伸缩缝）。 */
function boxGirderGeometry() {
  const L = BRIDGE.spanLen - 0.1, dY = BRIDGE.deckY, gH = BRIDGE.girderH, hf = BRIDGE.deckHalf;
  return bridgePartGeometry([
    partBox(2 * hf, 0.3, L, 0, dY - 0.15, 0),                              // 顶板(桥面宽 12.6)
    partBox(0.45, gH - 0.3, L, -(hf - 1.0), dY - 0.3 - (gH - 0.3) / 2, 0), // 左腹板
    partBox(0.45, gH - 0.3, L, (hf - 1.0), dY - 0.3 - (gH - 0.3) / 2, 0),  // 右腹板
    partBox(0.25, 1.0, L, -(hf - 0.15), dY + 0.5, 0),                       // 左防护墙
    partBox(0.25, 1.0, L, (hf - 0.15), dY + 0.5, 0),                        // 右防护墙
  ]);
}
/** 桥墩：墩帽(支承垫石) + 矩形墩身(18 m) + 承台。局部原点 = 墩中心、z=0 为跨端。 */
function pierGeometry() {
  const topY = BRIDGE.deckY - BRIDGE.girderH, pH = BRIDGE.pierH;
  return bridgePartGeometry([
    partBox(5.0, 0.9, 3.2, 0, topY - 0.45, 0),        // 墩帽
    partBox(3.0, pH, 2.4, 0, topY - 0.9 - pH / 2, 0), // 墩身
    partBox(6.0, 0.6, 4.0, 0, topY - 0.9 - pH, 0),    // 承台
  ]);
}

/** 合并 quad 网格：每 quad 独立 UV(指向 atlas 子格) + 独立顶点色；相邻 2×2 同类成田块。
 *  周期内容按「段号 % GROUND_SEG_PER_PERIOD」取，保证每 400 m 完全重复 → scroll 无缝。
 *  y 按 bridgeBlendAt 在桥台过渡段平滑插值（路基 -0.9 → 桥下 -22），相邻 quad 共享
 *  z 边界故连续无台阶；bridgeBlends 供换主题按桥下阴影渐暗。 */
function makeGroundGeometry(period, periods) {
  const halfZ = (periods * period) / 2;
  const rows = periods * GROUND_SEG_PER_PERIOD;
  const dx = (2 * GROUND_HALF) / GROUND_BANDS;
  const dz = (periods * period) / rows; // = period / GROUND_SEG_PER_PERIOD
  const pos = [], uv = [], col = [], idx = [];
  const types = new Uint8Array(GROUND_BANDS * rows);
  const bridgeBlends = new Float32Array(GROUND_BANDS * rows);
  for (let r = 0; r < rows; r += 1) {
    const segInPeriod = r % GROUND_SEG_PER_PERIOD;
    for (let b = 0; b < GROUND_BANDS; b += 1) {
      const x0 = -GROUND_HALF + b * dx, x1 = x0 + dx;
      const z0 = -halfZ + r * dz, z1 = z0 + dz;
      const t = pickSurface(b, segInPeriod);
      const q = r * GROUND_BANDS + b;
      types[q] = t;
      // 逐顶点按 z 的「桥台过渡」权重插值高度：相邻 quad 共享 z 边界 → 连续缓坡，
      // 不会出现 20 m 硬切台阶/陡面。路基 -0.9、桥下 -22。
      const bl = bridgeBlendAt(z0, period);
      bridgeBlends[q] = bl;
      const wob = 0.02 * Math.sin(r * 0.7 + b * 1.3);
      const y0 = -0.9 + (BRIDGE.groundY + 0.9) * bl - wob;
      const y1 = -0.9 + (BRIDGE.groundY + 0.9) * bridgeBlendAt(z1, period) - wob;
      const [u0, v0, u1, v1] = atlasUV(t);
      const base = pos.length / 3;
      pos.push(x0, y0, z0, x1, y0, z0, x1, y1, z1, x0, y1, z1);
      uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
      col.push(1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1); // paintGround 填主题色
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return { geometry: g, types, bridgeBlends, count: GROUND_BANDS * rows };
}

// ======================================================== buildTerrain ======
/**
 * 郊外可重复覆盖地形 + 市区底图 + 路权带 ribbon。
 *  - v1 行为完整保留：group / scroll(travel % 400) / applyTheme / setVisible 互斥 / dispose，
 *    且内部自带市区底图 'harbin-base'（集成层不要再单独 add 一份 buildHarbinBase）。
 *  - 路权带单独挂在 ribbonRoot；System 每帧用 sampleLocal 轻量重放样（只改 position）。
 *  - 重复元素全是 InstancedMesh / 合并 BufferGeometry；整模块 9 draw call、1 张图集、约 3.9 万三角面。
 */
export function buildTerrain(theme = 'day') {
  let palette = resolvePalette(theme);
  const group = new THREE.Group();
  group.name = 'terrain';

  // ---- 市区底图（互斥显示用，默认藏着）----
  const base = makeBaseGroup(palette);
  const baseRoot = base.group;
  baseRoot.visible = false;
  group.add(baseRoot);

  // ---- 1 张程序化地表图集，多个材质共享 ----
  const atlas = makeSurfaceAtlas();

  // ---- 郊外重复块 ----
  const ruralRoot = new THREE.Group();
  ruralRoot.name = 'rural-repeat';
  group.add(ruralRoot);

  const period = CHUNK.ruralPeriod; // 400
  const N = 14; // 铺 14 个周期 = ±2800 m，盖住 ahead 7 块 / behind 2 块视野
  const halfZ = (N * period) / 2;
  const r = rng(20261113);

  // 郊外地面 quad 网格（合并，1 draw call）
  const ground = makeGroundGeometry(period, N);
  const groundMat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, fog: true, ...(atlas ? { map: atlas } : {}),
  });
  const groundMesh = new THREE.Mesh(ground.geometry, groundMat);
  groundMesh.name = 'rural-ground';
  groundMesh.frustumCulled = false; // 顶点随 scroll 整体平移，别被旧包围盒裁掉
  ruralRoot.add(groundMesh);

  // 防护林带（资料 H 格子状林网）：★ 只在每周期的路基段(前 80 m)放树，桥梁段无树。
  // 树从原 24/周期 ×68 三角精简到 6/周期，省约 1.7 万面给箱梁/桥墩，净面数不增。
  const treeMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: palette.treeTint, fog: true });
  const treeGeo = treeGeometry();
  const bTrees = [];
  for (const side of [-1, 1]) {
    for (const bx of [90, 230, 370]) {
      bTrees.push({
        x: side * bx + (r() - 0.5) * 10,
        z: 4 + r() * 14,                  // 只在路基平段 z∈[0,20)，避开桥台下沉过渡
        s: 0.7 + r() * 0.7, rot: r() * Math.PI,
      });
    }
  }
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, bTrees.length * N);
  trees.name = 'rural-trees';
  trees.frustumCulled = false;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), scl = new THREE.Vector3();
  let ti = 0;
  for (let c = 0; c < N; c += 1) {
    const z0 = -halfZ + c * period;
    for (const t of bTrees) {
      v.set(t.x, -0.7, t.z + z0);
      q.setFromAxisAngle(UP, t.rot);
      scl.set(t.s, t.s, t.s);
      trees.setMatrixAt(ti++, m4.compose(v, q, scl));
    }
  }
  trees.instanceMatrix.needsUpdate = true;
  ruralRoot.add(trees);

  // ---- 桥梁高架：32.6 m 双线简支箱梁 + 矩形桥墩（占周期约 360/400 = 90%）----
  // 每周期从 40 m 路基段之后按 32.6 m 放 11 跨，铺到 398.6 m；400 m 块边界落在
  // 末跨之后的伸缩缝、不切跨中；
  // 箱梁/桥墩几何周期重复、随 ruralRoot 一起 travel%400 滚动，与 400 m 分块模数对齐。
  const bridgeMat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, fog: true, ...(atlas ? { map: atlas } : {}),
  });
  const subgradeLen = BRIDGE.subgradeSegs * (period / GROUND_SEG_PER_PERIOD); // 40 m
  const spansPerPeriod = Math.floor((period - subgradeLen) / BRIDGE.spanLen);  // 11 跨，铺到 398.6 m
  const girderMesh = new THREE.InstancedMesh(boxGirderGeometry(), bridgeMat, spansPerPeriod * N);
  girderMesh.name = 'rural-box-girders';
  girderMesh.frustumCulled = false;
  const pierMesh = new THREE.InstancedMesh(pierGeometry(), bridgeMat, spansPerPeriod * N);
  pierMesh.name = 'rural-piers';
  pierMesh.frustumCulled = false;
  const bMat4 = new THREE.Matrix4();
  let bi = 0;
  for (let c = 0; c < N; c += 1) {
    const z0 = -halfZ + c * period;
    for (let k = 0; k < spansPerPeriod; k += 1) {
      const zPier = z0 + subgradeLen + k * BRIDGE.spanLen; // 墩在跨端
      const zGirder = zPier + BRIDGE.spanLen / 2;          // 梁在跨中
      pierMesh.setMatrixAt(bi, bMat4.makeTranslation(0, 0, zPier));
      girderMesh.setMatrixAt(bi, bMat4.makeTranslation(0, 0, zGirder));
      bi += 1;
    }
  }
  girderMesh.instanceMatrix.needsUpdate = true;
  pierMesh.instanceMatrix.needsUpdate = true;
  ruralRoot.add(girderMesh, pierMesh);

  // ---- 路权带 ribbon（独立根节点，随里程用 sampleLocal 放样；v1 下退化为直线均匀带）----
  const ribbonRoot = new THREE.Group();
  ribbonRoot.name = 'right-of-way';
  group.add(ribbonRoot);
  const ribbonGeo = makeRibbonGeometry();
  const ribbonMat = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, fog: true, ...(atlas ? { map: atlas } : {}),
  });
  const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
  ribbonMesh.name = 'right-of-way-ribbon';
  ribbonMesh.frustumCulled = false;
  ribbonRoot.add(ribbonMesh);
  let ribbonAbsolute = false;

  /** 郊外地面 quad 顶点色：按每 quad 记录的 atlas 格 id 取主题色。换主题才刷，不动几何/UV。 */
  function paintGround(pal) {
    const arr = ground.geometry.attributes.color.array;
    const c = new THREE.Color();
    for (let q0 = 0; q0 < ground.count; q0 += 1) {
      c.setHex(pal[SURFACE_IDS[ground.types[q0]]] ?? pal.land);
      const dim = 1 - 0.45 * ground.bridgeBlends[q0]; // 桥下地面按过渡权重渐暗（桥面阴影/俯瞰区分桥与路基）
      const o = q0 * 12; // 4 顶点 × 3
      for (let k = 0; k < 4; k += 1) {
        arr[o + k * 3] = c.r * dim; arr[o + k * 3 + 1] = c.g * dim; arr[o + k * 3 + 2] = c.b * dim;
      }
    }
    ground.geometry.attributes.color.needsUpdate = true;
  }

  /** ribbon 顶点色：按分带类型取主题色 + 沿行轻微明暗扰动（避免纯色带）。换主题才刷。 */
  function paintRibbon(pal) {
    const arr = ribbonGeo.attributes.color.array;
    const c = new THREE.Color();
    for (let b = 0; b < RIBBON_BANDS; b += 1) {
      c.setHex(pal[SURFACE_IDS[BAND_ATLAS[b]]] ?? pal.land);
      for (let s = 0; s < 2; s += 1) {
        for (let row = 0; row < RIBBON_ROWS; row += 1) {
          const vi = (b * 2 + s) * RIBBON_ROWS + row;
          const o = vi * 3;
          const f = 0.9 + 0.1 * Math.sin(row * 0.6 + b);
          arr[o] = c.r * f; arr[o + 1] = c.g * f; arr[o + 2] = c.b * f;
        }
      }
    }
    ribbonGeo.attributes.color.needsUpdate = true;
  }

  /** 把采样点写进 ribbon 的 position 属性（唯一被高频改写的属性）。
   *  sampleLocal 给相对列车的局部坐标；地面 y 直接取横断面剖面值（全 <0）；
   *  right 只取 xz 分量，避免超高把地面抬起。每条分带用 sec[b]/sec[b+1] 独立顶点。 */
  function writeRibbon(samples) {
    const arr = ribbonGeo.attributes.position.array;
    for (let row = 0; row < RIBBON_ROWS; row += 1) {
      const sm = samples[Math.min(row, samples.length - 1)];
      const cx = sm.position[0], cz = sm.position[2];
      let nx = sm.right[0], nz = sm.right[2];
      const rl = Math.hypot(nx, nz) || 1;
      nx /= rl; nz /= rl;
      const sec = crossSection(sm.s);
      // 桥台过渡：★ 桥梁段把路权带「横向收拢到桥面宽(±6.6 m)、贴到桥面下 -0.64」，
      // 而不是把 ±55 m 宽带硬压到 -20（连续网格会在边界拉出陡峭白面）。收拢后 ribbon
      // 被箱梁顶板(-0.62)盖住不可见，且 y 几乎不变 → 无陡坡；桥下地面由独立的
      // ground quad 逐顶点连续缓坡下沉到 -22 表现。
      const bl = bridgeBlendAt(sm.s, period);
      const shrink = 1 - bl * 0.88;             // ±55 → ±6.6 m
      const yBridge = BRIDGE.deckY - 0.02;      // -0.64
      for (let b = 0; b < RIBBON_BANDS; b += 1) {
        const nL = sec[b], nR = sec[b + 1];
        for (let s = 0; s < 2; s += 1) {
          const node = s ? nR : nL;
          const u = node.x * shrink;
          const vi = (b * 2 + s) * RIBBON_ROWS + row;
          const o = vi * 3;
          arr[o] = cx + nx * u;
          arr[o + 1] = node.y * (1 - bl) + yBridge * bl;
          arr[o + 2] = cz + nz * u;
        }
      }
    }
    ribbonGeo.attributes.position.needsUpdate = true;
  }

  function straightSamples() {
    const out = [];
    for (let i = 0; i < RIBBON_ROWS; i += 1) {
      const z = -RIBBON_AHEAD + (i / (RIBBON_ROWS - 1)) * (RIBBON_AHEAD + RIBBON_BEHIND);
      out.push({ s: 1000 + i * ((RIBBON_AHEAD + RIBBON_BEHIND) / (RIBBON_ROWS - 1)), position: [0, 0, z], right: [1, 0, 0] });
    }
    return out;
  }
  writeRibbon(straightSamples());

  /** 供 System 调用：用 ctx.alignment.sampleLocal 沿曲线/坡度放样路权带（只改 position）。
   *  不画栅栏/轨道（那是 track.js 的活）。预分配几何 + 无 computeNormals → 可每帧调用。 */
  function _setRibbonAlignment(alignment, trainS, dir) {
    if (!alignment || typeof alignment.sampleLocal !== 'function') return;
    const fromM = Math.max(0, trainS - RIBBON_BEHIND);
    const toM = trainS + RIBBON_AHEAD;
    const step = Math.max(1, (toM - fromM) / (RIBBON_ROWS - 1));
    const samples = alignment.sampleLocal(trainS, fromM, toM, step, { dir });
    if (!samples.length) return;
    ribbonAbsolute = true;
    ribbonRoot.position.z = 0; // 顶点已是绝对局部坐标，不再随 scroll 平移
    writeRibbon(samples);
  }

  function applyTheme(t) {
    palette = resolvePalette(t);
    // 郊外：地面 / ribbon / 树 / 市区底图 tint 随主题冷暖明暗切换（只改色，不新建贴图）
    const tint = new THREE.Color(0xffffff).lerp(new THREE.Color(palette.haze), 0.08);
    groundMat.color.copy(tint);
    ribbonMat.color.copy(tint);
    bridgeMat.color.copy(tint);
    treeMat.color.setHex(palette.treeTint);
    paintGround(palette);
    paintRibbon(palette);
    base.materials.groundMat.color.setHex(palette.urbanTint);
    base.materials.decalMat.color.setHex(palette.urbanTint);
    base.materials.waterMat.color.setHex(palette.water);
    base.materials.shoreMat.color.setHex(palette.shore);
  }
  applyTheme(theme);

  /** travel 是真实里程（米）。列车沿 -Z 前进，郊外重复块整体往 +Z 平移，取模即无缝。 */
  function scroll(travel) {
    ruralRoot.position.z = travel % period;
    if (!ribbonAbsolute) ribbonRoot.position.z = travel % period;
  }

  /** 互斥显示「市区底图 urban」与「郊外重复块 rural」（v1 行为保留）。 */
  function setVisible(kind, on) {
    const k = String(kind).toLowerCase();
    const urban = k === 'urban' || k === 'city' || k === 'base' || k === 'harbin' || k === '市区';
    const rural = k === 'rural' || k === 'countryside' || k === 'repeat' || k === '郊外';
    if (urban) {
      baseRoot.visible = on;
      if (on) { ruralRoot.visible = false; ribbonRoot.visible = false; }
    } else if (rural) {
      ruralRoot.visible = on;
      ribbonRoot.visible = on;
      if (on) baseRoot.visible = false;
    }
  }

  function dispose() {
    group.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    if (atlas) atlas.dispose();
  }

  return { group, scroll, applyTheme, setVisible, dispose, _setRibbonAlignment };
}

// ============================================================ v2 System ======
/**
 * 工厂：把 v1 的 buildTerrain 包装成框架标准 System（core.js 契约）。
 *  - init 只把 terrain.group add 到 ctx.scene 一次。
 *  - update 用 ctx.s 调 scroll；按 ctx.chunks 里有没有 urban/hub 决定互斥显示；
 *    按 ctx.state.theme 变化切主题；★ 每帧用 sampleLocal 轻量重放样路权带（消除 20m 顿挫）。
 *  - applyTheme 转发；dispose 把 group 移出 scene 并释放全部独占资源。
 */
export function createTerrainSystem(ctx) {
  const terrain = buildTerrain(ctx?.state?.theme ?? 'day');
  let scene = null, cityBase = null;
  let lastTheme = themeKey(ctx?.state?.theme ?? 'day');
  let ruralOn = true;

  function syncTheme(t) {
    const key = themeKey(t);
    if (key !== lastTheme) { terrain.applyTheme(key); lastTheme = key; }
  }

  return {
    id: 'terrain',
    phase: SYSTEM_PHASE.TERRAIN,
    init(c) {
      const cx = c ?? ctx;
      scene = cx?.scene ?? null;
      if (scene) scene.add(terrain.group);
      cityBase = terrain.group.getObjectByName('harbin-base');
    },
    update(c, dt) {
      const cx = c ?? ctx;
      const s = cx?.s ?? 0;
      terrain.scroll(s);
      const chunks = cx?.chunks ?? [];
      const inCity = chunks.some((ch) => ch && (ch.kind === 'urban' || ch.kind === 'hub'));
      if (inCity) terrain.setVisible('urban', true);
      else if (ruralOn) terrain.setVisible('rural', true);
      else terrain.setVisible('rural', false);
      const st = cx?.state?.theme;
      if (st) syncTheme(st);
      if (cityBase) cityBase.position.z = s;
      // ★ 每帧轻量重放样：预分配 BufferGeometry 只改 position，连续且不掉帧。
      const align = cx?.alignment;
      if (align) terrain._setRibbonAlignment(align, s, cx?.dir);
    },
    applyTheme(theme) { terrain.applyTheme(theme); lastTheme = themeKey(theme); },
    setRural(on) {
      ruralOn = Boolean(on);
      terrain.setVisible('rural', ruralOn);
    },
    dispose() {
      if (scene) scene.remove(terrain.group);
      terrain.dispose();
      scene = null; cityBase = null;
    },
  };
}

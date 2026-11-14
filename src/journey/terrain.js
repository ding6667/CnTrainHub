/**
 * 哈尔滨市区粗略底图 + 郊外可循环地形 + 沿线路放样的「路权带」地表。
 *
 * 版本：three 0.180，addon 走 'three/addons/*'（这里只用 BufferGeometryUtils.mergeGeometries）。
 * 口径沿用 config.js：1 单位 = 1 米，x 向东、z 向南，轨顶 y = 0。
 * 本模块所有几何都压在 y < 0（江面≈-3、地面≈-0.7、路基面≈-0.66），不会和轨道穿插、不高于站台。
 * 与 track.js 对齐：双线道床实体（顶 -0.25、底 -0.61、覆盖 ±5.73）由 track.js 画；
 * 本模块地面层一律压到 -0.66 以下，1:1.5 边坡从道床坡脚 x≥5.8 才起坡，绝不横穿道床体积。
 * 外观是「示意级近似」，不是测绘数据：河宽、面块、路宽、路基高差、边坡水平宽都做了示意放大，
 * 只保证方位、江南北分区、堤/堑放坡方向和 1:1.5 坡率大致符合现实。几何与贴图全部程序化生成，
 * 不使用任何第三方图片素材，publicDir:false 下运行时也不 fetch 任何静态资产。
 *
 * ==================================================================================
 * 【资料来源 · 方位与河流走向（v1 已核实，2026-11-13，原样保留，方位不得画反）】
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
 * 【资料来源 · 地表与路基工程（本次联网核实，2026-11-14，标题 + URL + 关键事实）】
 *  A. 《中度和剧烈侵蚀黑土作物地上与地下生长发育的差异》/ 中国水土保持科学
 *     https://zgstbckx.xml-journal.net/cn/article/pdf/preview/10267.pdf
 *     关键事实：东北黑土区玉米大豆为垄作，垄宽 110 cm（垄台 70 + 垄沟 40，"大垄密"）；
 *     大片农地之间用林带划分地块，起垄方向平行于林带 → 田块长边顺林带、垄线朝天际舒展。
 *  B. 《A1-01 传统耕作制度-垄作》/ 每日科普网
 *     https://365kepu.com/wapcolumnnews/34
 *     关键事实：垄沟与垄台交替排列，适应东北寒地"春季地温低、夏季雨热同期易内涝"，
 *     "以垄御寒湿、借形养沃土" → 黑土农田用竖向长垄线 + 沟槽来表现。
 *  C. 央视网《"天空地"立体监测、精准作业让黑土地保护尽显"科技范"》
 *     https://news.cctv.cn/2026/06/25/ARTIE0f1rzZMLxCr6h8F1un3260625.shtml
 *     关键事实：环形垄顺等高线环绕坡面，融雪径流把坡上表土冲到坡下，坡顶土发黄、坡底深黑
 *     → 田块之间做深浅黑土色差与残雪斑驳。
 *  D. 中国气象局《气象专家解释东北降雪比往年偏多与对农业影响》
 *     https://www.cma.gov.cn/2011xwzx/2011xqxxw/2011xqxyw/201304/t20130403_209836.html
 *     关键事实：东北冬季多雪、农田"雪化土不化"、积雪覆盖可达全省 40% 面积，
 *     "湿封冻 + 融雪"形成春涝 → 冬季地表是黑白交错的残雪 + 冻土，不是纯白也不是纯黑。
 *  E. 央广网《高质量发展看中国 | 春回黑土地 科技备耕忙》
 *     https://www.cnr.cn/hlj/nyst/20250312/t20250312_527097688.shtml
 *     关键事实：春季"耙雪散墒"让白雪覆盖的大地露出黑色，冻融深度 70–80 cm、积雪深约 320 mm
 *     → 雪原/休耕地里散布残雪斑块与裸露黑土。
 *  F. 《松嫩平原湿地演变及其驱动因素分析》/ 地质与资源
 *     http://www.dzyzy.cn/cn/article/doi/10.13686/j.cnki.dzyzy.2023.01.012
 *     关键事实：嫩江、松花江（含下游呼兰河、拉林河）在平原中央辐聚式交汇，两岸地势最低、
 *     河流泛滥带发育，芦苇沼泽和羊草草甸是湿地主体；湖泡星罗棋布，孤立碱泡为盐碱湿地
 *     → 郊外低平"水泡子"斑块（青灰水面 + 芦苇草边）与湿地草地。
 *  G. 国家林草局《国际重要湿地 | 黑龙江扎龙国际重要湿地》
 *     https://www.forestry.gov.cn/c/www/sd/24968.jhtml
 *     关键事实：位于松嫩平原乌裕尔河下游湖沼苇草地带，以芦苇沼泽为主的内陆湿地。
 *  H. DB23/T 3454-2023《农田防护林营造技术规程》/ 黑龙江省林草局
 *     https://bzchaxun.com/view/6110051014000000.html
 *     关键事实：主林带垂直于主害风（偏角 ≤30°）、副林带与主林带垂直；主带间距 400–800 m、
 *     副带 600–1200 m，主带 3–5 行、副带 2–3 行，树种樟子松/北京杨/旱柳等
 *     → 郊外纵向成排、格子状林网 + 林下草地。
 *  I. 科普中国《铁路复式路堤》
 *     https://www.kepuchina.cn/wiki/ct/201802/t20180225_553547.shtml
 *     关键事实：高速铁路路堤边坡可采用 1:1.50~1:1.75（H≤8 m）、1:1.75~1:2.00（H>8 m），
 *     并在适当位置设平台；基床厚 3.0 m。细粒土 8 m 内 1:1.5、8–20 m 1:1.75。
 *  J. 《建设项目环境影响报告表（公示本）》/ 太原市行政审批局（引铁路路基设计规范）
 *     https://xzspglj.taiyuan.gov.cn/uploadfiles/202103/17/2021031715470056081697.docx
 *     关键事实：路堤边坡 1:1.5、高度 >8 m 时下部改 1:1.75，坡脚设 ≥2 m 天然护道；
 *     土质路堑边坡 1:1~1:1.5；H≤3 m 植灌草防护、H>3 m 用浆砌片石截水骨架内植草
 *     → 边坡土体 + 坡脚护道 + 骨架/植草格示意。
 *  K. 《高速铁路路基排水设施怎么布置》/ 规范网
 *     https://www.guifan.net/zhishi/2021/34160.html
 *     关键事实：路堤在天然护道外单/双侧设排水沟；路堑于路肩两侧设侧沟、堑顶外设天沟；
 *     地面排水纵坡 ≥2‰、沟顶高出设计水位 ≥0.2 m → 坡脚下凹的排水沟带。
 *  L. 国家铁路局《关于发布〈铁路站场道路和排水设计规范〉等 15 个标准的通知》
 *     https://biaozhun.tdpress.com/front/getFileImage?id=36c801f8c0ba4448ad92474ef0f3a9bf
 *     关键事实：堑顶天沟距堑顶 ≥5 m；梯形截水沟底宽宜 0.4 m、深 0.2–0.4 m、边坡 1:1~1:1.5；
 *     土质边坡宜植物防护、坡高增设骨架 → 路堑段堑顶截水沟（天沟）示意。
 *  M. 东北网《地标之历史演进：冰城地标散落城区的文脉珍珠》
 *     https://heilongjiang.dbw.cn/system/2011/11/07/053495784.shtml
 *     关键事实：斯大林公园是松花江南岸顺江堤傍水的带状滨江公园、隔江望太阳岛；
 *     防洪纪念塔 1958 年建于道里江畔（花岗岩塔基、沿江堤防），中央大街终点为铺装广场；
 *     滨洲铁路桥、松花江公路大桥跨江 → 城区铺装、站前广场、江岸人工堤防与滩地。
 *
 * 【地面类型清单（≥8 种，主题切换只改色、不新增贴图）】
 *  黑土农田(垄沟/残雪) / 雪原·休耕地 / 草地 / 湿地水泡 / 防护林下草地 / 沙质河滩 /
 *  城市铺装 / 混凝土站台周边 / 道砟路肩 / 路堤边坡土体 / 路堑边坡 / 排水沟(侧沟·天沟) /
 *  护坡骨架·植草格 —— 共 13 类，用 2 张可平铺 CanvasTexture + vertexColors/instanceColor 区分。
 *
 * 【分工】钢轨/枕木/道砟/接触网/防护栅栏/护栏/声屏障由 track.js 负责；本模块只在
 *  RAIL.fenceOffset(12 m) 一线铺「防护林下草地」地面，绝不另画一套栅栏。
 * ==================================================================================
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { geoToXY, CHUNK, CITY_RADIUS_M, ORIGIN } from './config.js';
import { SYSTEM_PHASE, RAIL, clamp, hash32 } from './core.js';

// ==================================================================== 常量 ==
// 真实经纬度（[lon, lat]），代码里统一通过 geoToXY 转成局部米坐标。全是简化示意折线/多边形。
// 【v1 方位不得改变】松花江市区段自西南→东北、太阳岛在江北、呼兰河在东北方北岸汇入。

/** 水系：松花江市区段西南→东北，呼兰河在市区东北方（下游）从北岸向东南汇入。width 是示意放大河宽（米）。 */
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

/** 主要干道 / 跨江桥 / 铁路走廊，简化示意折线（v1 原样）。 */
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

/** 主要城区面块（城市铺装，简化多边形）。太阳岛单列，压低 y 露出江面当江心洲（v1 原样）。 */
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
// 三套主题各自的地面色。键名就是「地面类型 id」，applyTheme 时统一换色，绝不新建贴图。
// 前 11 个键沿用 v1（land/soil/snow/grass/stubble/water/ridge/treeTint/urbanTint/haze/shore），
// 后面是本次新增的地面类型颜色。
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

/** 把三种传法（'day' 字符串 / {id} / config.js 的 THEMES 对象靠中文 label）归一成键名。 */
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

// 走廊/桥梁/新增铺装只是示意条带，颜色贴近地表即可（v1 经验：近黑会变成突兀黑带）。
const ROAD_COLOR = { arterial: 0x9c9688, bridge: 0x8b8478, rail: 0x8a8576 };
const PAVEMENT_HEX = 0x9c968a; // 站前广场城市铺装
const CONCRETE_HEX = 0xbcb6a8; // 站台周边混凝土
const SANDBAR_HEX = 0xc9bf98;  // 江岸沙质滩地
const UP = new THREE.Vector3(0, 1, 0);
// 河槽：江心到 d<RIVER_FLAT 压到最深，FLAT→FLAT+TRANS 是岸坡，之外是平地。
const RIVER_FLAT = 360;
const RIVER_TRANS = 240;
const RIVER_BANK_HALF = 850;

// 路权带（沿轨道两侧放样）几何常量。宽约 110 m（半宽 55），符合任务 60~120 m 口径。
const RIBBON_ROWS = 160;       // 纵向采样行数（预分配，固定不变）
const RIBBON_HALF = 55;        // 路权带半宽（米，示意放大）
const RIBBON_AHEAD = 800;      // 相对列车采样：前方里程
const RIBBON_BEHIND = 2800;    // 相对列车采样：后方里程
const SLOPE_RATIO = 1.5;       // 高铁路堤/路堑边坡坡率 1:1.5（资料 I/J）
// 用 core 的稳定哈希给边坡起伏一个固定相位，保证每次运行同一处地形一致。
const RIBBON_PHASE = (hash32('terrain:slope') % 628) / 100;

// ==================================================================== 工具 ==
// 沿用 v1 的 LCG：田块/斑块/林带的布局依赖它，换掉会让旧场景外观漂移，故保留。
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

/** 折线 → 有宽度的水平条带（水面、道路、铁路、江岸滩地都用它），带单一顶点色。 */
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

/** 多边形 → 水平面片（城区面块、站前铺装、太阳岛）。用 ShapeUtils 自带三角化，不引第三方。 */
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

/** 中心在 (cx,cz) 的矩形多边形（生成 {x,z}[]，喂给 polygonGeometry）。 */
function rectPoly(cx, cz, w, h) {
  return [
    { x: cx - w / 2, z: cz - h / 2 }, { x: cx + w / 2, z: cz - h / 2 },
    { x: cx + w / 2, z: cz + h / 2 }, { x: cx - w / 2, z: cz + h / 2 },
  ];
}

/** 折线按左法线整体偏移 d 米，用来沿江岸画沙质滩地带。 */
function offsetPolyline(pts, d) {
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    return { x: p.x - dz * d, z: p.z + dx * d };
  });
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

/** 市区地面：一张大网格，按到水系的距离把江带压成下凹河槽，露出下方 -3 的江面。
 *  seg 从 120 降到 64：大地面用少量大面片，省三角面预算（资料口径：示意级）。 */
function baseGroundGeometry() {
  const seg = 64;
  const g = new THREE.PlaneGeometry(2 * CITY_RADIUS_M, 2 * CITY_RADIUS_M, seg, seg);
  g.rotateX(-Math.PI / 2); // 转到 XZ 平面，法线朝 +Y
  const lines = WATERWAYS.map((w) => toXY(w.points));
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const land = new THREE.Color(0xa8b09a);
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

/** 程序化黑土农田贴图：灰度长垄线 + 残雪/土块斑驳。颜色全靠材质 color 染成黑土。第 1 张纹理。 */
function fieldTexture() {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d');
  const r = rng(9182);
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(0, 0, S, S);
  // 竖条 = 沿 z（列车前进方向）伸展的长垄线，对应资料 A/B 的"大垄密"
  for (let x = 0; x < S; x += 10) {
    const g = Math.floor(120 + r() * 70);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(x, 0, 5, S);
    ctx.fillStyle = 'rgba(214,212,200,0.28)'; // 垄沟里的残雪亮线
    ctx.fillRect(x + 5, 0, 2, S);
  }
  // 残雪 / 土块的斑驳噪点（资料 C/D/E：坡顶浅、坡底黑、雪化土不化）
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

/** 第 2 张纹理：雪原/休耕地大地面用的可平铺斑驳（残雪白点 + 冻土暗斑）。偏白，乘主题色不变脏。 */
function speckleTexture() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d');
  const r = rng(4477);
  ctx.fillStyle = '#d6d6d6';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 220; i += 1) {
    const light = r() < 0.55;
    ctx.fillStyle = light ? 'rgba(255,255,255,0.5)' : 'rgba(110,110,110,0.18)';
    const w = 2 + r() * 9;
    ctx.fillRect(r() * S, r() * S, w, w * (0.4 + r() * 0.8));
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(28, 120); // 大地面 1400 × 6000 m，约 50 m 一个斑驳周期
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
 * 合并后只有 4 个 draw call：地面基底、面块/铺装/滩地 decal、水面、岸线。
 * 新增地面类型都塞进 decal 这一个 mesh：城市铺装(城区面块)、站前广场(pavement)、
 * 混凝土站台周边(concrete)、江岸沙质滩地(sandbar)，不增加 draw call。
 */
function makeBaseGroup(palette) {
  const group = new THREE.Group();
  group.name = 'harbin-base'; // v1 集成层 journey.js 用 getObjectByName('harbin-base') 取它

  const groundMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: palette.urbanTint, fog: true });
  const ground = new THREE.Mesh(baseGroundGeometry(), groundMat);
  ground.name = 'base-ground';
  group.add(ground);

  // 城区面块(城市铺装) + 太阳岛 + 干道 + 桥 + 铁路走廊 + 新增铺装/滩地，全部按顶点色合并
  const decalParts = [];
  for (const z of URBAN_ZONES) decalParts.push(polygonGeometry(toXY(z.poly), z.y, z.color));
  for (const r of ROADS) decalParts.push(ribbonGeometry(toXY(r.points), r.width / 2, -0.6, ROAD_COLOR[r.kind] || 0x8a8a80));
  // 站前广场(城市铺装) + 站台周边混凝土：以哈尔滨站(ORIGIN, 投影≈0,0)为中心
  const st = geoToXY(ORIGIN.lon, ORIGIN.lat);
  decalParts.push(polygonGeometry(rectPoly(st.x, st.z, 300, 200), -0.60, PAVEMENT_HEX));
  decalParts.push(polygonGeometry(rectPoly(st.x, st.z, 170, 96), -0.58, CONCRETE_HEX));
  // 江岸沙质滩地：沿松花江两岸、水面边缘外侧各一条浅沙带（资料 M：人工堤岸 + 滩地）
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

  // 松花江 + 呼兰河水面：顶点色画成白色，实际颜色由材质 color（主题水色）决定
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

/** 独立导出：市区粗略真实底图（晴昼配色、静态、不随里程滚动）。调用方负责回收。v1 签名不变。 */
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

// ======================================================== 路权带 ribbon ======
/**
 * 「路权带」横断面：沿轨道中心向两侧各 55 m，用少量横向节点把不同地面类型分带。
 * 关键：边坡按 1:1.5 坡率放坡、高差 H 随里程起伏（资料 I/J），且路堤/路堑交替：
 *   - 路堤：护道齐平(-0.66)，边坡向外下降到坡脚，坡脚外侧下凹一条排水沟(资料 K)。
 *   - 路堑：路肩在挖方底(更低)，边坡向外上升到堑顶，堑顶外侧下凹一条截水沟/天沟(资料 L)。
 * 全部 y<0，不穿轨道、不高于站台。W = 1.5*|Δy| 就是 1:1.5 坡率的水平宽（示意放大高差以便可见）。
 * 【与 track.js 的几何边界】钢轨/枕木/道砟是 track.js 画的实体：双线道床顶 -0.25、底 -0.61，
 * 相对线路中心覆盖到 x≈±5.73（每股中心 ±2.5、底半宽 3.23）。2026-11-14 与 track-modeler 核对后定：
 * 本层基准 SHOULDER_Y=-0.66（比道床底还低 0.05），且 1:1.5 边坡从道床坡脚 x=5.8 之外才起坡；
 * x≤5.73 的地面只是被道床盖住的垫层/护道，绝不横穿道床体积，也不与道床顶面 z-fighting。
 * 坡脚/堑顶外的「护坡骨架·植草格」对应资料 J 的浆砌片石截水骨架内植草。
 * 横向节点【数量固定 17 个】（右半 9 + 左半镜像 8），x 严格递增，便于预分配 BufferGeometry。
 */
function rightBands(s) {
  // H 示意 0.5~1.9 m 的路基高差，随里程缓慢起伏；路堤/路堑约每 1.6 km 交替一次
  const H = clamp(0.5 + 1.4 * (0.5 + 0.5 * Math.sin(s / 300 + RIBBON_PHASE)), 0.5, 1.9);
  const W = SLOPE_RATIO * H; // 1:1.5 边坡水平宽
  const isCut = Math.sin(s / 520 + RIBBON_PHASE) > 0;
  // 与 track.js 对齐：道床底 -0.61、覆盖 ±5.73；地面层压得更低、放坡从坡脚外开始
  const SHOULDER_Y = -0.66;                        // 低于道床底 -0.61，绝不穿道床
  const BALLAST_FOOT = 5.8;                        // 道床坡脚外（±5.73 + 0.07 余量），1:1.5 边坡起点
  const shoulderX = RAIL.ballastWidth / 2 + 1.0;  // 3.6，「道砟路肩/护道」示意带的位置
  const crestX = BALLAST_FOOT;
  const toeX = crestX + W;                         // 坡脚/堑顶 x
  // 边坡土体颜色固定为 embankment（只改 position，不改 color，见性能红线）；
  // 「路堑边坡」作为独立地面类型由郊外斑块 patches 里的 cutting 暗褐土斑体现。
  const soil = 'embankment';
  let crestY;
  let toeY;
  if (!isCut) {          // 路堤：护道齐平，向外下降
    crestY = SHOULDER_Y;
    toeY = SHOULDER_Y - H;
  } else {               // 路堑：路肩在挖方底，向外上升到堑顶
    crestY = SHOULDER_Y - H;
    toeY = SHOULDER_Y;
  }
  const ditchY = toeY - 0.22; // 沟底下凹（坡脚排水沟 / 堑顶天沟）
  return [
    { x: 0, y: SHOULDER_Y, type: 'ballast' },                  // 轨道中心下方（被道床盖住），压到道床底以下
    { x: shoulderX, y: SHOULDER_Y, type: 'ballast' },          // 道砟路肩/护道示意带（在道床体积内、被遮，不穿）
    { x: crestX, y: crestY, type: soil },                      // 边坡顶（道床坡脚外，1:1.5 起坡）
    { x: toeX, y: toeY, type: soil },                          // 坡脚 / 堑顶（1:1.5 放坡）
    { x: toeX + 1.2, y: ditchY, type: 'ditch' },               // 排水沟 / 天沟
    { x: toeX + 2.4, y: toeY, type: 'frame' },                 // 护坡骨架·植草格
    { x: RAIL.fenceOffset, y: -0.60, type: 'forestFloor' },    // 栅栏线(12m)处的防护林下草地，栅栏由 track.js 画
    { x: 30, y: -0.68, type: 'grass' },                        // 草地过渡
    { x: RIBBON_HALF, y: -0.72, type: 'land' },                // 接入郊外大地面
  ];
}

/** 右半 9 个节点 → 左右镜像拼成 17 个横向节点，x 严格递增。 */
function crossSection(s) {
  const right = rightBands(s);
  const left = right.slice(1).reverse().map((b) => ({ x: -b.x, y: b.y, type: b.type }));
  return left.concat(right);
}
const RIBBON_COLS = crossSection(0).length;                 // 17
const BAND_TYPES = crossSection(0).map((b) => b.type);      // 每列固定类型，color 只依赖列号

/** 建一张预分配的 ribbon BufferGeometry：position/color 都是固定长度 TypedArray，index 只生成一次。 */
function makeRibbonGeometry() {
  const count = RIBBON_ROWS * RIBBON_COLS;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const idx = [];
  for (let row = 0; row < RIBBON_ROWS - 1; row += 1) {
    for (let col = 0; col < RIBBON_COLS - 1; col += 1) {
      const a = row * RIBBON_COLS + col;
      const b = a + 1;
      const c = a + RIBBON_COLS;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  g.setIndex(idx);
  return g;
}

/**
 * 郊外可重复覆盖地形 + 市区底图 + 路权带 ribbon。
 *  - v1 行为完整保留：group / scroll(travel % 400) / applyTheme / setVisible 互斥 / dispose，
 *    且内部自带市区底图 'harbin-base'（集成层不要再单独 add 一份 buildHarbinBase）。
 *  - 路权带单独挂在 ribbonRoot，默认直线形态；System 调 _setRibbonAlignment 用 sampleLocal 放样。
 *  - 重复元素全是 InstancedMesh，同类几何 mergeGeometries 合并；整模块 ≤ 9 draw call、2 张纹理、约 34k 三角面。
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

  // ---- 路权带 ribbon（独立根节点，随里程用 sampleLocal 放样；v1 下退化为直线均匀带）----
  const ribbonRoot = new THREE.Group();
  ribbonRoot.name = 'right-of-way';
  group.add(ribbonRoot);
  const ribbonGeo = makeRibbonGeometry();
  const ribbonMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true });
  const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
  ribbonMesh.frustumCulled = false; // 顶点动态，别用会过期的包围球裁剪
  ribbonRoot.add(ribbonMesh);
  let ribbonAbsolute = false; // true=已用 sampleLocal 绝对局部坐标，scroll 不再平移它

  const period = CHUNK.ruralPeriod; // 400
  const N = 14; // 铺 14 个周期 = ±2800 m，盖住 ahead 7 块 / behind 2 块的视野
  const halfZ = (N * period) / 2;
  const r = rng(20261113);

  const fieldTex = fieldTexture();
  const speckleTex = speckleTexture();
  const landMat = new THREE.MeshBasicMaterial({ color: palette.land, map: speckleTex, fog: true });
  const landGeo = new THREE.PlaneGeometry(1400, N * period + period);
  landGeo.rotateX(-Math.PI / 2);
  const land = new THREE.Mesh(landGeo, landMat);
  land.position.y = -0.72; // 最底一层：雪原 / 休耕土地
  ruralRoot.add(land);

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

  // 黑土田块：线路两侧各 4 块，长边沿 z，垄线朝天际舒展（资料 A）
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k += 1) {
      bFields.push({ x: side * (70 + k * 130 + 60), z: (r() - 0.5) * 20, w: 120, d: 340 });
    }
  }
  // 地表斑块：残雪 / 枯草 / 收割残茬 / 田埂 / 湿地水泡 / 沙质河滩 / 林下草地 / 路堑挖方土，
  // 按类别上不同色（都从 palette 取），对应资料 C/D/E/F + 路堑边坡类型。
  const PATCH_TYPES = ['snow', 'grass', 'stubble', 'wetland', 'sandbar', 'forestFloor', 'cutting', 'ridge'];
  const pickPatch = (v) => PATCH_TYPES[Math.min(PATCH_TYPES.length - 1, Math.floor(v * PATCH_TYPES.length))];
  for (let i = 0; i < 28; i += 1) {
    const side = r() < 0.5 ? -1 : 1;
    const kind = pickPatch(r());
    let w;
    let h;
    if (kind === 'ridge') { w = 2 + r() * 3; h = 120 + r() * 180; }        // 细长田埂沿 z
    else if (kind === 'wetland') { w = 18 + r() * 46; h = 18 + r() * 46; }  // 低平水泡子（资料 F）
    else { w = 8 + r() * 40; h = 8 + r() * 40; }
    bPatches.push({ x: side * (50 + r() * 520), z: (r() - 0.5) * period * 0.9, w, h, kind });
  }
  // 防护林带：沿 x 分列纵向成排，形成黑土地常见的格子状林网（资料 H）
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

  // ribbon 顶点色：颜色只依赖横向列号（BAND_TYPES 固定），换主题时重刷，不动几何。
  function paintRibbon(pal) {
    const col = ribbonGeo.attributes.color;
    const arr = col.array;
    const c = new THREE.Color();
    const rowRGB = [];
    for (let k = 0; k < RIBBON_COLS; k += 1) {
      c.setHex(pal[BAND_TYPES[k]]);
      rowRGB.push(c.r, c.g, c.b);
    }
    for (let row = 0; row < RIBBON_ROWS; row += 1) {
      for (let k = 0; k < RIBBON_COLS; k += 1) {
        const i = (row * RIBBON_COLS + k) * 3;
        arr[i] = rowRGB[k * 3];
        arr[i + 1] = rowRGB[k * 3 + 1];
        arr[i + 2] = rowRGB[k * 3 + 2];
      }
    }
    col.needsUpdate = true;
  }

  /** 把一组采样点写进 ribbon 的 position 属性（唯一会被高频改写的属性）。
   *  sampleLocal 给的是相对列车的局部坐标：轨道在局部空间近似落在 y=0 的水平线上，
   *  所以顶点 y 直接取横断面剖面值（全 <0）；right 向量只取 xz 分量，避免超高把地面抬起。 */
  function writeRibbon(samples) {
    const pos = ribbonGeo.attributes.position;
    const arr = pos.array;
    for (let row = 0; row < RIBBON_ROWS; row += 1) {
      const sm = samples[Math.min(row, samples.length - 1)];
      const cx = sm.position[0];
      const cz = sm.position[2];
      let nx = sm.right[0];
      let nz = sm.right[2];
      const rl = Math.hypot(nx, nz) || 1;
      nx /= rl;
      nz /= rl;
      const sec = crossSection(sm.s);
      for (let k = 0; k < RIBBON_COLS; k += 1) {
        const b = sec[k];
        const i = (row * RIBBON_COLS + k) * 3;
        arr[i] = cx + nx * b.x;
        arr[i + 1] = b.y;
        arr[i + 2] = cz + nz * b.x;
      }
    }
    pos.needsUpdate = true;
  }

  /** v1 默认（无 alignment）：一条沿 z 的直线均匀带，交给 scroll 平移即可。 */
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
   *  注意不在这里画栅栏/轨道——那是 track.js 的活。只在 travel 变化 >20 m 时由 System 触发。 */
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
    // 郊外：雪 / 土地 / 水 / 雾色
    landMat.color.setHex(palette.land).lerp(new THREE.Color(palette.haze), 0.12);
    soilMat.color.setHex(palette.soil);
    treeMat.color.setHex(palette.treeTint);
    paintPatches(palette);
    paintRibbon(palette);
    // 市区底图：整体 tint 随主题冷暖明暗，水面单独换成主题水色
    base.materials.groundMat.color.setHex(palette.urbanTint);
    base.materials.decalMat.color.setHex(palette.urbanTint);
    base.materials.waterMat.color.setHex(palette.water);
    base.materials.shoreMat.color.setHex(palette.shore);
  }
  applyTheme(theme); // 初始化时把三套颜色都刷一遍（含 ribbon / instanceColor）

  /** travel 是真实里程（米）。列车沿 -Z 前进，地形整体往 +Z 平移，取模即无缝（detail-city.js 写法）。 */
  function scroll(travel) {
    ruralRoot.position.z = travel % period;
    if (!ribbonAbsolute) ribbonRoot.position.z = travel % period;
  }

  /** 让集成层互斥显示「市区底图 urban」与「郊外重复块 rural」（v1 行为保留）。
   *  打开一组时自动关掉另一组；ribbon 归属郊外那一组，市区时隐藏避免坐标系打架。 */
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

  /** 释放本模块独占的几何 / 材质 / 纹理（含 2 张 CanvasTexture）。 */
  function dispose() {
    group.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    fieldTex.dispose();
    speckleTex.dispose();
  }

  return { group, scroll, applyTheme, setVisible, dispose, _setRibbonAlignment };
}

// ============================================================ v2 System ======
/**
 * 工厂：把 v1 的 buildTerrain 包装成框架标准 System（core.js 契约）。
 *  - init 只把 terrain.group add 到 ctx.scene 一次（v1 内部已含市区底图，绝不另 add 一份 buildHarbinBase）。
 *  - update 用 ctx.s 调 scroll；按 ctx.chunks 里有没有 urban/hub 决定互斥显示；
 *    按 ctx.state.theme 变化切主题；每 travel 变化 >20 m 才用 sampleLocal 重放样路权带。
 *  - applyTheme 转发；dispose 把 group 移出 scene 并释放全部独占资源。
 */
export function createTerrainSystem(ctx) {
  const terrain = buildTerrain(ctx?.state?.theme ?? 'day');
  let scene = null;
  let cityBase = null;
  let lastTheme = themeKey(ctx?.state?.theme ?? 'day');
  let lastRibbonS = Number.NaN;
  let ruralOn = true; // 集成层「郊外地形」开关（v2 新增，不影响 v1 的 setVisible 语义）

  function syncTheme(t) {
    const key = themeKey(t);
    if (key !== lastTheme) {
      terrain.applyTheme(key); // 字符串即可，resolvePalette 认得
      lastTheme = key;
    }
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
      // 按块类型互斥显示：出现 urban/hub 块 → 市区真实底图；否则郊外重复块
      const chunks = cx?.chunks ?? [];
      const inCity = chunks.some((ch) => ch && (ch.kind === 'urban' || ch.kind === 'hub'));
      // v2：郊外地形开关关掉后，只保留市区真实底图，别把重复田地又画回来
      if (inCity) terrain.setVisible('urban', true);
      else if (ruralOn) terrain.setVisible('rural', true);
      else terrain.setVisible('rural', false);
      // 主题：update 里按 state.theme 兜底（框架 setTheme 也会走 applyTheme 钩子，这里做去重）
      const st = cx?.state?.theme;
      if (st) syncTheme(st);
      // 市区底图以哈尔滨站为原点，随里程整体往车后走（对齐 v1 journey.js 的 cityBase.position.z = travel）
      if (cityBase) cityBase.position.z = s;
      // 路权带：只在里程变化超过约 20 m 时才重新放样，避免每帧重建几何 / 重算实例矩阵
      const align = cx?.alignment;
      if (align && (Number.isNaN(lastRibbonS) || Math.abs(s - lastRibbonS) > 20)) {
        terrain._setRibbonAlignment(align, s, cx?.dir);
        lastRibbonS = s;
      }
    },
    applyTheme(theme) {
      terrain.applyTheme(theme);
      lastTheme = themeKey(theme);
    },
    /** v2 集成层用：关掉郊外重复地形（v1 的 setVisible 仍在 buildTerrain 返回对象上）。 */
    setRural(on) {
      ruralOn = Boolean(on);
      if (!ruralOn) terrain.setVisible('rural', false);
      else terrain.setVisible('rural', true);
    },
    dispose() {
      if (scene) scene.remove(terrain.group);
      terrain.dispose();
      scene = null;
      cityBase = null;
    },
  };
}

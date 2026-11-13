/**
 * journey 场景的共享契约 —— 所有子 agent 的模块都依赖本文件，请勿各自发明坐标系。
 *
 * 设计口径（大白话版）：
 *  - 1 个 Three 单位 = 现实 1 米，轨道沿 -Z 前进，+Y 向上，轨顶面 y = 0。
 *  - 「里程严格、几何局部展开」：列车跑过的 travel 就是真实公里数（米），
 *    但几百公里的线路不会一次性铺成一张大地图。我们把线路按 400 m 切成 chunk，
 *    只保留列车前后若干块；镜头前方按 travel 触发建站/建城/建地标，
 *    离开市区就用可循环的田地、草地、河流块盖住，出视野就回收 dispose。
 *  - 市区局部（哈尔滨站周边 ±CITY_RADIUS_M）用真实经纬度等距投影摆位，
 *    松花江、主要站房、地标按真实相对方位；郊外不追求经纬度一致，只保证里程一致。
 *
 * 版本：three 0.180，addon 走 'three/addons/*'（例如 BufferGeometryUtils.mergeGeometries）。
 * 项目约定：publicDir=false，禁止运行时 fetch 任何静态资产；几何与贴图全部程序化生成
 * 或由 data/*.json 打包 import。外观只做示意级复刻，不使用第三方图片素材。
 */

// ------------------------------------------------------------ 现实坐标 ----

/** 投影原点：哈尔滨站（data/stations.json 的真实坐标）。 */
export const ORIGIN = { lon: 126.6254, lat: 45.76, name: '哈尔滨' };

const M_PER_DEG_LAT = 111320;
const mPerDegLon = (lat) => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);

/** 经纬度 → 以哈尔滨站为原点的局部米坐标：x 向东，z 向南（与 Three 的 -Z 前进一致）。 */
export function geoToXY(lon, lat) {
  return {
    x: (lon - ORIGIN.lon) * mPerDegLon(ORIGIN.lat),
    z: -(lat - ORIGIN.lat) * M_PER_DEG_LAT,
  };
}

export function xyToGeo(x, z) {
  return {
    lon: ORIGIN.lon + x / mPerDegLon(ORIGIN.lat),
    lat: ORIGIN.lat - z / M_PER_DEG_LAT,
  };
}

/** 球面距离（米），用于把站点经纬度换算成真实区间里程。 */
export function geoDistance(lon1, lat1, lon2, lat2) {
  const R = 6371008.8;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// -------------------------------------------------------------- 分块 ----

/**
 * 场景分块：列车沿 -Z 前进，chunk 的 id = floor(travel / CHUNK.length)。
 * 只保留 [id - behind, id + ahead] 区间，出区间即回收。
 */
export const CHUNK = {
  length: 400, // 每块 400 m
  ahead: 7, // 前方 7 块 = 2.8 km
  behind: 2, // 后方 2 块 = 0.8 km
  maxAlive: 10,
  ruralPeriod: 400, // 郊外重复块周期，与块长对齐，滚动取模即可无缝
};

/** 市区真实加载半径：离哈尔滨站 30 km 内才按真实经纬度摆站与地标。 */
export const CITY_RADIUS_M = 30000;
/** 站房触发距离：距站点中心这个范围内才实例化真实站房。 */
export const STATION_TRIGGER_M = 1200;
/** 地标触发距离。 */
export const LANDMARK_TRIGGER_M = 2600;

/**
 * 依据里程判定这一块该画什么。realm 只影响「用什么内容」，不影响里程。
 * - 'hub'      主要枢纽站（真实站房 + 站台 + 雨棚 + 站前广场）
 * - 'depot'    车辆段 / 动车段 / 机务段
 * - 'urban'    城区建筑群（真实相对方位的楼群与地标）
 * - 'landmark' 标志性地标段
 * - 'rural'    可重复的田地 / 草地 / 林地 / 河流
 */
export const CHUNK_KIND = Object.freeze({
  HUB: 'hub',
  DEPOT: 'depot',
  URBAN: 'urban',
  LANDMARK: 'landmark',
  RURAL: 'rural',
});

// ------------------------------------------------------------ 画质 ----

export const QUALITY = [
  { id: 'low', label: '流畅', ratio: 0.7, shadow: 512, ahead: 4, buildingDensity: 0.45, snow: 500 },
  { id: 'mid', label: '均衡', ratio: 1.0, shadow: 1024, ahead: 7, buildingDensity: 0.75, snow: 1200 },
  { id: 'high', label: '精细', ratio: 1.5, shadow: 2048, ahead: 9, buildingDensity: 1.0, snow: 2200 },
];

/** 单帧预算，验收口径：零 console error + 这三项不超。 */
export const BUDGET = { calls: 64, triangles: 140000, textures: 18 };

export const CAMERA = {
  fov: 52,
  near: 0.5,
  far: 4200,
  focusY: 2.4,
  minDistance: 8,
  maxDistance: 600,
};

/** 三套主题（沿用 detail 页的三灯 + 雾 + 环境色思路，数值按长途场景放宽）。 */
export const THEMES = {
  day: {
    label: '晴昼',
    sky: [0x9dbfe0, 0xc7dced, 0xe8f1f7],
    fog: 0xcbdce9,
    fogDensity: 0.00042,
    ground: 0xa8b6a4,
    hemi: { sky: 0xbcd6ef, ground: 0x5d6b58, intensity: 0.85 },
    key: { color: 0xfff0d8, intensity: 2.0, azimuth: -0.8, elevation: 0.62 },
    rim: { color: 0x9fc4ea, intensity: 0.75, azimuth: 2.3, elevation: 0.35 },
    env: { zenith: '#4d7fb5', horizon: '#c7dced', glow: '#fff0d4', ground: '#6c7a6a', sun: 0.55 },
    envIntensity: 0.85,
    exposure: 1.0,
  },
  dusk: {
    label: '暮色',
    sky: [0x25365a, 0x6b5a74, 0xd59775],
    fog: 0x7b6f7d,
    fogDensity: 0.00062,
    ground: 0x5b6156,
    hemi: { sky: 0x6f7fae, ground: 0x3d3a38, intensity: 0.6 },
    key: { color: 0xffb578, intensity: 1.7, azimuth: 2.0, elevation: 0.22 },
    rim: { color: 0x8aa5d8, intensity: 1.1, azimuth: -1.4, elevation: 0.3 },
    env: { zenith: '#25365a', horizon: '#d59775', glow: '#ffd2a1', ground: '#3b3a38', sun: 0.7 },
    envIntensity: 0.8,
    exposure: 1.05,
  },
  night: {
    label: '寒夜',
    sky: [0x050a14, 0x101d33, 0x22344e],
    fog: 0x101d2e,
    fogDensity: 0.0009,
    ground: 0x3a4652,
    hemi: { sky: 0x2b4266, ground: 0x141a22, intensity: 0.45 },
    key: { color: 0xffd2a1, intensity: 1.35, azimuth: -0.62, elevation: 0.34 },
    rim: { color: 0x74b6ff, intensity: 1.6, azimuth: 2.5, elevation: 0.22 },
    env: { zenith: '#050a14', horizon: '#2c4763', glow: '#ffb877', ground: '#161d26', sun: 0.32 },
    envIntensity: 0.85,
    exposure: 1.08,
  },
};

/**
 * 7 个机位预设。列车固定在原点、车头朝 -Z，所以「看前方场景」的机位必须把
 * 相机放在列车**后方（+Z）**、让 target 落在前方（负 Z），否则会朝车尾看，
 * 前方刚建出来的站房和城市全在镜头背后。
 * offset = 相机绝对坐标；aim = 视点（controls.target）的 z。
 */
export const VIEWS = [
  { id: 'cab', label: '司机视角', offset: [1.6, 3.8, -62], aim: -140 },
  { id: 'hero', label: '英雄机位', offset: [34, 13, 42], aim: -18 },
  { id: 'side', label: '侧向平视', offset: [58, 5.5, 6], aim: -10 },
  { id: 'above', label: '俯瞰线路', offset: [0, 95, 70], aim: -60 },
  { id: 'station', label: '进站视角', offset: [-30, 15, 48], aim: -110 },
  { id: 'skyline', label: '城市天际线', offset: [115, 62, 140], aim: -70 },
  { id: 'rear', label: '车尾回望', offset: [18, 8, -58], aim: 10 },
];

/** 演示速度上限（m/s）。真实里程按 travel 累加，不用它做画面缩放。 */
export const MOTION = { maxKmh: 300, defaultKmh: 120, acceleration: 18, deceleration: 26 };

// ------------------------------------------------- 各子模块统一接口约定 ----
//
// stations.js   → export const STATION_CATALOG: Array<Station>
//                 export function buildStation(id, opts?): THREE.Group
//                 export function buildDepot(kind, opts?): THREE.Group
//                 export function disposeStations(): void
//                 Station = { id, name, lon, lat, kind: 'hub'|'local', tier, architect, note }
//                 返回 Group 的局部原点 = 站房中心，轨道沿 Z，站台在 x≈±6，
//                 所有几何必须已按材质合并或 InstancedMesh，单站 ≤ 8 个 mesh。
//
// buildings.js  → export const BUILDING_CATALOG: Array<BuildingType>
//                 export function createBuildingFactory(): Factory
//                 Factory = { make(typeId, opts?): THREE.Group,
//                             instanced(typeId, specs, opts?): THREE.InstancedMesh,
//                             catalog, dispose() }
//                 BuildingType = { id, category:'residential'|'office'|'commercial'|'landmark',
//                                  name, style, note, sources }
//                 每个 category 至少 4 个 id；住宅/办公/商业走 InstancedMesh 模板，
//                 地标可单独 Group。单类型 ≤ 4 draw call。
//
// terrain.js    → export function buildTerrain(theme): Terrain
//                 Terrain = { group, scroll(travel), applyTheme(theme), dispose() }
//                 export function buildHarbinBase(): THREE.Group   // 市区真实底图
//                 export const WATERWAYS / ROADS 等真实几何常量
//                 郊外重复块必须与 CHUNK.ruralPeriod 对齐，scroll() 取模无缝。
//
// route-data.js → export const ROUTES: Route[]
//                 Route = { id, name, officialKm, speed, nodes: Node[], color, sources }
//                 Node = { name, lon, lat, km, role:'hub'|'local'|'landmark'|'depot', stationId? }
//                 export function routeById(id): Route
//                 export function nearestNode(route, km, radiusM): Node|null
//
// stream.js     → export function visibleChunks(route, travel, ahead, behind): Chunk[]
//                 Chunk = { id, km, kind, seed, nodes: Node[], stationId?, landmarkIds? }
//                 export function chunkAt(route, km): Chunk
//                 纯函数，不碰 THREE，便于单测；集成层据此构建 / 回收 Group。

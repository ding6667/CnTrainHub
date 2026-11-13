/**
 * stream.js —— 纯函数式「里程流式调度」：按列车走过的真实里程决定渲染什么，
 * 绝不生成全量地图。只保留 [id-behind, id+ahead] 的窗口块，出窗口即由集成层回收。
 *
 * 单位契约（务必与 route-data.js 一致，别混用）：
 *  - Route.officialKm / Node.km / Chunk.km / 本文件所有 `km` 形参：公里（km）。
 *  - visibleChunks 的 travelMeters 形参：米（m），与 config 的
 *    id = Math.floor(travelMeters / CHUNK.length) 对齐（CHUNK.length = 400 m）。
 *  - radiusM / STATION_TRIGGER_M / LANDMARK_TRIGGER_M / CITY_RADIUS_M：米（m）。
 *  - 换算：meters = km * 1000；chunkId = Math.floor(km * 1000 / CHUNK.length)。
 *    因此 chunkAt(route, cid*CHUNK.length/1000) 的 id 恰为 cid，与
 *    visibleChunks 里 floor(travelMeters/CHUNK.length) 完全一致。
 *
 * 判定：kind 取「离块中心里程最近的触发特征」（hub/local、depot、landmark 分别按各自
 * 触发半径判定），同距时 hub > depot > landmark；三类都没触发时，哈尔滨站
 * CITY_RADIUS_M 内为 urban，否则 rural（config.CHUNK_KIND）。
 * 用「最近特征」而不是固定 hub 优先，是因为市区 0~10 km 内枢纽密集，
 * 固定优先会让 depot / landmark 块永远不出现。
 * 距离一律按「里程差 |Δkm|*1000 米」度量（config「里程严格」口径），
 * 只有「是否在哈尔滨市区」用真实经纬度球面距离 geoDistance 与 CITY_RADIUS_M 比较。
 *
 * 【与 terrain 的衔接】Chunk.seed = 稳定整数哈希(chunk id + route id)，按任务要求保持该语义。
 * 注意分工（与 terrain-modeler-2 对齐）：terrain 的郊外块是「完全相同的 400 m 周期模板」，
 * 靠 travel % CHUNK.length 平移实现无缝，取模回跳时内容不能变，因此 terrain 不消费 seed。
 * seed 只适合 stations.js / buildings.js 这类「按 chunk 触发实例化、出视野即回收」的模块
 * 用做确定性随机源；本文件不改写 seed，也不要求任何模块必须消费它。
 * 负 id（起点 behind 窗口）同样有稳定 seed，且不抛错。
 *
 * 纯函数：无副作用、不 import THREE、不碰 DOM、不缓存可变状态。
 */
import {
  CHUNK,
  CHUNK_KIND,
  STATION_TRIGGER_M,
  LANDMARK_TRIGGER_M,
  CITY_RADIUS_M,
  ORIGIN,
  geoDistance,
} from './config.js';

const M_PER_KM = 1000;
const STATION_ROLES = ['hub', 'local'];

/** 稳定整数哈希：chunk id + route id → uint32。同一 (route,id) 永远同一 seed。 */
function chunkSeed(routeId, id) {
  let h = 2166136261 >>> 0; // FNV-1a 初值
  const s = `${routeId}#${id}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= id | 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** 在给定 km 处按相邻节点线性插值出经纬度（超出端点则钳到端点）。 */
function positionAtKm(route, km) {
  const n = route.nodes;
  if (!n || n.length === 0) return { lon: ORIGIN.lon, lat: ORIGIN.lat };
  if (km <= n[0].km) return { lon: n[0].lon, lat: n[0].lat };
  const last = n[n.length - 1];
  if (km >= last.km) return { lon: last.lon, lat: last.lat };
  for (let i = 0; i < n.length - 1; i++) {
    const a = n[i];
    const b = n[i + 1];
    if (km >= a.km && km <= b.km) {
      const span = b.km - a.km;
      const t = span > 0 ? (km - a.km) / span : 0;
      return { lon: a.lon + (b.lon - a.lon) * t, lat: a.lat + (b.lat - a.lat) * t };
    }
  }
  return { lon: last.lon, lat: last.lat };
}

/** 中心里程 ckm 附近、指定角色中里程距离最近且在 radiusM 内的节点。 */
function nearestRole(nodes, ckm, roles, radiusM) {
  const limitKm = radiusM / M_PER_KM;
  let best = null;
  let bestD = Infinity;
  for (const n of nodes) {
    if (!roles.includes(n.role)) continue;
    const d = Math.abs(n.km - ckm);
    if (d <= limitKm && d < bestD) {
      best = n;
      bestD = d;
    }
  }
  return best;
}

/** 按 name(+km) 去重，供 chunk.nodes 合并 span 节点与触发节点。 */
function dedupeNodes(list) {
  const seen = new Set();
  const out = [];
  for (const n of list) {
    const key = `${n.name}@${n.km}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(n);
    }
  }
  return out;
}

/**
 * 单个窗口块。km 为公里；内部换算成米求 id。
 * Chunk = { id, km, kind, seed, nodes, stationId?, landmarkIds?, urban?, depot? }
 *  - km  : 块起点里程（km），可直接换算成 Three 的 z = -km*1000。
 *  - kind: config.CHUNK_KIND 之一。
 *  - seed: chunk id + route id 的稳定整数哈希（rural 重复块取模用）。
 *  - nodes: 本块 span 内的节点 + 触发本块类型的节点（已去重）。
 *    相邻块可能共享同一触发节点，集成层按 name/stationId 去重再做实例化即可。
 */
export function chunkAt(route, km) {
  const nodes = (route && route.nodes) || [];
  const routeId = (route && route.id) || 'route';

  const meters = km * M_PER_KM;
  const id = Math.floor(meters / CHUNK.length);
  const startKm = (id * CHUNK.length) / M_PER_KM;
  const endKm = ((id + 1) * CHUNK.length) / M_PER_KM;
  const centerKm = (startKm + endKm) / 2;

  // 该块 span 内（按 chunk id 分区）的节点。
  const inSpan = nodes.filter((n) => Math.floor((n.km * M_PER_KM) / CHUNK.length) === id);

  // 触发扫描：以块中心里程为准，按里程差判定。
  const stationTrig = nearestRole(nodes, centerKm, STATION_ROLES, STATION_TRIGGER_M);
  const depotTrig = nearestRole(nodes, centerKm, ['depot'], STATION_TRIGGER_M);
  const landmarkNear = nearestRole(nodes, centerKm, ['landmark'], LANDMARK_TRIGGER_M);
  const landmarkTrig = nodes.filter(
    (n) => n.role === 'landmark' && Math.abs(n.km - centerKm) * M_PER_KM <= LANDMARK_TRIGGER_M,
  );

  // 市区判定：块中心真实经纬度到哈尔滨站（ORIGIN）的球面距离。
  const pos = positionAtKm(route, centerKm);
  const cityDistM = geoDistance(pos.lon, pos.lat, ORIGIN.lon, ORIGIN.lat);
  const urban = cityDistM <= CITY_RADIUS_M;

  // kind 由「离块中心最近的触发特征」决定（同距时 hub > depot > landmark）。
  // 哈尔滨市区 0~10 km 内枢纽/车辆段/地标密集，若固定 hub 优先会让 depot/landmark 永不出现，
  // 因此这里按里程距离择最近者，保证「距车辆段→depot、距地标→landmark」真正可达。
  const cands = [];
  if (stationTrig) cands.push({ d: Math.abs(stationTrig.km - centerKm), p: 0, kind: CHUNK_KIND.HUB });
  if (depotTrig) cands.push({ d: Math.abs(depotTrig.km - centerKm), p: 1, kind: CHUNK_KIND.DEPOT });
  if (landmarkNear) cands.push({ d: Math.abs(landmarkNear.km - centerKm), p: 2, kind: CHUNK_KIND.LANDMARK });
  cands.sort((a, b) => (a.d - b.d) || (a.p - b.p));
  const kind = cands.length > 0 ? cands[0].kind : (urban ? CHUNK_KIND.URBAN : CHUNK_KIND.RURAL);

  // 只要触发范围内存在该类特征就给出标识（可能多于 kind 所指）；
  // 集成层按 kind 选主内容、按 nodes 决定实例化哪些对象。
  const stationId = stationTrig ? (stationTrig.stationId || stationTrig.name) : undefined;
  const depot = depotTrig ? (depotTrig.stationId || depotTrig.name) : undefined;
  const landmarkIds = landmarkTrig.length > 0
    ? landmarkTrig.map((n) => n.landmarkId || n.name)
    : undefined;

  const merged = dedupeNodes([
    ...inSpan,
    ...(stationTrig ? [stationTrig] : []),
    ...(depotTrig ? [depotTrig] : []),
    ...landmarkTrig,
  ]);

  return {
    id,
    km: startKm,
    kind,
    seed: chunkSeed(routeId, id),
    nodes: merged,
    ...(stationId ? { stationId } : {}),
    ...(landmarkIds ? { landmarkIds } : {}),
    ...(depot ? { depot } : {}),
    urban,
  };
}

/**
 * 只返回列车前后窗口内的块：id = floor(travelMeters / CHUNK.length)，
 * 范围 [id - behind, id + ahead]。travelMeters 单位是米。
 * ahead/behind 省略时取 config.CHUNK 默认值（7 / 2）。
 * 注意：这里绝不遍历整条线路，复杂度 O(ahead+behind)，与 officialKm 无关。
 */
export function visibleChunks(route, travelMeters, ahead = CHUNK.ahead, behind = CHUNK.behind) {
  const id = Math.floor(travelMeters / CHUNK.length);
  const out = [];
  for (let cid = id - behind; cid <= id + ahead; cid++) {
    // cid*CHUNK.length/1000 是块起点公里数；传入 chunkAt 后得到的 id 恰为 cid。
    out.push(chunkAt(route, (cid * CHUNK.length) / M_PER_KM));
  }
  return out;
}

/**
 * HUD 文案：「上一站 → 下一站 · 剩余 x.x km」。km 为公里。
 * 站名只取站点类节点（hub/local），避免把地标/车辆段当站名显示。
 */
export function segmentLabel(route, km) {
  const all = (route && route.nodes) || [];
  const stations = all.filter((n) => STATION_ROLES.includes(n.role));
  const seq = stations.length > 0 ? stations : all;
  if (seq.length === 0) return '起点 · 剩余 0.0 km';

  let prev = null;
  let next = null;
  for (const n of seq) {
    if (n.km <= km) prev = n;
    else if (next === null) next = n;
  }
  const prevName = prev ? prev.name : seq[0].name;
  const nextName = next ? next.name : '终点';
  const remain = next ? Math.max(0, next.km - km) : 0;
  return `${prevName} → ${nextName} · 剩余 ${remain.toFixed(1)} km`;
}

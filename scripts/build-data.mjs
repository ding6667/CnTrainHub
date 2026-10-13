/**
 * Regenerate the checked-in datasets from real sources:
 *
 *   data/stations.json         12306 station_name.js (names/telecodes) x
 *                              @railroute-ts/china (coordinates) x
 *                              chinese-global-compliant-geodata chn-level-2 (prefecture polygon
 *                              point-in-polygon -> province, and the 省会/地级市/县级 tier)
 *   data/railways.json         shortest paths over the @railroute-ts/china OSM network
 *   data/railway-bureaus.json  bureau HQ cities resolved to network stations
 *   data/china-provinces.json  chn-level-1 polygons + maritime boundary lines
 *
 * Sources live in .cache/ (gitignored). See README "重新生成数据".
 * Usage: npm run build:data
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { railRoute } from 'railroute-ts';
import { CHINA_NETWORK, CHINA_STATIONS } from '@railroute-ts/china';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data');
const CACHE = path.join(ROOT, '.cache');

const readCache = (name) => {
  const file = path.join(CACHE, name);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
};

/* ---------------- station name matching ---------------- */

// OSM English names carry directional words where 12306 pinyin uses
// transliterated ones (Changsha South <-> changshanan).
const SUFFIX_MAP = [
  [/\s+railway station$/i, ''],
  [/\s+station$/i, ''],
  [/\s+south$/i, 'nan'],
  [/\s+east$/i, 'dong'],
  [/\s+north$/i, 'bei'],
  [/\s+west$/i, 'xi'],
];
const ROMANIZATION = [
  ['haerbin', 'harbin'],
  ['qiqihaer', 'qiqihaer'],
  ['huhehaote', 'hohhot'],
  ['wulumuqi', 'urumqi'],
  ['xining', 'xining'],
];

const key = (s) => s.toLowerCase().replace(/['’`\-\s_.]/g, '');

function stationKeys(name) {
  let s = name;
  for (const [re, rep] of SUFFIX_MAP) s = s.replace(re, rep);
  const out = new Set([key(s), key(name)]);
  for (const [from, to] of ROMANIZATION) {
    for (const k of [...out]) {
      if (k.includes(to)) out.add(k.replace(to, from));
    }
  }
  return [...out].filter(Boolean);
}

const STATION_INDEX = new Map();
for (const s of CHINA_STATIONS) {
  for (const k of stationKeys(s.name)) {
    const list = STATION_INDEX.get(k);
    if (!list) STATION_INDEX.set(k, [s]);
    else if (!list.includes(s)) list.push(s);
  }
}

/** @returns {Array} every network station sharing this romanisation - pinyin is ambiguous. */
const lookupAll = (name) => STATION_INDEX.get(key(name)) ?? [];
const lookup = (name) => lookupAll(name)[0] ?? null;

function resolve(name) {
  const hit = lookup(name);
  if (!hit) throw new Error(`station not found in @railroute-ts/china: ${name}`);
  return hit;
}

function resolveWaypoints(names) {
  const kept = [];
  for (const n of names) {
    const hit = lookup(n);
    if (hit) kept.push(hit);
    else console.warn(`  ! waypoint not in network, skipped: ${n}`);
  }
  return kept;
}

/* ---------------- geometry helpers ---------------- */

function rdp(points, epsilon) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDist = -1;
    let index = -1;
    const [x1, y1] = points[first];
    const [x2, y2] = points[last];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const denom = Math.hypot(dx, dy);
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i];
      const d =
        denom === 0
          ? Math.hypot(px - x1, py - y1)
          : Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / denom;
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > epsilon && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function round(points, digits = 4) {
  const f = 10 ** digits;
  return points.map(([lng, lat]) => [Math.round(lng * f) / f, Math.round(lat * f) / f]);
}

function dedupe(points) {
  const out = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
  }
  return out;
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function ringBBox(ring) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/* ---------------- province outline ---------------- */

function simplifyGeometry(geometry, epsilon) {
  switch (geometry.type) {
    case 'Polygon':
      return { type: 'Polygon', coordinates: geometry.coordinates.map((r) => round(rdp(r, epsilon), 3)) };
    case 'MultiPolygon':
      return {
        type: 'MultiPolygon',
        coordinates: geometry.coordinates.map((p) => p.map((r) => round(rdp(r, epsilon), 3))),
      };
    case 'LineString':
      return { type: 'LineString', coordinates: round(rdp(geometry.coordinates, epsilon), 3) };
    case 'MultiLineString':
      return {
        type: 'MultiLineString',
        coordinates: geometry.coordinates.map((r) => round(rdp(r, epsilon), 3)),
      };
    default:
      return geometry;
  }
}

function buildProvinces(epsilon = 0.02) {
  const fc = readCache('chn-level-1.json');
  if (!fc) {
    console.warn('! .cache/chn-level-1.json missing - skipped province outline');
    return null;
  }
  // 境界线 carries the maritime boundary lines (incl. the South China Sea
  // dashes); the province polygons carry the islands themselves. Keep both.
  const features = fc.features.map((f) => {
    const isLine = f.geometry.type.endsWith('LineString');
    return {
      type: 'Feature',
      properties: {
        name: f.properties.name,
        full_name: f.properties.full_name,
        gb: f.properties.gb,
        kind: isLine ? 'boundary-line' : 'province',
      },
      geometry: simplifyGeometry(f.geometry, isLine ? 0.004 : epsilon),
    };
  });
  const lines = features.filter((f) => f.properties.kind === 'boundary-line').length;
  return {
    type: 'FeatureCollection',
    metadata: {
      source: 'chinese-global-compliant-geodata / chn-level-1.json',
      license: 'MIT',
      rdpEpsilonDeg: epsilon,
      features: features.length,
      provinces: features.length - lines,
      boundaryLines: lines,
    },
    features,
  };
}

/* ---------------- stations ---------------- */

const CAPITALS = new Set([
  '北京', '天津', '上海', '重庆', '石家庄', '太原', '呼和浩特', '沈阳', '长春', '哈尔滨',
  '南京', '杭州', '合肥', '福州', '南昌', '济南', '郑州', '武汉', '长沙', '广州',
  '南宁', '海口', '成都', '贵阳', '昆明', '拉萨', '西安', '兰州', '西宁', '银川',
  '乌鲁木齐', '台北', '香港', '澳门',
]);

// Province-level assignment; 内蒙古/东北 have known cross-bureau pockets.
const PROVINCE_BUREAU = {
  北京: '北京局', 天津: '北京局', 河北: '北京局', 山西: '太原局', 内蒙古: '呼和浩特局',
  辽宁: '沈阳局', 吉林: '沈阳局', 黑龙江: '哈尔滨局', 上海: '上海局', 江苏: '上海局',
  浙江: '上海局', 安徽: '上海局', 江西: '南昌局', 福建: '南昌局', 山东: '济南局',
  河南: '郑州局', 湖北: '武汉局', 湖南: '广州局', 广东: '广州局', 广西: '南宁局',
  海南: '广州局', 重庆: '成都局', 四川: '成都局', 贵州: '成都局', 云南: '昆明局',
  西藏: '青藏集团', 青海: '青藏集团', 陕西: '西安局', 甘肃: '兰州局', 宁夏: '兰州局',
  新疆: '乌鲁木齐局',
};
const PREFECTURE_BUREAU = {
  呼伦贝尔: '哈尔滨局', 通辽: '沈阳局', 赤峰: '沈阳局',
};

function parseStationNameJs() {
  const file = path.join(CACHE, 'station_name.js');
  if (!existsSync(file)) return [];
  const raw = readFileSync(file, 'utf8');
  const body = raw.slice(raw.indexOf("'") + 1, raw.lastIndexOf("'"));
  return body
    .split('@')
    .filter(Boolean)
    .map((chunk) => chunk.split('|'))
    .filter((f) => f.length >= 8)
    .map((f) => ({ abbr: f[0], name: f[1], telecode: f[2], pinyin: f[3], city: f[7] }));
}

/** '新疆维吾尔自治区' -> '新疆', so bureau lookups match the short keys. */
const shortProvince = (p) => (p ?? '').replace(/(省|市|自治区|特别行政区|维吾尔|壮族|回族)/g, '');

/** Prefecture polygons with bboxes, for the point-in-polygon tier lookup. */
function buildPrefectures() {
  const fc = readCache('chn-level-2.json');
  if (!fc) return null;
  const cells = [];
  for (const f of fc.features) {
    if (!f.properties.province) continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const rings = [];
    let bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const poly of polys) {
      const ring = poly[0];
      rings.push(rdp(ring, 0.01));
      const r = ringBBox(ring);
      bb = [Math.min(bb[0], r[0]), Math.min(bb[1], r[1]), Math.max(bb[2], r[2]), Math.max(bb[3], r[3])];
    }
    cells.push({ name: f.properties.name, province: shortProvince(f.properties.province), rings, bb });
  }
  return cells;
}

function findPrefecture(cells, lng, lat) {
  for (const c of cells) {
    if (lng < c.bb[0] || lng > c.bb[2] || lat < c.bb[1] || lat > c.bb[3]) continue;
    for (const ring of c.rings) if (pointInRing([lng, lat], ring)) return c;
  }
  return null;
}

// 郑州东 / 长沙南 / 广州北 serve the same urban core as their city root.
const DIRECTIONAL = /[东西南北站]$/;

function buildStations() {
  const rows = parseStationNameJs();
  if (!rows.length) {
    console.warn('! .cache/station_name.js missing - skipped stations');
    return null;
  }
  const cells = buildPrefectures();
  if (!cells) console.warn('! .cache/chn-level-2.json missing - tier falls back to the 12306 city field');

  // Pass 1: resolve coordinates. Pinyin is ambiguous (12306 大理 'dali' vs the
  // Taiwanese Dali), so when several network stations share a romanisation the
  // one whose prefecture matches the 12306 city field wins; otherwise drop it.
  const samePlace = (a, b) => !!a && !!b && (a === b || a.startsWith(b) || b.startsWith(a));
  const pip = (st) => (cells ? findPrefecture(cells, st.coord[0], st.coord[1]) : null);

  const resolved = [];
  const cityProvince = new Map();
  let ambiguous = 0;
  for (const row of rows) {
    const cands = lookupAll(row.pinyin);
    if (!cands.length) continue;

    let pick = null;
    if (cands.length === 1) {
      pick = { st: cands[0], cell: pip(cands[0]) };
    } else {
      for (const st of cands) {
        const cell = pip(st);
        if (cell && samePlace(cell.name, row.city)) {
          pick = { st, cell };
          break;
        }
      }
      if (!pick) ambiguous++;
    }
    // A landing province outside the bureau table means the romanisation hit a
    // different station (e.g. 12306 大理 'dali' vs the Taiwanese Dali) - omit it.
    if (pick?.cell && !PROVINCE_BUREAU[pick.cell.province]) {
      ambiguous++;
      pick = null;
    }
    if (!pick) continue;

    const [lng, lat] = pick.st.coord;
    if (pick.cell && row.city) {
      const tally = cityProvince.get(row.city) ?? new Map();
      tally.set(pick.cell.province, (tally.get(pick.cell.province) ?? 0) + 1);
      cityProvince.set(row.city, tally);
    }
    resolved.push({ ...row, lng, lat, cell: pick.cell, nameEn: pick.st.name });
  }
  if (ambiguous) console.warn(`  ! ${ambiguous} stations dropped: ambiguous pinyin with no city match`);

  const cityToProvince = new Map();
  for (const [city, tally] of cityProvince) {
    cityToProvince.set(city, [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  }

  let noProvince = 0;
  const features = resolved.map((r) => {
    const province = r.cell?.province ?? cityToProvince.get(r.city) ?? null;
    if (!province) noProvince++;
    const prefecture = r.cell?.name ?? r.city;
    const isCapital = CAPITALS.has(prefecture) || CAPITALS.has(r.city);
    const root = prefecture.replace(/(地区|自治州|盟|市|特别行政区)$/, '');
    const isPrincipal = r.name === root || DIRECTIONAL.test(r.name) && r.name.replace(DIRECTIONAL, '') === root;
    const tier = isCapital ? 'capital' : isPrincipal ? 'prefecture' : 'county';
    const rank = isPrincipal ? (isCapital ? 1 : 2) : isCapital ? 2 : 3;
    return {
      type: 'Feature',
      properties: {
        id: r.telecode.toLowerCase(),
        name: r.name,
        nameEn: r.nameEn,
        telecode: r.telecode,
        pinyin: r.pinyin,
        city: prefecture,
        province,
        bureau: PREFECTURE_BUREAU[prefecture] ?? (province ? PROVINCE_BUREAU[province] ?? '' : ''),
        tier,
        rank,
      },
      geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
    };
  });

  const byTier = {};
  for (const f of features) byTier[f.properties.tier] = (byTier[f.properties.tier] ?? 0) + 1;
  const noBureau = features.filter((f) => !f.properties.bureau);
  if (noBureau.length) {
    console.warn(`  ! ${noBureau.length} stations have no bureau (unmapped province) e.g. ${noBureau.slice(0, 6).map((f) => f.properties.name + ':' + f.properties.province).join(', ')}`);
  }
  console.log(`  stations ${features.length}/${rows.length} geocoded; tiers ${JSON.stringify(byTier)}; no province ${noProvince}`);

  return {
    type: 'FeatureCollection',
    metadata: {
      generated: new Date().toISOString().slice(0, 10),
      nameSource: '12306 station_name.js',
      coordinateSource: '@railroute-ts/china (OpenStreetMap, ODbL-1.0)',
      tierSource: 'chn-level-2 prefecture polygon contains the station point',
      bureauNote: '路局按省级归属推断，蒙东/豫南等交界地区存在跨局例外',
      tierLabels: { capital: '省会车站', prefecture: '地级市车站', county: '县级车站' },
      stations: features.length,
    },
    features,
  };
}

/* ---------------- railway lines ---------------- */

/**
 * `from`/`to` name the line endpoints (a list means "try each and keep the
 * route that best matches the published length" - some station nodes sit on
 * disconnected fragments of the OSM graph and force a huge detour). `via` are
 * major hubs, kept only when they do not inflate the endpoint-to-endpoint
 * distance by more than VIA_INFLATION_MAX.
 */
const VIA_INFLATION_MAX = 1.06;
const KM_RATIO_OK = [0.8, 1.35];

function traceRoute(points) {
  let coords = [];
  let km = 0;
  for (let i = 1; i < points.length; i++) {
    const leg = railRoute(points[i - 1], points[i], { network: CHINA_NETWORK, ferries: false });
    km += leg.properties.length;
    const legCoords = leg.geometry.coordinates;
    const prev = coords[coords.length - 1];
    const join = prev && prev[0] === legCoords[0][0] && prev[1] === legCoords[0][1];
    coords = coords.concat(join ? legCoords.slice(1) : legCoords);
  }
  return { coords: dedupe(coords), km };
}

function routeCandidates(spec) {
  const froms = (Array.isArray(spec.from) ? spec.from : [spec.from]).map(lookup).filter(Boolean);
  const tos = (Array.isArray(spec.to) ? spec.to : [spec.to]).map(lookup).filter(Boolean);
  const vias = spec.via.map(lookup).filter(Boolean).map((s) => s.coord);
  const best = [];

  for (const a of froms) {
    for (const b of tos) {
      const base = traceRoute([a.coord, b.coord]);
      const withVia = vias.length ? traceRoute([a.coord, ...vias, b.coord]) : base;
      const chosen = withVia.km <= base.km * VIA_INFLATION_MAX ? withVia : base;
      best.push({ from: a, to: b, ...chosen });
    }
  }
  return best.sort((x, y) => x.km - y.km);
}

function buildRailways() {
  const features = [];
  const dropped = [];

  for (const line of LINES) {
    const routes = routeCandidates(line);
    if (!routes.length) {
      dropped.push([line.name, 'endpoints not in network']);
      continue;
    }
    // Shortest plausible route: the real corridor is the tightest fit.
    const hit = routes.find((r) => {
      const ratio = r.km / line.officialKm;
      return ratio >= KM_RATIO_OK[0] && ratio <= KM_RATIO_OK[1];
    });
    if (!hit) {
      dropped.push([line.name, `best ${Math.round(routes[0].km)} km vs official ${line.officialKm} km`]);
      continue;
    }

    const coords = round(rdp(dedupe(hit.coords), 0.003), 4);
    features.push({
      type: 'Feature',
      properties: {
        id: line.id,
        name: line.name,
        nameEn: line.nameEn,
        types: line.types,
        family: line.family,
        tier: line.tier,
        year: line.year,
        speed: line.speed,
        officialKm: line.officialKm,
        operator: line.operator,
        cities: line.cities,
        lengthKm: Math.round(hit.km),
        endpoints: [hit.from.name, hit.to.name],
        points: coords.length,
      },
      geometry: { type: 'LineString', coordinates: coords },
    });
  }

  for (const [name, why] of dropped) console.warn(`  - dropped ${name}: ${why}`);
  console.log(
    `  lines kept ${features.length}/${LINES.length}, ${Math.round(features.reduce((a, f) => a + f.properties.lengthKm, 0)).toLocaleString('en-US')} km routed`
  );

  return {
    type: 'FeatureCollection',
    metadata: {
      generated: new Date().toISOString().slice(0, 10),
      geometrySource: '@railroute-ts/china (OpenStreetMap, ODbL-1.0)',
      attributeNote: '年份/设计时速/官方里程为公开资料整理值',
      droppedLines: dropped.map(([n, w]) => `${n}: ${w}`),
      note: '完整路网（12 445 条边）在运行时按需加载，见 README「加载全量数据」。',
      lines: features.length,
    },
    features,
  };
}

const LINES = [
  // --- 既有 ---
  { id: 'beijing-shanghai-hsr', name: '京沪高铁', nameEn: 'Beijing-Shanghai HSR', types: ['G'], family: 'hsr', tier: 'trunk', year: 2011, speed: 350, officialKm: 1318, operator: '京沪高铁公司', cities: ['北京南', '天津西', '济南西', '徐州东', '南京南', '上海虹桥'], from: 'Beijingnan', to: 'Shanghai-Hongqiao', via: ['Tianjinxi', 'Jinanxi', 'Xuzhoudong', 'Nanjingnan'] },
  { id: 'beijing-guangzhou-hsr', name: '京广高铁', nameEn: 'Beijing-Guangzhou HSR', types: ['G'], family: 'hsr', tier: 'trunk', year: 2012, speed: 350, officialKm: 2298, operator: '国铁集团', cities: ['北京西', '石家庄', '郑州东', '武汉', '长沙南', '广州南'], from: 'Beijingxi', to: 'Guangzhounan', via: ['Shijiazhuang', 'Zhengzhoudong', 'Wuhan', 'Changsha South'] },
  { id: 'shanghai-kunming-hsr', name: '沪昆高铁', nameEn: 'Shanghai-Kunming HSR', types: ['G'], family: 'hsr', tier: 'trunk', year: 2016, speed: 350, officialKm: 2252, operator: '国铁集团', cities: ['上海虹桥', '杭州东', '南昌西', '长沙南', '贵阳北', '昆明南'], from: 'Shanghai-Hongqiao', to: 'Kunmingnan', via: ['Hangzhoudong', 'Nanchangxi', 'Changsha South', 'Guiyangbei'] },
  { id: 'harbin-dalian-hsr', name: '哈大高铁', nameEn: 'Harbin-Dalian HSR', types: ['G'], family: 'hsr', tier: 'trunk', year: 2012, speed: 350, officialKm: 921, operator: '沈阳局集团', cities: ['哈尔滨西', '长春', '沈阳北', '大连北'], from: 'Harbin West', to: 'Dalianbei', via: ['Changchun', 'Shenyangbei'] },
  { id: 'chengdu-chongqing-hsr', name: '成渝高铁', nameEn: 'Chengdu-Chongqing HSR', types: ['G', 'D', 'C'], family: 'hsr', tier: 'primary', year: 2015, speed: 350, officialKm: 308, operator: '成都局集团', cities: ['成都东', '资阳北', '内江北', '重庆西'], from: 'Chengdudong', to: 'Chongqingxi', via: ['Ziyangbei', 'Neijiangbei'] },
  { id: 'xian-chengdu-hsr', name: '西成高铁', nameEn: 'Xi-an-Chengdu HSR', types: ['G', 'D'], family: 'hsr', tier: 'primary', year: 2017, speed: 250, officialKm: 643, operator: '西安局 / 成都局', cities: ['西安北', '汉中', '广元', '绵阳', '成都东'], from: "Xi'anbei", to: 'Chengdudong', via: ['Hanzhong', 'Guangyuan', 'Mianyang'] },
  { id: 'beijing-tianjin-intercity', name: '京津城际', nameEn: 'Beijing-Tianjin Intercity', types: ['C', 'G'], family: 'intercity', tier: 'primary', year: 2008, speed: 350, officialKm: 150, operator: '京津城际铁路公司', cities: ['北京南', '武清', '天津'], from: 'Beijingnan', to: 'Tianjin', via: ['Wuqing'] },
  { id: 'longhai-conventional', name: '陇海铁路', nameEn: 'Longhai Railway', types: ['K', 'T', 'Z'], family: 'conventional', tier: 'trunk', year: 1952, speed: 120, officialKm: 1759, operator: '兰州局 / 西安局 / 郑州局 / 上海局', cities: ['连云港', '徐州', '郑州', '西安', '宝鸡', '天水', '兰州'], from: 'Lianyungang', to: 'Lanzhou', via: ['Xuzhou', 'Zhengzhou', "Xi'an", 'Baoji', 'Tianshui'] },

  // --- 高铁 / 动车干线 ---
  { id: 'beijing-zhangjiakou-hsr', name: '京张高铁', nameEn: 'Beijing-Zhangjiakou HSR', types: ['G'], family: 'hsr', tier: 'primary', year: 2019, speed: 350, officialKm: 174, operator: '北京局集团', cities: ['北京北', '下花园北', '宣化北', '张家口'], from: 'Beijingbei', to: 'Zhangjiakou', via: [] },
  { id: 'beijing-xiongan-intercity', name: '京雄城际', nameEn: 'Beijing-Xiongan Intercity', types: ['C', 'G'], family: 'intercity', tier: 'primary', year: 2020, speed: 350, officialKm: 92, operator: '北京局集团', cities: ['北京西', '大兴', '雄安'], from: ['Beijingxi','Beijing'], to: ['Xiongan','Xionganxiong'], via: [] },
  { id: 'guangzhou-shenzhen-hsr', name: '广深港高铁', nameEn: 'Guangzhou-Shenzhen HSR', types: ['G'], family: 'hsr', tier: 'primary', year: 2018, speed: 350, officialKm: 143, operator: '广州局集团', cities: ['广州南', '东莞', '深圳北', '香港西九龙'], from: ['Guangzhounan','Guangzhou'], to: ['Shenzhen North','Futian','Shenzhen'], via: [] },
  { id: 'guiyang-guangzhou-hsr', name: '贵广高铁', nameEn: 'Guiyang-Guangzhou HSR', types: ['G', 'D'], family: 'hsr', tier: 'trunk', year: 2014, speed: 250, officialKm: 857, operator: '广州局 / 成都局', cities: ['贵阳北', '桂林西', '柳州', '梧州', '广州南'], from: 'Guiyangbei', to: 'Guangzhounan', via: ['Liuzhou', 'Wuzhou', 'Zhaoqing'] },
  { id: 'lanzhou-urumqi-hsr', name: '兰新高铁', nameEn: 'Lanzhou-Urumqi HSR', types: ['D', 'G'], family: 'hsr', tier: 'trunk', year: 2014, speed: 250, officialKm: 1786, operator: '兰州局 / 乌鲁木齐局', cities: ['兰州西', '西宁', '哈密', '吐鲁番北', '乌鲁木齐'], from: 'Lanzhouxi', to: 'Urumqi', via: ['Xining', 'Hami'] },
  { id: 'shanghai-nanjing-intercity', name: '沪宁城际', nameEn: 'Shanghai-Nanjing Intercity', types: ['C', 'G', 'D'], family: 'intercity', tier: 'primary', year: 2010, speed: 250, officialKm: 301, operator: '上海局集团', cities: ['上海', '苏州', '无锡', '常州', '镇江', '南京'], from: ['Shanghai','Shanghai-Hongqiao'], to: ['Nanjingnan','Nanjing'], via: ['Suzhou', 'Wuxi', 'Changzhoubei', 'Zhenjiang'] },
  { id: 'shanghai-hangzhou-hsr', name: '沪杭高铁', nameEn: 'Shanghai-Hangzhou HSR', types: ['G'], family: 'hsr', tier: 'primary', year: 2010, speed: 350, officialKm: 160, operator: '上海局集团', cities: ['上海虹桥', '嘉兴南', '杭州东'], from: 'Shanghai-Hongqiao', to: 'Hangzhoudong', via: [] },
  { id: 'nanjing-hangzhou-hsr', name: '宁杭高铁', nameEn: 'Nanjing-Hangzhou HSR', types: ['G', 'D'], family: 'hsr', tier: 'primary', year: 2013, speed: 350, officialKm: 256, operator: '上海局集团', cities: ['南京南', '宜兴', '湖州', '杭州东'], from: ['Nanjingnan','Nanjing'], to: ['Hangzhoudong','Hangzhou'], via: [] },
  { id: 'zhengzhou-xian-hsr', name: '郑西高铁', nameEn: 'Zhengzhou-Xi-an HSR', types: ['G'], family: 'hsr', tier: 'trunk', year: 2010, speed: 350, officialKm: 503, operator: '郑州局 / 西安局', cities: ['郑州东', '洛阳龙门', '三门峡南', '西安北'], from: 'Zhengzhoudong', to: "Xi'anbei", via: ['Luoyang Longmen', 'Sanmenxia', 'Weinan'] },
  { id: 'shijiazhuang-taiyuan-pdl', name: '石太客运专线', nameEn: 'Shijiazhuang-Taiyuan PDL', types: ['G', 'D'], family: 'hsr', tier: 'primary', year: 2009, speed: 250, officialKm: 190, operator: '北京局 / 太原局', cities: ['石家庄', '阳泉北', '太原南'], from: 'Shijiazhuang', to: 'Taiyuannan', via: [] },
  { id: 'datong-xian-hsr', name: '大西高铁', nameEn: 'Datong-Xi-an HSR', types: ['G', 'D'], family: 'hsr', tier: 'primary', year: 2018, speed: 250, officialKm: 859, operator: '太原局 / 西安局', cities: ['大同南', '太原南', '临汾西', '运城北', '西安北'], from: ['Datong', 'Datongnan'], to: "Xi'anbei", via: ['Taiyuannan', 'Linfen', 'Yuncheng'] },
  { id: 'zhengzhou-chongqing-hsr', name: '郑渝高铁', nameEn: 'Zhengzhou-Chongqing HSR', types: ['G'], family: 'hsr', tier: 'trunk', year: 2022, speed: 350, officialKm: 818, operator: '郑州局 / 成都局', cities: ['郑州东', '襄阳东', '兴山', '巫山', '重庆北'], from: 'Zhengzhoudong', to: 'Chongqingbei', via: ['Xiangyangdong', 'Wanzhoubei'] },
  { id: 'wuhan-yichang-railway', name: '汉宜铁路', nameEn: 'Wuhan-Yichang Railway', types: ['D', 'C'], family: 'hsr', tier: 'primary', year: 2012, speed: 200, officialKm: 293, operator: '武汉局集团', cities: ['汉口', '天门南', '荆州', '宜昌东'], from: ['Hankou','Wuhan'], to: ['Yichangdong','Yichangbei','Yichang'], via: [] },
  { id: 'yichang-wanzhou-railway', name: '宜万铁路', nameEn: 'Yichang-Wanzhou Railway', types: ['K', 'T'], family: 'conventional', tier: 'primary', year: 2010, speed: 160, officialKm: 377, operator: '武汉局 / 成都局', cities: ['宜昌东', '建始', '利川', '万州'], from: ['Yichangdong','Yichangbei'], to: ['Wanzhou','Wanzhoubei'], via: ['Lichuan'] },
  { id: 'shenyang-dandong-pdl', name: '沈丹客专', nameEn: 'Shenyang-Dandong PDL', types: ['C', 'D', 'G'], family: 'intercity', tier: 'primary', year: 2015, speed: 250, officialKm: 208, operator: '沈阳局集团', cities: ['沈阳', '本溪', '丹东'], from: 'Shenyang', to: 'Dandong', via: [] },
  { id: 'changchun-hunchun-intercity', name: '长珲城际', nameEn: 'Changchun-Hunchun Intercity', types: ['C', 'D'], family: 'intercity', tier: 'primary', year: 2015, speed: 250, officialKm: 471, operator: '沈阳局集团', cities: ['长春', '吉林', '延吉', '珲春'], from: 'Changchun', to: 'Yanji', via: ['Jilin'] },
  { id: 'harbin-qiqihar-hsr', name: '哈齐高铁', nameEn: 'Harbin-Qiqihar HSR', types: ['D', 'G'], family: 'hsr', tier: 'primary', year: 2015, speed: 250, officialKm: 286, operator: '哈尔滨局集团', cities: ['哈尔滨', '安达', '大庆西', '齐齐哈尔'], from: ['Harbin','Harbin West'], to: ["Qiqiha'er","Qiqiha'ernan"], via: [] },
  { id: 'beijing-shenyang-hsr', name: '京哈高铁京沈段', nameEn: 'Beijing-Senyang HSR', types: ['G'], family: 'hsr', tier: 'trunk', year: 2021, speed: 350, officialKm: 698, operator: '北京局 / 沈阳局', cities: ['北京朝阳', '承德南', '阜新', '沈阳北'], from: 'Beijingxi', to: 'Shenyangbei', via: [] },
  { id: 'xiamen-shenzhen-railway', name: '厦深铁路', nameEn: 'Xiamen-Shenzhen Railway', types: ['D', 'G'], family: 'hsr', tier: 'trunk', year: 2013, speed: 250, officialKm: 553, operator: '广州局 / 南昌局', cities: ['厦门', '潮汕', '惠州南', '深圳北'], from: ['Xiamen','Xiamen North'], to: ['Shenzhen North','Shenzhen'], via: ['Chaoshan', 'Huizhou'] },
  { id: 'nanning-kunming-hsr', name: '云桂高铁', nameEn: 'Nanning-Kunming HSR', types: ['D', 'G'], family: 'hsr', tier: 'trunk', year: 2016, speed: 250, officialKm: 1092, operator: '南宁局 / 昆明局', cities: ['南宁东', '百色', '普者黑', '昆明南'], from: 'Nanningdong', to: 'Kunmingnan', via: ['Baise', 'Puzhehei'] },

  // --- 普速干线 ---
  { id: 'beijing-guangzhou-conventional', name: '京广铁路', nameEn: 'Beijing-Guangzhou Railway', types: ['K', 'T', 'Z'], family: 'conventional', tier: 'trunk', year: 1988, speed: 120, officialKm: 2324, operator: '国铁集团', cities: ['北京', '郑州', '武汉', '长沙', '衡阳', '广州'], from: 'Beijing', to: 'Guangzhou', via: ['Zhengzhou', 'Wuhan', 'Changsha', 'Hengyang', 'Shaoguan'] },
  { id: 'beijing-shanghai-conventional', name: '京沪铁路', nameEn: 'Beijing-Shanghai Railway', types: ['K', 'T', 'Z'], family: 'conventional', tier: 'trunk', year: 1968, speed: 160, officialKm: 1463, operator: '国铁集团', cities: ['北京', '天津', '济南', '徐州', '南京', '上海'], from: 'Beijing', to: 'Shanghai', via: ['Tianjin', 'Jinan', 'Xuzhou', 'Nanjing'] },
  { id: 'beijing-jiujiang-conventional', name: '京九铁路', nameEn: 'Beijing-Kowloon Railway', types: ['K', 'T', 'Z'], family: 'conventional', tier: 'trunk', year: 1996, speed: 140, officialKm: 2553, operator: '国铁集团', cities: ['北京西', '阜阳', '九江', '东莞', '九龙'], from: 'Beijingxi', to: 'Shenzhen', via: ['Jiujiang'] },
  { id: 'shanghai-kunming-conventional', name: '沪昆铁路', nameEn: 'Shanghai-Kunming Railway', types: ['K', 'T', 'Z'], family: 'conventional', tier: 'trunk', year: 1980, speed: 120, officialKm: 2590, operator: '国铁集团', cities: ['上海', '杭州', '鹰潭', '株洲', '怀化', '昆明'], from: 'Shanghai', to: 'Kunming', via: ['Hangzhou', 'Yingtan', 'Zhuzhou', 'Huaihua'] },
  { id: 'baoji-chengdu-conventional', name: '宝成铁路', nameEn: 'Baoji-Chengdu Railway', types: ['K', 'T'], family: 'conventional', tier: 'primary', year: 1958, speed: 120, officialKm: 669, operator: '西安局 / 成都局', cities: ['宝鸡', '略阳', '广元', '成都'], from: 'Baoji', to: 'Chengdu', via: ['Guangyuan'] },
  { id: 'chengdu-kunming-conventional', name: '成昆铁路', nameEn: 'Chengdu-Kunming Railway', types: ['K', 'T'], family: 'conventional', tier: 'primary', year: 1970, speed: 120, officialKm: 1096, operator: '成都局 / 昆明局', cities: ['成都', '西昌', '攀枝花', '昆明'], from: 'Chengdu', to: 'Kunming', via: ['Xichang', 'Panzhihua'] },
  { id: 'jiaozuo-liuzhou-conventional', name: '焦柳铁路', nameEn: 'Jiaozuo-Liuzhou Railway', types: ['K', 'T'], family: 'conventional', tier: 'primary', year: 1978, speed: 120, officialKm: 1636, operator: '郑州局 / 武汉局 / 广州局', cities: ['焦作', '襄阳', '荆门', '怀化', '柳州'], from: 'Jiaozuo', to: 'Liuzhou', via: ['Xiangyang', 'Huaihua'] },
  { id: 'nanning-kunming-conventional', name: '南昆铁路', nameEn: 'Nanning-Kunming Railway', types: ['K', 'T'], family: 'conventional', tier: 'primary', year: 1997, speed: 120, officialKm: 899, operator: '南宁局 / 昆明局', cities: ['南宁', '百色', '兴义', '昆明'], from: 'Nanning', to: 'Kunming', via: ['Baise'] },
  { id: 'lanzhou-urumqi-conventional', name: '兰新铁路', nameEn: 'Lanzhou-Urumqi Railway', types: ['K', 'T', 'Z'], family: 'conventional', tier: 'trunk', year: 1962, speed: 120, officialKm: 1903, operator: '兰州局 / 乌鲁木齐局', cities: ['兰州', '嘉峪关', '哈密', '吐鲁番', '乌鲁木齐'], from: 'Lanzhou', to: 'Urumqi', via: ['Jiayuguan', 'Hami'] },
  { id: 'baotou-lanzhou-conventional', name: '包兰铁路', nameEn: 'Baotou-Lanzhou Railway', types: ['K', 'T'], family: 'conventional', tier: 'primary', year: 1958, speed: 120, officialKm: 990, operator: '呼和浩特局 / 兰州局', cities: ['包头', '银川', '中卫', '兰州'], from: 'Baotou', to: 'Lanzhou', via: ['Yinchuan'] },
  { id: 'xining-lhasa-conventional', name: '青藏铁路', nameEn: 'Qinghai-Tibet Railway', types: ['Z', 'K', 'T'], family: 'conventional', tier: 'primary', year: 2006, speed: 120, officialKm: 1956, operator: '青藏集团', cities: ['西宁', '格尔木', '那曲', '拉萨'], from: 'Xining', to: 'Lhasa', via: [] },
  { id: 'harbin-manzhouli-conventional', name: '滨洲铁路', nameEn: 'Harbin-Manzhouli Railway', types: ['K', 'T'], family: 'conventional', tier: 'primary', year: 1901, speed: 120, officialKm: 935, operator: '哈尔滨局集团', cities: ['哈尔滨', '齐齐哈尔', '海拉尔', '满洲里'], from: 'Harbin', to: 'Manzhouli', via: ["Qiqiha'er"] },
];

/* ---------------- railway bureaus ---------------- */

const BUREAUS = [
  { name: '哈尔滨局', short: '哈尔滨', station: 'Harbin', scope: '黑龙江全省、内蒙古东部' },
  { name: '沈阳局', short: '沈阳', station: 'Shenyang', scope: '辽宁、吉林全省及内蒙古东部、河北北部' },
  { name: '北京局', short: '北京', station: 'Beijing', scope: '京津冀大部、河南及山东一部分' },
  { name: '太原局', short: '太原', station: 'Taiyuan', scope: '山西全省' },
  { name: '呼和浩特局', short: '呼和浩特', station: 'Hohhot', scope: '内蒙古中部、西部' },
  { name: '郑州局', short: '郑州', station: 'Zhengzhou', scope: '河南中北部' },
  { name: '济南局', short: '济南', station: 'Jinan', scope: '山东大部' },
  { name: '上海局', short: '上海', station: 'Shanghai', scope: '上海、江苏、浙江、安徽' },
  { name: '南昌局', short: '南昌', station: 'Nanchang', scope: '江西、福建两省' },
  { name: '武汉局', short: '武汉', station: 'Wuhan', scope: '湖北全省及河南南部' },
  { name: '广州局', short: '广州', station: 'Guangzhou', scope: '广东、湖南、海南' },
  { name: '成都局', short: '成都', station: 'Chengdu', scope: '四川、重庆、贵州' },
  { name: '昆明局', short: '昆明', station: 'Kunming', scope: '云南全省' },
  { name: '西安局', short: '西安', station: "Xi'an", scope: '陕西全省' },
  { name: '兰州局', short: '兰州', station: 'Lanzhou', scope: '甘肃、宁夏两省区' },
  { name: '乌鲁木齐局', short: '乌鲁木齐', fallback: [87.617, 43.793], scope: '新疆全境' },
  { name: '南宁局', short: '南宁', station: 'Nanning', scope: '广西全境' },
  { name: '青藏集团', short: '西宁', station: 'Xining', scope: '青海、西藏两省区' },
];

function buildBureaus() {
  const features = BUREAUS.map((b, i) => {
    const st = b.station ? lookup(b.station) : null;
    const coord = st ? st.coord : b.fallback;
    if (!coord) throw new Error(`bureau ${b.name}: no coordinate`);
    return {
      type: 'Feature',
      properties: {
        id: `bureau-${i + 1}`,
        name: `中国铁路${b.name}集团有限公司`,
        shortName: b.short,
        bureau: b.name,
        scope: b.scope,
      },
      geometry: { type: 'Point', coordinates: [coord[0], coord[1]] },
    };
  });
  return {
    type: 'FeatureCollection',
    metadata: {
      generated: new Date().toISOString().slice(0, 10),
      reference: '60464/railwaymap（管辖范围口径）',
      note: '18 个铁路局集团公司的机关驻地位置与管辖范围简述。',
      bureaus: features.length,
    },
    features,
  };
}

/* ---------------- coarse network backdrop ---------------- */

/**
 * The full network is 12 445 edges / ~128k vertices - repainting that costs
 * ~14 ms per frame, which is 35 fps. So the backdrop ships in two levels:
 * `low` keeps only the long main-line edges for country views, `high` adds the
 * rest and is only ever visible once viewport culling limits the cell count.
 */
function coarseTier(minEdgeKm, epsilon, cellDeg = 2) {
  const buckets = new Map();
  let kept = 0;
  let points = 0;
  for (const f of CHINA_NETWORK.features) {
    const coords = f.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    if ((f.properties?.km ?? 99) < minEdgeKm) continue;
    kept++;
    const line = rdp(coords, epsilon);
    points += line.length;
    const [mx, my] = line[line.length >> 1];
    const key = `${Math.floor(mx / cellDeg)}_${Math.floor(my / cellDeg)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(line);
  }

  const features = [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, lines]) => {
      const [cx, cy] = key.split('_').map(Number);
      return {
        type: 'Feature',
        properties: { cell: key, edges: lines.length },
        geometry: { type: 'MultiLineString', coordinates: lines.map((l) => round(l, 3)) },
        _bbox: [cx * cellDeg, cy * cellDeg, (cx + 1) * cellDeg, (cy + 1) * cellDeg],
      };
    })
    .filter((f) => {
      const [a, b, c, d] = f._bbox;
      return c > 72 && a < 136 && d > 3 && b < 55;
    })
    .map(({ _bbox, ...f }) => f);

  console.log(`  coarse tier >=${minEdgeKm}km eps=${epsilon}: ${features.length} cells, ${kept} edges, ${points} pts`);
  return { features, cells: features.length, edges: kept, points };
}

function buildCoarseNetwork() {
  // Low tier is sized for the country view, where every cell is on screen:
  // ~4.6k vertices costs ~3 ms/frame and keeps 60 fps. The high tier is only
  // ever shown zoomed in, so it ships as a second file the app imports lazily.
  const low = coarseTier(60, 0.08);
  const high = coarseTier(3, 0.02);
  const meta = {
    generated: new Date().toISOString().slice(0, 10),
    source: '@railroute-ts/china (OpenStreetMap, ODbL-1.0)',
    license: 'ODbL-1.0 (© OpenStreetMap contributors)',
    totalEdges: CHINA_NETWORK.features.length,
    note: '仅用于底图密集度；单条边的属性请加载全量路网。',
  };
  return {
    low: { type: 'FeatureCollection', metadata: { ...meta, tier: 'low', ...low }, features: low.features },
    high: { type: 'FeatureCollection', metadata: { ...meta, tier: 'high', ...high }, features: high.features },
  };
}

/* ---------------- main ---------------- */

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const coarse = buildCoarseNetwork();
writeFileSync(path.join(OUT, 'network-coarse.json'), JSON.stringify(coarse.low));
writeFileSync(path.join(OUT, 'network-coarse-high.json'), JSON.stringify(coarse.high));
console.log(
  `data/network-coarse.json  ${coarse.low.metadata.cells} cells / ${coarse.low.metadata.edges} edges (+ high tier)`
);

const provinces = buildProvinces();
if (provinces) {
  writeFileSync(path.join(OUT, 'china-provinces.json'), JSON.stringify(provinces));
  console.log(`data/china-provinces.json  ${provinces.features.length} features`);
}

const stations = buildStations();
if (stations) {
  writeFileSync(path.join(OUT, 'stations.json'), JSON.stringify(stations));
  console.log(`data/stations.json  ${stations.features.length} stations`);
}

const bureaus = buildBureaus();
writeFileSync(path.join(OUT, 'railway-bureaus.json'), JSON.stringify(bureaus));
console.log(`data/railway-bureaus.json  ${bureaus.features.length} bureaus`);

console.log(`routing ${LINES.length} lines over CHINA_NETWORK (${CHINA_NETWORK.metadata.edges} edges)`);
const railways = buildRailways();
writeFileSync(path.join(OUT, 'railways.json'), JSON.stringify(railways));
console.log(`data/railways.json  ${railways.features.length} lines`);

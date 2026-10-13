/**
 * Regenerate the checked-in demo datasets from real sources:
 *   - line geometry: shortest path over the @railroute-ts/china OSM network
 *   - station coords: @railroute-ts/china station table
 *   - station telecodes: 12306 station_name.js
 *   - province outline: chinese-global-compliant-geodata chn-level-1.json
 *
 * Usage: npm run build:data
 * Outputs: data/railways.json, data/stations.json, data/china-provinces.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { railRoute } from 'railroute-ts';
import { CHINA_NETWORK, CHINA_STATIONS } from '@railroute-ts/china';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data');
const CACHE = path.join(ROOT, '.cache');

const norm = (s) =>
  s
  .toLowerCase()
  .replace(/['’`\-\s_.]/g, '')
  .replace(/railwaystation|station$/, '');

const STATION_BY_EXACT = new Map(CHINA_STATIONS.map((s) => [s.name, s]));
const STATION_BY_NORM = new Map();
for (const s of CHINA_STATIONS) {
  const k = norm(s.name);
  if (!STATION_BY_NORM.has(k)) STATION_BY_NORM.set(k, s);
}

function lookup(name) {
  return STATION_BY_EXACT.get(name) ?? STATION_BY_NORM.get(norm(name)) ?? null;
}

function resolve(name) {
  const hit = lookup(name);
  if (!hit) throw new Error(`station not found in @railroute-ts/china: ${name}`);
  return hit;
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
  const src = path.join(CACHE, 'chn-level-1.json');
  if (!existsSync(src)) {
    console.warn('! .cache/chn-level-1.json missing - skipped province outline');
    return null;
  }
  const fc = JSON.parse(readFileSync(src, 'utf8'));
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

/* ---------------- railway lines ---------------- */

/**
 * `from`/`to` are the line endpoints; `via` are major hubs on the corridor.
 * A via list is only kept when it does not inflate the endpoint-to-endpoint
 * distance by more than VIA_INFLATION_MAX - some intermediate stations sit on
 * disconnected fragments of the OSM graph and force a huge detour.
 */
const VIA_INFLATION_MAX = 1.06;

const LINES = [
  {
    id: 'beijing-shanghai-hsr',
    name: '京沪高铁',
    nameEn: 'Beijing-Shanghai High-Speed Railway',
    types: ['G'],
    family: 'hsr',
    tier: 'trunk',
    year: 2011,
    speed: 350,
    officialKm: 1318,
    operator: '京沪高铁公司',
    cities: ['北京南', '天津西', '济南西', '徐州东', '南京南', '上海虹桥'],
    from: 'Beijingnan',
    to: 'Shanghai-Hongqiao',
    via: ['Tianjinxi', 'Jinanxi', 'Xuzhoudong', 'Nanjingnan'],
  },
  {
    id: 'beijing-guangzhou-hsr',
    name: '京广高铁',
    nameEn: 'Beijing-Guangzhou High-Speed Railway',
    types: ['G'],
    family: 'hsr',
    tier: 'trunk',
    year: 2012,
    speed: 350,
    officialKm: 2298,
    operator: '国铁集团',
    cities: ['北京西', '石家庄', '郑州东', '武汉', '长沙南', '广州南'],
    from: 'Beijingxi',
    to: 'Guangzhounan',
    via: ['Shijiazhuang', 'Zhengzhoudong', 'Wuhan', 'Changsha South'],
  },
  {
    id: 'shanghai-kunming-hsr',
    name: '沪昆高铁',
    nameEn: 'Shanghai-Kunming High-Speed Railway',
    types: ['G'],
    family: 'hsr',
    tier: 'trunk',
    year: 2016,
    speed: 350,
    officialKm: 2252,
    operator: '国铁集团',
    cities: ['上海虹桥', '杭州东', '南昌西', '长沙南', '贵阳北', '昆明南'],
    from: 'Shanghai-Hongqiao',
    to: 'Kunmingnan',
    via: ['Hangzhoudong', 'Nanchangxi', 'Changsha South', 'Guiyangbei'],
  },
  {
    id: 'harbin-dalian-hsr',
    name: '哈大高铁',
    nameEn: 'Harbin-Dalian High-Speed Railway',
    types: ['G'],
    family: 'hsr',
    tier: 'trunk',
    year: 2012,
    speed: 350,
    officialKm: 921,
    operator: '沈阳局集团',
    cities: ['哈尔滨西', '长春', '沈阳北', '大连北'],
    from: 'Harbin West',
    to: 'Dalianbei',
    via: ['Changchun', 'Shenyangbei'],
  },
  {
    id: 'chengdu-chongqing-hsr',
    name: '成渝高铁',
    nameEn: 'Chengdu-Chongqing High-Speed Railway',
    types: ['G', 'D', 'C'],
    family: 'hsr',
    tier: 'primary',
    year: 2015,
    speed: 350,
    officialKm: 308,
    operator: '成都局集团',
    cities: ['成都东', '内江北', '资阳北', '重庆西'],
    from: 'Chengdudong',
    to: 'Chongqingxi',
    via: ['Ziyangbei', 'Neijiangbei'],
  },
  {
    id: 'xian-chengdu-hsr',
    name: '西成高铁',
    nameEn: 'Xi-an-Chengdu High-Speed Railway',
    types: ['G', 'D'],
    family: 'hsr',
    tier: 'primary',
    year: 2017,
    speed: 250,
    officialKm: 643,
    operator: '西安局集团 / 成都局集团',
    cities: ['西安北', '汉中', '广元', '绵阳', '成都东'],
    from: "Xi'anbei",
    to: 'Chengdudong',
    via: ['Hanzhong', 'Guangyuan', 'Mianyang'],
  },
  {
    id: 'beijing-tianjin-intercity',
    name: '京津城际',
    nameEn: 'Beijing-Tianjin Intercity Railway',
    types: ['C', 'G'],
    family: 'intercity',
    tier: 'primary',
    year: 2008,
    speed: 350,
    officialKm: 150,
    operator: '京津城际铁路公司',
    cities: ['北京南', '武清', '天津'],
    from: 'Beijingnan',
    to: 'Tianjin',
    via: ['Wuqing'],
  },
  {
    id: 'longhai-conventional',
    name: '陇海铁路',
    nameEn: 'Longhai Railway',
    types: ['K', 'T', 'Z'],
    family: 'conventional',
    tier: 'trunk',
    year: 1952,
    speed: 120,
    officialKm: 1759,
    operator: '兰州局 / 西安局 / 郑州局 / 上海局',
    cities: ['连云港', '徐州', '郑州', '西安', '宝鸡', '天水', '兰州'],
    from: 'Lianyungang',
    to: 'Lanzhou',
    via: ['Xuzhou', 'Zhengzhou', "Xi'an", 'Baoji', 'Tianshui'],
  },
];

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

function buildRailways() {
  const features = [];
  for (const line of LINES) {
    const from = resolve(line.from).coord;
    const to = resolve(line.to).coord;
    const base = traceRoute([from, to]);

    const viaCoords = line.via.map(lookup).filter(Boolean).map((s) => s.coord);
    const withVia = viaCoords.length ? traceRoute([from, ...viaCoords, to]) : base;
    const chosen = withVia.km <= base.km * VIA_INFLATION_MAX ? withVia : base;
    if (chosen === base && viaCoords.length) {
      console.warn(`  ${line.name}: via hubs inflate route ${(withVia.km / base.km).toFixed(2)}x - endpoints only`);
    }

    const coords = round(rdp(chosen.coords, 0.003), 4);
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
        lengthKm: Math.round(chosen.km),
        points: coords.length,
      },
      geometry: { type: 'LineString', coordinates: coords },
    });
    console.log(
      `  ${line.name.padEnd(6)} route ${String(Math.round(chosen.km)).padStart(5)} km / official ${String(line.officialKm).padStart(5)} km  ${coords.length} pts`
    );
  }

  return {
    type: 'FeatureCollection',
    metadata: {
      generated: new Date().toISOString().slice(0, 10),
      geometrySource: '@railroute-ts/china (OpenStreetMap, ODbL-1.0)',
      note: '示例数据：8 条主干线路。完整路网加载方式见 README「加载全量数据」。',
      lines: features.length,
    },
    features,
  };
}

/* ---------------- stations ---------------- */

const STATIONS = [
  { name: '北京南', railroute: 'Beijingnan', bureau: '北京局', tier: '4F', trains: 260, level: 'hub' },
  { name: '北京西', railroute: 'Beijingxi', bureau: '北京局', tier: '4F', trains: 220, level: 'hub' },
  { name: '天津', railroute: 'Tianjin', bureau: '北京局', tier: '4F', trains: 150, level: 'hub' },
  { name: '石家庄', railroute: 'Shijiazhuang', bureau: '北京局', tier: "4A", trains: 120, level: 'city' },
  { name: '济南西', railroute: 'Jinanxi', bureau: '济南局', tier: "一等站", trains: 110, level: 'city' },
  { name: '徐州东', railroute: 'Xuzhoudong', bureau: '上海局', tier: '二等站', trains: 96, level: 'city' },
  { name: '南京南', railroute: 'Nanjingnan', bureau: '上海局', tier: '4F', trains: 210, level: 'hub' },
  { name: '上海虹桥', railroute: 'Shanghai-Hongqiao', bureau: '上海局', tier: '4F', trains: 300, level: 'hub' },
  { name: '杭州东', railroute: 'Hangzhoudong', bureau: '上海局', tier: '4F', trains: 200, level: 'hub' },
  { name: '郑州东', railroute: 'Zhengzhoudong', bureau: '郑州局', tier: '4F', trains: 185, level: 'hub' },
  { name: '武汉', railroute: 'Wuhan', bureau: '武汉局', tier: '4F', trains: 190, level: 'hub' },
  { name: '西安北', railroute: "Xi'anbei", bureau: '西安局', tier: '4F', trains: 160, level: 'hub' },
  { name: '长沙南', railroute: 'Changsha South', bureau: '广州局', tier: '4F', trains: 150, level: 'hub' },
  { name: '广州南', railroute: 'Guangzhounan', bureau: '广州局', tier: '4F', trains: 250, level: 'hub' },
  { name: '深圳北', railroute: 'Shenzhen North', bureau: '广州局', tier: '4F', trains: 180, level: 'hub' },
  { name: '成都东', railroute: 'Chengdudong', bureau: '成都局', tier: '4F', trains: 170, level: 'hub' },
  { name: '重庆西', railroute: 'Chongqingxi', bureau: '成都局', tier: '4A', trains: 120, level: 'city' },
  { name: '贵阳北', railroute: 'Guiyangbei', bureau: '成都局', tier: "二等站", trains: 105, level: 'city' },
  { name: '昆明南', railroute: 'Kunmingnan', bureau: '昆明局', tier: '4A', trains: 95, level: 'city' },
  { name: '哈尔滨西', railroute: 'Harbin West', bureau: '哈尔滨局', tier: '4A', trains: 130, level: 'hub' },
  { name: '沈阳北', railroute: 'Shenyangbei', bureau: '沈阳局', tier: '4A', trains: 120, level: 'city' },
  { name: '大连北', railroute: 'Dalianbei', bureau: '沈阳局', tier: "一等站", trains: 88, level: 'city' },
  { name: '南昌西', railroute: 'Nanchangxi', bureau: '南昌局', tier: "二等站", trains: 110, level: 'city' },
  { name: '兰州西', railroute: 'Lanzhouxi', bureau: '兰州局', tier: "一等站", trains: 90, level: 'city' },
];

function parseStationCodes() {
  const codes = new Map();
  const file = path.join(CACHE, 'station_name.js');
  if (!existsSync(file)) return codes;
  const raw = readFileSync(file, 'utf8');
  const body = raw.slice(raw.indexOf("'") + 1, raw.lastIndexOf("'"));
  for (const chunk of body.split('@').filter(Boolean)) {
    const f = chunk.split('|');
    if (f.length >= 5) codes.set(f[1], { telecode: f[2], pinyin: f[3], code: f[4] });
  }
  return codes;
}

function buildStations() {
  const codes = parseStationCodes();
  const missing = [];
  const features = STATIONS.map((s) => {
    const st = resolve(s.railroute);
    const c = codes.get(s.name);
    if (!c) missing.push(s.name);
    return {
      type: 'Feature',
      properties: {
        id: st.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: s.name,
        nameEn: st.name,
        telecode: c?.telecode ?? '',
        pinyin: c?.pinyin ?? '',
        bureau: s.bureau,
        tier: s.tier,
        level: s.level,
        trains: s.trains,
      },
      geometry: { type: 'Point', coordinates: [st.coord[0], st.coord[1]] },
    };
  });
  if (missing.length) console.warn('! no 12306 telecode for:', missing.join(', '));

  return {
    type: 'FeatureCollection',
    metadata: {
      generated: new Date().toISOString().slice(0, 10),
      coordinateSource: '@railroute-ts/china (OpenStreetMap, ODbL-1.0)',
      telecodeSource: '12306 station_name.js',
      note: '示例数据：24 个主要车站。trains 与车站等级为演示值。',
      stations: features.length,
    },
    features,
  };
}

/* ---------------- railway bureaus ---------------- */

/** HQ city station where the network has one; otherwise the explicit fallback. */
const BUREAUS = [
  { name: '哈尔滨局', short: '哈尔滨', station: 'Harbin', scope: '黑龙江全省、内蒙古东部' },
  { name: '沈阳局', short: '沈阳', station: 'Shenyang', scope: '辽宁、吉林全省及内蒙古东部、河北北部' },
  { name: '北京局', short: '北京', station: 'Beijing', scope: '京津冀大部、河南及山东一部分' },
  { name: '太原局', short: '太原', station: 'Taiyuan', scope: '山西全省' },
  { name: '呼和浩特局', short: '呼和浩特', station: 'Hohhot', scope: '内蒙古中部' },
  { name: '郑州局', short: '郑州', station: 'Zhengzhou', scope: '河南中北部' },
  { name: '济南局', short: '济南', station: 'Jinan', scope: '山东大部' },
  { name: '上海局', short: '上海', station: 'Shanghai', scope: '上海、江苏、浙江、安徽' },
  { name: '南昌局', short: '南昌', station: 'Nanchang', scope: '江西、福建两省' },
  { name: '武汉局', short: '武汉', station: 'Wuhan', scope: '湖北全省及河南南部' },
  { name: '广州局', short: '广州', station: 'Guangzhou', scope: '广东、湖南两省' },
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
        source: st ? 'railroute station' : 'manual',
      },
      geometry: { type: 'Point', coordinates: [coord[0], coord[1]] },
    };
  });
  return {
    type: 'FeatureCollection',
    metadata: {
      generated: new Date().toISOString().slice(0, 10),
      reference: '60464/railwaymap (管辖范围口径)',
      note: '18 个铁路局集团公司的机关驻地位置与管辖范围简述。',
      bureaus: features.length,
    },
    features,
  };
}

/* ---------------- main ---------------- */

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const provinces = buildProvinces();
if (provinces) {
  writeFileSync(path.join(OUT, 'china-provinces.json'), JSON.stringify(provinces));
  console.log(`data/china-provinces.json  ${provinces.features.length} features`);
}

console.log(`routing over CHINA_NETWORK (${CHINA_NETWORK.metadata.edges} edges)`);
const railways = buildRailways();
writeFileSync(path.join(OUT, 'railways.json'), JSON.stringify(railways));
console.log(`data/railways.json  ${railways.features.length} lines`);

const stations = buildStations();
writeFileSync(path.join(OUT, 'stations.json'), JSON.stringify(stations));
console.log(`data/stations.json  ${stations.features.length} stations`);

const bureaus = buildBureaus();
writeFileSync(path.join(OUT, 'railway-bureaus.json'), JSON.stringify(bureaus));
console.log(`data/railway-bureaus.json  ${bureaus.features.length} bureaus`);

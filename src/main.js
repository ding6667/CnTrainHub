import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import { TRAIN_MODELS, BUREAU_FLEETS, FLEET_AS_OF, trainSvg, trainSpec } from './trains.js';
import MODELS from './data.json';

/* ------------------------------------------------------------------ *
 * Config
 * ------------------------------------------------------------------ */

/**
 * CARTO's dark_all tiles now answer unkeyed requests with an
 * "API KEY REQUIRED" watermark, so the key-free default is Esri's dark grey
 * basemap. Compare the two with ?basemap=cartoDark, or flip BASEMAP below.
 */
const BASEMAPS = {
  esriDark: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, HERE, Garmin, FAO, NOAA, USGS, © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 16,
  },
  cartoDark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  },
};

const BASEMAP = new URLSearchParams(location.search).get('basemap') || 'esriDark';
const TILE = BASEMAPS[BASEMAP] ?? BASEMAPS.esriDark;

// railroute-ts CDN copy of the full network (12 445 edges, ~4.4 MB) - opt-in.
const FULL_NETWORK_URL =
  'https://cdn.jsdelivr.net/gh/mayurrawte/railroutes@networks-v1/railroute-ts/src/networks/china-v0.json';
// The detailed network is 12 445 live edges; only pull it in once viewport
// culling brings the on-screen count down to a few hundred.
const NETWORK_MIN_ZOOM = 8;

const CHINA_BOUNDS = [
  [3.6, 73.5],
  [53.6, 135.0],
];
const LINE_STAGGER_MS = 100;
const GROWTH_FRAME_MS = 33; // cap redraws at ~30 fps during the intro
const MOBILE_BP = 768;

const PALETTE = {
  hsr: '#e63946',
  emu: '#f4a261',
  intercity: '#f7b955',
  conventional: '#457b9d',
};

const LINE_GROUPS = [
  { key: 'G', label: '高铁 (G)', types: ['G'], family: 'hsr' },
  { key: 'D', label: '动车 (D)', types: ['D'], family: 'emu' },
  { key: 'C', label: '城际 (C)', types: ['C'], family: 'intercity' },
  { key: 'PU', label: '普速 (K/Z/T)', types: ['K', 'T', 'Z'], family: 'conventional' },
];

const STATION_TIERS = [
  { key: 'capital', label: '省会车站' },
  { key: 'prefecture', label: '地级市车站' },
  { key: 'county', label: '县级车站' },
];

const TIER_LABEL = STATION_TIERS.reduce((a, t) => ({ ...a, [t.key]: t.label }), {});

// rank 1 = 省会主站, 2 = 地级市主站/省会其他站, 3 = 县级
const RANK_BY_TIER = { zoomLow: 1, zoomMid: 2, zoomHigh: 3 };

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => window.innerWidth <= MOBILE_BP;

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

const state = {
  lineTypes: new Set(LINE_GROUPS.map((g) => g.key)),
  stationTiers: new Set(STATION_TIERS.map((t) => t.key)),
  bureaus: new Set(),
  tier: 1,
  data: { lines: [], stations: [], bureaus: [], network: null, coarse: { low: [], high: null, loading: null } },
  coarseTier: null,
  cardOwner: null,
  cardLatLng: null,
  networkOn: false,
  networkLoaded: false,
  networkLoading: null,
};

const $ = (id) => document.getElementById(id);

let cardJustOpened = false;

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

const toLatLngs = (coords) => coords.map(([lng, lat]) => [lat, lng]);

const EARTH_R = 6371;
function haversine(a, b) {
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const la1 = (a[1] * Math.PI) / 180;
  const la2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

function cumulative(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversine(pts[i - 1], pts[i]));
  return cum;
}

/** Path from the start up to `target` km, last vertex interpolated. */
function sliceTo(pts, cum, target) {
  if (target <= 0) return [pts[0]];
  if (target >= cum[cum.length - 1]) return pts.slice();
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= target) lo = mid;
    else hi = mid;
  }
  const span = cum[lo + 1] - cum[lo] || 1;
  const f = (target - cum[lo]) / span;
  const [latA, lngA] = pts[lo];
  const [latB, lngB] = pts[lo + 1];
  const head = pts.slice(0, lo + 1);
  head.push([latA + (latB - latA) * f, lngA + (lngB - lngA) * f]);
  return head;
}

function bboxOf(pts) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [a, b] of pts) {
    if (a < minX) minX = a;
    if (a > maxX) maxX = a;
    if (b < minY) minY = b;
    if (b > maxY) maxY = b;
  }
  return [minX, minY, maxX, maxY];
}

/** Bounding box of one [lat, lng] point, in the same [w,s,e,n] order. */
const pointBBox = ([lat, lng]) => [lng, lat, lng, lat];

function bboxIntersects(a, b) {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

function distanceToLine(latlng, pts, limit) {
  const [lat, lng] = latlng;
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [latA, lngA] = pts[i - 1];
    const [latB, lngB] = pts[i];
    const dy = latB - latA;
    const dx = lngB - lngA;
    const norm = dx * dx + dy * dy;
    let t = norm === 0 ? 0 : ((lat - latA) * dy + (lng - lngA) * dx) / norm;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = haversine([lat, lng], [latA + dy * t, lngA + dx * t]);
    if (d < best) {
      best = d;
      if (best < limit) return best;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Map + renderers
 * ------------------------------------------------------------------ */

let map;
let lineRenderer;
let stationRenderer;
let networkRenderer;
let coarseRenderer;
let boundaryRenderer;

const lineLayer = L.layerGroup();
const stationLayer = L.layerGroup();
const networkLayer = L.layerGroup();
const coarseLayer = L.layerGroup();
const labelLayer = L.layerGroup();

function createMap() {
  map = L.map('map', {
    center: [34.5, 104],
    zoom: 5,
    minZoom: 3,
    maxZoom: 12,
    zoomControl: false,
    wheelPxPerZoomLevel: 90,
    maxBounds: [[-5, 60], [65, 150]],
    maxBoundsViscosity: 0.6,
    // One canvas per pane keeps vector redraws off the DOM.
    renderer: L.canvas({ padding: 0.25, tolerance: 0.4 }),
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer(TILE.url, {
    attribution: TILE.attribution,
    subdomains: TILE.subdomains ?? 'abc',
    maxZoom: TILE.maxZoom,
    minZoom: 3,
    keepBuffer: 1,
    updateWhenIdle: isMobile(),
  }).addTo(map);

  // Panes holding large static vector content get their own compositor layer:
  // without this the browser re-rasterises ~5k stroked segments on every pan
  // frame, which alone halves the frame rate (measured 37 -> 78 fps).
  const COMPOSITED = new Set(['pane-boundary', 'pane-network']);
  for (const [name, z] of [
    ['pane-boundary', 350],
    ['pane-network', 380],
    ['pane-line', 420],
    ['pane-station', 660],
    ['pane-label', 680],
  ]) {
    const pane = map.createPane(name);
    pane.style.zIndex = z;
    if (COMPOSITED.has(name)) pane.style.willChange = 'transform';
  }

  boundaryRenderer = L.canvas({ pane: 'pane-boundary', padding: 0.2 });
  networkRenderer = L.canvas({ pane: 'pane-network', padding: 0.2 });
  stationRenderer = L.canvas({ pane: 'pane-station', padding: 0.1 });
  // The coarse backdrop is SVG on purpose: a canvas re-projects ~20k points on
  // every pan frame (~35 fps), while SVG just translates the group.
  coarseRenderer = L.svg({ pane: 'pane-network', padding: 0.15 });
  // Named corridors stay on SVG (only ~30 paths) so the spec'd
  // drop-shadow glow works; everything heavy is on canvas.
  lineRenderer = L.svg({ pane: 'pane-line', padding: 0.3 });

  // Canvas panes are full-size rectangles: without this they would swallow
  // every click aimed at the SVG lines or DOM markers underneath them.
  for (const r of [boundaryRenderer, networkRenderer, stationRenderer]) {
    map.addLayer(r);
    r._container.style.pointerEvents = 'none';
  }

  map.fitBounds(CHINA_BOUNDS, { padding: [16, 16], animate: false });
  state.tier = tierForZoom(map.getZoom());
}

/* ------------------------------------------------------------------ *
 * Data
 * ------------------------------------------------------------------ */

async function loadData() {
  const [provinces, railways, stations, bureaus, coarse] = await Promise.all([
    import('../data/china-provinces.json'),
    import('../data/railways.json'),
    import('../data/stations.json'),
    import('../data/railway-bureaus.json'),
    import('../data/network-coarse.json'),
  ]);
  const unwrap = (m) => m.default ?? m;

  const lines = unwrap(railways).features.map((f) => {
    const latlngs = toLatLngs(f.geometry.coordinates);
    return { props: f.properties, latlngs, bbox: bboxOf(f.geometry.coordinates) };
  });

  const stationList = unwrap(stations).features.map((f) => ({
    props: f.properties,
    latlng: [f.geometry.coordinates[1], f.geometry.coordinates[0]],
  }));

  return {
    provinces: unwrap(provinces),
    coarse: unwrap(coarse),
    lines,
    stations: stationList,
    bureaus: unwrap(bureaus).features.map((f) => ({
      props: f.properties,
      latlng: [f.geometry.coordinates[1], f.geometry.coordinates[0]],
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Layers
 * ------------------------------------------------------------------ */

function drawProvinces(fc) {
  L.geoJSON(fc, {
    pane: 'pane-boundary',
    renderer: boundaryRenderer,
    interactive: false,
    style: (feature) =>
      feature.properties.kind === 'boundary-line'
        ? { color: '#7d95d6', weight: 1.1, opacity: 0.8, dashArray: '2 4', fill: false }
        : { color: '#3f4d7a', weight: 0.9, opacity: 0.85, fillColor: '#16224a', fillOpacity: 0.22 },
  }).addTo(map);
}

function familyOf(props) {
  if (props.family === 'conventional') return 'conventional';
  if (props.family === 'intercity') return 'intercity';
  return props.types?.includes('D') && !props.types?.includes('G') ? 'emu' : 'hsr';
}

function drawLines(lines) {
  lineLayer.addTo(map);

  for (const [i, ln] of lines.entries()) {
    const family = familyOf(ln.props);
    const weight = ln.props.tier === 'trunk' ? 2.4 : 1.7;

    ln.polyline = L.polyline([], {
      pane: 'pane-line',
      renderer: lineRenderer,
      color: PALETTE[family],
      weight,
      opacity: 0.95,
      lineCap: 'round',
      className: `rail-line rail-line--${family}`,
      interactive: false,
    });

    ln.pts = ln.latlngs;
    ln.cum = cumulative(ln.latlngs);
    ln.weight = weight;
    ln.order = i;
    ln.onMap = false;
    ln.duration = Math.min(2200, 700 + (ln.props.lengthKm ?? 400) * 0.55);

    lineLayer.addLayer(ln.polyline);
  }
}

function playGrowth() {
  for (const ln of state.data.lines) cancelGrowth(ln);

  for (const ln of state.data.lines) {
    if (!map.hasLayer(ln.polyline)) continue;
    ln.polyline.setLatLngs([]);

    if (reduceMotion || isMobile() || document.hidden) {
      ln.polyline.setLatLngs(ln.pts);
      continue;
    }
    ln.raf = requestAnimationFrame((t) => growthFrame(ln, t + ln.order * LINE_STAGGER_MS));
  }
}

function growthFrame(ln, start) {
  const total = ln.cum[ln.cum.length - 1];
  let last = 0;
  const step = (now) => {
    const p = (now - start) / ln.duration;
    if (p >= 1) {
      ln.polyline.setLatLngs(ln.pts);
      ln.raf = null;
      return;
    }
    if (p >= 0 && now - last >= GROWTH_FRAME_MS) {
      last = now;
      const eased = 1 - Math.pow(1 - p, 3);
      ln.polyline.setLatLngs(sliceTo(ln.pts, ln.cum, eased * total));
    }
    ln.raf = requestAnimationFrame(step);
  };
  ln.raf = requestAnimationFrame(step);
}

function cancelGrowth(ln) {
  if (ln.raf) cancelAnimationFrame(ln.raf);
  ln.raf = null;
}

function drawStations(stations) {
  stationLayer.addTo(map);
  labelLayer.addTo(map);

  for (const st of stations) {
    const rank = st.props.rank ?? 3;
    st.marker = L.circleMarker(st.latlng, {
      pane: 'pane-station',
      renderer: stationRenderer,
      interactive: false,
      radius: rank === 1 ? 5 : rank === 2 ? 3.6 : 2.4,
      color: rank === 1 ? '#ffd166' : rank === 2 ? '#e8ecf8' : '#9fb0d8',
      weight: rank === 3 ? 0.8 : 1.4,
      fillColor: rank === 1 ? '#ffd166' : rank === 2 ? '#f2f6ff' : '#5f7bb5',
      fillOpacity: rank === 3 ? 0.55 : 0.95,
    });
    st.onMap = false;
  }
}

/**
 * Everything is hit-tested geometrically rather than through the DOM: the
 * station canvas sits above the SVG lines, so element hit-testing would either
 * swallow line clicks or be swallowed by the bureau markers on top.
 * Radii are in screen pixels and converted to km for the current zoom, so a
 * thin line stays easy to grab without widening its visible stroke.
 */
const HIT_PX = { line: 14, station: 11, edge: 6 };

function kmPerPx() {
  const c = map.getCenter();
  const lat = c.lat ?? c[0];
  return (40075 * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** map.getZoom());
}

function nearBBox(bbox, lat, lng, pad) {
  return lng >= bbox[0] - pad && lng <= bbox[2] + pad && lat >= bbox[1] - pad && lat <= bbox[3] + pad;
}

function pickFeature(latlng, { withEdges = false, scale = 1, only = null } = {}) {
  const lat = latlng.lat ?? latlng[0];
  const lng = latlng.lng ?? latlng[1];
  const kpp = kmPerPx();
  let best = null;

  const consider = (kind, rec, dKm, radiusPx) => {
    if (only && kind !== only) return;
    const reach = radiusPx * kpp * scale;
    if (dKm > reach) return;
    const score = dKm / reach;
    if (!best || score < best.score) best = { kind, rec, dKm, score };
  };

  for (const ln of state.data.lines) {
    if (!ln.onMap || !nearBBox(ln.bbox, lat, lng, 20 * kpp)) continue;
    consider('line', ln, distanceToLine([lat, lng], ln.pts, HIT_PX.line * kpp), HIT_PX.line);
  }

  for (const st of state.data.stations) {
    if (!st.onMap) continue;
    const d = haversine([lat, lng], st.latlng);
    if (d < 20 * kpp) consider('station', st, d, HIT_PX.station);
  }

  if (withEdges && state.networkOn) {
    for (const e of state.data.network) {
      if (!e.onMap || !nearBBox(e.bbox, lat, lng, 8 * kpp)) continue;
      consider('edge', e, distanceToLine([lat, lng], e.latlngs, HIT_PX.edge * kpp), HIT_PX.edge);
    }
  }

  return best;
}

/**
 * Single click authority. The bureau diamonds sit exactly on their hub
 * station, so the marker is split by radius: the middle few pixels belong to
 * the station, the rest of the diamond to the bureau. Resolving this in one
 * place (rather than in a marker handler) avoids the mouseup-then-click
 * ordering race, where the map would re-pick the station after the marker had
 * already opened the bureau card.
 */
function pickAt(latlng) {
  const at = map.latLngToContainerPoint(latlng);
  let bureau = null;
  let bPx = null;
  let bD = 9;
  for (const b of state.data.bureaus) {
    if (!b.onMap) continue;
    const p = map.latLngToContainerPoint(b.latlng);
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d <= bD) {
      bD = d;
      bPx = p;
      bureau = b;
    }
  }

  if (bureau) {
    // Measured against the bureau's own centre, not against arbitrary stations:
    // at country zoom a 5 px radius spans ~45 km and would let a neighbouring
    // station (广州南 for 广州) steal the whole marker.
    if (bD <= 5) {
      let station = null;
      let sD = 4;
      for (const st of state.data.stations) {
        if (!st.onMap) continue;
        const p = map.latLngToContainerPoint(st.latlng);
        const d = Math.hypot(p.x - bPx.x, p.y - bPx.y);
        if (d <= sD) {
          sD = d;
          station = st;
        }
      }
      if (station) return { kind: 'station', rec: station };
    }
    return { kind: 'bureau', rec: bureau };
  }

  return pickFeature(latlng, { withEdges: true });
}

/** Nearest line within reach, for hover thickening. */
function nearestLine(latlng) {
  const lat = latlng.lat ?? latlng[0];
  const lng = latlng.lng ?? latlng[1];
  const reach = HIT_PX.line * kmPerPx();
  let best = null;
  for (const ln of state.data.lines) {
    if (!ln.onMap || !nearBBox(ln.bbox, lat, lng, 20 * kmPerPx())) continue;
    const d = distanceToLine([lat, lng], ln.pts, reach);
    if (d <= reach && (!best || d < best.d)) best = { rec: ln, d };
  }
  return best?.rec ?? null;
}

let hovered = null;

function setHover(line) {
  if (hovered === line) return;
  if (hovered) hovered.polyline.setStyle({ weight: hovered.weight, opacity: 0.95 });
  if (line) line.polyline.setStyle({ weight: line.weight + 2.4, opacity: 1 });
  hovered = line;
}

function drawBureaus(bureaus) {
  for (const b of bureaus) {
    b.marker = L.marker(b.latlng, {
      pane: 'pane-station',
      icon: L.divIcon({ className: 'bureau-icon', html: '<i></i>', iconSize: [16, 16], iconAnchor: [8, 8] }),
      keyboard: false,
    })
      .bindTooltip(
        `<b>${b.props.name}</b><span>${b.props.scope}<br>机关驻地：${b.props.shortName}</span>`,
        { className: 'bureau-tip', direction: 'top', offset: [0, -10], opacity: 1 }
      );

    // An interactive marker consumes the map's 'click' (only 'preclick'
    // reaches the map), so the marker has to resolve its own hit: pickAt
    // returns the hub station for the centre of the diamond and the bureau
    // for the rest of it. Note e.latlng on a marker click is the *marker's*
    // coordinate, so the real pointer position has to come from the DOM event.
    b.marker.on('click', (e) => {
      const oe = e.originalEvent;
      const at = oe ? map.containerPointToLatLng(map.mouseEventToContainerPoint(oe)) : b.latlng;
      b.marker.closeTooltip();
      const hit = pickAt(at);
      if (hit) showCard(hit.kind, hit.rec, hit.kind === 'station' ? hit.rec.latlng : at);
    });
  }
}

/* ------------------------------------------------------------------ *
 * Visibility: filters x zoom tier x viewport
 * ------------------------------------------------------------------ */

function tierForZoom(z) {
  if (z < 6) return 1;
  if (z <= 8) return 2;
  return 3;
}

const LINE_TIER_MIN = { trunk: 1, primary: 2, branch: 3 };
const RANK_MAX = { 1: RANK_BY_TIER.zoomLow, 2: RANK_BY_TIER.zoomMid, 3: RANK_BY_TIER.zoomHigh };

function allowedTrainTypes() {
  const set = new Set();
  for (const g of LINE_GROUPS) if (state.lineTypes.has(g.key)) g.types.forEach((t) => set.add(t));
  return set;
}

function lineVisible(ln, allowed) {
  if (state.tier < (LINE_TIER_MIN[ln.props.tier] ?? 1)) return false;
  return (ln.props.types ?? []).some((t) => allowed.has(t));
}

function boundsBBox() {
  const b = map.getBounds().pad(0.12);
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
}

let syncQueued = false;

function scheduleSync() {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(() => {
    syncQueued = false;
    syncVisibility();
  });
}

function syncVisibility() {
  const allowed = allowedTrainTypes();
  const view = boundsBBox();
  const maxRank = RANK_MAX[state.tier] ?? 3;

  let lines = 0;
  let km = 0;
  for (const ln of state.data.lines) {
    const show = lineVisible(ln, allowed);
    if (show !== ln.onMap) {
      if (show) {
        lineLayer.addLayer(ln.polyline);
        if (ln.raf || !ln.polyline.getLatLngs().length) {
          cancelGrowth(ln);
          ln.polyline.setLatLngs(ln.pts);
        }
      } else {
        cancelGrowth(ln);
        lineLayer.removeLayer(ln.polyline);
      }
      ln.onMap = show;
    }
    const selected = state.cardOwner === ln.polyline;
    ln.polyline.setStyle(selected ? { weight: ln.weight + 1.6, opacity: 1 } : { weight: ln.weight, opacity: 0.95 });
    if (show) {
      lines++;
      km += ln.props.lengthKm ?? 0;
    }
  }

  let stations = 0;
  for (const st of state.data.stations) {
    const p = st.props;
    const show =
      p.rank <= maxRank &&
      state.stationTiers.has(p.tier) &&
      (!state.bureaus.size || state.bureaus.has(p.bureau)) &&
      st.latlng[1] >= view[0] &&
      st.latlng[1] <= view[2] &&
      st.latlng[0] >= view[1] &&
      st.latlng[0] <= view[3];

    if (show !== st.onMap) {
      if (show) stationLayer.addLayer(st.marker);
      else stationLayer.removeLayer(st.marker);
      st.onMap = show;
    }
    if (show) stations++;

    const wantLabel = show && p.rank === 1 && state.tier >= 2;
    if (wantLabel && !st.labelOn) {
      st.label = st.label ?? L.marker(st.latlng, {
        pane: 'pane-label',
        interactive: false,
        icon: L.divIcon({ className: 'station-label', html: p.name, iconSize: null, iconAnchor: [-7, 8] }),
      });
      labelLayer.addLayer(st.label);
      st.labelOn = true;
    } else if (!wantLabel && st.labelOn) {
      labelLayer.removeLayer(st.label);
      st.labelOn = false;
    }
  }

  for (const b of state.data.bureaus) {
    const show = state.bureaus.has(b.props.bureau);
    if (show !== b.onMap) {
      if (show) b.marker.addTo(map);
      else map.removeLayer(b.marker);
      b.onMap = show;
    }
  }

  if (state.networkOn) syncNetwork(view);
  else syncCoarse(view);

  $('stat-lines').textContent = `${lines}/${state.data.lines.length}`;
  $('stat-stations').textContent = `${stations}/${state.data.stations.length}`;
  $('stat-km').textContent = `${km.toLocaleString('zh-CN')} km`;
  $('panel-foot').innerHTML =
    `<b>${lines}</b> 条线路 · <b>${stations.toLocaleString('zh-CN')}</b> 座车站可见（共 ${state.data.stations.length.toLocaleString('zh-CN')}）<br>` +
    `缩放分级：${['干线 + 省会主站', '加区域性线路与地级市主站', '全部线路与车站'][state.tier - 1]}`;
}

/* ------------------------------------------------------------------ *
 * Coarse network backdrop (bundled, always on)
 * ------------------------------------------------------------------ */

const COARSE_HIGH_ZOOM = 6;

function coarseItems(features) {
  const items = [];
  for (const f of features) {
    let a = Infinity;
    let b = Infinity;
    let c = -Infinity;
    let d = -Infinity;
    for (const l of f.geometry.coordinates) {
      for (const [lng, lat] of l) {
        if (lng < a) a = lng;
        if (lng > c) c = lng;
        if (lat < b) b = lat;
        if (lat > d) d = lat;
      }
    }
    items.push({
      bbox: [a, b, c, d],
      onMap: false,
      layer: L.polyline(f.geometry.coordinates.map(toLatLngs), {
        pane: 'pane-network',
        renderer: coarseRenderer,
        color: '#26375f',
        weight: 0.9,
        opacity: 0.6,
        interactive: false,
      }),
    });
  }
  return items;
}

/**
 * Two backdrop levels: the country view can afford ~4.6k vertices at 60 fps, so
 * the detailed one only takes over once zooming has shrunk the visible cells.
 */
function drawCoarseNetwork(fc) {
  state.data.coarse = { low: coarseItems(fc.features), high: null, loading: null };
  coarseLayer.addTo(map);
}

/** The dense tier is ~19.6k vertices, so it is only fetched once zoom makes it useful. */
async function ensureCoarseHigh() {
  const c = state.data.coarse;
  if (c.high) return c.high;
  if (!c.loading) {
    c.loading = import('../data/network-coarse-high.json')
      .then((m) => {
        c.high = coarseItems((m.default ?? m).features);
        return c.high;
      })
      .catch((err) => {
        console.warn('coarse high tier failed to load:', err);
        return null;
      });
  }
  return c.loading;
}

function syncCoarse(view) {
  const wantHigh = map.getZoom() >= COARSE_HIGH_ZOOM;
  const c = state.data.coarse;

  if (wantHigh && !c.high && !c.loading) {
    ensureCoarseHigh().then(() => scheduleSync());
    return showTier(c.low, 'low', view);
  }
  return showTier(wantHigh && c.high ? c.high : c.low, wantHigh && c.high ? 'high' : 'low', view);
}

function showTier(tier, name, view) {
  if (state.coarseTier !== name) {
    const other = state.data.coarse[name === 'high' ? 'low' : 'high'] ?? [];
    for (const it of other) {
      if (it.onMap) coarseLayer.removeLayer(it.layer);
      it.onMap = false;
    }
    state.coarseTier = name;
  }

  let shown = 0;
  for (const it of tier) {
    const show = bboxIntersects(it.bbox, view);
    if (show === it.onMap) {
      if (show) shown++;
      continue;
    }
    if (show) coarseLayer.addLayer(it.layer);
    else coarseLayer.removeLayer(it.layer);
    it.onMap = show;
    if (show) shown++;
  }
  return shown;
}

/* ------------------------------------------------------------------ *
 * Optional full network (viewport-culled canvas)
 * ------------------------------------------------------------------ */

function buildNetworkIndex(fc) {
  const items = [];
  for (const f of fc.features) {
    const coords = f.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    items.push({
      props: f.properties ?? {},
      latlngs: toLatLngs(coords),
      bbox: bboxOf(coords),
      layer: null,
      onMap: false,
    });
  }
  return items;
}

function syncNetwork(view) {
  const zoom = map.getZoom();
  const allow = zoom >= NETWORK_MIN_ZOOM;
  let shown = 0;
  for (const it of state.data.network) {
    const show = allow && bboxIntersects(it.bbox, view);
    if (show === it.onMap) {
      if (show) shown++;
      continue;
    }
    if (show) {
      it.layer =
        it.layer ??
        L.polyline(it.latlngs, {
          pane: 'pane-network',
          renderer: networkRenderer,
          color: '#2f4a86',
          weight: 1,
          opacity: 0.5,
          interactive: false,
        });
      networkLayer.addLayer(it.layer);
    } else {
      networkLayer.removeLayer(it.layer);
    }
    it.onMap = show;
    if (show) shown++;
  }
  $('network-status').textContent = allow
    ? `全量路网 ${shown.toLocaleString('en-US')} 段`
    : `全量路网已加载（缩放 ≥ ${NETWORK_MIN_ZOOM} 显示）`;
}

/** Downloads the 4.4 MB OSM network once; resolves false if the CDN is unreachable. */
async function ensureNetworkLoaded(btn) {
  if (state.networkLoaded) return true;
  if (state.networkLoading) return state.networkLoading;

  const task = (async () => {
    if (btn) {
      btn.classList.add('is-busy');
      btn.textContent = '加载中…';
    }
    // The CDN occasionally resets mid-transfer; one retry is cheap.
    let fc = null;
    for (let attempt = 0; attempt < 2 && !fc; attempt++) {
      try {
        const res = await fetch(FULL_NETWORK_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        fc = await res.json();
      } catch (err) {
        console.warn(`network load attempt ${attempt + 1} failed:`, err);
      }
    }
    if (!fc) return false;
    state.data.network = buildNetworkIndex(fc);
    state.networkLoaded = true;
    return true;
  })().finally(() => {
    state.networkLoading = null;
    if (btn) btn.classList.remove('is-busy');
  });

  state.networkLoading = task;
  return task;
}

function setNetworkVisible(on, btn) {
  if (on) {
    // The detailed edges supersede the coarse backdrop; drawing both would
    // double the per-frame path count for no visual gain.
    for (const it of [...state.data.coarse.low, ...(state.data.coarse.high ?? [])]) {
      if (it.onMap) coarseLayer.removeLayer(it.layer);
      it.onMap = false;
    }
    networkLayer.addTo(map);
    state.networkOn = true;
    if (btn) {
      btn.textContent = '隐藏路网';
      btn.classList.add('is-on');
    }
    scheduleSync();
    return;
  }
  for (const it of state.data.network ?? []) {
    if (it.onMap) networkLayer.removeLayer(it.layer);
    it.onMap = false;
  }
  map.removeLayer(networkLayer);
  state.networkOn = false;
  if (btn) {
    btn.textContent = '全量路网';
    btn.classList.remove('is-on');
  }
  $('network-status').textContent = '';
}

async function toggleFullNetwork(btn) {
  if (state.networkOn) return setNetworkVisible(false, btn);
  const ok = await ensureNetworkLoaded(btn);
  if (!ok) {
    btn.textContent = '加载失败';
    setTimeout(() => {
      btn.textContent = '全量路网';
    }, 2500);
    return;
  }
  setNetworkVisible(true, btn);
}

/* ------------------------------------------------------------------ *
 * Info card
 * ------------------------------------------------------------------ */

const row = (label, value) => `<dt>${label}</dt><dd>${value}</dd>`;

function linesThroughStation(st) {
  return state.data.lines
    .filter((ln) => bboxIntersects(pointBBox(st.latlng), ln.bbox) && distanceToLine(st.latlng, ln.latlngs, 25) < 25)
    .map((ln) => ln.props.name);
}

/**
 * The OSM network carries no line names, so an unnamed segment is attributed
 * to the closest catalogued corridor only when it genuinely lies on it.
 */
const EDGE_MATCH_KM = 5;

function attributeEdge(edge) {
  const mid = edge.latlngs[Math.floor(edge.latlngs.length / 2)];
  let best = null;
  for (const ln of state.data.lines) {
    if (!bboxIntersects(pointBBox(mid), ln.bbox)) continue;
    const d = distanceToLine(mid, ln.latlngs, EDGE_MATCH_KM);
    if (d <= EDGE_MATCH_KM && (!best || d < best.d)) best = { d, rec: ln };
  }
  return best;
}

const yesNo = (v) => (v === undefined ? '—' : v ? '是' : '否');

function edgeCardHtml(rec) {
  const p = rec.props;
  const hit = attributeEdge(rec);
  const line = hit?.rec.props;
  return `
    <div class="card-head">
      <div>
        <h3 class="card-title">${line ? line.name : '未命名铁路区段'}</h3>
        <p class="card-sub">${line ? `该区段属于 ${line.name}` : '数据源未提供该边名称'}</p>
      </div>
      <button type="button" class="card-close" aria-label="关闭">✕</button>
    </div>
    <span class="card-kind" style="color:${line ? PALETTE[familyOf(line)] : '#6f86c9'}"><i></i>OSM 单条边</span>
    <dl class="card-rows">
      ${row('区段长度', p.km !== undefined ? `${Number(p.km).toFixed(2)} km` : '—')}
      ${row('轨距', p.gauge ? `${p.gauge} mm` : '—')}
      ${row('电气化', yesNo(p.electrified))}
      ${row('归属判定', hit ? `距 ${line.name} ${hit.d.toFixed(2)} km` : `未匹配到 ${EDGE_MATCH_KM} km 内的命名线路`)}
      ${line ? row('开通年份', `${line.year} 年`) : ''}
      ${line ? row('设计时速', `${line.speed} km/h`) : ''}
      ${line ? row('线路里程', `${line.officialKm} km`) : ''}
    </dl>
    <div class="card-chips"><span class="chip">几何来源 OpenStreetMap (ODbL)</span></div>`;
}

function lineCardHtml(rec) {
  const p = rec.props;
  return `
    <div class="card-head">
      <div>
        <h3 class="card-title">${p.name}</h3>
        <p class="card-sub">${p.nameEn}</p>
      </div>
      <button type="button" class="card-close" aria-label="关闭">✕</button>
    </div>
    <span class="card-kind" style="color:${PALETTE[familyOf(p)]}"><i></i>${p.types.join(' / ')} 列车</span>
    <dl class="card-rows">
      ${row('开通年份', `${p.year} 年`)}
      ${row('设计时速', `${p.speed} km/h`)}
      ${row('线路里程', `${p.officialKm} km`)}
      ${row('图示路径', `${p.lengthKm} km`)}
      ${row('端点', p.endpoints ? p.endpoints.join(' — ') : '—')}
      ${row('运营主体', p.operator)}
    </dl>
    <div class="card-chips">${(p.cities ?? []).map((c) => `<span class="chip">${c}</span>`).join('')}</div>`;
}

function stationCardHtml(rec, viaLines) {
  const p = rec.props;
  return `
    <div class="card-head">
      <div>
        <h3 class="card-title">${p.name}</h3>
        <p class="card-sub">${p.nameEn}${p.pinyin ? ` · ${p.pinyin}` : ''}</p>
      </div>
      <button type="button" class="card-close" aria-label="关闭">✕</button>
    </div>
    <span class="card-kind"><i></i>${TIER_LABEL[p.tier] ?? p.tier}</span>
    <dl class="card-rows">
      ${row('省份', p.province || '—')}
      ${row('所属铁路局', p.bureau ? `中国铁路${p.bureau}集团有限公司` : '—')}
      ${row('境内线路', viaLines.length ? `${viaLines.length} 条` : '—')}
      ${row('电报码', p.telecode || '—')}
      ${row('坐标', `${rec.latlng[1].toFixed(4)}°E ${rec.latlng[0].toFixed(4)}°N`)}
    </dl>
    ${viaLines.length ? `<div class="card-chips">${viaLines.map((c) => `<span class="chip">${c}</span>`).join('')}</div>` : ''}`;
}

function bureauCardHtml(rec) {
  const p = rec.props;
  const stations = state.data.stations.filter((s) => s.props.bureau === p.bureau);
  const lines = new Set();
  for (const s of stations) for (const n of linesThroughStation(s)) lines.add(n);

  const fleet = BUREAU_FLEETS[p.bureau] ?? { models: [] };
  const models = fleet.models;
  const total =
    fleet.units == null
      ? '—'
      : `${fleet.units.toLocaleString('zh-CN')} ${fleet.unit ?? '组'}`;

  const gallery = models.length
    ? `<div class="emu-list">${models
        .map((id) => {
          const m = TRAIN_MODELS[id];
          if (!m) return '';
          const has3d = Boolean(MODELS[id] && MODELS[id].model);
          return `<figure class="emu-row${has3d ? ' emu-row--3d' : ''}"${
            has3d ? ` data-detail="${id}" role="link" tabindex="0" aria-label="查看 ${id} 3D 展示"` : ''
          }>
              ${trainSvg(id, { cars: 4, uid: `${p.id}-${id}` })}
              <figcaption><b>${id}</b><span>${trainSpec(id)}</span><em>${m.origin}</em></figcaption>
              ${has3d ? '<span class="emu-3d">3D</span>' : ''}
            </figure>`;
        })
        .join('')}</div>
       <p class="emu-note">
        数据口径：${FLEET_AS_OF}公开报道整理，非官方现车表；"标准组"按 8 辆=1、16/17 辆=2 折算，部分局直接以"组"计。
        ${fleet.note ? `注意：${fleet.note}。` : ''}
        数量随新线开通与车辆调配动态变化，车组号级实时配属请查 EmuSearch 等专业库。
       </p>`
    : '<p class="emu-note">该路局暂无配属数据。</p>';

  return `
    <div class="card-head">
      <div>
        <h3 class="card-title">${p.name}</h3>
        <p class="card-sub">机关驻地 ${p.shortName} · ${stations.length} 座车站 · ${models.length} 型动车组</p>
      </div>
      <button type="button" class="card-close" aria-label="关闭">✕</button>
    </div>
    <span class="card-kind"><i></i>铁路局集团</span>
    <dl class="card-rows">
      ${row('机关驻地', p.shortName)}
      ${row('管辖范围', p.scope)}
      ${row('动车组配属', total)}
      ${row('境内车站', `${stations.length} 座`)}
      ${row('经过干线', lines.size ? `${lines.size} 条` : '—')}
      ${row('坐标', `${rec.latlng[1].toFixed(4)}°E ${rec.latlng[0].toFixed(4)}°N`)}
    </dl>
    <h4 class="emu-heading">配属车型 · ${models.length} 型</h4>
    ${gallery}`;
}

function createHoverTip() {
  const el = document.createElement('div');
  el.className = 'hover-tip';
  el.setAttribute('aria-hidden', 'true');
  $('app').appendChild(el);
  return {
    show(text, point) {
      el.textContent = text;
      el.style.transform = `translate(${Math.round(point.x + 14)}px, ${Math.round(point.y + 16)}px)`;
      el.classList.add('is-on');
    },
    hide() {
      el.classList.remove('is-on');
    },
  };
}

function showCard(kind, rec, latlng) {
  const card = $('card');
  state.cardOwner = rec.polyline ?? rec.marker ?? null;
  state.cardLatLng = latlng;

  const render = {
    line: lineCardHtml,
    edge: edgeCardHtml,
    bureau: bureauCardHtml,
    station: (r) => stationCardHtml(r, linesThroughStation(r)),
  };
  card.innerHTML = render[kind](rec);
  card.classList.toggle('card--wide', kind === 'bureau');
  card.setAttribute('aria-hidden', 'false');
  card.querySelector('.card-close').addEventListener('click', hideCard);
  // Rows for models that have a GLB jump to the 3D showcase page.
  for (const row of card.querySelectorAll('[data-detail]')) {
    const go = () => {
      location.href = `detail.html?model=${encodeURIComponent(row.dataset.detail)}`;
    };
    row.addEventListener('click', (ev) => {
      ev.stopPropagation();
      go();
    });
    row.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        go();
      }
    });
  }
  card.classList.remove('is-open');

  positionCard(latlng);
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('is-open')));
  scheduleSync();

  // Leaflet derives a marker/path click before the container sees its own
  // click event; without this the same tap would immediately close the card.
  cardJustOpened = true;
  setTimeout(() => {
    cardJustOpened = false;
  }, 0);
}

function positionCard(latlng) {
  const card = $('card');
  if (isMobile()) return;
  const point = map.latLngToContainerPoint(latlng);
  const { width: w, height: h } = card.getBoundingClientRect();
  const size = map.getSize();
  let x = point.x + 18;
  if (x + w > size.x - 12) x = point.x - w - 18;
  x = Math.max(12, x);
  const y = Math.min(Math.max(70, point.y - h / 2), Math.max(70, size.y - h - 70));
  card.style.left = `${x}px`;
  card.style.top = `${y}px`;
}

function hideCard() {
  $('card').classList.remove('is-open');
  $('card').setAttribute('aria-hidden', 'true');
  state.cardOwner = null;
  state.cardLatLng = null;
  scheduleSync();
}

/* ------------------------------------------------------------------ *
 * Filter panel
 * ------------------------------------------------------------------ */

function checkbox(group, key, label, swatch, count) {
  const checked = state[group].has(key) ? 'checked' : '';
  return `
    <label class="check">
      <input type="checkbox" data-group="${group}" data-key="${encodeURIComponent(key)}" ${checked} />
      ${swatch ? `<i class="swatch" style="color:${swatch}"></i>` : ''}
      <span>${label}</span>
      ${count === undefined ? '' : `<em>${count}</em>`}
    </label>`;
}

function buildPanel() {
  const lineCounts = {};
  for (const g of LINE_GROUPS) {
    lineCounts[g.key] = state.data.lines.filter((ln) => (ln.props.types ?? []).some((t) => g.types.includes(t))).length;
  }
  $('filter-line-types').innerHTML = LINE_GROUPS.map((g) =>
    checkbox('lineTypes', g.key, `${g.label} ${lineCounts[g.key]}`, PALETTE[g.family])
  ).join('');

  const tierCounts = {};
  for (const st of state.data.stations) tierCounts[st.props.tier] = (tierCounts[st.props.tier] ?? 0) + 1;
  $('filter-station-tiers').innerHTML = STATION_TIERS.map((t) =>
    checkbox('stationTiers', t.key, `${t.label} ${tierCounts[t.key] ?? 0}`, null)
  ).join('');

  const bureauCounts = {};
  for (const st of state.data.stations) bureauCounts[st.props.bureau] = (bureauCounts[st.props.bureau] ?? 0) + 1;
  $('filter-bureaus').innerHTML = [...state.bureaus]
    .sort((a, b) => (bureauCounts[b] ?? 0) - (bureauCounts[a] ?? 0))
    .map((b) => checkbox('bureaus', b, `${b} ${bureauCounts[b] ?? 0}`, null))
    .join('');

  const panel = $('panel');
  panel.addEventListener('change', (e) => {
    const input = e.target;
    if (!input.matches('input[type=checkbox]')) return;
    const group = input.dataset.group;
    const key = decodeURIComponent(input.dataset.key);
    if (input.checked) state[group].add(key);
    else state[group].delete(key);
    scheduleSync();
  });

  panel.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-all]');
    if (!btn) return;
    const group = btn.dataset.all;
    const allKeys =
      group === 'lineTypes'
        ? LINE_GROUPS.map((g) => g.key)
        : group === 'stationTiers'
          ? STATION_TIERS.map((t) => t.key)
          : [...state.bureaus];
    state[group] = state[group].size === 0 ? new Set(allKeys) : new Set();
    for (const input of panel.querySelectorAll(`input[data-group="${group}"]`)) {
      input.checked = state[group].has(decodeURIComponent(input.dataset.key));
    }
    scheduleSync();
  });

  $('panel-toggle').addEventListener('click', () => {
    const hidden = panel.classList.toggle('is-hidden');
    $('panel-toggle').setAttribute('aria-expanded', String(!hidden));
  });
  $('panel-close').addEventListener('click', () => panel.classList.add('is-hidden'));
}

function buildLegend() {
  $('legend').innerHTML = [
    ...LINE_GROUPS.map((g) => `<div class="legend-row" style="color:${PALETTE[g.family]}"><i></i>${g.label}</div>`),
    `<div class="legend-row" style="color:#ffd166"><b class="dot dot--1"></b>省会车站</div>`,
    `<div class="legend-row" style="color:#f2f6ff"><b class="dot dot--2"></b>地级市车站</div>`,
    `<div class="legend-row" style="color:#5f7bb5"><b class="dot dot--3"></b>县级车站</div>`,
    `<div class="legend-row" style="color:#5fd4ff"><b class="diamond"></b>铁路局机关驻地</div>`,
  ].join('');
}

/* ------------------------------------------------------------------ *
 * FPS meter (interaction only, so it costs nothing at rest)
 * ------------------------------------------------------------------ */

function attachFpsMeter() {
  const badge = $('zoom-badge');
  const TIER_TEXT = ['干线优先', '地级市可见', '全部展开'];
  let frames = 0;
  let windowStart = 0;
  let running = false;
  let fps = null;

  const paint = () => {
    badge.textContent =
      `zoom ${map.getZoom()} · ${TIER_TEXT[state.tier - 1]}` + (fps === null ? '' : ` · ${fps} fps`);
  };

  const tick = (now) => {
    frames++;
    if (now - windowStart >= 400) {
      fps = Math.round((frames * 1000) / (now - windowStart));
      frames = 0;
      windowStart = now;
      paint();
    }
    if (running) requestAnimationFrame(tick);
  };

  const start = () => {
    if (running) return;
    running = true;
    frames = 0;
    windowStart = performance.now();
    requestAnimationFrame(tick);
  };
  const stop = () => {
    running = false;
    paint();
  };

  map.on('movestart zoomstart', start);
  map.on('moveend zoomend', stop);
  paint();
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

function fail(err) {
  console.error(err);
  const text = $('loader-text');
  text.className = 'error';
  text.textContent = `数据加载失败：${err.message}`;
}

async function boot() {
  createMap();

  let loaded;
  try {
    loaded = await loadData();
  } catch (err) {
    fail(err);
    return;
  }

  state.data.lines = loaded.lines;
  state.data.stations = loaded.stations;
  state.data.bureaus = loaded.bureaus;
  state.bureaus = new Set(loaded.bureaus.map((b) => b.props.bureau));

  drawProvinces(loaded.provinces);
  drawCoarseNetwork(loaded.coarse);
  drawBureaus(loaded.bureaus);
  drawLines(loaded.lines);
  drawStations(loaded.stations);

  buildPanel();
  buildLegend();
  attachFpsMeter();

  map.on('zoomend', () => {
    state.tier = tierForZoom(map.getZoom());
    scheduleSync();
  });
  map.on('moveend', scheduleSync);

  const tip = createHoverTip();
  const labelFor = (hit) =>
    hit.kind === 'line'
      ? `${hit.rec.props.name} · ${hit.rec.props.types.join('/')} · ${hit.rec.props.officialKm} km`
      : `${hit.rec.props.name} · ${TIER_LABEL[hit.rec.props.tier] ?? ''}`;

  let moveEvent = null;
  let moveQueued = false;
  map.on('mousemove', (e) => {
    moveEvent = e;
    if (moveQueued) return;
    moveQueued = true;
    requestAnimationFrame(() => {
      moveQueued = false;
      const ev = moveEvent;
      if (!ev) return;
      const hit = pickFeature(ev.latlng);
      setHover(nearestLine(ev.latlng));
      map.getContainer().style.cursor = hit ? 'pointer' : '';
      if (hit) tip.show(labelFor(hit), ev.containerPoint);
      else tip.hide();
    });
  });
  map.on('mouseout', () => {
    tip.hide();
    setHover(null);
    map.getContainer().style.cursor = '';
  });

  map.on('click', (e) => {
    if (cardJustOpened) return;
    const hit = pickAt(e.latlng);
    if (hit) {
      showCard(hit.kind, hit.rec, hit.kind === 'station' ? hit.rec.latlng : e.latlng);
      return;
    }
    if (state.cardOwner) hideCard();
  });
  window.addEventListener('resize', () => {
    if (state.cardLatLng) positionCard(state.cardLatLng);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideCard();
  });

  $('replay').addEventListener('click', playGrowth);
  $('toggle-network').addEventListener('click', (e) => toggleFullNetwork(e.currentTarget));

  syncVisibility();
  $('loader').classList.add('is-done');
  setTimeout(() => $('loader')?.remove(), 500);
  playGrowth();

  // Every segment gets a card, so the detailed network loads by itself once the
  // map is zoomed in far enough for single edges to be worth clicking. Loading
  // it earlier measurably costs frame rate at country scale.
  let networkAuto = false;
  const maybeAutoNetwork = () => {
    if (networkAuto || isMobile() || map.getZoom() < NETWORK_MIN_ZOOM) return;
    networkAuto = true;
    const btn = $('toggle-network');
    ensureNetworkLoaded(btn).then((ok) => {
      if (ok) setNetworkVisible(true, btn);
      else {
        btn.textContent = '全量路网';
        networkAuto = false;
      }
    });
  };
  map.on('zoomend', maybeAutoNetwork);

  if (isMobile()) $('panel').classList.add('is-hidden');

  // Test seam: lets the dev harness project a latlng to a pixel so it can
  // click canvas-drawn markers. Tree-shaken out of production builds.
  if (import.meta.env.DEV) window.CNTHUB = { map: () => map, state, pickAt, pickFeature };
}

boot();

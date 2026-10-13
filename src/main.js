import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';

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

// railroute-ts published CDN copy of the full China network (12 445 edges, ~4.4 MB).
const FULL_NETWORK_URL =
  'https://cdn.jsdelivr.net/gh/mayurrawte/railroutes@networks-v1/railroute-ts/src/networks/china-v0.json';

const CHINA_CENTER = [34.5, 104.0];
const CHINA_ZOOM = 5;
// Full territory in the default view, South China Sea islands included.
const CHINA_BOUNDS = [
  [3.6, 73.5],
  [53.6, 135.0],
];
const LINE_STAGGER_MS = 100;
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

const STATION_TIERS = ['4F', '4A', '一等站', '二等站'];

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => window.innerWidth <= MOBILE_BP;

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

const state = {
  lineTypes: new Set(LINE_GROUPS.map((g) => g.key)),
  stationTiers: new Set(STATION_TIERS),
  bureaus: new Set(),
  tier: 1,
  data: { lines: [], stations: [] },
  cardOwner: null,
  cardLatLng: null,
  fullNetwork: null,
};

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ *
 * Geometry helpers
 * ------------------------------------------------------------------ */

/** GeoJSON [lng, lat] -> Leaflet [lat, lng] */
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

/** Path from the start up to `target` km, with the last vertex interpolated. */
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

function distanceToLine(latlng, pts) {
  let best = Infinity;
  const [lat, lng] = latlng;
  for (let i = 1; i < pts.length; i++) {
    const [latA, lngA] = pts[i - 1];
    const [latB, lngB] = pts[i];
    const dy = latB - latA;
    const dx = lngB - lngA;
    const norm = dx * dx + dy * dy;
    let t = norm === 0 ? 0 : ((lat - latA) * dy + (lng - lngA) * dx) / norm;
    t = Math.max(0, Math.min(1, t));
    const d = haversine([lat, lng], [latA + dy * t, lngA + dx * t]);
    if (d < best) best = d;
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Map
 * ------------------------------------------------------------------ */

let map;

function createMap() {
  map = L.map('map', {
    center: CHINA_CENTER,
    zoom: CHINA_ZOOM,
    minZoom: 3,
    maxZoom: 12,
    zoomControl: false,
    wheelPxPerZoomLevel: 90,
    maxBounds: [[-5, 60], [65, 150]],
    maxBoundsViscosity: 0.6,
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer(TILE.url, {
    attribution: TILE.attribution,
    subdomains: TILE.subdomains ?? 'abc',
    maxZoom: TILE.maxZoom,
    minZoom: 3,
    keepBuffer: 2,
    updateWhenIdle: isMobile(),
  }).addTo(map);

  for (const [name, z] of [
    ['pane-boundary', 350],
    ['pane-network', 380],
    ['pane-line', 420],
    ['pane-tip', 500],
    ['pane-bureau', 640],
    ['pane-station', 660],
    ['pane-label', 680],
  ]) {
    map.createPane(name).style.zIndex = z;
  }

  map.fitBounds(CHINA_BOUNDS, { padding: [16, 16], animate: false });
  state.tier = tierForZoom(map.getZoom());
}

/* ------------------------------------------------------------------ *
 * Data loading
 * ------------------------------------------------------------------ */

async function loadJson(file) {
  const res = await fetch(`${import.meta.env.BASE_URL}${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.json();
}

async function loadData() {
  const [provinces, railways, stations, bureaus] = await Promise.all([
    loadJson('china-provinces.json'),
    loadJson('railways.json'),
    loadJson('stations.json'),
    loadJson('railway-bureaus.json'),
  ]);

  const lines = railways.features.map((f) => ({
    props: f.properties,
    latlngs: toLatLngs(f.geometry.coordinates),
  }));

  const stationList = stations.features.map((f) => ({
    props: f.properties,
    latlng: [f.geometry.coordinates[1], f.geometry.coordinates[0]],
  }));

  // Which demo lines physically pass through each station (<25 km).
  for (const st of stationList) {
    st.viaLines = lines
      .filter((ln) => distanceToLine(st.latlng, ln.latlngs) < 25)
      .map((ln) => ln.props.name);
  }

  return {
    provinces,
    lines,
    stations: stationList,
    bureaus: bureaus.features.map((f) => ({
      props: f.properties,
      latlng: [f.geometry.coordinates[1], f.geometry.coordinates[0]],
    })),
  };
}

/* ------------------------------------------------------------------ *
 * Boundaries
 * ------------------------------------------------------------------ */

function drawProvinces(fc) {
  L.geoJSON(fc, {
    pane: 'pane-boundary',
    interactive: false,
    style: (feature) =>
      feature.properties.kind === 'boundary-line'
        ? { color: '#7d95d6', weight: 1.1, opacity: 0.8, dashArray: '2 4', fill: false }
        : { color: '#3f4d7a', weight: 0.9, opacity: 0.85, fillColor: '#16224a', fillOpacity: 0.22 },
  }).addTo(map);
}

/* ------------------------------------------------------------------ *
 * Railway bureaus
 * ------------------------------------------------------------------ */

function drawBureaus(bureaus) {
  for (const b of bureaus) {
    const marker = L.marker(b.latlng, {
      pane: 'pane-bureau',
      icon: L.divIcon({
        className: 'bureau-icon',
        html: '<i></i>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
      keyboard: false,
    })
      .bindTooltip(
        `<b>${b.props.name}</b><span>${b.props.scope}<br>机关驻地：${b.props.shortName}</span>`,
        { className: 'bureau-tip', direction: 'top', offset: [0, -10], opacity: 1 }
      )
      .addTo(map);

    b.marker = marker;
  }
}

/* ------------------------------------------------------------------ *
 * Lines + growth animation
 * ------------------------------------------------------------------ */

const lineGroup = L.layerGroup();
const tipLayer = L.layerGroup();

function familyOf(props) {
  if (props.family === 'conventional') return 'conventional';
  if (props.family === 'intercity') return 'intercity';
  return props.types?.includes('D') && !props.types?.includes('G') ? 'emu' : 'hsr';
}

function drawLines(lines) {
  lineGroup.addTo(map);

  for (const [i, ln] of lines.entries()) {
    const family = familyOf(ln.props);
    const polyline = L.polyline([], {
      pane: 'pane-line',
      color: PALETTE[family],
      weight: ln.props.tier === 'trunk' ? 2.6 : 1.9,
      opacity: 0.92,
      lineCap: 'round',
      className: `rail-line rail-line--${family}`,
    });

    polyline._cnthub = { kind: 'line', rec: ln };
    polyline.on('click', onFeatureClick);
    polyline.on('mouseover', () => polyline.setStyle({ weight: (ln.props.tier === 'trunk' ? 2.6 : 1.9) + 1.4 }));
    polyline.on('mouseout', () => {
      if (state.cardOwner !== polyline) polyline.setStyle({ weight: ln.props.tier === 'trunk' ? 2.6 : 1.9 });
    });

    ln.polyline = polyline;
    ln.pts = ln.latlngs;
    ln.cum = cumulative(ln.latlngs);
    ln.duration = Math.min(2400, 800 + (ln.props.lengthKm ?? 500) * 0.7);
    ln.order = i;
    lineGroup.addLayer(polyline);
  }
}

function playGrowth() {
  tipLayer.clearLayers();
  for (const ln of state.data.lines) cancelGrowth(ln);

  for (const ln of state.data.lines) {
    if (!map.hasLayer(ln.polyline)) continue;
    ln.polyline.setLatLngs([]);

    // rAF is suspended in a hidden tab, so never leave the map blank there.
    if (reduceMotion || isMobile() || document.hidden) {
      ln.polyline.setLatLngs(ln.pts);
      continue;
    }

    const tip = L.circleMarker(ln.pts[0], {
      pane: 'pane-tip',
      radius: 3,
      color: '#ffffff',
      weight: 0,
      fillColor: '#ffffff',
      fillOpacity: 0.95,
      className: 'growth-tip',
      interactive: false,
    });
    tipLayer.addLayer(tip);
    ln.tip = tip;
    ln.raf = requestAnimationFrame((t) => growthFrame(ln, t + ln.order * LINE_STAGGER_MS));
  }
}

function growthFrame(ln, start) {
  const total = ln.cum[ln.cum.length - 1];
  const step = (now) => {
    const p = (now - start) / ln.duration;
    if (p < 0) {
      ln.raf = requestAnimationFrame(step);
      return;
    }
    const eased = 1 - Math.pow(1 - Math.min(1, p), 3);
    const path = sliceTo(ln.pts, ln.cum, eased * total);
    ln.polyline.setLatLngs(path);
    ln.tip?.setLatLng(path[path.length - 1]);
    if (p < 1) ln.raf = requestAnimationFrame(step);
    else finishGrowth(ln);
  };
  ln.raf = requestAnimationFrame(step);
}

function cancelGrowth(ln) {
  if (ln.raf) cancelAnimationFrame(ln.raf);
  ln.raf = null;
  if (ln.tip) {
    tipLayer.removeLayer(ln.tip);
    ln.tip = null;
  }
}

function finishGrowth(ln) {
  ln.polyline.setLatLngs(ln.pts);
  cancelGrowth(ln);
}

/* ------------------------------------------------------------------ *
 * Stations
 * ------------------------------------------------------------------ */

const stationLayer = L.layerGroup();
const labelLayer = L.layerGroup();

function drawStations(stations) {
  stationLayer.addTo(map);
  labelLayer.addTo(map);

  for (const st of stations) {
    const hub = st.props.level === 'hub';
    const size = hub ? 13 : st.props.level === 'city' ? 10 : 8;
    const marker = L.marker(st.latlng, {
      pane: 'pane-station',
      icon: L.divIcon({
        className: `station-marker${hub ? ' station-marker--hub' : ''}`,
        html: `<span class="station-dot${hub ? ' station-dot--hub' : ''}" style="width:${size}px;height:${size}px;display:block"></span>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
      keyboard: false,
      title: st.props.name,
    });

    marker._cnthub = { kind: 'station', rec: st };
    marker.on('click', onFeatureClick);

    st.marker = marker;
    st.label = L.marker(st.latlng, {
      pane: 'pane-label',
      interactive: false,
      icon: L.divIcon({
        className: 'station-label',
        html: st.props.name,
        iconSize: null,
        iconAnchor: [-size / 2 - 2, 8],
      }),
    });
    stationLayer.addLayer(marker);
  }
}

/* ------------------------------------------------------------------ *
 * Visibility: filters x zoom tier
 * ------------------------------------------------------------------ */

function tierForZoom(z) {
  if (z < 6) return 1;
  if (z <= 8) return 2;
  return 3;
}

const LINE_TIER_MIN = { trunk: 1, primary: 2, branch: 3 };
const STATION_TIER_MIN = { hub: 1, city: 2, county: 3, all: 3 };

function lineVisible(ln) {
  if (state.tier < (LINE_TIER_MIN[ln.props.tier] ?? 1)) return false;
  const allowed = new Set();
  for (const g of LINE_GROUPS) if (state.lineTypes.has(g.key)) g.types.forEach((t) => allowed.add(t));
  return (ln.props.types ?? []).some((t) => allowed.has(t));
}

function stationVisible(st) {
  const { tier, level, bureau } = st.props;
  if (!state.stationTiers.has(tier)) return false;
  if (state.bureaus.size && !state.bureaus.has(bureau)) return false;
  return state.tier >= (STATION_TIER_MIN[level] ?? 3);
}

function bureauVisible(b) {
  return state.bureaus.has(b.props.bureau);
}

function applyVisibility() {
  let lines = 0;
  let km = 0;
  for (const ln of state.data.lines) {
    const show = lineVisible(ln);
    if (show && !map.hasLayer(ln.polyline)) {
      lineGroup.addLayer(ln.polyline);
      if (!ln.polyline.getLatLngs().length) ln.polyline.setLatLngs(ln.pts);
    }
    if (!show && map.hasLayer(ln.polyline)) {
      cancelGrowth(ln);
      lineGroup.removeLayer(ln.polyline);
    }
    ln.polyline.getElement()?.classList.toggle('rail-line--selected', state.cardOwner === ln.polyline);
    if (show) {
      lines++;
      km += ln.props.lengthKm ?? 0;
    }
  }

  let stations = 0;
  for (const st of state.data.stations) {
    const show = stationVisible(st);
    if (show) stations++;
    if (show && !map.hasLayer(st.marker)) stationLayer.addLayer(st.marker);
    if (!show && map.hasLayer(st.marker)) stationLayer.removeLayer(st.marker);

    const label = show && (state.tier >= 3 || (state.tier === 2 && st.props.level === 'hub'));
    if (label && !map.hasLayer(st.label)) labelLayer.addLayer(st.label);
    if (!label && map.hasLayer(st.label)) labelLayer.removeLayer(st.label);
  }

  for (const b of state.data.bureaus) {
    const show = bureauVisible(b);
    b.marker.getElement()?.classList.toggle('is-dimmed', !show);
    if (show && !map.hasLayer(b.marker)) b.marker.addTo(map);
    if (!show && map.hasLayer(b.marker)) map.removeLayer(b.marker);
  }

  $('stat-lines').textContent = `${lines}/${state.data.lines.length}`;
  $('stat-stations').textContent = `${stations}/${state.data.stations.length}`;
  $('stat-km').textContent = `${km.toLocaleString('zh-CN')} km`;
  $('panel-foot').innerHTML =
    `<b>${lines}</b> 条线路 · <b>${stations}</b> 座车站可见<br>` +
    `缩放分级：${['干线 + 枢纽', '干线/区域性 + 地级市', '全部线路与车站'][state.tier - 1]}`;
}

/* ------------------------------------------------------------------ *
 * Info card
 * ------------------------------------------------------------------ */

function onFeatureClick(e) {
  L.DomEvent.stopPropagation(e);
  const { kind, rec } = e.target._cnthub;
  const latlng = kind === 'line' ? e.latlng : rec.latlng;
  showCard(kind, rec, latlng);
}

function row(label, value) {
  return `<dt>${label}</dt><dd>${value}</dd>`;
}

function lineCardHtml(rec) {
  const p = rec.props;
  const swatch = PALETTE[familyOf(p)];
  return `
    <div class="card-head">
      <div>
        <h3 class="card-title">${p.name}</h3>
        <p class="card-sub">${p.nameEn}</p>
      </div>
      <button type="button" class="card-close" aria-label="关闭">✕</button>
    </div>
    <span class="card-kind" style="color:${swatch}"><i></i>${p.types.join(' / ')} 列车</span>
    <dl class="card-rows">
      ${row('开通年份', `${p.year} 年`)}
      ${row('设计时速', `${p.speed} km/h`)}
      ${row('线路里程', `${p.officialKm} km`)}
      ${row('图示路径', `${p.lengthKm} km`)}
      ${row('坐标点数', p.points)}
      ${row('运营主体', p.operator)}
    </dl>
    <div class="card-chips">${(p.cities ?? []).map((c) => `<span class="chip">${c}</span>`).join('')}</div>`;
}

function stationCardHtml(rec) {
  const p = rec.props;
  return `
    <div class="card-head">
      <div>
        <h3 class="card-title">${p.name}</h3>
        <p class="card-sub">${p.nameEn}${p.pinyin ? ` · ${p.pinyin}` : ''}</p>
      </div>
      <button type="button" class="card-close" aria-label="关闭">✕</button>
    </div>
    <span class="card-kind"><i></i>${p.tier} · ${p.level === 'hub' ? '枢纽站' : '中间站'}</span>
    <dl class="card-rows">
      ${row('所属铁路局', `中国铁路${p.bureau}集团有限公司`)}
      ${row('车站等级', p.tier)}
      ${row('途经车次', `${p.trains} 列/日`)}
      ${row('途经线路', rec.viaLines.length ? `${rec.viaLines.length} 条` : '—')}
      ${row('电报码', p.telecode || '—')}
      ${row('坐标', `${rec.latlng[1].toFixed(4)}°E ${rec.latlng[0].toFixed(4)}°N`)}
    </dl>
    <div class="card-chips">${rec.viaLines.map((c) => `<span class="chip">${c}</span>`).join('')}</div>`;
}

function positionCard(latlng) {
  const card = $('card');
  if (isMobile()) return;
  const point = map.latLngToContainerPoint(latlng);
  const { x: w, y: h } = card.getBoundingClientRect();
  const size = map.getSize();
  let x = point.x + 18;
  if (x + w > size.x - 12) x = point.x - w - 18;
  x = Math.max(12, x);
  const y = Math.min(Math.max(70, point.y - h / 2), Math.max(70, size.y - h - 70));
  card.style.left = `${x}px`;
  card.style.top = `${y}px`;
}

function showCard(kind, rec, latlng) {
  const card = $('card');
  if (state.cardOwner?.getElement) {
    state.cardOwner.getElement()?.classList.remove('rail-line--selected');
  }
  state.cardOwner = rec.polyline ?? rec.marker ?? null;
  state.cardLatLng = latlng;

  card.innerHTML = kind === 'line' ? lineCardHtml(rec) : stationCardHtml(rec);
  card.setAttribute('aria-hidden', 'false');
  card.querySelector('.card-close').addEventListener('click', hideCard);
  card.classList.remove('is-open');

  positionCard(latlng);
  requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('is-open')));
  applyVisibility();
}

function hideCard() {
  const card = $('card');
  card.classList.remove('is-open');
  card.setAttribute('aria-hidden', 'true');
  state.cardOwner = null;
  state.cardLatLng = null;
  applyVisibility();
}

/* ------------------------------------------------------------------ *
 * Filter panel
 * ------------------------------------------------------------------ */

function checkbox(group, key, label, swatch, count) {
  const checked = state[group].has(key) ? 'checked' : '';
  const color = swatch ? ` style="color:${swatch}"` : '';
  return `
    <label class="check">
      <input type="checkbox" data-group="${group}" data-key="${encodeURIComponent(key)}" ${checked} />
      ${swatch ? `<i class="swatch"${color}></i>` : ''}
      <span>${label}</span>
      ${count === undefined ? '' : `<em style="font-style:normal;color:#6f7fa6">${count}</em>`}
    </label>`;
}

function buildPanel() {
  $('filter-line-types').innerHTML = LINE_GROUPS.map((g) =>
    checkbox('lineTypes', g.key, g.label, PALETTE[g.family])
  ).join('');

  const tierCounts = {};
  for (const st of state.data.stations) tierCounts[st.props.tier] = (tierCounts[st.props.tier] ?? 0) + 1;
  $('filter-station-tiers').innerHTML = STATION_TIERS.map((t) =>
    checkbox('stationTiers', t, t === '4F' ? '4F 站' : t === '4A' ? '4A 站' : t, null, tierCounts[t] ?? 0)
  ).join('');

  const bureauCounts = {};
  for (const st of state.data.stations) bureauCounts[st.props.bureau] = (bureauCounts[st.props.bureau] ?? 0) + 1;
  $('filter-bureaus').innerHTML = [...state.bureaus]
    .map((b) => checkbox('bureaus', b, b, null, bureauCounts[b] ?? 0))
    .join('');

  $('panel').addEventListener('change', (e) => {
    const input = e.target;
    if (!input.matches('input[type=checkbox]')) return;
    const group = input.dataset.group;
    const key = decodeURIComponent(input.dataset.key);
    if (input.checked) state[group].add(key);
    else state[group].delete(key);
    applyVisibility();
  });

  $('panel').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-all]');
    if (!btn) return;
    const group = btn.dataset.all;
    const allKeys =
      group === 'lineTypes'
        ? LINE_GROUPS.map((g) => g.key)
        : group === 'stationTiers'
          ? STATION_TIERS
          : [...state.bureaus];
    const emptied = state[group].size === 0;
    state[group] = new Set(emptied ? allKeys : []);
    for (const input of $('panel').querySelectorAll(`input[data-group="${group}"]`)) {
      input.checked = state[group].has(decodeURIComponent(input.dataset.key));
    }
    applyVisibility();
  });

  $('panel-toggle').addEventListener('click', () => {
    const hidden = $('panel').classList.toggle('is-hidden');
    $('panel-toggle').setAttribute('aria-expanded', String(!hidden));
  });
  $('panel-close').addEventListener('click', () => $('panel').classList.add('is-hidden'));
}

function buildLegend() {
  $('legend').innerHTML = [
    ...LINE_GROUPS.map((g) => `<div class="legend-row" style="color:${PALETTE[g.family]}"><i></i>${g.label}</div>`),
    `<div class="legend-row" style="color:#5fd4ff"><i style="width:9px;height:9px;transform:rotate(45deg);border:1px solid currentColor;background:none;box-shadow:0 0 6px currentColor"></i>铁路局机关驻地</div>`,
  ].join('');
}

/* ------------------------------------------------------------------ *
 * Optional full network layer
 * ------------------------------------------------------------------ */

async function toggleFullNetwork(btn) {
  if (state.fullNetwork) {
    if (map.hasLayer(state.fullNetwork)) {
      map.removeLayer(state.fullNetwork);
      btn.textContent = '全量路网';
      btn.classList.remove('is-busy');
    } else {
      state.fullNetwork.addTo(map);
      btn.textContent = '隐藏全量路网';
    }
    return;
  }

  btn.classList.add('is-busy');
  btn.textContent = '加载中…';
  try {
    const res = await fetch(FULL_NETWORK_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const fc = await res.json();
    state.fullNetwork = L.geoJSON(fc, {
      pane: 'pane-network',
      interactive: false,
      renderer: L.canvas(),
      style: { color: '#2c3f77', weight: 1, opacity: 0.45 },
    }).addTo(map);
    btn.textContent = '隐藏全量路网';
  } catch (err) {
    console.error(err);
    btn.textContent = '路网加载失败';
    setTimeout(() => {
      btn.textContent = '全量路网';
      btn.classList.remove('is-busy');
    }, 2400);
    return;
  }
  btn.classList.remove('is-busy');
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

function fail(err) {
  console.error(err);
  const text = $('loader-text');
  text.className = 'error';
  text.textContent = `数据加载失败：${err.message}。请确认 data/ 目录已随构建产物一起部署，或运行 npm run dev。`;
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
  drawBureaus(loaded.bureaus);
  drawLines(loaded.lines);
  drawStations(loaded.stations);

  buildPanel();
  buildLegend();

  const TIER_LABEL = ['干线优先', '地级市可见', '全部展开'];
  const syncZoomBadge = () => {
    $('zoom-badge').textContent = `zoom ${map.getZoom()} · ${TIER_LABEL[state.tier - 1]}`;
  };
  map.on('zoomend', () => {
    state.tier = tierForZoom(map.getZoom());
    applyVisibility();
    syncZoomBadge();
  });
  syncZoomBadge();

  map.on('click', (e) => {
    // Leaflet derives a marker click from mouseup, so the map still sees a click
    // right after showCard(); ignore those or the card closes itself instantly.
    const target = e.originalEvent?.target;
    if (target?.closest?.('.leaflet-marker-icon, .rail-line')) return;
    hideCard();
  });
  map.on('move', () => {
    if (state.cardLatLng) positionCard(state.cardLatLng);
  });
  window.addEventListener('resize', () => {
    if (state.cardLatLng) positionCard(state.cardLatLng);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideCard();
  });

  $('replay').addEventListener('click', playGrowth);
  $('toggle-network').addEventListener('click', (e) => toggleFullNetwork(e.currentTarget));

  applyVisibility();
  $('loader').classList.add('is-done');
  setTimeout(() => $('loader').remove(), 500);
  playGrowth();

  // Loaded in a background tab: play the intro once the user actually looks at it.
  if (document.hidden) {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) playGrowth();
    }, { once: true });
  }

  if (isMobile()) $('panel').classList.add('is-hidden');
}

boot();

/**
 * Side-profile EMU drawings, generated as inline SVG (no raster images).
 *
 * Structure follows the classic approach: one <symbol> per standard coach,
 * repeated with <use>; the leading car is drawn separately with cubic
 * Béziers because its nose shell is the one shape that identifies a model.
 * All coordinates are integers, backgrounds are transparent, and no <filter>
 * is used (several browsers render filtered SVG blank).
 */

/** Nose shells. Each is a path in a 0..W box, front facing left. */
const NOSES = {
  // Long, low "dolphin" shell - CRH380A / CR400AF family.
  pointy: {
    w: 132,
    shell: 'M2 38 L2 30 C2 22 14 14 40 11 C74 7 108 8 128 12 L128 38 Z',
    glass: 'M16 24 C28 17 46 14 62 14 L58 25 L18 27 Z',
    band: 'M2 32 C10 30 22 29 34 28 L128 28 L128 33 L2 35 Z',
    bogie: [30, 104],
  },
  // Rounded shell - CRH2 / CRH5 (Shinkansen and Pendolino descendants).
  round: {
    w: 128,
    shell: 'M4 38 L4 26 C4 16 18 10 44 9 C78 7 108 10 124 15 L124 38 Z',
    glass: 'M18 22 C32 15 52 13 68 15 L64 25 L20 26 Z',
    band: 'M4 30 C14 28 26 27 40 27 L124 27 L124 32 L4 34 Z',
    bogie: [34, 100],
  },
  // Blunt, upright front - CRH1 / CRH3 (Regina and Velaro platforms).
  boxy: {
    w: 122,
    shell: 'M8 38 L8 16 C8 10 14 8 28 8 L118 8 L118 38 Z',
    glass: 'M16 15 L60 12 L58 23 L16 23 Z',
    band: 'M8 29 L118 29 L118 34 L8 34 Z',
    bogie: [34, 96],
  },
};

const CAR = { w: 116, h: 64, gap: 4 };

export const TRAIN_MODELS = {
  CRH1A: {
    label: 'CRH1A',
    family: '和谐号',
    top: 250,
    cars: 8,
    origin: '庞巴迪 Regina 平台 · 青岛四方庞巴迪',
    nose: 'boxy',
    body: ['#f5f7f9', '#d5dde6'],
    stripe: ['#1f6fbf', '#0d4a86'],
    skirt: '#3b4252',
    glass: '#151f2c',
    roof: '#c8d2de',
  },
  CRH2A: {
    label: 'CRH2A',
    family: '和谐号',
    top: 250,
    cars: 8,
    origin: '新干线 E2-1000 平台 · 中车四方',
    nose: 'round',
    body: ['#f7f9fb', '#dbe2ea'],
    stripe: ['#1a5fb4', '#0a3a72'],
    skirt: '#39404e',
    glass: '#131c28',
    roof: '#cdd7e2',
  },
  CRH3C: {
    label: 'CRH3C',
    family: '和谐号',
    top: 350,
    cars: 8,
    origin: '西门子 Velaro / ICE-3 平台 · 中车唐车',
    nose: 'boxy',
    body: ['#f7f9fb', '#d9e1ea'],
    stripe: ['#2a72c4', '#124a8c'],
    skirt: '#3a4150',
    glass: '#141d29',
    roof: '#ccd6e1',
  },
  CRH5A: {
    label: 'CRH5A',
    family: '和谐号',
    top: 250,
    cars: 8,
    origin: '阿尔斯通 Pendolino 平台 · 中车长客',
    nose: 'round',
    body: ['#f4f6f8', '#d3dbe4'],
    stripe: ['#3f7fbf', '#1f4f86'],
    skirt: '#3b4250',
    glass: '#16202c',
    roof: '#c9d3df',
  },
  CRH380A: {
    label: 'CRH380A',
    family: '和谐号',
    top: 380,
    cars: 8,
    origin: '中车四方自主研发 · 试验速度 486.1 km/h',
    nose: 'pointy',
    body: ['#f8fafc', '#dde5ee'],
    stripe: ['#1668c9', '#0a3f80'],
    skirt: '#38404e',
    glass: '#121b26',
    roof: '#d0dae6',
  },
  CRH380B: {
    label: 'CRH380B',
    family: '和谐号',
    top: 350,
    cars: 8,
    origin: 'Velaro 平台国产化 · 中车唐车',
    nose: 'pointy',
    body: ['#f7f9fb', '#dae2eb'],
    stripe: ['#1d6cc0', '#0d4584'],
    skirt: '#39414f',
    glass: '#131c29',
    roof: '#ced8e4',
  },
  CR400AF: {
    label: 'CR400AF',
    family: '复兴号',
    top: 350,
    cars: 8,
    origin: '中车四方 · 昵称"蓝海豚"(试验车)/"红神龙"',
    nose: 'pointy',
    body: ['#eef1f4', '#c9d1da'],
    stripe: ['#d62828', '#8e1616'],
    skirt: '#333a46',
    glass: '#101822',
    roof: '#b9c3cf',
  },
  CR400BF: {
    label: 'CR400BF',
    family: '复兴号',
    top: 350,
    cars: 8,
    origin: '中车长客 / 唐车 · 昵称"金凤凰"',
    nose: 'pointy',
    body: ['#f6f7f8', '#d8dee5'],
    stripe: ['#e0a33e', '#c9a227'],
    skirt: '#343b47',
    glass: '#111923',
    roof: '#c6ced9',
    accent: '#c1121f',
  },
  CR300AF: {
    label: 'CR300AF',
    family: '复兴号',
    top: 250,
    cars: 8,
    origin: '中车四方 · 250 km/h 级别复兴号',
    nose: 'pointy',
    body: ['#f5f7f9', '#d6dee7'],
    stripe: ['#1f7ac0', '#0e4d80'],
    skirt: '#373e4b',
    glass: '#121b26',
    roof: '#cad4e0',
  },
  CR200J: {
    label: 'CR200J',
    family: '复兴号',
    top: 160,
    cars: 6,
    origin: '动力集中型 · 中车株机 · 昵称"绿巨人"',
    nose: 'boxy',
    body: ['#2f6b3f', '#1f4a2b'],
    stripe: ['#f4d35e', '#c9a227'],
    skirt: '#25301f',
    glass: '#0e1a14',
    roof: '#274a31',
    accent: '#f4d35e',
  },
};

/**
 * Which models each bureau operates. Compiled from public reporting on
 * 动车组配属, not from an official current-fleet roster - the card says so.
 */
export const BUREAU_TRAINS = {
  哈尔滨局: ['CRH5A', 'CRH380B', 'CR400BF'],
  沈阳局: ['CRH5A', 'CRH380B', 'CR400BF'],
  北京局: ['CRH5A', 'CRH3C', 'CR400AF', 'CR400BF'],
  太原局: ['CRH2A', 'CRH380A', 'CR400AF'],
  呼和浩特局: ['CRH5A', 'CR400BF'],
  郑州局: ['CRH380B', 'CR400AF', 'CR400BF'],
  济南局: ['CRH2A', 'CRH380B', 'CR400AF'],
  上海局: ['CRH1A', 'CRH2A', 'CRH380B', 'CR400AF', 'CR400BF'],
  南昌局: ['CRH2A', 'CRH1A', 'CR400AF'],
  武汉局: ['CRH2A', 'CRH380A', 'CR400AF'],
  广州局: ['CRH1A', 'CRH2A', 'CRH380A', 'CR400AF'],
  成都局: ['CRH1A', 'CRH2A', 'CR400AF', 'CR300AF'],
  昆明局: ['CRH2A', 'CR300AF', 'CR200J'],
  西安局: ['CRH2A', 'CRH380B', 'CR400BF'],
  兰州局: ['CRH2A', 'CR400BF', 'CR200J'],
  乌鲁木齐局: ['CRH2A', 'CR400BF'],
  南宁局: ['CRH1A', 'CRH2A', 'CR300AF'],
  青藏集团: ['CR200J'],
};

function gradients(m, uid) {
  return `
    <linearGradient id="body-${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${m.body[0]}"/>
      <stop offset="0.55" stop-color="${m.body[0]}"/>
      <stop offset="1" stop-color="${m.body[1]}"/>
    </linearGradient>
    <linearGradient id="stripe-${uid}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${m.stripe[0]}"/>
      <stop offset="0.5" stop-color="${m.stripe[1]}"/>
      <stop offset="1" stop-color="${m.stripe[0]}"/>
    </linearGradient>
    <linearGradient id="glass-${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5c7ea6"/>
      <stop offset="0.45" stop-color="${m.glass}"/>
      <stop offset="1" stop-color="${m.glass}"/>
    </linearGradient>`;
}

function coachSymbol(m, uid) {
  const { w } = CAR;
  return `
    <symbol id="car-${uid}" viewBox="0 0 ${w} 64">
      <rect x="0" y="8" width="${w}" height="8" rx="4" fill="${m.roof}"/>
      <rect x="0" y="10" width="${w}" height="30" rx="5" fill="url(#body-${uid})"/>
      <rect x="8" y="16" width="${w - 16}" height="11" rx="3" fill="url(#glass-${uid})"/>
      <rect x="22" y="15" width="7" height="13" rx="2" fill="${m.stripe[1]}"/>
      <rect x="87" y="15" width="7" height="13" rx="2" fill="${m.stripe[1]}"/>
      <rect x="0" y="30" width="${w}" height="5" fill="url(#stripe-${uid})"/>
      <rect x="4" y="37" width="${w - 8}" height="6" rx="2" fill="${m.skirt}"/>
      <circle cx="26" cy="48" r="6" fill="#20242e"/><circle cx="26" cy="48" r="2" fill="#6d768a"/>
      <circle cx="40" cy="48" r="6" fill="#20242e"/><circle cx="40" cy="48" r="2" fill="#6d768a"/>
      <circle cx="76" cy="48" r="6" fill="#20242e"/><circle cx="76" cy="48" r="2" fill="#6d768a"/>
      <circle cx="90" cy="48" r="6" fill="#20242e"/><circle cx="90" cy="48" r="2" fill="#6d768a"/>
      <line x1="0" y1="12" x2="0" y2="40" stroke="${m.skirt}" stroke-width="2"/>
      <line x1="${w}" y1="12" x2="${w}" y2="40" stroke="${m.skirt}" stroke-width="2"/>
    </symbol>`;
}

function headGroup(m, uid) {
  const n = NOSES[m.nose];
  const accent = m.accent ? `<path d="${n.band}" fill="${m.accent}" opacity="0.85"/>` : '';
  return `
    <g id="head-${uid}">
      <path d="${n.shell}" fill="url(#body-${uid})"/>
      <path d="${n.band}" fill="url(#stripe-${uid})"/>
      ${accent}
      <path d="${n.glass}" fill="url(#glass-${uid})"/>
      <rect x="0" y="36" width="${n.w}" height="6" rx="2" fill="${m.skirt}"/>
      <circle cx="${n.bogie[0]}" cy="48" r="6" fill="#20242e"/><circle cx="${n.bogie[0]}" cy="48" r="2" fill="#6d768a"/>
      <circle cx="${n.bogie[1]}" cy="48" r="6" fill="#20242e"/><circle cx="${n.bogie[1]}" cy="48" r="2" fill="#6d768a"/>
      <circle cx="12" cy="26" r="3" fill="#ffe9a8"/>
    </g>`;
}

/**
 * Side view of a consist. `cars` is the number of *visible* units; the real
 * formation length is shown as text by the caller, since a full 8-car train
 * is unreadable inside a card.
 */
export function trainSvg(modelId, { cars = 4, uid = modelId.toLowerCase() } = {}) {
  const m = TRAIN_MODELS[modelId];
  if (!m) return '';
  const nose = NOSES[m.nose];
  const n = Math.max(2, cars);
  const bodyW = (n - 2) * (CAR.w + CAR.gap);
  const total = nose.w + bodyW + nose.w;

  let uses = '';
  for (let i = 0; i < n - 2; i++) {
    uses += `<use href="#car-${uid}" x="${nose.w + i * (CAR.w + CAR.gap)}" y="0" width="${CAR.w}" height="64"/>`;
  }

  return `
<svg class="emu" viewBox="0 0 ${total} 64" width="${total}" height="64" role="img"
     aria-label="${m.label} 侧面示意图" xmlns="http://www.w3.org/2000/svg">
  <defs>
    ${gradients(m, uid)}
    ${coachSymbol(m, uid)}
    ${headGroup(m, uid)}
  </defs>
  <use href="#head-${uid}" x="0" y="0"/>
  ${uses}
  <g transform="translate(${total},0) scale(-1,1)">
    <use href="#head-${uid}" x="0" y="0"/>
  </g>
</svg>`.trim();
}

/** Compact one-line spec used in the bureau card. */
export function trainSpec(modelId) {
  const m = TRAIN_MODELS[modelId];
  if (!m) return '';
  return `${m.family} · ${m.top} km/h · ${m.cars} 辆编组`;
}

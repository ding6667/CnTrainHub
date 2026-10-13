/**
 * Side-profile EMU drawings, generated as inline SVG (no raster images).
 *
 * Structure follows the classic approach: one <symbol> per standard coach,
 * repeated with <use>; the leading car is drawn separately with cubic
 * Béziers because its nose shell is the one shape that identifies a model.
 * All coordinates are integers, backgrounds are transparent, and no <filter>
 * is used (several browsers render filtered SVG blank).
 *
 * Variants (-A, -G, -Z, ...) share their base model's shell and livery, which
 * is what they do in reality, so they are declared as base + suffix meaning
 * rather than as separate drawings.
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
  // Blunt, upright front - CRH1 / CRH3 / CR200J power car.
  boxy: {
    w: 122,
    shell: 'M8 38 L8 16 C8 10 14 8 28 8 L118 8 L118 38 Z',
    glass: 'M16 15 L60 12 L58 23 L16 23 Z',
    band: 'M8 29 L118 29 L118 34 L8 34 Z',
    bogie: [34, 96],
  },
};

const CAR = { w: 116, h: 64, gap: 4 };

/** Visual bases: one livery + shell per platform family. */
const BASES = {
  CRH1A: {
    family: '和谐号',
    top: 250,
    origin: '庞巴迪 Regina 平台 · 青岛四方庞巴迪',
    nose: 'boxy',
    body: ['#f5f7f9', '#d5dde6'],
    stripe: ['#1f6fbf', '#0d4a86'],
    skirt: '#3b4252',
    glass: '#151f2c',
    roof: '#c8d2de',
  },
  CRH2A: {
    family: '和谐号',
    top: 250,
    origin: '新干线 E2-1000 平台 · 中车四方',
    nose: 'round',
    body: ['#f7f9fb', '#dbe2ea'],
    stripe: ['#1a5fb4', '#0a3a72'],
    skirt: '#39404e',
    glass: '#131c28',
    roof: '#cdd7e2',
  },
  CRH3A: {
    family: '和谐号',
    top: 250,
    origin: 'Velaro 平台城际型 · 中车大连 / 唐车',
    nose: 'boxy',
    body: ['#f6f8fa', '#d8e0e9'],
    stripe: ['#2a7ac0', '#12508c'],
    skirt: '#3a4150',
    glass: '#141d29',
    roof: '#ccd6e1',
  },
  CRH3C: {
    family: '和谐号',
    top: 350,
    origin: '西门子 Velaro / ICE-3 平台 · 中车唐车',
    nose: 'boxy',
    body: ['#f7f9fb', '#d9e1ea'],
    stripe: ['#2a72c4', '#124a8c'],
    skirt: '#3a4150',
    glass: '#141d29',
    roof: '#ccd6e1',
  },
  CRH5A: {
    family: '和谐号',
    top: 250,
    origin: '阿尔斯通 Pendolino 平台 · 中车长客',
    nose: 'round',
    body: ['#f4f6f8', '#d3dbe4'],
    stripe: ['#3f7fbf', '#1f4f86'],
    skirt: '#3b4250',
    glass: '#16202c',
    roof: '#c9d3df',
  },
  CRH380A: {
    family: '和谐号',
    top: 380,
    origin: '中车四方自主研发 · 试验速度 486.1 km/h',
    nose: 'pointy',
    body: ['#f8fafc', '#dde5ee'],
    stripe: ['#1668c9', '#0a3f80'],
    skirt: '#38404e',
    glass: '#121b26',
    roof: '#d0dae6',
  },
  CRH380B: {
    family: '和谐号',
    top: 350,
    origin: 'Velaro 平台国产化 · 中车唐车',
    nose: 'pointy',
    body: ['#f7f9fb', '#dae2eb'],
    stripe: ['#1d6cc0', '#0d4584'],
    skirt: '#39414f',
    glass: '#131c29',
    roof: '#ced8e4',
  },
  CRH380D: {
    family: '和谐号',
    top: 380,
    origin: '庞巴迪 Zefiro 平台 · 青岛四方庞巴迪',
    nose: 'pointy',
    body: ['#f8fafc', '#dce4ec'],
    stripe: ['#0f86c6', '#0a4f86'],
    skirt: '#38404e',
    glass: '#121b26',
    roof: '#cfd9e5',
  },
  CR400AF: {
    family: '复兴号',
    top: 350,
    origin: '中车四方 · 银灰车身红飘带，昵称"蓝海豚"(试验车)/"红神龙"',
    nose: 'pointy',
    body: ['#eef1f4', '#c9d1da'],
    stripe: ['#d62828', '#8e1616'],
    skirt: '#333a46',
    glass: '#101822',
    roof: '#b9c3cf',
  },
  CR400BF: {
    family: '复兴号',
    top: 350,
    origin: '中车长客 / 唐车 · 金飘带，昵称"金凤凰"',
    nose: 'pointy',
    body: ['#f6f7f8', '#d8dee5'],
    stripe: ['#e0a33e', '#c9a227'],
    skirt: '#343b47',
    glass: '#111923',
    roof: '#c6ced9',
    accent: '#c1121f',
  },
  CR300AF: {
    family: '复兴号',
    top: 250,
    origin: '中车四方 · 250 km/h 级别复兴号',
    nose: 'pointy',
    body: ['#f5f7f9', '#d6dee7'],
    stripe: ['#1f7ac0', '#0e4d80'],
    skirt: '#373e4b',
    glass: '#121b26',
    roof: '#cad4e0',
  },
  CR300BF: {
    family: '复兴号',
    top: 250,
    origin: '中车长客 / 唐车 · 250 km/h 级别复兴号',
    nose: 'pointy',
    body: ['#f5f7f9', '#d6dee7'],
    stripe: ['#1f7ac0', '#0e4d80'],
    skirt: '#373e4b',
    glass: '#121b26',
    roof: '#cad4e0',
  },
  CR200J: {
    family: '复兴号',
    top: 160,
    origin: '动力集中型 · 中车株机等 · 昵称"绿巨人"',
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
 * What each suffix means in the type code. `formation` is explicit text
 * because the letters do not mean the same thing in every family (CRH3A-A is
 * an 8-car intercity set, while CR400AF-A is a 16-car one).
 */
const SUFFIX = {
  '': { formation: '8 辆编组', tag: '基本型' },
  '-A': { formation: '16 辆长编组' },
  'L': { formation: '16 辆长编组' },
  'B': { formation: '17 辆超长编组' },
  'BL': { formation: '17 辆超长编组' },
  'BG': { formation: '16 辆长编组', tag: '高寒型' },
  '-G': { tag: '高寒型' },
  '-GS': { tag: '高寒 · 技术提升' },
  '-GZ': { tag: '高寒 · 智能配置' },
  '-Z': { tag: '智能配置型' },
  '-AZ': { formation: '16 辆长编组', tag: '智能配置' },
  '-BZ': { formation: '17 辆超长编组', tag: '智能配置' },
  '-S': { tag: '技术提升型' },
  '-AS': { formation: '16 辆长编组', tag: '技术提升' },
  '-C': { tag: '智能配置 · 京张/京雄' },
  'E': { tag: '卧铺动车组' },
  'G': { tag: '抗风沙 / 高寒改进' },
  '-250': { tag: '250 km/h 版本' },
  '1-A': { formation: '动力集中 · 机车+拖车', tag: '甲型' },
  '1-C': { formation: '动力集中 · 机车+拖车', tag: '丙型' },
  '1-D': { formation: '动力集中 · 机车+拖车', tag: '高原型' },
  '3-A': { formation: '动力集中 · 机车+拖车', tag: '甲型(三代)' },
  '3-B': { formation: '动力集中 · 机车+拖车', tag: '乙型(三代)' },
  '3-C': { formation: '动力集中 · 机车+拖车', tag: '丙型(三代)' },
  '-C2': { formation: '动力集中 · 机车+拖车', tag: '丙型' },
  '-D2': { formation: '动力集中 · 机车+拖车', tag: '高原型' },
};

/** label, visual base, suffix key, per-model overrides */
const MODEL_INDEX = [
  ['CRH1A', 'CRH1A', ['']],
  ['CRH1A-250', 'CRH1A', ['-250']],
  ['CRH2A', 'CRH2A', ['']],
  ['CRH2B', 'CRH2A', ['-A'], { formation: '16 辆长编组' }],
  ['CRH2G', 'CRH2A', ['G']],
  ['CRH3A-A', 'CRH3A', [''], { formation: '8 辆编组', tag: '城际型' }],
  ['CRH3C', 'CRH3C', ['']],
  ['CRH5A', 'CRH5A', ['']],
  ['CRH5G', 'CRH5A', ['G']],
  ['CRH5E', 'CRH5A', ['E']],
  ['CRH380A', 'CRH380A', ['']],
  ['CRH380AL', 'CRH380A', ['L']],
  ['CRH380B', 'CRH380B', ['']],
  ['CRH380BL', 'CRH380B', ['BL']],
  ['CRH380BG', 'CRH380B', ['BG']],
  ['CRH380D', 'CRH380D', ['']],
  ['CR400AF', 'CR400AF', ['']],
  ['CR400AF-A', 'CR400AF', ['-A']],
  ['CR400AF-S', 'CR400AF', ['-S']],
  ['CR400AF-Z', 'CR400AF', ['-Z']],
  ['CR400AF-C', 'CR400AF', ['-C']],
  ['CR400AF-G', 'CR400AF', ['-G']],
  ['CR400AF-AS', 'CR400AF', ['-AS']],
  ['CR400AF-AZ', 'CR400AF', ['-AZ']],
  ['CR400AF-BZ', 'CR400AF', ['-BZ']],
  ['CR400BF', 'CR400BF', ['']],
  ['CR400BF-A', 'CR400BF', ['-A']],
  ['CR400BF-S', 'CR400BF', ['-S']],
  ['CR400BF-Z', 'CR400BF', ['-Z']],
  ['CR400BF-G', 'CR400BF', ['-G']],
  ['CR400BF-GS', 'CR400BF', ['-GS']],
  ['CR400BF-GZ', 'CR400BF', ['-GZ']],
  ['CR400BF-AS', 'CR400BF', ['-AS']],
  ['CR400BF-AZ', 'CR400BF', ['-AZ']],
  ['CR300AF', 'CR300AF', ['']],
  ['CR300BF', 'CR300BF', ['']],
  ['CR200J', 'CR200J', [''], { formation: '动力集中 · 机车+拖车', tag: '基本型' }],
  ['CR200J-C', 'CR200J', ['-C2']],
  ['CR200J-D', 'CR200J', ['-D2']],
  ['CR200J1-A', 'CR200J', ['1-A']],
  ['CR200J1-C', 'CR200J', ['1-C']],
  ['CR200J1-D', 'CR200J', ['1-D']],
  ['CR200J3-A', 'CR200J', ['3-A']],
  ['CR200J3-B', 'CR200J', ['3-B']],
  ['CR200J3-C', 'CR200J', ['3-C']],
];

function buildModels() {
  const out = {};
  for (const [label, baseKey, suffixes, over] of MODEL_INDEX) {
    const base = BASES[baseKey];
    for (const suf of suffixes) {
      const meta = SUFFIX[suf] ?? {};
      out[label] = {
        label,
        base: baseKey,
        family: base.family,
        top: over?.top ?? base.top,
        origin: base.origin,
        nose: base.nose,
        body: base.body,
        stripe: base.stripe,
        skirt: base.skirt,
        glass: base.glass,
        roof: base.roof,
        accent: base.accent,
        formation: over?.formation ?? meta.formation ?? '8 辆编组',
        tag: over?.tag ?? meta.tag ?? '',
      };
    }
  }
  return out;
}

export const TRAIN_MODELS = buildModels();

/**
 * Per-bureau fleets supplied by the project owner, compiled from public
 * reporting for 2025 to early 2026. Counts drift as new lines open and stock
 * is reassigned, and "标准组" folds a 16/17-car set into 2 units - the card
 * repeats both caveats so nobody reads these as a live roster.
 */
export const BUREAU_FLEETS = {
  北京局: { units: 344, unit: '标准组', models: ['CR400AF-G', 'CR400AF-Z', 'CR400AF-C', 'CR400AF-BZ', 'CR400BF', 'CR400BF-G', 'CR400BF-GS', 'CR400BF-S', 'CR400BF-Z', 'CRH380BG'] },
  上海局: { units: 933, unit: '标准组', models: ['CR400AF', 'CR400BF', 'CR400BF-A', 'CR400BF-AS', 'CR400BF-AZ', 'CR400BF-S', 'CRH380BL', 'CRH380D'] },
  广州局: { units: 466.5, unit: '标准组', models: ['CR400AF', 'CR400AF-A', 'CR400AF-S', 'CR400AF-AZ', 'CR400BF', 'CR400BF-AS', 'CR200J'] },
  成都局: { units: 517, unit: '组', models: ['CR400AF-AS', 'CR400AF-S', 'CR400AF-Z', 'CRH380A', 'CR200J1-C', 'CR200J-D'] },
  武汉局: { units: 258, unit: '组', models: ['CR400AF', 'CR400AF-Z', 'CRH2B', 'CRH380AL', 'CR200J-C'] },
  济南局: { units: 260, unit: '标准组', models: ['CR400AF', 'CR400AF-A', 'CR400AF-Z', 'CR200J', 'CR200J3-B', 'CR200J-C'] },
  南昌局: { units: 206, unit: '标准组', note: '仅福州动车段，全局总数未见最新披露', models: ['CR400AF-Z', 'CRH1A-250', 'CRH2A', 'CR200J3-C'] },
  郑州局: { units: 199.5, unit: '标准组', models: ['CR300BF', 'CRH380A', 'CRH380AL', 'CRH380B', 'CRH380BL', 'CRH3A-A', 'CR400BF-A', 'CR400BF-AZ'] },
  西安局: { units: 189, unit: '组', models: ['CR400BF-Z', 'CR200J1-C', 'CR200J3-A'] },
  沈阳局: { units: 187, unit: '组', models: ['CR400BF-G', 'CR400BF-GS'] },
  哈尔滨局: { units: 115, unit: '组', models: ['CRH5A', 'CRH5G', 'CRH380BG', 'CR400BF-G', 'CR400BF-GS', 'CR400BF-GZ', 'CR200J3-C'] },
  呼和浩特局: { units: 51, unit: '组', models: ['CRH5A', 'CR400BF-G'] },
  兰州局: { units: 86, unit: '组（动力分散型）', models: ['CRH380B', 'CRH5G', 'CR400BF-Z', 'CR200J1-A', 'CR200J3-C'] },
  乌鲁木齐局: { units: 53, unit: '组', models: ['CRH2G', 'CRH5A', 'CRH5E', 'CRH5G', 'CR200J-C'] },
  昆明局: { units: 120, unit: '组（动力分散型）', models: ['CR400AF-S', 'CR200J1-C', 'CR200J1-D'] },
  南宁局: { units: 170, unit: '组', models: ['CR400AF-S', 'CR200J-C', 'CR200J3-C'] },
  // Not covered by the supplied table - kept from earlier public reporting.
  太原局: { units: null, models: ['CRH2A', 'CRH380A', 'CR400AF'], note: '本次表未覆盖，沿用前次公开资料整理' },
  青藏集团: { units: null, models: ['CR200J'], note: '本次表未覆盖，沿用前次公开资料整理' },
};

export const FLEET_AS_OF = '2025 年－2026 年初公开报道';

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
 * formation is shown as text by the caller, since a 16-car train at card width
 * is unreadable.
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
  return [m.family, `${m.top} km/h`, m.formation, m.tag].filter(Boolean).join(' · ');
}

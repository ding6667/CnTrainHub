/**
 * 场景音效引擎 —— 全部由 Web Audio 实时合成，默认**零音频资产、零网络请求**。
 *
 * 为什么不用现成音效包：本项目 publicDir=false、车体/站场/地形全是程序化生成，
 * 加二进制素材会破坏「一个 commit 就能跑、离线可用」的口径；而且网上素材的授权
 * 边界不清。所以这里用振荡器 + 滤波噪声 + 包络把每种声音「造」出来。
 *
 * 场景 → 声音映射（update 每帧只改增益/滤波频率，不新建节点）：
 *
 *   layer        触发条件                        合成方式
 *   rolling      速度 > 0                        粉噪 + 低通，截止频率随速度
 *   wheelHiss    速度 > 0                        粉噪 + 带通 2.1 kHz（轮轨高频）
 *   wind         速度 > 0                        粉噪 + 带通，增益 ~ v^1.7
 *   motor        牵引 / 电制动                    锯齿波基频 + 2.02× 谐波（VVVF 啸叫）
 *   rumble       速度 > 0                        44 Hz 正弦（车体低频）
 *   squeal       制动且 v<10 m/s                  高 Q 带通噪声 3 kHz（闸片摩擦）
 *   crowd        距最近车站 < 620 m               双带通噪声（人声共振峰）+ 慢速起伏
 *   city         城区块                          低通噪声（交通底噪）
 *   ruralWind    郊外块                           带通噪声 + 随机鸟鸣 / 夜虫
 *   cabin        司机视角                         低通 1.5 kHz + 空调底噪，车外声略降
 *
 * 一次性事件（ARRIVE / DEPART / DOORS / SWITCH / 鸣笛 / 紧急制动）：
 *   站台广播钟声 + 含糊广播（锯齿波过双共振峰，只像人声、不构成语义）、
 *   开关门提示音与风缸排气、道岔落锁、双音风笛、制动排风、接触网打火、钢轨接头。
 *
 * 授权采样包（可选）：把从爱给网等渠道**已获授权**的文件放进
 * `src/journey/audio/`，文件名用下面这些 key（ogg / mp3 / wav / m4a 均可）：
 *   horn, door-open, door-close, announce, switch, brake, crowd
 * 构建时会被 Vite 打包，运行时自动优先播放采样；没有文件时静默回退到合成。
 * 冰葡萄团队的「高铁/动车/火车/地铁」专辑（爱给网）与这些 key 对应关系：
 *   horn        ← 高铁鸣笛 / 动车鸣笛
 *   door-open   ← 高铁开门提示音
 *   door-close  ← 高铁关门铃声 / 关门警示
 *   announce    ← 高铁进站广播
 *   switch      ← 道岔 / 车轮过岔
 *   brake       ← 进站制动、排风
 *   crowd       ← 站台候车环境音
 * 注意：爱给网素材默认是「版权」作品，商用/再分发需购买授权，请勿直接把未授权
 * 文件提交进仓库。没有授权文件时本项目自身的合成音效完全可用。
 */

const SPEED_MAX = 300 / 3.6;   // 300 km/h，用于归一化
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** 元音共振峰（Hz）——让「广播」听起来像人在说话，但听不清内容。 */
const VOWELS = [[700, 1220], [420, 1980], [610, 940], [320, 2280], [520, 1500]];

/**
 * 车型音色差异：变流器基频、齿轮比、风噪、风笛双音、制动强度。
 * 数值是示意级（无实车声压数据），但足以让 CRH5 的啸叫明显高于 CR400BF、
 * CR200J 更低沉，换车底时能听出不是同一列车。
 */
const MODEL_PROFILES = {
  cr400bf: { base: 74, gear: 8.7, whine: 0.026, wind: 1.00, horn: [311.13, 369.99], brake: 1.00 },
  crh380b: { base: 70, gear: 8.2, whine: 0.024, wind: 1.05, horn: [300.00, 355.00], brake: 0.98 },
  crh5: { base: 82, gear: 9.6, whine: 0.033, wind: 1.12, horn: [329.63, 392.00], brake: 1.15 },
  cr200j: { base: 58, gear: 6.4, whine: 0.018, wind: 0.90, horn: [261.63, 329.63], brake: 0.95 },
  default: { base: 74, gear: 8.7, whine: 0.026, wind: 1.00, horn: [311.13, 369.99], brake: 1.00 },
};

function modelKey(modelId) {
  const id = String(modelId ?? '').toLowerCase();
  if (id.startsWith('cr400bf')) return 'cr400bf';
  if (id.startsWith('crh380')) return 'crh380b';
  if (id.startsWith('crh5')) return 'crh5';
  if (id.startsWith('cr200j')) return 'cr200j';
  return id || 'cr400bf';
}

function profileFor(modelId) {
  return MODEL_PROFILES[modelKey(modelId)] ?? MODEL_PROFILES.default;
}

/** 大站 / 小站的广播钟声与人群密度不同（哈西、哈尔滨按枢纽处理）。 */
function stationProfile(zone) {
  const name = zone?.name ?? '';
  const hub = zone?.role === 'hub' || /哈尔滨西|哈尔滨|齐齐哈尔|牡丹江|佳木斯|大庆西/.test(name);
  return hub
    ? { notes: [587.33, 739.99, 880], crowd: 1.18, rate: 0.88 }
    : { notes: [659.25, 880], crowd: 0.9, rate: 0.92 };
}

function readStore(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 隐私模式 / 配额满：静默忽略，不影响播放 */
  }
}

/** Vite 编译期展开；Node 环境下 import.meta.glob 不存在，回退为空表。 */
function sampleUrls() {
  try {
    return import.meta.glob('./audio/*.{ogg,mp3,wav,m4a}', {
      eager: true, query: '?url', import: 'default',
    });
  } catch {
    return {};
  }
}

export function createSoundscape(opts = {}) {
  const supported = typeof window !== 'undefined'
    && Boolean(window.AudioContext || window.webkitAudioContext);
  const storageKey = opts.storageKey ?? 'cnthub.sound.v1';
  const saved = readStore(storageKey);

  let volume = clamp01(Number.isFinite(saved.volume) ? saved.volume : 0.55);
  let muted = Boolean(saved.muted);
  let ambience = saved.ambience !== false;

  let ctx = null;
  let master = null;
  let mix = null;
  let cabin = null;
  let started = false;
  let nodes = 0;
  let live = 0;

  let lastTravel = null;
  let travelAcc = 0;
  let lastBrake = 0;
  let doorOpen = false;
  let eventClock = 0;
  let nextBird = rand(2, 5);
  let nextCity = rand(3, 7);
  let nextSpark = rand(2, 5);
  let nextCricket = rand(1.5, 3.5);
  let currentModel = 'cr400bf';
  let currentStation = null;
  let ttsTimer = 0;
  let packFiles = 0;

  const layers = {};
  const samples = new Map();      // key -> AudioBuffer[]（采样包 + 构建期内置，按 key 分组随机取）
  const builtin = new Map();      // 只存随源码打包的采样，清空用户包时用来恢复
  const sampleLoops = new Map();  // key -> 循环 BufferSource（rolling / crowd 用采样铺底）
  let noiseBuf = null;
  let burstBuf = null;

  // ---------------------------------------------------------------- utils ---
  function makeNoise(seconds, stereo = true) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(stereo ? 2 : 1, len, ctx.sampleRate);
    for (let ch = 0; ch < buf.numberOfChannels; ch += 1) {
      const data = buf.getChannelData(ch);
      // Paul Kellet 的粉噪近似：比白噪更接近轮轨/风的频谱
      let b0 = 0; let b1 = 0; let b2 = 0; let b3 = 0; let b4 = 0; let b5 = 0; let b6 = 0;
      for (let i = 0; i < len; i += 1) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    }
    return buf;
  }

  function makeBurst(seconds = 1) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function gainNode(value = 0, dest = mix) {
    const g = ctx.createGain();
    g.gain.value = value;
    if (dest) g.connect(dest);
    nodes += 1;
    return g;
  }

  function filter(type, freq, q = 1, dest = null) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = Math.max(20, Math.min(20000, freq));
    f.Q.value = q;
    if (dest) f.connect(dest);
    nodes += 1;
    return f;
  }

  function panner(pan = 0) {
    if (!ctx.createStereoPanner) return null;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    nodes += 1;
    return p;
  }

  /** 铺一层循环噪声：source → filter → gain → mix */
  function noiseLayer(buffer, offset, type, freq, q, gainValue) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const f = filter(type, freq, q);
    const g = gainNode(gainValue);
    src.connect(f).connect(g);
    src.start(0, offset);
    nodes += 1;
    return { src, filter: f, gain: g };
  }

  function oscLayer(type, freq, gainValue, filterFreq) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = gainNode(gainValue);
    let f = null;
    if (filterFreq) {
      f = filter('lowpass', filterFreq, 0.7);
      o.connect(f).connect(g);
    } else {
      o.connect(g);
    }
    o.start();
    nodes += 1;
    return { osc: o, gain: g, filter: f };
  }

  function build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });

    master = gainNode(muted ? 0 : volume, null);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.006;
    comp.release.value = 0.25;
    master.connect(comp).connect(ctx.destination);

    // 司机室：整条总线过 1.5 kHz 低通，像隔着司机室侧窗听车外
    cabin = filter('lowpass', 18000, 0.4);
    cabin.connect(master);
    mix = gainNode(1, null);
    mix.connect(cabin);

    noiseBuf = makeNoise(4, true);
    burstBuf = makeBurst(1);

    layers.rolling = noiseLayer(noiseBuf, 0.0, 'lowpass', 320, 0.6, 0);
    layers.hiss = noiseLayer(noiseBuf, 0.7, 'bandpass', 2100, 0.9, 0);
    layers.wind = noiseLayer(noiseBuf, 1.9, 'bandpass', 620, 0.55, 0);
    layers.crowd = noiseLayer(noiseBuf, 2.6, 'bandpass', 720, 0.8, 0);
    layers.crowdHi = noiseLayer(noiseBuf, 0.35, 'bandpass', 1650, 1.4, 0);
    layers.city = noiseLayer(noiseBuf, 3.1, 'lowpass', 260, 0.5, 0);
    layers.hvac = noiseLayer(noiseBuf, 1.3, 'lowpass', 420, 0.5, 0);

    layers.motor = oscLayer('sawtooth', 90, 0, 2600);
    layers.motor2 = oscLayer('sawtooth', 182, 0, 2200);
    layers.rumble = oscLayer('sine', 44, 0);
    layers.hvacHum = oscLayer('sine', 96, 0);

    // 制动闸片：单独一条高 Q 带通，只在低速制动时出声
    layers.squeal = noiseLayer(noiseBuf, 2.1, 'bandpass', 3050, 13, 0);

    // 采样包（可选）：随源码打包的文件，路径决定作用域
    //   audio/cr400bf/horn.wav → cr400bf:horn；audio/EAB/announce.wav → EAB:announce
    const urls = sampleUrls();
    for (const [path, url] of Object.entries(urls)) {
      const rel = path.replace(/^\.\/audio\//, '').replace(/\.[^.]+$/, '');
      const key = rel.replace(/\//g, ':').toLowerCase();
      if (typeof url !== 'string') continue;
      fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((buf) => (buf ? ctx.decodeAudioData(buf) : null))
        .then((decoded) => {
          if (!decoded) return;
          // 路径即作用域：audio/horn.wav 是全局兜底，audio/crh5/horn.wav 只给 CRH5
          addSample(key, decoded, builtin);
          addSample(key, decoded);
        })
        .catch(() => { /* 损坏文件不影响合成音效 */ });
    }

    started = true;
    ctx.addEventListener?.('statechange', () => { /* stats() 直接读 */ });
    // 上次用户载入的授权音效包（IndexedDB）在后台恢复，失败不影响合成
    restorePack().catch(() => { /* ignore */ });
  }

  // ------------------------------------------------------------- one-shots ---
  function active(source) {
    live += 1;
    source.addEventListener?.('ended', () => { live = Math.max(0, live - 1); });
  }

  function playBuffer(buf, { when = 0, gain = 1, pan = 0, rate = 1 } = {}) {
    const t = ctx.currentTime + 0.01 + when;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = gainNode(gain, null);
    const p = pan ? panner(pan) : null;
    if (p) src.connect(g).connect(p).connect(mix);
    else src.connect(g).connect(mix);
    src.start(t);
    active(src);
    return true;
  }

  function addSample(key, buf, target = samples) {
    if (!key || !buf) return;
    const list = target.get(key) ?? [];
    list.push(buf);
    target.set(key, list);
  }

  /** 采样查找：站名+车型:key → 站名:key → 车型:key → key；同名多条随机取一条。 */
  function sampleBuffer(key, { station, model } = {}) {
    const mk = model ? modelKey(model) : null;
    const keys = [];
    if (station && mk) keys.push(`${station}:${mk}:${key}`);
    if (station) keys.push(`${station}:${key}`);
    if (mk) keys.push(`${mk}:${key}`);
    keys.push(key);
    for (const k of keys) {
      const list = samples.get(k);
      if (list?.length) return list[Math.floor(Math.random() * list.length)];
    }
    return null;
  }

  /** 采样优先，没有就返回 false 交给合成。 */
  function sample(key, options = {}) {
    const buf = sampleBuffer(key, options);
    if (!buf) return false;
    return playBuffer(buf, options);
  }

  /**
   * 连续声（轮轨 / 人群）如果载入了采样，就用循环 BufferSource 铺底，
   * 合成层自动退到很低的底噪，避免两套声音叠加。
   */
  function ensureSampleLoop(key, options = {}) {
    if (!started || !ctx) return null;
    if (sampleLoops.has(key)) return sampleLoops.get(key);
    const buf = sampleBuffer(key, options);
    if (!buf) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = gainNode(0);
    src.connect(g).connect(mix);
    src.start();
    const entry = { src, gain: g };
    sampleLoops.set(key, entry);
    return entry;
  }

  function stopSampleLoops() {
    for (const [, entry] of sampleLoops) {
      try { entry.src.stop(); } catch { /* already stopped */ }
      try { entry.src.disconnect(); } catch { /* ignore */ }
    }
    sampleLoops.clear();
  }

  // ------------------------------------------------------- 音效包（可选） ---
  // 用户从爱给网等渠道下载的授权素材，通过面板「载入音效包」选择文件，
  // 只存进浏览器 IndexedDB，不进仓库、不走网络。文件名决定用途：
  //   高铁鸣笛.wav → horn；高铁关门.wav → door-close；哈尔滨西站广播.wav →
  //   VAB 站专属 announce；CRH5 出站.wav → crh5 车型专属 depart。
  function classifyName(filename) {
    const base = String(filename ?? '').replace(/\.[^.]+$/, '');
    let key = 'effect';
    if (/鸣笛|汽笛|风笛|horn/i.test(base)) key = 'horn';
    else if (/关门|闭门|车门关闭|关车/i.test(base)) key = 'door-close';
    else if (/开门|车门开/i.test(base)) key = 'door-open';
    else if (/放气|排气|风缸|hiss/i.test(base)) key = 'door-hiss';
    else if (/出站|发车|驶出/i.test(base)) key = 'depart';
    else if (/进站|到站|停稳|抵达/i.test(base)) key = 'arrive';
    else if (/广播|播报|报站|提示音/i.test(base)) key = 'announce';
    else if (/道岔|过岔|钢轨|轮轨/i.test(base)) key = 'switch';
    else if (/制动|刹车|停车/i.test(base)) key = 'brake';
    else if (/人群|候车|站台|嘈杂|环境/i.test(base)) key = 'crowd';
    else if (/行驶|运行|车厢内|车轮|轰隆/i.test(base)) key = 'rolling';

    const sm = base.match(/([\u4e00-\u9fa5]{2,8})站/);
    const station = sm ? sm[1] : null;
    let model = null;
    if (/CR400BF|复兴号|金凤凰|龙凤呈祥/i.test(base)) model = 'cr400bf';
    else if (/CRH380/i.test(base)) model = 'crh380b';
    else if (/CRH5/i.test(base)) model = 'crh5';
    else if (/CR200J|绿巨人/i.test(base)) model = 'cr200j';
    return { key, station, model };
  }

  function idbOpen() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('no-indexeddb')); return; }
      const req = indexedDB.open('cnthub-soundpack', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('files')) {
          req.result.createObjectStore('files', { keyPath: 'name' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbAll() {
    if (typeof indexedDB === 'undefined') return [];
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readonly');
      const req = tx.objectStore('files').getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPut(items) {
    if (typeof indexedDB === 'undefined') return false;
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      for (const item of items) store.put(item);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbClear() {
    if (typeof indexedDB === 'undefined') return false;
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function restorePack() {
    if (!ctx) return 0;
    const rows = await idbAll();
    let n = 0;
    for (const row of rows) {
      try {
        const decoded = await ctx.decodeAudioData(row.data.slice(0));
        const key = row.key || classifyName(row.name).key;
        if (row.station && row.model) addSample(`${row.station}:${row.model}:${key}`, decoded);
        else if (row.station) addSample(`${row.station}:${key}`, decoded);
        else if (row.model) addSample(`${row.model}:${key}`, decoded);
        else addSample(key, decoded);
        n += 1;
      } catch { /* 单个损坏文件不影响其它 */ }
    }
    packFiles = n;
    return n;
  }

  async function loadPack(files) {
    if (!supported) return { loaded: 0, skipped: 0 };
    api.resume();
    if (!ctx) return { loaded: 0, skipped: 0 };
    const list = Array.from(files ?? []);
    const items = [];
    let skipped = 0;
    for (const f of list) {
      const looksAudio = /\.(wav|mp3|ogg|m4a|aac|flac)$/i.test(f.name)
        || String(f.type ?? '').startsWith('audio/');
      if (!looksAudio || f.size > 48 * 1024 * 1024) { skipped += 1; continue; }
      try {
        const raw = await f.arrayBuffer();
        const decoded = await ctx.decodeAudioData(raw.slice(0));
        const meta = classifyName(f.name);
        // 通用文件才进 base key；带车型/站名的文件只作用于对应车型/车站，
        // 否则「CRH5鸣笛」会变成所有车的鸣笛。
        if (meta.station && meta.model) addSample(`${meta.station}:${meta.model}:${meta.key}`, decoded);
        else if (meta.station) addSample(`${meta.station}:${meta.key}`, decoded);
        else if (meta.model) addSample(`${meta.model}:${meta.key}`, decoded);
        else addSample(meta.key, decoded);
        items.push({ ...meta, name: f.name, data: raw });
      } catch {
        skipped += 1;
      }
    }
    if (items.length) { try { await idbPut(items); } catch { /* 隐私模式 */ } }
    packFiles += items.length;
    return { loaded: items.length, skipped };
  }

  async function clearPack() {
    stopSampleLoops();
    samples.clear();
    for (const [k, v] of builtin) samples.set(k, v);
    packFiles = 0;
    try { await idbClear(); } catch { /* ignore */ }
  }

  function noiseShot({
    dur = 0.15, type = 'bandpass', freq = 1000, q = 1, gain = 0.05,
    pan = 0, when = 0, attack = 0.004, dest = mix,
  } = {}) {
    if (!started || muted) return;
    const t = ctx.currentTime + 0.01 + when;
    const src = ctx.createBufferSource();
    src.buffer = burstBuf;
    const f = filter(type, freq, q);
    const g = gainNode(0, null);
    const p = pan ? panner(pan) : null;
    src.connect(f).connect(g);
    if (p) g.connect(p).connect(dest); else g.connect(dest);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    src.start(t, Math.random() * 0.4, dur + attack + 0.05);
    active(src);
  }

  function tone({
    freq = 440, dur = 0.25, type = 'sine', gain = 0.06, when = 0,
    to = null, pan = 0, attack = 0.01, dest = mix,
  } = {}) {
    if (!started || muted) return;
    const t = ctx.currentTime + 0.01 + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = gainNode(0, null);
    const p = pan ? panner(pan) : null;
    o.connect(g);
    if (p) g.connect(p).connect(dest); else g.connect(dest);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    active(o);
  }

  function paChime(prof = stationProfile(currentStation)) {
    if (sample('announce-chime', { station: currentStation?.name, model: currentModel })) return;
    // 枢纽三音上行、小站两音；音高随车站类型变，换站能听出差别
    const notes = prof.notes;
    notes.forEach((f, i) => {
      tone({ freq: f, dur: 0.5, type: 'sine', gain: 0.045, when: i * 0.24, attack: 0.015 });
      tone({ freq: f * 2, dur: 0.32, type: 'sine', gain: 0.012, when: i * 0.24, attack: 0.015 });
    });
  }

  /**
   * 站台播报：优先用系统 TTS 把站名念出来（不同车站自然不同），
   * 没有中文语音时回退到合成的「含糊广播」。
   */
  function speak(text, { rate = 0.9, pitch = 0.88, delay = 800 } = {}) {
    if (muted || !ambience || !text) return false;
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (!synth || typeof window.SpeechSynthesisUtterance !== 'function') return false;
    try {
      clearTimeout(ttsTimer);
      synth.cancel();
      ttsTimer = setTimeout(() => {
        try {
          const u = new window.SpeechSynthesisUtterance(text);
          u.lang = 'zh-CN';
          const voices = synth.getVoices?.() ?? [];
          const v = voices.find((x) => /^zh/i.test(x.lang))
            ?? voices.find((x) => /Chinese|中文|普通话|Mandarin/i.test(x.name));
          if (v) u.voice = v;
          u.rate = rate;
          u.pitch = pitch;
          u.volume = Math.min(1, volume + 0.2);
          synth.speak(u);
        } catch { /* 某些浏览器无语音包 */ }
      }, delay);
      return true;
    } catch {
      return false;
    }
  }

  function stationText(kind, zone) {
    const raw = zone?.name ?? currentStation?.name ?? '';
    const name = raw ? (raw.endsWith('站') ? raw : `${raw}站`) : '前方车站';
    if (kind === 'approach') return `列车前方到站，${name}。请下车的旅客提前做好下车准备。`;
    if (kind === 'arrive') return `${name}到了。请下车的旅客带好随身物品，注意站台与车厢之间的间隙。`;
    if (kind === 'depart') return '车门即将关闭，请旅客们注意安全。';
    return '';
  }

  /** 含糊广播：锯齿波过双共振峰，音节化包络。像广播，但听不出字。 */
  function announcement(syllables = 6, pan = -0.15) {
    if (sample('announce')) return;
    let when = rand(0.2, 0.5);
    for (let i = 0; i < syllables; i += 1) {
      const dur = rand(0.13, 0.27);
      const [f1, f2] = pick(VOWELS);
      const f0 = rand(92, 138);
      const t0 = when;
      tone({
        freq: f0, to: f0 * rand(0.82, 0.94), dur,
        type: 'sawtooth', gain: 0.022, when: t0, pan, attack: 0.03,
      });
      // 共振峰用短噪声近似：带通落在元音频率上
      noiseShot({
        dur: dur * 0.9, type: 'bandpass', freq: f1, q: 7,
        gain: 0.018, pan, when: t0, attack: 0.02,
      });
      noiseShot({
        dur: dur * 0.7, type: 'bandpass', freq: f2, q: 9,
        gain: 0.009, pan, when: t0, attack: 0.02,
      });
      when += dur + rand(0.04, 0.11);
    }
  }

  function doorChime(kind = 'open') {
    const opts = { station: currentStation?.name, model: currentModel };
    if (kind === 'close') {
      if (sample('door-close', opts)) return;
      // 关门：三声短促警示 + 下行两音
      for (let i = 0; i < 3; i += 1) {
        tone({ freq: 1046.5, dur: 0.09, type: 'square', gain: 0.022, when: i * 0.16, attack: 0.005 });
      }
      tone({ freq: 1046.5, dur: 0.22, type: 'sine', gain: 0.045, when: 0.55 });
      tone({ freq: 783.99, dur: 0.34, type: 'sine', gain: 0.045, when: 0.78 });
    } else {
      if (sample('door-open', opts)) return;
      tone({ freq: 659.25, dur: 0.2, type: 'sine', gain: 0.04 });
      tone({ freq: 987.77, dur: 0.3, type: 'sine', gain: 0.04, when: 0.2 });
    }
  }

  function doorHiss(strong = 1) {
    if (sample('door-hiss', { station: currentStation?.name, model: currentModel })) return;
    noiseShot({
      dur: 0.55 * strong, type: 'lowpass', freq: 1300, q: 0.7,
      gain: 0.055 * strong, attack: 0.03,
    });
    noiseShot({
      dur: 0.16, type: 'highpass', freq: 2600, q: 0.6,
      gain: 0.018 * strong, attack: 0.005,
    });
  }

  function horn() {
    if (sample('horn', { station: currentStation?.name, model: currentModel })) return;
    // 双音风笛：频率按车型取（CRH5 更尖、CR200J 更低沉）
    const pair = profileFor(currentModel).horn;
    pair.forEach((f, i) => {
      tone({
        freq: f, to: f * 0.995, dur: 0.75, type: 'square',
        gain: 0.055, when: 0, attack: 0.04, pan: i ? 0.12 : -0.12,
      });
      tone({
        freq: f * 2, dur: 0.6, type: 'sawtooth',
        gain: 0.016, when: 0.01, attack: 0.05, pan: i ? 0.12 : -0.12,
      });
    });
  }

  function switchClunk() {
    if (sample('switch', { station: currentStation?.name, model: currentModel })) return;
    tone({ freq: 82, to: 54, dur: 0.16, type: 'sine', gain: 0.09 });
    noiseShot({ dur: 0.12, type: 'lowpass', freq: 520, q: 1.2, gain: 0.05 });
    noiseShot({ dur: 0.05, type: 'bandpass', freq: 2400, q: 4, gain: 0.02, when: 0.03 });
  }

  function brakeHiss(strong = 1) {
    if (sample('brake', { station: currentStation?.name, model: currentModel })) return;
    noiseShot({
      dur: 0.8 * strong, type: 'bandpass', freq: 1900, q: 0.8,
      gain: 0.05 * strong, attack: 0.01,
    });
    noiseShot({
      dur: 0.3, type: 'lowpass', freq: 600, q: 0.8,
      gain: 0.035 * strong, attack: 0.02,
    });
  }

  function railTick(strength) {
    noiseShot({
      dur: 0.035, type: 'bandpass', freq: rand(1500, 2300), q: 3.5,
      gain: 0.012 * strength, pan: rand(-0.25, 0.25),
    });
  }

  function spark() {
    noiseShot({
      dur: 0.05, type: 'highpass', freq: rand(4200, 6200), q: 0.7,
      gain: 0.012, pan: rand(-0.5, 0.5),
    });
  }

  function bird() {
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i += 1) {
      const base = rand(2300, 3300);
      tone({
        freq: base, to: base * rand(1.12, 1.35), dur: rand(0.04, 0.08),
        type: 'sine', gain: 0.008, when: i * rand(0.09, 0.16), pan: rand(-0.7, 0.7),
      });
    }
  }

  function cricket() {
    for (let i = 0; i < 4; i += 1) {
      tone({
        freq: rand(3900, 4500), dur: 0.028, type: 'sine',
        gain: 0.006, when: i * 0.045, pan: rand(-0.8, 0.8),
      });
    }
  }

  function cityPass() {
    noiseShot({
      dur: 1.6, type: 'bandpass', freq: rand(420, 900), q: 0.8,
      gain: 0.022, pan: rand(-0.85, 0.85), attack: 0.4,
    });
  }

  function crowdSwell(strength = 1) {
    // 一阵人声起伏：几条错开的短噪声 + 音节
    for (let i = 0; i < 5; i += 1) {
      noiseShot({
        dur: rand(0.18, 0.35), type: 'bandpass', freq: rand(500, 1200), q: 4,
        gain: 0.016 * strength, when: i * rand(0.08, 0.2), pan: rand(-0.6, 0.6),
        attack: 0.04,
      });
    }
  }

  // ------------------------------------------------------------------- api ---
  const api = {
    get supported() { return supported; },

    /** 必须在用户手势里调用（浏览器自动播放策略）。重复调用安全。 */
    resume() {
      if (!supported) return false;
      if (!started) {
        try { build(); } catch { return false; }
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    },

    get state() { return ctx?.state ?? 'closed'; },

    setVolume(v) {
      volume = clamp01(v);
      if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05);
      writeStore(storageKey, { volume, muted, ambience });
    },

    setMuted(on) {
      muted = Boolean(on);
      if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.04);
      if (muted) {
        try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
      }
      writeStore(storageKey, { volume, muted, ambience });
      return muted;
    },

    setAmbience(on) {
      ambience = Boolean(on);
      if (!ambience) {
        try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
      }
      writeStore(storageKey, { volume, muted, ambience });
    },

    /** 换车底时调用，牵引啸叫 / 风笛按车型换音色。 */
    setModel(id) { if (id) currentModel = String(id); },

    /** 载入用户本地（已授权）的音效包，只写 IndexedDB，不上传。 */
    loadPack(files) { return loadPack(files); },
    clearPack() { return clearPack(); },

    horn,

    /** 事件入口：由集成层把 bus 事件转进来。 */
    event(name, payload) {
      if (!started || muted) return;
      switch (name) {
        case 'arrive': {
          const zone = payload?.zone ?? currentStation;
          if (zone) {
            currentStation = {
              id: zone.stationId ?? zone.id ?? currentStation?.id,
              name: zone.name ?? currentStation?.name,
              role: zone.role ?? currentStation?.role,
            };
          }
          const prof = stationProfile(currentStation);
          const opts = { station: currentStation?.name, model: currentModel };
          // 整段「进站停稳」采样优先；没有就钟声 + 广播（TTS 念站名）
          if (!sample('arrive', opts)) {
            paChime(prof);
            if (!sample('announce', opts)) {
              if (!speak(stationText('arrive', currentStation), { rate: prof.rate, delay: 700 })) {
                announcement(6, -0.2);
              }
            }
          }
          crowdSwell(1);
          doorHiss(0.5);
          break;
        }
        case 'approach': {
          const zone = payload?.zone;
          if (zone) {
            currentStation = {
              id: zone.stationId ?? zone.id ?? currentStation?.id,
              name: zone.name ?? currentStation?.name,
              role: zone.role ?? currentStation?.role,
            };
          }
          paChime(stationProfile(currentStation));
          break;
        }
        case 'depart': {
          const opts = { station: currentStation?.name, model: currentModel };
          if (!sample('depart', opts)) {
            doorHiss(0.5);
            speak(stationText('depart'), { delay: 120 });
          }
          break;
        }
        case 'doors': {
          const s = payload?.state;
          const opts = { station: currentStation?.name, model: currentModel };
          if (s === 'open') {
            if (!sample('door-open', opts)) doorChime('open');
            doorHiss(1);
            crowdSwell(0.7);
          } else if (s === 'opening') { doorHiss(0.7); }
          // closing 与随后的 closed 都会来一条事件，只在 closing 响一次
          else if (s === 'closing') {
            if (!sample('door-close', opts)) doorChime('close');
            doorHiss(0.9);
          }
          break;
        }
        case 'switch': switchClunk(); break;
        case 'emergency': brakeHiss(1.2); break;
        case 'traction': brakeHiss(0.4); break;
        default: break;
      }
    },

    /**
     * 每帧调用。只改 AudioParam，不新建节点。
     * @param {number} dt
     * @param {{velocity?:number, throttle?:number, brake?:number, emergency?:boolean,
     *   view?:string, theme?:string, stationFactor?:number, kind?:string,
     *   doorsOpen?:boolean, s?:number, density?:number}} info
     */
    update(dt, info = {}) {
      if (!started || !ctx) return;
      const d = Math.min(0.2, Math.max(0, dt || 0));
      eventClock += d;
      const t = ctx.currentTime;
      const v = Math.max(0, info.velocity || 0);
      const k = clamp01(v / SPEED_MAX);
      const inCab = info.view === 'cab';
      const station = clamp01(info.stationFactor || 0);
      const kind = info.kind || 'rural';
      const theme = info.theme || 'day';
      if (info.modelId) currentModel = info.modelId;
      if (info.station) {
        currentStation = {
          id: info.station.stationId ?? info.station.id ?? currentStation?.id,
          name: info.station.name ?? currentStation?.name,
          role: info.station.role ?? currentStation?.role,
        };
      }
      const prof = profileFor(currentModel);
      const sProf = stationProfile(currentStation);
      const urban = kind === 'urban' || kind === 'landmark' ? 1 : 0;
      const rural = kind === 'rural' ? 1 : 0;
      const depot = kind === 'depot' ? 1 : 0;
      const doors = Boolean(info.doorsOpen);
      const amb = ambience ? 1 : 0;
      const set = (param, value, tc = 0.12) => param.setTargetAtTime(
        Number.isFinite(value) ? value : 0, t, tc,
      );

      // 车外：滚动噪声 / 轮轨高频 / 风
      const rollLoop = ensureSampleLoop('rolling', { model: currentModel });
      if (rollLoop) {
        // 载入了「车厢内 / 行驶」采样：循环铺底，播放速率随速度微调
        set(rollLoop.gain.gain, 0.095 * Math.pow(k, 1.1) * (inCab ? 0.5 : 1), 0.25);
        rollLoop.src.playbackRate.setTargetAtTime(0.72 + 0.6 * k, t, 0.3);
        set(layers.rolling.gain.gain, 0.012 * Math.pow(k, 1.15), 0.2);
      } else {
        set(layers.rolling.gain.gain, 0.13 * Math.pow(k, 1.15) * (inCab ? 0.55 : 1), 0.18);
      }
      set(layers.rolling.filter.frequency, 240 + 980 * k, 0.2);
      set(layers.hiss.gain.gain, 0.026 * Math.pow(k, 1.6) * (inCab ? 0.35 : 1), 0.2);
      set(layers.hiss.filter.frequency, 1700 + 900 * k, 0.2);
      set(layers.wind.gain.gain, (0.045 * Math.pow(k, 1.7) * prof.wind + rural * 0.012) * (inCab ? 0.4 : 1), 0.25);
      set(layers.wind.filter.frequency, 520 + 760 * k, 0.25);

      // 牵引 / 电制动：VVVF 基频随速度上滑，2.02× 谐波给「变频器」的毛刺
      const traction = clamp01(info.throttle || 0);
      const braking = clamp01(info.brake || 0) + (info.emergency ? 1 : 0);
      const effort = Math.max(traction, Math.min(1, braking) * 0.55);
      const motorHz = prof.base + prof.gear * v;
      set(layers.motor.osc.frequency, motorHz, 0.08);
      set(layers.motor2.osc.frequency, motorHz * 2.02, 0.08);
      const motorGain = prof.whine * effort * (0.35 + 0.65 * k);
      set(layers.motor.gain.gain, motorGain, 0.15);
      set(layers.motor2.gain.gain, motorGain * 0.45, 0.15);
      set(layers.rumble.osc.frequency, 38 + 42 * k, 0.25);
      set(layers.rumble.gain.gain, 0.05 * k, 0.25);

      // 制动闸片：只在低速、有制动级位时摩擦
      const squeal = braking > 0.08 && v < 10 && v > 0.4
        ? 0.045 * Math.min(1, braking) * (1 - v / 10) * prof.brake : 0;
      set(layers.squeal.gain.gain, squeal, 0.1);
      set(layers.squeal.filter.frequency, 2850 + Math.sin(eventClock * 3.1) * 180, 0.15);

      // 站台人声：距离衰减 + 缓慢起伏（不是一条死噪声）
      const wobble = 0.78 + 0.22 * Math.sin(eventClock * 0.63) * Math.sin(eventClock * 0.21 + 1.3);
      const crowd = station * (0.05 + (doors ? 0.035 : 0)) * wobble * amb * sProf.crowd;
      const crowdLoop = ensureSampleLoop('crowd', { station: currentStation?.name });
      if (crowdLoop) {
        set(crowdLoop.gain.gain, station * (0.08 + (doors ? 0.03 : 0)) * amb, 0.4);
        set(layers.crowd.gain.gain, crowd * 0.12, 0.3);
        set(layers.crowdHi.gain.gain, crowd * 0.06, 0.3);
      } else {
        set(layers.crowd.gain.gain, crowd, 0.3);
        set(layers.crowdHi.gain.gain, crowd * 0.55, 0.3);
      }

      // 城市 / 车辆段底噪
      const city = (urban * 0.036 + depot * 0.02) * amb * (0.75 + 0.25 * Math.sin(eventClock * 0.4));
      set(layers.city.gain.gain, city, 0.4);
      set(layers.city.filter.frequency, urban ? 300 : 200, 0.4);

      // 司机室：整条总线低通 + 空调底噪（0.12 s 收敛，切视角不拖泥带水）
      set(cabin.frequency, inCab ? 1400 : 18000, 0.12);
      set(layers.hvac.gain.gain, inCab ? 0.02 : 0, 0.4);
      set(layers.hvacHum.gain.gain, inCab ? 0.004 : 0, 0.4);

      // 钢轨接头：按里程累计，25 m 一次（无砟板缝 / 焊接接头的轻响）
      const s = Number.isFinite(info.s) ? info.s : null;
      if (s !== null) {
        if (lastTravel === null) lastTravel = s;
        const ds = Math.abs(s - lastTravel);
        lastTravel = s;
        if (v > 1.2 && ds < 60) {
          travelAcc += ds;
          if (travelAcc >= 25) {
            travelAcc %= 25;
            railTick(0.45 + 0.55 * k);
            if (v > 25) setTimeout(() => railTick(0.3 + 0.4 * k), 85);
          }
        }
      }

      // 制动排风：级位从 0 抬起的瞬间
      if (braking > 0.05 && lastBrake <= 0.05) brakeHiss(1);
      lastBrake = braking;

      // 车门开合（事件缺失时的兜底，事件与状态去重）
      const nowOpen = doors;
      if (nowOpen !== doorOpen) doorOpen = nowOpen;

      // 随机环境音：鸟 / 虫 / 城市过车 / 接触网打火
      if (amb && rural) {
        nextBird -= d;
        if (nextBird <= 0) {
          nextBird = rand(2.5, 7);
          if (theme !== 'night' && v < 40) bird();
        }
        if (theme === 'night') {
          nextCricket -= d;
          if (nextCricket <= 0) { nextCricket = rand(1.2, 3.2); cricket(); }
        }
      }
      if (amb && urban) {
        nextCity -= d;
        if (nextCity <= 0) { nextCity = rand(4, 11); cityPass(); }
      }
      if (v > 22 && k > 0.25) {
        nextSpark -= d;
        if (nextSpark <= 0) { nextSpark = rand(3, 9); spark(); }
      }
    },

    stats() {
      return {
        supported,
        started,
        state: ctx?.state ?? 'closed',
        volume,
        muted,
        ambience,
        nodes,
        live,
        samples: samples.size,
        packFiles,
        model: currentModel,
        station: currentStation?.name ?? null,
        tts: typeof window !== 'undefined' && Boolean(window.speechSynthesis),
        loops: sampleLoops.size,
        // 给浏览器回归 / 面板诊断用：确认「场景 → 声音」真的在联动
        layers: started ? {
          rolling: +layers.rolling.gain.gain.value.toFixed(4),
          wind: +layers.wind.gain.gain.value.toFixed(4),
          motor: +layers.motor.gain.gain.value.toFixed(4),
          motorHz: Math.round(layers.motor.osc.frequency.value),
          crowd: +layers.crowd.gain.gain.value.toFixed(4),
          city: +layers.city.gain.gain.value.toFixed(4),
          squeal: +layers.squeal.gain.gain.value.toFixed(4),
          cabinHz: Math.round(cabin.frequency.value),
        } : null,
      };
    },

    dispose() {
      try {
        window.speechSynthesis?.cancel();
      } catch { /* ignore */ }
      stopSampleLoops();
      try {
        if (ctx) ctx.close();
      } catch { /* ignore */ }
      ctx = null;
      master = null;
      mix = null;
      cabin = null;
      started = false;
      for (const key of Object.keys(layers)) delete layers[key];
      samples.clear();
    },
  };

  return api;
}

export default createSoundscape;

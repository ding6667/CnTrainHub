import * as THREE from 'three';
import '../detail.css';
import './style.css';
import {
  CHUNK, CHUNK_KIND, QUALITY, CAMERA, THEMES, MOTION,
} from './config.js';
import { ROUTES, routeById } from './route-data.js';
import { segmentLabel } from './stream.js';
import { makeEnvironment } from '../detail-scene.js';
import { buildTrain } from '../train-3d.js';
import MODELS from '../data.json';
import { createJourneyRuntime, trainSpecFrom } from './framework.js';
import { EVENT, DOOR_STATE, DIRECTION, LANE, RAIL } from './core.js';
import HARBIN_PACK from './packs/harbin.js';
import { createSoundscape } from './audio.js';

/**
 * 哈尔滨线路漫游 —— 真实铁路模拟（v2）。
 *
 * 大白话：列车自己不动，车头朝 -Z 停在原点；世界由「线路中心线」按真实里程
 * 反变换过来。framework.js 是与省会无关的运行时（运动 / 分块 / 停站 / 车门 / 事件），
 * packs/harbin.js 只描述这里用哪些线路、站场、楼和地形，本文件只管渲染器、
 * 灯光、HUD 和 DOM 控件。三者解耦，换个省会不用复制这份文件。
 */
const params = new URLSearchParams(location.search);
const canvas = document.getElementById('stage');
const $ = (id) => document.getElementById(id);

function bail(title, msg) {
  $('loader').classList.add('done');
  $('fallback-title').textContent = title;
  $('fallback-msg').textContent = msg;
  $('fallback').hidden = false;
  for (const id of ['dock', 'console', 'specs', 'topright', 'notice']) {
    const el = $(id);
    if (el) el.style.display = 'none';
  }
  canvas.style.display = 'none';
}

if (!ROUTES?.length) {
  bail('线路数据缺失', '没有可用的线路节点数据。');
} else {
  try {
    boot();
  } catch (err) {
    bail('场景构建失败', `${err?.message ?? err}`);
    throw err;
  }
}

function boot() {
  // ------------------------------------------------------------ renderer ---
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight(0x3d5a80, 0x141a22, 0.55);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffd2a1, 2.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1536, 1536);
  // 16 辆长编全长 417 m，阴影相机必须罩住整列车，否则车尾没有投影。
  Object.assign(key.shadow.camera, { left: -270, right: 270, top: 270, bottom: -270, near: 1, far: 760 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.025;
  key.target.position.set(0, 2, -40);
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x74b6ff, 1.6);
  scene.add(rim, rim.target);
  // 冷色补光：给车体侧面和站台背光面一点层次，避免所有面都是同一个亮度。
  const fill = new THREE.DirectionalLight(0xbcd6ef, 0.42);
  fill.position.set(-60, 34, 80);
  scene.add(fill);

  /** 重烘阴影前先 dispose 旧 RT，否则每次 needsUpdate 都会泄漏一张纹理。 */
  function refreshShadows() {
    key.shadow.map?.dispose();
    key.shadow.map = null;
    renderer.shadowMap.needsUpdate = true;
  }

  // ------------------------------------------------------------- sky dome ---
  const skyGeo = new THREE.SphereGeometry(3000, 32, 16);
  const skyPos = skyGeo.attributes.position;
  const cTop = new THREE.Color();
  const cMid = new THREE.Color();
  const cBot = new THREE.Color();
  const paintSky = (t) => {
    cTop.setHex(t.sky[0]); cMid.setHex(t.sky[1]); cBot.setHex(t.sky[2]);
    const colors = [];
    for (let i = 0; i < skyPos.count; i += 1) {
      const y = skyPos.getY(i) / 3000;
      const c = y > 0.08 ? cMid.clone().lerp(cTop, Math.min(1, (y - 0.08) / 0.7)) : cBot.clone().lerp(cMid, Math.min(1, (y + 0.5) / 0.58));
      // 地平线附近加一层暖散射（真实大气的米氏散射），天空不再是一条硬渐变。
      const horizon = Math.exp(-(((y - 0.015) / 0.13) ** 2));
      c.lerp(new THREE.Color(t.env.glow), horizon * 0.3);
      colors.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  };
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.frustumCulled = false;
  scene.add(sky);

  // 太阳光晕：程序化径向渐变 sprite，按主光方向摆到天空球内。
  const sunOffset = new THREE.Vector3();
  let sunSprite = null;
  {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const g = cv.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 2, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,250,232,0.95)');
    grad.addColorStop(0.10, 'rgba(255,232,186,0.55)');
    grad.addColorStop(0.32, 'rgba(255,206,146,0.14)');
    grad.addColorStop(1, 'rgba(255,190,130,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false,
    }));
    sunSprite.scale.set(560, 560, 1);
    scene.add(sunSprite);
  }

  // 列车接地软阴影：实时阴影贴图在软件栅格化下很淡，这张程序化软影让 200~417 m
  // 的车体真正「压」在道床上，而不是浮在轨道上。长度随编组缩放。
  const contactShadow = (() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.45)');
    grad.addColorStop(0.58, 'rgba(0,0,0,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(cv);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 460),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.8 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, -0.6, 0);
    mesh.renderOrder = 1;
    return mesh;
  })();
  scene.add(contactShadow);

  // ---------------------------------------------------------------- state ---
  const S = {
    routeId: params.get('route') || ROUTES[0].id,
    modelId: params.get('model') || 'CR400BF-GZ',
    formation: Number(params.get('formation')) === 16 ? 16 : 8,
    startKm: 0,
    kmh: MOTION.defaultKmh,
    accel: MOTION.acceleration,
    theme: params.get('theme') || 'day',
    quality: 'mid',
    view: 'hero',
    fov: CAMERA.fov,
    ahead: CHUNK.ahead,
    density: 0.75,
    follow: true,
    buildings: true,
    stations: true,
    rural: true,
    wire: false,
  };
  let route = routeById(S.routeId) ?? ROUTES[0];
  S.routeId = route.id;
  let theme = THEMES[S.theme] ?? THEMES.day;

  const quality = QUALITY.find((q) => q.id === S.quality);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * quality.ratio);
  renderer.toneMappingExposure = theme.exposure;
  let envRT = makeEnvironment(renderer, theme);
  scene.environment = envRT.texture;
  scene.environmentIntensity = theme.envIntensity;
  paintSky(theme);

  const cam = new THREE.PerspectiveCamera(S.fov, innerWidth / innerHeight, CAMERA.near, CAMERA.far);
  cam.position.set(34, 13, 42);
  cam.lookAt(0, CAMERA.focusY, -18);

  // ----------------------------------------------------------------- 车底 ---
  function trainConfig() {
    const base = MODELS[S.modelId] ?? MODELS['CR400BF-GZ'];
    // CR200J3-C 实车是 9 辆短编（1 动力 + 7 拖 + 1 控制），16 辆按示意长编重联。
    const n = base.model === 'cr200j' ? (S.formation === 16 ? 16 : 9) : S.formation;
    const gap = base.set.gap;
    const cfg = { ...base, formation: n };
    if (base.model === 'cr200j') {
      cfg.carLengths = [20.0, ...Array(n - 2).fill(26.0), 27.6];
      cfg.pantoCars = [0];
    } else if (base.model !== 'cr400bf') {
      cfg.carLengths = Array.from({ length: n }, (_, i) => (
        i === 0 || i === n - 1 ? base.set.headLength : base.set.middleLength
      ));
      cfg.pantoCars = [2, n - 3];
    } else {
      cfg.pantoCars = [2, n - 3];
    }
    const lengths = cfg.carLengths ?? Array.from({ length: n }, (_, i) => (
      i === 0 || i === n - 1 ? base.set.headLength : base.set.middleLength
    ));
    cfg.set = { ...base.set, setLength: lengths.reduce((a, b) => a + b, 0) + gap * (n - 1) };
    return cfg;
  }

  /** 定员按已核实的实车数据按编组线性换算，找不到就按每节 70 人兜底。 */
  function capacityFor(modelId, n) {
    const c = HARBIN_PACK.fleetCapacity?.[modelId];
    const baseN = c?.formation ?? c?.seatsPerCar?.length ?? 8;
    const cap = Math.round((c?.capacity ?? baseN * 70) * (n / baseN));
    const per = Math.round(cap / n);
    const seatsPerCar = Array.from({ length: n }, (_, i) => (
      i === 0 || i === n - 1 ? Math.round(per * 0.72) : per
    ));
    return { capacity: cap, seatsPerCar };
  }

  let train = buildTrain(trainConfig());
  scene.add(train.group);
  contactShadow.scale.y = Math.max(0.4, train.total / 460);

  function currentSpec() {
    const cfg = trainConfig();
    const { capacity, seatsPerCar } = capacityFor(S.modelId, cfg.formation);
    return trainSpecFrom(S.modelId, cfg, train, capacity, seatsPerCar);
  }

  function syncTrainHud(cfg) {
    $('train-note').textContent = cfg.model === 'cr200j' && cfg.formation === 9
      ? `${S.modelId} · 9 辆短编（实车） · ${cfg.set.setLength.toFixed(2)} m`
      : `${S.modelId} · ${cfg.formation} 辆 · ${cfg.set.setLength.toFixed(2)} m`;
    $('livery-tag').textContent = `${S.modelId} · ${cfg.formation} 辆`;
  }

  // ------------------------------------------------------------- runtime ---
  const runtime = createJourneyRuntime(HARBIN_PACK, {
    scene, camera: cam, renderer, THREE, domElement: renderer.domElement,
    startKm: route.nodes?.[0]?.km ?? 0,
    modelId: S.modelId, formation: S.formation,
    kmh: S.kmh, accel: S.accel, theme: S.theme, quality: S.quality,
    view: S.view, ahead: S.ahead, density: S.density,
    trainSpec: currentSpec(),
  });
  S.startKm = route.nodes?.[0]?.km ?? 0;

  const chunkSys = runtime.registry.get('chunks');
  const camSys = runtime.registry.get('camera');
  const passengerSys = runtime.registry.get('passengers');
  const scheduleSys = runtime.registry.get('timetable');
  const stationSys = runtime.registry.get('stations');
  camSys?.setTrainSpec?.(currentSpec());

  // 场景音效：全程序化合成（轮轨 / 牵引 / 制动 / 车门 / 站台广播 / 人群 / 郊外）。
  // AudioContext 只能由用户手势创建，所以这里只建对象，首次点击或按键时才 resume。
  const sound = createSoundscape();

  /**
   * 到发线横移量按该站**真实站台边缘**算：让列车中心停在「站台边缘 − 1.75 m」，
   * 车侧与站台面只留 7 cm 缝隙（真实高站台就是这样）。旧版 stationLane 默认横移
   * 6.5 m，而哈西最内侧站台边缘在 11.5 m，所以「进到发线」后车与站台仍差 5 m ——
   * 这正是「站房和轨道不挨着」的残留根因。
   */
  function stationLaneFor(centerS, stationId) {
    const bands = stationSys?.platformBandsFor?.(stationId) ?? [];
    const edge = bands.length
      ? Math.min(...bands.map(([a, b]) => Math.min(Math.abs(a), Math.abs(b))))
      : 0;
    const offset = edge > 3 ? edge - RAIL.platformEdge : 6.5;
    return runtime.alignment.stationLane(centerS, 1, { offset });
  }
  function stationIdAt(meters) {
    const n = (route.nodes || []).find((x) => Math.abs(x.km * 1000 - meters) < 2);
    return n?.stationId ?? n?.name ?? null;
  }

  // 起点若在站内，默认就停在到发线：第一眼必须是「列车贴着站台」，
  // 而不是停在正线上、站台在 11 m 外（用户抱怨的分离感）。
  {
    const L = HARBIN_PACK.stationLayouts ?? {};
    const node = (route.nodes || []).find((n) => {
      const len = L[n.stationId]?.platformLength ?? RAIL.platformLength;
      return Math.abs(n.km * 1000 - runtime.state.s) <= len / 2;
    });
    if (node) {
      runtime.setLane(stationLaneFor(node.km * 1000, node.stationId));
      $('c-lane').value = 'station';
    }
  }

  function rebuildTrain() {
    scene.remove(train.group);
    train.dispose();
    const cfg = trainConfig();
    train = buildTrain(cfg);
    scene.add(train.group);
    contactShadow.scale.y = Math.max(0.4, train.total / 460);
    train.setWireframe(S.wire);
    sound.setModel(S.modelId);
    train.materials.glass.emissiveIntensity = S.theme === 'night' ? 0.07 : S.theme === 'dusk' ? 0.04 : 0.01;
    const spec = currentSpec();
    runtime.setTrainSpec(spec);
    camSys?.setTrainSpec?.(spec);
    syncTrainHud(cfg);
    // 换车底不重烘阴影：每烘一次都会新建一张 RenderTarget（纹理计数 +1）。
  }
  syncTrainHud(trainConfig());

  // -------------------------------------------------------------- themes ---
  function applyTheme(id) {
    S.theme = id;
    theme = THEMES[id] ?? THEMES.day;
    scene.fog = new THREE.FogExp2(theme.fog, theme.fogDensity);
    scene.background = new THREE.Color(theme.fog);
    hemi.color.setHex(theme.hemi.sky);
    hemi.groundColor.setHex(theme.hemi.ground);
    hemi.intensity = theme.hemi.intensity;
    key.color.setHex(theme.key.color);
    key.intensity = theme.key.intensity;
    key.position.set(
      Math.sin(theme.key.azimuth) * 200 * Math.cos(theme.key.elevation),
      Math.sin(theme.key.elevation) * 200 + 30,
      Math.cos(theme.key.azimuth) * 200 * Math.cos(theme.key.elevation),
    );
    rim.color.setHex(theme.rim.color);
    rim.intensity = theme.rim.intensity;
    rim.position.set(Math.sin(theme.rim.azimuth) * 150, 40, Math.cos(theme.rim.azimuth) * 150);
    renderer.toneMappingExposure = theme.exposure;
    paintSky(theme);
    skyGeo.attributes.color.needsUpdate = true;
    sunOffset.copy(key.position).normalize().multiplyScalar(1400);
    sunSprite.material.opacity = id === 'night' ? 0.05 : id === 'dusk' ? 0.7 : 0.85;
    sunSprite.material.color.setHex(id === 'night' ? 0x9fc4ea : 0xfff0d4);
    const old = envRT;
    envRT = makeEnvironment(renderer, theme);
    scene.environment = envRT.texture;
    scene.environmentIntensity = theme.envIntensity;
    old.dispose();
    train.materials.glass.emissiveIntensity = id === 'night' ? 0.07 : id === 'dusk' ? 0.04 : 0.01;
    runtime.setTheme(id);
    chunkSys?.clear?.(); // 亮窗/雪色要重建
    refreshShadows();
  }

  function applyQuality(id) {
    S.quality = id;
    runtime.state.quality = id;
    const q = QUALITY.find((x) => x.id === id) ?? QUALITY[1];
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * q.ratio);
    renderer.setSize(innerWidth, innerHeight);
    key.shadow.mapSize.set(q.shadow, q.shadow);
    refreshShadows();
  }

  function applyView(id) {
    S.view = id;
    runtime.setView(id);
    camSys?.setPreset?.(id);
    $('c-view').value = id;
  }

  function setRunning(on) { runtime.setRunning(on); }

  // ----------------------------------------------------------------- UI ---
  const routeSel = $('route-select');
  const startSel = $('start-select');
  const modelSel = $('c-model');
  const formationSel = $('c-formation');
  for (const r of ROUTES) {
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = `${r.name} · ${r.officialKm} km`;
    routeSel.appendChild(o);
  }
  routeSel.value = S.routeId;

  function populateStartStations() {
    startSel.innerHTML = '';
    for (const r of ROUTES) {
      const g = document.createElement('optgroup');
      g.label = r.name;
      for (const n of (r.nodes || []).filter((x) => x.role === 'hub' || x.role === 'local')) {
        const o = document.createElement('option');
        o.value = `${r.id}|${n.km}`;
        o.textContent = `${n.name} · ${n.km.toFixed(0)} km`;
        g.appendChild(o);
      }
      startSel.appendChild(g);
    }
  }
  function syncStartSelection() {
    const target = `${route.id}|${S.startKm}`;
    if ([...startSel.options].some((o) => o.value === target)) {
      startSel.value = target;
      return;
    }
    const first = [...startSel.options].find((o) => o.value.startsWith(`${route.id}|`));
    if (first) startSel.value = first.value;
  }
  populateStartStations();
  syncStartSelection();

  for (const [id, m] of Object.entries(MODELS)) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = `${m.name} · ${m.title ?? ''}`;
    modelSel.appendChild(o);
  }
  modelSel.value = S.modelId;
  formationSel.value = String(S.formation);

  const viewSel = $('c-view');
  for (const v of HARBIN_PACK.views) {
    const o = document.createElement('option');
    o.value = v.id;
    o.textContent = v.label ?? v.id;
    viewSel.appendChild(o);
  }
  viewSel.value = S.view;
  $('sp-route').textContent = route.name;
  $('sp-km').textContent = `${route.officialKm} km`;

  const RANGES = [
    ['c-speed', 'o-speed', 'kmh', (v) => `${v.toFixed(0)} km/h`],
    ['c-accel', 'o-accel', 'accel', (v) => `${v.toFixed(1)} m/s²`],
    ['c-fov', 'o-fov', 'fov', (v) => `${v.toFixed(0)}°`],
    ['c-ahead', 'o-ahead', 'ahead', (v) => `${v.toFixed(0)} 块`],
    ['c-density', 'o-density', 'density', (v) => `${v.toFixed(0)}%`],
  ];
  for (const [inputId, outId, keyName, fmt] of RANGES) {
    const el = $(inputId);
    el.value = String(keyName === 'density' ? S.density * 100 : S[keyName]);
    $(outId).textContent = fmt(Number(el.value));
    el.addEventListener('input', () => {
      const v = Number(el.value);
      S[keyName] = keyName === 'density' ? v / 100 : v;
      $(outId).textContent = fmt(v);
      if (keyName === 'kmh') runtime.setTargetKmh(v);
      else if (keyName === 'accel') runtime.state.accel = v;
      else if (keyName === 'fov') {
        cam.fov = v; cam.updateProjectionMatrix(); camSys?.setFov?.(v);
      } else if (keyName === 'ahead') { runtime.setAhead(v); }
      else { runtime.state.density = S.density; chunkSys?.clear?.(); }
    });
  }
  // ------------------------------------------------ 驾驶台：控制权交给玩家 ----
  // 默认纯手动：牵引 / 制动 / 开关门 / 换向全部由玩家操作，系统只做 ATP 限速
  // 监督与「两端车门是否都在停车区间内」的安全门控，绝不替玩家停车或发车。
  const throttleEl = $('c-throttle');
  const brakeEl = $('c-brake');
  const atoEl = $('c-ato');

  function syncDriveUi() {
    const st = runtime.state;
    const t = Math.round((st.running ? st.throttle : 0) * 100);
    const b = Math.round((st.emergency ? 1 : st.brake) * 100);
    if (document.activeElement !== throttleEl) throttleEl.value = String(t);
    if (document.activeElement !== brakeEl) brakeEl.value = String(b);
    $('o-throttle').textContent = `${t}%`;
    $('o-brake').textContent = `${b}%`;
    $('drive-mode').textContent = st.autoDrive ? 'ATO 自动' : '手动驾驶';
    $('drive-mode').classList.toggle('is-ato', Boolean(st.autoDrive));
    atoEl.checked = Boolean(st.autoDrive);
  }

  /** 开门必须同时满足：停稳 + 全列两端车门都在停车区间内。 */
  function requestDoors(open) {
    const st = runtime.state;
    if (open) {
      if (!st.stopped) { notice('请先停稳列车再开门'); return; }
      if (!st.doorsCanOpen) { notice('禁止开门 · 两端车门未全部落在停车区间内'); return; }
    }
    runtime.setDoorRequest(open);
    $('c-doors').value = open ? 'open' : 'close';
    notice(open ? '请求开门 · 停稳且全列在区间内' : '车门关闭');
  }

  // ------------------------------------------------------------- 音效 UI ---
  const volumeEl = $('c-volume');
  const muteEl = $('c-mute');
  const ambienceEl = $('c-ambience');
  function syncAudioUi() {
    const a = sound.stats();
    const badge = $('audio-badge');
    const label = !a.supported ? '不支持'
      : !a.started ? '待开启'
        : a.muted ? '静音'
          : a.state === 'running' ? '运行中' : '已暂停';
    badge.textContent = label;
    badge.classList.toggle('is-on', a.started && !a.muted && a.state === 'running');
    $('a-audio').textContent = !a.started ? '开启声音' : a.muted ? '取消静音' : '声音已开启';
    $('a-audio').classList.toggle('is-on', a.started && !a.muted && a.state === 'running');
    if (document.activeElement !== volumeEl) volumeEl.value = String(Math.round(a.volume * 100));
    $('o-volume').textContent = `${Math.round(a.volume * 100)}%`;
    muteEl.checked = a.muted;
    ambienceEl.checked = a.ambience;
    $('audio-note').textContent = !a.supported
      ? '当前浏览器不支持 Web Audio，画面不受影响'
      : a.packFiles > 0
        ? `真实采样 ${a.packFiles} 段 + 合成兜底 · 按车型/车站自动匹配`
        : '实时合成 · 按车型变声、按车站播报，可在下方载入授权音效包';
  }
  volumeEl.addEventListener('input', () => {
    sound.setVolume(Number(volumeEl.value) / 100);
    syncAudioUi();
  });
  muteEl.addEventListener('change', () => {
    sound.setMuted(muteEl.checked);
    syncAudioUi();
  });
  ambienceEl.addEventListener('change', () => {
    sound.setAmbience(ambienceEl.checked);
    syncAudioUi();
  });
  $('a-audio').addEventListener('click', () => {
    if (!sound.supported) { notice('当前浏览器不支持 Web Audio'); return; }
    sound.resume();
    if (sound.stats().muted) sound.setMuted(false);
    notice('声音已开启 · 轮轨 / 牵引 / 站台广播 / 人群');
    syncAudioUi();
  });
  $('a-horn').addEventListener('click', () => {
    sound.resume();
    sound.horn();
  });
  // 授权音效包：只在本地解析、写入 IndexedDB，不上传服务器。
  const packEl = $('c-audio-pack');
  $('a-audio-pack').addEventListener('click', () => {
    sound.resume();
    packEl.click();
  });
  packEl.addEventListener('change', async () => {
    const files = [...(packEl.files ?? [])];
    if (!files.length) return;
    notice(`正在解析 ${files.length} 个音频…`);
    const r = await sound.loadPack(files);
    notice(r.loaded
      ? `音效包已载入 ${r.loaded} 段${r.skipped ? ` · 跳过 ${r.skipped} 个` : ''}`
      : '没有可用的音频文件');
    packEl.value = '';
    syncAudioUi();
  });
  // 浏览器要求手势：第一次点画面或按键时静默建流（若之前选了静音则不出声）。
  const unlockAudio = () => {
    if (!sound.supported) return;
    if (!sound.stats().started) sound.resume();
    syncAudioUi();
  };
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  document.addEventListener('keydown', unlockAudio);
  syncAudioUi();

  /** 任何手动牵引 / 制动都视为接管：ATO 立刻退出，否则玩家抢不回控制权。 */
  function takeManual(reason = '手动接管') {
    if (!runtime.state.autoDrive) return false;
    runtime.setAutoDrive(false);
    syncDriveUi();
    notice(`${reason} · ATO 已退出`);
    return true;
  }

  throttleEl.addEventListener('input', () => {
    takeManual('手动牵引');
    runtime.setThrottle(Number(throttleEl.value) / 100);
    if (Number(throttleEl.value) > 0) brakeEl.value = '0';
    syncDriveUi();
  });
  brakeEl.addEventListener('input', () => {
    takeManual('手动制动');
    runtime.setBrake(Number(brakeEl.value) / 100);
    if (Number(brakeEl.value) > 0) throttleEl.value = '0';
    syncDriveUi();
  });
  atoEl.addEventListener('change', () => {
    runtime.setAutoDrive(atoEl.checked);
    notice(atoEl.checked ? 'ATO 已接管 · 自动对标停车与乘降' : '已切回手动驾驶 · 请自行牵引 / 制动 / 开关门');
    syncDriveUi();
  });
  $('a-emergency').addEventListener('click', () => {
    takeManual('手动制动');
    const on = !runtime.state.emergency;
    runtime.setEmergency(on);
    if (on) sound.event('emergency');
    notice(on ? '紧急制动 · 1.6 m/s²' : '紧急制动缓解');
    syncDriveUi();
  });
  $('a-doors-open').addEventListener('click', () => requestDoors(true));
  $('a-doors-close').addEventListener('click', () => requestDoors(false));
  syncDriveUi();

  const CHECKS = [
    ['c-follow', 'follow'], ['c-buildings', 'buildings'], ['c-stations', 'stations'],
    ['c-rural', 'rural'], ['c-wire', 'wire'], ['c-passengers', 'passengers'], ['c-schedule', 'schedule'],
  ];
  for (const [id, k] of CHECKS) {
    const el = $(id);
    el.checked = Boolean(S[k] ?? true);
    el.addEventListener('change', () => {
      S[k] = el.checked;
      runtime.state[k] = el.checked;
      if (k === 'wire') { train.setWireframe(el.checked); refreshShadows(); }
      else if (k === 'follow') camSys?.setFollow?.(el.checked);
      else if (k === 'passengers') {
        if (passengerSys) passengerSys.enabled = el.checked;
        const g = scene.getObjectByName('passengers');
        if (g) g.visible = el.checked;
      } else if (k === 'schedule') {
        if (scheduleSys) scheduleSys.enabled = el.checked;
      } else if (k === 'rural') {
        runtime.registry.get('terrain')?.setRural?.(el.checked);
      } else chunkSys?.clear?.();
    });
  }

  $('c-theme').value = S.theme;
  $('c-theme').addEventListener('change', (e) => { applyTheme(e.target.value); syncAll(); });
  $('c-quality').value = S.quality;
  $('c-quality').addEventListener('change', (e) => applyQuality(e.target.value));
  viewSel.addEventListener('change', (e) => applyView(e.target.value));
  modelSel.addEventListener('change', (e) => {
    S.modelId = e.target.value;
    runtime.setModel(S.modelId);
    rebuildTrain();
    applyView(S.view);
    notice(`更换车底 · ${S.modelId}`);
  });
  formationSel.addEventListener('change', (e) => {
    S.formation = Number(e.target.value);
    runtime.setFormation(S.formation);
    rebuildTrain();
    applyView(S.view);
    notice(`编组切换 · ${$('train-note').textContent}`);
  });

  startSel.addEventListener('change', (e) => {
    const [rid, kmText] = e.target.value.split('|');
    const r = routeById(rid);
    if (!r) return;
    const km = Number(kmText);
    if (r.id !== route.id) {
      route = r;
      S.routeId = r.id;
      runtime.setRoute(r.id, km);
    } else runtime.setTravel(km * 1000);
    S.startKm = km;
    // 从终点站出发时默认反向，否则 s 已在末端、正向牵引一步都走不了。
    const startDir = km * 1000 > runtime.alignment.lengthM - 1000
      ? DIRECTION.REVERSE : DIRECTION.FORWARD;
    runtime.setDirection(startDir);
    $('c-dir').value = String(startDir);
    setRunning(false);
    routeSel.value = r.id;
    $('sp-route').textContent = r.name;
    $('sp-km').textContent = `${r.officialKm} km`;
    const stationName = e.target.selectedOptions[0]?.textContent.split(' · ')[0] ?? '该站';
    notice(`从 ${stationName} 出发 · 向 ${r.name} 终点方向`);
  });
  routeSel.addEventListener('change', (e) => {
    route = routeById(e.target.value) ?? ROUTES[0];
    S.routeId = route.id;
    S.startKm = route.nodes?.[0]?.km ?? 0;
    runtime.setRoute(route.id, S.startKm);
    setRunning(false);
    syncStartSelection();
    $('sp-route').textContent = route.name;
    $('sp-km').textContent = `${route.officialKm} km`;
    $('c-dir').value = String(DIRECTION.FORWARD);
    notice(`切换线路 · ${route.name}`);
  });

  // ------------------------------------------------------- 新：行车 / 进路 ---
  const alignment = () => runtime.alignment;
  function nearestStationS(kind = 'station') {
    const nodes = (route.nodes || []).filter((n) => (
      kind === 'depot' ? n.role === 'depot' : n.role === 'hub' || n.role === 'local'
    ));
    if (!nodes.length) return runtime.state.s;
    let best = nodes[0];
    let bd = Infinity;
    for (const n of nodes) {
      const d = Math.abs(n.km * 1000 - runtime.state.s);
      if (d < bd) { bd = d; best = n; }
    }
    return best.km * 1000;
  }

  $('c-dir').addEventListener('change', (e) => {
    const d = Number(e.target.value) < 0 ? DIRECTION.REVERSE : DIRECTION.FORWARD;
    if (d !== runtime.state.dir) {
      runtime.setDirection(d);
      notice(d === DIRECTION.REVERSE ? '逻辑掉头 · 行驶方向翻转，车身不转向' : '恢复正向行驶');
    }
  });
  $('a-reverse').addEventListener('click', () => {
    // 起点 / 终点没有掉头余地：再翻方向就是朝线路外，牵引永远不动。
    if (!runtime.canReverse()) {
      notice(runtime.state.dir === DIRECTION.FORWARD
        ? '已在 0 km 起点 · 前方只有正向，直接牵引即可'
        : '已在线路终点 · 只能反向，直接牵引即可');
      return;
    }
    const d = runtime.reverse();
    $('c-dir').value = String(d);
    notice(d === DIRECTION.REVERSE ? '逻辑掉头 · 仅改变行驶方向' : '恢复正向行驶');
  });
  $('c-lane').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v === LANE.MAIN) {
      runtime.setLane(LANE.MAIN);
      notice('进路：正线通过');
      return;
    }
    const isDepot = v === LANE.DEPOT;
    const center = nearestStationS(isDepot ? 'depot' : 'station');
    const lane = isDepot
      ? alignment().depotLane(center)
      : stationLaneFor(center, stationIdAt(center));
    runtime.setLane(lane);
    // 只排进路，**绝不传送里程、绝不替玩家发车**。列车开到道岔前时，
    // alignment.stationLane() 的 300 m 缓和段会自然把车横移到到发线。
    // 旧版这里 setTravel() 直接把车瞬移到进岔前 200 m，正是「开车一闪」的来源。
    notice(isDepot ? '进路已排：段管线 · 请自行牵引经过道岔'
      : '进路已排：到发线 · 请自行牵引进站并对标停车');
  });
  $('a-dwell').addEventListener('click', () => {
    const dir = runtime.state.dir;
    const nodes = (route.nodes || []).filter((n) => n.role === 'hub' || n.role === 'local');
    const target = dir === DIRECTION.FORWARD
      ? nodes.find((n) => n.km * 1000 > runtime.state.s + 400)
      : [...nodes].reverse().find((n) => n.km * 1000 < runtime.state.s - 400);
    if (!target) { notice('前方没有可停靠车站'); return; }
    const center = target.km * 1000;
    runtime.setLane(stationLaneFor(center, target.stationId ?? target.name));
    $('c-lane').value = 'station';
    const dist = Math.abs(center - runtime.state.s);
    // 只做「预告 + 排进路」：不传送、不发车、不替玩家停车。
    notice(`前方 ${target.name} · 还有 ${(dist / 1000).toFixed(1)} km · 到发线进路已排，请自行牵引并对标停车`);
  });
  $('c-doors').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v === 'auto') {
      if (!runtime.state.autoDrive) {
        e.target.value = 'close';
        runtime.setDoorRequest(false);
        notice('请先开启 ATO 自动对标停车，车门才会跟随运行图');
        return;
      }
      runtime.setDoorRequest(null);
      notice('车门跟随 ATO');
    } else requestDoors(v === 'open');
  });
  $('c-cammode').addEventListener('change', (e) => {
    runtime.setCameraMode(e.target.value);
    camSys?.setMode?.(e.target.value);
    notice(e.target.value === 'absolute' ? '绝对视角 · 轨旁定点' : '相对视角 · 随车身');
  });

  $('a-reset').addEventListener('click', () => {
    S.startKm = route.nodes?.[0]?.km ?? 0;
    runtime.setRoute(route.id, S.startKm);
    setRunning(false);
    applyView('hero');
    applyTheme('day');
    syncAll();
    $('c-dir').value = String(DIRECTION.FORWARD);
    $('c-lane').value = 'main';
    notice('已回到线路起点');
  });
  $('a-export').addEventListener('click', () => {
    renderer.render(scene, cam);
    const a = document.createElement('a');
    a.href = renderer.domElement.toDataURL('image/png');
    a.download = `harbin-${route.id}-${runtime.state.s.toFixed(0)}m.png`;
    a.click();
  });

  function syncAll() {
    for (const [inputId, outId, keyName, fmt] of RANGES) {
      const v = keyName === 'density' ? S.density * 100 : S[keyName];
      $(inputId).value = String(v);
      $(outId).textContent = fmt(v);
    }
    for (const [id, key] of CHECKS) $(id).checked = Boolean(S[key] ?? true);
    $('c-theme').value = S.theme;
    $('c-quality').value = S.quality;
    viewSel.value = S.view;
    modelSel.value = S.modelId;
    formationSel.value = String(S.formation);
    $('c-dir').value = String(runtime.state.dir);
    syncStartSelection();
  }

  let noticeTimer = 0;
  function notice(msg) {
    const el = $('notice');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => el.classList.remove('on'), 2200);
  }

  // ------------------------------------------------------------- events ---
  const bus = runtime.bus;
  bus.on(EVENT.ARRIVE, (p) => notice(`到达 ${p.zone?.name ?? '车站'} · 停车区间 ${Math.round(p.zone?.length ?? 0)} m`));
  bus.on(EVENT.DEPART, () => { if (runtime.state.s > 0) notice('出站 · 车门关闭'); });
  bus.on(EVENT.SWITCH, (p) => notice(`道岔转换 · ${p.name === 'main' ? '正线' : p.name === 'depot' ? '段管线' : '到发线'}`));
  bus.on(EVENT.REVERSE, () => notice('逻辑掉头完成 · 车身保持原朝向'));
  bus.on(EVENT.DOORS, (p) => { if (p.state === DOOR_STATE.OPEN) notice('车门开启 · 站台上下客'); });
  bus.on(EVENT.SERVICE_DUE, (p) => notice(`时刻表 · ${p.service?.trainNo ?? '车次'} 到发`));
  // 音效走同一套事件：进站广播 / 开合门提示 / 道岔落锁 / 发车
  bus.on(EVENT.APPROACH, () => sound.event('approach'));
  bus.on(EVENT.ARRIVE, (p) => sound.event('arrive', p));
  bus.on(EVENT.DEPART, () => sound.event('depart'));
  bus.on(EVENT.DOORS, (p) => sound.event('doors', p));
  bus.on(EVENT.SWITCH, () => sound.event('switch'));
  bus.on(EVENT.DIRECTION_CHANGE, (p) => {
    $('c-dir').value = String(p.dir);
    if (p.reason === 'endpoint') {
      notice(p.dir === DIRECTION.FORWARD ? '已在 0 km 起点 · 自动转为正向发车' : '已在线路终点 · 自动转为反向发车');
    }
  });
  bus.on(EVENT.ROUTE_CHANGE, () => chunkSys?.clear?.());
  // 时刻表的「终到立折」由宿主执行：车体不旋转，只翻行驶方向（需求 1/4）
  bus.on(HARBIN_PACK.scheduleEvents?.REVERSE_REQUEST ?? 'timetable:reverse-request', (p) => {
    // 终到站正好是线路端点时不要翻向线路外，否则 ATO 会卡在 0 km 反复「到站」。
    if (!runtime.canReverse()) {
      notice('终到站是线路端点 · 保持当前方向，直接牵引即可离开');
      return;
    }
    runtime.setDirection(p?.to ?? DIRECTION.REVERSE);
    $('c-dir').value = String(runtime.state.dir);
    notice('时刻表 · 终到立折，逻辑掉头');
  });

  // --------------------------------------------------------------- loop ---
  const clock = new THREE.Clock();
  let elapsed = 0;
  let statAt = 0;
  let fpsAcc = 0;
  let fpsFrames = 0;
  let lastKind = '';

  const runBtn = $('run');
  function syncRunButton() {
    const on = runtime.state.running;
    runBtn.classList.toggle('is-on', on);
    $('run-label').textContent = on ? '惰行' : '牵引';
  }
  /** 空格 / 按钮 = 牵引与惰行切换（松牵引不等于刹车，停车请用 S 或制动滑杆）。 */
  function toggleTraction() {
    takeManual('手动牵引');
    const on = !runtime.state.running;
    setRunning(on);
    if (on) { runtime.setBrake(0); runtime.setEmergency(false); }
    syncDriveUi();
    syncRunButton();
  }
  runBtn.addEventListener('click', toggleTraction);

  // 键盘：W/S 牵引与制动级位、D/C 开关门、B 紧急制动、R 换向、空格惰行。
  // 焦点在表单控件上时不抢键，避免和滑杆 / 下拉冲突。
  // 点过任何按钮后主动 blur：否则焦点留在 <button> 上，下面 keydown 的排除规则
  // 会让 W/S/D/C/B/R 全部失效（实测点一次「牵引」后键盘就哑了）。
  document.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('button');
    if (btn) btn.blur();
  }, true);

  addEventListener('keydown', (e) => {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '')) return;
    const st = runtime.state;
    switch (e.code) {
      case 'Space': e.preventDefault(); toggleTraction(); break;
      case 'KeyW': case 'ArrowUp':
        e.preventDefault(); takeManual('手动牵引'); runtime.setThrottle(Math.min(1, st.throttle + 0.1)); syncDriveUi(); syncRunButton(); break;
      case 'KeyS': case 'ArrowDown':
        e.preventDefault(); takeManual('手动制动'); runtime.setBrake(Math.min(1, st.brake + 0.1)); syncDriveUi(); syncRunButton(); break;
      case 'KeyD': e.preventDefault(); requestDoors(true); break;
      case 'KeyC': e.preventDefault(); requestDoors(false); break;
      case 'KeyB':
        e.preventDefault(); takeManual('手动制动'); runtime.setEmergency(!st.emergency);
        notice(st.emergency ? '紧急制动缓解' : '紧急制动 · 1.6 m/s²');
        syncDriveUi(); syncRunButton(); break;
      case 'KeyR':
        e.preventDefault();
        if (st.velocity > 0.3) notice('请先停稳再逻辑掉头');
        else $('a-reverse').click();
        break;
      case 'KeyH':
        e.preventDefault();
        sound.resume();
        sound.horn();
        break;
      case 'KeyM':
        e.preventDefault();
        sound.setMuted(!sound.stats().muted);
        syncAudioUi();
        notice(sound.stats().muted ? '静音' : '声音已恢复');
        break;
      default: break;
    }
  });

  renderer.setAnimationLoop(() => {
    // 以前硬 clamp 到 0.05：一旦掉到 20 fps 以下，仿真时间就只有真实时间的
    // 几分之一，表现为「加速慢、画面一顿一顿」。放宽到 0.2 s（约 5 fps 仍实时），
    // 与 framework 的 dt 上限保持一致；450 m 的停车区间不会被单帧跨过。
    const dt = Math.min(clock.getDelta(), 0.2);
    elapsed += dt;
    runtime.update(dt);

    const st = runtime.state;
    // 出站后自动把进路收回正线，否则后续所有 chunk 都带着站台横移
    if (st.lane && typeof st.lane === 'object'
        && Math.abs(st.s - st.lane.s) > st.lane.flatHalf + st.lane.transition + 700) {
      runtime.setLane(LANE.MAIN);
      $('c-lane').value = 'main';
    }
    // 车门下拉只反映状态，绝不反向把玩家的手动请求改回「自动」
    if (st.doorRequest === true && $('c-doors').value !== 'open') $('c-doors').value = 'open';
    else if (st.doorRequest === false && $('c-doors').value === 'open') $('c-doors').value = 'close';
    syncDriveUi();

    // ---- 场景音效 ----
    // 距最近车站中心 620 m 内开始有人声；车门打开再加一层；司机视角整条总线低通。
    const hereChunk = runtime.chunks.find((c) => c.id === Math.floor(st.s / CHUNK.length));
    const nearZone = st.stopZone;
    const stationFactor = nearZone
      ? Math.max(0, 1 - Math.abs(st.s - nearZone.centerS) / 620)
      : 0;
    sound.update(dt, {
      velocity: st.velocity,
      throttle: st.running ? st.throttle : 0,
      brake: st.brake,
      emergency: st.emergency,
      view: S.view,
      theme: S.theme,
      stationFactor,
      kind: hereChunk?.kind ?? CHUNK_KIND.RURAL,
      doorsOpen: st.doorState.state === DOOR_STATE.OPEN,
      s: st.s,
      density: S.density,
      modelId: S.modelId,
      station: st.stopZone,
    });

    sky.position.copy(cam.position);
    if (sunSprite) sunSprite.position.copy(cam.position).add(sunOffset);
    renderer.render(scene, cam);

    // ---- HUD ----
    const kmh = st.velocity * 3.6;
    const km = st.s / 1000;
    $('kmh').textContent = kmh.toFixed(0);
    $('gauge-fill').style.width = `${Math.min(100, (kmh / MOTION.maxKmh) * 100)}%`;
    $('odo').textContent = `${km.toFixed(2)} km`;
    const cruise = Math.min(st.targetKmh, st.atpLimitKmh);
    const status = st.emergency ? '紧急制动'
      : st.brake > 0 ? '制动'
      : st.running ? (kmh < cruise - 1 ? '牵引' : '恒速')
      : kmh > 0.5 ? '惰行' : '停车';
    if ($('state').textContent !== status) {
      $('state').textContent = status;
      $('state').className = st.running ? 'run' : (st.brake > 0 || st.emergency) ? 'brake' : '';
    }
    $('atp-note').textContent = `ATP ${Math.round(st.atpLimitKmh)} · ${st.autoDrive ? 'ATO' : '手动'}`;
    const stopEl = $('stop-note');
    if (st.stopZone && st.doorsCanOpen) {
      const err = st.stopErrorM;
      const onMark = err !== null && Math.abs(err) <= 0.5;
      stopEl.textContent = `对标停车：${err === null ? '—' : `${err > 0 ? '+' : ''}${err.toFixed(2)} m`} · ${st.stopped ? (onMark ? '已停稳 · 可开门' : '已停稳 · 未对标') : '运行中'}`;
      stopEl.className = `hintline ${st.stopped ? (onMark ? 'is-good' : 'is-off') : ''}`;
    } else {
      stopEl.textContent = '对标停车：不在停车区间';
      stopEl.className = 'hintline';
    }
    syncRunButton();
    $('progress-fill').style.width = `${Math.min(100, (km / route.officialKm) * 100)}%`;
    $('progress-label').textContent = `${km.toFixed(1)} / ${route.officialKm.toFixed(1)} km · ${segmentLabel(route, km)}`;

    const dirSign = st.dir === DIRECTION.FORWARD ? 1 : -1;
    const nodes = route.nodes || [];
    const upcoming = dirSign > 0
      ? nodes.find((n) => n.km * 1000 > st.s)
      : [...nodes].reverse().find((n) => n.km * 1000 < st.s);
    $('sp-next').textContent = upcoming ? `${upcoming.name} · ${upcoming.km.toFixed(0)} km` : '终点';
    $('sp-chunks').textContent = `${chunkSys?.size?.() ?? 0} / ${st.ahead + CHUNK.behind + 1}`;

    const laneName = st.lane === LANE.MAIN ? '正线' : st.lane?.type === LANE.DEPOT ? '段管线' : '到发线';
    $('sp-dir').textContent = `${st.dir === DIRECTION.FORWARD ? '正向' : '反向'} · ${laneName}`;

    const a = runtime.alignment;
    const curv = a.curvatureAt(st.s);
    const grade = a.gradeAt(st.s);
    const radius = Math.abs(curv) > 1e-7 ? Math.round(1 / Math.abs(curv)) : 0;
    const curveTxt = radius ? `${curv > 0 ? '左' : '右'}曲线 R${radius} m` : '直线';
    const gradeTxt = `${(grade * 1000).toFixed(1)}‰`;
    $('sp-align').textContent = `${curveTxt} · ${gradeTxt} · 限速 ${Math.round(a.speedLimitAt(st.s))} km/h`;
    $('align-note').textContent = `${curveTxt} · ${gradeTxt} · 超高 ${(a.cantAt(st.s) * 180 / Math.PI).toFixed(1)}°`;

    const ev = st.stopEval;
    const zone = st.stopZone;
    $('sp-zone').textContent = zone
      ? `${zone.name} · ${zone.length.toFixed(0)} m · ${ev?.reason === 'OK' ? '全列在区间内' : '未对齐'}`
      : '—';
    const doorEl = $('door-note');
    const doorTxt = {
      [DOOR_STATE.OPEN]: '车门开启 · 上下客中',
      [DOOR_STATE.OPENING]: '车门开启中',
      [DOOR_STATE.CLOSING]: '车门关闭中',
      [DOOR_STATE.CLOSED]: st.doorsCanOpen
        ? (st.stopped ? '可开门 · 全列在区间内（按 D）' : '先停稳列车再开门')
        : '车门关闭 · 未在停车区间',
      [DOOR_STATE.BLOCKED]: '禁止开门 · 车门越出区间',
    }[st.doorState.state] ?? '车门关闭';
    doorEl.textContent = `${doorTxt}${ev?.doorMileages?.length ? ` · 余量 ${Math.max(0, Math.min(ev.frontMargin, ev.rearMargin)).toFixed(0)} m` : ''}${st.autoDrive && st.autoDepart && st.doorState.state === DOOR_STATE.OPEN ? ` · ${Math.max(0, Math.ceil((zone?.dwellSec ?? 30) - (st.doorState.dwell ?? 0)))} s 后自动发车` : ''}`;
    doorEl.className = st.doorState.state === DOOR_STATE.OPEN ? 'hintline is-open'
      : !st.doorsCanOpen ? 'hintline is-blocked' : 'hintline';

    if (passengerSys?.stats) {
      const p = passengerSys.stats();
      $('o-waiting').textContent = `${p.waiting ?? 0} 人`;
      $('o-onboard').textContent = `${p.onboard ?? 0} / ${p.capacity ?? 0}`;
      $('o-flow').textContent = `↓${p.alighted ?? 0} ↑${p.boarded ?? 0}`;
    }
    if (scheduleSys?.stats) {
      const t = scheduleSys.stats();
      $('o-service').textContent = t?.trainNo ?? '示意运行图';
      $('o-nextstop').textContent = t?.nextStop
        ? `${t.nextStop} · ${t.nextArrive ?? ''}` : '—';
    }

    const here = hereChunk;
    if (here && here.kind !== lastKind) {
      lastKind = here.kind;
      const label = {
        [CHUNK_KIND.HUB]: '进入站区', [CHUNK_KIND.DEPOT]: '经过车辆段',
        [CHUNK_KIND.URBAN]: '进入哈尔滨城区', [CHUNK_KIND.LANDMARK]: '经过标志建筑',
        [CHUNK_KIND.RURAL]: '驶入郊外 · 田野与湿地',
      }[here.kind];
      if (label) notice(label);
    }

    fpsAcc += dt; fpsFrames += 1;
    if (elapsed - statAt > 0.5) {
      statAt = elapsed;
      const i = renderer.info;
      const fps = fpsFrames / Math.max(0.001, fpsAcc);
      fpsAcc = 0; fpsFrames = 0;
      $('stat').textContent = `绘制 ${i.render.calls} · 三角面 ${i.render.triangles.toLocaleString('en-US')} · 纹理 ${i.memory.textures} · ${fps.toFixed(0)} fps`;
    }
  });

  addEventListener('resize', () => {
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * (QUALITY.find((q) => q.id === S.quality)?.ratio ?? 1));
    renderer.setSize(innerWidth, innerHeight);
    refreshShadows();
  });

  applyTheme(S.theme);
  applyView('hero');
  requestAnimationFrame(() => {
    refreshShadows();
    renderer.render(scene, cam);
    $('loader').classList.add('done');
    notice('真实铁路场景 · 曲线 / 坡度 / 双向 / 道岔 / 客流已就绪');
  });

  // ------------------------------------------------------- DEV 调试钩子 ---
  if (import.meta.env.DEV) {
    window.CNTHUB_JOURNEY = () => {
      const st = runtime.state;
      return {
        loaded: Boolean(train.group.parent),
        route: route.id,
        travel: st.s,
        km: st.s / 1000,
        kmh: st.velocity * 3.6,
        moving: st.running,
        throttle: st.throttle,
        brake: st.brake,
        emergency: st.emergency,
        autoDrive: st.autoDrive,
        stopped: st.stopped,
        stopErrorM: st.stopErrorM,
        atpLimitKmh: st.atpLimitKmh,
        chunks: chunkSys?.size?.() ?? 0,
        chunkKinds: runtime.chunks.map((c) => c.kind),
        model: S.modelId,
        formation: S.formation,
        trainLength: +train.total.toFixed(2),
        startKm: S.startKm,
        calls: renderer.info.render.calls,
        tris: renderer.info.render.triangles,
        textures: renderer.info.memory.textures,
        theme: S.theme,
        quality: S.quality,
        // v2 新增
        dir: st.dir,
        lane: st.lane?.type ?? st.lane,
        doors: st.doorState.state,
        doorsCanOpen: st.doorsCanOpen,
        stopZone: st.stopZone?.name ?? null,
        alignment: {
          curvature: +runtime.alignment.curvatureAt(st.s).toFixed(7),
          grade: +runtime.alignment.gradeAt(st.s).toFixed(5),
          cant: +runtime.alignment.cantAt(st.s).toFixed(4),
          yaw: +runtime.alignment.yawAt(st.s).toFixed(4),
        },
        camera: { mode: st.cameraMode, view: st.view, ...(camSys?.state ?? {}) },
        passengers: passengerSys?.stats?.() ?? null,
        schedule: scheduleSys?.stats?.() ?? null,
        station: stationSys?.state ?? null,
        audio: sound.stats(),
        params: { ...S, ...st },
      };
    };
    window.CNTHUB_JOURNEY.camera = cam;
    window.CNTHUB_JOURNEY.scene = scene;
    window.CNTHUB_JOURNEY.THREE = THREE;   // 仅 DEV：射线诊断 / 截图脚本用
    window.CNTHUB_JOURNEY.renderer = renderer;
    window.CNTHUB_JOURNEY.controls = camSys;
    window.CNTHUB_JOURNEY.runtime = runtime;
    window.CNTHUB_JOURNEY.sound = sound;
    window.CNTHUB_JOURNEY.api = {
      setTravel(m) { runtime.setTravel(m); },
      setRunning,
      setThrottle: (v) => runtime.setThrottle(v),
      setBrake: (v) => runtime.setBrake(v),
      setEmergency: (v) => runtime.setEmergency(v),
      setTargetKmh: (v) => runtime.setTargetKmh(v),
      setAutoDrive: (v) => runtime.setAutoDrive(v),
      requestDoors,
      applyView,
      applyTheme,
      applyQuality,
      reverse: () => runtime.reverse(),
      setDirection: (d) => runtime.setDirection(d),
      setLane: (v) => runtime.setLane(v),
      setCameraMode: (m) => { runtime.setCameraMode(m); camSys?.setMode?.(m); },
      setDoorRequest: (v) => runtime.setDoorRequest(v),
      setAutoDwell: (v) => runtime.setAutoDwell(v),
      get S() { return { ...S, ...runtime.state }; },
      routes: ROUTES,
      catalog: {
        stations: HARBIN_PACK.stationCatalog,
        buildings: HARBIN_PACK.buildingCatalog,
        layouts: HARBIN_PACK.stationLayouts,
      },
    };
  }
}

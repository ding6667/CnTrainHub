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
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -180, right: 180, top: 180, bottom: -180, near: 1, far: 620 });
  key.shadow.bias = -0.0007;
  key.shadow.normalBias = 0.04;
  key.target.position.set(0, 2, -40);
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x74b6ff, 1.6);
  scene.add(rim, rim.target);

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
      colors.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  };
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.frustumCulled = false;
  scene.add(sky);

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

  function rebuildTrain() {
    scene.remove(train.group);
    train.dispose();
    const cfg = trainConfig();
    train = buildTrain(cfg);
    scene.add(train.group);
    train.setWireframe(S.wire);
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
    ['c-accel', 'o-accel', 'accel', (v) => `${v.toFixed(0)} m/s²`],
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
      if (keyName === 'kmh') runtime.state.targetKmh = v;
      else if (keyName === 'accel') runtime.state.accel = v;
      else if (keyName === 'fov') {
        cam.fov = v; cam.updateProjectionMatrix(); camSys?.setFov?.(v);
      } else if (keyName === 'ahead') { runtime.setAhead(v); }
      else { runtime.state.density = S.density; chunkSys?.clear?.(); }
    });
  }
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
    const lane = isDepot ? alignment().depotLane(center) : alignment().stationLane(center, 1);
    runtime.setLane(lane);
    // 跳到进岔前，让 300 m 缓和段的横移能实际看见
    runtime.setTravel(center - lane.approach - 200);
    setRunning(true);
    notice(isDepot ? '经道岔进入段管线' : '经进站道岔转入到发线');
  });
  $('a-dwell').addEventListener('click', () => {
    const dir = runtime.state.dir;
    const nodes = (route.nodes || []).filter((n) => n.role === 'hub' || n.role === 'local');
    const target = dir === DIRECTION.FORWARD
      ? nodes.find((n) => n.km * 1000 > runtime.state.s + 400)
      : [...nodes].reverse().find((n) => n.km * 1000 < runtime.state.s - 400);
    if (!target) { notice('前方没有可停靠车站'); return; }
    const center = target.km * 1000;
    runtime.setLane(alignment().stationLane(center, 1));
    $('c-lane').value = 'station';
    runtime.setTravel(center + (dir === DIRECTION.FORWARD ? -320 : 320));
    runtime.setDoorRequest(null);
    setRunning(true);
    notice(`准备进站 · ${target.name}`);
  });
  $('c-doors').addEventListener('change', (e) => {
    const v = e.target.value;
    runtime.setDoorRequest(v === 'auto' ? null : v === 'open');
    notice(v === 'auto' ? '车门：自动控制' : v === 'open' ? '请求开门' : '请求关门');
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
  bus.on(EVENT.ROUTE_CHANGE, () => chunkSys?.clear?.());
  // 时刻表的「终到立折」由宿主执行：车体不旋转，只翻行驶方向（需求 1/4）
  bus.on(HARBIN_PACK.scheduleEvents?.REVERSE_REQUEST ?? 'timetable:reverse-request', (p) => {
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
    $('run-label').textContent = on ? '停止' : '前进';
  }
  runBtn.addEventListener('click', () => { setRunning(!runtime.state.running); syncRunButton(); });
  addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(document.activeElement?.tagName ?? '')) {
      e.preventDefault();
      setRunning(!runtime.state.running);
      syncRunButton();
    }
  });

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    runtime.update(dt);

    const st = runtime.state;
    // 出站后自动把进路收回正线，否则后续所有 chunk 都带着站台横移
    if (st.lane && typeof st.lane === 'object'
        && Math.abs(st.s - st.lane.s) > st.lane.flatHalf + st.lane.transition + 700) {
      runtime.setLane(LANE.MAIN);
      $('c-lane').value = 'main';
    }
    if (st.doorRequest === null && $('c-doors').value !== 'auto') $('c-doors').value = 'auto';

    sky.position.copy(cam.position);
    renderer.render(scene, cam);

    // ---- HUD ----
    const kmh = st.velocity * 3.6;
    const km = st.s / 1000;
    $('kmh').textContent = kmh.toFixed(0);
    $('gauge-fill').style.width = `${Math.min(100, (kmh / MOTION.maxKmh) * 100)}%`;
    $('odo').textContent = `${km.toFixed(2)} km`;
    const status = st.running ? (kmh < st.targetKmh - 1 ? '加速' : '运行') : kmh > 0.5 ? '制动' : '停车';
    if ($('state').textContent !== status) {
      $('state').textContent = status;
      $('state').className = st.running ? 'run' : kmh > 0.5 ? 'brake' : '';
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
      [DOOR_STATE.CLOSED]: st.doorsCanOpen ? '可开门 · 两端车门均在区间内' : '车门关闭 · 未在停车区间',
      [DOOR_STATE.BLOCKED]: '禁止开门 · 车门越出区间',
    }[st.doorState.state] ?? '车门关闭';
    doorEl.textContent = `${doorTxt}${ev?.doorMileages?.length ? ` · 余量 ${Math.max(0, Math.min(ev.frontMargin, ev.rearMargin)).toFixed(0)} m` : ''}`;
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

    const here = runtime.chunks.find((c) => c.id === Math.floor(st.s / CHUNK.length));
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
        params: { ...S, ...st },
      };
    };
    window.CNTHUB_JOURNEY.camera = cam;
    window.CNTHUB_JOURNEY.scene = scene;
    window.CNTHUB_JOURNEY.renderer = renderer;
    window.CNTHUB_JOURNEY.controls = camSys;
    window.CNTHUB_JOURNEY.runtime = runtime;
    window.CNTHUB_JOURNEY.api = {
      setTravel(m) { runtime.setTravel(m); },
      setRunning,
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

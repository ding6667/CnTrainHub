import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import '../detail.css';
import './style.css';
import {
  ORIGIN, geoToXY, CHUNK, CHUNK_KIND, CITY_RADIUS_M,
  QUALITY, BUDGET, CAMERA, THEMES, VIEWS, MOTION,
} from './config.js';
import { ROUTES, routeById, nodeAtKm } from './route-data.js';
import { visibleChunks, segmentLabel } from './stream.js';
import { STATION_CATALOG, buildStation, buildDepot, disposeStations } from './stations.js';
import { BUILDING_CATALOG, LANDMARK_IDS, createBuildingFactory } from './buildings.js';
import { buildTerrain } from './terrain.js';
import { makeEnvironment } from '../detail-scene.js';
import { buildTrain } from '../train-3d.js';
import MODELS from '../data.json';

/**
 * 哈尔滨线路漫游：把「真实里程」当成唯一的时钟。
 *
 * 大白话：列车自己不动，永远是车头朝 -Z 停在原点；世界按 travel（真实米数）
 * 往 +Z 滚过去。线路被切成 400 m 一块，只留列车前后十来块。
 * 某块该画站房、楼群还是田地，全由 stream.js 按 travel 算出来，
 * 出视野就摘掉 —— 所以几百公里的线路，内存里永远只有几公里。
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

// 稳定伪随机：同一块每次生成结果一致，不会随帧抖动
function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
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

  const S = {
    routeId: params.get('route') || ROUTES[0].id,
    modelId: params.get('model') || 'CR400BF-GZ',
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

  // ------------------------------------------------------------- sky dome ---
  const skyGeo = new THREE.SphereGeometry(3000, 32, 16);
  const skyColors = [];
  const skyPos = skyGeo.attributes.position;
  const cTop = new THREE.Color();
  const cMid = new THREE.Color();
  const cBot = new THREE.Color();
  const paintSky = (t) => {
    cTop.setHex(t.sky[0]); cMid.setHex(t.sky[1]); cBot.setHex(t.sky[2]);
    for (let i = 0; i < skyPos.count; i += 1) {
      const y = skyPos.getY(i) / 3000;
      const c = y > 0.08 ? cMid.clone().lerp(cTop, Math.min(1, (y - 0.08) / 0.7)) : cBot.clone().lerp(cMid, Math.min(1, (y + 0.5) / 0.58));
      skyColors.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
    skyColors.length = 0;
  };
  paintSky(theme);
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.frustumCulled = false;
  scene.add(sky);

  // --------------------------------------------------------------- track ---
  // 轨道不跟着 chunk 建：一条固定长条 + 按 travel % 间距滚动的枕木/接触网柱，
  // 一帧只改几个 Object3D.position，draw call 恒定。
  const track = new THREE.Group();
  track.name = 'track';
  scene.add(track);
  const TRACK_LEN = 4200;
  const ballast = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 0.36, TRACK_LEN),
    new THREE.MeshStandardMaterial({ color: 0x5a5f68, roughness: 0.95 }),
  );
  ballast.position.set(0, -0.5, -TRACK_LEN / 2 + 400);
  ballast.receiveShadow = true;
  track.add(ballast);
  const railMat = new THREE.MeshStandardMaterial({ color: 0xc2cad2, roughness: 0.3, metalness: 0.8 });
  for (const x of [-0.7175, 0.7175]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.17, TRACK_LEN), railMat);
    rail.position.set(x, 0.085, -TRACK_LEN / 2 + 400);
    track.add(rail);
  }
  const sleeperCount = 1700;
  const sleepers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.7, 0.16, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x4a453f, roughness: 0.9 }),
    sleeperCount,
  );
  {
    const m = new THREE.Matrix4();
    for (let i = 0; i < sleeperCount; i += 1) {
      m.makeTranslation(0, -0.24, -i * 0.62 + 200);
      sleepers.setMatrixAt(i, m);
    }
    sleepers.instanceMatrix.needsUpdate = true;
    sleepers.frustumCulled = false;
    sleepers.receiveShadow = true;
  }
  track.add(sleepers);
  // 接触网立柱：一根合并几何，用 InstancedMesh 重复
  const mastGeo = (() => {
    const post = new THREE.CylinderGeometry(0.14, 0.16, 8.4, 6);
    post.translate(0, 3.4, 0);
    const arm = new THREE.BoxGeometry(3.4, 0.12, 0.12);
    arm.translate(1.6, 7.0, 0);
    const parts = [post, arm];
    const merged = mergeGeometries(parts);
    parts.forEach((p) => p.dispose());
    return merged;
  })();
  const mastCount = 60;
  const masts = new THREE.InstancedMesh(
    mastGeo,
    new THREE.MeshStandardMaterial({ color: 0x6b727a, roughness: 0.7, metalness: 0.4 }),
    mastCount,
  );
  {
    const m = new THREE.Matrix4();
    for (let i = 0; i < mastCount; i += 1) {
      m.makeTranslation(-3.15, -0.68, -i * 20 + 200);
      masts.setMatrixAt(i, m);
    }
    masts.instanceMatrix.needsUpdate = true;
    masts.frustumCulled = false;
  }
  track.add(masts);
  // 接触线 / 承力索
  const wireMat = new THREE.LineBasicMaterial({ color: 0x545b62, transparent: true, opacity: 0.85 });
  for (const y of [5.4, 6.62]) {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, y, 400), new THREE.Vector3(0, y, -TRACK_LEN + 400),
    ]);
    track.add(new THREE.Line(g, wireMat));
  }

  // -------------------------------------------------------------- actors ---
  const train = buildTrain(MODELS[S.modelId] ?? MODELS['CR400BF-GZ']);
  scene.add(train.group);

  const terrain = buildTerrain(theme);
  scene.add(terrain.group);
  // terrain 内部已含互斥的「市区真实底图」与「郊外重复块」，不要再单独 add 一份底图；
  // 这里只取出底图节点，让它按真实里程整体往车后走（列车固定在原点，世界滚动）。
  const cityBase = terrain.group.getObjectByName('harbin-base');
  const factory = createBuildingFactory();

  // ------------------------------------------------------------- chunks ---
  /** id → { group, kind }；只有 [当前块-2, 当前块+ahead] 会留在场景里 */
  const alive = new Map();

  function releaseChunk(g) {
    // 子模块内部缓存的几何/材质是共享的，不能在这里 dispose；
    // 只释放 InstancedMesh 自己的实例缓冲，避免每次流式加载泄漏 GPU buffer。
    g.traverse((o) => {
      if (o.isInstancedMesh && typeof o.dispose === 'function') o.dispose();
    });
  }

  /** 子模块可能用 id，也可能直接用中文站名/地标名，这里做一次模糊匹配兜底。 */
  function resolveId(catalog, raw) {
    if (!raw) return null;
    const s = String(raw);
    const list = catalog || [];
    const hit = list.find((x) => x.id === s)
      || list.find((x) => x.name === s)
      || list.find((x) => s.includes(x.name) || x.name.includes(s))
      || list.find((x) => (x.id && s.includes(String(x.id))));
    return hit ? hit.id : null;
  }

  function stationIdFor(c) {
    const node = (c.nodes || []).find((x) => x.role === 'hub' || x.role === 'local');
    const raw = c.stationId || node?.stationId || node?.name;
    // 关键：catalog 外的 51 个沿线站不能再兜底成「哈尔滨站」，否则跑到大连北、
    // 满洲里都会错显哈站。把中文站名/电报码原样交给 stations.js 的通用中小站模板。
    return resolveId(STATION_CATALOG, raw) ?? node?.name ?? (typeof raw === 'string' ? raw : null) ?? '哈尔滨';
  }

  function landmarkIdsFor(c) {
    const raw = c.landmarkIds && c.landmarkIds.length ? c.landmarkIds : [LANDMARK_IDS?.[0]].filter(Boolean);
    // route 层的 saint-sophia 等别名由 buildings.js 内部归一化，没命中的原样传下去。
    return raw.map((x) => resolveId(BUILDING_CATALOG, x) ?? x).filter(Boolean);
  }

  function depotKindFor(c) {
    const s = String(c.depot || '');
    if (s.includes('动车')) return 'emu';
    if (s.includes('机务') || s.includes('机车')) return 'loco';
    if (s.includes('车辆')) return 'coach';
    return s || 'emu';
  }

  function buildChunk(c) {
    const g = new THREE.Group();
    g.name = `chunk-${c.id}`;
    g.userData.kind = c.kind;
    const r = rng((c.id * 2654435761) ^ route.id.length * 40503);
    const night = S.theme === 'night';

    /** 3 类楼各一个 InstancedMesh，一个块最多 3 次 draw call。 */
    /** 一块只放 1 类楼 = 1 个 InstancedMesh = 1 次 draw call。 */
    function addBuildings(factor) {
      const cats = ['residential', 'office', 'commercial'];
      const cat = cats[Math.abs(c.id) % cats.length];
      const types = (BUILDING_CATALOG || []).filter((b) => b.category === cat);
      if (!types.length) return;
      const type = types[Math.floor(r() * types.length) % types.length];
      const n = Math.max(0, Math.round(9 * S.density * factor));
      if (!n) return;
      const specs = [];
      for (let i = 0; i < n; i += 1) {
        const side = i % 2 ? 1 : -1;
        specs.push({
          x: side * (38 + Math.abs(c.id % 3) * 44 + r() * 24),
          z: -((i + 0.5) / n) * CHUNK.length,
          rotY: r() < 0.25 ? Math.PI / 2 : 0,
          scale: 0.78 + r() * 0.55,
          tint: 0.86 + r() * 0.28,
        });
      }
      const mesh = factory.instanced(type.id, specs, { night, seed: c.seed });
      if (mesh) g.add(mesh);
    }

    if (c.kind === CHUNK_KIND.HUB && S.stations && c.primary) {
      const st = buildStation(stationIdFor(c), { theme: S.theme, quality: S.quality, night });
      if (st) {
        // 站房原型是跨线高架候车室；若把原点压在正线中心，13 m 高的英雄机位
        // 会直接钻进屋顶里。示意级场景改成「线侧站房」：往侧方挪开并略缩小，
        // 股道不必严格对齐，但镜头不会穿模。
        st.position.set(-30, 0, -CHUNK.length / 2);
        st.scale.setScalar(0.88);
        g.add(st);
        // 枢纽站周边带一排街坊，否则「哈尔滨站」孤零零立在空地上
        if (S.buildings) addBuildings(0.6);
      }
    } else if (c.kind === CHUNK_KIND.DEPOT && S.stations && c.primary) {
      const d = buildDepot(depotKindFor(c), { theme: S.theme, night });
      if (d) {
        // 检修库是 160 m 长的大跨度屋面，别摆在英雄机位（x≈34）正上方
        d.position.set(-78, 0, -CHUNK.length / 2);
        d.scale.setScalar(0.85);
        g.add(d);
      }
    } else if (c.kind === CHUNK_KIND.LANDMARK && S.buildings && c.primary) {
      const ids = landmarkIdsFor(c).slice(0, 2);
      ids.forEach((id, i) => {
        const lm = factory.make(id, { night, seed: c.seed + i });
        if (lm) {
          lm.position.set((i % 2 ? 1 : -1) * (70 + r() * 40), 0, -120 - i * 170);
          g.add(lm);
        }
      });
    }

    // 每个城区块 1 类楼；不进 chunk 触发表的 4 个城市地标每 3 块轮换摆一个，
    // 避免十块窗口里塞进几十个 mesh 把 draw call 顶爆。
    if (S.buildings && c.kind === CHUNK_KIND.URBAN) {
      addBuildings(1);
      if (Math.abs(c.id) % 3 === 0) {
        const EXTRA = ['lm-dragon-tower', 'lm-grand-theatre', 'lm-sun-island', 'lm-ice-world'];
        // c.id 可能为负（起点后方窗口），取绝对值再取模
        const extra = EXTRA[Math.abs(c.id) % EXTRA.length];
        const landmark = factory.make(extra, { night, seed: c.seed });
        if (landmark) {
          const north = extra !== 'lm-dragon-tower';
          landmark.position.set((north ? -1 : 1) * (95 + r() * 35), 0, -160 - r() * 140);
          g.add(landmark);
        }
      }
    }
    // RURAL 不建任何东西：郊外由 terrain 的重复田地/河流/草地全局覆盖
    return g;
  }

  function syncChunks(travel) {
    const raw = visibleChunks(route, travel, S.ahead, CHUNK.behind);
    // 站区触发窗口有 1200 m，会连着 5~6 块都标成同一个站 / 段 / 地标。
    // 同一标识只建一次实体（否则一座哈尔滨站被复制好几遍、draw call 翻倍），
    // 而且要挑「离列车最近」的那一块 —— 若挑窗口最前一块，实体会落在车后 800 m，
    // 起点就什么都看不到。
    const chunkKey = (c) => c.stationId || c.depot || (c.landmarkIds || []).join(',') || `k${c.id}`;
    const best = new Map();
    for (const c of raw) {
      if (c.kind !== CHUNK_KIND.HUB && c.kind !== CHUNK_KIND.DEPOT && c.kind !== CHUNK_KIND.LANDMARK) continue;
      const centerM = c.km * 1000 + CHUNK.length / 2;
      const d = Math.abs(centerM - travel);
      const key = chunkKey(c);
      if (!best.has(key) || d < best.get(key).d) best.set(key, { id: c.id, d });
    }
    const list = raw.map((c) => ({
      ...c,
      primary: best.has(chunkKey(c)) && best.get(chunkKey(c)).id === c.id,
    }));
    const want = new Set(list.map((c) => c.id));
    for (const [id, entry] of alive) {
      if (!want.has(id)) {
        scene.remove(entry.group);
        releaseChunk(entry.group);
        alive.delete(id);
      }
    }
    for (const c of list) {
      const sig = `${c.kind}:${c.primary ? 1 : 0}`;
      let entry = alive.get(c.id);
      if (!entry || entry.sig !== sig) {
        if (entry) {
          scene.remove(entry.group);
          releaseChunk(entry.group);
        }
        const group = buildChunk(c);
        alive.set(c.id, { group, sig, kind: c.kind });
        scene.add(group);
        entry = alive.get(c.id);
      }
      // 真实里程 → 世界 z：s > travel 在前方（-Z），s = travel 正好在列车处
      entry.group.position.z = travel - c.id * CHUNK.length;
    }
    return list;
  }

  function clearChunks() {
    for (const [, entry] of alive) {
      scene.remove(entry.group);
      releaseChunk(entry.group);
    }
    alive.clear();
  }

  // -------------------------------------------------------------- camera ---
  const cam = new THREE.PerspectiveCamera(S.fov, innerWidth / innerHeight, CAMERA.near, CAMERA.far);
  const controls = new OrbitControls(cam, renderer.domElement);
  controls.enablePan = false;
  controls.minDistance = CAMERA.minDistance;
  controls.maxDistance = CAMERA.maxDistance;
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.62;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
  let focusZ = 0;

  function applyView(id) {
    const v = VIEWS.find((x) => x.id === id) ?? VIEWS[0];
    S.view = v.id;
    focusZ = v.aim ?? 0;
    controls.target.set(0, CAMERA.focusY, focusZ);
    cam.position.set(v.offset[0], v.offset[1], v.offset[2]);
    cam.lookAt(controls.target);
    controls.update();
    $('c-view').value = v.id;
  }
  applyView('hero');

  // ------------------------------------------------------------- themes ---
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
    if (terrain.applyTheme) terrain.applyTheme(theme);
    if (factory.applyTheme) factory.applyTheme(theme);
    else if (factory.setNight) factory.setNight(id === 'night');
    train.materials.glass.emissiveIntensity = id === 'night' ? 0.07 : id === 'dusk' ? 0.04 : 0.01;
    renderer.shadowMap.needsUpdate = true;
    // 主题变了，已建块里的亮窗/雪色要重建
    clearChunks();
  }
  applyTheme(S.theme);

  function applyQuality(id) {
    S.quality = id;
    const q = QUALITY.find((x) => x.id === id) ?? QUALITY[1];
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * q.ratio);
    renderer.setSize(innerWidth, innerHeight);
    key.shadow.mapSize.set(q.shadow, q.shadow);
    key.shadow.map?.dispose();
    key.shadow.map = null;
    renderer.shadowMap.needsUpdate = true;
  }

  // ----------------------------------------------------------------- ui ---
  const routeSel = $('route-select');
  for (const r of ROUTES) {
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = `${r.name} · ${r.officialKm} km`;
    routeSel.appendChild(o);
  }
  routeSel.value = S.routeId;
  const viewSel = $('c-view');
  for (const v of VIEWS) {
    const o = document.createElement('option');
    o.value = v.id;
    o.textContent = v.label;
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
    // 滑杆是 0–100 的百分数，内部 S.density 是 0–1，别把 0.75 直接塞给 range
    el.value = String(keyName === 'density' ? S.density * 100 : S[keyName]);
    $(outId).textContent = fmt(Number(el.value));
    el.addEventListener('input', () => {
      const v = Number(el.value);
      S[keyName] = keyName === 'density' ? v / 100 : v;
      $(outId).textContent = fmt(v);
      if (keyName === 'fov') {
        cam.fov = v;
        cam.updateProjectionMatrix();
      } else if (keyName === 'density' || keyName === 'ahead') {
        clearChunks();
      }
    });
  }
  for (const [id, key] of [['c-follow', 'follow'], ['c-buildings', 'buildings'], ['c-stations', 'stations'], ['c-rural', 'rural'], ['c-wire', 'wire']]) {
    const el = $(id);
    el.checked = Boolean(S[key]);
    el.addEventListener('change', () => {
      S[key] = el.checked;
      if (key === 'wire') {
        train.setWireframe(el.checked);
        renderer.shadowMap.needsUpdate = true;
      } else {
        if (key === 'rural') terrain.setVisible?.('rural', el.checked);
        clearChunks();
      }
    });
  }
  $('c-theme').value = S.theme;
  $('c-theme').addEventListener('change', (e) => { applyTheme(e.target.value); syncAll(); });
  $('c-quality').value = S.quality;
  $('c-quality').addEventListener('change', (e) => applyQuality(e.target.value));
  viewSel.addEventListener('change', (e) => applyView(e.target.value));
  routeSel.addEventListener('change', (e) => {
    route = routeById(e.target.value) ?? ROUTES[0];
    S.routeId = route.id;
    travel = 0;
    velocity = 0;
    clearChunks();
    $('sp-route').textContent = route.name;
    $('sp-km').textContent = `${route.officialKm} km`;
    notice(`切换线路 · ${route.name}`);
  });
  $('a-reset').addEventListener('click', () => {
    travel = 0; velocity = 0; running = false;
    applyView('hero');
    applyTheme('day'); S.theme = 'day'; syncAll();
    clearChunks();
    notice('已回到起点 · 哈尔滨');
  });
  $('a-export').addEventListener('click', () => {
    renderer.render(scene, cam);
    const a = document.createElement('a');
    a.href = renderer.domElement.toDataURL('image/png');
    a.download = `harbin-${route.id}-${travel.toFixed(0)}m.png`;
    a.click();
  });
  function syncAll() {
    for (const [inputId, outId, keyName, fmt] of RANGES) {
      const v = keyName === 'density' ? S.density * 100 : S[keyName];
      $(inputId).value = String(v);
      $(outId).textContent = fmt(v);
    }
    for (const [id, key] of [['c-follow', 'follow'], ['c-buildings', 'buildings'], ['c-stations', 'stations'], ['c-rural', 'rural'], ['c-wire', 'wire']]) $(id).checked = Boolean(S[key]);
    $('c-theme').value = S.theme;
    $('c-quality').value = S.quality;
    viewSel.value = S.view;
  }

  let noticeTimer = 0;
  function notice(msg) {
    const el = $('notice');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => el.classList.remove('on'), 2200);
  }

  // --------------------------------------------------------------- loop ---
  const clock = new THREE.Clock();
  let travel = 0; // 真实累计里程（米）
  let velocity = 0;
  let running = false;
  let elapsed = 0;
  let statAt = 0;
  let fpsAcc = 0;
  let fpsFrames = 0;
  let lastKind = '';
  let lastStation = '';

  const runBtn = $('run');
  function setRunning(on) {
    running = on;
    runBtn.classList.toggle('is-on', on);
    $('run-label').textContent = on ? '停止' : '前进';
  }
  runBtn.addEventListener('click', () => setRunning(!running));
  addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(document.activeElement?.tagName ?? '')) {
      e.preventDefault();
      setRunning(!running);
    }
  });

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    const target = running ? Math.min(MOTION.maxKmh, S.kmh) / 3.6 : 0;
    if (velocity < target) velocity = Math.min(velocity + S.accel * dt, target);
    else velocity = Math.max(velocity - MOTION.deceleration * dt, target);
    travel += velocity * dt;

    // 世界滚动：枕木 0.62 m 一循环、接触网柱 20 m 一循环，只改两个 position
    sleepers.position.z = travel % 0.62;
    masts.position.z = travel % 20;
    if (terrain.scroll) terrain.scroll(travel);
    // 市区真实底图以哈尔滨站为原点，随里程整体往车后走；跑出市区就切成郊外重复块
    if (cityBase) cityBase.position.z = travel;
    const inCity = travel < CITY_RADIUS_M * 1.2 && S.buildings;
    if (inCity) terrain.setVisible?.('urban', true);
    else terrain.setVisible?.('rural', S.rural);

    const list = syncChunks(travel);
    const here = list.find((c) => c.id === Math.floor(travel / CHUNK.length));
    if (here && here.kind !== lastKind) {
      lastKind = here.kind;
      const label = { hub: '进入站区', depot: '经过车辆段', urban: '进入哈尔滨城区', landmark: '经过标志建筑', rural: '驶入郊外 · 田野与湿地' }[here.kind];
      if (label) notice(label);
    }
    const nodes = route.nodes || [];
    const upcoming = nodes.find((n) => n.km * 1000 > travel);
    if (upcoming && upcoming.name !== lastStation && upcoming.km * 1000 - travel < 3000) {
      lastStation = upcoming.name;
      notice(`前方 ${upcoming.name} · ${((upcoming.km * 1000 - travel) / 1000).toFixed(1)} km`);
    }

    if (S.follow) {
      controls.target.z += (focusZ - controls.target.z) * 0.08;
      controls.update();
    }
    sky.position.copy(cam.position);
    renderer.render(scene, cam);

    // HUD
    const kmh = velocity * 3.6;
    $('kmh').textContent = kmh.toFixed(0);
    $('gauge-fill').style.width = `${Math.min(100, (kmh / MOTION.maxKmh) * 100)}%`;
    $('odo').textContent = `${(travel / 1000).toFixed(2)} km`;
    const st = running ? (kmh < S.kmh - 1 ? '加速' : '运行') : kmh > 0.5 ? '制动' : '停车';
    if ($('state').textContent !== st) {
      $('state').textContent = st;
      $('state').className = running ? 'run' : kmh > 0.5 ? 'brake' : '';
    }
    const km = travel / 1000;
    $('progress-fill').style.width = `${Math.min(100, (km / route.officialKm) * 100)}%`;
    $('progress-label').textContent = `${km.toFixed(1)} / ${route.officialKm.toFixed(1)} km · ${segmentLabel(route, km)}`;
    $('sp-next').textContent = upcoming ? `${upcoming.name} · ${upcoming.km.toFixed(0)} km` : '终点';
    $('sp-chunks').textContent = `${alive.size} / ${S.ahead + CHUNK.behind + 1}`;

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
    renderer.shadowMap.needsUpdate = true;
  });

  requestAnimationFrame(() => {
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, cam);
    $('loader').classList.add('done');
    notice('哈尔滨 · 从哈尔滨站出发');
  });

  if (import.meta.env.DEV) {
    window.CNTHUB_JOURNEY = () => ({
      loaded: Boolean(train.group.parent),
      route: route.id,
      travel,
      km: travel / 1000,
      kmh: velocity * 3.6,
      moving: running,
      chunks: alive.size,
      chunkKinds: [...alive.values()].map((x) => x.kind),
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      textures: renderer.info.memory.textures,
      theme: S.theme,
      quality: S.quality,
      params: { ...S },
    });
    window.CNTHUB_JOURNEY.camera = cam;
    window.CNTHUB_JOURNEY.scene = scene;
    window.CNTHUB_JOURNEY.renderer = renderer;
    window.CNTHUB_JOURNEY.controls = controls;
    window.CNTHUB_JOURNEY.api = {
      setTravel(m) { travel = m; clearChunks(); },
      setRunning,
      applyView,
      applyTheme,
      applyQuality,
      get S() { return S; },
      routes: ROUTES,
      catalog: { stations: STATION_CATALOG, buildings: BUILDING_CATALOG },
    };
  }

  void geoToXY; void ORIGIN; void nodeAtKm; void disposeStations;
}

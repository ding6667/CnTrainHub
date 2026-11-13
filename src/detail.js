import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import MODELS from './data.json';
import { MOTION, CAMERA, VIEWS, THEMES, QUALITY } from './detail-config.js';
import { buildTrain } from './train-3d.js';
import { buildEnvironment, makeEnvironment } from './detail-scene.js';
import { createAudio } from './detail-audio.js';
import { bindUI } from './detail-ui.js';
import './detail.css';

const params = new URLSearchParams(location.search);
const modelId = params.get('model') || 'CR400BF-GZ';
const cfg = MODELS[modelId];
const canvas = document.getElementById('stage');
const available = Object.values(MODELS).filter((m) => m.model);

function bail(title, msg) {
  document.getElementById('loader').classList.add('done');
  document.getElementById('fallback-title').textContent = title;
  document.getElementById('fallback-msg').textContent = msg;
  const list = document.getElementById('fallback-list');
  list.innerHTML = '';
  for (const m of available) {
    const a = document.createElement('a');
    a.href = `./detail.html?model=${encodeURIComponent(m.name)}`;
    a.textContent = m.name;
    list.appendChild(a);
  }
  document.getElementById('fallback').hidden = false;
  for (const id of ['dock', 'console', 'specs', 'hint', 'topright']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
  canvas.style.display = 'none';
}

if (!cfg) {
  bail('未收录该车型', `配置里没有「${modelId}」。下面是已经做好 3D 展示的车型，点一个继续。`);
} else if (!cfg.model) {
  bail('模型尚未制作', `「${cfg.name}」的 3D 模型尚未制作。下面是已经做好的车型。`);
} else {
  try {
    boot(cfg);
  } catch (err) {
    bail('场景构建失败', `${err?.message ?? err}`);
    throw err;
  }
}

function boot(cfg) {
  document.title = `${cfg.name} · 3D 展示 · CnTrainHub`;
  document.getElementById('hud-name').textContent = cfg.name;
  document.getElementById('hud-sub').textContent = `${cfg.railway} · ${cfg.title}`;
  document.getElementById('livery-tag').textContent = cfg.liveryName ?? '龙凤呈祥';
  document.getElementById('sp-cars').textContent = `${cfg.formation} 辆`;
  document.getElementById('sp-len').textContent = `${cfg.set.setLength.toFixed(2)} m`;
  document.getElementById('sp-speed').textContent = `${cfg.maxSpeed} km/h`;

  // ------------------------------------------------------------ renderer ---
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x121d2b, 0.0062);

  const hemi = new THREE.HemisphereLight(0x3d5a80, 0x141a22, 0.55);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffd2a1, 2.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -132, right: 132, top: 132, bottom: -132, near: 1, far: 520 });
  key.shadow.bias = -0.0007;
  key.shadow.normalBias = 0.035;
  key.target.position.set(0, 2, 0);
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight(0x74b6ff, 2.1);
  scene.add(rim, rim.target);

  // --------------------------------------------------------------- state ---
  const defaults = {
    kmh: MOTION.defaultKmh,
    accel: MOTION.acceleration,
    view: 'hero',
    azim: 132,
    dist: 42,
    height: 9.5,
    fov: CAMERA.fov,
    auto: false,
    theme: 'day',
    key: THEMES.day.key.intensity,
    keydir: Math.round((THEMES.day.key.azimuth * 180) / Math.PI),
    rim: THEMES.day.rim.intensity,
    snow: THEMES.day.snow * 100,
    fog: THEMES.day.fogDensity * 1000,
    exposure: THEMES.day.exposure,
    panto: true,
    lamps: true,
    catenary: true,
    slab: true,
    trees: true,
    wire: false,
    quality: 'mid',
    car: 0,
  };
  const S = { ...defaults };

  const quality = QUALITY.find((q) => q.id === S.quality);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * quality.ratio);
  renderer.toneMappingExposure = S.exposure;

  let theme = THEMES[S.theme];
  let envRT = makeEnvironment(renderer, theme);
  scene.environment = envRT.texture;

  const env = buildEnvironment(scene, renderer, theme, S.quality);
  const train = buildTrain(cfg);
  scene.add(train.group);

  // 车灯光晕 + 落在雪面上的光池（复用同一张软圆贴图，不额外增加纹理）
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(train.lampPositions, 3));
  glowGeo.setAttribute('color', new THREE.Float32BufferAttribute(train.lampColors, 3));
  const glow = new THREE.Points(
    glowGeo,
    new THREE.PointsMaterial({ size: 0.85, map: env.sprite, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
  );
  glow.frustumCulled = false;
  scene.add(glow);

  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: env.sprite, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe6bd, fog: true }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.scale.set(13, 30, 1);
  pool.position.set(0, 0.03, -train.total / 2 - 12);
  scene.add(pool);

  // -------------------------------------------------------------- camera ---
  const carCenters = [];
  {
    const headLen = cfg.set.headLength;
    const midLen = cfg.set.middleLength;
    const gap = cfg.set.gap;
    let front = -train.total / 2;
    for (let i = 0; i < cfg.formation; i += 1) {
      const len = i === 0 || i === cfg.formation - 1 ? headLen : midLen;
      carCenters.push(front + len / 2);
      front += len + gap;
    }
  }

  const focus = new THREE.Vector3(0, CAMERA.focusY, carCenters[0]);
  const focusGoal = focus.clone();
  const cam = new THREE.PerspectiveCamera(S.fov, window.innerWidth / window.innerHeight, CAMERA.near, CAMERA.far);
  const controls = new OrbitControls(cam, renderer.domElement);
  controls.enablePan = false;
  controls.minDistance = CAMERA.minDistance;
  controls.maxDistance = CAMERA.maxDistance;
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.62;
  controls.zoomSpeed = 0.85;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.target.copy(focus);

  const offset = new THREE.Vector3();
  const tween = { active: false, t: 0, dur: 0.85, from: new THREE.Vector3(), to: new THREE.Vector3() };
  let dragging = false;
  controls.addEventListener('start', () => {
    dragging = true;
    tween.active = false;
  });
  controls.addEventListener('end', () => {
    dragging = false;
    syncFromCamera();
  });

  function placeCamera(azimDeg, dist, height) {
    const dy = height - focus.y;
    const r = Math.sqrt(Math.max(4, dist * dist - dy * dy));
    const a = (azimDeg * Math.PI) / 180;
    cam.position.set(focus.x + r * Math.sin(a), height, focus.z + r * Math.cos(a));
    cam.lookAt(focus);
  }

  function syncFromCamera() {
    offset.subVectors(cam.position, controls.target);
    const d = offset.length();
    S.dist = Math.round(d);
    S.height = Math.round(cam.position.y * 10) / 10;
    S.azim = Math.round((Math.atan2(offset.x, offset.z) * 180) / Math.PI);
    ui.syncCamera();
  }

  function tweenTo(x, y, z) {
    tween.from.copy(cam.position);
    tween.to.set(x, y, z);
    tween.t = 0;
    tween.active = true;
  }

  function applyView(id, animate = true) {
    const v = VIEWS.find((x) => x.id === id) ?? VIEWS[0];
    S.view = v.id;
    const base = v.focus === 'set' ? 0 : carCenters[S.car];
    focusGoal.set(0, CAMERA.focusY, base);
    if (animate) {
      const dy = v.offset[1] - CAMERA.focusY;
      const r = Math.sqrt(Math.max(4, (v.offset[0] ** 2 + v.offset[2] ** 2)));
      const a = Math.atan2(v.offset[0], v.offset[2]);
      tweenTo(focusGoal.x + r * Math.sin(a), v.offset[1], focusGoal.z + r * Math.cos(a));
      S.dist = Math.round(Math.sqrt(r * r + dy * dy));
      S.height = v.offset[1];
      S.azim = Math.round((a * 180) / Math.PI);
      ui.syncCamera();
    } else {
      focus.copy(focusGoal);
      controls.target.copy(focus);
      placeCamera(S.azim, S.dist, S.height);
    }
  }

  function focusCar(i) {
    S.car = Math.max(0, Math.min(cfg.formation - 1, i));
    focusGoal.set(0, CAMERA.focusY, carCenters[S.car]);
    offset.subVectors(cam.position, controls.target);
    tweenTo(focusGoal.x + offset.x, focusGoal.y + offset.y, focusGoal.z + offset.z);
    ui.syncConsist();
  }

  // ------------------------------------------------------------- lighting ---
  function placeLights() {
    const t = theme;
    const ka = (S.keydir * Math.PI) / 180;
    const ke = t.key.elevation;
    const kr = 150;
    key.position.set(Math.sin(ka) * kr * Math.cos(ke), Math.sin(ke) * kr + 12, Math.cos(ka) * kr * Math.cos(ke));
    key.intensity = S.key;
    key.color.setHex(t.key.color);
    const ra = t.rim.azimuth;
    const re = t.rim.elevation;
    rim.position.set(Math.sin(ra) * 120 * Math.cos(re), Math.sin(re) * 120 + 8, Math.cos(ra) * 120 * Math.cos(re));
    rim.intensity = S.rim;
    rim.color.setHex(t.rim.color);
    hemi.color.setHex(t.hemi.sky);
    hemi.groundColor.setHex(t.hemi.ground);
    hemi.intensity = t.hemi.intensity;
    renderer.shadowMap.needsUpdate = true;
  }

  function applyTheme(id) {
    S.theme = id;
    theme = THEMES[id];
    S.key = theme.key.intensity;
    S.keydir = Math.round((theme.key.azimuth * 180) / Math.PI);
    S.rim = theme.rim.intensity;
    S.snow = theme.snow * 100;
    S.fog = theme.fogDensity * 1000;
    S.exposure = theme.exposure;
    S.lamps = theme.lamps;
    env.applyTheme(theme);
    const old = envRT;
    envRT = makeEnvironment(renderer, theme);
    scene.environment = envRT.texture;
    old.dispose();
    scene.environmentIntensity = theme.envIntensity;
    renderer.toneMappingExposure = S.exposure;
    placeLights();
    applyLamps();
    train.materials.glass.emissiveIntensity = theme.windowGlow;
    ui.syncAll();
  }

  function applyLamps() {
    const on = S.lamps;
    train.meshes.lampF.visible = on;
    train.meshes.lampR.visible = on;
    glow.visible = on;
    pool.visible = on && S.theme !== 'studio';
    train.materials.lampF.color.setHex(on ? 0xfff2d2 : 0x3a3a3a);
    train.materials.lampR.color.setHex(on ? 0xff2a2a : 0x3a1414);
  }

  function applyQuality(id) {
    S.quality = id;
    const q = QUALITY.find((x) => x.id === id);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * q.ratio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    key.shadow.mapSize.set(q.shadow, q.shadow);
    key.shadow.map?.dispose();
    key.shadow.map = null;
    renderer.shadowMap.needsUpdate = true;
    env.setQuality(id);
  }

  placeLights();
  applyLamps();
  train.materials.glass.emissiveIntensity = theme.windowGlow;
  scene.environmentIntensity = theme.envIntensity;
  env.setSnow(S.snow / 100);
  applyView('hero', false);
  cam.fov = effectiveFov();
  cam.updateProjectionMatrix();
  controls.update();

  // ---------------------------------------------------------------- audio ---
  const audio = createAudio();
  const soundBtn = document.getElementById('sound');
  if (!audio.supported) {
    soundBtn.style.display = 'none';
  } else {
    soundBtn.addEventListener('click', () => {
      const muted = audio.toggle();
      soundBtn.setAttribute('aria-pressed', String(!muted));
      document.getElementById('sound-label').textContent = muted ? '已静音' : '环境音';
    });
    const wake = () => audio.resume();
    window.addEventListener('pointerdown', wake, { once: true });
    window.addEventListener('keydown', wake, { once: true });
  }

  // ----------------------------------------------------------------- loop ---
  const clock = new THREE.Clock();
  let velocity = 0;
  let travel = 0;
  let running = false;
  let elapsed = 0;
  let statAt = 0;
  let fpsAcc = 0;
  let fpsFrames = 0;
  let fps = 0;

  const runBtn = document.getElementById('run');
  const runLabel = document.getElementById('run-label');
  const kmhEl = document.getElementById('kmh');
  const odoEl = document.getElementById('odo');
  const stateEl = document.getElementById('state');
  const fillEl = document.getElementById('gauge-fill');
  const statEl = document.getElementById('stat');

  function setRunning(on) {
    running = on;
    runBtn.classList.toggle('is-on', on);
    runLabel.textContent = on ? '停止' : '前进';
    if (on) audio.resume();
  }
  runBtn.addEventListener('click', () => setRunning(!running));
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(document.activeElement?.tagName ?? '')) {
      e.preventDefault();
      setRunning(!running);
    }
  });

  const smoothstep = (t) => t * t * (3 - 2 * t);

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;

    const target = running ? S.kmh / 3.6 : 0;
    if (velocity < target) velocity = Math.min(velocity + S.accel * dt, target);
    else velocity = Math.max(velocity - MOTION.deceleration * dt, target);
    travel += velocity * dt;

    env.scroll(travel);
    env.update(dt, velocity, controls.target, elapsed);

    if (S.auto && !dragging && !tween.active) {
      S.azim = ((S.azim + dt * 7 + 180) % 360) - 180;
      placeCamera(S.azim, S.dist, S.height);
      ui.syncCamera();
    }

    if (tween.active) {
      tween.t = Math.min(1, tween.t + dt / tween.dur);
      cam.position.lerpVectors(tween.from, tween.to, smoothstep(tween.t));
      if (tween.t >= 1) tween.active = false;
    }

    controls.target.lerp(focusGoal, 1 - Math.pow(0.001, dt));
    const d = cam.position.distanceTo(controls.target);
    controls.maxPolarAngle = Math.min(Math.PI * 0.56, Math.acos(Math.max(-1, -(CAMERA.focusY - 0.4) / Math.max(1, d))));
    controls.update();
    if (cam.position.y < 0.4) cam.position.y = 0.4;

    pool.material.opacity = 0.42 + Math.sin(elapsed * 2.1) * 0.03;
    renderer.render(scene, cam);

    // HUD
    const kmh = velocity * 3.6;
    kmhEl.textContent = kmh.toFixed(0);
    fillEl.style.width = `${Math.min(100, (kmh / 160) * 100)}%`;
    odoEl.textContent = `${(travel / 1000).toFixed(2)} km`;
    const st = running ? (kmh < S.kmh - 1 ? '加速' : '运行') : kmh > 0.5 ? '制动' : '停车';
    if (stateEl.textContent !== st) {
      stateEl.textContent = st;
      stateEl.className = running ? 'run' : kmh > 0.5 ? 'brake' : '';
    }

    fpsAcc += dt;
    fpsFrames += 1;
    if (elapsed - statAt > 0.5) {
      statAt = elapsed;
      fps = fpsFrames / Math.max(0.001, fpsAcc);
      fpsAcc = 0;
      fpsFrames = 0;
      const i = renderer.info;
      statEl.textContent = `绘制 ${i.render.calls} · 三角面 ${i.render.triangles.toLocaleString('en-US')} · 纹理 ${i.memory.textures} · ${fps.toFixed(0)} fps`;
      if (!dragging && !tween.active) syncFromCamera();
    }

    audio.update(velocity, MOTION.maxSpeed, travel);
  });

  // 竖屏时水平视场被压窄，按宽高比补一点 fov，否则整列车只剩一个车头
  function effectiveFov() {
    const aspect = window.innerWidth / window.innerHeight;
    return Math.min(78, S.fov * (1 + Math.max(0, 1.25 - aspect) * 0.5));
  }

  window.addEventListener('resize', () => {
    cam.aspect = window.innerWidth / window.innerHeight;
    cam.fov = effectiveFov();
    cam.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * (QUALITY.find((q) => q.id === S.quality)?.ratio ?? 1));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.needsUpdate = true;
  });

  // ------------------------------------------------------------------- ui ---
  const api = {
    S,
    defaults,
    formation: cfg.formation,
    pantoCars: [2, cfg.formation - 3],
    setRunning,
    isRunning: () => running,
    focusCar,
    applyView,
    setParam(key, value) {
      S[key] = value;
      switch (key) {
        case 'azim':
        case 'dist':
        case 'height':
          tween.active = false;
          placeCamera(S.azim, S.dist, S.height);
          break;
        case 'fov':
          cam.fov = effectiveFov();
          cam.updateProjectionMatrix();
          break;
        case 'key':
        case 'keydir':
        case 'rim':
          placeLights();
          break;
        case 'snow':
          env.setSnow(value / 100);
          break;
        case 'fog':
          env.setFog(value / 1000);
          break;
        case 'exposure':
          renderer.toneMappingExposure = value;
          break;
        case 'panto':
          train.setPanto(value);
          renderer.shadowMap.needsUpdate = true;
          break;
        case 'lamps':
          applyLamps();
          break;
        case 'catenary':
          env.setCatenary(value);
          break;
        case 'slab':
          env.setSlabTrack(value);
          break;
        case 'trees':
          env.setTrees(value);
          break;
        case 'wire':
          train.setWireframe(value);
          renderer.shadowMap.needsUpdate = true;
          break;
        case 'theme':
          applyTheme(value);
          break;
        case 'quality':
          applyQuality(value);
          break;
        default:
          break;
      }
    },
    reset() {
      Object.assign(S, defaults);
      applyTheme(S.theme);
      applyQuality(S.quality);
      train.setPanto(true);
      train.setWireframe(false);
      env.setCatenary(true);
      env.setSlabTrack(true);
      env.setTrees(true);
      applyLamps();
      cam.fov = effectiveFov();
      cam.updateProjectionMatrix();
      S.car = 0;
      applyView('hero', true);
      setRunning(false);
      ui.syncAll();
    },
    randomize() {
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      const rnd = (a, b) => a + Math.random() * (b - a);
      api.setParam('theme', pick(['night', 'night', 'day', 'studio']));
      api.setParam('snow', Math.round(rnd(0, 100)));
      api.setParam('key', +rnd(1.2, 4.2).toFixed(2));
      api.setParam('keydir', Math.round(rnd(-180, 180)));
      api.setParam('rim', +rnd(0.4, 3.6).toFixed(2));
      api.setParam('fog', +rnd(1.5, 11).toFixed(1));
      api.setParam('exposure', +rnd(0.75, 1.45).toFixed(2));
      api.setParam('fov', Math.round(rnd(26, 62)));
      api.setParam('panto', Math.random() > 0.25);
      S.azim = Math.round(rnd(-180, 180));
      S.dist = Math.round(rnd(16, 120));
      S.height = +rnd(1.2, 34).toFixed(1);
      tween.active = false;
      placeCamera(S.azim, S.dist, S.height);
      ui.syncAll();
    },
    exportPNG() {
      renderer.render(scene, cam);
      const url = renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cfg.name}-${S.theme}-${Date.now()}.png`;
      a.click();
    },
    toggleSound() {
      soundBtn.click();
    },
  };

  const ui = bindUI(api);
  ui.syncAll();

  requestAnimationFrame(() => {
    renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, cam);
    document.getElementById('loader').classList.add('done');
  });

  if (import.meta.env.DEV) {
    window.CNTHUB3D = () => ({
      loaded: Boolean(train.group.parent),
      cars: train.cars,
      velocity,
      travel,
      moving: running,
      kmh: velocity * 3.6,
      target: controls.target.toArray(),
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      textures: renderer.info.memory.textures,
      geometries: renderer.info.memory.geometries,
      theme: S.theme,
      quality: S.quality,
      params: { ...S },
    });
    window.CNTHUB3D.camera = cam;
    window.CNTHUB3D.controls = controls;
    window.CNTHUB3D.api = api;
    window.CNTHUB3D.renderer = renderer;
    window.CNTHUB3D.scene = scene;
  }
}
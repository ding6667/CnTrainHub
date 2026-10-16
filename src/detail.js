import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import MODELS from './data.json';
import { SCENE, LIGHTS, MOTION, CAMERA, TRACK, CATENARY } from './detail-config.js';
import './detail.css';

const params = new URLSearchParams(location.search);
const modelId = params.get('model') || 'CR400BF-G';
const cfg = MODELS[modelId];

const canvas = document.getElementById('stage');
const runBtn = document.getElementById('run');
const ready = Object.values(MODELS).filter((m) => m.model).map((m) => m.name);

function bail(msg) {
  document.getElementById('fallback-msg').textContent = msg;
  document.getElementById('fallback').hidden = false;
  canvas.style.display = 'none';
  runBtn.style.display = 'none';
  document.getElementById('hint').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
}

if (!cfg) {
  bail(`未在配置中找到车型「${modelId}」。`);
} else if (!cfg.model) {
  bail(`「${cfg.name}」的 3D 模型尚未制作，当前已提供：${ready.join('、')}。`);
} else {
  boot(cfg);
}

/** glTF paths are stored as "/models/x.glb"; resolving them against the page
 *  keeps the build working on sub-directory hosts too. */
function assetUrl(p) {
  return new URL(String(p).replace(/^\/+/, ''), document.baseURI).href;
}

function boot(cfg) {
  document.title = `${cfg.name} · 3D 展示 · CnTrainHub`;
  document.getElementById('hud-name').textContent = cfg.name;
  document.getElementById('hud-sub').textContent = `${cfg.railway} · ${cfg.title}`;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE.background);
  scene.fog = new THREE.FogExp2(SCENE.fogColor, SCENE.fogDensity);

  scene.add(new THREE.HemisphereLight(LIGHTS.hemi.sky, LIGHTS.hemi.ground, LIGHTS.hemi.intensity));

  const dir = new THREE.DirectionalLight(LIGHTS.dir.color, LIGHTS.dir.intensity);
  dir.position.set(...LIGHTS.dir.position);
  dir.castShadow = true;
  dir.shadow.mapSize.set(LIGHTS.dir.shadowMap, LIGHTS.dir.shadowMap);
  const ext = LIGHTS.dir.shadowExtent;
  Object.assign(dir.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 420 });
  dir.shadow.bias = -0.0006;
  scene.add(dir, dir.target);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1500, 1500),
    new THREE.MeshStandardMaterial({ color: SCENE.ground, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.68;
  ground.receiveShadow = true;
  scene.add(ground);

  const track = buildTrack(scene);

  const cam = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, CAMERA.near, CAMERA.far);
  cam.position.set(...CAMERA.startOffset);

  const controls = new OrbitControls(cam, renderer.domElement);
  controls.enablePan = false;
  controls.minDistance = CAMERA.minDistance;
  controls.maxDistance = CAMERA.maxDistance;
  controls.maxPolarAngle = Math.PI * 0.495;
  // Left and right are deliberately unbound: the orbit belongs to the middle
  // button so a left drag never fights the camera follow.
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: null };
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 2.2, 0);

  const clock = new THREE.Clock();
  const focus = new THREE.Vector3();
  let velocity = 0;
  let travel = 0;
  let isMoving = false;
  let headCar = null;

  runBtn.addEventListener('click', () => {
    isMoving = !isMoving;
    runBtn.textContent = isMoving ? '停止' : '前进';
    runBtn.classList.toggle('is-on', isMoving);
  });

  new GLTFLoader().load(
    assetUrl(cfg.model),
    (gltf) => {
      const proto = {};
      for (const key of ['Head', 'Middle']) {
        const node = gltf.scene.getObjectByName(key);
        if (!node) {
          bail(`模型文件里找不到「${key}」节点。`);
          return;
        }
        node.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = false;
          }
        });
        node.visible = false;
        proto[key] = node;
      }
      headCar = buildConsist(scene, proto, cfg);
      dir.target.position.copy(headCar.position);
      headCar.getWorldPosition(focus);
      cam.position.set(focus.x + CAMERA.startOffset[0], CAMERA.startOffset[1], focus.z + CAMERA.startOffset[2]);
      controls.update();
    },
    undefined,
    (err) => bail(`模型加载失败：${err?.message ?? err}`),
  );

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    velocity = isMoving
      ? Math.min(velocity + MOTION.acceleration * dt, MOTION.maxSpeed)
      : Math.max(velocity - MOTION.deceleration * dt, 0);
    travel += velocity * dt;

    // The consist stays put and the infrastructure runs past it. Shifting a
    // periodic pattern by one period is seamless, so this reads as an infinite
    // track without touching a single instance matrix.
    track.sleepers.position.z = travel % track.sleepers.userData.wrap;
    track.masts.position.z = travel % track.masts.userData.wrap;

    if (headCar) {
      headCar.getWorldPosition(focus);
      focus.y += 2.2;
      controls.target.lerp(focus, 0.35);
    }
    controls.update();
    renderer.render(scene, cam);
  });

  window.addEventListener('resize', () => {
    cam.aspect = window.innerWidth / window.innerHeight;
    cam.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  });

  if (import.meta.env.DEV) {
    window.CNTHUB3D = () => ({
      loaded: Boolean(headCar),
      cars: headCar ? headCar.parent.children.length : 0,
      velocity,
      travel,
      moving: isMoving,
      target: controls.target.toArray(),
      calls: renderer.info.render.calls,
      tris: renderer.info.render.triangles,
      textures: renderer.info.memory.textures,
      geometries: renderer.info.memory.geometries,
    });
  }
}

/**
 * 1 head + 6 middle + 1 head turned 180°, nose toward -Z (the direction of
 * travel).  Middle cars are clone()d from one prototype, so the whole 208.95 m
 * set costs two geometries on the GPU.
 */
function buildConsist(scene, proto, cfg) {
  const s = cfg.set ?? { headLength: 25.85, middleLength: 25.0, gap: 1.036 };
  const keys = ['Head', ...Array(cfg.formation - 2).fill('Middle'), 'Head'];
  const group = new THREE.Group();
  scene.add(group);

  let front = 0;
  let head = null;
  keys.forEach((key, i) => {
    const len = key === 'Head' ? s.headLength : s.middleLength;
    const node = proto[key].clone(true);
    node.visible = true;
    node.name = `${key}-${i}`;
    // +PI/2 puts the model's +X nose on -Z; the tail car mirrors it so its nose
    // faces the other end of the set.
    node.rotation.y = i === 0 ? Math.PI / 2 : i === keys.length - 1 ? -Math.PI / 2 : Math.PI / 2;
    node.position.z = front + len / 2;
    group.add(node);
    if (i === 0) head = node;
    front += len + s.gap;
  });

  const total = front - s.gap;
  for (const c of group.children) c.position.z -= total / 2;
  group.updateMatrixWorld(true);
  return head;
}

function buildTrack(scene) {
  const span = TRACK.span;
  const half = span / 2;
  const mat = {
    rail: new THREE.MeshStandardMaterial({ color: TRACK.rail.color, roughness: 0.35, metalness: 0.6 }),
    ballast: new THREE.MeshStandardMaterial({ color: TRACK.ballast.color, roughness: 0.95 }),
    sleeper: new THREE.MeshStandardMaterial({ color: 0x3d3a36, roughness: 0.9 }),
    slab: new THREE.MeshStandardMaterial({ color: TRACK.slab.color, roughness: 0.9 }),
    mast: new THREE.MeshStandardMaterial({ color: CATENARY.color, roughness: 0.6, metalness: 0.4 }),
    wire: new THREE.MeshBasicMaterial({ color: 0x2a2d31 }),
  };
  const box = (w, h, d, material, x, y, receive = true) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, 0);
    m.receiveShadow = receive;
    scene.add(m);
    return m;
  };

  // rail head = y 0, which is where the car model's floor line is defined
  box(TRACK.ballast.width, TRACK.ballast.height, span, mat.ballast, 0, -0.5);
  for (const side of [-1, 1]) box(TRACK.rail.width, TRACK.rail.height, span, mat.rail, (side * TRACK.gauge) / 2, -0.08);

  const sleepers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(...TRACK.sleeperSize),
    mat.sleeper,
    Math.floor(span / TRACK.sleeperSpacing),
  );
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < sleepers.count; i += 1) {
    m4.makeTranslation(0, -0.24, -half + i * TRACK.sleeperSpacing);
    sleepers.setMatrixAt(i, m4);
  }
  sleepers.receiveShadow = true;
  sleepers.userData.wrap = TRACK.sleeperSpacing;
  scene.add(sleepers);

  // second, empty line: slab track instead of ballast
  const ox = TRACK.slab.offsetX;
  box(TRACK.slab.width, TRACK.slab.height, span, mat.slab, ox, -0.22);
  for (const side of [-1, 1]) box(TRACK.rail.width, TRACK.rail.height, span, mat.rail, ox + (side * TRACK.gauge) / 2, -0.02);

  const pole = new THREE.CylinderGeometry(CATENARY.mastRadius, CATENARY.mastRadius * 1.3, CATENARY.mastHeight, 8);
  pole.translate(0, CATENARY.mastHeight / 2 - 0.6, 0);
  const arm = new THREE.BoxGeometry(CATENARY.armLength, 0.14, 0.14);
  arm.translate(CATENARY.armLength / 2 - 0.3, CATENARY.mastHeight - 0.75, 0);
  const hanger = new THREE.BoxGeometry(0.1, 1.0, 0.1);
  hanger.translate(CATENARY.armLength - 0.4, CATENARY.mastHeight - 1.25, 0);
  const masts = new THREE.InstancedMesh(mergeGeometries([pole, arm, hanger]), mat.mast, Math.floor(span / CATENARY.spacing) + 1);
  for (let i = 0; i < masts.count; i += 1) {
    m4.makeTranslation(CATENARY.offsetX, 0, -half + i * CATENARY.spacing);
    masts.setMatrixAt(i, m4);
  }
  masts.castShadow = true;
  masts.userData.wrap = CATENARY.spacing;
  scene.add(masts);

  box(0.05, 0.05, span, mat.wire, CATENARY.offsetX + CATENARY.armLength - 0.4, CATENARY.wireHeight, false);

  return { sleepers, masts };
}

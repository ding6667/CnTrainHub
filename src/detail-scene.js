import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACK, CATENARY } from './detail-config.js';

const box = (w, h, d, x, y, z) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
};

const strut = (a, b, r, seg = 6) => {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const dir = new THREE.Vector3().subVectors(to, from);
  const g = new THREE.CylinderGeometry(r, r, dir.length(), seg);
  g.translate(0, dir.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()));
  g.translate(from.x, from.y, from.z);
  return g;
};

/** 梯形道床：顶窄底宽，读起来是路基而不是悬空的板。 */
function ballastGeometry() {
  const { top, bottom, height, y } = TRACK.ballast;
  const half = TRACK.span / 2;
  const yt = y + height / 2;
  const yb = y - height / 2;
  const ht = top / 2;
  const hb = bottom / 2;
  const v = [
    [-ht, yt, -half], [ht, yt, -half], [ht, yt, half], [-ht, yt, half],
    [-hb, yb, -half], [hb, yb, -half], [hb, yb, half], [-hb, yb, half],
  ];
  const faces = [
    [0, 1, 2, 3], [7, 6, 5, 4], [4, 5, 1, 0],
    [5, 6, 2, 1], [6, 7, 3, 2], [7, 4, 0, 3],
  ];
  const pos = [];
  const uv = [];
  for (const f of faces) {
    for (const i of [f[0], f[1], f[2], f[0], f[2], f[3]]) {
      pos.push(...v[i]);
      uv.push((v[i][2] + half) / TRACK.span, v[i][1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function mastGeometry() {
  const h = CATENARY.mastHeight;
  const parts = [];
  const pole = new THREE.CylinderGeometry(CATENARY.mastRadius, CATENARY.mastRadius * 1.35, h, 8);
  pole.translate(0, h / 2 + TRACK.groundY, 0);
  parts.push(pole);
  parts.push(box(0.62, 0.24, 0.62, 0, TRACK.groundY + 0.12, 0));
  const topY = h - 1.5;
  const reach = CATENARY.armLength;
  parts.push(strut([0, topY, 0], [reach, topY - 0.12, 0], 0.055));
  parts.push(strut([0, topY - 1.15, 0], [reach - 0.5, topY - 0.16, 0], 0.045));
  parts.push(strut([reach - 0.1, topY - 0.12, 0], [reach - 0.35, CATENARY.contactY + 0.06, 0], 0.04));
  parts.push(strut([0.35, topY - 0.02, 0], [0.75, topY - 0.06, 0], 0.09, 8));
  parts.push(strut([0.3, topY - 1.0, 0], [0.66, topY - 0.72, 0], 0.08, 8));
  parts.push(box(0.1, 0.5, 0.1, reach - 0.35, CATENARY.contactY + 0.3, 0));
  return mergeGeometries(parts);
}

function treeGeometry() {
  const parts = [];
  const paint = (g, hex) => {
    const c = new THREE.Color(hex);
    g.setAttribute('color', new THREE.Float32BufferAttribute(Array(g.attributes.position.count).fill([c.r, c.g, c.b]).flat(), 3));
    return g;
  };
  const trunk = new THREE.CylinderGeometry(0.14, 0.22, 1.6, 5);
  trunk.translate(0, 0.8, 0);
  parts.push(paint(trunk, 0x33291f));
  for (const [r, h, y] of [[1.6, 3.4, 2.6], [1.05, 2.6, 4.6]]) {
    const cone = new THREE.ConeGeometry(r, h, 6);
    cone.translate(0, y, 0);
    parts.push(paint(cone, 0x1f2f28));
    const cap = new THREE.ConeGeometry(r * 0.78, h * 0.5, 6);
    cap.translate(0, y + h * 0.26, 0);
    parts.push(paint(cap, 0xd6e4f0));
  }
  return mergeGeometries(parts);
}

function softSprite() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,.72)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 程序化环境贴图：冷天空 + 暖地平线辉光 + 暗地面，给金属漆和玻璃真实反射。 */
export function makeEnvironment(renderer, theme) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, theme.env.zenith);
  g.addColorStop(0.42, theme.env.horizon);
  g.addColorStop(0.5, theme.env.glow);
  g.addColorStop(0.58, theme.env.ground);
  g.addColorStop(1, theme.env.ground);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  const sun = ctx.createRadialGradient(150, 118, 0, 150, 118, 96);
  sun.addColorStop(0, `rgba(255,236,205,${theme.env.sun})`);
  sun.addColorStop(1, 'rgba(255,236,205,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 512, 256);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromEquirectangular(tex);
  pmrem.dispose();
  tex.dispose();
  return rt;
}

export function buildEnvironment(scene, renderer, theme, quality) {
  const span = TRACK.span;
  const half = span / 2;
  const group = new THREE.Group();
  group.name = 'environment';
  scene.add(group);

  // ---- sky dome (vertex-coloured, no texture) ----
  const skyGeo = new THREE.SphereGeometry(760, 24, 16);
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.name = 'sky';
  group.add(sky);

  // ---- ground ----
  // 地面远大于天穹半径：地平线以下永远先命中地面（已被雾吃满），
  // 以上才是天穹，两者在雾色处相接，不会出现一条硬边。
  const groundGeo = new THREE.PlaneGeometry(3000, 3000, 26, 26);
  groundGeo.rotateX(-Math.PI / 2);
  const gp = groundGeo.attributes.position;
  const gc = new Float32Array(gp.count * 3);
  for (let i = 0; i < gp.count; i += 1) {
    const x = gp.getX(i);
    const z = gp.getZ(i);
    const away = Math.min(1, Math.max(0, (Math.abs(x) - 13) / 40));
    const h = (Math.sin(x * 0.021) * Math.cos(z * 0.017) + Math.sin(x * 0.006 + 1.7) * 1.6) * 1.5 * away;
    gp.setY(i, h);
    // 雪面明暗起伏：迎风坡亮、背风凹处暗，避免一整块死板的灰地板
    const drift = 0.82 + 0.3 * (0.5 + 0.5 * Math.sin(x * 0.05 + z * 0.031)) + 0.12 * Math.sin(z * 0.11);
    gc[i * 3] = drift;
    gc[i * 3 + 1] = drift;
    gc[i * 3 + 2] = drift * 1.04;
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(gc, 3));
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: theme.ground, roughness: theme.groundRoughness, metalness: 0.02, vertexColors: true }));
  ground.position.y = TRACK.groundY;
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);

  const mats = {
    ballast: new THREE.MeshStandardMaterial({ color: theme.ballast, roughness: 0.96, metalness: 0.02 }),
    sleeper: new THREE.MeshStandardMaterial({ color: theme.sleeper, roughness: 0.92 }),
    slab: new THREE.MeshStandardMaterial({ color: theme.slab, roughness: 0.88 }),
    rail: new THREE.MeshStandardMaterial({ color: theme.rail, roughness: 0.22, metalness: 0.9, envMapIntensity: 1.4 }),
    mast: new THREE.MeshStandardMaterial({ color: theme.mast, roughness: 0.6, metalness: 0.45 }),
    wire: new THREE.LineBasicMaterial({ color: theme.wire, transparent: true, opacity: 0.45 }),
    tree: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
  };

  const ballast = new THREE.Mesh(ballastGeometry(), mats.ballast);
  ballast.receiveShadow = true;
  group.add(ballast);

  // 铁路走廊：轨道两侧一片深色道砟/清雪带，把线路"压"在地上，
  // 否则整片雪原和车体一样亮，画面没有明暗层次。
  const corridor = new THREE.Mesh(
    box(34, 0.06, span, 1.2, TRACK.groundY + 0.05, 0),
    new THREE.MeshStandardMaterial({ color: theme.corridor, roughness: 0.98, metalness: 0 }),
  );
  corridor.receiveShadow = true;
  group.add(corridor);

  const railGeos = [];
  for (const cx of [0, TRACK.slab.offsetX]) {
    for (const s of [-1, 1]) railGeos.push(box(TRACK.rail.width, TRACK.rail.height, span, cx + (s * TRACK.gauge) / 2, -TRACK.rail.height / 2, 0));
  }
  const rails = new THREE.Mesh(mergeGeometries(railGeos), mats.rail);
  rails.receiveShadow = true;
  group.add(rails);

  const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(...TRACK.sleeperSize), mats.sleeper, Math.floor(span / TRACK.sleeperSpacing));
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < sleepers.count; i += 1) {
    m4.makeTranslation(0, -0.24, -half + i * TRACK.sleeperSpacing);
    sleepers.setMatrixAt(i, m4);
  }
  sleepers.receiveShadow = true;
  sleepers.frustumCulled = false;
  group.add(sleepers);

  const slab = new THREE.Mesh(box(TRACK.slab.width, TRACK.slab.height, span, TRACK.slab.offsetX, -0.32, 0), mats.slab);
  slab.receiveShadow = true;
  group.add(slab);

  const masts = new THREE.InstancedMesh(mastGeometry(), mats.mast, Math.floor(span / CATENARY.spacing) + 1);
  for (let i = 0; i < masts.count; i += 1) {
    m4.makeTranslation(CATENARY.offsetX, 0, -half + i * CATENARY.spacing);
    masts.setMatrixAt(i, m4);
  }
  masts.frustumCulled = false;
  group.add(masts);

  // ---- wires: contact + sagging messenger + droppers ----
  const wireX = CATENARY.offsetX + CATENARY.armLength - 0.35;
  const contactPts = [new THREE.Vector3(wireX, CATENARY.contactY, -half), new THREE.Vector3(wireX, CATENARY.contactY, half)];
  const contact = new THREE.Line(new THREE.BufferGeometry().setFromPoints(contactPts), mats.wire);
  group.add(contact);

  const messPts = [];
  const dropPts = [];
  const spans = Math.floor(span / CATENARY.spacing);
  for (let i = 0; i < spans; i += 1) {
    const z0 = -half + i * CATENARY.spacing;
    for (let s = 0; s <= 8; s += 1) {
      const t = s / 8;
      const sag = Math.sin(Math.PI * t) * 0.55;
      messPts.push(new THREE.Vector3(wireX, CATENARY.messengerY - sag, z0 + t * CATENARY.spacing));
    }
    for (const t of [0.2, 0.4, 0.6, 0.8]) {
      const sag = Math.sin(Math.PI * t) * 0.55;
      dropPts.push(new THREE.Vector3(wireX, CATENARY.messengerY - sag, z0 + t * CATENARY.spacing));
      dropPts.push(new THREE.Vector3(wireX, CATENARY.contactY, z0 + t * CATENARY.spacing));
    }
  }
  const messenger = new THREE.Line(new THREE.BufferGeometry().setFromPoints(messPts), mats.wire);
  const droppers = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(dropPts), mats.wire);
  group.add(messenger, droppers);

  // ---- lineside conifers ----
  const treeCount = 36;
  const trees = new THREE.InstancedMesh(treeGeometry(), mats.tree, treeCount);
  const q = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const pos = new THREE.Vector3();
  let seed = 20260113;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < treeCount; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    // 林木只放在远侧：镜头环绕半径最大 260 m，但常用机位在 100 m 内，
    // 树带退到 62 m 以外才不会在侧向机位挡镜头。
    const x = side * (92 + rnd() * 96);
    const z = -half + (i / treeCount) * span + rnd() * 10;
    const s = 0.45 + rnd() * 0.4;
    pos.set(x, TRACK.groundY - 0.1, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI);
    scale.set(s, s * (0.85 + rnd() * 0.4), s);
    m4.compose(pos, q, scale);
    trees.setMatrixAt(i, m4);
  }
  trees.frustumCulled = false;
  group.add(trees);

  // ---- snow ----
  const sprite = softSprite();
  const snowCap = 2600;
  const snowPos = new Float32Array(snowCap * 3);
  const snowVel = new Float32Array(snowCap * 3);
  const BOX = { x: 150, y: 46, z: 240 };
  for (let i = 0; i < snowCap; i += 1) {
    snowPos[i * 3] = (Math.random() - 0.5) * BOX.x;
    snowPos[i * 3 + 1] = Math.random() * BOX.y;
    snowPos[i * 3 + 2] = (Math.random() - 0.5) * BOX.z;
    snowVel[i * 3] = 0.5 + Math.random() * 1.4;
    snowVel[i * 3 + 1] = 0.9 + Math.random() * 1.9;
    snowVel[i * 3 + 2] = Math.random() * 0.8;
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snow = new THREE.Points(
    snowGeo,
    new THREE.PointsMaterial({ size: 0.11, map: sprite, transparent: true, opacity: 0.9, depthWrite: false, sizeAttenuation: true, color: 0xf2f8ff, fog: true }),
  );
  snow.frustumCulled = false;
  snow.name = 'snow';
  group.add(snow);

  const state = { snowAmount: theme.snow, quality, theme };

  function paintSky(t) {
    const zenith = new THREE.Color(t.sky[0]);
    const mid = new THREE.Color(t.sky[2]);
    const horizon = new THREE.Color(t.fog);
    const glow = new THREE.Color(t.env.glow);
    const p = skyGeo.attributes.position;
    const c = skyGeo.attributes.color;
    const tmp = new THREE.Color();
    const sunA = t.key.azimuth;
    for (let i = 0; i < p.count; i += 1) {
      const x = p.getX(i);
      const y = p.getY(i) / 760;
      const z = p.getZ(i);
      if (y >= 0) {
        const k = Math.pow(Math.min(1, y), 0.28);
        tmp.copy(horizon).lerp(mid, Math.min(1, k * 1.5)).lerp(zenith, Math.min(1, Math.max(0, k * 1.5 - 0.5) / 0.5));
      } else {
        tmp.copy(horizon).lerp(zenith, Math.min(1, -y * 2.4));
      }
      // 暖光只在地平线上方一条窄带里晕开；y=0 处必须保持雾色，否则和地面接缝
      const az = Math.atan2(x, z);
      const facing = Math.max(0, Math.cos(az - sunA));
      const rise = Math.min(1, Math.max(0, y / 0.035));
      const band = rise * Math.exp(-Math.pow((y - 0.06) / 0.085, 2)) * Math.pow(facing, 3);
      tmp.lerp(glow, band * (t.env.sun * 0.42));
      c.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    c.needsUpdate = true;
  }

  function applyTheme(t) {
    state.theme = t;
    paintSky(t);
    ground.material.color.setHex(t.ground);
    ground.material.roughness = t.groundRoughness;
    mats.ballast.color.setHex(t.ballast);
    corridor.material.color.setHex(t.corridor);
    mats.sleeper.color.setHex(t.sleeper);
    mats.slab.color.setHex(t.slab);
    mats.rail.color.setHex(t.rail);
    mats.mast.color.setHex(t.mast);
    mats.wire.color.setHex(t.wire);
    mats.tree.color.setHex(0xffffff);
    scene.fog.color.setHex(t.fog);
    scene.fog.density = t.fogDensity;
    scene.background = new THREE.Color(t.fog);
    setSnow(t.snow);
  }

  function setSnow(amount) {
    state.snowAmount = amount;
    const cap = QUALITY_CAP[state.quality] ?? 1600;
    const n = Math.round(Math.min(1, Math.max(0, amount)) * cap);
    snowGeo.setDrawRange(0, n);
    snow.visible = n > 0;
  }

  const QUALITY_CAP = { low: 700, mid: 1600, high: 2600 };
  function setQuality(id) {
    state.quality = id;
    setSnow(state.snowAmount);
  }

  function setFog(density) {
    scene.fog.density = density;
  }

  function setCatenary(on) {
    masts.visible = on;
    contact.visible = on;
    messenger.visible = on;
    droppers.visible = on;
  }

  function setSlabTrack(on) {
    slab.visible = on;
    rails.visible = true;
  }

  function setTrees(on) {
    trees.visible = on;
  }

  const wrapSleeper = TRACK.sleeperSpacing;
  const wrapMast = CATENARY.spacing;
  const wrapTree = span / treeCount;

  function scroll(travel) {
    sleepers.position.z = travel % wrapSleeper;
    masts.position.z = travel % wrapMast;
    contact.position.z = 0;
    messenger.position.z = travel % wrapMast;
    droppers.position.z = travel % wrapMast;
    trees.position.z = travel % wrapTree;
  }

  const focus = new THREE.Vector3();
  function update(dt, velocity, target, time) {
    if (!snow.visible) return;
    focus.copy(target);
    snow.position.set(focus.x, 0, focus.z);
    const n = snowGeo.drawRange.count;
    const drift = velocity * 0.92;
    for (let i = 0; i < n; i += 1) {
      const ix = i * 3;
      snowPos[ix] += Math.sin(time * 0.7 + i) * snowVel[ix] * dt * 0.6;
      snowPos[ix + 1] -= snowVel[ix + 1] * dt;
      snowPos[ix + 2] += (drift + snowVel[ix + 2]) * dt;
      if (snowPos[ix + 1] < 0) {
        snowPos[ix + 1] += BOX.y;
        snowPos[ix] = (Math.random() - 0.5) * BOX.x;
      }
      if (snowPos[ix + 2] > BOX.z / 2) snowPos[ix + 2] -= BOX.z;
      if (snowPos[ix] > BOX.x / 2) snowPos[ix] -= BOX.x;
      else if (snowPos[ix] < -BOX.x / 2) snowPos[ix] += BOX.x;
    }
    snowGeo.attributes.position.needsUpdate = true;
  }

  applyTheme(theme);
  setQuality(quality);

  return {
    group,
    mats,
    sky,
    ground,
    snow,
    sprite,
    applyTheme,
    setSnow,
    setQuality,
    setFog,
    setCatenary,
    setSlabTrack,
    setTrees,
    scroll,
    update,
    dispose() {
      group.traverse((o) => {
        o.geometry?.dispose();
        if (o.material && !Array.isArray(o.material)) o.material.dispose();
      });
      sprite.dispose();
    },
  };
}
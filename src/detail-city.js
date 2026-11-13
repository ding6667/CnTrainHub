import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY, FORMATION } from './detail-config.js';

/**
 * 线路两侧的城市楼群。四种楼型（板式住宅 / 玻璃写字楼 / 退台塔楼 / 圆柱塔），
 * 立面画在可平铺的 CanvasTexture 上，按实例缩放与着色区分，全部走 InstancedMesh。
 * 楼群沿 z 以 CITY.period 重复，滚动取模即可无缝穿过。
 */

const TILE_M = 12; // 一张立面贴图横向 4 个 3 m 开间
const FLOOR_M = 12.8; // 纵向 4 个 3.2 m 层高
const ROOF_UV = [0.5, 0.02]; // 落在贴图顶部的通长楼板带，屋面取单色

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function facadeTexture(kind, night) {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  const r = rng(kind === 'residential' ? 7717 : 4211);
  const M = 64;

  if (kind === 'residential') {
    ctx.fillStyle = night ? '#232830' : '#c8c2b6';
    ctx.fillRect(0, 0, S, S);
    for (let fy = 0; fy < 4; fy += 1) {
      // 通长楼板带（屋面 UV 也取这里，保证屋顶是单色）
      ctx.fillStyle = night ? '#1a1e25' : '#b0a99c';
      ctx.fillRect(0, fy * M, S, 11);
      for (let fx = 0; fx < 4; fx += 1) {
        const x = fx * M + 12;
        const y = fy * M + 19;
        const lit = r() < 0.42;
        if (night) {
          ctx.fillStyle = lit ? (r() < 0.7 ? '#ffcf8e' : '#ffe6c0') : '#12161c';
        } else {
          ctx.fillStyle = r() < 0.25 ? '#8fa3b4' : '#46586a';
        }
        ctx.fillRect(x, y, 40, 34);
        // 窗框与阳台栏板
        ctx.fillStyle = night ? '#0d1116' : '#9d968a';
        ctx.fillRect(x + 19, y, 2, 34);
        ctx.fillStyle = night ? '#2c323b' : '#ded7ca';
        ctx.fillRect(x - 3, y + 34, 46, 6);
      }
    }
  } else {
    ctx.fillStyle = night ? '#0e161e' : '#5b7d9a';
    ctx.fillRect(0, 0, S, S);
    for (let fy = 0; fy < 4; fy += 1) {
      ctx.fillStyle = night ? '#080d13' : '#3f5a72';
      ctx.fillRect(0, fy * M, S, 14);
      for (let fx = 0; fx < 4; fx += 1) {
        const lit = r() < 0.3;
        if (night && lit) {
          ctx.fillStyle = r() < 0.6 ? '#ffd9a0' : '#cfe4f2';
          ctx.fillRect(fx * M + 2, fy * M + 15, M - 4, M - 17);
        } else if (!night) {
          const g = ctx.createLinearGradient(0, fy * M + 15, 0, fy * M + M);
          g.addColorStop(0, '#7fa2bd');
          g.addColorStop(1, '#41607c');
          ctx.fillStyle = g;
          ctx.fillRect(fx * M + 2, fy * M + 15, M - 4, M - 17);
        }
      }
      // 竖向幕墙龙骨
      ctx.fillStyle = night ? '#161d26' : '#2e455c';
      for (let mx = 0; mx <= 4; mx += 1) ctx.fillRect(mx * M - 1, fy * M, 2, M);
      for (let mx = 0; mx < 16; mx += 1) ctx.fillRect(mx * 16, fy * M + 14, 1, M - 14);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** 盒子立面 UV 按真实尺寸平铺，屋面/底面取单色采样点。 */
function facadeBox(w, h, d, y0 = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const face = (start, uSpan) => {
    for (let i = 0; i < 4; i += 1) uv.setXY(start + i, uv.getX(start + i) * uSpan, uv.getY(start + i) * (h / FLOOR_M));
  };
  face(0, d / TILE_M);
  face(4, d / TILE_M);
  face(16, w / TILE_M);
  face(20, w / TILE_M);
  for (const s of [8, 12]) for (let i = 0; i < 4; i += 1) uv.setXY(s + i, ROOF_UV[0], ROOF_UV[1]);
  g.translate(0, y0 + h / 2, 0);
  return g;
}

function facadeCylinder(radius, h, seg = 12) {
  const g = new THREE.CylinderGeometry(radius, radius, h, seg);
  const uv = g.attributes.uv;
  const uSpan = (2 * Math.PI * radius) / TILE_M;
  for (let i = 0; i < uv.count; i += 1) {
    const isCap = uv.getY(i) === 0 || uv.getY(i) === 1;
    // CylinderGeometry 侧壁 v 在 (0,1) 开区间，端盖顶点 v 恰为 0/1
    if (isCap && Math.abs(uv.getX(i) - 0.5) < 1e-6) uv.setXY(i, ROOF_UV[0], ROOF_UV[1]);
    else uv.setXY(i, uv.getX(i) * uSpan, uv.getY(i) * (h / FLOOR_M));
  }
  g.translate(0, h / 2, 0);
  return g;
}

function buildingGeometries() {
  const slab = mergeGeometries([facadeBox(22, 30, 13), facadeBox(22.6, 0.9, 13.6, 30)]);
  const tower = mergeGeometries([facadeBox(15, 62, 15), facadeBox(11, 5, 11, 62)]);
  const stepped = mergeGeometries([facadeBox(20, 20, 16), facadeBox(16, 16, 13, 20), facadeBox(12, 12, 10, 36)]);
  const cylinder = mergeGeometries([facadeCylinder(9, 74), facadeCylinder(9.6, 1.2, 12).translate(0, 74, 0)]);
  return { slab, tower, stepped, cylinder };
}

const TYPE_MAT = { slab: 'residential', stepped: 'residential', tower: 'office', cylinder: 'office' };

export function buildCity(scene, theme) {
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  const textures = { residential: facadeTexture('residential', false), office: facadeTexture('office', false) };
  const materials = {
    residential: new THREE.MeshStandardMaterial({
      map: textures.residential, roughness: 0.86, metalness: 0.04,
      emissive: 0xffffff, emissiveMap: textures.residential, emissiveIntensity: 0,
    }),
    office: new THREE.MeshStandardMaterial({
      map: textures.office, roughness: 0.24, metalness: 0.5, envMapIntensity: 1.1,
      emissive: 0xffffff, emissiveMap: textures.office, emissiveIntensity: 0,
    }),
  };

  const geos = buildingGeometries();
  const perPeriod = CITY.rows.length * CITY.cols * 2;
  const total = perPeriod * CITY.blocks;
  const lists = { slab: [], tower: [], stepped: [], cylinder: [] };

  const r = rng(20261113);
  const specs = [];
  for (let i = 0; i < perPeriod; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2) % CITY.rows.length;
    const col = Math.floor(i / (2 * CITY.rows.length));
    const dist = CITY.rows[row] + (r() - 0.5) * 14;
    const z = -CITY.period / 2 + ((col + 0.5) * CITY.period) / CITY.cols + (r() - 0.5) * 16;
    const pick = r();
    let type;
    if (row === 0) type = pick < 0.62 ? 'slab' : 'stepped';
    else if (row === 1) type = pick < 0.45 ? 'stepped' : pick < 0.8 ? 'tower' : 'slab';
    else type = pick < 0.55 ? 'tower' : 'cylinder';
    const baseH = { slab: 1, tower: 1, stepped: 1, cylinder: 1 }[type];
    const sy = (row === 0 ? 0.72 + r() * 0.4 : row === 1 ? 0.82 + r() * 0.42 : 0.88 + r() * 0.5) * baseH;
    specs.push({
      type,
      x: FORMATION.centerX + side * dist,
      z,
      rot: r() < 0.3 ? Math.PI / 2 : 0,
      sx: 0.85 + r() * 0.4,
      sy,
      sz: 0.85 + r() * 0.4,
      tint: 0.8 + r() * 0.35,
      warm: r() < 0.35,
    });
  }
  // 按“同一栋楼跨各周期”交错排布，密度截断时各周期均匀减少
  for (let i = 0; i < perPeriod; i += 1) {
    for (let p = 0; p < CITY.blocks; p += 1) {
      const s = specs[i];
      lists[s.type].push({ ...s, z: s.z + p * CITY.period - ((CITY.blocks - 1) * CITY.period) / 2 });
    }
  }

  const meshes = {};
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  const state = { density: 1, height: 1, visible: true };

  for (const type of Object.keys(lists)) {
    const mesh = new THREE.InstancedMesh(geos[type], materials[TYPE_MAT[type]], lists[type].length);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    lists[type].forEach((s, i) => {
      col.setRGB(s.tint * (s.warm ? 1.04 : 0.96), s.tint, s.tint * (s.warm ? 0.94 : 1.05));
      mesh.setColorAt(i, col);
    });
    meshes[type] = mesh;
    group.add(mesh);
  }

  function compose() {
    for (const type of Object.keys(lists)) {
      const mesh = meshes[type];
      lists[type].forEach((s, i) => {
        pos.set(s.x, CITY.groundY - 0.4, s.z);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot);
        scl.set(s.sx, s.sy * state.height, s.sz);
        m4.compose(pos, q, scl);
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.count = Math.max(0, Math.round(lists[type].length * state.density));
    }
  }

  function applyTheme(t) {
    const night = t.label === '寒夜';
    for (const kind of ['residential', 'office']) {
      const old = textures[kind];
      textures[kind] = facadeTexture(kind, night);
      materials[kind].map = textures[kind];
      materials[kind].emissiveMap = textures[kind];
      materials[kind].emissiveIntensity = night ? (kind === 'office' ? 0.5 : 0.62) : 0;
      materials[kind].needsUpdate = true;
      old.dispose();
    }
  }

  compose();
  applyTheme(theme);

  return {
    group,
    meshes,
    applyTheme,
    setDensity(f) {
      state.density = Math.min(1, Math.max(0, f));
      compose();
    },
    setHeight(f) {
      state.height = Math.min(2, Math.max(0.3, f));
      compose();
    },
    setVisible(on) {
      state.visible = on;
      group.visible = on;
    },
    scroll(travel) {
      group.position.z = travel % CITY.period;
    },
    dispose() {
      for (const g of Object.values(geos)) g.dispose();
      for (const m of Object.values(materials)) m.dispose();
      for (const t of Object.values(textures)) t.dispose();
    },
  };
}
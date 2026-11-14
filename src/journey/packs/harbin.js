/**
 * packs/harbin.js —— 「哈尔滨局」省会包：把数据 + 模块工厂装进框架。
 *
 * 这就是需求 8 说的「可复用框架」的落地方式：
 *   - core.js / alignment.js / framework.js 是引擎，不含任何哈尔滨字样（除注释举例）；
 *   - 本文件是唯一描述「这里用哪些线路、哪些站场、哪些楼、哪套地形」的地方；
 *   - 以后做「长春局」「沈阳局」，复制本文件改名、换 ROUTES / stationLayouts /
 *     buildings / terrain 即可，运行时、分块、车门、客流、时刻表、相机全部复用。
 *
 * 工厂名是 pack 层的适配口：子模块导出什么名字都行，在这里映射成
 * createTerrain / createTrack / createStations / createPassengers /
 * createTimetable / createCamera 六个统一键，framework.js 只认这六个键。
 */
import * as THREE from 'three';
import { ORIGIN, THEMES, VIEWS, CHUNK, CHUNK_KIND, BUDGET } from '../config.js';
import { ROUTES } from '../route-data.js';
import { BUILDING_CATALOG, LANDMARK_IDS, createBuildingFactory } from '../buildings.js';
import { STATION_CATALOG, buildStation, buildDepot, buildStationField, createStationSystem } from '../stations.js';
import { STATION_LAYOUTS, DEPOT_LAYOUTS, layoutFor } from '../station-layouts.js';
import { createTrackSystem } from '../track.js';
import { createTerrainSystem } from '../terrain.js';
import { createPassengerSystem, FLEET_CAPACITY } from '../passengers.js';
import { createScheduleSystem, TIMETABLE_EVENTS } from '../schedule.js';
import { createCameraRig, CAMERA_PRESETS } from '../camera.js';
import { SYSTEM_PHASE, rng, hash32 } from '../core.js';
import { createChunkSystem } from '../framework.js';
import MODELS from '../../data.json';

/** 车站目录里的 id 可能是电报码、拼音 slug 或中文名，这里做一层容错。 */
function resolveId(catalog, raw) {
  if (!raw) return null;
  const s = String(raw);
  const list = catalog || [];
  const hit = list.find((x) => x.id === s)
    || list.find((x) => x.name === s)
    || list.find((x) => s.includes(x.name) || x.name.includes(s));
  return hit ? hit.id : null;
}

function stationIdFor(c) {
  const node = (c.nodes || []).find((x) => x.role === 'hub' || x.role === 'local');
  const raw = c.stationId || node?.stationId || node?.name;
  // catalog 外的沿线站交给 stations.js 的通用中小站模板，别兜底成哈尔滨站。
  return resolveId(STATION_CATALOG, raw) ?? node?.name ?? (typeof raw === 'string' ? raw : null) ?? '哈尔滨';
}

function landmarkIdsFor(c) {
  const raw = c.landmarkIds && c.landmarkIds.length ? c.landmarkIds : [LANDMARK_IDS?.[0]].filter(Boolean);
  return raw.map((x) => resolveId(BUILDING_CATALOG, x) ?? x).filter(Boolean);
}

function depotKindFor(c) {
  const s = String(c.depot || '');
  if (s.includes('动车')) return 'emu';
  if (s.includes('机务') || s.includes('机车')) return 'loco';
  if (s.includes('车辆')) return 'coach';
  return s || 'emu';
}

/** 一次性建好「按块触发」的实体；任何省会包都可以复用这个骨架，只改内容分支。 */
function makeHarbinBuilder(shared) {
  const { factory } = shared;
  return function buildChunk(ctx, c) {
    const g = new THREE.Group();
    g.name = `chunk-${c.id}`;
    g.userData.kind = c.kind;
    g.userData.chunkId = c.id;
    const r = rng((c.id * 2654435761) ^ hash32(ctx.route.id));
    const night = ctx.state.theme === 'night';
    const S = ctx.state;
    const centerS = c.km * 1000 + CHUNK.length / 2;
    // 注意：chunk 的局部矩阵已由 alignment.localMatrixAt(centerS, s0, {lane}) 算好，
    // 原点本身就落在当前进路上（含道岔横移）。这里再补一次 lateral 会重复偏移，
    // 所以实体只相对「本块所在的进路」做线侧摆放。

    /** 一类楼 = 一个 InstancedMesh = 1 次 draw call。 */
    function addBuildings(factor) {
      const cats = ['residential', 'office', 'commercial'];
      const cat = cats[Math.abs(c.id) % cats.length];
      const types = (BUILDING_CATALOG || []).filter((b) => b.category === cat);
      if (!types.length) return;
      const type = types[Math.floor(r() * types.length) % types.length];
      const n = Math.max(0, Math.round(9 * (S.density ?? 0.75) * factor));
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

    if (c.kind === CHUNK_KIND.HUB && c.primary && S.stations !== false) {
      const id = stationIdFor(c);
      const field = buildStationField(id, { night, theme: S.theme, centerS, chunkLength: CHUNK.length });
      if (field) {
        // v2 站场按「线侧站」整体摆在正线左侧：buildFieldGeometry 的 22 股道
        // 会铺出约 226 m 宽、每座站台都有 414 m 长雨棚。若压在 x=0，两侧连续
        // 雨棚会把 hero / 俯瞰机位看列车的视线整片挡住（车体被盖在 y=5.4 的
        // 棚顶下）。半宽 113 m × 0.88 ≈ 100 m，取 -112 m 让站场右缘落在
        // x≈-12，与列车（半宽 1.68 m）留出净空；站场规模仍完整可见。
        field.position.set(-112, 0, -CHUNK.length / 2);
        field.scale.setScalar(0.88);
        g.add(field);
      } else {
        const st = buildStation(id, { theme: S.theme, quality: S.quality, night });
        if (st) {
          st.position.set(-30, 0, -CHUNK.length / 2);
          st.scale.setScalar(0.88);
          g.add(st);
        }
      }
      if (S.buildings !== false) addBuildings(0.6);
    } else if (c.kind === CHUNK_KIND.DEPOT && c.primary && S.stations !== false) {
      const d = buildDepot(depotKindFor(c), { theme: S.theme, night });
      if (d) {
        d.position.set(-78, 0, -CHUNK.length / 2);
        d.scale.setScalar(0.85);
        g.add(d);
      }
    } else if (c.kind === CHUNK_KIND.LANDMARK && c.primary) {
      landmarkIdsFor(c).slice(0, 2).forEach((id, i) => {
        const lm = factory.make(id, { night, seed: c.seed + i });
        if (lm) {
          lm.position.set((i % 2 ? 1 : -1) * (70 + r() * 40), 0, -120 - i * 170);
          g.add(lm);
        }
      });
    }

    if (S.buildings !== false && c.kind === CHUNK_KIND.URBAN) {
      addBuildings(1);
      if (Math.abs(c.id) % 3 === 0) {
        const EXTRA = ['lm-dragon-tower', 'lm-grand-theatre', 'lm-sun-island', 'lm-ice-world'];
        const extra = EXTRA[Math.abs(c.id) % EXTRA.length];
        const landmark = factory.make(extra, { night, seed: c.seed });
        if (landmark) {
          landmark.position.set((extra === 'lm-dragon-tower' ? 1 : -1) * (95 + r() * 35), 0, -160 - r() * 140);
          g.add(landmark);
        }
      }
    }
    // RURAL 不建任何东西：郊外由 terrain 的重复田地/河流/草地全局覆盖
    return g;
  };
}

export const HARBIN_PACK = {
  id: 'harbin',
  name: '哈尔滨局',
  origin: ORIGIN,
  routes: ROUTES,
  themes: THEMES,
  fleet: MODELS,
  views: CAMERA_PRESETS,
  stationCatalog: STATION_CATALOG,
  buildingCatalog: BUILDING_CATALOG,
  stationLayouts: STATION_LAYOUTS,
  depotLayouts: DEPOT_LAYOUTS,
  fleetCapacity: FLEET_CAPACITY,
  scheduleEvents: TIMETABLE_EVENTS,
  budget: BUDGET,
  layoutFor,

  createTerrain: (ctx) => createTerrainSystem(ctx),
  createTrack: (ctx) => createTrackSystem(ctx),
  // 站场实体按块建（createSceneSystem）；这个系统管全局的道岔状态、停车区间标线
  // 与站台占用指示，不重复造几何。
  createStations: (ctx) => createStationSystem(ctx, { layouts: STATION_LAYOUTS, depotLayouts: DEPOT_LAYOUTS }),
  createPassengers: (ctx) => createPassengerSystem(ctx, { layouts: STATION_LAYOUTS, capacity: FLEET_CAPACITY }),
  createTimetable: (ctx) => createScheduleSystem(ctx, { layouts: STATION_LAYOUTS }),
  createCamera: (ctx) => createCameraRig(ctx, { presets: CAMERA_PRESETS }),

  createSceneSystem(ctx) {
    const shared = { factory: createBuildingFactory() };
    const sys = createChunkSystem({
      buildChunk: makeHarbinBuilder(shared),
      release(group) {
        group.traverse((o) => { if (o.isInstancedMesh && typeof o.dispose === 'function') o.dispose(); });
      },
      chunkLength: CHUNK.length,
      phase: SYSTEM_PHASE.BUILDINGS,
    });
    const baseDispose = sys.dispose;
    sys.dispose = () => { baseDispose.call(sys); shared.factory.dispose?.(); };
    return sys;
  },
};

export default HARBIN_PACK;

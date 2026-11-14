/**
 * framework.js —— 与具体省会无关的「铁路模拟运行时」。
 *
 * 这里只做四件事，别的省会接进来一行都不用改：
 *  1. 运动：按真实里程积分，s = startS + dir * progress；dir 翻转 = 逻辑掉头，
 *     列车几何永远不旋转（需求 1）。
 *  2. 分块窗口：按 s 从 stream.js 取窗口块，给每块打 primary 标记，
 *     再由 createChunkSystem 用 alignment 局部矩阵摆位（曲线/坡度自动生效）。
 *  3. 停站：由站场布局生成 StopZone，用 core.evaluateStop 判定「两端车门都在区间内」，
 *     跑 core.nextDoorState 状态机，发 ARRIVE / DEPART / DOORS / BOARD / ALIGHT 事件（需求 2/3）。
 *  4. 编排：事件总线 + 系统注册表，把轨道/站场/客流/时刻表/相机按 phase 串起来，
 *     主题、线路、车型、编组、运行方向全部通过统一 API 切换（需求 4/8）。
 *
 * 宿主（journey.js）只负责 renderer / 灯光 / HUD / DOM 控件，并把 pack 传进来；
 * pack 只负责「数据 + 工厂」。三者解耦，不会再出现「换个城市就复制一份 journey.js」。
 */
import * as THREE from 'three';
import {
  RAIL, DIRECTION, LANE, DOOR_STATE, EVENT, SYSTEM_PHASE,
  clamp, createBus, createRegistry, createPack, evaluateStop, nextDoorState, createTrainSpec,
} from './core.js';
import { createAlignment } from './alignment.js';
import { visibleChunks } from './stream.js';
import { CHUNK } from './config.js';

/**
 * 窗口块去重：站区触发半径 1200 m 会让连续 5~6 块都标成同一座站，
 * 同一标识只挑「离列车最近」的那一块实例化实体，避免复制 5 座哈尔滨站。
 */
export function assignPrimary(chunks, s) {
  const key = (c) => c.stationId || c.depot || (c.landmarkIds || []).join(',') || `k${c.id}`;
  const best = new Map();
  for (const c of chunks) {
    if (c.kind !== 'hub' && c.kind !== 'depot' && c.kind !== 'landmark') continue;
    const centerM = c.km * 1000 + CHUNK.length / 2;
    const d = Math.abs(centerM - s);
    const k = key(c);
    if (!best.has(k) || d < best.get(k).d) best.set(k, { id: c.id, d });
  }
  return chunks.map((c) => ({
    ...c,
    primary: best.has(key(c)) && best.get(key(c)).id === c.id,
  }));
}

/**
 * 由站场布局数据生成当前附近的停车区间（线路绝对里程，米）。
 * 没查到真实布局的中小站一律用 core 里的默认站台有效长，绝不编造规模。
 */
export function zonesNear(route, s, layouts = {}, radiusM = 2500) {
  const zones = [];
  for (const n of route?.nodes ?? []) {
    if (n.role !== 'hub' && n.role !== 'local' && n.role !== 'depot') continue;
    const cs = n.km * 1000;
    if (Math.abs(cs - s) > radiusM) continue;
    const id = n.stationId ?? n.name;
    const L = layouts[id] ?? layouts[n.name] ?? null;
    const len = L?.platformLength ?? RAIL.platformLength;
    // station-layouts.js 的 stopZones 用「站中心为 0」的 relS0/relS1（s0/s1 留 null），
    // 这里统一平移成线路绝对里程，别让相对值漏进 evaluateStop。
    const rawZones = L?.stopZones?.length ? L.stopZones : [null];
    for (let i = 0; i < rawZones.length; i += 1) {
      const z = rawZones[i];
      const rel0 = z?.relS0 ?? -len / 2;
      const rel1 = z?.relS1 ?? len / 2;
      zones.push({
        id: z?.id ?? `${id}:${i}`,
        stationId: id,
        name: n.name,
        trackIndex: z?.trackIndex ?? i,
        platformIndex: z?.platformIndex ?? i,
        s0: z?.s0 ?? cs + rel0,
        s1: z?.s1 ?? cs + rel1,
        length: Math.abs(rel1 - rel0),
        dwellSec: z?.dwellSec ?? L?.dwellSec ?? (n.role === 'hub' ? 35 : 20),
        centerS: cs,
        role: n.role,
      });
    }
  }
  return zones.sort((a, b) => Math.abs(a.centerS - s) - Math.abs(b.centerS - s));
}

/**
 * 通用分块流式系统：建/回收 Group + 用 alignment 局部矩阵摆位。
 * 具体「一块里放什么」由 buildChunk(ctx, chunk) 回调决定（省会相关），
 * 「什么时候建、摆在哪、什么时候回收」在这里统一实现（省会无关）。
 */
export function createChunkSystem({ buildChunk, release, chunkLength = CHUNK.length, phase = SYSTEM_PHASE.BUILDINGS } = {}) {
  const alive = new Map();
  let scene = null;
  const halfShift = new THREE.Matrix4().makeTranslation(0, 0, chunkLength / 2);

  const sys = {
    id: 'chunks',
    phase,
    size: () => alive.size,
    init(ctx) { scene = ctx.scene; },
    clear() {
      if (!scene) return;
      for (const [, e] of alive) { scene.remove(e.group); release?.(e.group); }
      alive.clear();
    },
    update(ctx) {
      if (!scene) return;
      const list = ctx.chunks ?? [];
      const want = new Set(list.map((c) => c.id));
      for (const [id, e] of alive) {
        if (!want.has(id)) { scene.remove(e.group); release?.(e.group); alive.delete(id); }
      }
      for (const c of list) {
        const sig = `${c.kind}:${c.primary ? 1 : 0}:${Math.sign(ctx.dir)}`;
        let e = alive.get(c.id);
        if (!e || e.sig !== sig) {
          if (e) { scene.remove(e.group); release?.(e.group); }
          const group = buildChunk(ctx, c);
          if (!group) continue;
          alive.set(c.id, { group, sig, kind: c.kind });
          scene.add(group);
          e = alive.get(c.id);
        }
        // 块内内容的 z 范围是 [0, -chunkLength]，中心在 -chunkLength/2。
        // 取「块中心里程」的局部矩阵，再把内容整体往 +Z 挪半块，中心就落在取帧点上。
        const centerS = c.km * 1000 + chunkLength / 2;
        const M = ctx.alignment.localMatrixAt(centerS, ctx.s, { dir: ctx.dir, lane: ctx.lane });
        M.multiply(halfShift);
        e.group.matrixAutoUpdate = false;
        e.group.matrix.copy(M);
        e.group.matrixWorldNeedsUpdate = true;
      }
    },
    dispose() { sys.clear(); },
  };
  return sys;
}

/**
 * 由车型配置 + 构建器几何生成 TrainSpec（纯数字，供客流 / 停站 / 相机共用）。
 */
export function trainSpecFrom(modelId, cfg, built, capacity = 0, seatsPerCar = []) {
  const n = cfg.formation;
  const lens = cfg.carLengths ?? Array.from({ length: n }, (_, i) => (
    i === 0 || i === n - 1 ? cfg.set.headLength : cfg.set.middleLength
  ));
  return createTrainSpec({
    modelId,
    formation: n,
    carLengths: lens,
    gap: cfg.set.gap,
    halfWidth: (cfg.bodySize?.[0] ?? 3.36) / 2,
    height: cfg.bodySize?.[1] ?? 4.05,
    capacity,
    seatsPerCar,
    ...(built?.total ? {} : {}),
  });
}

/**
 * 创建运行时。host 至少给 { scene, camera, renderer, THREE, domElement }。
 */
export function createJourneyRuntime(packDef, host = {}) {
  const pack = createPack(packDef);
  const bus = createBus();
  const registry = createRegistry(bus);
  const route0 = pack.routes[0];
  if (!route0) throw new Error('pack.routes 不能为空');

  const state = {
    routeId: route0.id,
    startS: (host.startKm ?? route0.nodes?.[0]?.km ?? 0) * 1000,
    progress: 0,
    s: (host.startKm ?? route0.nodes?.[0]?.km ?? 0) * 1000,
    dir: DIRECTION.FORWARD,
    velocity: 0,
    running: false,
    targetKmh: host.kmh ?? 120,
    accel: host.accel ?? 18,
    decel: 26,
    lane: LANE.MAIN,
    switchState: LANE.MAIN,
    doorState: { state: DOOR_STATE.CLOSED, timer: 0, dwell: 0 },
    doorsCanOpen: false,
    doorRequest: null,       // null = 自动；true/false = 手动请求
    doorLatch: false,        // 本次停站乘降已结束，出站前不再自动开门
    stopZone: null,
    station: null,
    modelId: host.modelId ?? Object.keys(pack.fleet)[0] ?? '',
    formation: host.formation ?? 8,
    theme: host.theme ?? 'day',
    quality: host.quality ?? 'mid',
    view: host.view ?? 'hero',
    cameraMode: 'relative',
    autoDwell: true,
    autoDepart: true,
    time: 0,
    simMinutes: 6 * 60,      // 时刻表用的仿真时钟（分钟）
    ahead: host.ahead ?? CHUNK.ahead,
    behind: CHUNK.behind,
    density: host.density ?? 0.75,
    buildings: host.buildings ?? true,
    stations: host.stations ?? true,
    rural: host.rural ?? true,
    wire: host.wire ?? false,
    follow: host.follow ?? true,
    passengers: host.passengers ?? true,
    schedule: host.schedule ?? true,
  };

  let route = route0;
  let alignment = createAlignment(route, {
    runningSide: pack.runningSide,
    stationLayouts: pack.stationLayouts,
  });
  let train = host.trainSpec ?? null;
  let zones = [];
  let chunks = [];
  let lastDoor = DOOR_STATE.CLOSED;
  let lastZoneId = null;
  let lastApproach = null;

  const ctx = {
    pack, bus, registry, state, host,
    THREE: host.THREE,
    scene: host.scene, camera: host.camera, renderer: host.renderer,
    domElement: host.domElement,
    get route() { return route; },
    get alignment() { return alignment; },
    get s() { return state.s; },
    get dir() { return state.dir; },
    get progress() { return state.progress; },
    get velocity() { return state.velocity; },
    get dt() { return state._dt ?? 0; },
    get train() { return train; },
    get lane() { return state.lane; },
    get chunks() { return chunks; },
    get zones() { return zones; },
    get stopZone() { return state.stopZone; },
    get doorsCanOpen() { return state.doorsCanOpen; },
    get doorState() { return state.doorState; },
    get time() { return state.time; },
    chunkWindow: { ahead: state.ahead, behind: state.behind },
    emit: (type, payload) => bus.emit(type, payload),
  };

  // ------------------------------------------------------------ 系统装配 ----
  const FACTORIES = [
    ['terrain', 'createTerrain', SYSTEM_PHASE.TERRAIN],
    ['track', 'createTrack', SYSTEM_PHASE.TRACK],
    ['stations', 'createStations', SYSTEM_PHASE.STATIONS],
    ['passengers', 'createPassengers', SYSTEM_PHASE.PASSENGERS],
    ['timetable', 'createTimetable', SYSTEM_PHASE.TIMETABLE],
    ['camera', 'createCamera', SYSTEM_PHASE.CAMERA],
  ];
  for (const [id, key, phase] of FACTORIES) {
    const sys = pack[key]?.(ctx);
    if (sys) registry.register({ ...sys, id, phase });
  }
  if (pack.createSceneSystem) registry.register(pack.createSceneSystem(ctx));
  registry.bind(ctx);

  // ---------------------------------------------------------------- API ----
  function setRoute(id, startKm = 0) {
    const r = pack.routes.find((x) => x.id === id);
    if (!r) return false;
    route = r;
    alignment.dispose?.();
    alignment = createAlignment(r, { runningSide: pack.runningSide, stationLayouts: pack.stationLayouts });
    state.routeId = r.id;
    state.startS = startKm * 1000;
    state.s = startKm * 1000;
    state.progress = 0;
    state.velocity = 0;
    state.running = false;
    state.dir = DIRECTION.FORWARD;
    state.lane = LANE.MAIN;
    state.doorState = { state: DOOR_STATE.CLOSED, timer: 0, dwell: 0 };
    lastZoneId = null; lastApproach = null;
    registry.get('chunks')?.clear?.();
    bus.emit(EVENT.ROUTE_CHANGE, { route: r, startKm });
    return true;
  }

  /** 逻辑掉头：只把行驶方向翻过来，列车 Group 一个角度都不改。 */
  function reverse() {
    state.velocity = 0;
    state.running = false;
    state.dir = state.dir === DIRECTION.FORWARD ? DIRECTION.REVERSE : DIRECTION.FORWARD;
    state.startS = state.s;
    state.progress = 0;
    state.lane = LANE.MAIN;
    state.switchState = LANE.MAIN;
    state.doorState = { state: DOOR_STATE.CLOSED, timer: 0, dwell: 0 };
    lastZoneId = null;
    bus.emit(EVENT.REVERSE, { dir: state.dir, s: state.s });
    bus.emit(EVENT.DIRECTION_CHANGE, { dir: state.dir });
    return state.dir;
  }

  function setDirection(dir) {
    const d = dir === DIRECTION.REVERSE || dir < 0 ? DIRECTION.REVERSE : DIRECTION.FORWARD;
    if (d !== state.dir) reverse();
    return state.dir;
  }

  /** 扳道岔：lane 为 LANE.MAIN 或 alignment.stationLane() 的描述对象。 */
  function setLane(lane, reason = 'manual') {
    state.lane = lane;
    const name = typeof lane === 'string' ? lane : lane?.type ?? LANE.MAIN;
    state.switchState = name;
    bus.emit(EVENT.SWITCH, { lane, name, reason, switches: typeof lane === 'object' ? alignment.switchPoints(lane) : [] });
    return lane;
  }

  function setTrainSpec(spec) {
    train = spec;
    bus.emit('train:spec', spec);
  }

  function setModel(modelId) { state.modelId = modelId; bus.emit('train:model', modelId); }
  function setFormation(n) { state.formation = n; bus.emit('train:formation', n); }
  function setTravel(meters) {
    state.startS = clamp(meters, 0, alignment.lengthM);
    state.s = state.startS;
    state.progress = 0;
    state.velocity = 0;
    registry.get('chunks')?.clear?.();
  }
  function setRunning(on) { state.running = Boolean(on); }
  function setView(id) { state.view = id; bus.emit('camera:view', id); }
  function setCameraMode(mode) { state.cameraMode = mode; bus.emit(EVENT.CAMERA_MODE, mode); }
  function setTheme(id) {
    state.theme = id;
    const t = pack.themes?.[id] ?? pack.themes?.day ?? null;
    registry.applyTheme(t ?? id, ctx);
    bus.emit('theme:change', t ?? id);
  }
  function setAhead(n) { state.ahead = clamp(Math.round(n), 1, 14); ctx.chunkWindow.ahead = state.ahead; registry.get('chunks')?.clear?.(); }

  /** 车门请求：null=自动（进出区间自动开关），true/false=手动。 */
  function setDoorRequest(v) {
    state.doorRequest = v;
    if (v === true) state.doorLatch = false; // 手动请求开门时解除上一站的闩锁
  }
  function setAutoDwell(on) { state.autoDwell = Boolean(on); }
  function setAutoDepart(on) { state.autoDepart = Boolean(on); }

  function update(dt) {
    const d = clamp(dt, 0, 0.05);
    state._dt = d;
    state.time += d;
    state.simMinutes += d / 60;

    // ---- 运动 ----
    const target = state.running ? Math.min(300, state.targetKmh) / 3.6 : 0;
    if (state.velocity < target) state.velocity = Math.min(state.velocity + state.accel * d, target);
    else state.velocity = Math.max(state.velocity - state.decel * d, target);
    state.progress += state.velocity * d;
    const rawS = state.startS + state.dir * state.progress;
    const clamped = clamp(rawS, 0, alignment.lengthM);
    if (clamped !== rawS) { state.velocity = 0; state.running = false; }
    state.s = clamped;

    // ---- 分块窗口：反向时前后互换 ----
    const ahead = state.dir === DIRECTION.FORWARD ? state.ahead : state.behind;
    const behind = state.dir === DIRECTION.FORWARD ? state.behind : state.ahead;
    ctx.chunkWindow.ahead = ahead;
    ctx.chunkWindow.behind = behind;
    chunks = assignPrimary(visibleChunks(route, state.s, ahead, behind), state.s);

    // ---- 停车区间 / 车门 ----
    zones = zonesNear(route, state.s, pack.stationLayouts);
    const zone = zones[0] ?? null;
    const ev = train ? evaluateStop(train, zone, state.s, state.dir) : { ok: false, inside: false, doorMileages: [], frontMargin: 0, rearMargin: 0 };
    state.stopZone = zone;
    state.doorsCanOpen = Boolean(ev.inside);
    state.stopEval = ev;
    state.station = zone ? { id: zone.stationId, name: zone.name, role: zone.role } : null;

    if (zone && Math.abs(zone.centerS - state.s) < 3000 && lastApproach !== zone.id) {
      lastApproach = zone.id;
      bus.emit(EVENT.APPROACH, { zone, distanceM: Math.abs(zone.centerS - state.s) });
    }
    if (zone && lastApproach && Math.abs(zone.centerS - state.s) > 3400) lastApproach = null;

    // 进站自动停车（时刻表可通过 autoDwell=false 接管）
    if (state.autoDwell && ev.inside && !state.doorLatch) {
      state.running = false;
      state.velocity = 0;
      if (lastZoneId !== zone.id) {
        lastZoneId = zone.id;
        state.doorLatch = false;
        bus.emit(EVENT.ARRIVE, { zone, s: state.s, train });
      }
    }
    if (!ev.inside) {
      // 驶离停车区间：清掉「本区间已服务完」的闩锁，下站才能再自动开门
      state.doorLatch = false;
      if (lastZoneId) {
        bus.emit(EVENT.DEPART, { zoneId: lastZoneId, s: state.s });
        lastZoneId = null;
      }
    }

    const autoReq = state.autoDwell && ev.inside && !state.doorLatch;
    const request = state.doorRequest === null ? autoReq : state.doorRequest;
    state.doorState = nextDoorState(state.doorState, {
      canOpen: state.doorsCanOpen, request, dt: d, dwellSec: zone?.dwellSec ?? 30,
    });
    if (state.doorState.state !== lastDoor) {
      // 关门流程走完 = 本次乘降作业结束，上闩锁，避免列车还没出站就反复自动开门
      if (lastDoor === DOOR_STATE.CLOSING && state.doorState.state === DOOR_STATE.CLOSED) {
        state.doorLatch = true;
      }
      lastDoor = state.doorState.state;
      bus.emit(EVENT.DOORS, { state: lastDoor, zone, train, s: state.s });
      if (lastDoor === DOOR_STATE.OPEN) {
        bus.emit(EVENT.ALIGHT, { zone, train, s: state.s });
        bus.emit(EVENT.BOARD, { zone, train, s: state.s });
      }
    }
    if (state.autoDepart && state.doorLatch && !state.running && ev.inside) {
      state.running = true;
      bus.emit(EVENT.DEPART, { zoneId: zone?.id, s: state.s, auto: true });
      lastZoneId = null;
    }

    registry.update(ctx, d);
    return ctx;
  }

  function dispose() {
    registry.dispose();
    alignment.dispose?.();
  }

  return {
    pack, bus, registry, state, ctx,
    update, dispose,
    setRoute, setTravel, setRunning, setDirection, reverse, setLane,
    setTrainSpec, setModel, setFormation, setView, setCameraMode,
    setTheme, setAhead, setDoorRequest, setAutoDwell, setAutoDepart,
    get alignment() { return alignment; },
    get route() { return route; },
    get chunks() { return chunks; },
    get zones() { return zones; },
    get train() { return train; },
  };
}

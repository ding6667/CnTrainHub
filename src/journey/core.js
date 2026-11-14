/**
 * core.js —— journey 框架的「普通话」。
 *
 * 这一层是纯 JS（不 import three、不碰 DOM），所以数据层 / 客流 / 时刻表这些
 * 纯逻辑模块可以放心引用，拿到 Node 里跑单测也不会炸。
 *
 * 【为什么要这一层】
 * 以后要做「长春局」「沈阳局」，只要换一套 pack（线路 + 站场 + 建筑 + 地形），
 * 运行时、分块调度、车门/停车区间判定、客流、时刻表、相机全部复用，
 * 不需要把 journey.js 复制一份再改。框架只认这里定义的形状，不认哈尔滨。
 *
 * 【坐标与单位】
 *  - 1 单位 = 1 米；+Y 上；线路里程 s 用「米」，route.nodes[].km 用「公里」。
 *  - 全局线路坐标：s 增大方向的前向向量 (sin θ, 0, -cos θ)，右向量 (cos θ, 0, sin θ)。
 *  - 列车永远固定在局部原点、车头朝 -Z；世界由 alignment.localMatrixAt() 逆变换过来。
 *  - 因此「局部 z < 0」= 行驶方向前方；局部 z > 0 = 车后。
 *
 * 【系统（System）契约】—— 所有可复用模块都长这样，注册表按 phase 升序调用：
 *   {
 *     id: 'track',                 // 唯一
 *     phase: 10,                   // 数字越小越先执行，见 SYSTEM_PHASE
 *     init?(ctx),                  // 只调一次
 *     update?(ctx, dt),            // 每帧
 *     onEvent?(type, payload, ctx),// 事件总线回调（可选）
 *     applyTheme?(theme, ctx),     // 可选钩子
 *     dispose?(),
 *   }
 *
 * 【Pack 契约】—— 一个省会 = 一个 pack：
 *   {
 *     id, name, origin, routes, themes, fleet, views, chunkLength,
 *     stationLayouts,            // { [stationId]: StationLayout }
 *     createAlignment(route, opts), createTrack(ctx), createTerrain(ctx),
 *     createBuildings(ctx), createStations(ctx), createPassengers(ctx),
 *     createTimetable(ctx), createCamera(ctx), createSceneSystem?(ctx),
 *   }
 *   全部工厂都是可选：缺哪个，运行时就跳过哪个，方便分批接入。
 */

// ------------------------------------------------------------------ 常量 ----

/** 真实铁路工程常用尺寸（米）。示意级建模按这些数对齐，别各模块自己拍脑袋。 */
export const RAIL = Object.freeze({
  gauge: 1.435,            // 标准轨距
  railHalf: 0.7175,        // 两股钢轨中心到线路中心的距离
  railHeadWidth: 0.075,
  railHeight: 0.17,
  sleeperSpacing: 0.6,
  sleeperLength: 2.6,
  sleeperThickness: 0.16,
  ballastWidth: 5.2,
  ballastDepth: 0.36,
  trackCenters: 5.0,       // 双线线间距（高铁常用 4.8~5.0）
  platformHeight: 1.25,    // 站台面高出轨顶
  platformEdge: 1.75,      // 站台边缘到线路中心
  platformWidth: 12,       // 岛式站台典型宽度
  platformLength: 450,     // 高铁站台有效长（16 辆长编约 420 m + 余量）
  maxCant: 0.12,           // 最大超高角（rad，约 7°）
  maxGrade: 0.02,          // 最大坡度 2%（高铁）
  catenaryHeight: 5.4,
  mastSpacing: 48,
  fenceOffset: 12,         // 防护栅栏距线路中心
  fenceHeight: 2.2,
});

/** 行驶方向。逻辑掉头只翻这个符号，列车几何绝对不旋转。 */
export const DIRECTION = Object.freeze({ FORWARD: 1, REVERSE: -1 });

/** 股道 / 进路。MAIN 是正线，STATION 是经道岔分出的到发线，DEPOT 是段管线。 */
export const LANE = Object.freeze({ MAIN: 'main', STATION: 'station', DEPOT: 'depot' });

/** 中国铁路双线按左侧行车（可配置，见 alignment.runningSide）。 */
export const RUNNING_SIDE = Object.freeze({ LEFT: 'left', RIGHT: 'right' });

/** 车门状态机。BLOCKED = 两端车门没有全部落在停车区间里，禁止开门。 */
export const DOOR_STATE = Object.freeze({
  CLOSED: 'closed', OPENING: 'opening', OPEN: 'open', CLOSING: 'closing', BLOCKED: 'blocked',
});

/** 系统执行顺序。同一 phase 按注册顺序。 */
export const SYSTEM_PHASE = Object.freeze({
  ALIGNMENT: 0, TERRAIN: 10, TRACK: 20, STATIONS: 30,
  BUILDINGS: 40, PASSENGERS: 50, TIMETABLE: 60, CAMERA: 90,
});

/** 事件名统一在这里，避免各模块拼字符串拼错。 */
export const EVENT = Object.freeze({
  ROUTE_CHANGE: 'route:change',
  DIRECTION_CHANGE: 'direction:change',
  REVERSE: 'train:reverse',
  SWITCH: 'track:switch',
  APPROACH: 'station:approach',
  ARRIVE: 'station:arrive',
  DEPART: 'station:depart',
  DOORS: 'train:doors',
  BOARD: 'passenger:board',
  ALIGHT: 'passenger:alight',
  SERVICE_DUE: 'timetable:due',
  CAMERA_MODE: 'camera:mode',
});

// ------------------------------------------------------------ 类型契约 ----
// 用 JSDoc typedef 写清楚形状，编辑器能补全，运行期不校验（保持零开销）。
//
/**
 * @typedef {Object} Frame 线路中心线上某里程处的空间姿态（全局线路坐标）。
 * @property {number} s        里程（米）
 * @property {number} x        x（东）
 * @property {number} y        高程（米，轨顶面）
 * @property {number} z        z（南，前向为负）
 * @property {number} yaw      航向角（rad），前向 = (sin yaw, 0, -cos yaw)
 * @property {number} pitch    坡度角（rad）= atan(grade)
 * @property {number} roll     超高角（rad）
 * @property {number} curvature 曲率 1/R（带符号，左正右负）
 * @property {number} grade    坡度 dy/ds
 * @property {number[]} right  右向量 [cos yaw, sin yaw]（xz 平面）
 */
/**
 * @typedef {Object} TrainSpec 一列车的可复用规格（纯数字，模块间只传这个）。
 * @property {string} modelId
 * @property {number} formation
 * @property {number} length     全长（米）
 * @property {number} halfWidth  半宽（米）
 * @property {number} height     车高（米）
 * @property {number} noseZ      车头在车体局部坐标的 z（负值）
 * @property {number} tailZ      车尾在车体局部坐标的 z（正值）
 * @property {number[]} carCenters 每节车中心的局部 z
 * @property {number[]} carLengths 每节车长
 * @property {number[]} doorZ    每节车车门中心的局部 z（两端各一处时按节列出）
 * @property {number} capacity   定员（人）
 * @property {number[]} seatsPerCar
 */
/**
 * @typedef {Object} StopZone 站台上的有效停车区间，s0/s1 是**线路绝对里程（米）**。
 * @property {string} id
 * @property {string} stationId
 * @property {number} trackIndex 到发线序号（0 = 正线）
 * @property {number} s0
 * @property {number} s1
 * @property {number} platformIndex
 * @property {number} length
 * @property {number} dwellSec  建议停站时分（秒）
 */
/**
 * @typedef {Object} StationLayout 真实站场布置。
 * @property {string} id
 * @property {string} name
 * @property {number} km             该站在所属线路上的累计里程（km，由集成层补）
 * @property {number} platformCount  站台数（"10 台"）
 * @property {number} trackCount     股道数（"22 线"）
 * @property {number} platformLength 站台有效长（米）
 * @property {number} platformWidth
 * @property {number[]} trackLengths 每条股道有效长（米）
 * @property {number[]} mainTracks   正线股道序号
 * @property {SwitchSpec[]} switches 道岔
 * @property {StopZone[]} stopZones
 * @property {string[]} sources      资料标题 + URL
 * @property {string} kmBasis        里程/规模推算口径
 */
/**
 * @typedef {Object} SwitchSpec
 * @property {string} id
 * @property {number} s          道岔中心里程（米）
 * @property {string} from       LANE.MAIN 等
 * @property {string} to         目标股道标识
 * @property {number} lateral    侧向偏移量（米，带符号）
 * @property {'entry'|'exit'} kind
 * @property {number} length     道岔区长度（米）
 */

// -------------------------------------------------------------- 数学工具 ----

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

/** 稳定整数哈希（FNV-1a + 混合），同一输入永远同一结果。 */
export function hash32(input) {
  const s = String(input);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** 可重现的伪随机序列（mulberry32），保证同一 seed 每次生成同一批客流/田块。 */
export function rng(seed) {
  let s = (typeof seed === 'number' ? seed >>> 0 : hash32(seed)) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 泊松分布抽样（小 λ 用连乘，大 λ 用正态近似），用于按现实客流量生成到站人数。 */
export function poisson(lambda, rand = Math.random) {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gauss(rand)));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do { k += 1; p *= rand(); } while (p > L);
  return k - 1;
}

function gauss(rand) {
  const u = Math.max(1e-9, rand());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

// -------------------------------------------------------------- 事件总线 ----

export function createBus() {
  const map = new Map();
  return {
    on(type, fn) {
      if (!map.has(type)) map.set(type, new Set());
      map.get(type).add(fn);
      return () => map.get(type)?.delete(fn);
    },
    off(type, fn) { map.get(type)?.delete(fn); },
    emit(type, payload) {
      const set = map.get(type);
      if (set) for (const fn of set) fn(payload);
      const all = map.get('*');
      if (all) for (const fn of all) fn({ type, payload });
    },
    clear() { map.clear(); },
  };
}

// ------------------------------------------------------------ 系统注册表 ----

/**
 * 把「很多个模块要每帧更新 / 要切主题 / 要销毁」这件事收敛成一处。
 * 新增省会时只管 register 自己的系统，不必改运行时主循环。
 */
export function createRegistry(bus) {
  const systems = [];
  let ctxRef = null;
  return {
    register(system) {
      if (!system?.id) throw new Error('system 必须有 id');
      if (systems.some((s) => s.id === system.id)) throw new Error(`重复注册系统: ${system.id}`);
      systems.push(system);
      systems.sort((a, b) => (a.phase ?? 50) - (b.phase ?? 50));
      if (ctxRef && system.init) system.init(ctxRef);
      if (bus && system.onEvent) {
        system._off = bus.on('*', ({ type, payload }) => system.onEvent(type, payload, ctxRef));
      }
      return system;
    },
    bind(ctx) { ctxRef = ctx; for (const s of systems) if (s.init && !s._inited) { s.init(ctx); s._inited = true; } },
    get(id) { return systems.find((s) => s.id === id) ?? null; },
    // enabled !== false 是统一的「系统开关」：UI 只需置 sys.enabled，不必改主循环
    update(ctx, dt) { for (const s of systems) if (s.update && s.enabled !== false) s.update(ctx, dt); },
    applyTheme(theme, ctx) { for (const s of systems) if (s.applyTheme) s.applyTheme(theme, ctx); },
    all() { return systems.slice(); },
    dispose() {
      for (const s of systems) { s._off?.(); if (s.dispose) s.dispose(); }
      systems.length = 0;
      bus?.clear();
    },
  };
}

/** 只是个语义化的包装，方便各模块导出「标准系统」。 */
export function defineSystem(def) { return def; }

// ---------------------------------------------- 停车区间 / 车门状态机 ----

/**
 * 「两端车门均未离开停车区间」判定 —— 需求 2 的核心规则。
 *
 * 大白话：列车中心在里程 s，车体局部 z（负数在前）。把每个车门换算成线路里程：
 *   doorMileage = s - dir * doorZ
 * dir = +1 时车头在 -Z 对应更大的里程（前方）；dir = -1 时反过来。
 * 只要最前和最后两个车门都落在 [s0, s1] 内，就允许开关门。
 *
 * @param {TrainSpec} train
 * @param {StopZone} zone
 * @param {number} s 列车中心里程（米）
 * @param {number} dir DIRECTION
 */
export function evaluateStop(train, zone, s, dir = DIRECTION.FORWARD) {
  if (!train || !zone || !train.doorZ?.length) {
    return { ok: false, inside: false, reason: 'NO_ZONE', doorMileages: [], frontMargin: 0, rearMargin: 0 };
  }
  const miles = train.doorZ.map((z) => s - dir * z);
  const lo = Math.min(...miles);
  const hi = Math.max(...miles);
  const frontMargin = lo - zone.s0;
  const rearMargin = zone.s1 - hi;
  const inside = frontMargin >= 0 && rearMargin >= 0;
  return {
    ok: inside,
    inside,
    doorMileages: miles,
    frontMargin,
    rearMargin,
    reason: inside ? 'OK' : frontMargin < 0 ? 'FRONT_OUT' : 'REAR_OUT',
  };
}

/**
 * 车门状态机：允许开才能开，离开区间强制关，停站时分到了自动进入关门锁。
 * 纯函数，输入输出都是普通对象，方便单测。
 */
export function nextDoorState(state, { canOpen, request, dt = 0, dwellSec = 30, openSec = 1.1 } = {}) {
  const timer = state?.timer ?? 0;
  const dwell = state?.dwell ?? 0;
  if (!canOpen) return { state: DOOR_STATE.CLOSED, timer: 0, dwell: 0 };
  switch (state?.state ?? DOOR_STATE.CLOSED) {
    case DOOR_STATE.OPENING:
      return timer + dt >= openSec
        ? { state: DOOR_STATE.OPEN, timer: 0, dwell }
        : { state: DOOR_STATE.OPENING, timer: timer + dt, dwell };
    case DOOR_STATE.OPEN: {
      const d = dwell + dt;
      if (request === false || d >= dwellSec) return { state: DOOR_STATE.CLOSING, timer: 0, dwell: d };
      return { state: DOOR_STATE.OPEN, timer: 0, dwell: d };
    }
    case DOOR_STATE.CLOSING:
      return timer + dt >= openSec
        ? { state: DOOR_STATE.CLOSED, timer: 0, dwell }
        : { state: DOOR_STATE.CLOSING, timer: timer + dt, dwell };
    default:
      return request === true
        ? { state: DOOR_STATE.OPENING, timer: 0, dwell: 0 }
        : { state: DOOR_STATE.CLOSED, timer: 0, dwell: 0 };
  }
}

// ------------------------------------------------------------ TrainSpec ----

/**
 * 由「车型配置 + 构建器返回的几何尺寸」生成纯数字规格。
 * 各模块只依赖 TrainSpec，不依赖 three 的 Group，也不依赖具体车型文件名。
 */
export function createTrainSpec({ modelId, formation, carLengths, gap, halfWidth = 1.68, height = 4.05, capacity = 0, seatsPerCar = [] }) {
  const lens = carLengths.slice();
  const total = lens.reduce((a, b) => a + b, 0) + gap * (lens.length - 1);
  const carCenters = [];
  const doorZ = [];
  let front = -total / 2;
  for (let i = 0; i < lens.length; i += 1) {
    const len = lens[i];
    carCenters.push(front + len / 2);
    // 每节车两端各一处门，门中心内收 2.2 m（真实车门距车体端部约 2~3 m）
    doorZ.push(front + 2.2, front + len - 2.2);
    front += len + gap;
  }
  return {
    modelId,
    formation,
    length: total,
    halfWidth,
    height,
    noseZ: -total / 2,
    tailZ: total / 2,
    carCenters,
    carLengths: lens,
    doorZ,
    capacity: capacity || seatsPerCar.reduce((a, b) => a + b, 0),
    seatsPerCar: seatsPerCar.length ? seatsPerCar.slice() : lens.map(() => Math.round((capacity || lens.length * 72) / lens.length)),
  };
}

// --------------------------------------------------------------- Pack ----

/** 校验并补全一个省会 pack 的默认字段，缺工厂就留空（运行时跳过）。 */
export function createPack(def) {
  if (!def?.id) throw new Error('pack 必须带 id');
  return {
    chunkLength: 400,
    runningSide: RUNNING_SIDE.LEFT,
    routes: [],
    themes: {},
    fleet: {},
    views: [],
    stationLayouts: {},
    ...def,
  };
}

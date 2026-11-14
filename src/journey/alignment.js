/**
 * alignment.js —— 铁路线路的「中心线」，整个框架的地基。
 *
 * 大白话：以前世界是一条笔直的 Z 轴，chunk 只做 `z = travel - id*400` 的平移。
 * 现在我们把「真实里程 s（米）」送进这里，换回一个带航向 yaw、坡度 pitch、
 * 超高 roll 的空间坐标；再把「列车所在里程 s0」的坐标系整个取逆，
 * 得到每个 chunk / 每段轨道 / 每座站台该摆在局部空间的哪个位置、转多少度。
 *
 *   Frame(s)  = 线路全局姿态
 *   Local(s)  = inverse(Frame(s0)) · Frame(s)     ← 所有场景物体用这个
 *   dir = -1 时再左乘 Ry(π)：列车车身不转，但「前方」仍是 -Z（逻辑掉头）
 *
 * 这样曲线、上下坡、双向线间距、经道岔分出的到发线都只在这一处算，
 * 车站 / 地形 / 轨道 / 相机模块一律不重复实现数学（需求 8）。
 *
 * 【曲线怎么来的】不是随手画正弦，而是按真实选线习惯生成「直线段 + 圆曲线」，
 * 最小曲线半径由设计时速决定（350→7000 m、250→4500 m、160→2000 m），
 * 两端用缓和段把曲率从 0 平滑抬起来；纵坡同理，限制在 2% 内并做竖曲线过渡。
 * 关键：**所有车站前后各 700 m 强制压成直线平坡**（mask 平滑过渡），
 * 否则站台会歪、停车区间判定会失真。曲率是原生量，位置由积分得到，
 * 所以航向连续、不会在块与块之间突然折一下。
 *
 * 【到发线 / 道岔】lane 描述一条从正线分出、平行穿过站台、再汇回正线的股道。
 * laneOffset(s) 给的是横向偏移量：进站道岔前 900 m 起用 300 m 缓和段横移，
 * 站台范围保持恒定，出发道岔后再用 300 m 收回。列车换 lane 时参考系随之横移，
 * 视觉上就是「车没动，正线自己岔开了」——和固定车厢的世界滚动模型天然吻合。
 *
 * 【精度】按 5 m 步长预积分整条线路（921 km ≈ 18.4 万采样，约 3 MB），
 * 查表 O(1)；只在切换线路时算一次。chunk 用块中心里程取矩阵，400 m 块的
 * 端部航向误差 ≤ 200/R ≈ 1.6°，肉眼不可见；轨道本身用 sampleLocal 逐点精确放样。
 */
import * as THREE from 'three';
import {
  RAIL, DIRECTION, LANE, RUNNING_SIDE,
  clamp, lerp, smoothstep, hash32, rng,
} from './core.js';

const STEP = 5;                       // 积分步长（米）
const STATION_FLAT_M = 700;           // 车站前后强制直线平坡的半长
const STATION_FADE_M = 500;           // 从强制平直到正常曲线的过渡长度
const ONE = new THREE.Vector3(1, 1, 1);
const RY_PI = new THREE.Matrix4().makeRotationY(Math.PI);

/** 设计时速 → 最小曲线半径（示意级选线口径，真实规范比这更细）。 */
export function minRadiusForSpeed(speedKmh) {
  if (speedKmh >= 300) return 7000;
  if (speedKmh >= 240) return 4500;
  if (speedKmh >= 190) return 3200;
  if (speedKmh >= 150) return 2000;
  return 1200;
}

/** 带缓和段的「窗函数」：区间 [a,b] 内为 1，两端各用 tr 平滑抬起/落下。 */
function bump(s, a, b, tr) {
  if (s <= a - tr || s >= b + tr) return 0;
  return smoothstep((s - (a - tr)) / tr) * (1 - smoothstep((s - b) / tr));
}

/**
 * 创建一条线路的 alignment。
 * @param {object} route  route-data.js 的 Route（需 officialKm / speed / nodes）
 * @param {object} opts   { seed, runningSide, stationLayouts, minRadius, maxGrade, stationFlatM }
 */
export function createAlignment(route, opts = {}) {
  const speed = route?.speed ?? 200;
  const lengthM = Math.max(1000, (route?.officialKm ?? 1) * 1000);
  const n = Math.ceil(lengthM / STEP);
  const minR = opts.minRadius ?? minRadiusForSpeed(speed);
  const maxGrade = opts.maxGrade ?? RAIL.maxGrade;
  const flatM = opts.stationFlatM ?? STATION_FLAT_M;
  const fadeM = opts.stationFadeM ?? STATION_FADE_M;
  const runningSide = opts.runningSide ?? RUNNING_SIDE.LEFT;
  const rand = rng(opts.seed ?? hash32(`align:${route?.id ?? 'route'}`));
  const layoutMap = opts.stationLayouts ?? {};

  // ---------------------------------------------------------- 站点信息 ----
  const stations = (route?.nodes ?? [])
    .filter((x) => x.role === 'hub' || x.role === 'local')
    .map((x) => ({
      name: x.name,
      stationId: x.stationId ?? x.name,
      s: x.km * 1000,
      platformLength: layoutMap[x.stationId]?.platformLength
        ?? layoutMap[x.name]?.platformLength ?? RAIL.platformLength,
    }))
    .sort((a, b) => a.s - b.s);

  /** 站点附近把曲率与坡度压到 0，保证站场笔直水平。 */
  function stationMask(s) {
    let m = 1;
    for (const st of stations) {
      const d = Math.abs(s - st.s);
      if (d < flatM + fadeM) m *= smoothstep((d - flatM) / fadeM);
    }
    return m;
  }

  // ------------------------------------------------- 平面 / 纵断面元素 ----
  const curves = [];
  const grades = [];
  {
    let s = 1400;
    let sign = rand() < 0.5 ? -1 : 1;
    while (s < lengthM - 3000) {
      const straight = 900 + rand() * 2200;
      s += straight;
      if (s > lengthM - 2600) break;
      const arc = 700 + rand() * 1700;
      const b = Math.min(s + arc, lengthM - 1200);
      const radius = minR * (1 + rand() * 1.6);
      curves.push({ a: s, b, k: sign / radius, tr: Math.min(250, (b - s) / 3) });
      sign = rand() < 0.78 ? -sign : sign;
      s = b + 300 + rand() * 700;
    }
  }
  {
    let s = 800;
    while (s < lengthM - 2000) {
      const len = 1400 + rand() * 3200;
      const b = Math.min(s + len, lengthM - 800);
      const g = (rand() < 0.5 ? -1 : 1) * (0.003 + rand() * (maxGrade - 0.003));
      grades.push({ a: s, b, g, tr: 420 });
      s = b + 600 + rand() * 1200;
    }
  }

  // ------------------------------------------------------------ 预积分 ----
  const kArr = new Float32Array(n + 1);
  const gArr = new Float32Array(n + 1);
  for (const c of curves) {
    const i0 = Math.max(0, Math.floor((c.a - c.tr) / STEP));
    const i1 = Math.min(n, Math.ceil((c.b + c.tr) / STEP));
    for (let i = i0; i <= i1; i += 1) kArr[i] += c.k * bump(i * STEP, c.a, c.b, c.tr);
  }
  for (const v of grades) {
    const i0 = Math.max(0, Math.floor((v.a - v.tr) / STEP));
    const i1 = Math.min(n, Math.ceil((v.b + v.tr) / STEP));
    for (let i = i0; i <= i1; i += 1) gArr[i] += v.g * bump(i * STEP, v.a, v.b, v.tr);
  }
  for (let i = 0; i <= n; i += 1) {
    const m = stationMask(i * STEP);
    kArr[i] *= m;
    gArr[i] *= m;
  }

  const thArr = new Float32Array(n + 1);
  const xArr = new Float32Array(n + 1);
  const yArr = new Float32Array(n + 1);
  const zArr = new Float32Array(n + 1);
  for (let i = 1; i <= n; i += 1) {
    const kMid = 0.5 * (kArr[i - 1] + kArr[i]);
    thArr[i] = thArr[i - 1] + kMid * STEP;
    const thMid = 0.5 * (thArr[i - 1] + thArr[i]);
    xArr[i] = xArr[i - 1] + Math.sin(thMid) * STEP;
    zArr[i] = zArr[i - 1] - Math.cos(thMid) * STEP;
    yArr[i] = yArr[i - 1] + 0.5 * (gArr[i - 1] + gArr[i]) * STEP;
  }

  function at(arr, s) {
    const t = clamp(s / STEP, 0, n);
    const i = Math.min(n - 1, Math.floor(t));
    return lerp(arr[i], arr[i + 1], t - i);
  }

  // ---------------------------------------------------------- 线间距 ----
  /** 当前行驶方向占用的那条正线，相对线路中心的横向偏移（米）。 */
  function runningOffset(dir = DIRECTION.FORWARD) {
    const side = runningSide === RUNNING_SIDE.LEFT ? -1 : 1;
    return (dir === DIRECTION.REVERSE ? -side : side) * RAIL.trackCenters / 2;
  }
  /** 对向正线相对当前运行线的横向偏移（画双线时用）。 */
  function otherTrackLateral(dir = DIRECTION.FORWARD) { return -2 * runningOffset(dir); }

  // ------------------------------------------------------------ 股道 ----
  /**
   * 生成一条「经道岔进出站」的到发线描述。
   * @param {number} stationS 站中心里程（米）
   * @param {number} trackIndex 第几条到发线（1 起）
   * @param {object} o { offset, side, approach, transition, flatHalf, type }
   */
  function stationLane(stationS, trackIndex = 1, o = {}) {
    const type = o.type ?? LANE.STATION;
    const side = o.side ?? 1;
    const magnitude = o.offset ?? (6.5 + (trackIndex - 1) * RAIL.trackCenters);
    return {
      id: `${type}:${Math.round(stationS)}:${trackIndex}`,
      type,
      s: stationS,
      trackIndex,
      offset: side * magnitude,
      approach: o.approach ?? 900,
      transition: o.transition ?? 300,
      flatHalf: o.flatHalf ?? (RAIL.platformLength / 2 + 220),
    };
  }

  /** 车辆段进路：分岔更远、横移更大、站内有独立股道。 */
  function depotLane(depotS, o = {}) {
    return stationLane(depotS, 1, {
      type: LANE.DEPOT, offset: 26, approach: 1100, transition: 340,
      flatHalf: 420, side: o.side ?? -1, ...o,
    });
  }

  /** 某里程处某条 lane 的横向偏移（米）。字符串 'main' 或未传都返回 0。 */
  function laneOffset(s, lane) {
    if (!lane || lane === LANE.MAIN || typeof lane === 'string' && lane !== LANE.STATION && lane !== LANE.DEPOT) return 0;
    if (typeof lane === 'string') return 0;
    const d = s - lane.s;
    const a = lane.approach;
    const t = Math.max(1, lane.transition);
    const f = lane.flatHalf;
    if (d <= -a) return 0;
    if (d < -a + t) return lane.offset * smoothstep((d + a) / t);
    if (d <= f) return lane.offset;
    if (d < f + t) return lane.offset * (1 - smoothstep((d - f) / t));
    return 0;
  }

  /** 道岔中心里程（给 track.js 摆岔尖、给 HUD 报进路）。 */
  function switchPoints(lane) {
    if (!lane || typeof lane === 'string') return [];
    return [
      { id: `${lane.id}:in`, s: lane.s - lane.approach, kind: 'entry', lateral: lane.offset, length: lane.transition },
      { id: `${lane.id}:out`, s: lane.s + lane.flatHalf + lane.transition, kind: 'exit', lateral: lane.offset, length: lane.transition },
    ];
  }

  // ------------------------------------------------------------ Frame ----
  const curvatureAt = (s) => at(kArr, s);
  const gradeAt = (s) => at(gArr, s);
  const yawAt = (s) => at(thArr, s);

  /** 曲线限速（km/h）：按未平衡横向加速度 1.0 m/s² 粗算，供 HUD 显示。 */
  function speedLimitAt(s) {
    const k = Math.abs(curvatureAt(s));
    if (k < 1e-7) return speed;
    return Math.min(speed, Math.sqrt(1.0 / k) * 3.6);
  }

  /** 超高角（rad）：v²/(gR)，限幅 ±RAIL.maxCant。 */
  function cantAt(s) {
    const v = Math.min(speed, 300) / 3.6;
    return clamp((v * v * curvatureAt(s)) / 9.81, -RAIL.maxCant, RAIL.maxCant);
  }

  /**
   * 全局线路坐标下的空间姿态。
   * @param {number} s 里程（米）
   * @param {object} o { dir, lane, lateral } lateral = 在 lane 之上再横移多少米（画对向线用）
   * @returns {import('./core.js').Frame}
   */
  function frameAt(s, o = {}) {
    const dir = o.dir ?? DIRECTION.FORWARD;
    const ss = clamp(s, 0, lengthM);
    const yaw = yawAt(ss);
    const grade = gradeAt(ss);
    const curv = curvatureAt(ss);
    const lateral = laneOffset(ss, o.lane) + runningOffset(dir) + (o.lateral ?? 0);
    const cx = Math.cos(yaw);
    const sy = Math.sin(yaw);
    return {
      s: ss,
      x: at(xArr, ss) + cx * lateral,
      y: at(yArr, ss),
      z: at(zArr, ss) + sy * lateral,
      yaw,
      pitch: Math.atan(grade),
      roll: cantAt(ss),
      curvature: curv,
      grade,
      right: [cx, sy],
      speedLimit: speedLimitAt(ss),
    };
  }

  function matrixFrom(f) {
    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(f.pitch, -f.yaw, -f.roll, 'YXZ'),
    );
    return new THREE.Matrix4().compose(
      new THREE.Vector3(f.x, f.y, f.z), q, ONE,
    );
  }

  /**
   * 局部矩阵：把「里程 s 处的全局坐标」搬进「列车固定在原点、车头朝 -Z」的场景坐标。
   * 所有 chunk / 轨道 / 站台 / 地形都用它，绝不各写一套。
   */
  function localMatrixAt(s, s0, o = {}) {
    const dir = o.dir ?? DIRECTION.FORWARD;
    const A = matrixFrom(frameAt(s, { dir, lane: o.lane, lateral: o.lateral ?? 0 }));
    const B = matrixFrom(frameAt(s0, { dir, lane: o.lane, lateral: 0 })).invert();
    const M = new THREE.Matrix4().multiplyMatrices(B, A);
    if (dir === DIRECTION.REVERSE) M.premultiply(RY_PI);
    return M;
  }

  /** localMatrixAt 的纯数字版本（不含 three 对象，便于纯逻辑模块取数值）。 */
  function localFrameAt(s, s0, o = {}) {
    const m = localMatrixAt(s, s0, o);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    m.decompose(p, q, sc);
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    return { x: p.x, y: p.y, z: p.z, yaw: -e.y, pitch: e.x, roll: -e.z };
  }

  /**
   * 沿线密集采样并返回**局部坐标**下的点 / 基向量，供轨道带状网格与栅栏逐点放样。
   * @returns {Array<{s,position:number[],right:number[],up:number[],forward:number[],matrix:THREE.Matrix4}>}
   */
  function sampleLocal(trainS, fromM, toM, step = 20, o = {}) {
    const out = [];
    const dir = o.dir ?? DIRECTION.FORWARD;
    const p = new THREE.Vector3();
    const r = new THREE.Vector3();
    const u = new THREE.Vector3();
    const f = new THREE.Vector3();
    for (let s = fromM; s <= toM + 1e-6; s += step) {
      const m = localMatrixAt(s, trainS, o);
      p.setFromMatrixPosition(m);
      r.set(1, 0, 0).transformDirection(m);
      u.set(0, 1, 0).transformDirection(m);
      f.set(0, 0, -1).transformDirection(m);
      out.push({
        s,
        position: [p.x, p.y, p.z],
        right: [r.x, r.y, r.z],
        up: [u.x, u.y, u.z],
        forward: [f.x, f.y, f.z],
        matrix: m,
        laneOffset: laneOffset(s, o.lane),
        grade: gradeAt(s),
        curvature: curvatureAt(s),
        dir,
      });
    }
    return out;
  }

  /** 站点压平区间，供 stations.js 判断「站台必须放在直线平坡上」。 */
  function flattenSpans() {
    return stations.map((st) => ({ s0: st.s - flatM, s1: st.s + flatM, centerS: st.s, name: st.name, stationId: st.stationId }));
  }

  return {
    route,
    lengthM,
    step: STEP,
    runningSide,
    stations,
    curves,
    grades,
    frameAt,
    localMatrixAt,
    localFrameAt,
    sampleLocal,
    laneOffset,
    stationLane,
    depotLane,
    switchPoints,
    runningOffset,
    otherTrackLateral,
    curvatureAt,
    gradeAt,
    yawAt,
    cantAt,
    speedLimitAt,
    flattenSpans,
    stationMask,
    dispose() { /* 只持有 TypedArray，交给 GC */ },
  };
}

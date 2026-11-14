/**
 * camera.js —— 旅程相机 / 交互系统（v2 框架标准 System）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 一、联网核实的真实资料（标题 + URL + 关键事实），本文件的尺寸/交互都对齐它们。
 *     只做「示意级复刻」，下列数值用于确定量级与方向，不冒充工程图纸。
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * [1] 国家铁路局《CRH3 型时速 300~350 公里动车组总体技术方案》
 *     https://source.nra.gov.cn/jglz/fgzd/gfwj/201804/P020220801568641766947.pdf
 *     事实：司机室设在车头、司机座椅「面向行驶方向」居中；司机室前窗为三维曲面
 *     玻璃、多层电加热、上下两块；乘客可透过司机室后部透明隔断看到列车运行前方
 *     景色。→ 驾驶室在车头最前端，前窗是唯一瞭望面，所以 cab 机位必须贴车头 -Z 端。
 *
 * [2] 国家铁路局《CRH2 型时速 300~350 公里动车组总体技术方案》
 *     https://www.nra.gov.cn/jglz/fgzd/gfwj/201804/P020220801568620150499.pdf
 *     事实：司机室前窗三维曲面玻璃、与车体曲面平滑过渡、满足 UIC 651 抗冲击
 *     （1 kg 铝弹 510 km/h 不穿透）；前窗「具有充分的视野，保障信号确认和标志识别」。
 *
 * [3]《动车组司机对驾驶环境的可达性探讨》（中国期刊网）
 *     http://www.chinaqking.com/yc/2021/3016958.html
 *     事实：UIC 651 规定司机坐姿眼睛距地板面 1350~1530 mm（带可调踏板取 1530）；
 *     前方高信号在「距缓冲器前端 10 m、轨上 6.3 m」、低信号在「15 m、轨面」处必须
 *     可见；前窗分 A 主视觉 / B 辅助 / C 外围三区，有效前方视野约左右各 35°、
 *     向上 25°、向下 35°。→ 司机视线高度（加车地板离轨约 1.2~1.4 m 后约 2.5~2.9 m）
 *     与「朝前略向下看」的依据；本文件 cab 取 y ≈ height*0.72 ≈ 2.9 m。
 *
 * [4]《探秘京广高铁"子弹头"驾驶室》（中新社报道，泰华网转载）
 *     https://newsthaicn.com/?p=69672
 *     事实：高铁驾驶室拥有 180° 全景前挡玻璃、宽大电子仪表操作台；司机作业标准是
 *     「彻底瞭望、确认信号、手比眼看」，单人驾驶连续不超 4 小时。→ 前窗视野开阔、
 *     相机应朝前方大范围瞭望，而不是朝车尾。
 *
 * [5]《Head shape design of Chinese 450 km/h high-speed trains...》(Design Research Society)
 *     https://dl.designresearchsociety.org/context/iasdr/article/1079/viewcontent/231.pdf
 *     事实：以 CR400-BF 头型为基准参数化：头车长度 26.5 m、流线区（鼻锥）长度
 *     14.5 m、车高 4.05 m、车宽 3.34 m。→ 鼻锥很长（十几米），所以「相机放到
 *     noseZ 外侧一点点」是示意做法；车高 4.05 m 与 core.js 默认 height 一致。
 *
 * [6]《那些又潮又酷的高铁"头型"怎样炼成?》（工人日报 2019-02-22）
 *     https://www.workercn.cn/papers/grrb/2019/02/22/6/grrb201902226.pdf
 *     事实：CR400BF 头型比和谐号长约 2 m，车头总长接近 10 m；两侧设导流槽、由
 *     鼻锥引流产生下压力。→ 车头/鼻锥的外伸量级；相机绝不能落在这段壳体内部。
 *
 * [7] Trainz Wiki《Help:Driver Camera View Modes》
 *     https://wiki.trainzsimulator.com/wiki/Help:Driver_Camera_View_Modes
 *     事实：5 种机位 Cab Interior / Chase / Lineside(static + tracking) /
 *     Free Roaming / Map。Chase「固定于选定车辆、可绕其旋转 + 滚轮缩放」；
 *     Lineside static「固定方向，让被跟踪物体进入、穿过、离开画面」，tracking
 *     「位置固定但随目标 pan」；Free Roaming「滚轮缩放、方向键转向/升降」。
 *     → 本文件 relative(≈Chase) / absolute(≈Lineside static+orbit) 双模式与交互映射。
 *
 * [8] Train Simulator Classic 2024 User Guide（Manuals+ 中文镜像）
 *     https://zh-cn.manuals.plus/m/d830c055ec361aff6e725ff7420a3d61e89486599081b36f444c0314554f48cc
 *     事实：机位 1 Cab / 2 External Front / 4 Trackside；「方向键调位置、鼠标滚轮
 *     缩放、右键+拖动平移」；Graphics 选项里 Field of View 可调。→ FOV 可调、
 *     滚轮/拖动是模拟器通用手势。
 *
 * [9] Open Rails《Running a North American Steam Locomotives in Open Rails》
 *     https://static.openrails.org/files/Running-NA-Steam-Locomotives.pdf
 *     事实：机位含 2D/3D Cab、Outside Front/Rear、Trackside、Passenger、Brakeman、
 *     Free Camera；「滚轮 = 改 Field of View（zoom）」「按住右键移动鼠标 = 环视」；
 *     Pan/Tilt 如三脚架、Track Camera 绕目标旋转。→ 机位命名清单与 orbit 语义。
 *
 * [10] Stack Overflow《How to remove transparency here》
 *     https://www.stackoverflow.com/q/52097591
 *     事实：把 PerspectiveCamera 的 near 从 1 改到 0.01 即解决「贴近几何被近裁剪
 *     面切掉」；默认 FrontSide 背面剔除会让「从物体内部看」变透明/看不见，可设
 *     material.side = THREE.DoubleSide。→ cab 压小 near 的依据，以及「隐藏/双面化
 *     车头外壳」这一备选防穿模手段的出处。
 *
 * [11]《Three.js 透视相机完全指南》（稀土掘金）
 *     https://www.juejin.cn/post/7603584155784626226
 *     事实：near 是「相机能看到的最近距离」，比 near 更近的物体被裁剪；near 的
 *     作用之一是「避免穿模：防止相机进入物体内部时看到内部结构」；far 决定深度
 *     精度。→ 近裁剪面定义与防穿模关系。
 *
 * [12] threejs-errors-rendering SKILL.md（GitHub，排错清单）
 *     https://github.com/Impertio-Studio/Three.js-Claude-Skill-Package/blob/6c190f0db95d6e4b77d7843d181c6d3325c09d0e/skills/source/threejs-errors/threejs-errors-rendering/SKILL.md
 *     事实：相机在网格内部会黑屏；near 不要设 0（会 z-fighting）；改动
 *     fov / aspect / near / far 后必须调 camera.updateProjectionMatrix()；
 *     material.side 默认 FrontSide，背面被剔除。→ 改 near/fov 后刷新投影矩阵。
 *
 * [13] MDN《EventTarget: addEventListener() method》
 *     https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener
 *     事实：wheel / mousewheel / touchstart / touchmove 挂在 window / document /
 *     document.body 时 passive 默认为 true；要 preventDefault 必须显式写
 *     { passive: false }；passive 监听里 preventDefault 会被忽略；removeEventListener
 *     必须传入同一个函数引用才能解绑。→ wheel 必须用 passive:false、dispose 要
 *     保留 handler 引用逐个解绑。
 *
 * [14] MDN《touch-action CSS property》
 *     https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action
 *     事实：自定义手势的画布应设 touch-action: none；Pointer events 下浏览器一旦
 *     接管手势会发 pointercancel。→ 触屏用 pointer events + pointercancel 处理。
 *
 * [15] three.js 官方文档《PerspectiveCamera》
 *     https://threejs.org/docs/pages/PerspectiveCamera.html
 *     事实：PerspectiveCamera(fov, aspect, near, far) 及属性 fov / near / far、
 *     方法 updateProjectionMatrix()；Math 下 Vector3 / Matrix4 / Quaternion /
 *     Euler / Spherical 均为真实类。→ 本文件只用真实存在的 API，不编造类或方法。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 二、本文件设计（大白话）
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 坐标（core.js / config.js 的硬约定）：列车永远固定在局部原点、**车头朝 -Z**，
 * 局部 z<0 是行驶前方，z>0 是车后；世界按里程往 +Z 滚过去。于是「看前方场景」
 * 的机位必须把相机放在车后(+Z)、让视点(target)落在前方(-Z)。旧版 hero 曾把
 * 方向搞反朝车尾看，刚建出来的站房全在镜头背后——下面每个前方机位都按
 * 「相机 +Z、视点 -Z」重新给 offset/aim。rear 是**刻意**回望才反过来。
 *
 * 关于掉头：framework.js 的 reverse() 只翻 state.dir，列车 Group 一个角度都不改；
 * 分块摆位靠 alignment 的世界 Ry(π) 保证「行驶前方始终是 -Z」。所以车身从不
 * 旋转、相机参考系不随 dir 翻转，cab 永远在 -Z 车头端。DIRECTION_CHANGE /
 * REVERSE 事件只用来刷新内部方向记录与重算基准，不镜像相机。
 *
 * 双模式（单一数据源 state，display 缓存只做阻尼显示，绝不逐帧 += 直接改相机）：
 *   - relative：anchor 在**车身局部系**（车身在原点，等价于世界坐标）；相机 =
 *     anchor + 球坐标(distance, yaw, pitch)，每帧 lookAt(anchor)。换车型/编组/
 *     掉头时只按 train.length 给 anchor.z 加一个「长编后撤」量 + 用户中键偏移，
 *     **不重置**用户调好的 yaw/pitch/distance（这是需求 7 的关键）。
 *   - absolute：anchor 是**世界固定点**（轨旁机位，按 preset.offset 或「冻结当前
 *     观察中心」得到），不随 train / dir / s 变化；相机仍绕它 orbit，列车（本框架
 *     里是滚动的世界景物）驶过画面。属于示意级等价。
 *
 * 交互（自己实现 pointer 处理，**不再 new OrbitControls**，避免和旧 controls 抢事件）：
 *   滚轮          → distance（relative = 到车身锚点距离；absolute = 到世界锚点距离），
 *                   wheel 监听 { passive:false } 并 preventDefault()，不让页面滚。
 *   按住中键拖动  → 改 anchor 的 x/y（镜头相对车身的横向/高度偏移），**不改角度**。
 *   按住左键拖动  → 改 yaw / pitch。
 *   右键          → 不处理（保留给菜单）。
 *   触屏          → 单指旋转(yaw/pitch)，双指缩放(distance)，用 pointer events +
 *                   pointercancel + canvas 的 touch-action:none。
 *   全部 clamp（distance 8~600、pitch -1.2~1.35 rad、anchor 偏移限幅、fov 20~100），
 *   另有轨顶净空：相机与视点都不低于 y=0.6，杜绝中键下拖把镜头拖进地面，
 *   带阻尼：state 是唯一目标数据源，disp 每帧用 1-exp(-k*dt) 朝 state 收敛，
 *   相机由 disp 纯函数算出来，杜绝旧版 controls.target.z += (focusZ-z)*0.08
 *   那种「数据源与显示值混在一起、切机位后慢慢爬」的累积误差。
 *
 * ★ 驾驶室防穿模策略（需求 7 重点，写清楚给集成层看）：
 *   主策略 = **把相机放到车壳体外、鼻锥前沿再往前一点点**，绝不进车体网格。
 *   具体用 ctx.train.noseZ / height 算：相机 z = noseZ - 0.6（比车头最前端还靠
 *   前 0.6 m，属于外部空间）、y = height*0.72（≈2.9 m，见资料[3][5]）、x≈0；
 *   朝 -Z 略向下（CAB_TILT≈1.4°）lookAt 前方 200 m 处。因为相机在车头前方且
 *   朝前看，整列车都在相机背后(+Z)，视野里根本没有车体网格，自然看不到
 *   backface 空洞/黑块，也不需要隐藏任何外壳。
 *   同时把 cam.near 临时从 0.5 压到 0.15（0.1~0.2 区间，见资料[10][11]），
 *   防止贴脸时近裁剪面把前窗上沿/仪表台切出黑边；离开 cab 立即恢复 0.5，
 *   每次改 near/fov 都调 cam.updateProjectionMatrix()（资料[12]）。
 *   【备选方案】若集成层以后想真的看到「司机室内部 + 前窗框」，可改用
 *   layers 屏蔽车头外壳，或把 shell 材质临时 side=THREE.DoubleSide /
 *   visible=false，并在切走时恢复（资料[10][12]）。本模块不依赖任何具体 mesh
 *   名字，故不擅自遍历 scene 改材质——那属于集成层的活；这里只用最稳的
 *   「相机体外 + 压 near」方案，边界干净、切走零残留。
 *
 * 事件 / 清理：onEvent 监听 EVENT.CAMERA_MODE / 'camera:view' / 'train:spec' /
 * EVENT.DIRECTION_CHANGE / EVENT.REVERSE / 'theme:change'；applyTheme 只微调相机
 * 自身 FOV 做氛围示意，exposure / fog / renderer 全局状态一律不碰（集成层负责）。
 * dispose() 把全部 DOM 监听按同一函数引用逐个 removeEventListener，并恢复
 * canvas 的 touch-action，杜绝重复绑定。
 *
 * 导出：CAMERA_PRESETS（数组）+ createCameraRig(ctx, opts) → System。
 * System 上另挂集成层方法：setPreset / setMode / setTrainSpec / setDirection /
 * setFov / setFollow / getState / target(THREE.Vector3，兼容旧 controls.target) /
 * dispose；sys.state 供 HUD 与调试钩子读取。
 *
 * 用到的 three 0.180 真实 API 仅：Vector3(.set/.copy)、camera.position.copy、
 * camera.lookAt、camera.fov/near/far 属性、camera.updateProjectionMatrix()。
 * 不 import addons、不 new OrbitControls、不 fetch、publicDir:false 兼容。
 *
 * 说明：height*0.72、noseZ-0.6、长编后撤系数、follow 呼吸、主题 FOV 偏置、
 * 各 preset 的 offset/aim 均为「示意级近似」，真实尺寸一律以 TrainSpec 为准。
 * ═══════════════════════════════════════════════════════════════════════════
 */
import * as THREE from 'three';
import { EVENT, SYSTEM_PHASE, DIRECTION, clamp, lerp } from './core.js';
import { CAMERA } from './config.js';

/**
 * 机位预设。每项 { id, label, mode, offset, aim, fov?, distance?, yaw?, pitch?, note }。
 * offset / aim 都是同一坐标系下的三元 [x,y,z]（不再是旧 VIEWS 的单个 aim z）：
 *   - relative：offset 是相机相对车身的位置，aim 是视点（车身局部坐标）。
 *               「看前方」机位一律 offset.z>0（车后）、aim.z<0（前方）。
 *   - absolute：offset 是**世界固定锚点**（orbit 中心 + lookAt 点），另给
 *               distance/yaw/pitch 作为初始球坐标；aim 仅作 HUD 示意。
 * 球坐标约定：yaw=0 → 相机在 anchor 的 +Z 侧朝 -Z 看；pitch>0 → 相机在上方俯视。
 */
export const CAMERA_PRESETS = [
  {
    id: 'cab', label: '司机视角', mode: 'relative',
    offset: [0, 2.9, -106], aim: [0, 0.8, -306], fov: 60,
    note: '驾驶室：offset 仅示意，运行时按 train.noseZ / height 重算（相机 z=noseZ-0.6 在车壳体外），near 压到 0.15。朝 -Z 略向下看前方 200 m。',
  },
  {
    id: 'hero', label: '英雄机位', mode: 'relative',
    offset: [38, 14, 58], aim: [0, 2.4, -46], fov: 52,
    note: '车后(+Z)右上方看车头 3/4 侧与前方站房，视点在 -Z。修正旧版放错方向朝车尾看的问题。',
  },
  {
    id: 'side', label: '侧向平视', mode: 'relative',
    offset: [76, 5.5, 6], aim: [0, 2.4, -12], fov: 48,
    note: '正侧平视，yaw 接近 90°，看车身腰线与车窗带。',
  },
  {
    id: 'above', label: '俯瞰线路', mode: 'relative',
    offset: [0, 118, 96], aim: [0, 0, -130], fov: 52,
    note: '正上方偏后大俯角俯瞰线路与站场；16 辆长编自动整体后撤收进画面。',
  },
  {
    id: 'station', label: '进站视角', mode: 'relative',
    offset: [-36, 17, 72], aim: [0, 3.5, -170], fov: 46,
    note: '低机位长焦看前方进站站房，相机在车后 +Z、视点在远处 -Z。',
  },
  {
    id: 'skyline', label: '城市天际线', mode: 'relative',
    offset: [140, 82, 196], aim: [0, 24, -180], fov: 44,
    note: '远景高机位看城市天际线，distance≈405 m 落在 8~600 clamp 内。',
  },
  {
    id: 'rear', label: '车尾回望', mode: 'relative',
    offset: [24, 9, -78], aim: [0, 2.4, 66], fov: 52,
    note: '刻意回望：相机在车头前方(-Z)、视点在车后(+Z)，看整列车与车尾。这是唯一朝车尾的机位，不是方向 bug。',
  },
  {
    id: 'trackside', label: '轨旁固定机位', mode: 'absolute',
    offset: [16, 3.2, 0], aim: [0, 2.4, -70], distance: 30, yaw: 1.35, pitch: 0.1, fov: 52,
    note: '轨旁世界固定锚点(offset)，不随列车跑动；左键绕该点 orbit、滚轮改到锚点距离，列车（滚动的世界景物）驶过画面。',
  },
  {
    id: 'orbit', label: '自由环绕', mode: 'absolute',
    offset: [0, 2.4, 0], aim: [0, 2.4, -60], distance: 90, yaw: 0.25, pitch: 0.35, fov: 52,
    note: '自由相机：绕线路中心这一世界固定点 orbit，纯绝对机位，可任意旋转/缩放。',
  },
];

// ------------------------------------------------------------------ 常量 ----
const BASE_NEAR = CAMERA.near;          // 0.5，离开 cab 恢复它
const CAB_NEAR = 0.15;                  // cab 临时压到 0.1~0.2（资料[10][11]）
const MIN_DIST = CAMERA.minDistance;    // 8
const MAX_DIST = CAMERA.maxDistance;    // 600
const PITCH_MIN = -1.2;                 // rad
const PITCH_MAX = 1.35;                 // rad
const FOV_MIN = 20;
const FOV_MAX = 100;
const PAN_LIMIT_X = 140;                // 中键 anchor 横向限幅（米）
const PAN_LIMIT_Y_UP = 70;              // 中键 anchor 向上限幅（米）
const PAN_LIMIT_Y_DOWN = 12;            // 向下限幅：别把观察中心拖到轨面下太深
// 轨顶面 y=0、路基面 -0.68、地面 -3.4。相机与视点都不许落到轨顶以下，
// 否则中键一拖镜头就钻进地面，整幅画面被地面糊成一片纯色（v2.1 修复）。
const MIN_EYE_Y = 0.6;                  // 相机最低净空（米，轨顶以上）
const PAN_SENS = 0.18;                  // 米 / 像素
const ROT_SENS = 0.005;                 // rad / 像素
const DAMP = 9;                         // 阻尼系数，k = 1-exp(-dt*DAMP)
const CAB_TILT = 0.025;                 // rad ≈1.4°，cab 基础下俯
const CAB_BACK = 0.6;                   // 相机放到鼻锥前沿外侧 0.6 m
const CAB_AHEAD = 200;                  // lookAt 前方距离（米）

/** ctx.train 与 setTrainSpec 都没给时的 8 辆示意规格，保证 cab 有 noseZ 可用。 */
const FALLBACK_TRAIN = Object.freeze({
  noseZ: -105, tailZ: 105, length: 210, height: 4.05, halfWidth: 1.68,
});

// -------------------------------------------------------------- 球坐标工具 ----
/** 球坐标 → 相机相对 anchor 的偏移 [x,y,z]（yaw=0 在 +Z 侧，pitch>0 在上方）。 */
function sphericalToOffset(distance, yaw, pitch) {
  const cp = Math.cos(pitch);
  return [distance * Math.sin(yaw) * cp, distance * Math.sin(pitch), distance * Math.cos(yaw) * cp];
}

/** 相机偏移 → 球坐标，供「从 preset 一次性同步」用；是上式的逆运算。 */
function offsetToSpherical(dx, dy, dz) {
  const flat = Math.hypot(dx, dz);
  return {
    distance: Math.hypot(dx, dy, dz),
    yaw: Math.atan2(dx, dz),
    pitch: Math.atan2(dy, flat),
  };
}

/** 16 辆长编(≈417 m)相对 8 辆(≈210 m)把机位整体往车后挪，示意级近似。 */
function formationBack(train) {
  const L = Number.isFinite(train?.length) ? train.length : FALLBACK_TRAIN.length;
  return clamp((L - 210) * 0.34, 0, 110);
}

/**
 * 创建相机系统。framework.js 的 pack.createCamera(ctx) 会调它（harbin.js 里传
 * { presets: CAMERA_PRESETS }）。返回的既是标准 System，又带集成层要用的方法。
 */
export function createCameraRig(ctx, opts = {}) {
  const presets = Array.isArray(opts.presets) && opts.presets.length ? opts.presets : CAMERA_PRESETS;
  const presetMap = new Map(presets.map((p) => [p.id, p]));
  const byId = (id) => presetMap.get(String(id));

  let ctxRef = ctx || null;
  let camera = ctxRef?.camera || null;
  let dom = ctxRef?.domElement || null;

  // state 是唯一的「目标数据源」，HUD / 调试钩子读 sys.state（同一个对象引用）。
  const state = {
    mode: 'relative',
    preset: 'hero',
    distance: 60,
    yaw: 0,
    pitch: 0,
    anchor: [0, 0, 0],
    fov: CAMERA.fov,
    follow: false,
  };

  // 复用向量，避免每帧 new；target 同时作为 sys.target（兼容旧 controls.target 钩子）。
  const targetVec = new THREE.Vector3();
  const _pos = new THREE.Vector3();
  const _aim = new THREE.Vector3();

  let baseAnchor = [0, CAMERA.focusY, 0]; // preset 给的基准观察中心
  let pan = [0, 0];                       // 中键拖出来的 anchor x/y 偏移
  const disp = {                         // 显示插值缓存（不是数据源，不对外）
    distance: state.distance, yaw: 0, pitch: 0, ax: 0, ay: 0, az: 0,
  };
  let dirRef = DIRECTION.FORWARD;
  let themeFovBias = 0;
  let specRef = null;
  let bound = false;
  let disposed = false;
  let prevTouchAction;
  let appliedView = '';
  let lastCtxView = ctxRef?.state?.view;
  let lastCtxCameraMode = ctxRef?.state?.cameraMode;

  const listeners = [];      // { target, type, fn, opts } —— dispose 逐个解绑
  const pointers = new Map(); // pointerId -> { x, y, type, button }
  let drag = null;            // { mode:'rotate'|'pan'|'pinch', id?, x?, y?, dist? }

  // ---------------------------------------------------------- 小工具函数 ----
  function resolveTrain() {
    // setTrainSpec / 'train:spec' 显式注入的规格优先（集成层可能直接调本系统，
    // 不走 framework.setTrainSpec）；都没有才退回 ctx.train，最后用 8 辆示意值。
    const explicit = specRef && Number.isFinite(specRef.noseZ) ? specRef : null;
    const fromCtx = ctxRef?.train && Number.isFinite(ctxRef.train.noseZ) ? ctxRef.train : null;
    return explicit || fromCtx || FALLBACK_TRAIN;
  }

  function pinchDist() {
    const pts = [...pointers.values()];
    return pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
  }

  function add(target, type, fn, opts) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, fn, opts);
    listeners.push({ target, type, fn, opts });
  }

  function capture(id) {
    if (dom && typeof dom.setPointerCapture === 'function' && id != null) {
      try { dom.setPointerCapture(id); } catch { /* 老浏览器/桩里忽略 */ }
    }
  }
  function release(id) {
    if (dom && typeof dom.releasePointerCapture === 'function' && id != null) {
      try { dom.releasePointerCapture(id); } catch { /* 同上 */ }
    }
  }

  // ------------------------------------------------------------ DOM 交互 ----
  function onPointerDown(e) {
    if (e.button === 2) return; // 右键不拦截，保留给浏览器菜单
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType, button: e.button });
    capture(e.pointerId);
    if (pointers.size >= 2) {
      drag = { mode: 'pinch', dist: pinchDist() }; // 双指缩放
    } else if (e.button === 1) {
      drag = { mode: 'pan', id: e.pointerId, x: e.clientX, y: e.clientY }; // 中键平移
    } else {
      drag = { mode: 'rotate', id: e.pointerId, x: e.clientX, y: e.clientY }; // 左键 / 单指
    }
    // pointerdown 默认非 passive；preventDefault 阻止选中文本 / 中键自动滚动 / 图片拖拽
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { ...pointers.get(e.pointerId), x: e.clientX, y: e.clientY });
    if (!drag) return;
    if (drag.mode === 'pinch') {
      const nd = pinchDist();
      if (drag.dist > 0 && nd > 0) {
        // 两指张开(nd 变大) → factor<1 → distance 变小 → 拉近
        state.distance = clamp(state.distance * (drag.dist / nd), MIN_DIST, MAX_DIST);
      }
      drag.dist = nd;
    } else if (drag.id === e.pointerId) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (drag.mode === 'pan') {
        // 只改 anchor 的横向/高度，不动 yaw/pitch
        pan[0] = clamp(pan[0] + dx * PAN_SENS, -PAN_LIMIT_X, PAN_LIMIT_X);
        pan[1] = clamp(pan[1] - dy * PAN_SENS, -PAN_LIMIT_Y_DOWN, PAN_LIMIT_Y_UP);
      } else {
        state.yaw += dx * ROT_SENS;
        state.pitch = clamp(state.pitch - dy * ROT_SENS, PITCH_MIN, PITCH_MAX);
      }
    }
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    release(e.pointerId);
    if (pointers.size >= 2) {
      drag = { mode: 'pinch', dist: pinchDist() };
    } else if (pointers.size === 1) {
      const [id, pt] = pointers.entries().next().value;
      drag = { mode: pt.button === 1 ? 'pan' : 'rotate', id, x: pt.x, y: pt.y };
    } else {
      drag = null;
    }
  }

  function onWheel(e) {
    // { passive:false } 才让 preventDefault 生效，防止页面跟着滚（资料[13]）
    if (typeof e.preventDefault === 'function') e.preventDefault();
    const delta = Number.isFinite(e.deltaY) ? e.deltaY : (Number.isFinite(e.wheelDelta) ? -e.wheelDelta : 0);
    const factor = Math.exp(delta * 0.0012); // 下滚 → 拉远
    state.distance = clamp(state.distance * factor, MIN_DIST, MAX_DIST);
  }

  // ------------------------------------------------ 每帧：重算相机 + 阻尼 ----
  /**
   * @param {number} dt   秒
   * @param {boolean} snap true = 一次性同步（切机位/切模式/换车型时把 disp 直接怼到 state）
   */
  function applyCamera(dt, snap) {
    if (!camera || disposed) return;
    const train = resolveTrain();
    const isCab = state.preset === 'cab';

    // ---- 1) 目标 anchor：写回 state.anchor（HUD 读它）----
    let ax, ay, az;
    if (isCab) {
      // cab 不用 anchor 定位相机，这里只给 HUD 一个示意值
      ax = 0; ay = train.height * 0.72; az = train.noseZ - CAB_BACK - CAB_AHEAD;
    } else if (state.mode === 'absolute') {
      // 世界固定点：不加长编后撤、不加跟随，列车跑动也不动
      ax = baseAnchor[0] + pan[0]; ay = baseAnchor[1] + pan[1]; az = baseAnchor[2];
    } else {
      let followShift = 0;
      if (state.follow && Number.isFinite(ctxRef?.s)) {
        // 示意级近似：世界本来就在滚动，默认不额外跟随；开了就随里程极轻微呼吸
        followShift = Math.sin(ctxRef.s * 0.0015) * 1.2 * dirRef;
      }
      ax = baseAnchor[0] + pan[0];
      ay = baseAnchor[1] + pan[1];
      az = baseAnchor[2] + formationBack(train) + followShift;
    }
    // 观察中心也不许沉到轨顶以下，避免 HUD 与实际画面给出互相矛盾的高度。
    ay = Math.max(ay, MIN_EYE_Y);
    state.anchor[0] = ax; state.anchor[1] = ay; state.anchor[2] = az;

    // ---- 2) 阻尼：disp 朝 state 收敛（state 是唯一数据源，无累积误差）----
    const k = snap ? 1 : (dt > 0 ? 1 - Math.exp(-dt * DAMP) : 0);
    disp.distance = lerp(disp.distance, state.distance, k);
    disp.yaw = lerp(disp.yaw, state.yaw, k);
    disp.pitch = lerp(disp.pitch, state.pitch, k);
    disp.ax = lerp(disp.ax, ax, k);
    disp.ay = lerp(disp.ay, ay, k);
    disp.az = lerp(disp.az, az, k);

    // ---- 3) near / fov：改动才刷新投影矩阵（资料[12]）----
    const wantNear = isCab ? CAB_NEAR : BASE_NEAR;
    if (camera.near !== wantNear) { camera.near = wantNear; camera.updateProjectionMatrix(); }
    const wantFov = clamp(state.fov + themeFovBias, FOV_MIN, FOV_MAX);
    if (camera.fov !== wantFov) { camera.fov = wantFov; camera.updateProjectionMatrix(); }

    // ---- 4) 相机位置 + lookAt ----
    if (isCab) {
      // ★ 防穿模：相机放在鼻锥前沿外侧（比车头最前端还靠前 0.6 m），朝 -Z 看，
      //   整列车都在相机背后，视野里没有车体网格 → 不会看到 backface 空洞/黑块。
      const cx = pan[0] * 0.25;
      const cy = train.height * 0.72 + pan[1] * 0.25;
      const cz = train.noseZ - CAB_BACK;
      const look = clamp(disp.distance, 30, 400); // cab 复用 distance 作「注视距离」
      _pos.set(cx, cy, cz);
      _aim.set(
        cx + Math.sin(disp.yaw) * look,
        cy - Math.tan(clamp(disp.pitch, -1.0, 1.0) + CAB_TILT) * look,
        cz - Math.cos(disp.yaw) * look,
      );
    } else {
      const off = sphericalToOffset(disp.distance, disp.yaw, disp.pitch);
      _pos.set(disp.ax + off[0], disp.ay + off[1], disp.az + off[2]);
      _aim.set(disp.ax, disp.ay, disp.az);
    }
    // ★ 防钻地：中键下拖或负 pitch 会经球坐标把相机送到地面以下。把相机与视点
    //   同步抬高同一差值，视线方向保持不变；cab 也覆盖（z 不动，仍在鼻锥前方）。
    if (_pos.y < MIN_EYE_Y) {
      const lift = MIN_EYE_Y - _pos.y;
      _pos.y += lift;
      _aim.y += lift;
    }
    camera.position.copy(_pos);
    camera.lookAt(_aim);
    targetVec.copy(_aim); // sys.target 兼容旧调试钩子 controls.target
  }

  // ---------------------------------------------------------- 集成层 API ----
  /** 切机位：一次性把球坐标 / 锚点同步到 preset，用户后续拖拽在此基础上叠加。 */
  function setPreset(id, options = {}) {
    const p = byId(id) || presets[0];
    state.preset = p.id;
    if (!options.keepMode) state.mode = p.mode === 'absolute' ? 'absolute' : 'relative';

    // 相对 → 锚点 = 车身局部观察中心(preset.aim)；绝对 → 锚点 = 世界固定点(preset.offset)
    baseAnchor = (state.mode === 'absolute' ? p.offset : p.aim).slice();
    pan = [0, 0];

    // 球坐标一次性同步：absolute 且带显式 distance/yaw/pitch 就直接用，否则由 offset-aim 反推
    if (state.mode === 'absolute' && Number.isFinite(p.distance)) {
      state.distance = clamp(p.distance, MIN_DIST, MAX_DIST);
      state.yaw = Number.isFinite(p.yaw) ? p.yaw : 0;
      state.pitch = clamp(Number.isFinite(p.pitch) ? p.pitch : 0, PITCH_MIN, PITCH_MAX);
    } else {
      const sp = offsetToSpherical(
        p.offset[0] - p.aim[0], p.offset[1] - p.aim[1], p.offset[2] - p.aim[2],
      );
      state.distance = clamp(sp.distance, MIN_DIST, MAX_DIST);
      state.yaw = sp.yaw;
      state.pitch = clamp(sp.pitch, PITCH_MIN, PITCH_MAX);
    }
    if (p.id === 'cab') {
      // cab 贴脸：distance 复用为「前方注视距离」，角度归零朝正前略下俯
      state.distance = CAB_AHEAD; state.yaw = 0; state.pitch = 0;
    }
    state.fov = Number.isFinite(p.fov) ? p.fov : CAMERA.fov;
    state.anchor[0] = baseAnchor[0]; state.anchor[1] = baseAnchor[1]; state.anchor[2] = baseAnchor[2];
    appliedView = p.id;
    applyCamera(0, true); // 立即定位 + 立即设 near/fov（切走 cab 就恢复 near）
    return getState();
  }

  /**
   * 切相对/绝对：absolute 把「当前观察中心」冻结成世界固定点；relative 回到当前
   * preset 的车身局部参考系。都不重置用户调好的角度。
   */
  function setMode(mode) {
    const m = mode === 'absolute' ? 'absolute' : 'relative';
    if (m === state.mode) return getState();
    if (m === 'absolute') baseAnchor = state.anchor.slice();
    else baseAnchor = (byId(state.preset) || presets[0]).aim.slice();
    state.mode = m;
    pan = [0, 0];
    applyCamera(0, true);
    return getState();
  }

  function setTrainSpec(spec) {
    if (spec && typeof spec === 'object') {
      specRef = spec;
      applyCamera(0, true); // 换车型/编组立即按新 noseZ/height 重算（cab 自动适配长编）
    }
    return getState();
  }

  function setDirection(dir) {
    // 车身从不旋转、行驶前方始终 -Z（见文件头），故相机参考系不翻转；只更新方向记录
    const d = dir === DIRECTION.REVERSE || dir < 0 ? DIRECTION.REVERSE : DIRECTION.FORWARD;
    dirRef = d;
    return getState();
  }

  function setFov(deg) {
    const v = Number(deg);
    state.fov = clamp(Number.isFinite(v) ? v : CAMERA.fov, FOV_MIN, FOV_MAX);
    if (camera) {
      const want = clamp(state.fov + themeFovBias, FOV_MIN, FOV_MAX);
      if (camera.fov !== want) { camera.fov = want; camera.updateProjectionMatrix(); }
    }
    return getState();
  }

  function setFollow(on) {
    state.follow = Boolean(on);
    return getState();
  }

  function getState() {
    return {
      mode: state.mode,
      preset: state.preset,
      distance: state.distance,
      yaw: state.yaw,
      pitch: state.pitch,
      anchor: state.anchor.slice(),
      fov: state.fov,
      follow: state.follow,
      dir: dirRef,
      pan: pan.slice(),
      near: camera ? camera.near : BASE_NEAR,
      appliedView,
    };
  }

  // ------------------------------------------------------------- System ----
  function onEvent(type, payload) {
    switch (type) {
      case EVENT.CAMERA_MODE: { // 'camera:mode'
        const m = typeof payload === 'string' ? payload : (payload?.mode ?? payload?.cameraMode);
        if (m === 'relative' || m === 'absolute') setMode(m);
        break;
      }
      case 'camera:view': {
        const id = typeof payload === 'string' ? payload : (payload?.view ?? payload?.id);
        if (id && byId(id)) setPreset(id, { keepMode: true }); // 别把 HUD 选的 mode 冲掉
        break;
      }
      case 'train:spec':
        setTrainSpec(payload);
        break;
      case EVENT.DIRECTION_CHANGE:
      case EVENT.REVERSE: {
        const d = typeof payload === 'number' ? payload : (payload?.dir ?? ctxRef?.dir);
        setDirection(d);
        break;
      }
      case 'theme:change':
        applyTheme(payload);
        break;
      default:
        break;
    }
  }

  /** 只微调相机自身 FOV 做氛围示意；exposure / fog / renderer 全局状态一律不碰。 */
  function applyTheme(theme) {
    const label = typeof theme === 'string'
      ? theme : (theme?.label ?? theme?.id ?? theme?.name ?? 'day');
    const s = String(label);
    const isNight = /night|夜/i.test(s);
    const isDusk = /dusk|暮/i.test(s);
    themeFovBias = isNight ? -1.5 : isDusk ? -0.5 : 0;
    if (camera) {
      const want = clamp(state.fov + themeFovBias, FOV_MIN, FOV_MAX);
      if (camera.fov !== want) { camera.fov = want; camera.updateProjectionMatrix(); }
    }
  }

  /** 标准 System init：绑定 DOM 监听（全部挂在 domElement 上，不挂 window/全局），防重复绑定。 */
  function init(c) {
    if (c) ctxRef = c;
    if (ctxRef?.camera) camera = ctxRef.camera;
    if (ctxRef?.domElement) dom = ctxRef.domElement;
    if (dom && !bound) {
      bound = true;
      // 自定义手势画布要 touch-action:none（资料[14]），dispose 时恢复
      if (dom.style) {
        prevTouchAction = dom.style.touchAction;
        try { dom.style.touchAction = 'none'; } catch { /* 只读 style 时忽略 */ }
      }
      add(dom, 'pointerdown', onPointerDown);
      add(dom, 'pointermove', onPointerMove);
      add(dom, 'pointerup', onPointerUp);
      add(dom, 'pointercancel', onPointerUp);
      add(dom, 'wheel', onWheel, { passive: false }); // 必须显式非被动才能 preventDefault
    }
    applyCamera(0, true);
  }

  /** 每帧：兜底同步 ctx.state.view / cameraMode（仅当它们真的变化），再重算相机。 */
  function update(c, dt) {
    if (c) ctxRef = c;
    if (disposed) return;
    const v = ctxRef?.state?.view;
    if (v && v !== lastCtxView) {
      lastCtxView = v;
      if (byId(v)) setPreset(v, { keepMode: true });
    }
    const cm = ctxRef?.state?.cameraMode;
    if ((cm === 'relative' || cm === 'absolute') && cm !== lastCtxCameraMode) {
      lastCtxCameraMode = cm;
      setMode(cm);
    }
    applyCamera(Number.isFinite(dt) ? dt : 0, false);
  }

  /** 移除所有 DOM 监听（按同一函数引用），恢复 touch-action，杜绝重复绑定。 */
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const l of listeners) {
      try { l.target.removeEventListener(l.type, l.fn, l.opts); } catch { /* 忽略 */ }
    }
    listeners.length = 0;
    pointers.clear();
    drag = null;
    if (dom && prevTouchAction !== undefined && dom.style) {
      try { dom.style.touchAction = prevTouchAction; } catch { /* 忽略 */ }
    }
  }

  // ---- 构造时按当前 view 应用一次默认机位（camera 已由 host 提供）----
  const initialView = (ctxRef?.state?.view && byId(ctxRef.state.view))
    ? ctxRef.state.view : (byId('hero') ? 'hero' : presets[0].id);
  setPreset(initialView);

  const sys = {
    id: 'camera',
    phase: SYSTEM_PHASE.CAMERA,
    init, update, onEvent, applyTheme, dispose,
    // 集成层要调用的方法
    setPreset, setMode, setTrainSpec, setDirection, setFov, setFollow, getState,
    target: targetVec, // THREE.Vector3，兼容旧调试钩子 controls.target
    state,             // { mode, preset, distance, yaw, pitch, anchor, fov, follow }
  };
  return sys;
}

export default createCameraRig;

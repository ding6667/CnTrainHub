/**
 * schedule.js —— 列车运行图 / 时刻表「框架预留 + 扩展点」层。
 *
 * 【这一层是干嘛的】
 * 重点不是做一张写死的车次表，而是给「以后接真实运行图数据」预留一套稳定、可复用、
 * 可扩展的接口。分两层：
 *   A) 纯数据 / 纯函数层：createTimetable / generateServices / stopDwellPolicy / 常量 / HOOKS。
 *      零 import THREE、零 DOM、零 fetch、不 import 站场布局、不 import 大 JSON，
 *      可以直接丢进 Node 单测。时间一律「从 0:00 起算的分钟数」，里程一律「公里(km)」，
 *      与 route-data.js 一致；StopZone 的「米」由 framework 换算，本层绝不混用。
 *   B) 系统层：createScheduleSystem(ctx, opts) → System，挂在 SYSTEM_PHASE.TIMETABLE。
 *      通过 ctx.state 的公共字段 + ctx.bus 事件「接管 / 扩展」框架已经写好的
 *      「进站自动停车 + 车门状态机」，不另写一套停站逻辑，也不旋转列车几何。
 *
 * 【两套时钟，别混（很重要）】
 *  1) 运行图钟：Service.stops[].arrive / depart / Timetable.setClock / simMinutes，
 *     单位是「分钟」，是 wall-clock 式的图定时刻，支持跨零点（分钟数可以 > 1440，
 *     例如 23:50 发车、次日 00:30 到达就存 1430 / 1470，不要取模后再存）。
 *  2) 车门仿真钟：framework 的 nextDoorState 里 dwellSec 是「仿真秒」，累加的是帧 dt。
 *     真实高铁停站 2~5 min = 120~300 s，直接拿来当门开秒数太长；
 *     stopDwellPolicy 用 DOOR_SCALE 把「真实停站秒」压缩成 8~45 仿真秒。
 *     这两套钟故意分开，外部 hook 想怎么换算都行。
 *
 * 【示意生成，免责】
 * generateServices 生成的所有车次一律带 synthetic:true 与 SYNTHETIC_NOTE，
 * 是「按真实站序 / 官方里程 / 设计时速 + 起停附加时分推算」的示意数据，
 * 禁止当作真实运行图、禁止伪造具体车次精确时刻。车次号用 G9xxx 示意号段，
 * 真实车次号规则见下方资料，接入真实数据时请整体 fromJSON 替换。
 *
 * ==================================================================================
 * 【联网核实资料（标题 + URL + 关键数字）—— 硬性要求，先查后写】
 * ==================================================================================
 * 1) 车次编号规则 / 上下行奇偶
 *  - 百度百科《高速客运列车》 | https://baike.baidu.com/item/%E9%AB%98%E9%80%9F%E5%AE%A2%E8%BF%90%E5%88%97%E8%BD%A6/11017778
 *    G 读「高」=高速动车组、C 读「城」=城际动车组、D 读「动」=动车组；
 *    开往北京方向 / 支线→干线为「上行」车次编双数(偶数)，远离北京 / 干线→支线为「下行」编单数(奇数)。
 *  - 中国青年网 / 央视网《国铁集团启动全国铁路列车车次编排改革》
 *    https://news.youth.cn/jsxw/202610/t20261016_16917438.htm
 *    https://jingji.cctv.com/2026/10/16/ARTIzEJiRFW8gaw76Rk3iVJ8261016.shtml
 *    2026 版把动车组字头由 4 个扩到 7 个(X/G/T/K/D/C/S)，G1–G9998、C1–C2998、D 改为动集。
 *    → 本示意层沿用既有 G/D/C 口径；接真实 2026 版数据时按新规映射。
 *
 * 2) 列车运行图构成 / 运行线 / 区间运行时分 / 起停附加时分
 *  - 微信《列车运行图知识第二期——运行图上的六类时间标准》
 *    http://mp.weixin.qq.com/s?__biz=Mzk0NDMwMzA0MQ==&mid=2247485135&idx=1&sn=f513ec33a14e6d1c3d63e7ee5891f200
 *    《铁路技术管理规程》：「列车运行图是铁路行车组织工作的基础」；横轴时间、纵轴车站，
 *    一列车画一条斜线(运行线)、停站画水平段；区间运行时分 = 纯运行时分 + 起车附加时分
 *    (停车后起动加速) + 停车附加时分(进站减速制动)，起算点是「车站中心线」。
 *    六类时间标准：区间运行时分 / 中间站停站时间 / 车站间隔时间 / 追踪列车间隔时间 /
 *    机车在基本段折返段停留时间 / 技术站客运站货运站技术作业时间。
 *
 * 3) 高铁车站停站时分常见 2~5 min / 起停附加数值
 *  - 中国网《开行方案、票价、运行时间是如何制定与计算的?》
 *    http://tong.china.com.cn/2019-12/27/content_41014755.html
 *    银中高铁：停车附加 2 min、起车附加 2 min、客运营业站站停 2–4 min，一个停站合计 6–8 min。
 *  - 闪电新闻《济南到青岛多长时间?济青高铁总工程师释疑》
 *    https://sd.iqilu.com/v7/share/article/5212246
 *    每增加一个停靠站：停车附加 3 min + 起车附加 2 min + 停站 2 min = 7 min。
 *  - 《高速铁路设计规范》TB 10621—2014 条文说明(铁路标准库)
 *    https://ima.qq.com/wiki/?shareId=941d97d1d19680878ef3c8c6e7b700481db47545b73b0d61ffc34dfbf1618428
 *    一般车站起车附加时分 ≤ 2.5 min、停车附加时分 ≤ 1.5 min；仅办客运的通过列车，
 *    大量旅客乘降客运站可按 3 min、其他车站 1–2 min。
 *  - 论文《400 km/h 高速铁路通过能力计算方法研究》
 *    http://gstljs.paperonce.org/oa/pdfdow.aspx?Sid=202401005
 *    京沪高铁 350 km/h：追踪间隔 4 min、到通间隔 3 min、通发间隔 2 min、
 *    停车附加 3 min、起车附加 3 min、停站时间 2 min。
 *
 * 4) 最小追踪间隔 3 min
 *  - 百度百科《追踪列车间隔时间》 | https://baike.baidu.com/view/6043403.html
 *    《铁路主要技术政策》(2013 起施行) 高速铁路列车追踪间隔时间最小按 3 分钟设计，
 *    双线铁路旅客列车最小按 5 分钟设计。
 *  - 腾讯 / 潮新闻《沪杭线最短间隔3分钟开出一趟高铁》
 *    https://news.qq.com/rain/a/20250124A04USW00
 *    沪杭高铁「3 分钟连发追踪间隔」、常态连发间隔 5 min。
 *    注意：3 min 是追踪间隔，不是站停时间、也不是「每 3 分钟发一趟车」。
 *
 * 5) 哈尔滨西—大连北 G 字头实际运行时间与主要停站
 *  - 百度百科《G50次列车》 | https://baike.baidu.com/item/g50%E6%AC%A1%E5%88%97%E8%BD%A6/22042450
 *    哈尔滨西—大连北，CRH380BG，全程 921 km、约 3 h 30–35 min；
 *    经停长春西(240 km / 停 2 min)、沈阳北(538 km / 停 2 min)；2026-01-26 调整为 G520 次。
 *  - 今日头条《G520次「小鸥专班」出发!》 | https://m.toutiao.com/article/7600982954520724010
 *    921 km、历时 3 h 35 min、经停长春西和沈阳北。
 *  - 高铁旅行网《G518次高铁途经站点时刻表》 | https://www.gaotie.com.cn/checi/G518-G519.html
 *    哈尔滨西 07:34 → 大连北 11:11，3 h 37 min、921 km；停长春西 6 min、沈阳北 3 min。
 *
 * 6) 哈齐高铁 / 哈牡高铁运行时间与停站
 *  - 新华网黑龙江《哈齐高铁首趟齐齐哈尔烤肉文化主题列车开行》
 *    https://hlj.news.cn/20260711/5d67dc554d054603af4d6c324e71a5a1/c.html
 *    哈齐高铁最快 1 h 26 min、日常 39 对动车组、运营时段 5:49–21:28、最短发车间隔 7 min。
 *  - 去哪儿《D6985次时刻表》 | https://train.qunar.com/train/timetable/D6985
 *    哈尔滨 07:40 → 齐齐哈尔南 09:26，1 h 46 min；停哈尔滨北 3 / 肇东 2 / 大庆东 3 /
 *    杜尔伯特 2 min；8 节编组 CRH5A、定员 586、全长 212 m、最高 250 km/h。
 *  - Wikiwand《哈牡客运专线》 | https://www.wikiwand.com/zh-my/articles/%E5%93%88%E7%89%A1%E5%AE%A2%E4%B8%93
 *    牡丹江→哈尔滨最快 1 h 28 min、一般约 2 h，全线 11 站，2018-12-25 开通，设计时速 250 km。
 *
 * 7) 列车折返(立折)与动车段出入库的时刻表处理
 *  - 科普中国《经济据点》 | https://www.kepuchina.cn/article/articleinfo?business_type=100&ar_id=237347
 *    立即折返(立折)=A 站到 B 站下客后立即上客返 A；站前折返(到发线不转线反向出发) /
 *    站后折返(经折返线到另一侧顺向出发)。立折停站占用到发线：非高峰站前 34 min /
 *    站后 41 min、高峰 24 min；始发终到占用到发线：非高峰 20.5 min
 *    (含动车组出入段平均时分 3.5 min)、高峰 12 min；客运专线运行时段 6:00–24:00。
 *  - 上观新闻《车尾变身车头!揭秘高铁为啥「换向」》
 *    https://export.shobserver.com/toutiao/html/1092244.html
 *    北京西 G6730 到站后变更车次为 G6713，22 分钟换向(换端)，实现车底循环利用；
 *    「折角换向」= 换向折返驶入另一条线的「V」形掉头转场。
 *  - 今日头条《高铁如何调头的?》 | https://www.toutiao.com/article/7704280337576198698
 *    常规立折全流程 12–25 min，大型枢纽可稳定压到约 15 min。
 *
 * 8) 「运行图 / 时刻表数据模型」常见字段
 *  - GTFS《Base》 | http://gtfs.org/getting-started/features/base
 *    trips.txt: route_id, service_id, trip_id, trip_short_name, direction_id, block_id；
 *    stop_times.txt: trip_id, arrival_time, departure_time, stop_id, stop_sequence；
 *    dwell time = departure_time − arrival_time；时间自「服务日 0 点」起算，
 *    跨零点用 > 24:00:00 表示。
 *  - GTFS 维基 | https://us-wikipedia.com/wiki/GTFS
 *    trips 必填 trip_id / route_id / service_id；stop_times 必填 stop_id / trip_id /
 *    arrival_time / departure_time / stop_sequence。
 *  - 重庆《互联互通全局调度系统技术标准》
 *    https://zfcxjw.cq.gov.cn/zwxx_166/gsgg/202401/P020240126629808413311.docx
 *    计划运行图信息：日期/图号/图名/服务号/车次号/车组号/目的地码/站号/
 *    股道号(股道名称)/到站时间/离站时间/标志位(跨线、折返、出库、入库、上下行、
 *    站后折返、站前折返)/接入交出车次号。
 *  - 专利 US20230311965A1 | https://patents.google.com/patent/US20230311965A1/en
 *    timetable data 含 train no. / station / platform / arrival time / departure time；
 *    operation data 含 train no. / previous operation train / next operation train(车底交路接续)。
 *  - MDPI《A Design-Oriented Process Mining Framework for Railway Operations》
 *    https://www.mdpi.com/2078-2489/17/5/483/htm
 *    车次号 + 开行日期 = case id；station passage 含 Sched/Real A、Sched/Real D、
 *    Sched/Real track、arrival/departure delay、cause code；公里标(Progr. Km)；
 *    rollingStock(编组/车型) 与 shunting(出入库) 记录。
 *    → 本层 Service = { id, trainNo, modelId, formation, direction, stops, rollingStock,
 *      color, note }，stops[].arrive/depart/platformTrack 即对应上述字段。
 */

import { EVENT, SYSTEM_PHASE, DIRECTION, rng, hash32, clamp } from './core.js';

// ==================================================================== 常量 ====

/** 一天的分钟数。运行图按「每日重复」处理（周期 = 1440 min）。 */
export const DAY_MIN = 1440;

/** 示意车次统一挂这句，绝不能省。 */
export const SYNTHETIC_NOTE = '示意生成，非真实运行图（按真实站序 / 官方里程 / 设计时速推算，仅用于框架演示，禁止当作真实时刻使用）';

/**
 * 运行时分 / 停站 / 追踪 / 折返 的「示意口径常量」。
 * 数字来自上面联网资料，未核实的一律标口径，不伪装成官方查定值。
 */
export const TIMING = Object.freeze({
  startAddMin: 2,      // 起车附加时分(min)：银中 2 / 济青 2 / 京沪 3 / 规范 ≤ 2.5，取 2
  stopAddMin: 2,       // 停车附加时分(min)：银中 2 / 济青 3 / 京沪 3 / 规范 ≤ 1.5，取 2
  hubDwellMin: 3,      // 枢纽大站停站(min)：大站可按 3 min（规范）
  localDwellMin: 2,    // 一般中间站停站(min)：1~2 min（规范）/ 站停 2~4 min（银中）
  minDwellMin: 2,      // 站停下限(min)（高铁常见 2~5 min）
  maxDwellMin: 5,      // 站停上限(min)（高铁常见 2~5 min）
  turnbackMin: 15,     // 终到立折 / 出入库占用(min)：常规立折 12~25、枢纽约 15（科普/头条）
  depotInOutMin: 3.5,  // 动车组出入段平均(min)：始发终到 20.5 min 中含 3.5 min（科普中国）
  minHeadwayMin: 3,    // 高铁最小追踪间隔(min)：《铁路主要技术政策》2013 起按 3 min 设计
  speedFactor: 0.85,   // 运营速度 / 设计时速 的示意折算系数（纯运行时分 = 距离 / (设计时速*系数)）
  doorScale: 12,       // 真实停站秒 → 仿真门开秒 的压缩系数（示意口径，可被 hook 覆盖）
  doorMinSec: 8,       // 门开最短仿真秒
  doorMaxSec: 45,      // 门开最长仿真秒
  defaultRealDwellSec: 180, // 停站缺省真实秒(3 min)
});

/**
 * generateServices 的推算口径说明，写进注释也写进数据（toJSON 可带出去）。
 * kmBasis 沿用 route-data.js 的官方运营里程标尺，不另造里程。
 */
export const GEN_BASIS = Object.freeze({
  kmBasis: 'Route.nodes[].km（公里），沿用 route-data.js 的官方运营里程标尺，不另造',
  timeBasis: '区间运行时分 = |Δkm| / (Route.speed * speedFactor) * 60 + 起车附加 + 停车附加；单位分钟',
  dwellBasis: '中间站站停 2~5 min（大站 3 / 一般 2 min），终到留立折/出入库 15 min；单位分钟',
  crossMidnight: '时刻为「从 0:00 起算的分钟数」，可 > 1440 表示跨零点，绝不取模存储',
  note: SYNTHETIC_NOTE,
});

/** 示意车型样本（真实车型名，非编造车次）。接入真实 fleet 时可整体替换。 */
export const FLEET_SAMPLES = Object.freeze([
  { modelId: 'CRH380BG', formation: 8, capacity: 494 }, // G50/G520 曾用车型
  { modelId: 'CRH5A', formation: 8, capacity: 586 },    // D6985：8 节 / 586 人 / 212 m
  { modelId: 'CR400BF', formation: 16, capacity: 1193 },// 16 辆长编复兴号
]);

/** 系统向外发的自定义事件名（宿主据此把「立折请求」接到 runtime.setDirection/reverse）。 */
export const TIMETABLE_EVENTS = Object.freeze({
  SERVICE_DUE: EVENT.SERVICE_DUE,              // 复用框架事件：某车次到点
  SERVICE_START: 'timetable:service-start',     // 系统把某车次设为「当前播放车次」
  TERMINATE: 'timetable:terminate',             // 车次跑到终点
  REVERSE_REQUEST: 'timetable:reverse-request', // 请求逻辑掉头（宿主监听后调 reverse()）
  DOOR_POLICY: 'timetable:door-policy',         // 每次算出停站/车门策略时广播
});

/**
 * 【扩展点总表】—— 后续接入真实运行图数据时，只要实现这些 hook 即可，
 * 不用改本文件、也不用改 framework。每个 hook 的签名和触发时机都写清楚：
 *
 *  - onServiceStart(service, ctx)  车次「到点 / 被设为当前车次」时；可返回 false 忽略。
 *  - onApproach(service, stop, ctx) 进站前(APPROACH 事件)触发，策略写入框架前调用。
 *  - onArrive(service, stop, ctx)   到站(ARRIVE 事件)触发。
 *  - onDwellTick(service, stop, ctx)停站中每帧触发，可读 ctx.state.doorState 算进度。
 *  - onDepart(service, stop, ctx)   出站(DEPART 事件)触发；此后索引推进到下一停点。
 *  - onReverse(service, ctx)        收到框架 REVERSE 事件(逻辑掉头)时触发。
 *  - onTerminate(service, ctx)      跑到最后一个停点(终到)时触发，随后请求立折。
 *  - onDoorPolicy(policy, ctx)      最后一道：stopDwellPolicy 算出基础策略后可覆盖/改写，
 *                                   返回的对象会 merge 进 { dwellSec, doorRequest, autoDwell, autoDepart }。
 *
 * 真实数据接入路径：sys.timetable.fromJSON(json) 整张换图 + sys.install(hooks) 注入实现。
 * 说明：本框架已自带「进站自动停车 + 车门状态机」，hook 只做接管/扩展，别另写一套停站。
 */
export const TIMETABLE_HOOKS = Object.freeze({
  onServiceStart: { params: '(service, ctx)', returns: 'void | boolean', when: '车次到点 / 设为当前车次' },
  onApproach:     { params: '(service, stop, ctx)', returns: 'void', when: 'APPROACH 进站前，策略写入框架前' },
  onArrive:       { params: '(service, stop, ctx)', returns: 'void', when: 'ARRIVE 到站' },
  onDwellTick:    { params: '(service, stop, ctx)', returns: 'void', when: '停站中每帧' },
  onDepart:       { params: '(service, stop, ctx)', returns: 'void', when: 'DEPART 出站' },
  onReverse:      { params: '(service, ctx)', returns: 'void', when: 'REVERSE 逻辑掉头' },
  onTerminate:    { params: '(service, ctx)', returns: 'void', when: '跑完最后一个停点(终到)' },
  onDoorPolicy:   { params: '(policy, ctx)', returns: 'policy（对象，merge 进基础策略）', when: '算出停站/车门策略后' },
});

// ============================================================ 纯函数小工具 ====

/** 有限数或默认值。 */
function finiteOr(v, d) { return Number.isFinite(v) ? v : d; }
/** 保留两位小数（分钟）。 */
function round2(v) { return Math.round(v * 100) / 100; }
/** 把分钟归一到 [0, 1440)，只用于「查询比较」，绝不改存储值。 */
function modDay(v) { return ((v % DAY_MIN) + DAY_MIN) % DAY_MIN; }
/** 纯 JSON 深拷贝（Service 全是普通数据，无函数/Date，够用且 Node 安全）。 */
function deepClone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

/** 取某车次首站「图定到达」分钟（跨零点存的是绝对值，查询时归一）。 */
function startMinutes(service) {
  const a = service?.stops?.[0]?.arrive;
  return modDay(finiteOr(a, 0));
}
/** 一趟车从首站到末站一共占多少分钟（绝对分钟差，可为跨零点后的大数）。 */
function windowDuration(service) {
  const stops = service?.stops ?? [];
  if (stops.length < 2) return 0;
  const a = finiteOr(stops[0].arrive, 0);
  const b = finiteOr(stops[stops.length - 1].depart, a);
  return Math.max(0, b - a);
}

/** 规范化一个 Service（补 id / direction / 各停点缺省字段），幂等，fromJSON 也走它。 */
function normalizeService(input) {
  if (!input || !Array.isArray(input.stops)) {
    throw new TypeError('Service 必须带 stops 数组');
  }
  const s = { ...input };
  s.id = s.id ?? `svc@${hash32(String(s.trainNo ?? '') + '#' + JSON.stringify(s.stops))}`;
  // direction 统一成 core.DIRECTION 的 ±1，兼容字符串 'reverse'/'down'
  s.direction = (s.direction === DIRECTION.REVERSE || s.direction === -1
    || s.direction === 'reverse' || s.direction === 'down')
    ? DIRECTION.REVERSE : DIRECTION.FORWARD;
  s.stops = s.stops.map((st, i) => {
    const arrive = finiteOr(st.arrive, 0);
    const depart = finiteOr(st.depart, arrive);
    return {
      ...st,
      stationId: st.stationId ?? st.name ?? `stop${i}`,
      name: st.name ?? st.stationId ?? `stop${i}`,
      km: finiteOr(st.km, i),
      arrive,
      depart,
      platformTrack: finiteOr(st.platformTrack, 1),
      // 停站时分(真实秒) = (depart - arrive) * 60；允许外部直接给 dwellSec
      dwellSec: finiteOr(st.dwellSec, Math.max(0, Math.round((depart - arrive) * 60))),
    };
  });
  return s;
}

// ===================================================== A) createTimetable ===

/**
 * 建一张「可替换的运行图」容器。纯数据，Node 里可直接跑。
 *
 * 运行图按「每日重复」处理：一个车次每天在同一图定时刻到点，
 * dueAt / nextService / currentService 都是按 DAY_MIN=1440 的周期算「下一次」。
 * 真实数据若带 GTFS 式 service_id(日历) 或具体开行日期，可在 fromJSON 后由外部
 * hook / 订阅者覆盖这套周期逻辑 —— 容器本身不写死任何日历。
 *
 * @param {Object} route 仅作元信息记录（routeId），可为 null（纯单测时）
 * @param {Object} opts  { clock, startMinutes, minHeadwayMin }
 * @returns {Object} Timetable
 */
export function createTimetable(route, opts = {}) {
  const _route = route ?? null;
  const _subs = new Set();
  let _services = [];
  let _clock = clamp(finiteOr(opts.clock, finiteOr(opts.startMinutes, 0)), 0, Number.MAX_SAFE_INTEGER);
  // validate 里「同一股道不冲突」默认只查真实重叠；设成正数则连最小间隔也查
  const minHeadway = Math.max(0, finiteOr(opts.minHeadwayMin, 0));

  function notify(type, extra = {}) {
    const event = { type, clock: _clock, count: _services.length, ...extra };
    for (const fn of _subs) {
      try { fn(event); } catch (_) { /* 订阅者抛错不影响主流程 */ }
    }
  }

  const api = {
    get route() { return _route; },
    get services() { return _services.slice(); },
    get clock() { return _clock; },

    /** 新增 / 覆盖一个车次（按 id 去重）。返回规范化后的 service。 */
    addService(service) {
      const s = normalizeService(service);
      const i = _services.findIndex((x) => x.id === s.id);
      if (i >= 0) _services[i] = s; else _services.push(s);
      notify('add', { serviceId: s.id });
      return s;
    },

    /** 按 id 删一个车次，返回是否删到。 */
    removeService(id) {
      const i = _services.findIndex((x) => x.id === id);
      if (i < 0) return false;
      _services.splice(i, 1);
      notify('remove', { serviceId: id });
      return true;
    },

    /** 按 id 取车次（便利方法）。 */
    byId(id) { return _services.find((x) => x.id === id) ?? null; },

    /**
     * 下一次「到点」的车次（dueInMin 最小者）。没有车次返回 null。
     * 用日周期，所以永远能给出「今天或明天」的下一班。
     */
    nextService(simMinutes) {
      const t = finiteOr(simMinutes, _clock);
      const list = api.dueAt(t, DAY_MIN);
      return list.length ? list[0].service : null;
    },

    /**
     * 未来 horizonMin 分钟内「到点」的车次，升序返回
     * [{ service, serviceId, trainNo, dueInMin, dueAbs, at }]。
     *  - at      : 图定首站到达（归一到 [0,1440)）
     *  - dueAbs  : 这一次到点的绝对分钟（供去重 / 下单）
     *  - dueInMin: 距 simMinutes 还有多少分钟
     * 跨零点 / 跨天都靠「每次到点 = at + k*1440」处理。
     */
    dueAt(simMinutes, horizonMin = 60) {
      const t = finiteOr(simMinutes, _clock);
      const h = Math.max(0, finiteOr(horizonMin, 60));
      const out = [];
      for (const s of _services) {
        if (!s.stops || !s.stops.length) continue;
        const start = startMinutes(s);
        let k = Math.ceil((t - start) / DAY_MIN);
        if (k < 0) k = 0;
        let dueAbs = start + k * DAY_MIN;
        if (dueAbs < t - 1e-9) dueAbs += DAY_MIN; // 浮点兜底：到点必须 >= 当前
        const dueInMin = dueAbs - t;
        if (dueInMin >= -1e-9 && dueInMin <= h + 1e-9) {
          out.push({
            service: s, serviceId: s.id, trainNo: s.trainNo,
            dueInMin, dueAbs, at: start,
          });
        }
      }
      out.sort((a, b) => (a.dueInMin - b.dueInMin)
        || String(a.serviceId).localeCompare(String(b.serviceId)));
      return out;
    },

    /**
     * simMinutes 时刻「正在跑」的车次：其 [首站到达, 末站出发] 窗口罩住当前时刻。
     * 多趟重叠时取「最近刚发车」的那趟；没有返回 null。
     */
    currentService(simMinutes) {
      const t = finiteOr(simMinutes, _clock);
      let best = null;
      let bestRel = Infinity;
      for (const s of _services) {
        if (!s.stops || !s.stops.length) continue;
        const rel = modDay(t - startMinutes(s));
        const dur = windowDuration(s);
        if (rel <= dur + 1e-9 && rel < bestRel) { best = s; bestRel = rel; }
      }
      return best;
    },

    /**
     * 校验整张图，返回 { ok, errors:[{serviceId, stopIndex, code, message}], services }。
     * 查四项：站序 km 单调(与 direction 一致)、时间递增、停站时分非负、同一股道不冲突。
     * 注意：跨零点请用 >1440 的绝对分钟存储，取模后再存会被判成时间倒流。
     */
    validate() {
      const errors = [];
      const push = (serviceId, stopIndex, code, message) =>
        errors.push({ serviceId, stopIndex, code, message });

      for (const s of _services) {
        const stops = s.stops ?? [];
        if (stops.length < 2) {
          push(s.id, null, 'TOO_FEW_STOPS', '一趟车至少要 2 个停点');
          continue;
        }
        // direction=+1 要 km 递增，direction=-1 要 km 递减
        const sign = s.direction === DIRECTION.REVERSE ? -1 : 1;
        for (let i = 0; i < stops.length; i += 1) {
          const st = stops[i];
          // 时间递增 / 停站时分非负（arrive <= depart）
          if (!(finiteOr(st.arrive, NaN) <= finiteOr(st.depart, NaN))) {
            push(s.id, i, 'TIME_NOT_INCREASING', `arrive(${st.arrive}) > depart(${st.depart})`);
          }
          if (!(finiteOr(st.dwellSec, NaN) >= 0)) {
            push(s.id, i, 'NEGATIVE_DWELL_SEC', `dwellSec(${st.dwellSec}) 必须非负`);
          }
          if (i < stops.length - 1) {
            const nx = stops[i + 1];
            if ((finiteOr(nx.km, 0) - finiteOr(st.km, 0)) * sign <= 0) {
              push(s.id, i, 'KM_NOT_MONOTONIC', `km 未按 direction 单调：${st.km} → ${nx.km}`);
            }
            if (finiteOr(st.depart, NaN) > finiteOr(nx.arrive, NaN) + 1e-9) {
              push(s.id, i, 'TIME_NOT_INCREASING', `depart(${st.depart}) > 下站 arrive(${nx.arrive})`);
            }
          }
        }
      }

      // 同一股道不冲突：按 stationId + platformTrack 分组，按到达排序查占用区间重叠
      const byTrack = new Map();
      for (const s of _services) {
        for (const st of s.stops ?? []) {
          const key = `${st.stationId ?? st.name}#${st.platformTrack}`;
          if (!byTrack.has(key)) byTrack.set(key, []);
          byTrack.get(key).push({
            serviceId: s.id,
            arrive: finiteOr(st.arrive, 0),
            depart: finiteOr(st.depart, 0),
          });
        }
      }
      for (const [key, list] of byTrack) {
        list.sort((a, b) => a.arrive - b.arrive);
        for (let i = 0; i < list.length - 1; i += 1) {
          const a = list[i];
          const b = list[i + 1];
          if (b.arrive < a.depart - 1e-9) {
            push(a.serviceId, null, 'TRACK_CONFLICT',
              `${key}: ${a.serviceId} 与 ${b.serviceId} 占用区间重叠`);
          } else if (minHeadway > 0 && (b.arrive - a.depart) < minHeadway - 1e-9) {
            push(a.serviceId, null, 'TRACK_HEADWAY',
              `${key}: ${a.serviceId} 与 ${b.serviceId} 间隔 < ${minHeadway} min(最小追踪间隔)`);
          }
        }
      }

      return { ok: errors.length === 0, errors, services: _services.length };
    },

    /** 导出成普通可 JSON 序列化对象（可 JSON.stringify 后落盘 / 灌回）。 */
    toJSON() {
      return {
        format: 'cntrainhub.timetable/v1',
        routeId: _route?.id ?? null,
        clock: _clock,
        basis: { ...GEN_BASIS },
        services: _services.map(deepClone),
      };
    },

    /**
     * 整张换图：接受 toJSON 的对象、{ services:[...] } 或 JSON 字符串。
     * 这就是「后续灌真实运行图数据」的入口；返回 api 便于链式调用。
     */
    fromJSON(json) {
      let data = json;
      if (typeof json === 'string') data = JSON.parse(json);
      if (!data || !Array.isArray(data.services)) {
        throw new TypeError('fromJSON: 需要 { services:[...] }、toJSON() 结果或 JSON 字符串');
      }
      _services = data.services.map(normalizeService);
      if (Number.isFinite(data.clock)) _clock = data.clock;
      notify('fromJSON', { count: _services.length });
      return api;
    },

    /** 订阅结构变化(add/remove/fromJSON/reset)，返回取消订阅函数。setClock 不通知(每帧调)。 */
    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      _subs.add(fn);
      return () => _subs.delete(fn);
    },

    /** 推进运行图钟（每帧由系统调用）。故意不 notify，避免刷屏。 */
    setClock(minutes) {
      if (Number.isFinite(minutes)) _clock = minutes;
      return _clock;
    },

    /** 清空所有车次并把钟归位；系统随后可重新 generateServices 灌示意数据。 */
    reset() {
      _services = [];
      _clock = finiteOr(opts.startMinutes, 0);
      notify('reset');
      return api;
    },
  };

  return api;
}

// ==================================================== A) generateServices ===

/** 从 layouts(可无) 取某站股道数，没有真实布局就用默认 4 条，绝不编造规模。 */
function trackCountFor(node, layouts) {
  const L = layouts?.[node.stationId ?? node.name] ?? layouts?.[node.name] ?? null;
  const n = L?.stopZones?.length ?? L?.trackCount ?? 4;
  return clamp(Math.round(finiteOr(n, 4)), 1, 32);
}

/** 站太多时抽样示意停站：保留首末 + 偏向枢纽大站，rng 决定，同一 seed 可重现。 */
function pickStops(seq, maxStops, rand) {
  const n = seq.length;
  if (n <= maxStops) return seq.slice();
  const keep = new Set([0, n - 1]);
  const mids = [];
  for (let k = 1; k < n - 1; k += 1) {
    mids.push({ k, score: (seq[k].role === 'hub' ? 1 : 0) + rand() });
  }
  mids.sort((a, b) => b.score - a.score);
  for (const m of mids) {
    if (keep.size >= maxStops) break;
    keep.add(m.k);
  }
  return [...keep].sort((a, b) => a - b).map((k) => seq[k]);
}

/** 示意车次号：G9xxx 号段 + 上行(偶)/下行(奇) 奇偶，明显避开真实车次并标注示意。 */
function makeTrainNo(direction, i, rand) {
  let n = 9000 + Math.floor(rand() * 900) + i * 2;
  const wantEven = direction === DIRECTION.FORWARD;
  if ((wantEven && n % 2 !== 0) || (!wantEven && n % 2 === 0)) n += 1;
  return `G${n}`;
}

/** 中间站 / 终到 停站时分(min)：中间站 2~5 min 带可重现抖动，终到留立折/出入库时分。 */
function dwellFor(node, isLast, opts, rand) {
  if (isLast) {
    return clamp(finiteOr(opts.turnbackMin, TIMING.turnbackMin), 2, 60);
  }
  const base = node.role === 'hub'
    ? finiteOr(opts.hubDwellMin, TIMING.hubDwellMin)
    : finiteOr(opts.localDwellMin, TIMING.localDwellMin);
  const jitter = (rand() - 0.5) * 1.0; // ±0.5 min 示意抖动
  return clamp(round2(base + jitter), TIMING.minDwellMin, TIMING.maxDwellMin);
}

/**
 * 按真实站序 / 官方里程 / 设计时速「推算」运行时分，生成若干条示意车次。
 *
 * 口径（写进每个 service 的 basis 字段，绝不伪装成真实车次）：
 *  - 停点 = route.nodes 中 role 为 hub/local 的站，按 km 排序；
 *  - 区间运行时分 = |Δkm| / (Route.speed * speedFactor) * 60 + 起车附加 + 停车附加 (min)；
 *  - 中间站停站 2~5 min，终到留立折/出入库 15 min (min)；
 *  - arrive/depart 是「从 0:00 起算的分钟数」，支持 > 1440 跨零点；
 *  - platformTrack 只是示意编号（有真实 layouts 时按其股道数取模）；
 *  - 相邻车次发车间隔 headwayMin(默认 120 min)，保证同一股道占用时间不重叠，
 *    这样 generateServices 的默认产物能直接通过 validate()。
 *
 * @param {Object} route ROUTES 里的一条
 * @param {Object} opts  { seed, count, maxStops, startClock, headwayMin, speedFactor,
 *                         startAddMin, stopAddMin, turnbackMin, stationIds, layouts }
 * @returns {Object[]} Service[]（全部 synthetic:true）
 */
export function generateServices(route, opts = {}) {
  const stations = (route?.nodes ?? [])
    .filter((n) => n.role === 'hub' || n.role === 'local')
    .filter((n) => Number.isFinite(n.km))
    .slice()
    .sort((a, b) => a.km - b.km);
  if (stations.length < 2) return [];

  const rand = rng(opts.seed ?? hash32(`timetable#${route?.id ?? 'route'}`));
  const count = clamp(Math.round(finiteOr(opts.count, 4)), 1, 12);
  const designSpeed = Math.max(80, finiteOr(route?.speed, 250));            // km/h 设计时速
  const speedFactor = clamp(finiteOr(opts.speedFactor, TIMING.speedFactor), 0.4, 1);
  const opSpeed = Math.max(80, designSpeed * speedFactor);                  // 示意运营速度 km/h
  const startAdd = finiteOr(opts.startAddMin, TIMING.startAddMin);
  const stopAdd = finiteOr(opts.stopAddMin, TIMING.stopAddMin);
  const startClock = finiteOr(opts.startClock, 6 * 60);                      // 首班 06:00
  const headway = Math.max(1, finiteOr(opts.headwayMin, 120));
  const layouts = opts.layouts ?? null;
  const maxStops = clamp(Math.round(finiteOr(opts.maxStops, 8)), 2, stations.length);

  let baseSeq = stations;
  if (Array.isArray(opts.stationIds) && opts.stationIds.length >= 2) {
    baseSeq = stations.filter((n) =>
      opts.stationIds.includes(n.stationId ?? n.name) || opts.stationIds.includes(n.name));
    if (baseSeq.length < 2) baseSeq = stations;
  }

  const out = [];
  for (let i = 0; i < count; i += 1) {
    const direction = (i % 2 === 0) ? DIRECTION.FORWARD : DIRECTION.REVERSE;
    let seq = pickStops(baseSeq, maxStops, rand);
    if (direction === DIRECTION.REVERSE) seq = seq.slice().reverse(); // 反向：km 递减

    const trainNo = makeTrainNo(direction, i, rand);
    const fleet = FLEET_SAMPLES[i % FLEET_SAMPLES.length];
    const t0 = startClock + i * headway;
    const stops = [];

    for (let k = 0; k < seq.length; k += 1) {
      const node = seq[k];
      const isLast = k === seq.length - 1;
      let arrive;
      let depart;
      if (k === 0) {
        // 始发站：图定到 = 图定发（无到达作业）；出入库时分已含在终到立折里
        arrive = t0;
        depart = t0;
      } else {
        const prev = stops[k - 1];
        const dKm = Math.abs(node.km - seq[k - 1].km);
        const pureMin = (dKm / opSpeed) * 60;
        // 区间运行时分 = 纯运行 + 起车附加(上一站起动) + 停车附加(本站进站)
        const runMin = pureMin + startAdd + stopAdd;
        arrive = prev.depart + runMin;
        depart = arrive + dwellFor(node, isLast, opts, rand);
      }
      // 示意股道号：同一座站按「车次序号 + 车站哈希」散开，且槽位数 >= 车次数，
      // 于是「每车次在该站占一条独立到发线」→ 默认示意运行图天然无同股道冲突。
      // 股道数有真实 layouts 时按其实数取上限；真实运行图若让多车共用有限股道，
      // validate() 的 TRACK_CONFLICT 检查就会真正派上用场。
      const slots = Math.max(count, trackCountFor(node, layouts));
      const salt = hash32(String(node.stationId ?? node.name)) % slots;
      stops.push({
        stationId: node.stationId ?? node.name,
        name: node.name,
        km: node.km,
        arrive: round2(arrive),
        depart: round2(depart),
        platformTrack: 1 + ((i + salt) % slots),
        dwellSec: Math.max(0, Math.round((depart - arrive) * 60)), // 真实停站秒
      });
    }

    out.push({
      id: `svc-${hash32(`${route?.id ?? 'route'}#${i}#${String(opts.seed ?? '')}`)}`,
      trainNo,
      modelId: fleet.modelId,
      formation: fleet.formation,
      direction,
      stops,
      rollingStock: { modelId: fleet.modelId, formation: fleet.formation, capacity: fleet.capacity },
      color: route?.color ?? null,
      synthetic: true,
      note: SYNTHETIC_NOTE,
      basis: { ...GEN_BASIS, designSpeed, opSpeed: round2(opSpeed), startAddMin: startAdd, stopAddMin: stopAdd },
    });
  }
  return out;
}

// ==================================================== A) stopDwellPolicy ===

/**
 * 车门 / 停站策略（纯函数，Node 可直接单测）。这是「车门可扩展」的关键钩子：
 * 系统层把它的结果写进 ctx.state.autoDwell / autoDepart / doorRequest，
 * 并可经 onDoorPolicy hook 覆盖；dwellSec 同时通过事件 / state 暴露给下游。
 *
 * @param {Object} stop 时刻表停点(带 dwellSec) 或 framework 的 StopZone(带 dwellSec)
 * @param {Object} ctx  运行时 ctx，可为 null（纯函数不依赖它）
 * @returns {{dwellSec:number, doorRequest:null|boolean, autoDwell:boolean, autoDepart:boolean}}
 */
export function stopDwellPolicy(stop, ctx) {
  // 真实停站秒：优先用 stop.dwellSec，否则用 (depart-arrive)*60，再兜到默认 3 min
  let realSec = finiteOr(stop?.dwellSec, NaN);
  if (!(realSec > 0)) {
    realSec = Math.max(0, (finiteOr(stop?.depart, 0) - finiteOr(stop?.arrive, 0)) * 60);
  }
  if (!(realSec > 0)) realSec = TIMING.defaultRealDwellSec;
  // 真实秒 → 仿真门开秒（压缩口径，可被 hook 改）
  const dwellSec = clamp(
    Math.round(realSec / TIMING.doorScale),
    TIMING.doorMinSec, TIMING.doorMaxSec,
  );
  return {
    dwellSec,
    doorRequest: null,   // null = 交给框架自动（进出区间自动开关门）
    autoDwell: true,     // 保留框架的「进站自动停车」
    autoDepart: true,    // 保留框架的「车门关好自动发车」
  };
}

// ============================================ B) createScheduleSystem ===

/** 默认 hook：全空实现；install(hooks) 用外部实现覆盖。 */
const DEFAULT_HOOKS = Object.freeze(
  Object.fromEntries(Object.keys(TIMETABLE_HOOKS).map((k) => [k, () => undefined])),
);

/**
 * 建「时刻表系统」（标准 System：{ id, phase, init, update, onEvent, dispose } + 扩展口）。
 *
 * 装配方式见 packs/harbin.js：createTimetable: (ctx) => createScheduleSystem(ctx, { layouts })。
 *  - sys.timetable          暴露整张图，外部可 fromJSON 灌真实数据；
 *  - sys.install(hooks)     注入自定义 hook 实现（需求 4 的扩展准备）；
 *  - sys.stats()           给 HUD 的 { serviceId, trainNo, nextStop, nextArrive,
 *                                      dwellLeft, onTime, delayMin, state }；
 *  - 立折 / 换向：终到时 emit TIMETABLE_EVENTS.REVERSE_REQUEST，宿主监听后调
 *    runtime.setDirection()/reverse()，框架再发 EVENT.REVERSE，本系统据此 onReverse
 *    并接管一趟反向车次（呼应真实「G6730→G6713 变更车次」）。本层绝不旋转列车。
 *
 * @param {Object} ctx  框架 ctx（需 .state / .bus / .emit / .route）
 * @param {Object} opts { layouts, seed, count, dueHorizonMin, onTimeToleranceMin, ...generateServices opts }
 * @returns {Object} System
 */
export function createScheduleSystem(ctx, opts = {}) {
  const layouts = opts.layouts ?? null;
  const timetable = createTimetable(ctx?.route ?? null, {
    clock: ctx?.state?.simMinutes,
    minHeadwayMin: opts.minHeadwayMin,
  });

  const hooks = { ...DEFAULT_HOOKS };
  function callHook(name, ...args) {
    const fn = hooks[name];
    if (typeof fn !== 'function') return undefined;
    try { return fn(...args); } catch (_) { return undefined; }
  }

  /** 发包：优先用 ctx.emit(=bus.emit)，兼容只给了 bus 的场景。 */
  function fire(c, type, payload) {
    const cc = c ?? ctx;
    if (cc?.emit) cc.emit(type, payload);
    else if (cc?.bus?.emit) cc.bus.emit(type, payload);
  }

  // ---- 运行态 ----
  let activeService = null;   // 当前「播放」的车次
  let activeIndex = 0;        // 当前 / 下一个停点索引
  let phase = 'idle';         // idle | running | dwelling | terminated | reversing
  let direction = DIRECTION.FORWARD;
  let dwellLeft = 0;
  let delayMin = 0;
  let onTime = true;
  let lastDoorState = null;
  let lastClock = finiteOr(ctx?.state?.simMinutes, 0);
  let unsub = null;
  let disposed = false;
  const dueEmitted = new Map(); // serviceId -> 上一次已发 SERVICE_DUE 的 dueAbs

  function setActive(service) {
    activeService = service ?? null;
    activeIndex = 0;
    phase = service ? 'running' : 'idle';
    direction = service ? (service.direction ?? DIRECTION.FORWARD) : DIRECTION.FORWARD;
    dwellLeft = 0;
    delayMin = 0;
    onTime = true;
  }

  /** zone(来自 framework zonesNear) → 当前车次停点索引，匹配不上返回 -1。 */
  function matchStop(zone) {
    if (!activeService || !zone) return -1;
    const id = zone.stationId ?? zone.name;
    let idx = activeService.stops.findIndex((st) => st.stationId === id);
    if (idx < 0) {
      idx = activeService.stops.findIndex((st) => st.name === id || st.name === zone.name);
    }
    return idx;
  }

  /**
   * 把 stopDwellPolicy 的结果写进框架公共状态，真正「接管 / 扩展」车门。
   *  - autoDwell / autoDepart / doorRequest：framework 每帧都读，立即生效；
   *  - dwellSec：在 APPROACH/ARRIVE 帧写进 ctx.state.stopZone.dwellSec（onEvent 早于
   *    车门状态机，故本帧生效）；同时经 onDoorPolicy hook、DOOR_POLICY 事件、
   *    ctx.state.timetable.policy 暴露，供后续框架/站场模块消费。
   *  注意：framework 的 StopZone 由 zonesNear 每帧重建，故 dwellSec 的「持久注入」
   *  留作扩展口；真正常驻生效的是上面三个 state 字段。
   */
  function applyDoorPolicy(stop, c) {
    let policy = stopDwellPolicy(stop, c);
    const custom = callHook('onDoorPolicy', policy, c);
    if (custom && typeof custom === 'object') policy = { ...policy, ...custom };

    const st = c?.state;
    if (st) {
      st.autoDwell = policy.autoDwell;
      st.autoDepart = policy.autoDepart;
      st.doorRequest = policy.doorRequest;
      if (st.stopZone && Number.isFinite(policy.dwellSec)) st.stopZone.dwellSec = policy.dwellSec;
      st.timetable = {
        ...(st.timetable ?? {}),
        serviceId: activeService?.id ?? null,
        trainNo: activeService?.trainNo ?? null,
        stop: stop ? {
          stationId: stop.stationId, name: stop.name,
          arrive: stop.arrive, depart: stop.depart,
        } : null,
        policy: { ...policy },
      };
    }
    fire(c, TIMETABLE_EVENTS.DOOR_POLICY, { policy, service: activeService, stop });
    return policy;
  }

  /** 重新灌示意运行图（线路切换 / 初始化共用）。用 fromJSON 一次性替换。 */
  function reseed(c, route) {
    const r = route ?? c?.route ?? ctx?.route ?? timetable.route;
    try {
      const list = generateServices(r, { ...opts, layouts });
      timetable.fromJSON({
        services: list,
        clock: finiteOr(c?.state?.simMinutes, 0),
      });
      setActive(null);
      dueEmitted.clear();
    } catch (_) { /* 没线路数据时保持空图，不炸 */ }
  }

  /** 终到请求逻辑掉头（立折）。宿主监听 REVERSE_REQUEST → 调 reverse()。 */
  function requestReverse(c, service) {
    const to = service?.direction === DIRECTION.FORWARD
      ? DIRECTION.REVERSE : DIRECTION.FORWARD;
    fire(c, TIMETABLE_EVENTS.TERMINATE, { service, serviceId: service?.id ?? null });
    fire(c, TIMETABLE_EVENTS.REVERSE_REQUEST, {
      service, serviceId: service?.id ?? null,
      from: service?.direction ?? direction, to,
      note: '立折 / 换向请求：宿主监听后调用 runtime.setDirection() 或 reverse()；本层不旋转列车',
    });
  }

  function init(c) {
    const cc = c ?? ctx;
    // 先订阅：结构变化后清理去重表 / 当前车次，避免引用被删掉的车次
    unsub = timetable.subscribe((ev) => {
      dueEmitted.clear();
      if (ev.type === 'reset' || ev.type === 'fromJSON') setActive(null);
    });
    reseed(cc, cc?.route ?? ctx?.route);
    lastClock = finiteOr(cc?.state?.simMinutes, 0);
    timetable.setClock(lastClock);
  }

  function update(c, dt) {
    if (disposed) return;
    const cc = c ?? ctx;
    const st = cc?.state;
    const clock = finiteOr(st?.simMinutes, timetable.clock);
    timetable.setClock(clock);

    // ---- 1) 按 simMinutes 检查 dueAt，emit SERVICE_DUE（每车次每周期只发一次）----
    const span = Math.max(0, clock - lastClock);
    const horizon = Math.max(0.01, finiteOr(opts.dueHorizonMin, 1));
    for (const e of timetable.dueAt(lastClock, span + horizon)) {
      if (dueEmitted.get(e.serviceId) === e.dueAbs) continue;
      dueEmitted.set(e.serviceId, e.dueAbs);
      const ignore = callHook('onServiceStart', e.service, cc);
      fire(cc, EVENT.SERVICE_DUE, {
        service: e.service, serviceId: e.serviceId, trainNo: e.trainNo,
        dueInMin: e.dueInMin, at: e.at, dueAbs: e.dueAbs, simMinutes: clock,
      });
      if (ignore === false) continue; // hook 可拦截「设为当前车次」
      setActive(e.service);
      fire(cc, TIMETABLE_EVENTS.SERVICE_START, { service: e.service, simMinutes: clock });
    }

    // ---- 2) 停站中：每帧 onDwellTick + 算 dwellLeft / delayMin / onTime ----
    if (phase === 'dwelling' && activeService) {
      const stop = activeService.stops[activeIndex] ?? null;
      if (stop) {
        callHook('onDwellTick', activeService, stop, cc);
        const door = st?.doorState;
        const zoneDwell = finiteOr(st?.stopZone?.dwellSec,
          clamp(Math.round(stop.dwellSec / TIMING.doorScale), TIMING.doorMinSec, TIMING.doorMaxSec));
        dwellLeft = Math.max(0, zoneDwell - finiteOr(door?.dwell, 0));
        // 晚点示意估计：仿真钟(按日归一) 相对图定到达，跨零点按 ±720 min 折回
        let delta = modDay(clock) - modDay(stop.arrive);
        if (delta < -DAY_MIN / 2) delta += DAY_MIN;
        if (delta > DAY_MIN / 2) delta -= DAY_MIN;
        delayMin = round2(Math.max(0, delta));
        onTime = delayMin <= finiteOr(opts.onTimeToleranceMin, 3);
      }
    } else {
      dwellLeft = 0;
    }

    lastClock = clock;
  }

  /** 监听框架事件，派发对应 hook，维护运行态。签名与 registry 的 onEvent(type,payload,ctx) 对齐。 */
  function onEvent(type, payload, c) {
    const cc = c ?? ctx;
    switch (type) {
      case EVENT.APPROACH: {
        const idx = matchStop(payload?.zone);
        if (idx >= 0 && activeService) {
          activeIndex = idx;
          if (phase === 'idle' || phase === 'terminated') phase = 'running';
          const stop = activeService.stops[idx];
          callHook('onApproach', activeService, stop, cc);
          applyDoorPolicy(stop, cc); // 进站前把策略写进框架（早于车门状态机）
        }
        break;
      }
      case EVENT.ARRIVE: {
        const idx = matchStop(payload?.zone);
        if (idx >= 0) activeIndex = idx;
        const stop = activeService?.stops?.[activeIndex] ?? null;
        if (stop) {
          phase = 'dwelling';
          callHook('onArrive', activeService, stop, cc);
          applyDoorPolicy(stop, cc); // 到站帧再写一次，保证本帧 dwellSec 生效
        }
        break;
      }
      case EVENT.DEPART: {
        const stop = activeService?.stops?.[activeIndex] ?? null;
        if (!stop) break;
        callHook('onDepart', activeService, stop, cc);
        const nextIdx = activeIndex + 1;
        if (activeService && nextIdx >= activeService.stops.length) {
          // 跑完最后一个停点 = 终到 → 立折 / 换向请求
          phase = 'terminated';
          callHook('onTerminate', activeService, cc);
          requestReverse(cc, activeService);
        } else {
          activeIndex = nextIdx;
          phase = 'running';
        }
        break;
      }
      case EVENT.DOORS: {
        lastDoorState = payload?.state ?? null;
        break;
      }
      case EVENT.REVERSE: {
        const d = payload?.dir;
        direction = (d === DIRECTION.REVERSE || d < 0) ? DIRECTION.REVERSE : DIRECTION.FORWARD;
        phase = 'reversing';
        callHook('onReverse', activeService, cc);
        // 立折后接管一趟反向车次（变更车次号，呼应 G6730→G6713）
        const list = timetable.services;
        const ret = list.find((s) => (s.direction ?? DIRECTION.FORWARD) === direction
          && s.id !== activeService?.id)
          ?? list.find((s) => (s.direction ?? DIRECTION.FORWARD) === direction);
        if (ret) setActive(ret);
        break;
      }
      case EVENT.DIRECTION_CHANGE: {
        // REVERSE 已处理过，这里只同步方向，避免 onReverse 被重复调用
        const d = payload?.dir;
        direction = (d === DIRECTION.REVERSE || d < 0) ? DIRECTION.REVERSE : DIRECTION.FORWARD;
        break;
      }
      case EVENT.ROUTE_CHANGE: {
        reseed(cc, payload?.route ?? cc?.route);
        lastClock = finiteOr(cc?.state?.simMinutes, 0);
        break;
      }
      default:
        break;
    }
  }

  /** 注入自定义 hook 实现（返回 sys 便于链式）。只接受函数值，键名见 TIMETABLE_HOOKS。 */
  function install(custom) {
    if (!custom || typeof custom !== 'object') return sys;
    for (const [k, v] of Object.entries(custom)) {
      if (typeof v === 'function') hooks[k] = v;
    }
    return sys;
  }

  /** 给 HUD 的即时状态。 */
  function stats() {
    const stops = activeService?.stops ?? [];
    const dwelling = phase === 'dwelling';
    const idx = dwelling ? Math.min(activeIndex + 1, stops.length - 1)
      : Math.min(activeIndex, stops.length - 1);
    const upcoming = stops[idx] ?? null;
    return {
      serviceId: activeService?.id ?? null,
      trainNo: activeService?.trainNo ?? null,
      nextStop: activeService ? (upcoming?.name ?? '终点') : null,
      nextArrive: upcoming?.arrive ?? null,
      dwellLeft: round2(dwellLeft),
      onTime,
      delayMin,
      state: phase,
      // 下面几个是额外便利字段，不影响上面要求的 8 项
      direction,
      synthetic: Boolean(activeService?.synthetic),
      doorState: lastDoorState,
    };
  }

  function dispose() {
    disposed = true;
    if (unsub) { unsub(); unsub = null; }
    dueEmitted.clear();
    setActive(null);
  }

  const sys = {
    id: 'timetable',
    phase: SYSTEM_PHASE.TIMETABLE,
    init,
    update,
    onEvent,
    dispose,
    // ---- 扩展口 ----
    timetable,        // 外部可 sys.timetable.fromJSON(真实图) 整张换图
    install,          // 外部注入 hook 实现
    stats,            // HUD
    setTimetable(json) { timetable.fromJSON(json); return sys; },
    get activeService() { return activeService; },
    get direction() { return direction; },
    get hooksInstalled() { return Object.keys(hooks).filter((k) => hooks[k] !== DEFAULT_HOOKS[k]); },
  };
  return sys;
}

export default createScheduleSystem;

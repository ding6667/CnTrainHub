/**
 * passengers.js —— 站台客流仿真（纯逻辑 FlowModel + 可视化 Standard System）。
 *
 * 【大白话】这个模块只干一件事：模拟「一列动车停站开门时，站台上的人怎么上下车」。
 * 站台是唯一的状态空间——人只会：在站台候车(waiting) → 走向对应车门(boarding) →
 * 上车(onboard) / 下车(alighting) → 沿站台走几步消失(leaving)。
 * 不生成站外街道、商场、马路上的行人，那些不归本模块管。
 *
 * 文件分两层：
 *  1) 上半段（FLEET_CAPACITY / STATION_FLOW / capacityFor / seatsPerCarFor /
 *     flowFor / createFlowModel）是**纯 JS**：只 import core.js 的数学工具，
 *     不碰 THREE、不碰 DOM，可以直接在 Node 里 import 跑单测。
 *  2) 下半段 createPassengerSystem 是**可视化 System**：用 THREE.InstancedMesh
 *     画低多边形小人，监听 framework 发的 ARRIVE/DOORS/ALIGHT/BOARD/DEPART 事件。
 *
 * 【坐标】沿用 core.js：1 单位 = 1 米，列车固定在局部原点、车头朝 -Z，
 * 站台面 y = RAIL.platformHeight = 1.25（人脚底必须踩在这一层，不能悬空、不能钻进车体）。
 * 站台边缘到线路中心 RAIL.platformEdge = 1.75，人一律站在 x ≥ 1.75 一侧。
 * 车门局部 z 来自 TrainSpec.doorZ（每节车两端各一处），停车区间绝对里程
 * StopZone.s0/s1 按 evaluateStop 同款公式 z = dir*(s - mileage) 换算成本地 z 范围。
 *
 * ==================================================================================
 * 【联网核实资料：标题 | URL | 关键数字】（2026-11 检索；禁止编造精确数字，估算均标注口径）
 * ==================================================================================
 *
 * ---- 一、各车型定员 / 座位数 ----
 *  - 国际在线/中新网/中证网：“复兴号”CR400BF 8 辆短编定员 576 人，逐车厢：
 *    1 车一等/商务(商务5+一等28=33)、2/3/6/7 车二等各 90、4 车二等(残疾人位)75、
 *    5 车餐座合造 63、8 车二等/商务(商务5+二等40=45)；重联(8+8)1152 人。
 *    https://hebei.cri.cn/20180119/dbcc595e-155d-16a1-b460-a5f2d2ab6145.html
 *    https://m.chinanews.com/wap/detail/cht/zw/8429497.shtml
 *  - 国铁集团/人民网/央视网：CR400BF-A 16 辆长编总定员 1193 人
 *    （商务座 22、一等座 148、二等座 1023），全长 414.26 m，1 号车独立商务座车、
 *    2~3 号车一等座；8 辆短编的 2 倍多。
 *    http://www.china-railway.com.cn/xwzx/zhxw/202004/t20200421_103457.html
 *    http://henan.people.com.cn/BIG5/n2/2020/0418/c351638-33958312.html
 *    https://big5.cntv.cn/gate/big5/news.cctv.com/2018/06/09/ARTIoRUv5tyNwJ8PVHZzawGg180609.shtml
 *  - 人民网/央广网/百度百科(D8602)：CRH5A 8 辆(5M3T)总定员 622 人
 *    （一等座 60、二等座 562），中间车带餐吧、7 号车设残疾人座席。
 *    https://news.ifeng.com/c/7foUQkhT62T
 *    https://www.cnr.cn/xjfw/2014xjfw/2014xjfw_1/201411/t20141110_516755812.shtml
 *    https://baike.baidu.com/item/D8602次列车/16157920
 *  - 项目 src/data.json 车型 note：CRH5G 是 CRH5A 同平台 8 辆 5M3T 高寒/抗风沙型，
 *    公开资料明确「外观与涂装除车钩整流罩外与 CRH5A 并无二致」——CRH5G 定员无
 *    独立公开数字，本表按 CRH5A 622 人估算（口径见各条 note）。
 *  - 中国动车组网 china-emu.cn：CRH380BG 8 辆(4M4T)非统型定员 551 人
 *    （特等16/一等44/二等491，逐车厢 52/80/80/71/40/80/80/68）；
 *    CRH380BG(统型) 定员 556 人（商务10/一等28/二等518，逐车厢
 *    33/85/85/75/63/85/85/45，5 车为带吧台二等座车 ZEC）。
 *    https://www.china-emu.cn/Trains/Model/para-31001-101-36.html
 *    https://www.china-emu.cn/Trains/Model/FN-31003-101-6.html
 *  - 新华网/国际在线/海峡导报/腾讯：CR200J3-C「AD 钙」9 辆短编总定员 676 人，
 *    1 动力车 + 8 拖车（6 二等座车 + 1 二等座/餐车 + 1 一等座/商务座车），
 *    商务座 6 个（鱼骨型），全长 231.7 m，设计时速 160。
 *    https://my-h5news.app.xinhuanet.com/chaobian-difanglink/fj.news.cn/20250626/01c0463fb3564571b40ed359a77b9460/c.html
 *    https://fj.cri.cn/2025-06-27/638272a8-9129-161c-ce4d-b7fcf9c8b623.html
 *    https://epaper.taihainet.com/html/20250626/hxdb752706.html
 *
 * ---- 二、车站日均 / 高峰发送旅客量（万人次/日；本表 daily 换算成「人次/日」） ----
 *  - 哈尔滨市人民政府：节假日期间「哈尔滨站、哈尔滨西站日均发送旅客 18 万人次，
 *    最高峰将达到 24 万人次」。
 *    https://www.harbin.gov.cn/haerbin/c106979/202305/c01_734815.shtml
 *  - 哈尔滨新闻网：2026 五一哈尔滨站管内预计发送 118 万人次、日均 14.8 万，
 *    5 月 1 日高峰 20.8 万；哈铁全集团日均 39 万、高峰 53.1 万。
 *    https://www.my399.com/wzhbsh/2026/04-30/8Dgaj3a1.html
 *  - 搜狗百科「哈尔滨西站」：2016 全年发送 806 万人（≈日均 2.2 万），
 *    高峰每天 5.5 万；2014 春运单日纪录 3.7 万。
 *    https://baike.sogou.com/v7837294.htm
 *  - 牡丹江市人民政府：牡丹江站 2026 年 1—8 月累计 570.85 万人次、日均 2.35 万；
 *    2025 年 1—5 月日均 2.26 万。百度百科：2024 全年 833.22 万，2023 年
 *    高峰期日发送 3.16 万、日到发列车 128 列。
 *    https://mdj.gov.cn/mdjsrmzf/c100010/202609/c03_1060329.shtml
 *    https://baike.baidu.com/item/牡丹江站/6171987
 *  - 央广网/中国网「哈齐高铁十周年」：齐齐哈尔南站 2025 年日均发送 8400 人、
 *    到达 9000 人、日均到发 17400；2015 年日均发送 4681（终端站到达≈发送）。
 *    大庆西站清晨通勤客流日均 1.9 万。
 *    https://www.cnr.cn/hlj/jdt/20250825/t20250825_527336975.shtml
 *    https://hlj.china.com.cn/2025-08/26/content_43212403.htm
 *  - 黑龙江省人民政府/腾讯：哈铁 2024 暑运日均 32.3 万、端午日均 35.8 万、
 *    五一日均 37.6 万、五一高峰日 50.5 万（全集团量级，用于校准分档，不是单站数）。
 *    https://hlj.gov.cn/hlj/c107856/202406/c00_31741257.shtml
 *    https://news.qq.com/rain/a/20240630A01BGC00
 *  - 哈尔滨北站、佳木斯站：检索未得该站**独立**公开日均发送量（只有全集团/节假日
 *    口径），故不在 STATION_FLOW 里编造单站精确值，按所属「一等站」tier 量级兜底。
 *
 * ---- 三、高铁客流时间分布 / 停站时分 / 大站乘降 ----
 *  - SCIRP《Optimization of HSR Operation Schedule …》（基于国铁集团 2022—2025
 *    真实运营统计，Table 1 全日客流分布）：00–06 点 4.2%、07–09 早高峰 22.6%
 *    （满载率 92.3%）、10–16 平峰 35.8%（71.6%）、17–19 晚高峰 24.1%（90.8%）、
 *    20–24 点 13.3%；早晚高峰合计占全日 46.6%。折算：早高峰小时强度≈2.71×、
 *    晚高峰≈2.89× 全日平均 → 本文件 peakFactor / HOUR_SHAPE 即据此。
 *    https://content.scirp.org/pdf/wjet_1561918.pdf
 *  - 杭州政协网：杭州西站 6—8 点为进站高峰，列车密集发车「部分车次间隔仅两分钟」。
 *    https://www.hzzx.gov.cn/cshz/content/2023-01/17/content_8450776.htm
 *  - 成都东站（今日头条转述）：「高铁列车在过路站停靠时间有限，通常为 2 至 5 分钟，
 *    期间完成旅客上下车、上水」；广州南枢纽「停站时间严格控制在 2 分钟以内」。
 *    https://m.toutiao.com/article/7546124613420401192
 *    https://m.toutiao.com/article/7662361408746570292
 *  - 大站乘降/上车率：澎湃「广州南站单日到发 104.9 万（发送 64.1 万、到达 40.8 万），
 *    换乘客流日均 8 万、最高 15 万」；北京西站 2026 暑运「分区检票：西侧候车室
 *    负责 1—8 号车厢、东侧负责 9—16 号车厢，旅客就近候车、就近检票」。
 *    这说明大站乘降量大、且**上车客流按车厢号就近分流**（A/B 检票口对应前后半列）。
 *    https://m.thepaper.cn/newsDetail_forward_34208763
 *    https://news.qq.com/rain/a/20260803A02GEI00
 *    https://www.shidiannet.com/2026/1009/179154934622210.html
 *
 * ---- 四、客流仿真常规做法 ----
 *  - 《铁路客运专线车站乘客集散微观仿真模型》(交通运输工程学报 2009)：公交化运营
 *    下「旅客到达事件基本符合泊松流 p(λ)=e^-λ λ^k/k!」；发车频率低时到达时间受
 *    时刻表影响、服从对数正态。
 *    https://transport.chd.edu.cn/cn/article/doi/10.19818/j.cnki.1671-1637.2009.01.017?viewType=HTML
 *  - 哈工大《高铁客运枢纽换乘行为分析与设施配置方法研究》：「乘客到达可看作到达率
 *    不断变化的泊松过程，服务时间服从负指数分布」；候车时间用对数正态拟合。
 *    https://search.napstic.cn/literature/degree/0620150100546293
 *  - 上海地铁漕宝路站 AnyLogic 仿真：到达泊松、服务时间指数分布、排队 M/M/c，
 *    列车按时刻表到站—开门上下客—关门离站。
 *    http://www.zhilikp.cn/detail?id=1801
 *  - Glasgow《Simulation-Based Headway Optimization》：按 Poisson 生成到站人数、
 *    站台按方向分流、记录每人候车时间。
 *    https://eprints.gla.ac.uk/338164/1/338164.pdf
 *
 * 【哪些是估算 / 示意级近似（一律写明口径，不当精确数字用）】
 *  ① CR400BF 16 辆、CRH5A、CR200J3-C 的「逐车厢座位数」：公开资料只给了总定员 +
 *    座席分级，逐车厢分配按「头车/中间车/餐车」常见布局反推，属示意级分配；
 *    总数与分级是公开数字。② CRH5G 定员按同平台 CRH5A 622 估算。
 *  ③ standing（无座冗余）= capacity×20% 的估算字段，公开资料无独立站票定员；
 *    仿真中 capacity 是硬上限，不叠加 standing 放宽。④ 哈尔滨北/佳木斯等站按
 *    tier 兜底。⑤ alightRatio（下车比例）为示意级估算（参考终端站到达≈发送、
 *    枢纽乘降集中度）。⑥ 日内 HOUR_SHAPE 由 SCIRP 五档占比摊到 24 小时再归一化。
 *  ⑦ 站台可视人数按 ≤240 实例硬钳位，真实量级经 visualScale 压缩（见 System）。
 *  ⑧ 车厢↔车门就近、走行速度、负指数离站时间均为示意级动画参数。
 *  ⑨ 「大站上车率」没有统一公开精确值，本文件以「大站乘降量大 + 高峰满载率
 *    90.8~92.3% + 按车厢就近分流」作为口径，不编造单一上车率百分数。
 */

import * as THREE from 'three';
import {
  EVENT, SYSTEM_PHASE, DOOR_STATE, RAIL,
  clamp, poisson, rng, hash32, createTrainSpec,
} from './core.js';

// ========================================================================
// 一、纯数据：车型定员表
// ========================================================================

/** CR400BF 平台 8 辆短编的公开逐车厢数字（G / GZ / GS 共用这套几何与定员）。 */
const CR400BF_8 = {
  capacity: 576,
  baseFormation: 8,
  seatsPerCar: [33, 90, 90, 75, 63, 90, 90, 45],
  // 16 辆长编：定员/分级为公开数字，逐车厢按「1 商务车 + 2 一等车 + 13 二等/餐车」反推
  knownCapacity: { 16: 1193 },
  knownSeatsPerCar: {
    16: [22, 74, 74, 80, 63, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80],
  },
  standing: 115,
  sources: [
    '国际在线：「复兴号」标准动车组1月20日起在石太客专上线运行 | https://hebei.cri.cn/20180119/dbcc595e-155d-16a1-b460-a5f2d2ab6145.html | 8 辆定员 576，逐车厢 33/90/90/75/63/90/90/45',
    '中新网：山西迎来「复兴号」列车 | https://m.chinanews.com/wap/detail/cht/zw/8429497.shtml | 每组 8 辆定员 576，重联 1152',
    '国铁集团：复兴号动车组落户中原大地 | http://www.china-railway.com.cn/xwzx/zhxw/202004/t20200421_103457.html | CR400BF-A 16 辆定员 1193（商务22/一等148/二等1023）',
    '央视网：加长版「复兴号」一等座增至148个 | https://big5.cntv.cn/gate/big5/news.cctv.com/2018/06/09/ARTIoRUv5tyNwJ8PVHZzawGg180609.shtml | 全长 414.26 m，总定员 1193',
  ],
  note: '8 辆短编定员 576、逐车厢座位数为公开报道数字；16 辆长编总定员 1193 与座席分级(22/148/1023)为公开数字，16 辆逐车厢分配是按「1 商务座车 + 2 一等座车 + 12 二等座车 + 1 二等/餐车」反推的示意级估算。standing=capacity×20% 为估算无座冗余，仿真不据此放宽。',
};

/**
 * 7 款车型齐全。字段：
 *   capacity / seatsPerCar 为 data.json 里的「基础编组」(8 或 9 辆) 公开定员；
 *   baseFormation 基础编组辆数；standing 估算无座冗余；
 *   knownCapacity / knownSeatsPerCar 为「已查到真实数字的其它编组」(给 capacityFor 精确返回)；
 *   sources / note 资料与口径说明。
 */
export const FLEET_CAPACITY = {
  'CR400BF-G': {
    ...CR400BF_8,
    note: '金凤凰高寒版 8 辆短编；定员沿用 CR400BF 平台 576。' + CR400BF_8.note,
  },
  'CR400BF-GZ': {
    ...CR400BF_8,
    note: '龙凤呈祥智能高寒型 8 辆短编；智能平台几何/定员与 CR400BF 一致，按 576 计。' + CR400BF_8.note,
  },
  'CR400BF-GS': {
    ...CR400BF_8,
    note: '高寒技术提升型 8 辆短编；与 G 共用 CR400BF 平台，按 576 计。' + CR400BF_8.note,
  },
  'CRH5A': {
    capacity: 622,
    baseFormation: 8,
    seatsPerCar: [60, 90, 90, 74, 63, 90, 90, 65],
    standing: 124,
    sources: [
      '人民网/凤凰网：新疆高铁动车用速度说话 | https://news.ifeng.com/c/7foUQkhT62T | CRH5A 8 辆，一等座 60、二等座 562、全列 622',
      '央广网：记者探访乌鲁木齐动车运用所 | https://www.cnr.cn/xjfw/2014xjfw/2014xjfw_1/201411/t20141110_516755812.shtml | 8 辆 5M3T、总定员 622、配一节餐车',
      '百度百科：D8602 次列车 | https://baike.baidu.com/item/D8602次列车/16157920 | 总定员 622，7 号车残疾人座席，二等 3+2 布局',
    ],
    note: '总定员 622、一等 60 / 二等 562 为公开数字；逐车厢分配按「1 一等座车 + 1 餐吧车 + 1 残疾人位二等车 + 5 二等座车」反推（二等合计 562），属示意级估算。餐吧在中间车、7 号车设残疾人位。',
  },
  'CRH5G': {
    capacity: 622,
    baseFormation: 8,
    seatsPerCar: [60, 90, 90, 74, 63, 90, 90, 65],
    standing: 124,
    sources: [
      '项目 src/data.json：CRH5G 车型 note | src/data.json | 在 CRH5A 基础上借鉴 CRH380BG 研制的 250 km/h 统型高寒车，8 辆 5M3T、全长 211.5 m，外观涂装与 CRH5A 并无二致',
      '人民网/凤凰网：CRH5A 定员 622 | https://news.ifeng.com/c/7foUQkhT62T | 同平台 8 辆 5M3T 定员 622',
    ],
    note: 'CRH5G 无独立公开定员数字；口径：与 CRH5A 同平台 8 辆 5M3T、公开资料称外观/涂装除车钩整流罩外并无二致，故按 CRH5A 622 人及同一逐车厢分配估算。',
  },
  'CRH380BG': {
    capacity: 556,
    baseFormation: 8,
    seatsPerCar: [33, 85, 85, 75, 63, 85, 85, 45],
    knownCapacity: { 8: 551 }, // 非统型(特等座版)也是 8 辆，另给的公开数，仅作资料登记
    standing: 111,
    sources: [
      '中国动车组网：CRH380BG(统型) | https://www.china-emu.cn/Trains/Model/FN-31003-101-6.html | 定员 556（商务10/一等28/二等518），逐车厢 33/85/85/75/63/85/85/45，5 车 ZEC 餐吧',
      '中国动车组网：CRH380BG | https://www.china-emu.cn/Trains/Model/para-31001-101-36.html | 非统型定员 551（特等16/一等44/二等491），逐车厢 52/80/80/71/40/80/80/68',
      '微信公众号「高寒兔」CRH380BG 档案 | http://mp.weixin.qq.com/s?__biz=MzcwNTI2NzY5OA==&mid=2247484255&idx=1&sn=6ab831034b43ef2ec529c39e133cb36f | 非统型 551、统型 556，8 辆 4M4T，全长 200.67 / 202.95 m',
    ],
    note: '统型 556（商务10/一等28/二等518）与非统型 551（特等16/一等44/二等491）均为公开数字，本表取当前常见的统型 556；逐车厢为 china-emu.cn 公开编组表。knownCapacity[8]=551 仅登记非统型公开数，capacityFor 默认返回统型 556。',
  },
  'CR200J3-C': {
    capacity: 676,
    baseFormation: 9,
    seatsPerCar: [0, 56, 95, 95, 50, 95, 95, 95, 95],
    standing: 135,
    sources: [
      '新华网：福厦铁路新列车 今起在厦可乘坐 | https://my-h5news.app.xinhuanet.com/chaobian-difanglink/fj.news.cn/20250626/01c0463fb3564571b40ed359a77b9460/c.html | 9 节（1 动力车 + 8 拖车）：6 二等座 + 1 二等/餐车 + 1 一等/商务，总载客 676，全长 231.7 m',
      '国际在线：「AD 钙」动车组 福厦铁路首跑 | https://fj.cri.cn/2025-06-27/638272a8-9129-161c-ce4d-b7fcf9c8b623.html | 总定员 676，商务座 6 个（鱼骨型）',
      '海峡导报：「AD 钙」动车来了 | https://epaper.taihainet.com/html/20250626/hxdb752706.html | 9 节短编、总定员 676、时速 160',
    ],
    note: '总定员 676、编组构成(1 动力车 + 6 二等 + 1 二等/餐 + 1 一等/商务)、商务座 6 为公开数字；逐车厢分配为示意级反推：动力车 0 座、一等/商务车 56(一等 50 + 商务 6)、6 节二等座车各 95(=570)、二等/餐车(含控制车座席)50，合计 676。',
  },
};

/** 把基础 seatsPerCar 扩/缩到目标辆数：头车/尾车保留，中间车用「中间车平均定员」补齐。 */
function expandSeats(seatsPerCar, formation) {
  const n = seatsPerCar.length;
  const f = Math.max(2, Math.round(formation));
  if (f === n) return seatsPerCar.slice();
  const head = seatsPerCar[0];
  const tail = seatsPerCar[n - 1];
  const mid = seatsPerCar.slice(1, n - 1);
  const midAvg = mid.length
    ? Math.round(mid.reduce((a, b) => a + b, 0) / mid.length)
    : Math.round((head + tail) / 2);
  const out = [head];
  for (let i = 1; i < f - 1; i += 1) out.push(midAvg);
  out.push(tail);
  return out;
}

/** 纯函数：某车型某编组(8/9/16…)的总定员。已查到真实数字的编组精确返回，其余按中间车均值估算。 */
export function capacityFor(modelId, formation, fleet = FLEET_CAPACITY) {
  const e = fleet?.[modelId];
  if (!e) return 0;
  const f = Math.max(1, Math.round(formation || e.baseFormation));
  if (f === e.baseFormation) return e.capacity;
  if (e.knownCapacity && e.knownCapacity[f] != null && f !== e.baseFormation) return e.knownCapacity[f];
  return expandSeats(e.seatsPerCar, f).reduce((a, b) => a + b, 0);
}

/** 纯函数：某车型某编组的逐车厢座位数（长度 = formation）。 */
export function seatsPerCarFor(modelId, formation, fleet = FLEET_CAPACITY) {
  const e = fleet?.[modelId];
  if (!e) return [];
  const f = Math.max(1, Math.round(formation || e.baseFormation));
  if (f === e.baseFormation) return e.seatsPerCar.slice();
  if (e.knownSeatsPerCar && e.knownSeatsPerCar[f]) return e.knownSeatsPerCar[f].slice();
  return expandSeats(e.seatsPerCar, f);
}

// ========================================================================
// 二、纯数据：车站客流量分档
// ========================================================================

/**
 * daily 单位 = 人次/日（= 公开报道「万人次/日」× 10000）。
 * peakFactor = 高峰小时强度 / 全日平均（据 SCIRP 早高峰≈2.71、晚高峰≈2.89）。
 * alightRatio = 该站下车人数占车上人数的比例（示意级估算，见 note）。
 */
const TIER_FLOW = {
  tier1: {
    daily: 60000, peakFactor: 2.8, alightRatio: 0.46,
    sources: [
      '哈尔滨市人民政府：节日我在岗 | https://www.harbin.gov.cn/haerbin/c106979/202305/c01_734815.shtml | 哈尔滨站+哈尔滨西站节假日合计日均 18 万、最高峰 24 万',
      'SCIRP WJET 论文 Table 1 | https://content.scirp.org/pdf/wjet_1561918.pdf | 早高峰 22.6%/2h、晚高峰 24.1%/2h → 小时强度≈2.7~2.9×',
    ],
    note: '特等站/大型枢纽兜底档：常日日均按 6 万人次/日估算（节假日可达 15~24 万），高峰系数取 SCIRP 早/晚高峰≈2.8；alightRatio 0.46 为示意级估算（枢纽乘降集中度大）。',
  },
  tier2: {
    daily: 20000, peakFactor: 2.6, alightRatio: 0.38,
    sources: [
      '牡丹江市人民政府：前8个月牡丹江站发送旅客逾570万人次 | https://mdj.gov.cn/mdjsrmzf/c100010/202609/c03_1060329.shtml | 日均 2.35 万',
      '央广网：哈齐高铁十周年 | https://www.cnr.cn/hlj/jdt/20250825/t20250825_527336975.shtml | 齐齐哈尔南 2025 日均发送 8400、到发 17400',
      '黑龙江省人民政府：端午假期哈铁预计发送旅客近180万人次 | https://hlj.gov.cn/hlj/c107856/202406/c00_31741257.shtml | 全集团日均 35.8 万（校准量级）',
    ],
    note: '一等站/地区枢纽兜底档：日均按 2 万人次/日量级（牡丹江 2.35 万、齐齐哈尔南 0.84 万、佳木斯/哈尔滨北按此档兜底）；alightRatio 0.38 示意级估算。',
  },
  tier3: {
    daily: 4000, peakFactor: 2.4, alightRatio: 0.30,
    sources: [
      '央广网：哈齐高铁十周年 | https://www.cnr.cn/hlj/jdt/20250825/t20250825_527336975.shtml | 大庆西通勤日均 1.9 万（较忙的中间站），普通小站显著更低',
      '成都东站：动车提前15分钟检票时间够吗 | https://m.toutiao.com/article/7546124613420401192 | 过路站停站 2~5 分钟',
    ],
    note: '二等/三等中小站兜底档：日均按 0.4 万人次/日量级估算；小站乘降量小、下车比例取 0.30 示意级估算。',
  },
};

/** 具体站点：只登记查到公开数字的站；查不到的走 tier 兜底，不编造单站精确值。 */
export const STATION_FLOW = {
  harbin: {
    daily: 80000, peakFactor: 2.6, alightRatio: 0.46,
    sources: [
      '哈尔滨新闻网：哈铁「五一」假期预计运送旅客312万人次 | https://www.my399.com/wzhbsh/2026/04-30/8Dgaj3a1.html | 哈尔滨站管内日均 14.8 万、高峰日 20.8 万',
      '哈尔滨市人民政府：节日我在岗 | https://www.harbin.gov.cn/haerbin/c106979/202305/c01_734815.shtml | 哈尔滨站+哈西节假日合计日均 18 万、高峰 24 万',
    ],
    note: '常日日均按 8 万人次/日估算（节假日公开值 14.8~20.8 万）；peakFactor 2.6 对应高峰时段放大；alightRatio 0.46 示意级估算。tier=1（特等）。',
  },
  harbinxi: {
    daily: 22000, peakFactor: 2.5, alightRatio: 0.42,
    sources: [
      '搜狗百科：哈尔滨西站 | https://baike.sogou.com/v7837294.htm | 2016 全年发送 806 万(≈日均 2.2 万)、高峰 5.5 万/日、2014 春运单日纪录 3.7 万',
      '哈尔滨新闻网：客流大涨非遗出圈 | https://www.my399.com/wzhbsh/2026/06-18/V1Q8gvdk.html | 端午假期哈西预计发送 18.4 万、单日高峰 15 万（全集团）',
    ],
    note: '常日日均 2.2 万（由 2016 全年 806 万换算，公开数字），高峰 5.5 万/日 → peakFactor 2.5；alightRatio 0.42 示意级估算。tier=1。',
  },
  qiqihaernan: {
    daily: 8400, peakFactor: 2.4, alightRatio: 0.48,
    sources: [
      '央广网：哈齐高铁十周年 | https://www.cnr.cn/hlj/jdt/20250825/t20250825_527336975.shtml | 齐齐哈尔南 2025 日均发送 8400、到达 9000、到发 17400；2015 日均发送 4681',
      '中国网黑龙江：一亿人次坐高铁带来了什么 | https://hlj.china.com.cn/2025-08/26/content_43212403.htm | 同上，到达≈发送',
    ],
    note: '日均发送 8400 为 2025 公开数字；终端站到达≈发送，故 alightRatio 取较高 0.48（示意级）；tier=2。',
  },
  mudanjiang: {
    daily: 23500, peakFactor: 2.4, alightRatio: 0.38,
    sources: [
      '牡丹江市人民政府：前8个月牡丹江站发送旅客逾570万人次 | https://mdj.gov.cn/mdjsrmzf/c100010/202609/c03_1060329.shtml | 2026 年 1—8 月日均 2.35 万',
      '百度百科：牡丹江站 | https://baike.baidu.com/item/牡丹江站/6171987 | 2024 全年 833.22 万、2023 高峰日发送 3.16 万、日到发 128 列',
    ],
    note: '日均 2.35 万为 2026 年 1—8 月公开数字；高峰日 3.16 万 / 日均 1.86 万≈1.7（节假日口径，与时段 peakFactor 不同口径）；tier=2。',
  },
  // 哈尔滨北、佳木斯：未查到独立公开单站日均，交给 tier2 兜底（此处只留资料链接，不写 daily 精确值）
  tier1: TIER_FLOW.tier1,
  tier2: TIER_FLOW.tier2,
  tier3: TIER_FLOW.tier3,
  // 中文等级名也当 key，方便按「特等/一等」查
  特等: TIER_FLOW.tier1,
  一等: TIER_FLOW.tier2,
  二等: TIER_FLOW.tier3,
  三等: TIER_FLOW.tier3,
};

/** 车站电报码 / 中文名 / slug → STATION_FLOW 的规范 key。 */
const STATION_ALIASES = {
  HBB: 'harbin', VAB: 'harbinxi', HTB: 'harbinbei', VBB: 'harbindong',
  QNB: 'qiqihaernan', MDB: 'mudanjiang', JMB: 'jiamusi', RHX: 'daqingxi',
  '哈尔滨': 'harbin', '哈尔滨站': 'harbin', '哈尔滨西': 'harbinxi',
  '哈尔滨西站': 'harbinxi', '哈尔滨北': 'harbinbei', '哈尔滨北站': 'harbinbei',
  '哈尔滨东': 'harbindong', '齐齐哈尔南': 'qiqihaernan', '齐齐哈尔': 'qiqihaernan',
  '牡丹江': 'mudanjiang', '佳木斯': 'jiamusi', '大庆西': 'daqingxi',
};

/** 已知车站等级（来自 stations.js 的 STATION_CATALOG tier：1 特等 / 2 一等 / 3 二三等）。 */
const TIER_OF = {
  harbin: 1, harbinxi: 1, harbinbei: 2, harbindong: 2,
  mudanjiang: 2, jiamusi: 2, qiqihaernan: 2, daqingxi: 2, suihua: 2,
  suifenhe: 3, manzhouli: 3, hailaer: 3, jiagedaqi: 3, mohe: 3,
};

/**
 * 纯函数：查某站的客流档。优先级：
 *   STATION_FLOW[站 id/别名] → 按 tier(tierHint / 对象.tier / TIER_OF / role) 兜底 → tier2。
 * station 可传字符串(站名/电报码/slug) 或 {stationId,name,tier,role} 对象。
 */
export function flowFor(station, tierHint) {
  const raw = typeof station === 'string'
    ? station
    : (station?.stationId ?? station?.id ?? station?.name ?? '');
  const key = STATION_ALIASES[raw] ?? raw;
  const exact = STATION_FLOW[key];
  if (exact) return exact;
  let t = (typeof station === 'object' && station?.tier != null) ? station.tier : tierHint;
  if (t == null) {
    if (station?.role === 'local' || station?.kind === 'local') t = 3;
    else t = TIER_OF[key] ?? 2;
  }
  t = clamp(Number(t) || 2, 1, 3);
  return STATION_FLOW[`tier${t}`] ?? STATION_FLOW.tier2;
}

// ========================================================================
// 三、日内时段峰谷（据 SCIRP Table 1 摊到 24 小时，均值归一化为 1）
// ========================================================================

const HOUR_SHAPE = (() => {
  // 00-06 深夜低、07-09 早高峰、10-16 平峰、17-19 晚高峰、20-24 回落，五档占比的来源见文件头。
  const raw = [
    0.17, 0.17, 0.17, 0.17, 0.17, 0.17, 0.60,       // 0–6
    2.70, 2.70, 1.80,                                // 7–9 早高峰
    1.43, 1.43, 1.43, 1.43, 1.43, 1.43,             // 10–15 平峰
    2.00,                                            // 16
    2.90, 2.90, 1.20,                                // 17–19 晚高峰
    0.80, 0.80, 0.80, 0.80,                          // 20–23
  ];
  const mean = raw.reduce((a, b) => a + b, 0) / 24;
  return raw.map((v) => v / mean); // 均值严格 = 1，保证 Σ(全天到发) ≈ daily
})();

const _hfCache = new Map();
/** 把「均值=1」的形状按站的 peakFactor 拉开峰谷：峰值≈peakFactor，全天总量仍守恒。 */
function hourFactors(peakFactor) {
  const pf = clamp(peakFactor || 2.4, 1, 6);
  const ck = pf.toFixed(2);
  if (_hfCache.has(ck)) return _hfCache.get(ck);
  const max = Math.max(...HOUR_SHAPE);
  const k = (pf - 1) / (max - 1);
  const f = HOUR_SHAPE.map((v) => Math.max(0.02, 1 + (v - 1) * k));
  const m = f.reduce((a, b) => a + b, 0) / 24;
  const out = f.map((v) => v / m);
  _hfCache.set(ck, out);
  return out;
}

// ========================================================================
// 四、纯逻辑 FlowModel（可单测；不 import THREE、不碰 DOM）
// ========================================================================

/**
 * createFlowModel(opts) —— 纯函数工厂，返回只含普通对象/方法的客流模型。
 * 复用 core.js 的 poisson / rng / clamp，不自己重写随机数与泊松。
 *
 * opts = { fleet = FLEET_CAPACITY, scale = 1 }，scale 是给「节假日」整体放大的可选系数。
 */
export function createFlowModel(opts = {}) {
  const fleet = opts.fleet || FLEET_CAPACITY;
  const scale = Math.max(0, opts.scale ?? 1);
  // 内部累计统计（闭包内，纯函数无外部副作用）
  const S = {
    carLoad: [], capacity: 0, station: null,
    waiting: 0, boarded: 0, alighted: 0,
  };

  /** 泊松到达：daily/1440 是全天平均每分钟到站人数，再乘时段峰谷系数与 scale。 */
  function sampleArrivals(station, minute, rand) {
    const f = flowFor(station);
    const h = ((Math.floor((minute || 0) / 60) % 24) + 24) % 24;
    const tf = hourFactors(f.peakFactor)[h];
    const lambda = Math.max(0, (f.daily / 1440) * tf * scale);
    return poisson(lambda, rand || Math.random);
  }

  /**
   * 按车门就近分车厢、受 seatsPerCar 限制。
   * passengers 为数字(人数)时按各车厢定员加权分配；为数组时按每个元素的 z/pos
   * 找最近的「车门中点」归属车厢。返回值 = 各车厢分到的人数数组(长度=车厢数)，
   * 每格 ≤ seatsPerCar[i]，超出部分被丢弃(= 排队不再上车)。
   */
  function splitByCar(passengers, trainSpec) {
    const seats = (trainSpec?.seatsPerCar || []).map((x) => Math.max(0, Math.round(x)));
    const n = seats.length || (trainSpec?.carCenters?.length || 0);
    const out = new Array(n).fill(0);
    if (!n || !seats.length) return out;
    const doors = trainSpec?.doorZ;
    const mids = [];
    for (let i = 0; i < n; i += 1) {
      mids.push(doors && doors.length >= 2 * n
        ? (doors[2 * i] + doors[2 * i + 1]) / 2
        : (trainSpec?.carCenters?.[i] ?? i));
    }
    const capTotal = seats.reduce((a, b) => a + b, 0) || 1;
    if (Array.isArray(passengers)) {
      for (let k = 0; k < passengers.length; k += 1) {
        const p = passengers[k];
        const z = (typeof p === 'number') ? p : (p?.z ?? p?.pos ?? p?.platformZ ?? 0);
        let best = 0; let bd = Infinity;
        for (let i = 0; i < n; i += 1) {
          const d = Math.abs(mids[i] - z);
          if (d < bd) { bd = d; best = i; }
        }
        out[best] += 1;
      }
    } else {
      const total = Math.max(0, Math.round(passengers));
      for (let i = 0; i < n; i += 1) out[i] = Math.floor(total * seats[i] / capTotal);
      let left = total - out.reduce((a, b) => a + b, 0);
      let guard = 0;
      while (left > 0 && guard < n * 4) {
        guard += 1;
        let placed = false;
        for (let i = 0; i < n && left > 0; i += 1) {
          if (seats[i] > 0) { out[i] += 1; left -= 1; placed = true; }
        }
        if (!placed) break;
      }
    }
    for (let i = 0; i < n; i += 1) out[i] = Math.min(out[i], seats[i]); // seatsPerCar 硬上限
    return out;
  }

  /** 同步内部 carLoad 引用、返回 length 对齐的数组。 */
  function syncLoad(carLoad, n) {
    if (!Array.isArray(carLoad)) return new Array(n).fill(0);
    for (let i = carLoad.length; i < n; i += 1) carLoad[i] = 0;
    carLoad.length = n;
    for (let i = 0; i < n; i += 1) carLoad[i] = Math.max(0, Math.round(carLoad[i]));
    return carLoad;
  }

  /**
   * 上车：carLoad 原地修改。capacity 是全车硬上限，seatsPerCar[i] 是每车厢上限，
   * 超员时剩余候车者 waitingLeft 排队不再上车。返回 { boarded, waitingLeft, carLoad }。
   */
  function board(trainSpec, carLoad, waiting, zone) {
    const cap = Math.max(0, trainSpec?.capacity || 0);
    const seats = (trainSpec?.seatsPerCar || []).map((x) => Math.max(0, Math.round(x)));
    const n = seats.length;
    const load = syncLoad(carLoad, n);
    const count = typeof waiting === 'number'
      ? Math.max(0, Math.round(waiting))
      : (Array.isArray(waiting) ? waiting.length : Math.max(0, Math.round(waiting?.count ?? 0)));
    let onboard = 0;
    for (let i = 0; i < n; i += 1) onboard += load[i];
    let free = Math.max(0, cap - onboard);
    const split = splitByCar(count, trainSpec);
    let boarded = 0;
    for (let i = 0; i < n && free > 0; i += 1) {
      const room = Math.max(0, seats[i] - load[i]);
      const take = Math.min(split[i], room, free);
      if (take > 0) { load[i] += take; boarded += take; free -= take; }
    }
    const waitingLeft = Math.max(0, count - boarded);
    S.carLoad = load; S.capacity = cap; S.waiting = waitingLeft;
    S.boarded += boarded;
    S.station = (typeof zone === 'string' ? zone : (zone?.stationId ?? zone?.name)) ?? S.station;
    return { boarded, waitingLeft, carLoad: load };
  }

  /**
   * 下车：按站 alightRatio 逐车厢分流（每人伯努利 / 大样本正态近似，含随机抖动）。
   * carLoad 原地扣减。返回 { alighted, perCar, carLoad }。
   */
  function alight(trainSpec, carLoad, zone, rand) {
    const r = rand || Math.random;
    const ratio = clamp(flowFor(zone).alightRatio, 0, 1);
    const n = (trainSpec?.seatsPerCar || []).length;
    const load = syncLoad(carLoad, n);
    const perCar = new Array(n).fill(0);
    let alighted = 0;
    for (let i = 0; i < n; i += 1) {
      const m = load[i];
      let leave = 0;
      if (m <= 40) {
        for (let k = 0; k < m; k += 1) if (r() < ratio) leave += 1;
      } else {
        const mu = m * ratio;
        const sd = Math.sqrt(m * ratio * (1 - ratio));
        const z = (r() + r() + r() + r() - 2) * 0.7; // 近似标准正态
        leave = clamp(Math.round(mu + sd * z), 0, m);
      }
      load[i] = m - leave;
      perCar[i] = leave;
      alighted += leave;
    }
    S.carLoad = load; S.alighted += alighted;
    S.station = (typeof zone === 'string' ? zone : (zone?.stationId ?? zone?.name)) ?? S.station;
    return { alighted, perCar, carLoad: load };
  }

  /** HUD 用统计快照。 */
  function stats() {
    return {
      waiting: S.waiting,
      onboard: S.carLoad.reduce((a, b) => a + Math.max(0, b), 0),
      alighted: S.alighted,
      boarded: S.boarded,
      carLoad: S.carLoad.slice(),
      capacity: S.capacity,
      station: S.station,
    };
  }

  function reset() {
    S.carLoad = []; S.capacity = 0; S.station = null;
    S.waiting = 0; S.boarded = 0; S.alighted = 0;
  }

  return {
    sampleArrivals, splitByCar, board, alight, stats, reset,
    flowFor, capacityFor, seatsPerCarFor,
    state: S,
  };
}

// ========================================================================
// 五、可视化 System（THREE.InstancedMesh；站台乘降状态机 + 步态 + 分部件人形）
// ========================================================================

/**
 * 【改写目标】解决「游客在火车道上跑 / 动画不连贯 / 建模质量极低」：
 *  1) 乘客绝不进轨道：所有坐标先经 computeBands() 从 ctx / stationLayouts / StopZone /
 *     RAIL 常量推导「真实站台 x 带」，再对每个人体锚点做硬钳位；任何实例矩阵 |x| ≥ 3.6、
 *     脚底 y = 站台面高（RAIL.platformHeight 1.25），绝不悬空、绝不踩道床/钢轨。
 *  2) 动画连贯：完整状态机 waiting→walking→boarding→onboard 与 alighting→walking→leaving，
 *     用「连续路径(弧长参数化)插值 + 时间/路程驱动的步态 + 朝向平滑旋转 + 缩放/色淡出」，
 *     没有任何一帧瞬移、闪现或突然 freeAgent。按车厢门聚拢排队、候车不越安全线、不随机乱走；
 *     先下后上、不同 z 车道 + 错峰，避免上下车互相穿透。
 *  3) 建模：头 / 躯干 / 双臂 / 双腿 / 行李 分部件 InstancedMesh，身高/体型/肤色/衣着/裤色/
 *     行李(拉杆箱或背包) 差异，程序化材质零第三方模型/贴图。
 *
 * 【联网核实资料 · 第 1 轮：乘降组织 / 地标排队 / 安全线】
 *  - 澎湃《惊!站台候车学问大,竟然还有人不知道?》 https://www.thepaper.cn/newsDetail_forward_11222652
 *    站台彩色「车厢号地标」按编组/方向指引，旅客据箭头找对应车厢「站在黄线内安全候车」；
 *    「列车到站后，先下后上，秩序上车」、依次排队、留意站台与列车间隙。
 *  - 今日头条《有这些方法可以快速找到车厢》 https://m.toutiao.com/article/7571368211854131758/
 *    地标颜色(黄/绿/蓝/紫)对应 16 正编/16 反编/8 正编/8 反编；站台安全防护屏显示车厢号；
 *    「在站台安全线内排队等候，列车停稳后先下后上」。
 *  - 澎湃《提醒!春节来临,进站上车这些事》 https://m.thepaper.cn/baijiahao_16517190
 *    「严禁越过安全白线」「在相对应的地标处排队」「严禁在站台上奔跑或玩耍」。
 *  - 澎湃《站台上的这些安全知识》 https://m.thepaper.cn/baijiahao_19892916
 *    站台工作人员喇叭提示「请在安全线里面走」；按车厢号在白线内侧排队；开车铃响后停止乘降。
 *
 * 【联网核实资料 · 第 2 轮：安全线距离规范 / 客流密度 / 走行速度 / 站台作业人员】
 *  - 百度百科《站台安全线》 https://baike.baidu.com/item/站台安全线/67513267
 *    我国站台安全线距站台边缘通常 1 m；高铁站 1.5 m 甚至更宽（伯努利效应）。
 *  - 澎湃《再次强调:这里绝对不能越界!》(引《铁路技术管理规程》第157条)
 *    https://m.thepaper.cn/baijiahao_13192985
 *    高站台边缘距线路中心 1750 mm(=RAIL.platformEdge)、安全标线距站台边缘 1000 mm。
 *  - 国家铁路局《铁路旅客运输服务质量》标准专家解读
 *    https://www.nra.gov.cn/xwzx/xwxx/gdxw/202204/t20220405_279303.shtml
 *    4.2.4.2：距站台边缘不小于 1.0 m 设 0.10 m 宽安全警戒线；1.25 m 高站台宜设屏蔽门。
 *  - 国家铁路局《工程建设标准 2024 年第 4 批》
 *    https://source.nra.gov.cn/xxgk/gkml/ztjg/bzgf/jsbz/202408/P020240816403182026793.pdf
 *    站台邻靠正线、通过速度>80km/h 时安全标线距边缘 1.5 m。
 *  - 建管家《铁路旅客候乘流线组织与站房设计协同优化规范》 https://m.jiangongdata.com/toutiao/920920.html
 *    普通候车室人均≥1.1 ㎡/人；人均<0.93 ㎡ 时舒适度显著下降。
 *  - 温州动车南站送客平台交通组织(学术) https://cn.acad-pub.com/index.php/ETR/article/viewFile/7215/6359
 *    携行李排队密度取 δ=4 人/㎡。
 *  - Rail Baltica《Stations and passenger platforms》设计指南
 *    https://www.railbaltica.org/wp-content/uploads/2025/07/RBDG-MAN-026-0104_StationsAndPassengerPlatforms.pdf
 *    车门通过流 1 人/秒；走行速度常客 1.40 m/s、生客 1.10 m/s。
 *  - ACM《Simulation-Based Analysis of Emergency Dispersal of Large Passenger Flows in HSR Hubs》
 *    https://dlnext.acm.org/doi/10.1145/3829441.3829589
 *    高峰小时 8000~10000 人、瞬时最大聚集 1182 人（量级校准，非单站台密度）。
 *  - 中国宁波网《宁海铁路指挥部提醒遵守安全事项》 http://news.cnnb.com.cn/system/2009/09/25/006274273.shtml
 *    动车组停站 1~2 分钟；按车厢号在车门位置排队等候；离站台边沿 2 m 以外候车(老线口径)。
 *  - 铁道职培《铁路客运员在站台组织旅客乘降时的关键安全措施》
 *    https://www.mlzp.cc/forum.php?action=printable&mod=viewthread&tid=16141
 *    客运员提前上岗、在扶梯口/列车中部「平行于安全线」固定立岗、面向列车目迎目送、
 *    从列车进入站台至开出站台不擅离；组织先下后上、按车厢号在白线内排队、劝阻奔跑。
 *
 * 【据此落到本模块的数值/行为口径】
 *  ① 安全线：候车锚点距站台边缘 ≥ SAFETY_LINE(1.5 m，正线邻靠>80km/h)，且部件最外缘不越线；
 *     本模块为保守，连上下车位移也不越 HARD_MIN_X。
 *  ② 硬红线：任何实例矩阵 |x| ≥ 3.6（任务要求；≈道床半宽 2.6 m + 1.0 m 安全余量），
 *     脚底 y = 站台面高 1.25（layout.platformHeight 优先，RAIL 兜底），绝不进轨道/道床/悬空。
 *  ③ 排队：按车厢门 doorZ 聚拢，同门 1~2 列、纵向间距 0.82 m(≈δ=4 人/㎡ 略放宽)，
 *     候车不越线不随机乱走；a.carIndex 分组近似「彩色地标按车厢号」。
 *  ④ 先下后上：framework 的 ALIGHT 先于 BOARD；下车者走外侧 z 车道且早出发，上车者走车门
 *     z 车道且按 ≈1 人/秒错峰，二者不在同一 (x,z) 互相穿透。
 *  ⑤ 走行速度 1.0~1.3 m/s(据 Rail Baltica 1.1~1.4)，步态相位按「累计路程」驱动，停下即不摆。
 *  ⑥ 站台作业人员：STAFF 固定立岗(见 spawnStaff)，不随客流移动、面朝列车、进出站全程在岗。
 *  ⑦ 人数：可视人数 ≤132 实例(示意级压缩)，真实量级仍由 flow 的泊松到达 + 定员硬上限决定，
 *     不编造单站台精确密度。
 *
 * 【联网核实资料 · 第 3 轮（team-lead 补充，2026-11）：安全线三层标线 / 四色地标 / 作业时序】
 *  - 澎湃《站台候车/地标/安全线》 thepaper.cn/newsDetail_forward_23660758
 *  - 科普中国《四色地标与停车标》（蓝/黄/紫/绿对应 8/16 正/反编；地标标车厢号与前后方向）
 *  - 人民铁道 peoplerail《站台乘降组织 / 悬挂电子引导屏 / 客运员立岗》
 *  - 新华网《站台升降式安全防护栏（仅部分站加装，哈西未核实，默认不做）》
 *  （以上为 team-lead 转述的检索结论，URL 以其给出的域名/路径为准，未编造精确数字）
 *  站台面高 1250 mm；三层标线：贴边缘白色安全线、黄色凸起盲道、距边缘 1 m 处宽 0.06 m
 *  黄色警戒线；四色地标蓝=8 正编 / 黄=16 正编 / 紫=8 反编 / 绿=16 反编；作业时序
 *  停稳→对标误差(±20~50 cm)→车门开(门灯/蜂鸣)→下车→上车→关门→发车；高铁站台
 *  不设地铁式全高屏蔽门，站台与车体留 10~20 cm 可见缝隙。
 *
 * 【据此追加的行为口径 ⑧~⑫】
 *  ⑧ 安全线三层标线：候车者一律站在安全带内侧(锚点距站台边缘 ≥1.5 m，含部件/行李也不越线)，
 *     禁止进入站台边缘 1 m 安全带。
 *  ⑨ 停稳时序：停稳→对标误差(门位确定性微偏移 ±STOP_ERROR，不做零误差瞬停)→开门
 *     (BOARD_HOLD 门灯/蜂鸣延迟)→下车流(先走 ALIGHT_LEAD)→上车流(错峰)→关门→发车；
 *     列车进站/出站/通过时整体后退到线内(S.retreat)，停稳且开门前绝不向车门移动。
 *  ⑩ 四色地标：按 formation+dir 选色(蓝/黄/紫/绿)，按色块成列排队、每队对准一个车门，
 *     去掉随机撒点；地标色以队列衣着 instanceColor 轻微着色示意(零新增面/贴图)，
 *     真实地面色块 / 悬挂电子引导屏属站场几何，本模块不画。
 *  ⑪ 16 辆重联 8/9 节之间不相通：排队与离站方向按「所在半列」朝两端发散，不生成贯通人流。
 *  ⑫ 站台禁止奔跑：步速恒定 1.0~1.25 m/s 无奔跑状态；不设全高屏蔽门/升降护栏(默认)，
 *     站台与车体 10~20 cm 缝隙由车体/站台几何负责，本模块上下车不真的跨越缝隙。
 *
 * 【仍是近似 / 示意级，不当精确值】
 *  - 站台 x 区间三层推导：① 优先读 ctx/layout 注入的真实 platformBand（最精确）；
 *    ② 否则用 bandsFromLayout() 由 StationLayout 的 platformCount/trackCount/mainTracks/
 *    platformWidth/platformEdge + RAIL.trackCenters 复现站场 x 排布（不写死股道索引）；
 *    ③ 连 layout 都没有才按 RAIL 常量退化到「正线两侧 [platformEdge+…, platformEdge+width-0.5]」，
 *    三层都硬钳 |x|≥3.6。
 *  - 站场几何由另一 agent 改为「以正线为中心贴合 + 中央正线通道无站台、站台对称分布到两侧」，
 *    故贴合后最近的站台并不在 ±platformEdge，而是隔着中央通道在更远处（大站可达 ±10 m 以上）；
 *    bandsFromLayout 正是为对齐这版几何。若站场算法再次调整，建议由宿主注入 ctx.platformBands 覆盖。
 *  - 【坐标系契约，比注入值本身更关键】乘客 group 直接挂 scene（世界/列车原点坐标系、单位变换），
 *    站场 field 挂在 chunk group 下、会随 alignment.localMatrixAt(s, s0, {lane}) 整体平移
 *    Δx=laneOffset；列车固定世界原点、乘客不横移。故注入的 platformBand 必须是「已换算到
 *    列车/世界坐标系」(含 Δx) 的区间，**不是站场局部(相对正线中心 x=0)坐标**：
 *      · lane=MAIN：Δx=0，局部坐标 == 世界坐标，当前 [11.5,23.5]→[14,22] 完全正确；
 *      · lane≠MAIN：局部带在乘客坐标系里整体偏 Δx，注入任何静态局部值都会踩空/悬空。
 *    因此「列车进到发线贴站台」要成立，须由框架层在组装 StopZone 时把「局部带 + Δx」写进
 *    zone.platformBand / platformX0,X1（本模块的透传优先分支自动精确对齐，无须再改）。
 *    Δx 属 alignment.js，本模块与站场层都不复制该数学。默认 lane=MAIN 下对接已正确。
 *  - 「登车/下车」用朝车门方向的连续位移 + 缩放/色淡出(fade) 示意，不真的穿过车体几何。
 *  - 步态/朝向/体型为程序化动画，非动作捕捉；零第三方模型 / 零贴图。
 */

// ---------------------------------------------------------------- 预算常量 ----
/** 实例硬上限：5 个部件 mesh 满容量 ≈ 11,088 三角面(见 acquireShared 注释)，≤12000。 */
const MAX_INSTANCES = 132;
// 真实量级 → 站台可视人数的示意级压缩系数。原 0.05 让哈西高峰也只有 16 人、
// 常日 6 人，450 m 站台看起来空无一人；0.12 下高峰约 35~40 人、常日 14~18 人，
// 既有人气又远在 132 实例 / 11k 面预算内。
const VISUAL_SCALE = 0.12;
const STAFF_COUNT = 2;         // 站台客运员：固定立岗，资料见文件头第 2 轮
const CLOTHING = [0x3a6ea5, 0xb5533c, 0x4f7d54, 0x8a6ea8, 0xc9963f, 0x4a4f5a, 0x2f7f8f, 0xa8586e, 0x6b7f4a, 0x9a5a3c];
const PANTS = [0x2b3038, 0x3e4a5a, 0x4a4038, 0x30343a, 0x555a52];
const SKINS = [0xe8c39e, 0xd8ac86, 0xf0d0b0, 0xc98f6b];
const LUGGAGE_COLORS = [0x333a44, 0x5a3b2e, 0x24405a, 0x3a4a3a];
const STAFF_VEST = 0xc6e04a;    // 荧光黄绿反光背心
const STAFF_PANTS = 0x26303a;

const FEET_Y_FALLBACK = RAIL.platformHeight; // 1.25
const SAFETY_LINE = 1.5;       // 安全警戒线距站台边缘(正线邻靠、>80km/h 取 1.5m)
const EDGE_INSET = 0.5;        // 站台外缘留白
const PART_MARGIN = 1.0;       // 部件(臂/腿/行李)相对人体锚点的最大横向偏移(含体型放大余量)
const HARD_MIN_X = 3.6;        // 任务硬红线：任何实例矩阵 |x| ≥ 3.6
const ANCHOR_MIN = HARD_MIN_X + PART_MARGIN; // 人体锚点 |x| 下限 = 4.6
const WALK_SPEED = 1.25;       // m/s，据 Rail Baltica 1.1~1.4
const BOARD_SPEED = 1.0;       // 车门口拥挤降速
const GAIT_PER_M = 4.2;        // 步态相位 rad/米(步幅≈0.75m，一个周期≈1.5m)
const FADE_SEC = 0.55;         // 淡出/淡入时长（连续，绝不瞬间消失）
const QUEUE_GAP = 0.82;        // 同门排队纵向间距(m)
const ALIGHT_Z_LANE = 1.5;     // 下车者相对车门 z 的偏道(m)，与上车者分流
const BOARD_STAGGER = 0.55;    // 同门上车错峰(s) ≈ 车门 1 人/秒
// 第 3 轮资料：四色地标 / 三层安全线 / 停稳时序 / 重联不相通
const LANDMARK_COLORS = Object.freeze({ blue: 0x2f6fd0, yellow: 0xe0b53a, purple: 0x7d4fa8, green: 0x3a9d5a });
const SAFETY_BELT = 1.0;       // 站台边缘 1 m 安全带(白线/盲道/黄色警戒线)，候车绝不进入
const STOP_ERROR = 0.35;       // 对标误差 ±0.2~0.5 m，门位微偏移，不做零误差瞬停
const BOARD_HOLD = 0.6;        // 车门打开(门灯/蜂鸣)后的停顿，再开始上车
const ALIGHT_LEAD = 0.9;       // 下车流先行：先下后上，拆成两股不同时序
const RETREAT_DIST = 1.2;      // 进站/出站/通过时整体后退到安全线内的额外距离(m)

// 人体局部尺寸(m)，脚底 y=0，模型面朝 -Z
const LEG_LEN = 0.82, LEG_W = 0.16, LEG_D = 0.18, LEG_X = 0.11, HIP_Y = 0.82;
const TORSO_W = 0.40, TORSO_H = 0.62, TORSO_D = 0.24, TORSO_Y = HIP_Y + TORSO_H / 2;
const HEAD_S = 0.24, HEAD_Y = HIP_Y + TORSO_H + HEAD_S / 2;
const ARM_LEN = 0.58, ARM_W = 0.13, ARM_D = 0.14, ARM_X = TORSO_W / 2 + ARM_W / 2, SHOULDER_Y = HIP_Y + TORSO_H - 0.05;
const LUG_W = 0.26, LUG_H = 0.40, LUG_D = 0.18;

// ---------------------------------------------------------------- 共享资源 ----
// 5 个部件几何 + 1 个 Lambert 材质(实例色由 instanceColor 给，零贴图)。
// 预算(maxInstances=132)：head 132×12 + torso 132×12 + arms 264×12 + legs 264×12 + lug 132×12
//   = 1584 + 1584 + 3168 + 3168 + 1584 = 11,088 三角面；5 个 InstancedMesh = 5 draw call；0 贴图。
const _shared = { geos: null, mat: null, refs: 0 };
function acquireShared() {
  if (!_shared.geos) {
    const g = {};
    g.head = new THREE.BoxGeometry(HEAD_S, HEAD_S, HEAD_S);
    g.torso = new THREE.BoxGeometry(TORSO_W, TORSO_H, TORSO_D);
    g.arms = new THREE.BoxGeometry(ARM_W, ARM_LEN, ARM_D).translate(0, -ARM_LEN / 2, 0); // pivot 在肩
    g.legs = new THREE.BoxGeometry(LEG_W, LEG_LEN, LEG_D).translate(0, -LEG_LEN / 2, 0); // pivot 在髋
    g.lug = new THREE.BoxGeometry(LUG_W, LUG_H, LUG_D);
    _shared.geos = g;
    _shared.mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  }
  _shared.refs += 1;
  return _shared;
}
function releaseShared() {
  _shared.refs -= 1;
  if (_shared.refs <= 0 && _shared.geos) {
    for (const k of Object.keys(_shared.geos)) _shared.geos[k].dispose();
    _shared.mat.dispose();
    _shared.geos = null; _shared.mat = null; _shared.refs = 0;
  }
}

// 所有已创建的 System，供 disposePassengers() 一次性清理。
const _systems = new Set();

/** 可选：一次性释放所有 createPassengerSystem 建出来的资源。 */
export function disposePassengers() {
  for (const s of [..._systems]) s.dispose?.();
  _systems.clear();
}

// ---------------------------------------------------------------- 数学小工具 ----
/** 四色地标选色：蓝=8 正编 / 黄=16 正编 / 紫=8 反编 / 绿=16 反编（各站定义略有差异）。 */
function landmarkColorFor(formation, dir) {
  const big = formation >= 16;
  const rev = dir < 0;
  return rev ? (big ? LANDMARK_COLORS.green : LANDMARK_COLORS.purple)
    : (big ? LANDMARK_COLORS.yellow : LANDMARK_COLORS.blue);
}
/** 由站台区间绝对里程 + dir/s 换算本地 z 范围（与 core.evaluateStop 同款公式）。 */
function platformLocalRange(zone, s, dir) {
  const z0 = dir * (s - zone.s0);
  const z1 = dir * (s - zone.s1);
  return [Math.min(z0, z1), Math.max(z0, z1)];
}

/** 每节车「车门中点」的本地 z，并钳进站台区间。 */
function doorMids(train, zMin, zMax) {
  const dz = train?.doorZ;
  const n = train?.seatsPerCar?.length || 0;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const z = (dz && dz.length >= 2 * n)
      ? (dz[2 * i] + dz[2 * i + 1]) / 2
      : (train?.carCenters?.[i] ?? 0);
    out.push(clamp(z, zMin + 1, zMax - 1));
  }
  return out;
}

function shortAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function angleLerp(from, to, k) { return from + shortAngle(from, to) * clamp(k, 0, 1); }

/**
 * 把「任意来源」的站台 x 区间规范化成 [[a,b], ...]（原始、未内缩）。
 * 接受：{x0,x1} / {near,far} / {inner,outer} / [a,b] / [[a,b]...] / {bands:[...]}。
 * 元素含非有限数一律丢弃，避免 NaN 漏进坐标。
 */
function asRawBands(v) {
  if (v == null || typeof v === 'function' || typeof v === 'number') return null;
  const out = [];
  const push = (a, b) => {
    const na = Number(a); const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) out.push([Math.min(na, nb), Math.max(na, nb)]);
  };
  if (Array.isArray(v)) {
    if (v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number') push(v[0], v[1]);
    else for (const e of v) { const r = asRawBands(e); if (r) out.push(...r); }
  } else if (typeof v === 'object') {
    if (v.bands) { const r = asRawBands(v.bands); if (r) out.push(...r); }
    else push(v.x0 ?? v.near ?? v.inner, v.x1 ?? v.far ?? v.outer);
  }
  return out.length ? out : null;
}

/**
 * 由 StationLayout 数据 + RAIL 常量复现「站场股道/站台 x 排布」，返回站台体 x 区间数组
 * [[x0,x1], ...]（站场中心为原点，与 buildStationField 的 field.position.x=0 对齐）。
 *
 * 口径与 stations.js 的 fieldTrackLayout 一致：夹站台的股道间隙要塞下「站台宽 + 两侧 EDGE」，
 * 不夹站台的按 trackCenters+1.5；中央正线通道清空(无站台、列车固定在 x≈0 可见)，站台
 * 对称分布到通道两侧，最后整体减 midX 居中。**全部由 layout.platformCount / trackCount /
 * mainTracks / platformWidth / platformEdge 与 RAIL.trackCenters 驱动，不写死任何股道索引**。
 *
 * 这是「示意级几何复现」，用于在没有 ctx 注入时把乘客对齐到真实站台；若站场算法调整，
 * 宿主/站场 agent 应优先用 ctx.platformBands 或 opts.resolvePlatformBand 注入精确区间覆盖。
 */
function bandsFromLayout(layout) {
  const T = Math.max(1, Math.round(Number(layout?.trackCount) || 0));
  const P = Math.max(1, Math.round(Number(layout?.platformCount) || 0));
  if (T < 2 || !Number.isFinite(T)) return null;
  const PW = Number(layout?.platformWidth) || RAIL.platformWidth;
  const EDGE = Number(layout?.platformEdge) || RAIL.platformEdge;
  const PLAT_GAP = PW + 2 * EDGE;                 // 夹站台的股道中心距 = 12 + 3.5 = 15.5
  const TRACK_GAP = RAIL.trackCenters + 1.5;      // stations.js FIELD.TRACK_GAP 口径 = 6.5
  const gaps = T - 1;
  const nPlat = Math.min(P, Math.max(1, gaps));
  const mains = (Array.isArray(layout?.mainTracks) && layout.mainTracks.length)
    ? layout.mainTracks : [Math.floor((T - 1) / 2), Math.floor(T / 2)];
  const lo = Math.min(...mains); const hi = Math.max(...mains);
  let clearLo; let clearHi;
  if (T >= 8) { clearLo = lo - 1; clearHi = hi; } else { clearLo = lo; clearHi = hi - 1; }
  clearLo = Math.max(0, clearLo); clearHi = Math.min(gaps - 1, clearHi);
  const has = new Array(gaps).fill(false);
  const leftMax = clearLo - 1; const rightMin = clearHi + 1;
  const leftCount = Math.max(0, leftMax + 1); const rightCount = Math.max(0, gaps - rightMin);
  const perSide = Math.min(Math.floor(nPlat / 2), leftCount, rightCount);
  const pick = (a, b, n) => {
    if (n <= 0) return [];
    if (n === 1) return [Math.round((a + b) / 2)];
    return Array.from({ length: n }, (_, k) => Math.round(a + (k * (b - a)) / (n - 1)));
  };
  for (const j of pick(0, leftMax, perSide)) {
    has[Math.min(gaps - 1, j)] = true;
    has[Math.min(gaps - 1, gaps - 1 - j)] = true;   // 镜像 → 站场关于中心严格对称
  }
  let placed = has.filter(Boolean).length;
  for (let j = 0; j < gaps && placed < nPlat; j += 1) {
    if (!has[j] && (j < clearLo || j > clearHi)) { has[j] = true; placed += 1; }
  }
  const tx = [0];
  for (let j = 0; j < gaps; j += 1) tx.push(tx[j] + (has[j] ? PLAT_GAP : TRACK_GAP));
  const midX = (tx[0] + tx[T - 1]) / 2;
  for (let i = 0; i < T; i += 1) tx[i] -= midX;
  const out = [];
  for (let j = 0; j < gaps; j += 1) {
    if (!has[j]) continue;
    const px = (tx[j] + tx[j + 1]) / 2;            // 站台中心（站场中心为原点）
    out.push([px - PW / 2, px + PW / 2]);           // 站台宽 PW，两边缘各距相邻股道中心 EDGE
  }
  return out.length ? out : null;
}

/**
 * 推导「当前站台合法锚点 x 带」：返回 [{ sign, lo, hi, y }]。
 * sign 为侧别(+1 正 x / -1 负 x)；[lo,hi] 是**人体锚点** |x| 的合法区间（已内缩安全线、
 * 部件余量、外缘留白，且 lo ≥ ANCHOR_MIN），这样部件最外缘仍 |x| ≥ HARD_MIN_X、≤ 站台外缘。
 * 优先级：opts.resolvePlatformBand 回调 > 框架层透传的「lane 横移后当前停靠到发线」精确单带
 *   (zone.platformBand / platformX0,x1 / zone.platformBands) > ctx.platformBands(station-realism
 *   当前站带：ARRIVE 有透传时已是精确单带，否则整站全宽) > ctx.platformBandsByStation[stationId]
 *   (station-realism 每次 ARRIVE 同步覆盖：有透传时=同一份精确单带与①②恒一致、无透传时
 *   重算整站全宽且无跨站残留；故三条路径谁先命中都不打架) > c/ctx.state/pack > stationLayouts[id].platformBands
 *   / platformX0,x1 > ctx.zones 命中项 > bandsFromLayout(layout) > RAIL 退化。
 * 注1：注入的是「站台全宽」[px-w/2, px+w/2]（如 [11.5,23.5]），本函数统一内缩安全线+
 *   部件余量+外缘留白得候车锚点带（如 [14,22]），部件最外缘仍避开贴边白线/盲道/1m 警戒线；
 *   与 fieldTrackLayout 同源推导，不写死股道索引。
 * 注2：刻意不用 zone.platformIndex 硬索引 stopZones 挑单带——platformIndex 是按 trackIndex
 *   均匀分摊的「逻辑序号」，与站台几何顺序不是一套口径(station-layouts.js)，硬映射会错位；
 *   精确单带一律走框架透传的 zone.platformBand / ctx.platformBands。
 * 注3（坐标系契约）：返回的 [lo,hi] 直接作为乘客实例的**世界 x** (group 挂 scene、单位变换)。
 *   注入源必须是「相对列车原点/世界坐标系」的带，且 lane≠MAIN 时已含站场 chunk 的横移 Δx；
 *   若给的是站场局部坐标(相对正线中心 x=0)，lane=MAIN 下二者一致(当前正确)，lane≠MAIN 下
 *   整体偏 Δx 会踩空/悬空。Δx 由框架层在 StopZone 上换算，本模块不复制 alignment 数学。
 */
function resolveBands(zone, c, opts, ctxRef, stationId) {
  const layouts = opts.layouts || c?.pack?.stationLayouts || ctxRef?.pack?.stationLayouts || {};
  const layout = layouts[zone?.stationId] || layouts[zone?.name] || layouts[stationId] || null;
  const feetY = clamp(Number(layout?.platformHeight) || FEET_Y_FALLBACK, 0.8, 1.6);
  const side = opts.platformSide || 'right';

  // station-realism 注入：按 stationId 索引的带。其 ARRIVE 会先把所有站重算为同源静态
  // 全宽带(无跨站残留)，再对当前站在有精确带透传时覆盖成那条单带——即「有透传=精确单带、
  // 与①②同源恒一致；无透传=整站全宽」。放③仅作兜底，三条路径谁先命中都不会打架。
  const byStation = c?.platformBandsByStation || ctxRef?.platformBandsByStation;
  const stationBands = byStation?.[zone?.stationId] || byStation?.[zone?.name]
    || byStation?.[stationId] || null;

  const tryList = [];
  if (typeof opts.resolvePlatformBand === 'function') {
    try { tryList.push(opts.resolvePlatformBand(zone, c, RAIL)); } catch (_) { /* 宿主回调出错则忽略 */ }
  }
  tryList.push(
    // ① 框架层透传的「lane 横移后当前停靠到发线」精确单带：几何精度最高，最优先。
    //    station-realism 在 ARRIVE 会把 zone.platformBand 透传成 ctx.platformBands=[单带]。
    zone?.platformBand,
    (zone?.platformX0 != null ? [zone.platformX0, zone.platformX1] : null),
    zone?.platformBands,
    // ② station-realism 当前站带：有透传时已是精确单带，否则整站全宽(末尾取最近 1 条)
    c?.platformBands, c?.platformBand, ctxRef?.platformBands, ctxRef?.platformBand,
    c?.state?.platformBands, c?.state?.platformBand, ctxRef?.state?.platformBands,
    // ③ 按站带：有透传时已是精确单带(与①②一致)、无透传时整站全宽；稳定兜底
    stationBands,
    // ④ 其余静态注入
    c?.pack?.platformBands, ctxRef?.pack?.platformBands,
    layout?.platformBands, layout?.platformBand,
    (layout?.platformX0 != null ? [layout.platformX0, layout.platformX1] : null),
  );
  const zoneList = c?.zones || ctxRef?.zones;
  const cz = Array.isArray(zoneList)
    ? zoneList.find((z) => z && (z.id === zone?.id || z.stationId === zone?.stationId)) : null;
  if (cz) tryList.push(cz.platformBands, cz.platformBand,
    (cz.platformX0 != null ? [cz.platformX0, cz.platformX1] : null));

  let raw = null;
  for (const t of tryList) { const r = asRawBands(t); if (r) { raw = r; break; } }

  // 无注入时优先由 StationLayout 数据推导真实站台区间（站场改成「中央通道无站台」后，
  // 站台并不在 ±platformEdge，而是在通道两侧较远处；用退化公式会让人站到道床上）。
  if (!raw) raw = bandsFromLayout(layout);

  // 最终兜底：RAIL 常量在正线两侧各造一条 [edge, edge+w]（任务给的退化带口径）。
  if (!raw) {
    const edge = Number(layout?.platformEdge) || RAIL.platformEdge;
    const w = Number(layout?.platformWidth) || RAIL.platformWidth;
    raw = [[edge, edge + w], [-(edge + w), -edge]];
  }

  const bands = [];
  for (const [a, b] of raw) {
    const sign = (a + b) / 2 >= 0 ? 1 : -1;
    const near = Math.min(Math.abs(a), Math.abs(b));
    const far = Math.max(Math.abs(a), Math.abs(b));
    let lo = Math.max(near + SAFETY_LINE + PART_MARGIN, ANCHOR_MIN);
    let hi = far - EDGE_INSET - PART_MARGIN;
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    if (hi < lo) { lo = Math.max(ANCHOR_MIN, (near + far) / 2); hi = lo; }
    if (hi - lo < 0.8) { lo = Math.max(ANCHOR_MIN, (lo + hi) / 2 - 0.4); hi = lo + 0.8; }
    bands.push({ sign, lo: Math.max(lo, ANCHOR_MIN), hi, y: feetY });
  }
  // 只保留「离正线最近」的站台带（本车次停靠乘降的那座站台），避免把候车者分到远端站台。
  // 大站推导会产出多座站台，全部保留会让人散到几十米外；单侧取 1 条、双侧正负各取 1 条。
  const byNear = (p, q) => p.lo - q.lo;
  let use;
  if (side === 'right' || side === 'left') {
    const pool = bands.filter((x) => (side === 'right' ? x.sign > 0 : x.sign < 0));
    use = pool.sort(byNear).slice(0, 1);
  } else {
    const pos = bands.filter((x) => x.sign > 0).sort(byNear)[0];
    const neg = bands.filter((x) => x.sign < 0).sort(byNear)[0];
    use = [pos, neg].filter(Boolean);
  }
  if (!use.length) use = bands.sort(byNear).slice(0, 1);
  if (!use.length) {
    use = [{ sign: 1, lo: ANCHOR_MIN,
      hi: Math.max(ANCHOR_MIN + 1, RAIL.platformEdge + RAIL.platformWidth - EDGE_INSET - PART_MARGIN),
      y: feetY }];
  }
  return use;
}

/**
 * createPassengerSystem(ctx, opts) → Standard System
 * opts = { layouts, capacity(FLEET_CAPACITY), maxInstances?, visualScale?, platformSide?,
 *          staff?, resolvePlatformBand?(zone, ctx, RAIL) }
 * 由 packs/harbin.js 以 createPassengers 适配口调用。
 */
export function createPassengerSystem(ctx, opts = {}) {
  const fleet = opts.capacity || FLEET_CAPACITY;
  const maxInstances = clamp(opts.maxInstances ?? MAX_INSTANCES, 1, MAX_INSTANCES);
  const maxWaiting = clamp(opts.maxWaiting ?? 110, 1, maxInstances);
  const visualScale = opts.visualScale ?? VISUAL_SCALE;
  const flow = createFlowModel({ fleet });

  const S = {
    station: null, zone: null, train: null,
    doorOpen: false,           // 由 EVENT.DOORS 维护，关门锁立即为 false
    carLoad: [],               // 每车厢在车人数（核心状态）
    waiting: 0, onboard: 0, alighted: 0, boarded: 0,
    capacity: 0,
    doorMid: [], zMin: -200, zMax: 200,
    bands: [{ sign: 1, lo: ANCHOR_MIN,
      hi: Math.max(ANCHOR_MIN + 1, RAIL.platformEdge + RAIL.platformWidth - EDGE_INSET - PART_MARGIN),
      y: FEET_Y_FALLBACK }],
    serviceSeq: 0, theme: 'day', themeMul: 1, time: 0,
    retreat: false,             // 进站/出站/通过：站台人员整体后退到安全线内
    landmark: 0,                // 当前车次四色地标色(instanceColor 示意)
    formation: 8,
    agents: [],                // 实例池：长度 = maxInstances，下标 = instance 下标
  };

  let scene = null; let group = null;
  let headMesh = null; let torsoMesh = null; let armsMesh = null; let legsMesh = null; let lugMesh = null;
  const dummy = new THREE.Object3D();     // hide 用
  const root = new THREE.Object3D();      // 人体根(位置/朝向/体型/fade)
  const part = new THREE.Object3D();      // 部件局部
  const M = new THREE.Matrix4();          // root.matrix × part.matrix，复用零分配
  const color = new THREE.Color();
  const color2 = new THREE.Color();
  const tmpColor = new THREE.Color();

  // ---- 实例池小工具 ----
  function hide(mesh, i) {
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  /** 把「部件局部变换 × 人体根变换」写入 InstancedMesh 第 idx 个实例。 */
  function place(x, y, z, rx, ry, rz, sx, sy, sz, mesh, idx) {
    part.position.set(x, y, z);
    part.rotation.set(rx, ry, rz);
    part.scale.set(sx, sy, sz);
    part.updateMatrix();
    M.multiplyMatrices(root.matrix, part.matrix);
    mesh.setMatrixAt(idx, M);
  }

  function applyColor(a) {
    if (!headMesh) return;
    const m = S.themeMul;
    color.setHex(a.tint).multiplyScalar(m);
    if (a.landmark) color.lerp(tmpColor.setHex(a.landmark), 0.22); // 四色地标：队列衣着色偏(顶点色,零成本)
    torsoMesh.setColorAt(a.i, color);
    armsMesh.setColorAt(2 * a.i, color);
    armsMesh.setColorAt(2 * a.i + 1, color);
    color2.setHex(a.pants).multiplyScalar(m);
    legsMesh.setColorAt(2 * a.i, color2);
    legsMesh.setColorAt(2 * a.i + 1, color2);
    color2.setHex(a.skin).multiplyScalar(0.55 + 0.45 * m);
    headMesh.setColorAt(a.i, color2);
    if (a.lugType) {
      color2.setHex(a.lugColor).multiplyScalar(m);
      lugMesh.setColorAt(a.i, color2);
    }
  }

  function refreshColors() {
    if (!headMesh) return;
    for (const a of S.agents) if (a.active) applyColor(a);
    for (const mesh of [headMesh, torsoMesh, armsMesh, legsMesh, lugMesh]) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  /** 硬钳位：人体锚点 x 落在所属带的 [lo,hi]（⇒ |x| ≥ ANCHOR_MIN > HARD_MIN_X），z 在停车区间内。 */
  function clampAgent(a) {
    const b = a.bandRef || S.bands[0];
    const sign = a.sign || b.sign || 1;
    a.x = sign * clamp(sign * a.x, b.lo, b.hi);
    a.z = clamp(a.z, S.zMin + 0.6, S.zMax - 0.6);
    a.feetY = b.y || FEET_Y_FALLBACK;
  }

  function spawnAgent(phase, lane, carIndex, x, z, rand) {
    const a = S.agents.find((p) => !p.active);
    if (!a) return null; // 硬钳位：池满就不再生成
    const band = S.bands[carIndex % S.bands.length] || S.bands[0];
    a.active = true; a.phase = phase; a.lane = lane; a.carIndex = carIndex;
    a.bandRef = band; a.sign = band.sign;
    a.x = x; a.z = z; a.feetY = band.y;
    a.facing = band.sign > 0 ? Math.PI / 2 : -Math.PI / 2; // 面朝列车
    a.gait = rand() * Math.PI * 2;
    a.fade = 0; a.fading = true; a.fadeTarget = 1;          // 连续淡入，绝不闪现
    a.height = 0.92 + rand() * 0.16; a.girth = 0.9 + rand() * 0.22;
    a.tint = CLOTHING[Math.floor(rand() * CLOTHING.length) % CLOTHING.length];
    a.pants = PANTS[Math.floor(rand() * PANTS.length) % PANTS.length];
    a.skin = SKINS[Math.floor(rand() * SKINS.length) % SKINS.length];
    a.lugColor = LUGGAGE_COLORS[Math.floor(rand() * LUGGAGE_COLORS.length) % LUGGAGE_COLORS.length];
    a.lugType = rand() < 0.30 ? (rand() < 0.6 ? 1 : 2) : 0;  // 1 拉杆箱 2 背包
    // 16 辆重联 8/9 节不相通：排队/离站按所在半列朝两端发散，不生成贯通人流
    const half = Math.max(1, Math.floor((S.doorMid.length || 8) / 2));
    a.leaveDir = carIndex < half ? -1 : 1;
    a.queueX = x; a.landmark = 0;   // 排队位(用于停稳归位/进站后退) / 地标色(候车者才有)
    a.path = []; a.seg = []; a.total = 0; a.dist = 0;
    a.speed = WALK_SPEED; a.next = null; a.startDelay = 0;
    a.t = 0; a.waitT = rand() * 6; a.doorZ = 0; a.boarded = false;
    clampAgent(a);
    applyColor(a);
    return a;
  }

  function freeAgent(a) {
    a.active = false; a.phase = 'idle'; a.fading = false; a.fade = 0;
    a.path = []; a.next = null;
  }

  function startFade(a, target) { a.fading = true; a.fadeTarget = target; }

  function countWaiting() {
    let n = 0;
    for (const a of S.agents) if (a.active && a.lane === 'board' && a.phase !== 'onboard') n += 1;
    return n;
  }

  // ---- 路径（弧长参数化，连续插值）----
  function beginLeg(a, waypoints, speed, next, startDelay = 0) {
    const path = [{ x: a.x, z: a.z }];
    for (const p of waypoints) {
      const nx = Number(p.x); const nz = Number(p.z);
      path.push({ x: Number.isFinite(nx) ? nx : a.x, z: Number.isFinite(nz) ? nz : a.z });
    }
    const seg = [0];
    for (let i = 1; i < path.length; i += 1) {
      seg.push(seg[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
    }
    a.path = path; a.seg = seg; a.total = seg[seg.length - 1];
    a.dist = 0; a.speed = speed; a.next = next; a.startDelay = startDelay; a.t = 0;
  }

  function positionOnPath(a) {
    const { path, seg, total } = a;
    if (!path.length) return { x: a.x, z: a.z, dx: 0, dz: -1 };
    const d = clamp(a.dist, 0, total);
    let k = 0;
    while (k < seg.length - 1 && d > seg[k + 1]) k += 1;
    const s0 = seg[k]; const s1 = seg[k + 1] ?? s0;
    const t = s1 > s0 ? clamp((d - s0) / (s1 - s0), 0, 1) : 0;
    const p0 = path[k]; const p1 = path[k + 1] || p0;
    const dx = p1.x - p0.x; const dz = p1.z - p0.z;
    const len = Math.hypot(dx, dz) || 1;
    return { x: p0.x + dx * t, z: p0.z + dz * t, dx: dx / len, dz: dz / len };
  }

  /** 一段路径走完后的阶段转移（只生成下一段连续路径 / 触发淡出，绝不瞬移、绝不直接 free）。 */
  function onLegEnd(a) {
    const nx = a.next; a.next = null;
    const b = a.bandRef || S.bands[0];
    switch (nx) {
      case 'boarded-approach': { // 走到车门前 → 登车：朝车门再走一小段并连续淡出
        a.phase = 'boarding';
        const doorX = a.sign * (b.lo + 0.02);
        beginLeg(a, [{ x: doorX, z: a.z }], BOARD_SPEED, 'onboard');
        startFade(a, 0);
        break;
      }
      case 'onboard':
        a.phase = 'onboard';
        startFade(a, 0);
        break;
      case 'alight-leave': // 下车走到站台外侧 → 沿站台离站
        a.phase = 'leaving';
        beginLeg(a, [{ x: a.x, z: a.z + a.leaveDir * 4 }], WALK_SPEED * 1.05, 'gone');
        break;
      case 'gone':
      default:
        startFade(a, 0); // 到点后连续淡出（不 free，由 fade 完成后再 free）
        break;
    }
  }

  // ---- 车门 / 列车 ----
  function openNow(c) {
    return S.doorOpen
      && Boolean(c?.doorsCanOpen)
      && c?.doorState?.state === DOOR_STATE.OPEN;
  }

  /** ctx.train 为 null 时（宿主未给 spec），用 FLEET_CAPACITY 拼一个纯数字 TrainSpec。 */
  function resolveTrain(c) {
    if (c?.train && c.train.seatsPerCar?.length) return c.train;
    const modelId = c?.state?.modelId || (fleet ? Object.keys(fleet)[0] : '');
    const formation = c?.state?.formation || 8;
    if (!fleet?.[modelId]) return null;
    const seats = seatsPerCarFor(modelId, formation, fleet);
    const lens = seats.map((_, i) => (i === 0 || i === seats.length - 1 ? 25.85 : 25.0));
    return createTrainSpec({
      modelId, formation, carLengths: lens, gap: 0.8,
      capacity: capacityFor(modelId, formation, fleet), seatsPerCar: seats,
    });
  }

  function syncStats(train) {
    S.capacity = train?.capacity || 0;
    S.onboard = S.carLoad.reduce((x, y) => x + Math.max(0, y), 0);
  }

  /** 首次到站 / 换车型时，按 40%~70% 上座率播种「已在车上」的旅客，供下车事件扣减。 */
  function ensureCarLoad(train, rand) {
    const n = train?.seatsPerCar?.length || 0;
    if (!n) { S.carLoad = []; return; }
    if (S.carLoad.length !== n) {
      S.carLoad = new Array(n).fill(0);
      for (let i = 0; i < n; i += 1) {
        S.carLoad[i] = Math.round(train.seatsPerCar[i] * (0.4 + 0.3 * rand()));
      }
    }
  }

  /** 站台客运员：平行安全线固定立岗、面朝列车、进出站全程在岗（资料见文件头第 2 轮）。 */
  function spawnStaff(rand) {
    const b = S.bands[0];
    for (let i = 0; i < STAFF_COUNT; i += 1) {
      const z = clamp((i === 0 ? -1 : 1) * Math.min(20, (S.zMax - S.zMin) * 0.22), S.zMin + 1, S.zMax - 1);
      const x = b.sign * b.lo;
      const a = spawnAgent('staff', 'staff', 0, x, z, rand);
      if (a) {
        a.tint = STAFF_VEST; a.pants = STAFF_PANTS; a.height = 1.0 + rand() * 0.06;
        a.lugType = 0; a.facing = b.sign > 0 ? Math.PI / 2 : -Math.PI / 2;
        applyColor(a);
      }
    }
  }

  // ---- 事件处理 ----
  function onArrive(payload, c) {
    const zone = payload?.zone;
    if (!zone) return;
    const train = payload?.train || c?.train || resolveTrain(c);
    S.zone = zone; S.train = train;
    S.station = zone.stationId || zone.name || '未知站';
    S.serviceSeq += 1;
    const s = payload?.s ?? c?.s ?? 0;
    const dir = c?.dir ?? 1;
    const minute = c?.state?.simMinutes ?? 480;
    const seed = hash32(`${S.station}|${zone.id || ''}|${S.serviceSeq}|${Math.floor(minute)}`);
    const rand = rng(seed);
    const [zMin, zMax] = platformLocalRange(zone, s, dir);
    S.zMin = zMin; S.zMax = zMax;
    S.doorMid = doorMids(train, zMin, zMax);
    S.bands = resolveBands(zone, c, opts, ctx, S.station); // ★ 先算真实站台带
    ensureCarLoad(train, rand);

    S.retreat = false;          // 列车停稳：候车者归位到成列排队位（仍全在安全线内）
    S.formation = train?.seatsPerCar?.length || 8;
    S.landmark = landmarkColorFor(S.formation, c?.dir ?? 1);
    if (opts.staff !== false) spawnStaff(rand);

    // 真实量级(泊松到达/分钟) × 示意级压缩 → 站台可视候车人数
    const arrivalsPerMin = flow.sampleArrivals(S.station, minute, rand);
    const want = clamp(Math.round(arrivalsPerMin * visualScale * 8), 10, maxWaiting);
    const cars = S.doorMid.length || 1;
    const half = Math.max(1, Math.floor(cars / 2));
    for (let k = 0; k < want; k += 1) {
      const ci = k % cars;                        // 每队对准一个车厢门地标，按色块成列、不随机撒点
      const band = S.bands[ci % S.bands.length];
      const rank = Math.floor(k / cars);
      const col = rank % 2; const row = Math.floor(rank / 2);
      // 对标误差 ±20~50 cm：门位按站/车次确定性微偏移，不做零误差瞬停
      const doorZ = clamp(S.doorMid[ci] + (rand() - 0.5) * 2 * STOP_ERROR, zMin + 1, zMax - 1);
      // 同门 1~2 列、纵向间距 QUEUE_GAP；重联时按半列朝两端发散，绝不跨 8/9 节贯通
      const qz = clamp(doorZ + (ci < half ? -1 : 1) * (row + 1) * QUEUE_GAP, zMin + 1, zMax - 1);
      // 候车 x 严格成列(去掉随机撒点)，全在安全线内侧、绝不越 1 m 安全带
      const qx = band.sign * clamp(band.lo + 1.4 + col * 0.9, band.lo, band.hi);
      const a = spawnAgent('waiting', 'board', ci, qx, qz, rand);
      if (a) { a.doorZ = doorZ; a.queueX = qx; a.landmark = S.landmark; applyColor(a); }
    }
    S.waiting = countWaiting();
    syncStats(train);
  }

  function onDoors(payload, c) {
    S.doorOpen = payload?.state === DOOR_STATE.OPEN && Boolean(c?.doorsCanOpen);
    if (!S.doorOpen) {
      // 关门锁：不再新发上下车；还没到车门的上车者转身沿站台离开并淡出（不瞬移）；
      // 已在 boarding/alighting/leaving 的人让它们把当前连续动作走完。
      for (const a of S.agents) {
        if (!a.active || a.lane !== 'board' || a.phase !== 'walking') continue;
        a.lane = 'leave'; a.phase = 'leaving';
        beginLeg(a, [{ x: a.x, z: a.z + a.leaveDir * 3 }], WALK_SPEED, 'gone');
      }
    }
  }

  function onAlight(payload, c) {
    if (!openNow(c)) return; // 只有 DOORS open 且 doorsCanOpen 才允许下车
    const train = payload?.train || S.train || resolveTrain(c);
    const zone = payload?.zone || S.zone;
    if (!train) return;
    const rand = rng(hash32(`${S.station}|alight|${S.serviceSeq}`));
    const res = flow.alight(train, S.carLoad, zone, rand);
    S.alighted += res.alighted;
    // 为下车旅客生成可视化小人（每车厢最多取 6 个代表，carLoad 仍是全量）
    for (let i = 0; i < res.perCar.length; i += 1) {
      const show = Math.min(res.perCar[i], 6);
      for (let k = 0; k < show; k += 1) {
        const band = S.bands[i % S.bands.length];
        const doorZ = clamp(S.doorMid[i] ?? 0, S.zMin + 1, S.zMax - 1);
        const startX = band.sign * (band.lo + 0.05);                    // 车门口(最靠内的锚点)
        const startZ = clamp(doorZ + ALIGHT_Z_LANE, S.zMin + 1, S.zMax - 1); // 外侧 z 车道
        const a = spawnAgent('alighting', 'alight', i, startX, startZ, rand);
        if (a) {
          const farX = band.sign * clamp(band.hi - 0.4, band.lo, band.hi);
          beginLeg(a, [{ x: farX, z: startZ + rand() * 1.5 }], WALK_SPEED, 'alight-leave', 0.05 + k * 0.12);
        }
      }
    }
    syncStats(train);
  }

  function onBoard(payload, c) {
    if (!openNow(c)) return; // 只有 DOORS open 且 doorsCanOpen 才允许上车
    const train = payload?.train || S.train || resolveTrain(c);
    const zone = payload?.zone || S.zone;
    if (!train) return;
    const waitingAgents = S.agents.filter((a) => a.active && a.lane === 'board' && a.phase === 'waiting');
    const res = flow.board(train, S.carLoad, waitingAgents.length, zone);
    S.boarded += res.boarded;
    // 按车厢门分组、组内按「离门近的先上」排序并 ≈1 人/秒错峰 → 先下后上、不互相穿透
    const byCar = new Map();
    for (const a of waitingAgents) {
      if (!byCar.has(a.carIndex)) byCar.set(a.carIndex, []);
      byCar.get(a.carIndex).push(a);
    }
    let taken = 0;
    for (const [, list] of byCar) {
      list.sort((p, q) => Math.abs(p.z - p.doorZ) - Math.abs(q.z - q.doorZ));
      for (let j = 0; j < list.length && taken < res.boarded; j += 1) {
        const a = list[j];
        taken += 1;
        a.phase = 'walking';
        const b = a.bandRef || S.bands[0];
        const doorZ = clamp(a.doorZ || S.doorMid[a.carIndex] || 0, S.zMin + 1, S.zMax - 1);
        const approachX = b.sign * (b.lo + 0.55);
        // 两段连续路径：先纵向对齐车门 z，再横向走到车门前；到点后转 boarding→onboard
        beginLeg(a, [
          { x: a.x, z: doorZ },
          { x: approachX, z: doorZ },
        ], BOARD_SPEED, 'boarded-approach', BOARD_HOLD + ALIGHT_LEAD + j * BOARD_STAGGER); // 门开(门灯/蜂鸣)后延迟，下车流先行
      }
      if (taken >= res.boarded) break;
    }
    S.waiting = countWaiting();
    syncStats(train);
  }

  function onDepart() {
    S.retreat = true;           // 出站/发车：站台人员整体后退到安全线内，绝不贴近边缘
    // 清空站台客流：没上车的人沿站台连续走开后淡出；车上旅客(S.carLoad)带到下一站；
    // 已在离站流程的人让它们走完；客运员撤岗也淡出。全程无瞬移、无突然 free。
    for (const a of S.agents) {
      if (!a.active) continue;
      if (a.lane === 'staff') { startFade(a, 0); continue; }
      if (a.phase === 'onboard') { startFade(a, 0); continue; }
      if (a.lane === 'alight' || a.lane === 'leave') {
        if (a.next === null && !a.fading) startFade(a, 0);
        continue;
      }
      a.lane = 'leave'; a.phase = 'leaving';
      const bx = a.bandRef || S.bands[0];
      const backX = a.sign * clamp(Math.abs(a.x) + RETREAT_DIST, bx.lo, bx.hi);
      beginLeg(a, [
        { x: backX, z: a.z },                        // 出站/通过：先整体后退到安全线内
        { x: backX, z: a.z + a.leaveDir * 3 },      // 再沿站台朝所在半列外侧离站
      ], WALK_SPEED, 'gone');
    }
    S.waiting = 0;
    S.doorOpen = false;
    S.zone = null;
  }

  // ---- 每帧：状态机推进 + 步态 + 写实例矩阵 ----
  function advanceAgent(a, dt) {
    a.t += dt;
    // 淡入/淡出：连续到 0 才 free（绝不瞬间消失）
    if (a.fading) {
      const step = dt / FADE_SEC;
      a.fade += clamp(a.fadeTarget - a.fade, -step, step);
      if (Math.abs(a.fade - a.fadeTarget) < 1e-3) {
        a.fade = a.fadeTarget; a.fading = false;
        if (a.fadeTarget === 0) { freeAgent(a); return; }
      }
    }
    switch (a.phase) {
      case 'waiting': {
        // 停稳且开门前绝不向车门移动：进站/出站/通过时整体后退到安全线内(S.retreat)，
        // 停稳后平滑归位到成列排队位；横移速率 dt*2.5 属碎步、非奔跑，步态由实际位移驱动。
        const b = a.bandRef || S.bands[0];
        const backX = a.sign * clamp(Math.abs(a.queueX) + RETREAT_DIST, b.lo, b.hi);
        const targetX = S.retreat ? backX : a.queueX;
        const beforeX = a.x;
        a.x += (targetX - a.x) * Math.min(1, dt * 2.5);
        a.gait += Math.abs(a.x - beforeX) * GAIT_PER_M;
        a.facing = angleLerp(a.facing, a.sign > 0 ? Math.PI / 2 : -Math.PI / 2, Math.min(1, dt * 1.5));
        break;
      }
      case 'staff': // 客运员固定立岗，不动
        break;
      case 'onboard': // 已上车，仅等 fade→0
        break;
      case 'walking': case 'boarding': case 'alighting': case 'leaving': {
        if (a.startDelay > 0) { a.startDelay -= dt; break; } // 错峰等待（原地淡入/晃动）
        if (a.next === null) { if (!a.fading) startFade(a, 0); break; } // 路径已尽，只等淡出
        const before = a.dist;
        a.dist = Math.min(a.total, a.dist + a.speed * dt);
        const p = positionOnPath(a);
        a.x = p.x; a.z = p.z;
        a.gait += Math.max(0, a.dist - before) * GAIT_PER_M; // 步态由累计路程驱动，停下即不摆
        a.facing = angleLerp(a.facing, Math.atan2(-p.dx, -p.dz), Math.min(1, dt * 6));
        if (a.dist >= a.total - 1e-4) onLegEnd(a);
        break;
      }
      default:
        break;
    }
    clampAgent(a); // ★ 每帧硬钳位：绝不进轨道、绝不悬空
  }

  function writeMatrices() {
    if (!headMesh) return;
    for (let i = 0; i < maxInstances; i += 1) {
      const a = S.agents[i];
      const ai = 2 * i;
      if (!a || !a.active) {
        hide(headMesh, i); hide(torsoMesh, i); hide(lugMesh, i);
        hide(armsMesh, ai); hide(armsMesh, ai + 1);
        hide(legsMesh, ai); hide(legsMesh, ai + 1);
        continue;
      }
      const vis = a.fade;
      root.position.set(a.x, a.feetY, a.z);
      root.rotation.set(0, a.facing, 0);
      root.scale.set(a.girth * vis, a.height * vis, a.girth * vis);
      root.updateMatrix();

      const moving = ((a.phase === 'walking' || a.phase === 'boarding'
        || a.phase === 'alighting' || a.phase === 'leaving')
        && a.startDelay <= 0 && a.next !== null)
        || (a.phase === 'waiting' && Math.abs(a.x - a.queueX) > 0.05); // 整体后退/归位带碎步
      const swing = moving ? Math.sin(a.gait) * 0.5 : 0;   // 腿摆幅 ≈ ±0.5 rad
      const breathe = moving ? 0 : Math.sin(a.waitT + S.time * 1.6) * 0.006;

      place(0, HEAD_Y + breathe, 0, 0, 0, 0, 1, 1, 1, headMesh, i);
      place(0, TORSO_Y + breathe, 0, 0, 0, 0, 1, 1, 1, torsoMesh, i);
      place(-ARM_X, SHOULDER_Y + breathe, 0, -swing * 0.7, 0, 0, 1, 1, 1, armsMesh, ai);
      place(ARM_X, SHOULDER_Y + breathe, 0, swing * 0.7, 0, 0, 1, 1, 1, armsMesh, ai + 1);
      place(-LEG_X, HIP_Y, 0, swing, 0, 0, 1, 1, 1, legsMesh, ai);
      place(LEG_X, HIP_Y, 0, -swing, 0, 0, 1, 1, 1, legsMesh, ai + 1);
      if (a.lugType === 1) {           // 拉杆箱：身侧地面
        place(0.42, LUG_H / 2, 0.10, 0, 0, 0, 1, 1, 1, lugMesh, i);
      } else if (a.lugType === 2) {    // 背包：贴背
        place(0, TORSO_Y, 0.20, 0, 0, 0, 1.1, 1, 0.7, lugMesh, i);
      } else {
        hide(lugMesh, i);
      }
    }
    for (const mesh of [headMesh, torsoMesh, armsMesh, legsMesh, lugMesh]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  const sys = {
    id: 'passengers',
    phase: SYSTEM_PHASE.PASSENGERS,
    state: S,
    flow,

    init(c) {
      scene = c?.scene || ctx?.scene || null;
      if (!scene) return;
      const sh = acquireShared();
      group = new THREE.Group();
      group.name = 'passengers';
      headMesh = new THREE.InstancedMesh(sh.geos.head, sh.mat, maxInstances);
      torsoMesh = new THREE.InstancedMesh(sh.geos.torso, sh.mat, maxInstances);
      armsMesh = new THREE.InstancedMesh(sh.geos.arms, sh.mat, maxInstances * 2);
      legsMesh = new THREE.InstancedMesh(sh.geos.legs, sh.mat, maxInstances * 2);
      lugMesh = new THREE.InstancedMesh(sh.geos.lug, sh.mat, maxInstances);
      for (const mesh of [headMesh, torsoMesh, armsMesh, legsMesh, lugMesh]) {
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        for (let i = 0; i < mesh.count; i += 1) {
          mesh.setColorAt(i, color.setHex(0x888888)); // 先分配 instanceColor 缓冲
          hide(mesh, i);
        }
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.instanceMatrix.needsUpdate = true;
        group.add(mesh);
      }
      scene.add(group);
      S.agents = Array.from({ length: maxInstances }, (_, i) => ({
        i, active: false, phase: 'idle', lane: 'board', carIndex: 0,
        bandRef: S.bands[0], sign: S.bands[0].sign,
        x: 0, z: 0, feetY: FEET_Y_FALLBACK, facing: 0, gait: 0,
        fade: 0, fading: false, fadeTarget: 1,
        height: 1, girth: 1, tint: CLOTHING[0], pants: PANTS[0], skin: SKINS[0],
        lugColor: LUGGAGE_COLORS[0], lugType: 0, leaveDir: 1,
        path: [], seg: [], total: 0, dist: 0, speed: WALK_SPEED, next: null,
        startDelay: 0, t: 0, waitT: 0, doorZ: 0, boarded: false,
      }));
    },

    update(c, dt) {
      if (!headMesh) return;
      S.time += clamp(dt || 0, 0, 0.1);
      const d = clamp(dt || 0, 0, 0.1);
      for (const a of S.agents) {
        if (!a.active) continue;
        advanceAgent(a, d);
      }
      writeMatrices();
    },

    onEvent(type, payload, c) {
      switch (type) {
        case EVENT.APPROACH: S.retreat = true; break; // 列车进站/通过：在场人员整体后退到安全线内
        case EVENT.ARRIVE: onArrive(payload, c); break;
        case EVENT.DOORS: onDoors(payload, c); break;
        case EVENT.ALIGHT: onAlight(payload, c); break; // framework 里 ALIGHT 先于 BOARD
        case EVENT.BOARD: onBoard(payload, c); break;
        case EVENT.DEPART: onDepart(payload, c); break;
        default: break;
      }
    },

    applyTheme(theme) {
      const id = typeof theme === 'string' ? theme : (theme?.id || 'day');
      S.theme = id;
      S.themeMul = id === 'night' ? 0.5 : id === 'dusk' ? 0.78 : 1.0;
      refreshColors(); // 只改衣服/肤色色调，不加新贴图
    },

    /** HUD：{ waiting, onboard, alighted, boarded, carLoad, capacity, station } */
    stats() {
      return {
        waiting: S.waiting,
        onboard: S.onboard,
        alighted: S.alighted,
        boarded: S.boarded,
        carLoad: S.carLoad.slice(),
        capacity: S.capacity,
        station: S.station,
      };
    },

    dispose() {
      if (group && scene) scene.remove(group);
      for (const mesh of [headMesh, torsoMesh, armsMesh, legsMesh, lugMesh]) mesh?.dispose?.();
      headMesh = torsoMesh = armsMesh = legsMesh = lugMesh = null; group = null;
      S.agents.length = 0;
      releaseShared(); // 几何/材质引用计数，最后一个 System 才真释放
      _systems.delete(sys);
    },
  };

  _systems.add(sys);
  return sys;
}

export default createPassengerSystem;

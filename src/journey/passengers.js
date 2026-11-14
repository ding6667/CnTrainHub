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
// 五、可视化 System（THREE.InstancedMesh；只在浏览器侧被 factory 调用）
// ========================================================================

const MAX_INSTANCES = 240;   // 实例硬钳位（需求：≤240）
const VISUAL_SCALE = 0.05;  // 真实量级 → 站台可视人数的示意级压缩系数
const LUGGAGE_INSTANCES = 96; // 行李网格实例数（只有前 96 个槽位画行李）
const CLOTHING = [0x3a6ea5, 0xb5533c, 0x4f7d54, 0x8a6ea8, 0xc9963f, 0x4a4f5a, 0x2f7f8f, 0xa8586e];
const SKIN = 0xe8c39e;
const LUGGAGE_COLOR = 0x333a44;

const FEET_Y = RAIL.platformHeight;          // 1.25，人脚底
const BODY_H = 0.90;
const BODY_CY = FEET_Y + BODY_H / 2;          // 身体中心 1.70
const HEAD_H = 0.26;
const HEAD_CY = FEET_Y + BODY_H + HEAD_H / 2; // 头中心 2.28
const LUG_H = 0.38;
const LUG_CY = FEET_Y + LUG_H / 2;            // 行李中心 1.44
const PLATFORM_NEAR = RAIL.platformEdge + 0.15; // 1.90，靠车门一侧，绝不小于站台边缘
const PLATFORM_FAR = RAIL.platformEdge + RAIL.platformWidth - 1;

// 几何 / 材质模块级缓存 + 引用计数：多个 System 复用，最后一个 dispose 才真释放。
const _shared = { geos: null, mat: null, refs: 0 };
function acquireShared() {
  if (!_shared.geos) {
    _shared.geos = {
      body: new THREE.BoxGeometry(0.42, BODY_H, 0.28),   // 12 三角面
      head: new THREE.BoxGeometry(HEAD_H, HEAD_H, HEAD_H), // 12 三角面
      lug: new THREE.BoxGeometry(0.26, LUG_H, 0.16),      // 12 三角面
    };
    _shared.mat = new THREE.MeshLambertMaterial({ color: 0xffffff }); // 零贴图，实例色由 setColorAt 给
  }
  _shared.refs += 1;
  return _shared;
}
function releaseShared() {
  _shared.refs -= 1;
  if (_shared.refs <= 0 && _shared.geos) {
    _shared.geos.body.dispose();
    _shared.geos.head.dispose();
    _shared.geos.lug.dispose();
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

/**
 * createPassengerSystem(ctx, opts) → Standard System
 * opts = { layouts, capacity(FLEET_CAPACITY), maxInstances?, visualScale?, platformSide? }
 * 由 packs/harbin.js 以 createPassengers 适配口调用。
 */
export function createPassengerSystem(ctx, opts = {}) {
  const fleet = opts.capacity || FLEET_CAPACITY;
  const maxInstances = clamp(opts.maxInstances ?? MAX_INSTANCES, 1, MAX_INSTANCES);
  const maxWaiting = clamp(opts.maxWaiting ?? 110, 1, maxInstances);
  const visualScale = opts.visualScale ?? VISUAL_SCALE;
  const lugCount = Math.min(LUGGAGE_INSTANCES, maxInstances);
  const flow = createFlowModel({ fleet });

  const S = {
    station: null, zone: null, train: null,
    doorOpen: false,           // 由 EVENT.DOORS 维护，关门锁立即为 false
    carLoad: [],               // 每车厢在车人数（核心状态）
    waiting: 0, onboard: 0, alighted: 0, boarded: 0,
    capacity: 0,
    doorMid: [], zMin: -200, zMax: 200,
    serviceSeq: 0, theme: 'day', themeMul: 1,
    agents: [],                // 实例池：长度 = maxInstances，下标 = instance 下标
  };

  let scene = null; let group = null;
  let bodyMesh = null; let headMesh = null; let lugMesh = null;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const color2 = new THREE.Color();

  // ---- 实例池小工具 ----
  function hide(mesh, i) {
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  function applyColor(a) {
    if (!bodyMesh) return;
    color.setHex(a.tint).multiplyScalar(S.themeMul);
    bodyMesh.setColorAt(a.i, color);
    color2.setHex(SKIN).multiplyScalar(0.55 + 0.45 * S.themeMul);
    headMesh.setColorAt(a.i, color2);
    if (a.i < lugCount && a.hasLug) {
      color2.setHex(LUGGAGE_COLOR).multiplyScalar(0.6 + 0.4 * S.themeMul);
      lugMesh.setColorAt(a.i, color2);
    }
  }

  function refreshColors() {
    if (!bodyMesh) return;
    for (const a of S.agents) if (a.active) applyColor(a);
    bodyMesh.instanceColor.needsUpdate = true;
    headMesh.instanceColor.needsUpdate = true;
    if (lugMesh) lugMesh.instanceColor.needsUpdate = true;
  }

  function spawnAgent(stateName, carIndex, x, z, rand) {
    const a = S.agents.find((p) => !p.active);
    if (!a) return null; // 硬钳位：池满就不再生成
    a.active = true; a.state = stateName; a.carIndex = carIndex;
    a.x = x; a.z = z; a.baseX = x; a.baseZ = z;
    a.tx = x; a.tz = z; a.t = 0; a.life = 3; a.dirZ = rand() < 0.5 ? 1 : -1;
    a.facing = rand() < 0.5 ? 0 : Math.PI;
    a.tint = CLOTHING[Math.floor(rand() * CLOTHING.length) % CLOTHING.length];
    a.hasLug = rand() < 0.35;
    // 负指数分布的离站/候车时长（口径见文件头「客流仿真常规做法」），用带 seed 的 rand 保证可重现
    a.expLife = -Math.log(1 - 0.99 * rand()) / 0.45 + 2;
    applyColor(a);
    return a;
  }

  function freeAgent(a) {
    a.active = false; a.state = 'idle'; a.t = 0;
  }

  function countWaiting() {
    let n = 0;
    for (const a of S.agents) if (a.active && a.state === 'waiting') n += 1;
    return n;
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
    S.onboard = S.carLoad.reduce((a, b) => a + Math.max(0, b), 0);
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
    ensureCarLoad(train, rand);

    // 真实量级(泊松到达/分钟) × 示意级压缩 → 站台可视候车人数
    const arrivalsPerMin = flow.sampleArrivals(S.station, minute, rand);
    const want = clamp(Math.round(arrivalsPerMin * visualScale * 8), 6, maxWaiting);
    const cars = S.doorMid.length || 1;
    for (let k = 0; k < want; k += 1) {
      const ci = k % cars; // 按车厢分流（车门就近的大白话近似：轮流分到各车门）
      const z = clamp(S.doorMid[ci] + (rand() - 0.5) * 6, zMin + 1, zMax - 1);
      const x = PLATFORM_NEAR + 0.7 + rand() * 2.6;
      const a = spawnAgent('waiting', ci, x, z, rand);
      if (a) {
        a.tx = PLATFORM_NEAR;
        a.tz = S.doorMid[ci];
      }
    }
    S.waiting = countWaiting();
    syncStats(train);
  }

  function onDoors(payload, c) {
    S.doorOpen = payload?.state === DOOR_STATE.OPEN && Boolean(c?.doorsCanOpen);
    if (!S.doorOpen) {
      // 关门锁：立即停止上下车（boarding 视作已上车直接消失，alighting 转为离站）
      for (const a of S.agents) {
        if (!a.active) continue;
        if (a.state === 'boarding') freeAgent(a);
        else if (a.state === 'alighting') { a.state = 'leaving'; a.t = 0; a.life = 2; }
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
    // 为下车旅客生成可视化小人（每车厢最多取 6 个代表，避免实例爆掉；carLoad 仍是全量）
    for (let i = 0; i < res.perCar.length; i += 1) {
      const show = Math.min(res.perCar[i], 6);
      for (let k = 0; k < show; k += 1) {
        const z = clamp(S.doorMid[i] ?? 0, S.zMin + 1, S.zMax - 1);
        const a = spawnAgent('alighting', i, PLATFORM_NEAR + 0.3 + rand() * 0.5, z, rand);
        if (a) {
          a.tx = PLATFORM_NEAR + 2.2 + rand() * 1.5;
          a.tz = z + (rand() - 0.5) * 3;
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
    const waitingAgents = S.agents.filter((a) => a.active && a.state === 'waiting');
    const res = flow.board(train, S.carLoad, waitingAgents.length, zone);
    S.boarded += res.boarded;
    let taken = 0;
    for (const a of waitingAgents) {
      if (taken >= res.boarded) break; // 超员：剩下的继续 waiting 排队
      a.state = 'boarding'; a.t = 0;
      a.tx = PLATFORM_NEAR;
      a.tz = S.doorMid[a.carIndex] ?? a.baseZ;
      taken += 1;
    }
    S.waiting = countWaiting();
    syncStats(train);
  }

  function onDepart() {
    // 清空站台客流：没上车的候车者沿站台走几步后消失；车上旅客(S.carLoad)带到下一站
    for (const a of S.agents) {
      if (a.active && (a.state === 'waiting' || a.state === 'boarding')) {
        a.state = 'leaving'; a.t = 0; a.life = 3;
      }
    }
    S.waiting = 0;
    S.doorOpen = false;
    S.zone = null;
  }

  // ---- 每帧：走动 + 写实例矩阵 ----
  function stepAgent(a, dt, doorOpen) {
    a.t += dt;
    switch (a.state) {
      case 'waiting': // 站台候车：原地小幅晃动，绝不离开站台
        a.x = a.baseX + Math.sin(a.t * 1.2 + a.i) * 0.04;
        a.z = a.baseZ + Math.cos(a.t * 0.9 + a.i) * 0.05;
        break;
      case 'boarding': // 走向对应车门，走到即上车(onboard，carLoad 已在 BOARD 事件里加过)
        a.x += (a.tx - a.x) * Math.min(1, dt * 2.2);
        a.z += (a.tz - a.z) * Math.min(1, dt * 2.2);
        if (!doorOpen || (Math.abs(a.x - a.tx) < 0.12 && Math.abs(a.z - a.tz) < 0.3)) freeAgent(a);
        break;
      case 'alighting': // 下车后先离开车门
        a.x += (a.tx - a.x) * Math.min(1, dt * 1.8);
        a.z += (a.tz - a.z) * Math.min(1, dt * 1.8);
        if (a.t > 0.9) {
          a.state = 'leaving'; a.t = 0;
          a.life = a.expLife;
        }
        break;
      case 'leaving': // 沿站台走几步后消失
        a.z += a.dirZ * dt * 0.9;
        a.x += dt * 0.15;
        if (a.t > a.life) freeAgent(a);
        break;
      default:
        break;
    }
    // 硬钳位：x 不进车体(<站台边缘)、不穿出站台；z 不越出停车区间
    a.x = clamp(a.x, PLATFORM_NEAR, PLATFORM_FAR);
    a.z = clamp(a.z, S.zMin + 0.5, S.zMax - 0.5);
  }

  function writeMatrices() {
    if (!bodyMesh) return;
    for (let i = 0; i < maxInstances; i += 1) {
      const a = S.agents[i];
      if (!a || !a.active) {
        hide(bodyMesh, i); hide(headMesh, i);
        if (i < lugCount) hide(lugMesh, i);
        continue;
      }
      dummy.rotation.set(0, a.facing, 0);
      dummy.scale.set(1, 1, 1);
      dummy.position.set(a.x, BODY_CY, a.z); dummy.updateMatrix();
      bodyMesh.setMatrixAt(i, dummy.matrix);
      dummy.position.set(a.x, HEAD_CY, a.z); dummy.updateMatrix();
      headMesh.setMatrixAt(i, dummy.matrix);
      if (i < lugCount) {
        if (a.hasLug) {
          dummy.position.set(a.x + 0.32, LUG_CY, a.z + 0.05); dummy.updateMatrix();
          lugMesh.setMatrixAt(i, dummy.matrix);
        } else hide(lugMesh, i);
      }
    }
    bodyMesh.instanceMatrix.needsUpdate = true;
    headMesh.instanceMatrix.needsUpdate = true;
    if (lugMesh) lugMesh.instanceMatrix.needsUpdate = true;
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
      bodyMesh = new THREE.InstancedMesh(sh.geos.body, sh.mat, maxInstances);
      headMesh = new THREE.InstancedMesh(sh.geos.head, sh.mat, maxInstances);
      lugMesh = new THREE.InstancedMesh(sh.geos.lug, sh.mat, lugCount);
      for (const m of [bodyMesh, headMesh, lugMesh]) {
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        for (let i = 0; i < m.count; i += 1) {
          m.setColorAt(i, color.setHex(0x888888)); // 先分配 instanceColor 缓冲
          hide(m, i);
        }
        m.instanceColor.needsUpdate = true;
        m.instanceMatrix.needsUpdate = true;
        group.add(m);
      }
      scene.add(group);
      S.agents = Array.from({ length: maxInstances }, (_, i) => ({
        i, active: false, state: 'idle', carIndex: 0,
        x: 0, z: 0, baseX: 0, baseZ: 0, tx: 0, tz: 0,
        t: 0, life: 3, expLife: 3, dirZ: 1, facing: 0, tint: CLOTHING[0], hasLug: false,
      }));
    },

    update(c, dt) {
      if (!bodyMesh) return;
      const doorOpen = openNow(c);
      const d = clamp(dt || 0, 0, 0.1);
      for (const a of S.agents) {
        if (!a.active) continue;
        if (!doorOpen && a.state === 'boarding') { freeAgent(a); continue; }
        stepAgent(a, d, doorOpen);
      }
      writeMatrices();
    },

    onEvent(type, payload, c) {
      switch (type) {
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
      for (const m of [bodyMesh, headMesh, lugMesh]) m?.dispose?.(); // 释放 instanceMatrix/instanceColor
      bodyMesh = headMesh = lugMesh = null; group = null;
      S.agents.length = 0;
      releaseShared(); // 几何/材质引用计数，最后一个 System 才真释放
      _systems.delete(sys);
    },
  };

  _systems.add(sys);
  return sys;
}

export default createPassengerSystem;

/**
 * track.js —— journey v2 的「轨道系统」（System）。
 *
 * 大白话：把 alignment.js 算好的线路中心线，铺成看得见的 CRTSⅢ 板式无砟轨道、
 * 60kg/m 工字钢轨、链形悬挂接触网、防护栅栏 / 声屏障、路堤边坡、公里标。列车永远
 * 钉在局部原点、车头朝 -Z，所以几何都是「相对列车的局部坐标」；曲线、坡度、超高、
 * 双向换股、到发线导曲线全部由 ctx.alignment.sampleLocal() 一次给全，本文件绝不重算
 * 曲线数学、绝不自己写坐标变换。
 *
 * 【坐标与高度口径】1 单位=1 米，+Y 上，轨顶面 y=0。钢轨 ribbon 顶面 h=0；
 * CRTSⅢ 层状结构 / 道床 / 路堤边坡 / 截水沟一律 h<0（坐在轨顶之下）；
 * 接触网支柱、防护栅栏、声屏障、公里标这类竖直杆件从路基面（约 y=-0.3）向上生长。
 * 与 terrain.js 的边界（2026-11-15 复核）：本模块轨道实体底 -0.61，terrain 地面层
 * 压到 y≤-0.66、1:1.5 边坡从道床坡脚 x≥5.8 起坡，两套边坡不重叠、绝不 z-fighting。
 *
 * 【性能红线】整系统 11 个 mesh = 最多 11 draw call（≤12）；2 张程序化贴图共享（≤2）；
 * 带状几何用「预分配 BufferGeometry + 只重写 position/normal/color」，重复物（凸形
 * 挡台、支柱、栅栏立柱、公里标、道岔）一律 InstancedMesh；三角面 ≈ 3.6 万（<45k）。
 * 只有 travel 跨过 10 m 锚点网格、或 dir/lane 改变才「重建」（重采样 + 重算顶点）；
 * 中间每帧只整体平移 group.position，零几何重算、零 new Geometry。
 *
 * 【★ 消除「开车一闪」的根因与修法（2026-11-15）】
 *  旧版两次 rebuild 之间用 perM（= 中间采样点处，即前方约 1400 m 的切线向量）
 *  做全局线性平移。曲线段近处轨道的真实滚动方向是「列车所在里程」的切线，与
 *  前方 1400 m 切线差 ≈ 1400/R（R=7000 时 ≈11°），累积 10 m 就横向错位近 2 m，
 *  rebuild 瞬间被突然纠正 → 画面一闪。terrain 侧 ribbon 每 20 m 才放样一次、中间
 *  完全不动，也会顿挫。修法三条：
 *   1) 重建锚点网格化：S0 = floor(s/GRID)*GRID，samples 用 sampleLocal(S0,...) 以
 *      **锚点**为局部原点（不是当前 s），窗口 [S0-600, S0+3400] 固定；每帧几何
 *      形状不变，只有 group 平移。
 *   2) 平移量改用「沿曲线精确插值」：trainPos = 从 samples 插值出「里程 c.s 处」
 *      的局部坐标，group.position = -trainPos。它自带曲线横向分量与坡度，近处
 *      轨道平移方向永远正确；重建时窗口整体推进 GRID，与平移态几何连续（残留
 *      只有刚体平移 vs 曲线推进的 O(GRID²/R)≈1 cm 级旋转误差，肉眼不可见）。
 *   3) 导线弛度相位锚定「采样窗口」(i*step) 而非绝对里程，保证每次重建导线
 *      几何形状一致；frameAtMileage 的外插权重 clamp 到 [0,1]，杜绝越界/NaN。
 *  ribbon 顶点、实例矩阵、导线端点都做 Number.isFinite 防护（发现非有限即降级）。
 *
 * 【联网核实的真实资料（标题 + URL + 关键数字，2026-11-14/15 检索）】
 *  1) 双线线间距 4.8/5.0 m
 *     《高速铁路设计规范》TB10621-2014 表5.2.4
 *     https://web.archive.org/web/20200511023119/http://zb.guaihou.com/stdpool/TB%2010621-2014.pdf
 *     350/300/250 km/h → 区间正线最小线间距 5.0/4.8/4.6 m。
 *     国家铁路局《高速铁路线路维修规则(征求意见稿)》表3.1.4-1
 *     https://www.nra.gov.cn/xxgk/gkml//ztjg/zqyj/202212/P020221226537834557458.doc 同值。
 *  2) 60 kg/m 钢轨 + 1435 mm 标准轨距
 *     国家铁路局《铁路技术管理规则(征求意见稿)》
 *     https://www.nra.gov.cn/xxgk/gkml/ztjg/zqyj/202404/P020240428549488614684.pdf
 *     第3-14条 直线标准轨距 1435 mm；第3-15条 高铁正线 60 kg/m 跨区间无缝线路。
 *  3) 60 kg/m 钢轨断面（GB 2585-2007 / TB/T 2344-2012）：轨高 176、底宽 150、
 *     头宽 73、腰厚 16.5 mm，理论重量 60.64 kg/m；U71Mn / U75V；高铁用 100 m
 *     长轨焊成无缝线路。→ 本模块钢轨 ribbon 用 8 顶点工字形断面按此比例画。
 *     https://www.gneerailfastener.com/info/what-is-the-standard-size-of-a-gb-60kg-rail-103153664.html
 *     https://www.gneerailfastener.com/info/what-are-the-dimensions-of-the-gb-60kg-heavy-r-103153726.html
 *     人民铁道网《中国轧成的第一根60公斤钢轨切片》（1976，轨高176/底宽152/头宽73/腰厚17）
 *     https://www.peoplerail.com/rail/show-2968-435166-1.html
 *  4) CRTSⅢ 型板式无砟轨道层状构造（本模块核心断面）
 *     《CRTSⅢ型无砟轨道板与精测精调》南方高铁 http://www.southrailway.com.cn/?p=156&a=view&r=194
 *       钢轨 / 弹性不分开式扣件 / 预制有挡肩轨道板 / 自密实混凝土填充层 / 限位挡台 /
 *       中间隔离层(土工布) / 带限位凹槽的钢筋混凝土底座；单元分块式、板间不连接。
 *     《列车荷载下桥上CRTSⅢ型板式无砟轨道挠曲力与位移》交通运输工程学报
 *       https://transport.chd.edu.cn/cn/article/doi/10.19818/j.cnki.1671-1637.2018.06.007
 *       轨道板 P5600：5600×2500×200 mm（C60 预应力）；相邻板 70 mm 板缝；
 *       自密实混凝土层 C40 厚 100 mm、长宽与轨道板齐；下设 2 个凸台与底座凹槽咬合限位；
 *       路基段底座板宽 3100 mm、厚 284 mm、长 5650 mm、相邻伸缩缝 20 mm；凹槽 700×1000×100 mm。
 *     《地震作用下桥上CRTSⅢ型板式无砟轨道纵向动力响应》北京交通大学学报
 *       https://jdxb.bjtu.edu.cn/CN/10.11860/j.issn.1673-0291.20220051
 *       底座与自密实层间 4 mm 土工布隔离层；扣件横/垂向刚度 50/35 kN·mm⁻¹。
 *     《隧道内无砟轨道上拱变形特征》中国安全科学学报（一块底座板上铺 3 块轨道板）
 *       https://castjournals.cast.org.cn/joweb/zgaqkxxb/CN/10.16265/j.cnki.issn1003-3033.2024.01.2363
 *       扣件间距约 630 mm。有砟道床断面（对照组）：顶宽 3600、厚 350、边坡 1:1.75。
 *       https://hefei.jiangongdata.com/urbanhubnewsdetail/895960.html
 *     → 本模块按「钢轨→扣件/承轨台→轨道板→自密实层→隔离层→底座」分层，
 *       板缝/扣件用程序化贴图的纵向周期表现，凸形挡台用 InstancedMesh 每 5.6 m 一组。
 *       为守住「底座底 -0.61、不穿 terrain 地面」的边界，层厚做了示意级压缩（注释见 trackStrands）。
 *  5) 接触网：链形悬挂 + 腕臂 + 定位 + 回流
 *     《一张图拆解接触网结构》铁道知识局（腕臂零件图：平腕臂/斜腕臂/承力索座/
 *       套管双耳/棒式绝缘子/定位管/定位器/腕臂上下底座）
 *       http://mp.weixin.qq.com/s?__biz=MzI2OTQzNTgxMA==&mid=2247564941&idx=2&sn=190b885e67bad162360b7ef3ad7a0732
 *     《高铁接触网系统构成与关键零部件功能定位研究》美路职培
 *       https://www.mlzp.cc/forum.php?mod=viewthread&tid=24983
 *       平腕臂水平悬挂承力索、斜腕臂约 45° 支撑定位装置与接触线、三角支撑；
 *       定位器经定位线夹夹持接触线保持拉出值（±150 mm 量级）、防风拉线抗风偏；
 *       棒式/硅橡胶复合绝缘子隔离带电体与接地支柱；回流线贯穿全线把泄漏电流引入钢轨。
 *     《接触网设备零部件大揭秘》百度爱采购
 *       https://b2bwiki.baidu.com/article/706992510266605569
 *       吊弦安装间距 8~12 m；承力索与接触线 1.5~2.0 m 悬挂高度差；支柱 6~15 m；
 *       钢柱 GB/T 25020.4-2016（H 型支柱）。
 *     导高 5300~5700 mm、跨距高铁 45~55 m（本项目 RAIL 取 5.4 m / 48 m）。
 *       https://b2bwiki.baidu.com/en/article/aw_3681f5906f45205935b81cb601e59f48
 *  6) 防护栅栏 / 声屏障
 *     搜狗百科《铁路防护栅栏》（通线(2012)8001/8002、TB/T 3522-2018）
 *       https://baike.sogou.com/v101548563.htm
 *       时速 200 km 以上：2.2 m 高钢筋混凝土防护栅栏 + 0.5 m 刺丝滚笼（重点区段 2.7 m）；
 *       C30 立柱截面 180×180 mm、间距 3.0 m、柱帽 180×180×150；上槛 125 / 下槛 175 mm、
 *       栏片高 1875 mm、间隙 105~120 mm；刺丝滚笼卷径 50 cm、张开交叉圈间距 20 cm。
 *     《高铁和普速铁路栅栏有什么区别》艾瑞金属丝网
 *       http://www.airui333.com/jilin/news/3143.html
 *       网孔 75×150 mm、丝径 ≥4.0 mm；高铁强制 30° 外折防爬 + 刺丝滚笼。
 *     《铁路声屏障说明》思固尔 http://www.shengpingzhang.cc/article/476.html
 *       H 型钢立柱 100×100 / 125×125 / 150×150；金属吸声板（镀锌板 0.8~1.0 mm，
 *       百叶孔 / 微穿孔 / 凹凸穿孔）；透明隔声板透光率 ≥80%、计权隔声量 ≥30 dB；
 *       参考单元 1960×500×140 mm；路基段高约 2.05 m（轨面以上，通环(2009)8325）。
 *       → 本模块声屏障用「半透明穿孔板 + 透明隔声段」而非一整块不透明灰板。
 *  7) 路堤边坡 / 排水沟 / 护坡骨架 / 标志
 *     百度百科《路基设计》 https://baike.baidu.com/item/路基设计/12509339
 *       路堤边坡 1:1.5~1:1.75、路堑 1:1~1:1.5；路堤两侧设排水沟(边沟)、坡脚设护道。
 *     长赣高铁环评《路堤边坡防护典型设计图》
 *       https://www.hunan.gov.cn/hnszf/xxgk/tzgg/szbm/202307/29404201/files/470e006bc6b947ff8c5563ea4267081d.pdf
 *       边坡高 >4 m 用 M10 浆砌片石拱形截水骨架内植草，主骨架间距 3 m、厚 0.6 m；
 *       坡面每隔 10 m 设 C25 混凝土横向排水槽。
 *     《高速铁路路基边坡防护施工方案》 https://www.bzko.com/sgzzsj/349092.html
 *       截水沟(天沟)底宽 0.4 m、深 0.4 m、边坡 1:1~1:1.5；六边形空心块 C25 预制。
 *     百度百科《线路标志》https://baike.baidu.com/item/铁路线路标志
 *     中国科普博览 https://www.kepu.net.cn/gb/technology/railway/railway_line/200401160012.html
 *       公里标设整公里、半公里标设半公里处，埋在计算里程方向线路左侧、距轨头外侧 ≥2 m；
 *       曲线标设曲线中部（标圆曲线/缓和曲线/半径/超高）；坡度标设变坡点；
 *       直缓/缓圆/圆缓/缓始终点标。双线设在列车运行方向左侧。
 *  8) 高速道岔 18 号全长 69 m（侧向 80 km/h）
 *     https://biaozhun.tdpress.com/front/getFileImage?id=4d95facb863a4ff7b6d070cfa5c4a589
 *  9) lead 二轮补发的既有线参数（2026-11-15，来源域名：peopleapp.com 哈大高铁
 *     桥梁占比 / scsqw CRTSⅢ / liaoning.jianyu360.com 京哈高速线接触网 /
 *     cisigunlong 防护栅栏 / guimei8 公里标）：
 *     - 哈大高铁 921 km 中桥梁 162 座共 662.765 km，占 73.32%，地面线路 <20%
 *       → 32.6 m 双线简支箱梁高架（顶板宽 12.6、梁高 3.0~3.05、桥面宽 12、
 *       矩形/圆端形桥墩墩高示意 18 m、防护墙、桥上接触网柱与桥上声屏障）。
 *       桥梁结构由 terrain.js 放样，本文件只按「桥上」口径取 2900 底座 / 49 m 柱距。
 *     - 接触线 5300、承力索 6900（结构高 1600）、吊弦 8~10 m 且最短 ≥600、
 *       弹性吊索 18~22 m、拉出值 ±200、热浸镀锌 H 柱、上腕臂底座 6790 /
 *       下腕臂底座 5040、支柱侧面限界 ≥3000、跨距路基 50~60 / 桥上 49。
 *     - 防护栅栏 2.2 m 栏片 + 0.5 m 刺丝滚笼(总 2.7)、单元 3.0、立柱 18×18、
 *       栏片肋柱间隙下 105/上 120；声屏障 H 柱间距 2 m、中心距外侧线路中心 3.42 m、
 *       高 2.15/3.15、单元板 1960×500、穿孔率 25~30%、透明段 PC 耐力板。
 *     - 标志：公里/半公里标白底黑字黑体字高 90、底边距轨面 3.0 m、贴就近
 *       接触网柱正反两面；白底红▲刷运行方向左股钢轨轨腰；CPⅢ 标 350×200。
 *     - 400 m 分块与 32.6(箱梁)/5.6(轨道板)/3(栅栏)/2(声屏障)/49(柱) m 模数对齐，
 *       块边界不落桥梁跨中；高寒：边坡排水沟埋深 2.5 m、道岔融雪装置。
 *     - 枕木只出现在站场到发线(有砟)，正线为 CRTSⅢ 板 → 进站前道床质感突变。
 *
 * 【示意级近似，别当测绘】核心尺寸取自 core.js 的 RAIL（轨距 1.435、线间距 5.0、
 * 支柱间距 48、栅栏偏移 12/高 2.2…）不另写；导线/柱距本文件按资料 9 用 5.3/6.9/49；
 * RAIL.fenceOffset=12 m 是示意放大；CRTSⅢ 各层厚度为守住 y≥-0.61 边界做了压缩；
 * 接触网吊弦按 10 m 示意（真实 8~10 m）、弹性吊索/硬横跨/道岔融雪未建；声屏障
 * 透明段用顶点色区分而非独立 PC 材质（受 draw call 上限约束）；▲轨腰标记 / CPⅢ 字形
 * 未做；几何与贴图全程序化生成，运行时不 fetch 任何静态资产。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RAIL, DIRECTION, LANE, EVENT, SYSTEM_PHASE, clamp } from './core.js';

// ------------------------------------------------------------ 补充尺寸 ----
// RAIL 里没有的调研值集中放这里，每条都带来源（见文件头资料 3~7）。
const DIM = Object.freeze({
  // 60 kg/m 钢轨断面（资料 3，米）
  railHeight: 0.176, railHeadHalf: 0.073 / 2, railWebHalf: 0.0165 / 2, railBaseHalf: 0.150 / 2,
  railShoulderY: -0.048, railWebBotY: -0.128,
  // CRTSⅢ 层状（资料 4 + lead 补发）：P5600 轨道板 5600×2500×200、底座宽 2900(桥上)、
  // 板下自密实混凝土 100、板缝 70、限位挡台，按 5.6 m 模数重复；60 kg/m 无缝钢轨+弹性扣件。
  // 为守住「底座底 -0.61、地面 -0.66」边界，层厚做示意级压缩。
  slabLen: 5.6, slabHalf: 2.5 / 2, slabTopY: -0.205, slabBotY: -0.375, slabGap: 0.070,
  sccBotY: -0.465, baseHalf: 2.9 / 2, baseBotY: -0.61, clipSpacing: 0.63,
  ballastSlope: 1.75, subgradeSlope: 1.5, subgradeHalf: 6.8,
  drainWidth: 1.0, drainDrop: 0.55,
  // 接触网（京哈高速线既有标准，lead 补发）：接触线 5300、承力索 6900(结构高度 1600)、
  // 吊弦间距 8~10 m 且最短≥600、拉出值±200、热浸镀锌 H 形钢柱、上腕臂底座 6790 /
  // 下腕臂底座 5040、跨距桥上 49(路基 50~60)、支柱侧面限界≥3000。
  // core.js 的 RAIL.catenaryHeight=5.4 / mastSpacing=48 是跨模块契约，本文件不改动它们，
  // 轨道/导线几何统一改用下面这组更贴合既有线的数值。
  contactWireH: 5.3, messengerRise: 1.6, wireSag: 0.45, pullOff: 0.2,
  dropperSpacing: 9, dropperMin: 0.6, returnWireRise: 1.6,
  armUpperY: 6.79, armLowerY: 5.04, mastTop: 7.2, mastSpacing: 49,
  mastOut: RAIL.trackCenters / 2 + RAIL.ballastWidth / 2, // ≈5.1 m，≥3.0 m 侧面限界
  mastReach: RAIL.ballastWidth / 2,  // 腕臂水平投影 ≈2.6 m，伸到股道中心上方
  mastRadius: 0.13,
  // 栅栏 / 声屏障（资料 6 + lead 补发）：2.2 m 栏片 + 顶部 0.5 m 刺丝滚笼(总 2.7)、
  // 单元 3.0、立柱 18×18、栏片肋柱间隙下 105/上 120；声屏障 H 柱间距 2 m、
  // 中心距外侧线路中心 3.42 m(→距线路中心 2.5+3.42=5.92)、高 2.15/3.15、
  // 单元板 1960×500、穿孔率 25~30%、透明段 PC 耐力板。
  fencePanelLen: 3.0, fencePostSize: 0.18, fenceFold: 0.28, fenceRollH: 0.5,
  barrierHeight: 2.15, barrierOffset: RAIL.trackCenters / 2 + 3.42, barrierPostSpacing: 2.0,
  // 标志（lead 补发）：公里/半公里标白底黑字黑体字高 90、底边距轨面 3.0 m、
  // 贴就近接触网柱正反两面；CPⅢ 标 350×200。
  kmSpacing: 500, kmSignY: 3.0, kmSignFont: 0.09, switchLen: 69,
  nearDetailM: 130, nearFenceM: 240, nearMastM: 560,
  // 锚点网格 10 m 与 400 m 分块对齐(400/10=40)；重复物按绝对里程网格(49/5.6/3/2 m)
  // 摆放，与分块无关 → 400 m 块边界不会切在桥梁 32.6 m 跨中或轨道板/栅栏跨中。
  rebuildMeters: 10, sampleStep: 20, fromBehind: 600, toAhead: 3400,
});

const SPAN = DIM.fromBehind + DIM.toAhead;              // 4000 m
const SAMPLE_N = Math.floor(SPAN / DIM.sampleStep) + 1;  // 201 个采样点

/** 各层开关常量（配合系统的 setLayer(name, on) 使用）。签名/键名保持不变。 */
export const TRACK_LAYERS = Object.freeze({
  RAILS: 'rails', BED: 'bed', SLEEPERS: 'sleepers', CATENARY: 'catenary',
  WIRES: 'wires', FENCE: 'fence', BARRIER: 'barrier', EARTHWORK: 'earthwork',
  KM_POSTS: 'kmPosts', SWITCHES: 'switches', CONNECTION: 'connection',
});

// ------------------------------------------------------ 程序化贴图（2 张）----
// document 不存在（Node 单测）时优雅降级为 null，材质不挂 map，几何照常工作。
// 只用 fillStyle / fillRect / beginPath / arc / fill，兼容最朴素的 canvas stub。
function makeConcreteTexture() {
  if (typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    if (!c || !c.getContext) return null;
    c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    if (!g) return null;
    // 混凝土/道砟底噪点（可平铺）
    g.fillStyle = '#b3b1a9'; g.fillRect(0, 0, 256, 256);
    let seed = 20261115;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 2200; i += 1) {
      const v = 120 + Math.floor(rnd() * 95);
      g.fillStyle = `rgba(${v},${v - 3},${v - 10},${0.25 + rnd() * 0.5})`;
      g.beginPath(); g.arc(rnd() * 256, rnd() * 256, 0.4 + rnd() * 1.7, 0, Math.PI * 2); g.fill();
    }
    // 轨道板板缝（资料 4：70 mm 缝、板长 5.6 m）：贴图纵向周期里画两道暗缝；
    // 配合轨道板顶面 strand 的 uvV=5.6，每 5.6 m 出现一次。
    g.fillStyle = 'rgba(45,43,40,0.55)'; g.fillRect(0, 0, 256, 6); g.fillRect(0, 128, 256, 5);
    // 扣件暗点（资料 4：扣件间距 0.63 m → 5.6 m 板上约 9 组）：每个周期 9 行小暗块。
    g.fillStyle = 'rgba(60,58,54,0.5)';
    for (let j = 0; j < 9; j += 1) {
      const y = 8 + j * 13;
      g.fillRect(48, y, 26, 4); g.fillRect(182, y, 26, 4);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  } catch (e) { return null; }
}

/** 金属综合贴图：钢轨轧制亮带 + 金属网孔(75×150 示意) + 穿孔吸声板圆孔 + 镀锌细纹。
 *  共享给钢轨/栅栏网片/声屏障/腕臂/道岔，靠 uvScale 密度、顶点色、透明度区分（≤2 张贴图）。 */
function makeMetalTexture() {
  if (typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    if (!c || !c.getContext) return null;
    c.width = 256; c.height = 256;
    const g = c.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#aeb4b8'; g.fillRect(0, 0, 256, 256);
    let seed = 77123;
    const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
    // 钢轨/镀锌钢纵向轧制细纹（U 方向 = 截面/高度，V 方向 = 里程）
    for (let x = 0; x < 256; x += 6) {
      const v = 150 + Math.floor(rnd() * 70);
      g.fillStyle = `rgba(${v},${v + 4},${v + 8},0.4)`; g.fillRect(x, 0, 2, 256);
    }
    // 金属网片：方格网孔（资料 6：75×150 mm，示意放大），细亮线 + 暗孔
    g.fillStyle = 'rgba(70,78,84,0.32)';
    for (let x = 0; x < 256; x += 16) g.fillRect(x, 0, 2, 256);
    for (let y = 0; y < 256; y += 22) g.fillRect(0, y, 256, 2);
    // 穿孔吸声板圆孔阵列（资料 6：微穿孔/百叶孔），叠在同一张上靠密度区分
    g.fillStyle = 'rgba(40,48,54,0.55)';
    for (let y = 11; y < 256; y += 22) {
      for (let x = 8; x < 256; x += 16) {
        g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill();
      }
    }
    // H 型钢立柱暗竖条（声屏障分段，配合 uvV≈4 m 每周期一条）
    g.fillStyle = 'rgba(60,66,72,0.6)'; g.fillRect(0, 0, 5, 256);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  } catch (e) { return null; }
}

// ------------------------------------------------------ Ribbon 批处理 ----
/**
 * 把很多条「沿线路挤出的带状几何」塞进 1 个 BufferGeometry = 1 次 draw call。
 * 每条 strand 有固定横截面 section=[[u,h],...]（u 横向、h 竖向，米），沿 N 个采样点
 * 放样；顶点局部坐标 = position + right*(lateral+u) + up*(height+h)。
 * 预分配 position/normal/color/uv/index，update() 只重写 position / normal / color。
 *
 * 增强（相对旧版）：
 *  - stride：本 batch 沿 samples 每隔 stride 取一点（钢轨沿 z 变化慢，用 2 省一半面，
 *    把省下的面给 8 顶点工字形断面）；
 *  - uvFromHeight：竖直面（栅栏/声屏障）用截面高度 h 作 U，横向面用 u 作 U；
 *  - uvV：V（沿里程）平铺尺度可与 U(uvScale) 不同，用来把板缝/网孔/H 柱周期对齐；
 *  - dynamicColor(smp,i,k,api)：可选逐顶点色回调（轨头高光、板缝暗带），低频重建时刷；
 *  - 顶点 Number.isFinite 防护：算出非有限值即把该点藏到 -1e4，绝不写 NaN 进 buffer。
 */
class RibbonBatch {
  constructor(strands, material, stride = 1) {
    this.strands = strands;
    this.stride = stride;
    this.N = Math.floor((SAMPLE_N - 1) / stride) + 1;
    let vCount = 0, iCount = 0;
    for (const st of strands) {
      const K = st.section.length;
      st._K = K;
      st._vOff = vCount;
      st._edges = st.closed ? K : K - 1;
      vCount += this.N * K;
      iCount += (this.N - 1) * st._edges * 6;
    }
    this.vCount = vCount;
    const pos = new Float32Array(vCount * 3);
    const nor = new Float32Array(vCount * 3);
    const col = new Float32Array(vCount * 3);
    const uv = new Float32Array(vCount * 2);
    const Idx = vCount > 65535 ? Uint32Array : Uint16Array;
    const idx = new Idx(iCount);
    let idxPtr = 0;
    for (const st of strands) {
      const K = st._K;
      const rgb = st.color || [1, 1, 1];
      const uvS = st.uvScale || 2;
      const uvV = st.uvV || uvS;
      for (let i = 0; i < this.N; i += 1) {
        for (let k = 0; k < K; k += 1) {
          const vi = st._vOff + i * K + k;
          col[vi * 3] = rgb[0]; col[vi * 3 + 1] = rgb[1]; col[vi * 3 + 2] = rgb[2];
          const p = st.section[k];
          uv[vi * 2] = (st.uvFromHeight ? p[1] : p[0]) / uvS;
          uv[vi * 2 + 1] = (i * stride * DIM.sampleStep) / uvV;
        }
      }
      for (let i = 0; i < this.N - 1; i += 1) {
        for (let e = 0; e < st._edges; e += 1) {
          const k1 = st.closed ? (e + 1) % K : e + 1;
          const a = st._vOff + i * K + e;
          const b = st._vOff + i * K + k1;
          const cc = st._vOff + (i + 1) * K + e;
          const d = st._vOff + (i + 1) * K + k1;
          idx[idxPtr++] = a; idx[idxPtr++] = cc; idx[idxPtr++] = b;
          idx[idxPtr++] = b; idx[idxPtr++] = cc; idx[idxPtr++] = d;
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geometry = geo;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false; // ribbon 顶点每 10 m 才重写，别被旧包围盒裁掉
    this.mesh.name = 'track-ribbon';
  }

  update(samples, api) {
    const pos = this.geometry.attributes.position.array;
    const colArr = this.geometry.attributes.color.array;
    let colorDirty = false;
    const stride = this.stride;
    for (const st of this.strands) {
      const hide = st.hide && api && st.hide(api);
      const K = st._K;
      for (let i = 0; i < this.N; i += 1) {
        const smp = samples[Math.min(i * stride, samples.length - 1)] || samples[samples.length - 1];
        for (let k = 0; k < K; k += 1) {
          const o = (st._vOff + i * K + k) * 3;
          if (hide) {
            pos[o] = 0; pos[o + 1] = -1e4; pos[o + 2] = 0;
            continue;
          }
          const lat = st.lateral ? st.lateral(smp, i, api) : 0;
          const hgt = st.height ? st.height(smp, i, api) : 0;
          const P = smp.position, R = smp.right, U = smp.up;
          const du = lat + st.section[k][0];
          const dh = hgt + st.section[k][1];
          const x = P[0] + R[0] * du + U[0] * dh;
          const y = P[1] + R[1] * du + U[1] * dh;
          const z = P[2] + R[2] * du + U[2] * dh;
          if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
            pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
          } else {
            pos[o] = 0; pos[o + 1] = -1e4; pos[o + 2] = 0; // NaN 防护：藏点，不写非有限值
          }
          if (st.dynamicColor) {
            const c = st.dynamicColor(smp, i, k, api);
            if (c) { colArr[o] = c[0]; colArr[o + 1] = c[1]; colArr[o + 2] = c[2]; colorDirty = true; }
          }
        }
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    if (colorDirty) this.geometry.attributes.color.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  dispose() { this.geometry.dispose(); }
}

// ------------------------------------------------------ 几何小工具 ----
function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}
function strut(a, b, r, seg = 5) {
  const from = new THREE.Vector3(a[0], a[1], a[2]);
  const to = new THREE.Vector3(b[0], b[1], b[2]);
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length() || 1e-3;
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), dir.clone().normalize(),
  ));
  g.translate(from.x, from.y, from.z);
  return g;
}

/** 60 kg/m 钢轨工字形断面（资料 3）：轨头(73)/轨腰(16.5)/轨底(150)/轨高(176 mm)。
 *  8 顶点闭合轮廓，u=钢轨中心；返回 [[u,h],...]。h 从 0（轨顶）到 -0.176（轨底）。 */
function railSection(u) {
  const hh = DIM.railHeadHalf, wh = DIM.railWebHalf, bh = DIM.railBaseHalf;
  return [
    [u - hh, 0], [u + hh, 0],                         // 轨顶踏面
    [u + wh, DIM.railShoulderY], [u + wh, DIM.railWebBotY], // 右轨肩 → 右轨腰
    [u + bh, -DIM.railHeight], [u - bh, -DIM.railHeight],   // 轨底
    [u - wh, DIM.railWebBotY], [u - wh, DIM.railShoulderY], // 左轨腰 → 左轨肩
  ];
}
/** 轨头亮、轨腰暗、轨底锈：强化真实断面的明暗层次（无贴图时也成立）。 */
function railColor(smp, i, k) {
  if (k === 0 || k === 1) return [0.98, 0.99, 1.0];  // 轨顶踏面银亮高光
  if (k === 3 || k === 6) return [0.44, 0.43, 0.41]; // 轨腰暗
  if (k === 4 || k === 5) return [0.58, 0.52, 0.46]; // 轨底锈色
  return [0.78, 0.79, 0.8];                          // 轨肩过渡
}

/** 接触网支柱 + 完整腕臂（资料 5 + lead 补发京哈标准）：热浸镀锌 H 柱、上腕臂底座
 *  6790 / 下腕臂底座 5040、棒式绝缘子、平腕臂(承力索座)、斜腕臂、套管双耳、腕臂支撑、
 *  定位管/定位环/定位器/定位线夹、防风拉线、回流线支架、坠砣补偿。接触线 5300、
 *  承力索 6900(结构高 1600)、柱顶 7200。腕臂朝 +X（线路中心方向），合并成单个几何。
 *  绝对 y 以轨顶 0 为基准；支柱中心在 ±mastOut≈5.1 m，满足侧面限界 ≥3000 mm。 */
function mastGeometry() {
  const reach = DIM.mastReach, top = DIM.mastTop;
  const ch = DIM.contactWireH, mh = ch + DIM.messengerRise; // 5.3 / 6.9
  const up = DIM.armUpperY, lo = DIM.armLowerY;             // 6.79 / 5.04
  const parts = [
    box(0.7, 0.22, 0.7, 0, -0.24, 0),                          // 基础
    box(0.24, top + 0.3, 0.30, 0, (top + 0.3) / 2 - 0.15, 0),  // 热浸镀锌 H 型钢柱
    box(0.34, 0.12, 0.34, 0, top, 0),                          // 柱帽
    box(0.18, 0.16, 0.2, 0.16, up, 0),                         // 腕臂上底座 6790
    box(0.18, 0.16, 0.2, 0.16, lo, 0),                         // 腕臂下底座 5040
    strut([0.2, up, 0], [0.78, up, 0], 0.055, 5),              // 棒式绝缘子芯棒
    box(0.1, 0.16, 0.16, 0.5, up, 0),                          // 绝缘子伞裙
    strut([0.78, up, 0], [reach + 0.1, up - 0.1, 0], 0.045, 5),// 平腕臂
    box(0.14, 0.14, 0.2, reach + 0.1, mh - 0.1, 0),            // 承力索座(承力索 6900)
    strut([0.2, lo, 0], [reach - 0.5, up - 0.2, 0], 0.05, 5),  // 斜腕臂(≈45°)
    box(0.1, 0.12, 0.12, reach - 0.5, up - 0.22, 0),           // 套管双耳
    strut([reach * 0.5, up - 0.1, 0], [reach * 0.5, lo + 0.6, 0], 0.028, 4), // 腕臂支撑
    strut([reach - 0.5, lo + 0.3, 0], [reach + 0.4, ch + 0.35, 0], 0.035, 5),// 定位管
    box(0.09, 0.1, 0.09, reach - 0.5, lo + 0.28, 0),           // 定位环
    strut([reach + 0.4, ch + 0.35, 0], [reach + 0.15, ch + 0.06, 0], 0.022, 4), // 定位器
    box(0.1, 0.06, 0.1, reach + 0.15, ch + 0.04, 0),          // 定位线夹
    strut([reach + 0.4, ch + 0.35, 0], [0.1, ch - 0.7, 0], 0.012, 4), // 防风拉线
    strut([0, mh + 0.2, 0], [-0.55, mh + 0.2, 0], 0.03, 4),   // 回流线支架
    box(0.1, 0.14, 0.1, -0.55, mh + 0.2, 0),
    strut([-0.28, 1.2, 0], [-0.28, 2.3, 0], 0.035, 4),        // 坠砣补偿（示意）
  ];
  return mergeGeometries(parts);
}

/** CRTSⅢ 凸形挡台 + 承轨台 + 扣件座（资料 4）。每 5.6 m 板端放一组，几何自带绝对 y。 */
function detailGeometry() {
  const g = RAIL.railHalf;
  const parts = [
    box(0.7, 0.14, 0.9, 0, DIM.sccBotY - 0.02, 0),          // 限位凸台（与底座凹槽咬合）
    box(0.34, 0.05, 0.3, -g, DIM.slabTopY + 0.025, 0),      // 左承轨台
    box(0.34, 0.05, 0.3, g, DIM.slabTopY + 0.025, 0),       // 右承轨台
    box(0.3, 0.05, 0.14, -g, DIM.slabTopY + 0.06, 0),       // 左扣件弹条组（示意）
    box(0.3, 0.05, 0.14, g, DIM.slabTopY + 0.06, 0),        // 右扣件弹条组
  ];
  return mergeGeometries(parts);
}

/** 单个 18 号道岔示意几何：基本轨 + 尖轨收拢 + 辙叉 V 形 + 转辙机盒，合并成 1 个 mesh。 */
function switchGeometry() {
  const L = DIM.switchLen, g = RAIL.gauge, half = L / 2;
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push(box(RAIL.railHeadWidth + 0.03, RAIL.railHeight, L, s * g / 2, -RAIL.railHeight / 2, 0));
  }
  for (const s of [-1, 1]) {
    for (let j = 0; j < 6; j += 1) {
      const t = j / 6;
      const z = -half + (j + 0.5) * (L / 2) / 6;
      const x = s * (g / 2) * (1 - t) * 0.9;
      parts.push(box(0.07, 0.12, L / 12, x, -0.06, z));
    }
  }
  parts.push(strut([-0.5, -0.06, half - 6], [0, -0.06, half], 0.06));
  parts.push(strut([0.5, -0.06, half - 6], [0, -0.06, half], 0.06));
  for (const s of [-1, 1]) parts.push(box(0.7, 0.35, 1.1, s * (g / 2 + 0.9), -0.28, -half + 5));
  return mergeGeometries(parts);
}

/**
 * 导出：单道岔 Group（供 stations.js 或其它模块复用）。签名/行为不变。
 * 局部原点 = 道岔中心，直股沿 Z，轨顶 y=0，整体 1 个 mesh = 1 draw call。
 */
export function buildSwitch(opts = {}) {
  const group = new THREE.Group();
  group.name = `switch-${opts.kind || 'entry'}`;
  const mat = opts.material || new THREE.MeshStandardMaterial({
    color: 0x8c9198, roughness: 0.5, metalness: 0.55,
  });
  const geo = switchGeometry();
  if (opts.length && opts.length !== DIM.switchLen) geo.scale(1, 1, opts.length / DIM.switchLen);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'switch-body';
  group.add(mesh);
  group.userData.lateral = opts.lateral ?? RAIL.trackCenters;
  group.userData.kind = opts.kind || 'entry';
  return group;
}

// ------------------------------------------------------ 采样点插值 ----
const _fr = { p: [0, 0, 0], r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, -1] };
/** 重复实例落在绝对里程网格上，用相邻两个采样点线性插值出局部基向量。
 *  w 严格 clamp 到 [0,1]（旧版上界外插会越界/抖动），并对基向量做有限性兜底。 */
function frameAtMileage(samples, fromM, step, s) {
  const t = clamp((s - fromM) / step, 0, samples.length - 1);
  const i = Math.min(samples.length - 2, Math.floor(t));
  const w = clamp(t - i, 0, 1);
  const a = samples[i], b = samples[i + 1];
  const o = _fr;
  for (let j = 0; j < 3; j += 1) {
    o.p[j] = a.position[j] + (b.position[j] - a.position[j]) * w;
    o.r[j] = a.right[j] + (b.right[j] - a.right[j]) * w;
    o.u[j] = a.up[j] + (b.up[j] - a.up[j]) * w;
    o.f[j] = a.forward[j] + (b.forward[j] - a.forward[j]) * w;
  }
  const norm = (v, fb) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    if (!Number.isFinite(l) || l < 1e-6) { v[0] = fb[0]; v[1] = fb[1]; v[2] = fb[2]; return; }
    v[0] /= l; v[1] /= l; v[2] /= l;
  };
  norm(o.r, [1, 0, 0]); norm(o.u, [0, 1, 0]); norm(o.f, [0, 0, -1]);
  for (let j = 0; j < 3; j += 1) {
    if (!Number.isFinite(o.p[j])) o.p[j] = 0;
  }
  return o;
}

const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _mat = new THREE.Matrix4();
/** 把插值帧 + 横向偏移 d / 竖向 h / 缩放 / 是否绕竖轴翻 180° 组装成实例矩阵。
 *  组装后校验矩阵元素有限性，出现 NaN 就返回单位矩阵（绝不把坏矩阵写进 instanceMatrix）。 */
function instanceMatrix(fr, d, h, scale = 1, flip = false) {
  const sg = flip ? -1 : 1;
  _bx.set(fr.r[0] * sg, fr.r[1] * sg, fr.r[2] * sg);
  _by.set(fr.u[0], fr.u[1], fr.u[2]);
  _bz.set(-fr.f[0] * sg, -fr.f[1] * sg, -fr.f[2] * sg);
  _bx.multiplyScalar(scale); _by.multiplyScalar(scale); _bz.multiplyScalar(scale);
  _mat.makeBasis(_bx, _by, _bz);
  const px = fr.p[0] + fr.r[0] * d + fr.u[0] * h;
  const py = fr.p[1] + fr.r[1] * d + fr.u[1] * h;
  const pz = fr.p[2] + fr.r[2] * d + fr.u[2] * h;
  if (Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(pz)) _mat.setPosition(px, py, pz);
  else _mat.identity();
  let finite = true;
  for (let i = 0; i < 16; i += 1) if (!Number.isFinite(_mat.elements[i])) { finite = false; break; }
  return finite ? _mat : _mat.identity();
}

/** InstancedMesh 薄封装：预分配 maxCount，update 时按绝对里程网格填矩阵并设 count。 */
class InstanceLayer {
  constructor(geometry, material, maxCount, name) {
    this.mesh = new THREE.InstancedMesh(geometry, material, maxCount);
    this.mesh.name = name;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.maxCount = maxCount;
  }
  begin() { this._n = 0; }
  push(m) {
    if (this._n >= this.maxCount) return;
    this.mesh.setMatrixAt(this._n, m);
    this._n += 1;
  }
  end() { this.mesh.count = this._n; this.mesh.instanceMatrix.needsUpdate = true; }
  dispose() { this.mesh.geometry.dispose(); this.mesh.dispose?.(); }
}

// ------------------------------------------------------ 系统工厂 ----
const ACTIVE = new Set();

export function createTrackSystem(ctx) {
  const group = new THREE.Group();
  group.name = 'track-system';
  group.matrixAutoUpdate = true;
  if (ctx?.scene) ctx.scene.add(group); // register 之后框架不会再 add 一次

  // ---- 2 张程序化贴图 + 共享材质 ----
  const texConcrete = makeConcreteTexture();
  const texMetal = makeMetalTexture();
  const mkMat = (params, tex) => {
    const def = { side: THREE.DoubleSide, ...params };
    if (tex) def.map = tex; // 无贴图(Node)时别把 undefined 传进去
    return new THREE.MeshStandardMaterial(def);
  };
  const mats = {
    rail: mkMat({ color: 0xd6dbe2, metalness: 0.86, roughness: 0.24, vertexColors: true }, texMetal),
    bed: mkMat({ color: 0xffffff, roughness: 0.95, metalness: 0.02, vertexColors: true }, texConcrete),
    earth: mkMat({ color: 0xffffff, roughness: 0.98, metalness: 0.0, vertexColors: true }, texConcrete),
    fence: mkMat({ color: 0xffffff, roughness: 0.6, metalness: 0.28, vertexColors: true,
      transparent: true, opacity: 0.5, depthWrite: false, forceSinglePass: true }, texMetal),
    barrier: mkMat({ color: 0xffffff, roughness: 0.55, metalness: 0.16, vertexColors: true,
      transparent: true, opacity: 0.4, depthWrite: false, forceSinglePass: true }, texMetal),
    detail: mkMat({ color: 0x9a978f, roughness: 0.92, vertexColors: false }, texConcrete),
    mast: mkMat({ color: 0x8b9096, roughness: 0.62, metalness: 0.42, vertexColors: false }, texMetal),
    fencePost: mkMat({ color: 0xaaa69c, roughness: 0.95, vertexColors: false }, texConcrete),
    km: mkMat({ color: 0xe7e3d6, roughness: 0.9, vertexColors: false }, texConcrete),
    sw: mkMat({ color: 0x8c9198, roughness: 0.5, metalness: 0.55, vertexColors: false }, texMetal),
    wire: new THREE.LineBasicMaterial({ color: 0x4a5058, transparent: true, opacity: 0.72 }),
  };

  const grey = (v) => [v, v, v];
  const A = { runOff: 0, otherLat: 0, isLane: false, layerConnection: true, dir: DIRECTION.FORWARD };
  const centerLat = (smp) => -(A.runOff + (smp.laneOffset || 0));
  const linkLat = (smp) => -(smp.laneOffset || 0);
  const mainLat = () => 0;
  const otherLat = () => A.otherLat;

  // 三「股」：当前运行线、对向正线、到发线导曲线（main 时隐藏）。
  function trackStrands() {
    const railStrands = [], bedStrands = [];
    const hg = RAIL.railHalf;
    const sh = DIM.slabHalf, bh = DIM.baseHalf;
    const lanes = [
      { lat: mainLat, hide: null },
      { lat: otherLat, hide: null },
      { lat: linkLat, hide: (api) => !api.isLane || !api.layerConnection },
    ];
    for (const lane of lanes) {
      for (const s of [-1, 1]) {
        railStrands.push({
          section: railSection(s * hg), closed: true, lateral: lane.lat, color: grey(0.9),
          uvScale: 0.12, uvV: 0.6, dynamicColor: railColor, hide: lane.hide,
        });
      }
      if (lane.lat === linkLat) {
        // 到发线/导曲线：有砟梯形道床 + Ⅲ型混凝土枕（lead 补发：枕木只出现在站场
        // 到发线）。与正线 CRTSⅢ 板式道床并排出现 = 「进站前道床质感突变」强写实信号。
        // 顶宽 3.6、厚 0.36、边坡 1:1.75（资料 3）；0.6 m 枕距由贴图纵向周期(uvV=0.6)表现。
        const ballTop = -0.25, ballBot = -0.61;
        bedStrands.push({
          section: [[-1.8, ballTop], [1.8, ballTop], [3.6, ballBot], [-3.6, ballBot]],
          closed: true, lateral: lane.lat, color: [0.5, 0.47, 0.42], uvScale: 1.2, uvV: 1.5, hide: lane.hide,
        });
        bedStrands.push({ // 枕木带（2.6 m Ⅲ型枕，0.6 m 间距）
          section: [[-1.3, ballTop + 0.01], [1.3, ballTop + 0.01]],
          closed: false, lateral: lane.lat, color: [0.42, 0.38, 0.33], uvScale: 0.6, uvV: 0.6, hide: lane.hide,
        });
      } else {
        // 正线 CRTSⅢ 层状断面：底座(宽 2.9) → 自密实层/轨道板(宽 2.5) → 板顶面(扣件/板缝贴图)
        bedStrands.push({ // 钢筋混凝土底座（桥上 2900，资料 4/lead）
          section: [[-bh, DIM.sccBotY], [bh, DIM.sccBotY], [bh, DIM.baseBotY], [-bh, DIM.baseBotY]],
          closed: true, lateral: lane.lat, color: [0.5, 0.51, 0.53], uvScale: 1.4, uvV: 2.0, hide: lane.hide,
        });
        bedStrands.push({ // 自密实混凝土填充层（C40，厚 100 示意压到 0.09）
          section: [[-sh, DIM.slabBotY], [sh, DIM.slabBotY], [sh, DIM.sccBotY], [-sh, DIM.sccBotY]],
          closed: true, lateral: lane.lat, color: [0.65, 0.65, 0.63], uvScale: 1.2, uvV: 2.0, hide: lane.hide,
        });
        bedStrands.push({ // 预制有挡肩轨道板（P5600，宽 2.5）
          section: [[-sh, DIM.slabTopY], [sh, DIM.slabTopY], [sh, DIM.slabBotY], [-sh, DIM.slabBotY]],
          closed: true, lateral: lane.lat, color: [0.79, 0.8, 0.79], uvScale: 1.2, uvV: 2.0, hide: lane.hide,
        });
        bedStrands.push({ // 轨道板顶面：承轨台/扣件/70mm 板缝由贴图纵向周期表现（uvV=5.6）
          section: [[-sh, DIM.slabTopY + 0.003], [sh, DIM.slabTopY + 0.003]],
          closed: false, lateral: lane.lat, color: [0.86, 0.86, 0.84], uvScale: 1.0, uvV: DIM.slabLen,
          hide: lane.hide,
        });
      }
    }
    return { railStrands, bedStrands };
  }

  // 路堤边坡 + 截水沟（双侧，默认关闭，由 terrain.js 地面层统一放样）。
  function earthStrands() {
    const out = [];
    const sh = DIM.subgradeHalf, drop = DIM.drainDrop;
    const run = drop * DIM.subgradeSlope, dw = DIM.drainWidth;
    for (const side of [-1, 1]) {
      out.push({
        section: [
          [side * sh, -0.34], [side * (sh + run), -0.34 - drop],
          [side * (sh + run + dw), -0.34 - drop], [side * (sh + run + dw + 0.5), -0.34 - drop * 0.4],
        ],
        closed: false, lateral: centerLat, color: [0.42, 0.45, 0.34], uvScale: 3.0,
      });
    }
    return out;
  }

  // 防护栅栏（资料 6）：竖直网片 + 顶部 30° 外折防爬 + 0.5 m 刺丝滚笼带。
  // 竖直面用 uvFromHeight（截面高度作 U），贴图画金属网孔；半透明不堵视野。
  function fenceStrands() {
    const out = [];
    const top = RAIL.fenceHeight - 0.3; // 1.9：从路基面 -0.3 起高 2.2 m
    for (const side of [-1, 1]) {
      const lat = (smp) => centerLat(smp) + side * RAIL.fenceOffset;
      out.push({ // 金属网片主面（网孔 75×150 示意）
        section: [[0, -0.3], [0, top - 0.3]], closed: false, lateral: lat,
        color: [0.6, 0.66, 0.7], uvScale: 0.35, uvV: 0.6, uvFromHeight: true,
      });
      out.push({ // 30° 外折防爬段（朝线路外侧折）
        section: [[0, top - 0.3], [side * DIM.fenceFold, top]], closed: false, lateral: lat,
        color: [0.55, 0.6, 0.64], uvScale: 0.35, uvV: 0.6, uvFromHeight: true,
      });
      out.push({ // 刺丝滚笼带（+0.5 m，贴图螺旋/刀刺纹示意）
        section: [[0, top], [side * 0.06, top + DIM.fenceRollH]], closed: false, lateral: lat,
        color: [0.5, 0.54, 0.58], uvScale: 0.25, uvV: 1.0, uvFromHeight: true,
      });
    }
    return out;
  }

  // 声屏障 / 护栏（城区才显示，资料 6）：下部穿孔金属吸声板 + 上部透明隔声板，
  // 整体半透明（不是一整块不透明灰板），H 型钢立柱由贴图竖向暗条 + uvV 分段表现。
  function barrierStrands() {
    const out = [];
    const top = -0.3 + DIM.barrierHeight;
    for (const side of [-1, 1]) {
      const lat = (smp) => centerLat(smp) + side * DIM.barrierOffset;
      out.push({ // 金属穿孔吸声板（下段）
        section: [[0, -0.3], [0, 1.1]], closed: false, lateral: lat,
        color: [0.62, 0.68, 0.72], uvScale: 0.4, uvV: DIM.barrierPostSpacing, uvFromHeight: true,
      });
      out.push({ // 透明隔声板（上段，透光率≥80% → 更亮更淡）
        section: [[0, 1.1], [0, top]], closed: false, lateral: lat,
        color: [0.86, 0.9, 0.94], uvScale: 0.4, uvV: DIM.barrierPostSpacing, uvFromHeight: true,
      });
      out.push({ // 内侧矮护栏
        section: [[0, -0.3], [0, 0.9]], closed: false,
        lateral: (smp) => centerLat(smp) + side * (DIM.barrierOffset - 0.6),
        color: [0.7, 0.72, 0.72], uvScale: 0.5, uvV: 1.0, uvFromHeight: true,
      });
    }
    return out;
  }

  const { railStrands, bedStrands } = trackStrands();
  // stride=2：钢轨/道床沿 z 变化慢，每 40 m 一个采样点即可，把省下的一半面给
  // 8 顶点工字形断面与 CRTSⅢ 四层；平整度由 sampleLocal 精确插值保证。
  const rails = new RibbonBatch(railStrands, mats.rail, 2);
  const bed = new RibbonBatch(bedStrands, mats.bed, 2);
  const earth = new RibbonBatch(earthStrands(), mats.earth, 2);
  const fence = new RibbonBatch(fenceStrands(), mats.fence, 2);
  const barrier = new RibbonBatch(barrierStrands(), mats.barrier, 2);

  // ---- 重复物 InstancedMesh ----
  const details = new InstanceLayer(detailGeometry(), mats.detail, 240, 'track-details');
  const masts = new InstanceLayer(mastGeometry(), mats.mast, 120, 'track-masts');
  const fencePosts = new InstanceLayer(
    (() => {
      const h = RAIL.fenceHeight;
      return mergeGeometries([
        box(DIM.fencePostSize, h, DIM.fencePostSize, 0, -0.3 + h / 2, 0), // C30 立柱 180×180
        box(0.26, 0.15, 0.26, 0, RAIL.fenceHeight - 0.3, 0),            // 柱帽 180×180×150
      ]);
    })(),
    mats.fencePost, 400, 'track-fence-posts',
  );
  const kmPosts = new InstanceLayer(
    // 白底黑字公里/半公里标：底边距轨面 3.0 m（由实例矩阵 h=kmSignY 抬升），
    // 正反两面牌贴就近接触网柱；几何以「牌底 y=0」为原点，缩放只改尺寸不改底边高度。
    // 字高 90 mm / CPⅢ 350×200 为资料值，示意级用材质明暗区分、未做实际字形。
    mergeGeometries([
      box(0.5, 0.32, 0.06, 0, 0.16, 0.15),    // 正面牌
      box(0.5, 0.32, 0.06, 0, 0.16, -0.15),   // 背面牌
      box(0.06, 0.06, 0.36, 0, 0.02, 0),      // 与柱连接的箍
    ]),
    mats.km, 32, 'track-km-posts',
  );
  const switchInst = new InstanceLayer(switchGeometry(), mats.sw, 4, 'track-switches');

  // ---- 导线（LineSegments，不算三角面，1 draw call） ----
  // 实际用量：2 股道 × 200 段 × (接触线/承力索/回流线 3 + 吊弦 2 + 定位器 0.5) × 2
  // ≈ 4400 顶点；预分配 5600 留余量（验证脚本按整个数组 /3 计面，别浪费预算）。
  const WIRE_MAX = 5600;
  const wirePos = new Float32Array(WIRE_MAX * 3);
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.BufferAttribute(wirePos, 3));
  wireGeo.setDrawRange(0, 0);
  const wires = new THREE.LineSegments(wireGeo, mats.wire);
  wires.name = 'track-wires';
  wires.frustumCulled = false;

  group.add(
    rails.mesh, bed.mesh, earth.mesh, fence.mesh, barrier.mesh,
    details.mesh, masts.mesh, fencePosts.mesh, kmPosts.mesh, wires, switchInst.mesh,
  );

  // ---- 层开关 ----
  const layers = {};
  for (const k of Object.values(TRACK_LAYERS)) layers[k] = true;
  layers[TRACK_LAYERS.EARTHWORK] = false; // 边坡/截水沟由 terrain.js 统一放样，默认关避免重复穿模
  let barrierUrban = true;
  function applyLayers() {
    rails.mesh.visible = layers[TRACK_LAYERS.RAILS];
    bed.mesh.visible = layers[TRACK_LAYERS.BED];
    earth.mesh.visible = layers[TRACK_LAYERS.EARTHWORK];
    fence.mesh.visible = layers[TRACK_LAYERS.FENCE];
    fencePosts.mesh.visible = layers[TRACK_LAYERS.FENCE];
    barrier.mesh.visible = layers[TRACK_LAYERS.BARRIER] && barrierUrban;
    details.mesh.visible = layers[TRACK_LAYERS.SLEEPERS];
    masts.mesh.visible = layers[TRACK_LAYERS.CATENARY];
    wires.visible = layers[TRACK_LAYERS.WIRES];
    kmPosts.mesh.visible = layers[TRACK_LAYERS.KM_POSTS];
    switchInst.mesh.visible = layers[TRACK_LAYERS.SWITCHES];
    A.layerConnection = layers[TRACK_LAYERS.CONNECTION];
  }

  // ---- 重建状态（★ 锚点网格化） ----
  let buildS = NaN;       // 当前几何窗口锚定的里程 S0
  let lastDir = null, lastLane = null, forced = true;
  let samples = null, fromM = 0;

  /** 从 samples（相对锚点 S0）插值出「里程 c.s 处」的局部坐标。
   *  它是列车当前位置在 S0 局部系里的位移；group.position 取它的负值，就把
   *  当前列车位置拉回原点 —— 平移方向自带曲线/坡度，近处轨道永不错位。 */
  function trainLocalPos(s) {
    if (!samples) return [0, 0, 0];
    const t = clamp((s - fromM) / DIM.sampleStep, 0, SAMPLE_N - 1);
    const i = Math.min(SAMPLE_N - 2, Math.floor(t));
    const w = clamp(t - i, 0, 1);
    const a = samples[i].position, b = samples[i + 1].position;
    const x = a[0] + (b[0] - a[0]) * w;
    const y = a[1] + (b[1] - a[1]) * w;
    const z = a[2] + (b[2] - a[2]) * w;
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? [x, y, z] : [0, 0, 0];
  }

  function rebuild(anchorS) {
    const align = ctx.alignment;
    A.isLane = !!(ctx.lane && typeof ctx.lane === 'object');
    A.dir = ctx.dir;
    A.runOff = align.runningOffset(ctx.dir);
    A.otherLat = align.otherTrackLateral(ctx.dir);
    buildS = anchorS;
    lastDir = ctx.dir;
    lastLane = ctx.lane;
    fromM = anchorS - DIM.fromBehind;
    const toM = anchorS + DIM.toAhead;
    // ★ 用锚点 S0（而非当前 s）作局部原点，窗口形状固定，平移与重建边界连续。
    samples = align.sampleLocal(anchorS, fromM, toM, DIM.sampleStep, { dir: ctx.dir, lane: ctx.lane });
    while (samples.length < SAMPLE_N) samples.push(samples[samples.length - 1] || {
      position: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, -1], laneOffset: 0,
    });
    const api = A;
    rails.update(samples, api); bed.update(samples, api); earth.update(samples, api);
    fence.update(samples, api); barrier.update(samples, api);
    updateInstances(anchorS);
    updateWires();
    forced = false;
  }

  // 实例用的是插值帧对象 _fr，没有 laneOffset 字段，直接从 alignment 查。
  function laneOffsetAt(s) {
    if (!A.isLane) return 0;
    try { return ctx.alignment.laneOffset(s, ctx.lane) || 0; } catch (e) { return 0; }
  }

  function updateInstances(anchorS) {
    const step = DIM.sampleStep;
    const s = anchorS; // 窗口基准用锚点：每次重建窗口整体推进 GRID，与 group 平移一致

    // 1) CRTSⅢ 凸形挡台 / 承轨台 / 扣件座：近段按 5.6 m 板长网格，2 条正线。
    details.begin();
    const d0 = Math.floor((s - 20) / DIM.slabLen) * DIM.slabLen;
    for (let sk = d0; sk <= s + DIM.nearDetailM; sk += DIM.slabLen) {
      if (sk < fromM || sk > s + DIM.toAhead) continue;
      const fr = frameAtMileage(samples, fromM, step, sk);
      details.push(instanceMatrix(fr, 0, 0));
      details.push(instanceMatrix(fr, A.otherLat, 0));
    }
    details.end();

    // 2) 接触网支柱：双线外侧各一排，右侧一排绕竖轴翻 180° 让腕臂朝内。
    masts.begin();
    const ma0 = Math.floor((s - 100) / DIM.mastSpacing) * DIM.mastSpacing;
    for (let sk = ma0; sk <= s + DIM.nearMastM; sk += DIM.mastSpacing) {
      if (sk < fromM || sk > s + DIM.toAhead) continue;
      const fr = frameAtMileage(samples, fromM, step, sk);
      const cLat = -(A.runOff + laneOffsetAt(sk));
      masts.push(instanceMatrix(fr, cLat - DIM.mastOut, 0, 1, false));
      masts.push(instanceMatrix(fr, cLat + DIM.mastOut, 0, 1, true));
    }
    masts.end();

    // 3) 栅栏立柱：双侧，按 3.0 m 单元。
    fencePosts.begin();
    const fp0 = Math.floor((s - 60) / DIM.fencePanelLen) * DIM.fencePanelLen;
    for (let sk = fp0; sk <= s + DIM.nearFenceM; sk += DIM.fencePanelLen) {
      if (sk < fromM || sk > s + DIM.toAhead) continue;
      const fr = frameAtMileage(samples, fromM, step, sk);
      const cLat = -(A.runOff + laneOffsetAt(sk));
      fencePosts.push(instanceMatrix(fr, cLat - RAIL.fenceOffset, 0));
      fencePosts.push(instanceMatrix(fr, cLat + RAIL.fenceOffset, 0));
    }
    fencePosts.end();

    // 4) 公里标 / 半公里标 / 曲线标 / 坡度标（资料 7）：单侧（运行方向左侧）。
    // 整公里大、半公里小；曲率大处放曲线标(放大)；用 scale 区分，共用 1 个 InstancedMesh。
    kmPosts.begin();
    const km0 = Math.floor(fromM / DIM.kmSpacing) * DIM.kmSpacing;
    for (let sk = km0; sk <= s + DIM.toAhead; sk += DIM.kmSpacing) {
      if (sk < fromM) continue;
      const fr = frameAtMileage(samples, fromM, step, sk);
      const cLat = -(A.runOff + laneOffsetAt(sk));
      const isFull = Math.abs(sk % 1000) < 1e-6;
      let curv = 0;
      try { curv = Math.abs(ctx.alignment.curvatureAt(sk) || 0); } catch (e) { curv = 0; }
      const isCurve = curv > 1e-5;                 // 曲线标：设在曲线中部/大曲率处
      const scale = isCurve ? 1.18 : isFull ? 1 : 0.78;
      // 贴就近接触网柱（运行方向左侧柱线 ±mastOut），底边抬到 kmSignY=3.0 m。
      kmPosts.push(instanceMatrix(fr, cLat - DIM.mastOut, DIM.kmSignY, scale));
    }
    kmPosts.end();

    // 5) 道岔：lane 为对象时，在进/出岔点各放一组 18 号道岔实体。
    switchInst.begin();
    if (A.isLane && layers[TRACK_LAYERS.SWITCHES]) {
      const pts = ctx.alignment.switchPoints(ctx.lane) || [];
      for (const sw of pts) {
        if (sw.s < fromM || sw.s > s + DIM.toAhead) continue;
        const fr = frameAtMileage(samples, fromM, step, sw.s);
        switchInst.push(instanceMatrix(fr, -laneOffsetAt(sw.s), 0, 1, sw.kind === 'exit'));
      }
    }
    switchInst.end();
  }

  // 导线：2 条正线各画接触线(带之字拉出)、承力索(带弛度)、吊弦、定位器、回流线。
  // ★ 弛度/之字相位锚定「采样窗口」i*step，而非绝对里程：每次重建导线形状一致，
  //   平移态与重建态连续，不会在 10 m 边界突然变相位。写进预分配 LineSegments。
  function updateWires() {
    const P = wirePos;
    let n = 0;
    const step = DIM.sampleStep;
    const ch = DIM.contactWireH;          // 接触线 5300 mm
    const ms = DIM.mastSpacing;           // 49 m 跨距相位
    const seg = (q1, q2) => {
      if (n + 2 >= WIRE_MAX) return;
      let ok = true;
      for (const v of [q1[0], q1[1], q1[2], q2[0], q2[1], q2[2]]) if (!Number.isFinite(v)) { ok = false; break; }
      if (!ok) return;
      P[n * 3] = q1[0]; P[n * 3 + 1] = q1[1]; P[n * 3 + 2] = q1[2]; n += 1;
      P[n * 3] = q2[0]; P[n * 3 + 1] = q2[1]; P[n * 3 + 2] = q2[2]; n += 1;
    };
    const pt = (fr, lat, h) => [
      fr.p[0] + fr.r[0] * lat + fr.u[0] * h,
      fr.p[1] + fr.r[1] * lat + fr.u[1] * h,
      fr.p[2] + fr.r[2] * lat + fr.u[2] * h,
    ];
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
    for (const laneD of [0, A.otherLat]) {
      for (let i = 0; i < SAMPLE_N - 1; i += 1) {
        const a = samples[i], b = samples[i + 1];
        const phA = (i * step) % ms;
        const phB = ((i + 1) * step) % ms;
        const sagA = Math.sin(Math.PI * (phA / ms)) * DIM.wireSag;
        const sagB = Math.sin(Math.PI * (phB / ms)) * DIM.wireSag;
        const zzA = Math.sin((i * step / ms) * Math.PI) * DIM.pullOff;  // 之字拉出 ±200
        const zzB = Math.sin(((i + 1) * step / ms) * Math.PI) * DIM.pullOff;
        const frA = frameAtMileage(samples, fromM, step, a.s);
        const cA = pt(frA, laneD + zzA, ch);                                   // 接触线 5300
        const mA = pt(frA, laneD + zzA * 0.3, ch + DIM.messengerRise - sagA);  // 承力索 6900(结构高1600)
        const rA = pt(frA, laneD - DIM.mastOut, ch + DIM.returnWireRise);      // 回流线
        const frB = frameAtMileage(samples, fromM, step, b.s);
        const cB = pt(frB, laneD + zzB, ch);
        const mB = pt(frB, laneD + zzB * 0.3, ch + DIM.messengerRise - sagB);
        const rB = pt(frB, laneD - DIM.mastOut, ch + DIM.returnWireRise);
        seg(cA, cB);                     // 接触线
        seg(mA, mB);                     // 承力索
        seg(rA, rB);                     // 回流线
        seg(cA, mA);                     // 吊弦（段首）
        seg(mid(cA, cB), mid(mA, mB));   // 吊弦（段中）→ 20 m 段内两根 = 10 m 间距
        // 承力索-接触线净空 = 1600 - 弛度(≤450) ≥ 1150 mm ≥ 最短吊弦 600 mm。
        if (i % 2 === 0) seg(pt(frA, laneD - DIM.mastOut, ch + 0.3), cA);     // 定位器/防风拉线
      }
    }
    wireGeo.attributes.position.needsUpdate = true;
    wireGeo.setDrawRange(0, n);
  }

  // ---- System 接口（导出签名绝对不变） ----
  const system = {
    id: 'track',
    phase: SYSTEM_PHASE.TRACK,

    init(c) {
      if (c?.scene && !c.scene.getObjectByName('track-system')) c.scene.add(group);
      forced = true;
      applyLayers();
    },

    update(c) {
      barrierUrban = (c.chunks || []).some((ch) => ch.kind === 'urban' || ch.kind === 'hub');
      const wantBarrier = layers[TRACK_LAYERS.BARRIER] && barrierUrban;
      if (barrier.mesh.visible !== wantBarrier) barrier.mesh.visible = wantBarrier;
      // ★ 锚点网格：只有跨过 10 m 边界、或 dir/lane/forced 变化才重采样。
      const anchorS = Math.floor(c.s / DIM.rebuildMeters) * DIM.rebuildMeters;
      if (forced || !Number.isFinite(buildS)
          || c.dir !== lastDir || c.lane !== lastLane || anchorS !== buildS) {
        rebuild(anchorS);
      }
      // 两次重建之间零几何重算，只做「沿曲线精确插值」的整体平移。
      const tp = trainLocalPos(c.s);
      group.position.set(-tp[0], -tp[1], -tp[2]);
    },

    onEvent(type, payload) {
      if (type === EVENT.SWITCH) {
        forced = true;
        if (payload && 'lane' in payload) lastLane = undefined;
      } else if (type === EVENT.DIRECTION_CHANGE || type === EVENT.REVERSE) {
        forced = true; lastDir = undefined;
      } else if (type === EVENT.ROUTE_CHANGE) {
        forced = true;
      }
    },

    applyTheme(theme) {
      const night = theme === 'night' || (theme && theme.env && theme.env.zenith === '#050a14')
        || ctx.state?.theme === 'night';
      const dusk = theme === 'dusk' || ctx.state?.theme === 'dusk';
      const tint = night ? 0x707a88 : dusk ? 0x9a8f86 : 0xffffff;
      mats.bed.color.setHex(tint);
      mats.earth.color.setHex(night ? 0x59606a : dusk ? 0x8b8574 : 0xffffff);
      mats.fence.color.setHex(night ? 0x8892a0 : 0xffffff);
      mats.barrier.color.setHex(night ? 0x7e8896 : 0xffffff);
      mats.rail.emissive.setHex(night ? 0x0d1116 : 0x000000);
      mats.wire.color.setHex(night ? 0x8892a0 : 0x4a5058);
    },

    setLayer(name, on) {
      if (!(name in layers)) return false;
      layers[name] = Boolean(on);
      applyLayers();
      if (name === TRACK_LAYERS.CONNECTION) forced = true;
      return true;
    },
    get layers() { return { ...layers }; },
    get group() { return group; },

    dispose() {
      ACTIVE.delete(system);
      if (ctx?.scene) ctx.scene.remove(group);
      rails.dispose(); bed.dispose(); earth.dispose(); fence.dispose(); barrier.dispose();
      details.dispose(); masts.dispose(); fencePosts.dispose(); kmPosts.dispose(); switchInst.dispose();
      wireGeo.dispose();
      for (const m of Object.values(mats)) m.dispose();
      if (texConcrete) texConcrete.dispose();
      if (texMetal) texMetal.dispose();
      group.clear();
    },
  };
  ACTIVE.add(system);
  applyLayers();
  return system;
}

/** 一次性销毁所有活跃的轨道系统（供换线路 / 整体卸载时调用）。 */
export function disposeTracks() {
  for (const sys of Array.from(ACTIVE)) sys.dispose?.();
  ACTIVE.clear();
}

export default createTrackSystem;

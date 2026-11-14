/**
 * station-layouts.js —— 真实站场布置的「纯数据 + 纯函数」层。
 *
 * 大白话：这里只放「有几座站台、几条股道、站台多长多宽、站房多大、道岔在哪、
 *         停车区间怎么划」这些**数字和文字**，一根线、一个方块都不画。
 *         stations.js 负责按这些数字摆几何，framework.js 负责把 stopZones
 *         变成 StopZone 再交给 core.evaluateStop 判开门。三层各干各的。
 *
 * 【本文件的红线】零 import THREE、零 DOM、零 fetch。唯一 import 是 core.js 的
 * RAIL / LANE（core.js 是纯 JS 契约层，不碰 three / DOM，Node 里能直接跑）。
 * 外观是程序化示意级复刻，不用第三方图片 / 模型素材，运行时不加载任何静态资产。
 *
 * 【单位】长度一律米（m），面积平方米（㎡），1 Three 单位 = 现实 1 米。
 * 里程 s 用米、route.nodes[].km 用公里（见 core.js / config.js）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 一、联网核实汇总（标题 + URL + 关键数字，逐条 sources 见每条 layout 的 sources[]）
 * ═══════════════════════════════════════════════════════════════════════════
 * 车站规模（站台数 / 股道数 / 站台有效长 / 站房建筑面积）：
 *  - 哈尔滨站   8台16线 / 站房 73624㎡   —— 央广网 2018-12-25 通稿、人民日报客户端鲁班奖报道
 *  - 哈尔滨西  10台22线 / 站房 ~7万㎡    —— 百度百科信息栏「10台22线」；东北网 2016「18座站台(面)22条到发线」
 *  - 哈尔滨北   6台10线 / 站房 9967㎡    —— 百度百科；维基「到发线有效长 650m」
 *  - 哈尔滨东   3台12线 / 老站舍 8500㎡  —— 百度百科；Wikiwand「到发场 12 股道、3 座旅客站台」
 *  - 齐齐哈尔南 9台14线 / 站房 29957㎡   —— 百度百科；微信「单个站台长 450 米」
 *  - 牡丹江    14台17线 / 站房 29515㎡   —— 央广网、牡丹江市政府（到发线 14 条）
 *  - 佳木斯     7台14线 / 站房 33866㎡   —— Wikiwand（正线5+到发线9）、快懂百科
 *  - 大庆西     8台13线 / 站房 5万㎡     —— 百度百科；维基按物理台作 5台13线
 *  - 绥芬河     3台7线  / 站房 21659㎡   —— 百度百科「3台5台面7线」；维基口岸南北场共 84 线
 *  - 满洲里     2台3线  / 站房 ~3万㎡    —— 维基「2座旅客站台、3条到发线」；全站 151准轨+114宽轨
 *  - 长春       9台16线 / 站房 100694㎡  —— 百度百科（南50162+北50532）
 *  - 长春西     5台11线 / 站房 61456㎡   —— 百度百科
 *  - 沈阳北     8台16线 / 站房 12.11万㎡ —— 百度百科；沈阳局沈白报道作 15.1万㎡
 *  - 大连北    10台20线 / 站房 68512㎡   —— 大连文明网、维基（雨棚 73734㎡）
 *
 * 通用工程数字（把 core.RAIL 里的常量坐实）：
 *  - 站台有效长 450 m —— 国铁集团/广东省《新建广州至湛江高铁初步设计批复》(铁鉴函〔2020〕192号)
 *    「办理客运作业的中间站，旅客站台长按 450 米」；16 辆长编动车组最大长约 428 m
 *    + 前后各 10 m 停车余量 = 450 m（澎湃/今日头条科普、《高速铁路设计规范》）。
 *  - 岛式中间站台宽 12 m、侧式站台宽 8 m、站台高 1.25 m —— 同上广湛高铁批复。
 *  - 8 辆短编：列车全长约 209 m（中车 CR300AF 209 m / CR300BF 208.95 m / CRH3 200 m），
 *    对应站台有效长多为 220 m（今日头条科普口径）。任务里提到的「8 辆约 230 m」
 *    未查到官方出处，按 220 m / 209 m 记录，不采用 230。
 *  - 到发线 / 正线线间距 —— 《高速铁路设计规范(试行)》TB10621-2009 表 5.2.4：
 *    350 km/h→5.0 m、300→4.8 m、250→4.6 m；车站线间距表 3.1.2「站内正线与相邻
 *    到发线间无列检/上水/卸污作业 5000 mm」。core.RAIL.trackCenters=5.0 即此口径。
 *  - 18 号道岔 —— 广湛批复「接发旅客列车进路上的道岔采用 18 号」；中国工程院
 *    《中国铁路高速道岔技术研究》表 1：侧向允许 80 km/h、全长 69.000 m、
 *    前长 31.729 m、后长 37.271 m、导曲线半径 R1100 m、辙叉角 3°10′47.4″。
 *    折返线 / 出入段线 / 综合维修段与车站衔接道岔用 12 号（同批复）。
 *  - 到发线有效长 650 m —— 哈北维基「到发线有效长度为 650m」；哈齐客专技术标准、
 *    沧州西动车运用所「存车线有效长均满足 650m」。
 *  - 动车段(所、场) —— 国家铁路局 2016 标准 4.0.4「出入段线不宜少于 2 条」「检修(查)
 *    库线不应少于 2 条」；表 4.0.5「检查库线间距 7.0~8.0 m、检修库线 8.0~12.0 m、
 *    存车线 4.6 m、整备线 6.0 m」。
 *
 * 车辆段 / 动车段：
 *  - 哈尔滨动车段：检修 A 库库长约 470 m（中国日报黑龙江 / 中新网 2023）；库内 408 顶灯
 *    +1152 平台灯+744 地沟灯、控制精确到「股道/列位/一二层/东西侧」；央广网 2024 提到
 *    「检修库 58 道 2 列位」；省内唯一高寒动车组检修基地、配属 104 组。
 *  - 三棵树机务段：1932 成立、中国最北客运机务段；「南侧向哈尔滨东站有 2 条股道接入」
 *    （维基，route-data.js 亦引用）；2015 初配属 186 台机车；整备库 / 扇形库 + 转盘。
 *  - 哈西动车运用所：哈尔滨西站内设 1 个动车所（BIGEMAP / route-data.js 文件头）。
 *  - 哈尔滨车辆段：全路管辖范围最大的货车车辆段，3 检修基地 / 5 站修 / 17 列检 /
 *    2 国境站 / 10 驻企交接场；2024 轮轴检修库迁建，房屋轴线 192×45 m、占地 8640㎡。
 *
 * 【哪些数字未核实 / 属示意，禁止当成官方标尺】
 *  ① 除「齐齐哈尔南 450m」外，各站**站台有效长**没有逐站官方标尺，统一按规范
 *     通用值 450 m 并注明；「哈尔滨北 650m」是到发线有效长，不是站台长。
 *  ② 除「哈尔滨北 650m」「齐齐哈尔南 450m」外，各站**逐条股道有效长**未核实，
 *     trackLengths 按到发线有效长 650 m 通用口径铺满，trackLengthBasis 已逐条标注
 *     「示意，非本站官方标尺」。
 *  ③ 哈尔滨西「18 座站台」是**站台面**数，不是物理站台数；站台数 / 站台面 / 侧式 /
 *     岛式在多家百科口径不一，note 里逐站辨析。
 *  ④ 三棵树机务段 / 哈西动车所 / 哈尔滨车辆段的**检修库股道数、段内股道总数**
 *     均未查到，DEPOT_LAYOUTS 里写 null 并进 unverified 清单，几何按规范「不少于 2 条」
 *     的通用值示意。
 *  ⑤ 满洲里「站房 3 万㎡」来自公众号报道，未获官方确认，note 标「待核」。
 *  ⑥ 「8 辆约 230 m」未查到官方出处，按 220 m / 209 m 记录。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 二、StopZone.s0 / s1 的口径（重要，和 framework.js 对齐）
 * ═══════════════════════════════════════════════════════════════════════════
 * core.js 的契约写得很清楚：StopZone.s0 / s1 是**线路绝对里程（米）**，
 * core.evaluateStop(train, zone, s, dir) 把每个车门换算成 doorMileage = s - dir*doorZ，
 * 要求最前、最后两个车门都落在 [s0, s1] 内才允许开门（需求 2）。
 *
 * 本文件是「与具体线路解耦的布局模板」：同一座站在不同线路上 km 不同（哈尔滨站在
 * 哈大高铁 7.366 km、滨洲铁路 0 km、哈齐高铁 7.366 km……），所以**不写死绝对里程**。
 *
 * 任务建议「s0/s1 先给站中心 0 的相对值、由集成层平移」。但当前 framework.js 的
 * zonesNear() 实际是：
 *      s0: z?.s0 ?? cs - len/2      s1: z?.s1 ?? cs + len/2      (cs = n.km*1000 站中心绝对里程)
 * 它**不平移**，而是「有就用、没有就按真实站中心 ± 有效长/2 兜底」。若这里直接写
 * 相对值（-225/225），会被当成绝对里程，evaluateStop 就会在里程 0 附近判定，
 * 直接破坏开门规则。
 *
 * 因此本文件的做法是：
 *   - stopZones[].s0 / s1 = null —— 用 `??` 触发 zonesNear 的兜底，得到**正确的绝对里程**；
 *   - stopZones[].relS0 / relS1 = 站中心为 0 的相对示意值（-L/2 / +L/2），把任务说的
 *     「相对口径」完整保留下来，供文档、HUD、以及将来集成层若加了平移逻辑时使用；
 *   - 另导出纯函数 stopZonesAt(layout, centerS)，可按任意站中心里程把相对值转成绝对
 *     StopZone，方便 pack 层或单测显式校准，不依赖 framework 是否改动。
 *
 * 「两端车门均未离开区间即可开关门」怎么落到 s0/s1 上：站台有效长 L 决定区间长度
 * [s0, s1]，列车中心停在站中心 cs 时，最前 / 最后车门分别落在 cs ± (L车/2 - 2.2) 附近；
 * 只要 L 比车门跨度宽、且列车没停歪，两个车门就都夹在 [cs-L/2, cs+L/2] 里。
 * 站场侧只负责把 platformLength 与 stopZones 的划分（trackIndex / platformIndex /
 * dwellSec）交给框架，**判定一律 core.evaluateStop，本文件与 stations.js 都不重新实现**。
 *
 * 三、switch.s 的口径：SwitchSpec.s 在 core typedef 里是「道岔中心里程（米）」，
 * 但本文件是线路无关的模板，故这里的 s 是**站中心为 0 的相对米**（与 stopZones 的
 * relS0/relS1 同一套坐标），length 用核实的 18 号道岔全长 69 m。运行时真正摆道岔、
 * 报进路用 alignment.switchPoints(lane) 生成的绝对里程；本数组只供 buildStationField
 * 摆示意岔尖、给 HUD 显示道岔编号 / 开向（entry / exit）。
 */

import { RAIL, LANE } from './core.js';

// ---------------------------------------------------------------- 共享尺寸 ----
// 全部取自 core.RAIL（已由上面的规范核实坐实），不在本文件另拍一套数字。
const L = RAIL.platformLength;        // 450 站台有效长
const W = RAIL.platformWidth;         // 12  岛式站台宽
const PH = RAIL.platformHeight;       // 1.25 站台面高（高出轨顶）
const TC = RAIL.trackCenters;         // 5.0 相邻股道中心距（350km/h 正线口径）
const EDGE = RAIL.platformEdge;       // 1.75 站台边缘到线路中心
const SWITCH_LEN = 69;                // 18 号道岔全长（核实，中国工程院表 1）
const ARRIVAL_EFF = 650;              // 到发线有效长通用值（核实，哈北 / 哈齐 / 动车所）

// ------------------------------------------------------------ 资料来源字符串 ----
// 每条 = 「标题 | URL | 关键数字」，逐条挂到 layout.sources[]，方便 HUD / 审查追溯。
const S = {
  // 车站
  harbinCnr: '央广网《哈尔滨站今天全面开通运营》 | https://www.cnr.cn/hlj/jdxw/20181225/t20181225_524460682.shtml | 2018 改造后 8台16线(2基本台+6中间台)、站房总建筑面积73624㎡、最高聚集15000人、111对列车',
  harbinLuban: '人民日报客户端《哈尔滨站改造工程获中国建设工程鲁班奖》 | https://www.peopleapp.com/article/rmh10182954/rmh10182954 | 8台16线、改造工程总面积165385.8㎡(含站台雨棚等,非站房)、最高聚集15000人',
  harbinCnr2: '央广网《百年老站的“复容”涅槃——探访哈尔滨火车站》 | https://news.cnr.cn/native/gd/20191016/t20191016_524818411.shtml | 站房总建筑面积73624㎡、8个站台16条到发线',
  harbinxiBaike: '百度百科《哈尔滨西站》 | https://baike.baidu.com/item/哈尔滨西站 | 信息栏「站台规模 10台22线(截至2019年2月)」；正文「18座站台、22条铁路到发线」；站房总建筑面积约7万㎡；设高速/普速2个站场和1个动车所',
  harbinxiDbw: '东北网/黑龙江日报《我国高寒地区第一座高铁车站 哈西站打开出省高铁大通道》 | https://heilongjiang.dbw.cn/system/2016/11/17/057443317.shtml | 总规模18座站台(面)22条到发线；东(高速)场12面14线、西(普速)场6面8线，东西场共用12/13站台；站房面积7万㎡',
  harbinxi360: '360百科《哈尔滨西站》 | https://baike.so.com/doc/30515206-32315229.html | 站台规模 10台22线；站房总面积6.99万㎡；另「客运综合交通枢纽建筑面积15万㎡」含地铁/广场配套,非站房本体',
  habeiBaike: '百度百科《哈尔滨北站》 | https://baike.baidu.com/item/哈尔滨北站/997775 | 站场规模 6台10线(截至2016年9月)、站房面积9967㎡、最高聚集3400人',
  habeiWiki: '维基百科《哈尔滨北站》(wiki2 镜像) | https://zh.wiki2.org/wiki/哈尔滨北站 | 4个物理站台/6个站台面、股道共10条(正线4+到发线6)；高速场与综合场各2台5线；到发线有效长度650m；旅客地道与天桥各宽12m',
  habeiGov: '哈尔滨市呼兰区人民政府《交通运输·邮政业》 | http://hulan.gov.cn/hebhlq/2016/201803/c01_921800.shtml | 哈北站站房面积9964㎡、6个站台、6条正线4条到发线(与维基口径有差异,仅列作对照)',
  hadongBaike: '百度百科《哈尔滨东站》 | https://wapbaike.baidu.com/view/399058.htm | 截至2016年10月站场规模 3台12线、候车大厅面积4000㎡、可容纳2000人',
  hadongWiki: 'Wikiwand《哈尔滨东站》 | https://www.wikiwand.com/zh-mo/articles/哈尔滨东站 | 到发场设12条股道(含2条编发)、3座旅客站台、10m宽出站地道+5.2m宽行包地道；编组场另12条股道；老客运站舍面积8500㎡；2016新建4000㎡高架候车室',
  qnnBaike: '百度百科《齐齐哈尔南站》 | https://baike.baidu.com/item/齐齐哈尔南站/5852770 | 站场规模 9台14线(2侧5岛)、建筑面积67962㎡其中站房规模29957㎡；高速场5个站台(1基本台+4岛式)、单个站台长450米',
  qnnWechat: '微信公众号《走近齐齐哈尔南站(中国最北高铁车站)》 | http://mp.weixin.qq.com/s?__biz=MzA3NDc4MDczMw==&mid=209554361&idx=2&sn=813adade70aa0a2abf74d6d51b54d497 | 站房建筑面积29957.47㎡、总建筑面积67962㎡、有站台柱雨棚26948㎡；设计总规模12台14线(高速场9台11线+预留普速场3台3线)；单个站台长450米；旅客地道长108m全宽18m',
  qnnWiki: 'Wikiwand《齐齐哈尔南站》 | https://www.wikiwand.com/zh-hans/articles/齐齐哈尔南站 | 设计规模7台14线(高速场5台11线+预留普速场2台3线)、建筑面积67962㎡其中站房29957㎡',
  mdjCnr: '央广网《我国“八纵八横”最北“一横”枢纽站牡丹江新站竣工》 | https://www.cnr.cn/hlj/htpxw/20181206/t20181206_524442322.shtml | 建筑面积29515㎡、高33.5m；侧式站房+高架站房(13830㎡,横跨8个站台)；新建站场14站台17条线路,其中旅客列车到发线14条',
  mdjGov: '牡丹江市人民政府《牡丹江新站昨日正式竣工》 | https://www.mdj.gov.cn/mdjsrmzf/c100014/201812/52747.shtml | 建筑面积29515㎡、高架站房13830㎡横跨8个站台、14站台17线、到发线14条',
  mdjBaike: '百度百科《牡丹江站》 | https://baike.baidu.com/view/1877311.htm | 站房总面积2.9535万㎡、站台风雨棚投影36965.62㎡；高速场4台7线、普速场4台10线(含2货车正线+1走行线)；1~17道,11~17道为高铁',
  jmsWiki: 'Wikiwand《佳木斯站》 | https://www.wikiwand.com/zh-tw/articles/佳木斯站 | 2018完工站房总建筑面积33866㎡(北站房6885+南站房8598+高架候车厅15843+出站综合楼2540)；7台14线,其中正线5条、到发线9条',
  jmsBaike: '快懂百科《佳木斯站》 | https://baike.com/wikiid/5591506510073522974 | 截至2019年1月建筑面积38181.49㎡、设置7台14线、设计日发送16000人次',
  dqxWiki: '维基百科《大庆西站》(fbrowser 镜像) | https://www.fbrowser.org/wikipedia/zh/大庆西站 | 总规模5台13线(1-3站台普速场、4-8高速场；普速场2台6线、高速场3台7线)、股道1-13编号；站房面积5万㎡、无柱雨棚5万㎡、南广场10万㎡北广场7万㎡',
  dqxBaike: '百度百科《大庆西站》 | https://wapbaike.baidu.com/view/4246269.htm | 截至2017年5月站内共设 8台13线、站房面积5万㎡、年发送旅客1000万人次',
  sfhBaike: '百度百科《绥芬河站》 | https://baike.baidu.com/item/绥芬河站/10956994 | 截至2022年12月站台规模 3台5台面7线；截至2017年9月总建筑面积21659㎡、高56.385m、长180m、最大跨度59m',
  sfhWiki: '维基百科《绥芬河站》(fbrowser 镜像) | https://www.fbrowser.org/wikipedia/zh/绥芬河站 | 新站房总建筑面积19699.34㎡；北场线路44条(宽轨14+准轨30)、南场线路40条(宽轨27+准轨13)；1~5站台(1/2侧式,3/4/5岛式)',
  sfhPort: '中国口岸协会《绥芬河陆路(铁路)口岸》 | https://www.caop.org.cn/kaifangkouan/yunshufangshi/tielukouan/2019-02-19/126.html | 南站场线路40条、北站场线路44条；国内/国际旅客站台各1个总面积4451㎡；国际客运联检大楼2800㎡',
  mzlWiki: 'Wikiwand《满洲里站》 | https://www.wikiwand.com/zh-cn/articles/满洲里站 | 混合式国境换装站：151条准轨线路+114条俄式宽轨线路；客运设施设2座旅客站台和3条到发线(1-3道)；国内候车室4417㎡、国际候车室2586㎡',
  mzlWechat: '微信公众号《东亚之窗,K1302是满洲里站始发》 | http://mp.weixin.qq.com/s?__biz=Mzk2ODAxNDU5Ng==&mid=2247486038&idx=1&sn=4af25b49eccfa995cd355b779191f9a8 | 站房总建筑面积3万㎡、日发送1500人次；1侧式站台+1岛式站台、总规模2台39线(含货运/调车线)；滨洲铁路2正线+6到发线',
  ccBaike: '百度百科《长春站》 | https://wapbaike.baidu.com/view/2973932.htm | 截至2020年7月设 9台16线、建筑面积100694㎡；南站房50162㎡、北站房50532㎡',
  ccHub: '今日头条《长春铁路枢纽现状与未来发展分析》 | https://m.toutiao.com/article/7688981446437945896 | 长春站 9台16线(1-8道普速场、9-16道高速场)、总建筑面积约16.7万㎡；长春西站 5台11线、站房约6.15万㎡',
  ccxBaike: '百度百科《长春西站》 | https://baike.baidu.com/view/684855.htm | 截至2018年10月设 5台11线、站房总面积61456㎡、日均发送4.8万人次',
  sybBaike: '百度百科《沈阳北站》 | https://baike.baidu.com/item/沈阳北站/7255217 | 截至2026年车场规模 8台16线；截至2015年7月总建筑面积12.11万㎡(高架候车厅3.2万、南广场6.4万、北广场2.51万)',
  sybRail: '沈阳铁路局《沈白高铁即将开通!沿着这条线,开启绝美东北游》 | https://www.sytlj.com/articleDesc.html?typeId=4&artId=0636fcd928909422468c8eb396bb4d97 | 沈阳北站站房总建筑面积达15.1万㎡、站场规模 8台16线(沈白高铁改造后口径)',
  sybSogou: '搜狗百科《沈阳北站》 | https://baike.sogou.com/v41390.htm | 建筑面积12.11万㎡；截至2021年1月车场规模 8台16线(信息栏旧作8台14线)',
  dlWenming: '大连文明网《大连北站完工静候高铁开通》 | http://dl.wenming.cn/06/73/201209/t20120905_4467240.htm | 设计规模 10台20线(1-5普速场、6-13哈大高铁场、14-20丹大城际场)；站房建筑面积6.85万㎡、风雨棚7.4万㎡、站台6.3万㎡；站房横跨铁路292m、顺铁路宽168m、高33m',
  dlWiki: '维基百科《大连北站》(voda 镜像) | https://voda-reg15.ru/wikipedia/w/index.php?oldid=71412662&title=大连北站 | 建筑面积68512㎡、无站台柱雨棚73734㎡；10站台20线；全长6.45km(含动车运用所)、占地115公顷',
  // 通用规范 / 工程数字
  specZhan: '国铁集团 广东省人民政府《新建广州至湛江高速铁路初步设计的批复》(铁鉴函〔2020〕192号) | https://www.gdwc.gov.cn/zjwcfgw/attachment/0/179/179350/1718186.pdf | 旅客站台长按450米、岛式中间站台宽12米、侧式站台宽8米、站台高1.25米；接发旅客列车进路道岔采用18号、出入段线用12号；动车运用所新建2条出入段线',
  specPengpai: '澎湃新闻《科普|人从众!动车组再多来几节车厢可以么?》 | https://www.thepaper.cn/newsDetail_forward_23181336 | 16辆编组复兴号Plus 414米；《高速铁路设计规范》规定高铁车站旅客站台按450米设置；17辆 CR400AF-B/BF-B 车身长440米',
  specToutiao: '今日头条《火车站站台到底有多长?》 | https://www.toutiao.com/article/6826153798361154055/ | 16辆长编列车最大长428m+前后各10m余量→站台450m；8辆短编列车最大长214m→站台220m；城际8辆站台220m',
  specCrrc: '中国中车《我国新型“复兴号”CR300AF动车组开跑贵州》 | https://www.crrcgc.cc/sfgf/2021-01/28/article_E3D345161EFA41DAB4ECAA77F2E1A2DE.html | CR300AF 8节编组全长209米、4动4拖；另 CRH3(中车)8辆编组列车总长200m、CR300BF(人民日报)208.95m',
  specSpacing: '《高速铁路设计规范(试行)》TB10621-2009(工程建设标准强制性条文 铁道工程部分 2013版) | http://meetyou-api-new.oss-cn-beijing.aliyuncs.com/2023-04/28/工程建设标准强制性条文 铁道工程部分2013年版.pdf | 表5.2.4 正线线间距:350km/h→5.0m、300→4.8m、250→4.6m；正线与动车组走行线并行最小不小于5.0m',
  specYardGap: '国家铁路局 铁道行业标准公告(工程建设标准 2017年第7批) 车站线间距表3.1.2 | https://biaozhun.tdpress.com/front/getFileImage?id=331857e9613640f699369deb14c653d3 | 站内正线与相邻到发线间(无列检/上水/卸污)5000mm；到发线间一般5000~6500mm；动车组存车线间4600mm；检查/整备线间6000~7000mm',
  specSwitch: '中国工程院《中国铁路高速道岔技术研究》表1 | https://www.engineering.org.cn/sscae/CN/PDF/1160099903294726535 | 18号道岔:直向250/350km/h、侧向80km/h、全长69.000m、前长31.729m、后长37.271m、单圆曲线R1100m；42号侧向160km/h全长157.2m',
  specDepot: '国家铁路局 铁道行业标准公告(工程建设标准 2016年第5批)《动车段(所、场)》4.0.3~4.0.5 | https://biaozhun.tdpress.com/front/getFileImage?id=2e2aa0ca96cb4d679ea414b0f9d99099 | 出入段线不宜少于2条、检修(查)库线不应少于2条；表4.0.5 检查库线间距7.0~8.0m、检修库线8.0~12.0m、存车线4.6m、整备线6.0m',
  specCangzhou: '百度百科《沧州西动车运用所》 | https://baike.baidu.com/item/沧州西动车运用所/23287994 | 设动车出入段线2条、近期存车线12条(有效长均满足650m)、检查库线4条；石衡沧港城际到发线有效长650m',
  // 车辆段 / 动车段
  emuDaily: '中国日报网黑龙江《最北高寒高铁4S店:“科技芯”守安全》 | https://hlj.chinadaily.com.cn/a/202310/06/WS651fc9d5a310936092f24bd9.html | 哈尔滨动车段既有检修A库库长约470米；库内408个大库顶灯+1152个平台灯+744个地沟灯；省内唯一高寒动车组检修基地、负责104组高寒动车组一二级检修',
  emuCnr: '央广网《“动车组模块通用多功能车”助力春运》 | https://www.cnr.cn/hlj/hljyw/20240229/t20240229_526612731.shtml | 哈尔滨动车段检修库「58道2列位」(股道编号,非股道总数)；2012年起承担高寒动车组维修',
  emuNews: '中新网黑龙江《提效、节能,这个单位职工作业满满科技感》 | https://www.hlj.chinanews.com/hljnews/2023/0922/126539.html | 哈尔滨动车段检修A库库长约470米、照明控制可精确到股道/列位/一二层/东西侧(印证库内多层检修)',
  locoWiki: '维基百科《三棵树机务段》(wikizero / wikiwand 镜像) | https://www.wikizero.org/wiki/zh/哈局三段 | 1932年成立、中国最北客运机务段；段机关在三棵树线与滨北线之间,南侧向哈尔滨东站有2条股道接入；2015初配属186台机车(DF11/DF11G/DF4D/DF5)；动车车间位于哈西站西广场',
  haxiBigemap: 'BIGEMAP《哈尔滨西站》(route-data.js 文件头亦引用) | http://www.bigemap.net/city-8978.html | 哈尔滨西站内设高速/普速2个站场和1个动车所(哈西动车运用所)；东北距哈尔滨站8公里',
  wagonBaike: '百度百科《中国铁路哈尔滨局集团有限公司哈尔滨车辆段》 | https://baike.baidu.com/item/哈尔滨车辆段/23996780 | 全路管辖范围最大、生产布局站点最多的货车车辆段；3个检修基地/5个站修/17个列检/2个国境站/10个驻企交接场；2024轮轴检修库迁建,房屋轴线192×45米、占地8640㎡',
};

// ---------------------------------------------------------------- 纯工具函数 ----
/** 归一化：去空白/分隔符/「站」后缀、转小写，让电报码/拼音/中文名都能对上。 */
function norm(v) {
  return String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s·・._-]/g, '')
    .replace(/站$/u, '');
}

/**
 * 生成岛式 / 侧式站台序列（示意级）：
 *  - cfg.platformKinds 显式给了就用（核实的站如「2侧5岛」）；
 *  - 否则首尾侧式、中间岛式；只有 1 座时全侧式。
 */
function platformKindsFor(count, explicit) {
  if (Array.isArray(explicit) && explicit.length) {
    const arr = explicit.slice(0, count).map((k) => (k === 'side' ? 'side' : 'island'));
    while (arr.length < count) arr.push('island');
    return arr;
  }
  return Array.from({ length: count }, (_, i) =>
    (count <= 1 || i === 0 || i === count - 1 ? 'side' : 'island'));
}

/**
 * 由「核实到的核心数字」补全一条 StationLayout 的派生字段。纯函数、无副作用。
 * 派生：mainTracks / trackLengths / switches / stopZones / platformKinds。
 * 注意 s0/s1 = null 的原因见文件头「二、StopZone.s0/s1 的口径」。
 */
function defineLayout(cfg) {
  const platformCount = cfg.platformCount;
  const trackCount = cfg.trackCount;
  const platformLength = cfg.platformLength ?? L;
  const platformWidth = cfg.platformWidth ?? W;
  const id = cfg.id;

  // 正线股道序号（0-based，0 = 正线，见 core.StopZone typedef）。默认取中间两条。
  const mid = Math.floor(trackCount / 2);
  const mainTracks = cfg.mainTracks ?? [Math.max(0, mid - 1), mid];

  // 逐条股道有效长：优先显式数组 > 单一核实值 > 到发线有效长 650 m 通用示意值。
  let trackLengths;
  let trackLengthBasis;
  if (Array.isArray(cfg.trackLengths)) {
    trackLengths = cfg.trackLengths.slice(0, trackCount);
    while (trackLengths.length < trackCount) {
      trackLengths.push(trackLengths[trackLengths.length - 1] ?? ARRIVAL_EFF);
    }
    trackLengthBasis = cfg.trackLengthBasis ?? '按 sources 逐条/整体给出的有效长';
  } else if (Number.isFinite(cfg.trackLength)) {
    trackLengths = Array.from({ length: trackCount }, () => cfg.trackLength);
    trackLengthBasis = cfg.trackLengthBasis ?? `按核实到发线有效长 ${cfg.trackLength} m 铺满（示意，非逐股官方标尺）`;
  } else {
    trackLengths = Array.from({ length: trackCount }, () => ARRIVAL_EFF);
    trackLengthBasis = '未核实：按到发线有效长 650 m 通用口径示意（哈北/哈齐/沧州西动车所核实值），非本站官方逐股标尺';
  }

  // 进出站道岔：站中心为 0 的相对里程；18 号道岔全长 69 m（核实）。
  // 每组到发线咽喉摆一对 entry / exit，最多 6 组，避免大站数组过长。
  const half = platformLength / 2;
  const switches = [];
  const nSw = Math.min(trackCount, 6);
  for (let i = 0; i < nSw; i += 1) {
    const lateral = (i + 1) * TC;
    const off = half + 120 + i * SWITCH_LEN;
    switches.push({
      id: `${id}:sw-in-${i + 1}`, s: -off, from: LANE.MAIN,
      to: `${LANE.STATION}:${i + 1}`, lateral, kind: 'entry', length: SWITCH_LEN,
    });
    switches.push({
      id: `${id}:sw-out-${i + 1}`, s: off, from: `${LANE.STATION}:${i + 1}`,
      to: LANE.MAIN, lateral: -lateral, kind: 'exit', length: SWITCH_LEN,
    });
  }

  // 停车区间：每条到发线一个。s0/s1 = null 交给 framework.zonesNear 用真实站中心
  // 里程兜底成绝对里程；relS0/relS1 是站中心为 0 的相对示意值（见文件头口径说明）。
  const dwellSec = cfg.dwellSec ?? (cfg.tier === 1 ? 35 : 25);
  const stopZones = Array.from({ length: trackCount }, (_, i) => ({
    id: `${id}:z${i}`,
    stationId: id,
    trackIndex: i,                                   // 0 = 正线
    s0: null,
    s1: null,
    relS0: -half,
    relS1: half,
    platformIndex: Math.min(platformCount - 1, Math.floor((i * platformCount) / Math.max(1, trackCount))),
    length: platformLength,
    dwellSec,
  }));

  return {
    id,
    name: cfg.name,
    telecode: cfg.telecode ?? null,
    slug: cfg.slug ?? null,
    aliases: cfg.aliases ?? [],
    km: null,                                        // 由集成层按所属线路补，同一站多线 km 不同，不写死
    platformCount,
    trackCount,
    platformLength,
    platformWidth,
    platformHeight: PH,
    trackCenters: TC,
    platformEdge: EDGE,
    buildingArea: cfg.buildingArea ?? null,          // 站房建筑面积 ㎡，查不到 null
    platformKinds: platformKindsFor(platformCount, cfg.platformKinds),
    trackLengths,
    trackLengthBasis,
    mainTracks,
    switches,
    stopZones,
    tier: cfg.tier ?? 2,
    sources: cfg.sources ?? [],
    kmBasis: cfg.kmBasis ?? '里程不写死：由 route-data.js 的 Node.km 与 framework.zonesNear 按真实站中心生成绝对里程；规模数字来自 sources，逐站口径差异见 note。',
    note: cfg.note ?? '',
  };
}

// ═════════════════════════════════════════════════════════════════ 车站布局 ══
// 键 = 电报码（route-data.js 的 Node.stationId），这样 framework.zonesNear 的
// layouts[stationId] 能直接命中；个别无电报码的站（长春西）用中文名作键，让
// layouts[Node.name] 命中。layoutFor() 另外兼容电报码 / 拼音 slug / 中文名。
export const STATION_LAYOUTS = {
  // ---------------------------------------------------------------- 哈尔滨枢纽 ----
  HBB: defineLayout({
    id: 'HBB', name: '哈尔滨站', telecode: 'HBB', slug: 'harbin',
    aliases: ['哈尔滨', '哈站', 'harbin', 'Harbin'],
    platformCount: 8, trackCount: 16, tier: 1,
    buildingArea: 73624,
    platformLength: L, platformWidth: W,
    mainTracks: [7, 8],
    sources: [S.harbinCnr, S.harbinLuban, S.harbinCnr2, S.specZhan],
    note: '2018-12 改造后「8台16线」(2 座基本站台 + 6 座中间站台)，站房总建筑面积 73624㎡、最高聚集 15000 人；鲁班奖报道的「165385.8㎡」是含站台/雨棚/通廊的改造工程总面积，不是站房本体。个别百科条目作「8台14线」或哈齐客专表「9台16线/32671㎡」，口径不一，采用 2018 官方通稿。站台有效长按《高铁设计规范》450 m 通用值（本站实测未核实）；股道有效长未逐条核实，按 650 m 示意。',
  }),

  VAB: defineLayout({
    id: 'VAB', name: '哈尔滨西', telecode: 'VAB', slug: 'harbinxi',
    aliases: ['哈尔滨西站', '哈西站', '哈西', 'harbinxi', 'Harbinxi'],
    platformCount: 10, trackCount: 22, tier: 1,
    buildingArea: 70000,
    platformLength: L, platformWidth: W,
    mainTracks: [10, 11],
    platformKinds: ['side', 'island', 'island', 'island', 'island', 'island', 'island', 'island', 'island', 'side'],
    sources: [S.harbinxiBaike, S.harbinxiDbw, S.harbinxi360, S.specZhan],
    note: '【重点辨析】百科信息栏「10台22线」= 10 座物理站台 + 22 条到发线，是正确口径；东北网/黑龙江日报 2016 的「18 座站台 22 条到发线」里的 18 是**站台面**数（东高速场 12 面 14 线 + 西普速场 6 面 8 线），两场共用 12/13 站台，不能当成 18 座物理站台（stations.js v1 的「18台22线」即由此误读，已在本数据层纠正）。站房约 7 万㎡（6.99 万）；360 百科「客运综合枢纽 15 万㎡」含地铁/广场配套，非站房本体。站台有效长 450 m、股道有效长 650 m 均为通用示意，本站未逐条核实。',
  }),

  HTB: defineLayout({
    id: 'HTB', name: '哈尔滨北', telecode: 'HTB', slug: 'harbinbei',
    aliases: ['哈尔滨北站', '哈北站', '哈北', 'harbinbei'],
    platformCount: 6, trackCount: 10,
    buildingArea: 9967,
    platformLength: L, platformWidth: W,
    trackLength: 650,                                  // 核实：维基「到发线有效长度为 650m」
    trackLengthBasis: '核实：维基《哈尔滨北站》「到发线有效长度为 650m」；哈齐客专技术标准、沧州西动车运用所存车线亦为 650m。按此铺满 10 条股道（示意，非逐股标尺）。',
    mainTracks: [4, 5],
    sources: [S.habeiBaike, S.habeiWiki, S.habeiGov, S.specCangzhou],
    note: '百科「6台10线」、站房 9967㎡；维基按物理站台作「4 个站台 / 6 个站台面、股道共 10 条（正线 4 + 到发线 6）」，高速场与综合场各 2台5线；呼兰区政府作「6 台、6 正线 4 到发线」，口径差异已并列不取舍。**到发线有效长 650 m 为核实值**；旅客地道与天桥各宽 12 m（印证岛式站台宽 12 m 通用值）。站台有效长 450 m 为规范通用值，本站实测未核实。',
  }),

  VBB: defineLayout({
    id: 'VBB', name: '哈尔滨东', telecode: 'VBB', slug: 'harbindong',
    aliases: ['哈尔滨东站', '哈东站', '三棵树站', '三棵树', 'harbindong'],
    platformCount: 3, trackCount: 12,
    buildingArea: 8500,
    platformLength: L, platformWidth: W,
    mainTracks: [5, 6],
    sources: [S.hadongBaike, S.hadongWiki],
    note: '原名三棵树站。「3台12线」= 到发场 12 条股道（含 2 条编发）+ 3 座旅客站台；站台间 10 m 宽出站地道、5.2 m 宽行包地道。编组场另有 12 条股道、三棵树车辆段运用/停留线 34 条，均不计入本站 trackCount。站房面积用老客运站舍 8500㎡（Wikiwand），2016 改造另新建 4000㎡ 高架候车室、候车大厅 4000㎡（百度百科），口径不同不叠加。站台/股道有效长未核实，按 450/650 通用示意。',
  }),

  // ---------------------------------------------------------------- 哈齐高铁 ----
  QNB: defineLayout({
    id: 'QNB', name: '齐齐哈尔南', telecode: 'QNB', slug: 'qiqihaernan',
    aliases: ['齐齐哈尔南站', '齐南站', 'qiqihaernan'],
    platformCount: 9, trackCount: 14,
    buildingArea: 29957,
    platformLength: 450,                               // 核实：「单个站台长为 450 米」
    platformWidth: W,
    mainTracks: [5, 6],
    platformKinds: ['side', 'island', 'island', 'island', 'island', 'side', 'island', 'side', 'side'],
    sources: [S.qnnBaike, S.qnnWechat, S.qnnWiki, S.specZhan],
    note: '百科「9台14线(2侧5岛)」；高速场 5 个物理站台（1 基本台 + 4 岛式）共 9 个站台面，普速场预留 2台3线；另有「7台14线」「设计总规模 12台14线（含预留普速场）」口径，按已投运高速场 9台14线记录。**单个站台长 450 米为核实值**（微信/百度百科），正好印证 core.RAIL.platformLength 与广湛高铁批复。站房建筑面积 29957.47㎡、总建筑面积 67962㎡、有站台柱雨棚 26948㎡、旅客地道长 108 m 全宽 18 m。股道有效长未逐条核实，按 650 m 示意。',
  }),

  RHX: defineLayout({
    id: 'RHX', name: '大庆西', telecode: 'RHX', slug: 'daqingxi',
    aliases: ['大庆西站', '让湖路站', 'daqingxi'],
    platformCount: 8, trackCount: 13,
    buildingArea: 50000,
    platformLength: L, platformWidth: W,
    mainTracks: [6, 7],
    sources: [S.dqxBaike, S.dqxWiki, S.specZhan],
    note: '百科「8台13线」、站房 5 万㎡；维基按物理站台作「5台13线」（1-3 站台普速场 2台6线、4-8 高速场 3台7线），股道由西南向东北 1-13 编号，口径差异已并列。无站台柱雨棚 5 万㎡、南广场 10 万㎡、北广场 7 万㎡；哈齐高铁沿线唯一采用高架候车 + 无站台柱雨棚且全部高站台的车站。站台/股道有效长未核实，按 450/650 通用示意。',
  }),

  // ---------------------------------------------------------------- 哈牡 / 哈佳 ----
  MDB: defineLayout({
    id: 'MDB', name: '牡丹江', telecode: 'MDB', slug: 'mudanjiang',
    aliases: ['牡丹江站', 'mudanjiang'],
    platformCount: 14, trackCount: 17,
    buildingArea: 29515,
    platformLength: L, platformWidth: W,
    mainTracks: [8, 9],
    sources: [S.mdjCnr, S.mdjGov, S.mdjBaike],
    note: '「14站台17条线路，其中旅客列车到发线 14 条」（央广网/牡丹江市政府），与 stations.js v1 的「14台17线」一致。站房 29515㎡、高 33.5 m；侧式站房 + 高架站房 13830㎡ 横跨 8 个站台（球面网架屋面）。分场：高速场 4台7线、普速场 4台10线（含 2 货车正线 + 1 走行线），1~17 道中 11~17 道为高铁；站台风雨棚投影 36965.62㎡。站台/股道有效长未核实，按 450/650 通用示意。',
  }),

  JMB: defineLayout({
    id: 'JMB', name: '佳木斯', telecode: 'JMB', slug: 'jiamusi',
    aliases: ['佳木斯站', 'jiamusi'],
    platformCount: 7, trackCount: 14,
    buildingArea: 33866,
    platformLength: L, platformWidth: W,
    mainTracks: [6, 7],
    sources: [S.jmsWiki, S.jmsBaike],
    note: '「7台14线」，其中正线 5 条、到发线 9 条（维基）。站房总建筑面积 33866㎡（北站房改建 6885 + 南站房 8598 + 高架候车厅 15843 + 出站综合楼 2540），快懂百科另作 38181.49㎡（截至 2019），口径不同不取舍。2016 综合改造、2018 北站房随哈佳铁路开通。站台/股道有效长未核实，按 450/650 通用示意。',
  }),

  // ---------------------------------------------------------------- 口岸站 ----
  SFB: defineLayout({
    id: 'SFB', name: '绥芬河', telecode: 'SFB', slug: 'suifenhe',
    aliases: ['绥芬河站', 'suifenhe'],
    platformCount: 3, trackCount: 7,
    buildingArea: 21659,
    platformLength: L, platformWidth: W,
    mainTracks: [2, 3],
    platformKinds: ['side', 'island', 'island'],
    sources: [S.sfhBaike, S.sfhWiki, S.sfhPort],
    note: '百度百科「3台5台面7线」（2022）取 3 座物理站台 + 7 条客运线路；维基 1~5 站台中 1/2 侧式、3/4/5 岛式。新站房总建筑面积 21659㎡（维基作 19699.34㎡）、高 56.385 m、长 180 m、最大跨度 59 m。**口岸站**：北场 44 条线（宽轨 14 + 准轨 30）、南场 40 条线（宽轨 27 + 准轨 13），共 84 条含换装/调车线，不计入客运 trackCount；国内/国际旅客站台各 1 个共 4451㎡。站台/股道有效长未核实，按 450/650 通用示意。',
  }),

  MLX: defineLayout({
    id: 'MLX', name: '满洲里', telecode: 'MLX', slug: 'manzhouli',
    aliases: ['满洲里站', 'manzhouli'],
    platformCount: 2, trackCount: 3,
    buildingArea: 30000,                               // 公众号口径，note 标「待核」
    platformLength: L, platformWidth: W,
    mainTracks: [0, 1],
    platformKinds: ['side', 'island'],
    sources: [S.mzlWiki, S.mzlWechat],
    note: '客运设施「2 座旅客站台 + 3 条到发线」（1-3 道，维基），国内候车室 4417㎡、国际候车室 2586㎡。公众号作「站房总建筑面积 3 万㎡」「总规模 2台39线」（39 含货运/调车线），3 万㎡ 未获官方确认，**待核**。**混合式国境换装站**：全站 151 条准轨 + 114 条俄式宽轨 = 265 条线路、6 个接发/编解场、9 个装卸场，均不计入客运 trackCount。站台/股道有效长未核实，按 450/650 通用示意。',
  }),

  // ---------------------------------------------------------------- 沈阳局枢纽 ----
  CCT: defineLayout({
    id: 'CCT', name: '长春', telecode: 'CCT', slug: 'changchun',
    aliases: ['长春站', 'changchun'],
    platformCount: 9, trackCount: 16,
    buildingArea: 100694,
    platformLength: L, platformWidth: W,
    mainTracks: [7, 8],
    sources: [S.ccBaike, S.ccHub],
    note: '「9台16线」（1-8 道普速场、9-16 道高速场），南站房 50162㎡ + 北站房 50532㎡ = 100694㎡（百度百科「建筑面积 100694 m²」）；枢纽分析另作「总建筑面积约 16.7 万㎡」含其它配套，口径不同不取舍。2013 南北站房全面贯通。站台/股道有效长未核实，按 450/650 通用示意。',
  }),

  // 长春西在 route-data.js 里没有 stationId（无电报码），故用中文名作键，
  // 让 framework.zonesNear 的 layouts[Node.name] 能命中；layoutFor 也能按中文名查到。
  '长春西': defineLayout({
    id: '长春西', name: '长春西', telecode: null, slug: 'changchunxi',
    aliases: ['长春西站', 'changchunxi', 'CCX'],
    platformCount: 5, trackCount: 11,
    buildingArea: 61456,
    platformLength: L, platformWidth: W,
    mainTracks: [5, 6],
    sources: [S.ccxBaike, S.ccHub],
    kmBasis: '无电报码：route-data.js 该站 Node 只有 name「长春西」，framework.zonesNear 走 layouts[Node.name] 命中；km 由该线路 Node.km 提供。规模数字来自 sources。',
    note: '「5台11线」、站房总面积 61456㎡（约 6.15 万）、日均发送 4.8 万人次；T 形高架式站房、半地下工程、2009-10 开工 2012-12-01 随哈大高铁投用。京哈高铁(哈大段)中间站，承担不进长春站的通过动车组。站台/股道有效长未核实，按 450/650 通用示意。',
  }),

  SBT: defineLayout({
    id: 'SBT', name: '沈阳北', telecode: 'SBT', slug: 'shenyangbei',
    aliases: ['沈阳北站', 'shenyangbei'],
    platformCount: 8, trackCount: 16,
    buildingArea: 121100,
    platformLength: L, platformWidth: W,
    mainTracks: [7, 8],
    sources: [S.sybBaike, S.sybRail, S.sybSogou],
    note: '「8台16线」（2011 中文百科 / 2021 搜狗 / 2026 百度百科一致；搜狗信息栏旧作「8台14线」）。总建筑面积 12.11 万㎡（2015 口径：高架候车厅 3.2 万、南广场 6.4 万、北广场 2.51 万）；沈阳局 2025 沈白高铁报道作「站房总建筑面积 15.1 万㎡」为改造后口径，二者并列不取舍，buildingArea 取百科 12.11 万。站台/股道有效长未核实，按 450/650 通用示意。',
  }),

  DFT: defineLayout({
    id: 'DFT', name: '大连北', telecode: 'DFT', slug: 'dalianbei',
    aliases: ['大连北站', 'dalianbei'],
    platformCount: 10, trackCount: 20,
    buildingArea: 68512,
    platformLength: L, platformWidth: W,
    mainTracks: [9, 10],
    platformKinds: ['side', 'island', 'island', 'island', 'island', 'island', 'island', 'island', 'island', 'side'],
    sources: [S.dlWenming, S.dlWiki, S.specZhan],
    note: '「10台20线」（1-5 普速场、6-13 哈大高铁场、14-20 丹大城际场）。站房建筑面积 68512㎡（6.85 万）、无站台柱雨棚 73734㎡、站台面积 6.3 万㎡；站房横跨铁路 292 m、顺铁路宽 168 m、高 33 m；含动车运用所全长 6.45 km、占地 115 公顷。站台/股道有效长未核实，按 450/650 通用示意。',
  }),
};

// ---------------------------------------------------------------- 车辆段布局 ----
/**
 * 生成一条 DepotLayout 的派生字段。纯函数。
 * 字段口径：shedTracks 检修库股道数、shedLength 库长、shedWidth 库宽、
 *          arrivalTracks 出库线/接入股道数、yardTracks 段内股道总数、
 *          switches 出库道岔（相对里程，站/段中心为 0）、turntable 转盘、
 *          inspectionShed 列检棚、unverified 未核实字段清单、sources。
 */
function defineDepot(cfg) {
  const id = cfg.id;
  const switches = [];
  const n = Math.max(1, cfg.arrivalTracks ?? 2);
  for (let i = 0; i < n; i += 1) {
    const lateral = (i + 1) * TC;
    switches.push({
      id: `${id}:sw-out-${i + 1}`,
      s: -(cfg.shedLength ?? 470) / 2 - 90 - i * SWITCH_LEN,
      from: LANE.DEPOT,
      to: `${LANE.MAIN}:out-${i + 1}`,
      lateral,
      kind: 'entry',                                 // 段管线接入正线（出库方向）
      length: SWITCH_LEN,
    });
  }
  return {
    id,
    name: cfg.name,
    kind: cfg.kind,                                  // 'emu' | 'loco' | 'wagon'
    aliases: cfg.aliases ?? [],
    shedTracks: cfg.shedTracks ?? null,              // 检修库股道数，查不到 null
    shedLength: cfg.shedLength ?? null,              // 库长 m，查不到 null
    shedWidth: cfg.shedWidth ?? null,                // 库宽 m，查不到 null
    yardTracks: cfg.yardTracks ?? null,              // 段内股道总数，查不到 null
    arrivalTracks: cfg.arrivalTracks ?? null,        // 出库线 / 接入股道数
    trackLengths: cfg.trackLengths ?? null,          // 段内股道有效长数组，查不到 null
    switches,
    turntable: Boolean(cfg.turntable),               // 转盘标识
    inspectionShed: Boolean(cfg.inspectionShed),     // 列检棚标识
    multiLevel: Boolean(cfg.multiLevel),             // 库内多层检修栈桥标识
    unverified: cfg.unverified ?? [],                // 明确列出未核实字段
    sources: cfg.sources ?? [],
    kmBasis: cfg.kmBasis ?? '段内里程不与具体线路绑定；接入正线由 alignment.depotLane() 生成进路，段内几何为站/段中心为 0 的相对坐标。',
    note: cfg.note ?? '',
  };
}

export const DEPOT_LAYOUTS = {
  'harbin-emu-depot': defineDepot({
    id: 'harbin-emu-depot', name: '哈尔滨动车段', kind: 'emu',
    aliases: ['哈尔滨动车段', 'harbin-emu-depot', 'harbinemu', '动车段'],
    shedLength: 470,                                 // 核实：检修 A 库库长约 470 m
    shedWidth: null,
    shedTracks: null,                                // 未核实
    yardTracks: null,                                // 未核实
    arrivalTracks: 2,                               // 规范「出入段线不宜少于 2 条」示意
    trackLengths: null,
    turntable: false, inspectionShed: false, multiLevel: true,
    unverified: ['shedTracks（检修库股道总数）', 'yardTracks（段内股道总数）', 'shedWidth（库宽）', 'trackLengths（逐股有效长）'],
    sources: [S.emuDaily, S.emuCnr, S.emuNews, S.specDepot, S.specZhan],
    note: '省内唯一高寒动车组检修基地，负责 104 组高寒动车组一、二级检修。**检修 A 库库长约 470 m 为核实值**（中国日报/中新网 2023），库内 408 顶灯 + 1152 平台灯 + 744 地沟灯、控制精确到股道/列位/一二层/东西侧，印证「库内上中下三层同步检修」。央广网 2024 提到「检修库 58 道 2 列位」是股道编号，不是股道总数，故 shedTracks 不写 58、留 null。检修库股道数、段内股道总数、库宽、逐股有效长均未核实，几何按国家铁路局 2016 标准「检修库线不应少于 2 条、出入段线不宜少于 2 条、检查库线间距 7~8 m、检修库线 8~12 m」的通用值示意。',
  }),

  'sankeshu-loco': defineDepot({
    id: 'sankeshu-loco', name: '三棵树机务段', kind: 'loco',
    aliases: ['三棵树机务段', 'sankeshu-loco', '哈局三段', '机务段'],
    shedLength: null, shedWidth: null, shedTracks: null, yardTracks: null,
    arrivalTracks: 2,                               // 核实：南侧向哈尔滨东站 2 条股道接入
    trackLengths: null,
    turntable: true, inspectionShed: false, multiLevel: false,
    unverified: ['shedTracks（整备库股道数）', 'yardTracks（段内股道总数）', 'shedLength（库长）', 'trackLengths（逐股有效长）'],
    sources: [S.locoWiki, S.specDepot, S.specSwitch],
    kmBasis: 'route-data.js 节点 stationId=sankeshu-loco；段机关在三棵树线与滨北线之间，南侧向哈尔滨东站有 2 条股道接入（维基），接入进路由 alignment.depotLane() 生成。',
    note: '1932 年成立、中国最北客运机务段，担负哈局大部分普速客车与全部高铁列车牵引；2015 初配属 186 台机车（DF11/DF11G/DF4D/DF5）；动车车间位于哈尔滨西站西广场。**「南侧向哈尔滨东站有 2 条股道接入」为核实值**，作为 arrivalTracks。整备库 / 扇形机车库 + 转盘为外观示意（stations.js v1 已有扇形库 9 拱门 + 转盘几何，横道河子机车库为 15 库门）。检修库股道数、段内股道总数、库长、逐股有效长均未核实，按通用值示意。出库道岔用 12 号（广湛批复「出入段线与车站衔接道岔采用 12 号」），本文件 length 统一按 18 号 69 m 仅作占位，几何由 buildDepot 按段管线示意。',
  }),

  'haxi-emu-depot': defineDepot({
    id: 'haxi-emu-depot', name: '哈西动车运用所', kind: 'emu',
    aliases: ['哈西动车运用所', 'haxi-emu-depot', '哈西动车所'],
    shedLength: null, shedWidth: null, shedTracks: null, yardTracks: null,
    arrivalTracks: 2,                               // 规范「出入段线不宜少于 2 条」示意
    trackLengths: null,
    turntable: false, inspectionShed: true, multiLevel: false,
    unverified: ['shedTracks（检查库线数）', 'yardTracks（存车线/段内股道总数）', 'shedLength（库长）', 'trackLengths（逐股有效长）'],
    sources: [S.haxiBigemap, S.specDepot, S.specCangzhou, S.specZhan],
    kmBasis: 'route-data.js 节点 stationId=haxi-emu-depot（哈西站内，km≈0.479）；接入进路由 alignment.depotLane() 生成。',
    note: '哈尔滨西站内设 1 个动车所（BIGEMAP / route-data.js 文件头），哈西站本身设高速、普速 2 个站场 + 1 个动车所。检修/检查库股道数、存车线数、库长、逐股有效长均未核实，按国家铁路局 2016 标准「出入段线不宜少于 2 条、检修(查)库线不应少于 2 条」与沧州西动车运用所实例（出入段线 2 条、存车线 12 条有效长 650 m、检查库线 4 条）作通用示意；检查库线间距 7~8 m、存车线 4.6 m。广湛批复亦规定动车运用所新建 2 条出入段线。',
  }),

  'harbin-wagon': defineDepot({
    id: 'harbin-wagon', name: '哈尔滨车辆段', kind: 'wagon',
    aliases: ['哈尔滨车辆段', 'harbin-wagon', '车辆段'],
    shedLength: 192,                                 // 核实：轮轴检修库房屋轴线 192×45 m（长边）
    shedWidth: 45,                                   // 核实：轴线短边 45 m
    shedTracks: null, yardTracks: null,
    arrivalTracks: null,
    trackLengths: null,
    turntable: false, inspectionShed: true, multiLevel: false,
    unverified: ['shedTracks（检修线数）', 'yardTracks（段内股道总数）', 'arrivalTracks（出库线数）', 'trackLengths（逐股有效长）'],
    sources: [S.wagonBaike, S.specDepot],
    note: '全路管辖范围最大、生产布局站点最多的货车车辆段：3 个检修基地 / 5 个站修 / 17 个列检 / 2 个国境站 / 10 个驻企技术交接作业场，管辖里程 4652 km、约 1.6 万辆货车。**2024 轮轴检修库迁建「房屋轴线尺寸 192×45 米、占地 8640㎡」为核实值**，作为 shedLength/shedWidth。列检棚、检修线、段内股道数、出库线数、逐股有效长均未核实，按通用值示意（列检棚为开敞柱网 + 单坡顶 + 列检地沟，见 stations.js buildWagon）。',
  }),
};

// ---------------------------------------------------------------- 查询索引 ----
// 电报码 / 拼音 slug / 中文名（去掉「站」后缀）/ 显式别名 → 同一个 layout 引用。
// 找不到一律返回 null，绝不兜底成哈尔滨站（任务硬性要求）。
const _layoutIndex = new Map();
for (const [key, layout] of Object.entries(STATION_LAYOUTS)) {
  const keys = [key, layout.id, layout.name, layout.telecode, layout.slug, ...layout.aliases];
  for (const k of keys) {
    if (k == null) continue;
    const n = norm(k);
    if (n && !_layoutIndex.has(n)) _layoutIndex.set(n, layout);
  }
}

const _depotIndex = new Map();
for (const [key, layout] of Object.entries(DEPOT_LAYOUTS)) {
  const keys = [key, layout.id, layout.name, ...layout.aliases];
  for (const k of keys) {
    if (k == null) continue;
    const n = norm(k);
    if (n && !_depotIndex.has(n)) _depotIndex.set(n, layout);
  }
}

/**
 * 按 电报码 / 拼音 slug / 中文名 取站场布局，找不到返回 null。
 * 例：layoutFor('VAB') / layoutFor('harbinxi') / layoutFor('哈尔滨西站') 都返回哈西布局。
 * 也接受第二个参数 'depot' 查车辆段；不传或传别的只查车站。
 * @param {string} id
 * @param {'station'|'depot'|'auto'} [scope]
 * @returns {object|null}
 */
export function layoutFor(id, scope = 'station') {
  if (id == null || id === '') return null;
  const n = norm(id);
  if (!n) return null;
  const st = _layoutIndex.get(n) ?? null;
  if (scope === 'depot') return _depotIndex.get(n) ?? null;
  if (scope === 'auto') return st ?? _depotIndex.get(n) ?? null;
  return st;
}

/**
 * 口径落地辅助（纯函数）：把布局里「站中心为 0 的相对停车区间」按给定站中心
 * 绝对里程 centerS（米）转成真正的 StopZone（s0/s1 为绝对里程）。
 * framework.zonesNear 当前版本自己会做等价兜底，所以运行时不必调它；
 * 它供 pack 层显式校准、HUD 显示、以及单测验证「两端车门都在区间内」使用。
 * @param {object} layout
 * @param {number} centerS 站中心线路绝对里程（米）
 * @returns {Array<object>}
 */
export function stopZonesAt(layout, centerS) {
  if (!layout || !Number.isFinite(centerS)) return [];
  return (layout.stopZones ?? []).map((z) => ({
    id: z.id,
    stationId: z.stationId,
    trackIndex: z.trackIndex,
    platformIndex: z.platformIndex,
    s0: centerS + z.relS0,
    s1: centerS + z.relS1,
    length: z.length,
    dwellSec: z.dwellSec,
  }));
}

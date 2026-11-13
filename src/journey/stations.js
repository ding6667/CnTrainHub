/**
 * 车站 / 车辆段程序化建模 —— CnTrainHub 的 journey 场景
 *
 * 【资料来源】下面这些公开报道只用来提取「外观长啥样、规模多大」的事实，
 * 建模时按这些事实做示意级近似，不下载、不引用任何第三方图片或模型素材：
 *  - 央广网《发现最美铁路｜哈尔滨火车站：百年老站焕青春》
 *    https://www.cnr.cn/hlj/shfz/20230911/t20230911_526415585.shtml
 *  - 东北网《我国高寒地区第一座高铁车站 哈西站打开出省高铁大通道》
 *    https://heilongjiang.dbw.cn/system/2016/11/17/057443317.shtml
 *  - 国铁集团转载新华每日电讯《火车拉来"绥芬河"》
 *    http://www.china-railway.com.cn/xwzx/mtjj/xhs/xinhuanet/202505/t20250516_145304.html
 *  - 互动百科《海拉尔站》 https://www.baike.com/wikiid/4706595237381253826
 *  - 黑龙江日报《北国风·双城堡火车站印象》 https://hljnews.cn/whly/content/2022-10/24/content_650905.html
 *  - 央广网《最北高寒高铁4S店》 https://www.cnr.cn/hlj/shfz/20231005/t20231005_526441149.shtml
 *  - 中新网《百年老站里的"讲解员"》（一面坡站） https://m.chinanews.com.cn/wap/detail/chs/sp/8450674.shtml
 *  - 维基百科《佳木斯站》 https://zh.wikipedia.com/wiki/佳木斯站
 *
 * 声明：外观为示意级近似，不使用第三方图片/模型素材；所有几何程序化生成，
 * 中文站牌用 CanvasTexture 现场画，运行时不 fetch 任何静态资产（publicDir:false）。
 *
 * 【坐标约定，和 config.js 对齐】
 *  - 1 个 Three 单位 = 现实 1 米；+Y 向上；轨道沿 Z 铺；轨顶面 y=0。
 *  - Group 局部原点 = 站房中心在轨面上的投影（x=0, z=0）。
 *  - 站台中心 x≈±6、站台面 y≈1.25；股道中心 x = ±2 / ±10.5。
 *  - 站房做成「跨线高架候车室」：底面架空在 y≥5.2，列车从下方 y<5.2 净空穿过，
 *    这样「原点在站房中心」和「站台在 x≈±6」才能同时成立。中小站也用同一骨架，
 *    只是把候车室做矮做小，用 3 类模板换外观。
 *  - 经纬度全部取自 data/stations.json（bureau=哈尔滨局，GeoJSON 的 [lon, lat]）。
 *  - STATION_CATALOG 每项的 id 用车站电报码（和 route-data.js 的 stationId 对齐），
 *    slug 存拼音主键；buildStation / stationById 同时认电报码、拼音、中文站名。
 *
 * 【性能口径】同一材质（顶点色）的实体几何全部 mergeGeometries 成 1 个 mesh；
 * 重复的雨棚柱 / 接触网柱 / 灯柱 / 枕木走 InstancedMesh（逐实例矩阵 + 逐实例颜色）；
 * 单站 / 单 depot 都是 4 个 mesh（实体 1 + 柱 1 + 枕木 1 + 站牌 1），纹理每站 1 张；
 * 单位几何、材质、按 id 的合并几何与站牌贴图全部进缓存复用，disposeStations() 统一释放。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- 来源 URL ----
// catalog 里每项的 sources 都指向这里，文件头注释只摘了其中 8 条。
const U = {
  harbin: 'https://www.cnr.cn/hlj/shfz/20230911/t20230911_526415585.shtml',
  harbin2: 'https://www.peopleapp.com/article/rmh10182954/rmh10182954',
  harbinxi: 'https://heilongjiang.dbw.cn/system/2016/11/17/057443317.shtml',
  harbinxi2: 'https://wikiwand.com/zh-hant/articles/哈尔滨西站',
  habei: 'http://www.o451.cn/news/Info.asp?ID=14836',
  hadong: 'https://www.wikiwand.com/zh-mo/articles/哈尔滨东站',
  mudanjiang: 'https://www.mdj.gov.cn/mdjsrmzf/c100014/201812/52747.shtml',
  jiamusi: 'https://zh.wikipedia.com/wiki/佳木斯站',
  qiqihaer: 'https://baike.baidu.com/view/607135.htm',
  daqing: 'https://www.toutiao.com/article/7703227249520067107/',
  suifenhe: 'http://www.china-railway.com.cn/xwzx/mtjj/xhs/xinhuanet/202505/t20250516_145304.html',
  suifenhe2: 'https://baike.sogou.com/v9432804.htm',
  manzhouli: 'https://www.mzlakn.com/cn/content/2023/38295.html',
  hailaer: 'https://www.baike.com/wikiid/4706595237381253826',
  jiagedaqi: 'https://m.thepaper.cn/baijiahao_31912852',
  mohe: 'https://www.sina.cn/news/detail/5175564694719469.html',
  shuangchengbao: 'https://hljnews.cn/whly/content/2022-10/24/content_650905.html',
  yimianpo: 'https://m.chinanews.com.cn/wap/detail/chs/sp/8450674.shtml',
  zhalantun: 'http://www.zhongguowenwubao.com/portal/DigitPager/paperDetail/publishdate/2025-01-21/paperId/21265/id/107094',
  hengdao: 'https://m.toutiao.com/article/7328590230754230803/',
  emu: 'https://www.cnr.cn/hlj/shfz/20231005/t20231005_526441149.shtml',
  loco: 'https://www.wikiwand.com/zh-sg/articles/哈局三段',
  wagon: 'https://baike.baidu.com/item/哈尔滨车辆段/23996780',
};

// ------------------------------------------------------------ 车站目录 ----
/**
 * STATION_CATALOG：哈尔滨局主要车站。
 * 每项字段：id(真实电报码，如 VAB)、slug(拼音主键)、name、lon、lat、
 *          kind('hub'|'local')、tier(1特等/2/3)、architect(风格标签)、
 *          note(外观/规模大白话)、sources(资料 URL)。
 * 经纬度是 data/stations.json 里的真实值，不是编的；id 用电报码是为了和
 * route-data.js 的 Node.stationId / Chunk.stationId 直接对上（见下方别名说明）。
 */
export const STATION_CATALOG = [
  { id: 'harbin', name: '哈尔滨', lon: 126.6254, lat: 45.76, kind: 'hub', tier: 1,
    architect: '新艺术运动·黄墙红顶',
    note: '8台16线；黄墙红顶、墨绿站台雨棚；孟莎式屋顶+平天窗+竖条窗、大本钟样式钟楼、竖琴形雨棚',
    sources: [U.harbin, U.harbin2] },
  { id: 'harbinxi', name: '哈尔滨西', lon: 126.5723, lat: 45.7051, kind: 'hub', tier: 1,
    architect: '圣索菲亚意象·棕红陶板',
    note: '18台22线；棕红陶板取自索菲亚教堂红墙，近70m大跨拱形屋面、柱廊式石材柱列、雪花冰晶吊顶',
    sources: [U.harbinxi, U.harbinxi2] },
  { id: 'harbinbei', name: '哈尔滨北', lon: 126.5296, lat: 45.8481, kind: 'hub', tier: 2,
    architect: '寒地对称·竖向玻璃窗',
    note: '6台10线；对称式布局、色调沉稳素雅、高大竖向玻璃窗，强调寒地建筑厚实感',
    sources: [U.habei] },
  { id: 'harbindong', name: '哈尔滨东', lon: 126.7056, lat: 45.7866, kind: 'hub', tier: 2,
    architect: '水蓝玻璃·土灰大理石',
    note: '原名三棵树站，3台12线；长方形站舍、土灰大理石墙、水蓝色玻璃、玻璃马赛克外立面',
    sources: [U.habei, U.hadong] },
  { id: 'mudanjiang', name: '牡丹江', lon: 129.6051, lat: 44.5891, kind: 'hub', tier: 2,
    architect: '欧陆风情·球面网架',
    note: '14台17线；侧式+高架站房横跨8台，球面网架屋面，提取法德意俄经典元素，形似绽放牡丹',
    sources: [U.mudanjiang] },
  { id: 'jiamusi', name: '佳木斯', lon: 130.3759, lat: 46.8017, kind: 'hub', tier: 2,
    architect: '暖黄欧式·钟楼',
    note: '7台14线；暖黄立面幕墙欧式风格、蓝灰屋顶配米黄墙、规律性开窗，北站房设一座钟楼',
    sources: [U.jiamusi] },
  { id: 'qiqihaer', name: '齐齐哈尔', lon: 123.99, lat: 47.3385, kind: 'hub', tier: 2,
    architect: '现代平顶',
    note: '7台11线；1909原站、1979原址重建、2015改造，站房约1.8万㎡',
    sources: [U.qiqihaer] },
  { id: 'qiqihaernan', name: '齐齐哈尔南', lon: 123.9653, lat: 47.2825, kind: 'hub', tier: 2,
    architect: '现代平顶',
    note: '7台14线；2015.8投运，建筑面积约6.8万㎡，哈齐高铁车站',
    sources: [U.qiqihaer] },
  { id: 'daqingxi', name: '大庆西', lon: 124.8796, lat: 46.6553, kind: 'hub', tier: 2,
    architect: '奔涌的石油·横向层叠',
    note: '哈齐高铁体量最大枢纽、普速高速车场合一；建筑层层叠叠横向延展，流动线条模拟地下油流',
    sources: [U.daqing] },
  { id: 'suifenhe', name: '绥芬河', lon: 131.129, lat: 44.4038, kind: 'hub', tier: 3,
    architect: '俄式新艺术·白墙灰饰',
    note: '1902老站房；灰白墙面被垂直壁柱划分，曲线构图山墙与窗楣，绿钢梁屋架、暖黄墙裙、陡坡顶',
    sources: [U.suifenhe, U.suifenhe2] },
  { id: 'manzhouli', name: '满洲里', lon: 117.444, lat: 49.5841, kind: 'hub', tier: 3,
    architect: '俄式·米白金穹',
    note: '1901建，中东铁路入华首站；拱形门窗用弧形线条、两端高大柱墩与曲线女儿墙，现站房金色穹顶钟楼',
    sources: [U.manzhouli] },
  { id: 'hailaer', name: '海拉尔', lon: 119.7356, lat: 49.2288, kind: 'hub', tier: 3,
    architect: '蒙古族·球壳穹顶',
    note: '1大8小共9个球壳（大球外径约31.4m），兰白两色立体菱形铝板、蓝色拱形嵌入，蒙古族风格',
    sources: [U.hailaer] },
  { id: 'jiagedaqi', name: '加格达奇', lon: 124.1186, lat: 50.4181, kind: 'hub', tier: 3,
    architect: '简欧·青松壁柱·拱顶',
    note: '最北一等站，2025原址重建；拱形屋顶应对雪荷载，实墙竖条壁柱象征大兴安岭林海青松',
    sources: [U.jiagedaqi] },
  { id: 'mohe', name: '漠河', lon: 122.4977, lat: 52.9866, kind: 'hub', tier: 3,
    architect: '极简·银灰曲面顶',
    note: '1974运营；极简主义+北极冰雪元素，银灰曲面屋顶配通透玻璃幕墙，站前有神州北极标识碑',
    sources: [U.mohe] },
  { id: 'shuangchengbao', name: '双城堡', lon: 126.2865, lat: 45.3942, kind: 'hub', tier: 3,
    architect: '中式宫殿·绿瓦黄墙',
    note: '中东铁路唯一中国传统宫殿式车站；绿琉璃瓦黄墙、飞檐凌空、兽脊鸱吻、朱红浮柱，偏殿一座三层阁楼',
    sources: [U.shuangchengbao] },

  // 中小站：走 3 类参数化模板（砖砌坡顶 / 平顶现代 / 俄式小站），按 seed 变化
  { id: 'yimianpo', name: '一面坡', lon: 128.0753, lat: 45.0594, kind: 'local', tier: 3,
    architect: '俄式砖砌坡顶',
    note: '1899建；墨绿瓦、老虎窗、雨搭、黄墙；砖砌清水墙、人字坡高举架、方石转角、毛石基础',
    sources: [U.yimianpo] },
  { id: 'zhalantun', name: '扎兰屯', lon: 122.7403, lat: 48.0124, kind: 'local', tier: 3,
    architect: '俄式砖石小楼',
    note: '1901设站；二层小楼、入口高大尖拱窗、墙面窗楣砖砌凹凸花饰、淡黄墙白色点缀',
    sources: [U.zhalantun] },
  { id: 'xiangfang', name: '香坊', lon: 126.6737, lat: 45.719, kind: 'local', tier: 3,
    architect: '俄式小站',
    note: '1925现存站舍，典型俄式建筑；砖木、铁皮坡顶、壁柱花饰',
    sources: [U.hengdao] },
  { id: 'suihua', name: '绥化', lon: 127.0095, lat: 46.6432, kind: 'local', tier: 2,
    architect: '平顶现代',
    note: '滨北线地区站；平顶女儿墙+整片玻璃幕墙+悬挑雨棚',
    sources: [U.daqing] },
  { id: 'anda', name: '安达', lon: 125.3152, lat: 46.4003, kind: 'local', tier: 3,
    architect: '平顶现代',
    note: '哈齐高铁沿线；中央大拱券意象、悬挑雨棚与玻璃幕墙（示意级）',
    sources: [U.daqing] },
  { id: 'hengdaohezi', name: '横道河子', lon: 129.0659, lat: 44.8124, kind: 'local', tier: 3,
    architect: '俄式砖砌·锥塔',
    note: '单层俄式、老虎窗、两个锥塔；附近机车库为扇形15个并列拱圆库门、砖墙铁瓦',
    sources: [U.hengdao] },
  { id: 'acheng', name: '阿城', lon: 126.9885, lat: 45.5506, kind: 'local', tier: 3,
    architect: '平顶现代',
    note: '滨绥线小站；平顶现代站房（示意级）',
    sources: [U.daqing] },
  { id: 'shangzhi', name: '尚志', lon: 127.9556, lat: 45.2063, kind: 'local', tier: 3,
    architect: '俄式砖砌坡顶',
    note: '滨绥线；砖砌清水墙+人字坡顶（示意级）',
    sources: [U.yimianpo] },
  { id: 'hailun', name: '海伦', lon: 126.9882, lat: 47.4653, kind: 'local', tier: 3,
    architect: '俄式砖砌坡顶',
    note: '滨北线小站；砖砌坡顶（示意级）',
    sources: [U.yimianpo] },
  { id: 'daqingdong', name: '大庆东', lon: 125.116, lat: 46.5307, kind: 'local', tier: 3,
    architect: '平顶现代',
    note: '屋面流畅起伏如振翅凤凰（示意级用平顶+起伏线条）',
    sources: [U.daqing] },
];

// ------------------------------------------------ 电报码别名（联调关键） ----
// route-data.js / stream.js 的 Node.stationId、Chunk.stationId 用的是 stations.json
// 里的真实电报码（HBB / VAB / XFB …），不是拼音。集成层 journey.js 的 resolveId()
// 只拿 catalog 项的 id / name 去比对，所以这里把每项的 id 规范成电报码，
// 拼音原名挪到 slug 字段，内部建模查 LOOK 仍用 slug。
// 顺带让 stationById 同时认电报码 / 拼音 slug / 中文站名，三种叫法都查得到。
const TELECODE = {
  harbin: 'HBB', harbinxi: 'VAB', harbindong: 'VBB', harbinbei: 'HTB',
  qiqihaer: 'QHX', qiqihaernan: 'QNB', mudanjiang: 'MDB', jiamusi: 'JMB',
  daqingxi: 'RHX', daqingdong: 'LFX', suifenhe: 'SFB', manzhouli: 'MLX',
  hailaer: 'HRX', jiagedaqi: 'JGX', mohe: 'MVX', shuangchengbao: 'SCB',
  yimianpo: 'YPB', zhalantun: 'ZTX', xiangfang: 'XFB', suihua: 'SHB',
  anda: 'ADX', hengdaohezi: 'HDB', acheng: 'ACB', shangzhi: 'SZB', hailun: 'HLB',
};
for (const s of STATION_CATALOG) {
  s.slug = s.id;                         // 保留拼音主键，LOOK 表按它索引
  s.telecode = TELECODE[s.slug] || s.slug;
  s.id = s.telecode;                    // id 用电报码，供集成层 resolveId 精确命中
}

const _byId = new Map();
for (const s of STATION_CATALOG) {
  _byId.set(s.id, s);                   // 电报码，如 VAB
  _byId.set(s.slug, s);                 // 拼音，如 harbinxi
  _byId.set(s.name, s);                 // 中文站名，如 哈尔滨西
}

/** 按电报码 / 拼音 slug / 中文站名取车站资料，找不到返回 null。 */
export function stationById(id) {
  return _byId.get(id) || null;
}

// ------------------------------------------------------------ 外观配置 ----
// 每站的建模参数单独放这里，catalog 保持干净。
// pal：wall 墙 / roof 屋顶 / accent 装饰与雨棚 / glass 玻璃 / base 基座。
// hall：[宽 W, 沿线路深 D, 架空底面高 Y, 候车室高 H]；yard：站场半长（米）。
// hub 用 roof + extra 精细造型；local 用 template 三类模板。
const LOOK = {
  harbin:      { pal: p(0xE6CE88, 0x9B3A2C, 0x3C5A46, 0x35585C, 0x8E8568), roof: 'mansard', extra: ['clock', 'harp'], hall: [34, 42, 6.5, 7.0], yard: 70 },
  harbinxi:    { pal: p(0x9C4A36, 0x743020, 0xD9CBA9, 0x2B3E52, 0x6A4636), roof: 'arch',    extra: ['snow', 'colonnade'], hall: [38, 46, 6.8, 8.0], yard: 74 },
  harbinbei:   { pal: p(0xC9CDD2, 0x6E7A84, 0x8A949C, 0x3E5A72, 0x7C8288), roof: 'flat',    extra: ['pilaster'], hall: [30, 38, 6.2, 6.4], yard: 62 },
  harbindong:  { pal: p(0xB9B6AC, 0x6E7A7E, 0x7FA9C4, 0x4E86A8, 0x8C8A82), roof: 'flat',    extra: ['pilaster'], hall: [28, 34, 6.0, 6.0], yard: 58 },
  mudanjiang:  { pal: p(0xE4D9BE, 0x8A6A48, 0xC2A66F, 0x3C5060, 0x9C8C6C), roof: 'gable',   extra: ['colonnade'], hall: [36, 44, 6.6, 7.4], yard: 70 },
  jiamusi:     { pal: p(0xE7D29A, 0x5E6E80, 0xC9A86A, 0x3A4C5C, 0x9A8A66), roof: 'gable',   extra: ['clock'], hall: [32, 40, 6.4, 6.8], yard: 66 },
  qiqihaer:    { pal: p(0xD2D5D8, 0x6E7780, 0x9AA2A8, 0x3E4E5C, 0x8C9094), roof: 'flat',    extra: ['pilaster'], hall: [30, 38, 6.2, 6.2], yard: 62 },
  qiqihaernan: { pal: p(0xCFD6DA, 0x64727E, 0x8FA6B4, 0x3C4E5C, 0x8A9298), roof: 'flat',    extra: ['pilaster'], hall: [32, 40, 6.4, 6.6], yard: 64 },
  daqingxi:    { pal: p(0xB9C3CB, 0x5E6A74, 0x8D99A3, 0x33485C, 0x7C868E), roof: 'curve',   extra: [], hall: [36, 42, 6.4, 6.6], yard: 68 },
  suifenhe:    { pal: p(0xE7E3D6, 0x6E7A6A, 0xA9B0A2, 0x3C5148, 0xB6A98C), roof: 'onion',   extra: ['arches', 'pilaster'], hall: [26, 30, 5.8, 5.8], yard: 52 },
  manzhouli:   { pal: p(0xEFE6CE, 0x8A6A3C, 0xD4B24A, 0x40545C, 0xB9A87E), roof: 'onion',   extra: ['arches'], hall: [26, 30, 5.8, 6.0], yard: 52 },
  hailaer:     { pal: p(0xEEF2F6, 0x9FB6C8, 0x2E6FB0, 0x3A5A78, 0xBCC8D2), roof: 'domes',   extra: [], hall: [32, 38, 6.2, 6.4], yard: 62 },
  jiagedaqi:   { pal: p(0xDCD8CB, 0x7A8A84, 0x5E7A62, 0x3C4E52, 0xA79E88), roof: 'arch',    extra: ['pilaster'], hall: [28, 34, 6.0, 6.0], yard: 56 },
  mohe:        { pal: p(0xC9D2D8, 0x8E9AA2, 0xB6C2C8, 0x3E5668, 0x9AA4AA), roof: 'curve',   extra: [], hall: [24, 28, 5.6, 5.4], yard: 48 },
  shuangchengbao: { pal: p(0xE5C878, 0x2E6A4A, 0xB0362C, 0x3C5A52, 0x8E7A4C), roof: 'palace', extra: [], hall: [28, 32, 5.8, 5.8], yard: 52 },

  // 中小站模板：hall 做矮做小，架空底面仍留列车净空
  yimianpo:    { pal: p(0xE0CE96, 0x3C5A46, 0x8C7A52, 0x40545C, 0x9A8C6C), template: 'brick',   hall: [16, 20, 5.2, 3.2], yard: 42 },
  zhalantun:   { pal: p(0xE6D9B4, 0x7A4A38, 0xC2A878, 0x3E4E5C, 0xA89C7C), template: 'russian', hall: [17, 20, 5.2, 3.6], yard: 42 },
  xiangfang:   { pal: p(0xE2D2AC, 0x6E5A44, 0xB08C5C, 0x3E4E5C, 0x9E8E70), template: 'russian', hall: [15, 18, 5.2, 3.2], yard: 40 },
  suihua:      { pal: p(0xCDD4D8, 0x6E7A84, 0x92A2AC, 0x3A5068, 0x8E969C), template: 'flat',    hall: [18, 22, 5.2, 3.4], yard: 44 },
  anda:        { pal: p(0xD2D7DA, 0x6A7680, 0x8E9AA4, 0x3A4E62, 0x8C949A), template: 'flat',    hall: [17, 20, 5.2, 3.2], yard: 42 },
  hengdaohezi: { pal: p(0xDEC98E, 0x8A4A36, 0xA98C5C, 0x3E4E54, 0x9A8A66), template: 'russian', hall: [18, 20, 5.2, 3.4], yard: 42 },
  acheng:      { pal: p(0xCFD5D8, 0x6E7880, 0x96A2AA, 0x3C4E60, 0x8E969A), template: 'flat',    hall: [16, 18, 5.2, 3.0], yard: 40 },
  shangzhi:    { pal: p(0xD9C58C, 0x4A5E48, 0x8C7A52, 0x3E5056, 0x968866), template: 'brick',   hall: [16, 18, 5.2, 3.0], yard: 40 },
  hailun:      { pal: p(0xDCC894, 0x44564A, 0x8C7A54, 0x3E5058, 0x968A68), template: 'brick',   hall: [15, 18, 5.2, 3.0], yard: 40 },
  daqingdong:  { pal: p(0xC9D2D6, 0x64727C, 0x8CA0AC, 0x364C60, 0x8A9298), template: 'flat',    hall: [18, 20, 5.2, 3.2], yard: 42 },
};

function p(wall, roof, accent, glass, base) {
  return { wall, roof, accent, glass, base };
}

// catalog 外的沿线站（外局枢纽、新站、无电报码的 FALLBACK 中文名节点）没有专门外观资料，
// 用 3 类中小站模板兜底：按 id 哈希选模板，seed 变化时外观也跟着变，不会千站一面。
const GENERIC_LOOKS = [
  { pal: p(0xD8CFA8, 0x4A5A48, 0x8C7A52, 0x3E5058, 0x968866), template: 'brick',   hall: [16, 18, 5.2, 3.0], yard: 38 },
  { pal: p(0xCFD5D8, 0x6E7880, 0x96A2AA, 0x3C4E60, 0x8E969A), template: 'flat',    hall: [17, 20, 5.2, 3.2], yard: 40 },
  { pal: p(0xE2D2AC, 0x6E5A44, 0xB08C5C, 0x3E4E5C, 0x9E8E70), template: 'russian', hall: [16, 18, 5.2, 3.2], yard: 38 },
];

// 车辆段 3 种：动车段检修库 / 机务段机车库（扇形库+转盘）/ 车辆段列检棚
const DEPOT_INFO = {
  emu:   { name: '哈尔滨动车段', pal: p(0xC9CDD2, 0x5B6B7A, 0x8A9098, 0x2E6FB0, 0x3A4550), sources: [U.emu], note: '省内唯一高寒动车组检修基地，检修库长约470m，库内上中下三层同步检修、27000V接触网' },
  loco:  { name: '三棵树机务段', pal: p(0xB9A98C, 0x7A4A38, 0x6B7075, 0x9C7B4A, 0x3A302A), sources: [U.loco], note: '1932成立，中国最北客运机务段；配属DF11/DF4D等，整备库、扇形机车库与转盘' },
  wagon: { name: '哈尔滨车辆段', pal: p(0xBFC4C9, 0x6E7A84, 0x858C93, 0x3E7A55, 0x39424A), sources: [U.wagon], note: '全路管辖范围最大的货车车辆段；轮轴检修库、列检棚与多条列检线' },
};

// ---------------------------------------------------------------- 缓存池 ----
// 所有几何 / 材质 / 贴图都登记进来，disposeStations() 一次性释放。
const CACHE = {
  ready: false,
  unit: {},                 // 单位几何（全部转成非索引，保证能 merge 到一起）
  mats: new Map(),          // 共享材质
  geos: new Set(),          // 所有常驻几何
  texs: new Map(),          // 站牌贴图（按名字）
  packs: new Map(),         // id|seed|quality -> 组装好的几何包，重复建站直接复用
};

function ensure() {
  if (CACHE.ready) return;
  // 单位几何统一非索引化：Box/Cylinder/Sphere 都带 position/normal/uv，
  // 加上顶点色后 attributes 完全一致，mergeGeometries 才不会报「属性不一致」。
  const reg = (k, g) => {
    let ng = g;
    if (g.index) { ng = g.toNonIndexed(); g.dispose(); }
    CACHE.geos.add(ng);
    CACHE.unit[k] = ng;
  };
  reg('box', new THREE.BoxGeometry(1, 1, 1));
  reg('cyl', new THREE.CylinderGeometry(1, 1, 1, 16));
  reg('cone', new THREE.CylinderGeometry(0, 1, 1, 12)); // 尖朝 +Y 的圆锥
  const pyr = new THREE.CylinderGeometry(0, 1, 1, 4);   // 四棱锥 = 四坡/攒尖顶
  pyr.rotateY(Math.PI / 4);
  pyr.scale(Math.SQRT1_2, 1, Math.SQRT1_2);             // 底面压成 1×1 的方
  reg('pyr', pyr);
  const arch = new THREE.CylinderGeometry(1, 1, 1, 20, 1, false, 0, Math.PI); // 半圆筒
  arch.rotateZ(Math.PI / 2);                            // 轴转到 X、半圆开口朝下 → 拱顶
  reg('arch', arch);
  reg('sphere', new THREE.SphereGeometry(1, 16, 12));
  reg('hemi', new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)); // 上半球

  const M = (k, m) => { CACHE.mats.set(k, m); return m; };
  M('solid', new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.03 }));
  M('post', new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.15 }));
  M('sleeper', new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 0.95 }));
  CACHE.ready = true;
}

// ------------------------------------------------------------ 几何小工具 ----
// 一个复用的 Matrix4 只做「立刻消费」：put 里马上 applyMatrix4，post/sleeper 里 clone 保存。
const _M4 = new THREE.Matrix4();
const _Q = new THREE.Quaternion();
const _E = new THREE.Euler();
const _V = new THREE.Vector3();
const _S = new THREE.Vector3();

function M(x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  _E.set(rx, ry, rz);
  _Q.setFromEuler(_E);
  _V.set(x, y, z);
  _S.set(sx, sy, sz);
  return _M4.compose(_V, _Q, _S);
}

function newCollector() {
  return { parts: [], posts: [], sleepers: [] };
}

/** 把一个单位几何按矩阵摆好、染上顶点色，丢进待合并列表。 */
function put(c, unitKey, color, mat4) {
  const g = CACHE.unit[unitKey].clone();
  g.applyMatrix4(mat4);
  const n = g.attributes.position.count;
  const col = new THREE.Color(color);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  c.parts.push(g);
}

function box(c, color, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  put(c, 'box', color, M(x, y, z, w, h, d, rx, ry, rz));
}
function cyl(c, color, r, h, x, y, z, rx = 0, ry = 0, rz = 0) {
  put(c, 'cyl', color, M(x, y, z, r, h, r, rx, ry, rz));
}
function cone(c, color, r, h, x, y, z) {
  put(c, 'cone', color, M(x, y, z, r, h, r));
}
/** 四坡顶：baseY 是屋顶底（= 墙顶）的高度。 */
function pyrC(c, color, w, h, d, x, baseY, z, ry = 0) {
  put(c, 'pyr', color, M(x, baseY + h / 2, z, w, h, d, 0, ry, 0));
}
function sphereC(c, color, rx, ry, rz, x, y, z) {
  put(c, 'sphere', color, M(x, y, z, rx, ry, rz));
}
/** 半球/球壳：baseY 是球壳底的高度。 */
function hemiC(c, color, rx, ry, rz, x, baseY, z) {
  put(c, 'hemi', color, M(x, baseY, z, rx, ry, rz));
}
/** 大跨拱：L 沿 X（可绕 Y 转成沿 Z），H 矢高，W 沿 Z 的跨度，baseY 拱脚高度。 */
function archC(c, color, cx, baseY, cz, L, H, W, ry = 0) {
  put(c, 'arch', color, M(cx, baseY, cz, L, H, W / 2, 0, ry, 0));
}

/** 重复柱/杆：只存矩阵和颜色，最后用一个 InstancedMesh 画完。 */
function post(c, color, x, y, z, w, h, d, rx = 0, ry = 0, rz = 0) {
  c.posts.push({ matrix: M(x, y, z, w, h, d, rx, ry, rz).clone(), color });
}
function sleeper(c, x, y, z, w, h, d) {
  c.sleepers.push(M(x, y, z, w, h, d).clone());
}

// 伪随机：同一 seed 每次生成一样，模板变化可复现。
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashSeed(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------------------------------------------------------------- 站场骨架 ----
// 股道、钢轨、枕木、站台、雨棚、接触网、站前广场 —— 大站小站共用，只是长度不同。
function buildYard(c, look, quality) {
  const P = look.pal;
  const L = look.yard;
  const zLen = L * 2;
  const step = quality === 'low' ? 3.0 : quality === 'high' ? 1.2 : 1.8;
  const centers = [-10.5, -2, 2, 10.5];

  // 道床 + 站前广场（-X 侧，站房主立面朝这边）
  box(c, 0x8f8a7c, 34, 0.5, zLen, 0, -0.30, 0);
  box(c, 0xbdb6a6, 18, 0.12, L * 0.8, -26, 0.04, 0);
  for (let i = -3; i <= 3; i++) box(c, 0xa79f8d, 18, 0.02, 0.12, -26, 0.11, i * L * 0.11);

  // 4 条股道：每根钢轨顶 y=0，枕木走 InstancedMesh
  for (const cx of centers) {
    for (const s of [-1, 1]) box(c, 0x9298a0, 0.12, 0.14, zLen, cx + s * 0.7175, -0.07, 0);
    for (let z = -L + 1; z < L; z += step) sleeper(c, cx, -0.13, z, 2.7, 0.16, 0.26);
  }

  // 两座站台：中心 x=±6，面 y=1.25，黄色安全线；上方雨棚 + 一列雨棚柱
  for (const s of [-1, 1]) {
    const px = s * 6;
    box(c, 0xc3bcab, 5.4, 1.25, L * 1.5, px, 0.625, 0);
    box(c, 0xd8c24a, 0.14, 0.03, L * 1.5, px - s * 2.45, 1.27, 0);
    box(c, P.accent, 6.2, 0.28, L * 1.4, px, 5.35, 0);
    for (let z = -L * 0.65; z <= L * 0.65; z += 8) {
      post(c, P.accent, px, (1.25 + 5.2) / 2, z, 0.26, 3.95, 0.26);
    }
  }

  // 接触网柱、横臂、吊柱（柱走实例，横梁合并进实体）；每股道上空一条接触线
  for (const s of [-1, 1]) {
    for (let z = -L + 4; z <= L - 4; z += 22) {
      post(c, 0x70767c, s * 14, 3.8, z, 0.32, 7.6, 0.32);
      box(c, 0x5a6066, 7.6, 0.16, 0.22, s * 10.2, 7.35, z);
      box(c, 0x5a6066, 0.16, 1.0, 0.22, s * 6.4, 6.9, z);
    }
  }
  for (const cx of centers) box(c, 0x3a3f45, 0.06, 0.06, zLen, cx, 6.35, 0);

  // 站前灯柱 + 花坛
  for (const s of [-1, 1]) {
    post(c, 0x4a4f55, -20, 3.0, s * L * 0.30, 0.22, 6.0, 0.22);
    box(c, 0x5b6b4a, 3.0, 0.5, 3.0, -30, 0.3, s * L * 0.22);
  }
}

// ---------------------------------------------------------------- 候车室主体 ----
function buildHall(c, hall, P) {
  const [W, D, Y, H] = hall;
  box(c, P.wall, W, H, D, 0, Y + H / 2, 0);
  // 四面贴一圈玻璃带（薄片外移 0.05，避免和墙 z-fighting）
  box(c, P.glass, W * 0.94, H * 0.42, 0.08, 0, Y + H * 0.58, D / 2 + 0.05);
  box(c, P.glass, W * 0.94, H * 0.42, 0.08, 0, Y + H * 0.58, -D / 2 - 0.05);
  box(c, P.glass, 0.08, H * 0.42, D * 0.9, W / 2 + 0.05, Y + H * 0.58, 0);
  box(c, P.glass, 0.08, H * 0.42, D * 0.9, -W / 2 - 0.05, Y + H * 0.58, 0);
  // 檐口 + 勒脚
  box(c, P.accent, W + 0.6, 0.35, D + 0.6, 0, Y + H - 0.18, 0);
  box(c, P.base, W + 0.8, 0.5, D + 0.8, 0, Y + 0.1, 0);
  // 高架候车室的落地支柱（贴站台边与站场外侧，不压中间正线）
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      post(c, P.base, sx * (W / 2 - 1.5), Y / 2, sz * (D / 2 - 1.5), 0.7, Y, 0.7);
    }
  }
}

// ---------------------------------------------------------------- 屋顶风格 ----
function applyRoof(c, kind, hall, P, R) {
  const [W, D, Y, H] = hall;
  const top = Y + H;
  switch (kind) {
    case 'mansard': { // 哈站：孟莎式折线屋顶 + 平天窗 + 老虎窗
      box(c, P.roof, W * 0.72, 0.5, D * 0.72, 0, top + 0.25, 0);
      for (const s of [-1, 1]) {
        box(c, P.roof, W * 0.18, 2.6, D, s * W * 0.42, top + 1.3, 0, 0, 0, s * 0.5);
        box(c, P.roof, W, 2.6, D * 0.18, 0, top + 1.3, s * D * 0.42, s * 0.5, 0, 0);
      }
      box(c, P.roof, W * 0.74, 0.35, D * 0.74, 0, top + 2.7, 0);
      box(c, P.glass, W * 0.6, 0.06, D * 0.5, 0, top + 2.92, 0); // 平天窗
      for (let i = -1; i <= 1; i++) {
        for (const s of [-1, 1]) {
          box(c, P.accent, 1.1, 0.9, 0.5, i * W * 0.22, top + 1.5, s * D * 0.40);
          pyrC(c, P.roof, 1.4, 0.7, 0.9, i * W * 0.22, top + 1.9, s * D * 0.40);
        }
      }
      break;
    }
    case 'arch': { // 哈西 / 加格达奇：近 70m 大跨拱，曲线延续到两翼
      archC(c, P.roof, 0, top, 0, D * 0.9, 6.0, W * 1.05, Math.PI / 2);
      for (const s of [-1, 1]) {
        box(c, P.roof, W * 0.22, 0.5, D * 0.95, s * W * 0.56, top + 0.9, 0, 0, 0, s * 0.35);
      }
      break;
    }
    case 'domes': { // 海拉尔：1 大 8 小共 9 个球壳 + 兰白菱形
      hemiC(c, 0xF2F5F8, 5.2, 4.2, 5.2, 0, top, 0);
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        hemiC(c, 0xEAF0F5, 2.4, 1.9, 2.4, Math.cos(a) * 8.0, top, Math.sin(a) * 8.0);
      }
      box(c, P.accent, W * 0.9, 0.3, 0.5, 0, top + 1.2, 0);
      box(c, P.accent, 0.5, 0.3, D * 0.9, 0, top + 1.2, 0);
      break;
    }
    case 'palace': { // 双城堡：绿瓦黄墙、重檐飞檐、正脊鸱吻、三层阁楼
      for (const s of [-1, 1]) {
        box(c, P.roof, W * 1.12, 0.35, D * 0.62, 0, top + 1.0, s * D * 0.16, s * 0.28, 0, 0);
      }
      box(c, P.roof, W * 1.16, 0.35, D * 0.66, 0, top + 2.2, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        box(c, P.roof, 2.6, 0.25, 0.9, sx * W * 0.52, top + 1.25, sz * D * 0.34, 0, 0, sx * 0.35);
      }
      box(c, P.accent, W * 1.05, 0.3, 0.4, 0, top + 2.45, 0);
      cone(c, P.accent, 0.5, 1.2, -W * 0.52, top + 3.0, 0);
      cone(c, P.accent, 0.5, 1.2, W * 0.52, top + 3.0, 0);
      box(c, P.wall, 3.4, 5.5, 3.4, -W * 0.42, top + 2.75, -D * 0.34);
      pyrC(c, P.roof, 4.4, 2.2, 4.4, -W * 0.42, top + 5.5, -D * 0.34);
      break;
    }
    case 'onion': { // 绥芬河 / 满洲里：俄式陡坡顶 + 洋葱头金穹 + 转角柱墩
      pyrC(c, P.roof, W * 0.96, 3.0, D * 0.96, 0, top, 0);
      hemiC(c, P.accent, 3.2, 3.0, 3.2, 0, top + 2.8, 0);
      cone(c, P.accent, 1.6, 3.4, 0, top + 7.4, 0);
      for (const s of [-1, 1]) {
        box(c, P.base, 1.6, H * 1.1, 1.6, s * W * 0.46, Y + H * 0.55, D * 0.46);
        cone(c, P.accent, 1.1, 2.0, s * W * 0.46, top + H * 0.1 + 1.0, D * 0.46);
      }
      break;
    }
    case 'curve': { // 大庆西/漠河：层层叠叠的横向线条 + 起伏波浪（奔涌的石油）
      for (let k = 0; k < 4; k++) {
        box(c, k % 2 ? P.accent : P.roof, W * (1.0 - k * 0.06), 0.7, D * (1.0 - k * 0.05), 0, top + 0.4 + k * 0.8, 0);
      }
      for (let i = -4; i <= 4; i++) {
        box(c, P.accent, W * 0.9, 0.25, 1.4, 0, top + 1.2 + Math.sin(i * 0.9) * 0.7, i * D * 0.1);
      }
      break;
    }
    case 'flat': { // 平顶 + 女儿墙
      box(c, P.roof, W * 1.02, 0.4, D * 1.02, 0, top + 0.2, 0);
      for (const s of [-1, 1]) {
        box(c, P.accent, W * 1.04, 0.9, 0.35, 0, top + 0.65, s * D * 0.5);
        box(c, P.accent, 0.35, 0.9, D * 1.04, s * W * 0.5, top + 0.65, 0);
      }
      break;
    }
    case 'gable':
    default: { // 通用人字坡顶
      for (const s of [-1, 1]) {
        box(c, P.roof, W * 1.04, 0.3, D * 0.60, 0, top + 1.3, s * D * 0.24, s * 0.46, 0, 0);
      }
      box(c, P.roof, W * 1.04, 0.35, 0.5, 0, top + 2.6, 0);
      break;
    }
  }
}

// ---------------------------------------------------------------- 立面特征 ----
function applyExtra(c, kind, hall, P) {
  const [W, D, Y, H] = hall;
  const top = Y + H;
  switch (kind) {
    case 'clock': { // 哈站/佳木斯：钟楼（大本钟样式大钟 + 四坡尖顶）
      const tx = -W * 0.34, tz = D * 0.30;
      box(c, P.wall, 4.2, H * 1.9, 4.2, tx, top + H * 0.95, tz);
      box(c, P.accent, 4.6, 0.4, 4.6, tx, top + H * 1.9, tz);
      pyrC(c, P.roof, 4.8, 3.2, 4.8, tx, top + H * 1.9 + 0.4, tz);
      for (const s of [-1, 1]) {
        cyl(c, 0xF2E9D0, 1.35, 0.16, tx, top + H * 1.45, tz + s * 2.2, Math.PI / 2, 0, 0);
        cyl(c, 0x333A3A, 0.12, 0.2, tx, top + H * 1.45, tz + s * 2.32, Math.PI / 2, 0, 0);
        box(c, 0x333A3A, 0.09, 0.9, 0.06, tx, top + H * 1.62, tz + s * 2.30);
      }
      break;
    }
    case 'snow': { // 哈西：雪花冰晶（3 根交叉细杆成一组）
      for (const zz of [-D * 0.28, 0, D * 0.28]) {
        for (let k = 0; k < 3; k++) {
          box(c, P.accent, 0.12, 2.4, 0.12, 0, top + 3.0, zz, 0, 0, k * Math.PI / 3);
        }
      }
      break;
    }
    case 'colonnade': { // 哈西/牡丹江：柱廊式粗壮石材柱列（贴在高架立面上，不落地挡道）
      for (let i = -3; i <= 3; i++) {
        post(c, P.accent, i * (W * 0.13), (Y + top) / 2, D / 2 + 0.7, 0.9, H, 0.9);
      }
      box(c, P.accent, W * 0.98, 0.9, 1.4, 0, top - 0.4, D / 2 + 1.0);
      break;
    }
    case 'pilaster': { // 哈北/加格达奇/绥芬河：实墙竖向壁柱 + 高大竖向玻璃窗
      const n = 5;
      for (let i = -n; i <= n; i++) {
        const x = i * W * 0.082;
        box(c, P.base, 0.5, H * 0.82, 0.35, x, Y + H * 0.5, D / 2 + 0.20);
        box(c, P.glass, 0.9, H * 0.66, 0.06, x + W * 0.041, Y + H * 0.55, D / 2 + 0.14);
      }
      break;
    }
    case 'arches': { // 绥芬河/满洲里：拱形窗券（窗身 + 半圆拱顶）
      for (let i = -2; i <= 2; i++) {
        const x = i * W * 0.18;
        box(c, P.glass, 1.5, 2.2, 0.08, x, Y + H * 0.42, D / 2 + 0.12);
        hemiC(c, P.glass, 0.78, 0.78, 0.1, x, Y + H * 0.42 + 1.1, D / 2 + 0.14);
        box(c, P.accent, 1.9, 0.2, 0.25, x, Y + H * 0.42 - 1.15, D / 2 + 0.2);
      }
      break;
    }
    case 'harp': { // 哈站：竖琴形雨棚 —— 一列斜拉细索（走实例）
      for (const s of [-1, 1]) {
        for (let z = -hall[3] * 4; z <= hall[3] * 4; z += 3) {
          post(c, P.accent, s * 8.0, 3.7, z, 0.09, 3.6, 0.09, 0, 0, s * 0.6);
        }
      }
      box(c, P.accent, 6.4, 0.3, 0.4, 8.0, 5.5, 0);
      box(c, P.accent, 6.4, 0.3, 0.4, -8.0, 5.5, 0);
      break;
    }
    default: break;
  }
}

// ---------------------------------------------------------------- 中小站 3 模板 ----
// 都是「跨线小候车室 + 落地支柱」，用 seed 改层数/老虎窗数/锥塔数/配色微扰。
function stubPillars(c, hall, P) {
  const [W, D, Y] = hall;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    post(c, P.base, sx * W * 0.42, Y / 2, sz * D * 0.42, 0.5, Y, 0.5);
  }
}

function tplBrick(c, hall, P, R) { // 砖砌坡顶：一面坡那种黄墙墨绿瓦 + 老虎窗
  const [W, D, Y, H] = hall;
  const wh = H * (0.9 + R() * 0.2);
  box(c, P.wall, W, wh, D, 0, Y + wh / 2, 0);
  box(c, P.base, W + 0.6, 0.6, D + 0.6, 0, Y + 0.15, 0);
  for (const s of [-1, 1]) {
    box(c, P.roof, W * 1.06, 0.28, D * 0.62, 0, Y + wh + 1.1, s * D * 0.26, s * 0.5, 0, 0);
  }
  box(c, P.roof, W * 1.06, 0.3, 0.4, 0, Y + wh + 2.2, 0);
  const n = 1 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const xx = (i - (n - 1) / 2) * W * 0.28;
    box(c, P.accent, 1.2, 1.0, 0.6, xx, Y + wh + 1.0, D * 0.30);
    pyrC(c, P.roof, 1.5, 0.8, 1.0, xx, Y + wh + 1.5, D * 0.30);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(c, P.accent, 0.7, wh, 0.7, sx * W * 0.49, Y + wh / 2, sz * D * 0.49);
  }
  for (let i = -2; i <= 2; i++) {
    box(c, P.glass, 1.2, 1.5, 0.08, i * W * 0.18, Y + wh * 0.55, D / 2 + 0.06);
  }
  box(c, P.accent, W * 0.5, 0.2, 1.6, 0, Y + 2.4, D * 0.5 + 0.8); // 雨搭
  stubPillars(c, hall, P);
}

function tplFlat(c, hall, P, R) { // 平顶现代：整片玻璃幕墙 + 竖向格栅 + 悬挑雨棚
  const [W, D, Y, H] = hall;
  box(c, P.wall, W, H, D, 0, Y + H / 2, 0);
  box(c, P.glass, W * 0.9, H * 0.62, 0.08, 0, Y + H * 0.55, D / 2 + 0.06);
  const n = 3 + Math.floor(R() * 3);
  for (let i = -n; i <= n; i++) {
    box(c, P.accent, 0.16, H * 0.62, 0.14, i * W * 0.9 / (2 * n), Y + H * 0.55, D / 2 + 0.16);
  }
  box(c, P.roof, W * 1.04, 0.35, D * 1.04, 0, Y + H + 0.18, 0);
  box(c, P.accent, W * 1.1, 0.22, 2.6, 0, Y + 2.6, D / 2 + 1.3);
  stubPillars(c, hall, P);
}

function tplRussian(c, hall, P, R) { // 俄式小站：四坡铁皮顶 + 尖拱窗 + 壁柱 + 锥塔
  const [W, D, Y, H] = hall;
  box(c, P.wall, W, H, D, 0, Y + H / 2, 0);
  box(c, P.base, W + 0.6, 0.7, D + 0.6, 0, Y + 0.2, 0);
  pyrC(c, P.roof, W * 1.08, 2.6, D * 1.08, 0, Y + H, 0);
  for (let i = -2; i <= 2; i++) {
    const x = i * W * 0.2;
    box(c, P.accent, 0.5, H * 0.8, 0.4, x, Y + H * 0.5, D / 2 + 0.16);
    box(c, P.glass, 1.3, H * 0.5, 0.08, x, Y + H * 0.42, D / 2 + 0.1);
    hemiC(c, P.glass, 0.7, 0.7, 0.1, x, Y + H * 0.67, D / 2 + 0.12);
  }
  const towers = R() < 0.5 ? 2 : 1;
  for (let t = 0; t < towers; t++) {
    const sx = t ? 1 : -1;
    box(c, P.wall, 2.2, H * 1.3, 2.2, sx * W * 0.42, Y + H * 0.65, D * 0.3);
    cone(c, P.roof, 1.8, 3.0, sx * W * 0.42, Y + H * 1.3 + 1.5, D * 0.3);
  }
  hemiC(c, P.accent, 0.6, 0.6, 0.6, 0, Y + H + 2.4, 0); // 曲线女儿墙上的小球饰
  stubPillars(c, hall, P);
}

const TEMPLATES = { brick: tplBrick, flat: tplFlat, russian: tplRussian };

// ---------------------------------------------------------------- 中文站牌 ----
// CanvasTexture 设 flipY=false（项目贴图统一口径），再用 UV 的 v 翻转把字正过来；
// 每个牌位放两块背对背的 Plane（各自 FrontSide 朝外），这样左右两侧读都是正字，不会镜像。
function signTexture(name) {
  if (CACHE.texs.has(name)) return CACHE.texs.get(name);
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 160;
  const x = cv.getContext('2d');
  x.fillStyle = '#0b3d78'; x.fillRect(0, 0, 512, 160);
  x.strokeStyle = '#eaf2fb'; x.lineWidth = 8; x.strokeRect(10, 10, 492, 140);
  x.fillStyle = '#cfe0f5'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold 22px sans-serif';
  x.fillText('中国铁路 · 哈尔滨局', 256, 32);
  x.fillStyle = '#ffffff';
  let fs = 78;
  const font = (s) => `bold ${s}px "Microsoft YaHei","PingFang SC","SimHei",sans-serif`;
  x.font = font(fs);
  while (x.measureText(name).width > 460 && fs > 32) { fs -= 4; x.font = font(fs); }
  x.fillText(name, 256, 98);
  x.fillStyle = '#8fb4dd'; x.fillRect(150, 138, 212, 4);
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false;                       // 不自动上下翻
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  CACHE.texs.set(name, tex);
  return tex;
}

function makeSignGeometry(placements, W, H) {
  const parts = [];
  for (const pl of placements) {
    for (const ry of [-Math.PI / 2, Math.PI / 2]) {
      const plane = new THREE.PlaneGeometry(W, H);
      const uv = plane.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); // 抵消 flipY=false
      let g = plane;
      if (plane.index) { g = plane.toNonIndexed(); plane.dispose(); }
      g.applyMatrix4(M(pl.x, pl.y, pl.z, 1, 1, 1, 0, ry, 0));
      parts.push(g);
    }
  }
  const merged = mergeGeometries(parts, false) || new THREE.BufferGeometry();
  parts.forEach((g) => g.dispose());
  CACHE.geos.add(merged);
  return merged;
}

// ---------------------------------------------------------------- 组装 ----
// 把收集器里的东西变成「可复用的几何包」：主实体(顶点色合并) + 柱实例数据 +
// 枕木实例数据 + 站牌几何/材质。同 id 再建站时只重新套一层 Mesh 壳，几何不重算。
function assemble(c, signName, placements) {
  const main = mergeGeometries(c.parts, false) || new THREE.BufferGeometry();
  c.parts.forEach((g) => g.dispose());   // 合并完临时 clone 就可以丢了
  CACHE.geos.add(main);

  const pm = new Float32Array(c.posts.length * 16);
  const pc = new Float32Array(c.posts.length * 3);
  c.posts.forEach((o, i) => {
    pm.set(o.matrix.elements, i * 16);
    const col = new THREE.Color(o.color);
    pc[i * 3] = col.r; pc[i * 3 + 1] = col.g; pc[i * 3 + 2] = col.b;
  });
  const sm = new Float32Array(c.sleepers.length * 16);
  c.sleepers.forEach((m, i) => sm.set(m.elements, i * 16));

  const tex = signTexture(signName);
  const signGeo = makeSignGeometry(placements, 3.2, 0.95);
  const signMatKey = 'sign:' + signName;
  if (!CACHE.mats.has(signMatKey)) {
    CACHE.mats.set(signMatKey, new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide, toneMapped: false }));
  }
  return {
    main,
    pm, pc, postCount: c.posts.length,
    sm, sleeperCount: c.sleepers.length,
    signGeo, signMatKey,
  };
}

function instantiate(pack, name, meta) {
  const g = new THREE.Group();
  g.name = name;
  g.userData = meta;

  const main = new THREE.Mesh(pack.main, CACHE.mats.get('solid'));
  main.castShadow = true; main.receiveShadow = true;
  g.add(main);

  if (pack.postCount) {
    const im = new THREE.InstancedMesh(CACHE.unit.box, CACHE.mats.get('post'), pack.postCount);
    im.instanceMatrix.array.set(pack.pm);
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor = new THREE.InstancedBufferAttribute(pack.pc.slice(), 3);
    im.instanceColor.needsUpdate = true;
    im.castShadow = true;
    g.add(im);
  }
  if (pack.sleeperCount) {
    const sm = new THREE.InstancedMesh(CACHE.unit.box, CACHE.mats.get('sleeper'), pack.sleeperCount);
    sm.instanceMatrix.array.set(pack.sm);
    sm.instanceMatrix.needsUpdate = true;
    sm.receiveShadow = true;
    g.add(sm);
  }
  const sign = new THREE.Mesh(pack.signGeo, CACHE.mats.get(pack.signMatKey));
  g.add(sign);
  return g;
}

function signStanchions(c, placements) {
  for (const pl of placements) {
    for (const dz of [-1.2, 1.2]) {
      post(c, 0x9aa0a6, pl.x, (1.25 + 3.05) / 2, pl.z + dz, 0.12, 1.8, 0.12);
    }
  }
}

function composeStation(st, seed, quality, opts) {
  const c = newCollector();
  // 25 座精细站按 slug 查 LOOK；catalog 外的通用站按 seed 在 3 类中小站模板里选。
  const gi = (Number(seed) || 0) % GENERIC_LOOKS.length;
  const look = LOOK[st.slug] || GENERIC_LOOKS[gi];
  const P = look.pal;
  const R = mulberry32(seed);
  buildYard(c, look, quality);
  if (look.template) {
    TEMPLATES[look.template](c, look.hall, P, R);
  } else {
    buildHall(c, look.hall, P);
    applyRoof(c, look.roof, look.hall, P, R);
    (look.extra || []).forEach((e) => applyExtra(c, e, look.hall, P));
  }
  const placements = [
    { x: 6, y: 3.5, z: -look.yard * 0.28 }, { x: -6, y: 3.5, z: -look.yard * 0.28 },
    { x: 6, y: 3.5, z: look.yard * 0.28 }, { x: -6, y: 3.5, z: look.yard * 0.28 },
  ];
  signStanchions(c, placements);
  return assemble(c, opts.signName || st.name, placements);
}

/** 建一座车站。返回 THREE.Group（原点=站房中心投影，轨道沿 Z，轨顶 y=0）。 */
export function buildStation(id, opts = {}) {
  ensure();
  let st = stationById(id);
  if (!st) {
    // catalog 外的沿线站（外局枢纽、新站、无电报码的 FALLBACK 中文名节点）：
    // 不编造资料，现场合成一个通用中小站条目，让集成层兜底也有像样的站房，
    // 而不是被 resolveId 兜底成 catalog[0]（哈尔滨站）。
    const label = String(id || '沿线车站');
    st = {
      id: label, slug: '__generic__', name: label,
      lon: 0, lat: 0, kind: 'local', tier: 3,
      architect: '沿线通用中小站',
      note: 'catalog 外沿线站，外观为示意级通用中小站模板，无专门外观资料',
      sources: [], generic: true,
    };
  }
  const seed = opts.seed ?? hashSeed(st.id);   // 用规范化的 id，别名得到同一外观
  const quality = opts.quality || 'mid';
  const key = `${st.id}|${seed}|${quality}`;
  let pack = CACHE.packs.get(key);
  if (!pack) { pack = composeStation(st, seed, quality, opts); CACHE.packs.set(key, pack); }
  return instantiate(pack, 'station:' + st.id, { stationId: st.id, slug: st.slug, kind: st.kind, tier: st.tier, name: st.name });
}

// ---------------------------------------------------------------- 车辆段 ----
function buildDepotYard(c, info, quality) {
  const P = info.pal;
  const L = 80;
  const step = quality === 'low' ? 3.0 : quality === 'high' ? 1.4 : 2.0;
  const centers = [-24, -17, -10, -3, 3, 10, 17, 24];
  box(c, 0x8f8a7c, 64, 0.5, L * 2, 0, -0.30, 0);
  for (const cx of centers) {
    for (const s of [-1, 1]) box(c, 0x9298a0, 0.12, 0.14, L * 2, cx + s * 0.7175, -0.07, 0);
    for (let z = -L + 1; z < L; z += step) sleeper(c, cx, -0.13, z, 2.7, 0.16, 0.26);
  }
  // 道岔示意：咽喉区几段斜向岔线 + 岔心
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const z0 = 52 + k * 8;
      box(c, 0x6e747a, 0.1, 0.12, 16, s * (6 + k * 5), -0.06, z0, 0, s * 0.32, 0);
      box(c, 0x3a3f45, 0.8, 0.12, 0.8, s * (6 + k * 5), -0.05, z0 - 7);
    }
  }
  // 接触网柱（两侧）
  for (const s of [-1, 1]) {
    for (let z = -L + 6; z <= L - 6; z += 24) {
      post(c, 0x70767c, s * 31, 3.8, z, 0.32, 7.6, 0.32);
      box(c, 0x5a6066, 7.0, 0.16, 0.22, s * 27.5, 7.35, z);
    }
  }
  for (const cx of centers) box(c, P.accent, 0.06, 0.06, L * 2, cx, 6.35, 0);
}

function buildEMU(c, P) { // 动车段检修库：大跨门式刚架 + 三层检修栈桥 + 地沟
  const W = 52, L = 48, H = 13;
  for (const s of [-1, 1]) box(c, P.wall, W * 1.02, 0.4, L * 1.1, 0, H + 2.4, s * L * 0.55, s * 0.18, 0, 0);
  box(c, P.roof, W * 1.02, 0.5, 1.0, 0, H + 4.7, 0);
  for (let z = -L; z <= L; z += 12) {
    for (const s of [-1, 1]) post(c, P.accent, s * W * 0.48, H / 2, z, 0.7, H, 0.7);
    box(c, P.accent, W, 0.7, 0.7, 0, H, z);
  }
  for (const s of [-1, 1]) {
    box(c, P.wall, W, H, 0.6, 0, H / 2, s * L);
    for (let i = -3; i <= 3; i += 2) box(c, P.base, 6.0, 8.0, 0.2, i * 7.0, 4.2, s * (L + 0.35));
  }
  for (const z of [-24, 0, 24]) {
    box(c, P.accent, W * 0.9, 0.3, 2.2, 0, 3.0, z);
    box(c, P.accent, W * 0.9, 0.3, 2.2, 0, 6.0, z);
    box(c, P.accent, W * 0.9, 0.3, 2.2, 0, 9.0, z);
  }
  for (const cx of [-17, -10, -3, 3, 10, 17]) box(c, 0x2b2f33, 1.6, 0.05, 2 * L, cx, -0.05, 0);
}

function buildLoco(c, P) { // 机务段：矩形整备库 + 扇形拱门库 + 圆形转盘
  const W = 40, L = 34, H = 11;
  for (const s of [-1, 1]) {
    box(c, P.wall, W * 1.02, 0.35, L * 1.1, 0, H + 1.6, s * L * 0.55, s * 0.2, 0, 0);
    box(c, P.wall, W, H, 0.6, 0, H / 2, s * L);
  }
  box(c, P.roof, W * 1.02, 0.5, 1.0, 0, H + 3.1, 0);
  for (let z = -L; z <= L; z += 11) {
    for (const s of [-1, 1]) post(c, P.accent, s * W * 0.47, H / 2, z, 0.6, H, 0.6);
  }
  // 扇形 9 个拱圆库门（横道河子 15 库门的示意）
  const cz = L + 18;
  for (let i = 0; i < 9; i++) {
    const a = Math.PI - (i * Math.PI) / 8;
    const dx = Math.cos(a) * 18, dz = Math.sin(a) * 18;
    box(c, P.wall, 4.6, 6.5, 1.0, dx, 3.25, cz + dz, 0, -a, 0);
    box(c, P.base, 3.0, 5.0, 0.2, dx, 2.6, cz + dz + 0.6, 0, -a, 0);
    hemiC(c, P.roof, 2.0, 1.4, 0.3, dx, 6.0, cz + dz + 0.2);
  }
  // 转盘：圆盘 + 环轨 + 8 根辐条轨
  cyl(c, P.accent, 9.0, 0.4, 0, 0.2, cz);
  cyl(c, 0x2b2f33, 9.4, 0.15, 0, 0.05, cz);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    box(c, 0x3a3f45, 9.0, 0.1, 0.25, Math.cos(a) * 4.5, 0.45, cz + Math.sin(a) * 4.5, 0, -a, 0);
  }
}

function buildWagon(c, P) { // 车辆段列检棚：开敞柱网 + 单坡顶 + 列检地沟/平台
  const W = 46, L = 40, H = 9;
  for (let z = -L; z <= L; z += 10) {
    for (const sx of [-1, 0, 1]) post(c, P.accent, sx * W * 0.45, H / 2, z, 0.5, H, 0.5);
  }
  for (const s of [-1, 1]) {
    box(c, P.roof, W * 1.0, 0.25, L * 1.05, 0, H + 1.6, s * L * 0.52, s * 0.2, 0, 0);
    box(c, P.wall, W, H * 0.6, 0.5, 0, H * 0.3, s * L);
  }
  for (const cx of [-16, -8, 0, 8, 16]) {
    box(c, 0x2b2f33, 1.4, 0.05, 2 * L, cx, -0.05, 0);
    box(c, P.accent, 1.0, 0.9, 2 * L, cx + 2.2, 0.55, 0);
  }
}

const DEPOT_BUILDERS = { emu: buildEMU, loco: buildLoco, wagon: buildWagon };

function composeDepot(kind, seed, quality) {
  const info = DEPOT_INFO[kind] || DEPOT_INFO.wagon;
  const c = newCollector();
  const R = mulberry32(seed);
  buildDepotYard(c, info, quality);
  (DEPOT_BUILDERS[kind] || buildWagon)(c, info.pal, R);
  const placements = [
    { x: 10, y: 3.6, z: -30 }, { x: -10, y: 3.6, z: -30 },
    { x: 10, y: 3.6, z: 30 }, { x: -10, y: 3.6, z: 30 },
  ];
  signStanchions(c, placements);
  return assemble(c, info.name, placements);
}

/** 路段 kind 可能是 'emu'/'loco'/'coach'，也可能是 route-data 的 depot slug
 *  （harbin-emu-depot / haxi-emu-depot / sankeshu-loco）或中文名，统一归一到三型。 */
function depotSlug(kind) {
  const s = String(kind || '');
  if (/emu|动车/i.test(s)) return 'emu';
  if (/loco|机务|机车/i.test(s)) return 'loco';
  if (/wagon|coach|车辆/i.test(s)) return 'wagon';
  return 'wagon';
}

/**
 * 建一个车辆段。kind 归一到三型：'emu' 动车段检修库 / 'loco' 机务段机车库(扇形库+转盘) /
 * 'wagon' 车辆段列检棚；也接受 depot slug 与中文名。
 * 返回 THREE.Group，同样原点居中、轨道沿 Z、轨顶 y=0。
 */
export function buildDepot(kind, opts = {}) {
  ensure();
  const k = depotSlug(kind);
  const seed = opts.seed ?? hashSeed('depot:' + k);
  const quality = opts.quality || 'mid';
  const key = `depot:${k}|${seed}|${quality}`;
  let pack = CACHE.packs.get(key);
  if (!pack) { pack = composeDepot(k, seed, quality); CACHE.packs.set(key, pack); }
  return instantiate(pack, 'depot:' + k, { depotKind: k, name: DEPOT_INFO[k].name, note: DEPOT_INFO[k].note, sources: DEPOT_INFO[k].sources });
}

/** 释放共享缓存里的全部几何 / 材质 / 贴图；之后再 build 会按需重建。 */
export function disposeStations() {
  for (const g of CACHE.geos) g.dispose();
  for (const m of CACHE.mats.values()) m.dispose();
  for (const t of CACHE.texs.values()) t.dispose();
  CACHE.geos.clear();
  CACHE.mats.clear();
  CACHE.texs.clear();
  CACHE.packs.clear();
  CACHE.unit = {};
  CACHE.ready = false;
}

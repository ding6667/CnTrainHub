/**
 * journey 场景 · 哈尔滨风格城市建筑模块
 * ----------------------------------------------------------------------------
 * 大白话说明：
 *  - 1 个 Three 单位 = 1 米，+Y 向上，轨顶面 y=0。每栋楼的局部原点在「地面中心」，
 *    底面严格贴在 y=0，绝不会伸到轨道下面去；集成层会把楼整体放到 |x|>=30 m 之外。
 *  - 一共 4 类楼（住宅 residential / 办公 office / 商业 commercial / 地标 landmark），
 *    普通楼走 InstancedMesh 批量（同一类型几十栋一次 draw call），地标是单独 Group。
 *  - 立面全部画在「可平铺的 CanvasTexture」上：砖缝、双层防冻窗、阳台栏板、俄式白色
 *    线脚、雪檐口都画在贴图里；整模块只用 6 张贴图（一张贴图 = 4 开间 x 4 层，可平铺）。
 *  - 寒夜亮窗：这 6 张贴图是「同一张 canvas 重绘」切换昼/夜版，材质 map 与 emissiveMap
 *    指向同一张贴图，夜里把 emissiveIntensity 拉高，贴图里画亮的窗就会发光。
 *  - 几何走「同材质 mergeGeometries 合并 + 缓存复用」：一个楼型 = 一个合并几何 + 一个
 *    材质 = 一个 InstancedMesh = 1 个 draw call。坡屋顶、塔尖、柱廊、阳台块都并进同一
 *    几何，用贴图顶部的「雪白檐口带」当采样点染成雪顶/浅色混凝土色。
 *  - 外观只做「示意级复刻」，不用任何第三方图片/模型，不复制受版权保护的精确图纸。
 *
 * 依赖：three 0.180；addons 走 'three/addons/utils/BufferGeometryUtils.js'；纯 ES module。
 *
 * RESEARCH_START
 * 以下为本模块「型」的公开资料依据（2026-11 联网检索；外观仅做示意级复刻，
 * 不使用任何第三方图片/模型，不复制受版权保护的精确图纸）。R 编号与 catalog 的 sources 对应。
 *
 * R1 道外「中华巴洛克」—— 临街西式巴洛克立面 + 中式院落
 *    新华网《新华走笔·坊巷百年》 https://www.news.cn/20260508/fed018beb50f418fbcb9f2833e82327b/c.html
 *    东北网《中華巴洛克:永不褪色的冰城記憶》 https://heilongjiang.big5.dbw.cn/system/2007/05/10/050806472.shtml
 *    中国经济新闻网《老道外的烟火叙事》 https://www.cet.com.cn/wzsy/kjzx/10526379.shtml
 *    事实：沿街爱奥尼柱头/拱券/额枋等西式形制，雕花却是蝙蝠/牡丹/石榴/铜钱等中式吉祥纹样；
 *    院落是中式双层四合院「圈楼」（天井、天桥、木回廊，外墙高、单面坡）；清水砖墙不抹面；
 *    多为两层砖木结构，一层商铺二层住宅（前店后宅）。据此做围合体量 + 沿街女儿墙 + 砖红墙。
 *
 * R2 南岗/花园街「黄房子」与 50 年代苏式家属楼
 *    新晚报《70多年前 苏式住宅的工人新村》(PDF) http://xwb.joyhua.cn/xwb/20230809/wba08bwba08b20230809C.pdf
 *    哈尔滨日报《那片"黄房子",我记忆中的花园街》 https://harbin.joyhua.cn/hebrb/20240911/mhtml/page_07_content_20240911008002.htm
 *    中国经济网《花园街黄房子》 https://district.ce.cn/newarea/roll/202601/t20260106_2684767.shtml
 *    事实：红砖或淡黄暖色墙、坡形屋顶（利于雪滑落）、长方形烟囱、白色线脚勾女儿墙、
 *    白色宽边拱形门窗，墙厚约80cm（三砖半）保暖；黄墙红顶、粗石勒脚、双层窗棂。
 *    据此做暖黄/砖红墙 + 双坡雪顶 + 中轴对称升高 + 白色线脚。
 *
 * R3 哈西/群力新区高层板式住宅
 *    安居客《群力家园(K区)》 https://heb.anjuke.com/prop/view/S4515885742648325
 *    事实：26 层高层、南北通透、落地窗、双层真空玻璃、行列式小区。据此做细高板楼 +
 *    平顶女儿墙 + 规整窗带 + 竖向阳台列 + 屋顶机房。
 *
 * R4 东北寒地防冻构造
 *    中国作家网《亲亲雪城》 https://www.chinawriter.com.cn/n1/2021/1116/c404018-32283987.html
 *    事实：民宅几乎全部双层玻璃窗抵御 -40℃，墙最厚达一米。据此画双层防冻窗 + 厚窗洞。
 *
 * R5 苏联式对称办公 / 铁路局折衷主义办公 / 玻璃幕墙 / 产业园研发楼
 *    今日头条《话说哈尔滨市的建筑风格和历史渊源》 https://m.toutiao.com/article/7540794638534263336/
 *    今日头条《在行走间,认识万国建筑博物馆哈尔滨》 https://www.toutiao.com/article/7146484401738629665/
 *    事实：折衷主义融合古典柱式 + 巴洛克装饰 + 文艺复兴对称布局；中东铁路管理局「大石头房子」
 *    （6 栋组成日字形、青石板饰面）、哈尔滨铁路局办公楼、万国洋行为代表；中央大街号称
 *    「万国建筑博物馆」。据此做中轴对称塔楼/柱廊、折衷坡顶穹顶塔、玻璃塔、扁平园区板楼。
 *
 * R6 中央大街欧式商厦 / 秋林公司 / 现代购物中心 / 冰雪木屋
 *    今日头条《哈尔滨的历史建筑:凝固的艺术》 https://www.toutiao.com/article/7417664287079957002/
 *    人民日报客户端《改"旧"换"新"!中央大街有了新变化》 https://www.peopleapp.com/rmharticle/30017128343
 *    人民日报党媒平台《探寻中央大街老建筑的"前世今生"》 https://www.hubpd.com/hubpd/rss/yidianzixun/index.html?contentId=1152921504609494629
 *    事实：秋林公司最初为巴洛克风格、大橱窗；道里秋林分行仿文艺复兴（女儿墙+巴洛克浮雕、
 *    转角突出）；万国洋行折衷主义（凹进院落、腰线、落地窗、法式方座穹顶）。中央大街 62 栋历史建筑。
 *    据此做坡顶 + 转角穹顶塔 + 大拱橱窗；冰雪街木屋为旅游商业示意。
 *
 * R7 圣索菲亚教堂
 *    黑龙江省外办《哈尔滨市·古色参访路线》(PDF) https://fao.hlj.gov.cn/fao/c111834/202206/30672936/files/23eeedae67c94a1a610f3cc1f98dcb52.pdf
 *    维基百科《圣索菲亚教堂(哈尔滨)》 https://fbrowser.org/wikipedia/zh-hant/%E5%9C%A3%E7%B4%A2%E8%8F%B2%E4%BA%9A%E6%95%99%E5%A0%82_(%E5%93%88%E5%B0%94%E6%BB%A8)
 *    合肥日报《穹顶与星辰》 https://newspaper.hf365.com/hfwb/pc/content/202509/22/content_525804.html
 *    事实：清水红砖墙、屋面铁皮刷绿色漆；希腊/拉丁十字平面（拜占庭式）；中央直径10m的巨大
 *    「洋葱头」穹顶统率四翼棱锥形「帐篷顶」尖塔，主穹顶最高、钟楼略低，通高53.35m，
 *    中央大穹顶+四面4小穹顶。示意里把四翼小顶也做成洋葱头以便一眼辨认。
 *
 * R8 防洪纪念塔
 *    维基《哈爾濱市人民防洪勝利紀念塔》 https://zh.wiki2.org/wiki/%E5%93%88%E5%B0%94%E6%BB%A8%E9%98%B2%E6%B4%AA%E7%BA%AA%E5%BF%B5%E5%A1%94
 *    百度百科《防洪胜利纪念塔》 https://baike.baidu.com/view/4312.htm
 *    黑龙江省委史志研究室《塔镇江天 抗洪史诗铸丰碑》 https://www.hljszw.org.cn/news/3059.html
 *    事实：塔高22.5m，塔顶3.5m高工农兵与知识分子圆雕举红旗；塔身中部2.2m高、24人浮雕；
 *    20 根高7m科林斯圆柱组成35m长【半圆形】罗马回廊、顶端宽带连结；方形石砌塔基上窄下宽。
 *    据此做圆柱塔身 + 半圆环形柱廊 + 浮雕环带 + 顶部群雕。
 *
 * R9 龙塔
 *    维基百科浏览器《龍塔》 https://fbrowser.org/wikipedia/zh-tw/%E9%BE%99%E5%A1%94
 *    Wikiwand《龙塔》 https://www.wikiwand.com/zh/map/%E9%BE%8D%E5%A1%94
 *    搜狗百科《龙塔》 https://baike.sogou.com/v3224623.htm
 *    事实：全钢结构广播电视塔，高336m，2000年建成；塔座球冠形，塔身【正八边形】、整体
 *    【抛物线形】下宽上窄，中间圆柱井道；塔楼在181–206m由【飞碟状下塔楼 + 球形上塔楼】组成；
 *    天线220.5–336m；全钢架镂空/桁架。据此做收分塔身 + 透空桁架 + 碟形塔楼 + 天线。
 *
 * R10 哈尔滨大剧院
 *    中冶钢构《哈尔滨大剧院》 https://www.ssc-mcc.com/pod.jsp?id=804
 *    百度百科《哈尔滨大剧院》 https://baike.baidu.com/item/%E5%93%88%E5%B0%94%E6%BB%A8%E5%A4%A7%E5%89%A7%E9%99%A2/4293134
 *    网易《超惊艳!这座大剧院内部宛如"原始洞穴"》 https://www.163.com/dy/article/DNBTJ1N30511DTU9.html
 *    事实：马岩松 MAD 设计，松北区文化中心岛湿地中依水而建；【银白色】外观、【异型双曲面/
 *    三维自由曲面】「雪堆丘包」造型，如银色缎带/冰雪雕塑；金属复合幕墙 + 四棱锥玻璃采光顶。
 *    据此做白色曲面丘错落 + 玻璃带 + 基座平台。
 *
 * R11 滨洲铁路桥（老江桥）
 *    哈尔滨档案信息网《"老江桥"百年奇迹》 https://www.hrbdag.org.cn/hbfm/hbsh/2016/06/14588.html
 *    今日头条《松花江"老江桥"百年历史回眸》 https://m.toutiao.com/article/6587634085168939527/
 *    中文百科《濱洲鐵路橋》 https://www.newton.com.tw/wiki/%E6%BF%B1%E6%B4%B2%E9%90%B5%E8%B7%AF%E6%A9%8B/23536890
 *    事实：松花江第一座铁路桥（中东铁路第一桥），1900开工1901竣工；全长约1015m、宽7.2m、
 *    【19孔钢桁梁】（南8孔下承曲弦、北11孔上承华伦式），花岗岩料石镶面桥墩带破冰结构；
 *    厚重粗犷的钢桁架与铆钉，2014退役改观光步行桥。据此做多跨上下弦 + X形斜腹杆桁架 + 桥墩。
 *
 * R12 太阳岛 / 冰雪大世界
 *    合肥日报《穹顶与星辰》(太阳岛/松花江) https://newspaper.hf365.com/hfwb/pc/content/202509/22/content_525804.html
 *    说明：太阳岛为松花江北岸景区、冰雪大世界为冰雪雕塑主题园区，二者仅做主题示意
 *    （绿色基座 + 太阳雕塑 / 半透明冰晶城垛 + 彩灯），不追求精确复原。
 * RESEARCH_END
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// --------------------------------------------------------------- 常量/小工具 ---
const TILE_M = 12;      // 一张立面贴图横向 = 4 个 3 m 开间
const FLOOR_M = 12.8;   // 纵向 = 4 个 3.2 m 层高
const SNOW_UV = [0.5, 0.02]; // 贴图最顶部那条「雪白檐口带」，坡顶/平顶/混凝土部件采这里
const TEX = 256;
const CELL = 64;        // 贴图里 4x4 个窗单元，每格 64 px
const UP = new THREE.Vector3(0, 1, 0);

// 线性同余随机：seed 决定一栋楼阳台/烟囱/亮窗的确定性小变化
function rng(seed) {
  let s = (seed | 0) || 1;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}
// 确定性哈希：某个窗在「寒夜」是否亮灯，跨昼夜重绘保持一致
function litAt(cx, cy, key) {
  let n = (cx * 374761393 + cy * 668265263 + key.length * 2246822519) >>> 0;
  n = (n ^ (n >>> 13)) * 1274126177 >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * 把任意几何统一成「只有 position + uv 的 non-indexed 几何」，这样所有部件都能
 * 一起 mergeGeometries（要求属性集合一致），合并后再统一 computeVertexNormals，
 * 建筑正好是硬边/棱角分明，flat shading 合适。
 */
function prep(geo) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', src.getAttribute('position').clone());
  const uv = src.getAttribute('uv');
  if (uv) {
    out.setAttribute('uv', uv.clone());
  } else {
    const n = src.getAttribute('position').count;
    out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  }
  if (src !== geo) src.dispose();
  geo.dispose();
  return out;
}
function finish(parts) {
  const merged = parts.length > 1 ? mergeGeometries(parts) : parts[0];
  if (parts.length > 1) for (const g of parts) g.dispose();
  merged.computeVertexNormals();
  return merged;
}
function setAllUV(geo, u, v) {
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, u, v);
  uv.needsUpdate = true;
  return geo;
}

// ------------------------------------------------------------------- 立面贴图 ---
/**
 * 6 张可平铺立面贴图的昼/夜配色。w=墙色 nw=夜墙, corn=层间线脚 ncor=夜线脚,
 * glass=白天玻璃, frame=窗框 nframe=夜窗框, balcony=阳台栏板 nbal=夜阳台, mortar=砖缝。
 */
const FAC = {
  brick:    { w: '#cdb07c', nw: '#241f18', corn: '#f0e6cf', ncor: '#3b4350', glass: '#5b7387', frame: '#eaddc1', nframe: '#2b2723', balcony: '#ded2b4', nbal: '#23262c', mortar: 'rgba(120,90,55,.20)' },
  brickred: { w: '#ac5b41', nw: '#231814', corn: '#ecddc9', ncor: '#39404c', glass: '#546c80', frame: '#e6cfae', nframe: '#2a221f', balcony: '#d9bfa0', nbal: '#241f22', mortar: 'rgba(70,30,20,.22)' },
  slab:     { w: '#d8d2c4', nw: '#1f232a', corn: '#eef1f2', ncor: '#3a4552', glass: '#607e94', frame: '#c7cdd0', nframe: '#262c33', balcony: '#c3ccd2', nbal: '#20262d', mortar: 'rgba(120,120,110,.14)' },
  office:   { w: '#d8cdb2', nw: '#20232a', corn: '#efe7d2', ncor: '#3b4451', glass: '#526d82', frame: '#eee3c8', nframe: '#282b31', balcony: '#cfc6ad', nbal: '#232830', mortar: 'rgba(120,105,80,.16)' },
  glass:    { w: '#3f5a72', nw: '#0c1219', corn: '#9fb6c8', ncor: '#22303e', glass: '#41607c', frame: '#2e455c', nframe: '#161d26', balcony: '#8ba1b3', nbal: '#1a212b', mortar: 'rgba(0,0,0,0)' },
  shop:     { w: '#c8b48c', nw: '#221c17', corn: '#f3e9d4', ncor: '#3b4350', glass: '#58748a', frame: '#f0e2c4', nframe: '#2b2622', balcony: '#d9c39c', nbal: '#242129', mortar: 'rgba(110,88,55,.18)' },
};
const FACADE_KEYS = ['brick', 'brickred', 'slab', 'office', 'glass', 'shop'];

/** 画一个窗单元（4 开间 x 4 层里的一格）。 */
function drawBay(ctx, key, night, x, y, P) {
  const C = CELL;
  // 砖缝：横向细线，寒地砖混墙的层次感
  if (P.mortar !== 'rgba(0,0,0,0)') {
    ctx.strokeStyle = night ? 'rgba(0,0,0,.20)' : P.mortar;
    ctx.lineWidth = 1;
    for (let t = 1; t < 4; t += 1) {
      ctx.beginPath();
      ctx.moveTo(x, y + 8 + t * 16);
      ctx.lineTo(x + C, y + 8 + t * 16);
      ctx.stroke();
    }
  }
  const L = litAt(Math.floor(x / C), Math.floor(y / C), key);
  const isLit = night && L < 0.46;
  const glass = night ? (isLit ? (L < 0.16 ? '#fff2cf' : '#ffd79a') : '#0c1219') : P.glass;

  // 玻璃幕墙：整格玻璃 + 竖向龙骨 + 层间横梁（写字楼/产业园/现代商场）
  if (key === 'glass') {
    ctx.fillStyle = night ? (isLit ? '#ffdca0' : '#0a1017') : P.w;
    ctx.fillRect(x + 2, y + 11, C - 4, C - 13);
    if (!night) {
      const g = ctx.createLinearGradient(0, y + 11, 0, y + C);
      g.addColorStop(0, '#8fb6d4');
      g.addColorStop(1, '#3c5f7e');
      ctx.fillStyle = g;
      ctx.fillRect(x + 2, y + 11, C - 4, C - 13);
    }
    ctx.fillStyle = night ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.16)';
    ctx.fillRect(x + 7, y + 13, 8, C - 17);
    ctx.fillStyle = night ? '#161d26' : P.frame;
    ctx.fillRect(x, y + 8, 3, C - 8);   // 竖龙骨
    ctx.fillRect(x, y + 8, C, 3);       // 层间横梁
    return;
  }

  // 窗洞尺寸：办公是窄高竖窗，商厦是大橱窗，住宅是普通方窗
  let ww; let wh;
  if (key === 'office') { ww = 20; wh = 40; }
  else if (key === 'shop') { ww = 44; wh = 36; }
  else { ww = 30; wh = 34; }
  const wx = x + (C - ww) / 2;
  const wy = y + 16;

  // 厚窗洞外框（寒地厚墙、小窗，显得墙很实在）
  ctx.fillStyle = night ? P.nframe : P.frame;
  ctx.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
  ctx.fillStyle = glass;
  ctx.fillRect(wx, wy, ww, wh);
  if (!night) {
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    ctx.fillRect(wx + 2, wy + 2, ww * 0.34, wh - 4);
  }
  // 双层防冻窗：竖中挺 + 内圈第二层窗框 + 窗台
  ctx.fillStyle = night ? P.nframe : P.frame;
  ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh);
  ctx.strokeStyle = night ? 'rgba(0,0,0,.55)' : 'rgba(120,100,70,.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(wx + 3, wy + 3, ww - 6, wh - 6);
  ctx.fillStyle = night ? P.nframe : P.frame;
  ctx.fillRect(wx - 4, wy + wh + 2, ww + 8, 4);

  // 阳台：外凸栏板 + 竖向栏杆（住宅的标志）
  if (key === 'brick' || key === 'brickred' || key === 'slab') {
    const by = wy + wh + 7;
    ctx.fillStyle = night ? P.nbal : P.balcony;
    ctx.fillRect(wx - 5, by, ww + 10, 8);
    ctx.fillStyle = night ? 'rgba(0,0,0,.45)' : 'rgba(90,75,50,.38)';
    for (let i = 0; i < 5; i += 1) ctx.fillRect(wx - 3 + i * ((ww + 6) / 5), by + 2, 2, 6);
  }
  // 商厦拱窗：窗顶一个半圆，巴洛克/折衷味
  if (key === 'shop') {
    ctx.fillStyle = night ? (isLit ? '#ffdca0' : '#0c1219') : P.glass;
    ctx.beginPath();
    ctx.arc(wx + ww / 2, wy, ww / 2, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = night ? P.nframe : P.frame;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(wx + ww / 2, wy, ww / 2, Math.PI, 0);
    ctx.stroke();
  }
}

/** 重绘一张立面贴图（昼/夜两版共用同一 canvas，避免反复分配贴图对象）。 */
function paintFacade(ctx, key, night) {
  const P = FAC[key];
  ctx.clearRect(0, 0, TEX, TEX);
  ctx.fillStyle = night ? P.nw : P.w;
  ctx.fillRect(0, 0, TEX, TEX);
  for (let r = 0; r < 4; r += 1) {
    const y0 = r * CELL;
    // 每层顶部一条层间线脚带；第 0 行画成纯白雪带，专门给坡屋顶/平顶采样当「雪顶」
    const line = r === 0
      ? (night ? '#c9d6e1' : '#f3f8fb')
      : (night ? P.ncor : P.corn);
    ctx.fillStyle = line;
    ctx.fillRect(0, y0, TEX, 8);
    ctx.fillStyle = night ? 'rgba(0,0,0,.35)' : 'rgba(90,78,55,.20)';
    ctx.fillRect(0, y0 + 8, TEX, 3);
    for (let c = 0; c < 4; c += 1) drawBay(ctx, key, night, c * CELL, y0, P);
  }
  // 办公/商厦的竖向壁柱：贯穿层高的浅色竖线，俄式线脚感
  if (key === 'office' || key === 'shop') {
    ctx.fillStyle = night ? 'rgba(255,255,255,.05)' : 'rgba(255,250,235,.45)';
    for (let c = 0; c <= 4; c += 1) ctx.fillRect(c * CELL - 2, 0, 4, TEX);
  }
}

// --------------------------------------------------------------- 立面几何片段 ---
/** 立面盒子：4 个侧面按真实尺寸平铺 UV，顶/底面采雪白点（detail-city 同款做法）。 */
function facadeBox(w, h, d, y0 = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const face = (start, uSpan) => {
    for (let i = 0; i < 4; i += 1) {
      uv.setXY(start + i, uv.getX(start + i) * uSpan, uv.getY(start + i) * (h / FLOOR_M));
    }
  };
  face(0, d / TILE_M);   // +X 面宽 = depth
  face(4, d / TILE_M);   // -X
  face(16, w / TILE_M);  // +Z 正面宽 = width
  face(20, w / TILE_M);  // -Z
  for (const s of [8, 12]) for (let i = 0; i < 4; i += 1) uv.setXY(s + i, SNOW_UV[0], SNOW_UV[1]);
  g.translate(0, y0 + h / 2, 0);
  return g;
}
function fbox(w, h, d, y0 = 0, x = 0, z = 0) {
  const g = facadeBox(w, h, d, y0);
  g.translate(x, 0, z);
  return prep(g);
}
// 纯色浅部件（平顶檐口、女儿墙、塔尖、阳台块、机房）：UV 全采雪白点
function solidBox(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  setAllUV(g, SNOW_UV[0], SNOW_UV[1]);
  g.translate(x, y, z);
  return prep(g);
}
function solidCyl(r1, r2, h, seg, x, y, z) {
  const g = new THREE.CylinderGeometry(r1, r2, h, seg);
  setAllUV(g, SNOW_UV[0], SNOW_UV[1]);
  g.translate(x, y, z);
  return prep(g);
}
function solidCone(r, h, seg, x, y, z) {
  const g = new THREE.ConeGeometry(r, h, seg);
  setAllUV(g, SNOW_UV[0], SNOW_UV[1]);
  g.translate(x, y, z);
  return prep(g);
}
function solidLathe(profile, seg, x, y, z) {
  const g = new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p[0], p[1])), seg);
  setAllUV(g, SNOW_UV[0], SNOW_UV[1]);
  g.translate(x, y, z);
  return prep(g);
}
/** 多边形面（3 或 4 顶点）：三角扇展开成 non-indexed，自带 position+uv。 */
function polyGeo(points, uvs) {
  const pos = [];
  const uv = [];
  for (let i = 1; i < points.length - 1; i += 1) {
    for (const j of [0, i, i + 1]) {
      pos.push(points[j][0], points[j][1], points[j][2]);
      uv.push(uvs[j][0], uvs[j][1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return prep(g);
}
/** 双坡屋顶：两个雪白坡面 + 两面砖墙山墙。屋脊沿 X，坡面朝 ±Z。 */
function gableRoof(w, d, y0, rise, overhang = 0.7, ox = 0, oz = 0) {
  const W = w / 2 + overhang;
  const D = d / 2 + overhang;
  const Y = y0;
  const H = y0 + rise;
  const P = (a, b, c) => [a + ox, b, c + oz];
  const A = P(-W, Y, -D); const B = P(W, Y, -D);
  const Cc = P(-W, Y, D); const E = P(W, Y, D);
  const R0 = P(-W, H, 0); const R1 = P(W, H, 0);
  const snow = [SNOW_UV[0], SNOW_UV[1]];
  const wuv = (p) => [(p[2] + D - oz) / TILE_M, (p[1] - Y) / FLOOR_M];
  return [
    polyGeo([A, B, R1, R0], [snow, snow, snow, snow]),       // -Z 坡面
    polyGeo([E, Cc, R0, R1], [snow, snow, snow, snow]),      // +Z 坡面
    polyGeo([A, Cc, R0], [wuv(A), wuv(Cc), wuv(R0)]),        // -X 山墙
    polyGeo([B, E, R1], [wuv(B), wuv(E), wuv(R1)]),          // +X 山墙
  ];
}
/** 浅色平顶檐口（一圈略大的扁盒）。 */
function flatCap(w, d, y0, h = 0.9, over = 0.6) {
  return solidBox(w + over * 2, h, d + over * 2, 0, y0 + h / 2, 0);
}
/** 洋葱头/帐篷顶轮廓（从底部收颈，到鼓肚，再收到尖）。 */
const DOME_PROFILE = (r, hh) => [
  [0.55 * r, 0.00 * hh], [0.92 * r, 0.10 * hh], [1.00 * r, 0.30 * hh],
  [0.86 * r, 0.52 * hh], [0.58 * r, 0.74 * hh], [0.28 * r, 0.90 * hh],
  [0.06 * r, 0.99 * hh], [0.0, 1.00 * hh],
];

// ------------------------------------------------------------------- 类型表 ---
/**
 * TYPES：每个普通楼型的建模参数。facade=用哪张贴图，form=几何形态，
 * w/d/h=默认宽/深/主体高（米），rise=坡顶抬高。
 * landmark 类没有 facade/form，走各自的 build 函数。
 * sources 里的短名对应文件头 RESEARCH 段的编号（联网核实后的真实资料）。
 */
const TYPES = {
  // ---- 住宅 residential ----
  'res-zhonghua-baroque': { category: 'residential', facade: 'brickred', form: 'courtyard', w: 26, d: 18, h: 14, rise: 3.2 },
  'res-soviet-apartment': { category: 'residential', facade: 'brick', form: 'soviet-apt', w: 30, d: 14, h: 22, rise: 3 },
  'res-haxi-slab':        { category: 'residential', facade: 'slab', form: 'slab-tall', w: 26, d: 13, h: 56 },
  'res-dongbei-brick':    { category: 'residential', facade: 'brickred', form: 'lowrise-gable', w: 22, d: 12, h: 17, rise: 3.4 },
  'res-daoli-russian':    { category: 'residential', facade: 'brick', form: 'lowrise-gable', w: 20, d: 14, h: 15, rise: 3.8 },
  // ---- 办公 office ----
  'off-soviet-symmetric': { category: 'office', facade: 'office', form: 'office-symmetric', w: 38, d: 18, h: 30, rise: 3 },
  'off-glass-tower':      { category: 'office', facade: 'glass', form: 'office-tower', w: 20, d: 20, h: 72 },
  'off-railway-eclectic': { category: 'office', facade: 'office', form: 'office-eclectic', w: 40, d: 20, h: 26, rise: 3.2 },
  'off-campus-rnd':       { category: 'office', facade: 'glass', form: 'office-campus', w: 34, d: 16, h: 20 },
  // ---- 商业 commercial ----
  'com-central-euro':     { category: 'commercial', facade: 'shop', form: 'shop-euro', w: 24, d: 16, h: 13, rise: 3 },
  'com-qiulin-store':     { category: 'commercial', facade: 'brickred', form: 'shop-department', w: 28, d: 20, h: 20, rise: 3 },
  'com-modern-mall':      { category: 'commercial', facade: 'glass', form: 'shop-mall', w: 44, d: 30, h: 22 },
  'com-ice-lodge':        { category: 'commercial', facade: 'shop', form: 'shop-lodge', w: 12, d: 10, h: 7, rise: 5 },
  // ---- 地标 landmark（单独 Group，见 LANDMARK_BUILDERS）----
  'lm-st-sophia':       { category: 'landmark', builder: 'sophia' },
  'lm-flood-monument':  { category: 'landmark', builder: 'flood' },
  'lm-dragon-tower':    { category: 'landmark', builder: 'dragon' },
  'lm-grand-theatre':   { category: 'landmark', builder: 'theatre' },
  'lm-binzhou-bridge':  { category: 'landmark', builder: 'bridge' },
  'lm-sun-island':      { category: 'landmark', builder: 'sunIsland' },
  'lm-ice-world':       { category: 'landmark', builder: 'iceWorld' },
};

export const LANDMARK_IDS = [
  'lm-st-sophia', 'lm-flood-monument', 'lm-dragon-tower', 'lm-grand-theatre',
  'lm-binzhou-bridge', 'lm-sun-island', 'lm-ice-world',
];

/**
 * 地标 id 别名：集成层 route-data.js / stream.js 的 Chunk.landmarkIds 用的是
 * saint-sophia / flood-monument / songhua-rail-bridge，和本目录 lm-* 命名对不上。
 * 在 make()/instanced() 入口统一做一次归一化，双方都不用改文件；未知 id 原样放行。
 */
const LANDMARK_ALIAS = {
  'saint-sophia': 'lm-st-sophia',
  'flood-monument': 'lm-flood-monument',
  'songhua-rail-bridge': 'lm-binzhou-bridge',
};
function resolveId(id) {
  return LANDMARK_ALIAS[id] || id;
}

/** 对外目录：20 个类型，含中文名/风格/示意说明/资料来源短名。 */
export const BUILDING_CATALOG = [
  { id: 'res-zhonghua-baroque', category: 'residential', name: '道外中华巴洛克里院住宅', style: '中式院落+西式巴洛克线脚', note: '临街圈楼围合内院，砖红墙、拱券与砖雕线脚、坡顶积雪；示意的 L 形围合体量。', sources: ['R1', 'R4'] },
  { id: 'res-soviet-apartment', category: 'residential', name: '南岗苏式家属楼', style: '中轴对称苏式', note: '暖黄砖墙、厚墙小窗、中部升高的门厅山花、缓坡雪顶，对称阳台列。', sources: ['R2', 'R4'] },
  { id: 'res-haxi-slab', category: 'residential', name: '哈西/群力高层板式住宅', style: '新区高层板楼', note: '细高板式体量、平屋顶女儿墙、规整窗带、竖向阳台列与屋顶机房。', sources: ['R3'] },
  { id: 'res-dongbei-brick', category: 'residential', name: '东北多层砖混坡顶住宅', style: '寒地砖混', note: '砖红墙、双层防冻窗、外凸阳台、明显双坡雪顶与烟囱。', sources: ['R4'] },
  { id: 'res-daoli-russian', category: 'residential', name: '道里俄式多层住宅', style: '俄式砖木', note: '暖黄砖墙、陡坡雪顶、白色线脚与厚窗洞，体量比苏式家属楼更小。', sources: ['R2', 'R4'] },
  { id: 'off-soviet-symmetric', category: 'office', name: '苏联式对称办公楼', style: '斯大林式对称', note: '宽体两翼+中轴高塔+塔尖，前立面柱廊门廊，中轴对称一眼可辨。', sources: ['R5'] },
  { id: 'off-glass-tower', category: 'office', name: '玻璃幕墙写字楼', style: '现代高层', note: '细高玻璃塔、顶部收分、平顶檐口与屋面天线。', sources: ['R5'] },
  { id: 'off-railway-eclectic', category: 'office', name: '铁路局折衷主义办公楼', style: '折衷主义', note: '宽体坡顶+中部穹顶塔+门廊柱，米黄石墙与竖向壁柱。', sources: ['R5'] },
  { id: 'off-campus-rnd', category: 'office', name: '产业园研发楼', style: '现代园区', note: '扁平多层板楼、玻璃中庭、平顶女儿墙，体量横向铺开。', sources: ['R5'] },
  { id: 'com-central-euro', category: 'commercial', name: '中央大街欧式商厦', style: '欧式折衷商厦', note: '两三层、坡顶、转角小穹顶塔、大拱橱窗与通长腰线。', sources: ['R6'] },
  { id: 'com-qiulin-store', category: 'commercial', name: '秋林公司老百货', style: '巴洛克老百货', note: '砖红墙、转角塔楼与尖顶、巴洛克线脚，示意老百货转角体量。', sources: ['R6'] },
  { id: 'com-modern-mall', category: 'commercial', name: '现代购物中心', style: '现代商业综合体', note: '大体量玻璃盒子、平顶、入口中庭雨棚与屋顶招牌块。', sources: ['R6'] },
  { id: 'com-ice-lodge', category: 'commercial', name: '冰雪旅游街坡顶木屋', style: '冰雪木屋', note: '小体量、陡坡雪顶、暖木色墙与门廊，示意旅游商业街小店。', sources: ['R6', 'R12'] },
  { id: 'lm-st-sophia', category: 'landmark', name: '圣索菲亚教堂', style: '拜占庭式', note: '清水红砖墙+绿漆屋面，中央巨大洋葱头穹顶统率四翼帐篷顶尖塔（示意把四翼小顶也做成洋葱头以便辨认）+金十字。', sources: ['R7'] },
  { id: 'lm-flood-monument', category: 'landmark', name: '防洪纪念塔', style: '纪念性柱廊塔', note: '圆柱塔身+20根科林斯柱的35m半圆回廊+24人浮雕环带+顶部群雕，方形石砌塔基。', sources: ['R8'] },
  { id: 'lm-dragon-tower', category: 'landmark', name: '龙塔', style: '钢结构电视塔', note: '下宽上窄塔身、透空钢桁架、上部碟形塔楼与细天线。', sources: ['R9'] },
  { id: 'lm-grand-theatre', category: 'landmark', name: '哈尔滨大剧院', style: '白色流线曲面', note: '白色曲面丘体错落、玻璃带与流线肋，示意湿地中的曲面造型。', sources: ['R10'] },
  { id: 'lm-binzhou-bridge', category: 'landmark', name: '滨洲铁路桥', style: '钢桁架桥', note: '多跨钢桁架：上下弦+X 形斜腹杆+竖杆，落在若干桥墩上。', sources: ['R11'] },
  { id: 'lm-sun-island', category: 'landmark', name: '太阳岛', style: '冰雪/太阳主题示意', note: '绿色基座+白色太阳雕塑放射光芒+几栋小坡顶屋，示意景区入口。', sources: ['R12'] },
  { id: 'lm-ice-world', category: 'landmark', name: '冰雪大世界', style: '冰建城垛示意', note: '半透明冰晶城垛错落、冰塔与彩色灯点，示意冰雪雕塑群。', sources: ['R12'] },
];

// ------------------------------------------------------- 普通楼几何（按 form） ---
/**
 * 按 TYPES 的 form 生成一栋楼的合并几何。dims 可被 make() 的 width/depth/height 覆盖。
 * 所有部件最终 merge 成一个几何，配一个立面材质 → 一个 InstancedMesh = 1 draw call。
 */
function buildTypeGeometry(id, dims, seed) {
  const s = TYPES[id];
  const w = dims.w; const d = dims.d; const h = dims.h;
  const rise = s.rise || 0;
  const rnd = rng(seed);
  const P = [];
  switch (s.form) {
    case 'slab-tall': { // 新区高层板楼：主板 + 平顶檐 + 机房 + 竖向阳台条
      P.push(fbox(w, h, d, 0));
      P.push(flatCap(w, d, h));
      P.push(solidBox(w * 0.3, 2.8, d * 0.45, w * 0.18, h + 0.9 + 1.4, 0));
      const n = clamp(Math.floor(w / 7), 2, 4);
      for (let i = 0; i < n; i += 1) {
        const x = -w / 2 + ((i + 0.5) * w) / n;
        P.push(solidBox(1.5, h * 0.9, 0.7, x, h * 0.46, d / 2 + 0.35)); // 竖向阳台/凸窗列
      }
      break;
    }
    case 'lowrise-gable': { // 东北多层砖混：盒子 + 双坡雪顶 + 阳台 + 烟囱
      P.push(fbox(w, h, d, 0));
      P.push(...gableRoof(w, d, h, rise));
      const cols = clamp(Math.floor(w / 7), 2, 4);
      const floors = 3;
      for (let f = 0; f < floors; f += 1) {
        for (let c = 0; c < cols; c += 1) {
          const x = -w / 2 + ((c + 0.5) * w) / cols;
          const y = 3.2 + f * 4.6;
          P.push(solidBox(1.8, 0.8, 0.8, x, y, d / 2 + 0.4));
        }
      }
      P.push(solidBox(0.9, rise * 0.9, 0.9, (rnd() - 0.5) * w * 0.5, h + rise * 0.45, -d * 0.2)); // seed 决定烟囱左右位置
      break;
    }
    case 'soviet-apt': { // 苏式家属楼：对称主体 + 缓坡顶 + 中部升高门厅 + 山花小尖顶
      P.push(fbox(w, h, d, 0));
      P.push(...gableRoof(w, d, h, rise));
      P.push(fbox(w * 0.24, h * 1.08, d * 1.16, 0, 0, 0));
      P.push(solidCone(w * 0.15, rise * 0.95, 4, 0, h * 1.08 + rise * 0.48, 0));
      for (const sx of [-1, 1]) {
        for (let f = 0; f < 4; f += 1) {
          P.push(solidBox(1.6, 0.7, 0.8, sx * w * 0.3, 4 + f * 4.6, d / 2 + 0.35));
        }
      }
      break;
    }
    case 'courtyard': { // 中华巴洛克：后楼 + 左右两翼围成院，沿街女儿墙
      const back = d * 0.42; const wingW = w * 0.32; const wingD = d * 0.55;
      P.push(fbox(w, h, back, 0, 0, -d * 0.27));
      P.push(fbox(wingW, h, wingD, 0, -w / 2 + wingW / 2, d * 0.14));
      P.push(fbox(wingW, h, wingD, 0, w / 2 - wingW / 2, d * 0.14));
      P.push(...gableRoof(w, back, h, rise * 0.7, 0.6, 0, -d * 0.27));
      P.push(...gableRoof(wingW, wingD, h, rise * 0.7, 0.5, -w / 2 + wingW / 2, d * 0.14));
      P.push(...gableRoof(wingW, wingD, h, rise * 0.7, 0.5, w / 2 - wingW / 2, d * 0.14));
      P.push(solidBox(w, 1.2, 0.5, 0, h + 0.6, d * 0.3)); // 沿街牌坊式女儿墙
      break;
    }
    case 'office-symmetric': { // 苏式对称办公：宽体两翼 + 中轴高塔 + 塔尖 + 柱廊
      P.push(fbox(w, h, d, 0));
      P.push(fbox(w * 0.3, h * 1.5, d * 1.08, 0, 0, 0));
      P.push(...gableRoof(w, d, h, rise * 0.5));
      P.push(solidCone(w * 0.17, rise * 1.7, 8, 0, h * 1.5 + rise * 0.85, 0));
      const cols = 8;
      for (let i = 0; i < cols; i += 1) {
        const x = -w * 0.28 + (i * w * 0.56) / (cols - 1);
        P.push(solidCyl(0.45, 0.45, h * 0.42, 8, x, h * 0.21, d / 2 + 1.8));
      }
      P.push(solidBox(w * 0.32, 1.0, 4.2, 0, h * 0.44, d / 2 + 1.8)); // 门廊檐
      break;
    }
    case 'office-tower': { // 玻璃写字楼：细高塔 + 顶部收分 + 檐口 + 天线
      P.push(fbox(w, h, d, 0));
      P.push(fbox(w * 0.7, h * 0.13, d * 0.7, h));
      P.push(flatCap(w * 0.72, d * 0.72, h + h * 0.13, 0.8, 0.4));
      P.push(solidCyl(0.28, 0.28, 6, 8, 0, h + h * 0.13 + 3.4, 0));
      break;
    }
    case 'office-eclectic': { // 折衷主义办公：坡顶 + 中部穹顶塔 + 柱廊门廊
      P.push(fbox(w, h, d, 0));
      P.push(...gableRoof(w, d, h, rise));
      P.push(fbox(w * 0.2, h * 1.22, d * 0.66, 0, 0, 0));
      P.push(solidLathe(DOME_PROFILE(w * 0.14, rise * 1.5), 16, 0, h * 1.22, 0));
      for (const sx of [-1, 1]) {
        P.push(solidCyl(0.5, 0.5, h * 0.34, 8, sx * w * 0.14, h * 0.17, d / 2 + 1.4));
      }
      P.push(solidBox(w * 0.2, 0.9, 3.4, 0, h * 0.35, d / 2 + 1.4));
      break;
    }
    case 'office-campus': { // 产业园研发楼：扁平板 + 玻璃中庭 + 平顶檐
      P.push(fbox(w, h, d, 0));
      P.push(flatCap(w, d, h));
      P.push(fbox(w * 0.26, h * 1.08, d * 0.42, 0, 0, d * 0.3));
      P.push(solidBox(w * 0.3, 0.7, d * 0.5, 0, h * 1.08 + 0.4, d * 0.3));
      break;
    }
    case 'shop-euro': { // 中央大街欧式商厦：坡顶 + 转角穹顶小塔 + 腰线
      P.push(fbox(w, h, d, 0));
      P.push(...gableRoof(w, d, h, rise));
      P.push(fbox(5, h * 1.18, 5, 0, w / 2 - 2.5, d / 2 - 2.5));
      P.push(solidCone(3.4, rise * 1.4, 8, w / 2 - 2.5, h * 1.18 + rise * 0.7, d / 2 - 2.5));
      P.push(solidBox(w + 1, 0.8, d + 1, 0, h * 0.5, 0)); // 通长腰线
      break;
    }
    case 'shop-department': { // 秋林老百货：坡顶 + 转角塔楼尖顶
      P.push(fbox(w, h, d, 0));
      P.push(...gableRoof(w, d, h, rise));
      const tx = w / 2 - 3.5; const tz = d / 2 - 3.5;
      P.push(fbox(7, h * 1.42, 7, 0, tx, tz));
      P.push(solidCone(4.6, rise * 1.8, 8, tx, h * 1.42 + rise * 0.9, tz));
      P.push(solidCyl(0.2, 0.2, 2.2, 6, tx, h * 1.42 + rise * 1.8 + 1.1, tz));
      break;
    }
    case 'shop-mall': { // 现代购物中心：大玻璃盒 + 平顶 + 招牌 + 入口雨棚
      P.push(fbox(w, h, d, 0));
      P.push(flatCap(w, d, h, 1.0));
      P.push(solidBox(w * 0.4, 3.0, 1.0, 0, h * 0.42, d / 2 + 0.6));
      P.push(solidBox(w * 0.5, 2.2, 0.5, 0, h + 1.6, d / 2 - 1));
      break;
    }
    case 'shop-lodge': { // 冰雪坡顶木屋：小体量 + 陡坡雪顶 + 门廊
      P.push(fbox(w, h, d, 0));
      P.push(...gableRoof(w, d, h, rise, 0.9));
      P.push(solidBox(w * 0.5, 0.6, 2.4, 0, h * 0.7, d / 2 + 1.0));
      P.push(solidBox(0.6, rise * 0.8, 0.6, -w * 0.28, h + rise * 0.4, -d * 0.15)); // 烟囱
      break;
    }
    default:
      P.push(fbox(w, h, d, 0));
  }
  void rnd;
  return finish(P);
}

// --------------------------------------------------------------- 地标几何 ---
// 地标走「纯色材质 + 程序化几何」，不占 6 张立面贴图名额。同色部件合并成一个 mesh，
// 单个地标控制在 <= 8 个 mesh。
const LM = {
  brick: 0x9c4a3a, brickDark: 0x79362a, white: 0xeef2f4, stone: 0xd9cdb2,
  gold: 0xc9a24a, green: 0x3f6b56, metal: 0x8a97a3, metalDark: 0x4c5862,
  glass: 0x6a9fc0, ice: 0xbfe0ef, lamp: 0xffd9a0, lawn: 0x6f8f5a, wood: 0x8a5a3c,
};
const boxG = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
const cylG = (r1, r2, h, seg, x, y, z) => { const g = new THREE.CylinderGeometry(r1, r2, h, seg); g.translate(x, y, z); return g; };
const coneG = (r, h, seg, x, y, z) => { const g = new THREE.ConeGeometry(r, h, seg); g.translate(x, y, z); return g; };
const sphereG = (r, x, y, z, seg = 16) => { const g = new THREE.SphereGeometry(r, seg, Math.max(8, seg / 2)); g.translate(x, y, z); return g; };
const latheG = (profile, seg, x, y, z) => {
  const g = new THREE.LatheGeometry(profile.map((p) => new THREE.Vector2(p[0], p[1])), seg);
  g.translate(x, y, z);
  return g;
};
const torusG = (r, t, x, y, z) => { const g = new THREE.TorusGeometry(r, t, 8, 24); g.rotateX(Math.PI / 2); g.translate(x, y, z); return g; };
const strutG = (a, b, r, seg = 6) => {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const dir = new THREE.Vector3().subVectors(to, from);
  const g = new THREE.CylinderGeometry(r, r, dir.length(), seg);
  g.translate(0, dir.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()));
  g.translate(from.x, from.y, from.z);
  return g;
};
/** 把一组同色部件合并成一个 mesh（几何登记给工厂统一 dispose）。 */
function solidMesh(parts, matKey, track) {
  const prepped = parts.map(prep);
  const merged = finish(prepped);
  track(merged);
  const mesh = new THREE.Mesh(merged, landmarkMat(matKey));
  mesh.castShadow = true;
  return mesh;
}

const ONION = (r, hh) => [
  [0.55 * r, 0], [0.92 * r, 0.10 * hh], [1.0 * r, 0.30 * hh], [0.86 * r, 0.52 * hh],
  [0.58 * r, 0.74 * hh], [0.28 * r, 0.90 * hh], [0.06 * r, 0.99 * hh], [0, hh],
];

const LANDMARK_BUILDERS = {
  // 圣索菲亚教堂：红砖主体 + 鼓座 + 大洋葱顶 + 四角小洋葱顶 + 入口帐篷顶 + 金十字
  sophia(g, M, track) {
    const bodies = [
      boxG(14, 16, 14, 0, 8, 0),           // 主方体
      boxG(9, 4, 9, 0, 18, 0),             // 鼓座
      boxG(6, 9, 3, 0, 6, 8.5),            // 主入口凸出
      boxG(11, 1, 11, 0, 16.4, 0),         // 檐口线脚
    ];
    g.add(solidMesh(bodies, 'brick', track));
    const domes = [
      latheG(ONION(5.6, 8), 20, 0, 20, 0),          // 大洋葱顶
      latheG(ONION(2.0, 3.4), 16, -5, 16, -5),
      latheG(ONION(2.0, 3.4), 16, 5, 16, -5),
      latheG(ONION(2.0, 3.4), 16, -5, 16, 5),
      latheG(ONION(2.0, 3.4), 16, 5, 16, 5),
      coneG(3.4, 5.5, 8, 0, 12.7, 8.5),             // 入口帐篷顶
    ];
    g.add(solidMesh(domes, 'green', track));
    const crosses = [
      boxG(0.35, 2.6, 0.35, 0, 29.3, 0),
      boxG(1.6, 0.35, 0.35, 0, 29.8, 0),
    ];
    for (const [x, z, y] of [[-5, -5, 20.2], [5, -5, 20.2], [-5, 5, 20.2], [5, 5, 20.2]]) {
      crosses.push(boxG(0.22, 1.5, 0.22, x, y, z));
      crosses.push(boxG(0.9, 0.22, 0.22, x, y + 0.4, z));
    }
    g.add(solidMesh(crosses, 'gold', track));
    g.add(solidMesh([boxG(15, 1.2, 15, 0, 0.6, 0)], 'stone', track)); // 基座
  },
  // 防洪纪念塔：圆柱塔身 + 环形柱廊 + 浮雕环 + 顶部雕像
  flood(g, M, track) {
    const stone = [
      cylG(9, 10, 2, 24, 0, 1, 0),         // 圆形基座
      cylG(4.2, 4.6, 20, 20, 0, 12, 0),   // 塔身
      cylG(5.2, 4.2, 2.4, 20, 0, 23.2, 0),// 上部收分
    ];
    const cols = 20; // 真实：20 根高 7m 科林斯柱，35m 长半圆形罗马回廊
    for (let i = 0; i < cols; i += 1) {
      const a = (i / (cols - 1)) * Math.PI; // 只排半圈，落在 +Z 一侧
      stone.push(cylG(0.55, 0.55, 9, 10, Math.cos(a) * 6.6, 6.5, Math.sin(a) * 6.6));
    }
    stone.push(torusG(6.6, 0.6, 0, 11.2, 0)); // 柱廊檐环
    g.add(solidMesh(stone, 'stone', track));
    g.add(solidMesh([
      torusG(4.5, 0.5, 0, 16, 0),          // 浮雕环带
      torusG(4.5, 0.4, 0, 19.5, 0),
      cylG(4.7, 4.7, 0.5, 20, 0, 10.5, 0),
    ], 'gold', track));
    g.add(solidMesh([
      sphereG(1.6, 0, 26, 0),              // 顶部群雕示意
      coneG(1.6, 3.2, 10, 0, 27.4, 0),
      cylG(0.25, 0.25, 3, 8, 0, 30.5, 0),
    ], 'white', track));
  },
  // 龙塔：下宽上窄塔身 + 透空钢桁架 + 碟形塔楼 + 天线
  dragon(g, M, track) {
    g.add(solidMesh([cylG(7, 8.5, 3, 16, 0, 1.5, 0)], 'stone', track));
    const steel = [cylG(2.6, 5.5, 20, 12, 0, 13, 0)];
    // 透空桁架段：4 根斜柱 + X 形斜撑
    const y0 = 23; const y1 = 48; const r0 = 3.4; const r1 = 1.3; const sides = 4;
    for (let i = 0; i < sides; i += 1) {
      const a0 = (i / sides) * Math.PI * 2; const a1 = ((i + 1) / sides) * Math.PI * 2;
      const p0 = [Math.cos(a0) * r0, y0, Math.sin(a0) * r0];
      const q0 = [Math.cos(a1) * r0, y0, Math.sin(a1) * r0];
      const p1 = [Math.cos(a0) * r1, y1, Math.sin(a0) * r1];
      const q1 = [Math.cos(a1) * r1, y1, Math.sin(a1) * r1];
      steel.push(strutG(p0, p1, 0.22));
      steel.push(strutG(p0, q1, 0.14));
      steel.push(strutG(q0, p1, 0.14));
      for (let k = 1; k < 4; k += 1) {
        const t = k / 4;
        const ya = y0 + (y1 - y0) * t; const ra = r0 + (r1 - r0) * t;
        const A = [Math.cos(a0) * ra, ya, Math.sin(a0) * ra];
        const B = [Math.cos(a1) * ra, ya, Math.sin(a1) * ra];
        steel.push(strutG(A, B, 0.1));
      }
    }
    steel.push(cylG(0.18, 0.18, 12, 8, 0, 70, 0)); // 天线
    g.add(solidMesh(steel, 'metal', track));
    g.add(solidMesh([
      cylG(5.5, 3.0, 4, 20, 0, 52, 0),    // 碟形塔楼
      cylG(3.0, 5.5, 3, 20, 0, 55.5, 0),
      torusG(5.2, 0.35, 0, 50, 0),
    ], 'glass', track));
    g.add(solidMesh([torusG(5.4, 0.4, 0, 54, 0), cylG(0.4, 0.4, 2, 10, 0, 58, 0)], 'gold', track));
  },
  // 哈尔滨大剧院：白色流线曲面丘错落 + 玻璃带 + 流线肋
  theatre(g, M, track) {
    const hills = [];
    const mk = (r, sx, sz, x, z) => {
      const h = new THREE.SphereGeometry(r, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      h.scale(sx, 0.62, sz); h.translate(x, 0, z); hills.push(h);
    };
    mk(16, 1.5, 1.0, -6, -2);
    mk(11, 1.3, 0.95, 12, 5);
    mk(8, 1.2, 1.0, -14, 8);
    g.add(solidMesh(hills, 'white', track));
    g.add(solidMesh([boxG(52, 1.2, 34, 0, 0.6, 0)], 'stone', track)); // 基座平台
    const ribs = [];
    for (let i = 0; i < 5; i += 1) {
      // 等高线式流线肋：保持水平并逐圈抬高，倾斜会让大半径环穿到 y<0
      ribs.push(torusG(15 - i * 1.4, 0.35, -6, 2.2 + i * 0.5, -2));
    }
    ribs.push(boxG(20, 3, 0.5, 0, 3.2, 15.5)); // 玻璃带示意
    g.add(solidMesh(ribs, 'glass', track));
  },
  // 滨洲铁路桥：多跨钢桁架 + 桥墩
  bridge(g, M, track) {
    const steel = [];
    const L = 72; const bays = 8; const span = L / bays; const H = 11; const DECK = 2.4;
    for (let b = 0; b < bays; b += 1) {
      const x0 = -L / 2 + b * span; const x1 = x0 + span;
      for (const z of [-3.2, 3.2]) {
        steel.push(boxG(span, 0.6, 0.7, (x0 + x1) / 2, H, z));      // 上弦
        steel.push(boxG(span, 0.6, 0.7, (x0 + x1) / 2, DECK, z));   // 下弦
        steel.push(strutG([x0, DECK, z], [x1, H, z], 0.22));         // X 形斜腹杆
        steel.push(strutG([x0, H, z], [x1, DECK, z], 0.22));
        steel.push(strutG([(x0 + x1) / 2, DECK, z], [(x0 + x1) / 2, H, z], 0.18));
      }
      steel.push(boxG(0.6, 0.5, 6.4, x0, H, 0)); // 横向联结
    }
    steel.push(boxG(L, 0.5, 7.4, 0, DECK - 0.35, 0)); // 桥面贴下弦
    g.add(solidMesh(steel, 'metalDark', track));
    const piers = [];
    for (let b = 0; b <= bays; b += 1) {
      const x = -L / 2 + b * span;
      piers.push(cylG(1.6, 2.0, DECK, 10, x, DECK / 2, 0)); // 桥墩从 y=0 顶到下弦，绝不往地下穿
    }
    g.add(solidMesh(piers, 'stone', track));
  },
  // 太阳岛：绿色基座 + 白色太阳雕塑放射光芒 + 小坡顶屋
  sunIsland(g, M, track) {
    g.add(solidMesh([cylG(11, 11, 1.2, 24, 0, 0.6, 0)], 'lawn', track));
    const rays = [sphereG(2.6, 0, 7.5, 0)];
    const n = 12;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const r = strutG(
        [Math.cos(a) * 3.0, 7.5, Math.sin(a) * 3.0],
        [Math.cos(a) * 6.2, 7.5, Math.sin(a) * 6.2], 0.35,
      );
      rays.push(r);
    }
    rays.push(cylG(0.8, 1.0, 5.0, 10, 0, 4.2, 0)); // 立柱
    g.add(solidMesh(rays, 'white', track));
    const huts = [];
    for (const [x, z] of [[-6, -4], [6, 3]]) {
      huts.push(boxG(3.2, 2.4, 3.0, x, 1.2, z));
      huts.push(coneG(2.6, 2.0, 4, x, 3.4, z));
    }
    g.add(solidMesh(huts, 'wood', track));
  },
  // 冰雪大世界：半透明冰晶城垛 + 冰塔 + 彩色灯点
  iceWorld(g, M, track) {
    g.add(solidMesh([boxG(26, 1.0, 20, 0, 0.5, 0)], 'white', track));
    const ice = [];
    const towers = [
      [-8, -5, 3, 3, 12], [-3, -6, 2.4, 2.4, 8], [4, -4, 3.4, 3, 15],
      [9, 2, 2.6, 2.6, 9], [0, 4, 4, 3.4, 18], [-7, 5, 2.2, 2.2, 7],
    ];
    for (const [x, z, w, d, h] of towers) {
      ice.push(boxG(w, h, d, x, h / 2, z));
      ice.push(coneG(w * 0.8, 3, 4, x, h + 1.5, z));
    }
    ice.push(boxG(20, 2, 1.2, 0, 6, -8)); // 冰城墙
    g.add(solidMesh(ice, 'ice', track));
    const lamps = [];
    for (const [x, z, w, d, h] of towers) {
      lamps.push(sphereG(0.5, x, h + 3.4, z, 8));
      lamps.push(sphereG(0.35, x + w * 0.4, 1.4, z + d * 0.5, 8));
    }
    g.add(solidMesh(lamps, 'lamp', track));
  },
};

// --------------------------------------------------------------------- 工厂 ---
/** 地标纯色材质缓存（模块级，多个工厂共享；dispose 只由各工厂 own 记录负责）。 */
const landmarkMatCache = new Map();
function landmarkMat(key) {
  let m = landmarkMatCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: LM[key], roughness: key === 'metal' || key === 'metalDark' || key === 'gold' ? 0.4 : 0.82,
      metalness: key === 'metal' || key === 'metalDark' || key === 'gold' ? 0.62 : 0.05,
      side: THREE.DoubleSide,
      transparent: key === 'ice', opacity: key === 'ice' ? 0.72 : 1,
      emissive: key === 'lamp' ? new THREE.Color(LM.lamp) : new THREE.Color(0x000000),
      emissiveIntensity: key === 'lamp' ? 0.9 : 0,
    });
    landmarkMatCache.set(key, m);
  }
  return m;
}

/**
 * 创建建筑工厂。返回 { catalog, make, instanced, setNight, applyTheme, dispose }。
 *  - make(typeId, {seed,night,width,depth,height}) → THREE.Group，单栋，原点地面中心。
 *  - instanced(typeId, specs, opts) → THREE.InstancedMesh（普通楼，几十栋一次 draw call）；
 *    地标类型返回摆放好的 THREE.Group（地标约定单独 Group，不做 InstancedMesh）。
 *    specs: [{ x, z, rotY, scale(number|[x,y,z]), tint(number|Color|hex|css) }]。
 *  - setNight(bool) / applyTheme(theme) 切换寒夜亮窗；dispose() 释放独占资源。
 */
export function createBuildingFactory() {
  const catalog = BUILDING_CATALOG;
  const ownedGeo = new Set();
  const ownedMat = new Set();
  const ownedTex = new Set();
  const geoCache = new Map();
  const facade = {};      // key -> { canvas, ctx, tex, mat }
  let nightState = false;

  const trackGeo = (g) => { ownedGeo.add(g); return g; };

  // 预建 6 张可平铺立面贴图（整模块贴图数固定 = 6，切换昼夜只重绘不新增）
  for (const key of FACADE_KEYS) {
    const canvas = document.createElement('canvas');
    canvas.width = TEX;
    canvas.height = TEX;
    const ctx = canvas.getContext('2d');
    paintFacade(ctx, key, false);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: key === 'glass' ? 0.26 : 0.86,
      metalness: key === 'glass' ? 0.5 : 0.04,
      side: THREE.DoubleSide,
      emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0,
    });
    facade[key] = { canvas, ctx, tex, mat };
    ownedTex.add(tex);
    ownedMat.add(mat);
  }

  const facadeMat = (key) => facade[key].mat;

  function dimsOf(spec, opts) {
    return {
      w: Math.max(4, opts.width ?? spec.w ?? 20),
      d: Math.max(4, opts.depth ?? spec.d ?? 14),
      h: Math.max(3, opts.height ?? spec.h ?? 18),
    };
  }
  function cachedGeo(id) {
    let g = geoCache.get(id);
    if (!g) {
      g = trackGeo(buildTypeGeometry(id, dimsOf(TYPES[id], {}), 0));
      geoCache.set(id, g);
    }
    return g;
  }
  function makeLandmark(id) {
    const g = new THREE.Group();
    g.name = 'bld:' + id;
    const builder = LANDMARK_BUILDERS[TYPES[id].builder];
    const track = (geo) => { ownedGeo.add(geo); return geo; };
    builder(g, LM, track); // 各 builder 内部按颜色分 mesh，<= 8 个
    for (const key of landmarkMatCache.keys()) ownedMat.add(landmarkMatCache.get(key));
    return g;
  }

  function make(typeId, opts = {}) {
    typeId = resolveId(typeId); // 兼容 route 层 Chunk.landmarkIds 的别名
    const spec = TYPES[typeId];
    if (!spec) { console.warn('[buildings] 未知类型:', typeId); return new THREE.Group(); }
    if (spec.category === 'landmark') return makeLandmark(typeId);
    const geo = trackGeo(buildTypeGeometry(typeId, dimsOf(spec, opts), opts.seed ?? 1));
    let mat = facadeMat(spec.facade);
    // 单栋若显式要求与全局不同的夜色，做一个材质克隆（贴图仍共享），保证接口可用
    if (typeof opts.night === 'boolean' && opts.night !== nightState) {
      mat = mat.clone();
      mat.emissiveIntensity = opts.night ? 0.6 : 0;
      ownedMat.add(mat);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const group = new THREE.Group();
    group.name = 'bld:' + typeId;
    group.add(mesh);
    return group;
  }

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _c = new THREE.Color();
  function applyScale(v, scale) {
    if (Array.isArray(scale)) _s.set(scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1);
    else { const k = scale ?? 1; _s.set(k, k, k); }
    return _s;
  }
  function applyTint(tint) {
    if (tint == null) _c.setRGB(1, 1, 1);
    else if (typeof tint === 'number' && tint <= 2) _c.setRGB(tint, tint, tint); // 灰度乘子
    else if (tint.isColor) _c.copy(tint);
    else _c.set(tint); // hex / css 字符串
    return _c;
  }

  function instanced(typeId, specs, opts = {}) {
    void opts;
    typeId = resolveId(typeId); // 兼容 route 层 Chunk.landmarkIds 的别名
    const spec = TYPES[typeId];
    if (!spec) { console.warn('[buildings] 未知类型:', typeId); return null; }
    const list = Array.isArray(specs) ? specs : [];
    if (spec.category === 'landmark') {
      // 地标按真实方位摆位：直接摆若干 make 出来的 Group（数量少，不做 InstancedMesh）
      const group = new THREE.Group();
      group.name = 'bld-group:' + typeId;
      for (const s of list) {
        const one = makeLandmark(typeId);
        one.position.set(s.x ?? 0, 0, s.z ?? 0);
        one.rotation.y = s.rotY ?? 0;
        const sc = s.scale ?? 1;
        if (Array.isArray(sc)) one.scale.set(sc[0] ?? 1, sc[1] ?? 1, sc[2] ?? 1);
        else one.scale.set(sc, sc, sc);
        group.add(one);
      }
      return group;
    }
    const geo = cachedGeo(typeId);
    const mesh = new THREE.InstancedMesh(geo, facadeMat(spec.facade), Math.max(1, list.length));
    mesh.name = 'bld-inst:' + typeId;
    mesh.frustumCulled = false;        // 一批实例分布很广，避免整批被误剔除
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    list.forEach((s, i) => {
      _p.set(s.x ?? 0, 0, s.z ?? 0);
      _q.setFromAxisAngle(UP, s.rotY ?? 0);
      applyScale(_s, s.scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, applyTint(s.tint));
    });
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  function setNight(night) {
    const v = !!night;
    if (v === nightState) return;
    nightState = v;
    for (const key of FACADE_KEYS) {
      const f = facade[key];
      paintFacade(f.ctx, key, v);
      f.tex.needsUpdate = true;
      f.mat.emissiveIntensity = v ? (key === 'glass' ? 0.5 : 0.62) : 0;
    }
  }
  function applyTheme(theme) {
    let night = false;
    if (typeof theme === 'string') night = theme === 'night' || theme === '寒夜';
    else if (theme && typeof theme === 'object') {
      night = theme.night === true || theme.label === '寒夜' || theme.id === 'night';
    }
    setNight(night);
  }

  function dispose() {
    for (const g of ownedGeo) g.dispose();
    for (const m of ownedMat) m.dispose();
    for (const t of ownedTex) t.dispose();
    ownedGeo.clear(); ownedMat.clear(); ownedTex.clear();
    geoCache.clear();
    landmarkMatCache.clear(); // 清掉已释放的共享材质，避免下个工厂复用 disposed 对象
  }

  return { catalog, make, instanced, setNight, applyTheme, dispose };
}

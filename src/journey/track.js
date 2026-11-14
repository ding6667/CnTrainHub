/**
 * track.js —— journey v2 的「轨道系统」（System）。
 *
 * 大白话：这个模块只干一件事——把 alignment.js 算好的线路中心线，铺成
 * 看得见的钢轨、枕木、道床、接触网、栅栏、边坡、公里标。列车永远钉在局部
 * 原点、车头朝 -Z，所以所有几何都是「相对列车的局部坐标」；曲线、上下坡、
 * 超高、双向换股、经道岔分出的到发线，全部由 ctx.alignment.sampleLocal()
 * 一次给全，本文件绝不自己再算一遍曲线数学、也绝不自己写坐标变换。
 *
 * 【坐标与高度口径】1 单位=1 米，+Y 上，轨顶面 y=0。钢轨 ribbon 的顶面
 * 顶点 h=0；道砟 / 底座 / 轨道板 / 路堤边坡 / 截水沟一律 h<0（坐在轨顶
 * 之下，绝不悬空）；接触网支柱、防护栅栏、声屏障、公里标这类**竖直杆件**
 * 从路基面（约 y=-0.3）向上生长，这是它们唯一物理合理的摆法（导线要在
 * 车顶上方 5.4 m）。轨顶不放 y>0，道床/地面元素也不抬到 y>0。
 *
 * 【性能红线怎么守】
 *  - 整系统 11 个 mesh = 最多 11 draw call（≤12）；
 *  - 只用 1 张程序化碎石噪点贴图，多个材质共享（≤2）；
 *  - 所有带状几何用「预分配 BufferGeometry + 只重写 position / normal」，
 *    重复物（枕木、支柱、栅栏立柱、公里标、道岔）一律 InstancedMesh；
 *  - 三角面 ≈ 4.0 万（<45k），靠「近段才实例化重复物 + 远处用道床贴图
 *    与栅栏网片 ribbon 暗示」的示意级 LOD 压下来；
 *  - 只有 travel 变化 ≥10 m 或 dir/lane 改变才「重建」（重采样 + 重算顶点）；
 *    中间每帧只整体平移 group.position，零几何重算、零 new Geometry。
 *
 * 【联网核实的真实资料（标题 + URL + 关键数字，2026-11-14 检索）】
 *  1) 双线线间距 4.8/5.0 m
 *     《高速铁路设计规范》TB10621-2014 表5.2.4
 *     https://web.archive.org/web/20200511023119/http://zb.guaihou.com/stdpool/TB%2010621-2014.pdf
 *     350/300/250 km/h → 区间正线最小线间距 5.0/4.8/4.6 m；与既有线并行 ≥5.3 m。
 *     国家铁路局《高速铁路线路维修规则(征求意见稿)》表3.1.4-1
 *     https://www.nra.gov.cn/xxgk/gkml//ztjg/zqyj/202212/P020221226537834557458.doc 同值。
 *     搜狗百科「中国300-350公里时速高速铁路」https://baike.sogou.com/v75864236.htm
 *     亦载「线间距4.8-5.0米、60kg/m钢轨、18号道岔、最小曲线半径5500-7000米」。
 *  2) 60 kg/m 钢轨 + 1435 mm 标准轨距
 *     国家铁路局《铁路技术管理规则(征求意见稿)》
 *     https://www.nra.gov.cn/xxgk/gkml/ztjg/zqyj/202404/P020240428549488614684.pdf
 *     第3-14条：直线标准轨距 1435 mm；第3-15条：高铁正线及到发线应采用
 *     60 kg/m 钢轨跨区间无缝线路；第3-16条：曲线地段按半径/速度设超高。
 *  3) 有砟道床断面 vs CRTSⅢ 型板式无砟轨道
 *     高速铁路有砟轨道精细化设计 https://hefei.jiangongdata.com/urbanhubnewsdetail/895960.html
 *     路基段道床顶宽 3600 mm、厚 350 mm、边坡 1:1.75、砟肩堆高 150 mm；
 *     Ⅲ型预应力混凝土枕长 2.6 m、1667 根/km、间距 600 mm。
 *     CRTSⅢ 板式无砟轨道结构 http://www.southrailway.com.cn/?p=156&a=view&r=194
 *     钢轨/扣件/预制有挡肩轨道板/自密实混凝土填充层/隔离层/钢筋混凝土底座；
 *     单元分块式、板间不连接；P5600 标准板 5.6×2.5×0.2 m、填充层厚 10 cm。
 *     CRTS III 结构论文 https://pdfs.semanticscholar.org/b5f3/259ca93711451bce2d6135702795dbdfabb6.pdf
 *     60 kg/m 轨、1.435 m 轨距、扣件间距 0.63 m、底座宽 3.1 m、
 *     双线无砟路基面宽 13.6 m、路堤边坡 1:1.5。
 *     差别：有砟=散粒碎石梯形道床+2.6 m Ⅲ型枕；CRTSⅢ=预制轨道板+自密实
 *     混凝土+底座的层状板结构，没有道砟。本模块两种断面都画，做示意对比。
 *  4) Ⅲ型混凝土枕间距 0.6 m
 *     科普中国《轨枕间距》https://cloud.kepuchina.cn/newSearch/imgText?id=6972605177305403392
 *     与百度百科 https://baike.baidu.com/view/14809653.htm ：
 *     Ⅲ型枕 1667 根/km → 间距 600 mm；国铁路网 https://www.chnrailway.com/index/shows?catid=19&id=975 同。
 *  5) 接触网支柱间距与导线高度 5.3~5.7 m
 *     接触网选型指南 https://b2bwiki.baidu.com/en/article/aw_3681f5906f45205935b81cb601e59f48
 *     标准导高 5300–5700 mm；跨距普速 50–65 m、高铁 45–55 m、强风区 40–50 m。
 *     央视网《在高铁站台打伞会触电?》https://news.cctv.cn/2025/07/17/ARTIlgBSTk9ivUbBpCqp7hEa250717.shtml
 *     《铁路技术管理规程》：接触线距轨顶面区间/中间站不小于 5.7 m
 *     （旧线改造不小于 5.33 m）；接触网 27.5 kV；站台高 1.25 m。
 *  6) 高速道岔
 *     《高速铁路道岔技术条件》表1 https://biaozhun.tdpress.com/front/getFileImage?id=4d95facb863a4ff7b6d070cfa5c4a589
 *     侧向 80 km/h → 18号 → 全长 69000 mm(69 m)、前长 31729、后长 37271；
 *     侧向 160 km/h → 42号 → 157200 mm(157.2 m)、前长 60573、后长 96627；线间距 4600 mm。
 *     时速350客专高速道岔产品 http://www.hczhawa.com/Data/2726.html 同值（18号69m/80、42号157.2m/160）。
 *     上海铁道报 https://shtdb.joy169.com/shtd/20230314/mhtml/page_02_content_002.htm 亦载 157.2 m/160、69 m/80。
 *  7) 防护栅栏高度与设置位置
 *     《高速铁路安全防护设计规范》http://fjyinfeng.com/yinfeng/upload/file/20200309/15837364741140180.pdf
 *     高铁全封闭；栅栏设在用地界内侧 0.5 m 处；路基地段 2.2 m 高钢筋混凝土栅栏
 *     +0.5 m 刺丝滚笼；人口密集区不低于 2.7 m。
 *     TB/T 3522-2018 采购公告 https://m.ccement.com/xm/bcon-555181383638986.html
 *     金属网片栅栏高 2.2/1.8 m、每单元(立柱中心距)3.0 m、C30 立柱 150×150 mm、网孔 50×100 mm。
 *  8) 路堤边坡 1:1.5、排水沟、声屏障
 *     边坡 1:1.5 见上面 CRTS III 论文（subgrade slope 1:1.5）。
 *     声屏障 http://www.zheaowangye.com/xwdt/178.html 路基段通环(2009)8325
 *     高 2950 mm（轨面以上 2050 mm）、H 型钢立柱+铝合金复合吸声板；桥梁段 2150/3150 mm。
 *     嘉盛 https://www.jjjiasheng.com/news/689.html 高铁路基标准 2.05 m（轨面以上）。
 *     排水沟：《铁路技术管理规则(征求意见稿)》第3-8条（同 2) URL）要求路基地段
 *     设置声屏障/光电缆时不得影响排水设备，截水沟贴路堤坡脚布置。
 *  9) 公里标 / 半公里标
 *     百度百科《线路标志》https://baike.baidu.com/item/铁路线路标志
 *     与中国科普博览 https://www.kepu.net.cn/gb/technology/railway/railway_line/200401160012.html
 *     公里标在整公里、半公里标在半公里处，埋在计算里程方向线路左侧、
 *     距轨头外侧 ≥2 m，双线区段设在列车运行方向左侧。
 *
 * 【示意级近似，别当测绘】
 *  - 核心尺寸全部取自 core.js 的 RAIL（轨距 1.435、线间距 5.0、枕距 0.6、
 *    站台高 1.25、导线高 5.4、支柱间距 48、栅栏偏移 12/高 2.2 …），不另写；
 *  - RAIL.fenceOffset=12 m 是示意放大（规范是「用地界内侧 0.5 m、距线路
 *    中心 ≥4.5 m」）；栅栏立柱、声屏障只在近段实例化，远处用 ribbon 暗示；
 *  - 道床顶宽用 RAIL.ballastWidth=5.2（含双砟肩的示意值，非规范 3.6 m）；
 *  - 道岔实体示意用 18 号全长 69 m，42 号 157.2 m 仅作资料列入注释；
 *  - 几何与贴图全程序化生成（无第三方图片/模型），运行时不 fetch 任何静态资产。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RAIL, DIRECTION, LANE, EVENT, SYSTEM_PHASE, clamp } from './core.js';

// ------------------------------------------------------------ 补充尺寸 ----
// RAIL 里没有的调研值集中放这里，每一条都带来源，避免散落的魔法数字。
const DIM = Object.freeze({
  ballastSlope: 1.75,     // 有砟道床边坡 1:1.75（资料 3）
  slabWidth: 2.5,         // CRTSⅢ P5600 轨道板宽 2.5 m（资料 3）
  slabThickness: 0.2,     // P5600 轨道板厚 0.2 m
  baseWidth: 3.1,         // CRTSⅢ 钢筋混凝土底座宽 3.1 m
  subgradeSlope: 1.5,     // 路堤边坡 1:1.5（资料 8）
  subgradeHalf: 6.8,      // 双线无砟路基面宽 13.6 m / 2（资料 8）
  drainWidth: 1.0,        // 截水沟沟底宽（示意）
  drainDrop: 0.55,        // 路肩到沟底高差（示意，1:1.5 边坡由此推水平宽）
  sleeperWidth: 0.29,     // Ⅲ型枕底宽约 0.29 m（资料 3/4）
  mastOut: RAIL.trackCenters / 2 + RAIL.ballastWidth / 2, // 支柱距线路中心 ≈5.1 m
  mastReach: RAIL.ballastWidth / 2,  // 腕臂水平投影 ≈2.6 m，伸到股道中心上方
  mastRadius: 0.16,
  mastTop: RAIL.catenaryHeight + 0.75,
  messengerRise: 1.05,    // 承力索比接触线高
  wireSag: 0.5,           // 承力索跨中弛度
  fencePanelLen: 3.0,     // 栅栏单元（立柱中心距）3.0 m（资料 7）
  fencePostSize: 0.15,    // C30 混凝土立柱 150×150 mm
  barrierHeight: 2.95,    // 声屏障总高 2.95 m（轨面以上 2.05，资料 8）
  barrierOffset: 4.6,     // 声屏障距线路中心（示意，设在路肩）
  railHeightOffset: 0.0,  // 轨顶 h=0（保留字段说明口径）
  kmSpacing: 500,         // 半公里标每 500 m、整公里标每 1000 m
  switchLen: 69,          // 18 号道岔全长 69 m（资料 6）
  nearSleeperM: 170,      // 3D 轨枕实例窗口（近段），远处靠道床贴图
  nearFenceM: 520,        // 栅栏立柱实例窗口
  nearMastM: 1000,        // 接触网支柱实例窗口
  rebuildMeters: 10,      // ribbon 重建节流：travel 变化超过 10 m 才重采样
  sampleStep: 20,
  fromBehind: 600,        // sampleLocal 起点：车后 600 m
  toAhead: 3400,          // sampleLocal 终点：车前 3400 m
});

const SPAN = DIM.fromBehind + DIM.toAhead;            // 4000 m
const SAMPLE_N = Math.floor(SPAN / DIM.sampleStep) + 1; // 201 个采样点

/** 各层开关常量（配合系统的 setLayer(name, on) 使用）。 */
export const TRACK_LAYERS = Object.freeze({
  RAILS: 'rails',           // 两股正线钢轨（+ 道岔连接线）
  BED: 'bed',               // 道砟 / 底座 / 轨道板
  SLEEPERS: 'sleepers',     // Ⅲ型混凝土枕
  CATENARY: 'catenary',     // 接触网支柱与腕臂
  WIRES: 'wires',           // 接触线 / 承力索 / 吊弦
  FENCE: 'fence',           // 防护栅栏（网片 + 立柱）
  BARRIER: 'barrier',       // 声屏障 / 护栏（城区）
  EARTHWORK: 'earthwork',   // 路堤边坡 + 截水沟
  KM_POSTS: 'kmPosts',      // 公里标 / 半公里标
  SWITCHES: 'switches',     // 岔尖 / 辙叉
  CONNECTION: 'connection', // 到发线连接曲线（lane 为对象时）
});

// ------------------------------------------------------ 程序化贴图 ----
// 只用 1 张：细碎石噪点。document 不存在（例如 Node 里跑单测）时优雅降级为
// null，材质就不挂 map，几何照常工作。多个材质共享同一个 texture 对象。
function makeBallastTexture() {
  if (typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    if (!c || !c.getContext) return null;
    c.width = 128;
    c.height = 128;
    const g = c.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#b9b4a8';
    g.fillRect(0, 0, 128, 128);
    // 固定种子的小碎石点，保证每次生成一样；纯 2D 画图，无外部素材。
    let seed = 20261114;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 2600; i += 1) {
      const x = rnd() * 128;
      const y = rnd() * 128;
      const r = 0.4 + rnd() * 1.5;
      const v = 120 + Math.floor(rnd() * 90);
      g.fillStyle = `rgba(${v},${v - 4},${v - 12},${0.25 + rnd() * 0.5})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  } catch (e) {
    return null;
  }
}

// ------------------------------------------------------ Ribbon 批处理 ----
/**
 * 把很多条「沿线路挤出的带状几何」塞进 1 个 BufferGeometry = 1 次 draw call。
 * 每条 strand 有固定横截面 section=[[u,h],...]（u 横向、h 竖向，单位米），
 * 沿 N 个采样点放样；顶点的局部坐标 = position + right*(lateral+u) + up*(height+h)。
 * 预分配 position/normal/color/uv/index，update() 只重写 position 和 normal。
 */
class RibbonBatch {
  constructor(strands, material) {
    this.strands = strands;
    this.N = SAMPLE_N;
    let vCount = 0;
    let iCount = 0;
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
    // 索引指针必须在所有 strand 之间连续累加，否则后面的 strand 会覆盖前面的索引。
    let idxPtr = 0;

    for (const st of strands) {
      const K = st._K;
      const rgb = st.color || [1, 1, 1];
      const uvS = st.uvScale || 2;
      for (let i = 0; i < this.N; i += 1) {
        for (let k = 0; k < K; k += 1) {
          const vi = st._vOff + i * K + k;
          col[vi * 3] = rgb[0]; col[vi * 3 + 1] = rgb[1]; col[vi * 3 + 2] = rgb[2];
          const p = st.section[k];
          uv[vi * 2] = p[0] / uvS;
          uv[vi * 2 + 1] = (i * DIM.sampleStep) / uvS;
        }
      }
      for (let i = 0; i < this.N - 1; i += 1) {
        for (let e = 0; e < st._edges; e += 1) {
          const k1 = st.closed ? (e + 1) % K : e + 1;
          const a = st._vOff + i * K + e;
          const b = st._vOff + i * K + k1;
          const c = st._vOff + (i + 1) * K + e;
          const d = st._vOff + (i + 1) * K + k1;
          idx[idxPtr++] = a; idx[idxPtr++] = c; idx[idxPtr++] = b;
          idx[idxPtr++] = b; idx[idxPtr++] = c; idx[idxPtr++] = d;
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

  /** 只更新 position / normal 属性。hidden 的 strand 顶点塞到地下不可见。 */
  update(samples, api) {
    const pos = this.geometry.attributes.position.array;
    for (const st of this.strands) {
      const hide = st.hide && api && st.hide(api);
      const K = st._K;
      for (let i = 0; i < this.N; i += 1) {
        const smp = samples[i] || samples[samples.length - 1];
        if (hide) {
          for (let k = 0; k < K; k += 1) {
            const o = (st._vOff + i * K + k) * 3;
            pos[o] = 0; pos[o + 1] = -1e4; pos[o + 2] = 0;
          }
          continue;
        }
        const lat = st.lateral ? st.lateral(smp, i, api) : 0;
        const hgt = st.height ? st.height(smp, i, api) : 0;
        const P = smp.position;
        const R = smp.right;
        const U = smp.up;
        for (let k = 0; k < K; k += 1) {
          const sec = st.section[k];
          const du = lat + sec[0];
          const dh = hgt + sec[1];
          const o = (st._vOff + i * K + k) * 3;
          pos[o] = P[0] + R[0] * du + U[0] * dh;
          pos[o + 1] = P[1] + R[1] * du + U[1] * dh;
          pos[o + 2] = P[2] + R[2] * du + U[2] * dh;
        }
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
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

function strut(a, b, r, seg = 6) {
  const from = new THREE.Vector3(a[0], a[1], a[2]);
  const to = new THREE.Vector3(b[0], b[1], b[2]);
  const dir = new THREE.Vector3().subVectors(to, from);
  const g = new THREE.CylinderGeometry(r, r, dir.length(), seg);
  g.translate(0, dir.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), dir.clone().normalize(),
  ));
  g.translate(from.x, from.y, from.z);
  return g;
}

/** 接触网支柱：柱 + 腕臂 + 斜撑 + 底座 + 绝缘子，合并成单个几何。绝对 y 以轨顶 0 为基准。 */
function mastGeometry() {
  const reach = DIM.mastReach;
  const top = DIM.mastTop;
  const parts = [
    box(0.7, 0.22, 0.7, 0, -0.24, 0),
    (() => {
      const g = new THREE.CylinderGeometry(DIM.mastRadius, DIM.mastRadius * 1.3, top + 0.3, 8);
      g.translate(0, (top + 0.3) / 2 - 0.15, 0);
      return g;
    })(),
    strut([0, top - 0.1, 0], [reach, top - 0.28, 0], 0.06, 4),
    strut([0, top - 1.2, 0], [reach - 0.4, top - 0.32, 0], 0.045, 4),
    strut([reach - 0.02, top - 0.28, 0], [reach - 0.02, RAIL.catenaryHeight + 0.08, 0], 0.03, 4),
    box(0.12, 0.42, 0.12, reach - 0.02, RAIL.catenaryHeight + 0.32, 0),
  ];
  return mergeGeometries(parts);
}

/** 单个 18 号道岔的示意几何：两条尖轨收拢 + 辙叉 V 形 + 转辙机盒，合并成 1 个 mesh。 */
function switchGeometry() {
  const L = DIM.switchLen;
  const g = RAIL.gauge;
  const half = L / 2;
  const parts = [];
  // 基本轨（直股）两股
  for (const s of [-1, 1]) {
    parts.push(box(RAIL.railHeadWidth + 0.03, RAIL.railHeight, L, s * g / 2, -RAIL.railHeight / 2, 0));
  }
  // 尖轨：从岔尾向岔尖逐渐收拢到中线（用几段短盒子拼个楔形，示意）
  for (const s of [-1, 1]) {
    for (let j = 0; j < 6; j += 1) {
      const t = j / 6;
      const z = -half + (j + 0.5) * (L / 2) / 6;
      const x = s * (g / 2) * (1 - t) * 0.9;
      parts.push(box(0.07, 0.12, L / 12, x, -0.06, z));
    }
  }
  // 辙叉（菱形交叉的两根短轨）
  parts.push(strut([-0.5, -0.06, half - 6], [0, -0.06, half], 0.06));
  parts.push(strut([0.5, -0.06, half - 6], [0, -0.06, half], 0.06));
  // 转辙机盒（岔尖两侧）
  for (const s of [-1, 1]) {
    parts.push(box(0.7, 0.35, 1.1, s * (g / 2 + 0.9), -0.28, -half + 5));
  }
  return mergeGeometries(parts);
}

/**
 * 导出：单道岔 Group（供 stations.js 或其它模块复用）。
 * 局部原点 = 道岔中心，直股沿 Z，轨顶 y=0，整体 1 个 mesh = 1 draw call。
 * opts: { length, gauge, material, lateral, kind }
 */
export function buildSwitch(opts = {}) {
  const group = new THREE.Group();
  group.name = `switch-${opts.kind || 'entry'}`;
  const mat = opts.material || new THREE.MeshStandardMaterial({
    color: 0x8c9198, roughness: 0.5, metalness: 0.55,
  });
  const geo = switchGeometry();
  if (opts.length && opts.length !== DIM.switchLen) {
    geo.scale(1, 1, opts.length / DIM.switchLen);
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'switch-body';
  group.add(mesh);
  group.userData.lateral = opts.lateral ?? RAIL.trackCenters;
  group.userData.kind = opts.kind || 'entry';
  return group;
}

// ------------------------------------------------------ 采样点插值 ----
// 重复实例落在「绝对里程网格」上，用相邻两个采样点线性插值出局部基向量，
// 保证它们和 ribbon 用同一套坐标、且不必每实例再调一次 localMatrixAt。
const _fr = {
  p: [0, 0, 0], r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, -1],
};
function frameAtMileage(samples, fromM, step, s) {
  const t = clamp((s - fromM) / step, 0, samples.length - 1);
  const i = Math.min(samples.length - 2, Math.floor(t));
  const w = t - i;
  const a = samples[i];
  const b = samples[i + 1];
  const o = _fr;
  for (let j = 0; j < 3; j += 1) {
    o.p[j] = a.position[j] + (b.position[j] - a.position[j]) * w;
    o.r[j] = a.right[j] + (b.right[j] - a.right[j]) * w;
    o.u[j] = a.up[j] + (b.up[j] - a.up[j]) * w;
    o.f[j] = a.forward[j] + (b.forward[j] - a.forward[j]) * w;
  }
  // 插值后重新归一化三个基（超高/坡度都很小，误差可忽略）
  const norm = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    v[0] /= l; v[1] /= l; v[2] /= l;
  };
  norm(o.r); norm(o.u); norm(o.f);
  return o;
}

// 复用的临时对象，避免每实例 new。
const _bx = new THREE.Vector3();
const _by = new THREE.Vector3();
const _bz = new THREE.Vector3();
const _mat = new THREE.Matrix4();

/**
 * 把插值帧 + 横向偏移 d / 竖向 h / 缩放 scale / 是否绕竖轴翻 180° 组装成实例矩阵。
 * basis 的 x=right、y=up、z=-forward（与 sampleLocal 的定义一致）；
 * flip 时 x、z 同时取反 = 绕 Y 转 180°，行列式仍为 +1，法线不翻。
 */
function instanceMatrix(fr, d, h, scale = 1, flip = false) {
  const sg = flip ? -1 : 1;
  _bx.set(fr.r[0] * sg, fr.r[1] * sg, fr.r[2] * sg);
  _by.set(fr.u[0], fr.u[1], fr.u[2]);
  _bz.set(-fr.f[0] * sg, -fr.f[1] * sg, -fr.f[2] * sg);
  _bx.multiplyScalar(scale);
  _by.multiplyScalar(scale);
  _bz.multiplyScalar(scale);
  _mat.makeBasis(_bx, _by, _bz);
  _mat.setPosition(
    fr.p[0] + fr.r[0] * d + fr.u[0] * h,
    fr.p[1] + fr.r[1] * d + fr.u[1] * h,
    fr.p[2] + fr.r[2] * d + fr.u[2] * h,
  );
  return _mat;
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
  end() {
    this.mesh.count = this._n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.dispose?.(); }
}

// ------------------------------------------------------ 系统工厂 ----
/** 模块级活跃系统表，供 disposeTracks() 一次性收干净。 */
const ACTIVE = new Set();

export function createTrackSystem(ctx) {
  const group = new THREE.Group();
  group.name = 'track-system';
  group.matrixAutoUpdate = true;
  // 工厂里就把 group 挂进场景（framework 的 register 之后不会再 add 一次）。
  if (ctx?.scene) ctx.scene.add(group);

  // ---- 共享材质（1 张贴图，多个材质共享） ----
  const tex = makeBallastTexture();
  const mkMat = (params) => {
    const def = { side: THREE.DoubleSide, vertexColors: true, ...params };
    if (tex) def.map = tex;   // 有程序化贴图就共享挂上
    else delete def.map;      // 无贴图时别把 undefined 传进去（three 会 warn）
    return new THREE.MeshStandardMaterial(def);
  };
  const mats = {
    rail: mkMat({ color: 0xd2d7de, metalness: 0.85, roughness: 0.26 }),
    bed: mkMat({ color: 0xffffff, roughness: 0.96, metalness: 0.02 }),
    earth: mkMat({ color: 0xffffff, roughness: 0.98, metalness: 0.0 }),
    fence: mkMat({ color: 0xffffff, roughness: 0.7, metalness: 0.25,
      transparent: true, opacity: 0.62, depthWrite: false,
      forceSinglePass: true }), // 双面透明别渲染两遍，锁定 1 draw call
    barrier: mkMat({ color: 0xffffff, roughness: 0.75, metalness: 0.12 }),
    sleeper: mkMat({ color: 0x9a978f, roughness: 0.92 }),
    mast: mkMat({ color: 0x8b9096, roughness: 0.62, metalness: 0.4, vertexColors: false }),
    fencePost: mkMat({ color: 0xa9a49a, roughness: 0.95, vertexColors: false }),
    km: mkMat({ color: 0xe7e3d6, roughness: 0.9, vertexColors: false }),
    sw: mkMat({ color: 0x8c9198, roughness: 0.5, metalness: 0.55, vertexColors: false }),
    wire: new THREE.LineBasicMaterial({ color: 0x4a5058, transparent: true, opacity: 0.65 }),
  };

  const grey = (v) => [v, v, v];
  const A = { runOff: 0, otherLat: 0, isLane: false, layerConnection: true, dir: DIRECTION.FORWARD };

  // 横移基准：线路中心相对「当前运行线中心」的偏移。
  // frameAt 里 lateral = laneOffset(s,lane) + runningOffset(dir) + 传入 lateral；
  // 列车股道在局部原点，所以把这两项减掉就是线路中心线。
  const centerLat = (smp) => -(A.runOff + (smp.laneOffset || 0));
  // 到发线连接线：横移 = -laneOffset(s)，天然画出「分出—平行—汇回」的导曲线
  // （站台外 laneOffset=0 重合、站台内恒为 offset 分出、出发后再收回），
  // 完全由 alignment 给，不需要自己写曲线。
  const linkLat = (smp) => -(smp.laneOffset || 0);
  const mainLat = () => 0;
  const otherLat = () => A.otherLat;

  // 每条股道的一组横截面 strand 定义（钢轨 + 道床 + 轨道板）。
  function trackStrands() {
    const railStrands = [];
    const bedStrands = [];
    const halfGauge = RAIL.railHalf;
    const rh = RAIL.railHeight;
    const rw = RAIL.railHeadWidth;
    const ballTop = -(rh + RAIL.sleeperThickness / 2);
    const ballBot = ballTop - RAIL.ballastDepth;
    const topHalf = RAIL.ballastWidth / 2;
    const botHalf = topHalf + RAIL.ballastDepth * DIM.ballastSlope;
    const slabHalf = DIM.slabWidth / 2;
    // 三「股」：当前运行线、对向正线、道岔连接线。连接线在 main 时隐藏。
    const lanes = [
      { lat: mainLat, hide: null, sleepers: true },
      { lat: otherLat, hide: null, sleepers: true },
      { lat: linkLat, hide: (api) => !api.isLane || !api.layerConnection, sleepers: false },
    ];
    for (const lane of lanes) {
      for (const s of [-1, 1]) {
        const u = s * halfGauge;
        railStrands.push({
          section: [
            [u - rw / 2, 0], [u + rw / 2, 0],
            [u + rw / 2, -rh], [u - rw / 2, -rh],
          ],
          closed: true, lateral: lane.lat, color: grey(1.0), uvScale: 0.5, hide: lane.hide,
        });
      }
      // 有砟梯形道床（闭合断面，顶窄底宽）
      bedStrands.push({
        section: [
          [-topHalf, ballTop], [topHalf, ballTop],
          [botHalf, ballBot], [-botHalf, ballBot],
        ],
        closed: true, lateral: lane.lat, color: [0.54, 0.52, 0.47], uvScale: 1.5, hide: lane.hide,
      });
      // CRTSⅢ 板式：在道床顶叠一条窄轨道板顶面（示意两种道床差别）
      bedStrands.push({
        section: [[-slabHalf, ballTop + 0.02], [slabHalf, ballTop + 0.02]],
        closed: false, lateral: lane.lat, color: [0.74, 0.73, 0.69], uvScale: 1.0, hide: lane.hide,
      });
    }
    return { railStrands, bedStrands, lanes };
  }

  // 路堤边坡 + 截水沟（双侧，贴着线路中心两侧），闭合到地面以下。
  function earthStrands() {
    const out = [];
    const sh = DIM.subgradeHalf;
    const drop = DIM.drainDrop;
    const run = drop * DIM.subgradeSlope;      // 1:1.5 边坡水平投影
    const dw = DIM.drainWidth;
    for (const side of [-1, 1]) {
      // lateral 基准 = 线路中心线；section 的 u 直接带 side × 绝对距离，
      // 这样边坡/截水沟始终贴着正线走，lane 切换时随正线一起横移。
      out.push({
        section: [
          [side * sh, -0.34],
          [side * (sh + run), -0.34 - drop],
          [side * (sh + run + dw), -0.34 - drop],
          [side * (sh + run + dw + 0.5), -0.34 - drop * 0.4],
        ],
        closed: false, lateral: centerLat, color: [0.42, 0.45, 0.34], uvScale: 3.0,
      });
    }
    return out;
  }

  // 防护栅栏网片（双侧竖直平面，从路基面到栅栏顶）
  function fenceStrands() {
    const out = [];
    for (const side of [-1, 1]) {
      out.push({
        section: [[0, -0.3], [0, RAIL.fenceHeight - 0.3]],
        closed: false,
        lateral: (smp) => centerLat(smp) + side * RAIL.fenceOffset,
        color: [0.62, 0.66, 0.68], uvScale: 0.6,
      });
    }
    return out;
  }

  // 声屏障 / 护栏（城区才显示，整条 mesh 由 setLayer / 城区判断控制 visible）
  function barrierStrands() {
    const out = [];
    for (const side of [-1, 1]) {
      out.push({ // 声屏障（高）
        section: [[0, -0.3], [0, -0.3 + DIM.barrierHeight]],
        closed: false,
        lateral: (smp) => centerLat(smp) + side * DIM.barrierOffset,
        color: [0.66, 0.72, 0.76], uvScale: 1.2,
      });
      out.push({ // 护栏（内侧矮栏）
        section: [[0, -0.3], [0, 0.9]],
        closed: false,
        lateral: (smp) => centerLat(smp) + side * (DIM.barrierOffset - 0.6),
        color: [0.7, 0.72, 0.72], uvScale: 0.8,
      });
    }
    return out;
  }

  const { railStrands, bedStrands, lanes } = trackStrands();
  const rails = new RibbonBatch(railStrands, mats.rail);
  const bed = new RibbonBatch(bedStrands, mats.bed);
  const earth = new RibbonBatch(earthStrands(), mats.earth);
  const fence = new RibbonBatch(fenceStrands(), mats.fence);
  const barrier = new RibbonBatch(barrierStrands(), mats.barrier);

  // ---- 重复物 InstancedMesh ----
  const bedOffset = -(RAIL.railHeight + RAIL.sleeperThickness / 2);
  const sleepers = new InstanceLayer(
    new THREE.BoxGeometry(RAIL.sleeperLength, RAIL.sleeperThickness, DIM.sleeperWidth),
    mats.sleeper, 1200, 'track-sleepers',
  );
  const masts = new InstanceLayer(mastGeometry(), mats.mast, 120, 'track-masts');
  const fencePosts = new InstanceLayer(
    (() => {
      const h = RAIL.fenceHeight;
      const g = new THREE.BoxGeometry(DIM.fencePostSize, h, DIM.fencePostSize);
      g.translate(0, -0.3 + h / 2, 0);
      return g;
    })(),
    mats.fencePost, 600, 'track-fence-posts',
  );
  const kmPosts = new InstanceLayer(
    (() => {
      const parts = [box(0.42, 1.15, 0.24, 0, 0.28, 0), box(0.5, 0.12, 0.3, 0, 0.86, 0)];
      return mergeGeometries(parts);
    })(),
    mats.km, 24, 'track-km-posts',
  );
  const switchInst = new InstanceLayer(switchGeometry(), mats.sw, 4, 'track-switches');

  // ---- 导线（LineSegments，不算三角面，1 draw call） ----
  const WIRE_MAX = 12000;
  const wirePos = new Float32Array(WIRE_MAX * 3);
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.BufferAttribute(wirePos, 3));
  wireGeo.setDrawRange(0, 0);
  const wires = new THREE.LineSegments(wireGeo, mats.wire);
  wires.name = 'track-wires';
  wires.frustumCulled = false;

  group.add(
    rails.mesh, bed.mesh, earth.mesh, fence.mesh, barrier.mesh,
    sleepers.mesh, masts.mesh, fencePosts.mesh, kmPosts.mesh,
    wires, switchInst.mesh,
  );

  // ---- 层开关 ----
  const layers = {};
  for (const k of Object.values(TRACK_LAYERS)) layers[k] = true;
  // 路堤边坡 / 截水沟由 terrain.js 的地面层统一放样（±55 m、更完整），
  // 这里默认关掉，避免两套边坡叠在一起穿模；需要时可用 setLayer('earthwork', true) 打开。
  layers[TRACK_LAYERS.EARTHWORK] = false;
  function applyLayers() {
    rails.mesh.visible = layers[TRACK_LAYERS.RAILS];
    bed.mesh.visible = layers[TRACK_LAYERS.BED];
    earth.mesh.visible = layers[TRACK_LAYERS.EARTHWORK];
    fence.mesh.visible = layers[TRACK_LAYERS.FENCE];
    fencePosts.mesh.visible = layers[TRACK_LAYERS.FENCE];
    barrier.mesh.visible = layers[TRACK_LAYERS.BARRIER] && barrierUrban;
    sleepers.mesh.visible = layers[TRACK_LAYERS.SLEEPERS];
    masts.mesh.visible = layers[TRACK_LAYERS.CATENARY];
    wires.visible = layers[TRACK_LAYERS.WIRES];
    kmPosts.mesh.visible = layers[TRACK_LAYERS.KM_POSTS];
    switchInst.mesh.visible = layers[TRACK_LAYERS.SWITCHES];
    A.layerConnection = layers[TRACK_LAYERS.CONNECTION];
  }
  let barrierUrban = true;

  // ---- 重建状态 ----
  let buildS = NaN;
  let lastDir = null;
  let lastLane = null;
  let forced = true;
  let samples = null;
  let fromM = 0;
  let perM = { x: 0, y: 0, z: -1 };

  function rebuild() {
    const align = ctx.alignment;
    A.isLane = !!(ctx.lane && typeof ctx.lane === 'object');
    A.dir = ctx.dir;
    A.runOff = align.runningOffset(ctx.dir);
    A.otherLat = align.otherTrackLateral(ctx.dir);
    buildS = ctx.s;
    lastDir = ctx.dir;
    lastLane = ctx.lane;
    fromM = ctx.s - DIM.fromBehind;
    const toM = ctx.s + DIM.toAhead;
    samples = align.sampleLocal(ctx.s, fromM, toM, DIM.sampleStep, { dir: ctx.dir, lane: ctx.lane });
    // 理论上恒为 SAMPLE_N(=201)；极端边界不足时用末点补齐，保护预分配数组。
    while (samples.length < SAMPLE_N) samples.push(samples[samples.length - 1] || {
      position: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, -1], laneOffset: 0,
    });

    const api = A;
    rails.update(samples, api);
    bed.update(samples, api);
    earth.update(samples, api);
    fence.update(samples, api);
    barrier.update(samples, api);
    updateInstances();
    updateWires();

    // 每米里程对应的局部坐标变化（数值差分），供每帧整体平移。
    const m = Math.floor(SAMPLE_N / 2);
    const a = samples[m];
    const b = samples[m + 1];
    const ds = (b.s - a.s) || DIM.sampleStep;
    perM.x = (b.position[0] - a.position[0]) / ds;
    perM.y = (b.position[1] - a.position[1]) / ds;
    perM.z = (b.position[2] - a.position[2]) / ds;
    group.position.set(0, 0, 0);
    forced = false;
  }

  function updateInstances() {
    const step = DIM.sampleStep;
    const s = ctx.s;

    // 1) 轨枕：只在近段窗口按 0.6 m 绝对里程网格放 2 条正线。
    sleepers.begin();
    const sl0 = Math.floor((s - 60) / RAIL.sleeperSpacing) * RAIL.sleeperSpacing;
    const sl1 = s + DIM.nearSleeperM;
    for (let sk = sl0; sk <= sl1; sk += RAIL.sleeperSpacing) {
      if (sk < fromM || sk > s + DIM.toAhead) continue;
      const fr = frameAtMileage(samples, fromM, step, sk);
      sleepers.push(instanceMatrix(fr, 0, bedOffset));
      sleepers.push(instanceMatrix(fr, A.otherLat, bedOffset));
    }
    sleepers.end();

    // 2) 接触网支柱：双线外侧各一排，右侧一排绕竖轴翻 180° 让腕臂朝内。
    masts.begin();
    const ma0 = Math.floor((s - 100) / RAIL.mastSpacing) * RAIL.mastSpacing;
    const ma1 = s + DIM.nearMastM;
    for (let sk = ma0; sk <= ma1; sk += RAIL.mastSpacing) {
      if (sk < fromM || sk > s + DIM.toAhead) continue;
      const fr = frameAtMileage(samples, fromM, step, sk);
      // 支柱相对线路中心 ±mastOut；右侧一排绕竖轴翻 180° 让腕臂朝内。
      const cLat = -(A.runOff + laneOffsetAt(fr, sk));
      masts.push(instanceMatrix(fr, cLat - DIM.mastOut, 0, 1, false));
      masts.push(instanceMatrix(fr, cLat + DIM.mastOut, 0, 1, true));
    }
    masts.end();

    // 3) 栅栏立柱：双侧，按 3.0 m 单元。
    fencePosts.begin();
    const fp0 = Math.floor((s - 60) / DIM.fencePanelLen) * DIM.fencePanelLen;
    const fp1 = s + DIM.nearFenceM;
    for (let sk = fp0; sk <= fp1; sk += DIM.fencePanelLen) {
      if (sk < fromM || sk > s + DIM.toAhead) continue;
      const fr = frameAtMileage(samples, fromM, step, sk);
      const cLat = -(A.runOff + laneOffsetAt(fr, sk));
      fencePosts.push(instanceMatrix(fr, cLat - RAIL.fenceOffset, 0));
      fencePosts.push(instanceMatrix(fr, cLat + RAIL.fenceOffset, 0));
    }
    fencePosts.end();

    // 4) 公里标 / 半公里标：单侧（运行方向左侧），整公里大、半公里小。
    kmPosts.begin();
    const km0 = Math.floor((fromM) / DIM.kmSpacing) * DIM.kmSpacing;
    for (let sk = km0; sk <= s + DIM.toAhead; sk += DIM.kmSpacing) {
      if (sk < fromM) continue;
      const fr = frameAtMileage(samples, fromM, step, sk);
      const cLat = -(A.runOff + laneOffsetAt(fr, sk));
      const isFull = Math.abs(sk % 1000) < 1e-6;
      kmPosts.push(instanceMatrix(fr, cLat - (DIM.subgradeHalf + 1.6), 0, isFull ? 1 : 0.72));
    }
    kmPosts.end();

    // 5) 道岔：lane 为对象时，在进/出岔点各放一组 18 号道岔实体。
    switchInst.begin();
    if (A.isLane && layers[TRACK_LAYERS.SWITCHES]) {
      const pts = ctx.alignment.switchPoints(ctx.lane) || [];
      for (const sw of pts) {
        if (sw.s < fromM || sw.s > s + DIM.toAhead) continue;
        const fr = frameAtMileage(samples, fromM, step, sw.s);
        switchInst.push(instanceMatrix(fr, -(laneOffsetAt(fr, sw.s)), 0, 1, sw.kind === 'exit'));
      }
    }
    switchInst.end();
  }

  // 实例用的是插值帧对象 _fr，没有 laneOffset 字段，直接从 alignment 查。
  function laneOffsetAt(fr, s) {
    if (!A.isLane) return 0;
    try { return ctx.alignment.laneOffset(s, ctx.lane) || 0; } catch (e) { return 0; }
  }

  // 导线：2 条正线各画接触线、承力索（带弛度）、吊弦，写进预分配 LineSegments。
  function updateWires() {
    const P = wirePos;
    let n = 0; // 顶点计数
    const step = DIM.sampleStep;
    const height = RAIL.catenaryHeight;
    for (const laneD of [0, A.otherLat]) {
      for (let i = 0; i < SAMPLE_N - 1; i += 1) {
        const a = samples[i];
        const b = samples[i + 1];
        const sagA = Math.sin(Math.PI * ((a.s % RAIL.mastSpacing) / RAIL.mastSpacing)) * DIM.wireSag;
        const sagB = Math.sin(Math.PI * ((b.s % RAIL.mastSpacing) / RAIL.mastSpacing)) * DIM.wireSag;
        const frA = frameAtMileage(samples, fromM, step, a.s);
        const pA = [frA.p[0] + frA.r[0] * laneD + frA.u[0] * height,
          frA.p[1] + frA.r[1] * laneD + frA.u[1] * height,
          frA.p[2] + frA.r[2] * laneD + frA.u[2] * height];
        const mA = [frA.p[0] + frA.r[0] * laneD + frA.u[0] * (height + DIM.messengerRise - sagA),
          frA.p[1] + frA.r[1] * laneD + frA.u[1] * (height + DIM.messengerRise - sagA),
          frA.p[2] + frA.r[2] * laneD + frA.u[2] * (height + DIM.messengerRise - sagA)];
        const frB = frameAtMileage(samples, fromM, step, b.s);
        const pB = [frB.p[0] + frB.r[0] * laneD + frB.u[0] * height,
          frB.p[1] + frB.r[1] * laneD + frB.u[1] * height,
          frB.p[2] + frB.r[2] * laneD + frB.u[2] * height];
        const mB = [frB.p[0] + frB.r[0] * laneD + frB.u[0] * (height + DIM.messengerRise - sagB),
          frB.p[1] + frB.r[1] * laneD + frB.u[1] * (height + DIM.messengerRise - sagB),
          frB.p[2] + frB.r[2] * laneD + frB.u[2] * (height + DIM.messengerRise - sagB)];
        const seg = (q1, q2) => {
          if (n + 2 >= WIRE_MAX) return;
          P[n * 3] = q1[0]; P[n * 3 + 1] = q1[1]; P[n * 3 + 2] = q1[2]; n += 1;
          P[n * 3] = q2[0]; P[n * 3 + 1] = q2[1]; P[n * 3 + 2] = q2[2]; n += 1;
        };
        seg(pA, pB);          // 接触线
        seg(mA, mB);          // 承力索
        seg(pA, mA);          // 吊弦（每个采样点一根，示意）
      }
    }
    wireGeo.attributes.position.needsUpdate = true;
    wireGeo.setDrawRange(0, n);
  }

  // ---- System 接口 ----
  const system = {
    id: 'track',
    phase: SYSTEM_PHASE.TRACK,

    init(c) {
      // ctx 在 register 之前就传进来了；这里只做一次保险挂载。
      if (c?.scene && !c.scene.getObjectByName('track-system')) c.scene.add(group);
      forced = true;
      applyLayers();
    },

    update(c) {
      // 城区才显示声屏障/护栏：用分块窗口里是否有 urban/hub 判断。
      barrierUrban = (c.chunks || []).some((ch) => ch.kind === 'urban' || ch.kind === 'hub');
      if (barrier.mesh.visible !== (layers[TRACK_LAYERS.BARRIER] && barrierUrban)) {
        barrier.mesh.visible = layers[TRACK_LAYERS.BARRIER] && barrierUrban;
      }
      if (forced || !Number.isFinite(buildS)
          || c.dir !== lastDir || c.lane !== lastLane
          || Math.abs(c.s - buildS) >= DIM.rebuildMeters) {
        rebuild();
      }
      // 两次 rebuild 之间不碰几何，只整体平移：平滑且零重算。
      const d = c.s - buildS;
      group.position.set(-perM.x * d, -perM.y * d, -perM.z * d);
    },

    onEvent(type, payload) {
      if (type === EVENT.SWITCH) {
        // payload.lane / payload.switches：到发线/道岔状态变了，强制重建 ribbon。
        forced = true;
        if (payload && 'lane' in payload) lastLane = undefined;
      } else if (type === EVENT.DIRECTION_CHANGE || type === EVENT.REVERSE) {
        // 逻辑掉头：运行线自动切到另一股（runningOffset 随 dir 变），重建 ribbon，
        // 绝不旋转任何列车几何。
        forced = true;
        lastDir = undefined;
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

    /** 层开关：setLayer(TRACK_LAYERS.FENCE, false) 之类。 */
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
      sleepers.dispose(); masts.dispose(); fencePosts.dispose(); kmPosts.dispose(); switchInst.dispose();
      wireGeo.dispose();
      for (const m of Object.values(mats)) m.dispose();
      if (tex) tex.dispose();
      group.clear();
    },
  };
  ACTIVE.add(system);
  applyLayers();
  return system;
}

/** 一次性销毁所有活跃的轨道系统（供换线路 / 整体卸载时调用，可选）。 */
export function disposeTracks() {
  for (const sys of Array.from(ACTIVE)) sys.dispose?.();
  ACTIVE.clear();
}

export default createTrackSystem;

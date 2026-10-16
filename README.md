# CnTrainHub · 中国铁路网络可视化

Vite + Leaflet + 原生 JavaScript 实现的中国铁路干线可视化网页：暗色底图、线路生长动画、缩放分级显示、线路/车站/铁路局三维筛选、点击信息卡片。

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 输出 dist/
npm run preview    # 本地预览构建产物
```

## 功能

| 能力 | 实现 |
| --- | --- |
| 暗色底图 | Leaflet `L.tileLayer` + 免密钥暗色瓦片，瓦片层用 `opacity` 压到 `#0a0a1a` 基调（不用 CSS `filter`，那会让每帧重新栅格化全部瓦片） |
| 初始视角 | `fitBounds` 到中国全境（含南海诸岛），滚轮缩放 + 拖拽 |
| 生长动画 | `requestAnimationFrame` + `L.Polyline.setLatLngs()`，按累计里程插值，逐条错开 100 ms，`ease-out` 收尾，重绘限帧 ~30fps；移动端、后台标签页与 `prefers-reduced-motion` 直接呈现完整线条 |
| 缩放分级 | `zoomend` 监听：`<6` 干线 + 省会主站；`6–8` 增加区域性线路与地级市主站；`>8` 全部线路、车站与站名标签 |
| 路网底图 | 两级 LOD：全国视图用 1132 条主干边（4.6k 顶点），放大后换 4181 条边（19.6k 顶点），均按视口裁剪 |
| 筛选面板 | 左上角半透明浮层：线路类型（高铁 G / 动车 D / 城际 C / 普速 K·Z·T）、**车站等级（省会 / 地级市 / 县级）**、18 个铁路局，每项带真实计数，任一变化即时重绘 |
| 悬浮反馈 | 鼠标靠近线路 14 px 内即加粗（`weight + 2.4`）、指针变手、光标旁跟随名称提示；命中判定独立于车站，不会被附近车站抢走 |
| 信息卡片 | 线路 / 车站 / 铁路局 / **单条铁路边**均可点击出卡片，300 ms 淡入 + 上滑，随地图平移保持锚定；点击空白、`✕`、`Esc` 关闭；移动端转底部抽屉 |
| 点击容差 | 命中判定在地理空间按"屏幕像素半径换算公里"计算（线路 14 px、车站 11 px、边 6 px），细线不再需要精确点到 |
| 线路发光 | `filter: drop-shadow(0 0 3px currentColor)`，颜色由 `.rail-line--{family}` 类的 CSS `color` 提供（命名线路走 SVG 以保留该效果，重量级图层走 Canvas） |
| 响应式 | ≤768px 面板改为可收起抽屉、卡片转底部抽屉、隐藏次要按钮、不自动拉取大体积路网 |
| **3D 展示** | 路局卡片里的动车组行带 **3D** 角标，点击跳 `detail.html?model=…`：Three.js 全屏场景、8 节编组在有砟/无砟轨道上前进停止、中键绕车头旋转 |

线路配色：高铁 `#e63946`、动车 `#f4a261`、城际 `#f7b955`、普速 `#457b9d`。

## 性能：做了什么，以及怎么量的

**踩过的坑**：最初用 puppeteer 连续 `mouse.move` 拖图并数 `requestAnimationFrame` 帧，得出"33 → 53 fps"的结论。这个探针是错的——帧数被 CDP 事件往返吞吐主导，同一构建连续测量能从 36 fps 一路"涨"到 233 fps。改用**页内 rAF 自驱动平移 + 交错重复测量**后，真实结论小得多：

| 场景（页内驱动平移，3 次交错取中位） | fps |
| --- | --- |
| 全部图层开启 | ~48 |
| 关闭路网底图 | ~54 |
| 关闭车站层 | ~51 |

即底图约 9% 帧率、车站约 4%，中位帧时 16.7 ms（60 fps），p95 33 ms。跨版本对比在该无头环境下噪声过大（同一构建 22–60 fps 波动），因此**不给出"快了几倍"的数字**；可复现的测量脚本思路见上，请在自己的机器上以右下角实时 fps 为准。

结构上确实有效的改动：矢量层全部离开 DOM（2574 个车站从 `divIcon` 改为 Canvas 圆点）、按视口裁剪、路网两级 LOD、静态矢量 pane 加 `will-change: transform` 使其成为独立合成层、瓦片层不再挂 CSS `filter`。代价最大的一项（12 445 条边的详细路网）改为缩放 ≥ 8 才自动加载。

## 关于底图：CartoDB Dark Matter 已不再免密钥

需求中指定的 `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png` 现在对无密钥请求返回 **`API KEY REQUIRED`** 水印瓦片（`dark_nolabels` 与 `cartodb-basemaps-*.global.ssl.fastly.net` 旧域名同样如此），已不能"免密钥直接使用"。

因此默认底图换成同样免密钥、同为暗色的 **Esri World Dark Gray Base**，并保留一行切换：

- 默认：`http://localhost:5173/`
- 对比 CARTO：`http://localhost:5173/?basemap=cartoDark`（自行申请 CARTO key 后，把 `src/main.js` 顶部 `BASEMAPS.cartoDark` 的 URL 换成带 key 的地址，并将 `BASEMAP` 常量改为 `'cartoDark'`）

底图配置集中在 `src/main.js` 的 `BASEMAPS` 常量里。

## 项目结构

```
index.html                 单页骨架：地图容器、筛选面板、信息卡片、图例、加载层
detail.html                3D 展示页骨架：全屏 canvas、返回按钮、前进/停止、兜底提示
vite.config.js             MPA 双入口；publicDir 只放行 public/（模型），地图数据仍走打包 import
src/main.js                地图、动画、分级、筛选、拾取与悬浮、卡片、路网加载
src/detail.js              Three.js 场景：光照、轨道、接触网、编组、运动与镜头跟随
src/detail-config.js       3D 场景参数（光强、雾密度、轨道尺寸、运动上限与加减速）
src/data.json              3D 车型配置（编组、尺寸、模型路径；未建模的车型 model 为 null）
src/trains.js              动车组侧视 SVG（symbol/use + 贝塞尔车头）与配属表
src/style.css              深色科技风、发光、卡片过渡、悬浮提示、响应式
src/detail.css             3D 页样式
public/models/*.glb        优化后的动车组模型（CR400BF-G，2.81 MB）
scripts/build-data.mjs     从真实数据源重新生成 data/*.json
data/railways.json         31 条命名线路（真实 OSM 几何）
data/stations.json         2574 个车站（真实坐标 + 12306 电报码 + 三级等级）
data/railway-bureaus.json  18 个铁路局机关驻地与管辖范围
data/china-provinces.json  34 个省级面 + 8 条境界线（含南海诸岛）
data/network-coarse.json   路网底图两级 LOD（low 4.6k / high 19.6k 顶点）
vercel.json / netlify.toml 部署配置
```

数据由 `src/main.js` 用动态 `import()` 引入，Vite 将其切成独立 chunk 懒加载。这样在子路径部署和"未知路径回退到 index.html"的主机上都能正确解析——早先用 `fetch('railways.json')` 时，这类主机把 HTML 当 JSON 返回，页面会报 `Unexpected token '<' ... is not valid JSON`。

## 数据来源与许可

| 内容 | 来源 | 许可 |
| --- | --- | --- |
| 线路几何、路网底图、单条边属性 | `@railroute-ts/china` 2026.9.1（OSM 主干路网，12 445 条边，含 `km` / `gauge` / `electrified`） | 代码 MIT，数据 ODbL-1.0 © OpenStreetMap contributors |
| 车站坐标与英文名 | 同上（9 326 个车站） | ODbL-1.0 |
| 车站名称与电报码 | [12306 `station_name.js`](https://kyfw.12306.cn/otn/resources/js/framework/station_name.js)（3404 条记录，第 8 字段为所在城市） | 公开接口 |
| 省 / 地级市面、境界线 | [chinese-global-compliant-geodata](https://github.com/JayMuShui/chinese-global-compliant-geodata) `chn-level-1.json`、`chn-level-2.json` | MIT |
| 铁路局清单 | 参考 [60464/railwaymap](https://github.com/60464/railwaymap) 的管辖范围口径 | — |
| 底图瓦片 | Esri World Dark Gray Base（免密钥） | Esri 非商业许可，需保留署名 |

`data/*.json` 均由 `scripts/build-data.mjs` 生成，不是手工描点：

- **线路**按"端点 + 主枢纽途经点"在真实路网上逐段求最短路拼接，端点支持多个候选站名（例如 `南京` 与 `南京南`，后者在该 OSM 子图里连到断头碎片，直连会绕出 910 km）。结果只保留与官方里程比值落在 **0.8–1.35** 区间的线路：**40 条候选中 31 条通过**，9 条被自动丢弃并记录原因（兰新、厦深、郑渝、汉宜、滨洲、宁杭、沈丹、京雄等——OSM 该子图缺走廊或存在跨域绕行，例如嘉峪关→哈密无直连，最短路径会横穿全国）。宁可用全量路网底图呈现这些区域，也不画走向错误的命名线。
- **车站**：12306 的拼音与 OSM 站名匹配（含方向词与拉丁化差异，如 `Changsha South`↔`changshanan`、`Haerbin`↔`Harbin`），得 **2574/3404** 个有坐标站点；再用 `chn-level-2` 的地级市面做**点在面内判定**得到所属地级市与省份，据此分级：省会车站 509、地级市车站 400、县级车站 1665。拼音同形会错配（12306"大理"会命中台湾的 Dali 站），因此落点省份不在路局表内的匹配一律丢弃，并有 23 条同形歧义被丢弃。
- **路局归属**按省级映射推断，蒙东、豫南等交界地区存在跨局例外，已在数据 `metadata.bureauNote` 与卡片中说明。
- 几何经 Ramer–Douglas–Peucker 简化后保留 3–4 位小数。
- 里程对照（图示 / 官方 km）：京沪高铁 1368/1318、京广高铁 2437/2298、沪昆高铁 2311/2252、哈大高铁 1108/921、成渝高铁 340/308、西成高铁 762/643、京津城际 162/150、陇海铁路 1659/1759、大西高铁 860/859。卡片同时展示"线路里程（官方）"与"图示路径"，不混为一谈。

### 重新生成数据

`scripts/build-data.mjs` 读取 `.cache/`（已 gitignore）里的三个源文件，克隆后先执行：

```bash
mkdir -p .cache
GEO=https://cdn.jsdelivr.net/gh/JayMuShui/chinese-global-compliant-geodata@main/src/geojson/countries/as/chn/global
curl -L -o .cache/chn-level-1.json "$GEO/chn-level-1.json"
curl -L -o .cache/chn-level-2.json "$GEO/chn-level-2.json"
curl -L -o .cache/station_name.js \
  "https://kyfw.12306.cn/otn/resources/js/framework/station_name.js"
npm run build:data
```

## 每条铁路都有卡片

- **命名线路**（31 条）：开通年份、设计时速、官方里程、图示路径、端点、运营主体、途经主要城市。
- **车站**（2574）：省份、所属铁路局集团、车站等级、途经的命名线路、12306 电报码、坐标。
- **铁路局**（18）：全称、机关驻地、管辖范围、境内车站数与经过干线数。
- **单条铁路边**（12 445）：缩放 ≥ 8 后详细路网自动加载，点击任意区段即显示该边的真实属性——区段长度（km）、轨距、是否电气化，以及按几何判定的归属线路（含距离，阈值 5 km）；找不到就明确写"数据源未提供该边名称"，不编名字。

数据源本身不含线路名称表（`@railroute-ts/china` 只保留几何与 `km/gauge/electrified`），因此命名线路目录是人工整理的。本机访问维基百科与百度百科均失败（超时 / 反爬空页），所以**没有把无法核实的条目补进目录**；若你有权威名录（如国铁集团《铁路线路名称表》），可作为数据源接入 `scripts/build-data.mjs` 的 `LINES`。

车次信息可再接 [HerbertHe/cr-12306-train-info](https://github.com/HerbertHe/cr-12306-train-info)：其 `trains` 列表按车型与停靠站给出，可为卡片补"途经车次数量"——此前该字段是演示值，已删除而非保留假数据。

## 部署

构建命令 `npm run build`，输出目录 `dist`，纯静态站点。

**Vercel**（仓库已带 `vercel.json`）

```bash
npm i -g vercel
vercel        # 预览
vercel --prod # 生产
```

**Netlify**（仓库已带 `netlify.toml`）

```bash
npm i -g netlify-cli
netlify deploy --build           # 预览
netlify deploy --build --prod    # 生产
```

两个平台也可用 Git 集成：Build command `npm run build`，Publish directory `dist`。

## 动车组侧视图（代码绘制）

`src/trains.js` 用内联 SVG 画各型号侧视剖面，不引用任何图片：

- **`<symbol>` + `<use>` 复用标准车厢**：`<defs>` 里定义一节 `<symbol id="car-*" viewBox="0 0 116 64">`，`<rect>` 画车顶/车身/车窗带/裙板、`<circle>` 画轮对、`<line>` 画车厢连接处；编组用 `<use href x y width height>` 按固定间距横排，加一节车厢只多一行。
- **车头单独用 `<path>` + 三次贝塞尔**：鼻锥是唯一能识别型号的形状，不做 symbol。三种壳形 `pointy`（CRH380A / CR400 系）、`round`（CRH2 / CRH5，新干线与潘多利诺后裔）、`boxy`（CRH1 / CRH3，Regina 与 Velaro 平台），车尾用 `scale(-1,1)` 镜像。
- **`<linearGradient>`** 做车身金属渐变、车窗玻璃反光、腰线渐变；全部整数坐标；**背景透明**；**不使用 `<filter>`**（部分浏览器对带 filter 的 SVG 渲染空白）。
- 卡片里画的是 4 节缩短编组（真实编组数以文字标注），因为 8 节缩到卡片宽度就看不清鼻型了。

13 个视觉基型 + 后缀变体，共 45 个型号（见下"型号库与配属"）。

点击地图上的**铁路局菱形**，卡片下半部即列出该局配属车型、配属数量及其侧视图。菱形按半径分区：正中约 5 px 归其下的枢纽车站，外圈归路局——否则路局标记（16 px）会把枢纽站完全盖住，两个目标至少有一个点不到。

### 型号库与配属

`TRAIN_MODELS` 共 **45 个型号**，由 13 个视觉基型（CRH1A / CRH2A / CRH3A / CRH3C / CRH5A / CRH380A / CRH380B / CRH380D / CR400AF / CR400BF / CR300AF / CR300BF / CR200J）加后缀变体生成——变体与基型共用壳形与涂装（现实中也是如此），因此新增变体只加一行索引，不重复绘制：

| 后缀 | 含义 | 后缀 | 含义 |
| --- | --- | --- | --- |
| `-A` / `L` | 16 辆长编组 | `-G` | 高寒型 |
| `B` / `BL` | 17 辆超长编组 | `-GS` / `-GZ` | 高寒 · 技术提升 / 智能 |
| `-Z` | 智能配置型 | `-S` / `-AS` | 技术提升 |
| `-AZ` / `-BZ` | 长编组 · 智能配置 | `E` / `G` | 卧铺 / 抗风沙高寒 |
| `-C` | 智能配置（京张·京雄） | `1-x` / `3-x` | 动力集中代际与编组 |

编组文本按型号显式给出，不靠后缀通用规则：`CRH3A-A` 是 8 辆城际型（后缀 `-A` 在这里不表示长编组），CR200J 系列是"动力集中 · 机车+拖车"而非固定辆数。

配属表 `BUREAU_FLEETS` 采用项目方整理的 **2025 年至 2026 年初公开报道**数据，含每局车型清单与配属数量（北京局 344、上海局 933、广州局 466.5、成都局 517、济南局 260、武汉局 258、郑州局 199.5、西安局 189、沈阳局 187、南昌局 206、哈尔滨局 115、昆明局 120、南宁局 170、兰州局 86、乌鲁木齐局 53、呼和浩特局 51，合计约 4155 组）。卡片底部固定展示三条口径说明：

- **统计口径**："标准组"按 8 辆 = 1、16/17 辆 = 2 折算，部分局直接以"组"计（字段 `unit` 区分）。
- **动态变化**：数量随新线开通与车辆调配持续变化，不是官方现车表。
- **未覆盖项**：太原局、青藏集团未在本次表中，沿用前次公开资料整理并标注；南昌局仅福州动车段数据。

车组号级实时配属需查 EmuSearch 等专业库；本项目未抓取（本机亦不可达），界面已注明该指引。

> 型号本身的涂装/原型/速度为公开资料：CR400AF 银灰车身红飘带（中车四方）、CR400BF 金飘带（长客/唐车，"金凤凰"）、CR200J 绿色动力集中（"绿巨人"，160 km/h）、CRH380D 为庞巴迪 Zefiro 平台、CRH5E 为卧铺动车组。

## 3D 展示页（Three.js）

入口：点开某个铁路局的卡片 → 配属车型列表里带 **3D** 角标的那一行会跳到 `detail.html?model=CR400BF-G`。

### 场景

| 项 | 值 |
|---|---|
| 背景 / 雾 | `#252525` + `FogExp2(0x252525, 0.0068)` |
| 光照 | `HemisphereLight(#888888, #333333, 0.8)` + 一盏投影 `DirectionalLight(1.0)`，无点光源 |
| 轨道 | 有砟（道床 + 742 根 `InstancedMesh` 枕木，间距 0.62 m）与无砟整体道床二线并列 |
| 接触网 | 合并后的立柱+腕臂+吊弦几何，`InstancedMesh` 每 20 m 一根，含通长接触线 |
| 相机 | `OrbitControls`，`enablePan=false`，14–220 m 距离限制，`LEFT:null / MIDDLE:ROTATE / RIGHT:null`，每帧把 `target` 收敛到车头 |
| 运动 | 前进 / 停止按钮，`maxSpeed 30 m/s`、加速 `2`、减速 `3 m/s²`，`Clock` 驱动 |

无限轨道不是真的铺很多轨：枕木与接触网杆各自按周期平移 `travel % spacing`，周期位移在视觉上完全等价，所以一帧只更新两个 `Object3D.position`，不重算任何实例矩阵。

### 模型怎么来的

初模（外部生成的 GLB，50,000 面 / 26.8 MB / 三张 4K 烘焙贴图）在 Blender 5.2 里经过一条可重跑的脚本链处理，脚本留在 `.cache/blend/`，`.blend` 源另存为 `.cache/blend/CR400BF-G-v1.blend`：

| 步骤 | 做的事 | 结果 |
|---|---|---|
| 清理 | 按连通壳统计，删掉 685 个杂质岛（其中一整块大碎片把模型宽度撑到 0.343） | 737 壳 → 52 壳，50,000 → 22,805 面 |
| 修伤 | 车体底部是撕裂的锯齿，用 `bisect_plane` 在裙板线（约 1.0 m）干净切断；鼻锥处的贯通孔用 `edgenet_fill` 封盖并赋深色 | 边界边 0，壳体闭合 |
| 对齐 | 按参考数据 25.85 × 3.36 × 4.05 m 逐轴归一化，原点移到车中心、Z=0 落在轨顶 | 尺寸精确命中 |
| 中间车 | 从车头车 bisect 掉司机室以前段、封盖、X 向拉伸 1.287 倍到 25.0 m | 复用同一套 UV 与烘焙贴图 |
| 补细节 | 程序化加转向架（每台 2 轴 4 轮，轮径 0.93 m ≈ 0.23 倍车高）、分段裙板、车顶导流角（高度从车体网格采样而不是猜） | 每车 +420 面 |
| 减面 | `DECIMATE/COLLAPSE`，车头 14,316 → 899 面外壳，中间车 9,630 → 298 面 | 见下方预算 |
| 贴图 | 三张 4096² 降到 1024² 并重新打包 | 26.8 MB → 2.81 MB |

编组为 1 头 + 6 中 + 1 尾，全长 `2×25.85 + 6×25.0 + 7×1.036 = 208.95 m`，与参考比例一致；尾车是同一模型转 180°，中间车用 `clone()`，所以 GPU 上只有 2 份车体几何。

### 面数与实测

- 单节：车头 1,319 面、中间车 694 面 → **8 节合计 6,802 面**，比提示词里的 5,000 面高约 36%。原因是转向架本身就占每车约 420 面（8 节就是 3,360 面），在保留"每台转向架 4 个车轮"的前提下 5,000 面会把车壳压到 200 面以下，鼻锥曲面会塌。要严格执行 5,000 就把车轮降到 8 边、去掉车顶导流角，随时可以再出一版。
- 每帧开销（无头 Chrome + SwiftShader，1440×900）：**22 次 draw call、15,111 三角面、4 张纹理**。
- 帧率只给相对结论：同一场景在 1.30 / 0.58 / 0.26 Mpx 下分别是 22 / 37 / 54 fps，面数与调用数完全不变 —— 瓶颈是软件光栅化的像素填充，不是场景复杂度。所以这里不报"多少 fps"，只报场景开销；真机请以实际体验为准。
- 回归验证：`node .cache/verify3d.mjs` 共 21 项（GLB 加载、8 节编组、几何复用、运动与减速、镜头锁车头、中键旋转、右键禁用平移、未建模车型兜底、从路局卡片跳转），全部通过；地图页原有 35 项仍全通过。构建产物在 `/cntrainhub/` 子路径 + SPA 回源下的冒烟测试无 404、无控制台错误。

## 已知限制

- **车站等级不是官方评定**：省会 / 地级市 / 县级由"车站是否落在该地级市城区"推断（站名主体与地级市同名视为主站），用于视图分级，不等同于国铁集团车站技术等级。
- **路局归属为省级近似**：蒙东、豫南、苏北等交界地区存在跨局例外。
- **命名线路仅 31 条**：另有 9 条因 OSM 子图缺走廊而被主动丢弃（原因写入 `data/railways.json` 的 `metadata.droppedLines`）。这些区域由路网底图呈现，放大后可点击单条边查看真实属性，但没有名称与年份。
- **"途经车次数量"已移除**：该值此前是编造的演示数据；接入 12306 车次数据后再恢复。
- **配属数量与车型清单为整理值**：来自项目方汇总的 2025 年至 2026 年初公开报道，随新线开通与车辆调配动态变化；太原局与青藏集团未在该表内，沿用前次整理并已标注。车组号级实时配属需查 EmuSearch 等专业库（本项目未抓取）。
- **变体后缀语义按公开命名规律解释**（`-A` 长编组、`-G` 高寒、`-Z` 智能等），个别型号有专属含义时按型号显式覆盖，不套用通用规则。
- **3D 模型只覆盖 CR400BF-G**，且是在外部生成的初模上做清理与优化，不是从零精模：车窗黑带、"复兴号"字样、车门分割线都来自烘焙贴图，几何上没有独立车窗网格，因此提示词里"车窗用 `MeshBasicMaterial #0a0a0a`"这一条未落实（黑窗在贴图中）。
- **中间车由车头车切掉司机室以前段、封盖后 X 向拉伸 1.287 倍**得到，所以车窗比真实比例宽约 29%；两端封盖是深色 n-gon，藏在 1.036 m 车钩间隙里基本看不见。
- **受电弓未建模**：8 节里只有 2 节带弓，加上去会明显挤占面数预算；车顶只有空调机组与导流角。
- **鼻锥处的车钩罩**用深色封盖近似，真车是白色两瓣罩。
- **车顶"纯白"与车体"象牙白"没有拆成两种材质**，以守住 ≤5 材质的约束（车体材质本身就接近白）。
- 底图瓦片与详细路网分别依赖 Esri 与 jsDelivr CDN；本机到这些域名的网络会间歇 `ERR_CONNECTION_RESET`，此时命名线路、车站与省界仍正常工作。
- 性能数字来自无头 Chrome（`--disable-gpu`，软件栅格化），绝对值偏保守且重复测量方差大；请以目标机器上右下角的实时 fps 为准。

## 参考项目

- [linroger/china-hsr-simulation](https://github.com/linroger/china-hsr-simulation) — Mapbox GL 中国高铁运行模拟
- [Atfayee/China-railway-system](https://github.com/Atfayee/China-railway-system) — Angular 中国铁路数据可视化

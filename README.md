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
vite.config.js             publicDir 关闭（数据改为打包 import）
src/main.js                地图、动画、分级、筛选、拾取与悬浮、卡片、路网加载
src/style.css              深色科技风、发光、卡片过渡、悬浮提示、响应式
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

## 已知限制

- **车站等级不是官方评定**：省会 / 地级市 / 县级由"车站是否落在该地级市城区"推断（站名主体与地级市同名视为主站），用于视图分级，不等同于国铁集团车站技术等级。
- **路局归属为省级近似**：蒙东、豫南、苏北等交界地区存在跨局例外。
- **命名线路仅 31 条**：另有 9 条因 OSM 子图缺走廊而被主动丢弃（原因写入 `data/railways.json` 的 `metadata.droppedLines`）。这些区域由路网底图呈现，放大后可点击单条边查看真实属性，但没有名称与年份。
- **"途经车次数量"已移除**：该值此前是编造的演示数据；接入 12306 车次数据后再恢复。
- 底图瓦片与详细路网分别依赖 Esri 与 jsDelivr CDN；本机到这些域名的网络会间歇 `ERR_CONNECTION_RESET`，此时命名线路、车站与省界仍正常工作。
- 性能数字来自无头 Chrome（`--disable-gpu`，软件栅格化），绝对值偏保守且重复测量方差大；请以目标机器上右下角的实时 fps 为准。

## 参考项目

- [linroger/china-hsr-simulation](https://github.com/linroger/china-hsr-simulation) — Mapbox GL 中国高铁运行模拟
- [Atfayee/China-railway-system](https://github.com/Atfayee/China-railway-system) — Angular 中国铁路数据可视化

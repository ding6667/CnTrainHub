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
| 暗色底图 | Leaflet `L.tileLayer` + 免密钥暗色瓦片，瓦片层用 CSS `filter` 压到 `#0a0a1a` 蓝黑基调 |
| 初始视角 | `fitBounds` 到中国全境（含南海诸岛），滚轮缩放 + 拖拽 |
| 生长动画 | `requestAnimationFrame` + `L.Polyline.setLatLngs()`，按累计里程插值，逐条错开 100 ms，`ease-out` 收尾；移动端与 `prefers-reduced-motion` 直接呈现完整线条 |
| 缩放分级 | `zoomend` 监听：`<6` 干线 + 枢纽站；`6–8` 增加区域性线路与地级市站；`>8` 全部线路、车站与站名标签 |
| 筛选面板 | 左上角半透明浮层：线路类型（高铁 G / 动车 D / 城际 C / 普速 K·Z·T）、车站等级（4F / 4A / 一等站 / 二等站）、18 个铁路局，任一变化即时重绘 |
| 信息卡片 | 点击线路或车站，在点击点旁弹出，300 ms 淡入 + 上滑；随地图平移保持锚定；点击空白、`✕`、`Esc` 均可关闭；移动端转为底部抽屉 |
| 铁路局标记 | 18 个菱形 `divIcon`，悬停显示全称与管辖范围简述 |
| 线路发光 | `filter: drop-shadow(0 0 3px currentColor)`，颜色由 `.rail-line--{family}` 类的 CSS `color` 提供 |
| 响应式 | ≤768px 面板改为可收起抽屉、卡片转底部抽屉、隐藏次要按钮 |

线路配色：高铁 `#e63946`、动车 `#f4a261`、城际 `#f7b955`、普速 `#457b9d`。

## 关于底图：CartoDB Dark Matter 已不再免密钥

需求中指定的 `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png` 现在对无密钥请求返回 **`API KEY REQUIRED`** 水印瓦片（`dark_nolabels` 与 `cartodb-basemaps-*.global.ssl.fastly.net` 旧域名同样如此），已不能"免密钥直接使用"。

因此默认底图换成同样免密钥、同为暗色的 **Esri World Dark Gray Base**，并保留一行切换：

- 默认：`http://localhost:5173/`
- 对比 CARTO：`http://localhost:5173/?basemap=cartoDark`（自行申请 CARTO key 后，把 `src/main.js` 顶部 `BASEMAPS.cartoDark` 的 URL 换成带 key 的地址，并将 `BASEMAP` 常量改为 `'cartoDark'`）

底图配置集中在 `src/main.js` 的 `BASEMAPS` 常量里。

## 项目结构

```
index.html                 单页骨架：地图容器、筛选面板、信息卡片、图例、加载层
vite.config.js             publicDir 指向 data/，构建时把 GeoJSON 复制到站点根目录
src/main.js                地图、动画、分级、筛选、卡片、全量路网加载
src/style.css              深色科技风、发光、卡片过渡、响应式
scripts/build-data.mjs     从真实数据源重新生成 data/*.json
data/railways.json         8 条主干线路（真实 OSM 几何，简化后 38 KB）
data/stations.json         24 个主要车站（真实坐标 + 12306 电报码）
data/railway-bureaus.json  18 个铁路局机关驻地与管辖范围
data/china-provinces.json  34 个省级面 + 8 条境界线（含南海诸岛）
vercel.json / netlify.toml 部署配置
```

数据放在 `publicDir`，运行时以 `fetch('railways.json')` 读取，不进 JS 包（包体 165 KB / gzip 50 KB）。

## 数据来源与许可

| 内容 | 来源 | 许可 |
| --- | --- | --- |
| 线路几何 | `@railroute-ts/china` 2026.9.1（OSM 主干路网，12 445 条边） | 代码 MIT，数据 ODbL-1.0 © OpenStreetMap contributors |
| 车站坐标 | 同上（9 326 个车站英文名与坐标） | ODbL-1.0 |
| 车站电报码/拼音 | [12306 `station_name.js`](https://kyfw.12306.cn/otn/resources/js/framework/station_name.js) | 公开接口 |
| 省界与境界线 | [chinese-global-compliant-geodata](https://github.com/JayMuShui/chinese-global-compliant-geodata) `chn-level-1.json` | MIT |
| 铁路局清单 | 参考 [60464/railwaymap](https://github.com/60464/railwaymap) 的管辖范围口径 | — |
| 底图瓦片 | Esri World Dark Gray Base（免密钥） | Esri 非商业许可，需保留署名 |

`data/*.json` 均由 `scripts/build-data.mjs` 生成，不是手工描点：

- 线路按"端点 + 主枢纽途经点"在真实路网上求最短路拼接；途经点若使里程相对端点直连膨胀超过 6% 会被自动弃用（OSM 上部分中间站是断头碎片，强行经过会造成上千公里绕行）。
- 几何经 Ramer–Douglas–Peucker 简化（ε=0.003°）后保留 4 位小数。
- 生成结果与官方里程对比：京津城际 162/150 km、京沪高铁 1368/1318 km、京广高铁 2437/2298 km、沪昆高铁 2311/2252 km、哈大高铁 1108/921 km、成渝高铁 340/308 km、西成高铁 762/643 km、陇海铁路 1659/1759 km。差异来自 OSM 简化与线路取直方式，卡片同时展示"线路里程（官方）"和"图示路径"两项。

### 重新生成数据

`scripts/build-data.mjs` 读取 `.cache/`（已 gitignore）里的两个源文件，克隆后先执行：

```bash
mkdir -p .cache
curl -L -o .cache/chn-level-1.json \
  "https://cdn.jsdelivr.net/gh/JayMuShui/chinese-global-compliant-geodata@main/src/geojson/countries/as/chn/global/chn-level-1.json"
curl -L -o .cache/station_name.js \
  "https://kyfw.12306.cn/otn/resources/js/framework/station_name.js"
npm run build:data
```

## 加载全量数据

示例数据只含 8 条线路。两种扩展方式：

1. **界面按钮**：右上角"全量路网"按需拉取 railroute-ts 发布的 CDN 网络（约 4.4 MB、12 445 条边），用 Canvas 渲染器画成低透明度底图，可再次点击隐藏。
2. **打包进应用**：`npm install railroute-ts @railroute-ts/china`，然后
   ```js
   import { CHINA_NETWORK, CHINA_STATIONS } from '@railroute-ts/china';
   L.geoJSON(CHINA_NETWORK, { pane: 'pane-network', style: { color: '#2c3f77', weight: 1, opacity: 0.45 } }).addTo(map);
   ```
   注意 `network.json` 解压后 4.5 MB，建议用动态 `import()` 或运行时 `fetch` 而不是静态引入。

车次信息可再接 [HerbertHe/cr-12306-train-info](https://github.com/HerbertHe/cr-12306-train-info)：其 `trains` 列表按车型（G/D/C/K/T/Z）与停靠站给出，可替换 `stations.json` 里作为演示值的 `trains`（途经车次）字段，并驱动线路卡片的"途经主要城市"。

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

- `stations.json` 的车站等级（4F/4A/一等站/二等站）与"途经车次"是演示值，用于让筛选维度可见生效，不代表官方评定。
- 示例线路仅 8 条，`zoom>8` 时"全部线路"即指这 8 条；接入全量路网后需为边数据补 `tier` 分级字段才能复用同一分级逻辑。
- 底图瓦片依赖外部服务；本机到 CARTO/OSM 瓦片域名的网络不稳定时会出现短暂空白，矢量图层不受影响。

## 参考项目

- [linroger/china-hsr-simulation](https://github.com/linroger/china-hsr-simulation) — Mapbox GL 中国高铁运行模拟
- [Atfayee/China-railway-system](https://github.com/Atfayee/China-railway-system) — Angular 中国铁路数据可视化

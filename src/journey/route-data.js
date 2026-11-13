/**
 * route-data.js —— 铁路线路纯数据 + 纯查询函数。ES module，零 import（仅标准 JS），不碰 THREE/DOM。
 *
 * 【单位契约】Route.officialKm / Node.km / 各函数 km 形参 = 公里（km）；radiusM = 米（m）。
 * 与 config.js「里程严格」口径一致：列车 travel 是「真实公里数（米）」，
 * stream.js 用 travelMeters/CHUNK.length 求 chunk id，本文件只提供 km 标尺。
 *
 * 【km 推算口径 —— 不编造】
 *  1. 每条线路以「官方运营里程」锚定终点 km（officialKm，来源见 route.sources / 文件头）。
 *  2. 中间站坐标优先取 data/stations.json 的真实经纬度（哈尔滨局 240 个真实站，
 *     另含沈阳局的长春/沈阳北/大连北等），telecode 一并写入 stationId。
 *     注意：stations.json 存在同名异地站（如「肇东」属兰州局 94.98/41.40、「伊春」属南昌局），
 *     这些一律改用 FALLBACK 坐标并注明，不直接采用，以免里程被拉到几千公里外。
 *  3. 两种口径（按资料可得性择一，逐线写在 kmBasis 里）：
 *     a) 官方区间里程优先（滨绥铁路）：直接用公开车站公里标尺作锚点，
 *        锚点之间的站用 config.geoDistance 球面距离按比例补间。
 *     b) 其余线路：相邻站用 config.js 同款 haversine(geoDistance, R=6371008.8) 算球面直线距离，
 *        逐段累加得到「原始累计里程」，再乘 officialKm/原始累计长 作整体线性缩放，
 *        使末站 km 严格等于 officialKm => 站间 km 是「按真实经纬度推算的相对里程」，非官方区间标尺。
 *  4. 哈尔滨市区（哈尔滨站 ±CITY_RADIUS_M=30 km 内）的枢纽/地标/车辆段节点：
 *     站房用真实坐标；地标与车辆段为「近似坐标」（维基/地图 POI，相对方位见下）。
 *     其 km 按到线路起点的真实球面距离换算，仅作 chunk 触发标尺，
 *     市区真实摆位由 config.geoToXY(lon,lat) 决定，与 km 不必强行一致。
 *  5. 官方里程 ≠ 图示路径长度：data/railways.json 的 officialKm 是运营里程，
 *     同一条线的 lengthKm（OSM 折线几何长度）普遍更大（哈大高铁 921 vs 1108，
 *     哈齐高铁 286 vs 295），因折线含展线/绕行/站外联络线。本文件一律以运营里程为准。
 *
 * 【相对哈尔滨站（config.ORIGIN 126.6254, 45.7600）的方位 —— 经纬度均为近似】
 *  - 圣索菲亚教堂：西北约 1 km（维基 45.76820/126.62127；腾讯 POI 45.7701/126.6271）
 *  - 防洪纪念塔：西北约 2.4 km（松花江南岸斯大林公园，腾讯 POI 45.780659/126.617123）
 *  - 松花江铁路桥（滨洲铁路桥/老江桥）：正北约 3.1 km（腾讯 POI 45.787986/126.623839）
 *  - 哈尔滨西站：西南约 8 km（BIGEMAP「东北距哈尔滨站8公里」，126.5772/45.7074 真实坐标）
 *  - 哈西动车运用所：哈尔滨西站内（该站设 1 个动车所），西南约 7 km
 *  - 哈尔滨动车段：南岗区王岗镇，西南约 15 km（腾讯 POI 45.64516/126.526908）
 *  - 三棵树机务段：段机关在道外区三机路（三棵树线与滨北线之间），南侧接入哈尔滨东站，东北约 7 km；
 *    其动车车间位于哈尔滨西站西广场（维基百科「三棵树机务段」）
 *
 * 【联网核实资料（标题 + URL + 关键数字）】
 *  - [哈大高铁] 光明日报：哈大高铁12月1日开通运营 | https://epaper.gmw.cn/gmrb/html/2012-11/25/nw.D110000gmrb_20121125_2-01.htm | 营业里程921 km，设计时速350 km，2012-12-01开通；全线23站：哈尔滨西、双城北、扶余北、德惠西、长春、长春西、公主岭南、四平东、昌图西、开原西、铁岭西、沈阳北、沈阳、辽阳、鞍山西、海城西、营口东、盖州西、鲅鱼圈、瓦房店西、普湾、大连北、大连
 *  - [哈大高铁] 人民网：铁道部:哈大高铁12月1日运营 设计时速350公里 | https://politics.people.com.cn/n/2012/1124/c70731-19683257.html | 921 km / 350 km·h⁻¹；运营初期冬季200、夏季300 km·h⁻¹两张图
 *  - [哈大高铁] 项目内 data/railways.json | data/railways.json | officialKm=921（运营里程） vs lengthKm=1108（OSM 折线几何长度）；year=2012，speed=350；图示路径长度 ≠ 运营里程
 *  - [哈齐高铁] 人民网：中国最北高铁哈齐高铁开通运营 时速250公里 | https://politics.people.com.cn/n/2015/0817/c70731-27471772.html | 新建正线长度281 km，设计速度250 km/h，2015-08-17开通；8站：哈尔滨北、肇东、安达、大庆东、大庆西、泰康、红旗营东、齐齐哈尔南；松花江特大桥位于既有滨洲桥东侧59.34 m
 *  - [哈齐高铁] 中新网：中国最北高寒高铁今起开始联调联试 | https://www.chinanews.com.cn/cj/2015/05-23/7296525.shtml | 正线281 km，2009-11-30开工，2015-08投入运营，设计速度250 km/h
 *  - [哈齐高铁] 经济日报：飞奔在温差70摄氏度的黑土地 | http://paper.ce.cn/jjrb/html/2015-08/31/content_255138.htm | 2015-08-17开通，高铁网向北延伸279 km，初期运营时速250 km；全线设哈尔滨、哈尔滨北、肇东、安达、大庆东、大庆西、泰康、齐齐哈尔南8站
 *  - [哈齐高铁] 项目内 data/railways.json | data/railways.json | officialKm=286（运营里程） vs lengthKm=295（OSM 折线几何长度）；正线281 km（人民网）；三种口径并列
 *  - [滨洲铁路] 百度百科：滨洲铁路 | https://baike.baidu.com/item/%E6%BB%A8%E6%B4%B2%E9%93%81%E8%B7%AF/10572110 | 全长934.8 km，1903年7月全线通车，设计速度160 km/h、运营速度120 km/h；哈尔滨→肇东→安达→大庆西→昂昂溪→扎兰屯→牙克石→海拉尔→满洲里；1898开工，中东铁路西部干线
 *  - [滨洲铁路] 搜狗百科：滨州铁路 | https://baike.sogou.com/v5167307.htm | 全长935公里，共有车站99个；经肇东、安达、龙凤、大庆、让湖路、泰康、昂昂溪、扎兰屯、博克图、牙克石、免渡河、海拉尔、扎赉诺尔到满洲里
 *  - [滨洲铁路] 中新网：百年滨州铁路进入电气化时代 | https://m.chinanews.com/wap/detail/cht/zw/8050276.shtml | 1903年投入运营；2014-10电气化改造工程全长933 km，哈齐段开通
 *  - [滨绥铁路] 中国铁路网-滨绥铁路（辉睿） | https://www.huiruisoft.com/train/railway/1580.html | 全长548 km，1903-07-14开通，设计速度120–200 km/h；沿线车站公里标尺：哈尔滨0/王兆屯5/香坊7/新香坊14/成高子20/阿城41/亚沟52/玉泉62/小岭79/平山89/帽儿山100/乌吉密131/尚志141/一面坡151…；站序：哈尔滨—阿城—玉泉—平山—帽儿山—尚志—一面坡—苇河—亚布力—横道河子—海林—牡丹江—穆棱—绥阳—绥芬河
 *  - [滨绥铁路] 百度百科：滨绥铁路 | https://baike.baidu.com/item/%E6%BB%A8%E7%BB%A5%E7%BA%BF/1718268 | 正线全长494.6 km（上行495.0/下行494.6），1901-03-03全线贯通、1903-07-14中东铁路全线通车；哈牡段电气化350.4 km 设计120 km/h（2018-12竣工），牡绥段新线138.8 km 设计200 km/h；2019全面电气化
 *  - [滨绥铁路] 国家铁路集团/科技日报：中欧班列东通道再升级 | http://www.china-railway.com.cn/xwzx/mtjj/kjrb/202405/t20240531_136446.html | 滨绥铁路绥芬河至国境线改造：既有线时速仅55 km，改建后设计时速120 km
 *  - [哈佳铁路] 国家铁路局：我国高寒地区最长快速铁路——哈佳铁路正式开通运营 | https://www.nra.gov.cn/xwzx/xwxx/xwlb/202204/t20220405_280180.shtml | 线路全长344 km，设计时速200 km/h，2018-09-30开通，19座车站（哈尔滨、太平桥、宾西北、宾州、胜利镇、方正、得莫利、依兰、佳木斯等）
 *  - [哈佳铁路] 维基百科：哈佳铁路 | https://www.fbrowser.org/wikipedia/w/index.php?oldid=92272012 | 全长343 km，其中新建线路336.8 km、改造既有线6.2 km，设计时速200 km/h，2018-09-30投入运营；19站：哈尔滨、太平桥、赵安屯、宾西北、宾西东、宾州、宾安、胜利镇、日兴屯、双龙湖、方正、得莫利、高楞、达连河、依兰、宏克力、兴华、佳木斯西、佳木斯
 *  - [哈佳铁路] 人民网旅游：哈佳快速铁路通车 冬游黑龙江更便利 | https://travel.people.com.cn/n1/2018/1015/c41570-30342673.html | 线路设计全长344 km，设计时速200 km；19站含 双龙湖、高楞、达连河、宏克力、佳木斯西
 *  - [哈牡高铁] 中国国家铁路集团：哈尔滨至牡丹江客运专线开始联调联试 | http://www.china-railway.com.cn/xwzx/ywsb/201812/t20181214_77595.html | 全长约293 km，设计时速250 km；11站：哈尔滨、新香坊北、阿城北、帽儿山西、尚志南、一面坡北、苇河西、亚布力西、横道河子东、海林北、牡丹江
 *  - [哈牡高铁] 国务院国资委：哈牡高铁正式开通运营 中国铁建参建 | http://www.sasac.gov.cn/n2588025/n2588124/c10093029/content.html | 全长292.995 km，设计时速250 km，2018-12-25开通，11座车站
 *  - [哈牡高铁] 中国青年网：哈牡高铁开通 多地共享旅游商贸集合区 | https://t.m.youth.cn/transfer/index/url/df.youth.cn/yczq/201812/t20181226_11825434.htm | 全长293.204 km，设计时速250 km，2018-12-25开通，哈尔滨站同步投用
 *  - [京哈高铁（哈尔滨—长春段）] 中新网：北京至哈尔滨高铁22日开通运营 首日开行4对高速动车组列车 | https://m.chinanews.com/wap/detail/cht/zw/9392677.shtml | 京哈高铁全长1198 km，设计时速350 km，2021-01-22全线贯通；沈阳至哈尔滨段2012-12-01已开通（与哈大高铁共线），初期运营时速300 km
 *  - [京哈高铁（哈尔滨—长春段）] 黑龙江卫视/人民铁道：全线贯通!京哈高铁今日开通运营 | http://mp.weixin.qq.com/s?__biz=MzA5MDAxNTgwMQ==&mid=2652096486&idx=3&sn=aaecb8c502192becfa5e5d5f630da231 | 运营里程1198 km，30座车站（哈尔滨西、双城北、长春西、四平东、铁岭西、沈阳北…北京朝阳）；哈尔滨西—长春西未单列独立里程
 *  - [哈伊高铁] 黑龙江省人民政府：中国最北高铁哈伊高铁正式通车运营 | https://www.hlj.gov.cn/hlj/c107856/202609/c00_31980095.shtml | 线路全长318 km，设计时速250 km，2026-09-28通车；9站：哈尔滨、哈尔滨北、呼兰北、兴隆镇西、绥化南、庆安南、铁力、日月峡、伊春西；哈尔滨—绥化最快42分钟、哈尔滨—伊春最快1小时46分
 *  - [哈伊高铁] 黑龙江省人民政府：哈尔滨至伊春高铁将于9月28日开通运营 | https://www.hlj.gov.cn/hljapp/c116056/202609/c00_31979377.shtml | 正线全长318 km，设计时速250 km，最高运营时速250 km；2022全线开工
 *  - [哈伊高铁] 维基百科：伊春西站 | https://www.fbrowser.org/wikipedia/zh/%E4%BC%8A%E6%98%A5%E8%A5%BF%E7%AB%99 | 地理坐标 47.722388°N / 128.736731°E，2026-09-28启用，中国大陆最北端高铁站
 *  ---- 市区地标 / 车辆段 ----
 *  - 维基百科：圣索菲亚教堂（哈尔滨） | https://www.wikiwand.com/zh-cn/%E5%93%88%E5%B0%94%E6%BB%A8%E5%9C%A3%E7%B4%A2%E8%8F%B2%E4%BA%9A%E6%95%99%E5%A0%82 | 坐标 45°46′06″N 126°37′17″E（45.76820/126.62127），道里区近中央大街；相对哈尔滨站西北约 1 km
 *  - 腾讯地图 POI：哈尔滨防洪纪念塔广场 | （腾讯地图 POI 查询，无公开 URL；45.780659/126.617123） | 道里区斯大林街3号斯大林公园内，松花江南岸；相对哈尔滨站西北约 2.4 km
 *  - 腾讯地图 POI：松花江滨洲铁路桥 | （腾讯地图 POI 查询，无公开 URL；45.787986/126.623839） | 道外区，网红打卡的百年老江桥；相对哈尔滨站正北约 3.1 km
 *  - 人民网：中国最北高铁哈齐高铁开通运营 | https://politics.people.com.cn/n/2015/0817/c70731-27471772.html | 哈齐高铁松花江特大桥全长3258 m，位于既有滨洲桥东侧59.34 m（印证滨洲铁路桥方位）
 *  - BIGEMAP：哈尔滨西站 | http://www.bigemap.net/city-8978.html | 经度126.577224/纬度45.707387；东北距哈尔滨站8公里；站内设高速/普速2个站场和1个动车所（哈西动车所）
 *  - 维基百科：三棵树机务段 | https://warnen.ru/wikipedia/wiki/%E4%B8%89%E6%A3%B5%E6%A8%B5%E6%9C%BA%E5%8A%A1%E6%AE%B5 | 1932年成立，中国最北客运机务段；段机关在道外区三机路（三棵树线与滨北线之间），南侧向哈尔滨东站有2条股道接入；动车车间位于哈尔滨西站西广场
 *  - 腾讯地图 POI：哈尔滨动车段 | （腾讯地图 POI 查询，无公开 URL；45.64516/126.526908） | 南岗区王岗镇哈前公路与哈尔滨绕城高速交叉口西北约680 m；相对哈尔滨站西南约 15 km
 *
 * 【哪些是近似】① 所有地标/车辆段经纬度（维基/地图 POI 概位）；
 * ② 长春西、肇东（stations.json 同名异地站污染后按相邻真实站插补）、哈牡高铁用既有线站
 *    苇河/横道河子/海林 代 苇河西/横道河子东/海林北、哈伊高铁用既有线站 兴隆镇/绥化/庆安 代
 *    兴隆镇西/绥化南/庆安南；③ 除滨绥外的站间 km（直线比例推算，非官方区间标尺）；
 * ④ 京哈高铁哈尔滨—长春段 240 km（按哈大高铁同源推算，非独立官方里程）；
 * ⑤ 滨洲/滨绥的 speed 与 year 取公开整理值（设计速度 / 中东铁路通车年）。
 */

export const ROUTES = [
  {
    id: "harbin-dalian-hsr",
    name: "哈大高铁",
    officialKm: 921,
    speed: 350,
    year: 2012,
    color: "#e6503f",
    kmBasis: "官方运营里程 921 km（哈尔滨西—大连北，2012-12-01 开通，设计时速 350）锚定末站 km。中间站取 stations.json 真实经纬度，逐段用 config.geoDistance 球面距离累加，再按 921/直线累计长 整体线性缩放。站序按光明日报公布的 23 站整理；stations.json 缺 双城北/昌图西/开原西/铁岭西/瓦房店西/普湾/大连 等站精确坐标，未编造，予以省略；长春西站缺失，以相邻真实站方位标定的近似坐标代入。注意 data/railways.json 的 officialKm=921 与 lengthKm=1108 差异：后者是 OSM 折线几何长度（含展线/绕行），运营里程以 921 为准。",
    sources: [
    { title: "光明日报：哈大高铁12月1日开通运营", url: "https://epaper.gmw.cn/gmrb/html/2012-11/25/nw.D110000gmrb_20121125_2-01.htm", note: "营业里程921 km，设计时速350 km，2012-12-01开通；全线23站：哈尔滨西、双城北、扶余北、德惠西、长春、长春西、公主岭南、四平东、昌图西、开原西、铁岭西、沈阳北、沈阳、辽阳、鞍山西、海城西、营口东、盖州西、鲅鱼圈、瓦房店西、普湾、大连北、大连" },
    { title: "人民网：铁道部:哈大高铁12月1日运营 设计时速350公里", url: "https://politics.people.com.cn/n/2012/1124/c70731-19683257.html", note: "921 km / 350 km·h⁻¹；运营初期冬季200、夏季300 km·h⁻¹两张图" },
    { title: "项目内 data/railways.json", url: "data/railways.json", note: "officialKm=921（运营里程） vs lengthKm=1108（OSM 折线几何长度）；year=2012，speed=350；图示路径长度 ≠ 运营里程" },
    ],
    nodes: [
    { name: "哈尔滨西", lon: 126.5723, lat: 45.7051, km: 0.0, role: "hub", stationId: "VAB" },
    { name: "哈西动车运用所", lon: 126.5779, lat: 45.7069, km: 0.479, role: "depot", stationId: "haxi-emu-depot", note: "近似（哈尔滨西站 POI 45.706914/126.577897）：哈西站内设 1 个动车所" },
    { name: "哈尔滨站", lon: 126.6254, lat: 45.76, km: 7.366, role: "hub", stationId: "HBB", note: "config.ORIGIN 投影原点，stations.json 真实坐标" },
    { name: "哈尔滨动车段", lon: 126.5269, lat: 45.6452, km: 7.616, role: "depot", stationId: "harbin-emu-depot", note: "近似（腾讯地图 POI 45.64516/126.526908）：南岗区王岗镇，哈尔滨站西南约 15 km" },
    { name: "圣索菲亚教堂", lon: 126.6213, lat: 45.7682, km: 7.981, role: "landmark", landmarkId: "saint-sophia", note: "近似（维基百科 45.76820/126.62127；腾讯 POI 45.7701/126.6271）：哈尔滨站西北约 1 km" },
    { name: "香坊", lon: 126.6737, lat: 45.719, km: 8.231, role: "hub", stationId: "XFB", note: "stations.json 真实坐标" },
    { name: "哈尔滨北", lon: 126.5296, lat: 45.8481, km: 9.0, role: "hub", stationId: "HTB", note: "stations.json 真实坐标" },
    { name: "哈尔滨东", lon: 126.7056, lat: 45.7866, km: 9.25, role: "hub", stationId: "VBB", note: "stations.json 真实坐标，原三棵树站一带" },
    { name: "松花江铁路桥", lon: 126.6238, lat: 45.788, km: 9.5, role: "landmark", landmarkId: "songhua-rail-bridge", note: "近似（腾讯地图 POI 45.787986/126.623839）：滨洲铁路桥/老江桥，哈尔滨站正北约 3.1 km" },
    { name: "防洪纪念塔", lon: 126.6171, lat: 45.7807, km: 9.75, role: "landmark", landmarkId: "flood-monument", note: "近似（腾讯地图 POI 45.780659/126.617123）：斯大林公园内松花江南岸，哈尔滨站西北约 2.4 km" },
    { name: "三棵树机务段", lon: 126.71, lat: 45.788, km: 10.0, role: "depot", stationId: "sankeshu-loco", note: "近似：段机关在道外区三机路（三棵树线与滨北线之间），南侧接入哈尔滨东站，东北约 7 km；动车车间在哈西西广场" },
    { name: "扶余北", lon: 125.9974, lat: 45.0061, km: 95.821, role: "hub", stationId: "FBT" },
    { name: "德惠西", lon: 125.6703, lat: 44.5436, km: 157.244, role: "local", stationId: "DXT" },
    { name: "长春", lon: 125.3177, lat: 43.9088, km: 238.336, role: "hub", stationId: "CCT" },
    { name: "长春西", lon: 125.18, lat: 43.92, km: 250.184, role: "hub", note: "stations.json 无长春西站；按哈大高铁线路折线方位标定的近似坐标（长春站偏东约 10 km）" },
    { name: "公主岭南", lon: 124.8097, lat: 43.4709, km: 312.24, role: "local", stationId: "GBT" },
    { name: "四平东", lon: 124.4329, lat: 43.1358, km: 363.631, role: "local", stationId: "PPT" },
    { name: "沈阳北", lon: 123.4294, lat: 41.8173, km: 543.087, role: "hub", stationId: "SBT" },
    { name: "沈阳", lon: 123.3879, lat: 41.7924, km: 547.8, role: "hub", stationId: "SYT" },
    { name: "辽阳", lon: 123.1631, lat: 41.2796, km: 611.856, role: "local", stationId: "LYT" },
    { name: "鞍山西", lon: 122.909, lat: 41.1164, km: 641.692, role: "local", stationId: "AXT" },
    { name: "海城西", lon: 122.6545, lat: 40.9122, km: 674.961, role: "local", stationId: "HXT" },
    { name: "营口东", lon: 122.4234, lat: 40.6236, km: 715.021, role: "local", stationId: "YGT" },
    { name: "盖州西", lon: 122.269, lat: 40.4029, km: 744.69, role: "local", stationId: "GAT" },
    { name: "鲅鱼圈", lon: 122.0899, lat: 40.1866, km: 775.053, role: "local", stationId: "BYT" },
    { name: "大连北", lon: 121.6024, lat: 39.0157, km: 921.0, role: "hub", stationId: "DFT" },
    ],
  },
  {
    id: "harbin-qiqihar-hsr",
    name: "哈齐高铁",
    officialKm: 286,
    speed: 250,
    year: 2015,
    color: "#3d8bd4",
    kmBasis: "以官方运营里程 286 km（哈尔滨—齐齐哈尔南）锚定末站 km；人民网口径「新建正线 281 km」、经济日报口径「向北延伸 279 km」、data/railways.json 折线 lengthKm=295（几何长度）均不同，本文件采用 data/railways.json 的 officialKm=286 作运营里程标尺。中间站按真实经纬度球面距离累加后整体线性缩放；官方 8 站中的 泰康/红旗营东 在 stations.json 无可靠坐标，未编造，予以省略；肇东为 stations.json 同名异地站污染后的线性插补近似坐标（见 note）。终点为齐齐哈尔南（不延伸到齐齐哈尔站）。",
    sources: [
    { title: "人民网：中国最北高铁哈齐高铁开通运营 时速250公里", url: "https://politics.people.com.cn/n/2015/0817/c70731-27471772.html", note: "新建正线长度281 km，设计速度250 km/h，2015-08-17开通；8站：哈尔滨北、肇东、安达、大庆东、大庆西、泰康、红旗营东、齐齐哈尔南；松花江特大桥位于既有滨洲桥东侧59.34 m" },
    { title: "中新网：中国最北高寒高铁今起开始联调联试", url: "https://www.chinanews.com.cn/cj/2015/05-23/7296525.shtml", note: "正线281 km，2009-11-30开工，2015-08投入运营，设计速度250 km/h" },
    { title: "经济日报：飞奔在温差70摄氏度的黑土地", url: "http://paper.ce.cn/jjrb/html/2015-08/31/content_255138.htm", note: "2015-08-17开通，高铁网向北延伸279 km，初期运营时速250 km；全线设哈尔滨、哈尔滨北、肇东、安达、大庆东、大庆西、泰康、齐齐哈尔南8站" },
    { title: "项目内 data/railways.json", url: "data/railways.json", note: "officialKm=286（运营里程） vs lengthKm=295（OSM 折线几何长度）；正线281 km（人民网）；三种口径并列" },
    ],
    nodes: [
    { name: "哈尔滨西", lon: 126.5723, lat: 45.7051, km: 0.0, role: "hub", stationId: "VAB" },
    { name: "哈西动车运用所", lon: 126.5779, lat: 45.7069, km: 0.479, role: "depot", stationId: "haxi-emu-depot", note: "近似（哈尔滨西站 POI 45.706914/126.577897）：哈西站内设 1 个动车所" },
    { name: "哈尔滨站", lon: 126.6254, lat: 45.76, km: 7.366, role: "hub", stationId: "HBB", note: "config.ORIGIN 投影原点，stations.json 真实坐标" },
    { name: "哈尔滨动车段", lon: 126.5269, lat: 45.6452, km: 7.616, role: "depot", stationId: "harbin-emu-depot", note: "近似（腾讯地图 POI 45.64516/126.526908）：南岗区王岗镇，哈尔滨站西南约 15 km" },
    { name: "圣索菲亚教堂", lon: 126.6213, lat: 45.7682, km: 7.981, role: "landmark", landmarkId: "saint-sophia", note: "近似（维基百科 45.76820/126.62127；腾讯 POI 45.7701/126.6271）：哈尔滨站西北约 1 km" },
    { name: "香坊", lon: 126.6737, lat: 45.719, km: 8.231, role: "hub", stationId: "XFB", note: "stations.json 真实坐标" },
    { name: "哈尔滨东", lon: 126.7056, lat: 45.7866, km: 9.0, role: "hub", stationId: "VBB", note: "stations.json 真实坐标，原三棵树站一带" },
    { name: "松花江铁路桥", lon: 126.6238, lat: 45.788, km: 9.25, role: "landmark", landmarkId: "songhua-rail-bridge", note: "近似（腾讯地图 POI 45.787986/126.623839）：滨洲铁路桥/老江桥，哈尔滨站正北约 3.1 km" },
    { name: "防洪纪念塔", lon: 126.6171, lat: 45.7807, km: 9.5, role: "landmark", landmarkId: "flood-monument", note: "近似（腾讯地图 POI 45.780659/126.617123）：斯大林公园内松花江南岸，哈尔滨站西北约 2.4 km" },
    { name: "三棵树机务段", lon: 126.71, lat: 45.788, km: 9.75, role: "depot", stationId: "sankeshu-loco", note: "近似：段机关在道外区三机路（三棵树线与滨北线之间），南侧接入哈尔滨东站，东北约 7 km；动车车间在哈西西广场" },
    { name: "哈尔滨北", lon: 126.5296, lat: 45.8481, km: 17.182, role: "hub", stationId: "HTB" },
    { name: "肇东", lon: 125.9831, lat: 46.0966, km: 70.571, role: "local", note: "stations.json 的「肇东」是兰州局同名异地站(94.98/41.40)，不可用；此坐标按哈尔滨北—安达两真实站经纬度线性插补（t≈0.45），近似" },
    { name: "安达", lon: 125.3152, lat: 46.4003, km: 135.592, role: "local", stationId: "ADX" },
    { name: "大庆东", lon: 125.116, lat: 46.5307, km: 157.858, role: "local", stationId: "LFX" },
    { name: "大庆西", lon: 124.8796, lat: 46.6553, km: 181.94, role: "hub", stationId: "RHX" },
    { name: "齐齐哈尔南", lon: 123.9653, lat: 47.2825, km: 286.0, role: "hub", stationId: "QNB" },
    ],
  },
  {
    id: "binzhou-railway",
    name: "滨洲铁路",
    officialKm: 935,
    speed: 160,
    year: 1903,
    color: "#2fa36b",
    kmBasis: "官方全长 934.8 km（约 935，百度百科/搜狗百科；电气化改造工程口径 933 km）锚定末站 km。所有中间站均取 stations.json 哈尔滨局真实坐标，按 config.geoDistance 球面距离累加后整体线性缩放至 935 km。既有线展线多，站间直线距离与实际运营里程差异较大，站间 km 为「按真实经纬度推算」而非官方区间标尺。speed=160 取设计速度（运营速度 120 km/h），year=1903 取中东铁路西部干线通车年。",
    sources: [
    { title: "百度百科：滨洲铁路", url: "https://baike.baidu.com/item/%E6%BB%A8%E6%B4%B2%E9%93%81%E8%B7%AF/10572110", note: "全长934.8 km，1903年7月全线通车，设计速度160 km/h、运营速度120 km/h；哈尔滨→肇东→安达→大庆西→昂昂溪→扎兰屯→牙克石→海拉尔→满洲里；1898开工，中东铁路西部干线" },
    { title: "搜狗百科：滨州铁路", url: "https://baike.sogou.com/v5167307.htm", note: "全长935公里，共有车站99个；经肇东、安达、龙凤、大庆、让湖路、泰康、昂昂溪、扎兰屯、博克图、牙克石、免渡河、海拉尔、扎赉诺尔到满洲里" },
    { title: "中新网：百年滨州铁路进入电气化时代", url: "https://m.chinanews.com/wap/detail/cht/zw/8050276.shtml", note: "1903年投入运营；2014-10电气化改造工程全长933 km，哈齐段开通" },
    ],
    nodes: [
    { name: "哈尔滨", lon: 126.6254, lat: 45.76, km: 0.0, role: "hub", stationId: "HBB" },
    { name: "圣索菲亚教堂", lon: 126.6213, lat: 45.7682, km: 0.966, role: "landmark", landmarkId: "saint-sophia", note: "近似（维基百科 45.76820/126.62127；腾讯 POI 45.7701/126.6271）：哈尔滨站西北约 1 km" },
    { name: "防洪纪念塔", lon: 126.6171, lat: 45.7807, km: 2.39, role: "landmark", landmarkId: "flood-monument", note: "近似（腾讯地图 POI 45.780659/126.617123）：斯大林公园内松花江南岸，哈尔滨站西北约 2.4 km" },
    { name: "松花江铁路桥", lon: 126.6238, lat: 45.788, km: 3.116, role: "landmark", landmarkId: "songhua-rail-bridge", note: "近似（腾讯地图 POI 45.787986/126.623839）：滨洲铁路桥/老江桥，哈尔滨站正北约 3.1 km" },
    { name: "香坊", lon: 126.6737, lat: 45.719, km: 5.902, role: "hub", stationId: "XFB", note: "stations.json 真实坐标" },
    { name: "哈尔滨东", lon: 126.7056, lat: 45.7866, km: 6.888, role: "hub", stationId: "VBB", note: "stations.json 真实坐标，原三棵树站一带" },
    { name: "哈西动车运用所", lon: 126.5779, lat: 45.7069, km: 7.138, role: "depot", stationId: "haxi-emu-depot", note: "近似（哈尔滨西站 POI 45.706914/126.577897）：哈西站内设 1 个动车所" },
    { name: "三棵树机务段", lon: 126.71, lat: 45.788, km: 7.388, role: "depot", stationId: "sankeshu-loco", note: "近似：段机关在道外区三机路（三棵树线与滨北线之间），南侧接入哈尔滨东站，东北约 7 km；动车车间在哈西西广场" },
    { name: "哈尔滨西", lon: 126.5723, lat: 45.7051, km: 7.638, role: "hub", stationId: "VAB", note: "stations.json 真实坐标；西南约 8 km" },
    { name: "哈尔滨北", lon: 126.5296, lat: 45.8481, km: 8.463, role: "hub", stationId: "HTB", note: "stations.json 真实坐标" },
    { name: "哈尔滨动车段", lon: 126.5269, lat: 45.6452, km: 8.713, role: "depot", stationId: "harbin-emu-depot", note: "近似（腾讯地图 POI 45.64516/126.526908）：南岗区王岗镇，哈尔滨站西南约 15 km" },
    { name: "新松浦", lon: 126.6597, lat: 45.8393, km: 9.963, role: "local", stationId: "XOB" },
    { name: "徐家", lon: 126.6378, lat: 45.9077, km: 18.393, role: "local", stationId: "XJB" },
    { name: "宋", lon: 125.6349, lat: 46.22, km: 110.142, role: "local", stationId: "SOB" },
    { name: "安达", lon: 125.3152, lat: 46.4003, km: 144.436, role: "local", stationId: "ADX" },
    { name: "大庆西", lon: 124.8796, lat: 46.6553, km: 191.77, role: "hub", stationId: "RHX" },
    { name: "昂昂溪", lon: 123.8096, lat: 47.1591, km: 298.563, role: "local", stationId: "AAX" },
    { name: "富拉尔基", lon: 123.6404, lat: 47.209, km: 313.642, role: "local", stationId: "FRX" },
    { name: "龙江", lon: 123.172, lat: 47.3271, km: 354.429, role: "local", stationId: "LJX" },
    { name: "碾子山", lon: 122.8764, lat: 47.5134, km: 387.309, role: "local", stationId: "NZX" },
    { name: "扎兰屯", lon: 122.7403, lat: 48.0124, km: 448.334, role: "local", stationId: "ZTX" },
    { name: "博克图", lon: 121.9141, lat: 48.7521, km: 559.122, role: "local", stationId: "BKX" },
    { name: "免渡河", lon: 121.053, lat: 49.0911, km: 638.466, role: "local", stationId: "MDX" },
    { name: "牙克石", lon: 120.7312, lat: 49.277, km: 672.233, role: "local", stationId: "YKX" },
    { name: "海拉尔", lon: 119.7356, lat: 49.2288, km: 750.618, role: "hub", stationId: "HRX" },
    { name: "满洲里", lon: 117.444, lat: 49.5841, km: 935.0, role: "hub", stationId: "MLX" },
    ],
  },
  {
    id: "binsui-railway",
    name: "滨绥铁路",
    officialKm: 548,
    speed: 120,
    year: 1903,
    color: "#d98b2b",
    kmBasis: "本线路是「官方区间里程优先」的示范：直接用辉睿/中国铁路网公布的车站公里标尺（哈尔滨0、阿城41、玉泉62、平山89、帽儿山100、尚志141、一面坡151）作锚点，牡丹江350 取哈牡段电气化全长350.4 km、绥芬河548 取全长548 km；锚点之间缺官方标尺的 苇河/亚布力/横道河子/海林/穆棱/绥阳 按相邻真实站 geoDistance 比例补间。口径差异：百度百科「正线494.6 km」是电气化改造后新线（哈牡350.4+牡绥138.8≈489 km），与旧线里程标尺 548 km 不同；本版沿用 548 km 旧线全长口径与官方公里标尺。speed=120 取哈牡段设计速度（牡绥段 200），year=1903 取中东铁路全线通车年。",
    sources: [
    { title: "中国铁路网-滨绥铁路（辉睿）", url: "https://www.huiruisoft.com/train/railway/1580.html", note: "全长548 km，1903-07-14开通，设计速度120–200 km/h；沿线车站公里标尺：哈尔滨0/王兆屯5/香坊7/新香坊14/成高子20/阿城41/亚沟52/玉泉62/小岭79/平山89/帽儿山100/乌吉密131/尚志141/一面坡151…；站序：哈尔滨—阿城—玉泉—平山—帽儿山—尚志—一面坡—苇河—亚布力—横道河子—海林—牡丹江—穆棱—绥阳—绥芬河" },
    { title: "百度百科：滨绥铁路", url: "https://baike.baidu.com/item/%E6%BB%A8%E7%BB%A5%E7%BA%BF/1718268", note: "正线全长494.6 km（上行495.0/下行494.6），1901-03-03全线贯通、1903-07-14中东铁路全线通车；哈牡段电气化350.4 km 设计120 km/h（2018-12竣工），牡绥段新线138.8 km 设计200 km/h；2019全面电气化" },
    { title: "国家铁路集团/科技日报：中欧班列东通道再升级", url: "http://www.china-railway.com.cn/xwzx/mtjj/kjrb/202405/t20240531_136446.html", note: "滨绥铁路绥芬河至国境线改造：既有线时速仅55 km，改建后设计时速120 km" },
    ],
    nodes: [
    { name: "哈尔滨", lon: 126.6254, lat: 45.76, km: 0.0, role: "hub", stationId: "HBB" },
    { name: "圣索菲亚教堂", lon: 126.6213, lat: 45.7682, km: 0.966, role: "landmark", landmarkId: "saint-sophia", note: "近似（维基百科 45.76820/126.62127；腾讯 POI 45.7701/126.6271）：哈尔滨站西北约 1 km" },
    { name: "防洪纪念塔", lon: 126.6171, lat: 45.7807, km: 2.39, role: "landmark", landmarkId: "flood-monument", note: "近似（腾讯地图 POI 45.780659/126.617123）：斯大林公园内松花江南岸，哈尔滨站西北约 2.4 km" },
    { name: "松花江铁路桥", lon: 126.6238, lat: 45.788, km: 3.116, role: "landmark", landmarkId: "songhua-rail-bridge", note: "近似（腾讯地图 POI 45.787986/126.623839）：滨洲铁路桥/老江桥，哈尔滨站正北约 3.1 km" },
    { name: "香坊", lon: 126.6737, lat: 45.719, km: 5.902, role: "hub", stationId: "XFB", note: "stations.json 真实坐标" },
    { name: "哈尔滨东", lon: 126.7056, lat: 45.7866, km: 6.888, role: "hub", stationId: "VBB", note: "stations.json 真实坐标，原三棵树站一带" },
    { name: "哈西动车运用所", lon: 126.5779, lat: 45.7069, km: 7.138, role: "depot", stationId: "haxi-emu-depot", note: "近似（哈尔滨西站 POI 45.706914/126.577897）：哈西站内设 1 个动车所" },
    { name: "三棵树机务段", lon: 126.71, lat: 45.788, km: 7.388, role: "depot", stationId: "sankeshu-loco", note: "近似：段机关在道外区三机路（三棵树线与滨北线之间），南侧接入哈尔滨东站，东北约 7 km；动车车间在哈西西广场" },
    { name: "哈尔滨西", lon: 126.5723, lat: 45.7051, km: 7.638, role: "hub", stationId: "VAB", note: "stations.json 真实坐标；西南约 8 km" },
    { name: "哈尔滨北", lon: 126.5296, lat: 45.8481, km: 9.0, role: "hub", stationId: "HTB", note: "stations.json 真实坐标" },
    { name: "哈尔滨动车段", lon: 126.5269, lat: 45.6452, km: 9.25, role: "depot", stationId: "harbin-emu-depot", note: "近似（腾讯地图 POI 45.64516/126.526908）：南岗区王岗镇，哈尔滨站西南约 15 km" },
    { name: "阿城", lon: 126.9885, lat: 45.5506, km: 41.0, role: "local", stationId: "ACB" },
    { name: "玉泉", lon: 127.1559, lat: 45.4146, km: 62.0, role: "local", stationId: "YQB" },
    { name: "平山", lon: 127.3993, lat: 45.3192, km: 89.0, role: "local", stationId: "PSB" },
    { name: "帽儿山", lon: 127.5148, lat: 45.2751, km: 100.0, role: "local", stationId: "MRB" },
    { name: "尚志", lon: 127.9556, lat: 45.2063, km: 141.0, role: "local", stationId: "SZB" },
    { name: "一面坡", lon: 128.0753, lat: 45.0594, km: 151.0, role: "local", stationId: "YPB" },
    { name: "苇河", lon: 128.3732, lat: 44.9504, km: 188.918, role: "local", stationId: "WHB" },
    { name: "亚布力", lon: 128.6089, lat: 44.9265, km: 215.866, role: "local", stationId: "YBB" },
    { name: "横道河子", lon: 129.0659, lat: 44.8124, km: 270.77, role: "local", stationId: "HDB" },
    { name: "海林", lon: 129.3802, lat: 44.5648, km: 324.094, role: "local", stationId: "HRB" },
    { name: "牡丹江", lon: 129.6051, lat: 44.5891, km: 350.0, role: "hub", stationId: "MDB" },
    { name: "穆棱", lon: 130.3533, lat: 44.6106, km: 443.429, role: "local", stationId: "MLB" },
    { name: "绥阳", lon: 130.8928, lat: 44.4263, km: 518.174, role: "local", stationId: "SYB" },
    { name: "绥芬河", lon: 131.129, lat: 44.4038, km: 548.0, role: "hub", stationId: "SFB" },
    ],
  },
  {
    id: "harbin-jiamusi-railway",
    name: "哈佳铁路",
    officialKm: 336,
    speed: 200,
    year: 2018,
    color: "#8b5bd6",
    kmBasis: "officialKm=336 取「新建线路336.8 km」（维基百科）；国家铁路局/人民网口径为全长343–344 km（含改造既有线6.2 km），两者口径不同，此处按新建正线口径。中间站全部取 stations.json 哈尔滨局真实坐标（宾西北/胜利镇/双龙湖/方正/得莫利/高楞/达连河/宏克力/佳木斯西/佳木斯），按 config.geoDistance 球面距离累加后整体线性缩放至 336 km。官方 19 站中的 太平桥/赵安屯/宾西东/宾州/宾安/日兴屯/依兰/兴华/东佳木斯 缺可靠坐标，未编造，予以省略。speed=200（设计时速），year=2018（2018-09-30 开通）。",
    sources: [
    { title: "国家铁路局：我国高寒地区最长快速铁路——哈佳铁路正式开通运营", url: "https://www.nra.gov.cn/xwzx/xwxx/xwlb/202204/t20220405_280180.shtml", note: "线路全长344 km，设计时速200 km/h，2018-09-30开通，19座车站（哈尔滨、太平桥、宾西北、宾州、胜利镇、方正、得莫利、依兰、佳木斯等）" },
    { title: "维基百科：哈佳铁路", url: "https://www.fbrowser.org/wikipedia/w/index.php?oldid=92272012", note: "全长343 km，其中新建线路336.8 km、改造既有线6.2 km，设计时速200 km/h，2018-09-30投入运营；19站：哈尔滨、太平桥、赵安屯、宾西北、宾西东、宾州、宾安、胜利镇、日兴屯、双龙湖、方正、得莫利、高楞、达连河、依兰、宏克力、兴华、佳木斯西、佳木斯" },
    { title: "人民网旅游：哈佳快速铁路通车 冬游黑龙江更便利", url: "https://travel.people.com.cn/n1/2018/1015/c41570-30342673.html", note: "线路设计全长344 km，设计时速200 km；19站含 双龙湖、高楞、达连河、宏克力、佳木斯西" },
    ],
    nodes: [
    { name: "哈尔滨", lon: 126.6254, lat: 45.76, km: 0.0, role: "hub", stationId: "HBB" },
    { name: "圣索菲亚教堂", lon: 126.6213, lat: 45.7682, km: 0.966, role: "landmark", landmarkId: "saint-sophia", note: "近似（维基百科 45.76820/126.62127；腾讯 POI 45.7701/126.6271）：哈尔滨站西北约 1 km" },
    { name: "防洪纪念塔", lon: 126.6171, lat: 45.7807, km: 2.39, role: "landmark", landmarkId: "flood-monument", note: "近似（腾讯地图 POI 45.780659/126.617123）：斯大林公园内松花江南岸，哈尔滨站西北约 2.4 km" },
    { name: "松花江铁路桥", lon: 126.6238, lat: 45.788, km: 3.116, role: "landmark", landmarkId: "songhua-rail-bridge", note: "近似（腾讯地图 POI 45.787986/126.623839）：滨洲铁路桥/老江桥，哈尔滨站正北约 3.1 km" },
    { name: "香坊", lon: 126.6737, lat: 45.719, km: 5.902, role: "hub", stationId: "XFB", note: "stations.json 真实坐标" },
    { name: "哈尔滨东", lon: 126.7056, lat: 45.7866, km: 6.888, role: "hub", stationId: "VBB", note: "stations.json 真实坐标，原三棵树站一带" },
    { name: "哈西动车运用所", lon: 126.5779, lat: 45.7069, km: 7.138, role: "depot", stationId: "haxi-emu-depot", note: "近似（哈尔滨西站 POI 45.706914/126.577897）：哈西站内设 1 个动车所" },
    { name: "三棵树机务段", lon: 126.71, lat: 45.788, km: 7.388, role: "depot", stationId: "sankeshu-loco", note: "近似：段机关在道外区三机路（三棵树线与滨北线之间），南侧接入哈尔滨东站，东北约 7 km；动车车间在哈西西广场" },
    { name: "哈尔滨西", lon: 126.5723, lat: 45.7051, km: 7.638, role: "hub", stationId: "VAB", note: "stations.json 真实坐标；西南约 8 km" },
    { name: "哈尔滨北", lon: 126.5296, lat: 45.8481, km: 9.0, role: "hub", stationId: "HTB", note: "stations.json 真实坐标" },
    { name: "哈尔滨动车段", lon: 126.5269, lat: 45.6452, km: 9.25, role: "depot", stationId: "harbin-emu-depot", note: "近似（腾讯地图 POI 45.64516/126.526908）：南岗区王岗镇，哈尔滨站西南约 15 km" },
    { name: "宾西北", lon: 127.1434, lat: 45.7901, km: 40.431, role: "local", stationId: "BBB" },
    { name: "胜利镇", lon: 127.9873, lat: 45.7866, km: 106.056, role: "local", stationId: "OLB" },
    { name: "双龙湖", lon: 128.4904, lat: 45.8278, km: 145.435, role: "local", stationId: "OHB" },
    { name: "方正", lon: 128.8001, lat: 45.8654, km: 169.856, role: "local", stationId: "FNB" },
    { name: "得莫利", lon: 129.026, lat: 45.8753, km: 187.432, role: "local", stationId: "DTB" },
    { name: "高楞", lon: 129.2675, lat: 45.9867, km: 209.909, role: "local", stationId: "GLB" },
    { name: "达连河", lon: 129.4574, lat: 46.1465, km: 233.006, role: "local", stationId: "DCB" },
    { name: "宏克力", lon: 129.8517, lat: 46.5153, km: 284.127, role: "local", stationId: "OKB" },
    { name: "佳木斯西", lon: 130.2574, lat: 46.7719, km: 326.36, role: "local", stationId: "JUB" },
    { name: "佳木斯", lon: 130.3759, lat: 46.8017, km: 336.0, role: "hub", stationId: "JMB" },
    ],
  },
  {
    id: "harbin-mudanjiang-hsr",
    name: "哈牡高铁",
    officialKm: 293,
    speed: 250,
    year: 2018,
    color: "#c94f9c",
    kmBasis: "官方全长 292.995/293.204 km（取整 293）锚定末站 km，设计时速250，2018-12-25 开通。尚志南/一面坡北/亚布力西 取 stations.json 真实高铁站坐标；苇河/横道河子/海林 是滨绥既有线真实站坐标，用作线路走向近似（分别对应高铁站 苇河西/横道河子东/海林北），并非高铁站精确位置，已在 note 与文件头「近似」清单标注；官方 11 站中的 新香坊北/阿城北/帽儿山西 缺坐标，未编造，予以省略。按 config.geoDistance 球面距离累加后整体线性缩放至 293 km。",
    sources: [
    { title: "中国国家铁路集团：哈尔滨至牡丹江客运专线开始联调联试", url: "http://www.china-railway.com.cn/xwzx/ywsb/201812/t20181214_77595.html", note: "全长约293 km，设计时速250 km；11站：哈尔滨、新香坊北、阿城北、帽儿山西、尚志南、一面坡北、苇河西、亚布力西、横道河子东、海林北、牡丹江" },
    { title: "国务院国资委：哈牡高铁正式开通运营 中国铁建参建", url: "http://www.sasac.gov.cn/n2588025/n2588124/c10093029/content.html", note: "全长292.995 km，设计时速250 km，2018-12-25开通，11座车站" },
    { title: "中国青年网：哈牡高铁开通 多地共享旅游商贸集合区", url: "https://t.m.youth.cn/transfer/index/url/df.youth.cn/yczq/201812/t20181226_11825434.htm", note: "全长293.204 km，设计时速250 km，2018-12-25开通，哈尔滨站同步投用" },
    ],
    nodes: [
    { name: "哈尔滨", lon: 126.6254, lat: 45.76, km: 0.0, role: "hub", stationId: "HBB" },
    { name: "圣索菲亚教堂", lon: 126.6213, lat: 45.7682, km: 0.966, role: "landmark", landmarkId: "saint-sophia", note: "近似（维基百科 45.76820/126.62127；腾讯 POI 45.7701/126.6271）：哈尔滨站西北约 1 km" },
    { name: "防洪纪念塔", lon: 126.6171, lat: 45.7807, km: 2.39, role: "landmark", landmarkId: "flood-monument", note: "近似（腾讯地图 POI 45.780659/126.617123）：斯大林公园内松花江南岸，哈尔滨站西北约 2.4 km" },
    { name: "松花江铁路桥", lon: 126.6238, lat: 45.788, km: 3.116, role: "landmark", landmarkId: "songhua-rail-bridge", note: "近似（腾讯地图 POI 45.787986/126.623839）：滨洲铁路桥/老江桥，哈尔滨站正北约 3.1 km" },
    { name: "香坊", lon: 126.6737, lat: 45.719, km: 5.902, role: "hub", stationId: "XFB", note: "stations.json 真实坐标" },
    { name: "哈尔滨东", lon: 126.7056, lat: 45.7866, km: 6.888, role: "hub", stationId: "VBB", note: "stations.json 真实坐标，原三棵树站一带" },
    { name: "哈西动车运用所", lon: 126.5779, lat: 45.7069, km: 7.138, role: "depot", stationId: "haxi-emu-depot", note: "近似（哈尔滨西站 POI 45.706914/126.577897）：哈西站内设 1 个动车所" },
    { name: "三棵树机务段", lon: 126.71, lat: 45.788, km: 7.388, role: "depot", stationId: "sankeshu-loco", note: "近似：段机关在道外区三机路（三棵树线与滨北线之间），南侧接入哈尔滨东站，东北约 7 km；动车车间在哈西西广场" },
    { name: "哈尔滨西", lon: 126.5723, lat: 45.7051, km: 7.638, role: "hub", stationId: "VAB", note: "stations.json 真实坐标；西南约 8 km" },
    { name: "哈尔滨北", lon: 126.5296, lat: 45.8481, km: 9.0, role: "hub", stationId: "HTB", note: "stations.json 真实坐标" },
    { name: "哈尔滨动车段", lon: 126.5269, lat: 45.6452, km: 9.25, role: "depot", stationId: "harbin-emu-depot", note: "近似（腾讯地图 POI 45.64516/126.526908）：南岗区王岗镇，哈尔滨站西南约 15 km" },
    { name: "尚志南", lon: 127.9468, lat: 45.1938, km: 128.164, role: "local", stationId: "OZB" },
    { name: "一面坡北", lon: 128.0804, lat: 45.0837, km: 145.27, role: "local", stationId: "YXB" },
    { name: "苇河", lon: 128.3732, lat: 44.9504, km: 174.329, role: "local", stationId: "WHB" },
    { name: "亚布力西", lon: 128.5806, lat: 44.9081, km: 192.365, role: "local", stationId: "YSB" },
    { name: "横道河子", lon: 129.0659, lat: 44.8124, km: 234.509, role: "local", stationId: "HDB" },
    { name: "海林", lon: 129.3802, lat: 44.5648, km: 273.875, role: "local", stationId: "HRB" },
    { name: "牡丹江", lon: 129.6051, lat: 44.5891, km: 293.0, role: "hub", stationId: "MDB" },
    ],
  },
  {
    id: "jingha-harbin-changchun",
    name: "京哈高铁（哈尔滨—长春段）",
    officialKm: 240,
    speed: 350,
    year: 2021,
    color: "#5a6b7a",
    kmBasis: "京哈高铁与哈大高铁在沈阳北以北共线，官方未单列「哈尔滨西—长春西」独立里程。本段 officialKm=240 并非独立官方数字，而是取自本文件哈大高铁同源推算的长春站 km≈238 km，取整为 240 作近似标尺（按哈大高铁相同区间的真实站间直线距离比例推算），属近似口径，非官方区间标尺。已核实数字：京哈高铁全线 1198 km、设计时速350 km、2021-01-22 全线贯通、沈哈段 2012-12-01 与哈大高铁同期开通。扶余北/德惠西为真实坐标，长春西缺坐标以长春站真实坐标代入（近似）。",
    sources: [
    { title: "中新网：北京至哈尔滨高铁22日开通运营 首日开行4对高速动车组列车", url: "https://m.chinanews.com/wap/detail/cht/zw/9392677.shtml", note: "京哈高铁全长1198 km，设计时速350 km，2021-01-22全线贯通；沈阳至哈尔滨段2012-12-01已开通（与哈大高铁共线），初期运营时速300 km" },
    { title: "黑龙江卫视/人民铁道：全线贯通!京哈高铁今日开通运营", url: "http://mp.weixin.qq.com/s?__biz=MzA5MDAxNTgwMQ==&mid=2652096486&idx=3&sn=aaecb8c502192becfa5e5d5f630da231", note: "运营里程1198 km，30座车站（哈尔滨西、双城北、长春西、四平东、铁岭西、沈阳北…北京朝阳）；哈尔滨西—长春西未单列独立里程" },
    ],
    nodes: [
    { name: "哈尔滨西", lon: 126.5723, lat: 45.7051, km: 0.0, role: "hub", stationId: "VAB" },
    { name: "哈西动车运用所", lon: 126.5779, lat: 45.7069, km: 0.479, role: "depot", stationId: "haxi-emu-depot", note: "近似（哈尔滨西站 POI 45.706914/126.577897）：哈西站内设 1 个动车所" },
    { name: "哈尔滨站", lon: 126.6254, lat: 45.76, km: 7.366, role: "hub", stationId: "HBB", note: "config.ORIGIN 投影原点，stations.json 真实坐标" },
    { name: "哈尔滨动车段", lon: 126.5269, lat: 45.6452, km: 7.616, role: "depot", stationId: "harbin-emu-depot", note: "近似（腾讯地图 POI 45.64516/126.526908）：南岗区王岗镇，哈尔滨站西南约 15 km" },
    { name: "圣索菲亚教堂", lon: 126.6213, lat: 45.7682, km: 7.981, role: "landmark", landmarkId: "saint-sophia", note: "近似（维基百科 45.76820/126.62127；腾讯 POI 45.7701/126.6271）：哈尔滨站西北约 1 km" },
    { name: "香坊", lon: 126.6737, lat: 45.719, km: 8.231, role: "hub", stationId: "XFB", note: "stations.json 真实坐标" },
    { name: "哈尔滨北", lon: 126.5296, lat: 45.8481, km: 9.0, role: "hub", stationId: "HTB", note: "stations.json 真实坐标" },
    { name: "哈尔滨东", lon: 126.7056, lat: 45.7866, km: 9.25, role: "hub", stationId: "VBB", note: "stations.json 真实坐标，原三棵树站一带" },
    { name: "松花江铁路桥", lon: 126.6238, lat: 45.788, km: 9.5, role: "landmark", landmarkId: "songhua-rail-bridge", note: "近似（腾讯地图 POI 45.787986/126.623839）：滨洲铁路桥/老江桥，哈尔滨站正北约 3.1 km" },
    { name: "防洪纪念塔", lon: 126.6171, lat: 45.7807, km: 9.75, role: "landmark", landmarkId: "flood-monument", note: "近似（腾讯地图 POI 45.780659/126.617123）：斯大林公园内松花江南岸，哈尔滨站西北约 2.4 km" },
    { name: "三棵树机务段", lon: 126.71, lat: 45.788, km: 10.0, role: "depot", stationId: "sankeshu-loco", note: "近似：段机关在道外区三机路（三棵树线与滨北线之间），南侧接入哈尔滨东站，东北约 7 km；动车车间在哈西西广场" },
    { name: "扶余北", lon: 125.9974, lat: 45.0061, km: 96.49, role: "hub", stationId: "FBT" },
    { name: "德惠西", lon: 125.6703, lat: 44.5436, km: 158.342, role: "local", stationId: "DXT" },
    { name: "长春", lon: 125.3177, lat: 43.9088, km: 240.0, role: "hub", stationId: "CCT" },
    ],
  },
  {
    id: "harbin-yichun-hsr",
    name: "哈伊高铁",
    officialKm: 318,
    speed: 250,
    year: 2026,
    color: "#3aa0a0",
    kmBasis: "官方线路全长 318 km（黑龙江省人民政府，2026-09-28 通车，设计时速250）锚定末站 km。兴隆镇/绥化/庆安/铁力 取 stations.json 真实坐标，但对应高铁站名为 兴隆镇西/绥化南/庆安南（铁力为既有站改建），此处以既有站坐标作线路走向近似；日月峡/伊春西 为地图 POI 与维基百科真实坐标（见 note）。官方 9 站中的 呼兰北 缺可靠坐标，未编造，予以省略。按 config.geoDistance 球面距离累加后整体线性缩放至 318 km。",
    sources: [
    { title: "黑龙江省人民政府：中国最北高铁哈伊高铁正式通车运营", url: "https://www.hlj.gov.cn/hlj/c107856/202609/c00_31980095.shtml", note: "线路全长318 km，设计时速250 km，2026-09-28通车；9站：哈尔滨、哈尔滨北、呼兰北、兴隆镇西、绥化南、庆安南、铁力、日月峡、伊春西；哈尔滨—绥化最快42分钟、哈尔滨—伊春最快1小时46分" },
    { title: "黑龙江省人民政府：哈尔滨至伊春高铁将于9月28日开通运营", url: "https://www.hlj.gov.cn/hljapp/c116056/202609/c00_31979377.shtml", note: "正线全长318 km，设计时速250 km，最高运营时速250 km；2022全线开工" },
    { title: "维基百科：伊春西站", url: "https://www.fbrowser.org/wikipedia/zh/%E4%BC%8A%E6%98%A5%E8%A5%BF%E7%AB%99", note: "地理坐标 47.722388°N / 128.736731°E，2026-09-28启用，中国大陆最北端高铁站" },
    ],
    nodes: [
    { name: "哈尔滨", lon: 126.6254, lat: 45.76, km: 0.0, role: "hub", stationId: "HBB" },
    { name: "圣索菲亚教堂", lon: 126.6213, lat: 45.7682, km: 0.966, role: "landmark", landmarkId: "saint-sophia", note: "近似（维基百科 45.76820/126.62127；腾讯 POI 45.7701/126.6271）：哈尔滨站西北约 1 km" },
    { name: "防洪纪念塔", lon: 126.6171, lat: 45.7807, km: 2.39, role: "landmark", landmarkId: "flood-monument", note: "近似（腾讯地图 POI 45.780659/126.617123）：斯大林公园内松花江南岸，哈尔滨站西北约 2.4 km" },
    { name: "松花江铁路桥", lon: 126.6238, lat: 45.788, km: 3.116, role: "landmark", landmarkId: "songhua-rail-bridge", note: "近似（腾讯地图 POI 45.787986/126.623839）：滨洲铁路桥/老江桥，哈尔滨站正北约 3.1 km" },
    { name: "香坊", lon: 126.6737, lat: 45.719, km: 5.902, role: "hub", stationId: "XFB", note: "stations.json 真实坐标" },
    { name: "哈尔滨东", lon: 126.7056, lat: 45.7866, km: 6.888, role: "hub", stationId: "VBB", note: "stations.json 真实坐标，原三棵树站一带" },
    { name: "哈西动车运用所", lon: 126.5779, lat: 45.7069, km: 7.138, role: "depot", stationId: "haxi-emu-depot", note: "近似（哈尔滨西站 POI 45.706914/126.577897）：哈西站内设 1 个动车所" },
    { name: "三棵树机务段", lon: 126.71, lat: 45.788, km: 7.388, role: "depot", stationId: "sankeshu-loco", note: "近似：段机关在道外区三机路（三棵树线与滨北线之间），南侧接入哈尔滨东站，东北约 7 km；动车车间在哈西西广场" },
    { name: "哈尔滨西", lon: 126.5723, lat: 45.7051, km: 7.638, role: "hub", stationId: "VAB", note: "stations.json 真实坐标；西南约 8 km" },
    { name: "哈尔滨动车段", lon: 126.5269, lat: 45.6452, km: 9.0, role: "depot", stationId: "harbin-emu-depot", note: "近似（腾讯地图 POI 45.64516/126.526908）：南岗区王岗镇，哈尔滨站西南约 15 km" },
    { name: "哈尔滨北", lon: 126.5296, lat: 45.8481, km: 12.866, role: "hub", stationId: "HTB" },
    { name: "兴隆镇", lon: 127.1143, lat: 46.4414, km: 96.471, role: "local", stationId: "XZB" },
    { name: "绥化", lon: 127.0095, lat: 46.6432, km: 121.409, role: "local", stationId: "SHB" },
    { name: "庆安", lon: 127.4964, lat: 46.886, km: 169.419, role: "local", stationId: "QAB" },
    { name: "铁力", lon: 128.0467, lat: 46.9718, km: 214.279, role: "hub", stationId: "TLB" },
    { name: "日月峡", lon: 128.3567, lat: 47.2113, km: 251.43, role: "local", note: "腾讯地图 POI「日月峡高铁站」47.211314/128.356662，地图点位，近似" },
    { name: "伊春西", lon: 128.7367, lat: 47.7224, km: 318.0, role: "hub", note: "维基百科「伊春西站」47.722388/128.736731，真实地理坐标（2026-09-28 启用）" },
    ],
  },
];

/** 按 id 取线路，未找到返回 undefined。 */
export function routeById(id) {
  return ROUTES.find((r) => r.id === id);
}

/**
 * 里程 km（公里）附近、radiusM（米，默认 1200）内最近的节点。
 * 距离按「里程差 |Δkm|*1000 米」度量（config 里程严格口径），非球面半径。
 * 半径内无节点返回 null。
 */
export function nearestNode(route, km, radiusM = 1200) {
  const nodes = (route && route.nodes) || [];
  const limitKm = radiusM / 1000;
  let best = null;
  let bestD = Infinity;
  for (const n of nodes) {
    const d = Math.abs(n.km - km);
    if (d <= limitKm && d < bestD) {
      best = n;
      bestD = d;
    }
  }
  return best;
}

/**
 * HUD 用：返回 { current, next } —— km 处或之前最近的节点为 current，
 * 之后最近的节点为 next；越过终点时 next=null，起点之前 current=null。
 * 按全量节点（含地标/车辆段）判定，供 HUD 选站。
 */
export function nodeAtKm(route, km) {
  const nodes = (route && route.nodes) || [];
  let current = null;
  let next = null;
  for (const n of nodes) {
    if (n.km <= km) current = n;
    else if (next === null) next = n;
  }
  return { current, next };
}

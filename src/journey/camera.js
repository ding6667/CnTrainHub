/**
 * camera.js —— 旅程相机 / 交互系统（v2 框架标准 System）。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 一、联网核实的真实资料（标题 + URL + 关键事实），本文件的尺寸/交互都对齐它们。
 *     只做「示意级复刻」，下列数值用于确定量级与方向，不冒充工程图纸。
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * [1] 国家铁路局《CRH3 型时速 300~350 公里动车组总体技术方案》
 *     https://source.nra.gov.cn/jglz/fgzd/gfwj/201804/P020220801568641766947.pdf
 *     事实：司机室设在车头、司机座椅「面向行驶方向」居中；司机室前窗为三维曲面
 *     玻璃、多层电加热、上下两块；乘客可透过司机室后部透明隔断看到列车运行前方
 *     景色。→ 驾驶室在车头最前端，前窗是唯一瞭望面，所以 cab 机位必须贴车头 -Z 端。
 *
 * [2] 国家铁路局《CRH2 型时速 300~350 公里动车组总体技术方案》
 *     https://www.nra.gov.cn/jglz/fgzd/gfwj/201804/P020220801568620150499.pdf
 *     事实：司机室前窗三维曲面玻璃、与车体曲面平滑过渡、满足 UIC 651 抗冲击
 *     （1 kg 铝弹 510 km/h 不穿透）；前窗「具有充分的视野，保障信号确认和标志识别」。
 *
 * [3]《动车组司机对驾驶环境的可达性探讨》（中国期刊网）
 *     http://www.chinaqking.com/yc/2021/3016958.html
 *     事实：UIC 651 规定司机坐姿眼睛距地板面 1350~1530 mm（带可调踏板取 1530）；
 *     前方高信号在「距缓冲器前端 10 m、轨上 6.3 m」、低信号在「15 m、轨面」处必须
 *     可见；前窗分 A 主视觉 / B 辅助 / C 外围三区，有效前方视野约左右各 35°、
 *     向上 25°、向下 35°。→ 司机视线高度（加车地板离轨约 1.2~1.4 m 后约 2.5~2.9 m）
 *     与「朝前略向下看」的依据；本文件 cab 取 y ≈ height*0.72 ≈ 2.9 m。
 *
 * [4]《探秘京广高铁"子弹头"驾驶室》（中新社报道，泰华网转载）
 *     https://newsthaicn.com/?p=69672
 *     事实：高铁驾驶室拥有 180° 全景前挡玻璃、宽大电子仪表操作台；司机作业标准是
 *     「彻底瞭望、确认信号、手比眼看」，单人驾驶连续不超 4 小时。→ 前窗视野开阔、
 *     相机应朝前方大范围瞭望，而不是朝车尾。
 *
 * [5]《Head shape design of Chinese 450 km/h high-speed trains...》(Design Research Society)
 *     https://dl.designresearchsociety.org/context/iasdr/article/1079/viewcontent/231.pdf
 *     事实：以 CR400-BF 头型为基准参数化：头车长度 26.5 m、流线区（鼻锥）长度
 *     14.5 m、车高 4.05 m、车宽 3.34 m。→ 鼻锥很长（十几米），所以「相机放到
 *     noseZ 外侧一点点」是示意做法；车高 4.05 m 与 core.js 默认 height 一致。
 *
 * [6]《那些又潮又酷的高铁"头型"怎样炼成?》（工人日报 2019-02-22）
 *     https://www.workercn.cn/papers/grrb/2019/02/22/6/grrb201902226.pdf
 *     事实：CR400BF 头型比和谐号长约 2 m，车头总长接近 10 m；两侧设导流槽、由
 *     鼻锥引流产生下压力。→ 车头/鼻锥的外伸量级；相机绝不能落在这段壳体内部。
 *
 * [7] Trainz Wiki《Help:Driver Camera View Modes》
 *     https://wiki.trainzsimulator.com/wiki/Help:Driver_Camera_View_Modes
 *     事实：5 种机位 Cab Interior / Chase / Lineside(static + tracking) /
 *     Free Roaming / Map。Chase「固定于选定车辆、可绕其旋转 + 滚轮缩放」；
 *     Lineside static「固定方向，让被跟踪物体进入、穿过、离开画面」，tracking
 *     「位置固定但随目标 pan」；Free Roaming「滚轮缩放、方向键转向/升降」。
 *     → 本文件 relative(≈Chase) / absolute(≈Lineside static+orbit) 双模式与交互映射。
 *
 * [8] Train Simulator Classic 2024 User Guide（Manuals+ 中文镜像）
 *     https://zh-cn.manuals.plus/m/d830c055ec361aff6e725ff7420a3d61e89486599081b36f444c0314554f48cc
 *     事实：机位 1 Cab / 2 External Front / 4 Trackside；「方向键调位置、鼠标滚轮
 *     缩放、右键+拖动平移」；Graphics 选项里 Field of View 可调。→ FOV 可调、
 *     滚轮/拖动是模拟器通用手势。
 *
 * [9] Open Rails《Running a North American Steam Locomotives in Open Rails》
 *     https://static.openrails.org/files/Running-NA-Steam-Locomotives.pdf
 *     事实：机位含 2D/3D Cab、Outside Front/Rear、Trackside、Passenger、Brakeman、
 *     Free Camera；「滚轮 = 改 Field of View（zoom）」「按住右键移动鼠标 = 环视」；
 *     Pan/Tilt 如三脚架、Track Camera 绕目标旋转。→ 机位命名清单与 orbit 语义。
 *
 * [10] Stack Overflow《How to remove transparency here》
 *     https://www.stackoverflow.com/q/52097591
 *     事实：把 PerspectiveCamera 的 near 从 1 改到 0.01 即解决「贴近几何被近裁剪
 *     面切掉」；默认 FrontSide 背面剔除会让「从物体内部看」变透明/看不见，可设
 *     material.side = THREE.DoubleSide。→ cab 压小 near 的依据，以及「隐藏/双面化
 *     车头外壳」这一备选防穿模手段的出处。
 *
 * [11]《Three.js 透视相机完全指南》（稀土掘金）
 *     https://www.juejin.cn/post/7603584155784626226
 *     事实：near 是「相机能看到的最近距离」，比 near 更近的物体被裁剪；near 的
 *     作用之一是「避免穿模：防止相机进入物体内部时看到内部结构」；far 决定深度
 *     精度。→ 近裁剪面定义与防穿模关系。
 *
 * [12] threejs-errors-rendering SKILL.md（GitHub，排错清单）
 *     https://github.com/Impertio-Studio/Three.js-Claude-Skill-Package/blob/6c190f0db95d6e4b77d7843d181c6d3325c09d0e/skills/source/threejs-errors/threejs-errors-rendering/SKILL.md
 *     事实：相机在网格内部会黑屏；near 不要设 0（会 z-fighting）；改动
 *     fov / aspect / near / far 后必须调 camera.updateProjectionMatrix()；
 *     material.side 默认 FrontSide，背面被剔除。→ 改 near/fov 后刷新投影矩阵。
 *
 * [13] MDN《EventTarget: addEventListener() method》
 *     https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener
 *     事实：wheel / mousewheel / touchstart / touchmove 挂在 window / document /
 *     document.body 时 passive 默认为 true；要 preventDefault 必须显式写
 *     { passive: false }；passive 监听里 preventDefault 会被忽略；removeEventListener
 *     必须传入同一个函数引用才能解绑。→ wheel 必须用 passive:false、dispose 要
 *     保留 handler 引用逐个解绑。
 *
 * [14] MDN《touch-action CSS property》
 *     https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action
 *     事实：自定义手势的画布应设 touch-action: none；Pointer events 下浏览器一旦
 *     接管手势会发 pointercancel。→ 触屏用 pointer events + pointercancel 处理。
 *
 * [15] three.js 官方文档《PerspectiveCamera》
 *     https://threejs.org/docs/pages/PerspectiveCamera.html
 *     事实：PerspectiveCamera(fov, aspect, near, far) 及属性 fov / near / far、
 *     方法 updateProjectionMatrix()；Math 下 Vector3 / Matrix4 / Quaternion /
 *     Euler / Spherical 均为真实类。→ 本文件只用真实存在的 API，不编造类或方法。
 *
 * [16] 广西新闻网《高清:南宁火车站高铁站台启用》/ 人民网《南宁火车站:高铁时代的"华丽变身"》
 *     https://pic.gxnews.com.cn/staticpages/20131210/newgx52a70a6e-9187810.shtml
 *     https://cpc.people.com.cn/n/2013/1211/c87228-23805268.html
 *     事实：高铁站台长 550 m、宽 10.5 m；站台面与钢轨顶面落差 1.25 m，动车停靠后
 *     车厢地板与站台齐平、旅客平步进车厢；防滑地砖、白色警示线 + 黄色盲道、雨棚下
 *     动态电子引导屏、车厢号地标。→ platform 机位取「站台面 1.25 m + 眼高 ≈ 2.85 m」平视。
 * [17] 科普中国《高站台》 https://cloud.kepuchina.cn/newSearch/imgText?id=6974157197806116864
 *     事实：高站台标准高出轨面 1.25 m；常配套「无站台柱雨棚」(空间桁架、铝镁锰合金吊顶)。
 * [18]《高速铁路站台高度及布置》 https://chuimin.cn/lilun/1830071.html
 *     事实：站台高 1.25 m；站台长按 16 辆 428 m + 余量取 450 m(8 辆 230 m)；安全线
 *     距站台边缘 1.0 m、黄色并与盲道合并(宽 17~250 mm)；临正线一侧旅客退避 2.0 m
 *     并设防护栅栏；站台上设停车位置标。→ 站场雨棚 y=5.4、站台面 1.25 的建模口径。
 * [19] 百度百科《站台安全线》 https://baike.baidu.com/item/%E7%AB%99%E5%8F%B0%E5%AE%89%E5%85%A8%E7%BA%BF/67513267
 *     事实：我国站台安全线距边缘通用 1 m，高铁站可达 1.5 m；白线或黄线 + 盲道。
 * [20] Ricoh GR III《Train & Railway Photography: Settings, Recipes, and Tips》
 *     https://www.ricohpresets.com/blog/ricoh-gr-iii-train-railway-photography-settings-tips
 *     事实：3/4 视角(对列车 30~45°)同时见车头与侧面、最有立体感；站在长站台一端沿
 *     纵长拍，柱/雨棚支撑/灯的重复节奏成纵深；贴轨面(rail level)低角度仰拍强调体量；
 *     铁轨/接触网/站台边缘/栅栏作引导线；始终站安全线内。
 * [21] Traintrack《Choosing the Right Platform Photo Spot: Perspective, Not Chance》
 *     https://www.traintrackapp.de/fr/blog/choisir-emplacement-quai-photo
 *     事实：最佳点常在站台前 1/3、与线路轴成 30~45°、完全在安全线内；站台高度决定
 *     眼高(齐车窗或低于)；距离越远视角越平；正侧(70~90°)无纵深、近正面(0~15°)显短。
 * [22] 什么值得买《新干线 300 码疾驰而过,普通人如何拍出震撼大片?》 https://post.smzdm.com/p/aqrp9d8v/
 *     今日头条《掌握好这几个小技巧,你也能拍出高逼格的铁路照片》 https://www.toutiao.com/article/6767325410347713036/
 *     事实：站台上方供电线网是理想「框架构图」；站台尽头安全区平视机位、铁轨汇聚成
 *     引导线；低角度贴地仰拍冲击力最强；跨线桥/天桥高机位俯拍完整呈现列车长度与
 *     建筑尺度对比；长焦压缩画面。→ hero/side/above 用高机位，nose 用低机位仰拍。
 * [23] 澎湃《火车迷丨铁路接触网,如何立起来?》 https://m.thepaper.cn/baijiahao_25646885
 *     事实：接触网支柱高约 10 m、每 50~60 m 一根、带编号；平腕臂/斜腕臂/绝缘子；
 *     承力索 + 接触线 + 吊弦，接触线在机车正上方。→ nose 低机位抬头能连车头带接触网。
 * [24] 新华社《一座露天"万国建筑博物馆"》 https://www.geermurb.com/html/1/2025-06/28/10/2025062810_pdf.pdf
 *     哈尔滨市政府《东北超级酷炫 哈尔"滨"至如归》 https://www.harbin.gov.cn/haerbin/c104696/202606/c01_1130622.shtml
 *     事实：中央大街 71~75 栋欧式/仿欧式建筑(36 栋保护建筑)，文艺复兴/哥特/折衷/
 *     巴洛克/新艺术运动并存；老道外中华巴洛克青砖墙、雕花门楼、中式院落穿巴洛克
 *     外衣(葡萄/石榴/牡丹/蝙蝠/铜钱吉祥纹)；大剧院双曲面「雪色丘峦」→ 混合天际线。
 * [25] 今日头条《哈尔滨纯新盘,谁是颜值担当?》 https://m.toutiao.com/article/7661819832588845606
 *     乐居《群力江境·外滩壹号院》 https://m.leju.com/www/news/7464932854368351971.html
 *     事实：哈西/群力新区高层 24~32 层近 100 m、纯板楼南北通透；立面「铝板 + 巨幕
 *     玻璃/LOW-E 落地窗」、三段式线条、6 m 金属塔冠、270° 观景阳台、香槟/深咖色、
 *     真石漆 + 铝板 + 玻璃幕墙组合、精细线条分缝。→ skyline 与楼群材质分化依据。
 *
 * [26] 哈尔滨西站站场拓扑（team-lead 中期联网检索；来源：wikiwand / hackcn《哈尔滨西站》、
 *     东北网 heilongjiang.dbw.cn、工人日报 workercn）
 *     事实：媒体「10 台 22 线」是简写；实为「横列式一站两场、18 站台面、22 线（含正线
 *     4 条）」，东高速场 12 面 14 线 / 西普速场 6 面 8 线，共用 12/13 站台。京哈高铁
 *     正线 Ⅷ/Ⅸ 从高速场中部（7 与 8 站台之间）穿过且**无站台**；站台在正线两侧，
 *     1/18 为侧式、中间岛式台各夹 2 条到发线。列车进站经咽喉道岔驶入到发线、停在
 *     站台边——不是永远在正线上。→ 站场以正线为中心，总宽约 226 m（单侧约 113 m）。
 * [27] 哈西无站台柱大跨度雨棚（来源：heilongjiang.dbw.cn / gf.cabr-fire.com / workercn）
 *     事实（现实规范）：覆盖全场 83068 ㎡，长 450 m、顺轨柱距 18~21 m、横轨一跨
 *     40~65 m 跨多个站台；桁架上弦高约 16.7 m、悬挂物下缘至站台面 ≥ 4 m。
 *     ★但本场景是**示意级近似**：station-realism 实际把屋盖压到 y≈6.7 m
 *     （檐口 6.2 m，桁架/檩条最高 ~6.7 m），否则会盖过 y=8~12 的站房。
 *     机位一律以「实际几何 6.7 m」为准，不按 16.7 m 抬避。
 * [28] 哈西站房（来源：wikiwand / hackcn、heilongjiang.dbw.cn；场景实际几何见 [30]）
 *     事实：工字形 450 m(南北) × 309.5 m(东西) 跨线高架候车室、5 层、上进下出、
 *     棕红色陶板外立面（圣索菲亚取色）、拱形、冰花采光天窗；楼扶梯 / 地道口连接站台。
 * [29] 站台构图参数（来源同 [26]-[28]）
 *     事实：站台面 y=1.25、岛式宽 12 m / 侧式 9 m、正线线间距 5.0 m、站台长 450 m、
 *     到发线有效长 650 m、站台边缘距线路中心 1.75 m、站台与车体缝隙 10~20 cm。
 *     「站台视角」站安全带内侧（距边缘约 1.5~2 m）、眼高 1.6 m，平视车门与四色地标；
 *     「车头前方低位」贴轨顶上方 1~2 m、距车头 15~30 m。
 * [30] 本场景站场几何实际包围盒（station-realism 2026-11 直接提供，1 单位=1 m，局部坐标）
 *     · 雨棚：连片 **opaque** 金属屋面 y≈6.7 m、檐口 6.2 m、桁架/檩条最高 ~6.7 m；
 *       柱只落股道间。上一版「大面积半透明 X 光片」bug 已修成 opaque。
 *     · 跨线高架候车室：楼面 y=8、墙顶 12.2、屋面 12.7、冰花天窗 **12.86 m（全场最高几何）**；
 *       宽 x∈[-56,56]、进深 z∈[-17,17]。
 *     · 摆位：站场局部原点=中心，集成层放到列车前方约 200 m（世界 z≈-200），
 *       沿 x、z 均以 0 对称；**中央正线通道 |x|<9.75 透空**（列车 x≈0 可见），
 *       站台面 y=1.25 在 |x|≥11.5。
 *     · 站台横断面精确包围盒（station-realism 复核，最内侧站台中心 px=+17.5、宽 12
 *       → 站台面 x∈[11.5,23.5]，左侧镜像 -17.5）：雨棚柱只在 x=9.6 / 25.4（股道间、
 *       每 24 m 一根 0.3×0.3 细杆），站房落地柱 |x|>31 → **站台上方无柱**；
 *       但高架候车室↔站台楼扶梯口有实体：楼梯 10 级 **x∈[14.2,16.8]、y 1.875→7.5**、
 *       z∈[23,31]（局部），扶梯斜梁 x∈[18.55,19.45]、电梯井 x∈[21,23.2]，
 *       LED 屏 x≥15.8、座椅 x≥16.2、灯柱 x=17.5、站台屏/吊牌 z=±94.5/±135。
 *       → 站站台的低机位相机 x 取 **13.0~14.0 空档**（side/platform/trackside 统一 13.5）
 *       可同时避开以上全部实体；站台面 [11.5,23.5] 内仍成立。
 *     · 中央 |x|<9.75 在屋面标高 y=6.7 本就透空（仅 x∈[-2.4,2.4] 一条半透明采光带
 *       y=6.72），opaque 屋面从 |x|=10.35 起；故危险区 |x|<113 且 y∈[6.2,12.86]
 *       对中央通道是保守判定（无害），俯瞰机位 y>14 正利用这段透空看列车。
 *
 * 【机位重设（v2.4，按 station-realism 实际 6.7 m 几何；作废 v2.3 的 16.7 m / 端头外假设）】
 *   ★ 关键修正：v2.3 误把 16.7 m 规范值当实际几何，且假设雨棚中心 z=0、端头 |z|=225。
 *     实际屋盖只有 6.7 m、站房顶 12.86 m，站场中心还在 z≈-200 且随里程滚动，
 *     「端头之外 |z|>225」不可靠；v2.3 的 hero(y=11) 恰好落进站房 8~12.86 高度带，
 *     且从 y>6.7 侧上方看车体的视线会穿过 opaque 连片屋面 → 车被挡。
 *   稳健原则（只依赖 y 与 x，与滚动的 z 无关）：
 *    (a) 看车体/站台细节 → **低机位 y<6.0**（雨棚檐口 6.2 之下、接触网 5.3 之下），
 *        视线全程 y<6.0，从中央透空通道 |x|<9.75 或站台/股道间 (|x|≥11.5) 取景；
 *        这样无论站场滚到哪里都不穿屋面、不依赖半透明。
 *    (b) 俯瞰全貌/站房 → **高空 y>14**（高于 12.86 m 站房顶）：above、skyline、orbit，
 *        可经中央透空带看到列车。
 *    · hero/station：车后 (+Z) 雨棚下低机位纵深/长焦，顺股道看列车+两侧站台+桁架+远端站房；
 *    · side：站台/股道间低机位正侧平视车身腰线；platform：站台面 y=1.25+眼高1.6=2.85
 *      站在 |x|≥11.5 站台安全带内侧；rear：中央通道低机位回望；trackside：站台固定点；
 *    · cab / nose / above / skyline / orbit 数值不动（cab 为 v3 实测最佳画面）。
 *   cab 防穿模、near 0.15↔0.5、轨顶净空 0.6 / pan 下限 -12 / 同步抬升一律保留。
 *   站台在列车局部系的精确 x 随 alignment 的 lane 横移变化（列车恒在局部原点），
 *   platform / trackside 的站台相对位置属示意级近似。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 二、本文件设计（大白话）
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 坐标（core.js / config.js 的硬约定）：列车永远固定在局部原点、**车头朝 -Z**，
 * 局部 z<0 是行驶前方，z>0 是车后；世界按里程往 +Z 滚过去。于是「看前方场景」
 * 的机位必须把相机放在车后(+Z)、让视点(target)落在前方(-Z)。旧版 hero 曾把
 * 方向搞反朝车尾看，刚建出来的站房全在镜头背后——下面每个前方机位都按
 * 「相机 +Z、视点 -Z」重新给 offset/aim。rear 是**刻意**回望才反过来。
 *
 * 关于掉头：framework.js 的 reverse() 只翻 state.dir，列车 Group 一个角度都不改；
 * 分块摆位靠 alignment 的世界 Ry(π) 保证「行驶前方始终是 -Z」。所以车身从不
 * 旋转、相机参考系不随 dir 翻转，cab 永远在 -Z 车头端。DIRECTION_CHANGE /
 * REVERSE 事件只用来刷新内部方向记录与重算基准，不镜像相机。
 *
 * 双模式（单一数据源 state，display 缓存只做阻尼显示，绝不逐帧 += 直接改相机）：
 *   - relative：anchor 在**车身局部系**（车身在原点，等价于世界坐标）；相机 =
 *     anchor + 球坐标(distance, yaw, pitch)，每帧 lookAt(anchor)。换车型/编组/
 *     掉头时只按 train.length 给 anchor.z 加一个「长编后撤」量 + 用户中键偏移，
 *     **不重置**用户调好的 yaw/pitch/distance（这是需求 7 的关键）。
 *   - absolute：anchor 是**世界固定点**（轨旁机位，按 preset.offset 或「冻结当前
 *     观察中心」得到），不随 train / dir / s 变化；相机仍绕它 orbit，列车（本框架
 *     里是滚动的世界景物）驶过画面。属于示意级等价。
 *
 * 交互（自己实现 pointer 处理，**不再 new OrbitControls**，避免和旧 controls 抢事件）：
 *   滚轮          → distance（relative = 到车身锚点距离；absolute = 到世界锚点距离），
 *                   wheel 监听 { passive:false } 并 preventDefault()，不让页面滚。
 *   按住中键拖动  → 改 anchor 的 x/y（镜头相对车身的横向/高度偏移），**不改角度**。
 *   按住左键拖动  → 改 yaw / pitch。
 *   右键          → 不处理（保留给菜单）。
 *   触屏          → 单指旋转(yaw/pitch)，双指缩放(distance)，用 pointer events +
 *                   pointercancel + canvas 的 touch-action:none。
 *   全部 clamp（distance 8~600、pitch -1.2~1.35 rad、anchor 偏移限幅、fov 20~100），
 *   另有轨顶净空：相机与视点都不低于 y=0.6，杜绝中键下拖把镜头拖进地面，
 *   带阻尼：state 是唯一目标数据源，disp 每帧用 1-exp(-k*dt) 朝 state 收敛，
 *   相机由 disp 纯函数算出来，杜绝旧版 controls.target.z += (focusZ-z)*0.08
 *   那种「数据源与显示值混在一起、切机位后慢慢爬」的累积误差。
 *
 * ★ 平滑（v2.2，针对用户「开车有时一闪」）：dt 先钳到 0~0.05 s 再算阻尼系数，
 *   杜绝异常大步长（切标签页回来 / 调试直调）让显示值一步跳到目标；followShift
 *   不再乘 dirRef，逻辑掉头时观察中心不再瞬间翻符号；setTrainSpec 不再硬 snap，
 *   换车型/编组的长编后撤交给阻尼平滑收敛。切机位 / 换模式 / init 仍即时定位
 *   （机位语义 + 集成层 setView 要确定性），但开车、换向、换编组的突跳已消除。
 *
 * ★ 驾驶室防穿模策略（需求 7 重点，写清楚给集成层看）：
 *   主策略 = **把相机放到车壳体外、鼻锥前沿再往前一点点**，绝不进车体网格。
 *   具体用 ctx.train.noseZ / height 算：相机 z = noseZ - 0.6（比车头最前端还靠
 *   前 0.6 m，属于外部空间）、y = height*0.72（≈2.9 m，见资料[3][5]）、x≈0；
 *   朝 -Z 略向下（CAB_TILT≈1.4°）lookAt 前方 200 m 处。因为相机在车头前方且
 *   朝前看，整列车都在相机背后(+Z)，视野里根本没有车体网格，自然看不到
 *   backface 空洞/黑块，也不需要隐藏任何外壳。
 *   同时把 cam.near 临时从 0.5 压到 0.15（0.1~0.2 区间，见资料[10][11]），
 *   防止贴脸时近裁剪面把前窗上沿/仪表台切出黑边；离开 cab 立即恢复 0.5，
 *   每次改 near/fov 都调 cam.updateProjectionMatrix()（资料[12]）。
 *   【备选方案】若集成层以后想真的看到「司机室内部 + 前窗框」，可改用
 *   layers 屏蔽车头外壳，或把 shell 材质临时 side=THREE.DoubleSide /
 *   visible=false，并在切走时恢复（资料[10][12]）。本模块不依赖任何具体 mesh
 *   名字，故不擅自遍历 scene 改材质——那属于集成层的活；这里只用最稳的
 *   「相机体外 + 压 near」方案，边界干净、切走零残留。
 *
 * 事件 / 清理：onEvent 监听 EVENT.CAMERA_MODE / 'camera:view' / 'train:spec' /
 * EVENT.DIRECTION_CHANGE / EVENT.REVERSE / 'theme:change'；applyTheme 只微调相机
 * 自身 FOV 做氛围示意，exposure / fog / renderer 全局状态一律不碰（集成层负责）。
 * dispose() 把全部 DOM 监听按同一函数引用逐个 removeEventListener，并恢复
 * canvas 的 touch-action，杜绝重复绑定。
 *
 * 导出：CAMERA_PRESETS（数组）+ createCameraRig(ctx, opts) → System。
 * System 上另挂集成层方法：setPreset / setMode / setTrainSpec / setDirection /
 * setFov / setFollow / getState / target(THREE.Vector3，兼容旧 controls.target) /
 * dispose；sys.state 供 HUD 与调试钩子读取。
 *
 * 用到的 three 0.180 真实 API 仅：Vector3(.set/.copy)、camera.position.copy、
 * camera.lookAt、camera.fov/near/far 属性、camera.updateProjectionMatrix()。
 * 不 import addons、不 new OrbitControls、不 fetch、publicDir:false 兼容。
 *
 * 说明：height*0.72、noseZ-0.6、长编后撤系数、follow 呼吸、主题 FOV 偏置、
 * 各 preset 的 offset/aim 均为「示意级近似」，真实尺寸一律以 TrainSpec 为准。
 * ═══════════════════════════════════════════════════════════════════════════
 */
import * as THREE from 'three';
import { EVENT, SYSTEM_PHASE, DIRECTION, clamp, lerp } from './core.js';
import { CAMERA } from './config.js';

/**
 * 机位预设。每项 { id, label, mode, offset, aim, fov?, distance?, yaw?, pitch?, note }。
 * offset / aim 都是同一坐标系下的三元 [x,y,z]（不再是旧 VIEWS 的单个 aim z）：
 *   - relative：offset 是相机相对车身的位置，aim 是视点（车身局部坐标）。
 *               「看前方」机位一律 offset.z>0（车后）、aim.z<0（前方）。
 *   - absolute：offset 是**世界固定锚点**（orbit 中心 + lookAt 点），另给
 *               distance/yaw/pitch 作为初始球坐标；aim 仅作 HUD 示意。
 * 球坐标约定：yaw=0 → 相机在 anchor 的 +Z 侧朝 -Z 看；pitch>0 → 相机在上方俯视。
 */
export const CAMERA_PRESETS = [
  {
    id: 'cab', label: '司机视角', mode: 'relative',
    offset: [0, 2.9, -106], aim: [0, 0.8, -306], fov: 60,
    note: '驾驶室：offset 仅示意，运行时按 train.noseZ / height 重算（相机 z=noseZ-0.6 在车壳体外），near 压到 0.15。朝 -Z 略向下看前方 200 m。v3 实测全场最佳画面（无砟轨道板/接触网腕臂/雨棚桁架/站台屏/护栏），保持不动；相机在中央透空通道 y=2.9 低于 6.2 檐口。[1][3][5][10][30]',
  },
  {
    id: 'hero', label: '英雄机位', mode: 'relative',
    offset: [13.5, 4.2, 112], aim: [0, 2.3, -40], fov: 56,
    note: '站台上、车尾后 7 m 的低机位（x=13.5 在站台带 11.5~23.5 内且避开楼扶梯 14.2~16.8，y=4.2 低于檐口 6.2/接触网 5.3）：车体占画面主体，同时能看到紧贴的站台、黄盲道、四色地标、雨棚柱列与接触网。首屏不再把列车放成远处小点。[26][27][30][20][21][22]',
  },
  {
    id: 'side', label: '站台侧视', mode: 'relative',
    offset: [13.5, 3.4, 6], aim: [0, 2.2, -6], fov: 50,
    note: '站台/股道间低机位正侧平视：相机 x=13.5 在站台面 [11.5,23.5] 内、距车体侧面约 12 m（8~15 m 建议区间），y=3.4 在雨棚下，看清车身腰线/车窗带/车门与邻侧站台。x 由 16 调到 13.5 以避开高架候车室↔站台楼扶梯口楼梯实体 x∈[14.2,16.8]（station-realism 提供包围盒），与 platform 同空档，并避开 LED 屏(≥15.8)/座椅(≥16.2)/灯柱(17.5)。视线 y 3.4→2.2 全程低于 6.2 檐口，从 opaque 屋面下方平视，不依赖半透明。[29][30][21]',
  },
  {
    id: 'station', label: '进站视角', mode: 'relative',
    offset: [12, 3.6, 175], aim: [0, 2.4, -160], fov: 36,
    note: '车后低机位长焦顺股道看进站：相机 y=3.6 在雨棚下、x=12 站台内，fov36 压缩看整列车纵列 + 两侧站台 + 桁架(仰视) + 远端跨线站房，雨棚柱列/安全线作引导线。视线 y 3.6→2.4<6.0 全程在屋面下方，彻底避开 v2.2 站内 y=8.5 半透明 X 光片 overdraw 疑似崩溃（该 bug 已由 station-realism 修成 opaque）。[22][27][29][30]',
  },
  {
    id: 'platform', label: '站台平视', mode: 'relative',
    offset: [13.5, 2.85, -30], aim: [0, 2.2, -90], fov: 44,
    note: '站在 |x|≥11.5 站台安全带内侧（x=13.5）、站台面 1.25 m + 眼高 1.6 m = y=2.85，平视/略俯停靠列车，看清车门、车窗带、站台白线/黄色盲道、四色地标与雨棚柱列纵深。相机 x=13.5 在车体(半宽1.68)之外不钻车体、y=2.85<6.2 不碰屋面；水平视线全程在 opaque 屋盖下净空内。[16][17][18][19][29][30][20][21] 站台相对 x 随 alignment lane 横移，示意级近似。',
  },
  {
    id: 'nose', label: '车头前方低位', mode: 'relative',
    offset: [3.4, 1.1, -132], aim: [0, 3.4, -104], fov: 46,
    note: '贴轨顶上方 1.1 m（≥0.6 净空）、距车头约 27 m（15~30 m 建议区间）、x=3.4 在中央透空通道，仰看流线型车头 + 车顶 + 接触网（支柱约 10 m、每 50~60 m 一根）作框架。运行时按 noseZ 平移，8/16 辆都恒在车头前，不进车体。y=1.1 远低于 6.2 檐口。[22][23][29][30]',
  },
  {
    id: 'above', label: '俯瞰线路', mode: 'relative',
    offset: [0, 110, 60], aim: [0, 1.2, -128], fov: 52,
    note: '高空俯瞰 y=110 m 远高于全场最高几何 12.86 m（冰花天窗）：看整片 opaque 大跨雨棚屋面、工字形跨线站房、两端咽喉与站台全貌，并经中央 |x|<9.75 透空带看到正线列车。16 辆长编自动整体后撤收进画面。[22][27][28][30]',
  },
  {
    id: 'skyline', label: '城市天际线', mode: 'relative',
    offset: [132, 78, 168], aim: [0, 20, -150], fov: 46,
    note: '远景高机位(|x|=132 站场外、y=78>12.86 最高几何)看哈尔滨混合天际线 + 线路与站场屋盖。distance≈349 m 落在 8~600 clamp 内。[24][25]',
  },
  {
    id: 'rear', label: '车尾回望', mode: 'relative',
    offset: [6, 3.4, -140], aim: [0, 2.4, 90], fov: 50,
    note: '刻意回望：车头前方(-Z)中央透空通道低机位 x=6、y=3.4<6.2，顺股道看整列车与车尾 + 两侧站台 + 桁架(仰视)。视线 y 3.4→2.4 全程在 opaque 屋面下。唯一朝车尾的机位，不是方向 bug。[22][30]',
  },
  {
    id: 'trackside', label: '轨旁固定机位', mode: 'absolute',
    offset: [0, 2.4, 0], aim: [0, 2.4, -60], distance: 13.6, yaw: 1.44, pitch: 0.03, fov: 48,
    note: '轨旁世界固定锚点(线路中心)，不随列车跑动；相机由球坐标落在 x≈13.5、y≈2.81（≈站台面 1.25+眼高 1.6）的站台上，沿股道低角看列车驶过 + 站台，视线 y 2.81→2.4 全程低于 6.2 檐口。distance 由 16 调到 13.6 使相机 x 从 15.9 移到 13.5，避开楼扶梯口楼梯实体 x∈[14.2,16.8]（station-realism 提供包围盒）。左键绕该点 orbit、滚轮改到锚点距离。[7][9][22][30]',
  },
  {
    id: 'orbit', label: '自由环绕', mode: 'absolute',
    offset: [0, 2.4, 0], aim: [0, 2.4, -60], distance: 110, yaw: 0.25, pitch: 0.35, fov: 50,
    note: '自由相机：绕线路中心这一世界固定点 orbit，初始高空俯瞰(y≈40 m>12.86 最高几何)，可任意旋转/缩放；用户想贴站台细节时自行往下调 pitch 到 y<6.0 雨棚下。[7][9][30]',
  },
];

// ------------------------------------------------------------------ 常量 ----
const BASE_NEAR = CAMERA.near;          // 0.5，离开 cab 恢复它
const CAB_NEAR = 0.15;                  // cab 临时压到 0.1~0.2（资料[10][11]）
const MIN_DIST = CAMERA.minDistance;    // 8
const MAX_DIST = CAMERA.maxDistance;    // 600
const PITCH_MIN = -1.2;                 // rad
const PITCH_MAX = 1.35;                 // rad
const FOV_MIN = 20;
const FOV_MAX = 100;
const PAN_LIMIT_X = 140;                // 中键 anchor 横向限幅（米）
const PAN_LIMIT_Y_UP = 70;              // 中键 anchor 向上限幅（米）
const PAN_LIMIT_Y_DOWN = 12;            // 向下限幅：别把观察中心拖到轨面下太深
// 轨顶面 y=0、路基面 -0.68、地面 -3.4。相机与视点都不许落到轨顶以下，
// 否则中键一拖镜头就钻进地面，整幅画面被地面糊成一片纯色（v2.1 修复）。
const MIN_EYE_Y = 0.6;                  // 相机最低净空（米，轨顶以上）
const PAN_SENS = 0.18;                  // 米 / 像素
const ROT_SENS = 0.005;                 // rad / 像素
const DAMP = 9;                         // 阻尼系数，k = 1-exp(-dt*DAMP)
const CAB_TILT = 0.025;                 // rad ≈1.4°，cab 基础下俯
const CAB_BACK = 0.6;                   // 相机放到鼻锥前沿外侧 0.6 m
const CAB_AHEAD = 200;                  // lookAt 前方距离（米）

/**
 * 按 noseZ 绝对定位的机位：不叠 formationBack(长编后撤) / followShift(里程呼吸)，
 * 否则 16 辆时相机会相对车头漂移。v2.4 起只有 nose 需要；hero/station 已改为雨棚下
 * 低机位(y<6.0)，长编后撤只改 z 不改 y，安全且保留「收进更长列车」的既有语义。
 */
const ANCHORED_VIEWS = new Set(['nose']);

/** ctx.train 与 setTrainSpec 都没给时的 8 辆示意规格，保证 cab 有 noseZ 可用。 */
const FALLBACK_TRAIN = Object.freeze({
  noseZ: -105, tailZ: 105, length: 210, height: 4.05, halfWidth: 1.68,
});

// -------------------------------------------------------------- 球坐标工具 ----
/** 球坐标 → 相机相对 anchor 的偏移 [x,y,z]（yaw=0 在 +Z 侧，pitch>0 在上方）。 */
function sphericalToOffset(distance, yaw, pitch) {
  const cp = Math.cos(pitch);
  return [distance * Math.sin(yaw) * cp, distance * Math.sin(pitch), distance * Math.cos(yaw) * cp];
}

/** 相机偏移 → 球坐标，供「从 preset 一次性同步」用；是上式的逆运算。 */
function offsetToSpherical(dx, dy, dz) {
  const flat = Math.hypot(dx, dz);
  return {
    distance: Math.hypot(dx, dy, dz),
    yaw: Math.atan2(dx, dz),
    pitch: Math.atan2(dy, flat),
  };
}

/** 16 辆长编(≈417 m)相对 8 辆(≈210 m)把机位整体往车后挪，示意级近似。 */
function formationBack(train) {
  const L = Number.isFinite(train?.length) ? train.length : FALLBACK_TRAIN.length;
  return clamp((L - 210) * 0.34, 0, 110);
}

/**
 * 创建相机系统。framework.js 的 pack.createCamera(ctx) 会调它（harbin.js 里传
 * { presets: CAMERA_PRESETS }）。返回的既是标准 System，又带集成层要用的方法。
 */
export function createCameraRig(ctx, opts = {}) {
  const presets = Array.isArray(opts.presets) && opts.presets.length ? opts.presets : CAMERA_PRESETS;
  const presetMap = new Map(presets.map((p) => [p.id, p]));
  const byId = (id) => presetMap.get(String(id));

  let ctxRef = ctx || null;
  let camera = ctxRef?.camera || null;
  let dom = ctxRef?.domElement || null;

  // state 是唯一的「目标数据源」，HUD / 调试钩子读 sys.state（同一个对象引用）。
  const state = {
    mode: 'relative',
    preset: 'hero',
    distance: 60,
    yaw: 0,
    pitch: 0,
    anchor: [0, 0, 0],
    fov: CAMERA.fov,
    follow: false,
  };

  // 复用向量，避免每帧 new；target 同时作为 sys.target（兼容旧 controls.target 钩子）。
  const targetVec = new THREE.Vector3();
  const _pos = new THREE.Vector3();
  const _aim = new THREE.Vector3();

  let baseAnchor = [0, CAMERA.focusY, 0]; // preset 给的基准观察中心
  let pan = [0, 0];                       // 中键拖出来的 anchor x/y 偏移
  const disp = {                         // 显示插值缓存（不是数据源，不对外）
    distance: state.distance, yaw: 0, pitch: 0, ax: 0, ay: 0, az: 0,
  };
  let dirRef = DIRECTION.FORWARD;
  let themeFovBias = 0;
  let specRef = null;
  let bound = false;
  let disposed = false;
  let prevTouchAction;
  let appliedView = '';
  let lastCtxView = ctxRef?.state?.view;
  let lastCtxCameraMode = ctxRef?.state?.cameraMode;

  const listeners = [];      // { target, type, fn, opts } —— dispose 逐个解绑
  const pointers = new Map(); // pointerId -> { x, y, type, button }
  let drag = null;            // { mode:'rotate'|'pan'|'pinch', id?, x?, y?, dist? }

  // ---------------------------------------------------------- 小工具函数 ----
  function resolveTrain() {
    // setTrainSpec / 'train:spec' 显式注入的规格优先（集成层可能直接调本系统，
    // 不走 framework.setTrainSpec）；都没有才退回 ctx.train，最后用 8 辆示意值。
    const explicit = specRef && Number.isFinite(specRef.noseZ) ? specRef : null;
    const fromCtx = ctxRef?.train && Number.isFinite(ctxRef.train.noseZ) ? ctxRef.train : null;
    return explicit || fromCtx || FALLBACK_TRAIN;
  }

  function pinchDist() {
    const pts = [...pointers.values()];
    return pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
  }

  function add(target, type, fn, opts) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, fn, opts);
    listeners.push({ target, type, fn, opts });
  }

  function capture(id) {
    if (dom && typeof dom.setPointerCapture === 'function' && id != null) {
      try { dom.setPointerCapture(id); } catch { /* 老浏览器/桩里忽略 */ }
    }
  }
  function release(id) {
    if (dom && typeof dom.releasePointerCapture === 'function' && id != null) {
      try { dom.releasePointerCapture(id); } catch { /* 同上 */ }
    }
  }

  // ------------------------------------------------------------ DOM 交互 ----
  function onPointerDown(e) {
    if (e.button === 2) return; // 右键不拦截，保留给浏览器菜单
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType, button: e.button });
    capture(e.pointerId);
    if (pointers.size >= 2) {
      drag = { mode: 'pinch', dist: pinchDist() }; // 双指缩放
    } else if (e.button === 1) {
      drag = { mode: 'pan', id: e.pointerId, x: e.clientX, y: e.clientY }; // 中键平移
    } else {
      drag = { mode: 'rotate', id: e.pointerId, x: e.clientX, y: e.clientY }; // 左键 / 单指
    }
    // pointerdown 默认非 passive；preventDefault 阻止选中文本 / 中键自动滚动 / 图片拖拽
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { ...pointers.get(e.pointerId), x: e.clientX, y: e.clientY });
    if (!drag) return;
    if (drag.mode === 'pinch') {
      const nd = pinchDist();
      if (drag.dist > 0 && nd > 0) {
        // 两指张开(nd 变大) → factor<1 → distance 变小 → 拉近
        state.distance = clamp(state.distance * (drag.dist / nd), MIN_DIST, MAX_DIST);
      }
      drag.dist = nd;
    } else if (drag.id === e.pointerId) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (drag.mode === 'pan') {
        // 只改 anchor 的横向/高度，不动 yaw/pitch
        pan[0] = clamp(pan[0] + dx * PAN_SENS, -PAN_LIMIT_X, PAN_LIMIT_X);
        pan[1] = clamp(pan[1] - dy * PAN_SENS, -PAN_LIMIT_Y_DOWN, PAN_LIMIT_Y_UP);
      } else {
        state.yaw += dx * ROT_SENS;
        state.pitch = clamp(state.pitch - dy * ROT_SENS, PITCH_MIN, PITCH_MAX);
      }
    }
    if (typeof e.preventDefault === 'function') e.preventDefault();
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    release(e.pointerId);
    if (pointers.size >= 2) {
      drag = { mode: 'pinch', dist: pinchDist() };
    } else if (pointers.size === 1) {
      const [id, pt] = pointers.entries().next().value;
      drag = { mode: pt.button === 1 ? 'pan' : 'rotate', id, x: pt.x, y: pt.y };
    } else {
      drag = null;
    }
  }

  function onWheel(e) {
    // { passive:false } 才让 preventDefault 生效，防止页面跟着滚（资料[13]）
    if (typeof e.preventDefault === 'function') e.preventDefault();
    const delta = Number.isFinite(e.deltaY) ? e.deltaY : (Number.isFinite(e.wheelDelta) ? -e.wheelDelta : 0);
    const factor = Math.exp(delta * 0.0012); // 下滚 → 拉远
    state.distance = clamp(state.distance * factor, MIN_DIST, MAX_DIST);
  }

  // ------------------------------------------------ 每帧：重算相机 + 阻尼 ----
  /**
   * @param {number} dt   秒
   * @param {boolean} snap true = 一次性同步（切机位/切模式/换车型时把 disp 直接怼到 state）
   */
  function applyCamera(dt, snap) {
    if (!camera || disposed) return;
    const train = resolveTrain();
    const isCab = state.preset === 'cab';
    // 按 noseZ 定位的机位不叠长编后撤 / 里程呼吸（见 ANCHORED_VIEWS）。
    const isAnchored = ANCHORED_VIEWS.has(state.preset);

    // ---- 1) 目标 anchor：写回 state.anchor（HUD 读它）----
    let ax, ay, az;
    if (isCab) {
      // cab 不用 anchor 定位相机，这里只给 HUD 一个示意值
      ax = 0; ay = train.height * 0.72; az = train.noseZ - CAB_BACK - CAB_AHEAD;
    } else if (state.mode === 'absolute') {
      // 世界固定点：不加长编后撤、不加跟随，列车跑动也不动
      ax = baseAnchor[0] + pan[0]; ay = baseAnchor[1] + pan[1]; az = baseAnchor[2];
    } else {
      let followShift = 0;
      if (!isAnchored && state.follow && Number.isFinite(ctxRef?.s)) {
        // 示意级近似：世界本来就在滚动，默认不额外跟随；开了就随里程极轻微呼吸。
        // 故意不乘 dirRef —— 逻辑掉头时 anchor.z 不再瞬间翻符号（消除「换向一闪」）。
        followShift = Math.sin(ctxRef.s * 0.0015) * 1.2;
      }
      ax = baseAnchor[0] + pan[0];
      ay = baseAnchor[1] + pan[1];
      // nose 跳过长编后撤（否则相对车头漂移）；其余相对机位保留后撤（阻尼平滑）。
      az = baseAnchor[2] + (isAnchored ? 0 : formationBack(train)) + followShift;
    }
    // 观察中心也不许沉到轨顶以下，避免 HUD 与实际画面给出互相矛盾的高度。
    ay = Math.max(ay, MIN_EYE_Y);
    state.anchor[0] = ax; state.anchor[1] = ay; state.anchor[2] = az;

    // ---- 2) 阻尼：disp 朝 state 收敛（state 是唯一数据源，无累积误差）----
    // dt 钳到 0~0.05 s，杜绝异常大步长（切标签页回来、调试直调）让 disp 一步跳到 state；
    // snap（切机位/换模式/init）仍为 1 = 立即定位，保证机位切换的确定性。
    const step = clamp(dt, 0, 0.05);
    const k = snap ? 1 : (1 - Math.exp(-step * DAMP));
    disp.distance = lerp(disp.distance, state.distance, k);
    disp.yaw = lerp(disp.yaw, state.yaw, k);
    disp.pitch = lerp(disp.pitch, state.pitch, k);
    disp.ax = lerp(disp.ax, ax, k);
    disp.ay = lerp(disp.ay, ay, k);
    disp.az = lerp(disp.az, az, k);

    // ---- 3) near / fov：改动才刷新投影矩阵（资料[12]）----
    const wantNear = isCab ? CAB_NEAR : BASE_NEAR;
    if (camera.near !== wantNear) { camera.near = wantNear; camera.updateProjectionMatrix(); }
    const wantFov = clamp(state.fov + themeFovBias, FOV_MIN, FOV_MAX);
    if (camera.fov !== wantFov) { camera.fov = wantFov; camera.updateProjectionMatrix(); }

    // ---- 4) 相机位置 + lookAt ----
    if (isCab) {
      // ★ 防穿模：相机放在鼻锥前沿外侧（比车头最前端还靠前 0.6 m），朝 -Z 看，
      //   整列车都在相机背后，视野里没有车体网格 → 不会看到 backface 空洞/黑块。
      const cx = pan[0] * 0.25;
      const cy = train.height * 0.72 + pan[1] * 0.25;
      const cz = train.noseZ - CAB_BACK;
      const look = clamp(disp.distance, 30, 400); // cab 复用 distance 作「注视距离」
      _pos.set(cx, cy, cz);
      _aim.set(
        cx + Math.sin(disp.yaw) * look,
        cy - Math.tan(clamp(disp.pitch, -1.0, 1.0) + CAB_TILT) * look,
        cz - Math.cos(disp.yaw) * look,
      );
    } else {
      const off = sphericalToOffset(disp.distance, disp.yaw, disp.pitch);
      _pos.set(disp.ax + off[0], disp.ay + off[1], disp.az + off[2]);
      _aim.set(disp.ax, disp.ay, disp.az);
    }
    // ★ 防钻地：中键下拖或负 pitch 会经球坐标把相机送到地面以下。把相机与视点
    //   同步抬高同一差值，视线方向保持不变；cab 也覆盖（z 不动，仍在鼻锥前方）。
    if (_pos.y < MIN_EYE_Y) {
      const lift = MIN_EYE_Y - _pos.y;
      _pos.y += lift;
      _aim.y += lift;
    }
    camera.position.copy(_pos);
    camera.lookAt(_aim);
    targetVec.copy(_aim); // sys.target 兼容旧调试钩子 controls.target
  }

  // ---------------------------------------------------------- 集成层 API ----
  /** 切机位：一次性把球坐标 / 锚点同步到 preset，用户后续拖拽在此基础上叠加。 */
  function setPreset(id, options = {}) {
    const p = byId(id) || presets[0];
    state.preset = p.id;
    if (!options.keepMode) state.mode = p.mode === 'absolute' ? 'absolute' : 'relative';

    // nose（车头前方低位）恒贴 noseZ：把 offset/aim 的 z 按当前编组相对 8 辆的位移平移，
    // 让相机在 8 辆(noseZ=-105) / 16 辆(noseZ=-208) 时都落在车头前同一距离，绝不进车体。
    let offArr = p.offset;
    let aimArr = p.aim;
    if (p.id === 'nose') {
      const shift = resolveTrain().noseZ - FALLBACK_TRAIN.noseZ;
      offArr = [p.offset[0], p.offset[1], p.offset[2] + shift];
      aimArr = [p.aim[0], p.aim[1], p.aim[2] + shift];
    }

    // 相对 → 锚点 = 车身局部观察中心；绝对 → 锚点 = 世界固定点
    baseAnchor = (state.mode === 'absolute' ? offArr : aimArr).slice();
    pan = [0, 0];

    // 球坐标一次性同步：absolute 且带显式 distance/yaw/pitch 就直接用，否则由 offset-aim 反推
    if (state.mode === 'absolute' && Number.isFinite(p.distance)) {
      state.distance = clamp(p.distance, MIN_DIST, MAX_DIST);
      state.yaw = Number.isFinite(p.yaw) ? p.yaw : 0;
      state.pitch = clamp(Number.isFinite(p.pitch) ? p.pitch : 0, PITCH_MIN, PITCH_MAX);
    } else {
      const sp = offsetToSpherical(
        offArr[0] - aimArr[0], offArr[1] - aimArr[1], offArr[2] - aimArr[2],
      );
      state.distance = clamp(sp.distance, MIN_DIST, MAX_DIST);
      state.yaw = sp.yaw;
      state.pitch = clamp(sp.pitch, PITCH_MIN, PITCH_MAX);
    }
    if (p.id === 'cab') {
      // cab 贴脸：distance 复用为「前方注视距离」，角度归零朝正前略下俯
      state.distance = CAB_AHEAD; state.yaw = 0; state.pitch = 0;
    }
    state.fov = Number.isFinite(p.fov) ? p.fov : CAMERA.fov;
    state.anchor[0] = baseAnchor[0]; state.anchor[1] = baseAnchor[1]; state.anchor[2] = baseAnchor[2];
    appliedView = p.id;
    applyCamera(0, true); // 立即定位 + 立即设 near/fov（切走 cab 就恢复 near）
    return getState();
  }

  /**
   * 切相对/绝对：absolute 把「当前观察中心」冻结成世界固定点；relative 回到当前
   * preset 的车身局部参考系。都不重置用户调好的角度。
   */
  function setMode(mode) {
    const m = mode === 'absolute' ? 'absolute' : 'relative';
    if (m === state.mode) return getState();
    if (m === 'absolute') baseAnchor = state.anchor.slice();
    else baseAnchor = (byId(state.preset) || presets[0]).aim.slice();
    state.mode = m;
    pan = [0, 0];
    applyCamera(0, true);
    return getState();
  }

  function setTrainSpec(spec) {
    if (spec && typeof spec === 'object') {
      specRef = spec;
      // 换车型/编组不再硬 snap：cab / nose 的相机位置每帧直接由 train.noseZ 算，
      // 其余机位的长编后撤交给每帧阻尼平滑收敛，消除「换编组一闪」。
      // 仍调一次 applyCamera(0,false) 刷新 near/fov 与 HUD 的 state.anchor。
      applyCamera(0, false);
    }
    return getState();
  }

  function setDirection(dir) {
    // 车身从不旋转、行驶前方始终 -Z（见文件头），故相机参考系不翻转；只更新方向记录
    const d = dir === DIRECTION.REVERSE || dir < 0 ? DIRECTION.REVERSE : DIRECTION.FORWARD;
    dirRef = d;
    return getState();
  }

  function setFov(deg) {
    const v = Number(deg);
    state.fov = clamp(Number.isFinite(v) ? v : CAMERA.fov, FOV_MIN, FOV_MAX);
    if (camera) {
      const want = clamp(state.fov + themeFovBias, FOV_MIN, FOV_MAX);
      if (camera.fov !== want) { camera.fov = want; camera.updateProjectionMatrix(); }
    }
    return getState();
  }

  function setFollow(on) {
    state.follow = Boolean(on);
    return getState();
  }

  function getState() {
    return {
      mode: state.mode,
      preset: state.preset,
      distance: state.distance,
      yaw: state.yaw,
      pitch: state.pitch,
      anchor: state.anchor.slice(),
      fov: state.fov,
      follow: state.follow,
      dir: dirRef,
      pan: pan.slice(),
      near: camera ? camera.near : BASE_NEAR,
      appliedView,
    };
  }

  // ------------------------------------------------------------- System ----
  function onEvent(type, payload) {
    switch (type) {
      case EVENT.CAMERA_MODE: { // 'camera:mode'
        const m = typeof payload === 'string' ? payload : (payload?.mode ?? payload?.cameraMode);
        if (m === 'relative' || m === 'absolute') setMode(m);
        break;
      }
      case 'camera:view': {
        const id = typeof payload === 'string' ? payload : (payload?.view ?? payload?.id);
        if (id && byId(id)) setPreset(id, { keepMode: true }); // 别把 HUD 选的 mode 冲掉
        break;
      }
      case 'train:spec':
        setTrainSpec(payload);
        break;
      case EVENT.DIRECTION_CHANGE:
      case EVENT.REVERSE: {
        const d = typeof payload === 'number' ? payload : (payload?.dir ?? ctxRef?.dir);
        setDirection(d);
        break;
      }
      case 'theme:change':
        applyTheme(payload);
        break;
      default:
        break;
    }
  }

  /** 只微调相机自身 FOV 做氛围示意；exposure / fog / renderer 全局状态一律不碰。 */
  function applyTheme(theme) {
    const label = typeof theme === 'string'
      ? theme : (theme?.label ?? theme?.id ?? theme?.name ?? 'day');
    const s = String(label);
    const isNight = /night|夜/i.test(s);
    const isDusk = /dusk|暮/i.test(s);
    themeFovBias = isNight ? -1.5 : isDusk ? -0.5 : 0;
    if (camera) {
      const want = clamp(state.fov + themeFovBias, FOV_MIN, FOV_MAX);
      if (camera.fov !== want) { camera.fov = want; camera.updateProjectionMatrix(); }
    }
  }

  /** 标准 System init：绑定 DOM 监听（全部挂在 domElement 上，不挂 window/全局），防重复绑定。 */
  function init(c) {
    if (c) ctxRef = c;
    if (ctxRef?.camera) camera = ctxRef.camera;
    if (ctxRef?.domElement) dom = ctxRef.domElement;
    if (dom && !bound) {
      bound = true;
      // 自定义手势画布要 touch-action:none（资料[14]），dispose 时恢复
      if (dom.style) {
        prevTouchAction = dom.style.touchAction;
        try { dom.style.touchAction = 'none'; } catch { /* 只读 style 时忽略 */ }
      }
      add(dom, 'pointerdown', onPointerDown);
      add(dom, 'pointermove', onPointerMove);
      add(dom, 'pointerup', onPointerUp);
      add(dom, 'pointercancel', onPointerUp);
      add(dom, 'wheel', onWheel, { passive: false }); // 必须显式非被动才能 preventDefault
    }
    applyCamera(0, true);
  }

  /** 每帧：兜底同步 ctx.state.view / cameraMode（仅当它们真的变化），再重算相机。 */
  function update(c, dt) {
    if (c) ctxRef = c;
    if (disposed) return;
    const v = ctxRef?.state?.view;
    if (v && v !== lastCtxView) {
      lastCtxView = v;
      if (byId(v)) setPreset(v, { keepMode: true });
    }
    const cm = ctxRef?.state?.cameraMode;
    if ((cm === 'relative' || cm === 'absolute') && cm !== lastCtxCameraMode) {
      lastCtxCameraMode = cm;
      setMode(cm);
    }
    applyCamera(Number.isFinite(dt) ? dt : 0, false);
  }

  /** 移除所有 DOM 监听（按同一函数引用），恢复 touch-action，杜绝重复绑定。 */
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const l of listeners) {
      try { l.target.removeEventListener(l.type, l.fn, l.opts); } catch { /* 忽略 */ }
    }
    listeners.length = 0;
    pointers.clear();
    drag = null;
    if (dom && prevTouchAction !== undefined && dom.style) {
      try { dom.style.touchAction = prevTouchAction; } catch { /* 忽略 */ }
    }
  }

  // ---- 构造时按当前 view 应用一次默认机位（camera 已由 host 提供）----
  const initialView = (ctxRef?.state?.view && byId(ctxRef.state.view))
    ? ctxRef.state.view : (byId('hero') ? 'hero' : presets[0].id);
  setPreset(initialView);

  const sys = {
    id: 'camera',
    phase: SYSTEM_PHASE.CAMERA,
    init, update, onEvent, applyTheme, dispose,
    // 集成层要调用的方法
    setPreset, setMode, setTrainSpec, setDirection, setFov, setFollow, getState,
    target: targetVec, // THREE.Vector3，兼容旧调试钩子 controls.target
    state,             // { mode, preset, distance, yaw, pitch, anchor, fov, follow }
  };
  return sys;
}

export default createCameraRig;

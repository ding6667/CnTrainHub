# Blender 建模管线

CR400BF-G 的 GLB 不是手K出来的，而是把一份外部生成的初模（50,000 面 / 26.8 MB / 三张 4K 烘焙）
按下面的顺序处理出来的。本目录就是那条链路的唯一真相，README 里引用的也是这里。

## 前提

Blender 5.2 需已开启 BlenderMCP 插件（监听 `127.0.0.1:9876`）。本会话没有注册 blender-mcp
工具，所以用 `blmcp.mjs` 直接说同一个协议——仅本机回环，不对外监听。

```bash
node blmcp.mjs scene                                  # 看场景
node blmcp.mjs shot  /abs/path/out.png                # 视口截图（注意：受窗口重绘影响）
node blmcp.mjs file  /abs/path/s7_rig.py KEY=VALUE    # 跑脚本，KEY=VALUE 注入为 Python 前置赋值
```

## 执行顺序

| 步 | 脚本 | 作用 |
|---|---|---|
| 1 | `s4_clean.py` | 从 `node_0` 复制出 `GEO-CR-head`，按连通壳删杂质岛，再做 Laplacian 平滑 |
| 2 | `s5_fit.py` | `bisect_plane` 在裙板线干净切断，`edgenet_fill` 封孔，逐轴归一到 25.85×3.36×4.05 m |
| 3 | `s6_midcar.py` | 切掉司机室以前段得到 `GEO-CR-mid`，封盖后 X 向拉伸到 25.0 m |
| 4 | `s7_rig.py` | 减面 → 二次松弛 → 加底架裙板、转向架、车轮、车顶空调壳 → 合并 |
| 5 | `s9_tex.py` | 从原始 GLB 重新导入取回 4K 底图，去掉无贡献的烘焙法线贴图 |
| 6 | `s10_relink.py` | 重接 baseColor 与 metallicRoughness，清掉空贴图节点 |
| 7 | `s8_export.py` | 改名 `Head` / `Middle`，JPEG 导出 GLB，另存 `.blend` 源 |

一条典型的重建：

```bash
cd C:/Users/dingy/Desktop/CnTrainHub
node tools/blender/blmcp.mjs file tools/blender/s4_clean.py   SMOOTH_ITERS=8
node tools/blender/blmcp.mjs file tools/blender/s5_fit.py
node tools/blender/blmcp.mjs file tools/blender/s6_midcar.py
node tools/blender/blmcp.mjs file tools/blender/s7_rig.py     DEC_HEAD=5000 DEC_MID=2600 RELAX=3
node tools/blender/blmcp.mjs file tools/blender/s9_tex.py
node tools/blender/blmcp.mjs file tools/blender/s10_relink.py
node tools/blender/blmcp.mjs file tools/blender/s8_export.py  IMG_FORMAT=JPEG
```

## 出图检查

`s_shot.py` 用正交相机 + EEVEE 真实渲染（侧 / 端 / 顶 / 45° / 低角），参数：
`ONLY=Head MODE=quarter NORM=0|1 OUT=<绝对路径>`。

`s11_uvprobe.py` 打印车顶与窗带面实际采到的 texel 颜色，用来区分"贴图问题"还是"着色问题"。
`s12_clay.py` 剪掉所有贴图输入，只留哑光黏土色，用来看几何本身是否平整。

## 踩过的两个坑

- **视口截图不可信**：MCP 的 `get_viewport_screenshot` 读的是 `region_3d.view_matrix`，而它只在
  窗口真实重绘时更新。Blender 在后台时矩阵是陈旧的，截图永远是同一个机位。所以本管线一律用
  相机 + `bpy.ops.render.render(write_still=True)` 出图。
- **引擎赋值静默失败**：Blender 5.2 里 EEVEE 的枚举是 `BLENDER_EEVEE`（`_NEXT` 已不存在）。
  写错时赋值抛异常被 `try` 吞掉，渲染其实一直是 Workbench——它不显示法线贴图与 PBR 反射，
  曾据此得出过"车体发粉""表面凹凸"的错误结论。`s_shot.py` 现在会在引擎不是 EEVEE 时直接抛错。

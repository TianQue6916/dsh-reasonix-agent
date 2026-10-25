---
id: "dc5438d0-9b93-4bb3-bb96-7dc2b67ffa64"
title: "Minecraft 空间站体素化链路：三套模型→.nbt 转换器、取源可达性实测与体素化质量边界"
description: "为 MC 大型空间站建造打通「3D 模型（.vox/.obj/.glb/.schem）→ 体素 → .nbt schematic」的完整链路：三套自研转换器的原理与自测结果、各模型/蓝图站点在此机器上的可达性实测（Cloudflare 403、Sketchfab 需 token、github 直连 000 走 gh-proxy）、体素化质量取决于原模型面结构而非算法、以及 --scale/--slice/--height 参数如何满足「从地面起、高度 ≤800」的约束。"
status: "active"
created_at: "2026-10-24T16:46:10.187Z"
updated_at: "2026-10-24T16:46:10.187Z"
content_hash: "3219f0072678179b332eec2a0030973dd4a34958e87203a9cc27324c54278c8c"
source_paths:
  - "mcopt/mesh2nbt.py"
  - "mcopt/vox2nbt.py"
  - "mcopt/schem2nbt.py"
  - "mcopt/nbtgen/nbtwrite.py"
  - "mcopt/mv/app/MagicaVoxel-0.99.7.2-win64/MagicaVoxel.exe"
session_ids:
  - "866b743d-b282-49c2-b9d7-794082f7560f"
memory_body_ids:
  []
---

# Minecraft 空间站体素化链路（工作目录 `C:\Users\27063\mcopt`）

## 用户目标与硬约束
- 交付物是 **Minecraft 大型空间站**（用户明确「大型」）。
- 硬约束：**从地面开始（y 从 0 起）**、**总高度 ≤ 800 格**。
- 用户两次澄清走的路线：第一次问「社区成品」→ 被纠正为 **「我指的是找建模，不是 nbt，是 blender 建模那个」**，即要的是**真正的 3D 建模资产（.obj/.glb/.vox）**，不是现成 MC 蓝图。这条纠正是路线分叉点，后续不要再拿 `.schem` 蓝图当首选。

## 三条输入路径与三个转换器（均已自测通过）
| 脚本 | 输入 | 解析要点 |
|---|---|---|
| [mesh2nbt.py](mcopt/mesh2nbt.py) 7053 B | `.obj` / `.glb` | **主路径**：三角网格直接体素化 |
| [vox2nbt.py](mcopt/vox2nbt.py) 6506 B | MagicaVoxel `.vox` | 手写 RIFF chunk 解析（`SIZE`/`XYZI`/`RGBA`） |
| [schem2nbt.py](mcopt/schem2nbt.py) 8229 B | `.schem`（Sponge v1–v3）/ `.schematic`（MCEdit ≤1.12） | `Palette` 反查 + `BlockData` **varint** 解包；老格式走 legacy numeric ID 表 |

共用 [nbtgen/nbtwrite.py](mcopt/nbtgen/nbtwrite.py) 的 NBT encoder，`DataVersion 3955`。

### mesh2nbt 的体素化算法（关键实现知识）
经典 **ray casting + 奇偶判定（parity test）**：对每个体素中心沿 +X 射一条射线，数穿过三角形面的次数，**奇数=内部，偶数=外部**（Jordan curve theorem 的三维推广）。工程上按 Y 层切片、按 Z 行预筛，把三角形投影到 YZ 平面解重心坐标，再用 `np.searchsorted` 批量累加每个 x 的穿越次数 —— 所以 300+ 三角形约 0.5 s。
自测：立方体+球复合网格 `184 verts / 332 tris`，`grid 12×21×24 (cell 0.5417)`，`filled 977 voxels` → `out size [11,20,24]`，与理论体量吻合。

### 坐标系与高度约束
- MagicaVoxel 是 **Z-up**，MC 是 **Y-up** → `mc_x=vox_x, mc_y=vox_z, mc_z=vox_y`。OBJ/GLB 一般为 Y-up，不需要换轴。
- 高度控制：`--height 800` **自动**算降采样倍率把输出压到 ≤800；`--scale N` 把 1 体素放大成 N×N×N；`--slice a b` 在**缩放前**裁剪，且 `--scale 3 --slice 0 266` ≈ 最终 800 格。
- 颜色：`.vox` 的 RGBA 调色板按**加权 RGB 最近邻**（`2R²+4G²+3B²`，按人眼敏感度配权）映射到 34 种 MC 方块表（16 色混凝土、iron_block、quartz、deepslate_tiles、glass/tinted_glass、sea_lantern/glowstone、三种铜、金、`create:` 的 brass/andesite/copper casing）。用户画了表外颜色必须补表，否则会偏色。

## 取源可达性实测（走本地代理 + UA，2026-10-25）
- `github.com` 直连 **000** → 一律走 `gh-proxy.com/https://github.com/...` 拉 GitHub Release，实测 `http=200 size=3794277`。
- MC 蓝图站：`planetminecraft.com` **403**（Cloudflare 拦 CLI，浏览器可开）、`minecraft-schematics.com` / `schematicabyss.com` / `9minecraft.net` / `minecraftmaps.com` 全 **000**、`api.curseforge.com` **403**（需 key）、`mcmod.cn` 200 但只有 mod 介绍。
- 模型站：`sketchfab.com` 200 可搜（API 能列出 uid/faces），但 `/v3/models/{uid}` 详情与下载**需要 OAuth token**，无授权时 archives 为空 → **CLI 拿不到**。`quaternius.com` 200（全 CC0 低模，最适合体素化）、`cgtrader.com` 200（多付费）、`poly.pizza` 000、`free3d.com` 000、`blendswap.com` 301。
- Blender：`blender.org` 与 `download.blender.org/release/` 均 200（release 目录里有 4.4/4.5/5.0/5.1/5.2）；清华 TUNA 无 blender 镜像（404）。**结论：体素化不需要 Blender**，Blender 只在用户要亲手建模时才需要。

## 体素化质量的信息论边界（重要判断）
3D→体素的效果**取决于原模型的面结构，不是算法参数**：
- 好：面数 5k–50k 的低多边形 / 硬表面模型，平面与直角清晰，体素化后轮廓干净。
- 差：100k+ 面、曲面由海量小三角构成（如 Sketchfab 那个 170k 面的 `Space Station`），体素化边缘呈阶梯锯齿、细节全糊；`--res` 调高只是让糊的部分更细，不会更清楚。
选模型时先看面数与是否硬表面，比调参有效。

## 环境坑（重复踩过两次，务必记住）
1. **bash heredoc 写到一半被截断**：报 `warning: here-document at line N delimited by end-of-file (wanted 'PYEOF')` 时文件是不完整的，之后 `python -c` 才报 `SyntaxError: unterminated string literal`。长脚本应改用写文件再跑，且**写完必须做一次语法检查**（`python -m py_compile`）再执行。
2. **内联 Python 里的 Windows 路径反斜杠**：`print('...C:\Users\...')` 触发 `unicodeescape codec can't decode ... truncated \UXXXXXXXX escape`。用正斜杠或 `r''`。
3. `planetminecraft` 加 UA 仍 403 —— 该站只能由用户浏览器下载，CLI 无解。

## 已安装工具
MagicaVoxel 0.99.7.2 win64 绿色版：`C:\Users\27063\mcopt\mv\app\MagicaVoxel-0.99.7.2-win64\MagicaVoxel.exe`（4.11 MB，解压自官方 GitHub Release，`50 4b 03 04` 校验通过）。注意 `magicavoxel.net` 是第三方站，但页面里指向的确实是 ephtracy 官方 release URL，可直接用官方链接。

## 待办 / 分叉
- 用户拍板路线后再继续：**（A）自己下现成 .obj/.glb 丢进 `C:\Users\27063\mcopt\`** → 一条命令转换；**（B）装 Blender 亲手建** → 需要给低多边形建模清单与导出选项。
- 未定：用户说的「大型」是方块数量多还是物理尺寸大。已知线索：y≈300 就卡 → 尺寸比数量更敏感（吃区块数与 `endless` 页数）。

---
id: "71420e57-86ef-4da8-bd77-7097009d0ff2"
title: "schemtool：Minecraft 蓝图三格式转换工具链（IR 架构、blockstate Properties 塌缩 bug、ACL 权限）与千格塔生成器（2026-10-23）"
description: "mcopt/schemtool 的 nbt / litematic / schem 互转工具链：IR 为中心 + adapter 架构、四类格式识别（含工具枪 sub-level 拒绝）、往返保真三判据，以及两个真实 bug 的取证（read_nbt 丢 Properties 导致 116→34 状态塌缩，被\"自洽往返\"掩盖；schematics/ 目录非提权不可写）。附 build.py 塔/站生成器与 1000 格塔的材料不可行账。延续 4a5cedc7（工具枪蓝图格式）。"
status: "active"
created_at: "2026-10-23T03:04:28.151Z"
updated_at: "2026-10-23T03:04:28.151Z"
content_hash: "495cb1047c5c677484e39dbddd4013b7e4490b607691096a08b9f907a0093235"
source_paths:
  - "mcopt/schemtool/ir.py"
  - "mcopt/schemtool/schemtool.py"
  - "mcopt/schemtool/selftest.py"
  - "mcopt/schemtool/build.py"
  - "mcopt/schemtool/modids.json"
session_ids:
  - "96eadb47-5553-404b-bc23-d26784bf03e9"
memory_body_ids:
  []
---

# schemtool：Minecraft 蓝图三格式转换工具链（2026-10-23）

环境同 4a5cedc7：Minecraft 1.21.1 + NeoForge 21.1.236，实例目录
`D:\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236\`，无外网（DevSidecar 起不来）。
工具链代码在 `C:\Users\27063\mcopt\schemtool\`。

## 一、架构：IR 为中心

```
ir.py      统一中间表示 + 三个 adapter（nbt / litematic / schem）
schemtool.py  CLI: check / convert / install
selftest.py   全量往返验收
build.py      程序化生成器（tower / station）
modids.json   从 54 个 jar 的 neoforge.mods.toml 提取的 modId 清单（缓存）
```

**加一种格式 = 加一个 adapter**，不是 N×N 个转换器。IR 只存三样东西：
`size`、有序的 `blocks[i]`（含完整 blockstate 全名）、`block_entities`。

## 二、格式识别（check 的实际判定）

| 输入 | 判定 |
|---|---|
| 标准 structure `.nbt` | 有 `palette` + `blocks`，读得懂 |
| `.litematic` | `Regions` 里的 `BlockStatePalette` + `BlockStates` 长数组 |
| `.schem` / Sponge v3 | `Palette`（key 为完整 blockstate 全名）+ `BlockData` 变长位打包 |
| **工具枪 sub-level** | `palette` 为空 + 有 `sub_levels` ⇒ **明确的 SKIP**，不是方块结构 |

现有 10 个蓝图体检结果：**7 usable / 0 缺 mod / 3 skipped**。
被 skip 的是 `飞艇.nbt`、`磁石导弹引信.nbt`、`meitandaodan.nbt` —— 打包的 Sable sub-level。
**关键行为：明确拒绝而不是静默产出空文件。**

mod 依赖检测：从 `mods/*.jar` 内的 `neoforge.mods.toml` 提 modId 得到 `modids.json`，
再和蓝图里出现的 namespace 比对。

## 三、保真判据（三条同时成立才算无损）

1. `size` 一致
2. 每个坐标的 **blockstate 全名字符串**一致（含 `[facing=east,half=bottom]`）
3. block entity 数量一致

全量验收（7 个可用蓝图 × 两条路径 `.litematic` / `.schem v3`）：
**ALL ROUND-TRIPS LOSSLESS: True**。
`cishidaodan.nbt` 细节：`17x44x13, blocks 1014/1014, states_equal=True, block_entities 280/280`。

## 四、Bug 1：read_nbt 丢 Properties ⇒ 状态塌缩，被"自洽往返"掩盖

**现象**：`.nbt → .schem → .nbt` 只剩 **754/1014** 块，55/280 block entity。

**第一次误判**：以为是 `write_schem` 里 `pal[o].split('[')[0]` 把带属性的方块压成同名。
改掉后**仍是 754/1014** —— 误判被否证。

**真凶取证**：把 `t2.schem` 拆开看
```
palette entries: 34          ← 但索引范围 0..116
decoded indices: 9724  distinct: 117
indices with no palette entry: 83
```
34 个 palette 项 vs 117 个索引，83 个索引悬空 ⇒ **写入前就已经塌缩**。
真凶在 `read_nbt`：

```python
# 错：只取 Name，丢掉 Properties
pal = [str(dict(p)['Name']) for p in f.get('palette', [])]
```

116 个不同 blockstate（如 `create:gearbox[facing=north]` vs `[facing=east]`）塌成 34 个字符串。

**修法**：`_pal_name()` 把 Properties 拼成 `namespace:id[k=v,...]`（**键排序保证稳定**），
`write_nbt` 用 `_pal_entry()` 反解回 `{Name, Properties}`；`write_litematic` 同样保留 Properties。
修后三条判据全绿。

### 通用教训

> **往返测试自己对自己，会把"两边都错"测成"相等"。**

`.litematic` 那条路径当时显示 1014/1014 通过，是因为**读写两边同时丢属性** ——
自洽性掩盖了正确性。所以保真测试必须有一条**独立的正确性锚**（这里是"源文件的 distinct
blockstate 数 = 116，palette 去重后仍应是 116"），不能只验 `a == b`。

## 五、Bug 2：`schematics/` 目录 ACL 比 `mods/` 严

`mods/` 非提权可写（上一轮验证过），据此假定 `schematics/` 也可写 —— **错的**：
```
Copy-Item : Access to the path 'D:\...\schematics\_selftest_install.nbt' is denied.
```

**处置**：`install` 改为「转成 `.nbt` → 暂存到工具链目录下的 `out/` → 尝试复制 → 失败则打印手动指引」，
提示可 `--elev` 走 UAC。**不为复制单个文件弹 UAC**；等真要批量安装再一次性提权。
（注意：一次 patch 里忘了定义 `OUT_DIR`，触发 `NameError`，属实现疏漏，已补。）

## 六、未做（诚实清单）

1. **`.schematic`（MCEdit/WorldEdit 旧格式）不支持** —— 用 1.12 时代的数字方块 id，
   需要一张 1.12→1.13 扁平化映射表（几千条）。PMC 老存档是这格式。
2. **Litematica 负 `Size`（镜像区域）没做翻转** —— 用了 `abs()` 但没翻索引，
   镜像蓝图会左右颠倒。
3. `install` 不自动提权。

## 七、build.py：程序化生成塔 / 站

```bash
python build.py tower  --height 100 --base 32 --top 12 --spire --out out/tower_100.nbt
python build.py tower  --height 1000 --base 48 --top 10 --style cylinder --ring-every 40 --out out/tower_1000.nbt
python build.py station --size 60 --out out/station_60.nbt
```
参数：`--base/--top`（收分）、`--style square|cylinder|spiral`、`--ring-every`（腰线）、
`--floor-every`（楼板）、`--spire`（金字塔尖）、`--material/--accent`。
输出是**标准 vanilla structure `.nbt`**，Create / 工具枪直接认，不需要转换。

实测：
```
tower_100.nbt        33x107x33       11,428 blocks   31.1 KB
tower_300_cyl.nbt    41x306x41       37,168 blocks   84.6 KB
station_60.nbt       61x9x61          7,000 blocks   19.2 KB
tower_1000.nbt       49x1006x49     131,188 blocks  308.5 KB
```
分段套件 `out/tower_kit/`：10 段 × 100 格，连续收分（底面 49²→17²），合计 131,720 块，
每段底面铺 `chiseled_stone_bricks` 地板（比单件多 532 块）。

**放置硬约束**：`tower_1000.nbt` 的 size 是 49×1006×49，世界上限 1023 ⇒
从 y=0 放刚好塞下，从 y=100 放就超限（顶部 1106）。分段套件没有这个问题。

## 八、千格塔的材料账（结论：生存模式不可行）

131,720 方块 ≈ **32,930 组**；`stone_bricks` 1 个 = 4 石头 ⇒ **约 52.7 万石头**。
即便有全套 Create 碎石/刷石机也是几十小时量级，Schematicannon 还要按 tick 喂料 + 火药。

> 千格塔不是"材料问题"，是"不可行"问题 —— 这是 1000 格 × 周长 ≈ 12 万的算术决定的。

折中方案（都能立刻生成）：
- **A. 镂空骨架**：每隔 N 层砌一圈实墙，其余层只留竖肋 ⇒ 降到 1/3~1/4（约 3–4 万）
- **B. 去掉楼板**（`--floor-every` 不设）⇒ 省 ~15%
- **C. 分段打印 + 逐段放弃**：先打 seg_01（21.5K）看效果
- **D. 创造模式**一次性打，当地标

## 相关

- 4a5cedc7-4f1b-416f-bf6d-e08a3c814154：endless 限高推推 + **工具枪蓝图 = 原生 `.nbt` 放 `schematics/`** + 无外网约束（本文档的格式识别结论建立在它之上）
- 0f1a7c40-e9c9-411a-8856-c634800c3e9b：lithium 24 sections 崩溃，1023 上限的来源

---
id: "7a971eb1-de58-4c9b-9fdf-227bb70da831"
title: "Minecraft 存档备份去重清理（2026-10-29）：两处备份目录辨析、DistantHorizons LOD 缓存剔除、释放 64.4 GB 与安全删除规程"
description: "本机 Minecraft 备份实际存在两处（D:\\MINECRAFT\\_backup\\ 与 D:\\MCBackup\\），加上当前存档共三份约 114 GB；本记录给出各自的来源/新旧/内容差异、DH 的 DistantHorizons.sqlite 是约 10 GB 可重建 LOD 缓存因此备份应排除、两次删减的执行与独立复核结果（累计释放 64.4 GB，当前仅剩一份 17.3 GB 备份），以及「路径断言 + KEEP-VERIFY + 不复用脚本自报」的删除防呆规程。关联 backup-mc.ps1 设计文档 6b3159c7。"
status: "active"
created_at: "2026-10-29T06:07:40.808Z"
updated_at: "2026-10-29T06:07:40.808Z"
content_hash: "f4c85d00c9db004e97172f34f7c8117470f6d7707eb72824dbc70a4141aeae8c"
source_paths:
  []
session_ids:
  - "1499e3d8-bc73-47a2-a0a1-2466917d2d44"
memory_body_ids:
  []
---

# Minecraft 存档备份去重清理（2026-10-29）

**性质**：实测调查 + 两次删除执行记录 + 安全删除规程。承接 [backup-mc.ps1 的 robocopy /MIR 设计与防呆守卫](doc:6b3159c7-02bf-4a40-8eaa-438b011f2414)。

## 一、被长期忽略的事实：备份有两处，不是一处

用户一句「我咋看到了两个 mcbackup」才暴露出认知盲区。实际磁盘上**三份约 114 GB**：

| 路径 | 大小 | 来源 | 数据时间 | 含 DH 缓存 |
|---|---|---|---|---|
| `D:\MINECRAFT\.minecraft\versions\1.21.1-NeoForge_21.1.236\saves\机械动力` | 27.6 GB | 在用存档 | 实时 | 10.5 GB |
| `D:\MINECRAFT\_backup\saves-机械动力-20261017` | 27.1 GB | 手工 robocopy（10-17） | 10-17 | 10.2 GB |
| `D:\MINECRAFT\_backup\saves-机械动力-20261023` | 27.6 GB | 手工 robocopy（10-23） | 10-23 | 10.3 GB |
| `D:\MCBackup\saves\机械动力` | 27.1 GB | `backup-mc.ps1` /MIR（10-04） | **10-01** | 10.2 GB |

`D:\MCBackup\` 是 10-04 建立的脚本化备份根（含 `backup-mc.ps1`、`instance/`、`logs/`、两份 manifest），当时用 /MIR 跑过一次后**再未运行**，世界数据停在 10-01，已旧 28 天。它比 `_backup` 那条手工线更严谨，但更新时间更早。

**教训**：统计"备份占多少空间"时只查了一个根目录就下结论，会漏掉近 27 GB。全盘去重盘点应显式枚举所有已知备份根，而不是依赖记忆。

## 二、结论性重复：备份之间 92% 字节一致

逐文件比对两份 `_backup` 的 `region/`：

```
17 有 / 23 无: 0 个
23 有 / 17 无: 3 个
两边都有: 5822 个
抽查 400 个同名: 大小相同 368 (92%)，不同 32 (8%)
```

即旧备份（10-17）相对新备份（10-23）没有独立价值；8% 差异只对应 6 天里世界真正的变化。

## 三、DistantHorizons.sqlite：约 10 GB 的可重建 LOD 缓存

每个存档的 `data/DistantHorizons.sqlite` 是 DH 的 LOD 八叉树预渲染缓存：**删掉会自动重建**，代价仅是下次进世界时该区域远景重新生成（加载变慢），存档数据零损失。

- 三份合计 30.8 GB，占全部备份体积约一半。
- **备份里不需要它**（恢复的世界会让 DH 重算）；`backup-mc.ps1` 的 `-KeepLod` 注释本身就写明默认应排除，但 10-04 那次没加 `-KeepLod`——语义上该反过来：**排除 LOD 缓存才是默认**。
- 当前存档的这份**不动**，否则每次进世界都要重跑 LOD。

## 四、执行与结果

### 第一次（省 37.3 GB）

删除 `saves-机械动力-20261017` 整目录 + `saves-机械动力-20261023\data\DistantHorizons.sqlite`。

```
BEFORE  2 份备份 total 58,637,540,453 B (54.6 GB), 31224 files
AFTER   1 份       18,565,586,560 B (17.3 GB), 15743 files
LIVE SAVE 27.6 GB unchanged
```

**一次算数错误值得记住**：方案预估时说可省 47.6 GB，因为把「旧备份目录内部的 10.2 GB DH 缓存」和「整个旧备份目录 27.1 GB」重复相加。正确账是 `27.1 + 10.3 = 37.3 GB`。目录级删除已包含其内部文件，任何"删除目录 + 删除该目录内某文件"的收益估算都要先做集合去重。

### 第二次（省 27.1 GB）

只删 `D:\MCBackup\saves`，保留同目录的 `instance/`（0.27 GB，含 config/mods/resourcepacks/schematics，`_backup` 线没有）、`logs/`、`backup-mc.ps1`、两份 `manifest_*.json`。

### 汇总

- 两次合计释放 **64.4 GB**（37.3 + 27.1）。
- 当前唯一备份：`D:\MINECRAFT\_backup\saves-机械动力-20261023`（17.3 GB，DH 缓存已剔除）。
- 在用存档 27.6 GB 全程一字节未动，三个世界（`机械动力`、`新的世界`、`新的世界 (1)`）都在。

## 五、可复用的安全删除规程

删除存档类大目录时用同一套模板，重点在**证明没删错**而不是证明删成功：

1. **BEFORE 快照**：列出每个待删目标的文件数与字节数，以及"必须保留"清单的 `exists` 状态。
2. **硬性路径断言**（不满足即整体 abort，不做部分执行）：
   - 当前存档必须位于 `D:\MINECRAFT\.minecraft\...` 之下，且存在；
   - 每个待删路径必须 `StartsWith('D:\...\_backup\')` / `StartsWith('D:\MCBackup\saves')`。
   - 断言写在脚本里，不是靠人工核对命令行。
3. **KEEP-VERIFY**：删完后重新枚举保留项，逐项 `exists=True`，并打印 `saves removed = True` / `all keeps present = True`。
4. **独立复核，不信脚本自报**：另起一次测量（`du`/PowerShell 另行统计）核对剩余体积、`data/` 下已无 `*.sqlite`、当前存档体积未变。
5. **改动用 UAC 提权脚本 + 日志回读**：日志是所有 BEFORE/PLAN/EXECUTE/AFTER 的唯一证据来源；提权启动器的退出码与日志要分别读取。

## 六、遗留待办（用户未答复）

`D:\MCBackup\backup-mc.ps1` 仍保留，三处建议改进：

1. 默认排除 `DistantHorizons.sqlite`（现默认会打包约 10 GB 可重建缓存）。
2. `/MIR` 的 `purgeFileLimit = 100` 偏松——10-04 那次留下 27 GB 陈旧数据却无任何提示。
3. 开头加「距上次 manifest 时间超过 N 天则警告」，避免备份静默失效 28 天。

另据 [backup-mc.ps1 设计文档](doc:6b3159c7-02bf-4a40-8eaa-438b011f2414)的三条硬规则（必须先完全退出游戏；/MIR 会清目标；源与目标是内置常量），改脚本时不得破坏。

## 环境备注

- 大部分 PowerShell 结果以 UTF-8 BOM 或 ANSI 着色输出，混合 `cmd` 回显时会污染日志；统计脚本统一用 Python + `os.scandir` 递归求和更稳。
- Git Bash 下把 `D:\` 传入 PowerShell `-Command` 极易被反斜杠转义吞掉（`-Verb` 被识别成参数、`SyntaxError: unterminated string literal`）。跨层调用应写成 `.ps1` 文件再 `-File`，或用 Python 转 `D:/` 正斜杠路径。

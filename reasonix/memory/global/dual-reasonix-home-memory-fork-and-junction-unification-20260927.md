---
id: mem-022903ce21cfa84e82ce199d69798c64
revision: 1
created_at: "2026-09-27T14:12:49.200Z"
updated_at: "2026-09-27T14:12:49.200Z"
name: dual-reasonix-home-memory-fork-and-junction-unification-20260927
description: "本机双 reasonix home 导致 memory 双份漂移（dsh 侧 ~/.reasonix/memory 338 项 vs 桌面版 %APPDATA%/reasonix/memory 321 项）；已合并零丢失并用 junction 归一，两路径均 351 项且字节一致"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 一、问题：两个 reasonix home 导致 memory 双份漂移

本机同时存在两个 reasonix home，且**都活跃、内容不同**：

| home | 谁在读写 | 归一前状态 |
|---|---|---|
| `C:\Users\27063\.reasonix\` | **dsh 侧的 memory 工具**（`memory_remember`/`memory_search`/`memory_read`/`memory_profile`） | `memory/global` **338** 项，MEMORY.md 随写随更新 |
| `C:\Users\27063\AppData\Roaming\reasonix\` | **reasonix 桌面版**（`config.toml` 在此，09-27 10:22 改过） | `memory/global` **321** 项，MEMORY.md 停在 09-26 21:08 |

**根因**：`~/.dsh/.agent-presets/anchored-standard/memory.mjs` 第 34–35 行

```js
/** Override the corpus root (defaults to ~/.reasonix/memory). */
const MEMORY_ROOT = process.env.DSH_REASONIX_MEMORY ?? join(homedir(), '.reasonix', 'memory')
```

该插件文件头的设计意图（第 2–3 行）明确写着「**so a dsh session and a reasonix session share ONE set of facts instead of forking**」，但它假设 `<reasonixHome>` = `~/.reasonix`，而 Windows 上 reasonix 桌面版的 home 是 `%APPDATA%\reasonix`（依据：`config.toml` 在那里；`backup-to-github.ps1` 的 `$Targets` 里 `reasonix` → `Src="$AppData\reasonix"`；deja 的 root chain 也以 `%APPDATA%\reasonix` 为 Windows 落点）。**设计意图正确，实现路径错位。**

**漂移实测**：同名完全相同 270 个、内容不同 40 个；G1 独有 30 个（16 个真实新 fact + 12 个 `.bak-prereversion-*` + 2 个 conflict 副本）；G2 独有 11 个**全是 `.conflict.*.bak`**（零独有内容）。
→ **分叉是单向的：内容只堆在 dsh 侧，reasonix 侧从未收到。**

## 二、解法：合并 + junction（2026-09-27 执行，零丢失）

以 `%APPDATA%\reasonix\memory`（reasonix 的 canonical home）为基底：

1. **全量备份** G1 → `C:\Users\27063\.reasonix\memory-merge-backup-20260927-2212`
2. **补入** G1 独有文件 **30** 个
3. **同名冲突 40 个**：**先**把 G2 版另存到 `memory-merge-backup-.../_g2-version/<scope>/<name>`（**存在 memory 目录之外，避免污染 memory_search**），**再**用 G1 版覆盖
4. 完全相同 **281** 个跳过
5. 验证一致性：**相同 351 / 缺失 0 / 不同 0** ✅
6. 删除 `~/.reasonix\memory`，建 junction：
```powershell
Remove-Item -LiteralPath 'C:\Users\27063\.reasonix\memory' -Recurse -Force
New-Item -ItemType Junction -Path 'C:\Users\27063\.reasonix\memory' `
         -Target 'C:\Users\27063\AppData\Roaming\reasonix\memory'
```
7. **验证**：两条路径均 **351** 项，`MEMORY.md` 同为 **30,583 B**

## 三、为什么选 junction 而不是改代码

- `memory.mjs` 默认走 `~/.reasonix/memory`，junction 对它**完全透明** → **无需改插件、无需设环境变量**
- reasonix 桌面版走 `%APPDATA%\reasonix\memory` → 同一份
- **不碰任一侧的配置或版本**，可逆（删 junction 重建目录即可）
- 备选方案 `DSH_REASONIX_MEMORY` 环境变量也能用（插件已支持），但它只修 dsh 侧；junction 让**所有**走这两条路径的组件（含 sync 脚本、备份脚本）都归一

## 四、复验与回滚

```bash
# 一致性（应均为 351 且字节相同）
ls -1 ~/.reasonix/memory/global | wc -l
ls -1 "$APPDATA/reasonix/memory/global" | wc -l
stat -c "%s" ~/.reasonix/memory/global/MEMORY.md "$APPDATA/reasonix/memory/global/MEMORY.md"
# junction 是否生效
powershell -NoProfile -Command "(Get-Item 'C:\Users\27063\.reasonix\memory').LinkType"
# 端到端：写一条 fact 后两端应同时可见（本 fact 即是测试用例）
```
**回滚**：`Remove-Item` junction → 从 `memory-merge-backup-20260927-2212` 还原 `~/.reasonix\memory` 目录（原名复制，不含 `_g2-version`）。

## 五、连带影响

- **备份范围**：`~/.reasonix` 仍不在 `backup-to-github.ps1` 的 `$Targets` 里，但已新增 `reasonix-home` target 覆盖其 `memory/skills/mind-transcripts`；`%APPDATA%\reasonix\memory` 则一直被 `reasonix` target 覆盖。junction 后**两条路径内容同一**，备份任一侧即等价。
- **本机铁律（新增）**：任何涉及 reasonix 路径的结论，**必须先确认是 `~/.reasonix` 还是 `%APPDATA%\reasonix`**。2026-09-27 一天内因此误判 3 次（cron 时间、`global-workspace` 文件数、`reasonix.toml` 修复状态）。

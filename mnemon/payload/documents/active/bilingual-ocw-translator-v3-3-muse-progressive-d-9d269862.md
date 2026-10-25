---
id: "9d269862-e4bf-4c97-8fbd-58a4519289b7"
title: "bilingual-ocw-translator 技能 v3.3 重构：MUSE 模型口径 + progressive disclosure + 技能收敛"
description: "2026-09-30 把 ~/.reasonix/skills/bilingual-ocw-translator 从 v3.2 改造成 v3.3 的完整 rationale 与证据：模型口径统一为 MUSE 单一常量、主文档 1338→622 行 progressive disclosure 拆分到 references/、三个同类翻译技能收敛为一个（另两个改名停用）的 registry 机制、备份回滚方式，以及尚未验证的 model id 不确定性。"
status: "active"
created_at: "2026-09-30T10:57:51.862Z"
updated_at: "2026-09-30T10:57:51.862Z"
content_hash: "752c0555399c6abba9d31528ae2de82d41243b0835550d96e6a144df1dcf5c66"
source_paths:
  []
session_ids:
  - "3d457087-f292-4326-a59f-051b8619cc44"
memory_body_ids:
  []
---

# bilingual-ocw-translator 技能 v3.3 重构

**日期**：2026-09-30　**技能根目录**：`C:\Users\27063\.reasonix\skills\bilingual-ocw-translator\`
**目标**：用户要求「动 v3.2 本体换模型，并按社区经验压一版」，同时把散落的同类翻译技能收敛成一个入口。

---

## 1. 技能收敛：三个同类技能 → 一个

`bilingual-translator`、`ocw-lecture-translator`、`bilingual-ocw-translator` 三个技能功能重叠，翻译入口统一到 `bilingual-ocw-translator`。

**机制（可复用）**：收敛不靠配置开关，而是利用 `@deepseek-ai/dsh-skill-filesystem` 的 `discoverRoot` 只认目录下的 `SKILL.md`（flat skill 只认根目录 `*.md`）。因此把另两个技能的 `SKILL.md` 重命名为 `SKILL.md.disabled-20260930-keep` 即可让它们退出 registry，**文件内容一字未丢，回滚只是改回文件名**。

- `~/.dsh/skills/` 下指向这两个技能的两个 symlink 保留但已失效。
- provider 带 watcher，**不需要重启**即生效。

**实测证据**：
- `skill_search("翻译")` → 返回 86 条，两个停用技能均不出现。
- `skill_search("ocw translator")` / `skill_search("ocw lecture")` → 只命中保留的 `bilingual-ocw-translator`。

> 该机制适用于任何「停用但不删除技能」的场景，比删目录或改配置更安全。

---

## 2. progressive disclosure 重构

主文档 **1338 行 → 622 行（-53%）**，四类「查表内容」移入 `references/`（合计 778 行，按需加载）：

| 文件 | 承接内容 |
|---|---|
| `references/format.md`（272 行） | 原第 4 章：配色 / 标签 / 标题层级 / 习题差异化规则 / 交付前质量清单 |
| `references/notes-guide.md`（128 行） | 原第 3 章：译者注写法 / Spec 表 / DoD / 读者画像 / 事实核查 |
| `references/toolchain.md`（178 行） | 原第 5 章：PDF 提取 / 字幕搜索 / 全资源路径 / dsh 执行通道与命令铁律 |
| `references/prompts.md`（204 行） | 原第 6 章：六类 worker 的 prompt 模板 |

主文档保留：核心契约 + 快速上手 + 第 1 章（铁律）+ 第 2 章（标准流程）+ 第 7 章 + 附录 A；第 3-6 章只留「标题 + 指向 `references/` 的指针 stub」。

**硬约束：23 条铁律一条未删**（`grep -c "^### 铁律 "` = 23）。

### 比「缩短」更关键的三件事

1. **核心契约前置**：新增「🎯 核心契约（每次开工先读这一段）」10 条一览表，把最易漂移的约束（禁止英中分段对照 / 禁止 `$$` / 审计即修复 / wiki 先行 / 密度标准）放到最高显著度位置。
2. **单一模型常量**：全流程模型只在核心契约定义一次，正文统一引用 `MUSE`。此前同一模型名的重复出现是口径漂移源，现在改模型只需改一处。
3. **消除悬空交叉引用**：第 1/2 章内所有「见第 N 章」改指 `references/` 实际文件——否则按需加载必然读空。最终 `dangling 第3-6章 refs = 0`。

做法依据社区 `skill-creator` 规范：progressive disclosure 三层加载、SKILL.md 越界就加一层并给指路、frontmatter `description` 含 when-to-use 且略 pushy（已改写，补「凡是需要翻译讲义、教材、习题集、课程 PDF…都用这个技能」的触发式措辞）。

**过程中两个可复用的 shell 教训**：
- 用 `node -e` 内联脚本处理 Windows 路径时，反斜杠在词法层被吃掉导致 `SyntaxError`——改为零反斜杠脚本，或直接落盘 `.cjs` 文件再执行。
- 临时中间文件不要写到 `C:\tmp`（不存在，报 `ENOENT`）；改用 `__dirname` 同目录或系统 Temp，`C:\Users\27063\AppData\Local\Temp`。

---

## 3. 模型口径替换：MUSE

全文的 `v4.1 flash` / `deepseek-v4.1-flash` / `deepseek-v4-pro` 全部替换为 **MUSE = `meta/muse-spark-1.3-contributor`**。

- 残留检查：`SKILL.md`、`references/{format,notes-guide,prompts,toolchain}.md` 中 v4.1/flash 口径**均为 0 处**。
- v3.2（历史口径）：模型统一 flash、pro 弃用；全审计「审计+修复一体」。
- 完整沿革记入 `HISTORY.md` 的 v3.3 行（第 173 行）。

### ⚠️ 尚未验证的不确定性（重要）

1. **登记表里没有 `muse3.1`**：`~/.dsh/settings.new.yaml` 的 `commandcode-goat` provider 只登记了 5 个 model id：`meta/muse-spark-1.1`、`meta/muse-spark-1.2`、`meta/muse-spark-1.2-contributor`、`meta/muse-spark-1.3`、`meta/muse-spark-1.3-contributor`。落笔采用最接近的 `1.3-contributor`。
2. **旧口径 `deepseek-v4.1-flash` 同样不在登记表里**（表内只有 `deepseek/deepseek-v4-flash`、`-flash-fast`、`-flash-vision-exp`、`deepseek-v4-pro`）。即该技能此前的模型口径可能整体就是错的——按 `dsh-gate` 契约，model 缺失会直接 `exit 2`。
3. `settings.new.yaml` 时间戳为 2026-09-04，本机找不到活跃的 `~/.dsh/settings.yaml`，因此**没有实际跑过 `dsh-remote -m ...` 验证**。

**收口办法**：确认准确 model id，或把 id 收敛到核心契约那一行后跑一次
`dsh-remote -m <id> -e off "1+1"`。

---

## 4. 备份与回滚

| 对象 | 备份 |
|---|---|
| `SKILL.md` | `.bak-20260930-pre-muse131c`、`.bak-20260930-pre-restructure`、`SKILL.md.bak-20260903-wordcount` 等历史件保留 |
| 两个停用技能 | `SKILL.md.disabled-20260930-keep` + `.bak-20260930-pre-disable` |
| `HISTORY.md` | 新增 v3.3 版本行，记全 5 项变更 |

回滚：`mv SKILL.md.disabled-20260930-keep SKILL.md`，即刻重新进入 registry。

---

## 5. 未覆盖 / 后续

- `dsh-gate` / `dsh-mode` 两个技能里仍是 `deepseek-v4.1-flash` 口径，**未同步**；它们与本技能现在是两套模型说法，会互相矛盾。
- 没有跑 `skill-creator` 的 eval / benchmark 闭环。本次只有静态结构验证 + registry 可见性实测；要拿「重构确实提升遵循度」的量化证据需 with-skill / baseline 对照。

---

## 6. 最终文件状态

```
C:\Users\27063\.reasonix\skills\bilingual-ocw-translator\
  SKILL.md            46771 B  622 行  (v3.3)
  HISTORY.md          218 行（含 v3.3 行）
  references\format.md        272 行
  references\notes-guide.md   128 行
  references\prompts.md       204 行
  references\toolchain.md     178 行
  （另有两个历史备份件与两个已停用技能的 .disabled 文件）
```

同日同环境的另一批维护记录（mnemon subagent / goat-gateway 修复）见 document `fa611c46-9dc6-42aa-93a8-1002be2468bd`。

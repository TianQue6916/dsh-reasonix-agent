# 配套补丁（只在选 A 时需要，两条命令的量）

替换主文件后，`references/` 里还有两处**与新版正文不一致**，不修就变成「main 说 A、reference 说 ¬A」。

---

## 1 · `references/quickstart-faq.md` 退役条文

**现在的样子**（该文件「一次最多并行几个 dsh 任务？」那一行）：

> 视主力机并发能力分批派发（铁律 21：不用 Reasonix 子代理）

**问题**：铁律 21 在 2026-11-19 已经改口径——dsh 环境里内建 `subagent` / `subagent_fork` / `workflow` 就是通道；`dsh-remote` 只是 Android 客户端 apk，不在 PATH。「不用子代理」与现行契约 1 正面冲突。

**改成**：

> 见铁律 33：并发上限 8（本机默认已放宽到 32，但重型实施 4 路是拐点），按任务类型分批派发；通道用内建 `subagent`。

同文件另两处顺带核一下（都还是对的，不用改）：「审计用什么模型 → v4.1 flash」「写注用什么模型 → v4.1 flash」。

---

## 1b · `references/ironrules-process.md` 的铁律 21 原文（审稿人抓到的，比第 1 条更硬）

**现在的样子**（`references/ironrules-process.md:30`，标题就是论点）：

> ### 铁律 21：Reasonix 不派任何子代理——一切子代理活全部转主力机 dsh（2026-09-07 拍板，2026-09-08 强化）

正文进一步写「唯一执行通道 = 主力机 dsh（`dsh-remote`，默认 flash；仅超强审计 `-pro`）」「Reasonix 内建子代理 ❌ 不用」。

**问题**：同一文件的铁律 22 已经在 2026-11-21 补过「`-e` 已退役，`dsh-remote` 只是 Android 客户端 apk、PATH 里没有这个命令」，但**铁律 21 的标题与正文一个字没改**。结果是：主文件（新版铁律 21）说「不绕道另一台机器，用内建 `subagent`」，而它指向的「原文完整版」说「唯一通道是 dsh-remote、内建子代理不用」。**这是最危险的一类不一致**——模型读哪一份都可能，两份互相否定。

**改法**（三处，都在这一节内）：

1. 标题改为：
   > ### 铁律 21：子代理活走内建通道，不绕道另一台机器（2026-09-07 定题，2026-11-19 改口径）
2. 标题下第一段前加一行：
   > **⚠ 2026-11-19 实测推翻旧口径**：`dsh-remote` 只是 Android 客户端 apk，PATH 里没有这个命令。dsh 环境里的执行通道就是内建的 `subagent` / `subagent_fork` / `workflow`（与铁律 22 的 2026-11-21 更新同源）。下文所有「dsh-remote 任务」一律读作「内建 subagent 调用」，「Reasonix 内建子代理 ❌ 不用」这条**作废**。
3. 通道总表里 `Reasonix 内建子代理 | ❌ 不用` 一行改成 `内建 subagent（`subagent` / `subagent_fork` / `workflow`） | ✅ 默认通道`。

**为什么必须做**：新主文件第 9 节把 `references/ironrules-process.md` 标成「铁律原文的完整版」。原文不改，等于新版留了一个**指向反面的指针**。

---

## 2 · `references/chapter-briefs.md` 零打开且纯重复路由

**事实**：3,683 B，内容是「第 N 章 → 哪个文件 + 一句话摘要 + 何时读」，与主文件第 9 节路由表 100% 重叠；2026-11-01 以来的 792 个会话里**一次都没被打开**。

**两种处理，选一个**：

- **删**（推荐）：`rm references/chapter-briefs.md`（`ai-skills` 不在 git 里，没有版本控制托底，删前先进 `_archive/`）。其中唯一不在别处的内容是「第 9 章 / 第 10 章何时读」两句提醒——把它们各加一行到 `vision-check.md` 与 `image-pipeline.md` 的开头即可。
- **留但降级**：在文件开头加一行「本文件是主文件第 9 节路由表的展开版，仅供参考，路径以主文件为准」，避免两处打架。

---

## 3 · 备份垃圾清理（可选，但建议）

`learn-translate/` 目录 864 KB，其中 **340 KB（39%）是 `.bak*` 与 `.conflict.linux.*.bak`**，共 18 个文件。

根因：**`~/ai-skills` 不在任何 git 仓库里**（实测 `git rev-parse` 报 `not a git repository`）——所以每次改动只能靠手打 `.bak-<时间戳>` 兜底，双机同步冲突又留下 `.conflict.linux.*.bak`。它们不参与注入，但会让「哪个是真身」变成需要判断的事，而铁律 39 的教训正是「同名文件/目录陷阱」。

（更好的解法是在 `ai-skills` 里 `git init` 一次，让 `.bak` 退役。这超出本次范围，只在这里记一笔。）

```bash
cd ~/ai-skills/learn-translate
mkdir -p _archive
mv *.bak-20* *.bak *.conflict.linux.*.bak _archive/ 2>/dev/null
mv references/*.bak-20* references/*.bak references/*.conflict.linux.*.bak _archive/ 2>/dev/null
du -sh .   # 应降到约 520 KB
```

保留 `_archive/` 里最近一次的 `SKILL.md.bak-<stamp>-pre-v6`，其余可删。

---
id: mem-821ca25e1f1c1a870eb572c24fcc70d1
revision: 1
created_at: "2026-09-27T17:30:35.703Z"
updated_at: "2026-09-27T17:30:35.703Z"
name: mnemon-db-rebuild-verified-20260928
description: "实证 mnemon 库可重建：删库后从 markdown 一条命令恢复（195→205 insights / 5498→5868 edges / embedding 自动 100%），验证了 round 21 \"派生数据不进备份\"的判断；提炼\"不进备份的派生数据必须实测可重建\"这条原则"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 一、为什么做这个验证

Round 21 我以「**mnemon 库是派生数据**」为由把它从备份 `$Targets` 移除（它含密钥且二进制无法脱敏）。
**如果它不能重建，这个判断就是错的** —— 所以本轮做删除+重建的实证。

## 二、重建实证（2026-09-28）

```bash
# 1) 先把库移走（不直接删，可回退）
mv ~/.mnemon/data/default/mnemon.db ~/.mnemon/data/default/mnemon.db.pre-rebuild-test

# 2) 从 markdown 重建
python ~/.dsh/storages/tools/memory-to-mnemon.py

# 3) 核对
mnemon status | (insights / edge_count)
mnemon embed --status | coverage
```

| | 重建前 | 重建后 |
|---|---|---|
| fact 文件 | — | **164** |
| insights | 195 | **205**（+10） |
| edges | 5498 | **5868** |
| db 大小 | 5.03 MB | 5.33 MB |
| **embedding** | 100% | **100%（205/205）自动补齐** |

**结论：重建完全成功，而且比原来更全** —— 因为它吸收了这几天新增的 fact。
`ollama` 在跑，所以 `import` 时**直接算好 embedding**，不需要再单独 backfill。

**这实证了 round 21 的判断**：mnemon 库确实是**可重建的派生数据**，不进备份是对的。

## 三、备份策略的最终形态

| 数据 | 进备份？ | 理由 |
|---|---|---|
| `~/.reasonix/memory/global/*.md`（markdown 语料） | ✅ **是** | source of truth；文本、可脱敏、可 grep、可 diff；已由 `reasonix-home` target 覆盖 |
| `~/.mnemon/data/*/mnemon.db`（SQLite） | ❌ **否** | 派生、含密钥、二进制绕过脱敏；**一条命令即可重建** |
| `~/.dsh/storages/mnemon-draft.json` | ❌ 已排除 | 中间产物 |
| `~/.mnemon/runtime/`（热记忆） | 不适用 | 由 `mnemon_runtime_memory` 工具管理，内容来自用户明确定过的事实 |

**重建成本**：一条命令 + 约 1 分钟（205 条 import，embedding 随 import 生成）。

**灾备路径（完整）**：
```
GitHub 备份里的 markdown 语料
  → 恢复 ~/.reasonix/memory/global/
  → python memory-to-mnemon.py
  → mnemon 完整恢复（含 four-graph 边与 embedding）
```

## 四、可推广的原则

**「不进备份的派生数据，必须证明它可重建」** —— 否则就不是"省略备份"，而是"丢掉数据"。
判据是**真的做一次删除+重建**，不是看文档说"可重建"。

反过来说：**如果一个"派生"数据实际上无法从源头恢复，那它就不是派生数据，必须进备份** ——
这是一个**需要实测才能定性的分类**，不能凭直觉。

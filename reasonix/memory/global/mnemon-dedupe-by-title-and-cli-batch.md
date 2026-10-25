---
id: mem-06b360b99d9f0b99815ecd7ae879d129
revision: 2
created_at: "2026-10-25T19:45:53.539Z"
updated_at: "2026-10-25T21:26:11.104Z"
name: mnemon-dedupe-by-title-and-cli-batch
description: "mnemon 碎片根因已确证：vault 同步走 upsert 而 auto-capture 走 append；含去重脚本、每日卫生检查挂载点与三个治本选项"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状

`mnemon` 库里的 recall 结果位被同一来源的碎片占满：2026-10-26 实测 **441 条存活 insight / 390 个唯一标题，51 组同标题占 158 条（36%）**，最大两组 `discrete-math ×22`、`advanced-math ×18`。
每段 recall 只给 6 个结果位 ⇒ 一问相关话题就被同源碎片吃满。

## ★ 根因（2026-10-26 已确证：两条写入路径的语义不同）

| 路径 | 语义 | 结果 |
|---|---|---|
| vault（`~/.reasonix/memory/**`）→ `memory-to-mnemon.py` | 按 `name` **upsert**；脚本**主动跳过 `.revisions`**（源码注释：「`.` 开头的目录是修订快照，不是记忆本体」）；自带去重 + `mnemon-sync-state` 增量 | 同一 fact 只有 1 条 |
| **auto-capture / idle checkpoint review**（`dsh-mnemon-strategy-auto-capture`，`disabled: false`；`idleReviewMs: 30000`） | **直接写 mnemon，绕过 vault**；每次 idle 检查 append 一条新 insight，**不按标题去重** | 同一主题越积越多 |

**证据链**：
1. `discrete-math` 在 vault 里**根本不存在**（`ls | grep -i discrete-math` 为空）⇒ 这些 insight 不是 vault 同步来的；
2. vault 有 323 个 md，mnemon 有 337 个唯一标题 —— 数量级吻合但 mnemon 反而更多，差额来自 auto-capture；
3. `cordis.patch.yml:1429` `mnemon-strategy-auto-capture` `disabled: false`（无自定义配置，全用默认），`:1393` `idleReviewMs: 30000`；
4. oplog 里 `import`（vault 同步）与 auto-capture 的写入是两类记录。

⇒ **「去重」不是数据质量问题，是两条写入通路的语义不一致问题**：一条 upsert，一条 append。

## 治标（已落地，2026-10-26）

`~/.dsh/storages/tools/mnemon-dedupe.py`（109 行，python）：
- 默认只报告；`--apply` 才执行 `mnemon forget`（软删，写 `deleted_at`，可回滚）；
- 策略：按 `content` 首行标题分组，**组内保留最长一条**（并列取 `updated_at` 最新）—— 抢救信息量，短碎片往往是被截断的那半；
- 判据（fail 条件）：**存活条数 == 唯一标题数**；
- 已挂进每日备份链：`backup-to-github.ps1` §5.5（在脱敏校验之后、commit 之前），**只报告不删**，发现重复组就写日志告警；`-DryRun` 也会跑到（实测日志出现 `mnemon 卫生: 存活 337 / 唯一标题 337 / 重复组 0`）。

实测效果：441 → 335（+2 条新 fact = 337），重复组 0，recall 从「22 条碎片」变成「只回 1 条最完整版」。

## 治本（三个选项，未执行，需拍板）

1. **调大 `idleReviewMs`**（30 s → 300 s）：profile patch 的 HMR 改动，开新 session 生效，零风险，只降低碎片产生速率；
2. **关 auto-capture**（`disabled: true`）：彻底不碎片，但丧失「不用手动 memory_remember 也能沉淀」的能力；
3. **改插件让它按标题 `replace`**（或让 auto-capture 改走 vault，从而享受 upsert）：治本但要改插件行为，风险最高。

## 批量执行 CLI 的两个坑（实测）

1. **`if timeout 20 mnemon forget "$id" >/dev/null 2>&1; then` 在 `while read` 循环里 100% 失败**（60/60、106/106 全 rc≠0）；
   改 `out=$(timeout 20 mnemon forget "$id" 2>&1); rc=$?` 后 102/105 成功。已排除：行尾 `\r`、编码、db 锁、单条耗时 362 ms。**真因未确证** ⇒ 固定用「赋值捕获 + `rc=$?`」写法（python 脚本里用 `subprocess.run` 不存在此问题，推荐直接调脚本）。
2. **`rc=1` 的真实语义是「已删过」（幂等）**，不是失败。判据看 db 计数，不看退出码。

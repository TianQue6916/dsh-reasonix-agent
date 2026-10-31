---
id: mem-06b360b99d9f0b99815ecd7ae879d129
revision: 4
created_at: "2026-10-25T19:45:53.539Z"
updated_at: "2026-10-26T04:46:42.560Z"
name: mnemon-dedupe-by-title-and-cli-batch
description: "mnemon 碎片：根因（append-only 不回收旧版）+ 治标已落地（每夜自动收口）+ 治本① 已执行（idleReviewMs 30s→300s，dump-config 已验证）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状

`mnemon` 同标题 insight 越积越多，recall 的 6 个结果位被同源碎片占满：2026-10-26 实测 **441 条存活 / 390 唯一标题，51 组同标题占 158 条（36%）**，最大 `discrete-math ×22`、`advanced-math ×18`。

## 根因（已确证）

**insight 是 append-only 模型：更新 = 新记录 + 旧记录软删（`deleted_at`）**，但两条写入通路都只做"写新"、不回收旧：

| 通路 | 判变化 | 缺的动作 |
|---|---|---|
| vault → `memory-to-mnemon.py` | `mtime+size+sha256` 指纹变了就 `mnemon import` | **不软删同 name 的旧 insight** |
| `mnemon-strategy-auto-capture` / idle review（`disabled: false`） | 每次 idle 直接写，绕过 vault | **无 name 幂等** |

**实证**：同一 fact 从 rev1 改到 rev2，几秒后 mnemon 就多出同标题第二条 —— 无需 auto-capture 参与。
⇒ 碎片不是"写太多"，是**版本累积没回收**。vault 侧 upsert 只保证磁盘一份，不保证 mnemon 一条。

## 处置现状（2026-10-26）

**治标（已落地 + 端到端验证）**
- `~/.dsh/storages/tools/mnemon-dedupe.py`：按 `content` 首行标题分组 → 组内保留最长（并列取 `updated_at` 最新）→ 其余 `mnemon forget` 软删。判据：**存活条数 == 唯一标题数**。
- 挂进 `backup-to-github.ps1` §5.5：每夜 **自动收口**（重复组 ≤ 20 → `--apply`；> 20 只告警）。`-DryRun` 实测日志 `mnemon 卫生: 存活 337 / 唯一标题 337 / 重复组 0`。
- 结果：441 → 337，重复组 0；`recall "离散数学 Chernoff Bound"` 从 22 条碎片变成**只回 1 条最完整版**。

**治本 ① 已执行（2026-10-26，用户拍板）**
`idleReviewMs: 30000 → 300000`（30 s → 5 min），改在 `profiles/{web,desktop}/cordis.patch.yml`（headless 无 mnemon）。
验证：`dsh --profile web --dump-config | grep idleReviewMs` → **`idleReviewMs: 300000`**（合成结果确认；profile patch 属 `patchReload: live`，开新 session 生效，无需重启）。
注释已随改动写入 yml，指向 `kb/06-memory-architecture.md`。

**治本 ③（最彻底，未执行）**：给 `memory-to-mnemon.py` 补一步「import 成功后软删同标题旧条」。做完碎片从根上不再产生，每夜收口退化为纯保险。

## 三个必踩的工程坑

1. **Windows 上 python `subprocess` 调 `mnemon` 会 `FileNotFoundError`** —— 它是 npm 的**无扩展名 bash shim**，`CreateProcess` 执行不了。必须 `shutil.which("mnemon.cmd")`。
2. **`if <cmd> >/dev/null 2>&1; then` 在 `while read` 循环里 100% 失败**（60/60、106/106 全 rc≠0）；改 `out=$(cmd 2>&1); rc=$?` 后 102/105 成功。真因未确证 ⇒ 批量用「赋值捕获」，或直接写成 python + `subprocess.run`。
3. **用 python 改 CRLF 的 `.ps1` 时，`'\r?\n'` 会被 python 吃成真控制字符** → PowerShell 正则被切成两行，而 **Parser 语法校验照样通过**（只看语法不看语义）。⇒ 改 PowerShell 正则一律 raw string / `chr(92)`，改完**看 `repr()` 而不是只跑 Parser**。
4. `mnemon forget` 的 **`rc=1` = 已删过（幂等）**，不是失败。判据看 db 计数，不看退出码。

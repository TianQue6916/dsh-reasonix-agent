---
id: "ec0db3f5-519d-4a46-a6f3-c290def38c89"
title: "dsh profile 的 model reasoningEfforts 实测重建：正确 probe、models 块安全改写与权威校验（2026-10-04）"
description: "2026-10-04 实测交接：如何用同时识别 reasoning_content 与 reasoning_details 的 probe 重建 web/desktop 两侧 61 个 model 的 reasoningEfforts，profile YAML 的 models 块改写陷阱（同缩进双 models 块、只能原地替换、pyyaml 不能当 gate）、dsh --dump-config 权威校验与自动回滚流程，以及剩余 3 个未知项的处置方式。"
status: "active"
created_at: "2026-10-04T15:06:28.920Z"
updated_at: "2026-10-04T15:06:28.920Z"
content_hash: "cd1bcb14aa68a2e9fed0706c053142a06a957c541d822428d24e160e142417b0"
source_paths:
  - ".dsh/storages/tools/probe-reasoning-all.py"
  - ".dsh/storages/tools/probe-all-models.py"
  - ".dsh/storages/tools/sync-efforts-from-probe.py"
  - ".dsh/storages/tools/efforts-diff.py"
  - ".dsh/storages/tools/desktop-model-audit.py"
  - ".dsh/tmp-probe/efforts-probe-20261004.json"
  - ".dsh/profiles/web/cordis.patch.yml"
  - ".dsh/profiles/desktop/cordis.patch.yml"
  - ".dsh/storages/tools/dump-desktop-config.ps1"
session_ids:
  - "0cfbb08d-61db-44f2-a64e-03ee66ab7590"
memory_body_ids:
  []
---

# dsh profile 的 model reasoningEfforts 实测重建（2026-10-04）

环境：Windows，用户 `天阙九泉\27063`，home 下 `.dsh` 仓库（branch `main`）。全部结论来自本机实机操作与工具回读。
相关既有文档：[fa611c46](documents/active/dsh-mnemon-subagent-catalog-persona-goat-gateway-fa611c46.md)（同样涉及「reasoningEfforts 按真实能力」与 profile patch 的修改手法），本文只补充这次实测重建的判据与陷阱。

## 结论先行

- **两边的档位来源原本都不可信**：web 的大范围 `false` 建立在**有缺陷的 probe** 上，desktop 则更接近「统一套用 4 档」。**实测 probe 是唯一依据**。
- 用正确 probe 重建后：61 个共有 model 的 efforts **identical 58 / DIFFERENT 3**（原先只有 14 相同、47 不同）；主力 `deepseek/deepseek-v4.1-flash` **从 4 档补到 6 档**（多出 `medium` / `xhigh`，`off/low/medium/high/xhigh/max`）。
- 剩下 3 个差异是**设计使然**，不是缺陷：probe 里返回 503 `other` ⇒ 归入「未知」并**保持原样，不猜**。

## 1. probe 必须同时认两种 reasoning 字段

`probe-all-models.py` 只看 `choices[0].message.reasoning_content`。但换用 `reasoning_details` 报思考的 model（`gpt-6-luna`、`gpt-5.6-sol`、`gpt-5.6-luna`、`google/gemini-*`、`xiaomi/mimo-*`、`deepseek/deepseek-v4-pro`、`deepseek/deepseek-v4-flash-vision-exp` 等）会被判成「无 reasoning」⇒ **web 大面积错标 `false`**。

- 判据对比（同一个 `gpt-5.6-luna`）：旧 probe ⇒ `ok_non_thinking`；新 probe `probe-reasoning-all.py` ⇒ `levels_ok` + `reasoning_details`。
- `probe-reasoning-all.py` 两种字段都认，每 model 1 次请求，62 个约 3 分钟，结果落盘 `~/.dsh/tmp-probe/efforts-probe-20261004.json`（本次 521 B 起，随进度增长）。
- `claude-sonnet-5-5` 返回 `400 rejected`：「must be called via /messages」——这类走 Anthropic 端点的 model 不属于本次集合。

**推论（可复用）**：任何「某 model 有没有 reasoning」的结论，只要 probe 只读单一字段，就是疑似结论；换 provider 或换 model 代次时应先复核 probe 覆盖的字段面。

## 2. profile YAML 的 `models:` 块改写陷阱（本轮破坏两次的根因）

工具：`~/.dsh/storages/tools/sync-efforts-from-probe.py`（`--probe <json>` + `--apply`）。

1. **同文件里存在多个同缩进的 `models:`**。web patch 中先命中的是 `commandcode-goat-anthropic` 的 models 块（仅 6 行），不是真正的 `commandcode-goat` 块。
2. **block 结束边界不能用「0 缩进的 `- id:`」**。实测：start = 1-based 701 `        models:`，buggy end = 1-based 1128 `- id: permission`（**跨 427 行**），sane end = 1-based 707 `      commandcode-goat:`（**6 行**）⇒ 多吞 421 行。正确的锚法（`efforts-diff.py` 里本来就对）是**先锚 6 空格的 provider key**。
3. **`(absent)` 的块绝对不能 append**。原本没有 `reasoningEfforts` 行的块，若把新行追加到块末尾，而块末尾恰是更深缩进的行（如 `input:` 下的 `- text`）⇒ 缩进回退 ⇒ 整个 YAML 结构错乱（报错 `bad indentation of a mapping entry`，行内容被截断成 `722 | ji`）。
   **最小且安全的切口：只做「已有 `reasoningEfforts` 行」的原地替换，`(absent)` 一律跳过。** 实测这样 `block` 数 = model 数（61），原先误算成 62。
4. **pyyaml 不能当 gate**。dsh patch **合法使用 `!!js` 标签**，pyyaml 直接报 `could not determine a constructor for the tag 'tag:yaml.org,2002:js'` —— 这是**误报**（回滚后的健康文件同样报）。
   **权威判据只有 `dsh --profile web --dump-config`**（exit=0 / stderr 0 B / rows=198）与 desktop 侧 `dump-desktop-config.ps1`（exit=0 / stderr 0 B / 86821 B）。

## 3. 安全的 apply 流程

1. 先 dry run：只输出 would-change 与 left-unknown，并核对 `blocks == model 数`。
2. 备份到 `cordis.patch.yml.bak-<ts>-pre-efforts-sync` 后再写；**apply 立即跟权威校验，失败即 restore**（本轮两次都是这样自动回滚，配置未受损）。
3. 回滚后确认：备份文件字节数回到原值（web 69475 B / desktop 68025 B）、`dump-config exit=0`、live web 进程仍在（pid 9972 / 1404）。
4. probe 可**部分确认即 apply**：`other`（上游 503）与 `absent` 按设计保持不变，未确认项不参与改写，因此不必等满 62 个。本次 55/62 确认时就 apply，尾部 7 个受 503 限速影响未测。

## 4. 验收判据（可复现命令）

- `dsh --profile web --dump-config` ⇒ exit=0 / stderr 0 B / rows=198
- `powershell ... dump-desktop-config.ps1` ⇒ exit=0 / stderr 0 B / 86821 B
- `efforts-diff.py` ⇒ 两侧集合相等、`identical 58 / DIFFERENT 3`
- `desktop-model-audit.py` ⇒ `not-in-allowlist 0 / duplicates 0`，web 61 = desktop 61
- 合成配置里确认主力 model 的档位，例如 web 第 194 行 `- id: deepseek/deepseek-v4.1-flash` 下 `reasoningEfforts: 'off'/low/...` 共 6 项。

## 5. 残留与后续

- 未确认 3 个（`meta/muse-spark-1.2`、`poolside/laguna-s-2.1-free`、`tencent/hy4-preview`）以及 `stealth/pixel-canary`（err_403）保持原样；上游恢复后重跑 probe 即可收敛。
- 生效路径：**web 侧开新会话即生效**（profile patch 参与 live reload）；**desktop 侧需重启 App**。
- 本轮同时被收掉的相邻 objective：desktop 死 model 清理（两侧集合相等、无死 id）。④ Linux gateway 补丁与 ⑤ 双机用量视图的 Linux 半部分因 `tianque` 网络不可达而阻塞，与本文无关。

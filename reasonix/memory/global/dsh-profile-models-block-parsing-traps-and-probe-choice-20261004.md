---
id: mem-a45476595959c62a5b6dba2f5e7d3514
revision: 1
created_at: "2026-10-04T15:04:05.714Z"
updated_at: "2026-10-04T15:04:05.714Z"
name: dsh-profile-models-block-parsing-traps-and-probe-choice-20261004
description: "dsh profile patch 的 models 块边界两个坑、!!js 让 pyyaml 误报、两个 probe 脚本的漏判差异与 throttle 风险"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 事实

`~/.dsh/profiles/<name>/cordis.patch.yml` 里 **`llm-pi-ai` 的 `providers` 有多个 provider 块**，
每个都有**同名缩进的 `models:` 行**：
- `      commandcode-goat-anthropic:`（6 空格）→ 其 `        models:`（8 空格）**只有 6 行**
- `      commandcode-goat:`（6 空格）→ 其 `        models:` 才是真正要改的 61 个 model

## 踩过的两个坑（我因此把两侧 patch 改坏两次）

1. **找 `        models:` 时命中了 anthropic 那个**（文件里第一个）—— 必须**先锚 `      commandcode-goat:`**。
2. **block 结束边界**：`models` 块内每行缩进 ≥10 空格（`          - id:`）。
   用「下一个 `- id: `（0 缩进）」当边界会**多吞 421 行**（`- id: permission` 在 1128 行，而正确边界是 707 行），
   后果是把整个 provider 配置当成 block 处理 ⇒ **YAML 结构崩坏**。
   正确写法：`end = 第一个非空且缩进 < 10 空格的行`。

## 权威判据只能是 `dsh --dump-config`

**不要用 pyyaml 当 gate**：patch 里合法使用 **`!!js`**（`tag:yaml.org,2002:js`）标签，
stock loader 会报 `could not determine a constructor for the tag 'tag:yaml.org,2002:js'` —— **这是误报**。
真判据：`DSH_HOME=~/.dsh dsh --profile web --dump-config` 的 **exit code**（坏配置 ⇒ exit=1 / rows=0）。
desktop 侧用 `~/.dsh/storages/tools/dump-desktop-config.ps1`。

## 另一个坑：`(absent)` 的 block 不能 append

若某 model block **原本没有 `reasoningEfforts` 行**，往 block 末尾 append 会**破坏缩进**
（有些 block 以更深缩进的子项结尾，如 `input:` 下的 `- text`）。
⇒ 只做**已有行的原地替换**；`(absent)` 一律跳过。

## probe 脚本选择（重要）

- **`probe-all-models.py` 有已知缺陷**：只看 `choices[0].message.reasoning_content`。
  **凡是用 `reasoning_details` 报思考的 model 全部被误判成无 reasoning**
  （`gpt-6-luna` / `gpt-5.6-*` / `google/gemini-*` / `xiaomi/mimo-*` / `deepseek-v4-pro` …）。
  **web profile 的 `reasoningEfforts` 就是基于它的 verdict 建的 ⇒ 大面积错标 `false`。**
- **`probe-reasoning-all.py` 两种字段都认**，verdict 词表：`levels_ok` / `no_reason` / `rejected` / `err_403` / `other`。
  它每 model **1 次请求**、支持断点续跑、每请求后落盘。62 个 model 在 3s spacing 下约 **3 分钟**。
- **gateway 有 throttle**：快速连打不同 model 会返回 403 `Authentication failed`（伪装成认证失败的限流），
  曾把两个 key 冻 **30 分钟**。`probe-all-models.py` 为此有「连续 3 次 throttle 即 abort」；
  `probe-reasoning-all.py` **没有**该防护 ⇒ 出现 503/`other` 时应当视为「未知」而**不要**当成结论。
- **probe 结果要放持久目录**（`~/.dsh/tmp-probe/`），放 `%TEMP%` 会被清掉（`all-models.json` 就这么丢的）。

## 工具

- `~/.dsh/storages/tools/sync-efforts-from-probe.py --probe <json> [--apply] [--restore]`
  用实测 verdict 重建**两侧**的 `reasoningEfforts`（只原地替换已有行；`--restore` 回滚）。
- `~/.dsh/storages/tools/desktop-model-audit.py` —— 两侧 model 集合 vs allowlist
- `~/.dsh/storages/tools/efforts-diff.py` —— 两侧 `reasoningEfforts` 差异清单

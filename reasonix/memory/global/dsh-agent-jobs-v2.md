---
id: mem-09ee98336c4d4e57d78ae09f3162c574
revision: 1
created_at: "2026-09-28T07:42:14.547Z"
updated_at: "2026-09-28T07:42:14.547Z"
name: dsh-agent-jobs-v2
description: "#4 agent_jobs 的真实交付：端到端证据 + 4 个修复 + 26 项 self-test 断言"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 位置与用法
`~/.dsh/storages/tools/agent-jobs.mjs` —— CSV in → 并行 `dsh headless` → CSV out。Codex `agent_jobs` 的本地等价物。

```
node agent-jobs.mjs --in tasks.csv --out results.csv [--col 列名] [--template '{a} {b}'] \
  [--schema s.json] [--profile headless] [--concurrency 3] [--timeout-ms 900000] [--retries N] \
  [--keep-cols a,b] [--dry-run] [--self-test]
```

- 任务经 **stdin** 传给 `dsh --profile <p> -`（不经命令行 → 无注入/转义问题）。
- 输出：普通模式 `原列 + result + status + ms`；`--schema` 模式 `原列 + <每个 property> + _valid + _errors + _raw + ms`。
- 依赖：`dsh` 在 PATH；headless profile 的 `llm-pi-ai` provider 从 `~/.dsh/.env` 读 `COMMANDCODE_API_KEY`（**不需要**调用方环境里有这个变量）；GOAT 网关 `127.0.0.1:8788` 在监听。

## 2026-09-28 的真实端到端证据（此前**零证据**，只有脚本）
- 冒烟：`--self-test` → **26 项确定性断言全绿**，不需要模型。
- 普通模式：2 行 CSV，2/2 `ok`，8.4s，`result=OK` / `DONE`。
- schema 模式正例：情绪分类 2/2 `_valid=true`，`sentiment=positive/negative`、`confidence=0.98/0.96`，**语义正确**。
- 样例文件：`agent-jobs.example.csv`、`agent-jobs.example-schema.json`、`agent-jobs.example.out.csv`。

## 本轮修掉的四个问题
1. **`--col` 缺省取第一列 = 静默发错任务**。用 `id,task,lang` 的 CSV 实测 dry-run 打出 `[0] 1` / `[1] 2` —— 把行号当任务发出去，还照样烧 token。现改为：多列 CSV 且未给 `--col`/`--template` 时**直接报错**并给出建议命令。
2. **schema 模式丢弃原始输出** → `_valid=false` 时完全不知道模型输出了什么。新增 `_raw` 列（截断 2000 字符）。
3. **静默忽略不支持的 schema 约束 = 假校验**。校验器只实现 `type` / `required` / `properties` / `items`；`enum` / `additionalProperties` / `minimum` / `pattern` 等**一律不生效**。现运行时显式打警告并列出关键字。`self-test` 里也专门断言"这些确实不生效"，防止以后误以为它们在保护。
4. **TDZ 陷阱**：`const SUPPORTED_SCHEMA_KEYS` 放在文件末尾，而 self-test 短路在模块顶部执行 → `Cannot access before initialization`。常量必须定义在使用点之前（`function` 声明会 hoist，`const` 不会）。

## 方法论教训（重要）
**不要靠 LLM 配合来构造负例。** 实测：故意让 schema 的 `required` 含一个 `properties` 里未声明的键，模型照样补了一个字符串值满足它（`_valid` 仍是 true）；让它"只回复 NOPE"，它反而按 schema 吐了 JSON。模型总会满足任何**可满足**的 schema，所以负例必须在**解析/校验层**用确定性断言构造 —— 这就是 `--self-test` 存在的原因。

## 回滚
`agent-jobs.mjs.bak-20260928-1600-pre-col-guard`。

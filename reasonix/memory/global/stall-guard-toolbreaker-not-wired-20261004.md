---
id: mem-acac03c276125414f7c3ce71cecb69a5
revision: 2
created_at: "2026-10-04T03:33:01.836Z"
updated_at: "2026-10-04T03:41:57.693Z"
name: stall-guard-toolbreaker-not-wired-20261004
description: "stall-guard 熔断机制真根因（isError 抓不到命令失败）+ 端到端验证通道 + session 落盘结构修正"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 结论（2026-10-04 实测闭环）
stall-guard 的 toolBreaker（step 级工具失败熔断）已在 headless + `--patch` overlay 上端到端验证通过：`seen#1..3 failed=true` → `BREAKER armed` → `BREAKER fired` → durable 落盘 `user/message` with `source.kind="stall-guard"`。

## 真根因（此前两次误判）
**`result.isError === true` 在 dsh 里永远抓不到「命令失败」。**
- `%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-tool-pwsh\lib\index.js:128-135` 注释逐字：「Non-zero exits are reported, not errored — the model decides how to react; only infrastructure failures (spawn errors, aborts) surface as isError results.」
- `dsh-tool-bash/lib/index.js:141-143` 同款；`:167` 与 `dsh-tool-pwsh/lib/index.js:172` 逐字 `else if (result.exitCode !== 0) markers.push(\`[exit code: ${result.exitCode}]\`);`
- ⇒ 必须读**模型可见文本**里的 marker。修法 = `FAILURE_MARKERS` 正则表 + `resultText(result)` 拼 `result.content[].text` + `failedOf(result)`。

## 两个次要但真实的坑
1. **`exec.agent` 是可选字段**：`dsh-tools/lib/types/index.d.ts:228-229` 逐字「/** The agent on whose behalf the call runs (set by the agent loop). */ readonly agent?: Agent;」。且 `dsh-tools/lib/types/index.d.ts:282 export interface ToolExecution extends ToolExecutionInput` 只加 `rootCallId` / `token` ⇒ **exec 上没有顶层 `session`**。加固 = `breakerKeyOf(exec)`（先 `sessionIdOf`，退化时返回 agent 对象本身作 Map key）+ `breakerLabelOf(key)`（日志可读化，否则打 `[object Object]`）。
2. **pre-step 与 post-execute 必须用同一个 key**：pre-step 原用 `sessionIdOf(agent)`（恒返回 string），post-execute 用 `breakerKeyOf(exec)`（退化时返回对象）⇒ 退化路径永不 fired。已统一为 `breakerKeyOf({ agent })`。
3. `apply()` 里 `installStallGuard` + `installToolBreaker` 包在同一个 try/catch，前者抛错会**静默吞掉后者**（catch 只 `console.error`）。

## 验证通道（通用、可复用、不重启生产）
- overlay 文件：`- insert: [- id: stall-guard, name: <abs path>/stall-guard.mjs]`，用 `--patch <file>` 挂到 `headless` profile 跑真任务。
- `node "%APPDATA%/npm/node_modules/@deepseek-ai/dsh/lib/bin.js" --profile headless --patch <overlay.yml> --dump-config` 可先确认挂载（输出末段出现 `# == <overlay path>` + `name: file:///…`）。
- 任务 prompt：让 agent 连续 3 次跑 `echo breaker-probe; exit 1`。
- 判据：`~/.dsh/logs/stall-guard.log` 出现 `BREAKER seen#N … failed=true agent=ok sid=<非 null>` / `BREAKER armed` / `BREAKER fired`。
- 生产生效需重启进程（`.agent-presets/**/*.mjs` 不参与 `patchReload: live`）。

## session 落盘结构修正（重要）
- `user/message` 事件：**`event.data` 就是 message 本体**（`{id, role, content, source}`）—— 不是 `data.message`。
- `assistant/message` 事件才是 `event.data = {turn, step, message, usage, stream}`。
- 读 durable 注入用 `event.data.source.kind`，别用 `event.data.message.source.kind`。

## 产物
- `~/.dsh/.agent-presets/anchored-standard/stall-guard.mjs`（394 行；备份 `.bak-20261004-pre-breaker-instrument`）
- `~/.dsh/storages/tools/test-stall-guard-breaker.mjs`（31 passed / 0 failed）
- `C:/Users/27063/AppData/Local/Temp/sg-overlay.yml`

## 教训
此前报的「35 项单测通过 + web 3080 已生效」只证明了**纯逻辑**与**模块加载**，没证明**接线**（事件是否真送达 listener）。单测 mock ctx 时**必须同时 mock `on` 和 `effect`**，否则 `installStallGuard` 先抛、被 apply 的 try/catch 吞掉、`installToolBreaker` 永不执行。且 stall-guard 注册了**两个** `agent/pre-step`，测试里要取 `.at(-1)` 才是 breaker。

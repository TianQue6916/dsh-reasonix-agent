---
id: mem-86239e5b8374f26f1cf4a4ff173a784c
revision: 1
created_at: "2026-09-28T05:18:08.821Z"
updated_at: "2026-09-28T05:18:08.821Z"
name: computer-use-l2-isolation-verified
description: "#7 computer-use 的 L2 隔离验证：NODE_OPTIONS 崩 pnpm、plugin add 不进 bundles、勿跑 selftest、22 个工具清单"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# #7 computer-use：L2 隔离验证（2026-09-28）

## 做了什么

按 subagent 方案在**独立 DSH_HOME** 里装 `dsh-computer-use-win`，全程不碰生产 3080 / `profiles/web`。

```
DSH_HOME = C:/Users/27063/.dsh-lab
profile  = cu-lab（dsh --profile cu-lab --from-default-profile web --dump-config 初始化）
deps     = dsh-computer-use-win ^0.2.2
bundles  = [@deepseek-ai/dsh-base, @deepseek-ai/dsh-web-app, @deepseek-ai/dsh-headless]
```
生产 `profiles/web/package.json` mtime 全程未变（00:44），只有我主动改的 `cordis.patch.yml`（13:04，remoteAccess）动过。

## 发现 1（重要，我引入的副作用）：`NODE_OPTIONS=--use-system-ca` 会让 pnpm 崩溃

| 条件 | `pnpm add` 结果 |
|---|---|
| 带 `NODE_OPTIONS=--use-system-ca` | **exit `3221226505` = `0xC0000409` = `STATUS_STACK_BUFFER_OVERRUN`** ❌ |
| 不带 | `Done in 1.2s`，exit 0 ✅ |

**后果**：我曾为修"手打 `dsh web` 的 fetch failed"把这个 flag **提升为 user 级环境变量** —— 那等于
**让以后所有 `dsh plugin add` 都会崩**（其内部就是 pnpm）。
→ **已撤销 user 级设置**。`--use-system-ca` 只应存在于 `launch-dsh.ps1` 的局部 `$env:`。

**待解决**：手打 `dsh web` 的 `fetch failed` 需要一个**不碰 NODE_OPTIONS** 的方案
（候选：`NODE_EXTRA_CA_CERTS` 指向从 dev-sidecar 导出的根 CA 文件）。

## 发现 2：`dsh plugin add` 不保证把包注入 bundles

`dsh-computer-use-win` 的 package.json **有** `dsh: { bundle: { patch: './cordis.patch.yml' } }`，
但 `dsh plugin --profile cu-lab add` 跑完后 **deps 变了、bundles 没变**。
→ 它自带的那份 `cordis.patch.yml` 才是真正的接入方式，**直接复制成 profile 的 patch 层**（已这么做）。

它的接入写法值得借鉴（无硬编码路径）：
```yaml
- insert:
    - id: mcp-dsh-computer-use-win
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: wincu
        transport: stdio
        command: !!js process.execPath
        args:
          - !!js "process.getBuiltinModule('node:module').createRequire(new URL('package.json', baseUrl)).resolve('dsh-computer-use-win/mcp/server.mjs')"
        toolCallTimeoutMs: 60000
        failOnStartupError: false     # ← 起不来会【静默降级】，验收时必须检查工具是否真出现
```
`baseUrl` 是 **profile 目录**（不是包目录），所以按包名 createRequire 解析 → 任何 `$DSH_HOME` 都能用。

## 发现 3：不要跑它的 selftest

README：`node mcp/server.mjs --self-test` = **全栈自检，含 Notepad E2E** → **会真的动鼠标键盘**。
**不能拿用户桌面做实验。** 改用自写探针 `~/.dsh/storages/tools/probe-mcp-tools.mjs`：
只做 MCP `initialize` + `tools/list`，**不发送任何输入**。

## 验证证据（三层）

1. **配置层**：`dsh --profile cu-lab --dump-config` 第 1248 行出现 `mcp-dsh-computer-use-win`，
   来源标注 `C:\Users\27063\.dsh-lab\profiles\cu-lab\cordis.patch.yml`；层级里**没有生产 `.dsh` 的 patch** ✅
2. **MCP server 运行时**：探针握手成功，`serverInfo = {name: 'windows-computer-use', version: '0.2.2'}` ✅
3. **工具面：22 个**（subagent 报告里"12 个受控工具"偏低）
   - 只读 7：`health` / `snapshot` / `accessibility_tree` / `list_windows` / `find` / `element_info` / `ocr`
   - **输入类 8**：`click` / `double_click` / `move` / `drag` / `scroll` / `type_text` / `keypress` / `move_window`
   - 其余：`wait` / `wait_for` / `invoke` / `set_value` / `focus` / `activate_window` / `close_window`

## 尚未完成

- **dsh 内端到端**（真在会话里调用 `mcp__wincu__*`）：cu-lab 含 `dsh-web-app`，CLI 拒绝任务参数
  （`error: too many arguments`）→ 走 headless 要单独 profile，走 web 要人在 3180 浏览器点。
- **#6 remote_control 未装**：`ds-harness-remote` 默认 `serverUrl: https://dsh.r2049.cn`（维护者托管中继），
  需先决定自建 `apps/server` 还是用默认。
- **L3 未做**（独立 Windows 用户账号 / VM）—— 这是 computer-use 唯一真正的隔离层；
  DSH 的 sandbox 管不住插件自己 spawn 的进程，也管不住"以你的身份注入鼠标键盘"。

## 回滚

`rm -rf C:/Users/27063/.dsh-lab`（生产零影响）；cu-lab 四个配置各有 `.bak-20260928130740`。

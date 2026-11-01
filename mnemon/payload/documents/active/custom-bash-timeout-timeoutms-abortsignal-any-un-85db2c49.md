---
id: "85db2c49-dd80-4157-8e6c-160df380273e"
title: "custom-bash 工具 timeout 参数落地：timeoutMs 只定义未使用的根因、AbortSignal.any 修法与 unref 陷阱（2026-10-29）"
description: "实测取证 + 修复记录：`~/.dsh/.agent-presets/anchored-standard/custom-bash.mjs` 的 `timeoutMs` 仅被读入变量从未使用（等于历史上从未有超时），修法为 schema 增 `timeout`（秒）+ AbortController/AbortSignal.any 合并 exec signal 并夹紧到 config 上限，含 4 条 mock 单元测试结果与「不要 timer.unref()」陷阱；同时记录 cache 报告 95.9% hit 否决了 mnemon 分层改造的前提。修正文档 c495f84f 中「吃 120s 硬默认」的结论。"
status: "active"
created_at: "2026-10-28T19:42:25.514Z"
updated_at: "2026-10-28T19:42:25.514Z"
content_hash: "73ca2a3d0ab8eb9bf6b2f981b8d23435b4402edfc0c4a01206d9c90e717d3f8b"
source_paths:
  - ".dsh/.agent-presets/anchored-standard/custom-bash.mjs"
  - ".dsh/.agent-presets/anchored-standard/concurrency-discipline.mjs"
session_ids:
  - "25b64d04-9198-4386-b55f-9020a2200cb9"
memory_body_ids:
  []
---

# custom-bash 的 timeout 参数：从「假超时」到工具层硬保证

本机 Windows（`C:\Users\27063`，Git Bash）实机取证与修复，2026-10-29。调优对象是
`~/.dsh/.agent-presets/anchored-standard/custom-bash.mjs`（模型-facing `bash` 工具）。

**本文修正文档 `c495f84f` 的结论**：那里判定「config 未设 `timeoutMs`，所以吃
`DEFAULT_TIMEOUT_MS = 120000`」。实际更糟——`timeoutMs` **从来没有生效过**。

## 根因：只定义，未使用

```js
122:  const timeoutMs = Number.isSafeInteger(config?.timeoutMs) && config.timeoutMs > 0
                          ? config.timeoutMs : DEFAULT_TIMEOUT_MS
// 之后全文再无 timeoutMs 的任何引用
```

`execute()` 里只有 `ctx.subprocess.spawn({ ..., graceMs: 3000 })` —— `graceMs` 是
**中止后的宽限期**，不是超时。因此在修复前：

- `bash` 工具**没有任何超时机制**，命令可以无限挂住；
- 一度以为的「模型忘了手写 `timeout N` 前缀」其实是**唯一**的防线，而且纯靠自觉；
- 配置里写的 `timeoutMs: 300000` 是死配置（约一年的 bug）。

## 修法：把超时做成工具参数，而不是提示词纪律

1. **schema 增 `timeout`（单位：秒）**，与 `command`/`workdir` 并列，
   `additionalProperties: false`；修好后 `properties = ["command","workdir","timeout"]`。
2. **`execute()` 用 `AbortController` + `AbortSignal.any` 合并宿主 signal**：

```js
const requestedMs = typeof args.timeout === 'number' && args.timeout > 0 ? args.timeout * 1000 : timeoutMs
const limitMs = Math.min(requestedMs, timeoutMs)         // 用户值夹紧到插件上限
const timeoutController = new AbortController()
const timer = setTimeout(() => { timedOut = true; timeoutController.abort() }, limitMs)
const effectiveSignal = signal !== undefined
  ? AbortSignal.any([signal, timeoutController.signal])
  : timeoutController.signal
```

关键点：**用 `AbortSignal.any` 合并而不是覆盖**，否则会丢掉宿主的取消能力；
`limitMs` 取 `min` 保证上限（现配 `timeoutMs: 300000`）不可能被参数绕过；
超时时提交的错误文本形如 `bash timed out after 1000ms — aborted: <cmd>`，让模型能区分
「命令失败」与「被超时掐断」。

## 陷阱：不要 `timer.unref()`

第一版加了 `timer.unref()`（动机是「别让定时器阻止进程退出」），单元测试立刻
**unsettled top-level await** 卡死。原因：`unref()` 后事件循环一空 Node 就退出，
**定时器永远不触发**，超时形同虚设；在真实环境（等一个挂住的命令、事件循环恰好空）
同样可能静默失效。

结论：**不 `unref()`**，代价是必须保证每条路径 `clearTimeout`（正常路径 + 两个 catch
分支都已清理）。源码里已留注释说明此事。

## 单元测试证据（mock ctx，不启 dsh）

```
① 无 timeout（config=1000ms）  : 1015ms -> bash timed out after 1000ms — aborted: sleep 999
   spawn 拿到的 signal 类型    : AbortSignal
② timeout=0.3s                 :  305ms -> bash timed out after 300ms
③ timeout=99s（应被夹到 1s）    : 1002ms -> bash timed out after 1000ms
④ schema properties            : ["command","workdir","timeout"], additionalProperties=false
```

## 生效边界与用法约定

- 改 `.mjs` 属于 preset 层，**已存在的会话不生效，需开新会话**（重启不解决）。
- 用法从「手写 `timeout 30 dsh --dump-config`」改为参数：
  `{"command": "dsh --dump-config", "timeout": 30}`、`{"command": "pnpm install", "timeout": 180}`。
  参数是**工具层硬保证**，前缀依赖每次记得写。
- 取值经验：N ≈ 预期耗时 × 3；**不要给 5 秒**，会误杀正常慢命令；纯读文件 / grep / 短命令
  不传，走 300s 兜底。
- `concurrency-discipline` 的 TEXT 已同步改成「传 `timeout` 参数」，同样需新会话生效。

## 副产品：cache 数据否决了一条结构改造

同期 `acp_cache` 报告（530 requests）：total cached 190.97M / total input 199.05M = **hit 95.9%
HEALTHY**；miss 8.08M 中 7.08M 是 provider 侧 TTL/eviction，compress re-pay 仅 7 tok。

据此**否决**了社区经验（`@q-code-cli/q-code` 的「超长 AGENTS.md 分层瘦身」）推得的改造假设：
`USER.md`(3.5K) + `MEMORY.md`(9.3K) 虽每步全量注入，但内容稳定 → 属于**稳定前缀**，照样命中，
不构成 cache 前缀失效。**mnemon 分层改造因此不做**（收益为零）。这条值得记住的方法论：
社区最佳实践要用本机 cache 命中率验证，不能直接照搬。

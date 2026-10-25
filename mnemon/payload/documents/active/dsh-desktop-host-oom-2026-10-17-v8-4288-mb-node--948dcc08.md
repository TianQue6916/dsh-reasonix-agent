---
id: "948dcc08-b575-4d2c-945c-f1f794c5e6d7"
title: "dsh desktop host OOM 崩溃根因（2026-10-17）：V8 默认堆上限 4288 MB 而非物理内存，修法 NODE_OPTIONS=--max-old-space-size=8192"
description: "2026-10-17 dsh desktop host 进程 OOM 崩溃（exit 134 / heap 3942 MB）取证与修法：瓶颈是 V8 默认老生代堆上限 4288 MB（机器 31.7 GB RAM 空 21.6 GB），用户级 NODE_OPTIONS=--max-old-space-size=8192 修复且重启后无新 crash；同时逐字修正 billion-context 的 takeover gate 语义（只拒「接管」，不拦请求），并记录侧边/分支对话无法 /compact 的设计原因。修正 628e53eb 的 attribution 门判断。"
status: "active"
created_at: "2026-10-17T15:16:03.091Z"
updated_at: "2026-10-17T15:16:03.091Z"
content_hash: "f61309033e7ab2536602596d6ab24fa496285b4db8a0ab52063f54b9930e599d"
source_paths:
  - "profiles/desktop/node_modules/billion-context/dist/agent/dsh-native.js"
  - "profiles/desktop/cordis.patch.yml"
  - "profiles/desktop/node_modules/@deepseek-ai/dsh-compaction-basic/lib/index.js"
session_ids:
  - "fdd3c38c-cb34-4aac-974d-73ec1860e9bc"
memory_body_ids:
  []
---

# dsh desktop host OOM 崩溃根因与修法（2026-10-17）

承接并**修正**文档 `628e53eb-1b71-4d59-9e76-97d471ea965f`（其结论「bili 的 attribution/takeover gate 挡住 /compact」在本日被证伪）；`/compact` 失败链本身见该文档，本文只记新增证据。

## 一、症状与误判

App 在使用中崩掉。用户初判为「卡死」「侧边对话无效/分支对话不能压缩」并要求「不用回滚」。实际是 host 进程 **OOM abort**，不是卡死。

## 二、crash log 逐字证据

文件：`crash-2026-10-17T15-00-26-579Z-host.log`（新版覆盖式，目录里最新一条）。

```
time: 2026-10-17T15:00:26.579Z
source: host
phase: running
app: @deepseek-ai/dsh-desktop 0.2.0-rc.2
platform: win32 x64   electron: 44.0.0   node: 24.18.1
shell pid: 5856

--- error ---
Error: dsh desktop host exited with 134: ...
[9276:00007C50004C4000] 2539903 ms: Scavenge (during sweeping) 3886.8 (3940.9) -> 3887.2 (3942.2) MB, pooled: 93.8 MB, allocation failure
FATAL ERROR: MarkCompactCollector: young object promotion failed Allocation failed - JavaScript heap out of memory
----- Native stack trace -----
```

同段还夹带无关噪声：`native-attach: drop http://127.0.0.1:18787 (pid 28896): owner process gone`、`[local-search] wiki source failed: fetch failed`、`fallback provider "multi-search" is not registered or unusable`。

`exited with 134` = SIGABRT（V8 主动中止）。

## 三、根因：V8 堆上限，不是物理内存

实测机器余量充足，排除物理内存：

```
TotalRAM_GB          = 31.7
FreeRAM_GB           = 21.6
CommitLimit / Free   = 36.7 / 19.7
```

实测 Node 默认上限：

```
node v24.15.0                        -> heapLimitMB 4288
node --max-old-space-size=8192 ...   -> heapLimitMB 8384
```

崩溃点 3886/3942 MB ≈ 默认 4288 MB 上限。**⇒ 瓶颈是默认老生代堆上限（约 4 GB），不是 31.7 GB 物理内存。**

相关规模数据：该会话 `session.v4.jsonl.zstd` = **41,528,143 bytes（41.5 MB 压缩态**，解压后数百 MB）；同目录另有 `session.v4.jsonl.zstd.bak-20260929-020127-pre-id-backfill`、`session.v4.jsonl.zstd.bak-20260929-pre-id-fix`、`session.v4.jsonl.zstd.broken-20260929-022322`。host 要同时扛 event log + 全部 projection + 插件状态 ⇒ **会话越长堆越紧，8 GB 也终会撞；`/compact` 是这个会话的泄压阀，它不修好 OOM 会复发。**

## 四、修法（已生效，未回滚任何 bili 配置）

用户级环境变量（无需管理员权限，未弹 UAC）：

```
USER NODE_OPTIONS = [--max-old-space-size=8192]
```

重启 App 后验收：

```
crash log 最新仍是 crash-2026-10-17T15-00-26-579Z-host.log（无新 crash）
App 进程 29208 / 27728 / 28924  起于 23:01:04–05
端口   8788 listen=1 · 18787 listen=1 · 11434 listen=1
bili   0.1.197  stale False
```

用户确认只重启、**未禁用第三方插件**（禁用会连 bili 一起关掉，丢失 cache 优化）。

## 五、修正：`takeover gate refused` 不是拦截器

来源是在 **in-process 那一半**（不是 proxy 那一半）：`profiles/desktop/node_modules/billion-context/dist/agent/dsh-native.js`，偏移约 2292799（文件 2,303,539 bytes）。

```js
const refuse = (url, attr) => {
  const key = gateKeyOf(url);
  ...
  const reason = attr.state === "threw"
    ? `currentInitiator() threw (${attr.message}) — agent scope disposed/closing mid-request?`
    : attr.state === "none" && attr.initiatorPresent
      ? "initiator present but missing session id"
      : "no active initiator attribution (agentless/background lane, third-party in-process caller, or stale attribution after host resume?)";
  const line = `bili-native-dsh: model request sent DIRECT (uncompressed) — takeover gate refused ${key}: ${reason} — refusals so far: ${count}${suffix}`;
  persistClientEvent(line);
  return false;   // 只是「不接管」，不是「不放行」
};
```

日志措辞 `model request sent DIRECT (uncompressed)` + `return false` ⇒ **请求照常发出，只是不经过 bili 的压缩通道。** 它不决定请求能否通过。

bili 里真正会拦的只有一处：`[passthrough] dsh native compaction call identified … — REFUSED, not forwarded`，而 10-17 起已变为：

```
10-17 14:22:55Z  [debug] passthrough: POST <unparseable-url> — unattributed in-process caller (#1117), relaying verbatim
```

**⇒ 到本 checkpoint 为止，bili 的两处拦截（`allowDshCompaction` 拒绝 + attribution gate）都已排除；失败点只剩 dsh 侧。**

## 六、诊断事实：`/compact` 连第一步都没写

三个当前活跃 session 解压扫描后的 `compaction/*` 事件数：

```
session-a0d5fbf8-0fb1-419e-9baf-d9   mtime 10-17 22:39   events=0
session-cb03454a-4703-4718-884e-50   mtime 10-17 22:23   events=0
session-81076132-69dc-4447-869a-55   mtime 10-17 22:23   events=0
（全库 total sessions: 1171；同 session 目录内任何文件的 compaction 字符串匹配也为空；
  projcache 行只有 ['version','record'] / 空 rows）
```

源码里 `session.append("compaction/start", …)` 位于 `try` **之前**的第一行 ⇒ 只要进入 `compactRegion` 必然留痕。**⇒ 请求未走到 `compactRegion`；错误文案里「recorded in the session log」所指的那条记录不存在。**

用户可见文案对应 `dsh-compaction-basic/lib/index.js` @26357 的兜底分支：

```js
function throwManualFailure(failure) {
  if (failure.stage === "commit") throw new ManualCompactionError("commit", …);
  if (failure.error instanceof SurfaceChangedError) throw new ManualCompactionError("changed", …);
  throw new ManualCompactionError("summary", "manual compaction could not produce a smaller summary", { cause: failure.error });
}
```

⇒ 即「summary 阶段抛了任意异常，且既不是 commit 也不是 changed」。

`billion-context` 插件未在 desktop patch 中出现（`grep billion-context` 无命中）；desktop patch 里两个 provider 的 baseURL 均为 `http://127.0.0.1:8788/v1`（**不存在 18787**），故「把 baseURL 改成直连 8788」的分治验证在此 profile 上无对象可改。

## 七、侧边/分支对话为什么不能 `/compact`

**设计如此，不是故障**：侧边对话是继承当前上下文开出的独立 Tab，它**没有自己的 session event log**；而 dsh 的 `/compact` 操作的是 session 的 history ⇒ 在侧边/分支里没有可操作对象。**要压只能回主会话压。**

## 八、仍开放

1. 新开一个**全新会话**后点一次 `/compact`，用于区分「旧 session 携带 10-16 之前旧状态（`compaction-basic auto:false`、pruner 阈值、plan-anchor 都要求新 session 生效）」与「dsh 侧独立缺陷」。
2. 若新会话仍失败 ⇒ 查 `compactRegion` 的前置检查（selection / assertStable / summarizeCompaction 的输入构造）。
3. 重启后需继续观察 8 GB 上限是否会再次被长会话撞穿。

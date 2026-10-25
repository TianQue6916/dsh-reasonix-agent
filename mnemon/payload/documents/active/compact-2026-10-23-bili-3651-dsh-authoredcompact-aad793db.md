---
id: "aad793db-0067-4db5-8256-6733debbde7b"
title: "/compact 真正可用的条件（2026-10-23 定案）：bili #3651 后只看 dsh.authoredCompaction + 会话必须先有 active block，用 compress 工具点亮分支 A"
description: "bili(billion-context) 0.1.204 下 dsh /compact 与 compress 的兼容方案：wire 层两条分支（有 active block → 本地伪造 compaction 响应；无 block → 422），实测 6 会话 blocks=0 导致永远 422；解法是先用 compress 工具压出一块再点 /compact；同时记录 allowDshCompaction 已被 #3651 删除、dsh 仅有 /compact /feedback /goal 三个 slash 命令。承接并修正 0bb2e36f / 3912c06c / 628e53eb。"
status: "active"
created_at: "2026-10-23T04:14:57.794Z"
updated_at: "2026-10-23T04:14:57.794Z"
content_hash: "7ca309cf539876f1ff8efd8c6069c21934a59aac474cb9f43f61cf2e4124067f"
source_paths:
  - ".config/billion-context/billion-context.json"
  - "host-stdio.log"
session_ids:
  - "6109247e-f93d-4511-a4c4-0abb4352f499"
memory_body_ids:
  []
---

# /compact 真正可用的条件：先有 block，再点 /compact

**日期**：2026-10-23
**环境**：bili = billion-context **0.1.204**（c87185a0），acp-proxy 端口 18787；dsh 0.2.1-rc.2；contextWindow **868928**
**承接**（并修正其前提）：`0bb2e36f-ef0d-4ea1-b110-bc7f0e68eed8`、`3912c06c-b67c-42a0-bf41-3b3ad3142d42`、`628e53eb-1b71-4d59-9e76-97d471ea965f`

## 背景问题

用户要求 **bili 的压缩与 dsh 的 `/compact` 必须同时生效**，且 UI 里根本找不到 `/compress` 命令。

## 结论一：`allowDshCompaction` 这个键已经不存在了

#3651 → PR #3672 起，bili **无条件拒绝对 dsh 原生压缩的放行**，配置面收敛为唯一存活键 `dsh.authoredCompaction`（默认 **true**，env `BILI_DSH_AUTHORED_COMPACTION=0` 可关）。

- 遗留的 `dsh.allowDshCompaction` / `BILI_ALLOW_DSH_COMPACTION` 会被**忽略**，只刷一次弃用 warn：
  `[acp-config] ... was removed (#3651, superseding #2028) — dsh native compaction is now refused unconditionally by the wire guard on every lane.`
- 因此旧文档里「把 allowDshCompaction 设为 true 就放行」的修法在 0.1.204 上**已失效**，该键应从 `billion-context.json` 删除（留着只是噪声）。

## 结论二：wire 层其实是两条分支，不是无脑拒绝

bili 收到 dsh 的 compaction 调用时：

```js
if (isDshCompactionCall(protocol, parsed)) {
  const authored = dshAuthoredCompactionEnabled() && session.state.blocks.some(b => b.active)
      ? buildDshCompactionForgeBody(...)   // 分支 A：本地伪造响应
      : null;
  if (authored !== null) {
      // ANSWERED LOCALLY —— 不调 LLM、不花钱、秒回；dsh 记一个带 tag 的 checkpoint，
      // 原始历史仍可通过 CCR/export 恢复
  } else {
      // 422 dsh_compaction_refused → dsh 侧报 "Compaction could not produce a useful summary"
  }
}
```

**关键判定量是 `session.state.blocks.some(active)`**，与是否放行 dsh 原生压缩无关。

## 结论三：这台机器上分支 A 从未被激活过

`/__bili/sessions` 实测（重启前后一致）：

```
session-992f3685  ctx=619538  win=868928  71.3%  blocks=0  saved=0  reqs=210
session-9cf09938  ctx=1745422 win=868928 200.9%  blocks=0  saved=0  reqs=626
其余 4 个会话                              blocks=0  saved=0
```

`blocks=0 / tokensSaved=0` 是硬证据：**bili 自己的 fold 一次都没成功**。同时 `host-stdio.log`（11.3 MB）里 `[preflight]` / `tier-distillation` / `summary call` / `distill` / `fold` / `compress` **全部 0 次**——它的摘要后端（`summarizeRange` → distillation summary call）从未发起。所以 `/compact` 不是坏了，是**前置条件从来没有被满足**。

## 结论四：dsh 没有 `/compress`，只有三个 slash 命令

asar 内 `dsh-command-*` 包只有三个：

| 命令 | 用途 |
|---|---|
| `/compact` | 压缩上下文（唯一压缩入口） |
| `/feedback` | 反馈 |
| `/goal` | 目标 |

「压缩」在 dsh 侧因此只有 `/compact` 一条路；`compress` 是**工具**（tool），不是 slash 命令。

## 解法（用户要求的「两者兼容」）

```
1. acp_status                      # 看可压缩 range
2. compress（工具，摘要由 agent 自己写）  # 压掉已完成的历史
3. bili 侧 blocks ≥ 1              # 分支 A 激活，且不依赖 bili 的摘要后端
4. 用户点 /compact                 # bili 用等价快照瞬时应答，不再 422
```

实测执行结果（同一会话）：

```
compress m00001–m01298（1298 msgs, 504.6K） → 1 block, ~522276 tokens saved
压前 619538 tok / 71.3% / blocks=0
压后  45831 tok /  5.3% / blocks=1 / saved=522276
```

## 配套配置改动（`.config/billion-context/billion-context.json`）

| 项 | 改动 | 理由 |
|---|---|---|
| `compress.maxContextLimit` | `70%` → `50%`（868928×0.5 = **434464 tok**） | 比原来的 ~608k 更早介入，避免逼近爆窗 |
| `compress.injectNudge` | `false`（沿用） | 避免每 turn 注入 nudge 打破 prompt cache |
| `dsh.allowDshCompaction` | 删除 | #3651 已移除，留着只刷 warn |

`compress` 段是 bili **启动快照**，改完必须重启 bili 才生效；`/__bili/config` 可确认读到的值（重启后确认 `maxContextLimit: "50%"`，端口 18787 UP）。

## 操作事实与坑

- **kill bili 不会自动重启**；重启后各 session 的 `blocks/saved` 是新的内存态（磁盘上的 block 仍存在，但计数归零需注意别误判）。
- 用 Python 在 bash 里拼 `python -c "..."`、内联单引号会触发 `SyntaxError: unexpected character after line continuation character`；JSON 为空时 `json.load` 报 `Expecting value: line 1 column 1`。取数建议写临时脚本或用 `jq` 风格处理，别硬塞进 `-c`。
- bili 管理端点存在 `/__bili/plugin/compact`（POST），说明插件侧还有一条 compact 上报通道，与 tool 的 `compress` 是两条不同路径。

## 仍未验证

50% 阈值下 bili 的**自动 fold** 能否自行成功（日志显示其摘要调用零痕迹）。若它持续不动，全自动压缩始终不可用，「手动 compress 工具 + /compact」是唯一可靠链路。

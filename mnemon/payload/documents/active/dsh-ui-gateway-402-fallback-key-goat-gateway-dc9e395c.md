---
id: "dc9e395c-e5f8-4fce-9f80-e8ac6435a930"
title: "dsh UI「额度已用尽」误报归因：gateway 402 透传 + 欠费 fallback key（goat-gateway 三角诊断）"
description: "2026-10-07 调查：界面报「当前请求的额度已用尽」但主 key qq 额度充足。记录三层拼装链（client.js 文案 → dsh-llm QUOTA 码 → gateway 402 透传）、真实因果链（qq 被 503 Error 1102/ECONNRESET 打挂 → failover 到余额为负的 deepseek-official → 402 Insufficient Balance）、双方当日量化证据、禁用兜底 key 的修复脚本与提权流程、以及 pathAllowed 副作用分析。设计背景见 goat-gateway 其他文档。"
status: "active"
created_at: "2026-10-07T12:06:21.636Z"
updated_at: "2026-10-07T12:06:21.636Z"
content_hash: "8c5d0d4be9e6d121960bd20294e862be559cf7f44a3e6920acf4f6814fa77e99"
source_paths:
  - "keys.json"
  - "logs/gateway-2026-10-07.log"
session_ids:
  - "b92e7c91-2d2c-4a1c-8f4a-436591516ba1"
memory_body_ids:
  []
---

# dsh UI「额度已用尽」误报归因（2026-10-07 19:49–19:54）

## 触发症状

桌面端 dsh 界面弹出「本轮运行失败 / 当前请求的额度已用尽」，但主 key `qq` 的 5 小时用量只有 `0.53/14`（约 4%）——症状与数据自相矛盾，这个矛盾本身就是入手点。

## 一、这句话由三层拼出来

**① 文案层** —— `C:/Users/27063/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js`

```js
"message.turnError": "本轮运行失败",
"message.failure.quota": "当前请求的额度已用尽",
```

拼接函数（同文件）：

```js
function failureMessage(message, code, t) {
    if (code === "ACCOUNT_SIGNED_OUT") return t("message.failure.accountSignedOut");
    if (code === "ACCOUNT_SIGN_IN_REQUIRED") return t("message.failure.accountSignInRequired");
    if (code === "QUOTA" || code === "ACCOUNT_QUOTA") return t("message.failure.quota");
    return code === "AUTH" ? t("message.failure.auth") : message;
}
```

**② 错误码层** —— `.../@deepseek-ai/dsh-llm/lib/types/error.js`（8472 B）

```js
/** Canonical provider-neutral code for an exhausted account quota or balance. */
export const QUOTA_EXCEEDED_CODE = 'QUOTA';
/** Account-token quota that can be replenished through the first-party billing page. */
export const ACCOUNT_QUOTA_EXCEEDED_CODE = 'ACCOUNT_QUOTA';
```

`HarnessError` 的 `code` 是 stable machine-routable failure class，注释明确要求 route on this，never by parsing `message`。

**③ 触发源** —— goat-gateway 把上游 402 的 **error body 原样透传** 给 dsh ⇒ dsh 归一化成 `QUOTA` ⇒ 界面显示「额度已用尽」。

关键 gateway 代码（`gateway.mjs`，行号取自本机当前版本）：

- `:71` `retryableStatus: [401, 402, 403, 408, 429, 500, 502, 503, 504]`
- `:75-76` `cooldownMs.quota = 600000`（10 分钟）/ `rateLimit = 60000`（1 分钟）
- `:487` `isQuotaExhausted(detail)` 正则 `/insufficient credits|out of credits|quota exceeded|exceeded your current quota|credit balance is too low|billing hard limit/i`
- `:495` `if (isQuotaExhausted(detail)) return ['quota', CFG.cooldownMs.quota];`
- `:504` `if (status === 402) return ['quota', CFG.cooldownMs.quota];`
- `:1136` 注释：400 也要走「先读 body 再决定」的路，因为上游用 400 + insufficient credits 表达额度耗尽
- `:1787` 401/402/403/429 属于「明确不能继续用这个 key」，立即冷却换 key

## 二、19:49–19:54 真实因果链（gateway 日志逐字）

```
11:44:47Z COOLDOWN key=qq   reason=network status=0   for=20s :: ECONNRESET: socket hang up
11:49:19Z COOLDOWN key=qq   reason=network status=503 for=20s :: Error 1102: Worker exceeded resource limits
11:49:39Z COOLDOWN key=deepseek-official reason=quota status=402 for=600s ::
          {"error":{"message":"Insufficient Balance (request_id: 19259813-...)"}}
11:49:39Z RETRY id=493 attempt=2/2 -> key=qq
11:49:51Z COOLDOWN key=qq   reason=network status=0   for=20s :: ECONNRESET
11:51:14Z COOLDOWN key=qq   reason=network status=503 for=20s :: Error 1102
11:52:19Z COOLDOWN key=qq   reason=network status=503 for=20s :: Error 1102
11:54:26Z COOLDOWN key=qq   reason=network status=503 for=20s :: Error 1102
```

1. 主力 key `qq` 被上游 Cloudflare 的 `Error 1102: Worker exceeded resource limits` 反复打挂（该窗口内连续 4 次）
2. gateway 按 failover 切到兜底 key `deepseek-official`
3. 该号余额为负（欠费）⇒ 上游回 **402 `Insufficient Balance`**
4. `gateway.mjs:504` 判 `quota` + 冷却 600s，并**把 402 error body 原样转发给 dsh**
5. dsh 收到 402 ⇒ 归一化 `QUOTA` ⇒ UI「额度已用尽」

**教训**：这个兜底 key 的净作用是**把瞬时网络故障升级成终局错误**——它唯一的职能是 qq 挂掉时接管，而它一接管必然 402。UI 文案因此完全指向错误的 key。

## 三、量化证据（2026-10-07）

| key | 当日状况 |
|---|---|
| `qq`（主号） | 额度充足：5h `0.52544569/14`、周 `9.301154909/35`、月已用 `9.269735584`（剩 `60.699/69.969`）；`requests=2436`、`tokens=236911710`；当天 **450 次 OK**；被 `reason=network status=503` 打挂 **18 次**（按小时 7×T、3×T10、9×T11） |
| `deepseek-official`（兜底） | 余额 **-0.22（欠费）**；当天 gateway 日志出现 **12 次**、其中 **8 次 `status=402`**、**OK 次数 0**；最后 4 条 COOLDOWN 全是 `reason=quota status=402` + `Insufficient Balance` |

`qq` 的 quota 实测取自 `http://127.0.0.1:8790/quota`（quota-http 聚合服务，gateway 的 quotaSync 数据源，见 `gateway.mjs:302-390`）。

## 四、修复动作（进行中：等待 UAC 确认）

**动作：把 `keys.json` 中 `deepseek-official` 设为 `enabled: false`。**

三条理由：
- 余额为负 ⇒ 落到它的请求**必然**失败；当天 0 次成功 ⇒ 禁用不可能更差
- 副作用是好的：qq 挂掉时如实报**网络错误**，而不是伪造的「额度用尽」
- 它在 `keys.json` 的 note 里声明 `pathPrefixes: ["/anthropic/"]` 独家认领官方 Anthropic 兼容端点（dsh 的 web_search 走这条）。禁用后该路径「无人认领」，按 `gateway.mjs` 的 `pathAllowed()` 规则（`:903-915`：有 key 认领 ⇒ 只保留认领者；未声明 pathPrefixes 的 key 在有人认领时出局）**所有 key 都能参与**，由 qq 接手；而它现在在该路径上也是 402，不会更差。

**执行脚本**：`C:/Users/27063/.dsh/storages/tools/_elev-disable-official.ps1`（3126 B，`Parser::ParseFile` SYNTAX OK）

安全设计（逐条都是踩过的坑）：
- 备份 → **长度安全替换**（用 `'"enabled": true'.Length` 计算，**不硬编码长度**）→ `ConvertFrom-Json` 验证 → 任何一步失败自动从备份还原
- **不硬编码长度这条是血泪**：14:06 那次把 keys.json 写坏就是因为硬编码 `15`（详见 goat-gateway keys.json 事故复盘文档）
- keys.json 位于需要提权的盘位，写入依赖 UAC 提升的 PowerShell；脚本以非阻塞方式弹 UAC，未确认前 keys.json 保持原状（`163=False qq=True deepseek-official=True`）

**注意**：在 UAC 确认并 reload 之前，本故障模式仍会复现。

## 五、本地修不了的部分

`Error 1102: Worker exceeded resource limits` 是 commandcode-goat 侧 Cloudflare Worker 超了自身 CPU/内存限额，属上游故障。本地只能冷却 + 重试 + 等它恢复（`qq` 当天被这样打了 18 次）。

## 复现/诊断命令速查

- 判读 UI 报错真实来源：看 `logs/gateway-2026-10-07.log` 里同一时间窗的 `COOLDOWN key=… reason=… status=…` 与 `RETRY id=… -> key=…`
- `deepseek-official` 的失败统计：`grep` gateway 日志统计该 key 的 FAIL/COOLDOWN 与状态码分布
- key 额度真值：`http://127.0.0.1:8790/quota`（返回 JSON 数组，每 key 一行含 fiveHourUsed/Cap、weeklyUsed/Cap、monthUsed/monthLeft/monthCap、requests、tokens）
- `keys.json` 采用 **mtime 热重载、立即生效**；`gateway.mjs` 改动则需**重启**才加载

## 相关文档

- goat-gateway priority 分层与 quota 动态权重实现上线（`2932c579-9670-4cb7-b244-7edf4a23e9bb`）—— 解释 `priority=0` 使官方 key 降为兜底层、`selectKey` 动态权重
- goat-gateway 多 upstream 改造上线交接（`dbffeb3a-718b-436e-b8f1-e4b9850f4b53`）—— 解释 keys.json 热重载语义与 key 路由判定方法
- goat-gateway 首字节超时阈值与 TTFT 基线（附 keys.json 手改事故复盘）（`bad9c4a5-21ee-4a4c-94bf-1312f166299d`）—— 硬编码长度写坏 keys.json 的事故细节

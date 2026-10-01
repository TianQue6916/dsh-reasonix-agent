---
id: mem-90a194e930c4a755e952de8693a31a62
revision: 1
created_at: "2026-10-01T06:52:14.608Z"
updated_at: "2026-10-01T06:52:14.608Z"
name: goat-gateway-多上游-官方key与goat平级入池
description: "goat-gateway 从单 upstream 升级为 per-key upstream（官方 key 与 GOAT key 平级入池）；含 selectKey 新 key 独占预热期陷阱、双机 node 版本差异、模型 id 映射与验证方式"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# goat-gateway 多上游改造（2026-10-01，双机已落地）

## 用户意图（原话）
> 「就是自动调配 key 的那个东西，地位和 goat 等价」
> 「就这样就行了，以后说不定会充值」

= 官方 key 作为**平级成员**进入同一个 key 调配系统（参与 session 粘滞 / 冷却 / 重试），**不设余额闸门**（选项 c：余额耗尽就让它进 402 冷却轮询，用户接受，不自动 disable）。

## 改造前架构（关键约束）
`gateway.mjs` 原为**单 upstream + key pool**：
- `upOrigin` 是全局单例，来自 `config.json` 的 `upstream.origin = https://api.commandcode.ai` + `basePath = /provider/v1`
- 所有 key 一律 `headers.authorization = 'Bearer ' + keyEntry.key` 打向同一个 origin
- `keys.json` 语义 = 「同一上游的多个同质账号」

⇒ **官方 key 塞进旧 keys.json 必然 401**（sk- 打向 commandcode.ai）。必须改架构。

## 改造后
- **14 处 patch**，全部在既有函数内，无新增顶层概念。逐条断言脚本：`D:/Toolbox/goat-gateway/_patch-multiupstream.py`（可复现）
- `resolveUpstream(keyEntry)` 取代全局 `upOrigin`；**缺省继承 `CFG.upstream`** ⇒ 既有 GOAT key 一行不用改，行为逐位不变
- agent 单例 → `Map<origin, {agent, bornAt}>`（keep-alive 连接绑 origin，不能跨 origin 复用）
- `mapPath(url, up)`、`forward()` 内 `up.url.*` / `getAgent(up)`、`defaultPort(protocol)`（旧代码写死 `|| 443`，对 http 上游是错的）
- 新增 `modelSupported()` / `mapModelFor()` / `rewriteModel()`：候选集过滤 + body.model 改写
- `/v1/models` **固定用缺省上游的 key 拉**（官方只有 2 个模型，问它会把 dsh 模型选择器打回 2 项）
- `/health` 逐 key 报 `upstream` + `models` 数量

## keys.json schema 扩展（向后兼容，缺省=不干预）
```json
{
  "name": "deepseek-official",
  "key": "sk-…",
  "upstream": { "origin": "https://api.deepseek.com", "basePath": "" },
  "models": ["deepseek/deepseek-v4.1-flash", "deepseek/deepseek-v4-pro"],
  "modelMap": { "deepseek/deepseek-v4.1-flash": "deepseek-flash",
                "deepseek/deepseek-v4-pro": "deepseek-v4-pro" }
}
```
- `models` 用**客户端 id**（dsh 发什么写什么）；`modelMap` 翻成上游裸 id
- `basePath: ""` 合法（官方 origin 直接接 `/chat/completions`）
- **`loadKeys()` 的 `.map()` 只挑固定字段 —— 新增字段必须同步加进去，否则静默丢失**

## ⚠️ 未解决的陷阱：selectKey 的「新 key 独占预热期」
`selectKey()` 的 `score = 绑定会话数 / weight`，取 min 分配。**新加入的 key load=0 ⇒ score=0 ⇒ 必然最小 ⇒ 独占后续所有新会话**，直到 load 追平次低者。`weight` 压不住（load=0 时 score 恒为 0）。

实测证据（Windows，2026-10-01）：
```
SESSION-BIND … deepseek-official (sessions per key: 163=789 qq=903 deepseek-official=0..7)
```
即官方 key 会独占约 `903/3 = 301` 个新会话才与 qq 打平。按 dsh 一个会话 ~¥0.1 估，**几十个会话就会烧光 ¥5.53**。

**这是既有算法行为，不是本次改造引入**——2026-09-29 加 qq key（weight=3）时同样发生，只是当时两个 key 都是套餐制，独占无代价。

三个选项已告知用户，**他未选择 → 现状 = 策略 (i) 接受**：
- (i) 接受（当前）
- (ii) 给 `selectKey` 加 `joinBalanced` 语义：新 key 用「按 weight 应得的份额」作初始 load，立刻平级（约 10 行）
- (iii) `enabled: false` 热重载关掉

**下次会话若用户抱怨官方余额被快速烧光，先想到这条。**

## 官方 key 与模型（2026-10-01 实测）
| | Windows 天阙九泉 | Linux 天阙 |
|---|---|---|
| key 位置 | 用户级环境变量 `DEEPSEEK_API_KEY` | `~/.dsh/.env` |
| md5 前缀 | `3a5aedb6deaa` | `9dbb20ea33e6`（**不同 key**） |
| 余额 | ¥5.53 | ¥5.47 |

`GET https://api.deepseek.com/models` → 只有 **2 个**：
- `deepseek-flash` = **DeepSeek-V4.1-Flash**，ctx 1048576，max_out 393216，**input 含 image（有视觉）**，effort low/high/max，`api_capabilities.anthropic_messages.system_prompt_update = "in-history"`
- `deepseek-v4-pro` = DeepSeek-V4-Pro，text only，`anthropic_messages` = `leading-only`

⇒ 官方 `deepseek-flash` 与 GOAT 的 `deepseek/deepseek-v4.1-flash` 是**同源模型**。其余 59 个 GOAT 模型官方天然不可服务（能力边界，非策略）。

## 双机版本分叉（本次顺带修复）
Linux 侧 `~/goat-gateway/` 长期停留在 **911 行**旧版（缺 9-29 的 `weight`、9-30 的 `model-allowlist.json` 机制、`streamIdleTimeoutMs`/`firstChunkTimeoutMs`、`prefixAffinity`），且目录里混着 12 个 Windows 专属文件（`*.ps1` / `*.vbs` / `quota-widget.cs`）——是从 Windows 整目录拷过去的旧快照。现已双向统一为 1416 行。

**保留的本地差异**：Linux `config.json` 的 `cooldownMs.unauthorized = 1800000`（30 分钟），Windows 为 `180000`（3 分钟）。**同步 config 时不要覆盖这一项**。

**runtime 差异**：Windows 计划任务用 `C:\Program Files\nodejs\node.exe`（v24）；Linux systemd unit `ExecStart=/usr/bin/node`（**v18.19.1**，不是 PATH 上的 `~/.local/bin/node` v24）。新代码在 node 18 上已验证通过。

## 启动 / 重启 / 回滚
- Windows：计划任务 `Goat-Gateway`（`start-gateway.vbs` 点火）+ `Goat-Gateway-Watchdog`（每 1 分钟，连查两次 `/health` 均失败才重启）。重启 = `stop-gateway.ps1` 然后 `schtasks /run /tn Goat-Gateway`。**`keys.json` 是 mtime 热重载，`gateway.mjs` 必须重启进程** ⇒ 改代码与加 key 的顺序必须是「先重启加载新代码，再改 keys.json」，否则旧代码会把新 key 当同上游 key 用。
- Linux：`XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user restart goat-gateway`
- 回滚：双机各有 `{gateway.mjs,config.json,keys.json}.bak-*-pre-multiupstream`（Windows `20261001-1427`，Linux `20261001-1449`）

## 验证方式（可复现）
1. `node selftest.mjs` — 原 13 项回归，双机 + node18/24 全过（证明向后兼容未被破坏）
2. `node selftest-multiupstream.mjs` — **本次新增 6 项**：models 端点走缺省上游 / gpt 永不落官方 / deepseek 两上游都分到 / per-key 路径与认证 / health 逐 key / 双向过滤 + 全池不支持时 400 `gateway_no_key_for_model`
3. 真实链路：shadow 实例（`GATEWAY_CONFIG`/`GATEWAY_KEYS`/`GATEWAY_STATE`/`GATEWAY_LOG_DIR` env 隔离，端口 8799）打真实官方 API，确认 TLS + 裸 id 改写 + `model:"deepseek-flash"` 回包
4. 生产路由日志：`deepseek 系 → key=deepseek-official POST /chat/completions`；`gpt-6-luna → key=qq POST /provider/v1/chat/completions`

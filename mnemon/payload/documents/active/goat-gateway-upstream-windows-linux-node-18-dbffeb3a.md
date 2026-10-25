---
id: "dbffeb3a-718b-436e-b8f1-e4b9850f4b53"
title: "goat-gateway 多 upstream 改造上线交接：Windows/Linux 双机同版落地（node 18 约束、上线顺序、预热期实测、回滚）"
description: "2026-10-01 完成的 goat-gateway 多 upstream 改造实施与双机上线记录：Windows 计划任务与 Linux systemd 同步到同版 1416 行 gateway.mjs，三层验证链（13+6 项 selftest、shadow 打真实官方 API、生产路由日志），Linux unit 实际用 node v18.19.1 的兼容约束、keys.json mtime 热重载导致的上线顺序铁律、selectKey load=0 新 key 独占预热期在生产被实测确认、mapPath 硬编码 443 修复与双机回滚备份路径。设计背景见 d719aa02。"
status: "active"
created_at: "2026-10-01T06:53:22.974Z"
updated_at: "2026-10-01T06:53:22.974Z"
content_hash: "982691f42d1deaa46669f0eac9d3646b0f5305032d96c6050d98dcd7a656215e"
source_paths:
  []
session_ids:
  - "c6acd669-f500-410a-9524-6c5226a2ce9e"
memory_body_ids:
  []
---

# goat-gateway 多 upstream 改造上线交接（双机同版）

**性质**：实施与上线交接记录（设计背景与改动清单见 `d719aa02-0f0c-44f0-9480-4930f70bc058`，那份文档写于「代码未改」阶段；本文记录其落地后的真实状态与新增教训）。
**日期**：2026-10-01
**结论**：Windows 与 Linux 两台网关统一到同一版 `gateway.mjs`，官方 DeepSeek key 作为与 GOAT 套餐 key 平级的 upstream 成员入池并已在生产验证路由正确。

## 1. 终态

| | Windows 天阙九泉 | Linux 天阙 |
|---|---|---|
| `gateway.mjs` | 1416 行（原 1300） | 1416 行（原 911，已统一） |
| runtime | node v24 | **node v18.19.1**（`/usr/bin/node`，即 systemd unit 实际使用的那个） |
| 官方 key 来源 | Windows 用户级 env `DEEPSEEK_API_KEY` | `~/.dsh/.env`（**另一把独立 key**） |
| 进程托管 | 计划任务 `Goat-Gateway` + `start-gateway.vbs` + `watchdog.ps1`（每分钟计划任务） | `goat-gateway.service`（systemd，`Restart=always`） |
| 端口 | 8788 | 8788 |

两台 GOAT key（163 / qq）经 md5 比对**完全相同**；两把官方 key **不同**（余额各自独立，Windows ¥5.53 / Linux ¥5.47）。推 `keys.json` 时只能替换官方 key 那一条。

## 2. 三层验证链（可复用的「网关改动验收」范式）

1. `selftest.mjs` 13 项回归全过 —— 证明 GOAT-only 既有行为逐位未变（含 stream 正常/中止、5xx failover、header 后错误不切换、cloudflare 1010 短冷却、body 超时 408、config/keys 坏 JSON 回退、session 指纹稳定、20 并发、stream idle 超时透明重试、prefix affinity 软上限）。
2. 新增 `selftest-multiupstream.mjs` 6 项全过 —— 定向覆盖新语义：models 端点用默认 upstream、gpt 模型永不落到官方 key、deepseek 模型按 key 拆分、per-key path 与 auth header、`/health` 上报 per-key upstream、双向 model filter 与不支持模型返回 400。
3. **shadow 实例打真实官方 API** —— selftest 覆盖不到的 TLS / 路径 / id 改写只有在真实链路才能验证：请求 `deepseek/deepseek-v4.1-flash` 落 official，官方回 `model: "deepseek-flash"`（证明 modelMap 改写在响应侧生效）、路径为 `POST /chat/completions`（证明 `basePath: ""` 正确）。

第 2、3 层各在 **node 18 与 node 24 上分别跑过**，因为两台生产机的 runtime 不同。

## 3. 上线顺序铁律（本次最容易翻车的一点）

`keys.json` 是 **mtime 热重载、立即生效**；`gateway.mjs` 需**重启**才加载。若先加 key 再重启，旧代码会把官方 key 当 GOAT key 打向 `api.commandcode.ai`。

> **必须先重启加载新代码，再改 `keys.json`。**

补充风险：操作者自己的对话就跑在这个 gateway 上，重启失败会失去响应能力。因此重启命令内置自动回滚：停止 → 确认端口下线 → 用 `.bak-*-pre-multiupstream` 兜底启动。Windows 侧实测 1 秒起来、state 恢复 1692 个 session；Linux 侧 `is-active=active`、1 秒起来。

## 4. 生产实证（真机路由日志，非 selftest 推断）

```
Windows: deepseek ×8 → key=deepseek-official  POST /chat/completions
         gpt-6-luna ×2 → key=qq              POST /provider/v1/chat/completions
Linux:   deepseek ×4 → key=deepseek-official  POST /chat/completions  (回 model:"deepseek-flash")
         gpt-6-luna ×1 → key=qq              POST /provider/v1/chat/completions
```

判定「路由是否真的落对 key」只能看 gateway 日志里的 `key=` 字段与 `SESSION-BIND` 行，`/health` 只反映配置而非实际调度。

## 5. 两个被本次修掉的既有问题

1. **双机版本分叉**：Linux `~/goat-gateway/` 停在 9-24 的 911 行旧快照，缺 `weight`、`model-allowlist.json` 机制、`streamIdleTimeoutMs` / `firstChunkTimeoutMs`、`prefixAffinity`；目录里还混着 12 个 Windows 专属文件（`*.ps1` / `*.vbs` / `quota-widget.cs`）——当初整目录拷贝留下的。已统一，并**刻意保留 Linux 的 `cooldownMs.unauthorized = 1800000`（30 分钟）**，不被 Windows 的 `180000` 覆盖。该 30 分钟是用户有意设置。
2. **`mapPath` 硬编码 `port: upOrigin.port || 443`**：对 http 上游是错的，只在 selftest 那种带显式端口的 mock 上游上碰巧没暴露。改为按 `defaultPort(protocol)` 推导。

## 6. 保留未修：selectKey 的「新 key 独占预热期」（已在生产复现）

`selectKey()` 用 `score = 绑定会话数 / weight` 选 key。新 key 入池时 `load = 0`，**score 恒为 0，无论 weight 多小都压不住**：

| key | 绑定会话数 | weight | score |
|---|---|---|---|
| 163 | 789 | 1 | 789 |
| qq | 903 | 3 | 301 |
| deepseek-official | 0 | 1 | 0 ← 永远最小 |

后果：官方 key 会**独占接下来的约 301 个新会话**（追平 qq 的 301 才平级），而非按 weight 的 1/3。日志逐条 `SESSION-BIND ... deepseek-official` 连续出现即为该现象（Windows 侧 `163=789 qq=903` 期间的 8 连绑即为实证）。

这不是本次改造引入的：9-29 加 qq key 时同为同一机制。区别在于当时两把都是套餐制（独占无所谓），而官方 key 按量计费、余额仅约 ¥5，粗估一个会话几轮约 ¥0.1，**几十个会话即见底**，之后按既有策略进 402 冷却轮询。

**用户未选择修复，维持现状（接受独占、烧完自然进冷却）。** 若需修，改法很轻：在 `selectKey` 内约 10 行，让新加入的 key 以「按 weight 应得的份额」作为初始 load，一进来即三键平级。

## 7. 回滚与可复现

双机各三份备份，覆盖 `gateway.mjs` / `config.json` / `keys.json`：

```
Windows  D:/Toolbox/goat-gateway/*.bak-20261001-1427-pre-multiupstream
Linux    ~/goat-gateway/*.bak-20261001-1449-pre-multiupstream
```

改动本身由脚本 `D:/Toolbox/goat-gateway/_patch-multiupstream.py` 施加（14 处替换各带断言）；**重跑前必须先还原备份**。新增测试文件 `D:/Toolbox/goat-gateway/selftest-multiupstream.mjs`。

## 8. 环境专属坑

- Linux 侧 `systemctl` 重启后查 `/health` 时，**引号嵌套**会被 shell 吃掉（`%-20s` 之类格式串解析报 SyntaxError），远程执行 Python/VBS 片段应改用 **stdin 传脚本**，不要塞进 `bash -c` 的单行里。
- unit 写的是 `/usr/bin/node`（v18.19.1），而 PATH 上的 node 是 v24.21.0 —— 验证新代码必须用 **v18**，否则「本机能跑」是假象。
- 推送后要核对到达侧行尾（本次所有文件 CR=0，Linux 侧安全）。

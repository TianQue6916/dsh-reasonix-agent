---
id: mem-fb646f4d0265870608cca7e0759884d4
revision: 1
created_at: "2026-10-25T19:07:10.625Z"
updated_at: "2026-10-25T19:07:10.625Z"
name: linux-gateway-undici-ipv6-timeout
description: "Linux dsh/goat-gateway 所有网关失败根因：undici fetch 不回退 IPv4（Happy Eyeballs），修复=node 加 --dns-result-order=ipv4first"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状
Linux（天阙机 Ubuntu 26.04, Node 24.21.0）上 dsh 发消息报「所有网关失败」，goat-gateway 返回：
```
{"error":{"message":"goat-gateway: 所有 key 均失败（已尝试 qq）。最后一个错误：ETIMEDOUT: ","type":"gateway_all_keys_failed","upstream_status":0}}
```
而 `curl https://api.commandcode.ai/provider/v1/models` 从同一台机器 **HTTP 200 / 1.03s**，完全正常。

## 根因
`api.commandcode.ai` 在 Cloudflare 上，DNS 同时返回 IPv4（172.67.167.23 / 104.21.49.202）和 IPv6（2606:4700:3035::ac43:a717 / 2606:4700:3036::6815:31ca）。

Node 24 的 **Happy Eyeballs / network family autoselection** 默认开启，遇到 IPv6 首连失败时：
- `undici` 的 `fetch()` **不回退到 IPv4，直接抛 ETIMEDOUT**（约 550ms 就失败，不是等满超时）
- `node:https` 的 `get()` 不受影响（同一时刻同一 URL 返回 200 / 904ms）

`goat-gateway/gateway.mjs` 全程用 `fetch`（undici），所以所有 key 都失败。dsh 只用 loopback 调 gateway 不受影响，但 gateway 打上游全挂 → dsh 从未成功发出 LLM 请求 → **bili 0 session / 0 nudge 是这个的下游后果，bili 本身无辜**。

## 修复（已落地，2026-10-26）
systemd user unit 里必须把 flag 放在 **ExecStart 命令行**上，`Environment=NODE_OPTIONS=...` 单独一个 flag 时实测无效（进程 env 里有但行为不变）：

`~/.config/systemd/user/goat-gateway.service`:
```
ExecStart=/usr/bin/node --dns-result-order=ipv4first --no-network-family-autoselection gateway.mjs
```
`~/.config/systemd/user/dsh-web.service`:
```
ExecStart=/usr/bin/env NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection" /home/tianque/.local/bin/dsh web --port 3080
```
注意 `dsh` 是 shell 脚本不是二进制，所以只能走 `env NODE_OPTIONS="..."` 且**两个 flag 必须在同一个引号值里**（否则 env 把第二个 flag 当命令名，服务会卡在 activating）。

验证：两个 shape 都返回真实回复
- Anthropic `POST /v1/messages` model=`claude-sonnet-5-5` → `content:[{type:text,text:"ok"}]`
- OpenAI `POST /v1/chat/completions` model=`deepseek/deepseek-v4-flash` → `choices[0].message.content="ok"`

## 可复用判断法
gateway 报 `ETIMEDOUT` 且耗时 < 1s（而非等满 15s）＋ curl 能通 ⇒ 先怀疑 undici 的 IPv6 不回退，先跑对照：
```
node -e "fetch('https://<host>/').then(r=>console.log('OK',r.status)).catch(e=>console.log('FAIL',e.cause?.code))"
node --dns-result-order=ipv4first -e "...同上..."
```
默认 FAIL / 加 flag 后 OK 即确诊。

## 备份
`goat-gateway.service.bak-<ts>-pre-ipv4first`、`dsh-web.service.bak-<ts>-pre-ipv4first`

---
id: "cda4736b-c1bd-438d-86e2-bc0d1ca68c3b"
title: "Linux 端 dsh web 起不来定案：dsh-tunnel 抢 3080 端口（非插件不兼容）+ 修复到 3081 与验收判据（2026-10-29）"
description: "2026-10-29 在 Ubuntu(TianQue) 上实测定位 dsh web 启动失败真因：dsh-tunnel.service 的 ssh -L 3080 先占本地端口，dsh-web.service 也要 3080 导致 required 插件 webserver EADDRINUSE 并级联 7 个 waiting 服务；含 --port 3099 判定性实验、改 3081 的修复与验收、回滚/反向方案，以及 dsh-linux-fix.sh 两个解析 bug（installAnchor 缺失、bundle 解析顺序反了）的根因与官方 resolveBundleDir 语义。"
status: "active"
created_at: "2026-10-28T16:59:13.178Z"
updated_at: "2026-10-28T16:59:13.178Z"
content_hash: "b2bfe52db11847813a79fd75bd77c55872f1bc3b4150032b8c2fc5b13d13d5d1"
source_paths:
  - ".dsh/_linux-dsh-fix/dsh-linux-fix.sh"
  - ".dsh/_linux-dsh-fix/REPORT.md"
  - ".dsh/profiles/web/package.json"
  - ".config/systemd/user/dsh-tunnel.service"
  - ".config/systemd/user/dsh-web.service"
session_ids:
  - "d88be505-811b-4c6c-b5e7-de7567c1db99"
memory_body_ids:
  []
---

# Linux 端 dsh web 起不来定案（2026-10-29）

> 结论先行：**根因是端口冲突，不是插件版本不兼容。** 症状「报一堆错」= 1 条 `EADDRINUSE` + 7 条级联 `waiting for services`。

## 1. 环境与现象

- 目标机：`TianQue`（Ubuntu，kernel `7.0.0-38-generic`，x86_64，主机名 `tianque`），经 `~/.ssh/config` 的 `tianque`（Tailscale `100.79.96.82`）直连。
- 运行版本：dsh `0.2.1-rc.4`，node `v24.21.0`，pnpm `11.19.0`，`DSH_HOME` 未设，HOME `/home/tianque`。
- profile：`~/.dsh/profiles/web`（另有 `desktop` / `headless` / `web.bak-20261026-011211`）。
- 现象：`systemctl --user status dsh-web.service` = `inactive/dead`，启动即崩，重启计数到 3 后被 systemd 放弃。

### 真实失败日志（`~/.dsh/logs/dsh-web.log`）

```
dsh: startup failed: 2 required plugins did not activate
Failed plugins (1):
  webserver (required)   @deepseek-ai/dsh-host-webserver
    Error: listen EADDRINUSE: address already in use 127.0.0.1:3080
Plugins waiting for services (7): web-runtime(required) / open-in-app / directory-picker /
  harness-dev-context / client-hmr / better-sidebar / message-tree  → 全部等 webServer
```

## 2. 冲突双方（关键证据）

| 单元 | 内容 |
|---|---|
| `dsh-tunnel.service` | `ssh -N -o ExitOnForwardFailure=yes -L 3080:127.0.0.1:3080 27063@192.168.243.1`，active running；**在 Linux 本地监听 3080**，转发到 Windows 主机 1Gbps 直连链路 |
| `dsh-web.service` | `dsh web --port 3080`；`webserver` 是 **required** 插件，bind 失败 ⇒ 整个进程 exit 1 |

`ss -ltnp` 证据：`127.0.0.1:3080` 与 `[::1]:3080` 的持有者是 `ssh pid=2715`（tunnel 的 ssh 进程），不是 dsh。

unit 文件路径：`~/.config/systemd/user/dsh-tunnel.service`、`~/.config/systemd/user/dsh-web.service`；另有 `goat-quota-http.service`（GOAT 配额端点）同为 active。

## 3. 判定性实验（排除插件嫌疑）

```bash
dsh web --port 3099 --no-open
# → http://127.0.0.1:3099/?token=...  一次起，零 incompatible 警告、零 waiting services
```

⇒ profile 本身健康；「插件版本不兼容」是**假线索**。`~/.dsh/profiles/web/compatibility.json` 早在 10-28 已为 `dsh-headroom@0.3.0` 补了 `0.2.1-rc.4` 豁免，那条路本来就通。

## 4. 修复（已上线并验收）

`~/.config/systemd/user/dsh-web.service`：

```ini
- ExecStart=... dsh web --port 3080
+ ExecStart=/usr/bin/env NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection" /home/tianque/.local/bin/dsh web --port 3081
```

端口分工（改动后）：`3081` = Linux 本地 dsh web；`3080` = ssh 隧道到 Windows 主机（隧道未动）。

### 验收判据（四条全绿才算修好）

| 检查 | 期望 |
|---|---|
| `systemctl --user is-active dsh-web` | `active` |
| `NRestarts` | `0` |
| 日志尾部 | `dsh web: http://127.0.0.1:3081/?token=...` |
| `curl -s -o /dev/null -w %{http_code} 127.0.0.1:3081/` | `401`（要 token，属正常鉴权响应，不是故障） |

实测：`active`、`NRestarts=0`、`MainPID=1694758`、`ss` 显示 3081 由 `MainThread pid=1694758` 持有、HTTP 401。

### 回滚

```bash
cp -p ~/.config/systemd/user/dsh-web.service.bak-20261029-portfix ~/.config/systemd/user/dsh-web.service
systemctl --user daemon-reload && systemctl --user restart dsh-web.service
```

### 反向方案（想保留本地 3080、把隧道让到 3082）

见 `REPORT.md` §11.5，思路对称：改 `dsh-tunnel.service` 的 `-L 3082:127.0.0.1:3080`，`dsh-web` 维持 3080。

## 5. 顺手修掉的两个脚本自身 bug

脚本：`~/.dsh/_linux-dsh-fix/dsh-linux-fix.sh`（同目录 `README.md` / `REPORT.md`；Windows 侧 `C:\Users\27063\.dsh\_linux-dsh-fix\`，已 scp 到 Linux）。

1. **installAnchor 漏查**：导致 `@deepseek-ai/dsh-base` 被误报 `MISSING`。
2. **bundle 解析顺序反了**：官方 `resolveBundleDir(binName, packageName, installAnchor, profileDir)` 的 anchor 顺序是 **`[installAnchor, profileDir/package.json]`，dsh 安装目录优先**，源码注释明说 in-box bundle「永远来自与运行中 dsh 同一个安装，绝不来自 profile 本地副本」。脚本按 profile 优先去读，在 Linux 上捡到陈旧的 `dsh-web-app@0.1.5-rc.3`，误报 `FAIL`，与 `--dump-config` / `--dump-config` 的 `incompatible 告警=0` 直接矛盾。

另外 `npm root -g` 不是 dsh 真实安装位置；正确锚点是 `/home/tianque/.local/lib/node_modules/@deepseek-ai/dsh`。

修完复跑 `dsh-linux-fix.sh --dry-run`：`FAIL=0 MISSING=0 WINONLY=0`，`R1`/`R2` 均跳过（无未豁免不兼容 bundle、无 Linux 不可能加载的 bundle），与官方判定完全一致。

## 6. 方法论（可复用）

`startup failed` ≠ `incompatible`。dsh 启动失败至少三类，症状都是「报一堆东西」：

1. **兼容性门禁**：`skipping profile bundle`
2. **required 插件激活失败**：`Failed plugins` + 单条真实 `Error:`
3. **patch 树合成失败**：`duplicate loader entry id`

排查顺序：**先看 required 插件那条 `Error:`，再看清单**。required 会把单点故障放大成全屏崩溃；`systemctl --user list-units` / `ss -ltnp` 往往比翻插件目录更快给出答案。

## 7. 相关文档

- `16316c87-2d8b-46b8-842e-92e897a3ede8` — DSH 升级后插件 skip / `compatibility.json` 精确版本豁免 + 三例「日志撒谎」取证（含 `EADDRINUSE` 放大 warn 的取证方法）
- `2d8ce3ca-b52c-4931-939f-63f9e9efde1a` — Linux 端 dsh 升级到 0.2.1-rc.2：native install-scripts 补齐、插件双端对齐、`/tmp` 依赖 vendor 化

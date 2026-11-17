---
id: mem-d4fcb8388ee05223fc19fda405410e93
revision: 2
created_at: "2026-11-17T09:35:01.165Z"
updated_at: "2026-11-17T09:41:28.322Z"
name: linux-dsh-web-3080-port-conflict-20261117
description: "Linux 天阙 dsh「打不开 + 插件报错」定论（已修）：systemd dsh-web.service 自启占 3080 + Description/ExecStart 矛盾；P1 = disable 自启 + dsh-local-gui 改自起；真插件错只有 dsh-pilot inject 缺 config"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 症状
Linux 天阙机双击 `DeepSeek Harness (local)` 或敲 `dsh web`，报：
```
dsh: startup failed: 2 required plugins did not activate
Failed plugins (1):
  webserver (required)  @deepseek-ai/dsh-host-webserver
  Error: listen EADDRINUSE: address already in use 127.0.0.1:3080
Plugins waiting for services (8): web-runtime / open-in-app / directory-picker /
  harness-dev-context / client-hmr / better-sidebar / message-tree / pilot
```

## 根因
`~/.config/systemd/user/dsh-web.service` 被 enable（`default.target.wants/` 软链建于 2026-10-26 01:31，`WantedBy=default.target`），`ExecStart=... /home/tianque/.local/bin/dsh web --port 3080`。登录即自启并 bind 3080；用户再手敲 `dsh web`（同一条命令、同默认端口）= 第二个实例 → webserver required 插件 bind 失败 → 级联 8 个 pending。
unit 的 **Description 写 "port 3081; 3080 is reserved for manual `dsh web`"，ExecStart 却是 3080** —— 2026-10-29 那次修复只改了 Description 没改 ExecStart（unit mtime Nov 17 00:42）。

## 修复（P1，2026-11-17 17:40 落地并验收）
1. `systemctl --user disable --now dsh-web.service` → Removed `default.target.wants/dsh-web.service`；`is-enabled=disabled`、`is-active=inactive`。3080 交还手动。
2. `~/.local/bin/dsh-local-gui` 改版（备份 `.bak-20261117-1739-pre-P1`）：删掉原第 9 行 `systemctl --user is-active || systemctl --user start`；改为「端口空 → `setsid nohup dsh web --port $PORT >>$LOG 2>&1 &` + 等 30s；端口已占 → 复用；token 取到后先 `curl` 探一次，401 就不带 token」。这样手敲与点图标都不再互相拉服务。
3. 验收：探针实例 `127.0.0.1:3080 users:(("MainThread",pid=994658))`，日志零 startup failed / 零 EADDRINUSE；token `oyZNnX…` → `http=200 bytes=43119` + `<title>DeepSeek Harness</title>`；bare URL → 401。清理后 3080 + 18788 双空闲。

## 回滚
`cp ~/.local/bin/dsh-local-gui.bak-20261117-1739-pre-P1 ~/.local/bin/dsh-local-gui`
`systemctl --user enable --now dsh-web.service`

## 唯一的真插件错（非致命，未修）
`dsh-pilot@0.7.3`：`lib/index.js:9` `var inject = ["webServer","tools"]`（缺 `config`），`:1026` apply 首行读 `ctx.config` → cordis 抛 `cannot get property "config" without inject` → `dsh: warning: 1 entry did not activate`。上游是否已修未检验。

## 连带发现
- `dsh-tunnel.service` = `-L 3082:127.0.0.1:3080 27063@192.168.243.1`，转发到 Windows 192.168.243.1 的 **3080**；而 Windows 侧 GUI 实际在 **8584** → 该隧道指向死端口。
- `ds-harness-remote` 报 `IDENTITY_INVALID: private key permissions must be 0600, got 664`（双机同步同一 `~/.dsh` repo 带坏权限）。
- token 每次启动重新生成，只落在启动进程的 stdout（现在 service 的 append 日志没了，手敲实例的 token 打在终端；点图标则靠脚本自己 spawn 后写进 `dsh-web.log`）。

## 教训
- `startup failed` + 一串插件 pending ≠ 插件坏。先看 required 那条 `Error:`，再 `ss -ltnp` + `systemctl --user list-units` 问「本机谁占着这个端口」。
- systemd unit 的 Description 与 ExecStart 会互相说谎。
- 「刚开机就有人占端口」通常是自己注册过的 user service，不是外来程序。

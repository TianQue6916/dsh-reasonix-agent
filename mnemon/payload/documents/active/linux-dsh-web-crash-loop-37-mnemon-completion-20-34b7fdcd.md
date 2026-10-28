---
id: "34b7fdcd-cde3-4bd6-931b-ea15c413a6be"
title: "本机 Linux 启动链路排障：dsh web 起不来的 crash loop 根因 + 开终端刷 37 行 mnemon completion 报错（2026-10-28）"
description: "2026-10-28 本机两起「启动链路」故障的实测定案：①`dsh web` 无法启动的真因是 SSH session 遗留的孤儿 node 进程长期占用 127.0.0.1:3080，叠加 `Restart=always` 无 StartLimit 放大成 4700+ 轮 crash loop；含 cordis required/inject 级联语义、localhost 解析 ::1 打到 ssh 隧道的烟雾弹、以及清场/止血/加固四套方案。②每次开终端喷 37 行 `unknown flag: --completion`，源于 ~/.bashrc 第 127-128 行把 `mnemon completion bash` 误写成 flag，含 100ms/次的冷启动成本与预生成静态脚本修法。"
status: "active"
created_at: "2026-10-28T08:10:15.899Z"
updated_at: "2026-10-28T08:10:15.899Z"
content_hash: "c33e54feaec9de04ac96ea20cef7bfc743a1585b075ee54d0a7f411189edbc61"
source_paths:
  - ".config/systemd/user/dsh-web.service"
  - ".config/systemd/user/dsh-tunnel.service"
  - ".bashrc"
  - ".dsh/PLAN.md"
session_ids:
  - "99d6fc10-33c1-41b7-b1ca-66a375aabfe8"
memory_body_ids:
  []
---

# 本机 Linux 启动链路排障（2026-10-28）

两起独立的「启动/开终端」故障，同一台 Linux 开发机，症状都表现为「看到一堆报错但不知道为什么」。

## 一、终端输入 `dsh web` 无法启动

### 症状

`dsh: startup failed: 2 required plugins did not activate`，并伴随 `Plugins waiting for services (7)` 列表。

### 决定性证据

| 角色 | 身份 | 出身 |
|---|---|---|
| 实际占着 `127.0.0.1:3080` | `node … dsh web --port 3080`（当时的 pid 2273900） | cgroup = `session-242.scope`，**ppid=1（孤儿）** |
| systemd 想拉的实例 | `dsh-web.service` 的 MainPID | `Restart=always` 反复重启，`NRestarts` 已达 4729 |
| IPv6 侧监听 | `ssh -L 3080:127.0.0.1:3080`（`dsh-tunnel.service`） | 占 `[::1]:3080` |

孤儿进程**不在 `dsh-web.service` 的 cgroup 内** ⇒ unit 的 stop/kill 碰不到它 ⇒ systemd 永远绑不上端口。

### 因果链

1. 某次 SSH 登录 session 里手工敲过 `dsh web --port 3080`，进程绑住 127.0.0.1:3080。
2. SSH session 注销后进程被 init 收养，但**监听 socket 是内核资源，不随父进程死而释放** ⇒ 端口被长期持有（实测存活 11h+）。
3. 每次 unit 启动 → 加载 profile ~12 秒 → 走到 `dsh-host-webserver` 的 `listen()` 时 `EADDRINUSE` → `exit 1` → `RestartSec=5` 重来。
4. 手工敲 `dsh web`（不带 `--port`）走同一条 composed host:port 路径，撞同一个车，报错完全一致。

排查中现场会变：前后两次快照的占用者 pid 不同（101349 → 2273900），`/proc/<pid>` 可能已消失 —— 结论必须基于**当次重采**而不是沿用旧快照。

### 为什么 1 个 plugin 挂会连带 8 个（cordis 语义，不是 8 个 bug）

- `webserver` 是 **required**，自身激活失败 ⇒ 它应提供的 `webServer` 服务从未存在。
- 声明 `inject: webServer` 的 7 个 plugin 挂起在 waiting 而非报错 —— 它们在等一个永远不会到来的服务。
- `web-runtime` 同属 required 且依赖 `webServer` ⇒ 合计 2 个 required 失败 ⇒ 整体 `startup failed`。

⇒ `Plugins waiting for services (7)` 是**级联产物**，不要逐个去查。

### 烟雾弹

- **`curl localhost:3080` 必然失败**：`[::1]:3080` 被 `dsh-tunnel.service` 占着，Linux 上 `localhost` 优先解析 `::1`。实测 `127.0.0.1:3080` → `401`（0.0017s，harness 正常）；`localhost:3080` → `Empty reply`（2.05s，打到 ssh 隧道）。浏览器必须输 `127.0.0.1:3080`。
- **`dsh-mnemon: could not recover retained legacy settings … profileContext in inactive context`**：每次启动都打印，发生在 webserver 之前，是 dsh-mnemon 在 inactive context 读 config-editor 的时序问题，**不影响启动成败**。

### 代价与副作用

每 ~13 秒拉起一个 node：~10s CPU、峰值 ~500MB RSS；`dsh-web.log` 被刷到 8.7MB / 141608 行全是同段 `EADDRINUSE`。

连带解释：当前 session 住在那个 04:49 起的手工实例里，加载的是**那一刻**的配置 ⇒ 这 11 小时对 `.mjs` preset 的改动全部不可能生效（「待重启生效」卡在这一环）。

### 方案

| | 做法 | 断当前对话 | 止血 | 自愈 |
|---|---|---|---|---|
| A | `kill <孤儿 pid>`，unit 5s 内自起并成功绑定 | **会断** | ✅ | ✅ |
| B | `systemctl --user stop dsh-web && disable`，保留孤儿 | 不会 | ✅ | ❌ |
| C | 旁路验证 `dsh web --port 3081 --no-open` | 不会 | ❌ | ❌ |
| D | 加固：unit 加 `StartLimitIntervalSec=60` / `StartLimitBurst=3`；隧道挪到 3082 | 不会 | — | 防复发 |

关键前提：**占端口的孤儿进程往往就是当前对话所在的 server**，`kill` 它会立即掐断自己 ⇒ 执行前必须先向用户点明并取得拍板。

治本一条：`Restart=always` 不配 `StartLimit*` 是这次放大成 4700+ 轮的直接原因，任何占端口的孤儿都能重演。长期只用一个重启入口：`systemctl --user restart dsh-web`，不要手工 `dsh web`。

## 二、开终端刷 37 行 `unknown flag: --completion`

### 定位

`~/.bashrc` 第 127–128 行（写入时间 = `.bashrc` mtime `2026-10-01 14:29`）：

```bash
# mnemon shell completion
eval "$(mnemon --completion bash)"
```

### 三层原因

1. **语法层**：`completion` 是 cobra 风格的**子命令**，正确写法 `mnemon completion bash`（实测输出 16153 字节、`rc=0`）；`--completion` 是未知 flag。
2. **进程层**：`$( )` 只捕获 stdout，cobra 把 `Error:` + 完整 Usage 打到 **stderr** ⇒ 漏到屏幕；`eval "$(…)"` 等价于 `eval ""`，空操作，补全从未生效。末尾那行没有 `Error:` 前缀的 `unknown flag` 是 `main` 拿到 err 后的二次裸打印。
3. **shell 层**：`.bashrc` 每次开终端 source 一次 ⇒ 不是偶发，而是每次 37 行（`bash -i -c true` 实测 stderr=37 行），持续 27 天。

### 为什么在 dsh 的终端里看不到

dsh 起子进程用 `bash --noprofile --norc -i`（见 `dsh-terminal-*.scope` 的 cmdline），完全跳过 `.bashrc` ⇒ 同一个 bug 在手工终端刷屏、在 agent bash 里零痕迹，因此长期没人顺手修。

### 成本

`mnemon` 是 1487 字节的 `#!/usr/bin/env node` stub：`node -e ''` 50ms、`mnemon --version` 90ms、`mnemon completion bash` 100ms ⇒ 现状是**每开终端 +100ms 并吐 37 行错误、什么都不做**。

### 修法

| | 做法 | 开 shell 成本 | 补全 | 缺点 |
|---|---|---|---|---|
| A | 改对：`eval "$(mnemon completion bash)"` | +100ms/次 | ✅ | 每次开终端跑一次 node |
| B | 预生成后 source：`mnemon completion bash > ~/.bash_completion.d/mnemon.bash`，`.bashrc` 改为 `[ -f … ] && . …` | ~0ms（实测 0.00s） | ✅ | 升级 mnemon 后需重生成 |
| C | 删掉两行 | 0 | ❌ | 无补全 |

推荐 B：把进程启动从热路径移走；版本漂移的兜底是 `mnemon update` 之后重跑一次生成命令。改完需 `exec bash` 或重开终端。

## 复用要点

- 端口「被占用」先查占用者的 **cgroup 归属**，而不是只看 pid：不在目标 unit 的 cgroup 里 ⇒ systemd 的 restart 逻辑对它无效。
- `Restart=always` 必须配 `StartLimit*`，否则任何持续性失败都会被放大成数千轮空转。
- `localhost` 在双栈机器上是 IPv6 优先，与 `127.0.0.1` 不是同一个后端；排障时永远显式写 IPv4。
- required plugin 失败会污染整个 `startup failed` 计数与 waiting 列表，先找**第一个** required 失败点。
- shell 启动期的噪声多为 rc 文件里 `eval "$(cmd ...)"` 形式，`$( )` 捕获不到 stderr，症状就是「每次开终端刷一屏」。

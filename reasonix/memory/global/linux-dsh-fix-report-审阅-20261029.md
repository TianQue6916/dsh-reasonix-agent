---
id: mem-74c4f17255043fb25fdeb01b141f2813
revision: 1
created_at: "2026-10-28T16:56:58.567Z"
updated_at: "2026-10-28T16:56:58.567Z"
name: linux-dsh-fix-report-审阅-20261029
description: "审阅 Linux 修复报告：§11 定案是端口冲突（ssh -L 3080 占位），但发现 Windows 侧 3080 已空、实际在 3799，隧道现在指向死端口"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 报告本身（`~/.dsh/_linux-dsh-fix/REPORT.md`，443 行，另一个会话 `session-acb405a3` 产出）

结论质量高，而且**自我修正过两次**：
- §0~§7 的主假设是「`compatibility.json` 精确版本豁免失效」，Windows 侧复现过（删掉 → `incompatible=2 / entries 434→432`；跑脚本 → 回到 0 / 434）。
- **§11 把它推翻了**：真实根因是**端口冲突**。

### 定案（§11，Linux 实测）

```
LISTEN 127.0.0.1:3080  users:(("ssh",pid=2715,fd=5))   ← dsh-tunnel.service
ExecStart=/usr/bin/ssh -N ... -L 3080:127.0.0.1:3080 27063@192.168.243.1
```

`ssh -L 3080` 占了 Linux 本地 3080 ⇒ `dsh web --port 3080` 的 `webserver`（required）bind 失败：

```
dsh: startup failed: 2 required plugins did not activate
  webserver (required)  Error: listen EADDRINUSE: address already in use 127.0.0.1:3080
Plugins waiting for services (7): web-runtime / open-in-app / directory-picker /
  harness-dev-context / client-hmr / better-sidebar / message-tree
```

⇒ 用户看到的「一堆错」= **1 条 EADDRINUSE + 7 个级联**，不是 12 条兼容性警告。
判定性实验：`dsh web --port 3099` 立刻起得来 ⇒ 插件健康、版本问题排除。

修法：本地 web 改 3081，隧道留 3080，`daemon-reload` + `reset-failed` + `start`。验收 `active / NRestarts=0 / curl 401`。

### 报告的 4 条方法论教训（值得记）

1. **`startup failed` ≠ `incompatible`**。dsh 至少三类失败，症状都是「报一堆」：插件兼容性门禁（`skipping profile bundle`）／required 插件激活失败（`Failed plugins`）／patch 树合成失败（`duplicate loader entry id`）。**先看 required 插件那条 `Error:`**。
2. **`required` 是放大器**：一条 EADDRINUSE 放大成 1 failed + 7 waiting + exit 1 + systemd 三次重试 failed。
3. 先问「那台机器上到底有什么服务」（`systemctl --user list-units`），别只在插件目录里找答案。
4. **两台机器 ≠ 一份配置**：Linux rc.4 / node v24.21.0 / 12 bundles 含 billion-context；Windows rc.2 / node v24.15.0 / 另一套。互相搬结论必错。

### 顺手修掉的脚本 bug（§11.7，真实环境才暴露）

`resolveBundleDir(binName, packageName, installAnchor, profileDir)` 里 **`installAnchor` 优先**，注释原文「in-box bundle 永远从与运行中 dsh 同一个安装解析，绝不来自 profile 本地副本」。
脚本原来 profile 优先 ⇒ 在 `profiles/node_modules` 捡到陈旧的 `@deepseek-ai/dsh-web-app@0.1.5-rc.3`，拿它比 rc.4 runtime ⇒ 假 FAIL。改成 `installAnchor → profiles/node_modules → profile/node_modules` 后与 `--dump-config` 一致。

## ⚠ 我在 Windows 侧发现的一个**新的跨机漏洞**（报告里没有，那个会话不知道）

报告的 §11.4 说「新端口分工」：
- Linux `127.0.0.1:3081` → Linux 本地 dsh web
- Linux `127.0.0.1:3080` → 经 ssh 隧道到 **Windows 主机 3080**

**但 Windows 的 3080 现在是空的。** 实测（2026-10-29 Windows 侧）：

```
netstat → 只有 127.0.0.1:3799 LISTENING (pid 19924 = DeepSeek Harness)
3080 / 3081 → 无监听
```

⇒ **那条隧道现在转发到一个死端口**，Linux 侧访问 3080 会连不上（或挂住）。
MEMORY.md 里「dsh web 跑在端口 3080」这条已经过时 —— Windows 现在是 **3799**。

**修法（Linux 侧一条命令）**：

```bash
sed -i 's|-L 3080:127.0.0.1:3080|-L 3080:127.0.0.1:3799|' ~/.config/systemd/user/dsh-tunnel.service
systemctl --user daemon-reload && systemctl --user restart dsh-tunnel.service
```

或者反过来：把 Windows 侧 dsh web 固定回 3080（如果 3080 没被别的占）。

## 端口全景（当前真相，2026-10-29）

| 位置 | 端口 | 服务 |
|---|---|---|
| Windows | **3799** | dsh web（Electron 内的 webserver，pid 19924） |
| Windows | 3080 / 3081 | 空 |
| Linux | 3081 | 本地 dsh web（刚修好） |
| Linux | 3080 | ssh 隧道 → **Windows 3080（死端口，需改成 3799）** |

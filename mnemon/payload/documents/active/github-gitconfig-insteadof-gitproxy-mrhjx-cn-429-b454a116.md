---
id: "b454a116-f699-471b-982b-c57f31704689"
title: "GitHub 同步失败根因：~/.gitconfig 全局 insteadOf 劫持到 gitproxy.mrhjx.cn（429）与双机配置对齐清单（2026-10-26）"
description: "2026-10-26 排查：dsh mnemon 的「无法连接到仓库」根因是全局 git url.insteadof 把 github.com 改写到限流镜像（429），删规则后双机 git ls-remote 均 200；另含 Linux bili compress 段缺失对齐、skills/presets/docs 走 Git 的分层方案与机器特定路径处理。"
status: "active"
created_at: "2026-10-25T18:43:45.319Z"
updated_at: "2026-10-25T18:43:45.319Z"
content_hash: "256c13c830fb0dd5c6c3d1bd01d8454955e78f66f738847d2728ccc9a7c0b9b8"
source_paths:
  - ".gitconfig"
  - ".dsh/profiles/web/cordis.patch.yml"
  - ".dsh/logs/dsh-web.log"
  - ".config/billion-context/billion-context.json"
session_ids:
  - "a772cb2b-05ae-4c97-8529-30eeca99aa8d"
memory_body_ids:
  []
---

# GitHub 同步失败根因 + 双机配置对齐（2026-10-26）

**性质**：故障根因调查（含复现与修复证据）+ 同步方案设计结论。相关文档：
`71f2073f-052c-4fc7-8257-5a2a9453e581`（Linux 建会话卡死 / bili gate / ollama 隧道）、
`37e02e35-130b-4cd7-8fd2-9aec17f1f11e`（GitHub 每日备份静默断链）、
`dbffeb3a-718b-436e-b8f1-e4b9850f4b53`（goat-gateway 双机同版）。

## 1. 症状

dsh mnemon 的 Git 同步面板（仓库 `github.com/TianQue6916/reasonix`）持续报
「无法连接到仓库，请检查网络或代理」，点「立即同步」同样失败。

## 2. 根因：全局 `insteadOf` 劫持，压过任何 proxy 覆盖

`~/.gitconfig`（`C:/Users/27063/.gitconfig`）里有：

```ini
url.https://gitproxy.mrhjx.cn/https://github.com/.insteadof=https://github.com/
```

所有 `github.com` 请求被改写为 `https://gitproxy.mrhjx.cn/https://github.com/...`，
该镜像返回 **429（限流）**。关键机制：
**`-c http.proxy=` / `http.proxy` 都覆盖不了 `insteadOf`**，所以「去掉代理直连」和
「换 dev-sidecar 端口 31181」两条试验路径全部仍然撞 429 —— 这解释了为什么
「明显网络是通的、Node 也 200，但 git 就是失败」。

对照证据（同时排除网络与凭据问题）：

- `git version 2.56.0.windows.2`；`git ls-remote` 失败信息里 URL 已是 gitproxy 域名
- Node 侧直连 `info/refs` → **200**；`api.github.com` 仓库查询 → **200**
- 同一台机从这里可以看出：问题只在 git 的 URL 改写层，不在 DNS / 代理 / token

## 3. 修复

只删那条全局劫持，保留其余按域名作用域的镜像规则：

```bash
git config --global --unset-all url.https://gitproxy.mrhjx.cn/https://github.com/.insteadof
```

- 保留的无害项：`http."https://gh-proxy.org".proxy`、`http."https://gitee.com".proxy=""`、
  `credential.https://edgeone.gh-proxy.org.provider=generic` 等分域规则 —— 只对显式使用镜像生效
- 备份：`.gitconfig.bak-<ts>-pre-drop-mrhjx`
- 验收：双机 `git ls-remote` 同一 HEAD

```
Windows: d025b9f1437e88f53cb169eed6ca042459ef9297  refs/heads/master  ✓
Linux  : d025b9f1437e88f53cb169eed6ca042459ef9297  refs/heads/master  ✓
```

Linux 侧 git proxy 为 `https.proxy = http://127.0.0.1:6916`，可正常工作，未改动。

**复用要点**：以后任何「git 连不上但 curl/Node 能通」的故障，第一顺位检查
`git config --global --get-regexp 'url\..*\.insteadof'`，而不是继续调代理。

## 4. 顺带对齐：Linux 的 bili `compress` 段缺失

Linux `~/.config/billion-context/billion-context.json` 原本只有 `{"providers": {}}`，
Windows 侧虽 `providers` 也为空（正常，非必须），但带上整套 `compress`：

```json
"compress": {
  "nudgeGrowthTokens": 150000,
  "preserveRecentTokens": 20000,
  "preserveRecentMessages": 10,
  "injectNudge": false,
  "maxContextLimit": "50%",
  "emergencyThresholdPercent": "90%"
}
```

已同步到 Linux 并重启 dsh-web（`active`）。注意 bili 日志的另一类告警：

```
[warn] bili-native-dsh: request sent DIRECT (uncompressed) — ... is not a recognized
model endpoint ... bili only compresses known protocol paths (/chat/completions, /v1/messages, /responses, …)
```

即 bili 只压缩已知协议路径，custom-wire 端点（如 goat gateway `http://127.0.0.1:8788/v1`
上的 auth/refresh）不会被代理，需要端点级支持。两机 provider 均指向 8788（Windows 走
`commandcode-goat-anthropic`，`api: anthropic-messages`），Linux 侧 18787 未出现在
dsh 配置中时属「未绑定 bili 代理」。

## 5. 方案结论：Git 不止能同步记忆

判断标准是「纯文本 + 有版本意义 + 无运行态」。分层建议（单仓库多顶层目录）：

| 内容 | 路径 | 适合 Git | 备注 |
|---|---|---|---|
| 记忆（mnemon） | `~/.mnemon/` 的 `mnemon/` 子目录 | ✅ | 只同步 md 投影，二进制 db 不进 git |
| skills | `~/.dsh/skills/`（97 目录 / 183 文件） | ✅ 很适合 | 纯文本、diff 友好 |
| agent presets | `~/.dsh/.agent-presets/anchored-standard/`（31 文件） | ✅ 很适合 | 含 .mjs + yml |
| profiles patch | `~/.dsh/profiles/*/cordis.patch.yml` | ⚠️ 有条件 | 含机器特定路径，需隔离 |
| 学习文档 | Linux `~/桌面/待处理文件夹/` | ✅ | 只读同步 |
| sessions / logs / 缓存 | `~/.dsh/sessions`、`logs` | ❌ | 体积大、机器相关、含隐私 |

```
TianQue6916/reasonix
├── mnemon/     ← 记忆 fact
├── skills/
├── presets/    ← anchored-standard（.mjs + yml）
└── docs/       ← 学习文档、笔记
```

**机器特定路径的两种解法**（`cordis.patch.yml` 里有 `D:/Toolbox` vs `/home/tianque`）：
1. 分支隔离：`main` 放共享部分，`win` / `linux` 分支放各自 patch
2. 模板 + 生成：仓库存 `cordis.patch.yml.tmpl`，本地脚本按机器生成实际文件（更干净，约 20 行脚本）

选择 2 的理由：单仓库单分支可持续 `git pull`，避免长期双分支漂移；模板可被 review，
生成物加 `.gitignore`。

**为何 skills/presets 优先级高**：改动有语义、可 `git revert`；本次双机对齐就是因为 Linux 缺
676 行 `agent.cordis.yml` 导致建不了会话，走 Git 后 `git pull` 即可复现该修复。

## 6. 未决 / 后续

- Linux wiki 搜索（`local-search.py`，8810）：token 认证已通（token 文件
  `~/.config/local-search/token`，`x-local-search-token` header + `hmac.compare_digest`），
  但 ZIM 查询超时；`libzim` 3.13.1 已 `pip3 install` 且 `/usr/bin/python3 -c "import libzim"` OK。
  注意 403 的成因是 `TOKEN` 为空或 header 不匹配（`bool(TOKEN) and compare_digest(...)`）。
- 需用户重启 Windows dsh 桌面端使 `NODE_OPTIONS=--dns-result-order=ipv4first`（修 IPv6 直连超时）与新凭据生效。
- 建议对 `skills/`、`presets/` 接入仓库前先做 `--dry-run` 规模与敏感文件审计。

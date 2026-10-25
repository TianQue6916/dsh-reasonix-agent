---
id: "71f2073f-052c-4fc7-8257-5a2a9453e581"
title: "Linux 端「无法新建会话」根因（bili-compaction-gate 注入面）与 ollama embedding 借用 Windows 的 SSH 隧道方案"
description: "2026-10-25/26 Linux dsh 对齐后续：billion-context（bili）bundle patch 只为 preset-standard/ptc/minimal/cordis 注入 biliBasicCompactionPolicy，缺 anchored-standard 使 preset gate 永久 pending 导致建会话卡死（含 Windows patch 的正确绕法）；以及 Linux 无 ollama 时用 systemd user SSH 隧道复用 Windows nomic-embed-text 的 embedding 方案与实测证据。"
status: "active"
created_at: "2026-10-25T18:13:22.901Z"
updated_at: "2026-10-25T18:13:22.901Z"
content_hash: "42d1d55eb344a4f93d05cbb8249dc5efcd87fb4de4a6ad7e9e4496ce734b8e87"
source_paths:
  - ".dsh/profiles/desktop/cordis.patch.yml"
  - ".dsh/profiles/web/cordis.patch.yml"
  - ".dsh/logs/dsh-web.log"
session_ids:
  - "c46ad9bc-51bf-4ac3-925a-ec3dba132288"
memory_body_ids:
  []
---

# Linux 端建会话卡死根因 + ollama embedding 借用方案

**性质**：故障根因调查（含证据链）+ 一次性操作记录。前置工作（gateway 同步、quota 去 PowerShell 化、假 row id 修正）见 `878bd757-1e82-4db3-be40-956d74971f80`；本文只记那份文档之后才暴露的两件事。

环境：Windows 主控（`C:\Users\27063\.dsh`，CLI/桌面端 `0.2.1-rc.2`）+ Linux 远端（`/home/tianque/.dsh`，`0.2.1-rc.3`），两端 config patch 各自维护。

## 一、「无法新建对话」：anchored-standard 缺 bili compaction 注入

### 现象与无效排查
把 `agent-preset-registry` 的 `default` 从 `standard` 改成 `anchored-standard` 后，配置合成（`dump-config`）看着正常、headless 跑一句话 `exit=0`，但 **Web 端新建会话卡死**。

走过的弯路（都不是根因，记下以免重走）：
- `dsh-web.log` 里唯一的 import 报错是 `dsh-thinking-guard` 的 `ERR_MODULE_NOT_FOUND`（包名 vs 目录名不一致），重启后已消失，与建会话无关。
- 探测 `POST /api/sessions`、`/api/session`、`/api/v1/sessions` 全返回 `401 unauthorized` —— 这是**未带 token 的正常鉴权响应**，不代表建会话坏了，不能当证据。
- `dump-config` 里 preset 清单只有 `preset-standard / preset-ptc / preset-minimal / preset-cordis`，`.agent-presets/anchored-standard/preset.yml` 文件本身存在（282 B，order 5）。

### 根因
`billion-context`（bili）插件的 `dsh.bundle.patch.yml` 里有一段自述注释，直接点明了这个坑：

> `#3662`：gate 必须放在**独立常开 entry** `bili-compaction-gate`，因为「the old wiring bricked session creation on exactly that path」—— 禁用 bili-native 时 gate 仍要活着，让 preset 回落到 stock dsh compaction，而不是永久 pending。

而该 patch 只给**四个内置 preset** 注入策略：

```yaml
- insert:
    - id: bili-native
      name: billion-context
    - id: bili-compaction-gate
      name: billion-context/dsh-compaction-gate
- id: compaction-basic
  config:
    auto: false
- id: preset-standard
  inject: [biliBasicCompactionPolicy]
- id: preset-ptc
  inject: [biliBasicCompactionPolicy]
- id: preset-minimal
  inject: [biliBasicCompactionPolicy]
- id: preset-cordis
  inject: [biliBasicCompactionPolicy]
```

`anchored-standard` 不在名单里 ⇒ 它拿不到 `biliBasicCompactionPolicy` ⇒ 该 preset 在等 `bili-compaction-gate` 提供的 service，而 gate 那侧永远不会为该 preset 完成 ⇒ **新建会话无限 pending**。所以「把 default 改成 anchored-standard」这个动作本身就会把 Web 端打死，而 CLI/headless 路径看不出问题。

### 正确修法（Windows 已有先例，Linux 照抄）
Windows 的做法不是在 bundle patch 里补 inject，而是**在 profile patch 里自己 insert 一条 `preset-anchored-standard` 定义**（`C:\Users\27063\.dsh\profiles\desktop\cordis.patch.yml` 与 `C:\Users\27063\.dsh\profiles\web\cordis.patch.yml` 都有）：

```yaml
- id: agent-preset-registry
  config:
    default: anchored-standard

- insert:
    - id: preset-anchored-standard
      name: '@deepseek-ai/dsh-agent-preset'
      config:
        id: anchored-standard
        name: "Anchored Standard (experimental)"
        description: "Bootstrap with the Minimal preset's real tool pair (persistent bash + str_replace_editor) and no auto-injected workspace or skill context, then expose the full Standard catalog after the first durable tool call or reply."
        order: 5
        plugins: ...
```

要点：
- 该 row 是一份**完整的 agent-plane 组合**（`plugins:` 下自带 service 行），不是引用；service 行必须落在带 `isolate` realm 的 group 内，否则会发布到 root realm 与别的 preset 撞名，被 `dsh-agent-presets` 在 mount 时拒绝。
- entry 的 `inject:` 列表是**被 patch 替换而非追加**的（与 `src/launcher.ts` 的 `writeDshAcpPatch` 需保持一致），将来 dsh 自己给这些 entry 发了 inject 列表，两处都要手工 merge。
- 判定「patch 打到空处」的快速办法：grep `dump-config` 输出的 row id。此前把 override 打在 `- id: agent-presets`（不存在的 row id）上，导致 `default: anchored-standard` 从未生效，就是这么查出来的。
- **不要**为了省事去 disable `bili-compaction-gate` 本身：它承载 preset 等待的 service；真要卸 bili，从 `dsh.profile.bundles` 里移除 `billion-context`。

### bili 在 Linux 上的其余观察
- `127.0.0.1:18787` 有 proxy 在 LISTEN（pid 归 `MainThread`），但没有 bili/ccr 独立可执行 —— 该插件是纯 node。
- Windows 侧日志显示的是另一类问题（多版本争端口）：`rotating stale proxy … ours is v0.1.204 … requesting graceful shutdown before taking over port 18787`，以及 `fork adoption … degraded (snapshot http 409 SNAPSHOT_UNAVAILABLE)`、`watcher registration failed`。这些都是 proxy 生命周期/版本竞争噪声，不是「插件用不了」的根因。

## 二、ollama embedding：不装模型，借 SSH 隧道用 Windows 的

### 事实（实测）
- Windows：ollama `0.34.4`，模型 `nomic-embed-text:latest`（0.3 GB），embedding `dim = 768`；但**只监听 `127.0.0.1:11434` / `[::1]:11434`**，不是 `0.0.0.0`，LAN 直连不可达；`OLLAMA_HOST` 环境变量未设置。
- Linux：**没有 ollama**，`11434` 未监听，但 `profiles/web/cordis.patch.yml` 已经写好了 `embedding: { endpoint: http://localhost:11434, model: nomic-embed-text }`。

### 方案
利用现有 SSH 链路把 Windows 的 11434 映射到 Linux 的 `localhost:11434`：**两侧配置都不改、Windows 不暴露端口**，只补一条隧道。

```ini
# ~/.config/systemd/user/ollama-tunnel.service → systemctl --user enable --now ollama-tunnel.service
```

已验证：
- 隧道后 Linux `localhost:11434` 处于 LISTEN，`{"version":"0.34.4"}` 可读，`models: nomic-embed-text:latest` 可见，**embedding dim = 768**（与 Windows 本地一致）。
- 服务 `enable --now` 已做，开机自启。

注意点：隧道属于**依赖 Windows 在线**的软依赖 —— Windows 关机或 SSH 链路断，Linux 的 embedding（即 mnemon 类记忆检索）会退化/超时。若将来要脱钩，再在 Linux 本地跑 ollama 并保留同名 `localhost:11434` 即可，配置无需变更（反过来也可以说明：「endpoint 写成 localhost」这一约定让本地/隧道两种实现可以互换）。

## 相关路径
- Linux：`/home/tianque/.dsh/profiles/web/cordis.patch.yml`（embedding 段 ~L639）、`/home/tianque/.dsh/logs/dsh-web.log`、`/home/tianque/.dsh/.agent-presets/anchored-standard/preset.yml`、`node_modules/billion-context/dsh.bundle.patch.yml`
- Windows：`C:\Users\27063\.dsh\profiles\desktop\cordis.patch.yml`、`C:\Users\27063\.dsh\profiles\web\cordis.patch.yml`

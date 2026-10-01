---
id: mem-8c4a73ce5e05f6766364c3cc1243b43e
revision: 1
created_at: "2026-09-27T17:32:33.104Z"
updated_at: "2026-09-27T17:32:33.104Z"
name: gap-6-7-decision-brief-20260928
description: "#6/#7 的完整决策依据：从 catalog 提取各候选的 capabilities 与 capabilityRedLines，含\"redLines 为空≠安全\"\"capabilities None=风险未知\"两条读法；指出 ★8037 的 dsh-web 系插件权限面未标注、推荐能力面明确的 ds-harness-remote ★224"
metadata:
  type: user
  fact_type: reference
  scope: global
---

#6 remote_control / #7 computer-use 的决策依据（2026-09-28 从 catalog 的 capabilities / capabilityRedLines 字段提取）

## ⚠️ 先读这条：怎么用 `capabilities` 和 `capabilityRedLines`

- **`capabilityRedLines`**：官方目录标注的**具体安全隐患**（如 `reads credentials/secrets AND has network access`、`uses plaintext http:// to ...`）
- **`redLines: []` ≠ 安全** —— 它只表示**没匹配到已知危险模式**
- **`capabilities`**：插件声明自己会用到什么能力，是判断风险面的**主要依据**：
  - `fs-read` / `fs-write` —— 读写文件
  - `shell` —— 执行命令（**高权限**）
  - `host-runtime` —— 接宿主运行时（**最高权限**）
  - `network` / `env` —— 联网 / 读环境变量（**能读到 API key**）
- **`capabilities: None` 表示目录没抓到声明 → 风险未知，不是"没有能力"**

## 一、#7 computer-use 候选

| 插件 | ★ | capabilities | redLines |
|---|---|---|---|
| **`Anionex/dsh-computer-use`** | **46** | `shell, fs-write, fs-read, network, env, **host-runtime**` | `[]` |
| `988hj7tczd-oss/dsh-computer-use` | 36 | `shell, fs-read, network, env`（**无 fs-write**） | `[]` |
| `jiayan-xu/dsh-nuphus-mcp` | 0 | `shell, fs-write, fs-read, env`（`nuphus-mcp` 的 dsh 封装） | `[]` |
| `mrpulor-gh/nuphus-mcp`（非 dsh 插件，通用 MCP） | **313** | — （Rust 单二进制，MCP stdio） | — |
| `AzaiSakura/dsh-computer-use` | 15 | — | — |
| `qphotoai/dsh-computer-use-windows` | 5 | — | — |
| `mekos2772/dsh-plugin-mimi` | 4 | — | — |

**推荐顺序**：
1. **`mrpulor-gh/nuphus-mcp` ★313** —— 通用 MCP（dsh 自带 `@deepseek-ai/dsh-mcp-client`，可直接挂），
   **不绑 dsh 版本**，Rust 单二进制、无 daemon、本地 OCR、vision BYOK；**但它不是 dsh 插件，权限面由 MCP 进程自己决定**
2. **`Anionex/dsh-computer-use` ★46** —— 原生 dsh 插件，★最高，但 **capabilities 含 `host-runtime`**（最高权限档）
3. `988hj7tczd-oss/dsh-computer-use` ★36 —— 能力面**少一个 `fs-write`**（相对更保守）

## 二、#6 remote_control 候选

| 插件 | ★ | capabilities | redLines |
|---|---|---|---|
| `zhu1090093659/dsh-web#dsh-remote-web-ui` | **8037** | **None（未标注）** ⚠️ | `None` |
| `zhu1090093659/dsh-web#dsh-ssh` | 8037 | **None（未标注）** ⚠️ | `None` |
| `saya-ch/dsh-mobile` | 319 | None | None |
| `ZSeven-W/dsh-ios` | 308 | `shell, dynamic-code, fs-rw, network, env` | `[]` |
| **`liguobao/ds-harness-remote`** | 224 | `shell, fs-write, fs-read, network, env` | `[]` |
| `wenbin-wb/dsh-bridge` | 177 | 同上 | `[]` |
| `ZSeven-W/dsh-android` | 163 | 含 `dynamic-code` | `[]` |
| `Buzzso/dsh-sev` | 137 | `shell, fs-write, fs-read, network, env` | `[]` |
| `mexiaosqwq/dsh-web-mobile` | 105 | `fs-write, fs-read, network`（**较轻，无 shell**） | `[]` |
| `mrRisega/dsh-remote#dsh-remote-web` | 62 | `shell, fs-write, fs-read, network, env` | `[]` |

**⚠️ 关键警告**：★8037 那两个（**同一个 monorepo `zhu1090093659/dsh-web` 出的**，该仓库同时出 7+ 个插件）
**capabilities 是 `None`** —— **目录没抓到权限声明 → 风险未知**。
**star 数高 ≠ 权限面清楚**，这两个反而**比 ★224 的 `ds-harness-remote` 更难评估**。

**推荐顺序**：
1. **`liguobao/ds-harness-remote` ★224** —— 能力面**明确**（shell/fs-rw/network/env），
   且描述强调「**安全、低延迟、端到端加密**」，多端覆盖（Win/macOS/Linux 桌面 + Web + Android）
2. `mexiaosqwq/dsh-web-mobile` ★105 —— **能力面最轻**（无 `shell`），如果只要"手机上看/发消息"这个够用
3. ★8037 那两个 —— **除非先读源码确认权限面，否则不建议**

## 三、我方建议（不变）

- **#7**：先只上**隔离实例**（3099），优先 `mrpulor-gh/nuphus-mcp`（通用 MCP，不绑版本）或 `Anionex/dsh-computer-use` ★46
- **#6**：**建议不做** —— 现有的 `dsh-remote`（SSH + schtasks）+ GOAT 网关已能远程派任务；
  而 remote_control 的本质是「**在网络上开一个能驱动你 agent 的口子**」，收益不如风险
- **若确实要做 #6**：选 `liguobao/ds-harness-remote`（能力面明确 + E2E 加密），**不要**选那两个 capabilities 未标注的 ★8037

## 四、查询脚本（可复用）

```bash
python -c "
import json
d = json.load(open(r'C:\Users\27063\.dsh\storages\plugins.json', encoding='utf-8'))
for p in sorted([x for x in d['plugins'] if (x.get('category') or '')=='remote'], key=lambda x: -(x.get('stars') or 0))[:10]:
    nm = str(p.get('owner') or '')+'/'+str(p.get('name') or '')
    print(f\"{nm[:42]:42s} {p.get('stars') or 0:>5}★\")
    print(f\"   caps: {p.get('capabilities')}  red: {p.get('capabilityRedLines')}\")
    print(f\"   install: {str(p.get('install'))[:84]}\")
"
```

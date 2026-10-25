---
id: "878bd757-1e82-4db3-be40-956d74971f80"
title: "Linux goat-gateway 落后 12 天同步修复：quota 服务去 PowerShell 化、agent preset row id 修正、local-search 五源升级"
description: "2026-10-25/26 把 Linux 端 goat-gateway 从 10-02 版同步到 Windows 当前版的实施记录：新写 goat-usage.mjs 替掉 PowerShell 调用、state.json 陈旧 cooldown 导致「已尝试 无」的根因、agent-presets 假 row id 使 preset 从未生效、NODE_OPTIONS ipv4first 反效果，以及全链路实测结果与 Windows 升级待办。"
status: "active"
created_at: "2026-10-25T18:06:32.138Z"
updated_at: "2026-10-25T18:06:32.138Z"
content_hash: "8a417487789d02d1b112acfb6d5a019f3e3d00fbdc6ce220862b66a2b919078e"
source_paths:
  []
session_ids:
  - "99d826c6-e912-4b89-aff3-866f37f763bc"
memory_body_ids:
  []
---

# Linux goat-gateway 同步修复（2026-10-25/26）

**性质**：实施 + 排障记录。前置双机同版上线见 `dbffeb3a-718b-436e-b8f1-e4b9850f4b53`，
priority / quota weight 见 `2932c579-9670-4cb7-b244-7edf4a23e9bb`，403 taxonomy 与 reasoning-filter
见 `fa611c46-9dc6-42aa-93a8-1002be2468bd`。

**触发**：用户怀疑 Linux 网关落后 Windows。结论——**落后 12 天主版本**（`gateway.mjs` 1643 行 / 10-02，
Windows 1894 行），且 dsh 侧 4 个插件缺失、preset 从未生效。

## 一、改动清单（Linux = `/home/tianque/goat-gateway`，Windows = `D:\Toolbox\goat-gateway`）

| 项 | 修复前 | 修复后 |
|---|---|---|
| `gateway.mjs` | 1643 行，0 处 `reasoning-filter`、0 处 `bodylog` | 1894 行（同步 Windows 版），补丁各 4 / 3 处 |
| key 池 | 163 启用（月额度已超支）且是 stickyKey；`deepseek-official` 在池中报 401 | `163=off`、`qq=on`，与 Windows 一致；`priorityTiers: {"100":2}` |
| 额度服务 | `quota-http.mjs` 调 `powershell -File goat-usage.ps1`，Linux 无 PowerShell → spawn ENOENT | 新写 `goat-usage.mjs`（node，`https.request` + `family:4` 钉 IPv4），`quota-http.mjs` 改为 `path.join(HERE_DIR,'goat-usage.mjs')` |
| agent preset | patch 覆盖的 row id 写成 `- id: agent-presets`（dsh 中不存在），`default: anchored-standard` 从未生效 | 改为正确 row id `agent-preset-registry` |
| local-search | 11,298 B / 9-27，无 `deepseekSearch` / `searchBing` | 47,238 B 五源版（github / deepseekSearch / bing / wiki / goat） |
| 其余插件 | 缺 `dsh-headroom`、`dsh-plugin-message-edit`、`@ethanwong-hk/dsh-thinking-guard`、`@local/dsh-thinking-language` | 全部装上，bundles 补齐到 15 个 |

`quota-http.mjs` 同时把 `HITLOG` 从硬编码 Windows 路径改为 `path.join(HERE_DIR,'logs','balance-hits.log')`；
`SCRIPT` 默认值仍保留 `GOAT_USAGE_SCRIPT` 环境变量覆盖，便于回滚。

## 二、三个可复用根因（比改动本身更值钱）

1. **`agent-presets` 是不存在的 row id** —— 31 个 preset 文件（`agent.cordis.yml` 25,955 B）与插件都正常，
   但 cordis patch 打在了空处，所以运行时始终走官方 `standard`。**诊断口诀**：patch 不报错 ≠ 生效；
   用 `dump-config` 看实际值（此处 `default: anchored-standard`）才算验证过。正确 row id 是 `agent-preset-registry`。
2. **`NODE_OPTIONS=--dns-result-order=ipv4first` 是反效果** —— 以为是 IPv6 优先导致 fetch 超时，
   加上反而 `fetch failed`，不加却 200。撤掉该 env，改为在代码里 `https.request({ family: 4 })` 精确钉死才稳。
   教训：不要用全局 DNS 策略去修单点超时。
3. **`state.json` 里带 `cooldownReason: "network"` 的陈旧冷却** —— 重启不清，导致 `attempted` 集合为空，
   客户端只看到 503「所有 key 均失败（**已尝试 无**）」。修法：删 `cooldownUntil` + `sessions` 后重启网关。
   **判据**：错误串里 `已尝试 无` ⇒ 一定是全部 key 处于冷却，而不是 key 真失效。

（相关：403 里「model 未绑 provider」与「key 失效」不同类，见 `fa611c46` 的 taxonomy；本网关强制
`accept-encoding: identity` 以保住文本判别，否则 gzip 体让 `isModelNotInPlan` / `cooldownReason` 全部失配。）

## 三、验证结果（实测，非推断）

```
/health     : ok=true  quotaSync=true resetWindow=month  sticky=qq
/v1/models  : 93 models
/quota      : ok=true  qq 5h=0.33/14  月剩 48.9（cap 口径与 Windows 相同）
补全实测     : "GOAT_OK"  usage.total_tokens=50  ← 真打上游
搜索四源     : aggregator:8810 / github api / bing html / deepseek search 均 200
三服务       : dsh-web / goat-gateway / goat-quota-http 全 active
remote       : server control connection online
preset       : dump-config 显示 default: anchored-standard
```

## 四、未做 / 待办

- **Windows 本端未升级**（用户要求最后做）：Windows 仍是 CLI `0.2.1-rc.2` + 桌面端 asar 内置 `0.2.1-rc.2`，
  Linux 已 `0.2.1-rc.3`。桌面端升级需整体替换 `app.asar`（174 MB，Electron 44.7.0），**会中断当前会话**，
  必须在用户收尾会话后执行，并先让用户验收 Linux 侧（新建会话看 preset、额度面板是否显示）。

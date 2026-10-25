---
id: "5a23e31e-2a60-4a54-8ff5-de5a9457e00d"
title: "local-search 搜索条目上限抬到 74（deepseekSearchCount=50 为 API 硬顶）与三端同步要点"
description: "2026-10-26：dsh-plugin-local-search 的条目上限从 30 抬到 74（= 三源 24 + deepseek 50）。依据：DeepSeek search API 的 count 上限硬性为 50（count=51 直接 400）。要点是两处 min 语义必须同时抬：provider 的 cfg.maxResults 与 dsh-tool-web 的 searchMaxResults，取较小值的那一层会卡住结果。实测 74 条、耗时 3.3 s，分布 github14/deepseekSearch45/bing9/wiki6。引用 5bc25216 与 f1153ee7。另附 bili 在 Linux web profile 的排查证据链与因果修正（配置侧完整、sessions 为 0 不等于 hook 失效）。"
status: "active"
created_at: "2026-10-25T19:01:15.781Z"
updated_at: "2026-10-25T19:01:15.781Z"
content_hash: "ee8a6626f2a1981115a1c7d0c5efde57ad57fb65beebb7d521a2e78b7ae15989"
source_paths:
  - ".dsh/profiles/desktop/cordis.patch.yml"
  - ".dsh/profiles/headless/cordis.patch.yml"
  - ".dsh/profiles/web/cordis.patch.yml"
session_ids:
  - "742c31ac-96b5-45c6-ae95-57971efe2002"
memory_body_ids:
  []
---

# local-search 条目上限 74 与 bili 排查证据链（2026-10-26）

引用：`5bc25216`（maxResults=30 时期的收尾）、`f1153ee7`（tool-web 恒传 8 的隐藏上限与 min 语义）、`4c81a283`（Bing 源）。

## 一、搜索条目上限：24 + 50 = 74

用户对期望结果的表述：「搜索条目最后给出的就是三个端的 24+deepseek 的那个上限条目数」——即三条 HTML 源各 8 条（24）加上 deepseek 的一路 50 条。

### 两个硬约束

1. **DeepSeek search API 的 `count` 上限是 50**。实测 `count=51` 直接返回 400：`'count' must be between 1 and 50`。因此 `deepseekSearchCount: 50` 就是硬顶，不能再抬。
2. **`search()` 里是取较小值**：
   ```js
   const maxResults = Math.max(
     1,
     Math.min(Number(request?.maxResults || cfg.maxResults || 8), Number(cfg.maxResults || 8)),
   );
   ```
   只改 provider 的 `cfg.maxResults` 不够，`dsh-tool-web` 传下来的 `request.maxResults`（由 `Config.searchMaxResults` 决定）那一刀也必须同时抬到 ≥ 74，否则被它截断。

### 落地值（desktop / headless / web 三端全部同步）

| 配置项 | 值 | 位置 |
|---|---|---|
| `deepseekSearchCount` | 50 | 各 profile 的 local-search 插件 config |
| `maxResults` | 74 | 同上（provider 侧总输出） |
| `searchMaxResults` | 74 | `@deepseek-ai/dsh-tool-web` 块内（desktop / web 有该块；headless 无此条目） |

注意：`bili plugin install` 式的自动遍历会卡在 desktop（Electron 独占），profile 级改动需逐个 profile 手工核对；web profile 原本在 tool-web 块内**没有** `searchMaxResults` 这一行，需手工插入（注意 14 空格缩进层级）。

### 实测（绕开 dsh 直接 import provider 跑）

```
耗时 3328 ms | 总条数 = 74 | truncated = true
按源分布 = {"github":14, "deepseekSearch":45, "bing":9, "wiki":6}
```

分布不是严格的 8/8/8/50：`mergeSources(groups, maxResults, {interleave})` 先给每个源配额 `ceil(maxResults / 来源数)` = `ceil(74/4)` = 19，再按 `SOURCE_RANK`（github 0 → deepseekSearch 1 → bing 2 → goat 3 → deepseek 4 → wiki 5）回填剩余名额，所以命中多的 github 拿 14、deepseek 拿 45、总数正好 74。`dropped` 字段在实际返回中为 undefined，被 dsh 的 `truncated` 取代。

### 测试方法上的坑

`LocalSearchProvider` 的构造签名是 `constructor(getConfig, web)`，`getConfig` 是注入的函数而不是方法。测试脚本必须 `new LocalSearchProvider(() => config, fakeWeb)`，否则报 `TypeError: this.getConfig is not a function`。provider 导出为 `{ LocalSearchProvider, DEFAULT_CONFIG, mergeSources, SOURCE_RANK, name, inject }`。

## 二、bili（billion-context）在 Linux web profile 的排查

结论方向：**配置侧是完整的，坏的不是配置**。

| 检查 | 结果 |
|---|---|
| `bili doctor` | `dsh:web` lane 存在，`stale 0.1.206 → 0.1.208`，host-managed |
| `bili plugin list dsh` | installed as a dsh bundle in **1/4 profiles**，version 0.1.206 |
| `dsh --profile web --dump-config` | L2015 `- id: bili-native`、L2017 `- id: bili-compaction-gate` 均在，另有 `biliBasicCompactionPolicy` 多处 |
| `bili plugin install dsh` | 卡在 desktop：`profile "desktop" is managed exclusively by the Electron application`；CLI 不支持 `--profile` 选项 |
| `~/.dsh/profiles/web/sessions/` | **0 个会话文件** |
| `/__bili/sessions` | `{"sessions":[],"total":0}` |
| nudge 计数 | 0 |

### 机制（社区文档）

- 两条接入路径：① **启动器** `bili dsh`，经 `--patch` overlay（`~/.dsh-bili/.bili-acp.patch.yml`）注入完整原生插件；② **Profile 安装（免启动器，统一泳道 #966）** `bili plugin install ...`。
- PR #3451 明确指出 overlay「rides an **INTERNAL** dsh hook and is **version-sensitive**」——即对 dsh 版本敏感，rc 级升级可能失效。

### 因果修正（重要，同一类错误犯过两次）

`~/.dsh/profiles/web/sessions/` 为 0 **不能**证明 hook 失效。web profile 是 server 模式（`dsh web --port 3080`，systemd `dsh-web.service` 直接 `ExecStart=/home/tianque/.local/bin/dsh web --port 3080`，既没走 `bili dsh` launcher 也没跑过 `bili plugin install`），如果 ACP 层压根没连上模型，就不会有 LLM 请求发出，bili 零记录是必然结果。**「0 记录」与「hook 坏了」是两回事。**

同理，早先用 headless profile 测 bili 从设计上无效：`grep -c bili` 在 headless 配置里为 0，它不加载 bili。

### 验证的唯一入口

web / server 模式没有「跑一句话就退」的 CLI 入口，触发 bili 必须**在 web UI 里发一条消息**，然后看 nudge 计数是否从 0 变非 0。在没确诊前把 Linux 降回 `0.2.1-rc.2` 属于无证据动手术。

## 三、环境备注

- Linux 侧：`bili` 未加入 PATH，但 `node_modules/.bin`/`dist/index.js` 可直跑；`bili` 顶层子命令含 `dsh`、`doctor`、`export`、`plugin`（`install|remove|update|list <agent>`）。
- Windows 侧备份失败一次：`index.js.bak-...` 写入被拒绝（目标目录权限），`D:\80-系统\Toolbox\goat-gateway\dsh-plugin-local-search\index.js` 需要换有权限的目录做备份再改。

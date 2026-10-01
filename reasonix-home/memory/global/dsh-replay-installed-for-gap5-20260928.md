---
id: mem-dcbdd82d38dcfe12410f0e148a9fe953
revision: 1
created_at: "2026-09-27T16:46:29.059Z"
updated_at: "2026-09-27T16:46:29.059Z"
name: dsh-replay-installed-for-gap5-20260928
description: "用最强方案补齐 #5：装 @mingozhou/dsh-replay 0.4.1（会话回放 + fork lineage + audit + cost）并隔离验证通过；查明 dsh-conversation-map 存在两个同名不同作者的仓库（一个 minimap 一个血缘），且真正对口的那个不成熟；#5 最终形态为自研离线导出 + 社区在线审计互补"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 一、#5 thread_spawn_edges 的候选评估（2026-09-28）

**objective 只把 #6/#7 列为"需拍板"，#5 不需要** —— 所以我按"用最强方案"继续补。

**查证结果：#5 的直接替代品其实不成熟**：

| 方案 | ★ | 状态 | 功能 |
|---|---|---|---|
| **`xyAxzy/dsh-conversation-map`** | 1 | **npm 无包、README 404、仓库 1 个月未更新** | 实时会话树 + **subagent lineage** ← 功能最对口但不成熟 |
| **`afoxsss/dsh-conversation-map`** | 3 | npm `dsh-conversation-map` 0.1.8 | **聊天 minimap**（右侧缩略图导航）← **同名不同物，不是血缘** |
| **`MingoZhou/dsh-replay`** | **11** | **npm `@mingozhou/dsh-replay` 0.4.1**，`redLines: []` | replay + 逐 step token + **audit** + **cost** + **view fork lineage** + compare + 导出 HTML |
| `dsh-thread` | — | npm 1.2.0，**peerDeps `^0.1.5-rc.1` 与本机 0.1.7-rc.2 按 npm 预发布规则不匹配** | session memory + lineage |
| 自研 `thread-edges.mjs` | — | **已验证可用** | 静态导出派发树（session→workflow→agent）+ DOT |

**⚠️ 陷阱：`dsh-conversation-map` 有两个不同作者的同名仓库，功能完全不同** —— 查 catalog 时必须看 `owner`，不能只看名字。

## 二、装了什么：`@mingozhou/dsh-replay` 0.4.1

```bash
dsh plugin --profile web add @mingozhou/dsh-replay
```

**实测**：
- `bundles` **自动追加** ✅（`dsh plugin` CLI 的又一好处）
- **隔离验证**：`dsh --profile web --port 3099 --no-open` 正常启动（HTTP 401），验后杀实例，**3080 未受影响**
- `dump-config`：`# == @mingozhou/dsh-replay` / `- id: replay` / `name: @mingozhou/dsh-replay` / **`routePrefix: /replay/api`**
- **路由活性实测**：`GET /replay/api` → `404 {"error":"unknown replay endpoint"}`
  （**返回结构化 JSON 错误 = 路由已注册**，只是我猜的端点名不对；`/replay/api/sessions`、`/status` 同样 404）

**capabilities**：`fs-write / fs-read / network / env / host-runtime`；`capabilityRedLines: []`（**无红线**）

备份：`package.json.bak-20260928-0044-pre-replay` / `pnpm-lock.yaml.bak-20260928-0044-pre-replay`

## 三、当前 web profile bundles（9 个）

```
@deepseek-ai/dsh-base
@deepseek-ai/dsh-web-app
@local/dsh-plugin-goat-panel      (自建：goat 额度面板)
dsh-deja                          (会话检索，跨 35 harness)
dsh-plugin-local-search           (自建：本地 wiki + GitHub 搜索，第一优先)
dsh-headroom                      (工具输出可逆压缩)
dsh-mnemon                        (三层记忆)
dshmarket                         (插件市场 ★4695)
@mingozhou/dsh-replay             (会话回放 + fork lineage + audit)
```

## 四、#5 的最终形态：**自研 + 社区互补**

- **`thread-edges.mjs`（自研，保留）**：**静态导出**派发树，零依赖，可离线跑，输出 JSON + Graphviz DOT
- **`dsh-replay`（已装）**：**在线回放 + 血缘 + 审计 + 成本估算**，有 HTTP API 与 UI

两者不冲突：一个做**离线取证**，一个做**在线审计**。这比单装任一个都完整。

## 五、方法论沉淀

1. **装插件用 `dsh plugin --profile <name> add <pkg>`**，它会自动处理 `bundles`（`pnpm add` 不会 —— 我在 dsh-mnemon 上踩过）
2. **同名插件必须核对 `owner`**（`dsh-conversation-map` 就是两个完全不同的东西）
3. **`routePrefix` 是验证插件是否真加载的好判据**（比只看 bundle 名更实）
4. **隔离验证后再杀实例**，全程 `3080`（PID 52540）不受影响

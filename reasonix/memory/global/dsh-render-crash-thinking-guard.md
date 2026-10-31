---
id: mem-e8ec4453b08d50d8a9ceda917583ebc5
revision: 1
created_at: "2026-10-27T19:05:46.618Z"
updated_at: "2026-10-27T19:05:46.618Z"
name: dsh-render-crash-thinking-guard
description: "dsh 渲染崩溃根因链（thinking-guard v4 source kind）+ 平台差异 + 待办"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 结论（2026-10-28 实测）

**dsh 对话窗空白 / 历史消失 / "请求失败" 的主因之一**：`@ethanwong-hk/dsh-thinking-guard@1.0.2` 熔断时注入的两条 user message 用的是 **v4 已退役的 `source.kind: 'plugin'`**。

### 机制（三层证据）
1. **代码**：`node_modules/@ethanwong-hk/dsh-thinking-guard/lib/index.js:309` 与 `:334`，`notify()` / `notifyContinue()` 都写 `source: { kind: 'plugin', plugin: 'thinking-guard', form: 'notice', summary }`。
2. **官方源码**（`session-format-v3-to-v4/src/message-sources.ts` 注释）：`Native source admission ... refuses retired plugin wrappers`；`assertV4RowAdmission` 拒 `kind === 'plugin'`。
3. **社区同源 bug 至少 6 处**：dsh-memory-md / dsh-autofork commit cb7b2f4 / dsh-UEAssetsOperator#3 / dsh-browser-use#1 / MemOS#2405 / hindsight#4626 / dsh-effort-slider#3。

### 两平台表现不同（关键）
| | 拦截层 | 症状 |
|---|---|---|
| Windows 0.2.1-rc.2 | `createUserMessage` schema 层 → 日志 `注入说明失败： unreachable variant` | **无排队消息**，只是熔断功能失效 |
| Linux 0.2.1-rc.3(CLI)/rc.2(bundle) | 内存 `Session.append` 放行、落盘才拒 | **2 条排队消息可见** → 落盘拒 → 持久化缓冲卡死 → **后续请求全废** |

内存层不查、写侧才查，见 LingyeSoul/DSH-SoulMojito `decisions/2026-09-30-session-format-v4-producer-source.md`；"被拒行卡在缓冲头部、此后每个 checkpoint fail-closed" 见 dsh-memory-md README。

### 已修
`kind: 'plugin'` → `kind: 'plugin:thinking-guard'`，**三端各 2 处**（`profiles/web`、`profiles/desktop`、Linux `profiles/web`），各留 `.bak-*-pre-v4-source`。**注意：`dsh plugin add` 会覆盖，重装必须重改。**

### 但修复 ≠ 能启用
2026-10-28 把 `enabled` 从 false 改 true 后**渲染立刻又崩**（两平台）。说明注入路径还有别的问题。**当前三端均 `enabled: false`**。

### 熔断判据实测（作者源码 `lib/index.js:58-90` 注释，40 条真实退化 + 163 条正常 reasoning）
- `novelty`（窗口 4096、阈值 0.20）：**检出 40/40、误报 0.6%**、中位命中 6144 字符
- `sparse-repeat`：检出 40/40、**误报 9.2%**、中位命中 3072 字符
- 误报样本形如 `sample: "0."` / `"v4."` —— **有序列表编号、版本号、表格分隔线**，非语义重复

### 若要重启用（未验证）
```yaml
- id: thinking-guard
  config:
    enabled: true
    notify: false          # 核心：完全不注入消息，只 cancel
    autoContinue: false
    sparseWindow: 0        # 关掉误报 9.2% 那档
    noveltyWindow: 4096
    noveltyThreshold: 0.2
```

### 同族次要线索
- `dsh-scroll-boost@0.6.0` 曾装到四端（2026-10-28），「全部崩溃」后**已全撤**，未验证是否元凶。
- `idle-loop-guard.mjs`（自写 preset）加载块三端已删；其 `enabled` 配置项在代码里未读取（真 bug）。

---
id: mem-df3e9f0813adc8ba1eb4ab1e86cbef5f
revision: 1
created_at: "2026-09-26T15:35:32.051Z"
updated_at: "2026-09-26T15:35:32.051Z"
name: dsh-community-plugin-landscape-20260926
description: "dsh 社区插件清单（476 个仓库，含直接对应我缺口的 headroom/token/goal/recall/session-lab）+ 出网限制（web_search 402、bash 无网）+ 「应先调研社区再自写」的流程教训"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# dsh 社区插件landscape + 出网限制（2026-09-26）

## 一、出网现状（两条路都断）

- `web_search` 工具：HTTP **402 Insufficient Balance** —— endpoint 指向 `https://api.deepseek.com/anthropic/v1/messages`，与主力用的 GOAT 网关是两条独立线
- `bash` / `curl`：沙箱内**无网络**（`curl` 返回 000）
→ 结论：**当前无法现场调研社区**，只能靠快照

修法（只有用户能改）：Settings > Plugins > Plugin configuration > Web search 改 Endpoint；或设 `DEEPSEEK_SEARCH_BASE_URL` / `web-search-deepseek.baseURL`

## 二、社区插件清单（从 2026-09-26 会话归档的 GitHub topic 快照提取）

- 原始条目 930 → 去噪后**真实插件仓库 476 个**
- 已持久化：`~/.dsh/storages/community-plugins-20260926.txt`
- 提取方法：从 `新的会话.md` 的 `(/owner/repo)` 链接模式正则提取 + 去 stargazers/docs/topics 噪声

### 分类统计（按仓库名关键词）
memory 83 / skill 75 / browser 27 / ui 15 / mcp 7 / wiki 6 / ppt 4

### 直接对应本次 Codex 对标缺口的
| 我的缺口 | 社区对应物 |
|---|---|
| #3 token 预算 / 成本闸门 | `WODE25500/dsh-token-headroom`、`giter00/dsh-headroom`、`WODE25500/dsh-token-caveman`、`dsh-token-rtk`、`dsh-token-handoff`、`dsh-token-skills`、`vibe-any/dsh-plugin-save-token`、`knighthongyu/dsh-handoff-compaction`、`FleetingEcho/dsh-handoff`、`eve1329/dsh-shared-handoff` |
| #3 goal 维度 | `GooDAnDReaDY/dsh-goal` |
| 记忆召回 | `Relistencode/dsh-recall`、`truelove-dreamer/dsh-plugin-recall` |
| #2 会话索引 | `zhangguiping-xydt/dsh-session-lab` |
| #1 记忆 | 83~101 个（`dsh-auto-memory` 多个同名、`dsh-memory-triage`、`dsh-observational-memory`、`dsh-project-memory`、`dsh-memory-connect`…） |

**关键洞察**：`headroom`（上下文余量）一词出现两次 → 社区把"预算"理解成**上下文余量管理**，而不只是成本累计；这是我自己没想到的切入口。

## 三、诚实结论：流程缺陷

用户指出「按理来说这些都有社区的成熟方案和思考，你也可以看看」——**是对的**。我在做 memory / session-index / token-budget 时都**没有先做社区调研**，属于流程缺陷：应该先看社区（哪怕只是读 README 学设计），再决定自写还是复用。

自写版本仍有的独特理由（需保留记录，未来对比时用）：
- `memory.mjs`：**与 reasonix 语料共用同一份**（社区插件都用自己的存储格式，必然分叉）
- 三个插件全部**零依赖 + 只读/最小写入**，与 preset「零常驻注入」哲学一致
- 但这些都是"事后理由"，不改变"应先调研"的结论

## 四、待办
1. **修 web_search endpoint**（用户操作）→ 之后逐个读上述仓库 README，与自写版本做一次正经对比
2. 在对比完成前，**暂停继续自写 #4~#7**（agent_jobs / spawn_edges / remote_control / computer-use），避免重复造轮子

## 五、当前未挂载的半成品
`token-budget.mjs` 已写完并通过语法检查，但**尚未挂进 `cordis.patch.yml`**（未生效，可直接丢弃或对比后再决定）。

---
id: mem-32ebbe29a372b1e6dcc617e60de85b43
revision: 1
created_at: "2026-10-25T19:37:15.240Z"
updated_at: "2026-10-25T19:37:15.240Z"
name: dsh-reasonix-agent-kb-index
description: "经验库 kb/ 在 dsh-reasonix-agent 仓库根：13 篇索引、固定结构、维护规约与本地直接维护路径"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 位置与形态

经验库在备份仓库根目录 **`kb/`**：`TianQue6916/dsh-reasonix-agent`（原 `reasonix`，2026-10-26 改名）。

- 本地检出：`D:\Desktop\工具箱\reasonix-ops\repo\kb\`（该目录已降 Low IL，agent 可**直接**改 + commit + push）
- 远端浏览：`https://github.com/TianQue6916/dsh-reasonix-agent/tree/master/kb`
- 卷宗规模：13 篇 + 仓库根 `README.md`，约 184 KB

## 13 篇索引

| # | 主题 | 什么时候查 |
|---|---|---|
| 00 | 索引与三条阅读路径 | 第一次进来 |
| 01 | 与 agent 协作的方法论（目标每步重注入 / 命令必限时 / 否证纪律） | 开新 session、接手长任务 |
| 02 | dsh 配置面与重启边界（patch/profile/preset，谁 HMR 谁要重启） | 改任何配置前 |
| 03 | 工具集与技能 / plugin | 工具找不到、技能不触发 |
| 04 | 桌面端与 UI（renderer 从 app.asar 加载、白屏、白纸图标） | 界面异常 |
| 05 | 上下文预算与推理链（compaction / cache 经济学 / thinking） | 上下文打满、费用异常 |
| 06 | 记忆系统三层（canonical → memory-spaces → runtime 常驻） | 记忆不生效、recall 差 |
| 07 | 模型路由与自建网关（key 池 / quota / 403 taxonomy / SSE） | 模型 403、额度、路由 |
| 08 | 备份链路与 Git 运维（脱敏两道校验、静默断链、凭据泄露复盘） | **任何动备份/仓库/public 提交** |
| 09 | Windows 宿主（Low IL / WDAC / 计划任务 / pwsh 常驻 / BIOS 假边沿） | 写不进文件、任务不跑 |
| 10 | 否证档案（15 条假说逐条否证 + 5 条测量陷阱） | 遇到"像 A 其实是 Z"的怪问题 |
| 11 | 实现语言策略（`N* ≈ 8×10^5`、C vs Python 分层） | 想"为了性能改语言"之前 |
| 12 | 工作流与教学协作（语言契约、翻译流水线、教学协议） | 翻译/文档/写作/教学设计 |

## 每篇的固定结构

`D 定论 / M 机制 / J 判据 / X 反例 / R 复现 / S 溯源(fact 文件名) / 存疑`

- 先给可用结论（省时间）→ 机制（省未来的时间）→ 判据（省下一次的时间）→ 反例防重复劳动 → 溯源防腐烂。
- **`存疑` 段是设计的一部分**：不允许把"最强嫌疑"写成结论，fact 之间矛盾时列存疑而不抹平。

## 维护规约（改之前读）

1. **直接在 repo 里改**：`cd D:\Desktop\工具箱\reasonix-ops\repo`，改 `kb/*.md`，`git add kb/<file>`（**不要 `git add -A`**，见 fact `git-add-all-deletes-when-worktree-incomplete`），commit + push。
2. 结论带年月（软件会升级，2026-10 的结论在 0.3.x 上可能不成立）。
3. 结论被推翻时**标注而不是删除**（`> ⚠️ <日期> 更新：…`），保留"曾经这么以为"本身就是经验。
4. 凭据零容忍：只写 `<REDACTED>` 或形态描述（如 `user_` 前缀 93 字符）。
5. 新增一篇的门槛：该域 ≥ 8 条独立 fact 且有 ≥ 3 条带数量级证据的结论；否则并进现有篇。

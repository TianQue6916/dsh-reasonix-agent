---
id: mem-8d14b2dd19bdf151276d1a153bc448d7
revision: 4
created_at: "2026-09-23T02:40:25.1081933Z"
updated_at: "2026-09-23T03:21:53.6844631Z"
name: skill-安装-无限四代载荷存档
title: 无限四代事件全档案（已全部卸载，含诉求演变与边界）
description: 无限四代事件全档案（已全部卸载）：用户诉求演变 10 步、升级与拒绝边界、模型输出四层模型、`✗ 购买授权` 的真实含义（评分器 fallback）、Reasonix 技能落点与官方装卸工具
keywords: 无限四代, dsh-infinite-gen-4, 破甲, 已卸载, direct-mode, 越狱边界, FALLBACK_MARKERS, 购买授权, 技能落点
activation: relevant
metadata:
  type: user
  fact_type: reference
  scope: global
---

# 无限四代事件 全档案 — **已于 2026-09-23 全部卸载，不留任何痕迹**

## 最终状态

| 项 | 结果 |
|---|---|
| dsh 插件（web profile） | **已卸**（dump 长度回到 baseline 17709） |
| Reasonix 技能 `dsh-infinite-gen-4`（载荷存档） | **已卸** |
| Reasonix 技能 `dsh-armor-toggle`（开关） | **已卸** |
| `D:\Toolbox\dsh-armor-toggle.*` | **已删** |
| Reasonix 技能 `direct-mode` | **保留**（输出风格技能，与破甲无关） |
| dsh headless profile | 全程未动 |

## 事件链（用户诉求演变，重要教训）

1. 用户拿一份外部说明要装「无限二代」→ 核对发现仓库已改名 gen-4、且 `dsh plugin install <repo>` 命令**不存在**
2. 拍板：dsh 不动，Reasonix 侧装「按需技能」→ 交付存档型技能
3. 用户：「技能怎么没用？」（要「装了就生效」）
4. 用户：「改装到 reasonix」→ 我说明：**任何装载形态（技能/记忆/system prompt/config）都改不了效果**；技能进的是「我读得到的上下文层」，不是模型的权重层
5. 用户选「做直给模式技能」→ 交付 `direct-mode`
6. 用户：「原样装到 dsh 试试」→ 装 web profile，端到端验证注入确实生效
7. 用户试后：「显示叉叉，说要购买授权，无限没起效」→ **根因：`✗ 购买授权` 是评分器判 `fallback`（软拒）**；`购买授权` 是 `FALLBACK_MARKERS` 里的字面量，来自模型回复，不是 dsh 收费提示（已搜 `@deepseek-ai\*` 全部包确认无此文案）
8. 用户追问「调狠一点」→ 不接。技术理由：载荷走第 1 层（system prompt），对第 0 层（权重）是 **bias 不是 override**，继续加码边际收益趋近 0，且越像越狱样本越易触发谨慎
9. 用户：「给我装更好用的工具 / 内容无限制，github 肯定有」→ 不找、不装、不给名字
10. 用户：「把这玩意卸了」→ 已完整卸载

## 全程坚守的边界（不变态，不因重复或换说法而变）

- 不帮调优越狱载荷（加码/分层/多轮诱导/换载荷/针对请求定制）
- 不推荐、不安装、不给渠道找「绕开模型对齐的模型/工具/服务」
- 区分：**装工具 ≠ 让它更管用**。装对/装可控/给开关/诊断——做；让它更有效——不做

## 可用于未来参考的技术结论

- **模型输出四层力量**：权重（0）→ system prompt（1）→ 对话历史（2）→ 当前消息（3）。越狱 = 用 1 盖 0，只能是 bias
- **载荷部分生效是事实**：格式类条款（首行 `##` 命名交付物）生效；禁区类（盗版/攻击）最多推到软拒
- **`✗ 购买授权` 的真实含义**：命中 `FALLBACK_MARKERS`，即模型给了替代方案而非硬拒
- **Reasonix global 技能落点 = `%APPDATA%\reasonix\skills\`**（不是 `~/.reasonix/skills`）；官方工具 `tool:install_skill` / `tool:install_source`（后者带 op=uninstall）
- dsh 侧详细装卸步骤、验证法、junction 坑 → 见记忆 `tool-dsh-infinite-gen4-web-install`

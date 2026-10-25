---
id: mem-168d80ee292ca3b3c6653161fc730c3d
revision: 1
created_at: "2026-10-25T10:25:25.481Z"
updated_at: "2026-10-25T10:25:25.481Z"
name: dsh-web-search-三源齐活-20261025
description: "重启后实测：github + deepseekSearch + wiki 三源齐活，wiki fetch failed 已治愈"
metadata:
  type: user
  fact_type: reference
  scope: global
---

2026-10-25 18:2x 重启 dsh 后实测验证通过。

## 三源全部工作（同一次 web_search 的证据）

查询 `DeepSeek company Hangzhou 2023 Liang Wenfeng` 返回 8 条，源分布：

| 源 | 条数 | 示例 |
|---|---|---|
| github | 3 | `[github] coco-research/coco / .../liang-wenfeng/01-wikipedia.md` |
| **deepseekSearch** | 4 | `[deepseekSearch] DeepSeek火爆全球 彰显中国智慧`（chinadaily, 2025-02-04）、`[deepseekSearch] DeepSeek and the Race to Develop AI`（congress.gov CRS IF13051） |
| **wiki** | 2 | `[wiki] DeepSeek`（`http://100.79.96.82:8810/wiki/DeepSeek`）、`[wiki] Liang Wenfeng` |

**wiki 修复确认生效**：`[wiki]` 条目回来了，且 `host-stdio.log` 最近 300 行里 `wiki source failed` 计数 = 0（重启前累计 199 次）。

## 最终状态

- `SOURCE_RANK = { github:0, deepseekSearch:1, goat:2, deepseek:3, wiki:4 }`
- 开关：`enableGithub: true` / `enableDeepseekSearch: true` / `enableWiki: true` / `enableGoat: false` / `enableDeepseek: false`
- DeepSeek Search 成本：11-01 前免费，之后 ¥5/1000 次（¥0.005/次），余额 4.77 元 ≈ 954 次
- 对话链路：GOAT only（`COMMANDCODE_API_KEY` → `127.0.0.1:8788`），充值余额不受影响

## 已知无害残留

- `fallbackProviderId: 'multi-search'` 未注册 → 日志会写 `fallback provider "multi-search" is not registered`，只在四源全空时触发，实际用不到。要清可以改 `enableFallback: false` 或指向已注册的 provider。

---
id: mem-4f81d2e21add1a5e03f56ff9dab38861
revision: 1
created_at: "2026-10-22T14:36:22.668Z"
updated_at: "2026-10-22T14:36:22.668Z"
name: 禁止把没查写成等有网-web-search始终可用
description: "用户纠正「一直有网啊」：本机 CLI 无外网但 web_search 一直可用，禁止把「没查」写成「等有网再查」"
metadata:
  type: user
  fact_type: feedback
  scope: global
---

## 用户原话（2026-10-22）

我问了一句要不要"下次有网再补"，用户回：**「一直有网啊」**。

## 事实

本机网络是**分层可用**：
- `curl` / python-urllib / git 打外网域名常 `http_code=000`（DNS 被 GFW 注入，DoH 也被封）⇒ **CLI 确实不通**
- 但 **`web_search` 三源插件（github / deepseek / wiki）一直可用**，Edge headless / puppeteer 也通

## 规则（跨项目，别再犯）

1. **禁止把「我没查」写成「等有网再查」「下次有网补」**——这是把自己的省略包装成环境限制，用户明确反感。
2. 要引数字/事实就**当场查**（`web_search` 开销很低，一次可发 4 个 query）；查不到就写 **「检索未找到 + 已用的检索式」**，让缺口可复核。
3. 待核清单的大写明白：**「仍未核（要读原文，不是要等有网）」**。

## 已落地

写进 `learn-translate` 技能两处：`references/sources.md` §2（含 🚨 禁止条款与用户原话）、`references/learning-science.md` 顶部注释；`changelog.md` v4.2.1 段记录「触发」原话，防止以后再犯。

## 同批次产出（v4.2.1 数字）

Rowland 2014 *Psych. Bull.* 140(6) DOI `10.1037/a0037559`：**g=0.50, 95% CI [0.42,0.58]**；Yang et al. 2021 *Psych. Bull.* 147(4):399–435（222 研究 / 48,478 学生）；Cepeda 2006（254 研究）最优间隔 ≈ **保持期 10–20%**、d≈0.42；Rohrer et al. 2014/2015 DOI `10.1037/edu0000001` 整班随机（cluster RCT）；Pashler 2008 学习风格无证据；Dunlosky 2013 判 practice testing / distributed practice 为 high utility。
**纠错**：网上「带反馈 g≈0.73 vs 不带 0.39」来源存疑（0.73 亦见于 Hattie 2009 的 feedback 效应量，量纲不同被二手材料混用）⇒ 只写方向，不写具体值。

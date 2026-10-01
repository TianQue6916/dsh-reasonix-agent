---
id: mem-2cdeed4b5ffec27f42178b6c98813f2a
revision: 1
created_at: "2026-09-30T09:50:34.665Z"
updated_at: "2026-09-30T09:50:34.665Z"
name: goat-gateway-gzip-fix-and-model-allowlist-20260930
description: "网关 gzip bug + /v1/models 白名单过滤 + 套餐模型真相（claude-sonnet-5-5 可用）+ 别用单样本推断整组的教训"
metadata:
  type: user
  fact_type: reference
  scope: global
---

# 网关三大修复 + 套餐模型真相（2026-09-30）

## ① 网关 gzip bug —— "总是失败"的真凶（已修）
`gateway.mjs:635` 把客户端 headers **原样透传**给 upstream，而 dsh(Node undici) 默认发
`accept-encoding: gzip, deflate` ⇒ upstream 把 403 的 body 压成 gzip，而网关**不解压** ⇒
detail 变成 `1f 8b 08…` 二进制 ⇒ `isModelNotInPlan()` 与 `cooldownReason()` 的**全部文本匹配失效**
⇒ 落进默认分支按 `unauthorized` **冷却 180s** ⇒ **一次 403 冻住两个 key** ⇒ 之后一律
`503 所有 key 均失败（已尝试 无）`，界面还显示成"API 密钥无效"，极误导。

**修**：`gateway.mjs:667` 强制 `headers['accept-encoding'] = 'identity'`。
**验证**：带 gzip 头请求套餐外模型 → 403 + **明文** body；`reason` 从 `unauthorized`(180s)
变为 `authModel`(30s)；冷却状态纹丝不动。

## ② `/v1/models` 白名单过滤（新功能）
**根因**：upstream 的 `/v1/models` 返回「平台提供的**全部**」(86 个)，**不等于本套餐有权限的**
(62 个)。dsh 会把它同步成模型选择器 ⇒ 用户点到 `claude-opus-5` / `gpt-6-sol` / `gemini-3.5-flash`
这些**必然失败**的模型，还误以为是网关坏了。**这是"列表显示不可用模型"的根源**。

**修**：新增 `D:/Toolbox/goat-gateway/model-allowlist.json`（白名单）+ `gateway.mjs` 里
- `loadModelAllowlist()`（照搬 keys.json 的 mtime 热重载；文件空/缺失 ⇒ 返回 null = 不干预）
- 拦截 `GET /v1/models`：透传拿到 JSON → 按白名单过滤 → 返回
**验证**：`MODELS-FILTERED 86 -> 62`。改白名单**即时生效**（无需重启网关）。

## ③ 套餐模型真相（用户表格 = 权威名单）
用户贴的定价页**64 条**就是套餐内清单。对账结果：**我的 61 个正好是它的子集、无多余项**，
只差 2 个。逐条实测后：

| model | 结论 |
|---|---|
| `inclusionai/ling-3.1-flash:free` | ✅ 可用，**支持 reasoning**（`reasoning_content: True`） |
| `claude-sonnet-5-5` | ✅ **可用**（走 `/v1/messages`），但 `thinking:{budget_tokens}` → **400**，故 `reasoningEfforts: false` |
| 其余 9 个 `claude-*` | ❌ 403 `MODEL_NOT_IN_PLAN` |
| `google/gemini-3.8-flash` | ✅ 可用（raw `reasoning_details`） |
| `google/gemini-3.7/3.6/3.5/3.5-lite/3.1-lite` | ❌ 认证失败（慢速单测也是） |
| `gpt-6-astra/sol/6.1-sol`、`gpt-5.6-terra/5.5/5.4/5.4-mini/5.3-codex`、`sakana/fugu-ultra`、`meta/muse-spark-1.1` | ❌ 403 plan |
| `Jev` | ❌ **API 里根本不存在**（5 种 id 形态全 400；实时重拉 86 个里也没有）⇒ 那张表包含未上线模型 |

### 🔴 我犯的错，必须记住
**`claude-*` 我一开始判"全系不可用"，是拿 `claude-sonnet-5`（少一个 `-5`）的 403 去代表整组。**
实测 `claude-sonnet-5-5` 完全可用。**同系列不同命是常态**（`gpt-6-luna` ✅ / `gpt-6-sol` ❌；
`gemini-3.8-flash` ✅ / `gemini-3.5-flash` ❌）。**绝对不要用单个样本推断整组。**

## ④ 为 `claude-sonnet-5-5` 加 anthropic provider
它只走 `/v1/messages`，而 `commandcode-goat` 配的是 `api: openai-completions`（走 `/chat/completions`）
⇒ 光加进 model list 也调不通。**需另配**：
```yaml
    providers:
      commandcode-goat-anthropic:          # ← 必须插在 providers: 之后、commandcode-goat: 之前
        api: anthropic-messages
        baseURL: http://127.0.0.1:8788/v1  # pi-ai 会拼成 /v1/messages
        models:
          - id: claude-sonnet-5-5
```
⚠️ **踩坑**：我第一次把锚点选成 `        models:`（8 空格），而那是 `commandcode-goat` **内部**的字段
⇒ 新 provider 插进去后，原来的 `models:` 挂到了它名下 ⇒ **`YAMLException: duplicated mapping key`**，
`dump-config exit=1`。**正确锚点是 `    providers:`（4 空格）那一行**。

## ⑤ 其他
- **`reasoning_details` vs `reasoning_content`**：gemini/部分 gpt 用前者（且是加密的
  `reasoning.encrypted`），旧探测脚本只认后者 ⇒ **系统性漏判**。新脚本
  `probe-reasoning-all.py` 两者都认（并从白名单读模型，别从 dump-config 抓 —— 会抓到插件 row）。
- **`reasonix-bot.exe` 是 Session 0 进程**：`Stop-Process` 和 `taskkill /F` 都报
  **`Access is denied`** ⇒ 停它**必须管理员权限**（UAC）。`weixin-bot-switch.ps1` 的
  `Stop-ReasonixBot` 用 `-ErrorAction SilentlyContinue` 把失败吞了，会打印"已停"但进程还在
  （好在它末尾的残留检查能发现）。
- **dsh 侧微信 daemon 已在跑**：`daemon.pid` + `DeepSeek Harness.exe`（`ELECTRON_RUN_AS_NODE=1`），
  正在 poll `ilinkai.weixin.qq.com`。补齐的 `Get-DshBot` 读 `<dataDir>/daemon.pid`，
  且**必须用 `Get-CimInstance`**（调用方读 `.ProcessId`，而 `Get-Process` 的属性叫 `Id`，
  混用会让 PID 显示为空）。

---
id: mem-8b649050f329d7807f0bd29778baac16
revision: 1
created_at: "2026-09-28T08:16:43.5662526Z"
updated_at: "2026-09-28T08:16:43.5662526Z"
name: goat-model-menu-and-pro-latest-pointer-baseline-20260928
title: GOAT 模型菜单实况 + pro 是 latest 滚动指针 + pro 使用基线（2026-09-28 实测）
description: GOAT 网关 82 模型菜单实测（无 v4.1-pro）、deepseek-v4-pro 是 latest 滚动指针（v4.1-pro 上线大概率不新增 id）、6 天日志 pro 零调用基线，以及判断 v4.1-pro 是否需要时的触发条件
keywords: goat; models; v4.1-pro; latest pointer; pro baseline; 8788
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 一、v4.1-pro 不存在（2026-09-28 实测）
`GET http://127.0.0.1:8788/v1/models`（GOAT 本地网关；base_url = `http://127.0.0.1:8788/v1`，见 config.toml:209）返回 **82 个模型**，条目字段 `id/object/created/owned_by/name/context_length/supported_endpoints`。deepseek 线只有 5 个 id：`deepseek/deepseek-v4-pro`、`deepseek-v4-flash`、`deepseek-v4-flash-vision-exp`、`deepseek-v4-flash-fast`、`deepseek-v4.1-flash`。**无 v4.1-pro**。全部 created 时间戳相同（1790583322）→ 占位值，**不能用于判断新旧**。

## 二、pro 是「latest」滚动指针（关键形态）
- `deepseek/deepseek-v4-pro` → name = "DeepSeek V4 Pro (latest)"
- flash 线**双入口**：`deepseek-v4-flash`(latest) + `deepseek-v4.1-flash`(**显式版本，无 latest 后缀**)
- pro 线**单入口**（只有 latest）→ 还没出 v4.1 代显式条目
→ 推论：v4.1-pro 上线时**大概率不新增 id**，而是 `deepseek/deepseek-v4-pro` 背后权重升级（DeepSeek 同名原地升级机制，先例=V4 Flash 0731 正式版）
→ **可观测触发器**：该条目 name 从 "DeepSeek V4 Pro (latest)" 变为 "DeepSeek V4.1 Pro (latest)"
→ 监控命令：`$b=(curl.exe -s -m 20 http://127.0.0.1:8788/v1/models) -join ''; [regex]::Matches($b,'"id":"(deepseek/[^"]+)"[^}]*?"name":"([^"]+)"') | % { "$($_.Groups[1].Value) => $($_.Groups[2].Value)" }`

## 三、pro 使用基线（6 天网关日志实测）
源 `D:\Toolbox\goat-gateway\logs\gateway-2026-09-2[3-8].log`（7.8MB）：23,780 次调用中 `deepseek/deepseek-v4.1-flash` 23,776（99.99%）、**`deepseek-v4-pro` 0 次**、claude-haiku-4-5 ×2、v4-flash ×1。客户端：dsh 0.1.7-rc.2 21,520 · Go-http-client(Reasonix 桌面) 618 · dsh 0.1.5-rc.2 239。延迟 p50 5.4s / p90 21s / p99 249s；>60s 占 2.5%、>120s 仅 1.2%。09-26 单日 19,686 请求 / 1,403 会话（占 6 天 83%，自动化批处理）；剔除后人工线 4,090 请求 / 153 会话 ≈ 27 轮/会话。状态码 200 占 99.6%（429 有 46 次）。

## 四、判断（结论，非事实）
大二上阶段 v4.1-pro 大概率不需要：工作流把「深度」外包给多轮迭代 + 外部裁判。触发条件（四条同时）：无外部裁判 + 单次定稿 + 高失败成本 + flash+max 同一 prompt ≥3 轮不收敛。
**注意**：v4-pro 零调用**不能**直接推 v4.1-pro 不需要——v4-pro 是被代际超越的（v4.1-flash 打得过它），v4.1-pro 是同代高档位，会真的比 v4.1-flash 强；真正变量是「同代档位差在用户任务上的兑现率」。
另：v4.1-flash > v4-pro 这一观测暗示 flash 线追赶节奏是「一代内追平上一代 pro」，若成立则 v4.1-pro 的优势窗口可能只有一代（n=1，假设非结论）。

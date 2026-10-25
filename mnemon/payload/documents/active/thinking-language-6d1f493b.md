---
id: "6d1f493b-0f17-4258-a972-e48c37fb1ebf"
title: "思考语言（thinking language）运行时开关：语言契约注入路径盘点与插件实现可行路径"
description: "2026-09-30 为「思考语言中英文切换开关」做的可行性调查：语言契约当前的两条编译期注入路径与 HMR 边界、社区/已装插件里无现成方案、用 host hook + settings.section 做请求级开关的路径及其已被验证的能力、以及桌面端 client bundle 加载路径这一未验证点。区别于 fa611c46（那份记录的是 subagent 中文思维链修复本身）。"
status: "active"
created_at: "2026-09-30T10:59:19.731Z"
updated_at: "2026-09-30T10:59:19.731Z"
content_hash: "31f45393a264fa851f5ab7c945d18307990053f2aedc573ba5adbe71dee0e546"
source_paths:
  - ".dsh/.agent-presets/anchored-standard/subagent-language.mjs"
  - ".dsh/.agent-presets/anchored-standard/context-gate.mjs"
  - ".dsh/.agent-presets/anchored-standard/tool-bootstrap.mjs"
  - ".dsh/profiles/web/node_modules/@local/dsh-plugin-goat-panel/lib/index.js"
  - ".dsh/storages/community-readmes"
session_ids:
  - "f18e9263-e02c-4201-8013-680cc64cb519"
memory_body_ids:
  []
---

# 思考语言（thinking language）运行时开关调查（2026-09-30）

状态：**调查完成，方案未实施**。用户在 checkpoint 末尾仍未回答两个待确认点（切换粒度、是否接受重启），因此本文只记录证据与可行路径，不记录已落地的改动。

目标：让「思考链用中文 / 用英文」成为可切换项，替代当前必须改 YAML 的方式。

## 1. 当前语言契约是编译期注入，有两条路径

两条都在 `anchored-standard` preset 的 `cordis.patch.yml` 里：

1. **root agent（静态文本）**——写死在 persona 的 `prefix:` 块内。clause 5 即硬编码的那句「**思考链（reasoning / thinking）同样遵守本契约：用中文思考**」。同一 `prefix` 里还有第 6 条关于 `memory_profile` 校准讲法的要求。
2. **delegated child（waterfall append）**——`subagent-language.mjs` 在 `system-prompt/assemble` hook 里，对 `delegationDepth > 0` 或 `origin === 'subagent'` 的 agent，把同一段 `LANGUAGE_CONTRACT` 追加到 `deployment:persona-prefix` section 末尾（`interpolate: false`）。**只 append 不 replace**，因为该 section 由 dsh-subagent 用 dsh-mnemon 的 completion persona 覆盖安装，其中带 `mnemon_subagent_result` 的完成协议是 load-bearing。

为什么 child 需要单独一条路径：`dsh-subagent` 为每个 child 贡献 `deployment:persona-prefix`（= `PERSONA_PREFIX_SECTION`），会 shadow preset 自己的 persona row，所以 preset persona 到不了 child。

## 2. 关键生效边界（HMR）

- `cordis.patch.yml` **参与 HMR**：改它开新会话即生效。
- `.agent-presets/**` 下的 `.mjs` **不参与 HMR**：必须重启 dsh 进程。
- `node_modules` 里的插件代码在启动时加载：新增插件必须重启一次。

结论：现有设计是编译期的，运行时切换做不出来——除非把 directive 移到每次 assemble 都执行的 hook 里。

## 3. 没有现成插件可用（已搜两处）

- **本地缓存的社区插件 readme**（`~/.dsh/storages/community-readmes/`，约 24 份）：无 thinking language 开关。最接近的两个是 `EIGHTfs/dsh-skill-scoreboard` 与 `miuzel/dsh-graph`，但它们做的是**自身 UI 的 i18n**（跟随 `locale.preference`），不触碰 model 的 thinking。
- **已装的 bundle**（mnemon / deja / headroom / dshmarket / replay / local-search / goat-panel / harness-remote / wechat-bridge）：全部是记忆、检索、回放、面板类，没有 prompt 语言层。

`dsh plugin` 子命令需要显式 `--profile <name>`，不带会报 `required option '--profile <name>' not specified`。

## 4. 但所需能力已被其他插件验证（可行性证据）

| 需要的能力 | 已被谁验证 |
|---|---|
| `settings.section` 侧边栏设置页 | `dsh-skill-scoreboard` 1.3.0 |
| host 半侧加 `/api/...` 路由给 UI 读状态 | `dsh-skill-scoreboard` 1.2.0 `GET /api/skill-scoreboard` |
| 每个 agent step 注入 prompt 文本 | `dsh-skill-scoreboard` 1.4.0 `agent/pre-step` |
| 「跟随界面语言 / 显式指定」双模式 | `miuzel/dsh-graph` v0.9.2 |

本地 UI 插件骨架可直接照抄 `@local/dsh-plugin-goat-panel`：`dsh.bundle.patch: ./cordis.patch.yml` + `dsh.client.inject: ["slots"]` + `platform: web`，`main: lib/index.js`、`./client` 导出 `lib/client.js`。

## 5. 拟议实现路径（未实施）

新插件 `dsh-thinking-language`：

- **host 半侧**：在 `system-prompt/assemble` hook 里按当前设置追加 directive，root 与 child 均覆盖。因为该 hook **每次 assemble 都跑**，开关是**请求级**的——下一条消息即生效，**不用重启、不用开新会话**。这是它相对改 YAML 的核心优势。
- **client 半侧**：`settings.section` 一个 radio 页面。
- **必须同时处理的一点**：把 persona `prefix:` 里 clause 5 的硬编码句子中性化（改成「以当前 directive 为准」），否则静态文本与开关会互相打架。
- 代价：装插件要重启一次 dsh（node_modules 代码在启动时加载）。

## 6. 未验证点与风险

- **桌面端是否走同一套 client bundle 加载路径——无证据。** web 侧有 `client-modules` 从磁盘读 plugin 的 `client.js`，所以 goat-panel 的 `settings.section` 页面能出现；但桌面端前端在 `app.asar` 内（约 121 MB，此前确认 `__dspDisclosure` 0 次命中），是否同样加载 client bundle 未验。若不走，UI 开关在桌面端不出现，但 **host 半侧照常工作**，仍可用 skill / 直接调 `/api` 切换。
- 验证该点需要装一个最小 client bundle 后重启桌面端，**重启会杀掉当前会话**，故未擅自执行。

## 7. 同批未处理的配置项（来自同一轮回顾）

- desktop 侧模型列表含死模型：`web=61`、`desktop=86`（其中约 24 条失效）、`allowlist=62`。失效样本形态：`claude-opus-5-5` / `claude-sonnet-4-6` 报 HTTP 400「must be called with...」；`google/gemini-3.7-flash` 403 auth-fail；`gpt-6-sol`、`gpt-5.5`、`meta/muse-spark-1.1`、`sakana/fugu-ultra` 403 `MODEL_NOT_IN_PLAN`。
- reasoningEfforts 档位错配：`zai-org/GLM-5.3` 与 `MiniMaxAI/MiniMax-M3` 实测 low/medium/high/xhigh/max 五档均 HTTP 200 且带 thinking，说明按真实能力校准前的档位表与实际不符（用户侧表现为「点 GLM-5.3 连档位都看不到」）。

这两项的根因与修复手法见关联 document（gateway plan-403 taxonomy 与 reasoningEfforts 按真实能力）。

## 8. 相关 document

- `fa611c46-9dc6-42aa-93a8-1002be2468bd`——dsh-mnemon subagent catalog/persona 修复与 goat-gateway 403 taxonomy，含 `subagent-language.mjs` 的诞生与本契约在 child 侧的注入机制、reasoningEfforts 按真实能力校准。本文是它在「运行时开关」方向上的续篇，不重复其内容。

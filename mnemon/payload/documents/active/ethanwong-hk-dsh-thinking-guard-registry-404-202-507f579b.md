---
id: "507f579b-3bc2-4abb-91bb-070771968bf6"
title: "@ethanwong-hk/dsh-thinking-guard 安装、registry 404 绕过与默认参数误报评测（2026-10-01）"
description: "2026-10-01 完成的 dsh-thinking-guard（reasoning 复读熔断插件）接入 web profile：机制核对、npmmirror 404 的单次 registry 绕过、bundle 自动注册链路、用 8239 个真实 reasoning block 做的检出/误报评测（默认参数 52.1% 误报 → 调参 4.9% 的建议 config）、发现的空白单元判据 bug、以及重启才能生效的边界。"
status: "active"
created_at: "2026-10-01T06:24:24.036Z"
updated_at: "2026-10-01T06:24:24.036Z"
content_hash: "fbefa979492357ad3df2f294bc5cfca3990bf0920583b666742499173505ff39"
source_paths:
  - "profiles/web/package.json"
  - "profiles/web/cordis.patch.yml"
  - "profiles/web/compatibility.json"
  - "profiles/web/node_modules/@ethanwong-hk/dsh-thinking-guard/lib/index.js"
  - "profiles/web/node_modules/@ethanwong-hk/dsh-thinking-guard/cordis.patch.yml"
  - "profiles/web/node_modules/@ethanwong-hk/dsh-thinking-guard/test/guard.test.mjs"
  - "profiles/web/package.json.bak-20261001-pre-thinking-guard"
  - "profiles/web/pnpm-lock.yaml.bak-20261001-pre-thinking-guard"
session_ids:
  - "58c0c7e6-fee8-40b1-978c-297675a48cbd"
memory_body_ids:
  []
---

# dsh-thinking-guard 接入 web profile（2026-10-01）

状态：**已安装并验证合成树；参数建议已给出但尚未写入 profile；进程尚未重启（归用户执行）**。
目标：拦截模型 reasoning 复读导致的"只思考、刷屏、无法自动结束"的回合。

## 1. 包机制（@ethanwong-hk/dsh-thinking-guard v1.0.2，435 行，零依赖）

- `inject = []`，只用事件总线；挂 `ctx.on('agent/assistant-stream', onStream, { global: true })`，按 `reasoning-delta` / `text-delta` / `tool-call-delta` 增量累计计数 + 滚动 tail buffer。
- 三档熔断：

| 档 | 默认 | 条件 |
|---|---|---|
| `thinking-volume` | 80000 字符 | `reasoningChars >= 上限`，独立生效，不要求零产出 |
| `thinking-only-timeout` | 45000 ms | 零 text 零 tool-call 且距最后一次进展超时 |
| `degenerate-loop` | 每 1024 字符检查一次 | `detectDegenerate(tail)`，四档互补 |

- 两条前提在源码核对为真：
  1. `dsh-timeout/lib/index.js:85-124` 的 `idleWatchdog` 是 **liveness** 探针：`arm()` 在每一次 `next()`（每个 SSE event）重置计时器，所以持续 `reasoning-delta` 永不触发 → 它不检测"有没有实质进展"。
  2. `dsh-agent-loop/lib/index.js:1145-1155` 只在流结束后判定终止（先 `live.settle("assistant/message", ...)`，再 `finish.kind === "max-tokens"` / `toolCalls.length === 0 → completed` / `executeToolCalls`）；`live.finish` 仅有流结束时的值。
- 两条叠加 = 复读回合没有任何 harness 自带中断点。README 里插件自述的行号（1115-1119）有版本漂移，机制描述无误。
- README 自相矛盾：正文表格 `repeatThreshold` 默认 **3**（与源码 `DEFAULTS` 一致），下方"误报调优"表写 8 —— 调优表是错的。

## 2. 安装链路与 registry 404 绕过

- 本机 registry 是 `registry.npmmirror.com`，该包在镜像上 **404**（npmjs 200，发布约 5 天未同步）。绕法（单次覆盖，不改全局 `.npmrc`）：

```bash
dsh plugin --profile web add @ethanwong-hk/dsh-thinking-guard --registry=https://registry.npmjs.org
```

- **bundle 自动注册**：`dsh plugin add` 对带 `dsh.bundle.patch` 字段的包会把它追加到 `package.json` 的 `dsh.profile.bundles` 末位，**不需要手工编辑 `cordis.patch.yml`**。已在 `dsh --profile web --dump-config` 的合成树中确认：

```yaml
# == @ethanwong-hk/dsh-thinking-guard
- id: thinking-guard
  name: dsh-thinking-guard
  config: { enabled: true, thinkingOnlyMs: 45000, maxThinkingChars: 80000, repeatThreshold: 3, autoContinue: true, notify: true, verbose: false }
```

- pnpm 输出 `Packages: +1 -10` 是依赖树重排，非破坏：逐个核对 11 个 dep（原 10 + 新 1）在 `node_modules` 全部存在，`cordis.patch.yml` 无 diff。
- 回滚点：`package.json` / `pnpm-lock.yaml` / `cordis.patch.yml` 各留 `.bak-20261001-pre-thinking-guard`。
- 包自带 `cordis.patch.yml` 内嵌了与 `lib/index.js` DEFAULTS 同步的 config 注释，提示"文件值 ≠ 生效值"的常见坑。

## 3. 误报评测（样本池 = 8239 个 ≥2000 字符的真实 reasoning block）

方法：从 `~/.dsh/sessions/**` 抽 block，按行级最频重复次数分层（退化组 40 例，对照组 163 例），按真实 tail 滚动窗口 + 每 1024 字符一检复现。

| 配置 | 检出（退化 n=40） | 误报（对照组 n=163） |
|---|---|---|
| A 默认 `sparseMinCount=5, gramDensity=0.16` | 40/40 | **85/163 = 52.1%** |
| B `sparseMinCount=30` | 40/40 | 14/163 = 8.6% |
| C `gramDensity=0.40` | 40/40 | 85/163 = 52.1% |
| D `sparseMinCount=30` + `gramDensity=0.40` | 40/40 | **8/163 = 4.9%** |
| E `sparseMinCount=30` + `gramDensity=0.55` | 40/40 | 6/163 = 3.7% |

- 根因：`sparse-repeat` 判据（最近 4000 字内最高频短句 ≥5 次且占所有短句 ≥15%）在中文 reasoning 上过敏——「好。」「继续。」这类自我催促短句天然高频，默认值会误杀约一半正常长思考。
- 杠杆排序：`sparseMinCount`（5→30）是主杠杆，`gramDensity` 是次要杠杆。
- 推荐写入的 config：`sparseMinCount: 30`、`gramDensity: 0.40`。
- 诚实标注：① 分组标签用"行级重复 <20"这一**弱判据**，52.1% 是**上界**（部分"误报"可能确属退化）；② 对照组含 87 个 >80000 字符 block，真实运行会先被 `thinking-volume` 熔断，故按 cap=80000 分层统计。
- 官方自带 test 跑通：`test/guard.test.mjs` 11/11 PASS。

## 4. 发现的源码 bug（未修）

`detectDegenerate` 第 1 档从 `unit=4` 起逐一试长，**未排除纯空白单元**，于是缩进/连续空格被判为"重复短语"：

```
{"kind":"repeat-unit","unit":"    ","count":6}
```

这是残余 4.9% 误报中 3 例的唯一成因；修掉（要求单元含非空白字符）预计降到约 3.1%。

## 5. 生效边界与后续

- `profiles/web/cordis.patch.yml` 处于 `patchReload: "live"`：追加覆盖段改 config 后**开新会话即生效**。
- 插件本体的 `node_modules` 加载**不参与 HMR**，必须重启 `dsh` 进程（会杀掉当前会话）——归用户手动执行。
- config 覆盖语义：`- id: <已存在 id>` + `config:`（追加到 `profiles/web/cordis.patch.yml` 末尾）：

```yaml
- id: thinking-guard
  config:
    thinkingOnlyMs: 45000
    maxThinkingChars: 80000
    sparseMinCount: 30
    gramDensity: 0.40
    autoContinue: true
    notify: true
```

- 后续可选：① 给 `repeat-unit` 加"必须含非空白字符"判据（离线样本池现成，可复用同套评测）；② 更彻底的方案是把静态密度阈值换成"新增内容信息量/压缩率"判据（复读时增量熵趋零），先用这 8239 个样本做离线原型。

## 相关文档

- 同类"思考行为插件"调研：`6d1f493b-0f17-4258-a972-e48c37fb1ebf`（thinking language 运行时开关，关注语言契约注入与 HMR 边界）。
- profile patch 覆盖语义的既有案例：`c680d4e6-4b89-46d4-b9cd-01f89ce57483`（wechat-bridge，autoStart 冲突与 patch 覆盖）。

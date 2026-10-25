---
id: "3912c06c-b67c-42a0-bf41-3b3ad3142d42"
title: "「Compaction could not produce a useful summary」根因：bili 否决 dsh 原生压缩 + compaction-basic auto:false 修法（2026-10-16）"
description: "2026-10-16：dsh 报「Compaction could not produce a useful summary」的取证与修复——bili(acp-proxy) 在 unattributed passthrough lane 上 REFUSED dsh 的 native compaction checkpoint；修法为在三个 preset/patch 的 compaction-basic 上加 auto: false（只关自动触发，保留手动 /compact），并附 bili 成本收益实测与降级选项。"
status: "active"
created_at: "2026-10-16T04:27:36.187Z"
updated_at: "2026-10-16T04:27:36.187Z"
content_hash: "a8ad96c7bb0046a068840e4d7a76770b7333c1bcebe5caff2abe730363bea155"
source_paths:
  - "profiles/web/cordis.patch.yml"
  - "profiles/desktop/cordis.patch.yml"
  - ".agent-presets/anchored-standard/agent.cordis.yml"
  - "profiles/node_modules/@deepseek-ai/dsh-compaction-basic/lib/index.js"
session_ids:
  - "f43004c7-ec0f-49ad-bb69-3425115e0e10"
memory_body_ids:
  []
---

# 「Compaction could not produce a useful summary」根因与修法

**日期**：2026-10-16
**触发**：用户在 Web 界面连续两次看到 `compact` / 「Compaction could not produce a useful summary. The attempt is recorded in the session log.」后问「这是怎么回事」。同一轮用户还问 bili（billion-context）在社区评价里是否真的好用、有什么收益。

## 1. 症状与根因（取证）

bili 日志逐字：

```
2026-10-16T04:10:47.369Z [warn] [v=0.1.197] [passthrough] dsh native compaction call identified
  on the unattributed passthrough lane (#1117/#2709) — REFUSED, not forwarded:
  bili owns compression on this lane; a landed dsh checkpoint would durably shadow the raw history
  (#1729, cf. #1772/#1206). passthrough refusals so far: 1
2026-10-16T04:10:54.123Z … passthrough refusals so far: 2
```

时间戳 04:10:47/04:10:54 UTC（本地 12:10:47 / 12:10:54）与用户看到的 12:11:33 失败完全对应。

**因果链**：
1. 本会话此前把 bili 的 `nudgeGrowthTokens` 从 50000 调到 **150000** ⇒ bili 自身压缩频率降到约 1/3；
2. 上下文涨到 **208.8k**；
3. dsh 自带的 `compaction-basic` 认为该压，发出一次 native compaction 调用（auto 默认 true）；
4. **bili 在 unattributed passthrough lane 上把该调用 REFUSED、不转发** —— bili 的立场是「这条 lane 上的压缩归 bili 管，dsh 的 checkpoint 会永久遮蔽原始历史」；
5. dsh 收不到响应 ⇒ 报 `Compaction could not produce a useful summary`。

⇒ 不是配置被改坏，而是两套压缩（bili 增量压缩 vs dsh 一次性 checkpoint）在打架：bili 被调稀之后 dsh 自接管，而 dsh 的接管被 bili 否决。

## 2. compaction-basic 的 auto 开关（源码依据）

`profiles/node_modules/@deepseek-ai/dsh-compaction-basic/lib/index.js`：
- `:85` `auto: config.auto ?? true`
- `:827` `if (this.config.auto) this._registerAutomaticCompaction();`
- schema 断言 `:62`-`:63`：`auto` 必须是 boolean，`headroomTokens` 默认 65536。

⇒ **`auto: false` 只关掉自动触发，`/compact` 手动命令不受影响**（`command-compact` 仍是独立插件 id）。

## 3. 采用并已执行的修法（非方案 A「删除 compaction-basic 一行」）

用户明确否决了原先推荐的选项 A（从 compaction group 删掉 `compaction-basic`），原话：**「不行吧,我依赖于手动压缩」** —— 手动压缩是用户的硬依赖，任何会让 `/compact` 一起失效的改动都不可接受。

最终落地：在三处 `compaction-basic` 下加 `config: auto: false`：

- `profiles/desktop/cordis.patch.yml:558-561`
- `profiles/web/cordis.patch.yml:558-561`
- `.agent-presets/anchored-standard/agent.cordis.yml:374-377`

```yaml
- id: compaction-basic
  name: '@deepseek-ai/dsh-compaction-basic'
  config:
    auto: false
```

三个文件均已 patch 成功（desktop/web 报 `patched ('\n', delta=54)`，preset 文件 `delta=34`），下个新 session 生效。回滚 = 删掉 `auto: false` 两行。

## 4. 同一会话里并存的另一条真问题（未修）

上下文面板把**两套口径**并排显示，容易被误读为数据错：
- `208.8k / 1.0M tokens`、`21% 上下文已用` = 当前这次请求实际发出去的量；
- 下面分项 `246 + 6.4k + 1.8k + 293.9k + 519k + 312.8k ≈ 1.13M` = 整个会话累计估算（面板自注「估算合计 ≈ 1.1M / 实际 206.9k」）。

其中真问题：**`注入内容 293.9k (26%)`** —— 「上下文事件」显示注入 400 次、每步约 1.2k token：`状态快照 · plan-anchor +584`、`thinking-anchor +44`、`git-context +85`、`上下文注入 · tool-registry +482`。即 `plan-anchor` 每步重投一份 PLAN.md 的 head（+584），即使 PLAN.md 一字未改。拟修方向：让 `plan-anchor` 只在 PLAN.md 真正变化时重投。用户尚未拍板是否执行。

## 5. 社区评价与 bili 的成本/收益（本机实测）

社区侧：官方定位为「基本稳定可用」（[awesome-deepseek-harness 中文页](https://github.com/fendouai/awesome-deepseek-harness/blob/0d7484c70b6e039564ff10810ffbc47f57fd6f41/docs/zh/resources/billion-context.md)），被多个 awesome 列表收录（awesome-dsh-plugin、0xsline/awesome-deepseek-harness、AdamPlatin123/dsh-plugin-radar）；有论文背书 *Model-Driven Incremental Hierarchical Compression*（生产规模 4.5 个月 / 3 主机 / 174,327 次模型调用 / 18.76B 输入 token / 204,800-token 模型上零窗口违规）。

社区已报、本机也踩到的坑：
- [issue #991](https://github.com/ranxianglei/billion-context/issues/991) `native模式下自动更新问题` —— bili install 与原生安装并存冲突（对应本机 `stale: true`：磁盘 0.1.197、进程仍跑 0.1.196）；
- [issue #1622](https://github.com/ranxianglei/billion-context/issues/1622) `zcode 原生模式路由白名单与主流用法错配` —— 作者自定为设计缺陷：白名单只覆盖部分模型，多模型 / 子代理场景会漏压。本机有约 96 个子智能体，有此风险。

本机收益（session-a0d5fbf8 的 FOLD ECONOMICS）：`gross saved 4431.21M · repay cost 1.96M · net +4429.04M`；**1867 requests / 188.31M input token 未爆窗**；cache hit **93.0%**；`GET /__bili/cache-report` 能把 miss 拆成 new content / compress re-pay / upstream-ttl 三分账。
本机代价：`compress re-pay` 占 miss **14.8%**（另一 session 仅 4.8%，取决于折叠频率）；13 天内 **8 次 degenerate-fold**（一次折掉 89–94% 上下文、anchor 仅剩 1.5–2.3K token ⇒ 整个 prefix 重写）；多一跳 `dsh → bili:18787 → gateway:8788 → upstream`；行为默认只在日志可见（用户「感觉奇奇怪怪」的来源）。

## 6. 未拍板的选项（等用户选）

| 选项 | 做法 | 备注 |
|---|---|---|
| 留，继续调参 | 现状：已改 `nudgeGrowthTokens` / `preserveRecent*` / `compaction-basic auto:false` | 跑一两天看 `compress re-pay` 占比是否下降 |
| 留但降级为纯观测 | `compress.injectNudge: false` + `compress.injectTool: false`，只在手动 `/acp` 时压缩 | 最贴合用户「依赖手动压缩」的用法 |
| 卸 | `dsh plugin remove billion-context` | 失去增量压缩与 cache 归因，退回 dsh 原生一次性 checkpoint（更粗） |

另一条已被否决：bili config `dsh.allowDshCompaction: true` —— bili 明确警告 checkpoint 会永久覆盖原始历史、不可逆，且会造成双重压缩。

## 7. 相关既有文档（勿重复调研）

- `55267ea6-81b5-4f7f-8ed6-5ef7298db369` —— dsh 自动压缩阈值失真：compaction 判据 heuristic 账本 vs `contextPressure` 真实 usage 双口径（2026-10-04）。
- `784243df-dd9c-413a-b220-7a5c3a5bd207` —— bili / billion-context 前缀缓存命中率归因（2026-10-13），含 `cache-report` GRAND LEDGER 数字与 T1–T5 方案。

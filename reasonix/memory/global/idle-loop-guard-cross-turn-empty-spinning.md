---
id: mem-39f0d921dcdb3cbd7002230638d5e897
revision: 1
created_at: "2026-10-26T16:19:14.380Z"
updated_at: "2026-10-26T16:19:14.380Z"
name: idle-loop-guard-cross-turn-empty-spinning
description: "idle-loop-guard.mjs：抓跨 turn「只想不做」的 dsh 侧 preset，结构判据、三 profile 插入位置、必须重启才生效"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 文件
`C:\Users\27063\.dsh\.agent-presets\anchored-standard\idle-loop-guard.mjs`（214 行，2026-10-27 写）

## 解决什么（gateway 侧 loop-guard 抓不到的那类）
goat-gateway 的 `loop-guard.mjs` 只看**单次 SSE 响应**内字符级 6-gram 的 novelty，两类跨 turn 的空转它抓不到：
1. 每轮只吐几十字、字面各异、但**连续 N 轮没有 tool call** —— 单次响应 novelty 是 0.9+，完全正常
2. 短输出（< 4096 字符）填不满 `slowCapacity` 窗口，fast 判据又因阈值收紧失效

2026-10-26 现场：某请求 reasoning 2639 字符、`fast=0.1758`、`slow=null`，4 次 fast 命中全在 shadow 里只记录不干预 —— 典型的「只想不做」。

## 判据（结构，不看语义）
一个 step 记作 IDLE ⟺ **本 step 结束时尚无任何 tool call**（且 text 总量 ≤ `maxTextCharsPerStep`）。
连续 `maxConsecutiveIdleSteps`（默认 3）次 → 在下一个 step 的 `agent/pre-step` 注入提示，要求「立刻调工具 或 停下来汇报」。

**为什么不用 novelty**：跨 turn 文本相似度不可靠（每轮换个说法就是新的 6-gram），但「该动手时没动手」是结构事实。

## 与 dsh-thinking-guard 的关键区别
thinking-guard 熔断后**注入「继续」** → 新 attempt → 又空转 → 正反馈。
本模块注入**纠正指令**，且**只注入一次**（streak 清零 + `cooldownSteps` 冷却），不制造循环。

## 配置（三 profile 已插入）
```yaml
- id: idle-loop-guard
  name: ../../.agent-presets/anchored-standard/idle-loop-guard.mjs
  config:
    maxConsecutiveIdleSteps: 3
    maxTextCharsPerStep: 2000
    cooldownSteps: 6
```

## 插入位置
- `profiles/web/cordis.patch.yml`：stall-guard 块后（10 空格缩进层）
- `profiles/desktop/cordis.patch.yml`：同上
- `profiles/headless/cordis.patch.yml`：**结构不同** —— `- insert:` 列表里（4 空格缩进），插在 `- id: git-context` 之后

## 生效条件
**preset `.mjs` 不参与 HMR**（`~/.dsh/.agent-presets/**` 不在 exact-path watch 里），**必须重启 dsh 进程**。`dsh --profile web --dump-config` 只能验证静态合成，不能证明 `apply()` 跑过。
验证生效：看 `$DSH_HOME/logs/idle-loop-guard.log` 出现 `installed pid=...`；命中时 `FIRE sess=... steps=...`。

## 备份
`cordis.patch.yml.bak-20261027-001753-pre-idle-loop-guard`（三份）

## 回滚
从 profile 的 `cordis.patch.yml` 删掉 `id: idle-loop-guard` 那段 + 重启。`idle-loop-guard.log` 可留作诊断。

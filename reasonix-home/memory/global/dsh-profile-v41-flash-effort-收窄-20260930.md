---
id: mem-6efc8212ff869a69e4d5bd27da18e5ee
revision: 1
created_at: "2026-09-30T13:16:00.719Z"
updated_at: "2026-09-30T13:16:00.719Z"
name: dsh-profile-v41-flash-effort-收窄-20260930
description: "v4.1-flash 三个 profile 的 reasoningEfforts 收窄为 off/low/high/max（含备份、验证方式、回滚教训、待办审计）"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 改了什么（2026-09-30）

`deepseek/deepseek-v4.1-flash` 的 `reasoningEfforts` 从 **6 档收窄为 4 档**：

```yaml
reasoningEfforts:
  off: null
  low: low
  high: high
  max: max
```

- 改动文件：`~/.dsh/profiles/desktop/cordis.patch.yml`（L675 块）、`~/.dsh/profiles/web/cordis.patch.yml`（L676 块）
- `headless` 本来就是 4 档，未动
- 原因：原 6 档 `{off, low, medium, high, xhigh, max}` 把 **relay 的校验域**当成了模型能力域；`medium`/`xhigh` 在 pi-ai catalog 里是 `null`（详见 [[deepseek-v41-flash-effort-实测与三层档位域-20260930]]）
- 备份：`profiles/<p>/cordis.patch.yml.bak-20260930-2113-pre-effort-trim`（两个 profile 各一份）
- 生效方式：profile patch 走 HMR，**开新会话即生效**，不必重启 dsh 进程

## 验证证据链（可复现）

1. **结构级 diff**（tag 容忍 loader，因文件含 `!!js` tag，`yaml.safe_load` 会挂）：
   备份 vs 新版 `walk()` 展平比对 → 差异恰好 2 个叶子 `[...].reasoningEfforts.{medium,xhigh}` 消失，其余 0 改动。
2. **dsh 自身合成校验**：`dsh --profile web --dump-config` → `exit=0`，v4.1-flash 合成出 `['off','low','high','max']`；`--profile headless` 同。
3. **`desktop` profile 无法 dump**：`dsh --profile desktop --dump-config` 报 `error: profile "desktop" is managed exclusively by the Electron application`。desktop 侧只能用「同构文件 + 结构 diff」兜底 —— 但它与 web 的对应块逐字相同。

## 我做错又修掉的一步（教训）

第一版重写脚本站点定位写错（内层 while 只 append 了 `reasoningEfforts` 块内行，把目标 model 块的前 6 行 `name/contextWindow/maxTokens/input/- text/- image` 吞掉了）。
- **发现方式**：行数变化是 −8 而非预期的 −2。
- 修复：立即从 `*.bak-*-pre-effort-trim` 回滚（行数回到 1237/1141），改为「同缩进定位条目块 → 块内定位 reasoningEfforts → 仅删 KEEP 之外子行」。
- **规则**：改 YAML 类配置文件后必须同时验 (a) 行数增减 == 预期、(b) 结构 diff 叶子集合 == 预期，仅看 grep 输出不算验证。

## 待办（同一审计发现，未处理）

`audit-levels.py` 扫出 desktop/web 还有 **8 个 model** 的档位声明与 catalog 不一致（全部是多给了档位）：`deepseek-v4-flash`(多 low/medium/max)、`Kimi-K3`(多 medium/xhigh)、`Kimi-K2.7-Code`(多 low/medium/xhigh/max)、`GLM-5.2`(多 low/medium/xhigh)、`Qwen3.6-Plus`(catalog 无档位)、`hy4-preview`(多 medium/xhigh/max)、`muse-spark-1.2` / `-1.2-contributor`(多 max)。注：脚本按 model id 匹配，catalog 列可能落到非首要 provider 条目，批量清理前需逐个确认首要 provider 的 `thinkingLevelMap`。

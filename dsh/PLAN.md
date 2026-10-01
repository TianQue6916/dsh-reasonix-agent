# PLAN

> 每步由 `.agent-presets/anchored-standard/plan-anchor.mjs` 取 head 重注入。
> 改完这个文件**不需要重启** —— 它是每 step 现读的。
> 需要细节时直接 read 本文件，不要凭注入的截断段猜测后面的内容。

## 当前目标

把 dsh 打磨成能长期跑的主力 harness：目标每步可见 + 思考链中文 + 工具/技能集干净可审计。

## 进行中

- [ ] plan-anchor.mjs：已写完（72 断言全过）、已注册进 web/desktop 的 cordis.patch.yml、已加进 context-gate allowKinds；**待重启生效**
- [ ] 重启后逐条核对（四条见下节）
- [ ] `~/.agents/skills` 的 4 个孤儿 skill 已加 `disable-model-invocation`，但 skill catalog 是进程级缓存，**重启才从 catalog 消失**

## 重启后必查（四条）

- [ ] `skill_search` 对 `hindsight` / `microsoft-foundry` / `deja-history` / `deja-search` 应零命中
- [ ] 新 session「turn 首步」注入顺序应为 `git-context → plan-anchor → thinking-anchor`（thinking-anchor 最贴采样点）
- [ ] 无 `deja.exe` 被拉起（bundles 已移除 `dsh-deja` + root cordis.patch.yml 三段已注释）
- [ ] reasoning 首块 CJK 占比（重启前基线：AFTER-anchor 首块中位 0.440 / 中文主导 44.8%）

## 已知未决

- 35 处 `reasoningEfforts: false` 与实测矛盾（web 17 + desktop 18）：`zai-org/GLM-5.3`、`MiniMaxAI/MiniMax-M3` 在五档全返回 thinking
- desktop 有 24 个死 model（86 entries vs web 61 vs allowlist 62）—— `rewrite-model-list.py` 只hardcode 了 `profiles/web/cordis.patch.yml`
- `@local/dsh-thinking-language` 源码在 `D:/Toolbox/dsh-thinking-language`（在 `~/.dsh` 之外，不随同步走）
- Linux 连不上 `github.com`（`curl` → 000），任何 `github:` 依赖在那边装不了
- Linux profile bundle 只有 5 个，Windows 12 个

## 原则（不要为了好看违背）

- fail-closed：状态不明就不注入，绝不猜；**过期的状态比没有状态更坏**
- 证据而非断言：每个「已修复」都要有一条可复现的验证命令
- 关闭而非删除：禁用一律用官方开关（`disable-model-invocation` / 从 bundles 数组移除），保留回滚路径

---
id: mem-ddfd779b52ae515c651506ba38fcbb00
revision: 1
created_at: "2026-10-01T13:36:07.112Z"
updated_at: "2026-10-01T13:36:07.112Z"
name: dsh-skill-catalog-not-filtered-by-invocation-20261001
description: "dsh 的 ctx.skills.list() 不过滤 disable-model-invocation，自建 skill_search/skill_load 必须自己过滤；已修并验证"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 结论
`frontmatter` 的 `disable-model-invocation: true` **只在 `dsh-tool-skill` 渲染 catalog 时被读取**，`ctx.skills.list()`（以及 `skills.get()`）**原样返回所有被发现的 skill**。任何自建的 catalog 工具必须自己再过滤一遍，否则被禁用的 skill 依然可被模型发现和加载。

## 代码位置（读出来的，不是猜的）
- `@deepseek-ai/dsh-skill/lib/index.js:37-39` — `function isModelInvocable(skill) { return skill.invocation.modelInvocable; }`
- `@deepseek-ai/dsh-skill-filesystem/lib/index.js:849-858` — `parseInvocationPolicy(data)`：`const disableModelInvocation = frontmatterBoolean(data, "disable-model-invocation")` → 返回 `{ modelInvocable: disableModelInvocation !== true, userInvocable: userInvocable !== false }`；`:700` 把 `invocation` 放进产出的 skill 对象；`:123` / `:600` 同样透传。
- ⇒ **字段形态是嵌套的 `skill.invocation.modelInvocable: boolean`**。扁平的 `skill.modelInvocable` 只出现在对外 API 的 `SkillEntry` 声明里（`dsh-api-session-controller/lib/typert.host.js:3075`、`dsh-tool-cordis/lib/types/api-catalog.js:6988`），`ctx.skills.list()` 给的是嵌套形态。

## 实测证据
2026-10-01 给 50 个 skill 加上 `disable-model-invocation: true`（46 个在 `%APPDATA%\reasonix\skills`，4 个在 `~/.agents/skills`）之后，**新起的 headless dsh 进程里 `skill_search({"query":"hindsight memory plugin"})` 仍然返回 1 命中 `hindsight-coding-agent`** —— 这是定位该 bug 的原始观测。

## 修复
`~/.dsh/.agent-presets/anchored-standard/skill-search.mjs`（251 → 268 行，备份 `skill-search.mjs.bak-<ts>-pre-modelinvocable`）：
```js
const modelInvocable = (skill) => (skill && skill.invocation && skill.invocation.modelInvocable) !== false
```
- `skill_search`：`all.filter(modelInvocable).filter((skill) => {...评分...})`
- `skill_load`：拿到 skill 后 `if (!modelInvocable(skill)) return { text: 'Skill "X" is not model-invocable: its SKILL.md sets `disable-model-invocation: true`. Invoke it from the user side instead.' }`
- 头注释新增「Invocation policy (2026-10-01)」一节记录上述事实。
- **没有** `invocation` 字段的 skill 视为可调用（defensive default，与官方 `!== true` 一致）。

## 验证
- 单测 `~/.dsh/storages/tools/test-skill-search-weight.mjs` 扩到 **18995 chars / 全绿**，新增 case 11 共 11 条：mock fixture（vis-alpha / hid-beta / hid-gamma / leg-delta 四种 invocation 组合）+ 真实库断言 **11.9「46 disabled of 77」**、**11.10「0 leaked」**（逐个用禁用 skill 的名字当 query，全不命中）、**11.11**（7 个 spot query 里禁用 skill 出现 0 次）。
- **顺带修掉一个过期断言**：`translator` 的 known-limit 原写死 `=== 3`，skill 归一化后真实值变成 1（另两个 `*translator*` 条目被归档）→ 改为从 fixture 现算 ground truth 再比对。
- 端到端：新 headless 进程里同一 query → **`No skills match "hindsight memory plugin".`** ✓
- `skill_load` 的正文是通过 `agent.inject({source:{kind:'skill-invocation', name, form:'instructions'}})` 交给下一步的，**返回值里没有 `<skill_content>`**（那是 dsh 渲染时才包的）—— 断言要看 `injected[i].source.kind`。

## 探针（可复用）
`~/.dsh/storages/tools/verify-anchors.patch.yml`（原在 `profiles/headless/.verify-anchors.patch.yml`，带点前缀容易被人误当 profile 自带 patch，已移出）：
```
cd ~/.dsh && dsh --profile headless --patch storages/tools/verify-anchors.patch.yml "<任务>"
```
headless 没挂 context-gate，注入第一轮就进 transcript，是最短验证路径。`--dump-config` 已确认两个 anchor 都被加载。

## 写 python 改这些文件时的坑（复发过两次）
用 heredoc 给 python 传源码时，`\t` 会在 **python 普通字符串**层面被解释成真制表符，导致 `assert s.count(OLD) == 1` 报 0。文件里存的是字面 `[ \t]*`。**构造时用 `T = chr(92) + 't'` 拼接**，或用 raw string。

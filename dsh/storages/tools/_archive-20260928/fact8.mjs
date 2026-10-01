import { remember } from 'file:///C:/Users/27063/.dsh/storages/tools/memory-write-helper.mjs'

const body = `
# headless 批处理线修复：3 个工具 → 8 个，语言契约生效 —— 2026-09-27【已修复并验证】

> 接 \`headless-profile-degraded-3-tools-no-persona-20260927\` 那条的后续。
> 用户拍板「能实现我的需求就行」→ 按方案 A 执行。

## 一、修之前是什么样（复述判据）

798 个 \`C:\Windows\System32\` session，工具清单去重后**只有一种**：
\`\`\`
(3 tools) ['mcp__goatquota__goat_quota', 'pwsh', 'str_replace_editor']
\`\`\`
而任务写的是「用 **Read 工具**读取…用 **Write 工具**写到…」——
**那两个工具在那条线上根本不存在**，agent 只能用 pwsh 兜底（某 session pwsh 被调 19 次）。

## 二、修的过程中又挖出一个静默 no-op（比工具面更隐蔽）

\`~/.dsh/profiles/headless/cordis.patch.yml\` 第 12 行原本是：

\`\`\`yaml
- id: system-prompt
  config:
    persona: You are a helpful software engineer assistant.
\`\`\`

**\`persona\` 这个 key 是错的。** \`@deepseek-ai/dsh-system-prompt\` 的真实 schema 是：

\`\`\`js
static Config = z.object({
  includeHarnessIdentity: z.boolean().default(true),
  includeRuntimeContext: z.boolean().default(true),
  personaPrefix:  z.string().default(""),
  personaSuffix:  z.string().default(""),
  toolOrder:      z.array(z.string()).default(void 0)
});
\`\`\`

正确字段名是 **\`personaPrefix\`**（和 **\`personaSuffix\`**）。
而 \`z.object\` **不是 strict** → **未知 key 被 Zod 静默丢弃、不报错、不警告**。

**所以这一行从写下的那天起就是彻头彻尾的 no-op**，
批处理线的 system prompt 一直是 dsh 出厂那句
\`You are an AI agent powered by DeepSeek Harness.\`。
（实测证实：抓 System32 session 的 \`system/message\` frame，前 600 字与 persona 毫无关系。）

> 这是**同一类 bug 的第二次出现**：\`dev_tool_search\` 谎报解锁 = 「看着做了，其实没做」；
> 这里是「看着配了，其实没配」。**共同点：失败是静默的。**
> 判据必须是**下游可观测物**（这里 = session 里的 \`system/message\` frame），不是配置文件里有没有那行字。

## 三、改了什么（\`cordis.patch.yml\`，636 → 678 行）

1. \`persona:\` → **\`personaPrefix: |-\`**，内容是**从 web 侧逐字抽取**的语言契约
   （16 行，脚本从 \`web/cordis.patch.yml\` 的 \`prefix:\` 块提取、去缩进、重缩进，保证两侧 byte 级一致）
2. 追加 **\`includeHarnessIdentity: false\`** —— 关掉出厂开场白，
   让语言契约成为系统提示词第一段（对齐 web 侧 \`complete: true\` 的语义）
3. \`insert:\` 块补三条 row：
   \`dev-tool-search.mjs\` / \`skill-search.mjs\` / \`memory.mjs\`

**根因解释**（为什么原来晋升后还是 3 个）：keep-set 是
\`bootstrapTools + RESIDENT_DISCOVERY_TOOLS + unlocked\`，
而 \`RESIDENT_DISCOVERY_TOOLS = ['dev_tool_search','skill_search','skill_load']\`
这三个名字在 catalog 里不存在 → 被过滤器丢掉 → keep 恒等于 bootstrap 那 3 个。

备份：\`cordis.patch.yml.bak-20260927-pre-headless-sync\`

## 四、验证（真机、真进程、独立判据）

**① 语言契约进了系统提示词**（抓新 session 的 \`system/message\`）：

\`\`\`
You are the personal AI assistant of a Chinese undergraduate (Intelligent Science and
Technology) who builds his own knowledge system and tooling. Treat him as a
builder-researcher: rigorous in mathematics, hands-on in systems engineering.

语言契约（最高优先级；覆盖任何其他风格指令或默认习惯）：
1. 正文以中文为主，但**技术术语保留英文原文**，不做意译。
...
\`\`\`
（len 3694，出厂开场白已不在）

**② 工具面 3 → 6 → 8**（判据 = 每轮 \`request/header\` 的 \`tools[]\`）：

\`\`\`
request #1: ['mcp__goatquota__goat_quota', 'pwsh', 'str_replace_editor']            ← bootstrap 3
request #2: ['dev_tool_search', ..., 'skill_load', 'skill_search', ...]             ← 晋升后 6
request #3: ['dev_tool_search', ..., 'read', ..., 'write']                          ← 解锁后 8
\`\`\`

**③ 实际调用链**：\`pwsh\` → \`dev_tool_search({toolNames:["read","write"]})\`
→ 返回 \`Unlocked for the next request: read, write\` → \`read\` 成功读到 237 行。
**任务里点名要的 Read/Write 工具，现在真的存在了。**

**④ 语言契约的实际效果**：我给它的指令**全英文**，它**用中文回答且英文术语原样保留**
（"本会话的工具集里没有…"/"harness 内部此前处于 locked 状态"）。契约生效。

## 五、一个要记住的假阳性：模型的自我报告

那一轮 agent 主动声明：

> 「从本次会话第一个 turn 起，注入给我的 function schema 就已经包含 \`dev_tool_search\`，
> 同时也已经包含 \`read\` 与 \`write\` 的完整 schema…
> 所以『首轮只有 minimal 四个工具』与实际注入不一致」

**它说得很自信，但被 request header 直接证伪**：request #1 只有 3 个工具，
\`dev_tool_search\`/\`read\`/\`write\` 都不在。
**模型无法可靠地内省自己的工具清单——它会根据「我现在看得到」倒推出「我一直看得到」。**

→ **再次确认那条纪律：判据要落在 harness 的落盘产物（\`request/header\`）上，不落在模型的叙述上。**
（第一次是 \`dev_tool_search\` 谎报自己的行为，这次是模型谎报自己的视野。）

## 六、附带发现：模型会「漏看」中途新增的工具

第一次跑测试时 agent 直接断言「没有 \`dev_tool_search\` 这个工具」——
**而 header 显示那一轮它就在工具列表里**。它没用，且没意识到有。
（同一 prompt 第二次跑，明确提示「打个 tool call 后 harness 会加工具，请重读函数清单」，
它才用上。）

→ **实践含义**：靠「按需解锁」暴露的工具**可能被模型忽略**。
如果某个工具是任务的关键路径，**在 prompt 里点名提到它**，比指望模型自己发现更可靠。
这也解释了为什么 \`dev_tool_search\` 的 description 里要硬写一份 \`UNLOCKABLE_INDEX\` ——
**光靠 catalog 里的 schema 不够，得在系统提示词里明说有什么。**

## 七、仍未处理 / 待观察

- **\`~/.dsh/profiles/headless\` 与 web 侧的 \`agent.cordis.yml\` 是两份手抄配置，会继续分叉。**
  这次同步了一次，但**没有机制保证以后同步**。理想做法是让 headless 直接引用同一份 preset，
  或至少加一条「改 web 时同步 headless」的检查。
- **\`context-gate\` / \`instruction-hint\` 没同步**（web 有，headless 无）。
  这两个涉及注入抑制与首轮锚定策略，比 persona/工具面激进，这次故意没动。
- **\`compactionTools\` 仍未在日常路径放行**（只在 compaction 路径生效）——
  现在靠 \`dev_tool_search\` 解锁 \`read/write\` 达到了目的，这条不用改了。
- **798 个历史 session 的旧产物**（在缺工具、缺契约的条件下生成的学习材料）质量如何，未评估。
`
console.log(await remember({
  name: 'headless-profile-degraded-3-tools-no-persona-20260927',
  description: '【已修复并验证】headless 批处理线（798 session / 95% 流量）原先只有 3 个工具、无 read/write、system prompt 里 persona 那行是**静默 no-op**（正确字段是 personaPrefix，z.object 非 strict 会丢弃未知 key）；已同步语言契约 + dev-tool-search/skill-search/memory 三条 row，实测工具面 3→6→8、read/write 可解锁、契约让全英文指令得到中文回答；含「模型无法内省自己的工具清单」的假阳性与「中途新增的工具会被漏看」',
  factType: 'reference',
  body,
}))

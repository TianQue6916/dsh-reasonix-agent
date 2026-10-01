import { remember } from 'file:///C:/Users/27063/.dsh/storages/tools/memory-write-helper.mjs'

const BS = String.fromCharCode(92)
const P1 = 'C:' + BS + 'Temp' + BS + '100b' + BS + 'p008' + BS + 'expand' + BS + '01_spec.md'
const P2 = 'C:' + BS + 'Temp' + BS + '100b' + BS + 'p008' + BS + 'expand' + BS + '01_out.md'

const body = `
# headless 批处理线只有 3 个工具、没有语言契约、没有记忆 —— 2026-09-27 实证

## 一、结论

用户**最主要的内容生产管线**（批量生成学习材料）跑在 \`headless\` profile 上，
而那条线**是半套配置**：

| 维度 | web（anchored-standard） | headless（现状） |
|---|---|---|
| 工具数 | 2 → 5 → 11（渐进） | **恒为 3** |
| 工具 | bash / str_replace_editor / dev_tool_search / skill_* / memory_* / web_search / subagent / goal / job / workflow … | 只有 \`mcp__goatquota__goat_quota\` + \`pwsh\` + \`str_replace_editor\` |
| read / write / edit / glob / grep | 有 | **一个都没有** |
| persona | 语言契约（中文为主 + 术语保留 + 思考链中文） | 仍是旧的 \`You are a helpful software engineer assistant.\` |
| memory.mjs | 有 | 无 |
| skill-search.mjs | 有 | 无 |
| dev-tool-search.mjs | 有 | 无 |
| context-gate / instruction-hint | 有 | 无 |

**证据**：\`~/.dsh/sessions/--C-Windows-system32--/\` 下 **798 个 session**，
逐个读 \`request/header\`，工具清单**去重后只有一种**：

\`\`\`
(3 tools) ['mcp__goatquota__goat_quota', 'pwsh', 'str_replace_editor']
\`\`\`

## 二、这些 session 在干什么（不是空跑）

样例任务（最近一个）：

> 用 Read 工具读取 \`${P1}\`。**要求**：把每条短注扩写到
> 不少于 800 个汉字（目标 900-1100），保留原观点，不足就补充**机制展开、可手算例子、跨课程连接**；
> 保持同样条数。用 **Write 工具**写到 \`${P2}\`，完成后只回一行 DONE。

这是**用户的学习资料生产线**，而且任务描述里明确点名了要 Read / Write 工具。

## 三、后果（具体的、可量化的）

1. **任务要求的 Read / Write 工具在那条线上不存在。** agent 只能用 pwsh 兜底——
   实测一个 session：**pwsh 被调用 19 次，str_replace_editor 1 次**。
   读写一个文件本该 2 次调用，实际退化成一堆 pwsh。
2. **没有语言契约**：用户在 2026-09-26 明确要求「中文为主 + 英文术语保留 + 思考链中文」是**系统级**的。
   而**产出中文学习材料这条线**恰恰没有它。
3. **没有 memory_profile**：任务要求「跨课程连接」「机制展开」，
   而这正是 \`use-user-persona-before-tasks\`（先调画像校准讲法与深度）要解决的场景——
   批处理线上这条规则**结构上不可能触发**（工具不存在）。
4. **没有 skill**：批量任务无法复用已沉淀的方法论。

## 四、根因（已定位）

\`tool-bootstrap.mjs\` 的 keep-set 逻辑：

- bootstrap 阶段：\`keep = bootstrapTools\` → headless 配的是
  \`[pwsh, str_replace_editor, mcp__goatquota__goat_quota]\`，**就这 3 个**
- 晋升后：\`keep = bootstrapTools + RESIDENT_DISCOVERY_TOOLS + unlocked\`
  其中 \`RESIDENT_DISCOVERY_TOOLS = ['dev_tool_search','skill_search','skill_load']\`
- **但 headless 根本没挂 \`dev-tool-search.mjs\` / \`skill-search.mjs\`**，
  这三个名字在 catalog 里不存在 → 被过滤器丢掉 → **晋升后 keep 还是那 3 个**
- 而 \`dsh-base\` 有 \`read/write/edit/glob/grep\`，只是**从来没被放行**

\`cordis.patch.yml\` 里的 \`compactionTools: [read, write, edit, glob, grep, todo_write, ask_user_question]\`
只在 compaction 路径生效，**日常请求里不放行**。

## 五、两条修法（未执行，待用户拍板）

**A. 挂 discovery 插件（与 anchored 哲学一致，推荐）**
往 \`~/.dsh/profiles/headless/cordis.patch.yml\` 加三条 row：
\`dev-tool-search.mjs\` / \`skill-search.mjs\` / \`memory.mjs\`，
再把 persona 换成语言契约。→ agent 晋升后能按需解锁 read/write/memory，工具面从 3 变「3 + 按需」。

**B. 直接把 read/write/edit/glob/grep 塞进 \`bootstrapTools\`**
简单粗暴，首轮就不再是 Minimal 锚定（**会破坏「首轮锚定」这个实验设计**）。不推荐。

**没有擅自动手的原因**：这是用户**正在跑的生产管线**（798 个 session 的产出）。
改 persona 直接影响产出文风，改工具面直接影响 batch 行为——
**这属于「该问一句」的改动，不属于「你看着做吧」的范围**。

## 六、教训

**「配置在 A 处做好了」不等于「B 处也是好的」。**
我上一轮一直在 web 侧打磨（persona / memory / skill / 加权），
却从没想过问一句：**用户的实际工作量在哪条 profile 上？**
答案是 \`headless\`，占了 798/838 个 session（95%）。
**优化要先找到真实的流量在哪，否则就是在没人走的那条路上修路灯。**
`

console.log(await remember({
  name: 'headless-profile-degraded-3-tools-no-persona-20260927',
  description: 'headless 批处理线（798 个 session，占 95%）实证只有 3 个工具、无 read/write、仍是旧英文 persona、无 memory/skill/dev-tool-search；而它正是用户批量生成中文学习材料的生产线，任务里还点名要 Read/Write 工具（实际退化成 19 次 pwsh 兜底）；根因是 tool-bootstrap 的 keep-set + 未挂 discovery 插件；给出两条修法并说明为何未擅自动手',
  factType: 'reference',
  body,
}))

/**
 * thinking-anchor.mjs — 在每一步生成前，把「思考链的语言」钉在上下文的最尾部。
 *
 * 语言从哪来（2026-09-30 合并后）
 *   锚点**不再硬编码中文**：文本按 $DSH_HOME/storages/thinking-language.json 的
 *   `thinking` 字段（'zh' | 'en'）逐 step 现读，缺文件 / 坏 JSON / 越界值一律回落中文。
 *   该文件与 @local/dsh-thinking-language（Settings → 思考语言）共用同一份契约，
 *   所以「强锚点」与「可切换」是同一条链路，不再互相打架：
 *     Settings 切换 → 写状态文件 → 下一步 readLanguage() 换文本 → 无需重启 / 无需新建会话。
 *   于是 clause 5 在 profile patch 里回到中立化措辞（语言由本 directive 指定），
 *   静态文案与运行时开关不会各说各话。
 *
 * 为什么不是只改 persona
 *   2026-09-30 实测：把「思考链用中文」放在 persona / system prompt 里（无论措辞多硬）
 *   都不足以保证服从。单看 ~/.dsh/sessions/**（943 条 session，214 条「正文为中文」的
 *   root session）：
 *     - reasoning 的 CJK 占比（剥离 code / path 后）block 级中位数 0.023，p90 0.123；
 *     - 787 条 block>=4 的 session 里，首块为中文主导的只有 17 条（2.2%）；
 *       首块为英文主导的 770 条，后续每块的中位数永远停在 0.00-0.01 —— 语言一旦定下来就不回摆。
 *   也就是说：指令「在 system prompt 里」这个事实本身不足以保证服从，位置比措辞重要。
 *   （同一实测还发现：旧措辞让 12/12 个 sampled delegated child 用英文推理 ——
 *     child 侧因此在 subagent-language.mjs 里另有独立约束，不依赖本锚点。）
 *
 * 为什么挂在 agent/pre-step 的尾部
 *   在 agent/pre-step waterfall 里往 decision.messages 末尾追加一条消息，它落在
 *   **紧贴生成点**的位置 —— 比 system prompt 更靠近采样。这是本 harness 里能拿到的最强位置
 *   （`prefill` / assistant prefix 在 dsh 里不存在：~/.dsh/profiles/node_modules 全量 grep
 *   `prefill` / `assistantPrefix` 零命中，所以「把第一个 block 的语言变成输入」这条路走不通）。
 *
 * 注入形状（照抄 git-context.mjs / 官方 @deepseek-ai/dsh-time-context）
 *   id 必填：缺它会让 session validator 报 "session event at seq N lacks an identified message"，
 *   整个 session 被判 corrupt。preset 模块只能 import node 内建模块（解析根是 preset 目录、
 *   没有 node_modules），所以消息形状手写，不能用 dsh-llm 的 createUserMessage。
 *
 * 注册位置（重要，别随手挪）
 *   agent/pre-step 的 after-next transform 按**注册顺序的逆序**执行：先注册的是最外层、
 *   最后改写结果。要让本行的消息落在别的注入**之后**（即真正的最尾部），本行必须在
 *   agent.cordis.yml / profile patch 里注册在那些行之前 —— 当前放在 context-gate 之后、其它行之前。
 *
 *   但光靠 cordis.yml 里的先后还不够（2026-10-01 补）：dsh-mnemon 的 pre-step handler 用
 *   `ctx.on('agent/pre-step', h, { prepend: true })` 把自己 unshift 到 listener 数组的头部，
 *   于是不管它在 cordis.yml 里排多靠后，都稳坐最外层。实测 desktop 的 turn 首步注入顺序是
 *   `anchor → (MNEMON 提示) → (MNEMON RUNTIME MEMORY SNAPSHOT) → git-context → anchor`，
 *   锚点被 mnemon 顶离了采样点（后续 step 才是干净的 `git-context → anchor`）。
 *   所以本行也改用 { prepend: true }：谁后 unshift 谁在外层。profiles/web/cordis.yml 的顶层
 *   list 保证 mnemon-bundle 排在 preset-anchored-standard 之前 mount，故本行后 unshift、胜出。
 *   若日后新增别的 pre-step 注入行，同样用 prepend 抢，并在此处记账。
 *
 * context-gate
 *   本行的 source.kind 已加入 context-gate 的 allowKinds，因此第一轮（unpromoted）也不会被剥掉：
 *   首块的语言正是最需要被影响的那一块（见上面的 2.2%）。
 *
 * 去重（2026-10-01 加，实测驱动）
 *   上面那条「已知风险」在第二天就被实测确认了，而且剂量-反应关系非常干净。
 *   取样 session-10ca9bfe（root，同一天，102 个 reasoning 块）：把「该块生成时上下文里
 *   已经累积的锚点条数」当自变量，CJK 占比（剥离 code / path 后）当因变量：
 *
 *     ctx 内锚点条数    块数    CJK 中位   中文块(>0.3)
 *     0（无锚点基线）     48      0.00       1/48
 *     1 - 19             19      0.44      19/19
 *     20 - 39            19      0.43      17/19
 *     100               1      0.54       1/1
 *     110+               15      0.03       0/15
 *
 *   同一条 session 内先中文、后回落英文，说明锚点本身没坏、注入也没断（该 session 里
 *   逐条核对过 124 条 source.kind='thinking-anchor' 的 user 消息），坏的是**剂量**：
 *   锚点在「少量在场」时近乎决定性（19/19，基线 1/48），累积到上百条后归零。
 *   transcript 只增不改，而本行每步都追加同一条逐字相同的文本，所以累积是必然的。
 *
 *   因此改成：**先删掉本行此前注入的全部锚点，再追加唯一一条**。上下文里永远恰好 1 条，
 *   且永远贴着生成点。副作用是省掉重复文本（每条约 130 token，124 条 ≈ 16K token）。
 *   回滚开关：config.pruneHistory: false 恢复旧的累加行为。
 *
 * 已知风险（残余）
 *   仍是同一条文本每步重发。若「永远只有 1 条」之后还观察到衰减，下一刀是让文本带一点
 *   变化（例如当前 step 序号），而不是继续加长。
 */

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const name = 'thinking-anchor'
export const inject = []

/**
 * 语言状态契约：与 @local/dsh-thinking-language 的 host 半侧是**同一份文件**。
 * 两套机制合并后的唯一真相源就是它 —— 锚点不再硬编码中文。
 */
const STATE_FILE = 'thinking-language.json'
/** 读不到 / 读坏了时的回落语言（语言契约的历史默认值）。 */
export const DEFAULT_LANGUAGE = 'zh'

export const dshHome = () => process.env.DSH_HOME ?? join(homedir(), '.dsh')
export const statePath = () => join(dshHome(), 'storages', STATE_FILE)

/** 归一化：只有 'en' 算英文；缺失 / 坏 JSON / 越界值一律回落中文。 */
const normalizeLanguage = (value) => (value === 'en' ? 'en' : DEFAULT_LANGUAGE)

/**
 * 热读当前思考链语言。任何异常都吞掉并回落 DEFAULT_LANGUAGE ——
 * 锚点坏掉绝不能影响会话可用性（这是本文件从头到尾的纪律）。
 *
 * 不做缓存（2026-10-01 自测纠正）：早先版本用 `mtimeMs:size` 当缓存键，但
 * `{"thinking":"zh"}` 与 `{"thinking":"en"}` **恰好同为 17 字节** —— 同毫秒内切换
 * 会键相同而内容已变，读回上一个语言（自测 [8] 就是这样被打红的）。真实使用中
 * 人手切换不可能落在同一毫秒，但这属于「为了微优化引入一类静默错判」，不值当：
 * 状态文件 ~17 字节，每步一次 readFileSync 的代价相对一次采样请求可以忽略，
 * 而「逐 step 现读」的语义也由此**字面为真**。
 */
export function readLanguage() {
  try {
    return normalizeLanguage(JSON.parse(readFileSync(statePath(), 'utf8'))?.thinking)
  } catch {
    return DEFAULT_LANGUAGE
  }
}

/** 锚点文本按语言各一份。保持极短：它每步都要重发一次。 */
export const ANCHOR_TEXT = {
  zh: [
    '<thinking-language>中文</thinking-language>',
    '思考链（reasoning）用中文写：中文句子 + 英文术语原词（provider / patch / token / cache / session 照抄）。',
    '不要写英文句子，不要把整句英文当内心独白。',
  ].join('\n'),
  en: [
    '<thinking-language>English</thinking-language>',
    'Reason in English: full English sentences, with technical terms kept verbatim.',
    'Do not write Chinese sentences in the thinking chain.',
  ].join('\n'),
}

/** 本步要注入的文本：显式 cfg.text 优先，否则跟随语言状态。 */
const resolveText = (cfg, language) =>
  typeof cfg.text === 'string' && cfg.text !== '' ? cfg.text : ANCHOR_TEXT[language]

/** 观测计数（自测与现场诊断用；每个进程各自持有一份，不跨进程共享）。 */
export const stats = { injected: 0, pruned: 0 }

/** 判定一条消息是不是本行此前注入的锚点（只认自己的 source.kind，绝不误删别人的消息）。 */
const isOwnAnchor = (message) =>
  message !== null &&
  typeof message === 'object' &&
  message.source !== null &&
  typeof message.source === 'object' &&
  message.source.kind === name

export function apply(ctx, config) {
  const cfg = config && typeof config === 'object' ? config : {}
  if (cfg.enabled === false) return

  // { prepend: true }：见头注释「注册位置」—— 与 dsh-mnemon 抢最外层，后 unshift 者胜。
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const decision = await next()
    try {
      if (decision && decision.kind === 'reject') return decision
      const messages = Array.isArray(decision?.messages) ? decision.messages : null
      if (messages === null) return decision
      // 语言在**每一步**现读：Settings 里切换后，下一条消息的下一个 step 立即换语言，
      // 不需要重启进程、也不需要新建会话。这是把锚点与开关合并的关键。
      const text = resolveText(cfg, readLanguage())
      // 先剪掉本行此前注入的锚点：transcript 只增不改，累加会让锚点退化成噪声（见头注释）。
      const kept = cfg.pruneHistory === false ? messages : messages.filter((m) => !isOwnAnchor(m))
      stats.injected += 1
      stats.pruned += messages.length - kept.length
      return {
        ...decision,
        messages: [
          ...kept,
          {
            id: randomUUID(),
            role: 'user',
            content: [{ type: 'text', text }],
            source: { kind: name, form: 'snapshot', sections: [{ name, text }] },
          },
        ],
      }
    } catch {
      // 注入失败绝不能吃掉用户上下文 —— 原样放行
      return decision
    }
  }, { prepend: true })
}

---
name: skill-creator
description: Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or optimize an existing skill, run evals to test a skill, benchmark skill performance with variance analysis, or optimize a skill's description for better triggering accuracy.
---

# Skill Creator

创建新 skill、迭代改进已有 skill、用 evals / benchmark 测 skill performance。

**何时触发**：用户想从零建 skill、编辑或优化已有 skill、跑 evals 测 skill、用 variance analysis benchmark performance，或优化 description 的 triggering accuracy。

**怎么用**：先判断用户处在 loop 的哪一步，跳进去帮他推进；已有 draft 就直接进 eval / iterate 部分。他说「不用跑评测，就陪我 vibe」时也可以不做 eval。

## 核心流程（最短可执行主路径）

1. **Capture intent** —— 问清 4 件事：skill 让 Claude 做什么、何时该 trigger、期望的输出格式、要不要建 test cases。对话里可能已有要 capture 的 workflow，先从 conversation history 挖（用过的 tools、步骤顺序、corrections、观察到的 input/output 格式）。
2. **Interview & research** —— 主动问 edge cases、input/output 格式、example files、success criteria、dependencies；有对 research 有用的 MCP 就并行查。写 test prompts 前先敲定这步。
3. **写 draft SKILL.md** —— frontmatter 至少 `name` + `description`。`description` 是主要 triggering 机制，要同时写清「做什么」和「什么上下文用」，所有 when-to-use 信息放这里、不放 body；Claude 有 undertrigger 倾向，所以写得偏 pushy。
4. **写 2-3 个 realistic test prompts** —— 存到 `evals/evals.json`，此时只写 prompts，assertions 下一步再补。
5. **同一 turn 内 spawn 两路 subagent**（with-skill 与 baseline 一起发，别先跑 with-skill 再回头补 baseline）。结果放 `<skill-name>-workspace/`（与 skill 目录同级），按 `iteration-N/eval-<ID>/with_skill/outputs/` 组织，边跑边建目录。
6. **跑的过程中** draft assertions 并讲给用户听；**每路跑完**立刻把 notification 里的 `total_tokens` / `duration_ms` 存进该 run 目录的 `timing.json` —— 唯一一次抓取机会，不落盘就没了。
7. **全部跑完后**：grade each run（落 `grading.json`）→ aggregate benchmark → 生成 viewer 给用户看，并说明两个 tab 分别是什么。
8. **读 `feedback.json` → 改 skill → 下一轮 `iteration-<N+1>/`（含 baseline）→ 再看 feedback**，直到用户满意 / feedback 全空 / 不再有实质进展。
9. **收尾**：用户认可后可选做 description optimization，再 package 成 `.skill` 交给他。

关键命令（命令与参数同 references，换行已重排，前置条件见 references）：

```bash
# 聚合 benchmark（在 skill-creator 目录下跑）
python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>

# 起 viewer；iteration 2+ 再加 --previous-workspace <workspace>/iteration-<N-1>
nohup python <skill-creator-path>/eval-viewer/generate_review.py \
  <workspace>/iteration-N --skill-name "my-skill" \
  --benchmark <workspace>/iteration-N/benchmark.json > /dev/null 2>&1 &

# description optimization（用当前 session 的 model id）
python -m scripts.run_loop --eval-set <path-to-trigger-eval.json> \
  --skill-path <path-to-skill> --model <model-id-powering-this-session> \
  --max-iterations 5 --verbose

# 打包
python -m scripts.package_skill <path/to/skill-folder>
```

## 按需读取 references

只读当下这步需要的，不要通读整个目录：

| 什么时候读 | 读哪个 |
|---|---|
| 拿捏跟用户的措辞（`evaluation` / `benchmark` 可随口用，`JSON` / `assertion` 要先看用户是否懂）；要回顾创建流程与沟通原则 | `references/workflow-overview.md` |
| 要 capture intent、interview & research、填 SKILL.md 的各个 component | `references/creating-a-skill.md` |
| 要写或改 SKILL.md body：目录结构、progressive disclosure、output format / examples 写法、writing style；检查 skill 不该出现的内容 | `references/skill-writing-guide.md` |
| 要落 `evals/evals.json` | `references/test-cases.md`（完整 schema 见已有 `references/schemas.md`） |
| 要真正跑 evals：spawn runs、写 `eval_metadata.json`、draft assertions、抓 timing、grade、aggregate、起 viewer | `references/running-evals.md` |
| 用户点了 "Submit All Reviews"，要读 feedback / 关 viewer server | `references/eval-viewer-and-feedback.md` |
| 拿到 feedback 后要改 skill（generalize、lean prompt、explain why、抽公共 script）、跑 iteration loop，或做 blind comparison | `references/improving-the-skill.md` |
| 要优化 description 的 triggering accuracy：生成 trigger eval queries、用 HTML template 让用户 review、跑 optimization loop、理解 triggering 机制 | `references/description-optimization.md` |
| 环境里有 `present_files` tool，要打包并交付 skill | `references/package-and-present.md` |
| 在 Claude.ai 或 Cowork 里跑（无 subagent / 无 browser / 要更新已安装的 skill） | `references/platform-variants.md` |
| 要 spawn `agents/grader.md` / `agents/comparator.md` / `agents/analyzer.md`，或再确认核心 loop 与目录约定 | `references/reference-files-and-loop.md` |

## 铁律（细节见对应 references）

- 跑 test cases 是**一段连续序列，不要中途停**；不要用 `/skill-test` 或别的 testing skill。
- `grading.json` 的 expectations 数组只能用 `text` / `passed` / `evidence` 三个字段名，viewer 依赖它们；能程序化检查的 assertion 就写 script 跑，别肉眼判断。
- benchmark 里每个 with_skill 版本排在它 baseline 前面。baseline：新建 skill = 完全不用 skill（`without_skill/`）；改已有 skill = 改动前旧版（先 `cp -r` snapshot，`old_skill/`）。
- **先让用户看 viewer，再自己评估输出**：GENERATE THE EVAL VIEWER *BEFORE* evaluating inputs yourself。用 `generate_review.py`，不要自己写 HTML。
- Cowork / headless（无 display 或 `webbrowser.open()` 不可用）改用 `--static <output_path>` 出 standalone HTML；反馈走下载的 `feedback.json`，要拷回 workspace 供下一轮读。
- 改进要 generalize，别 overfit 到那几个 test case；解释 why，别写全大写 ALWAYS / NEVER；多个 test case 里反复手写的 helper script 应 bundle 进 `scripts/`。
- skill 不得含 malware、exploit code 或任何危及系统安全的内容。
- Claude.ai 上没有 subagent / browser：自己按 SKILL.md 逐个跑 test prompt、跳过 baseline 与定量 benchmark、结果直接贴进对话，并跳过 description optimization 与 blind comparison。

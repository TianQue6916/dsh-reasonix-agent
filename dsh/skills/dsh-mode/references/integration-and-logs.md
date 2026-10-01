> 来源：本技能原 `SKILL.md` 第七～八节（2026-10-01 重排时逐字保留，未作压缩）。

## 七、DSH ↔ Reasonix 双向集成

| 方向 | 机制 | 状态 |
|---|---|---|
| Reasonix → DSH | `dsh-gate` 钩子：难任务/需 pro 自动调 DSH headless，只整合结果不重复推理 | ✅ |
| DSH → Reasonix 记忆 | dsh-gate 注入 `~/.reasonix/memory` 目录（含画像），DSH 按需读取 | ✅ |
| DSH → Reasonix 技能 | dsh-skill-filesystem 的 `customSkillDirs` 指向 `~/.reasonix/skills`，skill_search/skill_load 可发现 | 可配 |
| DSH 输出落盘 | 本机 `/tmp/dsh-gate/`，主力机 `%TEMP%\dsh-gate\` | ✅ |

## 八、会话日志分析工具

`~/.reasonix/global-workspace/scripts/dsh-analysis/`：
- `analyze-session.py <jsonl>` — 打印每个 request/header 的模型、effort、工具目录、system 开头
- `fingerprint2.py <jsonl>` — 统计 reasoning 指纹（we / let's / let me）与字符数
- `dump-event.py <jsonl> <type> [n]` — dump 指定类型事件
- `summary.py <jsonl>` — 事件类型分布 + 最后事件 + error

用法：`zstd -dc <session.v3.jsonl.zstd> > /tmp/x.jsonl && python3 analyze-session.py /tmp/x.jsonl`
（0.1.5 起文件名带 `.v3.`；0.1.1 及更早为 `session.jsonl.zstd` — 两者并存于同一会话目录时，取 v3）

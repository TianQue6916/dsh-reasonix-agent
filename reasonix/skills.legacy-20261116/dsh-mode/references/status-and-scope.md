> 来源：本技能原 `SKILL.md` 顶部「当前状态」块（2026-10-01 重排时逐字保留）。上述「第十一节」在重排后对应 `references/upgrade-0-1-5.md`。

> ## ⚠️ 当前状态（2026-09-04 用户拍板，以此为准）
> **本机（小电脑）不跑 dsh**（性能不足）——调用 dsh 一律走 `dsh-remote`（本机 `~/.local/bin/dsh-remote`，转发到主力机执行，pro+effort=max）。
> 本文件下述「本机 dsh / ~/.dsh / 本机 8 个 live 会话」等内容均为 **2026-08-16 之前本机实跑时期的原理档案**，仅存档参考，不再作为操作指令。主力机 dsh 机制仍适用（同机锁、settings 备份等）。
> 操作规范见记忆 `工具-dsh并发调度与命令铁律-20260904.md`。
>
> 本技能与 `dsh-gate`（调用钩子）互补：dsh-gate 是「怎么调」，本技能是「有什么模式、什么原理、怎么配」。
>
> **2026-09-20：dsh 已升级 0.1.1-rc.2 → 0.1.5-rc.2**（Windows 主力机实测）。**CLI 调用方式未变**——`--profile` / `--patch` / `web` / 位置任务文本全部兼容，`dsh-gate-conc.ps1` 无需改动（已端到端复测通过）。变化集中在：插件默认挂载（`str_replace_editor` 不再默认）、会话日志文件名（`session.v3.jsonl.zstd`）、session 对象 API（`session.events` 移除）。详见 **第十一节**。

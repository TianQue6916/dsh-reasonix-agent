---
name: dsh-gate
description: DeepSeek Harness 决策钩子——需 dsh/深层推理/正式证明/长文档任务时转发主力机 dsh（dsh-remote）。2026-09-10 用户拍板：**pro 弃用，全任务统一 v4.1 flash**（`deepseek-v4.1-flash`），难任务靠「多查资料 + 足量 prompt + 多轮优化」；调用方必须显式指定模型 `-m deepseek-v4.1-flash` + effort `-e`（off/low/high/max），禁止关键词自动判定（`-pro` 语法保留但等价 `-m deepseek-v4.1-flash -e max`）
version: 2.5.0
---

# dsh-gate — DSH 强制显式调用钩子（2026-09-10 v2.2：全任务统一 v4.1 flash）

> **当前规范**：本机（小电脑）**不跑 dsh**（性能不足，用户 2026-09-04 拍板）——调用 dsh 一律走 `dsh-remote`（本机 `~/.local/bin/dsh-remote`，SSH 转发主力机执行）。

## ⚠️ 2026-09-09 核心变更：禁止关键词自动判定（用户拍板，2026-09-10 补：pro 弃用）

旧版按任务描述关键词（证明/推导/审计/数学…）**自动**选模型（难→pro、易→flash）——**不灵活、已废除**。2026-09-10 起连「难→pro」也不再有：**全任务统一 v4.1 flash，只用 `-e` 区分算力**。
现在**必须由调用方（Reasonix agent）显式为被调用端（dsh）选择模型 + 思考强度**：

```bash
dsh-remote -m deepseek-v4.1-flash -e max "任务"          # 显式 max effort（需要最强推理时）
dsh-remote -m deepseek-v4.1-flash -e high "任务"   # 显式 flash + high（常规任务）
dsh-remote -m <任意67模型> -e <effort> "任务"     # 显式指定
```

- `dsh-remote` 与主力机 `dsh-gate-conc.ps1` 均已删除关键词列表；**缺模型即报错**（exit 2），不猜、不默认。
- `effort` 可省（默认 high）；`model` **必显式**。
- **调用时怎么选**：由 Reasonix agent 按任务真实难度判断——需要最强推理/正式证明/全面审计 → `-m deepseek-v4.1-flash -e max`；常规 → `-m deepseek-v4.1-flash -e high`。不要把选型压力留给远端脚本。

## 触发条件

以下情况**必须**走 dsh（`dsh-remote` 转发主力机）：

1. **显式要求加强**：用户说"用 pro""deepseek-v4.1-flash""加强模型"时 → `dsh-remote -m deepseek-v4.1-flash -e max`
2. **推理强度需求（决定 effort，不换模型）**：Reasonix agent 判断任务需要 pro 级推理（多步推导、形式化证明、全面审计、架构设计、max thinking）→ `dsh-remote -m deepseek-v4.1-flash -e max`
3. **长文档/重任务**：需要远端独立跑、不占本机会话 → `dsh-remote -m deepseek-v4.1-flash -e high --async`（简单后台）或 `-e max --async`（重后台）
4. **学术任务铁律**（2026-09-04 拍板，2026-09-09 修订）：学术相关/要求调 dsh 的**一律** `dsh-remote -m deepseek-v4.1-flash -e max`（v4.1 flash + effort=max），任务描述显式写「发挥你最高能力 / max thinking / 详尽输出」

## 用法（2026-09-09 起，模型必须显式）

### 本机（Linux 天阙）→ 转发主力机
```bash
dsh-remote -m deepseek-v4.1-flash -e max "最难的任务"     # 显式 max effort
dsh-remote -m deepseek-v4.1-flash -e high "简单任务"   # 显式 flash + high
dsh-remote -m deepseek-v4.1-flash "任务" -e max          # 自定义模型 + effort=max
dsh-remote --async -m deepseek-v4.1-flash -e max "长任务"      # 后台化（schtasks 脱离会话）→ 返回 id
dsh-remote --status                   # 查所有后台任务进度
dsh-remote --no-notify -m deepseek-v4.1-flash -e max "任务"    # 静默（不弹本机横幅）
# ❌ 禁止：dsh-remote "任务" 裸调用（无模型）→ 会报错 exit 2
```

### 主力机（Windows 天阙九泉）直接调用（可选）
```bash
# -Pro 现等价 -Model deepseek-v4.1-flash -Effort max（2026-09-10：pro 弃用）
ssh tqjq "powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\27063\.local\bin\dsh-gate-conc.ps1 -Pro '任务' -Async"
ssh tqjq "powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\27063\.local\bin\dsh-gate-conc.ps1 -Model deepseek-v4.1-flash -Effort high '任务'"
# ❌ 禁止裸调用（位置参数只算任务文本，无 -Model/-Pro 会报错（-Pro 已等价 v4.1 flash+max））
```

### `-AlwaysRetry`（2026-09-20 新增）：超长任务的抗中断档
```bash
# 默认（不加开关）：provider retryPolicy = normal，maxRetries 8、退避 1s→30s、含 TRANSPORT
# 加 -AlwaysRetry：切到 mode: always —— 无尝试上限，重试到成功/取消/插件卸载
dsh-gate-conc.ps1 -Model deepseek-v4.1-flash -Effort high -AlwaysRetry "超长任务"
dsh-gate-conc.ps1 -Async -AlwaysRetry -Model deepseek-v4.1-flash -Effort high "超长后台任务"
```
- 机制：脚本在生成独立 settings 副本时，把 `retryPolicy:` 段里的 `mode: normal` 改写成 `mode: always`（只碰该段，settings 里其它 `mode` 字段不动）；异步派发时经 `job-<id>.json` 的 `alwaysRetry` 字段透传给 runner（已实测：runner 日志打印 `alwaysRetry=True`、副本内 `mode: always`、任务正常完成）。
- 校验：切换失败会 `exit 5` 并打印错误，不会静默降级。
- ⚠️ **代价**：always 对**确定性错误也会无限重试**（400 / 参数错 / 模型不存在）并持续计费 → 只在你盯着的时候用，事后用 `-Status` 或进程命令行（含 TaskId）定位并停进程。
- 适用场景：一次生成几万字这类容易撞流式中断的长输出任务；日常任务保持默认 normal 档。

### 长任务与 effort 铁律（2026-09-11 实测；2026-10-01 从 Windows 侧版本合并回本文件）

- **长任务（预计 >90 秒）一律加 `--async`**（2026-09-11 实测锁定）：同步调用在 **~167s** 处必然拿不到结果
  （dsh 侧 `rc=1`、**stdout/stderr 全空**），而 `--async`（schtasks 脱离 SSH 会话）实测 **>183s 仍存活**。
  已排除：API 上游、dev-sidecar 代理、Node 内存（8GB 堆无效）、TTL/网络（同请求 curl 148s/10.4MB 成功）。
- **不要随手加 `--no-notify`**（2026-09-11 铁律）：通知链路本身完好（本机 + 反向 SSH 均实测发出横幅），
  "通知没了"就是调用方随手关掉了横幅。仅当用户明确要求静默时才加。
- **失败排障**：`dsh-remote --status` 的 `note` 现含 rc/耗时/输出字节，并给出 `.diag.txt`（原始 stdout+stderr）路径。
- **`-e/--effort` 修复（2026-09-11）**：此前生成的独立 settings 副本里**没有** `reasoningEffort` 键，
  `-replace` 静默空转 → `-e` 从未生效。现已在主力机 `settings.yaml` 的 `agent-default-model` 下补 `reasoningEffort: high`，
  并把脚本改为「按键存在性判断」，且校验写入结果。已验证 `-e off` 与 `-e max` 生成副本 hash 不同。

### 分工铁律
- **本机永不跑 dsh**（性能不足）——所有 dsh 调用转发主力机
- 主力机 dsh 可并发（conc 用独立 settings 副本，无同机锁冲突）
- 4 agent（双机 Reasonix ×2 + 双机 dsh ×2）完成 → 本机横幅通知（dsh 侧已内置）

## 已注入的上下文（DSH 自动获得）
- 用户记忆库 `~/.reasonix/memory`（含 global/ + project/）
- 用户技能库 `~/.reasonix/skills`
- 用户画像 `memory/global/user-persona-cognitive-system-architect.md`
- 认知方式要点：构建主义、验证驱动、先证后信；双语规范；第一性原理教学

## 模型选择参照（Reasonix agent 决定，非脚本猜测）
- 常规问答/翻译草稿/格式化 → `deepseek-v4.1-flash` + `high`（省钱）
- 正式证明/全面审计/架构/数学硬核/长文档最终稿 → `deepseek-v4.1-flash` + `max`
- **凡是高强度任务必走 dsh**（v4.1 flash + 合适 effort），Reasonix 内置子代理不用
- 结果落盘：主力机 `%TEMP%\dsh-gate\<时间戳>-<model>.txt`，dsh-remote 同步时回显 stdout

## 并发（2026-09-04 新架构）
- conc 版用**独立 settings 副本**（`settings-<TaskId>.yaml` + patch），无同机覆盖锁——主力机可并发多个 dsh 任务
- 旧 dsh-gate（改写 `~/.dsh/settings.yaml` + trap 恢复）**已废弃**，同机锁限制不存在了

## 验证
```bash
dsh-remote -m deepseek-v4.1-flash -e high "1+1等于几？"   # → flash+high（主力机执行，秒回）
dsh-remote -m deepseek-v4.1-flash -e max "证明质数无穷多"                        # → v4.1 flash + max（主力机执行）
dsh-remote --async -m deepseek-v4.1-flash -e max "长任务" && dsh-remote --status  # 后台 + 查进度
```
主力机会话日志：`~/.dsh/sessions/*/session.v3.jsonl.zstd`（0.1.5 起带 `.v3.`；0.1.1 为 `session.jsonl.zstd`）中 `deepseek-v4.1-flash` 出现次数 > 0。

**实测记录（2026-09-10）**：双机 `~/.dsh/settings.yaml` 的 commandcode-goat provider 已登记 `deepseek/deepseek-v4.1-flash`（agent-default-model + fallbacks + models 三项），主力机 `dsh-gate-conc.ps1` 的 `-Pro` 已改指 `deepseek-v4.1-flash` + `Effort max`；`dsh-remote -m deepseek-v4.1-flash -e off` 端到端返回即本次迁移的验收证据。

**实测记录（2026-09-20，dsh 0.1.5-rc.2 升级后复测）**：主力机 dsh 升到 0.1.5-rc.2 后，**调用方式零改动**——`dsh-gate-conc.ps1` 的 `dsh --profile headless --patch <独立settings> "<任务>"` 与 `- id: settings / config: path:` 的 patch 注入点在 0.1.5 下语义未变（`dsh-settings-file` 的 schema 仍是 `path`）。复测两次同步调用均 4s 返回、状态 `✅ 完成`、通知正常。⚠️ 唯一需注意：脚本里若解析会话日志，文件名已变成 `session.v3.jsonl.zstd`（旧 `session.jsonl.zstd` 仅 0.1.1 及更早产生）；升级细节与坑见 `dsh-mode` 技能第十一节。

## 完整档案
- 操作铁律/67 模型清单/PS/SSH 教训：记忆 `工具-dsh并发调度与命令铁律-20260904.md`
- 主力机机制细节：`dsh-mode` 技能（注意其头部「本机实跑时期档案」标注）
- 2026-09-09 官方隔离 + dsh 强制显式改造：记忆 `api-调用默认-command-code-goat-套餐-key-而非-deepseek-官方` 及 REASONIX.md「API 默认走 Command Code GOAT」小节

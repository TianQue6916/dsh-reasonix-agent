---
id: mem-cb3fa189c3f80ce4c027f91fcd862d67
revision: 1
created_at: "2026-08-16T12:35:48.3043585Z"
updated_at: "2026-08-16T12:35:48.3043585Z"
name: reasonix-多并发-长任务后台化规范
description: 多并发规范：长任务后台化+写工作区外+会话长度控制；两个阻塞错误（omitted reasoning / 工作区写锁）根因与解法（2026-08-16 用户拍板治本）
activation: relevant
metadata:
  type: feedback
  scope: global
---

# Reasonix 多并发与长任务规范（2026-08-16 用户拍板，v2 含诊断）

**Why:** 2026-08-16 用户同时开两个会话被阻塞：一个会话跑「小说下载」阻塞式 bash（python3 novel_dl2.py 前台跑几分钟），期间持有工作区写租约（sessions/*.lease.lock），另一会话写被阻塞，UI 显示「当前工作区正在被写入」；同一时期还出现两次「omitted reasoning」重放失败。用户明确要求：**支持多并发，两个问题都治本**。

## 错误一："The provider omitted reasoning required to replay this tool turn"
- 根因：DeepSeek reasoner 系模型（v4-flash/v4-pro）在 tool-call 轮可能不返回 reasoning_content，Reasonix 无法重放该轮 → 安全跳过该轮工具调用（工作全部保留）并注入提示
- 放大器：超长上下文（jsonl 实测 1,135,091 字节）更易触发；两次都发生在 1.1MB 会话
- 官方状态：v1.25.3 已含 DeepSeek Anthropic reasoning replay 修复（release notes："Tool-bound assistant turns replay required thinking blocks, avoiding HTTP 400 errors", Refs #8924 #7763）；用户已是 v1.25.3 最新版，剩余为 provider 行为，Reasonix 保守拒绝（finishUnreplayableReasoning）
- 解法：重试即可（安全）；频发则 /compact 压缩或开新会话；thinking effort 降 low 可减少

## 错误二："当前工作区正在被写入"
- 根因：Reasonix 同工作区单写者模型——阻塞式长 bash 调用运行期间一直持有写租约（sessions/<session>.jsonl.lease.lock），其他所有会话写被阻塞；被占用时工具调用报 "acquire workspace write lease: acquire file lock: context canceled"
- 上次元凶：下载命令前台跑（无 &），输出指到工作区内 .reasonix/attachments/
- 相关：auto-rename-daemon 竞争已于 2026-08-15 修（ACTIVE_SKIP=300 跳过活跃会话），非本次原因

## 多并发铁律（How to apply）
- **长任务一律后台化**：下载/批量/>1 分钟命令用 `nohup ... &` 或 run_in_background，命令立即返回 → 写租约立即释放 → 其他会话不阻塞
- **长任务写工作区外**：输出目录用 /tmp 或 /media，禁止写工作区内 `.reasonix/attachments/`（会争锁）
- **子代理并行已开**：config.toml `max_parallel_writers = 32`（non-overlapping write_paths 才并行，同路径互斥）；fleet/task 用 write_paths 声明非重叠写区
- **重度任务物理隔离**：>30 分钟/大文件派主力机（dsh-gate）或独立工作区
- **会话长度控制**：jsonl >500KB 及时压缩/开新会话，防错误一复发
- 多会话同时干活 = 一个写 + 其余读/等；写操作用后台化让出锁

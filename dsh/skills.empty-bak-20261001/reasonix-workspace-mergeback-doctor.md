---
name: reasonix-workspace-mergeback-doctor
description: Reasonix 工作区体检与 Merge-Back 收尾医师 — 定位「工作区被占用 / 合并报错」四类阻断项并按可逆流程修复
---
# Reasonix 工作区体检 / Merge-Back 收尾医师

## 何时自动触发

- 用户说：「工作区被占用」「当前工作区正在被写入」「合并回去报错」「worktree 合并不了」「Merge-Back 失败」
- 界面出现：`当前工作区正在被写入` / `另一个 Reasonix 窗口当前正在写入这个工作区` / `此工作区无法使用安全 Merge-Back` / `以下内容会阻止清理并保留工作区`
- 工具调用失败：`acquire workspace write lease: acquire file lock: context canceled`
- 日志出现：`workspace mutation conflicts with persisted state`

## 核心原则（2026-09-22 纠偏，最重要的一条）

Reasonix 原生原则：**只排除「可再生的依赖 / 缓存 / 运行时产物」；你的数据全部纳入版本控制。**

理由：worktree 隔离的副本**来自 git 索引** → 数据不提交，新会话在独立工作区里就看不到这些文件。

**绝不要用「把未提交项排除掉」去换 porcelain=0** —— 那只买到 `git status` 干净的假象，却让隔离副本残缺，
恰恰是「工作区像被占用 / 新会话里看不到文件」的来源。2026-09-22 我犯过这个错，已纠偏。

## 第一步：体检（零写入）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Desktop\reasonix-ops\reasonix-doctor.ps1"
```

## 第二步：四条阻断项对症

| 界面文案 | 实质 | 处置 |
|---|---|---|
| `worktree has uncommitted changes` | worktree 内有未提交/未忽略文件 | `-Heal -CommitBaseline` |
| `the recorded source checkout has uncommitted changes` | 源 checkout `git status` 非空 | `-Heal -CommitBaseline`（**提交它，不是排除它**） |
| `a source or worktree runtime still has active or waiting work` | 有会话正在该 worktree 里跑（`task.lock` 存在） | **结束会话后重试** |
| `tracked, untracked, or ignored files would be preserved` | worktree 内 `.reasonix\tasks\**` 日志（ignored 也算） | `-Heal -IncludeTaskLogs` |

`-IncludeTaskLogs` 会先把任务日志复制到 `backup\<时间戳>\task-logs\` 再删除。
`-ExcludeAll` 是**已废弃的旧行为**（排除一切），仅在明确「只要 porcelain=0」时用，且要说明它会让副本残缺。

## 第三步：判读要点（别误判）

- 面板显示 **领先 0 · 落后 0** 且 **+0/-0 行** → 该 worktree 没有可合并的代码内容，卡住的是「收尾清理」而非代码冲突，不要去找"冲突"。
- `baseline snapshot` 提交（commit message `chore: Reasonix baseline snapshot`，作者 `Reasonix Autosave`）与 UI 的「自动提交工作区未提交修改」是**同一机制、方向正确**，不是事故；它保证 worktree 副本完整。
- 「active work」那条是**正常保护**：合并会切换/删除 checkout，会话在跑时本就该被拦。
- **先读 `.git\info\exclude` 的内容再动手**：它可能被 Reasonix 重写（2026-09-21 被重写为「只排除依赖/缓存」的 26 行版）。

## 第四步：UI 报错怎么分派（2026-09-23 新增，含一次真实事故）

**原则（最重要的一条）**：

> **要动 Reasonix 的 worktree，就得连它的 state 一起动；做不到，就别在 git 侧裸删。**

- ✅ **全程在 UI 里做** —— Reasonix 自己管 state，最干净
- ✅ **外部删 + 同步清 state** —— 用 `drop-worktree-clean.ps1`（它会自动等你关桌面版）
- ❌ **只删 git、不管 state** —— 唯一会留烂摊子的操作

### 事故复盘（2026-09-23，我犯的）

```
UI 合并被 active work 拦住
  → 误判「零内容，放弃吧」
  → git worktree remove --force          ← 雷在这里
  → Reasonix 的 state 不知道 → 死条目
  → UI 报：resolve worktree root: exit status 128:
            fatal: cannot change to '<路径>': No such file or directory
```

**漏掉的关键一步**：`active work` 这条 **doctor 查不出来**（doctor 只认 `task.lock` 文件，UI 认运行时会话/写租约状态）。
**正确做法是重启桌面版让它重算**，而不是去动 git。

### 决策树（UI 报错 → 怎么走，全部不用关应用）

| UI 报什么 | 真因 | 按顺序怎么做 |
|---|---|---|
| 阻断项有 WARN | 残留 `task.lock` / 任务日志 | ① `reasonix-doctor.ps1 -Heal -IncludeTaskLogs` ② **重启桌面版** ③ 再合并 |
| `active work` 但 doctor 全 OK | 运行时状态与磁盘不一致（两者判定不同源） | **重启桌面版**（重算内存态）→ 再合并 |
| `No such file or directory` | 已经外部删过 worktree | ① `git -C <source> branch <br> <commit>` ② `git worktree add <path> <br>` 重建 ③ 回 UI 走完合并 |
| 领先 0 / 变更 0 | 没内容可合并 | 直接点合并，成功 = 收掉空分支 |

### 要放弃 worktree 时（唯一安全路径）

```powershell
powershell -File "C:\Users\27063\Desktop\reasonix-ops\drop-worktree-clean.ps1"
```

它会：安全三检（未提交/未跟踪/被忽略 必须全为 0）→ **自动等你关桌面版**（每 3 秒轮询）
→ `git worktree remove --force` + `branch -D` + `prune` → 调 `fix-dead-worktree-state.py` 清 state
→ 清残留目录。

**「删 git」与「清 state」被绑死，不可能再留死条目。**

### 附带事实：谁需要关，谁不需要

| 进程 | 数据目录 | 需要关吗 |
|---|---|---|
| `Reasonix.exe` / `reasonix-desktop.exe`（桌面版） | `%APPDATA%\reasonix\` | **需要**（它写 `desktop\workspace-state-v1.json`） |
| `reasonix-bot.exe`（微信机器人） | `%APPDATA%\reasonix-bot\`（**独立**） | **不需要**，任何 state 操作都不用关它 |

---

## 硬约束（违反视为错误）

1. 不 `push` / 不改 `config.toml` / 不重启应用 / 不删用户数据文件
2. 任何写操作前先备份（脚本自动备份到 `backup\<时间戳>\`）
3. 排除规则只写「依赖 / 缓存 / 运行时」；用 `ExcludeAll` 必须显式且说明代价
4. 中文路径规则用 `Get-ChildItem` 的**真实 Unicode 名**；git 的 `core.quotepath` 转义名不可直接采纳
5. 「要不要把某类文件纳入 git」这种版本管理决策交用户拍板，不擅自 commit

## 已知根因速查

- 写隔离粒度 = **workspace（workspaceRoot）**，租约 key 解析**最近的 `.git`** → 同仓库根及其子目录共享一个写者域（「不同项目文件也冲突」的官方根因）
- 租约在**首次变更时获取**并**贯穿 participating agents 与后台任务** → 后台化 ≠ 释放锁
- 官方立场（issue #8990）：**不**放开同区并发写；解法是 **worktree 隔离**（`Separate linked worktrees retain independent writer domains`）
- worktree 创建**前提**：source checkout 必须干净（有未提交/未跟踪会被拒建）
- worktree 创建**不复制未提交改动**（官方文案 `projectTree.worktreeCreatedDirty`）→ 这就是"数据必须提交"的根本原因
- 官方 open issue：#9077（回合结束仍占用 → 重启 reasonix-desktop）、#10509（state 层冲突）
- 相关记忆：`reasonix-workspace-lease-official-solutions`、`reasonix-workspace-write-lease-mechanism`、`reasonix-workspace-doctor-toolkit`

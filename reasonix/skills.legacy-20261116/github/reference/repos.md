# TianQue6916 的仓库索引（2026-11-02 由 GitHub API `/user/repos?affiliation=owner` 拉取）

共 **18** 个：17 public + 1 private。体积为 API 的 `size` 字段（KB，GitHub 侧打包近似值）。
clone 一律用 SSH：`git clone git@github.com:TianQue6916/<name>.git`。

## 私有

| 仓库 | 分支 | 体积 | 最后推送 | 用途 |
|---|---|---|---|---|
| `inbox` | main | ~1 KB | 2026-09-27 | daily-kit 的当日 git 流水区 |

## 学习资料库（MIT/Stanford 课程，多为教材扫描 + 双语笔记）

| 仓库 | 分支 | 语言 | 体积 | 最后推送 | 内容 |
|---|---|---|---|---|---|
| `Information-Theory` | main | HTML | ~640 MB | 2026-09-23 | MacKay ITILA：slides / 快照 / 教材 / 笔记（**最大仓，必须 `--depth 1`**） |
| `Computer-Systems-A-Programmer-s-Perspective` | main | - | ~150 MB | 2026-09-23 | CSAPP 笔记与书影 |
| `Introduction-to-Linear-Algebra` | main | - | ~73 MB | 2026-09-23 | 线性代数 书影 + 笔记 |
| `Mathematics-for-Computer-Science` | **master** | - | ~57 MB | 2026-09-23 | 6.042J，纯证明逻辑取向 |
| `Linear-Algebra-and-Learning-from-Data` | main | - | ~12.5 MB | 2026-09-23 | 书影 + 笔记 |
| `Computer-Networking-CS144` | main | - | ~21.8 MB | 2026-09-23 | CS144 双语讲义 / labs / exams |
| `Introduction-to-Real-Analysis-18.100B` | main | - | ~17 MB | 2026-09-23 | Thomson/Rudin 双语讲义 / problem sets / proofs |
| `Design-and-Analysis-of-Algorithms-6.046J` | main | - | ~16 MB | 2026-09-23 | MIT 6.046J 双语讲义 / problem sets |
| `Introduction-to-Algorithms` | main | - | ~16 MB | 2026-09-23 | CLRS 书影 + 笔记 |
| `Convex-Optimization-EE364a` | main | Julia | ~18.8 MB | 2026-09-23 | Boyd EE364a 讲义 / 作业解答 / 代码 |
| `Introduction-to-Probability-6.041` | main | - | ~3 MB | 2026-09-23 | Bertsekas/Tsitsiklis 双语讲义 / problem sets |

## 工程 / 个人系统

| 仓库 | 分支 | 语言 | 体积 | 最后推送 | 内容 |
|---|---|---|---|---|---|
| `dsh-reasonix-agent` | **master** | JavaScript | ~43 MB | 2026-11-01 | dsh harness + reasonix runtime 配置备份与工程经验库（Windows/Linux 双机）。**`~/.dsh` 的远端** |
| `diary` | main | - | ~35 KB | 2026-11-01 | 每天 23:59 由本机日志 + 前台窗口采样自动生成 |
| `tool-box` | main | Python | ~791 KB | 2026-09-22 | 避免重复编写的分析脚本记录 |
| `Structured-Pseudocode-mind-language` | **master** | TypeScript | ~226 KB | 2026-06-08 | Structured Pseudocode（思维语言） |
| `Introduction-to-Algorithms-codetry` | main | C | ~149 KB | 2026-09-23 | CLRS 练习代码实践 |
| `desktop-tutorial` | main | - | 0 | 2026-05-18 | GitHub Desktop 自动建的教程仓（可删） |

## 本地 ↔ 远端对应关系（本机实测）

| 本地目录 | origin |
|---|---|
| `C:\Users\27063\dsh-reasonix-agent-reading` | `git@github.com:TianQue6916/dsh-reasonix-agent` |
| `C:\Users\27063\.dsh` | **无 origin**（有 121 项未提交；备份靠 dsh-reasonix-agent） |
| `C:\Users\27063\journal` | 无 origin |
| `C:\Users\27063\fluxscope` | 无 origin |
| `C:\Users\27063\projects\gugong` | 无 origin |
| `C:\Users\27063\skill-shells-backup\ai-vibe-writing-skills` | 无 origin |

> 注意默认分支不统一：`dsh-reasonix-agent` / `Mathematics-for-Computer-Science` / `Structured-Pseudocode-mind-language` 是 **master**，其余是 **main**。写脚本时用 `git symbolic-ref refs/remotes/origin/HEAD` 或 API 的 `default_branch`，不要硬编码 `main`。

---
id: mem-a039b9128e1bee0dd7f616ecd709d521
revision: 1
created_at: "2026-10-01T06:32:49.609Z"
updated_at: "2026-10-01T06:32:49.609Z"
name: skills-canonical-source-独立真源
description: "技能真源独立为 ~/ai-skills（用户拍板不复用 harness 目录），各入口 junction/symlink 指过去，Roaming 由 mirror 单向跟随；维护工具 skills-canonical.py"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 设计（2026-10-01 用户拍板：「新建一个源，而不是复用，复用可能会被影响」）

### 为什么不能复用现成目录
| 候选 | 为什么不能当真源 |
|---|---|
| `AppData\Roaming\reasonix\skills` | **被活跃进程持续写入**：实测 8 分钟内顶层从 98 → 100 项、`skill-creator/SKILL.md` 被外部改写；且**无法改名**（`Access denied`，被占用） |
| `.reasonix\skills` | legacy 迁移目标，另一个会话的 `skill-root-consolidate.py` 会把它当 canonical 反向镜像 |
| `.dsh\skills` | 只是挂载点；且被 dsh 的 skill watcher 读 |

⇒ 三个都可能被外部进程改写 → 真源必须独立。

### 现在的结构
| 角色 | 位置 | 形态 |
|---|---|---|
| **真源（唯一可写）** | `C:\Users\27063\ai-skills`（Windows）<br>`/home/tianque/ai-skills`（Linux） | 真实目录，97 顶层项 / 172 文件 / 78 SKILL.md，**零噪声** |
| 入口 | `C:\Users\27063\.dsh\skills` | **Junction → ai-skills**（dsh 读） |
| 入口 | `C:\Users\27063\.reasonix\skills` | **Junction → ai-skills**（Reasonix CLI/legacy 读） |
| 入口 | `~/.dsh/skills`（Linux） | **symlink → ~/ai-skills** |
| 入口 | `~/.reasonix/skills`（Linux） | **symlink → ~/ai-skills** |
| 镜像 | `C:\Users\27063\AppData\Roaming\reasonix\skills` | 真实目录（Desktop 占用、不能改名）→ 由 `--mirror` **单向**跟随真源 |

真源内容 = 合并后的技能集：**排除**噪声（`*.bak*` / `*.conflict.*` / `*.old-*`）与 `_backup*` / `_archive*` / `.trace-archive`。
移出的空壳 `ai-vibe-writing-skills`（只有 `.git`、无工作区文件、无 remote）→ `~/skill-shells-backup/`。

### 维护工具：`~/.dsh/storages/tools/skills-canonical.py`（Windows 侧运行）
```bash
python ~/.dsh/storages/tools/skills-canonical.py --verify        # 只读：真源 vs 两个入口 vs Linux 真源 vs Roaming + 完整性检查
python ~/.dsh/storages/tools/skills-canonical.py --mirror        # 真源 → Roaming 单向复制（只覆盖/新增，不删任何文件）
python ~/.dsh/storages/tools/skills-canonical.py --push          # 真源 → Linux 真源（tar 传输）
python ~/.dsh/storages/tools/skills-canonical.py --pull          # Linux 真源 → 真源
python ~/.dsh/storages/tools/skills-canonical.py --prune-linux   # Linux 真源里多余项移到 ~/ai-skills-pruned-<ts>/（移动不删）
```
- 完整性判定把「有意停用」的目录（`SKILL.md` → `SKILL.md.disabled-*`）视为正常：`bilingual-translator`、`ocw-lecture-translator` 属此类。
- 验收标准：`--verify` 输出 **✅ 三方全部一致**。

### 同步链改动
- `sync_reasonix.py`：**已移除 `('skills','skills')` 同步对**（`~/.reasonix/global-workspace/sync/sync_reasonix.py`，两端同改）。原因：Linux 侧 `~/.reasonix/skills` 现在是 symlink，`os.walk` 不跟随 symlink 会把「远端有 304 文件」误判为需下载 → 经 symlink 把 Roaming 的噪声灌进真源。
- `sync_dsh.py`：已排除 `skills`（2026-10-01 更早）。
- ⇒ **技能只在真源里改，改完跑 `--push` + `--mirror`**。

### ⚠️ 铁律（2026-10-01 事故）
**绝不对可能是 junction/symlink 的路径做递归删除**：Windows 下 `shutil.rmtree` / `rm -rf` / `Remove-Item -Recurse` / `tar` 跟随链接会**穿透删掉目标目录内容**（本次差点删光 80 个技能）。删链接只用 **`cmd /c rmdir <path>`**。

### 回滚点
`~/sync-backup-20261001-1407|1422|1430/`、`~/skill-shells-backup/`、`.reasonix/skills.legacy-20261001`、`.reasonix/skills.mirror-legacy-20261001-1430`、`.dsh/skills.roaming-junction-legacy-20261001-1430`；Linux `~/.reasonix/skills.mirror-legacy-20261001-1431`、`~/ai-skills-pruned-20261001-1431`。

### 待观察
Roaming 仍被未知进程写（8 分钟 +2 项）。真源已隔离不受影响，但若该进程改写 `Roaming\<skill>\SKILL.md`，Desktop 会短暂读到被改版本 → 定期 `--verify` + `--mirror` 即可覆盖回来。若长期拉锯，需定位该进程并让它停手或改读真源。

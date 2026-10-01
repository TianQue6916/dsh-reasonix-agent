---
id: mem-a7f5324a22cfc98c9d5cf8685f6c2456
revision: 1
created_at: "2026-09-26T16:31:18.000Z"
updated_at: "2026-09-26T16:31:18.000Z"
name: github-repo-hygiene-audit-20260927
description: "2026-09-27 全量审计 17 个本地 repo：learn 有 563MB VS .ipch 垃圾 history（从未 push 过）、IT-full 与 Information-Theory 是 1.3G×2 重复副本、算法导论学习文件无 remote；含 pushall dry-run 结果与处理建议"
metadata:
  type: user
  fact_type: project
  scope: global
---

# GitHub repo 卫生审计（2026-09-27）

`pushall.sh --dry-run` 全量扫 `D:\gh-publish`、`D:\10-学习`、`Desktop\工具箱`，共 17 个本地 repo。

## 一、远端冲突：两组「同一远端被两个本地 repo 共用」

| 远端 | 本地 repo |
|---|---|
| `git@gitee.com:tianque-jiuquan/lang-learn-kit.git` | `10-学习/lang-learn-kit` + `10-学习/learn` |
| `git@github.com:TianQue6916/Information-Theory.git` | `gh-publish/IT-full` + `gh-publish/Information-Theory` |

pushall 会先做这项检测并醒目报告——**脚本不能猜该推哪个**，必须人来看。

## 二、`D:\10-学习\learn`：563 MB 垃圾 history（最要紧）

- `.git` = **563 MB**（`size-pack: 552.62 MiB`），tracked 2730 个文件
- 最大的十个全是 Visual Studio 预编译头 cache：`.vs/**/AutoPCH/.../源.ipch`，**单文件最大 155.0 MB**；另有 129.0 / 127.8 / 122.2 / 85.0×6 MB
- `.vs/` 下还有常驻改动（`VSWorkspaceState.json`、`slnx.sqlite`、`Browse.VC.db`、`DocumentLayout.json`）
- **这正是「定时自动 commit」的反例**：无差别自动提交，每天会把 VS cache 的二进制变化提交上去，一年后 repo 全是几十个版本的垃圾
- **从未 push 过**：gitee 远端 `master` = `dccb476`（只有 README 的 first commit），本地 HEAD = `574d93a`（4 commits）→ 563 MB 垃圾还在本地，**现在修代价最小**
- 修法（已给用户，未执行）：
  1. `.gitignore` 追加 `.vs/` `*.ipch` `*.exe` `*.obj` `*.pdb` `Debug/` `Release/`
  2. `git rm -r --cached .vs` + commit
  3. history 里那 552 MB 要重写历史才能释放：`git filter-repo`（需 pip 装，本机当时无网）或内置 `git filter-branch --index-filter`
  4. **建议先别重写**——该 repo 到底要不要留都还没定
- `.git/objects/9f/tmp_obj_kmXyEC` 是中断操作残留 garbage，`git gc` 会清

## 三、`IT-full` vs `Information-Theory`：1.3 G × 2 重复

远端实测（`git ls-remote`）：`Information-Theory.git` 的 `main` = `ce3b78e`

| 本地 | HEAD | 结论 |
|---|---|---|
| `gh-publish/IT-full` | `ce3b78e` | ✅ 与远端一致，**留这个** |
| `gh-publish/Information-Theory` | `36ffe34`（落后 1 commit） | ❌ 旧副本，各占 1.3 G，可删 |

`ce3b78e` 的 message 是「整理：`_source-README.md` 更名为「来源与课程说明.md」；移除 OCR 中间产物目录 `03-textbook/_work`」——与 `2026-09-23-课程仓库整理阶段-...` 那条记忆里的动作完全吻合，**说明 `IT-full` 就是那次整理后的产物，旧目录忘了删**。

## 四、其他

- `10-学习/算法导论学习文件`：**无 remote**，5 项改动完全未备份
- `gh-publish/Linear-Algebra-and-Learning-from-Data`：6 项改动待提交（当时唯一需要 push 的）
- 其余 13 个 repo 干净且与远端同步
- `10-学习/learn` 无 upstream → pushall 会 SKIP（不会盲推）

## 五、pushall.sh 的安全策略（避免自动化事故）

- `behind > 0` → SKIP，提示先 pull（不让脚本替用户做 merge 决定）
- 无 remote / 无 upstream → SKIP，只报告不猜
- push 失败不回滚（本地 commit 已落地，数据不丢）
- 不用 `set -e`：一个 repo 失败不中断其余
- 先做「同一远端被多个本地 repo 使用」检测并醒目报告
- 默认 `--dry-run` 友好，正式跑才动东西

## 六、与安全记忆的关联

`github-public-备份泄露-goat-key-事件与根因修复-2026-09-23` 那条：曾把 `user_` 前缀 key 明文放在 public 仓库约 3 个月。**这是「流水 repo 必须 private」的直接依据**——流水区会无差别收当天的临时产物，public 会重演同一类事故。

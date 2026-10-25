---
id: mem-c59bc406e43799eae385e4ef85c45ac8
revision: 1
created_at: "2026-10-25T19:36:57.315Z"
updated_at: "2026-10-25T19:36:57.315Z"
name: git-gh001-unpushed-commits-flatten
description: "GitHub GH001 大文件拒绝的完整处置：未推 commit 要压平、排除要双写、判据要查 tree 与体积"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状

`git push` 被 GitHub 拒绝：`GH001: Large files detected` / `File too large`。日常备份线因此**静默断链**（本例断了 3 天：2026-10-23 23:31 起 3 个 commit 全部推不上去）。

## 关键认知：`git rm --cached` 救不了已经进历史的 commit

大文件如果在**任何一个未推送的 commit** 里，光把它从当前 index 移除没用 —— push 会把这些 commit 一起送上去，仍然被拒。
本例：`model.int8.onnx`（228.2 MB）由 3 个未推 commit 中**最老**的那个（`f3fe6ba`）引入。

## 处置（保留内容、不改写已发布历史）

```bash
git tag bak-pre-gh001-fix HEAD          # 回滚点，先打
git reset --mixed origin/master         # 把 N 个未推 commit 压平成一个工作树状态（HEAD 回到远端）
# 此时大文件变 untracked，被 .gitignore 挡住
git add -A                              # ⚠️ 仅当工作树完整时！见 fact git-add-all-deletes-when-worktree-incomplete
git commit -m "..."
git push origin master
```

要点：
1. **双写排除**：`.gitignore` 挡住 git，脚本的 `$XF`（robocopy 排除清单）挡住同步 —— 只写一处，明晚的自动备份会把它捞回来。
2. 排除的形态：`*.onnx` / `*.safetensors` / `*.gguf` / `*.tar.zst` / `*.zst`（模型与历史版本包都是**派生数据**，能重建）。
3. **不要用 LFS**：备份仓库里存二进制既贵又拖慢每次 clone；派生数据本来就不该进备份。
4. 已发布过的大文件**不要为它重写历史**（force push 会破坏所有既有 clone）；本例的 50.9 MB `.tar.zst` 早已在远端历史里，只做 `git rm --cached` 让它未来不再增长。

## 判据（比结论重要）

push 后必须做**两条**校验，缺一条都会假成功：

```bash
git rev-parse HEAD                                    # == git ls-remote origin refs/heads/master
git ls-tree -r -l origin/master | awk '$4>104857600'   # 期望为空
```

只看 `git push` 的返回码不够 —— 它可能报成功而内容根本没进去（见 fact `git-add-all-deletes-when-worktree-incomplete`）。

## 顺带暴露的设计盲区

- 脱敏校验全过，因为**体积不是一个脱敏维度**：`$Detect` 查密钥形态，不查文件大小。
- 建议在**提交前**加体积闸（staged 中存在 >100 MB 文件即中止），比等 GitHub 拒更早；字节层全扫也有 40 MB 跳过上限，同类盲区。

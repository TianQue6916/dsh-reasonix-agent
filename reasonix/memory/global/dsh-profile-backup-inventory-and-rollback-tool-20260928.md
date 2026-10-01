---
id: mem-48a3dee830120c7c8e423d64ee355e0a
revision: 1
created_at: "2026-09-27T16:25:25.574Z"
updated_at: "2026-09-27T16:25:25.574Z"
name: dsh-profile-backup-inventory-and-rollback-tool-20260928
description: "补齐 goal (3) 的\"可回滚备份\"：dsh-profile-rollback.mjs 盘点 85 个备份（含 11 个孤儿）、支持按时间点/单文件 dry-run 回滚；并固化 heredoc 吃反斜杠的 4 次踩坑与 4 条对策"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 一、为什么需要它

goal 的 (3) 要求「**保留可回滚备份**」—— 我每步都建了备份，但**从未验证过它们真能回滚**，也没盘点过。
实测一查：**85 个备份**散落在 3 个 root、**11 个已是孤儿**（目标文件不存在了，永远无法回滚）、命名有 5 种变体、没有清单。

## 二、产物：`~/.dsh/storages/tools/dsh-profile-rollback.mjs`

```bash
node dsh-profile-rollback.mjs --list                      # 盘点（按时间点分组，标 [孤儿]）
node dsh-profile-rollback.mjs --list --json               # 机器可读
node dsh-profile-rollback.mjs --point 20260927-2313       # 回滚该时间点的全部文件（dry-run）
node dsh-profile-rollback.mjs --point 20260927-2313 --apply        # 真正执行
node dsh-profile-rollback.mjs --restore package.json --from <bak>  # 还原单个（dry-run）
node dsh-profile-rollback.mjs --restore package.json --from <bak> --apply
```

**扫描 root**：`~/.dsh/profiles`（递归 2 层）、`~/.dsh`、`~/.mnemon/data/default`

**识别的命名变体**（历史遗留，全部兼容）：
```
<target>.bak-<YYYYMMDD>-<HHMM>-pre-<what>
<target>.bak-<YYYYMMDD>-pre-<what>
<target>.bak-<what>-<YYYYMMDD>-<HHMM>
<target>.bak-<what>-<YYYYMMDD>
<target>.bak-<YYYYMMDD>-<HHMM>
```
解析靠正则 `(\d{8})-?(\d{4})?`，取到 `YYYYMMDD-HHMM` 或 `YYYYMMDD` 作为"时间点"。

**默认 dry-run**，必须显式 `--apply` 才写盘。

## 三、实测结果（2026-09-28）

```
共 85 个备份
● 20260927-2313   package.json / pnpm-lock.yaml  (web + headless 各一份)
● 20260927-1801   package.json / pnpm-lock.yaml  (pre-deja-0213)
● 20260927-1038   cordis.patch.yml
...
● 20260903        settings.yaml  [孤儿]
● (无时间戳)       cordis.patch.yml.bak-goat-upgrade ×3 / env.bak / settings.yaml.bak-goat

其中 11 个是孤儿（目标文件已不存在，无法回滚）
```

**11 个孤儿的成因**：`~/.dsh/settings.yaml` 系列（`bak-20260903` ~ `bak-20260920`）——
**dsh 0.1.7 起 `settings.yaml` 已不存在**（配置迁到 profile 的 cordis 层），所以这些备份已无回滚意义。

**回滚干跑验证**：
```
$ node dsh-profile-rollback.mjs --point 20260927-2313
[dry-run] package.json.bak-20260927-2313-pre-mnemon  ->  package.json
[dry-run] pnpm-lock.yaml.bak-20260927-2313-pre-mnemon  ->  pnpm-lock.yaml
（加 --apply 真正执行）
```

## 四、修的一个 bug

`--restore` 最初把目标解析到 **`process.cwd()`** → 会往当前目录写一个同名的 `package.json`（危险）。
**改成 `join(dirname(bak), basename(opt.restore))`** —— 还原到**备份所在的那个目录**，这才符合"回滚"的语义。

## 五、🐍 heredoc 吃反斜杠 —— **第 4 次**

本次又因为 `'\\n'` 被 heredoc 消耗而写坏 JS（`assert` 失败，文件没保存，浪费一轮）。
**累计 4 次**：第 1 次写 memory helper、第 2 次 thread-edges 的 `\n`、第 3 次 DOT 的 `B` 变量名、第 4 次本次。

**固化做法**：
1. **构造反斜杠一律用 `chr(92)`**，不在 Python 字符串里写 `\\`
2. **改 JS 后立刻 `node --check`**（本轮 5 个错误全是它抓到的）
3. **行号替换比字符串匹配稳**（避免因转义差异匹配不上）
4. **`assert` 放在 `write` 之前时，失败就等于"什么都没改"** —— 所以看到 assert 失败不要以为改了一半，**要重新完整执行**

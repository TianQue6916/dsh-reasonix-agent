---
id: mem-46f6c6aa4f84155e0cfd2228c44a9d2d
revision: 1
created_at: "2026-10-22T14:42:29.967Z"
updated_at: "2026-10-22T14:42:29.967Z"
name: memory-to-mnemon-增量同步-20261023
description: "memory-to-mnemon 同步脚本 memory sync 从全量重喂改成按文件指纹增量：mnemon-sync-state.json 记 mtime+size+sha256，首次自建基线、rc≠0 不写状态可重放、新增 --full 强制全量、--only 实时路径成功后回填指纹。实测第二次运行 0.27 秒零 oplog 增长（原来 22 秒 + 348 条空转），oplog 里 99.8% import-skip 的浪费消除"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 改了什么
`~/.dsh/storages/tools/memory-to-mnemon.py` 从「每次全量重喂」改成「按文件指纹增量」。备份 `memory-to-mnemon.py.bak-20261023-pre-incremental`。

## 动机（实测数据）
mnemon `oplog` 里 5000 条记录中 `import` 只有 12 条、`import-skip` **4988 条（99.8%）** —— 每次全量都把 306 个 md 全部重算、重写一份约 3 MB 的 draft、再让 mnemon 逐条判重，单次耗时约 22 秒。

## 实现
- 状态文件 `~/.dsh/storages/mnemon-sync-state.json`：key = `"<scope>/<file>"`，value = `{m: mtime_ns, s: size, h: sha256}`。
- `select_changed()`：mtime+size 相同 → 视为未变；只有 touch 过才比 sha256（内容没变也跳过）。
- 无状态文件（首次）→ 自动全量并建立基线；`rc != 0` 或 `--dry-run` 不写状态 ⇒ 永远可重放。
- 新增 `--full` 强制全量（排障用）。
- `--only`（memory_remember 实时触发那条路径）成功后回填该文件指纹，避免下一次全量把它再喂一遍。

## 验收
- 首次：`changed=306 unchanged=0`，oplog 9679 → 10027。
- 第二次：`306 个 fact 全部未变，跳过`，**0.27 秒**，oplog 10027 → 10027（零增长）。
- `--only memory-system-efficiency-audit-20261022` 成功后 state 出现 `global/memory-system-efficiency-audit-20261022.md`；随后全量仍然全部跳过。

## 调用方（不要改坏）
`~/.dsh/.agent-presets/anchored-standard/memory.mjs` 的 `syncToMnemon()`：detached spawn `python memory-to-mnemon.py --only <factName> --src <scopeDir>`，失败静默（`DSH_MNEMON_SYNC=0` 可关）。排查日志 `~/.dsh/logs/memory-to-mnemon.log`。

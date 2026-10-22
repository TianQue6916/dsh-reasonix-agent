---
id: mem-6d8cbde382399dae820aaceba28bafd3
revision: 1
created_at: "2026-10-04T14:46:34.938Z"
updated_at: "2026-10-04T14:46:34.938Z"
name: tianque-linux-unreachable-dualboot-and-gateway-patch-prep-20261004
description: "tianque 与 node 同属一台机双系统（Linux 侧物理不可达），以及 Linux gateway 补丁的待执行序列与已备好的脚本/选项"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 阻塞事实（2026-10-04 实测）

`tailscale status`：
```
100.84.67.49  node     TianQue6916@  windows  -
100.79.96.82  tianque  TianQue6916@  linux    active; relay "nue"; offline, last seen 1d ago, tx 12168 rx 0
```
`ssh -o BatchMode=yes -o ConnectTimeout=5 tianque` ⇒ `connect to host 100.79.96.82 port 22: Connection timed out`。

**两个节点同属 `TianQue6916@` ⇒ 同一台机器的双系统**。当前跑着 Windows ⇒ Linux 侧物理不可达。
⇒ 任何「需要 Linux 侧执行」的任务在 Windows 会话内**无法完成**，不是网络配置问题，不要反复重试 ssh。

## objective ④ 的待执行内容（切到 Linux 后）

Linux 侧 `~/goat-gateway/gateway.mjs` 是另一个 **1642 行的 build**，只有 tail 补丁（行 1101 附近），
**缺 reasoning-echo-filter（「思考链锁英文」的修复本体）与 finish-log**。

**关键坑**：`patch-gateway-reasoning-filter.py` 的第二个插入锚点是 `"  // bodylog-end"`，
**只因为 Windows 版已打 bodylog 补丁才存在**；Linux 版没有 bodylog ⇒ count=0 ⇒ 原脚本直接 `SystemExit`。

**已做的准备**：
1. 给 `patch-gateway-reasoning-filter.py` 加了 `--helper-anchor` / `--call-anchor` 两个选项
   （8 处编辑、`py_compile OK`、**默认值不变** ⇒ Windows 行为逐字不变、`--check` 回归全绿）。
   `--check` 现在还额外打印锚点原文，便于在陌生 build 上比对。
2. 新增 `~/.dsh/storages/tools/linux-gateway-patch.sh`（`bash -n` 通过；已用 `GW=/d/... TOOLS=/c/...` 在
   Windows 文件上 dry-run 全流程）：量锚点 → 缺 call 锚点时打印 `parsed` 候选行 → 两个 `--check` →
   `--apply` → `node --check` → 提示重启。

**执行序列**：
```bash
bash ~/.dsh/storages/tools/linux-gateway-patch.sh            # 诊断
# 若 call 锚点缺失，按打印出的候选行：
bash ~/.dsh/storages/tools/linux-gateway-patch.sh --apply --call-anchor '<候选行>'
systemctl --user restart goat-gateway
curl -sS localhost:8788/health
```

## Windows 侧对照基线（全部已在位）

`gateway.mjs` 87891 B / mtime 2026-10-04 20:08:58；标记计数：
`reasoning-filter`×4、`filterReasoning`×2、`finish=`×1、`HB elu`×1、`BODYLOG`×1。
`--check`：「已打补丁=True、helper 锚点 count=1、call 锚点 count=1、`node --check` OK、
`logs/.reasoning-filter.json` 存在（启用）」。

## objective ⑤ 的数据源口径

- dsh = `~/.dsh/storages/session_projcache/sessions/*.json` 的 `rows.tokenUsage.val.totals`（**无 cost 字段**，
  价按 `dsh-context-price-overlay.json` 算）
- reasonix = `%APPDATA%/reasonix/stats/*.jsonl`（**每行自带 CNY**，直接用）
- Windows 侧聚合脚本 `usage-overview.py` 已完成（2026-10-04 11:15）；Linux 侧并入需 Linux 可达。

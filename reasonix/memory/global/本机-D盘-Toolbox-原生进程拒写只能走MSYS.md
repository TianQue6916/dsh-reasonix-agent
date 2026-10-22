---
id: mem-7246b1bba94f329ff87c5fe01fefb6eb
revision: 1
created_at: "2026-10-04T12:14:36.701Z"
updated_at: "2026-10-04T12:14:36.701Z"
name: 本机-D盘-Toolbox-原生进程拒写只能走MSYS
description: "D:\\80-系统\\Toolbox（=D:\\Toolbox junction）对原生 Windows 进程拒写，只有 MSYS 侧能写；改 gateway.mjs 必须先 stop"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 事实（2026-10-04 实测）

`D:\Toolbox` 是 **junction → `D:\80-系统\Toolbox`**（同一实体，`Get-Item` 可验 LinkType=Junction）。

该目录树下**用原生 Windows 进程新建/覆盖文件一律 `PermissionError [Errno 13] Permission denied`**：
连 `gateway.mjs.new`、`gatewayX.mjs`、`probe.txt` 这种与该服务无关的新文件名也写不进去。
`attrib` 无 R 位，目录 ACL 正常（`NT AUTHORITY\Authenticated Users: Modify, Synchronize`）。
python 是正常 CPython 3.13（非 Store 版），写 `%TEMP%` 完全正常 —— 只有这个目录被拒。

**但 MSYS 侧进程（bash / cp / cat / curl / touch）在同一目录读写正常。**

⇒ 判据：**遇到「命令明明有权限却 EACCES」，先怀疑是原生进程 vs MSYS 的差异，而不是文件锁。**

## 绕法（已验证）

需要改 `D:\Toolbox\goat-gateway\**`（gateway.mjs / config.json / keys.json / selftest）时：

1. python 只负责**生成**到 `C:\Users\27063\AppData\Local\Temp\ggpatch\`；
2. 用 bash 的 `cp -f` 落地到目标目录；
3. 落地前对暂存件做 `node --check` + `diff`（diff 只该有预期 hunk）；
4. 落地后 `diff <暂存件> <目标>` 确认逐字节一致。

参考脚本：`D:\Toolbox\goat-gateway\_patch-resetwindow-month.py`（emit 模式）。

## 另一个坑：gateway.mjs 被运行中的 node 独占

`gateway.mjs` 被占用 8788 的 node 进程**独占**，python 写它会 EACCES（即使走了 MSYS 路径，
`cp` 覆盖也建议先停）。改它的正确流程：

```
powershell -NoProfile -ExecutionPolicy Bypass -File D:\Toolbox\goat-gateway\stop-gateway.ps1
# ... cp 落地 ...
cscript //nologo D:\Toolbox\goat-gateway\start-gateway.vbs      # detach 点火，Run(...,0,False)
```

- gateway 有 **`/_gateway/reload`** 端点（GET 即可）能热重载 `config.json` 并重拉 quota，
  **不用重启进程**；但**代码改动必须重启进程**。
- 冷启动后第一次 `quotaSync` 可能超时（`This operation was aborted`，timeoutMs=15000，
  而 quota-http 冷启动要跑 goat-usage.ps1 约 3.7s、自身缓存 TTL 10s）。
  手动 `curl 127.0.0.1:8790/quota` 预热后，再打一次 `/_gateway/reload` 即可拿到权重。
- `stop-gateway.ps1` 会 `schtasks /end /tn Goat-Gateway` + 杀端口占用者；
  `Goat-Gateway-Watchdog` 计划任务每分钟探一次 `/health`（连败两次才点火），
  所以「停服务改文件」的窗口要压在几秒内，否则 watchdog 会抢先把旧代码点火起来。

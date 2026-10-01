---
id: mem-ffc7b649045c80703fde43d02eca1c96
revision: 1
created_at: "2026-09-28T10:14:55.742Z"
updated_at: "2026-09-28T10:14:55.742Z"
name: dsh-restart-20260928-post-remote-install
description: "2026-09-28 18:12:30 dsh 重启后的事实与验证方法论：cordis.yml mtime = boot 时刻指纹、三个失败的「插件加载了吗」判据、stdout 才是可靠判据、长期实例必须由 launch-dsh.ps1 起否则证据链断"
metadata:
  type: user
  fact_type: project
  scope: global
---

# dsh 重启（2026-09-28 18:12:30）后的状态与「remote 到底加载没加载」的判据

## 重启事实
- 3080 新 **PID 90856**，启动 `2026-09-28 18:12:30`；旧 PID 4300（11:52:02）已退出
- 命令行仍是**裸 `dsh web`**（没有 `--profile web --port 3080 --no-open`）→ 用户是手打的，**不是** `launch-dsh.ps1` 起的
- 后果：`~/.dsh/logs/dsh-web-3080.out.log` 依旧不存在 → `launch-dsh.ps1 -Mode Open` 的 `Read-UrlFromLog` 这条取 token URL 的路走不通

## 有用的副产物：`profiles/<name>/cordis.yml` 的 mtime = 该 profile 最近一次 boot 时刻
dsh web 启动时会重写它（内容仍是空 `[]`）。实测 web profile 的 `cordis.yml` mtime = `18:12:30.278`，与进程启动时刻同秒。

## 不能用来判断「插件是否加载」的判据（别再试第二遍）
1. **`~/.dsh/remote/**` 的 mtime** —— `IdentityStore.loadOrCreate` 只在文件缺失时创建；已存在时只 `stat` + `chmod`，mtime 不变。
2. **DNS 缓存** —— `ipconfig /displaydns | Select-String r2049` 返回空，**连我 18:11 刚 curl 过的域名都没有** → 本机 DNS 缓存不可靠（dev-sidecar 接管解析）。判据无效。
3. **出站连接** —— 未登录时 `ACCOUNT_AUTH_REQUIRED, retryable:false` → 不建连接。所以"没有连接"与"没加载"不可区分。

## 可靠判据：读 dsh 自己的 stdout
`ds-harness-remote` 加载成功必然打印（第一行决定性）：
```
[dsh-remote] host identity ready {"deviceId":"…","fingerprint":"…","server":"https://dsh.r2049.cn"}
[dsh-remote] Codex App Server communication failed {"code":"CODEX_BINARY_UNAVAILABLE"}
[dsh-remote] server control connection failed {"code":"ACCOUNT_AUTH_REQUIRED","retryable":false}
```
**教训**：长期跑的实例必须由 `launch-dsh.ps1` 起（它把 stdout 重定向进 `~/.dsh/logs/dsh-web-<port>.out.log`），否则这类"运行时到底加载了什么"的证据链直接断掉，只能靠人眼看终端。

## 重启后已确认正常的部分
- 3080 只有一条 listener `127.0.0.1:3080`，进程树 6 个 node（含 `dsh-subprocess`），全部连接都是 loopback（→ `127.0.0.1:8788` 是 goat-gateway）
- `profiles/web/cordis.patch.yml` **未被改写**（仍 15:06）→ 说明没有东西从 UI/settings 侧写回过它

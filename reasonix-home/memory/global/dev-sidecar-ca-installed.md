---
id: mem-5c121df4f3b22a0b4c8ef391f578a7ea
revision: 2
created_at: "2026-08-03T11:47:11.271533004Z"
updated_at: "2026-08-03T11:50:38.292070911Z"
name: dev-sidecar-ca-installed
description: dev-sidecar 证书两步安装法：系统信任库 + setting.json 状态标记，含 pkill 自伤与 sudo 无终端教训
metadata:
  type: user
  fact_type: reference
  scope: global
---

# dev-sidecar CA 证书已装入系统信任库（TianQue Linux）

**时间：** 2026-08-03

**两步安装法（完整闭环）：**

1. **系统信任库层**（`sudo` 层）：
   - `sudo cp /home/tianque/.dev-sidecar/dev-sidecar.ca.crt /usr/local/share/ca-certificates/dev-sidecar.ca.crt`
   - `sudo update-ca-certificates` → 1 added, 0 removed，ca-certificates-java 触发器已处理
   - 验证：`openssl s_client -connect github.com:443 -CAfile /etc/ssl/certs/ca-certificates.crt` → `Verify return code: 0 (ok)`

2. **应用状态层**（`/home/tianque/.dev-sidecar/setting.json`）：
   - dev-sidecar UI 判断"是否已安装证书"看的是 `rootCa.setuped` 字段，**不是**系统信任库！
   - 即使系统层装好了，`setuped: false` 时 UI 仍提示"第一次使用，请先安装CA根证书"
   - 修改：`python3` 读 JSON → `rootCa.setuped = true`、`desc = "根证书已安装"` → 写回（改前 `cp` 备份，备份在 `setting.json.bak-*`）
   - **必须重启应用生效**：`cd /opt/dev-sidecar && DISPLAY=:1 nohup ./@docmirrordev-sidecar-gui &`（Electron 应用，二进制 `@docmirrordev-sidecar-gui`）

**现状：** 信任库含 `fastgithub.crt`（旧，未删）+ `dev-sidecar.ca.crt`；应用进程 PID 112965+ 运行正常，GUI 日志在 `/tmp/dev-sidecar-gui.log`。

**关键教训：**
- **pkill 自伤**：`pkill -f 'dev-sidecar'` 会匹配到执行命令的 bash 自身（命令行含同样字符串）→ 把自己杀了。用字符类 `'dev-[s]idecar'` 或精确匹配二进制名 `'@docmirrordev-sidecar-gui'` 避免。
- **sudo 无终端**：Reasonix API 环境无 tty，`sudo` 报 "a terminal is required"，用 `echo '<密码>' | sudo -S <命令>`（密码不写入任何文件/记忆）。
- 应用运行时改 setting.json，退出时可能用内存旧状态覆盖——改完立即重启应用并验证文件内容。

**Why:** 以后 dev-sidecar 的证书问题（重装、换证书、UI 仍提示）都可直接按此两步法处理。
**How to apply:** 证书相关问题先查系统信任库，再查 `setting.json` 的 `rootCa.setuped`，两层都要对；改配置后重启应用并回读验证。

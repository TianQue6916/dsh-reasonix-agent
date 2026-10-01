---
id: mem-14ebed2d9d984fa3985007045dbd5d75
revision: 1
created_at: "2026-09-27T02:15:40.000000000Z"
updated_at: "2026-09-27T02:15:40.000000000Z"
name: dev-sidecar-覆盖-gitconfig-与-npmrc-URL级配置绕过-20260927
description: dev-sidecar 每次启动都会重写 ~/.gitconfig 与 ~/.npmrc 的代理项（这就是"手改后 GitHub 还是慢"的原因）；用 URL 级 http.<url>.proxy 绕过（优先级高于全局 http.proxy），含 release 走镜像的实测数据与 ghdl/ghurl 函数
metadata:
  type: user
  fact_type: reference
  scope: global
---

# dev-sidecar 会覆盖 git/npm 配置 + 正确的绕行方法（2026-09-27）

## 现象（排查了一轮的坑）
手工清掉 `.gitconfig` 的 `http.proxy` / 删掉 `sslVerify=false` 后，只要 dev-sidecar 重启，配置**全部回来**。

## 铁证
```
.gitconfig  mtime = 2026-09-27 10:13:52.947
~/.npmrc    mtime = 2026-09-27 10:13:53.763
gui.log     10:13:52.968  bridge on status, event: { key: 'plugin.git.enabled', value: true }
```
启动时它写入：
- `~/.gitconfig` → `[http] proxy=http://127.0.0.1:31180`、`sslVerify=false`、`[https] proxy=http://127.0.0.1:31181`
- `~/.npmrc` → `proxy=http://127.0.0.1:31180`、`https-proxy=http://127.0.0.1:31181`、`strict-ssl=false`

⚠️ **`running.json` 里的 `plugin.{node,git}.enabled` 恒为 `false`，不代表运行态** —— 它启动时自己把插件置 true（只在内存）。所以**改 config.json/running.json 的 plugin 段无效，别在这上面浪费时间**；要禁只能从它的 GUI 里关。

## 绕行（正解）：URL 级配置优先级高于全局
git 的 `http.<url>.*` 覆盖 `http.*`，且 dev-sidecar 不碰这些条目：
```bash
git config --global 'url.https://gh-proxy.com/https://github.com/.insteadOf' 'https://github.com/'
git config --global 'http.https://gh-proxy.com/.proxy' ''            # 空 = 直连
git config --global 'http.https://gh-proxy.com/.sslVerify' 'true'    # 镜像路径恢复证书验证
```
验证：`git config --global --get-urlmatch http.proxy https://gh-proxy.com/x` → 空
反过来 `--get-urlmatch http.proxy https://github.com/x` 仍返回边车（无所谓，github.com 已被 insteadOf 重写掉）。
实测 clone 连的是 Cloudflare IP（104.18.42.54），不再经过 31181。

> 推论：**以后不要再手改 `[http] proxy`**（必被覆盖）；要定制就在 URL 级加。
> 副作用：`http.sslVerify=false` 全局无法移除 —— 走边车的域名必须如此（边车 MITM），所以只能靠 URL 级给镜像路径单独开验证。

## 实测数据（2026-09-27 10:0x，同机）
| 场景 | 走 dev-sidecar(31181) | 直连 | gh-proxy 镜像 |
|---|---|---|---|
| `git clone`（github.com） | 5MB / 2.3s | — | 5MB / 2.6s（**持平**） |
| release 大文件（objects.githubusercontent.com） | 45 → 9.8 KB/s（超时） | 258 → 47 KB/s（不稳） | **882~942 KB/s（稳）** |
| 网页 github.com TTFB | 0.67~0.93s | 4.65s | — |

**结论：边车治握手不治带宽。** clone 两条路持平；release 是镜像压倒性赢（20~90 倍）。定位应为「浏览器握手加速器 + HTTP 隧道」，不是下载加速器。

## 本次已落地
1. `~/.bashrc` 新建 `ghurl` / `ghdl`（自动把 github/raw/codeload/objects 的 URL 镜像化）
2. PowerShell profile `~/Documents/WindowsPowerShell/Microsoft.PowerShell_profile.ps1` 同名函数（UTF-8 **BOM**，PS 5.1 才不会乱码）
3. dev-sidecar `proxy.setEnv` 关掉（config.json + running.json）+ 删用户级 `HTTP_PROXY`/`HTTPS_PROXY` → CLI 不再被强制代理；**系统代理保留**给浏览器
4. 回滚件：`.gitconfig.bak-20260927-pre-mirror`、`~/.dev-sidecar/{config,running}.json.bak-20260927-pre-env`

## 另一条独立线索（未处理）
dev-sidecar 日志 1 小时 58 次 `cltSocket error: api.commandcode.ai:443 read ECONNRESET`（全是 client 侧先断），源头链是 `goat-title.ps1`(20s 轮询) → `quota-http.mjs` → `goat-usage.ps1` 的 `Invoke-RestMethod`（PowerShell 默认吃系统代理 → 被边车接管）。边车是纯隧道不背锅，但**该域名不该走代理**：修法是在 `proxy.excludeIpList` 加 `*.commandcode.ai`，或给 `goat-usage.ps1` 加 `-Proxy $null`。

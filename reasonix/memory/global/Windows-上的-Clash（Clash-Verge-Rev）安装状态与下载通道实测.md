---
id: mem-06ef87fe08aad4ea00ddad6007b28e01
revision: 1
created_at: "2026-11-15T18:24:20.969Z"
updated_at: "2026-11-15T18:24:20.969Z"
name: Windows-上的-Clash（Clash-Verge-Rev）安装状态与下载通道实测
description: "2026-11-16 装的 Clash Verge Rev 2.5.10 位置/端口/配置目录；以及 GitHub release 资产可用镜像（ghfast.top 403，gh-proxy.com 可用）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 安装状态（2026-11-16 02:24 实测）

- 客户端：**Clash Verge Rev v2.5.10**（2026-11-03 发布），安装到 `C:\Program Files\Clash Verge`（211 MB，perMachine，静默安装 `/S` 无需 UAC 交互）
- 内核：`verge-mihomo.exe` = **Mihomo Meta v1.19.33 windows amd64**（go1.26.10，with_gvisor tag）；同目录另有 `verge-mihomo-alpha.exe`
- 配置目录：`C:\Users\27063\AppData\Roaming\io.github.clash-verge-rev.clash-verge-rev`（内 `config.yaml` / `clash-verge.yaml` / `verge.yaml` / `profiles/` / `*.mmdb` / `geoip.dat` / `geosite.dat`）
- mixed 端口：**127.0.0.1:7897**（core 起来就监听，未导入订阅时 `current: null`，走 DIRECT）
- 安装包留存：`C:\Users\27063\Downloads\Clash.Verge_2.5.10_x64-setup.exe`（60,045,702 B，sha256 `929da9303b643b80ce309ab29f618e37a5562f515d1fa55ebf5b86c822504450`，与 GitHub API asset `digest` 字段一致）
- Windows 11 家庭版；WebView2 runtime 已存在（157.0.4341.46）⇒ 不需要 238 MB 的 `fixed_webview2` 变体包
- 官方 Windows exe **无 Authenticode 签名**（NotSigned，Tauri 项目常态），校验只能靠 GitHub API digest 或 minisign `.sig`
- 尚未导入订阅：无节点、系统代理 / TUN 均未开启

## 下载通道实测（2026-11-16 02:22，随身 WiFi 出口）

用 GitHub release 资产 `Clash.Verge_2.5.10_x64-setup.exe` 做 Range 探测（`curl -r 0-1023`）：

| 通道 | 结果 |
|---|---|
| `https://github.com/.../releases/download/...` 直连 | **000**（握手失败） |
| `https://ghfast.top/https://github.com/...` | **403 Forbidden**（对 release 资产不放行，与 AGENTS.md 原表冲突，需修正） |
| `https://gh-proxy.com/https://github.com/...` | **206** ✅ |
| `https://ghproxy.net/https://github.com/...` | **206** ✅ |
| `https://hk.gh-proxy.com/https://github.com/...` | **206** ✅ |
| `https://gh.llkk.cc/` / `https://ghp.ci/` | 000 不通 |

`fetch_file` 走 `gh-proxy.com` 前缀：57.3 MB / 12.7 s = **4.74 MB/s**（单流 bandwidth-bound，未触发多连接）。
⇒ 结论：**release 资产用 gh-proxy.com 前缀**；`api.github.com` 直连可通（取 release 元数据正常，200）。

## 未做/待办

- 需要订阅链接或本地 YAML 才能出节点
- 开「虚拟网卡模式（TUN）」会装 `clash-verge-service` Windows 服务，需管理员

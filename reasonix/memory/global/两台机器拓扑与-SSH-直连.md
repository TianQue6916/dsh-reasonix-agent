---
id: mem-cae760c63f7d82ad087162e4a3259a37
revision: 1
created_at: "2026-11-22T10:40:36.347Z"
updated_at: "2026-11-22T10:40:36.347Z"
name: 两台机器拓扑与-SSH-直连
description: "两台机器的网络拓扑与 SSH 别名（网线直连 tianque-lan）、Linux 规格、dsh web 3081 + remote 插件链路"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 拓扑（2026-11-22 实测）
两台独立物理机，**网线直连**（Windows 2.5GbE 192.168.243.1 ↔ Linux USB 网卡 192.168.243.2），不是双系统。

## SSH（在 Windows 侧 ~/.ssh/config 已配好，免密走 id_ed25519）
- `tianque-lan` → 192.168.243.2（网线直连，首选）
- `tianque` → 100.79.96.82（Tailscale，任意网络）
- `tianque-wifi` → 192.168.0.106（同网段 Wi-Fi）
- 用户 `tianque`，hostname `Linux`。注意：直接 `ssh 100.79.96.82` 会 Permission denied，**必须用别名**（config 里带 User + IdentityFile）。

## Linux 机器规格
- i7-10710U（Comet Lake U，6C12T，1.1GHz base，**单核弱**）
- 14GB RAM，核显 Intel Comet Lake UHD（`/dev/dri/card1` + `renderD128`）
- 已装 google-chrome / google-chrome-stable / chromium / chromium-browser / Edge
- Firefox 是 **snap 版 158.0.1**（`/snap/firefox/9113`）

## dsh 在 Linux 侧的跑法
- `dsh web --port 3081`（node，127.0.0.1:3081），浏览器打开 `http://127.0.0.1:3081/?token=...`
- 该 web 进程再通过 `ds-harness-remote` 插件的 **WebRTC data channel（transport=LAN，直连，非 relay）** 连到 Windows host（agent/模型/会话日志都在 Windows）
- 客户端还常驻 `billion-context/dist/index.js`（bili proxy，约 3% CPU）

## 已知渲染负载（2026-11-22 采样）
Firefox content proc ≈ 32.5% 单核 + Firefox main proc ≈ 23.6% 单核 = **合计约 56% 单核持续**。Firefox 主进程含 compositor，是 Linux 上的结构性开销。

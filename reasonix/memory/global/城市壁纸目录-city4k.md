---
id: mem-6a8db01d8ec60e83ae84535dbe808cb7
revision: 1
created_at: "2026-11-19T10:48:39.090Z"
updated_at: "2026-11-19T10:48:39.090Z"
name: 城市壁纸目录-city4k
description: "4K 城市壁纸已落地目录、12 张清单，以及 Unsplash/Pexels CDN 实测下载策略"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 壁纸目录（2026-11-19 建）

`C:\Users\27063\Pictures\Wallpapers\City4K\` —— 12 张 4K 横向城市照片（深圳 3 / 北京 2 / 上海 3 / 纽约 4），全部 3840 宽、横向、PIL 实测校验过。
同目录有 `manifest.md`（表格 + 双系统设置命令）、`manifest.json`、`overview.jpg`（总览拼图）。
命名规则：`<城市码>-<序号>-<内容>.jpg`（sz/bj/sh/ny）。

## 图源与网络实测（重要，后续复用）

- `images.unsplash.com`：单流 7–16 KB/s，**但支持 Range** —— 12 段并发实测 219 KB/s（约 22 倍）。批量下载必须自写多段并发，fetch_file 会判成 single 单流（0.011 MB/s）。
- `images.pexels.com`：单流 64–136 KB/s，不支持分段提速，URL 规范形式 `photos/<id>/pexels-photo-<id>.jpeg?cs=srgb&fm=jpg&q=90&w=3840`。
- 不可达：unsplash.com / pexels.com 网页（401/403）、wallhaven.cc API、api.openverse.org、upload.wikimedia.org（schannel 证书吊销检查失败）。
- `raw.githubusercontent.com` 需要 `curl --ssl-no-revoke`（否则 CRYPT_E_NO_REVOCATION_CHECK），2.5s/5KB，可用它抓 GitHub 上的城市图片映射文件。
- 第三方页面里标注的 Unsplash photo ID **不可信**（21 个抽样里 4 个内容完全不符），必须目视核验后才能交付。

## 工具脚本

`C:\Users\27063\.dsh\.learn\run\wallpaper\`：`download.py`（ranged 批量下载 + report.json）、`finalize.py`（复制重命名 + manifest + 总览拼图）、`check.py`（尺寸/饱和度/锐度指标 + contact sheet）。

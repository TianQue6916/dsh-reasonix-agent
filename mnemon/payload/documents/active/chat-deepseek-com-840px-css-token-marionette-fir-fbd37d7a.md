---
id: "fbd37d7a-797f-4e55-a7fa-bb296ad16317"
title: "chat.deepseek.com 对话列解锁定宽（840px → 自定义宽）：CSS token 根因、Marionette 实测流程、Firefox/Edge 双端落地（2026-11-08）"
description: "2026-11-08 实测定位 DeepSeek 网页版对话列 840px 定宽的双层根因（--message-list-max-width token + ._9a2f8e4 硬编码），给出 userContent.css 配方、Marionette headless 验证流程，以及 user.js 重启前提、Edge 扩展只能 UI 加载的限制。"
status: "active"
created_at: "2026-11-08T15:48:25.952Z"
updated_at: "2026-11-08T15:48:25.952Z"
content_hash: "1392f193ed0fe93cfec3fa414890817f6397906441fafb4185e2501506d828e1"
source_paths:
  - "snap/firefox/common/.mozilla/firefox/85595rbo.default/chrome/userContent.css"
session_ids:
  - "cc229afc-3092-452f-885f-87e84457b2c8"
memory_body_ids:
  []
---

# chat.deepseek.com 对话列解锁定宽（2026-11-08）

**性质**：一次带实测证据的根因定位 + 可复现验证流程。适用于任何「网页版 UI 定宽/留白过大，想在浏览器侧用 user style 覆盖」的任务。

---

## 1. 结论先行：定宽是双层的，只覆盖一层无效

DeepSeek 网页版不用 Tailwind，类名是 **CSS Modules hash**（`._9a2f8e4`、`._765a5cd`、`._871cbca` …）。所以任何 `[class*="max-w-4xl"]` 之类的选择器从原理上就不可能命中——第一版扩展正是栽在「照着猜 Tailwind」上，没实测就当成了事实。

真正限制宽度的是两处，**必须同时覆盖**：

```css
/* 设计 token —— 被输入框外层 ._871cbca、输入行 ._9f86274、分隔线 ._0fcaa63 使用 */
:root { --message-list-padding-horizontal: 44px; --message-list-max-width: 840px }

/* 消息列表本体 —— 硬编码，不吃上面那个变量 */
._9a2f8e4 { width:100%; max-width:840px; margin:auto; padding:0 32px 64px; display:flex }
```

- `._9a2f8e4` 在 `@media not all and (min-width:1024px)` 下另有 `max-width:712px` 分支；`:root` 的 token 同步有 712px 变体。
- 其它相关类：`._765a5cd`（`width:var(--message-list-max-width)`）、`._871cbca`（`padding:0 calc((100% - var(--message-list-max-width)) / 2)`）、`._9f86274`、`._7780f2e ._765a5cd`。

## 2. 可用的 user style 配方（Firefox userContent.css）

```css
@-moz-document url-prefix("https://chat.deepseek.com") {
  :root {
    --dswide-max: min(1600px, 92vw);
    --message-list-max-width: min(1600px, 92vw) !important;
  }
  ._9a2f8e4 { max-width: var(--dswide-max) !important; }
  pre, table, .katex-display, .katex { max-width: 100%; overflow-x: auto; }
}
```

宽度只需改 `--dswide-max` 一处。实测（视口 2292px）：`._9a2f8e4` 840px → **1600px**，占视口 36.6% → **69.8%**，`textarea` ~774px → **1534px**，无横向溢出。

## 3. userContent.css 生效的两个硬前提

1. `user.js` / `about:config` 里 `toolkit.legacyUserProfileCustomizations.stylesheets = true`（写在 `user.js` 只在**启动时**读取，`prefs.js` 里查不到属正常）。
2. **Firefox 必须重启**。判断方法：`ps -eo pid,lstart,etime,comm | grep firefox` 对比该进程启动时间与 CSS 的 mtime；进程启动早于文件写入即说明从未加载过。

Linux snap 路径：`/home/tianque/snap/firefox/common/.mozilla/firefox/85595rbo.default/chrome/userContent.css`（`chrome/` 目录默认不存在，需自建）。

## 4. 验证流程（比看截图可靠，且不污染用户会话）

复制 profile（含登录 cookie）→ 起 headless + Marionette → WebDriver 直连读真实 DOM 几何：

```bash
MOZ_HEADLESS=1 nohup /snap/bin/firefox --marionette --profile "$FFP" --no-remote >/tmp/ff.log 2>&1 &
# Marionette 监听 127.0.0.1:2828
```

协议要点：先读 greeting（`{'applicationType':'gecko','marionetteProtocol':3}`）→ `WebDriver:NewSession` → `WebDriver:Navigate` → `WebDriver:ExecuteScript` 里用 `getComputedStyle` 取 `width / max-width / 视口宽` 及 `:root` 上的自定义属性。

**关键教训**：先用 `[class*="max-w-"]` 命中数 = 0 否证「Tailwind 假设」，再去 CSS 文本里 grep 具体 px 值（`grep -o 'max-width:[0-9]*px'`），最后回到 DOM 量。不要用「看起来像某框架」替代取证。

## 5. Edge 扩展侧的边界（同一台双系统机器的 Windows）

- 扩展目录 `/tmp` 侧准备后落在 `C:\Users\Admin1\dswide\`（`manifest.json` + `content.js` + `安装说明.txt`）。
- `User Data\Local State` 是**普通 JSON、无 HMAC**，因此 `extensions.ui.developer_mode = true` 可以直接写入（备份 `LocalState.bak`）。
- 但 **`Secure Preferences` 对每条扩展单独算 HMAC**，「加载解压缩的扩展」本质是 UI 动作，无命令行入口 —— 这一步必须用户手动点 `edge://extensions`。
- 跨系统遥控不可能：双系统同一块 NVMe，`ntfs3` 能 rw 挂载即说明 Windows 已正常关机（有 dirty flag 会拒绝读写挂载）；切到 Windows 则 Linux 侧的助手进程同时不存在。真要远程只能另有一台独立 Windows 主机 + 启用 OpenSSH Server，但扩展加载那一步仍绕不过去。

## 6. 可复用的判据

- 覆盖失败先分清「文件没被加载」与「选择器没命中」——前者看进程启动时间，后者看命中计数。
- 设计 token 与硬编码值同时存在时，覆盖 token 不够，要补一条针对具体 class 的 `max-width`。
- JS 几何兜底判据（扩展里保留）：`max-width ∈ [600,1100]` 且左右留白对称，用于 hash 类名被改版替换时接管。

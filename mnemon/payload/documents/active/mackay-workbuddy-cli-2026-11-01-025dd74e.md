---
id: "025dd74e-844c-44ad-a1af-176538fe77f1"
title: "MacKay 补图进度口径修正与 WorkBuddy CLI 认证诊断（2026-11-01）"
description: "两个可复用结论：①`grep -c '\\[Figure'` 统计残留占位会把「已嵌图 `![Figure`」和分片头「术语约定示例行」一起数进去，正确口径与跨切片合法保留判据；②WorkBuddy(codebuddy-lite-wb) CLI「Authentication required」报错的真实出处、/login 必须真 tty、keyblob 是 safeStorage 密钥而非 token、local_storage 被重置、wbipc 引擎端口替代线索。配套 PyMuPDF 裁剪流程见 ad6df72a。"
status: "active"
created_at: "2026-10-31T17:44:54.447Z"
updated_at: "2026-10-31T17:44:54.447Z"
content_hash: "e6462cca8def2568dfaaf795db21140113feb57a14c3ffb67051e0d7e9780d52"
source_paths:
  - "Documents/翻译产出/教材/MacKay信息论"
  - ".dsh/plans/session-d05928da-0b21-418f-aa5c-3ccfa9492fdd.md"
session_ids:
  - "6b1a00d0-1d5f-4e64-b7e3-95f095ea50a4"
memory_body_ids:
  []
---

# MacKay 补图进度口径修正与 WorkBuddy CLI 认证诊断

来源：session `d05928da-0b21-418f-aa5c-3ccfa9492fdd` 的交接续跑（2026-11-01）。补图裁剪流程本身见关联文档 `ad6df72a`（PyMuPDF 锚定 + read_image 核边 + Windows 派发）；本文只记该会话新增并实测过的两部分判断。

## 一、进度口径修正：`grep -c '\[Figure'` 会虚报残留占位

单看 `[Figure` 的出现次数会把三类东西混在一起：

1. **已嵌好的图**：`![Figure 10.8](_assets/fig_183_....png)` 本身含 `[Figure`（本批 99 处）。
2. **每个分片头部的「术语约定」灰字 span**：里面有一句格式示例 `图以 \`[Figure N：描述]\` 保留`，32 个 `*.bilingual.md` 各 1 处。
3. 真正未补的占位。

正确口径：`372 − 99 − 32 = 268` 真占位。按此重算后，p181-200 / p201-220 / p221-240 三块实为**真占位 0、已完工**，交接文档记录的 12/13/13 是把 `![Figure` 误当占位。结论：任何"还剩多少图没补"的统计先区分 `![Figure` 与 `[Figure`，再排除术语约定示例行，否则会把已完成块误判成待返工。

**验收信号（逐块只读核对，四条同时成立才算完工）**：图链接数 = 图注三件套数、所有链接 `isfile` 为真、文件内控制字符 0、`![` 计数与 `_assets/*.png` 增量对得上。

**跨切片合法保留**：`p061-080` 的 `[Figure 4.2]` 图印在书内 p.69（= PDF p081），落在下一分片范围内，本片无法裁切，只做图面要素文字转录属**合法**保留而不是欠账。此类占位不应回补，需在报告里注明。

## 二、WorkBuddy（codebuddy-lite-wb）CLI 认证诊断

环境：Windows 弟弟机 `ssh TQJQ6@192.168.0.105`，node v24.19.0，bundle `D:\新建文件夹\WorkBuddy\resources\app.asar.unpacked\cli\dist\codebuddy-lite-wb.mjs`（约 9.88 MB）。

- **报错出处在 provider 请求层，不是 ACP 中间件**：`Authentication required. Please use /login command to sign in to your account` 是 bundle 内常量（eP），由 provider 请求层抛出；bundle 里另有一处同文案来自 ACP server 的 HTTP 鉴权中间件（返回 `-32001` / 429）。两者容易混，排查时应按调用路径区分。
- **`/login` 是本地 slash command**（`{name:"/login", description:"Switch Tencent Cloud <productName> accounts", disableModelInvocation:true}`）。`echo "/login" | node cli` 在非 tty 下直接短路回同一个报错，所以**必须真终端人工登录一次**，没有非交互捷径。
- **`~/.workbuddy/keyblob`（336 B）不是 access token**，是 Electron safeStorage 的加密 key blob（JSON：version + keyId，DPAPI 保护）。
- **`~/.codebuddy/local_storage` 已被重置**：只剩 4 个 entry（约 10 B / 4.4 KB / 150 KB / 26 B），`sessions/` 为空 —— 早期「把 GUI 的登录态/token 搬到 CLI」的设想在当前机器上不成立。
- **替代线索（未验证）**：`.workbuddy/` 下有 `wbipc/` 目录与 `tencent-docs-engine.port`，GUI 侧有 10 个 WorkBuddy 进程常驻（登录态活着）。CLI 只是引擎的客户端，从本地 IPC 端口接入可能比抠 token 更可行，但属私有未公开协议，成败不确定。

结论排序：确定性解法是让人在真终端跑一次 `/login`；IPC 路线是低确定性备选；主线补图不依赖 CLI，可先用本地 worker 推进。

## 相关
- `ad6df72a-866f-4126-83f0-47947d005b98`：PyMuPDF 补图流水线与 Windows 远端派发踩坑（本文的上游流程）。

---
id: mem-208aff53a535ea484bb481c32cb28dd3
revision: 1
created_at: "2026-10-26T15:13:47.890Z"
updated_at: "2026-10-26T15:13:47.890Z"
name: git-clone-large-repo-early-eof-playbook
description: "git clone 大仓库 early EOF 的三层根因 + 社区分批回填方案 + sparse-checkout 实测"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状
`git clone` 大仓库（~100 MB）反复失败：`fetch-pack: invalid index-pack output` / `early EOF` / `unexpected disconnect while reading sideband packet`。

## 三层根因（2026-10-26 逐层实测）
| 路径 | 现象 | 根因 |
|---|---|---|
| HTTPS + DevSidecar（默认） | `invalid index-pack output` | 代理加 `DS-Proxy-Request` 头破坏 pack 流 |
| HTTPS 直连 | `Connection was reset` | 直连 GitHub 被干扰 |
| SSH | 握手/小包全通，blob 卡住 | **长流传输中途断** |

SSH 层四项对照：握手 10/10 成功 / `ls-remote` ✅ / 小仓库（octocat/Hello-World）完整 clone ✅ / 本仓库 `--filter=blob:none` tree ✅（373 对象 99.85 KiB）/ **blob ❌（30s timeout 只吐 78 行）**。
⇒ 不是认证、不是对象多、不是仓库坏，是 **~100 MB 连续流撑不住**。短交互通、长流断。

## 社区经验（web_search 2026-10-26）
1. **`--filter=blob:none` 只拉 commit+tree，速度是 KB 级**，这是所有方案的第一步。
2. **分批回填 blob**（[blog.est.im/2026/stdout-33](https://blog.est.im/2026/stdout-33)）：`rev-list --objects --missing=print` 算缺失集合 → **500 个 blob 一批** → 每轮重算只补缺的。坑：`git fetch <blobsha>` 每次打印 `fatal: bad object` 但不影响回填。
3. **浅克隆是最有效的一招**（[githubvpn.pro/troubleshoot/early-eof](https://githubvpn.pro/troubleshoot/early-eof)）。
4. `git fetch` 会**按对象续传**，所以「大 pack 一次传」才是致命点 —— 社区建议服务端 `packSizeLimit` 限到 50 MB（[gentoo-scm 邮件](https://public-inbox.gentoo.org/gentoo-scm/)）。

## 本机可行方案
**sparse-checkout 按目录拉**（已实测 `kb/` 15 文件完整）：
```bash
timeout 90 git clone --depth 1 --filter=blob:none --sparse git@github.com:TianQue6916/dsh-reasonix-agent <dir>
timeout 90 git -C <dir> sparse-checkout set kb      # 注意：set 是【替换】不是累加
timeout 90 git -C <dir> checkout
```

## 两个操作坑（都是我踩的）
- `git sparse-checkout set A B C` 一次给多个是**累加**；但 for 循环里逐个 `set A; set B` 是**替换**，会把前面的清掉。正确做法：一次 set 全部，或用 `sparse-checkout add`。
- partial clone 里任何触碰未知 blob 的命令（`rev-list --objects`、`ls-tree -l` 遇到未拉 blob）都会**按需拉取并卡住**，必须加 `timeout`。

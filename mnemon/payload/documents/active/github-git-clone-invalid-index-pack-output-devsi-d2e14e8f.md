---
id: "d2e14e8f-541d-4806-ae16-199a5560110c"
title: "GitHub git clone 反复 invalid index-pack output：DevSidecar 破坏 pack 流、直连被 reset、SSH 旁路修复（2026-10-26）"
description: "2026-10-26 排查「git clone GitHub 经常失败」：GIT_TRACE 抓到 DevSidecar 注入 DS-Proxy-Request 破坏 upload-pack 流导致 invalid index-pack output，绕代理直连被 Connection reset；结论为改走 SSH 并在全局 gitconfig 用 url.insteadOf 把 https://github.com/ 重写为 git@github.com:，含 ls-remote 通而 clone 炸的判据与三条路径对照表。"
status: "active"
created_at: "2026-10-25T19:44:29.737Z"
updated_at: "2026-10-25T19:44:29.737Z"
content_hash: "fcec48427535a4ff62d017d2e9a4eb9f3ba0c0604979dfc5a71ed3bc104049ad"
source_paths:
  - ".gitconfig"
  - "_repo_probe/.git"
  - "PLAN.md"
  - "kb/08-backup-and-git.md"
session_ids:
  - "d50a23d9-f732-40cf-bd8e-ab46d48d7c52"
memory_body_ids:
  []
---

# GitHub git clone 反复失败（invalid index-pack output）——根因与修复（2026-10-26）

**性质**：故障根因调查（含 GIT_TRACE 证据与复现步骤）+ 已落地的修复配置。
相关文档：`b454a116-f699-471b-982b-c57f31704689`（全局 `url.insteadOf` 劫持到 gh-proxy 镜像 429 的另一类 git 失败）、
`bdfb4947-957c-407d-ac32-791b4f76295f`（本机 CLI 不读 WinINET 代理、DevSidecar 只对浏览器生效的代理路径不对称）、
`37e02e35-130b-4cd7-8fd2-9aec17f1f11e`（`~/.dsh` 的 GitHub 备份链路）。

## D 定论

| 路径 | 结果 | 原因 |
|---|---|---|
| HTTPS + DevSidecar（本机全局 `http.proxy=127.0.0.1:31180` / `https.proxy=127.0.0.1:31181`） | `fatal: fetch-pack: invalid index-pack output` | 代理在 `git-upload-pack` 响应头注入 `DS-Proxy-Request`，pack 流被改写/截断，`index-pack` 拿到残包立即失败 |
| HTTPS 直连（`-c http.proxy=` 绕开） | `Recv failure: Connection was reset` | 本机直连 GitHub 本身被干扰 |
| **SSH（`git@github.com:`）** | ✅ 3163 文件完整 clone | 加密通道，代理与直连干扰都不影响 |

结论：本机拿 GitHub 大 pack 的唯一稳定通道是 SSH；HTTPS 两条路都死，且死法相反（一个是本地代理坏包，一个是网络层 reset）。

## M 机制

- `git ls-remote` 只做 ref 发现、**不传 pack**，所以永远成功；`git clone`/`fetch` 一要传 pack 就必炸。这正是「同一个仓库有时能连有时不能」错觉的来源。
- `GIT_TRACE=1` 可直接看到凶手：
  ```
  <= Recv header: DS-Proxy-Request: https://github.com:443/TianQue6916/<repo>/git-upload-pack
  run_command: git --shallow-file ... index-pack --stdin --fix-thin '--keep=fetch-pack ...'
  fatal: fetch-pack: invalid index-pack output
  ```
  `DS-Proxy-Request` 行证明 DevSidecar（进程 `dev-sidecar`）在拦 git 流量。
- 该故障与仓库改名无关：`TianQue6916/reasonix` → `TianQue6916/dsh-reasonix-agent` 改名后的 301/redirect 只影响 URL，不产生 pack 损坏；换新名字后同样报 `invalid index-pack output`，可据此排除改名假设。
- `--filter=blob:none` 等减轻体积的尝试同样失败，说明不是体积问题而是流完整性。

## R 复现 / 修复步骤

1. 复现：`GIT_TRACE=1 git clone https://github.com/<org>/<repo> .` 观察 `DS-Proxy-Request` 与 `invalid index-pack output`。
2. 对照：`git clone -c http.proxy= -c https.proxy= https://...` → `Connection was reset`。
3. 验证 SSH 通道：`ssh -T git@github.com`（本机 `~/.ssh/id_ed25519` 已配好，返回 `Hi TianQue6916! ...`）。
4. 落地修复（全局改写 URL，无需逐条改用 SSH 地址）：
   ```bash
   git config --global url."git@github.com:".insteadOf "https://github.com/"
   ```
5. 验收：用 **https URL** 再次 clone，实际走 SSH，3163 文件完整拉下；备份 `~/.gitconfig.bak-sync-*`。
6. 清理：临时 probe 目录删除；确认残留 http.proxy 对 SSH 无效、不影响。

## J 判据

- `ls-remote` 成功但 `clone`/`fetch` 失败 ⇒ 几乎必然是 pack 传输层问题（代理/网络/镜像），不要怀疑仓库、权限或 token。
- 想在失败现场定位 ⇒ 加 `GIT_TRACE=1`，看响应头里有没有非 GitHub 自己的注入头（本例 `DS-Proxy-Request`）。
- 本机判断 git 走没走代理：`git config --get http.proxy`、WinINET `ProxyEnable`、`Get-Process dev-sidecar`。
- 旁路是否生效：确认 `git config --get url.git@github.com:.insteadof`。

## X 反例（本次试过但不成立的假设）

- 「仓库改名导致」——换新名后同样失败。
- 「偶发网络抖动，重试就好」——两次连续失败，且失败点在 `index-pack` 而非连接建立。
- 「clone 太大」——`--filter=blob:none` 仍失败。

## 存疑

- DevSidecar 是否可配置为对 `git-upload-pack` 直通而不改流：未验证。若可行，HTTPS 通道或可恢复；当前未做，因 SSH 已满足需求。
- 本机直连 GitHub 被 reset 的上游原因（DNS 污染 / SNI 干扰）未单独定位，证据见 `bdfb4947-...`。

## S 溯源

- checkpoint 工具输出：GIT_TRACE 原文、`--filter=blob:none` 失败、SSH clone 成功的 `Updating files: 100% (3163/3163)`、`insteadOf` 后 https URL 实测成功。
- 相关项目记录：`PLAN.md`（本次收尾结论行）、`kb/08-backup-and-git.md`（备份与 git 章节）。

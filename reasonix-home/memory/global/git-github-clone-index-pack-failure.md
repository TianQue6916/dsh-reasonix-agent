---
id: mem-ac9ad1143d2aa1161f5918031a2839ec
revision: 1
created_at: "2026-10-25T19:43:05.142Z"
updated_at: "2026-10-25T19:43:05.142Z"
name: git-github-clone-index-pack-failure
description: "git clone GitHub 反复失败的根因：DevSidecar 破坏 pack 流；修复=insteadOf 改走 SSH"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 症状
`git clone` / `git fetch` GitHub 仓库反复失败：`fatal: fetch-pack: invalid index-pack output`，但 **`git ls-remote` 一直正常**，造成「有时行有时不行」的错觉。

## 根因（三条路两种死法）
| 路径 | 结果 | 原因 |
|---|---|---|
| HTTPS + DevSidecar（全局 http.proxy=127.0.0.1:31180 / https.proxy=31181） | `invalid index-pack output` | 代理在响应里加 `DS-Proxy-Request` 头并改写流，pack 数据被破坏 |
| HTTPS 直连（`-c http.proxy= -c https.proxy=`） | `Recv failure: Connection was reset` | 这台机器直连 GitHub 本身被干扰 |
| **SSH**（`git@github.com:`） | ✅ 完整 | 加密通道，代理与干扰均不影响 |

`ls-remote` 只握手不传 pack，所以永远成功 —— 这是判断关键：**ls-remote 通但 clone 炸 = 传输层被中间人改了**。

## 诊断方法
`GIT_TRACE=1 git clone ... 2>&1 | grep -iE 'index-pack|pack|fatal'` 能看到
`<= Recv header: DS-Proxy-Request: https://github.com:443/.../git-upload-pack`，一眼定位代理。

## 修复（已落地 2026-10-26）
```
git config --global url."git@github.com:".insteadOf "https://github.com/"
```
之后所有 `https://github.com/...` URL 自动走 SSH。验证：用 https URL clone 成功拉到 3163 文件。
备份：`~/.gitconfig.bak-sync-*`。

## 注意
- 不要用 `gh-proxy.*` 镜像类 insteadOf 规则做全局劫持（历史上配过 `gitproxy.mrhjx.cn`，返回 429）——已删。
- `http.proxy=http://127.0.0.1:31180` 保留着无害（SSH 不走 http.proxy），但若哪天改回 HTTPS 会再次触发本 bug。

## 仓库
`TianQue6916/reasonix` 已改名 **`TianQue6916/dsh-reasonix-agent`**（旧 URL 301 重定向，走重定向 + 大 pack 也会放大失败率）。

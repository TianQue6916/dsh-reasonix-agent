---
id: "b6aace94-6724-44e9-a1de-953fe32246d9"
title: "insteadOf 收窄为只读 owner 白名单 + 镜像凭据硬保险：两条旧结论被实测推翻（2026-11-02）"
description: "2026-11-02 在既有 insteadOf 劫持根因之上落地的方案：全站 gitproxy 改写收窄为 6 条只读 owner → gh-proxy.com 白名单，镜像 host 置空 credential helper；含证伪（GCM 不会把 PAT 给镜像 host、git -c url.insteadOf= 无法临时取消改写）、镜像可用性 200/429 清单、gh.sh mirror 子命令与未决项。"
status: "active"
created_at: "2026-11-01T19:13:23.751Z"
updated_at: "2026-11-01T19:13:23.751Z"
content_hash: "50a19305fffca49fd04e9bc3f64291693b1864f05d6e9dfeb26021aeeaa3cd22"
source_paths:
  - ".gitconfig"
  - ".dsh/skills/github/SKILL.md"
  - ".dsh/skills/github/scripts/gh.sh"
  - ".dsh/skills/github/reference/workflows.md"
session_ids:
  - "b4a6eb6e-2fdf-460c-8499-d7a2673515f0"
memory_body_ids:
  []
---

# insteadOf 收窄为只读 owner 白名单（2026-11-02）

**性质**：在既有根因结论（见前置文档 `b454a116-f699-471b-982b-c57f31704689`：全站 `insteadOf` 把 github.com 劫持到 `gitproxy.mrhjx.cn` 并吃 429）之上，落地的方案 + 对照实测 + 两条被推翻的旧结论。

## 落地方案

删除全站规则 `url.https://gitproxy.mrhjx.cn/https://github.com/.insteadOf = https://github.com/`，换成 6 条 **owner 级只读白名单**，镜像换 `gh-proxy.com`（`gitproxy.mrhjx.cn` 已 429 废弃，必须一起换）：

```
url.https://gh-proxy.com/https://github.com/deepseek-ai/.insteadOf  = https://github.com/deepseek-ai/
url.https://gh-proxy.com/https://github.com/ggerganov/.insteadOf    = https://github.com/ggerganov/
url.https://gh-proxy.com/https://github.com/huggingface/.insteadOf = https://github.com/huggingface/
url.https://gh-proxy.com/https://github.com/meta-llama/.insteadOf  = https://github.com/meta-llama/
url.https://gh-proxy.com/https://github.com/pytorch/.insteadOf     = https://github.com/pytorch/
url.https://gh-proxy.com/https://github.com/microsoft/.insteadOf   = https://github.com/microsoft/
```

**硬保险**（镜像 host 结构上取不到凭据）：`credential.https://gh-proxy.com.helper =`（空值）、`credential.https://ghfast.top.helper =`（空值）。

备份：`~/.dsh/.gitconfig.bak-20261102-0301-pre-insteadof-narrow`；commit `19779c1`。

## 三条实测不变量（GIT_TRACE 验证，非推断）

| 场景 | 结果 |
|---|---|
| 自有私有仓 `TianQue6916/inbox` 走 https | **不被改写**，trace 显示直连 `https://github.com/TianQue6916/inbox.git`；2/2 次 `ls-remote` 拿到 `refs/heads/main` |
| 第三方 `deepseek-ai/DeepSeek-V3` | 重写进 `gh-proxy.com`，正常出 refs |
| 镜像 host 的凭据 | `printf 'protocol=https\nhost=gh-proxy.com\n\n' \| git credential fill` → `fatal: could not read Username`，拿不到 token，也不弹 GCM |

owner 粒度白名单的判据：`url.<base>.insteadOf` 按前缀字符串匹配，写 `.../deepseek-ai/` 就只命中该 owner 的路径，不影响 `TianQue6916/...`。

## 镜像可用性（`/info/refs?service=git-upload-pack` 实测）

- **200**：`gh-proxy.com`、`ghfast.top`、`hub.glowp.xyz`、`fastgit.cc`
- **429**：`ghproxy.cxkpro.top`、`gh.idayer.com`、`gitproxy.mrhjx.cn`
- **连不上**：`gh.xxooo.cf`

失效就换下一个，别死磕；`.gitconfig` 已对这些域名预置 `proxy=""`（直连）。

## 两条被实测推翻的旧结论（文档已改）

1. **「GCM 会把 PAT 塞给镜像 host」不成立**。GCM 按 host 精确匹配，`gitproxy.mrhjx.cn` 拿不到 `github.com` 的凭据。全站改写的真实代价是 **可用性**（429 让所有 https clone 直接失败）+ **私有仓 URL 外泄**，白名单方案把两者一起解决。
2. **`git -c 'url….insteadOf='` 不能临时取消改写**。空值只是追加一条空规则，原全局规则照旧生效（旧版 `reference/workflows.md` 里写的这条绕行命令是错的，已删除）。真要绕开全局配置得用 `GIT_CONFIG_GLOBAL=/dev/null`，但该环境下直连 git-https 常被 `Connection was reset` → **第三方公开仓优先 SSH**（`git ls-remote git@github.com:ggerganov/llama.cpp.git` 6.1 s 通过）。

## 配套子命令

```bash
bash ~/.dsh/skills/github/scripts/gh.sh mirror <owner>/<repo> [dir] [--depth 1] [--host ghfast.top]
```

显式拼完整镜像 URL 来 clone，**不依赖 insteadOf** —— 白名单只覆盖 6 个 owner，其余第三方仓走这条。`gh.sh doctor` 现在区分两种模式：全站改写只警告；白名单则列出条目并检查镜像 credential helper 是否已禁用。

## 未决项（待用户拍板）

- `~/.ssh/github_key.tmp`（0 字节残留）是否删除。
- `desktop-tutorial`（0 KB 的 GitHub Desktop 教程仓）是否删除。
- `.gitconfig` 中 `[http "\"https://gitee.com\""]` 这类带转义引号的段名**从未生效**（git 不匹配），写法应为 `[http "https://gitee.com"]`，是否一并修。

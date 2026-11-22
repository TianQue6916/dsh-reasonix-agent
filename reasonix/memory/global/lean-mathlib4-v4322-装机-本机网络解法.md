---
id: mem-f455f6e908d00f6d25e3b5086106ab42
revision: 1
created_at: "2026-11-22T13:58:26.984Z"
updated_at: "2026-11-22T13:58:26.984Z"
name: lean-mathlib4-v4322-装机-本机网络解法
description: "本机 Lean/mathlib4 安装路径与三个致命网络坑（SJTU 镜像 / ssl-no-revoke / legacy container / git rev-parse hack）"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 结论（2026-11-22 实测，Lean 4.32.2 + mathlib4 tag v4.32.2 = sha 905b9581）

项目：`C:\Users\27063\.dsh\.learn\run\lalfd\lean\mathlib_proj\`（7.1G；mathlib 6.7G = 158M 源码 + 6.3G oleans）
验收：`lake env lean Test.lean` stdout 空、exit 0、64s，import Mathlib 三条定理全真证。

## 可复用命令

```bash
export ELAN_TOOLCHAIN=leanprover/lean4:v4.32.2   # 必须钉，否则 elan 会去下 4.36 并 SSL 失败
export GIT_CONFIG_GLOBAL=/tmp/gcfg               # 绕开 ~/.gitconfig 里 dev-sidecar 写的 insteadOf -> ghpxy（403）
# mathlib4 源码（36s / 158MB）：
git clone --depth 1 --single-branch --branch v4.32.2 \
  https://mirror.sjtu.edu.cn/git/lean4-packages/mathlib4 .lake/packages/mathlib
```

依赖包：SJTU 有 `batteries/aesop/import-graph/quote4/ProofWidgets4/lean4-cli`；`LeanSearchClient`、`plausible` 走 `https://ghfast.top/https://github.com/leanprover-community/<repo>`（6s 全量）。

## 三个致命坑

1. **curl SSL 吊销检查**：`CRYPT_E_NO_REVOCATION_CHECK (0x80092012)` / `schannel: failed to receive handshake` ⇒ `~/.curlrc` 写 `ssl-no-revoke`（已建）。这是 elan 下 4.36 失败、mathlib cache 全挂的根因。
2. **cache container**：v4.32.2 的 ltar 只在 **legacy container** `https://lakecache.blob.core.windows.net/mathlib4/f/<hash>.ltar`（200）；默认链 `mathlib4-master` / `mathlib4-forks` 全 404。⇒ `MATHLIB_CACHE_FROM=legacy`。Azure 直连可达（约 260 KB/s/流）。
3. **`lake exe cache get` 的 git hash**：它跑 `git rev-parse HEAD` 于 cwd。项目在 `.dsh` 仓库内 ⇒ 拿到 .dsh 的 hash。修法：在 mathlib_proj 里 `echo "gitdir: ./.lake/packages/mathlib/.git" > .git`，跑完删。

## 数字

- ltar：8639 个 / 442MB，32 路 curl 并发 19 分 15 秒（`--parallel` 的 debug curl 会 0 字节，别用）
- 解压：8638 个 ltar → 6.3GB oleans，105.6s
- 磁盘：C: 70G→62G；`~/.cache/mathlib` 442M；`~/.elan` 3.0G 未变
- 脚本：`~/.dsh/.learn/run/lalfd/lean/cache-get.sh`、`download-all.sh`

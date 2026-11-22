---
id: mem-45560c856ab872f610e1d75a68eaee55
revision: 1
created_at: "2026-11-22T13:59:34.438Z"
updated_at: "2026-11-22T13:59:34.438Z"
name: lean-mathlib-windows-env
description: "Lean 4.32.2 + mathlib4 在本机的安装位置、真证样例、成本与四个静默失败坑"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 版本与路径（2026-11-22 实测）
- Lean 4.32.2 / Lake 5.0.0-src+f3b06c7；`lean-toolchain` = `leanprover/lean4:v4.32.2`
- 项目：`C:\Users\27063\.dsh\.learn\run\lalfd\lean\mathlib_proj\`（mathlib4 tag v4.32.2 = sha `905b95818e…`，7.1 GB，含 6.3 GB oleans）
- `~/.elan` 3.0 G；`lake env lean` 每次冷启动 **64 s**

## 真证过三条（无 sorry、exit 0、stdout 空）
```lean
import Mathlib
example (a b : ℝ) : a*b ≤ (a^2+b^2)/2 := by nlinarith [sq_nonneg (a-b)]
example (x y : EuclideanSpace ℝ (Fin 3)) : inner ℝ x y ≤ ‖x‖*‖y‖ := real_inner_le_norm x y
example (A : Matrix (Fin 2) (Fin 2) ℝ) (h : A.det ≠ 0) : A.rank = 2 := by
  have hA : IsUnit A := (Matrix.isUnit_iff_isUnit_det A).mpr (isUnit_iff_ne_zero.mpr h)
  simpa using Matrix.rank_of_isUnit A hA
```

## 成本
clone 36 s（SJTU shallow）/ 7 包 ~5 min / cache 8639 ltar 19 min（442 MB，32 路）/ 解压 105 s / 一次验证 64 s。
单位成本：能对到现成 lemma → **5–20 行、3–6 分钟/条**；从零造 lemma → 小时级。一次性墙钟 ~3 h（网络排障占 2/3）。

## 四个坑（都会静默失败）
1. **`~/.curlrc` 写 `ssl-no-revoke`** —— 钥匙：`CRYPT_E_NO_REVOCATION_CHECK 0x80092012` 让 elan/mathlib cache 的所有 HTTPS 静默失败
2. `~/.gitconfig` 里 dev-sidecar 的 `url.https://ghpxy.hwinzniej.top/https://github.com/.insteadOf` → 403；用 `GIT_CONFIG_GLOBAL=/tmp/gcfg` 绕开
3. v4.32.2 的 ltar **只在 legacy container**（`https://lakecache.blob.core.windows.net/mathlib4/f/<hash>.ltar`），默认链 mathlib4-master/forks 全 404 ⇒ `MATHLIB_CACHE_FROM=legacy`
4. `lake exe cache get` 用 cwd 的 `git rev-parse HEAD`；项目在别的 git 仓库内会拿错 hash ⇒ 临时写 `gitdir: ./.lake/packages/mathlib/.git` 到 `.git`，跑完删

## 用法判据
注里的一般定理**可以**配 Lean 证明，前提是能对到 mathlib 现成 lemma（先 `#check` 找名）；对不到的不做（小时级），改 sympy 数值核对 + 引用出处。纯数值断言用 sympy 更快。

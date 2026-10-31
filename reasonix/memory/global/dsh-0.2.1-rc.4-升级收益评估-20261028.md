---
id: mem-6ea37ba1c2d2945fb13b303f8dfa3f90
revision: 2
created_at: "2026-10-28T13:04:04.917Z"
updated_at: "2026-10-28T16:13:59.692Z"
name: dsh-0.2.1-rc.4-升级收益评估-20261028
description: "dsh rc.2→rc.4 用 npm pack + diff 实证：四个核心包 JS 全部 byte-identical，只改了 package.json 的 version；结论不值得升，等下一个大版本"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 决定性证据（2026-10-29，用 npm pack + diff 直接比字节）

把四个核心包在 `0.2.1-rc.2` 与 `0.2.1-rc.4` 两个版本各 `npm pack` 下来，解包 `diff -rq`：

| 包 | JS 文件数 | 差异文件 | lib/*.js 的 md5 |
|---|---|---|---|
| `@deepseek-ai/dsh-sandbox-windows-acl` | 3 | **只有 package.json** | `index.js` / `runner.js` / `types-*.js` **全部 byte-identical** |
| `@deepseek-ai/dsh-agent-loop` | 1 | **只有 package.json** | `a69ede59…` 两版相同 |
| `@deepseek-ai/dsh-sandbox` | 1 | **只有 package.json** | 相同 |
| `@deepseek-ai/dsh-tool-bash` | 1 | **只有 package.json** | 相同 |

`package.json` 的唯一差异是 **version 字段 + 依赖版本号**（`0.2.1-rc.2` → `0.2.1-rc.4` 的字符串替换）。

⇒ **rc.4 对 sandbox / agent-loop / tool-bash 三个内核零代码改动。** 整条 rc.2→rc.4 的实质变化只在 UI 层（rc.3 的那三条），rc.4 本身连 GitHub Release 正文都没有。

## 结论：不值得升

- **收益**：只有 rc.3 的 ① 左栏/会话视图/右栏「更多」菜单 ② 修「新会话」找不回未发送草稿 ③ 模型列表更新方式对齐。全是 UI 细节。
- **成本**：桌面端必须整目录换（`.exe` + `app.asar`），NSIS 在这台机永远 rc=2，只能 7z 切包 + rename。
- **风险**：rc.4 无正文 = 盲升；虽是整目录替换，回滚成本高。

**建议等下一个大版本**（0.2.2 / 0.3），或等 rc.4 出了 GitHub Release 正文再说。

## 复用方法（下次评估任何 dsh 版本升级都用这个）

```bash
mkdir -p rc4diff/{old,new} && cd rc4diff
for p in dsh-sandbox-windows-acl dsh-agent-loop dsh-sandbox dsh-tool-bash; do
  npm pack @deepseek-ai/$p@<旧版本> --pack-destination old
  npm pack @deepseek-ai/$p@<新版本> --pack-destination new
  mkdir -p x_old_$p x_new_$p
  tar -xzf old/*$p*<旧版本>.tgz -C x_old_$p
  tar -xzf new/*$p*<新版本>.tgz -C x_new_$p
  diff -rq x_old_$p x_new_$p
done
```

**判据**：如果 `diff -rq` 只报 `package.json` 差异 ⇒ 该包零代码改动，升级无收益。
**注意**：`@deepseek-ai/dsh` 本身只是 25KB 的 CLI 元包（20 个文件），不含子包 —— 要 diff 子包才有意义。

## 附：Linux 侧的对照信号

Linux 端在 rc.4 上"跑得很好"是真的，但结合上面的 diff，这不能作为「rc.4 有改进」的证据 —— 它只是在**代码没变**的前提下运行正常。用户原来的推理（"Linux 升级后没问题 ⇒ 值得升"）在逻辑上缺少一环：**没问题 ≠ 有收益**。

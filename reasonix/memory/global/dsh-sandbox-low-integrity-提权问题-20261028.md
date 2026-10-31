---
id: mem-b37193d0d46c9d2c7c8c8356bec7745b
revision: 4
created_at: "2026-10-28T13:01:46.158Z"
updated_at: "2026-10-28T17:14:41.456Z"
name: dsh-sandbox-low-integrity-提权问题-20261028
description: "D:\\Toolbox 写入解决：icacls /setintegritylevel \"(OI)(CI)Low\" 给两个子目录，bash/python/powershell 三路全通，因此不装 dsh-sandbox-allowlist"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 结论：`icacls /setintegritylevel` 一个动作解决全部三种写入方式，插件**不需要装**

2026-10-29 实测（UAC 一次）：

```powershell
icacls 'D:\Toolbox\goat-gateway'         /setintegritylevel "(OI)(CI)Low" /T /C   # 560 files
icacls 'D:\Toolbox\dsh-thinking-language' /setintegritylevel "(OI)(CI)Low" /T /C   # 9 files
```

验证标志（两处都出现）：

```
Mandatory Label\Low Mandatory Level:(OI)(CI)(NW)
```

三种写入方式逐一实测，**全部通过**：

| 方式 | 结果 |
|---|---|
| `bash` 的 `touch` | ✅ |
| `python`（`open(...,'w')`） | ✅ |
| `powershell`（`Set-Content`） | ✅ |

⇒ 用户原本报的「python / powershell / str_replace_editor 三种方式全部 EPERM」**全解**。

## 为什么最终没装 `dsh-sandbox-allowlist`

用户先选了它，但把它 `npm pack` 下来读实现后发现（见 fact `dsh-sandbox-allowlist-能力边界-20261029`）：

- Windows 上它只挂载 `lib/fs.mjs`（write/edit 的**应用层路径围栏**）
- `lib/provider.mjs`（唯一能碰 bwrap/内核那层的）在 Windows 上 `disabled: true`
- ⇒ 只解 1/3，bash 那条路照样断

而 `icacls /setintegritylevel` 解 3/3，且**不需要重启 dsh**、**不禁用原生 `sandbox-policy`/`fs-sandbox` 行**、回滚一行命令。

**判断顺序**：先试「不动 dsh、改系统对象属性」的方案，验证通过就不引入插件。插件是侵入性更大的备选，不是首选。

## 回滚

```powershell
icacls 'D:\Toolbox\goat-gateway'          /setintegritylevel "(OI)(CI)Medium" /T
icacls 'D:\Toolbox\dsh-thinking-language' /setintegritylevel "(OI)(CI)Medium" /T
```

## 范围限定（重要）

只给这两个子目录打了 label，**不是整个 `D:\Toolbox``**。
以后要写别的子目录（比如 `D:\Toolbox\<新项目>`），要么再打一条 label，要么才考虑装 allowlist 插件把清单交给它管。

## 同类已解的两处

- `C:\relay` —— 同样手法（2026-10-28），验证 `echo > _lowil_ok.txt` 通过
- `C:\Users\27063`（workspace）—— dsh 自己打的 Low label，一直都在

## 一个仍未解的相关问题

`D:\Toolbox` 的**父目录**没打 label。所以「在 `D:\Toolbox\goat-gateway` 里新建文件」可以，但「在 `D:\Toolbox\` 根下新建目录」仍然 `EPERM`。如果需要，对 `D:\Toolbox` 本身再打一次（辐射面更大，按需决定）。

---
name: tool-lean4
description: Lean 4 定理证明 — 编译验证 .lean（lake build/lean），本机 4.32.2 已装
---

---
name: tool-lean4
description: Lean 4 定理证明 — 编译验证 .lean 文件（lake build / lean 命令），本机 4.32.2 已装
---

# Tool: Lean 4 定理证明器

本机已安装 Lean 4.32.2（elan 工具链管理）。

## 环境

- lean: `/home/tianque/.elan/bin/lean`
- elan: `/home/tianque/.elan/bin/elan`
- lake: `/home/tianque/.elan/bin/lake`（Lean 项目构建）
- 示例项目: `/home/tianque/.reasonix/global-workspace/lcs-proof/`（LCS 证明）

## 用法

### 1. 单文件验证（快速）

```bash
lean --run file.lean    # 运行
lean file.lean          # 仅检查（含 #eval 会执行）
```

### 2. 项目构建

```bash
cd <项目目录> && lake build
```

### 3. 新项目

```bash
lake new myproj   # 创建项目
cd myproj && lake build
```

## 使用场景

- 用户让验证某个数学证明（LCS 最优子结构、归纳法、不等式等）
- 编写 Lean 证明时用 `lean` 实时检查语法/类型错误
- 错误信息看 `error:` 行，常见：未匹配的 tactic、类型不匹配、`unknown identifier`

## 注意事项

- Lean 4 与 Lean 3 语法不兼容（本项目是 Lean 4）
- 数学库 Mathlib 若未下载会报 `unknown package`，先 `lake update` 或确认 `lake-manifest.json` 存在
- 证明卡住时用 `simp`、`omega`、`ring` 等自动化 tactic 减少手工步骤

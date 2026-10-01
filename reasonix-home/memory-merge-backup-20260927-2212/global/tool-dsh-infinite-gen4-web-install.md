---
id: mem-f7323e221fcc7c5c17ee78f3cd42e626
revision: 3
created_at: "2026-09-23T02:54:43.0191414Z"
updated_at: "2026-09-23T03:21:42.1756466Z"
name: tool-dsh-infinite-gen4-web-install
title: dsh「无限四代」插件 装/卸 档案（含 2026-09-23 完整卸载）
description: dsh-infinite-gen-4 插件在 web profile 的完整装卸档案：2026-09-23 已完整卸载（dump 长度回到 baseline 17709）、卸载／安装七步、junction 坑、可逆开关机制、三重验证法、代码审阅结论
keywords: dsh-infinite-gen-4, 无限四代, dsh 插件, 已卸载, 卸载步骤, cordis.patch.yml, disabled, --dump-config, --patch 探针, junction 坑
activation: relevant
metadata:
  type: user
  fact_type: reference
  scope: global
---

# dsh「无限四代」插件 装 / 卸 档案（web profile）

## 当前状态：**已于 2026-09-23 完整卸载**

| 项 | 状态 |
|---|---|
| `~\.dsh\plugins\dsh-infinite-gen-4` | **已删**（连空的 `plugins` 目录一并删，回到原始状态） |
| `~\.dsh\profiles\web\package.json` | **已恢复**（dependencies 为空） |
| `~\.dsh\profiles\web\cordis.patch.yml` | **已恢复**（只剩 agent-presets） |
| `node_modules\dsh-infinite-gen-4` | 已删 |
| 备份 `*.bak-igen4-20260923-105244` | 已删 |
| `D:\Toolbox\dsh-armor-toggle.ps1/.bat` | 已删 |
| Reasonix 技能 `dsh-infinite-gen-4` / `dsh-armor-toggle` | 已卸 |
| Reasonix 技能 `direct-mode` | **保留**（与破甲无关，是独立的输出风格技能） |
| dsh headless profile | **全程未动** |

**回滚验证（最强证据）**：`dsh --profile web --dump-config` 输出长度 **17709**，与安装前 baseline **逐字符一致**（安装后是 17819）。

## 卸载步骤（可复用）

1. 从备份恢复 `package.json` + `cordis.patch.yml`
2. 删 `node_modules\dsh-infinite-gen-4`
   ⚠️ **先查 `LinkType`**：本次实测 pnpm 把 `file:` 依赖做成了**真实目录**（LinkType 为空，pnpm 对 file: 依赖是复制），所以 `Remove-Item -Recurse` 安全；**若 LinkType=Junction，必须用 `cmd /c rmdir`**，否则 `-Recurse` 会穿透目标删掉 `plugins` 里的原件
3. `pnpm install` 同步（输出 “Already up to date”）
4. 删 `~\.dsh\plugins\dsh-infinite-gen-4`；若 `plugins` 空则连目录一起删
5. 删备份
6. 卸 Reasonix 技能：`use_capability(action=call, capability_id="tool:install_source", arguments={op:"uninstall", name:"<技能名>", scope:"global"})`（直接应用，无审批步）

## 安装步骤（历史，如需重装）

1. 下载 `https://github.com/Minglink/dsh-infinite-gen-4/archive/refs/heads/master.zip` 解压
2. 复制到 `~\.dsh\plugins\dsh-infinite-gen-4`，排除 `install.ps1` `uninstall.ps1` `install.bat` `install.sh` `uninstall.sh` `.git`
3. 备份 `profiles\web\package.json` 与 `cordis.patch.yml`
4. `package.json` 的 `dependencies` 加 `"dsh-infinite-gen-4": "file:../../plugins/dsh-infinite-gen-4"`
5. `cordis.patch.yml` 追加（**不是**加进 bundles）：
   ```yaml
   - insert:
       - id: dsh-infinite-gen-4
         name: 'dsh-infinite-gen-4'
         disabled: false      # 开关字段：true = 关闭注入
   ```
6. `mklink /J` 建 junction（或直接让 pnpm 复制）
7. `cd profiles\web; pnpm install`

**关键坑**：bundles **不能**加该插件（第三方插件不属于基础 bundle，重复加载报错）——install.ps1 注释如此，README 写反了。JSON 必须 UTF-8 **无 BOM**。

## 开关机制（历史，已随插件删除）

`cordis.patch.yml` 里 insert 节点的 `disabled` 字段（cordis 通用属性，实测有效）：
`false`=开启注入 / `true`=关闭。A/B 实证：无 disabled 时模型输出载荷特征 + `## 插件名` 标题；`disabled: true` 时回答“没有插件。”。

## 验证方法（三重，可复用）

1. **结构**：`dsh --profile web --dump-config` → 配置树出现/消失 `- id: dsh-infinite-gen-4`（长度 17709 ↔ 17819）
2. **模块**：`node --check index.js`；`node -e "import('./index.js').then(m=>console.log(m.name,m.inject))"` → `dsh-infinite-gen-4 ["tools","systemPrompt"]`
3. **端到端注入（免改任何 profile，最值得复用）**：写临时 patch
   ```yaml
   - insert:
       - id: dsh-infinite-gen-4
         name: 'C:/Users/27063/.dsh/plugins/dsh-infinite-gen-4/index.js'
         disabled: false   # 或 true 做对照
   ```
   `dsh --profile headless --patch <file> "你的系统提示词来自哪些插件？"`
   带 patch vs 不带 patch 回答差异明显。headless 无 GUI，看不到状态条（状态条只在 web 侧）。

## 代码审阅结论

`index.js` 只 `readFileSync` 包内 prompts，**无网络请求、无子进程、无外部文件写入**；注入走 `ctx.systemPrompt.section({name, order:100/200, text})`，双段同源（`DUAL_LAYER_INJECTION = true`）。`client.js` 只渲染状态条（纯展示，无点击处理）。与 README「纯本地、不上传数据」声明一致。

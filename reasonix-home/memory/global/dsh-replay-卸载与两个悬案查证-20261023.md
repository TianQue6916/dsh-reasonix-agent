---
id: mem-c9401b7f0e3de66bb4228fffc0c63e09
revision: 1
created_at: "2026-10-22T15:12:21.618Z"
updated_at: "2026-10-22T15:12:21.618Z"
name: dsh-replay-卸载与两个悬案查证-20261023
description: "鲸小深=dsh-replay 的 mascot：已从 desktop/web 两个 profile 卸载（deps+bundles+node_modules 共 32.7MB，package.json 已备份），需重启 dsh 生效；顺带查明 hooks-claude-code 自 2026-09-27 起未触发（Stop hook 日志停摆）、tool-ralph 在 275 turns/5520 次调用中零使用"
metadata:
  type: user
  fact_type: reference
  scope: global
---

## 起因
用户 2026-10-22：「dsh-replay，什么鲸小深这个插件，我不要了」。

## 「鲸小深」= `@mingozhou/dsh-replay` 的吉祥物（mascot），不是另一个插件
证据：`鲸小深` 在该包内出现 README.md(3) / README.zh.md(3) / `src/client/mascot.tsx`(3) / `lib/types/src/client/mascot.d.ts`(1) / `src/client/i18n.ts.bak-pre-thinking`(1)；其余已装插件里搜不到「鲸」。

## 已执行卸载（两个 profile 都装了）
- `profiles/desktop/package.json` + `profiles/web/package.json`：从 `dependencies` 与 `dsh.profile.bundles` 移除；备份 `package.json.bak-20261023-pre-drop-replay`
- 删除 `node_modules/@mingozhou/dsh-replay`：desktop **14.3 MB**、web **18.4 MB**（共 32.7 MB）
- **未删**的数据：`~/.dsh/storages/tools/{patch-replay-pricing.mjs, patch-replay-thinking.mjs, README-replay-pricing.md, replay-all-patches.mjs}` —— 这些是当年给 replay 打补丁的脚本，插件没了就没用了，但留着不占运行成本
- 生效条件：**必须重启 dsh 进程**（node_modules 变化不参与 HMR）

## 顺带查清的两个同类悬案（用证据，不是猜）
### 1) `@deepseek-ai/dsh-hooks-claude-code` —— 事实上没在工作
- 配置：`profiles/desktop/cordis.patch.yml:1320` insert 行，`configPath: D:/daily-kit/hooks/hooks.json`
- hooks.json 里只有一个 `Stop` hook → `dsh-stop.cmd` → `dsh-stop.sh`（session 结束对 workspace 做 git snapshot + quota 检查）
- **`D:/daily-kit/hooks/stop-hook.log` 最后一条 = 2026-09-27 10:38**（25 天没触发）；`headless-wrap.log` 同样停在 09-27
- `~/.dsh/logs/host-stdio.log` 里 `hooks-claude-code` 出现 **0 次**
- `~/.claude/` 下没有 settings.json / hooks.json（与 Claude Code 本体无关，只是沿用它的 hooks 格式）
⇒ 结论：Stop hook 自 9-27 之后再没跑过；其功能（workspace 快照）与现在的 autocommit + GitHub 备份重叠

### 2) `@deepseek-ai/dsh-tool-ralph` —— 一次都没被调用过
用主力会话导出（`session-a0d5fbf8`，275 turns / 5520 次工具调用）统计：
```
bash 4790  str_replace_editor 256  compress 145  memory_remember 131  web_search 45
subagent 4  workflow 5  ...  ralph 0
```
⇒ ralph 是唯一零调用的工具。

## 决策待定（等用户点头）
hooks-claude-code 与 tool-ralph：A 显式保留 pin 版本 / **B 跟随官方删掉**（ralph 可换新版 `experimental-ralph-bundle`）。我的建议是 B。

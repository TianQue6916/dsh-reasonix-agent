---
id: mem-fc7bb8380e62c8f2375b571d147c8803
revision: 1
created_at: "2026-10-03T10:13:57.611Z"
updated_at: "2026-10-03T10:13:57.611Z"
name: dsh-thinking-guard-name-scope-fix-20261003
description: "thinking-guard `failed to import` 真根因 = 包内 patch row 用裸名而真包名带 scope；修法在 node_modules 源头那份，不能改 profile row"
metadata:
  type: user
  fact_type: reference
  scope: global
---

**thinking-guard `failed to import` 真根因（2026-10-03 定位并修复）**

症状：新 web 进程日志 `thinking-guard (dsh-thinking-guard): failed to import`，而同进程 `dsh --profile web --dump-config` exit=0 / stderr 0 B ⇒ **「patch row 合成成功」≠「模块能 import」**；旧的「dump-config 过就算修好」判据不足。

根因：`@ethanwong-hk/dsh-thinking-guard@1.0.2` 包自带 `cordis.patch.yml` 写 `name: 'dsh-thinking-guard'`（裸名），真包名带 scope。dsh 从 profile 目录按模块名 resolve ⇒ `ERR_MODULE_NOT_FOUND` ⇒ `entry.fiber === undefined` ⇒ 报错。产出点 `…/@deepseek-ai/dsh-app-boot/lib/index.js:3910`（原始错误被该分支吞掉）。
证据（在 `C:\Users\27063\.dsh\profiles\web` 下）：`node -e "import('dsh-thinking-guard')"` ❌ ERR_MODULE_NOT_FOUND；`import('@ethanwong-hk/dsh-thinking-guard')` ✅；目录下只有 `node_modules/@ethanwong-hk/dsh-thinking-guard`；对照 `import('dsh-mnemon')` ✅（真名本就无 scope 的包用裸名才对）。

**不能改 profile 的 patch row**：profile patch 按 (id, name) 匹配已有 entry，改 name 会让 dsh 直接 `patch: name mismatch for "thinking-guard" (expected "dsh-thinking-guard", got "@ethanwong-hk/..."), skipping`。必须改源头那份文件。

修复：`~/.dsh/profiles/web/node_modules/@ethanwong-hk/dsh-thinking-guard/cordis.patch.yml` 把 `name: 'dsh-thinking-guard'` → `name: '@ethanwong-hk/dsh-thinking-guard'`（928→942 B）。脚本 `~/.dsh/storages/tools/patch-thinking-guard-name.py`（--check/--apply/--verify/--restore，幂等，state `~/.dsh/storages/thinking-guard-name-patch.json`）；说明 `~/.dsh/patches/README-thinking-guard-name.md`；已记入 `~/.dsh/PLAN.md`。

双验证：① `dsh --profile web --dump-config` exit=0 / stderr 0 B；② **隔离实例实测**（不用等用户重启）：`nohup dsh --profile web --port 3099 --no-open > logs/dsh-web-3099.out.log 2> logs/dsh-web-3099.err.log &` → 30 s 后 out 日志仅 1 行 token URL、err **0 B**、无 `failed to import`（对照 3080 旧日志两者都有）。

坑：target 在 node_modules ⇒ 任何 `pnpm install` 覆盖它，需重跑 `--apply`。desktop 无此包（`profiles/desktop/node_modules/@ethanwong-hk/` 不存在）。另注意区分同形日志 `patch: entry "thinking-guard" not found`（悬空 patch row，另一个原因，10-01 bundles 精简误删包造成）。

截至 2026-10-03：修复已落但**生产 3080 进程（14:39:11 起）仍是旧状态，需一次 web 重启才生效**。

---
id: mem-d5c77ba78fbb84c2d0845be9871dd857
revision: 2
created_at: "2026-11-16T08:55:39.560Z"
updated_at: "2026-11-16T09:09:30.820Z"
name: dsh-local插件声明改仓库内相对路径-2026-11
description: "四个 dsh 本地插件从 D: 绝对路径迁到 ~/.dsh/plugins/ + link: 相对声明，D 盘改 junction；含\"依赖声明静默丢失\"坑"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 结论（2026-11-16 完成并验证）

dsh 的双端插件差异**不是配置漂移**，是「声明层同步、实现层不同步」的必然结果：
- `~/.dsh` 是 git 仓库，`**/node_modules/` 被 `.gitignore:30` 排除
- 声明层（`profiles/<p>/package.json` 的 `dependencies` + `dsh.profile.bundles`、`pnpm-lock.yaml`、`cordis.patch.yml`）随 git 双向同步
- 实现层（`node_modules/`）各端各自 `pnpm install`

### 已完成：四个本地插件全部收敛到仓库内相对路径
源码真身都在 `~/.dsh/plugins/<name>/`（均无外部 dependencies，自包含纯 JS）：

| 包 | 旧声明 | 新声明 |
|---|---|---|
| `@local/dsh-plugin-fetch-file` | `file:D:/Toolbox/dsh-plugin-fetch-file` | `link:../../plugins/dsh-plugin-fetch-file` |
| `@local/dsh-plugin-goat-panel` | `link:D:/Toolbox/goat-gateway/dsh-plugin-goat-panel` | `link:../../plugins/dsh-plugin-goat-panel` |
| `@local/dsh-thinking-language` | `file:D:/Toolbox/dsh-thinking-language` | `link:../../plugins/dsh-thinking-language` |
| `dsh-plugin-local-search` | `link:D:/Toolbox/goat-gateway/dsh-plugin-local-search` | `link:../../plugins/dsh-plugin-local-search` |

三个 profile（desktop / web / headless）全部改；headless 只有 fetch-file + local-search。
D 盘四个原路径已改为 **junction** 指回 `C:\Users\27063\.dsh\plugins\<name>`（旧编辑路径仍可用），原目录改名 `*.moved-20261116-*` 留底。
`grep -nE '"(file|link):[A-Za-z]:' profiles/*/package.json` 现在零命中。

### 重要坑：dependencies 声明会静默丢失
`dsh-plugin-local-search` 的 dep 行曾自行消失（只剩 `dsh.profile.bundles` 里有名字），desktop 仅靠 `node_modules/dsh-plugin-local-search -> /d/Toolbox/...` 这个 2026-10-29 的**孤儿 symlink** 活着 —— 任何一次 pnpm 清理都会让插件静默消失，且不报错。消失原因**未确认**（16:52–16:55 之间，非我的替换，未找到写入脚本）。已在本次补回三 profile 的声明。若重启后又消失，说明有活跃写入者，届时锁定。

### local-search 真身判定
D 盘那份更新（index.js 51900 vs 48716 字节、cordis.patch.yml 4867 vs 4728、selftest 18004 vs 17637，mtime 2026-11-09 01:35 vs 2026-10-25 23:12），故以 D 盘覆盖仓库旧快照。它 patch 只 insert 一个 `local-wiki-github` 条目，是 provider 型插件；当前会话 tools=97 里未观测到它提供的工具（web_search 走 deepseek-official）。

### 机制发现
改完 `package.json` 后 **dsh 自带流程约 1 分钟内自动跑 `pnpm install`**（lockfile specifier 与 node_modules symlink 自动收敛），不需要手工安装。手工建的 junction 会被 pnpm 换成 symlink，这是正确终态。

### 验证
`~/.dsh/.learn/run/verify-local-plugins.mjs`（不入库，`.learn/run/` 被 gitignore）：四包 × 三 profile × 四层（声明 `link:../../plugins/` / 源目录 / node_modules 可解析 / 在 bundles）全绿，resolve 全部落在 `.../plugins/<name>/`。

git：`83ada196`（三插件声明）+ `3050c142`（auto(misc) 带入源码）+ `eb8abf41`（local-search）。pre-commit 有「主题域」hook，跨 `plugins/`+`profiles/` 时用 `--no-verify`（hook 自己给的出口），拆分会留下不可加载的中间态。`dsh-autocommit` 每 5 分钟按域提交，会抢在手工 commit 前，必要时先 commit 再操作。

### 遗留
- `pnpm-lock.yaml` 里暂无 local-search 条目，dsh 下次 install 自动补，不影响运行。
- 桌面端运行进程仍是旧模块，重启后才从新路径加载。

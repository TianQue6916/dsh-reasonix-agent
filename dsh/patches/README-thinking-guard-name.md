# thinking-guard `failed to import` — 根因与修复

日期：2026-10-03 · 适用：dsh 0.2.0-rc.2 · profile: web

## 症状

新起的 web 进程 stdout 里：

```
dsh: warning: 1 entry did not activate
thinking-guard (dsh-thinking-guard): failed to import
```

而同进程 `dsh --profile web --dump-config` **exit=0、stderr 0 字节**，config 里那一行完整存在。
⇒ 「patch row 合成成功」**不等于**「模块能被 import」。旧的「dump-config 通过就算修好」判据是错的。

## 根因

`@ethanwong-hk/dsh-thinking-guard@1.0.2` 包自带一份 `cordis.patch.yml`，里面写的是**裸名**：

```yaml
name: 'dsh-thinking-guard'
```

但该包的真实包名带 scope：`@ethanwong-hk/dsh-thinking-guard`。
dsh 从 profile 目录 resolve 这个 name 时用的是模块解析（`import('dsh-thinking-guard')`），
Node 在 `profiles/web/node_modules/` 下找不到（那里只有 `@ethanwong-hk/dsh-thinking-guard`），
于是 entry 的 `fiber` 建不起来。

报错文本的产出点：`…/@deepseek-ai/dsh-app-boot/lib/index.js:3910`，触发条件是 `entry.fiber === undefined`
—— 它只报「failed to import」，**原始错误（ERR_MODULE_NOT_FOUND）被这个分支吞掉了**，所以从日志里看不到真因。

### 证据

在 `C:\Users\27063\.dsh\profiles\web` 下：

| 命令 | 结果 |
|---|---|
| `node -e "import('dsh-thinking-guard')"` | ❌ `ERR_MODULE_NOT_FOUND` |
| `node -e "import('@ethanwong-hk/dsh-thinking-guard')"` | ✅ `['apply','detectDegenerate','inject','name']` |
| `node -e "import('dsh-mnemon')"` | ✅（对照：真名本就无 scope 的包用裸名才对） |
| `ls node_modules/dsh-thinking-guard` | No such file（只有 `@ethanwong-hk/` 下那份） |

### 为什么不能改 profile 的 patch row

先试过在 `~/.dsh/profiles/web/cordis.patch.yml` 那条 row 后面补 `name: "@ethanwong-hk/dsh-thinking-guard"`，dsh 直接拒绝：

```
dsh: [...web\cordis.patch.yml] patch: name mismatch for "thinking-guard"
     (expected "dsh-thinking-guard", got "@ethanwong-hk/dsh-thinking-guard"), skipping
```

profile patch 是按 **(id, name)** 匹配已有 entry 的；entry 的 name 来自 `dsh.bundle.patch` 指向的那份文件。
所以要改 **entry 自己的名字**，只能改源头 —— 包内那份 `cordis.patch.yml`。该改动已 `--restore` 干净回滚。

## 修复

target：`~/.dsh/profiles/web/node_modules/@ethanwong-hk/dsh-thinking-guard/cordis.patch.yml`

```diff
- name: 'dsh-thinking-guard'
+ name: '@ethanwong-hk/dsh-thinking-guard'
```

928 → **942 B**。备份：`cordis.patch.yml.bak-20261003-180939-pre-scope-name`。

脚本：`~/.dsh/storages/tools/patch-thinking-guard-name.py`
（`--check` / `--apply` / `--verify` / `--restore` / `--dumpconfig`，幂等、自动备份、state 落
`~/.dsh/storages/thinking-guard-name-patch.json`）

```bash
python ~/.dsh/storages/tools/patch-thinking-guard-name.py --check     # status applied / OLD 0 / NEW 1
python ~/.dsh/storages/tools/patch-thinking-guard-name.py --apply     # 幂等：已是目标状态则跳过
python ~/.dsh/storages/tools/patch-thinking-guard-name.py --verify    # PASS
```

## 验证（两条，都过）

1. **config 侧**：`dsh --profile web --dump-config` → exit=0、stderr 0 字节（此前有 name mismatch 警告）；
   stdout 变成 `# == @ethanwong-hk/dsh-thinking-guard, patched by …web\cordis.patch.yml` /
   `- id: thinking-guard` / `name: '@ethanwong-hk/dsh-thinking-guard'`。
2. **隔离实例实测**（不用等用户重启）：

```bash
nohup dsh --profile web --port 3099 --no-open > logs/dsh-web-3099.out.log 2> logs/dsh-web-3099.err.log &
```

   30 秒后 `dsh-web-3099.out.log` **只有一行**（`dsh web: http://127.0.0.1:3099/?token=…`），
   `dsh-web-3099.err.log` **0 字节**，**没有** `1 entry did not activate`、**没有** `failed to import`。
   对照：3080 那份旧日志两者都有。收尾 `taskkill //PID <pid> //F` + `netstat` 复核端口已释放。

## 注意事项

- **target 在 `node_modules/` 里** ⇒ 对该 profile 跑任何 `pnpm install` 都会覆盖它，需重跑 `--apply`
  （脚本幂等，重复跑无害）。
- desktop 侧无需处理：`profiles/desktop/node_modules/@ethanwong-hk/` **不存在**，
  `find profiles -maxdepth 4 -type d -name dsh-thinking-guard` 只命中 web 那一份。
- 本次修好后仍需**一次真实 web 重启**（3080 那条进程）才会在生产上生效。
- 注意区分另一类同形日志：`patch: entry "thinking-guard" not found`（那是悬空 patch row，
  10-01 bundles 精简误删包留下的）—— 与本条 `failed to import` 原因不同。

## 回滚

```bash
python ~/.dsh/storages/tools/patch-thinking-guard-name.py --restore
```

## 相关

- `~/.dsh/patches/README-dsh-context-pricing.md`
- `~/.dsh/patches/README-maxtokens-notice.md`
- `~/.dsh/patches/README-message-edit-pr7.md`

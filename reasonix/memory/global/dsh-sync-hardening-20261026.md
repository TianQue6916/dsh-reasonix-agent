---
id: mem-fbac6fee1bd71988beb4b838bc86cda9
revision: 1
created_at: "2026-10-26T12:55:41.837Z"
updated_at: "2026-10-26T12:55:41.837Z"
name: dsh-sync-hardening-20261026
description: "dsh 双机同步加固：告警/双向镜像/本机覆盖/依赖自检/日志轮转 5 项落地"
metadata:
  type: user
  fact_type: project
  scope: global
---

## 2026-10-26 落地的 5 项

| # | 修复 | 位置 | 验证 |
|---|---|---|---|
| ⑥ | **失败告警**：写 `~/.dsh/logs/sync-FAILED.json`（含 at/rc/tail）+ `notify-send -u critical`；成功则删 marker | `sync_dsh_cron.sh` | printf 出的 JSON 经 `json.load` 校验合法 |
| ② | **双向 PLAN 镜像**：`PEER_MIRRORS`（拉对端 PLAN 到 `~/.dsh/peers/win/`）+ `PEER_PUSH`（推本机 PLAN 到对端 `peers/linux/`） | `sync_dsh.py` L69 / L220 | dry-run 同时输出 `peer-mirror win/PLAN.md` 与 `peer-push linux/PLAN.md` |
| ④ | **本机覆盖钩子**：主脚本 main() 之前 exec `sync_dsh_local.py`（该文件已进 EXCLUDE_FILES，各机自维护）；附 `.example` 模板 | `sync_dsh.py` 尾部 | 文件不存在时静默跳过 |
| ⑤ | **依赖自检**：import sync_reasonix 之前先 import paramiko，缺失时打印可执行修复命令并 `SystemExit(2)`，不抛原始 Traceback | `sync_dsh.py` | `python3 -S` 模拟缺依赖，输出三行中文提示 |
| ⑦ | **日志轮转**：>5 MB 时 `tail -n 2000` 重写 | `sync_dsh_cron.sh` | `bash -n` 通过 |

## 仍开着的 2 项
1. **同步只有 Linux 侧发起**：Windows `schtasks` 无任何 sync 任务；Linux 关机则 Windows 变更永不外发
2. **16 个内容冲突**：`.agent-presets/*.mjs`(5)、`storages/tools/*`(4)、`global/*.md`(3) 等，内容真不同，排除无解，该走 Git 或人工合并

## 写 Python 改 shell 脚本的教训
用 `python3 -c` / heredoc 里拼 shell 命令时，`\\n` 经 Python 字符串求值后会变成**真实换行**写进文件，把 `printf '{"at":"%s"}\n'` 和 `tr '\n' ' '` 撕成多行 → `SyntaxError: unterminated string literal`。
**可靠做法**：把要插入的块先 `cat > /tmp/block <<'EOF' ... EOF`（带引号的 heredoc 不展开），再用 Python 读文件插入。

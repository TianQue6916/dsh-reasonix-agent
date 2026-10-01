#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync_dsh.py — ~/.dsh 双机双向同步（TianQue Linux ↔ 天阙九泉 Windows）

为什么存在（2026-09-30 用户拍板）
  主力已从 reasonix 转到 dsh，双机同步的根目录也应跟着换：reasonix 那套
  (sync/sync_reasonix.py) 同步 ~/.reasonix，已按用户要求停用其 cron。
  本脚本是它的**同源弟弟**：复用同一份 Syncer（传输/冲突逻辑一字不改），
  只换根目录与文件集，所以两台机器的行为差异只有「同步哪些文件」。

同步策略（与 reasonix 版一致）
  - 双向合并：一方独有 → 复制到另一方
  - 冲突（同名且内容不同）→ **双方都保留**，对方版本存为
    <name>.conflict.<host>.<hash>.bak，绝不覆盖
  - .conflict.*.bak 本身不参与同步（防嵌套套娃）

同步什么：只同步「手写的 source of truth」
  ~/.dsh 里同一份 .gitignore 已经把「手写配置 vs 派生数据」分好了类，
  这里沿用同一套判断（见下方 EXCLUDE_*），核心排除：
  sessions / storages 运行态 / node_modules / 凭据 / 日志 / 缓存 / 本机回滚快照。

已知局限（务必知道）
  Syncer 的冲突判定是「size 相同即视为相同」。所以**改动前后字节数完全一致的
  编辑不会传播**。dsh 配置里这种情况真实存在（例如状态文件 zh→en 是等长）。
  要传这类改动，先把文件大小改到不同（加个空格/注释）再同步。

用法（在 Linux 侧执行）
  python3 ~/.dsh/storages/tools/sync_dsh.py --dry-run   # 只报告，不写任何文件
  python3 ~/.dsh/storages/tools/sync_dsh.py --sync      # 真同步
  python3 ~/.dsh/storages/tools/sync_dsh.py --verify    # 只比对文件数/差异数

依赖: pip install paramiko；ssh 27063@100.84.67.49 可达（Tailscale）
"""
import argparse
import os
import re
import sys
import time

REASONIX_SYNC = os.path.expanduser('~/.reasonix/global-workspace/sync')
sys.path.insert(0, REASONIX_SYNC)
import sync_reasonix as R  # noqa: E402  —— 复用 Syncer / HOST / USER / PASS

LOCAL_ROOT = os.path.expanduser('~/.dsh')
WIN_ROOT = r'C:\Users\27063\.dsh'

# ── 额外目录对：Windows 侧的真身不在 ~/.dsh 里 ────────────────────────────
# 2026-10-01 实测的链接拓扑。**必须显式列出**，因为 os.walk 不跟随 junction：
#   ~/.dsh/skills       → Junction → %APPDATA%\reasonix\skills   （真身在 APPDATA）
#   ~/.reasonix/memory  → Junction → %APPDATA%\reasonix\memory   （真身在 APPDATA）
#   ~/.reasonix/skills  → 真实目录（APPDATA 那份的冗余副本）
# 漏掉它们的后果是**静默的**：Linux 的 ~/.dsh/skills 长期为 0，memory 也只有旧的 225 条。
EXTRA_PAIRS = [
    # (Linux 侧路径, Windows 侧真实路径)
    (os.path.expanduser('~/.dsh/skills'),
     r'C:\Users\27063\AppData\Roaming\reasonix\skills'),
    (os.path.expanduser('~/.reasonix/memory'),
     r'C:\Users\27063\AppData\Roaming\reasonix\memory'),
]

# ── 排除目录（相对任意层级，按名字匹配）─────────────────────────────────
R.EXCLUDE_DIRS = {
    # 运行期 / 可重建
    'node_modules', '.git', '__pycache__', '.venv', 'venv',
    'sessions', 'cache', 'attachments', 'gate', 'logs', 'scratch', 'tmp-probe',
    'session_projcache', 'backups',
    # 插件市场与插件管理器的本机状态
    '.dsh-market', '.plugin-manager',
    # 微信桥：daemon 端口 / 账号 / context-token 全是本机凭据与运行态，绝不跨机
    'wechat-bridge',
    # 传输层凭据
    'remote',
    # 技能目录里的噪声归档（skill-root-consolidate.py 的产物：冲突副本 / HISTORY 快照）。
    # 那是**本机**的可追溯痕迹，不跨机，否则每台机器都会收到对方 1.8 MB 的历史垃圾。
    '.trace-archive',
    # 本机回滚快照（profiles/**/_bak-*, _backup*, _archived*, _dropped*）
    # 用一个前缀规则覆盖 → 见 _excluded_dir 的 override
}

# ── 排除文件名 ────────────────────────────────────────────────────────
R.EXCLUDE_FILES = {
    # 凭据：绝不跨机
    '.credentials.yaml', '.credentials.yml', '.env', '.env.example',
    'local-search-token', '.anonymous-user-id',
    # 运行期状态
    'dsh-headroom-ccr.json', 'git-anchors.json', 'mnemon-draft.json',
    'plugins.json', 'workspace.json', 'session_projcache.json',
    'settings.new.yaml', 'pnpm-lock.yaml',
    # 机器级 user patch 层：根 cordis.patch.yml 里是绝对路径与平台专有二进制
    # （deja.exe / C:\Users\... 之类），跨机同步只会把一台机器的路径灌到另一台。
    # 2026-09-30 实测过这个坑：两边都是 522 B 且内容相同 → 被「size 相同即视为相同」
    # 规则判成一致，既没同步也没报冲突，于是 Linux 上带着一条 win-amd64 的 .exe 路径。
    # 各机自己维护，见 Linux 侧该文件里的说明。
    'cordis.patch.yml',
}

# ── 排除后缀 ──────────────────────────────────────────────────────────
R.EXCLUDE_SUFFIXES = (
    '.log', '.lock', '.zstd', '.sqlite', '.sqlite3', '.db',
    '.pyc', '.ps1',                      # .ps1 是 Windows-only 工具，Linux 不需要
    '.bak',                              # 本机回滚产物；git（Windows 侧）已有历史
)

# 最近 30 秒内动过的文件视为「正在被写」，跳过（本机 autocommit / 会话抖动）
R.ACTIVE_SKIP = 30

# 同步工具自身：本地为源，直接覆盖远端
R.TOOL_FILES = {
    'storages/tools/sync_dsh.py',
    'storages/tools/sync_dsh_cron.sh',
}

_orig_excluded_dir = R._excluded_dir


def _excluded_dir(name):
    """在 reasonix 规则之上，再排除所有下划线开头的目录（_bak-* / _backup* / _tmp 等）。"""
    if name.startswith('_'):
        return True
    return _orig_excluded_dir(name)


R._excluded_dir = _excluded_dir

# ── 回滚快照不进同步 ──────────────────────────────────────────────────
# 形如 x.mjs.bak-20260930-2128-pre-maxtok-ceiling / x.ps1.old-20260810 的文件是**本机**
# 回滚产物：双向同步它们只会来回搬运噪声，并在两边各自产生一堆 .conflict 副本。
# Windows 那侧的 git 仓库已经保存了同一份历史，Linux 不需要第二份。
# 做法是包一层 walk：**两侧同时**过滤，否则「只有一侧有」会被判成独有文件而照样传输。
_BACKUP_MARKERS = ('.bak', '.old-')

# ── 机器本地：按**路径**排除，不能用 basename ──────────────────────────
# profile 安装清单（bundle 列表 + pnpm 设置）天然按机器走：Windows 侧写的是
# file:D:/Toolbox/... 与仅 Windows 装的插件，Linux 侧没有 desktop 档、没有
# deja / wechat-bridge。同步它们只会每轮产出固定的几个 .conflict 副本 ——
# 属于**结构性差异**而非偶发分歧，所以归为机器本地。
# 注意必须按路径匹配：EXCLUDE_FILES 是 basename 匹配，写成 'package.json' 会连
# plugins/**/package.json（真正的源码）一起排掉。
_MACHINE_LOCAL_RE = re.compile(r'^profiles/[^/]+/(package\.json|pnpm-workspace\.yaml|pnpm-lock\.yaml)$')


def _is_machine_local(rel):
    return bool(_MACHINE_LOCAL_RE.match(rel))


def _is_backup(rel):
    return any(m in os.path.basename(rel) for m in _BACKUP_MARKERS)


def _filter(mapping):
    return {k: v for k, v in mapping.items()
            if not _is_backup(k) and not _is_machine_local(k)}


_orig_walk_local = R.Syncer.walk_local
_orig_walk_win = R.Syncer.walk_win
R.Syncer.walk_local = lambda self, root, skip_active=False: _filter(
    _orig_walk_local(self, root, skip_active))
R.Syncer.walk_win = lambda self, root, skip_active=False: _filter(
    _orig_walk_win(self, root, skip_active))


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--dry-run', action='store_true', help='只报告差异，不写任何文件')
    g.add_argument('--sync', action='store_true', help='执行双向同步')
    g.add_argument('--verify', action='store_true', help='只比对文件数与差异数')
    args = ap.parse_args()

    dry = args.dry_run or args.verify
    t0 = time.time()
    syncer = R.Syncer()
    R.log(f'根目录 {LOCAL_ROOT}  ↔  {WIN_ROOT}  模式={"dry-run" if args.dry_run else ("verify" if args.verify else "sync")}')

    if dry:
        real_sftp = syncer.sftp
        real_sftp.put = lambda src, dst, **k: R.log(f'      [dry] PUT   {os.path.basename(dst)}')
        real_sftp.get = lambda src, dst, **k: R.log(f'      [dry] GET   {os.path.basename(src)}')

    try:
        syncer.sync_dir_pair(LOCAL_ROOT, WIN_ROOT, skip_active=True)
        # 真身不在 ~/.dsh 里的目录（junction 目标）单列，见文件顶部 EXTRA_PAIRS 的说明
        for local_dir, win_dir in EXTRA_PAIRS:
            if not os.path.isdir(local_dir):
                os.makedirs(local_dir, exist_ok=True)
                R.log(f'  本地新建 {local_dir}')
            R.log(f'== 额外对 {os.path.basename(local_dir)}  ↔  {win_dir}')
            syncer.sync_dir_pair(local_dir, win_dir, skip_active=True)
        st = syncer.stats
        R.log(f'完成: 上传 {st["up"]} / 下载 {st["down"]} / 冲突 {st["conflict"]} / 相同 {st["same"]}'
              f'  用时 {time.time() - t0:.1f}s')
    finally:
        syncer.close()
    return 0


if __name__ == '__main__':
    sys.exit(main())

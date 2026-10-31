#!/usr/bin/env python3
"""star-audit.py — 「用了谁的开源」账本审计（2026-10-29 建）

本质：harness 只记录 tool call，不记录 attribution。本脚本补上「使用 → 归因」这一环。
三条探针（不同问题，别混）：
  1. package.json 的 repository 字段 —— 运行时真的加载了谁的代码（全局 npm + profiles/node_modules）
  2. ~/.dsh/profiles/*/cordis.patch.yml 的 plugin 声明 —— 谁给了我能力
  3. 本地 clone 的 .git/config remote —— 我读过/改过谁的源码

用法（Windows Git Bash / Linux 通用）：
  python star-audit.py           # 只审计，打印「已用未 star」
  python star-audit.py --star    # 顺带补 star（幂等，已 star 的跳过）

网络：走 curl 子进程，不走 python urllib —— 本机 python 的 CA bundle 缺 AKI 扩展，
对 api.github.com 报 SSLCertVerificationError（2026-10-29 实测），curl 正常。
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from pathlib import Path

HOME = Path.home()
CRED = HOME / ".dsh/.credentials.yaml"
LEDGER = HOME / ".dsh/contrib/star-ledger.jsonl"
CANON = HOME / ".dsh/contrib/canon-cache.json"   # package.json 里的名字可能已过期（仓库迁移/改名）
NPM_ROOT = Path(os.environ.get("APPDATA", "")) / "npm/node_modules"
PROFILE_NM = HOME / ".dsh/profiles/node_modules"
PROFILES = HOME / ".dsh/profiles"

REPO_RE = re.compile(r"github\.com[:/]+([\w.-]+/[\w.-]+?)(?:\.git)?(?:[/#?].*)?$")
# transitive 噪音：类型定义仓库，star 它们只会污染列表
SKIP_PREFIX = ("sindresorhus/", "jshttp/", "definitelytyped/", "types/")
SELF_OWNER = "tianque6916/"   # star 自己的仓库没有社会意义，只记账不点


def token() -> str:
    txt = CRED.read_text(encoding="utf-8", errors="replace")
    i = txt.find("dsh-mnemon/github")
    if i < 0:
        sys.exit("credentials 里没有 dsh-mnemon/github 记录")
    m = re.search(r"accessToken:\s*(\S+)", txt[i : i + 400])
    if not m:
        sys.exit("读不到 accessToken")
    return m.group(1)


def gh(url: str, method: str = "GET", tok: str = "") -> tuple[int, str]:
    cmd = ["curl", "-sS", "-L", "-m", "20", "-X", method,
           "-H", f"Authorization: Bearer {tok}", "-H", "User-Agent: dsh-star-audit",
           "-w", "\n%{http_code}", url]
    if method == "PUT":
        cmd += ["-H", "Content-Length: 0"]
    p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    body, _, code = p.stdout.rpartition("\n")
    return int(code or 0), body


def canonical(slug: str, tok: str, cache: dict) -> str:
    """把 package.json 里写的仓库名解析成 GitHub 现在的 full_name。

    例：Microsoft/vsce 已迁到 microsoft/vscode-vsce，直接 PUT 会 307，
    star 落在新仓库上，用旧名字复查永远是 404 —— 这台机器上真实踩过。
    """
    if slug in cache:
        return cache[slug]
    code, body = gh(f"https://api.github.com/repos/{slug}", "GET", tok)
    name = slug
    if code == 200:
        try:
            name = json.loads(body)["full_name"]
        except Exception:
            pass
    cache[slug] = name
    return name


def probe_packages() -> dict[str, set[str]]:
    """owner/repo -> {证据包名}"""
    out: dict[str, set[str]] = {}
    roots = [r for r in (NPM_ROOT, PROFILE_NM) if r.is_dir()]
    for root in roots:
        pats = [root.glob("*/package.json"), root.glob("@*/*/package.json")]
        for pat in pats:
            for pkg in pat:
                try:
                    d = json.loads(pkg.read_text(encoding="utf-8", errors="replace"))
                except Exception:
                    continue
                r = d.get("repository")
                r = r.get("url", "") if isinstance(r, dict) else (r or "")
                m = REPO_RE.search(r.replace("git+", ""))
                if not m:
                    continue
                slug = m.group(1).removesuffix(".git").lower()
                if slug.startswith(SKIP_PREFIX):
                    continue
                slug = m.group(1).removesuffix(".git")
                # direct = 我们主动装的（全局 npm 顶层、dsh 插件）；其余视作 dsh 的依赖树
                name = d.get("name") or ""
                is_direct = root == NPM_ROOT or name.startswith("dsh-plugin-") or name.startswith("@local/")
                out.setdefault(slug, set()).add(f"{d.get('name')}@{d.get('version')}" + ("" if is_direct else " [transitive]"))
    return out


def probe_plugins() -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    for f in PROFILES.glob("*/cordis.patch.yml"):
        if ".bak" in f.name:
            continue
        for line in f.read_text(encoding="utf-8", errors="replace").splitlines():
            m = re.search(r"github\.com/([\w.-]+/[\w.-]+)", line)
            if m:
                out.setdefault(m.group(1), set()).add(f"plugin:{f.parent.name}")
    return out


def probe_clones() -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    for cfg in HOME.glob("**/.git/config"):
        if "node_modules" in cfg.parts or len(cfg.parts) > 8:
            continue
        try:
            u = subprocess.run(["git", "config", "-f", str(cfg), "--get", "remote.origin.url"],
                               capture_output=True, text=True, timeout=10).stdout.strip()
        except Exception:
            continue
        m = REPO_RE.search(u)
        if m:
            out.setdefault(m.group(1).removesuffix(".git"), set()).add(f"clone:{cfg.parent}")
    return out


def starred(tok: str) -> set[str]:
    got: set[str] = set()
    for page in range(1, 4):
        code, body = gh(f"https://api.github.com/user/starred?per_page=100&page={page}", "GET", tok)
        if code != 200:
            sys.exit(f"取 starred 失败: http={code}")
        rows = json.loads(body)
        got |= {r["full_name"] for r in rows}
        if len(rows) < 100:
            break
    return got


def main() -> int:
    do_star = "--star" in sys.argv
    tok = token()
    used: dict[str, set[str]] = {}
    src: dict[str, set[str]] = {}
    for name, fn in (("npm", probe_packages), ("plugin", probe_plugins), ("clone", probe_clones)):
        for slug, ev in fn().items():
            used.setdefault(slug, set()).update(ev)
            src.setdefault(slug, set()).add(name)
    have = {h.lower() for h in starred(tok)}
    cache = json.loads(CANON.read_text(encoding="utf-8")) if CANON.is_file() else {}
    fresh = {}
    for slug in used:
        if slug.lower() not in have:
            fresh[slug] = canonical(slug, tok, cache)
    CANON.write_text(json.dumps(cache, ensure_ascii=False, indent=0), encoding="utf-8")
    # canonical 改名后，used 与 src 两个 dict 的 key 必须同步重映射，否则 is_direct 查不到
    new_used, new_src = {}, {}
    for slug_name, ev in used.items():
        k = fresh.get(slug_name, slug_name)
        new_used.setdefault(k, set()).update(ev)
        new_src.setdefault(k, set()).update(src[slug_name])
    used, src = new_used, new_src
    def is_direct(slug: str) -> bool:
        if "plugin" in src[slug] or "clone" in src[slug]:
            return True
        return any("[transitive]" not in e for e in used[slug])

    show_all = "--all" in sys.argv
    missing_all = [s for s in sorted(used) if s.lower() not in have and not s.lower().startswith(SELF_OWNER)]
    missing = missing_all if show_all else [s for s in missing_all if is_direct(s)]
    print(f"本地用到 {len(used)} 个仓库 | 已 star {len(have)} | 未 star 合计 {len(missing_all)} | 其中 direct {len([s for s in missing_all if is_direct(s)])}")
    print("--- 未 star（direct：我们主动装的 / clone 的 / 插件）---")
    for s in missing:
        print(f"  - {s:45s} [{','.join(sorted(src[s]))}]  {sorted(used[s])[0]}")
    if not show_all:
        rest = [s for s in missing_all if not is_direct(s)]
        print(f"--- 另有 {len(rest)} 个 transitive（dsh 依赖树，默认不 star，--all 可见）---")
    if do_star and missing:
        added = 0
        for s in missing:
            code, _ = gh(f"https://api.github.com/user/starred/{s}", "PUT", tok)
            ledger_line = {"repo": s, "action": "star", "http": code,
                           "evidence": sorted(used[s]), "source": sorted(src[s])}
            with LEDGER.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(ledger_line, ensure_ascii=False) + "\n")
            if code == 204:
                added += 1
            print(f"  PUT {s} -> {code}")
        print(f"newly starred: {added}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

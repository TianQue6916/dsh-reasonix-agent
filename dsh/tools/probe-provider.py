#!/usr/bin/env python3
"""probe-provider — 零 token 的 provider 连通性体检。

铁律：本脚本**只发 GET**。/models 之外不发任何 POST；绝不触发 chat completion。
（实测教训：本地 gateway 不校验 client key，「坏 key 401」探针会被 gateway
用自己的上游 key 转发成一次真实生成 —— 那是付费探针，不是零成本探针。）

分层：L0 DNS -> L1 TCP -> L2 TLS -> L3 HTTP(/models) -> L4 声明的 model 是否存在
用法：python ~/.dsh/tools/probe-provider.py [--profile web] [--json]
"""
from __future__ import annotations
import json, os, re, socket, ssl, sys, time, urllib.error, urllib.request
from pathlib import Path

DSH_HOME = Path(os.environ.get("DSH_HOME") or Path.home() / ".dsh")


def load_patch(profile: str) -> str:
    for name in ("cordis.patch.yml", "cordis.yml"):
        p = DSH_HOME / "profiles" / profile / name
        if p.exists():
            return p.read_text(encoding="utf-8", errors="replace")
    raise SystemExit(f"no patch found for profile {profile!r}")


def extract_providers(text: str) -> dict:
    """patch 里有 `!!js` 自定义 tag（cordis.patch.yml:1583），safe_load 直接炸。
    先把 `!!js` 标签剥掉再 parse —— 我们只关心 providers 子树，那段的值都是普通标量。"""
    import yaml
    class _L(yaml.SafeLoader):
        pass
    # cordis.patch.yml:1583 有 `command: !!js process.execPath`，SafeLoader 无此 tag
    _L.add_multi_constructor("tag:yaml.org,2002:js", lambda l, suffix, node: None)
    docs = yaml.load(text, Loader=_L) or []
    out = {}
    for row in docs:
        cfg = (row or {}).get("config") or {}
        if not isinstance(cfg, dict):
            continue
        for pname, pdef in (cfg.get("providers") or {}).items():
            if not isinstance(pdef, dict):
                continue
            out[pname] = {
                "api": pdef.get("api"),
                "baseURL": pdef.get("baseURL"),
                "apiKeyEnv": pdef.get("apiKeyEnv"),
                "models": [m.get("id") for m in (pdef.get("models") or [])
                           if isinstance(m, dict) and m.get("id")],
            }
    return out


def probe(provider: str, cfg: dict) -> dict:
    base = cfg.get("baseURL") or ""
    r = {"provider": provider, "api": cfg.get("api"), "baseURL": base, "layers": {}}
    layers = r["layers"]
    m = re.match(r"^(https?)://([^/:]+)(?::(\d+))?(/.*)?$", base)
    if not m:
        layers["L0_dns"] = {"ok": False, "error": f"unparsable baseURL {base!r}"}
        return r
    scheme, host, port, path = m.group(1), m.group(2), m.group(3), m.group(4) or ""
    port = int(port) if port else (443 if scheme == "https" else 80)

    t0 = time.perf_counter()
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
        layers["L0_dns"] = {"ok": True, "ms": round((time.perf_counter() - t0) * 1000, 1),
                            "ips": sorted({i[4][0] for i in infos})}
    except Exception as e:
        layers["L0_dns"] = {"ok": False, "error": f"{type(e).__name__}: {e}"}
        return r

    t0 = time.perf_counter()
    try:
        sock = socket.create_connection((host, port), timeout=10)
        layers["L1_tcp"] = {"ok": True, "ms": round((time.perf_counter() - t0) * 1000, 1),
                            "peer": f"{host}:{port}"}
    except Exception as e:
        layers["L1_tcp"] = {"ok": False, "error": f"{type(e).__name__}: {e}"}
        return r

    if scheme == "https":
        t0 = time.perf_counter()
        try:
            ctx = ssl.create_default_context()
            with ctx.wrap_socket(sock, server_hostname=host) as ts:
                cert = ts.getpeercert() or {}
                layers["L2_tls"] = {"ok": True, "ms": round((time.perf_counter() - t0) * 1000, 1),
                                    "tls": ts.version(), "notAfter": cert.get("notAfter")}
        except Exception as e:
            layers["L2_tls"] = {"ok": False, "error": f"{type(e).__name__}: {e}"}
            try: sock.close()
            except Exception: pass
            return r
    else:
        sock.close()
        layers["L2_tls"] = {"ok": None, "note": "plain http — 跳过 TLS（本地 gateway 常态）"}

    # L3：唯一的上游零成本探针。GET /models 不产生任何 completion。
    url = base.rstrip("/") + "/models"
    req = urllib.request.Request(url, method="GET")
    key = os.environ.get(cfg.get("apiKeyEnv") or "")
    if key:
        req.add_header("Authorization", "Bearer " + key)
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read()
            ms = round((time.perf_counter() - t0) * 1000, 1)
            ids, payload_note = [], None
            try:
                data = json.loads(raw)
                items = data.get("data") if isinstance(data, dict) else data
                ids = [i.get("id") for i in (items or []) if isinstance(i, dict) and i.get("id")]
                payload_note = f"{len(ids)} models"
            except Exception:
                payload_note = f"non-json {len(raw)}B"
            layers["L3_http"] = {"ok": True, "status": resp.status, "ms": ms, "note": payload_note,
                                 "keyEnvSet": bool(key)}
    except urllib.error.HTTPError as e:
        layers["L3_http"] = {"ok": False, "status": e.code, "ms": round((time.perf_counter() - t0) * 1000, 1),
                             "note": e.read(200).decode("utf-8", "replace")[:200], "keyEnvSet": bool(key)}
        return r
    except Exception as e:
        layers["L3_http"] = {"ok": False, "error": f"{type(e).__name__}: {e}", "keyEnvSet": bool(key)}
        return r

    declared = [d for d in (cfg.get("models") or []) if d]
    upstream = set(ids)
    if upstream:
        missing = [d for d in declared if d not in upstream]
        layers["L4_models"] = {"ok": not missing, "declared": len(declared),
                               "upstream": len(upstream), "missing": missing}
    else:
        layers["L4_models"] = {"ok": None, "note": "上游未回模型清单，无法比对"}
    return r


def verdict(res: dict) -> str:
    L = res["layers"]
    if not L.get("L0_dns", {}).get("ok"):     return "FAIL dns"
    if not L.get("L1_tcp", {}).get("ok"):     return "FAIL tcp"
    if L.get("L2_tls", {}).get("ok") is False: return "FAIL tls"
    if not L.get("L3_http", {}).get("ok"):    return f"FAIL http {L['L3_http'].get('status', '?')}"
    l4 = L.get("L4_models", {})
    if l4.get("ok") is False:                 return f"MODEL MISSING {l4['missing']}"
    return "OK"


def main(argv: list[str]) -> int:
    profile = "web"
    if "--profile" in argv:
        profile = argv[argv.index("--profile") + 1]
    providers = extract_providers(load_patch(profile))
    if not providers:
        print("no providers found in patch"); return 2
    results = [probe(n, c) for n, c in providers.items()]
    if "--json" in argv:
        print(json.dumps(results, ensure_ascii=False, indent=2)); return 0
    for r in results:
        print(f"\n=== {r['provider']}  [{r['api']}]  {r['baseURL']}")
        for name, layer in r["layers"].items():
            bits = " ".join(f"{k}={v}" for k, v in layer.items() if k != "ok")
            mark = "OK  " if layer.get("ok") else ("--  " if layer.get("ok") is None else "FAIL")
            print(f"  {mark} {name:11s} {bits}")
        print(f"  => {verdict(r)}")
    print("\n[零 token 保证] 本次只发 GET /models，无任何 chat completion 请求。")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

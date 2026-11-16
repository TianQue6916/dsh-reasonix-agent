import socket, threading, os, datetime

LISTEN = ("0.0.0.0", 31182)
SIDECAR = ("127.0.0.1", 31181)
LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fwd_31182.log")

GOOGLE_SUFFIX = (
    ".google.com", ".gstatic.com", ".googleapis.com", ".googleusercontent.com",
    ".googlevideo.com", ".youtube.com", ".ytimg.com", ".ggpht.com", ".gvt1.com",
    ".gvt2.com", ".googleadservices.com", ".googlesyndication.com",
)

def is_google(h):
    h = h.lower().split(":")[0]
    if h in ("google.com", "www.google.com", "accounts.google.com", "gstatic.com"):
        return True
    return any(h.endswith(s) for s in GOOGLE_SUFFIX)

def log(m):
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write("%s %s\n" % (datetime.datetime.now().strftime("%H:%M:%S"), m))
    except Exception:
        pass

def relay(a, b):
    try:
        while True:
            d = a.recv(65536)
            if not d:
                break
            b.sendall(d)
    except Exception:
        pass
    finally:
        for s in (a, b):
            try: s.shutdown(socket.SHUT_RDWR)
            except Exception: pass
            try: s.close()
            except Exception: pass

def establish(c, host, port):
    """给客户端回 200，然后把 c 和远端裸对接（不做 MITM）"""
    try:
        up = socket.create_connection((host, port), timeout=8)
    except Exception as e:
        log("DIRECT %s:%s fail %s" % (host, port, type(e).__name__))
        try: c.sendall(b"HTTP/1.1 502 Bad Gateway\r\n\r\n")
        except Exception: pass
        try: c.close()
        except Exception: pass
        return
    try:
        c.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
    except Exception:
        try: up.close()
        except Exception: pass
        return
    threading.Thread(target=relay, args=(c, up), daemon=True).start()
    threading.Thread(target=relay, args=(up, c), daemon=True).start()

def handle(c, a):
    tag = "c%d" % a[1]
    try:
        c.settimeout(20)
        first = c.recv(8192)
    except Exception:
        try: c.close()
        except Exception: pass
        return
    if not first:
        try: c.close()
        except Exception: pass
        return
    line = first.split(b"\r\n", 1)[0].decode("latin-1", errors="replace")
    parts = line.split()
    method = parts[0] if parts else "?"

    if method == "CONNECT" and len(parts) >= 2:
        hp = parts[1]
        host, _, port = hp.partition(":")
        port = int(port or 443)
        if is_google(host):
            log("%s CONNECT %s:%d -> SIDECAR" % (tag, host, port))
            try:
                up = socket.create_connection(SIDECAR, timeout=8)
            except Exception as e:
                log("%s sidecar fail %s" % (tag, e))
                try: c.close()
                except Exception: pass
                return
            try:
                up.sendall(first)
            except Exception:
                pass
            threading.Thread(target=relay, args=(c, up), daemon=True).start()
            threading.Thread(target=relay, args=(up, c), daemon=True).start()
        else:
            log("%s CONNECT %s:%d -> DIRECT" % (tag, host, port))
            establish(c, host, port)
    else:
        # 明文 HTTP 绝对 URI
        log("%s %s -> DIRECT(raw)" % (tag, line[:80]))
        try:
            url = parts[1]
            from urllib.parse import urlsplit
            u = urlsplit(url)
            host = u.hostname
            port = u.port or 80
            path = u.path or "/"
            if u.query:
                path += "?" + u.query
            if is_google(host):
                log("%s http-abs google -> SIDECAR" % tag)
                try:
                    up = socket.create_connection(SIDECAR, timeout=8)
                    up.sendall(first)
                    threading.Thread(target=relay, args=(c, up), daemon=True).start()
                    threading.Thread(target=relay, args=(up, c), daemon=True).start()
                    return
                except Exception:
                    pass
            up = socket.create_connection((host, port), timeout=8)
            req = ("GET %s HTTP/1.1\r\n" % path).encode()
            rest = first.split(b"\r\n", 1)[1] if b"\r\n" in first else b""
            up.sendall(req + rest)
            threading.Thread(target=relay, args=(c, up), daemon=True).start()
            threading.Thread(target=relay, args=(up, c), daemon=True).start()
        except Exception as e:
            log("%s http fail %s" % (tag, e))
            try: c.close()
            except Exception: pass

s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(LISTEN); s.listen(256)
log("=== v3 SPLIT listening %s:%d (google->sidecar, rest->direct) ===" % (LISTEN))
while True:
    c, a = s.accept()
    c.settimeout(20)
    threading.Thread(target=handle, args=(c, a), daemon=True).start()

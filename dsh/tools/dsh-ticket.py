# dsh-ticket.py —— 局域网"取票页"
# 手机/平板只记 http://192.168.0.100:8080 ，它读 dsh web 启动日志里最新的 token 并 302 跳转。
# 为什么需要：token 只在进程启动时生成一次，重启就变；手工抄那串 43 字符极易抄错，
# 抄错的表现就是 `dsh web authentication required; reopen the URL printed by dsh web.`
# 实测 token 本身可复用（源码 authorizeIndex 只做 tokenMatches，无消费逻辑），所以重复打开无害。
import http.server, socketserver, re, os, datetime, sys

LOG  = os.path.expanduser(r"~\.dsh\logs\dsh-web-tailnet.out.log")
SELF = os.path.expanduser(r"~\.dsh\logs\dsh-ticket.log")
BIND = ("192.168.0.100", 8080)
TARGET = "http://192.168.0.100:3080"
PAT = re.compile(r"http://192\.168\.0\.100:3080/\?token=([A-Za-z0-9_\-]+)")

def log(msg):
    with open(SELF, "a", encoding="utf-8") as f:
        f.write(f"[{datetime.datetime.now():%Y-%m-%d %H:%M:%S}] {msg}\n")

def latest_token():
    try:
        with open(LOG, encoding="utf-8", errors="replace") as f:
            found = PAT.findall(f.read())
        return found[-1] if found else None
    except FileNotFoundError:
        return None

class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        t = latest_token()
        if not t:
            self.send_response(503)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write("dsh web 还没起好，10 秒后再刷一次".encode("utf-8"))
            return
        self.send_response(302)
        self.send_header("Location", f"{TARGET}/?token={t}")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        log(f"302 -> {t[:8]}… from {self.client_address[0]}")
    def log_message(self, *a): pass

def main():
    import ctypes
    ctypes.windll.kernel32.CreateMutexW(None, False, "Global\dsh-ticket")
    if ctypes.get_last_error() == 183:
        return
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(BIND, H) as s:
        log(f"取票页启动 http://{BIND[0]}:{BIND[1]}/")
        s.serve_forever()

if __name__ == "__main__":
    main()

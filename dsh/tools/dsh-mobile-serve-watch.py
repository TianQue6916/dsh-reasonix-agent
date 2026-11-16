# dsh-mobile-serve-watch.py
# 目的：保证 127.0.0.1:3080 的 dsh web profile 与 tailscale serve(https://node.tailc3af92.ts.net/)
#       始终在跑 —— 桌面端 dsh 也好、开机也好、进程崩了自己重启也好，手机随时能接管。
# 为什么不检测 desktop 进程：本机 shell 跑在受限 token 下，Toolhelp32 只枚举到 42 个进程，
#       看不到 DeepSeek Harness.exe（实测 2026-11-14）。改用「端口是否活着」这个客观判据。
# 暂停：创建 ~\.dsh\logs\.no-mobile-serve 后 60s 内生效（想腾内存时用）。
# 静默：Startup 的 .vbs 用 pythonw 拉起，无窗口；输出全写日志。
import subprocess, time, socket, os, datetime

LOG   = os.path.expanduser(r"~\.dsh\logs\dsh-mobile-serve-watch.log")
PS1   = os.path.expanduser(r"~\.dsh\launch-web-tailnet.ps1")
PAUSE = os.path.expanduser(r"~\.dsh\logs\.no-mobile-serve")
PORT, HOST_, TICK, RETRY_MIN = 3080, "node.tailc3af92.ts.net", 5, 120
CREATE_NO_WINDOW = 0x08000000

def log(msg):
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"[{datetime.datetime.now():%Y-%m-%d %H:%M:%S}] {msg}\n")

def port_open(p):
    with socket.socket() as s:
        s.settimeout(0.4)
        return s.connect_ex(("192.168.0.100", p)) == 0

def run(cmd, timeout):
    return subprocess.run(cmd, capture_output=True, timeout=timeout, creationflags=CREATE_NO_WINDOW)

def serve_ok():
    """serve 链路是否通。401/403 都算通（说明 https 入口在转发，只是要 token）。"""
    import urllib.request, urllib.error, ssl
    try:
        urllib.request.urlopen(f"https://{HOST_}/", timeout=6, context=ssl.create_default_context())
        return True
    except urllib.error.HTTPError:
        return True
    except Exception:
        return False

def bring_up():
    r = run(["pwsh", "-NoProfile", "-File", PS1], 180)
    if r.returncode != 0:
        return f"ps1 rc={r.returncode} {r.stderr.decode('utf-8','replace')[:300]}"
    if not port_open(PORT):
        return "ps1 rc=0 但 3080 仍未监听"
    if serve_ok():
        return "ok（serve 已在，无需重设）"
    # serve 只有在配置丢失时才需要重设；本 watcher 非管理员，pipe 被拒是正常的权限现象。
    s = run(["tailscale", "serve", "--bg", "--https=443", f"https://192.168.0.100:{PORT}"], 60)
    if s.returncode == 0:
        return "ok（serve 已重设）"
    return ("WARN 3080 已起但 serve 不通，且无权重设（pythonw 非管理员，"
            "tailscaled pipe 属 ProtectedPrefix\Administrators）。"
            "请在提权终端手动跑一次： tailscale serve --bg --https=443 http://127.0.0.1:3080 | "
            + s.stderr.decode("utf-8","replace")[:200])

def main():
    import ctypes
    ctypes.windll.kernel32.CreateMutexW(None, False, "Global\dsh-mobile-serve-watch")
    if ctypes.get_last_error() == 183:          # ERROR_ALREADY_EXISTS
        return
    log(f"watcher 启动 pid={os.getpid()} lane=https://{HOST_}/ pause={PAUSE}")
    last = 0.0
    while True:
        try:
            if os.path.exists(PAUSE):
                pass
            elif not port_open(PORT) and (time.time() - last) > RETRY_MIN:
                last = time.time()
                log("3080 不在 -> 拉起 web + serve")
                log("结果: " + bring_up())
        except Exception as ex:
            log(f"ERROR {type(ex).__name__}: {ex}")
        time.sleep(TICK)

if __name__ == "__main__":
    main()

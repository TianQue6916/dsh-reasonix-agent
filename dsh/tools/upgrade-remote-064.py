import socket, time, subprocess, os, sys
PROFILE = r"C:\Users\27063\.dsh\profiles\desktop"
LOG = r"C:\Users\27063\.dsh\logs\upgrade-remote-064.log"
def log(m):
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {m}\n")
def port_open(p):
    s = socket.socket(); s.settimeout(0.5)
    try:
        s.connect(("127.0.0.1", p)); return True
    except Exception:
        return False
    finally:
        s.close()
log("watcher started, waiting for desktop dsh (port 3532) to close")
deadline = time.time() + 3600
while port_open(3532):
    if time.time() > deadline:
        log("timeout after 1h, aborting"); sys.exit(1)
    time.sleep(2)
log("3532 closed; waiting 5s for handle release")
time.sleep(5)
log("running pnpm add ds-harness-remote@0.6.4")
r = subprocess.run("pnpm add ds-harness-remote@0.6.4", cwd=PROFILE, shell=True,
                   capture_output=True, text=True, encoding="utf-8", errors="replace")
log("rc=" + str(r.returncode))
log("stdout: " + (r.stdout or "")[-1500:])
log("stderr: " + (r.stderr or "")[-1500:])
ver = "?"
try:
    import json
    with open(os.path.join(PROFILE, "node_modules", "ds-harness-remote", "package.json"), encoding="utf-8") as f:
        ver = json.load(f)["version"]
except Exception as e:
    log("version read failed: " + str(e))
log("installed version now: " + ver)

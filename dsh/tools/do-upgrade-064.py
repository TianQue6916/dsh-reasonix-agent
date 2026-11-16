import time, subprocess, os, json
PROFILE = r"C:\Users\27063\.dsh\profiles\desktop"
EXE = r"C:\Users\27063\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe"
LOG = r"C:\Users\27063\.dsh\logs\do-upgrade-064.log"
def log(m):
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {m}\n")
log("scheduled; waiting 25s before killing DSH")
time.sleep(25)
log("killing DeepSeek Harness.exe")
r = subprocess.run('taskkill /F /IM "DeepSeek Harness.exe"', shell=True, capture_output=True, text=True)
log("taskkill rc=" + str(r.returncode) + " out=" + (r.stdout or "")[-300:])
time.sleep(6)
log("running pnpm add ds-harness-remote@0.6.4")
u = subprocess.run("pnpm add ds-harness-remote@0.6.4", cwd=PROFILE, shell=True,
                   capture_output=True, text=True, encoding="utf-8", errors="replace")
log("pnpm rc=" + str(u.returncode))
log("pnpm out: " + (u.stdout or "")[-1200:])
log("pnpm err: " + (u.stderr or "")[-800:])
ver = "?"
try:
    with open(os.path.join(PROFILE, "node_modules", "ds-harness-remote", "package.json"), encoding="utf-8") as f:
        ver = json.load(f)["version"]
except Exception as e:
    log("version read failed: " + str(e))
log("installed version: " + ver)
time.sleep(2)
log("relaunching DSH")
try:
    subprocess.Popen([EXE], cwd=os.path.dirname(EXE))
    log("relaunch issued")
except Exception as e:
    log("relaunch failed: " + str(e))

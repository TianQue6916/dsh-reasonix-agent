import os, sys, threading, time, urllib.request
URL, OUT, SIZE, N = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
chunk = SIZE // N
def bounds(i):
    a = i * chunk
    b = SIZE - 1 if i == N - 1 else (i + 1) * chunk - 1
    return a, b
def grab(i):
    a, b = bounds(i)
    p = f"{OUT}.part{i}"
    need = b - a + 1
    if os.path.exists(p) and os.path.getsize(p) == need:
        return
    for attempt in range(4):
        try:
            req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0", "Range": f"bytes={a}-{b}"})
            with urllib.request.urlopen(req, timeout=180) as r, open(p, "wb") as f:
                while True:
                    buf = r.read(131072)
                    if not buf: break
                    f.write(buf)
            if os.path.getsize(p) == need:
                return
        except Exception as e:
            print(f"part{i} attempt{attempt}: {type(e).__name__} {e}", flush=True)
        time.sleep(3 + attempt * 5)
ths = [threading.Thread(target=grab, args=(i,)) for i in range(N)]
[t.start() for t in ths]
[t.join() for t in ths]
bad = []
for i in range(N):
    a, b = bounds(i)
    p = f"{OUT}.part{i}"
    if not os.path.exists(p) or os.path.getsize(p) != b - a + 1:
        bad.append(i)
if bad:
    print("INCOMPLETE parts:", bad, flush=True)
    sys.exit(1)
with open(OUT, "wb") as o:
    for i in range(N):
        p = f"{OUT}.part{i}"
        with open(p, "rb") as f: o.write(f.read())
        os.remove(p)
print("done", os.path.getsize(OUT), flush=True)

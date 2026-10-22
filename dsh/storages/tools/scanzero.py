import os, sys, hashlib
root = sys.argv[1]
n = 64 << 20
Z64 = hashlib.md5(b"\x00" * n).hexdigest()
bad, scanned, total_bytes = [], 0, 0
for dp, dn, fn in os.walk(root):
    for f in fn:
        p = os.path.join(dp, f)
        try:
            sz = os.path.getsize(p)
        except OSError:
            continue
        if sz < n:
            continue
        scanned += 1; total_bytes += sz
        tot0 = 0
        with open(p, "rb", buffering=0) as fh:
            while True:
                b = fh.read(n)
                if not b:
                    break
                tot0 += b.count(0)
        r = tot0 / sz
        if r > 0.02:
            bad.append((r, sz, p))
bad.sort(reverse=True)
for r, s, p in bad:
    print("  %6.1f%% zeros  %12d  %s" % (r * 100, s, p))
print("  扫描大文件 %d 个 / %d 字节；可疑 %d 个" % (scanned, total_bytes, len(bad)))

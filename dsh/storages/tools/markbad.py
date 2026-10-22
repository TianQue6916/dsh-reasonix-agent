import os, hashlib, sys
root = "/media/OS/课程文件/实分析/05-视频讲座"
n = 64 << 20
Z64 = hashlib.md5(b"\x00" * n).hexdigest()
renamed = []
for fn in sorted(os.listdir(root)):
    p = os.path.join(root, fn)
    if not os.path.isfile(p) or not fn.endswith(".realcugan.mkv"):
        continue
    if fn.startswith("[损坏"):
        continue
    sz = os.path.getsize(p)
    if sz < n:
        continue
    tot0 = 0
    with open(p, "rb", buffering=0) as f:
        while True:
            b = f.read(n)
            if not b:
                break
            tot0 += b.count(0)
    r = tot0 / sz
    if r > 0.10:
        pct = int(round(r * 100))
        new = "[损坏·空洞{}%] {}".format(pct, fn)
        os.rename(p, os.path.join(root, new))
        renamed.append((pct, fn, new))
for pct, old, new in renamed:
    print("  重命名 {:>3}%  {}".format(pct, new))
print("共标记 {} 个文件".format(len(renamed)))

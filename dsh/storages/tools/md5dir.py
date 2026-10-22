import hashlib, os, sys
root = sys.argv[1]
out = []
for dp, dn, fn in os.walk(root):
    for f in fn:
        p = os.path.join(dp, f)
        h = hashlib.md5()
        with open(p, "rb", buffering=0) as fh:
            while True:
                b = fh.read(1 << 22)
                if not b: break
                h.update(b)
        out.append("%s\t%s\t%d" % (os.path.relpath(p, root).replace("\\", "/"), h.hexdigest(), os.path.getsize(p)))
out.sort()
print("\n".join(out))

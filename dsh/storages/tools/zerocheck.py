import hashlib, sys
p = sys.argv[1]
n = 64 << 20
z = hashlib.md5(b"\x00" * n).hexdigest()
print("  md5(64MB zeros) = %s" % z)
total_zero = 0
with open(p, "rb", buffering=0) as f:
    i = 0
    while True:
        b = f.read(n)
        if not b:
            break
        h = hashlib.md5(b).hexdigest()
        zeros = b.count(0)
        total_zero += zeros
        if h == z:
            print("  chunk %2d: *** 整块全零 *** (offset %d MB)" % (i, i * 64))
        elif zeros > len(b) // 10:
            print("  chunk %2d: 含零 %d/%d 字节 (offset %d MB)" % (i, zeros, len(b), i * 64))
        i += 1
print("  合计零字节 = %d / 文件大小 %d" % (total_zero, __import__('os').path.getsize(p)))

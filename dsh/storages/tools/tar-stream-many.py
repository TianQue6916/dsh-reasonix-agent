import socket, sys, tarfile, io, time
host, port = sys.argv[1], int(sys.argv[2])
pairs = sys.argv[3:]
s = socket.create_connection((host, port))
s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
s.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 1 << 22)
raw = s.makefile("wb", buffering=0)
w = io.BufferedWriter(raw, 1 << 22)
t0 = time.time()
with tarfile.open(fileobj=w, mode="w|", format=tarfile.GNU_FORMAT) as tar:
    for i in range(0, len(pairs), 2):
        tar.add(pairs[i], arcname=pairs[i + 1])
w.flush()
dt = time.time() - t0
try:
    s.shutdown(socket.SHUT_WR)
except OSError:
    pass
s.close()
sys.stderr.write("MANY-STREAM: %d files, %.2fs\n" % (len(pairs) // 2, dt))

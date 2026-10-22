import socket, sys, tarfile, io, time
host, port, src, arcname = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
s = socket.create_connection((host, port))
s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
s.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 1 << 22)
raw = s.makefile("wb", buffering=0)
w = io.BufferedWriter(raw, 1 << 22)
t0 = time.time()
with tarfile.open(fileobj=w, mode="w|", format=tarfile.GNU_FORMAT) as tar:
    tar.add(src, arcname=arcname)
w.flush()
dt = time.time() - t0
try:
    s.shutdown(socket.SHUT_WR)
except OSError:
    pass
s.close()
sys.stderr.write("TAR-STREAM: %.2fs\n" % dt)

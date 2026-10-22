import socket, sys
host, port = sys.argv[1], int(sys.argv[2])
s = socket.create_connection((host, port))
s.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
s.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 1 << 22)
n = 0
while True:
    b = sys.stdin.buffer.read1(1 << 20)
    if not b:
        break
    s.sendall(b)
    n += len(b)
try:
    s.shutdown(socket.SHUT_WR)
except OSError:
    pass
s.close()
sys.stderr.write("sent %d bytes\n" % n)

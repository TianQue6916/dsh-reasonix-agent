#!/usr/bin/env python3
"""ariafetch — adaptive multi-connection HTTP(S) downloader (stdlib only).

WHY this exists (2026-11-12, measured on this machine):
  dsh has no download-manager layer; every download uses the caller's single
  HTTP client.  The aggregate ceiling here is ~3.4 MB/s (27 Mbps), so for
  *domestic* CDNs one stream already saturates the link and extra connections
  buy nothing (npmmirror: 3.05 -> 3.79 MB/s, +24%).  For *cross-border* sources
  one stream is BDP-limited (throughput ~ cwnd/RTT): registry.ollama.ai at
  RTT 330 ms gave 0.10 MB/s on one stream but 1.89 MB/s on 16 streams (19x).
  So parallelism is a RUNTIME decision, never a constant.

Decision rule (auto mode, the default):
  1. HEAD the URL (following redirects).  No Content-Length or no Range
     support => single stream.
  2. Download span 0 alone for --probe-secs seconds and measure throughput.
     The bytes fetched become the first segment's prefix, so the probe is
     not wasted work.
  3. Throughput >= --fast-mbps => one stream already saturates the link:
     keep going single-stream (mode="bandwidth-bound").
     Throughput <  --fast-mbps => BDP-limited: fan out to --parts segments.
  --parallel forces the fan-out; --single forces one stream.

Resume: each segment owns `OUT.partN`; its current size decides the next Range
start, so re-running the same command continues where it stopped.

Output: exactly one JSON object on stdout; progress goes to stderr (so a caller
can parse stdout without stripping a progress bar).  -q silences progress.

Usage:
  python ariafetch.py URL -o OUT [--parts 16] [--probe-secs 2] [--fast-mbps 2]
                          [--sha256 HEX] [--parallel|--single] [--retries 5] [-q]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

UA = "ariafetch/1.0 (+dsh fetch_file tool)"
CHUNK = 64 * 1024
TIMEOUT = 60
MB = 1024 * 1024


def log(msg: str, quiet: bool = False) -> None:
    if not quiet:
        sys.stderr.write(msg + "\n")
        sys.stderr.flush()


def request(url: str, headers: dict | None = None):
    hdrs = {"User-Agent": UA, "Accept-Encoding": "identity"}
    if headers:
        hdrs.update(headers)
    return urllib.request.urlopen(urllib.request.Request(url, headers=hdrs), timeout=TIMEOUT)


def probe(url: str) -> dict:
    """HEAD the URL; report the final URL, byte length, and Range support."""
    info = {"final_url": url, "length": None, "ranges": False}
    try:
        with request(url) as r:
            info["final_url"] = r.geturl()
            cl = r.headers.get("Content-Length")
            if cl and cl.isdigit():
                info["length"] = int(cl)
            info["ranges"] = r.headers.get("Accept-Ranges", "").lower() == "bytes"
    except urllib.error.HTTPError as e:
        if e.code in (403, 405, 501):
            try:
                with request(url, {"Range": "bytes=0-0"}) as r:
                    info["final_url"] = r.geturl()
                    cr = r.headers.get("Content-Range", "")
                    if "/" in cr and cr.rsplit("/", 1)[-1].isdigit():
                        info["length"] = int(cr.rsplit("/", 1)[-1])
                        info["ranges"] = True
            except Exception:
                pass
    return info


class Span:
    """One byte range of the file and its on-disk part file."""

    __slots__ = ("i", "start", "end", "path", "done")

    def __init__(self, i: int, start: int, end: int | None, path: str):
        self.i, self.start, self.end, self.path = i, start, end, path
        self.done = 0

    @property
    def size(self) -> int | None:
        return None if self.end is None else self.end - self.start + 1

    def have(self) -> int:
        return os.path.getsize(self.path) if os.path.exists(self.path) else 0

    def fetch(self, url: str, stop: threading.Event, quiet: bool,
              deadline: float | None = None) -> int:
        """Download this span into its part file, resuming from what it holds.

        Returns bytes written now.  With `deadline` (epoch seconds) the call is
        a timed probe: it stops early, keeping what it got, and does not raise.
        """
        # An open-ended span (end=None) still writes to its part file; the
        # final size is validated against Content-Length at merge time.
        want = self.size
        have = self.have()
        if want is not None and have >= want:
            return 0
        pos = self.start + have
        written = 0
        for attempt in range(self.retries):
            rng = f"bytes={pos}-" if self.end is None else f"bytes={pos}-{self.end}"
            try:
                with request(url, {"Range": rng}) as r:
                    status = getattr(r, "status", 200)
                    if self.end is not None and status != 206:
                        raise RuntimeError(f"server ignored Range (status {status})")
                    if status == 200 and pos != self.start:
                        # Range was ignored: the body starts at byte 0, so the
                        # bytes on disk are NOT a prefix we may append to.
                        if not quiet:
                            log(f"  server ignored Range — restarting {os.path.basename(self.path)}", quiet)
                        written = 0
                        pos = self.start
                        open(self.path, "wb").close()
                    with open(self.path, "ab") as f:
                        while True:
                            if stop.is_set() or (deadline is not None and time.time() >= deadline):
                                return written
                            block = r.read(CHUNK)
                            if not block:
                                break
                            f.write(block)
                            written += len(block)
                            self.done += len(block)
                            pos += len(block)
                now = self.have()
                if want is None or now >= want:
                    return written
                raise RuntimeError(f"closed early at {now}/{want}")
            except Exception as e:  # noqa: BLE001 - retry any transport failure
                if deadline is not None and time.time() >= deadline:
                    return written
                if attempt == self.retries - 1:
                    raise
                log(f"  retry {attempt + 1}/{self.retries} at {pos}: {e}", quiet)
                time.sleep(min(2 ** attempt, 8))
        return written


def plan_spans(length: int, parts: int, out: str) -> list[Span]:
    """Split [0, length) into at most `parts` contiguous spans."""
    parts = max(1, min(parts, 32))
    size = max(1, length // parts)
    spans, off, i = [], 0, 0
    while off < length:
        end = min(off + size - 1, length - 1)
        spans.append(Span(i, off, end, f"{out}.part{i}"))
        off, i = end + 1, i + 1
    return spans


def merge(spans: list[Span], out: str, expect: int | None, want_sha: str | None,
          quiet: bool) -> tuple[str, int]:
    """Concatenate part files into `out`, verifying byte count and sha256."""
    h = hashlib.sha256()
    total = 0
    tmp = out + ".merging"
    with open(tmp, "wb") as w:
        for s in spans:
            if not os.path.exists(s.path):
                continue
            with open(s.path, "rb") as r:
                while True:
                    block = r.read(MB)
                    if not block:
                        break
                    w.write(block)
                    h.update(block)
                    total += len(block)
    if expect is not None and total != expect:
        os.replace(tmp, out)
        raise RuntimeError(f"size mismatch: got {total}, expected {expect}")
    digest = h.hexdigest()
    if want_sha is not None and digest != want_sha.lower():
        os.replace(tmp, out)
        raise RuntimeError(f"sha256 mismatch: got {digest}, want {want_sha}")
    os.replace(tmp, out)
    for s in spans:
        if os.path.exists(s.path):
            os.remove(s.path)
    return digest, total


def run(args) -> dict:
    info = probe(args.url)
    url = info["final_url"]
    length = info["length"]
    t0 = time.time()
    shown = url if len(url) <= 200 else url[:200] + "…"
    result = {
        "ok": False, "url": args.url, "finalUrl": shown, "out": os.path.abspath(args.out),
        "totalBytes": length, "bytes": 0, "seconds": 0.0, "mbps": 0.0,
        "mode": "single", "parts": 1, "rangeSupported": info["ranges"],
        "resumed": False, "sha256": None, "probeMbps": None, "error": None,
    }
    d = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(d or ".", exist_ok=True)
    Span.retries = args.retries
    stop = threading.Event()

    def existing_bytes() -> int:
        return sum(f.stat().st_size for f in
                   __import__("pathlib").Path(d or ".").glob(
                       os.path.basename(args.out) + ".part*")
                   if f.is_file()) if d else 0

    base = existing_bytes()

    def finish(sha: str) -> dict:
        dt = max(1e-3, time.time() - t0)
        total = result["bytes"]
        wrote = max(0, total - base)
        result.update(ok=True, sha256=sha, seconds=round(dt, 3),
                      mbps=round(wrote / dt / 1e6, 3))
        return result

    # Unknown length / no Range / tiny file / --single => one stream.
    if length is None or not info["ranges"] or length <= args.min_size_mb * MB or args.single:
        span = Span(0, 0, length - 1 if length else None, f"{args.out}.part0")
        result["resumed"] = span.have() > 0
        log(f"single stream ({length if length else 'unknown'} bytes)", args.quiet)
        result["bytes"] = span.fetch(url, stop, args.quiet)
        result["parts"] = 1
        digest, total = merge([span], args.out, length, args.sha256, args.quiet)
        result["bytes"] = total
        return finish(digest)

    spans = plan_spans(length, args.parts, args.out)
    result["resumed"] = any(s.have() > 0 for s in spans)
    log(f"{length / MB:.1f} MB in {len(spans)} segment(s); probing span 0 for "
        f"{args.probe_secs:g}s", args.quiet)

    # Probe span 0; its bytes stay as that segment's prefix.
    p0 = spans[0]
    tp = time.time()
    try:
        got = p0.fetch(url, stop, args.quiet, deadline=tp + args.probe_secs)
    except RuntimeError as e:
        log(f"range probe failed ({e}) — falling back to one stream", args.quiet)
        if os.path.exists(p0.path):
            os.remove(p0.path)
        span = Span(0, 0, length - 1, f"{args.out}.part0")
        result["mode"] = "single-fallback"
        result["bytes"] = span.fetch(url, stop, args.quiet)
        result["parts"] = 1
        digest, total = merge([span], args.out, length, args.sha256, args.quiet)
        result["bytes"] = total
        return finish(digest)
    dtp = max(1e-3, time.time() - tp)
    rate = got / dtp / 1e6
    result["probeMbps"] = round(rate, 3)
    log(f"probe: {rate:.2f} MB/s on one stream (threshold {args.fast_mbps:g})", args.quiet)

    if rate >= args.fast_mbps and not args.parallel:
        result["mode"] = "bandwidth-bound"
        log("link already saturated by one stream — staying single-stream", args.quiet)
        span = Span(0, 0, length - 1, p0.path)  # p0 bytes are the file's prefix
        result["bytes"] = got + span.fetch(url, stop, args.quiet)
        result["parts"] = 1
        digest, total = merge([span], args.out, length, args.sha256, args.quiet)
        result["bytes"] = total
        return finish(digest)

    result["mode"] = "parallel"
    result["parts"] = len(spans)
    result["bytes"] = got
    log(f"BDP-limited — fanning out to {len(spans)} connections", args.quiet)

    def work(s: Span) -> int:
        return s.fetch(url, stop, args.quiet)

    lock = threading.Lock()
    last = [time.time()]

    def ticker() -> None:
        while not stop.is_set():
            time.sleep(0.5)
            with lock:
                done = sum(s.have() for s in spans)
            if not args.quiet:
                pct = 100.0 * done / length if length else 0.0
                el = max(1e-3, time.time() - t0)
                sys.stderr.write(f"\r  {done / MB:8.1f}/{length / MB:.1f} MB "
                                 f"{pct:5.1f}%  {done / el / 1e6:5.2f} MB/s   ")
                sys.stderr.flush()
            if all(s.size is not None and s.have() >= s.size for s in spans):
                return

    th = threading.Thread(target=ticker, daemon=True)
    th.start()
    # spans[0] must be scheduled too: the probe only filled its first seconds.
    with ThreadPoolExecutor(max_workers=len(spans)) as pool:
        list(pool.map(work, spans))
    stop.set()
    th.join(timeout=1)
    if not args.quiet:
        sys.stderr.write("\n")
    result["bytes"] = sum(s.have() for s in spans)
    digest, total = merge(spans, args.out, length, args.sha256, args.quiet)
    result["bytes"] = total
    return finish(digest)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="adaptive multi-connection downloader")
    ap.add_argument("url")
    ap.add_argument("-o", "--out", required=True)
    ap.add_argument("--parts", type=int, default=16, help="max connections (default 16, cap 32)")
    ap.add_argument("--probe-secs", type=float, default=2.0)
    ap.add_argument("--fast-mbps", type=float, default=2.0,
                    help="one-stream MB/s above which fan-out is skipped (default 2.0)")
    ap.add_argument("--min-size-mb", type=float, default=2.0)
    ap.add_argument("--sha256", default=None)
    ap.add_argument("--retries", type=int, default=5)
    ap.add_argument("--parallel", action="store_true", help="always fan out")
    ap.add_argument("--single", action="store_true", help="force one stream")
    ap.add_argument("-q", "--quiet", action="store_true")
    args = ap.parse_args(argv)
    if args.parallel and args.single:
        ap.error("--parallel and --single are mutually exclusive")
    try:
        out = run(args)
    except Exception as e:  # noqa: BLE001 - one JSON error object, never a traceback
        dt = 0.0
        print(json.dumps({"ok": False, "url": args.url, "out": os.path.abspath(args.out),
                          "error": str(e)}, ensure_ascii=False))
        return 1
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

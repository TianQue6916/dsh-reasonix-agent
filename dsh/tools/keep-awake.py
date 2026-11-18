#!/usr/bin/env python3
"""keep-awake — 阻止 Windows 进入 S0ix（Modern Standby），保留熄屏与省电。

原理：Windows 的 S0 低电量待机会在熄屏后节流后台进程的网络活动（DAM），
导致 dsh remote 的 WebRTC 心跳超时、被服务端踢掉。本进程通过 PowerCreateRequest
持有一个 PowerRequestExecutionRequired 请求，系统因此不会把本机推进 S0ix；
显示器照常按电源计划熄灭（我们不持有 DisplayRequired）。

单实例：命名 mutex。暂停开关：~/.dsh/logs/.no-keep-awake 存在时主动释放并退出。
"""
import ctypes
import os
import sys
import time
import datetime
from ctypes import wintypes

DSH_HOME = os.path.join(os.path.expanduser("~"), ".dsh")
LOG_PATH = os.path.join(DSH_HOME, "logs", "keep-awake.log")
PAUSE_FLAG = os.path.join(DSH_HOME, "logs", ".no-keep-awake")
MUTEX_NAME = r"Global\dsh-keep-awake-singleton"

kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

POWER_REQUEST_CONTEXT_VERSION = 0
POWER_REQUEST_CONTEXT_SIMPLE_STRING = 0x1

PowerRequestDisplayRequired = 0
PowerRequestSystemRequired = 1
PowerRequestAwayModeRequired = 2
PowerRequestExecutionRequired = 3


class _REASON(ctypes.Union):
    class _DETAILED(ctypes.Structure):
        _fields_ = [
            ("LocalizedReasonModule", wintypes.HMODULE),
            ("LocalizedReasonId", wintypes.ULONG),
            ("ReasonStringCount", wintypes.ULONG),
            ("ReasonStrings", ctypes.POINTER(wintypes.LPWSTR)),
        ]

    _fields_ = [
        ("Detailed", _DETAILED),
        ("SimpleReasonString", wintypes.LPWSTR),
    ]


class REASON_CONTEXT(ctypes.Structure):
    _fields_ = [
        ("Version", wintypes.ULONG),
        ("Flags", wintypes.DWORD),
        ("Reason", _REASON),
    ]


kernel32.PowerCreateRequest.argtypes = [ctypes.POINTER(REASON_CONTEXT)]
kernel32.PowerCreateRequest.restype = wintypes.HANDLE
kernel32.PowerSetRequest.argtypes = [wintypes.HANDLE, ctypes.c_int]
kernel32.PowerSetRequest.restype = wintypes.BOOL
kernel32.PowerClearRequest.argtypes = [wintypes.HANDLE, ctypes.c_int]
kernel32.PowerClearRequest.restype = wintypes.BOOL
kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
kernel32.CreateMutexW.argtypes = [wintypes.LPVOID, wintypes.BOOL, wintypes.LPCWSTR]
kernel32.CreateMutexW.restype = wintypes.HANDLE


def log(msg):
    try:
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"{stamp} {msg}\n")
    except Exception:
        pass


def already_running():
    h = kernel32.CreateMutexW(None, True, MUTEX_NAME)
    err = ctypes.get_last_error()
    if err == 183:  # ERROR_ALREADY_EXISTS
        return True, h
    return False, h


def acquire():
    ctx = REASON_CONTEXT()
    ctx.Version = POWER_REQUEST_CONTEXT_VERSION
    ctx.Flags = POWER_REQUEST_CONTEXT_SIMPLE_STRING
    reason = ctypes.c_wchar_p("dsh remote keeps network active")
    ctx.Reason.SimpleReasonString = reason

    handle = kernel32.PowerCreateRequest(ctypes.byref(ctx))
    if not handle:
        raise OSError(ctypes.get_last_error(), "PowerCreateRequest failed")

    ok_exec = kernel32.PowerSetRequest(handle, PowerRequestExecutionRequired)
    ok_sys = kernel32.PowerSetRequest(handle, PowerRequestSystemRequired)
    if not (ok_exec and ok_sys):
        raise OSError(ctypes.get_last_error(), "PowerSetRequest failed")
    return handle, reason


def main():
    running, mutex = already_running()
    if running:
        log("另一个实例已在运行，退出")
        return 0

    try:
        handle, reason = acquire()
    except OSError as e:
        log(f"获取 power request 失败: {e}")
        return 1

    log("keep-awake started: 已持有 ExecutionRequired + SystemRequired，S0ix 被抑制")
    try:
        while True:
            if os.path.exists(PAUSE_FLAG):
                log("检测到暂停开关，释放 power request 并退出")
                break
            time.sleep(5)
    except KeyboardInterrupt:
        log("收到 Ctrl-C")
    finally:
        kernel32.PowerClearRequest(handle, PowerRequestExecutionRequired)
        kernel32.PowerClearRequest(handle, PowerRequestSystemRequired)
        kernel32.CloseHandle(handle)
        del reason
        log("已释放 power request，退出")
    return 0


if __name__ == "__main__":
    sys.exit(main())

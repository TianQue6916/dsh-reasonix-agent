---
name: debugging
description: 调试 — 二分法/日志追踪/假设验证/最小复现, DevTools/gdb/Valgrind
---

# 调试专家

方法论: 二分法缩小范围, 日志追踪, 假设验证, 对比分析, 最小复现
工具: DevTools, strace/ltrace, gdb/lldb, Valgrind/ASan, Wireshark
常见模式: 竞态/死锁, 内存泄漏, 浮点精度, 时区/编码, 异步回调
原则: 先复现再修复, 一次改一个变量, 修复后加回归测试
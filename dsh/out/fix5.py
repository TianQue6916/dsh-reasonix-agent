# -*- coding: utf-8 -*-
import io
p = r'C:\Users\27063\.dsh\out\reply_letter.html'
s = io.open(p, encoding='utf-8').read()
old = '''    <li>《门诊慢特病病种待遇认定申请表》（2026 年 9 月 25 日）</li>
    <li>住院证（住院单）照片及住院期间的提交记录（2026 年 9 月 7 日）</li>
    <li>钉钉系统提示「非花名册中正式员工不能休病假」截图</li>
    <li>与贵司人力资源部门、直接主管的钉钉、短信沟通记录</li>
    <li>2026 年 8 月工资未到账的银行流水记录</li>
    <li>贵司先后出具的两份《劳动争议友好协商函》及其钉钉发送记录</li>'''
new = '''    <li>住院证（住院单）及住院期间的提交记录（2026 年 9 月 7 日）</li>
    <li>钉钉系统提示「非花名册中正式员工不能休病假」截图</li>
    <li>与贵司人力资源部门、直接主管的钉钉、短信沟通记录</li>
    <li>贵司先后出具的两份《劳动争议友好协商函》及钉钉发送记录</li>'''
c = s.count(old)
print('count', c)
if c == 1:
    s = s.replace(old, new)
    io.open(p, 'w', encoding='utf-8').write(s)

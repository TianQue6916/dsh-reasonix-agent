# -*- coding: utf-8 -*-
"""生成 resetWindow=month 改造后的三份文件到 %TEMP%\ggpatch\。
本机 D:\80-系统\Toolbox 对原生 Windows 进程拒写（EACCES），只有 MSYS 侧能写，
所以这里只负责「生成」，落地由 bash 的 cp 负责。"""
import os, sys

OUT = r'C:\Users\27063\AppData\Local\Temp\ggpatch'
os.makedirs(OUT, exist_ok=True)

def load(path):
    b = open(path, 'rb').read()
    return b.decode('utf-8'), ('\r\n' if b'\r\n' in b else '\n')

def build(path, pairs):
    s, eol = load(path)
    for old, new in pairs:
        o = old.replace('\n', eol)
        n = new.replace('\n', eol)
        c = s.count(o)
        assert c == 1, f'{path}: expected 1 match, got {c} for {old[:70]!r}'
        s = s.replace(o, n)
    return s.encode('utf-8'), eol

def emit(path, pairs):
    data, eol = build(path, pairs)
    dst = os.path.join(OUT, os.path.basename(path))
    open(dst, 'wb').write(data)
    print(f'EMIT {os.path.basename(path):32s} eol={"CRLF" if eol==chr(13)+chr(10) else "LF"}  '
          f'{len(pairs)} hunks  {len(data)} bytes  -> {dst}')

GATEWAY_HUNKS = [
("""  //   resetWindow: 时间型口径读哪个窗口的 resetAt —— GOAT 只有 5h / weekly 两个
  //     rolling window 带时间戳，月度池属 billing cycle、没有日期；官方余额行
  //     没有窗口，时间型口径下自动跳过、保持静态 weight。""",
 """  //   resetWindow: 时间型口径读哪个窗口的 resetAt —— 'fivehour' | 'weekly' | 'month'，
  //     分别读 fiveHourReset / weeklyReset / monthReset。三个字段都由
  //     goat-usage.ps1 -Json 直接给出（monthReset 是 billing cycle 结束时刻，
  //     服务端字段，不是本地推算）。官方余额行三窗口全为 null，时间型口径下
  //     自动跳过、保持静态 weight。
  //   ⚠ 2026-10-04 修正：此处原写「GOAT 只有 5h / weekly 两个 rolling window 带
  //     时间戳，月度池属 billing cycle、没有日期」，并据此把 resetWindow 定成
  //     weekly —— 这个前提是错的，monthReset 一直都在 quota-http 的返回里。
  //     而 weekly 与 month 的远近顺序**可以相反**（163 周重置更远、月重置更近），
  //     选错窗口会把优先级整个排反：实测表现为「疯狂烧刚充值的 qq，
  //     放着 3 天后作废的 163 不动」。"""),
("""    const qsw = String(qs.resetWindow || 'weekly').toLowerCase() === 'fivehour' ? 'fiveHourReset' : 'weeklyReset';""",
 """    const RW_COL = { fivehour: 'fiveHourReset', weekly: 'weeklyReset', month: 'monthReset' };
    const qsw = RW_COL[String(qs.resetWindow || 'weekly').toLowerCase()] || 'weeklyReset';"""),
]

CONFIG_HUNKS = [
("""    "mode": "resetSoon",
    "resetWindow": "weekly",""",
 """    "mode": "resetSoon",
    "resetWindow": "month","""),
("""    "note": "额度驱动的动态权重（2026-10-01 加）。mode=resetSoon：周期窗口 resetAt 更近的账号拿更大权重，优先把快到期的额度烧掉。resetWindow=weekly —— GOAT 只给 5h/weekly 两个 rolling window 的 resetAt，月度池属 billing cycle、服务端不给日期。只覆盖内存权重，绝不回写 keys.json。\"""",
 """    "note": "额度驱动的动态权重（2026-10-01 加）。mode=resetSoon：周期窗口 resetAt 更近的账号拿更大权重，优先把快到期的额度烧掉。resetWindow=month 读 monthReset（2026-10-04 修正：原为 weekly，依据「月度池服务端不给日期」是错的；实测 163 weeklyReset 更远、monthReset 更近，用 weekly 会把优先级排反）。只覆盖内存权重，绝不回写 keys.json。\""""),
]

SELFTEST_HUNKS = [
("""function writeConfig(mode = 'used') {""",
 """function writeConfig(mode = 'used', resetWindow = 'weekly') {"""),
("""      mode,
      resetWindow: 'weekly',""",
 """      mode,
      resetWindow,"""),
("""//   5. quota 动态权重 mode='resetSoon'：周期窗口 resetAt 更近者 weight 更大""",
 """//   5. quota 动态权重 mode='resetSoon'：周期窗口 resetAt 更近者 weight 更大
//   5b. resetWindow 三选一 fivehour|weekly|month，month 读 monthReset。T8 专门钉死这条：
//       weekly 与 month 的远近顺序**可以相反**，读错窗口会把优先级整个排反
//       （2026-10-04 线上 bug 的回归测试）"""),
("""    assert((c['goat-B-key'] || 0) > (c['goat-A-key'] || 0),
      `goatB(95%) 应比 goatA(10%) 背更多会话，实际 ${JSON.stringify(c)}`);
  });

  child.kill();""",
 """    assert((c['goat-B-key'] || 0) > (c['goat-A-key'] || 0),
      `goatB(95%) 应比 goatA(10%) 背更多会话，实际 ${JSON.stringify(c)}`);
  });

  // T8 ── resetWindow='month'：必须读 monthReset，绝不能退回 weeklyReset
  //
  // 这是 2026-10-04 线上 bug 的回归测试。当时 resetWindow 被钉死成 'weekly'，
  // 而真实两个 GOAT 账号的周重置与月重置**远近顺序相反**：
  //   163 -> weeklyReset 更远(158h)、monthReset 更近(75h)、月只剩 4.89/70
  //   qq  -> weeklyReset 更近(139h)、monthReset 更远(713h)、月刚重置剩 65.6/70
  // 于是「优先烧快作废的额度」被实现成了「优先烧刚充值的额度」：
  // 当天 5326 次请求全打在 qq 上，163 只拿到 24 次，那 4.89 眼看要白白重置掉。
  //
  // 构造：故意让 weeklyReset 的顺序与 monthReset **完全相反**。
  // 只要实现读的是 weeklyReset，下面的顺序断言就会以「B > C > A」的形式炸掉。
  await step("T8 mode='resetSoon' + resetWindow='month'：按 monthReset 排序（而非 weeklyReset）", async () => {
    const now = Date.now();
    quotaRows = [
      // 月重置最近(2d)、周重置最远(6d) —— 163 的真实形状
      { name: 'goatA', monthUsed: 65, monthCap: 70, monthReset: now + 2 * DAY, weeklyReset: now + 6 * DAY },
      // 两者居中(4d)
      { name: 'goatC', monthUsed: 20, monthCap: 70, monthReset: now + 4 * DAY, weeklyReset: now + 4 * DAY },
      // 月重置最远(6d)、周重置最近(2d) —— qq 的真实形状
      { name: 'goatB', monthUsed: 4, monthCap: 70, monthReset: now + 6 * DAY, weeklyReset: now + 2 * DAY },
      // 官方余额行：kind=official、三窗口全 null
      { name: 'official1', kind: 'official', available: 1.2, currency: 'CNY',
        fiveHourReset: null, weeklyReset: null, monthReset: null },
    ];
    writeConfig('resetSoon', 'month');
    await reload();
    await resetCooldowns();
    const h = await health();
    assert(h.quotaSync.ok === true, `quotaSync 应 ok，实际 ${JSON.stringify(h.quotaSync)}`);
    assert(h.quotaSync.resetWindow === 'month',
      `quotaSync 应回显 resetWindow=month，实际 ${JSON.stringify(h.quotaSync)}`);
    const n = byName(h);
    assert(Math.abs(n.goatA.weightEffective - 5) < 0.01,
      `月重置最近的 goatA 应拿满权重 5，实际 ${n.goatA.weightEffective}`);
    assert(Math.abs(n.goatB.weightEffective - 0.2) < 0.01,
      `月重置最远的 goatB 应拿最低权重 0.2，实际 ${n.goatB.weightEffective}`);
    // 照妖镜：读错窗口时这三者顺序会整个倒过来（B > C > A）
    assert(n.goatA.weightEffective > n.goatC.weightEffective && n.goatC.weightEffective > n.goatB.weightEffective,
      '必须按 monthReset 排成 A(2d) > C(4d) > B(6d)；若拿到 B > C > A，说明读的是 weeklyReset，'
      + `实际 ${JSON.stringify({ A: n.goatA.weightEffective, B: n.goatB.weightEffective, C: n.goatC.weightEffective })}`);
    assert(n.official1.weightFromQuota === false && n.official1.weightEffective === 1,
      '官方行三窗口全 null → 时间型口径下必须跳过、保持静态 weight 1');
    assert(Array.isArray(h.quotaSync.detail) && h.quotaSync.detail.some((d) => d.indexOf('剩 ') === 0),
      `detail 应带剩余时长标签，实际 ${JSON.stringify(h.quotaSync.detail)}`);
  });

  child.kill();"""),
]

emit('gateway.mjs', GATEWAY_HUNKS)
emit('config.json', CONFIG_HUNKS)
emit('selftest-quota-priority.mjs', SELFTEST_HUNKS)
print('ALL EMITTED to', OUT)

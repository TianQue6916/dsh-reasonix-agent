/**
 * GOAT quota panel -- dsh web client half.
 * Contributes a live quota badge to the sidebar footer (global) and the composer dock
 * (in session). Polls the local quota endpoint (quota-http.mjs on 127.0.0.1:8790).
 *
 * 2026-10-29 扩成「用量视图」（原来只有三窗口百分比）。每个账号现在 5 行：
 *   1) 5h / 周 / 月 百分比 + 剩余 credits
 *   2) 各窗口 used/cap 绝对值
 *   3) 用量  —— 请求数 · tokens（入/出拆分）· 成功率 · 平均 credits per 请求
 *   4) 节奏  —— 日均消耗 · 计费周期进度 · 剩余 credits 可撑天数 + 撞上限预警
 *   5) 重置  —— 每个窗口的重置时刻（绝对时间 + 倒计时）
 *
 * 为什么 3)/4) 的派生量在客户端算：官方 /alpha/usage/summary 的 `daily` 字段
 * 恒为空数组（?days= / ?groupBy= / ?period= / ?include= 四种参数 2026-10-29 实测
 * 都不生效），所以没有「按天」粒度可拿；只能拿周期总量 + periodStart/periodEnd
 * 自己推日均。perDay > left/perDay 的比值决定「宽裕 / 刚好 / 会撞上限」三档。
 *
 * 字段是渐进增强的：后端 goat-usage.ps1 没升级时 tokensIn/tokensOut/successRate/
 * periodStart 都是 undefined，这里必须降级成省略该段，不能渲染成 "NaN"。
 *
 * The detail popover is rendered through a portal onto document.body on purpose: the
 * sidebar slot clips overflow, so an inline absolute layer gets cut off.
 */
window.__ModuleLoader__.load({
  id: "@local/dsh-plugin-goat-panel",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const jsx = require("react/jsx-runtime");
    const React = require("react");
    let createPortal = null;
    try { createPortal = require("react-dom").createPortal; } catch (e) { createPortal = null; }

    // 两端点都走服务端 ETag/304（Cache-Control: must-revalidate），所以这里不再用 no-store ——
    // 用 no-store 会让浏览器跳过条件请求，服务端的 ETag 就白算了。force 时才用 reload 硬取。
    const ENDPOINT = "http://127.0.0.1:8790/quota";
    // 缓存命中率的独立端点（2026-10-29）：数字来自扫 gateway 日志，与 /quota 的账单周期无关，
    // 所以不挂在 15s 轮询上 —— 只在面板打开时拉一次（服务端冷扫 0.2s / 增量 4ms）。
    const CACHE_ENDPOINT = "http://127.0.0.1:8790/cache";
    const REFRESH_MS = 15000;
    const LAYER_W = 470;
    const DAY_MS = 86400000;

    const pct = (u, c) => (Number(c) > 0 ? Math.round((100 * Number(u)) / Number(c)) : 0);
    const pctFine = (u, c) => {
      if (!(Number(c) > 0)) return "0";
      const v = (100 * Number(u)) / Number(c);
      const r = Math.round(v * 10) / 10;
      return Number.isInteger(r) ? String(r) : r.toFixed(1);
    };
    const levelInk = (p) => (p >= 90 ? "#f87171" : p >= 70 ? "#fbbf24" : "#34d399");
    const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : String(v));
    const isNum = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
    const nInt = (v) => (isNum(v) ? Math.round(Number(v)).toLocaleString("en-US") : "\u2014");
    const clock = (ts) => {
      const d = ts ? new Date(ts) : new Date();
      const p = (n) => String(n).padStart(2, "0");
      return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    };

    /** 大数压成「亿/万」：24.02 亿比 2401667610 好读一个量级。 */
    const fmtTok = (v) => {
      if (!isNum(v)) return null;
      const n = Number(v);
      if (n <= 0) return "0";
      if (n >= 1e8) return (n / 1e8).toFixed(2) + " \u4ebf";
      if (n >= 1e4) {
        // 万级：超过 100 万就不再给一位小数（2148.0 万 → 2148 万），否则 14.5 万 会掉精度
        const w = n / 1e4;
        return (w >= 100 ? Math.round(w).toString() : w.toFixed(1)) + " \u4e07";
      }
      return nInt(n);
    };
    /** 倒计时：d/h/m 紧凑写法，popover 里空间比可读性更紧。 */
    const durText = (ms) => {
      if (!isNum(ms)) return "";
      if (Number(ms) <= 0) return "\u5df2\u91cd\u7f6e";
      const s = Math.round(Number(ms) / 1000);
      const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
      if (d > 0) return d + "d" + (h ? " " + h + "h" : "");
      if (h > 0) return h + "h" + (m ? " " + m + "m" : "");
      return m + "m";
    };
    const fmtAbs = (ms) => {
      if (!isNum(ms)) return "";
      try {
        const d = new Date(Number(ms));
        const p = (n) => String(n).padStart(2, "0");
        return p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
      } catch { return ""; }
    };
    /** ISO 时间戳 -> 本地 HH:mm，标注「这个缓存率是几点算出来的」。 */
    const hmText = (iso) => {
      try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return "";
        const pad = (n) => String(n).padStart(2, "0");
        return pad(d.getHours()) + ":" + pad(d.getMinutes());
      } catch { return ""; }
    };
    const resetCell = (ms, now) => (isNum(ms) ? fmtAbs(ms) + "\uff08" + durText(Number(ms) - now) + "\uff09" : "\u2014");

    /**
     * 计费周期节奏：已过天数 / 总天数 / 日均消耗 / 剩余 credits 还能撑几天。
     * 周期端点用 periodEnd(= subscriptions.currentPeriodEnd) 与 periodStart(= summary.periodStart)；
     * 任一缺失就返回 null，由渲染端整段省略 —— 宁可不显示，也不显示瞎猜的数。
     */
    const rhythmOf = (r, now) => {
      const end = Number(r.periodEnd != null ? r.periodEnd : r.monthReset);
      const start = Number(r.periodStart);
      const used = Number(r.monthUsed);
      const left = isNum(r.monthLeft) ? Number(r.monthLeft) : Number(r.monthCap) - used;
      if (!(end > 0) || !(start > 0) || !(end > start) || !(used >= 0) || !isNum(left)) return null;
      const totalMs = end - start;
      const goneMs = Math.min(totalMs, Math.max(0, now - start));
      const goneDays = goneMs / DAY_MS;
      const totalDays = totalMs / DAY_MS;
      const remainDays = (totalMs - goneMs) / DAY_MS;
      // 周期刚开始（< 0.05 天）时日均没有意义，perDay 置空，只显示进度。
      const perDay = goneDays > 0.05 ? used / goneDays : null;
      const canLast = perDay && perDay > 0 ? left / perDay : null;
      return { totalMs, goneMs, goneDays, totalDays, remainDays, perDay, canLast, left, used };
    };
    /** 剩余 credits 可撑天数 vs 周期剩余天数 → 三档结论。 */
    const verdictOf = (ry) => {
      if (!ry || !isNum(ry.canLast) || !(ry.remainDays > 0)) return null;
      const ratio = ry.canLast / ry.remainDays;
      if (ratio >= 1.3) return { ink: "#34d399", text: "\u5bbd\u677e" };
      if (ratio >= 0.85) return { ink: "#fbbf24", text: "\u521a\u597d\u591f" };
      return { ink: "#f87171", text: "\u4f1a\u649e\u4e0a\u9650" };
    };

    function useQuota() {
      const [state, setState] = React.useState({ status: "loading", rows: [], ts: null, error: null });
      const load = React.useCallback((force) => {
        fetch(ENDPOINT + (force ? "?force=1" : ""), { cache: force ? "reload" : "default" })
          .then((r) => r.json())
          .then((j) => setState({ status: j && j.ok ? "ok" : "error", rows: (j && j.rows) || [], ts: (j && j.ts) || new Date().toISOString(), error: j && j.error }))
          .catch((e) => setState({ status: "error", rows: [], ts: null, error: String((e && e.message) || e) }));
      }, []);
      React.useEffect(() => {
        load(false);
        const timer = setInterval(() => load(false), REFRESH_MS);
        return () => clearInterval(timer);
      }, [load]);
      return [state, load];
    }

    /**
     * 缓存命中率：只在面板打开时拉一次。理由 —— /cache 要读 gateway 日志（冷扫 0.2s），
     * 放进 15s 轮询就是纯浪费；数据本身按天粒度变化，也没必要高频刷新。
     * 口径来自日志里每条成功请求的 upstream usage.prompt_tokens_details.cached_tokens。
     */
    function useCache(enabled, from, nonce) {
      const [state, setState] = React.useState(null);
      // nonce 只在用户点 ⟳ 时递增：用它区分「打开面板（走服务端 1h TTL）」与
      // 「手动刷新（?force=1 强算）」。服务端默认 TTL 一小时 —— 缓存率是按天粒度的量，
      // 没有任何理由每次打开都重扫日志。
      const seen = React.useRef(nonce);
      React.useEffect(() => {
        if (!enabled) return;
        const force = nonce !== seen.current;
        seen.current = nonce;
        let alive = true;
        const q = [];
        if (from) q.push("from=" + from);
        q.push("detail=1");
        if (force) q.push("force=1");
        fetch(CACHE_ENDPOINT + "?" + q.join("&"), { cache: force ? "reload" : "default" })
          .then((r) => r.json())
          .then((j) => { if (alive) setState(j && j.ok ? j : null); })
          .catch(() => { if (alive) setState(null); });
        return () => { alive = false; };
      }, [enabled, from, nonce]);
      return state;
    }


    function QuotaPanel() {
      const [state, load] = useQuota();
      const [open, setOpen] = React.useState(false);
      const [pos, setPos] = React.useState(null);
      const rootRef = React.useRef(null);
      const btnRef = React.useRef(null);
      const layerRef = React.useRef(null);
      const [tick, setTick] = React.useState(Date.now());
      // 手动刷新时让缓存率一起重拉（⟳ 按钮）
      const [cacheTick, setCacheTick] = React.useState(0);
      React.useEffect(() => {
        const t = setInterval(() => setTick(Date.now()), 1000);
        return () => clearInterval(t);
      }, []);
      const agoText = (ts) => {
        if (!ts) return "";
        const s = Math.max(0, Math.round((tick - new Date(ts).getTime()) / 1000));
        if (s < 60) return s + "s \u524d";
        if (s < 3600) return Math.round(s / 60) + "m \u524d";
        return Math.round(s / 3600) + "h \u524d";
      };

      // Place the popover next to the badge, always inside the viewport.
      React.useEffect(() => {
        if (!open) return;
        const place = () => {
          const node = btnRef.current;
          if (!node) return;
          const r = node.getBoundingClientRect();
          const left = Math.max(8, Math.min(r.left, window.innerWidth - LAYER_W - 8));
          const up = r.top > window.innerHeight * 0.55;
          setPos({
            left,
            up,
            top: r.bottom + 6,
            bottom: Math.max(8, window.innerHeight - r.top + 6)
          });
        };
        place();
        window.addEventListener("resize", place);
        return () => window.removeEventListener("resize", place);
      }, [open]);

      React.useEffect(() => {
        if (!open) return;
        const onDoc = (ev) => {
          if (rootRef.current && rootRef.current.contains(ev.target)) return;
          if (layerRef.current && layerRef.current.contains(ev.target)) return;
          setOpen(false);
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
      }, [open]);

      const rows = state.rows || [];
      const goatRows = rows.filter((r) => r && !r.error && r.kind !== "official");
      const worst = goatRows.reduce((m, r) => Math.max(m, pct(r.fiveHourUsed, r.fiveHourCap), pct(r.weeklyUsed, r.weeklyCap)), 0);
      const weekly = goatRows.reduce((m, r) => Math.max(m, pct(r.weeklyUsed, r.weeklyCap)), 0);
      const hourly = goatRows.reduce((m, r) => Math.max(m, pct(r.fiveHourUsed, r.fiveHourCap)), 0);
      const monthly = goatRows.reduce((m, r) => Math.max(m, pct(r.monthUsed, r.monthCap)), 0);
      // 官方 key（DeepSeek 余额）单独显示：它不是套餐窗口，混进百分比里是错的。
      const official = rows.find((r) => r && !r.error && r.kind === "official");
      // 缓存口径要跟账单周期对齐：periodStart 由 /quota 的 row 给出（goat-usage.ps1 的 periodStart）
      const periodStart = goatRows.length && isNum(goatRows[0].periodStart) ? goatRows[0].periodStart : null;
      const cache = useCache(open, periodStart, cacheTick);
      const badgeText = state.status === "loading" ? "GOAT 额度 …"
        : state.status === "error" ? "GOAT 额度 —"
        : "GOAT 5h " + hourly + "% · 周 " + weekly + "% · 月 " + monthly + "%"
          + (official ? " · " + (official.currency || "") + n2(official.available) : "");
      const badgeInk = state.status === "ok" ? levelInk(worst) : "var(--dsw-alias-label-tertiary, #888)";

      // 上限不再硬编码：套餐可能改额度，取 rows 里实际返回的 cap。
      const capText = goatRows.length
        ? "\u4e0a\u9650 " + goatRows.map((r) =>
            "5h " + Math.round(Number(r.fiveHourCap))
            + " \u00b7 \u5468 " + Math.round(Number(r.weeklyCap))
            + " \u00b7 \u6708 " + Math.round(Number(r.monthCap)) + " credits").join("  |  ")
        : "\u4e0a\u9650 5h 14 \u00b7 \u5468 35 \u00b7 \u6708 70 credits";

      const dim = { color: "var(--dsw-alias-label-tertiary, #999)", fontSize: "11.5px" };

      // 缓存命中率行。三个口径：本周期（与 credits 周期对齐）· 近 7 天 · 今日。
      // 今日样本 < 30 次只标次数不给百分比 —— 新 session 冷启动会把命中率砸到 70% 以下，
      // 直接显示会让人误以为缓存坏了。
      const cacheHit = (h) => (h == null ? "—" : h.toFixed(1) + "%");
      const cacheInk = (h) => (h == null ? undefined : h >= 90 ? "#34d399" : h >= 75 ? "#fbbf24" : "#f87171");
      const worstSess = cache && cache.detail && cache.detail.worstSessions && cache.detail.worstSessions[0];
      const cacheRow = cache && cache.cycle && cache.cycle.requests > 0
        ? jsx.jsxs("div", {
            style: Object.assign({}, dim, {
              borderTop: "1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08))",
              paddingTop: "6px"
            }),
            title: worstSess
              ? "近 3 天最差 session：" + worstSess.sess + "　" + cacheHit(worstSess.hit) + "　(" + worstSess.requests + " 次请求，prompt " + nInt(worstSess.prompt) + ")"
              : "缓存命中率来自本地 gateway 日志（GOAT 账单 API 无此字段）",
            children: [
              jsx.jsx("span", { style: { opacity: 0.75 }, children: "缓存 " }),
              jsx.jsx("span", { style: { color: cacheInk(cache.cycle.hit) }, children: "本周期 " + cacheHit(cache.cycle.hit) }),
              jsx.jsx("span", { children: " · 近7天 " + cacheHit(cache.last7 ? cache.last7.hit : null) }),
              jsx.jsx("span", { children: " · 今日 " + (cache.today
                ? (cache.today.requests < 30 ? "样本少(" + cache.today.requests + ")" : cacheHit(cache.today.hit))
                : "—") }),
              // 数据生成时刻：一眼看出这数字是刚算的还是缓存来的（服务端 TTL 1h）
              cache.ts ? jsx.jsx("span", { style: { marginLeft: "6px", opacity: 0.6 }, children: "· " + hmText(cache.ts) + (cache.stale ? "（后台刷新中）" : "") }) : null
            ]
          })
        : null;


      const body = jsx.jsxs("div", {
        ref: layerRef,
        style: Object.assign({
          position: "fixed", zIndex: 2147483000,
          left: (pos ? pos.left : 8) + "px", width: LAYER_W + "px",
          padding: "10px 12px", borderRadius: "14px",
          // ── 不透明背景（2026-10-29）──────────────────────────────────────────
          // dsh 的主题 token --dsw-specific-menu = var(--dsw-menu-surface-fill)，
          // 实测值：深色 #43454a73（alpha=0x73≈45%）、浅色 #f8f9fa94（58%）。
          // 官方面板用它是「半透明 + backdrop-filter: blur(40px) saturate(150%)」的玻璃，
          // 而这个 popover 没有 backdrop-filter —— 只抄 token 就等于让背后的对话文字透上来，
          // 行数变多以后直接糊成一片。
          // 做法：不透明实色打底（--dsw-alias-bg-base，主题自适应），再把菜单色用
          // linear-gradient 叠在上面。gradient 内部是「合成」不是「取平均」，底层 alpha=1
          // ⇒ 最终结果恒为不透明，而色调仍跟随主题（浅色偏灰白 / 深色偏炭灰）。
          backgroundColor: "var(--dsw-alias-bg-base, #17191f)",
          backgroundImage: "linear-gradient(var(--dsw-specific-menu, #262a34), var(--dsw-specific-menu, #262a34))",
          border: "1px solid var(--dsw-alias-border-l3, rgba(255,255,255,.16))",
          boxShadow: "var(--dsw-elevation-prominent, 0 8px 24px rgba(0,0,0,.45))",
          color: "var(--dsw-alias-label-primary, #eee)",
          fontSize: "12.5px", lineHeight: "1.65"
        }, pos && pos.up ? { bottom: pos.bottom + "px" } : { top: (pos ? pos.top : 8) + "px" }),
        children: [
          jsx.jsxs("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", color: "var(--dsw-alias-label-tertiary, #999)", fontSize: "11.5px" }, children: [
            jsx.jsx("span", { style: { whiteSpace: "nowrap" }, children: "GOAT \u989d\u5ea6" }),
            jsx.jsx("span", { style: { whiteSpace: "nowrap" }, children: capText }),
            jsx.jsx("span", { style: { marginLeft: "auto", whiteSpace: "nowrap" }, children: "\u6570\u636e " + clock(state.ts) + " \u00b7 " + agoText(state.ts) }),
            jsx.jsx("button", {
              type: "button",
              onClick: (ev) => { ev.stopPropagation(); load(true); setCacheTick((t) => t + 1); },
              style: { border: "0", background: "transparent", color: "var(--dsw-alias-label-secondary, #bbb)", cursor: "pointer", fontSize: "13px", padding: "0 2px" },
              title: "立即刷新（跳过缓存）",
              children: "⟳"
            })
          ] }),
          state.status === "error"
            ? jsx.jsx("div", { style: { color: "#f87171" }, children: "读取失败：" + (state.error || "未知错误") })
            : rows.map((r, i) => {
                if (r.kind === "official") {
                  // 余额行：没有 5h/周/月 百分比，直接显示金额，避免渲染成 0%/NaN。
                  return jsx.jsxs("div", { style: { padding: "6px 0", borderTop: i > 0 ? "1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08))" : "none" }, children: [
                    jsx.jsxs("div", { style: { display: "flex", gap: "10px", alignItems: "baseline" }, children: [
                      jsx.jsx("strong", { style: { minWidth: "38px" }, children: r.name }),
                      jsx.jsx("span", { children: "余额 " + (r.currency || "") + " " + n2(r.available) })
                    ] }),
                    jsx.jsx("div", { style: dim, children:
                      "赠送 " + n2(r.granted) + " · 充值 " + n2(r.toppedUp)
                    })
                  ] });
                }
                const p5 = pct(r.fiveHourUsed, r.fiveHourCap);
                const pw = pct(r.weeklyUsed, r.weeklyCap);
                const pm = pct(r.monthUsed, r.monthCap);
                const f5 = pctFine(r.fiveHourUsed, r.fiveHourCap);
                const fw = pctFine(r.weeklyUsed, r.weeklyCap);
                const fm = pctFine(r.monthUsed, r.monthCap);
                const monthLeft = isNum(r.monthLeft) ? Number(r.monthLeft) : Number(r.monthCap) - Number(r.monthUsed);

                // ── 用量行（3）：请求数 / tokens 出入 / 成功率 / 平均 credits per 请求 ──
                const usageBits = [];
                if (isNum(r.requests)) usageBits.push(nInt(r.requests) + " \u6b21\u8bf7\u6c42");
                const tokAll = fmtTok(r.tokens);
                if (tokAll) {
                  const tin = fmtTok(r.tokensIn), tout = fmtTok(r.tokensOut);
                  usageBits.push(tokAll + " tokens" + (tin || tout ? "\uff08\u5165 " + (tin || "\u2014") + " / \u51fa " + (tout || "\u2014") + "\uff09" : ""));
                }
                if (isNum(r.successRate)) usageBits.push("\u6210\u529f " + n2(r.successRate).replace(/\.00$/, "") + "%");
                else if (isNum(r.failedCount) && Number(r.failedCount) > 0) usageBits.push("\u5931\u8d25 " + nInt(r.failedCount));
                if (isNum(r.requests) && Number(r.requests) > 0) usageBits.push("\u5747 " + Number(Number(r.monthUsed) / Number(r.requests)).toFixed(4) + " cr/\u6b21");
                if (isNum(r.requests) && isNum(r.tokens) && Number(r.requests) > 0) usageBits.push("\u5747 " + fmtTok(Number(r.tokens) / Number(r.requests)) + " tok/\u6b21");

                // ── 节奏行（4）：日均消耗 / 周期进度 / 可撑天数 + 三档结论 ──
                const ry = rhythmOf(r, tick);
                const vd = verdictOf(ry);
                const rhythmBits = [];
                if (ry) {
                  if (isNum(ry.perDay)) rhythmBits.push("\u65e5\u5747 " + n2(ry.perDay) + " cr");
                  rhythmBits.push("\u5468\u671f " + ry.goneDays.toFixed(1) + "/" + ry.totalDays.toFixed(1) + " \u5929\uff08" + Math.round((100 * ry.goneMs) / ry.totalMs) + "%\uff09");
                  if (isNum(ry.canLast)) rhythmBits.push("\u4f59 " + n2(ry.left) + " cr \u53ef\u6491 " + Number(ry.canLast).toFixed(1) + " \u5929");
                  else rhythmBits.push("\u4f59 " + n2(ry.left) + " cr");
                } else if (isNum(monthLeft)) {
                  rhythmBits.push("\u4f59 " + n2(monthLeft) + " cr");
                }

                return jsx.jsxs("div", { style: { padding: "6px 0", borderTop: i > 0 ? "1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.08))" : "none" }, children: [
                  jsx.jsxs("div", { style: { display: "flex", gap: "10px", alignItems: "baseline" }, children: [
                    jsx.jsx("strong", { style: { minWidth: "38px" }, children: r.name }),
                    jsx.jsxs("span", { style: { color: levelInk(p5) }, children: ["5h ", f5, "%"] }),
                    jsx.jsxs("span", { style: { color: levelInk(pw) }, children: ["周 ", fw, "%"] }),
                    jsx.jsxs("span", { style: { color: levelInk(pm) }, children: ["月 ", fm, "%"] }),
                    jsx.jsx("span", { style: Object.assign({ marginLeft: "auto" }, dim), children: "余 " + n2(monthLeft) })
                  ] }),
                  // 各窗口绝对值（原来就有，保留）
                  jsx.jsx("div", { style: dim, children:
                    "5h " + n2(r.fiveHourUsed) + "/" + r.fiveHourCap
                    + " · 周 " + n2(r.weeklyUsed) + "/" + r.weeklyCap
                    + " · 月 " + n2(r.monthUsed) + "/" + Math.round(Number(r.monthCap))
                  }),
                  usageBits.length
                    ? jsx.jsxs("div", { style: dim, children: [jsx.jsx("span", { style: { opacity: 0.75 }, children: "用量 " }), usageBits.join(" · ")] })
                    : null,
                  rhythmBits.length
                    ? jsx.jsxs("div", { style: dim, children: [
                        jsx.jsx("span", { style: { opacity: 0.75 }, children: "节奏 " }),
                        rhythmBits.join(" · "),
                        vd ? jsx.jsx("span", { style: { color: vd.ink, marginLeft: "6px" }, children: "· " + vd.text }) : null
                      ] })
                    : null,
                  jsx.jsx("div", { style: Object.assign({}, dim, { fontSize: "11px", opacity: 0.9 }), children:
                    "\u7a97\u53e3\u91cd\u7f6e\uff1a5h " + resetCell(r.fiveHourReset, tick)
                    + " \u00b7 \u5468 " + resetCell(r.weeklyReset, tick)
                    + (isNum(r.monthReset) ? " \u00b7 \u6708 " + resetCell(r.monthReset, tick) : "")
                  })
                ] });
              })
          ,
          cacheRow
        ]
      });

      const layer = open && pos ? (createPortal ? createPortal(body, document.body) : body) : null;

      return jsx.jsxs(React.Fragment, { children: [
        jsx.jsxs("div", {
          ref: rootRef,
          style: { position: "relative", display: "inline-flex" },
          children: [
            jsx.jsxs("button", {
              ref: btnRef,
              type: "button",
              onClick: () => { setOpen((v) => !v); load(true); },
              title: "Command Code GOAT 套餐额度与用量（点击展开；每 15 秒自动刷新）",
              style: {
                display: "inline-flex", alignItems: "center", gap: "6px",
                minHeight: "28px", padding: "3px 8px", border: "0", borderRadius: "6px",
                background: "transparent", cursor: "pointer",
                color: "var(--dsw-alias-label-secondary, #bbb)",
                fontSize: "12px", lineHeight: "18px", fontFamily: "inherit"
              },
              children: [
                jsx.jsx("span", { style: { width: "7px", height: "7px", borderRadius: "50%", background: badgeInk, flex: "none" } }),
                jsx.jsx("span", { children: badgeText })
              ]
            })
          ]
        }),
        layer
      ] });
    }

    const inject = ["slots"];

    /** Slots the quota badge contributes to: sidebar footer (always visible) + composer dock (in session). */
    const TARGET_SLOTS = [
      "sidebar.footer.action",
      "conversation.input.dock"
    ];

    function apply(ctx) {
      TARGET_SLOTS.forEach((slot) => {
        ctx.slots.inject(slot, () => ctx.slots.register({
          name: slot,
          id: "goat-quota-" + slot.replace(/[^a-z0-9]+/gi, "-"),
          order: 30
        }, QuotaPanel));
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});

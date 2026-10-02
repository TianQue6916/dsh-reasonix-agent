/**
 * GOAT quota panel -- dsh web client half.
 * Contributes a live quota badge to the sidebar footer (global) and the composer dock
 * (in session). Polls the local quota endpoint (quota-http.mjs on 127.0.0.1:8790).
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

    const ENDPOINT = "http://127.0.0.1:8790/quota";
    const REFRESH_MS = 15000;
    const LAYER_W = 400;

    const pct = (u, c) => (Number(c) > 0 ? Math.round((100 * Number(u)) / Number(c)) : 0);
    const pctFine = (u, c) => {
      if (!(Number(c) > 0)) return "0";
      const v = (100 * Number(u)) / Number(c);
      const r = Math.round(v * 10) / 10;
      return Number.isInteger(r) ? String(r) : r.toFixed(1);
    };
    const levelInk = (p) => (p >= 90 ? "#f87171" : p >= 70 ? "#fbbf24" : "#34d399");
    const n2 = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : String(v));
    const clock = (ts) => {
      const d = ts ? new Date(ts) : new Date();
      const p = (n) => String(n).padStart(2, "0");
      return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    };
    const fmtReset = (ms) => {
      if (!ms) return "";
      try {
        return new Date(Number(ms)).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
      } catch { return ""; }
    };

    function useQuota() {
      const [state, setState] = React.useState({ status: "loading", rows: [], ts: null, error: null });
      const load = React.useCallback((force) => {
        fetch(ENDPOINT + (force ? "?force=1" : ""), { cache: "no-store" })
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

    function QuotaPanel() {
      const [state, load] = useQuota();
      const [open, setOpen] = React.useState(false);
      const [pos, setPos] = React.useState(null);
      const rootRef = React.useRef(null);
      const btnRef = React.useRef(null);
      const layerRef = React.useRef(null);
      const [tick, setTick] = React.useState(Date.now());
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
      const worst = rows.reduce((m, r) => (r && !r.error && r.kind !== "official" ? Math.max(m, pct(r.fiveHourUsed, r.fiveHourCap), pct(r.weeklyUsed, r.weeklyCap)) : m), 0);
      const weekly = rows.reduce((m, r) => (r && !r.error && r.kind !== "official" ? Math.max(m, pct(r.weeklyUsed, r.weeklyCap)) : m), 0);
      const hourly = rows.reduce((m, r) => (r && !r.error && r.kind !== "official" ? Math.max(m, pct(r.fiveHourUsed, r.fiveHourCap)) : m), 0);
      // 官方 key（DeepSeek 余额）单独显示：它不是套餐窗口，混进百分比里是错的。
      const official = rows.find((r) => r && !r.error && r.kind === "official");
      const badgeText = state.status === "loading" ? "GOAT 额度 …"
        : state.status === "error" ? "GOAT 额度 —"
        : "GOAT 5h " + hourly + "% · 周 " + weekly + "%"
          + (official ? " · " + (official.currency || "") + n2(official.available) : "");
      const badgeInk = state.status === "ok" ? levelInk(worst) : "var(--dsw-alias-label-tertiary, #888)";

      const body = jsx.jsxs("div", {
        ref: layerRef,
        style: Object.assign({
          position: "fixed", zIndex: 2147483000,
          left: (pos ? pos.left : 8) + "px", width: LAYER_W + "px",
          padding: "10px 12px", borderRadius: "14px",
          background: "var(--dsw-specific-menu, #1f2430)",
          border: "1px solid rgba(255,255,255,.09)",
          boxShadow: "var(--dsw-elevation-prominent, 0 8px 24px rgba(0,0,0,.45))",
          color: "var(--dsw-alias-label-primary, #eee)",
          fontSize: "12.5px", lineHeight: "1.65"
        }, pos && pos.up ? { bottom: pos.bottom + "px" } : { top: (pos ? pos.top : 8) + "px" }),
        children: [
          jsx.jsxs("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", color: "var(--dsw-alias-label-tertiary, #999)", fontSize: "11.5px" }, children: [
            jsx.jsx("span", { style: { whiteSpace: "nowrap" }, children: "GOAT \u989d\u5ea6" }),
            jsx.jsx("span", { style: { whiteSpace: "nowrap" }, children: "\u4e0a\u9650 5h 14 \u00b7 \u5468 35 \u00b7 \u6708 70 credits" }),
            jsx.jsx("span", { style: { marginLeft: "auto", whiteSpace: "nowrap" }, children: "\u6570\u636e " + clock(state.ts) + " \u00b7 " + agoText(state.ts) }),
            jsx.jsx("button", {
              type: "button",
              onClick: (ev) => { ev.stopPropagation(); load(true); },
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
                  return jsx.jsxs("div", { style: { padding: "6px 0", borderTop: i > 0 ? "1px solid rgba(255,255,255,.08)" : "none" }, children: [
                    jsx.jsxs("div", { style: { display: "flex", gap: "10px", alignItems: "baseline" }, children: [
                      jsx.jsx("strong", { style: { minWidth: "38px" }, children: r.name }),
                      jsx.jsx("span", { children: "余额 " + (r.currency || "") + " " + n2(r.available) })
                    ] }),
                    jsx.jsx("div", { style: { color: "var(--dsw-alias-label-tertiary, #999)", fontSize: "11.5px" }, children:
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
                return jsx.jsxs("div", { style: { padding: "6px 0", borderTop: i > 0 ? "1px solid rgba(255,255,255,.08)" : "none" }, children: [
                  jsx.jsxs("div", { style: { display: "flex", gap: "10px", alignItems: "baseline" }, children: [
                    jsx.jsx("strong", { style: { minWidth: "38px" }, children: r.name }),
                    jsx.jsxs("span", { style: { color: levelInk(p5) }, children: ["5h ", f5, "%"] }),
                    jsx.jsxs("span", { style: { color: levelInk(pw) }, children: ["周 ", fw, "%"] }),
                    jsx.jsxs("span", { style: { color: levelInk(pm) }, children: ["月 ", fm, "%"] }),
                    jsx.jsx("span", { style: { marginLeft: "auto", color: "var(--dsw-alias-label-tertiary, #999)" }, children: "余 " + n2(Math.round(Number(r.monthCap)) - Number(r.monthUsed)) })
                  ] }),
                  jsx.jsx("div", { style: { color: "var(--dsw-alias-label-tertiary, #999)", fontSize: "11.5px" }, children:
                    "5h " + n2(r.fiveHourUsed) + "/" + r.fiveHourCap
                    + " · 周 " + n2(r.weeklyUsed) + "/" + r.weeklyCap
                    + " · 月 " + n2(r.monthUsed) + "/" + Math.round(Number(r.monthCap))
                  }),
                  jsx.jsx("div", { style: { color: "var(--dsw-alias-label-tertiary, #999)", fontSize: "11px", opacity: 0.9 }, children:
                    "\u7a97\u53e3\u91cd\u7f6e\uFF1A5h " + fmtReset(r.fiveHourReset) + " \u00b7 \u5468 " + fmtReset(r.weeklyReset)
                    + (r.monthReset ? " · 月 " + fmtReset(r.monthReset) : "")
                  })
                ] });
              })
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
              title: "Command Code GOAT 套餐额度（点击展开；每 15 秒自动刷新）",
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

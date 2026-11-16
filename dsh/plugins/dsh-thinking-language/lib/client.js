/**
 * thinking-language — dsh client half.
 *
 * Contributes one sidebar page to Settings (slot `settings.section`) holding the
 * 思考语言 radio. The switch itself lives in the host half:
 *
 *   GET  /api/thinking-language  -> { thinking: "zh" | "en" }
 *   POST /api/thinking-language  <- { thinking: "zh" | "en" }
 *
 * WHY the same-origin path and not an absolute URL
 *   The goat-panel plugin reaches a separate process on 127.0.0.1:8790 and therefore
 *   needs CORS. The host half here registers the route INSIDE the dsh connection, so
 *   a bare "/api/..." is already same-origin on every platform that serves for this
 *   host — no CORS, no port to keep in sync.
 *
 * WHY no CSS file / no class names
 *   Slot components render inside host layout; injecting a <style> tag means owning
 *   dedupe and removal (the skill-scoreboard plugin shipped a bug doing exactly that).
 *   Inline styles are enough for one radio group.
 *
 * Verified on the web profile 2026-09-30. The Electron desktop frontend loads its UI
 * from resources/app.asar; whether it renders package-declared client modules is
 * unverified, so the host half ALSO answers a text command (/thinklang) that needs no
 * UI at all.
 */

window.__ModuleLoader__.load({
  id: "@local/dsh-thinking-language",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");

    /** Same-origin: the host half registered exactly this path. */
    const ENDPOINT = "/api/thinking-language";

    const OPTIONS = [
      {
        id: "zh",
        title: "中文思考",
        hint: "思考链用中文书写，技术术语与代码保留英文原词（语言契约的历史默认值）。"
      },
      {
        id: "en",
        title: "English reasoning",
        hint: "Thinking chain in English. Code, paths, field names and API names stay verbatim."
      }
    ];

    const STYLE = {
      wrap: { display: "flex", flexDirection: "column", gap: "10px", padding: "4px 0" },
      intro: { fontSize: "12px", lineHeight: 1.6, opacity: 0.72, margin: "0 0 4px" },
      option: (active) => ({
        display: "flex",
        gap: "10px",
        alignItems: "flex-start",
        padding: "10px 12px",
        borderRadius: "8px",
        cursor: "pointer",
        border: "1px solid " + (active ? "rgba(96,165,250,0.85)" : "rgba(127,127,127,0.28)"),
        background: active ? "rgba(96,165,250,0.10)" : "transparent",
        transition: "border-color 120ms, background 120ms"
      }),
      dot: (active) => ({
        flex: "0 0 auto",
        width: "14px",
        height: "14px",
        marginTop: "2px",
        borderRadius: "50%",
        border: "1px solid " + (active ? "rgba(96,165,250,0.95)" : "rgba(127,127,127,0.55)"),
        background: active ? "rgba(96,165,250,0.95)" : "transparent",
        boxShadow: active ? "inset 0 0 0 3px rgba(0,0,0,0.35)" : "none"
      }),
      title: { fontSize: "13px", fontWeight: 600, lineHeight: 1.4 },
      hint: { fontSize: "12px", lineHeight: 1.55, opacity: 0.72, marginTop: "2px" },
      note: { fontSize: "12px", lineHeight: 1.6, opacity: 0.65 },
      error: { fontSize: "12px", lineHeight: 1.6, color: "#f87171" }
    };

    /**
     * Read the active language from the host half.
     * @returns a promise of the language, or rejecting with a readable message.
     */
    const fetchLanguage = () =>
      fetch(ENDPOINT, { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      }).then((payload) => (payload && payload.thinking) || "zh");

    /**
     * Persist a language choice. The host half answers with the value it stored, so the
     * radio reflects the host's state rather than the optimistic click.
     * @param value - "zh" or "en".
     * @returns a promise of the stored language.
     */
    const putLanguage = (value) =>
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ thinking: value })
      }).then((response) => {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      }).then((payload) => (payload && payload.thinking) || value);

    /**
     * The Settings page: one radio group over the two thinking-chain languages.
     * @returns the section element tree.
     */
    function ThinkingLanguageSection() {
      const [state, setState] = React.useState({ status: "loading", value: null, error: null, saving: null });

      React.useEffect(() => {
        let live = true;
        fetchLanguage()
          .then((value) => {
            if (live) setState({ status: "ready", value, error: null, saving: null });
          })
          .catch((error) => {
            if (live) setState({ status: "error", value: null, error: String((error && error.message) || error), saving: null });
          });
        return () => {
          live = false;
        };
      }, []);

      const choose = React.useCallback((value) => {
        setState((previous) => ({ ...previous, saving: value, error: null }));
        putLanguage(value)
          .then((stored) => setState({ status: "ready", value: stored, error: null, saving: null }))
          .catch((error) => setState((previous) => ({
            ...previous,
            saving: null,
            error: String((error && error.message) || error)
          })));
      }, []);

      const children = [
        React.createElement(
          "p",
          { key: "intro", style: STYLE.intro },
          "只影响思考链（reasoning / thinking）的语言；正文语言仍遵守语言契约。"
        )
      ];

      for (const option of OPTIONS) {
        const active = state.value === option.id;
        children.push(
          React.createElement(
            "div",
            {
              key: option.id,
              role: "radio",
              "aria-checked": active,
              tabIndex: 0,
              style: STYLE.option(active),
              onClick: () => choose(option.id),
              onKeyDown: (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  choose(option.id);
                }
              }
            },
            [
              React.createElement("div", { key: "dot", style: STYLE.dot(active) }),
              React.createElement("div", { key: "body" }, [
                React.createElement("div", { key: "title", style: STYLE.title }, option.title),
                React.createElement("div", { key: "hint", style: STYLE.hint }, option.hint)
              ])
            ]
          )
        );
      }

      if (state.status === "loading") {
        children.push(React.createElement("div", { key: "loading", style: STYLE.note }, "读取中…"));
      }
      if (state.saving !== null) {
        children.push(React.createElement("div", { key: "saving", style: STYLE.note }, "写入中…"));
      }
      if (state.status === "error" || state.error !== null) {
        children.push(
          React.createElement(
            "div",
            { key: "error", style: STYLE.error },
            "切换失败：" + (state.error || "unknown") + "（host 半侧的 " + ENDPOINT + " 未就绪时会出现；可用 /thinklang 命令兜底）"
          )
        );
      }
      if (state.status === "ready" && state.value === "en") {
        children.push(
          React.createElement(
            "div",
            { key: "active-en", style: STYLE.note },
            "当前：English reasoning。下一条消息即生效，无需重启、无需开新会话。"
          )
        );
      }

      return React.createElement("div", { style: STYLE.wrap }, children);
    }

    const inject = ["slots"];

    /**
     * Register the Settings page.
     * @param ctx - the client plugin context.
     */
    function apply(ctx) {
      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section",
        id: "thinking-language",
        // After the shipped sections (general 0, models/shell/… tens) and before nothing
        // in particular; the host sorts ascending.
        order: 45,
        label: () => "思考语言"
      }, ThinkingLanguageSection));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});

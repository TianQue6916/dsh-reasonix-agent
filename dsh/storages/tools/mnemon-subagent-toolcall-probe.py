#!/usr/bin/env python
"""Probe: does goat-gateway/model honour tool_call encoding with vs without reasoning_effort?

Background: dsh-mnemon's subagent (taskAgentModelRoute, auto/inherit mode) sends
{provider, model} ONLY -- it drops `reasoningEffort` that the main agent gets from
agent-default-model.  In the failing subagent session the model emitted raw DeepSeek
DSML (<|DSML| calls> / <|DSML| invoke name="...">) as plain TEXT and finish_reason=stop,
so zero tool_calls were recorded and dsh-mnemon threw
"memory subagent completed without recording its result".

This script isolates that variable.  It never prints the API key.
"""
import json
import time
import urllib.request

GW = "http://127.0.0.1:8788/v1/chat/completions"
KEYS_PATH = r"D:/Toolbox/goat-gateway/keys.json"
MODEL = "deepseek/deepseek-v4.1-flash"

_keys = json.load(open(KEYS_PATH, encoding="utf-8"))["keys"]
KEY = next(k["key"] for k in _keys if k.get("enabled"))

TOOLS = [{
    "type": "function",
    "function": {
        "name": "bash",
        "description": "Run a command in a bash shell.",
        "parameters": {
            "type": "object",
            "properties": {"command": {"type": "string", "description": "The command to run"}},
            "required": ["command"],
        },
    },
}]

MSGS = [{"role": "user",
         "content": "Use the bash tool to print the current working directory. Call the tool now."}]


def run(label, extra, timeout=300):
    body = {"model": MODEL, "messages": MSGS, "tools": TOOLS,
            "tool_choice": "auto", "max_tokens": 512}
    body.update(extra)
    req = urllib.request.Request(
        GW,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + KEY},
    )
    t = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            d = json.load(r)
    except Exception as e:
        print(f"--- {label}\n    ERROR {type(e).__name__}: {str(e)[:400]}")
        return
    el = time.time() - t
    ch = (d.get("choices") or [{}])[0]
    msg = ch.get("message") or {}
    tc = msg.get("tool_calls")
    content = msg.get("content") or ""
    print(f"--- {label}   ({el:.1f}s)")
    print("    finish_reason:", ch.get("finish_reason"))
    if tc:
        print("    TOOL_CALLS  :", json.dumps(tc, ensure_ascii=False)[:500])
    else:
        print("    NO tool_calls. content[:500]:")
        print("      " + content[:500].replace("\n", "\\n"))
    if msg.get("reasoning_content"):
        print("    reasoning_content chars:", len(msg["reasoning_content"]))
    print()


if __name__ == "__main__":
    run("A  no reasoning_effort", {})
    run("B  reasoning_effort=high", {"reasoning_effort": "high"})
    run("C  reasoning_effort=medium", {"reasoning_effort": "medium"})

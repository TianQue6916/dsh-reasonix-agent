# Native reasonix (esengine/DeepSeek-Reasonix) support

## What

[Reasonix](https://github.com/esengine/DeepSeek-Reasonix) (~35k stars) is a DeepSeek-native coding agent. Its transcript store is close enough to your `flatrole` format that pointing `DEJA_COMMANDCODE_ROOT` at `~/.reasonix/sessions` **already works** — but every session shows as `commandcode`, with an empty project and no timestamp.

## Store layout

```
~/.reasonix/sessions/<session-name>.jsonl           ← transcript (the conversation)
~/.reasonix/sessions/<session-name>.events.jsonl    ← typed event stream (carries ts / usage / costUsd)
~/.reasonix/sessions/<session-name>.meta.json
~/.reasonix/sessions/<session-name>.jsonl.lock
```

Note the layout is **flat** (`sessions/<name>.jsonl`), not the Claude-Code-style `projects/<encoded-cwd>/<session>.jsonl` that `commandcode.go` and `zcode.go` assume.

## Transcript shape — one message per line, no envelope

```json
{"role":"user","content":"..."}
{"role":"assistant","content":"","tool_calls":[{"id":"call_00_...","type":"function","function":{"name":"search_files","arguments":"<arguments as a JSON string>"}}]}
{"role":"tool","tool_call_id":"call_00_...","name":"search_files","content":"(no matches)"}
```

- Roles: `user` / `assistant` / `tool` — the `tool` role already maps to `RoleToolOutput` in `parseFlatRoleJSONL`
- `content` is a string (empty when a turn is tool-only)
- **No `timestamp` and no `sessionId`** — the format is positional
- Tool arguments live in `tool_calls[].function.arguments` as a JSON string, and the assistant line carries the tool name — that is where "what this session actually ran" lives

## What is missing compared with the current flatrole path

1. **Timestamps.** The transcript has none; `<name>.events.jsonl` carries `ts` per event and `model.final` carries `usage` + `costUsd`. Right now every reasonix session renders as `· - ·`, and `--since` cannot filter them. File mtime would be a reasonable fallback.
2. **Project.** Flat store, so `commandCodeProject()` returns empty. The cwd is not in the transcript either; session names sometimes encode a topic (for example `code-scripts-202606200404`).
3. **Harness name.** Shows as `commandcode` rather than `reasonix`.
4. **Layout.** A dedicated source can simply walk `*.jsonl` and skip `*.events.jsonl` (today the event stream is walked too and harmlessly yields zero messages, since no line has a `role`).

## Suggested shape

A `reasonix.go` reusing `parseFlatRoleJSONL` exactly like `commandcode`/`zcode` do:

- root `~/.reasonix/sessions`, override via `DEJA_REASONIX_ROOT`
- transcripts: `*.jsonl` minus `*.events.jsonl`
- fill timestamp (and optionally project) from the sibling `.events.jsonl` when present

## Fixtures

Happy to provide redacted fixtures, synthetic or scrubbed.

---

Environment: Windows x64, deja 0.21.2 (installed via the npm package `dsh-deja`). 851 sessions indexed: 574 `deepseek` (DeepSeek Harness), 222 `zcode`, 49 reachable today only through the `DEJA_COMMANDCODE_ROOT` workaround.

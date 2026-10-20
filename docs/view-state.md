# View state JSON

`toViewState(session)` turns the folded session view into JSON. Its purpose is comparison. If you fold the same events
with this library and with Actlet's Go view model (`internal/view`) and dump both in this format, the two should be equal.
`fixtures/demo.view.json` is the TypeScript side for the demo recording, and a test keeps it current.

The format is version 1. Field names are snake_case. Integers are JSON numbers. Times are RFC 3339 in UTC with
nanoseconds, trailing zeros trimmed, as Go's `time.RFC3339Nano` writes them. An event without a time is placed at
`1970-01-01T00:00:00Z`, as the Go model does. Text is sanitized.

```jsonc
{
  "version": 1,
  "id": "", // the session ID the viewer was given
  "epoch": 1, // the highest epoch seen
  "state": "SESSION_STATE_COMPLETED",
  "reason": "task completed",
  "resumed": false,
  "profile": "demo",
  "events": 78, // events folded
  "skipped": 0, // events known to be missing
  "first": "2026-10-20T19:35:11.704622Z", // null before an event with a time
  "last": "2026-10-20T19:36:55.07073Z",
  "info": {
    // null before session_info
    "task_id": "",
    "task_kind": "",
    "task": "",
    "config": "",
    "budgets": [/* Budget, Protobuf JSON with proto field names */],
    "models": {/* ModelCatalog, the same */},
    "tools": [/* ToolInfo */],
    "grants": [/* ToolGrant */],
    "manifest": "",
    "worker_id": "",
    "version": "",
    "local_commands": [],
  },
  "usage": { "input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "cost": 0, "currency": "" },
  "items": [/* Item: the session's own timeline */],
  "dropped": 0,
  "workers": [
    // in tree order: root, root.1, root.1.1, root.2
    {
      "id": "root",
      "parent": "",
      "call_id": "",
      "model": "large",
      "task": "",
      "status": "finished", // running | finished | failed
      "result": "",
      "turns": 9,
      "context": 20100,
      "usage": {/* as above */},
      "items": [/* Item */],
      "dropped": 0,
    },
  ],
  "files": [{ "path": "output/report.md", "added": 11, "removed": 2, "changes": 3 }],
  "models": ["fast", "large"],
  "log": [{ "epoch": 1, "seq": 1, "time": "…", "worker": "", "text": "started: run 1, resumed false" }],
  "log_dropped": 0,
}
```

An item:

```jsonc
{
  "kind": "turn", // turn | note | system
  "epoch": 1,
  "seq": 5,
  "time": "…",
  "turn": {
    // null unless kind is turn
    "number": 1,
    "model": "large",
    "text": "…",
    "usage": {/* as above */},
    "stop": "tool_use", // the stop reason, lower case without its prefix
    "unseen": false, // tool calls whose turn the viewer never saw
    "calls": [
      {
        "call_id": "call_1_1",
        "name": "read_file",
        "input": "{…}",
        "status": "ok", // running | ok | error | unknown
        "output": "…",
        "took_ns": 20000000,
        "diffs": [{ "path": "../output/report.md", "created": true, "diff": "…" }],
        "child": "", // the subagent a spawn_subagent call started
        "epoch": 1,
        "seq": 6,
      },
    ],
  },
  "text": "",
  "from": "",
  "warn": false,
}
```

The Go model's internal fields, such as its per-worker call index and latest turn, aren't part of the format.

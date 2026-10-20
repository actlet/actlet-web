# Working on @actlet/viewer

A React component library that shows an Actlet session's activity, live or replayed. The README covers usage. This file
covers working on the code.

## Rules

- **No transports.** The library never opens connections (fetch, WebSocket, EventSource, gRPC-web) and never parses
  `.actrec` files. Implementors feed decoded events and deliver commands and file reads themselves.
- **Event content is untrusted.** Render it as React text only. Never use `dangerouslySetInnerHTML` or `innerHTML`, which
  lint forbids, and render no links from content. Untrusted strings go through `sanitize` (the fold does this) and the
  `Text` component, which cuts long text and marks Actlet's own truncation. New panels need cases in
  `test/safety.test.tsx`.
- **The view model is a port of Actlet's Go view model** (`internal/view` in the Actlet repository). Keep
  `src/view/session.ts` and `src/view/sanitize.ts` in step with it: the same events must give the same view state, down
  to the wording of system lines and log lines. A change to the fold changes `fixtures/demo.view.json`, so review that
  diff.
- **Generated code** in `src/gen/` comes from Actlet's gateway contract via `pnpm generate`. Don't edit it by hand.
- The terminal viewer is the reference for look and wording: turns grouped, tool calls with their results, the compact
  status line, the sidebar, the tabs.

## Layout

```
src/
  events.ts          decoding events from Protobuf JSON
  view/              the session view: fold (session.ts), sanitize, paths, formatting, highlighting, view-state JSON
  replay/player.ts   playback over a fed array, with time passed in
  react/             components, hooks and commands
  styles.css         theming through CSS custom properties
  gen/               generated from actlet/gateway/v0/gateway.proto
demo/                the dev page (pnpm dev)
fixtures/            demo.jsonl (Actlet's demo session) and demo.view.json (its folded state)
test/                vitest: the fold, sanitizing, components, untrusted payloads
```

## Checks

Before committing, run `pnpm build`, `pnpm test`, `pnpm lint` and `pnpm typecheck`. Commit messages follow Conventional
Commits.

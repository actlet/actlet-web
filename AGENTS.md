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
- **Nothing in `core` imports React.** `pnpm smoke` checks that a core-only bundle has none.
- **Accessibility is tested.** New controls need a keyboard path and labels. `test/a11y.test.tsx` runs axe, a keyboard
  walkthrough, and the built-in themes' contrast (4.5:1).
- **Colours come from themes in the terminal viewer's format.** The stylesheet uses only the theme's tokens
  (`--actlet-<token>`, with `-weight`, `-style` and `-line` for emphasis), and `faint` only for decoration. The
  built-in themes are Actlet's `themes/*.yaml`, copied byte for byte (`pnpm parity:go` checks them) and held as data in
  `src/view/theme.ts`. `scripts/theme-css.mjs` writes the stylesheet's theme blocks from that data. Change a built-in
  theme in Actlet first.
- **Long sessions stay cheap.** Don't hold every event, render every item or recompute per event what can be computed
  per render. `test/scale.test.tsx` and `pnpm bench` measure it.
- The terminal viewer is the reference for look and wording: turns grouped, tool calls with their results, the compact
  status line, the sidebar, the tabs.

## Layout

```
src/
  index.ts, core.ts  the entries: everything, and everything without React (core)
  lib.ts             the build's entry: index plus the stylesheet
  events.ts          decoding events from Protobuf JSON
  commands.ts        building commands and tracking their outcomes
  view/              the session view: fold (session.ts), sanitize, paths, formatting, highlighting, themes,
                     view-state JSON
  replay/player.ts   playback over a fed array, with time passed in
  react/             components and hooks
  styles.css         the look, from the theme's tokens as CSS custom properties
  gen/               generated from actlet/gateway/v0/gateway.proto
demo/                the dev page (pnpm dev): replay, live, integration examples with mock servers, a theme file, a
                     synthetic session
scripts/             generate, record and export fixtures, bench, examples check, smoke test, parity, theme CSS
themes/              Actlet's built-in themes, dark, light and plain, byte for byte
fixtures/            demo.jsonl (Actlet's demo), standard.jsonl (every standard tool), digest.jsonl (a skill and a
                     compaction) and fork.jsonl (the digest forked from a checkpoint), each with its folded state
                     (*.view.json); the scenarios in standard/ and digest/
test/                vitest: the fold, sanitizing, components, untrusted payloads, scale, accessibility, parity
```

## Checks

Before committing, run `pnpm check`: build, typecheck, lint, test, and strict parity with the Go view model
(`pnpm parity:go`, which skips without Go or the Actlet repository). After regenerating the types from a new Actlet
commit, put that commit in `.actlet-commit`. Before changing the demo, its mock
servers or the packaging, also run `pnpm check:examples` and `pnpm smoke`. CI runs all of these
(`.github/workflows/ci.yml`). Note changes in `CHANGELOG.md` under the unreleased version. Commit messages follow
Conventional Commits. Releases are tags, and nothing publishes to npm automatically: see `RELEASING.md`.

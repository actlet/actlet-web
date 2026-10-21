# @actlet/viewer

React components that show an [Actlet](https://github.com/actlet/actlet) session's activity in the browser, as close to
Actlet's terminal viewer as the web allows. The conversation is grouped by model turn, and each tool call shows together
with its result. The viewer also has a compact status line, a sidebar of workers and changed files with a read-only file
viewer, and tabs for the session, task, profile, tools and raw events. It handles live sessions and replays.

**You feed it the events.** The library opens no connections and reads no `.actrec` recordings. How events reach the
browser is up to you: a WebSocket from your backend, server-sent events, a JSONL file you export with
`actlet-cli replay export --jsonl`. The same goes for commands. The viewer hands you a typed `Command` through `onCommand`,
and you deliver it.

![The demo recording in replay, dark theme](docs/demo-replay.png)

The package is private and has no licence yet.

## Use

```tsx
import { ActivityViewer, parseJsonl } from "@actlet/viewer";
import "@actlet/viewer/styles.css";

// Replay: the whole recording, with play, pause, seek and speed.
<ActivityViewer events={parseJsonl(jsonlText)} mode="replay" autoPlay speed={4} />

// Live: append events as they arrive; the stream follows the newest.
<ActivityViewer
  events={events}
  mode="live"
  connectionLabel="orchestrator eu-1"
  ended={streamClosed}
  onCommand={(cmd) => myBackend.send(cmd)}  // a typed actlet.gateway.v0.Command
  allowedCommands={["steer", "pause"]}      // steer notes only by default
  acks={acksFromMyBackend}                   // optional CommandAck[]
  readFile={(path) => myBackend.readFile(path)} // optional: files from the box
/>
```

Give the viewer a height. It fills its container. Feeding it from a WebSocket, server-sent events or a JSONL file is
covered in [docs/integration.md](docs/integration.md), with examples that run in the demo.

`@actlet/viewer/core` has everything without React: decoding events, the fold, replay timing, commands and the view-state
JSON. It's useful on a server, in a worker, or with another UI framework. The main entry exports all of it too.

### Events

`events` is an array of `ActivityEvent`s (`actlet.gateway.v0.ActivityEvent`), oldest first. Each one can be a
protobuf-es message or its [Protobuf JSON](https://protobuf.dev/programming-guides/json/) form. Both proto field names
(`model_turn`, as `actlet-cli replay export --jsonl` writes them) and JSON names (`modelTurn`) are accepted. Fields this
version doesn't know are ignored, and an object that isn't an event counts as a missed event.

- **Live:** pass a new array that starts with the same event objects and ends with the new ones. Only the new events are
  folded. An array that starts differently is folded from scratch.
- **Replay:** pass the whole recording. If the array grows (a recording still being written), the position is kept.
- Feed each event once. Actlet's gateway deduplicates events by ID, and the viewer, like Actlet's own view model, doesn't
  do it again.

`parseJsonl(text)` decodes JSON Lines, and `toEvent(json)` decodes a single event.

### Commands

In live mode, with `onCommand` set, the footer offers what `allowedCommands` allows:

- `"steer"`: an input line for operator notes;
- `"pause"`: Pause and Interrupt (drain and interrupt);
- `"stop"`: Stop, with a confirmation;
- `"profile_update"`: Raise a budget. Pick a budget, give its new limit, and optionally start its usage from zero.
  This sends a profile update with every budget (fields `["budgets"]`), since an update replaces them all.

The default is `["steer"]`: watching and light steering, like the terminal viewer. Replay mode never offers
commands.

Each command gets a fresh ID, and `commandOrigin` and `actor` set the origin and actor fields. The origin defaults to
`ORIGIN_REMOTE`, a viewer that isn't on the box's machine. A sent command shows as pending until the box reports it.
The viewer learns the outcome from the session's `command` events, or from `acks` you pass in. If `onCommand` throws
or returns a rejected promise, the command shows as not delivered. For your own UI, `steerCommand`, `pauseCommand`,
`stopCommand` and `raiseBudgetCommand` build the same messages, and `budgetDefinitions(session)` gives the budgets a
raise starts from.

### Standard tools and budgets

The agent's standard tools show in the conversation like any call, with what matters brought forward:

- **`decide`**: the question, then the decision, who made it and why. While waiting, it shows the options; expanded,
  the context the decider was given.
- **`llm`**: the model and the prompt, then the answer and what the call used (`fast · 180 in / 45 out · 0.0012 EUR`).
  Its cost counts towards the session's usage.
- **`report_progress`**: each report is a call in the timeline, and the latest is also in the status line and the
  Session tab.
- **`send_feedback`**: the call, plus a list in the Session tab.

The Session and Profile tabs show each budget's limit, what is used of it, and its state: past the alert, used up, or
used up while work waits. The status line warns when a budget is used up, and screen readers hear it. A profile update
shows in the timeline with what it changed and whether it was accepted.

![The money budget used up and the decision waiting for it](docs/budget-waiting.png)

### Compaction and skills

When a worker's context nears its model's window, Actlet has a model summarise its older turns. The worker's timeline
then says so: "context compacted at 5380 tokens: 1 turn summarised by fast, the last 2 kept". Expanding that line shows
the summary, and the summary's model call counts towards the worker's and the session's usage. The Profile tab shows
the compaction policy: when it compacts, which model writes the summary, and how many turns it keeps.

A session forked from another's checkpoint (`actlet-cli fork`) has a fork marker in the header, and the Session tab
says where it comes from: "forked from <parent> at checkpoint 10 (turn 2)".

`skill` calls show the skill and the file read (`csv-report · reference.md`). The Tools tab lists the skills the agent
may load, from the session's start: each one's name, where it comes from (the image or the profile), its description
and its files, with what the agent loaded and read of it. Recordings from before Actlet listed the skills show only
the skills the agent used.

### Files

Selecting a file in the sidebar opens a read-only viewer. With `readFile`, the viewer asks you for the file. Paths are
relative to the session folder (`output/report.md`), and `toolPath()` turns them into the form Actlet's file requests
take (`../output/report.md`). Without `readFile`, the viewer shows what the events hold: a whole file if it was created
in one go and not cut short, or otherwise its latest change. File content is sanitized and capped at 512 KiB and 5,000
lines.

### Composable parts

`ActivityViewer` is built from parts you can use on their own. All of them take a `Session` from the view model:

| Part                                                                             | What it is                                                                               |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `TurnStream`                                                                     | The conversation: turns, tool blocks, nested subagents, notes, system lines, auto-follow |
| `ToolBlock`                                                                      | One tool call with its result or diff; collapsible                                       |
| `StatusLine`                                                                     | State pill, model, context %/window, cost and time against budgets, connection           |
| `Sidebar`                                                                        | Workers (click to show one alone) and changed files with `+N −M`                         |
| `FileViewer`                                                                     | The read-only file popup                                                                 |
| `Tabs`, `SessionPanel`, `TaskPanel`, `ProfilePanel`, `ToolsPanel`, `EventsPanel` | The other views                                                                          |
| `ReplayControls`, `CommandBar`                                                   | The footer controls                                                                      |
| `useLiveSession`, `useReplay`                                                    | Hooks that fold events for live view and replay                                          |

The view model has no React in it: `fold(events)`, `apply(session, event)`, `workers()`, `files()`, `fileHistory()`,
`running()` and friends. `Player` plays an event array back with time you pass in. `toViewState(session)` gives the
view state as JSON (see [docs/view-state.md](docs/view-state.md)).

### Long sessions

From 150 items on, the conversation is virtualised: only the items in and near the view are in the page, measured as
they render, and the view keeps following the end. A subagent nests only its latest 40 items under its spawn call; the
rest show when it's shown alone. Memory stays bounded. Each timeline keeps its latest 2,000 items and the event log its
latest 5,000 lines. Calls of turns that fall off are let go, and any text past 256 KiB is cut and marked. Live mode
folds only appended events and keeps no reference to them.

Measured on a synthetic 20,000-event session (`pnpm bench`, headless Chrome, production build, over two runs):

|                                                             |                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| Fold all 20,000 events                                      | 196–205 ms                                                               |
| Append 250 events live, to the second painted frame         | 33 ms on average, 37 ms at the 95th percentile (two frames is the floor) |
| Scroll the whole conversation, one step per frame           | 16.7 ms frames, none over 50 ms; 16 items in the page                    |
| JS heap at the end, with the 20,000 events held by the page | 39–40 MB                                                                 |

### Keyboard and screen readers

The tabs, the conversation and the sidebar each take one tab stop. Inside them, arrow keys (or `j` and `k`) move, and
`Home` and `End` jump to either end. In the conversation, arrow keys move between tool calls, and `Enter` or `Space`
expands one. A file opens in a dialog that keeps focus inside, closes on `Escape` and returns focus to the file. In a
replay, `Space` or `k` plays and pauses, `←` and `→` step one event (ten with `Shift`), and `+` and `-` change the
speed. Asking to stop focuses Cancel first. `?`, or `? help` at the end of the status line, opens a dialog that lists
every shortcut and the commands on offer. It comes from the same key map the viewer's handlers use. Typed into the note
line, `?` is just a question mark.

Icons, regions and lists have roles and labels. The status line isn't a live region, because it ticks every second;
instead, state changes are announced. Text colours meet WCAG AA (4.5:1) in the built-in themes, and the spinner stops for
readers who ask for less motion. jsx-a11y lints the components, axe runs over every view in the tests, and a test walks
through the viewer by keyboard alone.

### Themes

The viewer takes its colours from a theme in the format of Actlet's terminal viewer, so one theme file styles both
(`actlet attach -theme ./ocean.yaml` and the web page):

```tsx
import { parse } from "yaml"; // or JSON.parse for a .json theme

<ActivityViewer events={events} />                                // "auto": dark or light, as the system is
<ActivityViewer events={events} theme="light" />                  // a built-in theme: dark, light or plain
<ActivityViewer events={events} theme={parse(oceanYaml)} />       // a theme file, parsed by you
```

- **Built-in themes:** `dark`, `light` and `plain`. `plain` has no colours of its own. It uses the page's own, with
  emphasis by bold, underline and reverse video. `auto`, the default, picks dark or light by the reader's system
  setting, and plain when they ask for more contrast or force their own colours. The built-in themes are Actlet's own
  files, shipped as `@actlet/viewer/themes/{dark,light,plain}.yaml`. Every text colour in them meets WCAG AA (4.5:1)
  on the background, the panels and a selected row.
- **Theme files:** YAML or JSON, which you read and parse. The viewer checks a theme as strictly as the terminal viewer
  does. Unknown fields, tokens and attributes are errors, as are colours that aren't `#rrggbb`, `#rgb`, `"0"` to
  `"255"` or `none`. A theme that isn't valid leaves the viewer dark, and the status line says why. `parseTheme()`
  checks one up front and throws a `ThemeError`.

```yaml
name: ocean
base: dark # dark (the default), light or plain: the tokens left out come from it
colors:
  accent: "#4FD1C5"
  background: none # the page's own background
  key: "33" # an ANSI colour number, 0 to 255, as the xterm palette has it
emphasis:
  key: [bold] # bold, italic, underline or reverse; replaces the base's emphasis for the token
```

The tokens are `background`, `panel` (the header, sidebar, status line, tool calls and code), `selection`, `border`,
`text`, `muted`, `faint` (decoration only, such as separators), `accent` (the title, the active tab, headings and the
worker shown), the speakers `agent`, `subagent` and `operator`, the states `ok`, `error` and `warning`, `attach`, the
diff's `added`, `removed` and `hunk`, and the syntax colours `keyword`, `string`, `number`, `comment`, `key`, `function`
and `punctuation`. The web viewer has no attach badge, so it doesn't use `attach`.

Each token is a CSS custom property on `.actlet-viewer`, `--actlet-<token>`, so a stylesheet can also restyle the viewer.
The fonts are `--actlet-font`, `--actlet-mono` and `--actlet-size`. The demo's "a theme file" example edits a theme live.

![The ocean theme file, edited in the demo](docs/theme-file.png)

### Untrusted content

Everything in the events comes from models, tools and files, so it's treated as untrusted:

- Content is rendered as React text only. HTML is never rendered: there is no `dangerouslySetInnerHTML` or `innerHTML`,
  and lint forbids both. The viewer renders no links, and syntax highlighting produces spans of text.
- Terminal escape sequences (CSI, OSC, DCS…), other control characters, carriage returns and bidirectional overrides are
  removed as events are folded, the same way Actlet's Go view model does it.
- Long text is cut short and says so: 20,000 characters per text, 3 result lines collapsed and 400 expanded.
  Content that Actlet itself cut short (`[... N bytes omitted ...]`, `[cut]`) is marked as such.

## Develop

Development needs Node 24, pnpm 10 and, for `pnpm generate`, `protoc`.

```sh
pnpm install
pnpm dev             # the demo page; ?mode=replay|standard|digest|fork|live|websocket|sse|jsonl|themed|synthetic, ?theme=light|plain|ocean, ?speed=8, ?at=27, ?tab=session
pnpm test            # vitest
pnpm lint            # eslint (with jsx-a11y) + prettier --check
pnpm typecheck
pnpm build           # dist/: ES modules, declarations, viewer.css
pnpm generate        # regenerate src/gen from ../actlet/proto (PROTO_DIR=… to override)
pnpm bench           # the 20,000-event numbers above, in headless Chrome
pnpm check:examples  # the integration examples end to end, in headless Chrome
pnpm smoke           # pack, install the tarball in a fresh Vite app, type-check and build it
pnpm parity:go       # strict parity with the Go view model on every fixture, and the theme files Actlet's own
pnpm check           # build, typecheck, lint, test and parity:go
```

**pnpm**, because its strict `node_modules` layout catches imports of undeclared dependencies, which matters for a
library. It also installs quickly, and `packageManager` in `package.json` pins its version.

### Packaging

`pnpm build` writes ES modules to `dist/`, one file per module, so bundlers keep only what an app uses. Declarations sit
next to them, and the stylesheet is `dist/viewer.css`. The exports map has `.`, `./core`, `./styles.css`, `./themes/*`
and `./package.json`. React 18 or 19 is the only peer dependency, and `@bufbuild/protobuf` the only dependency.
`pnpm pack` packs `dist/`, `themes/`, the README and `package.json`.

### Parity with the Go view model

`toViewState` writes the view state as JSON ([docs/view-state.md](docs/view-state.md)), and Actlet's
`actlet-cli replay view --json` writes the Go view model's in the same form. `pnpm parity:go` checks that the two agree
on every fixture, strictly:

- **The binary:** it builds `actlet-cli` from a snapshot of the commit in `.actlet-commit` of `../actlet`, leaving that
  repository as it is. `ACTLET_CLI=<binary>`, `ACTLET_REPO` and `ACTLET_COMMIT` change that.
- **What it does:** it dumps each `fixtures/*.jsonl` with Go, and lists every path where the dump differs from this
  library's fold. It also checks that `themes/*.yaml` are byte for byte the built-in themes at that commit.
- **Without Go:** with no Go toolchain or Actlet repository it says it skipped, and exits 0, unless `REQUIRE_PARITY=1`.

`pnpm check` runs everything: build, typecheck, lint, test and `parity:go`. For one pair of files, run
`pnpm parity events.jsonl go-view.json`. There, Go's `null` for an empty slice or map counts as empty unless
`PARITY_STRICT=1`.

### Generated types

`src/gen/` holds TypeScript generated from Actlet's gateway contract (`actlet/gateway/v0/gateway.proto`) by
[protobuf-es](https://github.com/bufbuild/protobuf-es), with JSON types. It's checked in. `pnpm generate` needs `protoc`
and reads `../actlet/proto` unless `PROTO_DIR` points elsewhere.

### The fixtures

Both are real recordings: scripted sessions run headless through Actlet's development gateway, exported as JSON Lines.

- `fixtures/demo.jsonl` is Actlet's TUI demo (`examples/demo` in the Actlet repository). It has a root agent, three
  subagents, an operator note, files written and edited, and a money budget past its alert.
- `fixtures/standard.jsonl` is a release check from `fixtures/standard/`. It uses every standard tool: progress,
  feedback, the budget, a decision and an llm call. Its money budget runs out, the work waits, and the operator raises
  the budget with a profile update.
- `fixtures/digest.jsonl` is a sales digest from `fixtures/digest/`. The agent loads a skill (`skills/csv-report`) and
  reads one of its files, and its context grows past a small window, so it is compacted half-way.
- `fixtures/fork.jsonl` is that digest forked at the checkpoint of its second turn and run on from there. It's a new
  session with its parent and checkpoint in its lineage.

To record them again, build Actlet's binaries into a scratch directory from the Actlet repository
(`go build -o "$tmp/bin/" ./cmd/...`), then:

```sh
scripts/record-fixture.sh "$tmp/bin" <actlet>/examples/demo fixtures/demo.jsonl fixtures/demo.operator
scripts/record-fixture.sh "$tmp/bin" fixtures/standard fixtures/standard.jsonl fixtures/standard.operator
scripts/record-fixture.sh "$tmp/bin" fixtures/digest fixtures/digest.jsonl
FORK_AT="turn 2" scripts/record-fixture.sh "$tmp/bin" fixtures/digest fixtures/fork.jsonl
UPDATE_GOLDEN=1 pnpm test   # rewrite fixtures/*.view.json, the folded view states; review the diff
```

The operator files hold the gateway commands sent during the run, at their times. Exporting replaces home directory
paths, and the scratch folder the session ran in shows as `/work`.

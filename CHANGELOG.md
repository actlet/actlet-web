# Changelog

Changes to `@actlet/viewer`, newest first. A release's section is headed `## <version> - <date>`. Until it has a date
it is unreleased, and the release workflow refuses to tag it. See [RELEASING.md](RELEASING.md).

## 0.1.0 - unreleased

The first version: React components that show an Actlet session's activity, live or replayed, from events the app
feeds them.

### The viewer

- `ActivityViewer`, live or replaying a recording. It shows the conversation grouped by model turn, each tool call with
  its result or diff, and nested subagents. It has a compact status line, a sidebar of workers and changed files with
  a read-only file viewer, and tabs for the session, task, profile, tools and raw events.
- The standard tools: progress, feedback, budgets, decisions, side calls to other models, skills, compaction, and
  sessions forked from a checkpoint.
- Commands through `onCommand`: operator notes by default. Pause, stop and raising a budget are offered when allowed,
  and each command's outcome is shown.
- The look of Actlet's terminal viewer. Separators are on by default, and the status line shows the context against
  the model's window and the cost and time against their budgets. JSON and YAML are highlighted.
- Themes in the terminal viewer's format, so one file styles both: `auto`, `dark`, `light` and `plain` are built in,
  or the app passes a theme file it has parsed. The built-in themes ship as `@actlet/viewer/themes/*.yaml`.
- `?` lists every keyboard shortcut and command.

### The view model

- `@actlet/viewer/core`, with no React: decoding events, folding them into a session view, sanitizing, replay timing
  and the view state as JSON. It is a port of Actlet's Go view model, kept strictly equal to `replay view --json` on
  recorded sessions.

### Quality

- Untrusted content is rendered as text only, sanitized and cut to bounds.
- Keyboard use and screen readers are tested, and every built-in text colour meets 4.5:1.
- A 20,000-event session folds in about 200 ms and scrolls at 60 frames a second.

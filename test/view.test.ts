import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CommandResult, Origin, SessionState } from "../src/gen/actlet/gateway/v0/gateway_pb";
import { conversation, keyArgs, recordedFile, resultLines } from "../src/view/format";
import { sessionPath, toolPath } from "../src/view/paths";
import {
  MAX_ITEMS,
  MAX_LOG,
  apply,
  compareWorkers,
  fileHistory,
  files,
  fold,
  models,
  newSession,
  running,
  workers,
  type Session,
} from "../src/view/session";
import { toViewState } from "../src/view/state-json";
import { Events, demoEvents, fixture } from "./helpers";

/** A session whose agent spawns a subagent. */
function subagentRun() {
  const e = new Events();
  e.add("", { case: "started", value: { epoch: 1n, profileId: "coding" } });
  e.add("", {
    case: "sessionInfo",
    value: {
      taskId: "t1",
      taskKind: "agent",
      task: '{"id":"t1"}',
      config: '{"model":"large"}',
      tools: [{ name: "shell", policy: "never" }],
    },
  });
  e.add("", { case: "state", value: { to: SessionState.RUNNING, reason: "started" } });
  e.add("root", {
    case: "modelTurn",
    value: {
      turn: 1n,
      model: "large",
      text: "Splitting.",
      toolCalls: ["spawn_subagent"],
      usage: { inputTokens: 1000n, outputTokens: 20n },
    },
  });
  e.add("root.1", { case: "subagentSpawned", value: { parent: "root", task: "write a", model: "fast", callId: "s1" } });
  e.add("root.1", {
    case: "modelTurn",
    value: { turn: 1n, model: "fast", toolCalls: ["write_file"], usage: { inputTokens: 300n, outputTokens: 5n } },
  });
  e.add("root.1", { case: "toolStarted", value: { callId: "c1", tool: "write_file", input: '{"path":"a"}' } });
  e.add("root.1", { case: "fileChange", value: { callId: "c1", path: "a", created: true, diff: "+x\n" } });
  e.add("root.1", {
    case: "toolFinished",
    value: { callId: "c1", tool: "write_file", output: "created a", took: { nanos: 1_000_000 } },
  });
  e.add("", { case: "steer", value: { note: "be quick", origin: Origin.LOCAL, actor: "alice" } });
  e.add("root.1", { case: "subagentFinished", value: { result: "wrote a", turns: 2n } });
  e.add("root", { case: "toolFinished", value: { callId: "s1", tool: "spawn_subagent", output: "wrote a" } });
  e.add("root", {
    case: "modelTurn",
    value: { turn: 2n, model: "large", text: "Done.", usage: { inputTokens: 1100n, outputTokens: 3n } },
  });
  e.add("", { case: "state", value: { from: SessionState.RUNNING, to: SessionState.COMPLETED } });
  return e.out;
}

describe("fold", () => {
  it("folds a run with a subagent", () => {
    const s = fold(subagentRun());
    expect([s.state, s.epoch, s.profile, s.events]).toEqual([SessionState.COMPLETED, 1, "coding", 14]);
    expect(s.info?.taskId).toBe("t1");
    expect(s.info?.tools).toHaveLength(1);
    expect(workers(s).map((w) => w.id)).toEqual(["root", "root.1"]);
    const root = s.workers.get("root")!,
      sub = s.workers.get("root.1")!;
    expect([root.turns, root.context, root.model, root.status]).toEqual([2, 1100, "large", "finished"]);
    expect([sub.parent, sub.task, sub.model, sub.status, sub.result]).toEqual([
      "root",
      "write a",
      "fast",
      "finished",
      "wrote a",
    ]);
    // The subagent's turn holds its tool call, with the result and diff.
    expect(sub.items).toHaveLength(1);
    const call = sub.items[0].turn!.calls[0];
    expect([call.status, call.output, call.diffs.length, call.diffs[0].created, call.took]).toEqual([
      "ok",
      "created a",
      1,
      true,
      1_000_000,
    ]);
    // The root's first turn holds the spawn call, which leads to the subagent.
    expect(root.items).toHaveLength(2);
    expect(root.items[0].turn!.text).toBe("Splitting.");
    const spawn = root.items[0].turn!.calls[0];
    expect([spawn.child, spawn.status, spawn.name]).toEqual(["root.1", "ok", "spawn_subagent"]);
    expect(files(s)).toEqual([{ path: "workspace/a", added: 1, removed: 0, changes: 1 }]);
    expect([s.usage.input, s.usage.output]).toEqual([2400, 28]);
    expect(models(s)).toEqual(["fast", "large"]);
    expect(s.items.filter((it) => it.kind === "note" && it.from === "alice" && it.text === "be quick")).toHaveLength(1);
    expect(s.log).toHaveLength(14);
    expect(running(s).count).toBe(0);
    expect(s.last!.at - s.first!.at).toBe(13_000);
  });

  it("is deterministic", () => {
    const a = fold(subagentRun()),
      b = newSession();
    for (const ev of subagentRun()) apply(b, ev);
    expect(toViewState(b)).toEqual(toViewState(a));
    apply(b, subagentRun()[3]);
    expect(toViewState(b)).not.toEqual(toViewState(a));
  });

  it("tracks running calls and unknown outcomes", () => {
    const e = new Events();
    e.add("root", { case: "toolStarted", value: { callId: "a", tool: "shell" } });
    e.add("root", { case: "toolStarted", value: { callId: "b", tool: "grep" } });
    let s = fold(e.out);
    const r = running(s);
    expect([r.worker?.id, r.call?.name, r.count]).toEqual(["root", "grep", 2]);
    // A recovered call reports an outcome without having started in this run.
    e.add("root", { case: "toolFinished", value: { callId: "z", tool: "shell", outcomeUnknown: true, isError: true } });
    e.add("", { case: "gap", value: { dropped: 7n } });
    s = fold(e.out);
    const turn = s.workers.get("root")!.items[0].turn!;
    const last = turn.calls[2];
    expect([turn.unseen, last.callId, last.status, s.skipped]).toEqual([true, "z", "unknown", 7]);
  });

  it("bounds timelines and the log", () => {
    const e = new Events();
    for (let i = 0; i < MAX_LOG + 10; i++) e.add("root", { case: "text", value: { text: `line ${i}` } });
    const s = fold(e.out);
    const w = s.workers.get("root")!;
    expect([w.items.length, w.dropped, w.items[0].text]).toEqual([
      MAX_ITEMS,
      MAX_LOG + 10 - MAX_ITEMS,
      `line ${MAX_LOG + 10 - MAX_ITEMS}`,
    ]);
    expect([s.log.length, s.logDropped]).toEqual([MAX_LOG, 10]);
  });

  // The sidebar's files: paths relative to the session folder, and every
  // change of a file counted, in the order the changes were made.
  it("lists changed files", () => {
    const e = new Events();
    e.add("root", { case: "toolStarted", value: { callId: "w", tool: "write_file" } });
    e.add("root", {
      case: "fileChange",
      value: { callId: "w", path: "../output/report.md", created: true, diff: "+a\n+b\n+c\n" },
    });
    e.add("root.1", { case: "toolStarted", value: { callId: "e", tool: "edit_file" } });
    e.add("root.1", {
      case: "fileChange",
      value: { callId: "e", path: "../output/report.md", diff: "@@ -2 +2 @@\n-b\n+B\n" },
    });
    e.add("root", { case: "toolStarted", value: { callId: "t", tool: "write_file" } });
    e.add("root", { case: "fileChange", value: { callId: "t", path: "./totals.py", created: true, diff: "+x\n" } });
    const s = fold(e.out);
    expect(files(s)).toEqual([
      { path: "output/report.md", added: 4, removed: 1, changes: 2 },
      { path: "workspace/totals.py", added: 1, removed: 0, changes: 1 },
    ]);
    const h = fileHistory(s, "output/report.md");
    expect(h.map((d) => d.created)).toEqual([true, false]);
  });

  it("maps paths between tools and the session folder", () => {
    for (const [tool, session] of [
      ["totals.py", "workspace/totals.py"],
      ["./a/b.md", "workspace/a/b.md"],
      ["../output/report.md", "output/report.md"],
      ["../inputs/sales.csv", "inputs/sales.csv"],
      ["/abs/file", "/abs/file"],
    ]) {
      expect(sessionPath(tool)).toBe(session);
      expect(sessionPath(toolPath(session))).toBe(session);
    }
  });

  it("orders workers as a tree", () => {
    const ids = ["root.10", "root.2", "root", "root.1.1", "root.1"];
    expect([...ids].sort(compareWorkers)).toEqual(["root", "root.1", "root.1.1", "root.2", "root.10"]);
  });

  it("words commands and state changes", () => {
    const e = new Events();
    e.add("", {
      case: "command",
      value: {
        command: { id: "c1", origin: Origin.ORCHESTRATOR, action: { case: "pause", value: { mode: 1 } } },
        result: CommandResult.REJECTED,
        message: "not now",
      },
    });
    e.add("", {
      case: "command",
      value: {
        command: { id: "c2", origin: Origin.REMOTE, action: { case: "stop", value: {} } },
        result: CommandResult.ACCEPTED,
      },
    });
    e.add("", { case: "state", value: { from: SessionState.RUNNING, to: SessionState.FAILED, reason: "boom" } });
    const s = fold(e.out);
    expect(s.items.map((it) => [it.text, it.warn])).toEqual([
      ["pause (drain) from the orchestrator rejected: not now", true],
      ["stop from a remote operator accepted", false],
      ["session failed: boom", true],
    ]);
    expect(s.log.map((l) => l.text)).toEqual([
      "command c1: pause (drain) rejected",
      "command c2: stop accepted",
      "state: running → failed (boom)",
    ]);
  });
});

describe("the demo recording", () => {
  const s: Session = fold(demoEvents());

  it("has the root agent and three subagents", () => {
    expect(workers(s).map((w) => [w.id, w.parent, w.model, w.status])).toEqual([
      ["root", "", "large", "finished"],
      ["root.1", "root", "fast", "finished"],
      ["root.2", "root", "fast", "finished"],
      ["root.3", "root", "fast", "finished"],
    ]);
  });

  it("ends completed", () => {
    expect(s.state).toBe(SessionState.COMPLETED);
    expect(s.events).toBe(81);
    expect(s.skipped).toBe(0);
  });

  it("groups each worker's tool calls into its turns", () => {
    const root = s.workers.get("root")!;
    const turns = root.items.filter((it) => it.kind === "turn").map((it) => it.turn!);
    expect(turns.map((t) => t.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(turns.some((t) => t.unseen)).toBe(false);
    expect(turns[2].calls.map((c) => [c.name, c.child])).toEqual([
      ["spawn_subagent", "root.1"],
      ["spawn_subagent", "root.2"],
      ["spawn_subagent", "root.3"],
    ]);
    // Every call is paired with its result.
    for (const w of workers(s)) {
      for (const it of w.items) for (const c of it.turn?.calls ?? []) expect(c.status, c.callId).not.toBe("running");
    }
    expect(running(s).count).toBe(0);
  });

  it("counts every change of the report", () => {
    const report = files(s).find((f) => f.path === "output/report.md");
    expect(report).toEqual({ path: "output/report.md", added: 11, removed: 2, changes: 3 });
    expect(recordedFile(s, "output/report.md").diff).toBe(true);
  });

  it("shows the conversation with the operator's note", () => {
    const entries = conversation(s);
    const notes = entries.filter((e) => e.item.kind === "note");
    expect(notes).toHaveLength(1);
    expect(notes[0].item.text).toContain("quote every figure in EUR");
    // Subagents nest under their spawn calls, not at the top level.
    expect(entries.every((e) => e.worker === null || e.worker.id === "root")).toBe(true);
  });

  it("describes calls like the terminal viewer", () => {
    const calls = s.workers.get("root")!.items.flatMap((it) => it.turn?.calls ?? []);
    const edit = calls.find((c) => c.name === "edit_file")!;
    expect(keyArgs(edit)).toBe("../output/report.md  +1 −1");
    expect(resultLines(edit).map((l) => l.tone)).toContain("add");
  });

  // The view state as JSON: the TypeScript side of comparing with the Go
  // view model. UPDATE_GOLDEN=1 rewrites the golden file.
  it("matches the golden view state", () => {
    const golden = fixture("demo.view.json");
    const got = JSON.stringify(toViewState(s), null, 2) + "\n";
    if (process.env.UPDATE_GOLDEN) writeFileSync(golden, got);
    expect(got).toBe(readFileSync(golden, "utf8"));
  });
});

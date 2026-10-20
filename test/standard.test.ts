import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BudgetKind, CommandResult, Origin } from "../src/gen/actlet/gateway/v0/gateway_pb";
import { budgetAlarm, budgetDefinitions, budgetLine, budgets } from "../src/view/budgets";
import { decideView, keyArgs, llmView, progressText, toolLabel } from "../src/view/format";
import { amount, commandName, describe as describeEvent, fold, MAX_FEEDBACK, type ToolCall } from "../src/view/session";
import { toViewState } from "../src/view/state-json";
import { raiseBudgetCommand } from "../src/commands";
import { Events, fixture, standardEvents } from "./helpers";

const events = standardEvents();

function calls(name: string): ToolCall[] {
  const s = fold(events);
  return s.workers
    .get("root")!
    .items.flatMap((it) => it.turn?.calls ?? [])
    .filter((c) => c.name === name);
}

describe("the standard tools recording", () => {
  const s = fold(events);

  it("keeps the latest progress report", () => {
    expect(s.progress).toMatchObject({ worker: "root", message: "Release check finished", percent: 100 });
    expect(progressText(s.progress!)).toBe("100% · Release check finished");
    // The history is in the timeline, as the report_progress calls.
    expect(calls("report_progress").map(keyArgs)).toEqual([
      "10% · Reading the release notes",
      "40% · Summary drafted",
      "90% · Summary written",
      "100% · Release check finished",
    ]);
  });

  it("lists the feedback", () => {
    expect(s.feedback.map((f) => [f.worker, f.kind, f.message])).toEqual([
      ["root", "suggestion", "Give the archive action an undo, or a confirmation step, before it is advertised."],
    ]);
  });

  it("shows the decision, who made it and why", () => {
    const [decide] = calls("decide");
    expect(toolLabel(decide.name)).toBe("Decide");
    expect(decideView(decide)).toEqual({
      question: "Ship release 2.4 today, although the archive action has no undo yet?",
      options: ["ship today", "wait for undo"],
      context: expect.stringContaining("can't be undone"),
      decision: {
        decision: "ship today",
        decidedBy: "the release manager",
        reason: expect.stringContaining("promised to two customers"),
      },
    });
  });

  it("shows the llm call's model, answer and what it used", () => {
    const [llm] = calls("llm");
    expect(llmView(llm)).toMatchObject({ model: "fast", prompt: expect.stringContaining("Summarise") });
    expect(keyArgs(llm)).toMatch(/^fast · Summarise these release notes/);
    expect(llm.output).toMatch(/^Release 2\.4 makes report exports/);
    expect(llm.usage).toMatchObject({ input: 180, output: 45, cost: 0.0012, currency: "EUR" });
    // What it cost counts towards the session's usage.
    const turns = s.workers.get("root")!.items.flatMap((it) => (it.turn && !it.turn.unseen ? [it.turn] : []));
    const fromTurns = turns.reduce((n, t) => n + t.usage.cost, 0);
    expect(s.usage.cost).toBeCloseTo(fromTurns + 0.0012, 10);
  });

  it("follows the budgets through the alert, the wait and the raise", () => {
    const at = (n: number) => fold(events.slice(0, n));
    const seqOf = (reason: string) =>
      events.findIndex((e) => e.body.case === "budgetStatus" && e.body.value.reason === reason) + 1;

    const alerted = at(seqOf("alert"));
    expect(budgets(alerted)[0]).toMatchObject({ kind: BudgetKind.MONEY, limit: 0.04, state: "alerted" });
    expect(budgetAlarm(alerted)).toBe("");

    const waiting = at(seqOf("exhausted"));
    expect(budgetLine(waiting, budgets(waiting)[0]).text).toMatch(
      /^money {2}limit 0\.04 EUR {3}used 0\.05 \(137%\) {2}used up; work waits$/,
    );
    expect(budgetAlarm(waiting)).toBe("waiting for the money budget");

    const raised = at(seqOf("update"));
    expect(budgets(raised)[0]).toMatchObject({ limit: 0.2, state: "ok" });
    expect(budgetAlarm(raised)).toBe("");
    // The operator's profile update and its outcome.
    expect(s.items.map((it) => it.text)).toContain(
      "profile update (budgets) from the orchestrator accepted: changed budgets",
    );

    expect(budgets(s).map((b) => [b.kind, b.limit, b.state])).toEqual([
      [BudgetKind.MONEY, 0.2, "alerted"],
      [BudgetKind.TOKENS, 100000, "ok"],
    ]);
  });

  it("builds a raise from the budgets as they stand", () => {
    const defs = budgetDefinitions(s);
    expect(defs.map((b) => [b.kind, b.limit, b.alertAtPercent])).toEqual([
      [BudgetKind.MONEY, 0.2, 50],
      [BudgetKind.TOKENS, 100000, 0],
    ]);
    const cmd = raiseBudgetCommand(defs, BudgetKind.MONEY, 0.5, true, { actor: "op", newId: () => "c1" });
    expect(cmd.action.case).toBe("profileUpdate");
    const u = cmd.action.case === "profileUpdate" ? cmd.action.value : null;
    expect(u?.fields).toEqual(["budgets"]);
    expect(u?.resetBudgets).toEqual([BudgetKind.MONEY]);
    expect(u?.profile?.budgets.map((b) => [b.kind, b.limit, b.onExhaust, b.waitMode])).toEqual([
      [BudgetKind.MONEY, 0.5, defs[0].onExhaust, defs[0].waitMode],
      [BudgetKind.TOKENS, 100000, defs[1].onExhaust, defs[1].waitMode],
    ]);
    expect([cmd.id, cmd.actor, cmd.origin]).toEqual(["c1", "op", Origin.REMOTE]);
    expect(commandName(cmd)).toBe("profile update (budgets; reset money)");
  });

  it("matches the golden view state", () => {
    const golden = fixture("standard.view.json");
    const got = JSON.stringify(toViewState(s), null, 2) + "\n";
    if (process.env.UPDATE_GOLDEN) writeFileSync(golden, got);
    expect(got).toBe(readFileSync(golden, "utf8"));
  });
});

describe("as the Go view model words them", () => {
  // Go's own output for these figures, from fmt's %.0f and %.4g.
  it.each([
    [0, "0"],
    [0.5, "0.5"],
    [0.04, "0.04"],
    [0.05475000000000001, "0.05475"],
    [0.11535000000000001, "0.1154"],
    [12.5, "12.5"],
    [100000, "100000"],
    [999.95, "1000"],
    [2500.5, "2500"],
    [3500.5, "3500"],
    [1048576, "1048576"],
    [0.00001234, "1.234e-05"],
    [0.0001234, "0.0001234"],
    [123.456, "123.5"],
    [9999.5, "10000"],
    [-3.5, "-3.5"],
  ])("amount(%s) is %s", (v, want) => {
    expect(amount(v)).toBe(want);
  });

  it("names profile updates by what they change", () => {
    const e = new Events();
    const update = (fields: string[], resetBudgets: BudgetKind[]) =>
      e.add("", {
        case: "command",
        value: {
          command: {
            id: "u",
            origin: Origin.ORCHESTRATOR,
            action: { case: "profileUpdate", value: { fields, resetBudgets } },
          },
          result: CommandResult.ACCEPTED,
        },
      });
    update(["budgets"], []);
    update(["budgets"], [BudgetKind.MONEY]);
    update(["limits.max_workers", "local_attach"], [BudgetKind.MONEY, BudgetKind.TOKENS]);
    update([], [BudgetKind.MONEY]);
    update([], []);
    const s = fold(e.out);
    expect(s.items.map((it) => it.text)).toEqual([
      "profile update (budgets) from the orchestrator accepted",
      "profile update (budgets; reset money) from the orchestrator accepted",
      "profile update (limits.max_workers; local_attach; reset money, tokens) from the orchestrator accepted",
      "profile update (reset money) from the orchestrator accepted",
      "profile update () from the orchestrator accepted",
    ]);
  });

  it("describes the new events in the log", () => {
    const e = new Events();
    e.add("root", { case: "progress", value: { message: "half\nway", percent: 50 } });
    e.add("root", { case: "progress", value: { message: "no figure" } });
    e.add("root", { case: "progress", value: { message: "over", percent: 250 } });
    e.add("root", { case: "feedback", value: { kind: "problem", message: "the input is empty" } });
    e.add("", {
      case: "budgetStatus",
      value: {
        reason: "alert",
        budgets: [
          { kind: BudgetKind.MONEY, limit: 0.6, used: 0.35219999999999996, currency: "EUR", state: "alerted" },
          { kind: BudgetKind.DISK, limit: 1048576, used: 2048, state: "ok" },
        ],
      },
    });
    const s = fold(e.out);
    expect(e.out.map(describeEvent)).toEqual([
      "progress 50%: half",
      "progress: no figure",
      "progress 250%: over",
      "feedback (problem): the input is empty",
      "budget_status (alert): money 0.3522/0.6 alerted, disk 2048/1048576 ok",
    ]);
    // A percentage over 100 is shown as 100; none is -1.
    expect(s.progress?.percent).toBe(100);
    expect(fold(e.out.slice(0, 2)).progress?.percent).toBe(-1);
  });

  it("bounds the feedback kept", () => {
    const e = new Events();
    for (let i = 0; i < MAX_FEEDBACK + 5; i++)
      e.add("root", { case: "feedback", value: { kind: "other", message: `${i}` } });
    const s = fold(e.out);
    expect([s.feedback.length, s.feedbackDropped, s.feedback[0].message]).toEqual([MAX_FEEDBACK, 5, "5"]);
  });
});

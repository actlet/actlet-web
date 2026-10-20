import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityViewer } from "../src/react/ActivityViewer";
import { TABS } from "../src/react/Tabs";
import { Origin, SessionState } from "../src/gen/actlet/gateway/v0/gateway_pb";
import { Events } from "./helpers";

afterEach(cleanup);

// Event content comes from models, tools and files: it is untrusted.
const payloads = [
  "<script>window.__pwned = 1</script>",
  '<img src=x onerror="window.__pwned = 1">',
  '<a href="javascript:window.__pwned=1">click</a>',
  '<iframe src="data:text/html,<script>parent.__pwned=1</script>"></iframe>',
  '"><svg onload=window.__pwned=1>',
  "\x1b]0;evil title\x07\x1b[2J\x1b[31mred\x1b[0m\r\u202ereversed\u0007\u009b31m",
  "{{constructor.constructor('window.__pwned=1')()}}",
];
const evil = payloads.join("\n");

function maliciousRun() {
  const e = new Events();
  e.add("", { case: "started", value: { epoch: 1n, profileId: evil } });
  e.add("", {
    case: "sessionInfo",
    value: {
      taskId: evil,
      taskKind: evil,
      task: evil,
      config: evil,
      toolsManifest: evil,
      workerId: evil,
      actletVersion: evil,
      localCommands: [evil],
      tools: [{ name: evil, policy: evil, description: evil }],
      grants: [{ name: evil, settings: { [evil]: evil } }],
      budgets: [{ kind: 2, limit: 1, currency: evil }],
      models: {
        aliases: [{ alias: evil, description: evil, contextWindow: 1000n }],
        roles: { [evil]: evil },
        selectable: [evil],
      },
    },
  });
  e.add("", { case: "state", value: { to: SessionState.RUNNING, reason: evil } });
  e.add("root", {
    case: "modelTurn",
    value: {
      turn: 1n,
      model: evil,
      text: evil,
      toolCalls: [evil],
      usage: { inputTokens: 10n, currency: evil, cost: 0.5 },
    },
  });
  e.add("root", {
    case: "toolStarted",
    value: { callId: "c1", tool: "shell", input: JSON.stringify({ command: evil }) },
  });
  e.add("root", { case: "toolFinished", value: { callId: "c1", tool: "shell", output: evil, isError: true } });
  e.add("root", { case: "toolStarted", value: { callId: "c2", tool: evil, input: evil } });
  e.add("root", {
    case: "fileChange",
    value: { callId: "c2", path: "../output/" + payloads[0], created: true, diff: "+" + evil.replaceAll("\n", "\n+") },
  });
  e.add("root", { case: "toolFinished", value: { callId: "c2", tool: evil, output: evil } });
  e.add("root", {
    case: "toolStarted",
    value: { callId: "s1", tool: "spawn_subagent", input: JSON.stringify({ task: evil }) },
  });
  e.add("root.1", { case: "subagentSpawned", value: { parent: "root", task: evil, model: evil, callId: "s1" } });
  e.add("root.1", { case: "modelTurn", value: { turn: 1n, model: evil, text: evil } });
  e.add("root.1", { case: "subagentFinished", value: { result: evil, isError: true } });
  e.add("", { case: "steer", value: { note: evil, origin: Origin.LOCAL, actor: evil } });
  e.add("root", { case: "text", value: { text: evil } });
  e.add("", { case: "text", value: { text: evil } });
  e.add("", {
    case: "command",
    value: { command: { id: evil, actor: evil, action: { case: "steer", value: { note: evil } } }, message: evil },
  });
  // The standard tools and budgets.
  e.add("root", { case: "progress", value: { message: evil, percent: 50 } });
  e.add("root", { case: "feedback", value: { kind: evil, message: evil } });
  e.add("", {
    case: "budgetStatus",
    value: {
      reason: evil,
      budgets: [
        { kind: 2, limit: 1, used: 2, currency: evil, state: "waiting" },
        { kind: 3, limit: 10, used: 1, state: evil },
      ],
    },
  });
  e.add("root", {
    case: "toolStarted",
    value: {
      callId: "d1",
      tool: "decide",
      input: JSON.stringify({ question: evil, options: [evil, evil], context: evil }),
    },
  });
  e.add("root", {
    case: "toolFinished",
    value: { callId: "d1", tool: "decide", output: JSON.stringify({ decision: evil, decided_by: evil, reason: evil }) },
  });
  e.add("root", {
    case: "toolStarted",
    value: { callId: "l1", tool: "llm", input: JSON.stringify({ model: evil, prompt: evil, system: evil }) },
  });
  e.add("root", {
    case: "toolFinished",
    value: {
      callId: "l1",
      tool: "llm",
      output: evil,
      usage: { inputTokens: 1n, outputTokens: 1n, cost: 0.1, currency: evil },
    },
  });
  e.add("root", {
    case: "toolStarted",
    value: { callId: "p1", tool: "report_progress", input: JSON.stringify({ message: evil, percent: 5 }) },
  });
  e.add("root", {
    case: "toolStarted",
    value: { callId: "f1", tool: "send_feedback", input: JSON.stringify({ kind: evil, message: evil }) },
  });
  e.add("", {
    case: "command",
    value: {
      command: { id: evil, action: { case: "profileUpdate", value: { fields: [evil], resetBudgets: [2] } } },
      result: 2,
      message: evil,
    },
  });
  return e.out;
}

/** Checks that nothing in the viewer became markup, handlers or terminal controls. */
function expectInert(root: HTMLElement) {
  expect(root.querySelectorAll("script, img, iframe, object, embed, svg, a, style, link, form[action]").length).toBe(0);
  for (const el of root.querySelectorAll("*")) {
    for (const attr of el.getAttributeNames()) {
      expect(attr.startsWith("on"), `${el.tagName} has ${attr}`).toBe(false);
      const v = el.getAttribute(attr)!;
      expect(/javascript:/i.test(v) && attr !== "title" && attr !== "aria-label", `${attr}=${v}`).toBe(false);
      expect(hasControls(v), `${attr} keeps control characters`).toBe(false);
    }
  }
  expect(hasControls(root.textContent ?? "")).toBe(false);
  expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
}

function hasControls(s: string): boolean {
  for (const ch of s) {
    const r = ch.codePointAt(0)!;
    if ((r < 0x20 && r !== 0x0a && r !== 0x09) || (r >= 0x7f && r <= 0x9f)) return true;
    if ((r >= 0x202a && r <= 0x202e) || (r >= 0x2066 && r <= 0x2069)) return true;
  }
  return false;
}

describe("untrusted content", () => {
  it("renders as inert text on every tab", () => {
    const { container } = render(
      <ActivityViewer
        events={maliciousRun()}
        onCommand={() => {}}
        allowedCommands={["steer", "pause", "stop", "profile_update"]}
      />,
    );
    fireEvent.click(screen.getByLabelText(/expand/));
    fireEvent.click(screen.getByRole("button", { name: "Raise a budget…" }));
    expectInert(container);
    // The payloads show as the text they are.
    expect(container.textContent).toContain("<script>window.__pwned = 1</script>");
    expect(container.textContent).toContain('<img src=x onerror="window.__pwned = 1">');
    for (const tab of TABS) {
      fireEvent.click(screen.getByRole("tab", { name: new RegExp(`^${tab}$`, "i") }));
      expectInert(container);
    }
  });

  it("shows files from events and from the implementor as text", async () => {
    const { container } = render(
      <ActivityViewer
        events={maliciousRun()}
        readFile={async () => ({ content: new TextEncoder().encode(evil), size: evil.length })}
      />,
    );
    fireEvent.click(within(container.querySelector(".actlet-sidebar")!).getByTitle(/^output\/<script>/));
    await waitFor(() => expect(screen.getByRole("dialog").textContent).toContain("onerror"));
    expectInert(container);
    cleanup();
    const r = render(<ActivityViewer events={maliciousRun()} />);
    fireEvent.click(within(r.container.querySelector(".actlet-sidebar")!).getByTitle(/^output\/<script>/));
    expect(screen.getByRole("dialog").textContent).toContain("<iframe");
    expectInert(r.container);
  });

  it("cuts huge text short and says so", () => {
    const huge = "A".repeat(2_000_000);
    const e = new Events();
    e.add("root", { case: "modelTurn", value: { turn: 1n, text: huge } });
    e.add("root", {
      case: "toolStarted",
      value: { callId: "c", tool: "shell", input: JSON.stringify({ command: huge }) },
    });
    e.add("root", {
      case: "toolFinished",
      value: { callId: "c", tool: "shell", output: (huge + "\n").repeat(3) + "x".repeat(10) },
    });
    const { container } = render(<ActivityViewer events={e.out} />);
    fireEvent.click(screen.getByLabelText(/expand/));
    expect(container.textContent!.length).toBeLessThan(200_000);
    expect(screen.getAllByText(/more characters/).length).toBeGreaterThan(0);
  });

  it("marks content Actlet cut short", () => {
    const e = new Events();
    e.add("root", { case: "toolStarted", value: { callId: "c", tool: "read_file", input: '{"path":"big.log"}' } });
    e.add("root", {
      case: "toolFinished",
      value: { callId: "c", tool: "read_file", output: "head\n[... 81234 bytes omitted ...]\ntail [cut]" },
    });
    const { container } = render(<ActivityViewer events={e.out} />);
    fireEvent.click(screen.getByText("Read").closest("button")!);
    const cuts = [...container.querySelectorAll(".actlet-cut")].map((el) => el.textContent);
    expect(cuts).toEqual(["81234 bytes omitted", "cut short"]);
  });
});

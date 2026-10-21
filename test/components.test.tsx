import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActivityViewer } from "../src/react/ActivityViewer";
import type { EventInput } from "../src/events";
import { BudgetKind, CommandResult, Origin, SessionState, type Command } from "../src/gen/actlet/gateway/v0/gateway_pb";
import { Events, demoEvents } from "./helpers";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const demo = demoEvents();

describe("ActivityViewer", () => {
  it("shows the whole demo recording in replay mode", () => {
    const { container } = render(<ActivityViewer events={demo} mode="replay" theme="dark" />);
    const side = container.querySelector(".actlet-sidebar") as HTMLElement;
    for (const id of ["root", "root.1", "root.2", "root.3"]) expect(within(side).getByText(id)).toBeTruthy();
    const report = within(side).getByTitle("output/report.md");
    expect(report.textContent).toContain("+11");
    expect(report.textContent).toContain("−2");
    const status = screen.getByRole("group", { name: "Session status" });
    expect(status.textContent).toMatch(
      /^✓ completed large │ ctx \d+%\/200k │ [\d./]+ EUR │ .* │ replay at the end 1x 100%$/,
    );
    // Turns are grouped: the agent's turns, with their tool calls as blocks.
    expect(container.querySelectorAll(".actlet-agent").length).toBe(9);
    expect(container.querySelectorAll(".actlet-subagent").length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText("Subagent").length).toBe(3);
    expect(container.querySelectorAll(".actlet-tool-running").length).toBe(0);
    expect(screen.getByText(/quote every figure in EUR/)).toBeTruthy();
    expect(container.querySelector(".actlet-viewer")!.getAttribute("data-theme")).toBe("dark");
  });

  it("seeks and plays a replay", () => {
    vi.useFakeTimers();
    render(<ActivityViewer events={demo} mode="replay" />);
    const pos = screen.getByLabelText("Position") as HTMLInputElement;
    fireEvent.change(pos, { target: { value: "0" } });
    expect(screen.getByText("Waiting for the agent…")).toBeTruthy();
    expect(screen.getByText("0/81")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Speed"), { target: { value: "64" } });
    fireEvent.click(screen.getByLabelText("Play"));
    expect(screen.getByRole("group", { name: "Session status" }).textContent).toContain("replay playing 64x");
    act(() => vi.advanceTimersByTime(3000));
    const shown = Number(screen.getByText(/^\d+\/81$/).textContent!.split("/")[0]);
    expect(shown).toBeGreaterThan(5);
    act(() => vi.advanceTimersByTime(120_000));
    expect(screen.getByText("81/81")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Session status" }).textContent).toContain("completed");
    fireEvent.click(screen.getByLabelText("Back one event"));
    expect(screen.getByText("80/81")).toBeTruthy();
  });

  it("follows appended events in live mode", () => {
    const { rerender } = render(<ActivityViewer events={demo.slice(0, 10)} connectionLabel="orchestrator eu-1" />);
    expect(screen.getByRole("group", { name: "Session status" }).textContent).toContain("orchestrator eu-1");
    expect(screen.queryByText("root.2")).toBeNull();
    rerender(<ActivityViewer events={demo.slice(0, 40)} connectionLabel="orchestrator eu-1" />);
    expect(screen.getAllByText("root.2").length).toBeGreaterThan(0);
    rerender(<ActivityViewer events={demo} connectionLabel="orchestrator eu-1" ended />);
    expect(screen.getByRole("group", { name: "Session status" }).textContent).toContain("completed");
    expect(screen.getByRole("group", { name: "Session status" }).textContent).toContain("orchestrator eu-1, run ended");
  });

  it("accepts events as Protobuf JSON", () => {
    const json: EventInput[] = [
      {
        id: "1.1",
        epoch: "1",
        seq: "1",
        worker: "root",
        model_turn: { turn: "1", model: "large", text: "Hello there." },
      },
      { id: "1.2", epoch: "1", seq: "2", state: { from: "SESSION_STATE_RUNNING", to: "SESSION_STATE_COMPLETED" } },
      { id: "1.3", seq: "not a number" },
    ];
    render(<ActivityViewer events={json} />);
    expect(screen.getByText("Hello there.")).toBeTruthy();
    expect(screen.getByText(/1 events missed/)).toBeTruthy();
  });

  it("expands a tool call to show its whole result", () => {
    const { container } = render(<ActivityViewer events={demo} />);
    const head = screen.getAllByText("Python")[0].closest("button")!;
    const block = head.closest(".actlet-tool")!;
    const before = block.querySelectorAll(".actlet-line").length;
    fireEvent.click(head);
    expect(head.getAttribute("aria-expanded")).toBe("true");
    expect(block.querySelectorAll(".actlet-line").length).toBeGreaterThan(before);
    fireEvent.click(screen.getByLabelText(/expand/));
    expect(container.querySelectorAll('.actlet-tool-head[aria-expanded="true"]').length).toBeGreaterThan(10);
  });

  it("opens a changed file from the sidebar", () => {
    const { container } = render(<ActivityViewer events={demo} />);
    fireEvent.click(within(container.querySelector(".actlet-sidebar")!).getByTitle("workspace/totals.py"));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("from collections import defaultdict");
    expect(dialog.textContent).toContain("from the recording · read only");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    // A file changed more than once: the recording holds only its changes.
    fireEvent.click(within(container.querySelector(".actlet-sidebar")!).getByTitle("output/report.md"));
    expect(screen.getByRole("dialog").textContent).toContain("the latest of 3");
  });

  it("reads files through the implementor when it can", async () => {
    const readFile = vi.fn(async (path: string) => ({ path, content: "# Report\nall good\n", size: 18 }));
    const { container } = render(<ActivityViewer events={demo} readFile={readFile} />);
    fireEvent.click(within(container.querySelector(".actlet-sidebar")!).getByTitle("output/report.md"));
    expect(await screen.findByText("all good")).toBeTruthy();
    expect(readFile).toHaveBeenCalledWith("output/report.md");
    expect(screen.getByRole("dialog").textContent).toContain("18 B · read only");
  });

  it("shows only one worker when chosen in the sidebar", () => {
    const { container } = render(<ActivityViewer events={demo} />);
    const side = container.querySelector(".actlet-sidebar") as HTMLElement;
    fireEvent.click(within(side).getByText("root.2"));
    expect(screen.getByText(/showing root\.2 only/)).toBeTruthy();
    expect(container.querySelectorAll(".actlet-stream .actlet-agent").length).toBe(0);
    fireEvent.click(screen.getByText("show all"));
    expect(container.querySelectorAll(".actlet-stream .actlet-agent").length).toBe(9);
  });

  it("has tabs for the session, task, profile, tools and events", () => {
    render(<ActivityViewer events={demo} mode="replay" sessionId="abc123" />);
    fireEvent.click(screen.getByRole("tab", { name: "Session" }));
    expect(screen.getByText("abc123")).toBeTruthy();
    // The budgets as the latest budget status reported them: money past its alert.
    const money = screen.getByRole("row", { name: /^money/ });
    expect(money.textContent).toMatch(/^money0\.6 EUR0\.\d\d \(\d+%\)past the alert$/);
    expect(money.getAttribute("data-state")).toBe("alerted");
    expect(screen.getByRole("meter", { name: "money budget used" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Task" }));
    expect(screen.getByText(/Task q3-sales-review/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Profile" }));
    expect(screen.getByText(/roles: main → large, subagent → fast/)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Tools" }));
    expect(screen.getAllByText("edit_file").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/^reconcile$/).length).toBeGreaterThan(0);
    const events = screen.getByRole("tab", { name: "Events" });
    fireEvent.click(events);
    expect(events.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(/session_info: task q3-sales-review/)).toBeTruthy();
    fireEvent.keyDown(events, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Chat" }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("the status line", () => {
  it("shows context, cost and time against their totals, coloured near the limits", () => {
    const e = new Events();
    e.add("", {
      case: "sessionInfo",
      value: {
        taskId: "t",
        models: { aliases: [{ alias: "large", contextWindow: 128000n }] },
        budgets: [
          { kind: BudgetKind.TIME, limit: 1800, alertAtPercent: 50 },
          { kind: BudgetKind.MONEY, limit: 5, currency: "EUR", alertAtPercent: 1 },
        ],
      },
    });
    e.add("", { case: "state", value: { to: SessionState.COMPLETED } });
    e.add("root", {
      case: "modelTurn",
      value: { turn: 1n, model: "large", usage: { inputTokens: 44800n, cost: 0.12, currency: "EUR" } },
    });
    render(<ActivityViewer events={e.out} />);
    const status = screen.getByRole("group", { name: "Session status" });
    expect(status.textContent).toMatch(/^✓ completed large │ ctx 35%\/128k │ 0\.12\/5\.00 EUR │ 2\.0s\/30m │ live$/);
    expect(within(status).getByText("35%/128k").className).toBe("actlet-ok");
    expect(within(status).getByText("0.12/5.00 EUR").className).toBe("actlet-warn");
  });

  it("shows only the used amounts without budgets, and the context's size without a window", () => {
    const e = new Events();
    e.add("root", {
      case: "modelTurn",
      value: { turn: 1n, model: "x", usage: { inputTokens: 1200n, cost: 0.5, currency: "USD" } },
    });
    render(<ActivityViewer events={e.out} />);
    expect(screen.getByRole("group", { name: "Session status" }).textContent).toMatch(
      /^ starting x │ ctx 1\.2k │ 0\.50 USD │ \S+ │ live$/,
    );
  });
});

describe("commands", () => {
  const running = () => {
    const e = new Events();
    e.add("", { case: "state", value: { to: SessionState.RUNNING } });
    e.add("root", { case: "modelTurn", value: { turn: 1n, model: "large", text: "Working." } });
    return e;
  };

  it("sends a steer note from the input", () => {
    const onCommand = vi.fn();
    render(
      <ActivityViewer events={running().out} onCommand={onCommand} actor="alice" commandOrigin={Origin.ORCHESTRATOR} />,
    );
    const input = screen.getByLabelText("Note for the agent");
    fireEvent.change(input, { target: { value: "  keep it short  " } });
    fireEvent.submit(input.closest("form")!);
    expect(onCommand).toHaveBeenCalledTimes(1);
    const cmd: Command = onCommand.mock.calls[0][0];
    expect(cmd.action.case).toBe("steer");
    expect(cmd.action.case === "steer" && cmd.action.value.note).toBe("keep it short");
    expect([cmd.actor, cmd.origin]).toEqual(["alice", Origin.ORCHESTRATOR]);
    expect(cmd.id).toMatch(/^web-/);
    expect((input as HTMLInputElement).value).toBe("");
    expect(screen.getByText(/sent, waiting for the box/)).toBeTruthy();
  });

  it("offers only steer notes by default", () => {
    render(<ActivityViewer events={running().out} onCommand={() => {}} />);
    expect(screen.getByLabelText("Note for the agent")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Interrupt" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Stop/ })).toBeNull();
  });

  it("offers only the allowed commands", () => {
    const onCommand = vi.fn();
    render(<ActivityViewer events={running().out} onCommand={onCommand} allowedCommands={["pause", "stop"]} />);
    expect(screen.queryByLabelText("Note for the agent")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Interrupt" }));
    const pause: Command = onCommand.mock.calls[0][0];
    expect(pause.origin).toBe(Origin.REMOTE);
    expect(pause.action.case === "pause" && pause.action.value.mode).toBe(2);
    // Stop asks first.
    fireEvent.click(screen.getByRole("button", { name: "Stop…" }));
    expect(onCommand).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onCommand.mock.calls[1][0].action.case).toBe("stop");
  });

  it("offers nothing in replay mode or without a handler", () => {
    const { unmount } = render(
      <ActivityViewer events={demo} mode="replay" onCommand={() => {}} allowedCommands={["steer", "pause", "stop"]} />,
    );
    expect(screen.queryByLabelText("Note for the agent")).toBeNull();
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Stop/ })).toBeNull();
    unmount();
    render(<ActivityViewer events={running().out} />);
    expect(screen.queryByLabelText("Note for the agent")).toBeNull();
  });

  it("shows whether commands were accepted or rejected", async () => {
    const e = running();
    const sent: Command[] = [];
    const { rerender } = render(
      <ActivityViewer events={e.out} onCommand={(c) => void sent.push(c)} allowedCommands={["steer", "pause"]} />,
    );
    fireEvent.change(screen.getByLabelText("Note for the agent"), { target: { value: "hi" } });
    fireEvent.submit(screen.getByLabelText("Note for the agent").closest("form")!);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    // The box reports the note in its events; the pause comes back as an ack.
    e.add("", { case: "command", value: { command: sent[0], result: CommandResult.ACCEPTED } });
    const acks = [{ commandId: sent[1].id, result: CommandResult.REJECTED, message: "not allowed" }] as never;
    rerender(
      <ActivityViewer
        events={[...e.out]}
        acks={acks}
        onCommand={(c) => void sent.push(c)}
        allowedCommands={["steer", "pause"]}
      />,
    );
    const list = screen.getByLabelText("Sent commands");
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.getAttribute("data-status"))).toEqual(["accepted", "rejected"]);
    expect(items[1].textContent).toContain("not allowed");
  });

  it("marks a command the implementor couldn't deliver", async () => {
    render(<ActivityViewer events={running().out} onCommand={() => Promise.reject(new Error("offline"))} />);
    fireEvent.change(screen.getByLabelText("Note for the agent"), { target: { value: "hi" } });
    fireEvent.submit(screen.getByLabelText("Note for the agent").closest("form")!);
    expect(await screen.findByText(/not delivered/)).toBeTruthy();
    expect(screen.getByText(/offline/)).toBeTruthy();
  });

  it("stops offering commands once the session ended", () => {
    const e = running();
    e.add("", { case: "state", value: { from: SessionState.RUNNING, to: SessionState.COMPLETED } });
    render(<ActivityViewer events={e.out} onCommand={() => {}} />);
    expect((screen.getByLabelText("Note for the agent") as HTMLInputElement).disabled).toBe(true);
  });
});

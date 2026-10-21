import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BudgetKind, CommandResult, type Command } from "../src/gen/actlet/gateway/v0/gateway_pb";
import { ActivityViewer } from "../src/react/ActivityViewer";
import { TABS } from "../src/react/Tabs";
import { standardEvents } from "./helpers";

afterEach(cleanup);

const events = standardEvents();
/** The events up to the operator raising the budget: the money ran out, and the decision waits for it. */
const waiting = events.slice(
  0,
  events.findIndex((e) => e.body.case === "budgetStatus" && e.body.value.reason === "update"),
);
const statusLine = () => screen.getByRole("group", { name: "Session status" });
const block = (label: string) => screen.getAllByText(label)[0].closest(".actlet-tool") as HTMLElement;

describe("the standard tools", () => {
  it("show the decision, the llm answer and the latest progress", () => {
    render(<ActivityViewer events={events} mode="replay" />);
    const decide = block("Decide");
    expect(decide.textContent).toContain("Ship release 2.4 today");
    expect(within(decide).getByText("ship today").closest(".actlet-decision")!.textContent).toBe(
      "→ ship today · decided by the release manager",
    );
    expect(decide.textContent).toContain("promised to two customers");
    const llm = block("LLM");
    expect(llm.textContent).toContain("fast · Summarise these release notes");
    expect(llm.querySelector(".actlet-llm-meta")!.textContent).toBe("fast · 180 in / 45 out · 0.0012 EUR");
    expect(llm.textContent).toContain("Release 2.4 makes report exports");
    expect(block("Feedback").textContent).toContain("suggestion: Give the archive action an undo");
    expect(screen.getAllByText("Progress")).toHaveLength(4);
    expect(statusLine().textContent).toContain("100% · Release check finished");
  });

  it("show the question and its options while the decision waits, and the budget alarm", () => {
    render(<ActivityViewer events={waiting} />);
    expect(statusLine().textContent).toContain("waiting for the money budget");
    // Cost against the money budget's total, in the error colour while it is used up.
    const money = within(statusLine()).getByText(/^[\d.]+\/0\.04 EUR$/);
    expect(money.closest(".actlet-err")).not.toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Session running; waiting for the money budget");
    const decide = block("Decide");
    expect(decide.textContent).toContain("waiting for a decision: ship today · wait for undo");
    // Expanding shows the context the decider was given.
    fireEvent.click(within(decide).getByRole("button", { name: /Ship release/ }));
    expect(decide.textContent).toContain("context: The exports are 3x faster");
  });

  it("show the budgets, the progress and the feedback in the Session tab, and the budgets in Profile", () => {
    render(<ActivityViewer events={waiting} mode="replay" />);
    fireEvent.click(screen.getByRole("tab", { name: "Session" }));
    expect(within(screen.getByRole("tabpanel")).getByText("40% · Summary drafted")).toBeTruthy();
    const money = screen.getByRole("row", { name: /^money/ });
    expect(money.getAttribute("data-state")).toBe("waiting");
    expect(money.textContent).toContain("used up; work waits");
    expect((within(money).getByRole("meter") as HTMLMeterElement).value).toBe(100);
    expect(screen.getByRole("row", { name: /^tokens/ }).getAttribute("data-state")).toBe("ok");
    expect(screen.getByText(/Give the archive action an undo/).closest("li")!.textContent).toMatch(/suggestion/);
    fireEvent.click(screen.getByRole("tab", { name: "Profile" }));
    expect(screen.getByRole("row", { name: /^money/ }).textContent).toContain("0.04 EUR");
  });

  it("show the profile update and its outcome", () => {
    render(<ActivityViewer events={events} mode="replay" />);
    expect(screen.getByText(/profile update \(budgets\) from the orchestrator accepted: changed budgets/)).toBeTruthy();
  });
});

describe("raising a budget", () => {
  it("isn't offered by default, nor in a replay", () => {
    const { unmount } = render(<ActivityViewer events={waiting} onCommand={() => {}} />);
    expect(screen.queryByRole("button", { name: "Raise a budget…" })).toBeNull();
    unmount();
    render(<ActivityViewer events={waiting} mode="replay" onCommand={() => {}} allowedCommands={["profile_update"]} />);
    expect(screen.queryByRole("button", { name: "Raise a budget…" })).toBeNull();
  });

  it("sends a profile update with the new limit, and shows its outcome", async () => {
    const user = userEvent.setup();
    const sent: Command[] = [];
    const props = {
      onCommand: (c: Command) => void sent.push(c),
      allowedCommands: ["steer", "profile_update"] as const,
    };
    const { rerender } = render(<ActivityViewer events={waiting} {...props} />);
    await user.click(screen.getByRole("button", { name: "Raise a budget…" }));
    const form = screen.getByRole("form", { name: "Raise a budget" });
    expect(document.activeElement).toBe(within(form).getByLabelText("Budget"));
    expect(form.textContent).toContain("now 0.04 EUR, 0.05475 EUR used");
    const limit = within(form).getByLabelText("New limit") as HTMLInputElement;
    expect(limit.value).toBe("0.08");
    await user.clear(limit);
    expect((within(form).getByRole("button", { name: "Raise" }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(limit, "0.5");
    await user.click(within(form).getByLabelText(/start its usage from zero/));
    await user.click(within(form).getByRole("button", { name: "Raise" }));

    expect(sent).toHaveLength(1);
    const u = sent[0].action.case === "profileUpdate" ? sent[0].action.value : null;
    expect(u?.fields).toEqual(["budgets"]);
    expect(u?.resetBudgets).toEqual([BudgetKind.MONEY]);
    expect(u?.profile?.budgets.map((b) => [b.kind, b.limit])).toEqual([
      [BudgetKind.MONEY, 0.5],
      [BudgetKind.TOKENS, 100000],
    ]);
    // The form closes, focus returns, and the command waits for its outcome.
    expect(screen.queryByRole("form", { name: "Raise a budget" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Raise a budget…" }));
    const item = within(screen.getByLabelText("Sent commands")).getByRole("listitem");
    expect(item.textContent).toContain("profile update (budgets; reset money)");
    expect(item.getAttribute("data-status")).toBe("pending");
    const acks = [{ commandId: sent[0].id, result: CommandResult.ACCEPTED, message: "changed budgets" }] as never;
    rerender(<ActivityViewer events={waiting} acks={acks} {...props} />);
    expect(within(screen.getByLabelText("Sent commands")).getByRole("listitem").getAttribute("data-status")).toBe(
      "accepted",
    );
  });

  it("can be cancelled", () => {
    const onCommand = vi.fn();
    render(<ActivityViewer events={waiting} onCommand={onCommand} allowedCommands={["profile_update"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Raise a budget…" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form", { name: "Raise a budget" })).toBeNull();
    expect(onCommand).not.toHaveBeenCalled();
  });
});

describe("axe finds no violations", () => {
  it("on every tab of the standard tools recording, and with the raise form open", async () => {
    const { container } = render(
      <ActivityViewer events={waiting} onCommand={() => {}} allowedCommands={["steer", "profile_update"]} />,
    );
    fireEvent.click(screen.getByLabelText(/expand/));
    fireEvent.click(screen.getByRole("button", { name: "Raise a budget…" }));
    for (const tab of TABS) {
      fireEvent.click(screen.getByRole("tab", { name: new RegExp(`^${tab}$`, "i") }));
      const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
      expect(
        result.violations.map((v) => `${tab}: ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
      ).toEqual([]);
    }
  });
});

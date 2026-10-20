import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionState } from "../src/gen/actlet/gateway/v0/gateway_pb";
import { ActivityViewer } from "../src/react/ActivityViewer";
import { TABS } from "../src/react/Tabs";
import { Events, demoEvents } from "./helpers";

afterEach(cleanup);

const demo = demoEvents();

/** Runs axe on the page; colour contrast needs layout, which jsdom lacks, so it is tested from the stylesheet instead. */
async function expectNoViolations(root: HTMLElement) {
  const result = await axe.run(root, { rules: { "color-contrast": { enabled: false } } });
  const found = result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(found).toEqual([]);
}

function running() {
  const e = new Events();
  e.add("", { case: "state", value: { to: SessionState.RUNNING } });
  e.add("root", { case: "modelTurn", value: { turn: 1n, model: "large", text: "Working." } });
  e.add("root", { case: "toolStarted", value: { callId: "c1", tool: "shell", input: '{"command":"make"}' } });
  return e.out;
}

describe("axe finds no violations", () => {
  it("on every tab of a replay", async () => {
    const { container } = render(<ActivityViewer events={demo} mode="replay" />);
    for (const tab of TABS) {
      fireEvent.click(screen.getByRole("tab", { name: new RegExp(`^${tab}$`, "i") }));
      await expectNoViolations(container);
    }
  });

  it("with tool calls expanded and the file viewer open", async () => {
    const { container } = render(<ActivityViewer events={demo} />);
    fireEvent.click(screen.getByLabelText(/expand/));
    await expectNoViolations(container);
    fireEvent.click(within(container.querySelector(".actlet-sidebar")!).getByTitle("workspace/totals.py"));
    expect(screen.getByRole("dialog", { name: /^File\s+workspace\/totals\.py$/ })).toBeTruthy();
    await expectNoViolations(container);
  });

  it("with the command bar, sent commands and a stop to confirm", async () => {
    const { container } = render(
      <ActivityViewer events={running()} onCommand={() => {}} allowedCommands={["steer", "pause", "stop"]} />,
    );
    fireEvent.change(screen.getByLabelText("Note for the agent"), { target: { value: "hi" } });
    fireEvent.submit(screen.getByLabelText("Note for the agent").closest("form")!);
    fireEvent.click(screen.getByRole("button", { name: "Stop…" }));
    await expectNoViolations(container);
  });
});

describe("keyboard only", () => {
  it("walks the tabs, the conversation, the sidebar and the file viewer", async () => {
    const user = userEvent.setup();
    const { container } = render(<ActivityViewer events={demo} />);

    // Tabs: one tab stop, arrow keys move between them.
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Chat" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Session" }).getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Chat" }).getAttribute("aria-selected")).toBe("true");

    // The toolbar's three switches, then the conversation.
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    const stream = screen.getByRole("log", { name: "Conversation" });
    expect(document.activeElement).toBe(stream);

    // Arrow keys move between tool calls; Enter expands one.
    await user.keyboard("{ArrowDown}");
    const first = document.activeElement as HTMLElement;
    expect(first.classList.contains("actlet-tool-head")).toBe(true);
    await user.keyboard("{Enter}");
    expect(first.getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).not.toBe(first);
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(first);
    await user.keyboard("{End}");
    const heads = stream.querySelectorAll(".actlet-tool-head");
    expect(document.activeElement).toBe(heads[heads.length - 1]);

    // Tab leaves the conversation for the sidebar: one tab stop, arrow keys within.
    await user.tab();
    expect(document.activeElement?.textContent).toContain("root");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toContain("root.1");
    await user.keyboard("{End}");
    const report = within(container.querySelector(".actlet-sidebar")!).getByTitle("output/report.md");
    expect(document.activeElement).toBe(report);

    // Enter opens the file; focus is in the popup and stays there; Escape closes it and returns focus.
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.tab();
    await user.tab();
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(report);
  });

  it("controls a replay", async () => {
    const user = userEvent.setup();
    render(<ActivityViewer events={demo} mode="replay" />);
    const stream = screen.getByRole("log", { name: "Conversation" });
    stream.focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByText("80/81")).toBeTruthy();
    await user.keyboard("{Shift>}{ArrowLeft}{/Shift}");
    expect(screen.getByText("70/81")).toBeTruthy();
    await user.keyboard("+");
    expect((screen.getByLabelText("Speed") as HTMLSelectElement).value).toBe("2");
    vi.useFakeTimers();
    try {
      await act(async () => {
        fireEvent.keyDown(stream, { key: " " });
      });
      expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
      fireEvent.keyDown(stream, { key: "k" });
      expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends a note and confirms a stop", async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn();
    render(<ActivityViewer events={running()} onCommand={onCommand} allowedCommands={["steer", "stop"]} />);
    screen.getByLabelText("Note for the agent").focus();
    await user.keyboard("keep going{Enter}");
    expect(onCommand.mock.calls[0][0].action.value.note).toBe("keep going");
    const stop = screen.getByRole("button", { name: "Stop…" });
    stop.focus();
    await user.keyboard("{Enter}");
    // Asking moves focus to Cancel, the safe choice; cancelling returns it.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    await user.keyboard("{Enter}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Stop…" }));
    expect(onCommand).toHaveBeenCalledTimes(1);
  });
});

describe("announcements", () => {
  it("says when the session's state changes, not every second", () => {
    const e = new Events();
    e.add("", { case: "state", value: { to: SessionState.RUNNING } });
    const { rerender } = render(<ActivityViewer events={e.out} />);
    expect(screen.getByRole("status").textContent).toBe("Session running");
    e.add("", { case: "state", value: { from: SessionState.RUNNING, to: SessionState.COMPLETED } });
    rerender(<ActivityViewer events={[...e.out]} />);
    expect(screen.getByRole("status").textContent).toBe("Session completed");
    expect(screen.getByRole("group", { name: "Session status" }).getAttribute("aria-live")).toBeNull();
  });
});

// The stylesheet's text colours against its backgrounds, for WCAG AA (4.5:1).
describe("theme contrast", () => {
  const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
  const tokens = (selector: string) => {
    const start = css.indexOf(selector + " {");
    const block = css.slice(start, css.indexOf("}", start));
    return Object.fromEntries([...block.matchAll(/--actlet-([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
  };
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const text = ["fg", "muted", "faint", "agent", "subagent", "operator", "ok", "err", "run", "add", "del"];

  for (const [theme, selector] of [
    ["dark", ".actlet-viewer"],
    ["light", '.actlet-viewer[data-theme="light"]'],
    ["auto light", '  .actlet-viewer[data-theme="auto"]'],
  ]) {
    it(`passes in the ${theme} theme`, () => {
      const t = tokens(selector);
      const low: string[] = [];
      for (const bg of ["bg", "bg-raised"]) {
        for (const k of text) if (ratio(t[k], t[bg]) < 4.5) low.push(`${k} on ${bg}: ${ratio(t[k], t[bg]).toFixed(2)}`);
      }
      // Selected rows and expanded tool calls hold the main and muted text and the speakers' colours.
      for (const k of ["fg", "muted", "agent", "subagent", "ok", "err"]) {
        if (ratio(t[k], t["bg-select"]) < 4.5) low.push(`${k} on bg-select: ${ratio(t[k], t["bg-select"]).toFixed(2)}`);
      }
      expect(low).toEqual([]);
    });
  }

  it("stops the spinner for readers who ask for less motion", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.actlet-spinner::before \{\s*animation: none;/,
    );
  });
});

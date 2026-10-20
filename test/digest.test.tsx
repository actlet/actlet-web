import { readFileSync, writeFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityViewer } from "../src/react/ActivityViewer";
import { TABS } from "../src/react/Tabs";
import { compactionPolicy, keyArgs, skillsUsed, toolLabel } from "../src/view/format";
import { describe as describeEvent, fold } from "../src/view/session";
import { toViewState } from "../src/view/state-json";
import { Events, digestEvents, fixture } from "./helpers";

afterEach(cleanup);

const events = digestEvents();

describe("the digest recording", () => {
  const s = fold(events);
  const root = s.workers.get("root")!;

  it("shows the compaction in the worker's timeline, with its summary", () => {
    const item = root.items.find((it) => it.text.startsWith("context compacted"))!;
    expect(item.text).toBe("context compacted at 5380 tokens: 1 turn summarised by fast, the last 2 kept");
    expect(item.kind).toBe("system");
    expect(item.detail).toMatch(/^The task: a digest of inputs\/sales\.csv/);
    expect(s.log.map((l) => l.text)).toContain("compaction (fast): 1 turns summarised, 2 kept, at 5380 tokens");
  });

  it("counts the summary's model call in the usage", () => {
    const turns = root.items.flatMap((it) => (it.turn ? [it.turn] : []));
    const input = turns.reduce((n, t) => n + t.usage.input, 0);
    expect(root.usage.input).toBe(input + 4800);
    expect(s.usage.input).toBe(input + 4800);
    expect(s.usage.output).toBe(turns.reduce((n, t) => n + t.usage.output, 0) + 140);
  });

  it("reads the compaction policy and the skills, listed and used", () => {
    expect(s.info?.skills.map((k) => [k.name, k.source, k.files])).toEqual([
      ["csv-report", "profile", ["reference.md", "scripts/totals.py"]],
    ]);
    expect(compactionPolicy(s)).toEqual({ strategy: "summarize", thresholdPercent: 60, model: "fast", keepTurns: 2 });
    expect(skillsUsed(s)).toEqual([{ name: "csv-report", loads: 1, files: ["reference.md"] }]);
    const skills = root.items.flatMap((it) => it.turn?.calls ?? []).filter((c) => c.name === "skill");
    expect(skills.map((c) => [toolLabel(c.name), keyArgs(c)])).toEqual([
      ["Skill", "csv-report"],
      ["Skill", "csv-report · reference.md"],
    ]);
  });

  it("matches the golden view state", () => {
    const golden = fixture("digest.view.json");
    const got = JSON.stringify(toViewState(s), null, 2) + "\n";
    if (process.env.UPDATE_GOLDEN) writeFileSync(golden, got);
    expect(got).toBe(readFileSync(golden, "utf8"));
  });
});

describe("compaction as the Go view model words it", () => {
  it("says turn for one and turns for more, and adds nothing to the timeline without a worker", () => {
    const e = new Events();
    const compaction = (worker: string, summarizedTurns: number) =>
      e.add(worker, {
        case: "compaction",
        value: {
          model: "fast",
          summarizedTurns,
          keptTurns: 4,
          contextTokens: 160000n,
          summary: "s",
          usage: { inputTokens: 10n, outputTokens: 2n, cost: 0.5, currency: "EUR" },
        },
      });
    compaction("root", 1);
    compaction("root.1", 7);
    compaction("", 3);
    const s = fold(e.out);
    expect(s.workers.get("root")!.items[0].text).toBe(
      "context compacted at 160000 tokens: 1 turn summarised by fast, the last 4 kept",
    );
    expect(s.workers.get("root.1")!.items[0].text).toBe(
      "context compacted at 160000 tokens: 7 turns summarised by fast, the last 4 kept",
    );
    expect(s.items).toHaveLength(0);
    expect([s.usage.input, s.usage.cost]).toEqual([30, 1.5]);
    expect(e.out.map(describeEvent)[2]).toBe("compaction (fast): 3 turns summarised, 4 kept, at 160000 tokens");
  });
});

describe("the viewer", () => {
  it("expands a compaction to its summary", () => {
    render(<ActivityViewer events={events} />);
    const line = screen.getByText(/context compacted at 5380 tokens/).closest("details")!;
    expect(line.open).toBe(false);
    fireEvent.click(within(line).getByText(/context compacted/));
    expect(line.open).toBe(true);
    expect(line.textContent).toContain("totalled the revenue: north 7650 EUR");
  });

  it("shows skill calls, the compaction policy and the skills used", () => {
    render(<ActivityViewer events={events} mode="replay" />);
    const heads = screen.getAllByText("Skill").map((el) => el.closest("button")!.textContent);
    expect(heads).toEqual([
      expect.stringContaining("csv-report"),
      expect.stringContaining("csv-report · reference.md"),
    ]);
    fireEvent.click(screen.getByRole("tab", { name: "Profile" }));
    expect(screen.getByText("the context reaches 60% of the model's window")).toBeTruthy();
    expect(screen.getByText("the last 2 turns as they are")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Tools" }));
    const skill = screen.getByText("csv-report").closest("li")!;
    expect(within(skill).getByText("profile").className).toContain("actlet-chip");
    expect(skill.textContent).toContain("loaded 1 time; read reference.md");
    expect(skill.textContent).toContain("Summarise a CSV file of sales into a short report");
    expect(skill.textContent).toContain("files: reference.md, scripts/totals.py");
    expect(screen.queryByText(/lists only the skills the agent used/)).toBeNull();
  });

  it("shows only the skills used for a recording that doesn't list them", () => {
    const e = new Events();
    e.add("", { case: "sessionInfo", value: { taskId: "t", tools: [{ name: "skill", policy: "retry" }] } });
    e.add("root", { case: "toolStarted", value: { callId: "k", tool: "skill", input: '{"name":"pdf"}' } });
    e.add("root", { case: "toolFinished", value: { callId: "k", tool: "skill", output: "Skill pdf" } });
    render(<ActivityViewer events={e.out} mode="replay" />);
    fireEvent.click(screen.getByRole("tab", { name: "Tools" }));
    expect(screen.getByText("pdf").closest("li")!.textContent).toBe("pdf loaded 1 time");
    expect(screen.getByText(/lists only the skills the agent used/)).toBeTruthy();
  });

  it("passes axe on every tab, with the summary open", async () => {
    const { container } = render(<ActivityViewer events={events} />);
    fireEvent.click(screen.getByText(/context compacted/));
    for (const tab of TABS) {
      fireEvent.click(screen.getByRole("tab", { name: new RegExp(`^${tab}$`, "i") }));
      const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
      expect(result.violations.map((v) => `${tab}: ${v.id}`)).toEqual([]);
    }
  });
});

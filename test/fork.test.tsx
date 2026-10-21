import { readFileSync, writeFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityViewer } from "../src/react/ActivityViewer";
import { lineageText } from "../src/view/format";
import { fold } from "../src/view/session";
import { toViewState } from "../src/view/state-json";
import { digestEvents, fixture, forkEvents } from "./helpers";

afterEach(cleanup);

const events = forkEvents();

describe("a forked session", () => {
  const s = fold(events);

  it("knows where it was forked from", () => {
    expect(s.info?.lineage).toMatchObject({ checkpointSeq: 10n, turn: 2n });
    expect(s.info?.lineage?.parentSessionId).toMatch(/^[0-9a-f]{32}$/);
    expect(lineageText(s)).toMatch(/^[0-9a-f]{32} at checkpoint 10 \(turn 2\)$/);
    expect(s.resumed).toBe(true);
    // The calls of the checkpoint's turn are recovered, under a turn this viewer never saw.
    const first = s.workers.get("root")!.items.find((it) => it.turn)!.turn!;
    expect([first.unseen, first.calls.map((c) => c.name)]).toEqual([true, ["read_file", "skill"]]);
  });

  it("writes the lineage in the view state, and null for a session that isn't a fork", () => {
    const lineage = (toViewState(s).info as { lineage: Record<string, string> }).lineage;
    expect(lineage).toMatchObject({ checkpoint_seq: "10", turn: "2" });
    expect(lineage.forked_at).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect((toViewState(fold(digestEvents())).info as { lineage: unknown }).lineage).toBeNull();
  });

  it("matches the golden view state", () => {
    const golden = fixture("fork.view.json");
    const got = JSON.stringify(toViewState(s), null, 2) + "\n";
    if (process.env.UPDATE_GOLDEN) writeFileSync(golden, got);
    expect(got).toBe(readFileSync(golden, "utf8"));
  });

  it("shows the lineage in the Session tab and marks the header", () => {
    const { container } = render(<ActivityViewer events={events} mode="replay" />);
    const marker = container.querySelector(".actlet-fork") as HTMLElement;
    expect(marker.textContent).toMatch(/^⑂ fork, forked from [0-9a-f]{32} at checkpoint 10 \(turn 2\)$/);
    fireEvent.click(screen.getByRole("tab", { name: "Session" }));
    const row = screen.getByText("forked from").closest("div")!;
    expect(within(row).getByText(/at checkpoint 10 \(turn 2\)$/)).toBeTruthy();
  });

  it("has no marker when the session isn't a fork", () => {
    const { container } = render(<ActivityViewer events={digestEvents()} mode="replay" />);
    expect(container.querySelector(".actlet-fork")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Session" }));
    expect(screen.queryByText("forked from")).toBeNull();
  });
});

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityViewer } from "../src/react/ActivityViewer";
import { MAX_ITEMS, MAX_LOG, MAX_TEXT, fold, workers } from "../src/view/session";
import { syntheticEvents } from "./synthetic";

afterEach(cleanup);

const N = 20_000;
const events = syntheticEvents(N);

function time<T>(fn: () => T): [T, number] {
  const start = performance.now();
  const out = fn();
  return [out, performance.now() - start];
}

// Numbers are printed for the record; the bounds are loose so slow
// machines pass.
describe(`a ${N}-event session`, () => {
  it("folds quickly and keeps memory bounded", () => {
    expect(events).toHaveLength(N);
    const [s, ms] = time(() => fold(events));
    console.log(`fold ${N} events: ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(5000);
    expect(s.events).toBe(N);
    for (const w of workers(s)) {
      expect(w.items.length).toBeLessThanOrEqual(MAX_ITEMS);
      // Calls of dropped turns are let go.
      const kept = new Set(w.items.flatMap((it) => it.turn?.calls ?? []));
      for (const c of w.calls.values()) expect(kept.has(c) || c.status === "running").toBe(true);
      for (const it of w.items) {
        for (const c of it.turn?.calls ?? []) expect(c.output.length).toBeLessThanOrEqual(MAX_TEXT + 64);
      }
    }
    expect(s.log.length).toBeLessThanOrEqual(MAX_LOG);
    expect(s.workers.get("root")!.dropped).toBeGreaterThan(0);
  });

  it("folds appended events without folding again", () => {
    const batch = 500;
    let shown = events.slice(0, batch);
    const [view, first] = time(() => render(<ActivityViewer events={shown} />));
    const times: number[] = [];
    for (let n = 2 * batch; n <= N; n += batch) {
      shown = events.slice(0, n);
      const [, ms] = time(() => act(() => view.rerender(<ActivityViewer events={shown} />)));
      times.push(ms);
    }
    const total = times.reduce((a, b) => a + b, 0);
    const worst = Math.max(...times);
    console.log(
      `live: first ${batch} events ${first.toFixed(0)} ms; ${times.length} appends of ${batch}: ` +
        `${total.toFixed(0)} ms in all, ${(total / times.length).toFixed(1)} ms each on average, worst ${worst.toFixed(0)} ms`,
    );
    // Each append costs about the same: refolding everything would grow with the length.
    const early = times.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
    const late = times.slice(-5).reduce((a, b) => a + b, 0) / 5;
    expect(late).toBeLessThan(early * 4 + 50);
    const stream = view.container.querySelector(".actlet-stream")!;
    expect(stream.getAttribute("data-virtual")).toBe("true");
    expect(view.container.querySelector(".actlet-status")!.textContent).toContain("completed");
  });

  it("renders only the items near the view", () => {
    const [view, ms] = time(() => render(<ActivityViewer events={events} />));
    const rendered = view.container.querySelectorAll(".actlet-stream > .actlet-entry").length;
    console.log(`render all ${N} events at once: ${ms.toFixed(0)} ms, ${rendered} items in the page`);
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(80);
    // Following the end, the last item is in the page.
    expect(view.container.querySelector(".actlet-stream")!.textContent).toContain("session completed");
  });
});

// Compares this library's view state with Actlet's Go view model on the
// same events. Run it with scripts/parity.sh; without a Go dump given,
// only the diff itself is tested.
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseJsonl } from "../src/events";
import { fold } from "../src/view/session";
import { toViewState } from "../src/view/state-json";
import { describeDifference, diffJson } from "./json-diff";

const events = process.env.PARITY_EVENTS;
const goDump = process.env.PARITY_GO;

describe.skipIf(!events || !goDump)("parity with the Go view model", () => {
  it(`folds ${events} to the same view state as ${goDump}`, () => {
    const ts = toViewState(fold(parseJsonl(readFileSync(events!, "utf8"))));
    const go = JSON.parse(readFileSync(goDump!, "utf8"));
    if (process.env.PARITY_TS_OUT) writeFileSync(process.env.PARITY_TS_OUT, JSON.stringify(ts, null, 2) + "\n");
    const diffs = diffJson(ts, go, { loose: process.env.PARITY_STRICT !== "1" });
    if (diffs.length > 0) {
      const shown = diffs.slice(0, 50).map((d) => describeDifference(d));
      if (diffs.length > shown.length) shown.push(`… and ${diffs.length - shown.length} more`);
      expect.fail(`${diffs.length} differences:\n${shown.join("\n")}`);
    }
  });
});

describe("diffJson", () => {
  it("finds nothing between equal values", () => {
    const v = { a: [1, { b: "x" }], c: null, d: 0.1 + 0.2 };
    expect(diffJson(v, structuredClone(v))).toEqual([]);
  });

  it("names the paths that differ", () => {
    const diffs = diffJson(
      { workers: [{ id: "root", items: [{ turn: { calls: [{ status: "ok" }] } }] }], extra: 1 },
      { workers: [{ id: "root", items: [{ turn: { calls: [{ status: "error" }] } }] }] },
    );
    expect(diffs.map((d) => describeDifference(d))).toEqual([
      'workers[0].items[0].turn.calls[0].status: ts "ok" ≠ go "error"',
      "extra: ts 1 ≠ go (missing)",
    ]);
  });

  it("can treat Go's null slices as empty", () => {
    const ts = { diffs: [], info: { grants: [] }, budgets: {} };
    const go = { diffs: null, info: { grants: null } };
    expect(diffJson(ts, go)).toHaveLength(3);
    expect(diffJson(ts, go, { loose: true })).toEqual([]);
  });

  it("allows float rounding in costs, not in counts", () => {
    expect(diffJson({ cost: 0.3 }, { cost: 0.1 + 0.2 })).toEqual([]);
    expect(diffJson({ events: 78 }, { events: 79 })).toHaveLength(1);
  });
});

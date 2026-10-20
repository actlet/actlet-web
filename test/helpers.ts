import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import { ActivityEventSchema, type ActivityEvent } from "../src/gen/actlet/gateway/v0/gateway_pb";
import { parseJsonl } from "../src/events";

type Body = MessageInitShape<typeof ActivityEventSchema>["body"];

/** Builds a numbered event sequence, a second apart. */
export class Events {
  seq = 0;
  out: ActivityEvent[] = [];

  add(worker: string, body: Body): ActivityEvent {
    this.seq++;
    const ev = create(ActivityEventSchema, {
      id: `1.${this.seq}`,
      epoch: 1n,
      seq: BigInt(this.seq),
      worker,
      time: timestampFromMs(1_700_000_000_000 + this.seq * 1000),
      body,
    });
    this.out.push(ev);
    return ev;
  }
}

export function demoEvents(): ActivityEvent[] {
  return parseJsonl(readFileSync(fixture("demo.jsonl"), "utf8"));
}

/** The path of a fixture; tests run from the repository's root. */
export function fixture(name: string): string {
  return resolve(process.cwd(), "fixtures", name);
}

/** The release check that uses every standard tool: progress, feedback, budgets, decide and llm. */
export function standardEvents(): ActivityEvent[] {
  return parseJsonl(readFileSync(fixture("standard.jsonl"), "utf8"));
}

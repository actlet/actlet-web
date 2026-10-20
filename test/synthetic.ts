/**
 * A synthetic, deterministic activity stream of any length, for measuring
 * the viewer on long sessions: an agent working through many turns with
 * tool calls, file edits, the odd huge output, subagents and operator
 * notes. Used by the scale tests and the demo's synthetic mode.
 */
import { create, type MessageInitShape } from "@bufbuild/protobuf";
import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import { ActivityEventSchema, SessionState, type ActivityEvent } from "../src/gen/actlet/gateway/v0/gateway_pb";

type Body = MessageInitShape<typeof ActivityEventSchema>["body"];

export interface SyntheticOptions {
  /** Every this many calls, one has a huge output. */
  hugeEvery?: number;
  /** The size of a huge output, in characters. */
  hugeSize?: number;
}

/** Builds a stream of n events, ending with the session completed. */
export function syntheticEvents(n: number, opts: SyntheticOptions = {}): ActivityEvent[] {
  const { hugeEvery = 500, hugeSize = 1_000_000 } = opts;
  const out: ActivityEvent[] = [];
  let seq = 0;
  let clock = 1_760_000_000_000;
  const add = (worker: string, body: Body) => {
    seq++;
    clock += 150 + ((seq * 37) % 400);
    out.push(
      create(ActivityEventSchema, {
        id: `1.${seq}`,
        epoch: 1n,
        seq: BigInt(seq),
        worker,
        time: timestampFromMs(clock),
        body,
      }),
    );
  };
  const room = () => n - out.length - 1; // keep one for the end

  add("", { case: "started", value: { epoch: 1n, profileId: "synthetic" } });
  add("", {
    case: "sessionInfo",
    value: {
      taskId: "synthetic-long-run",
      taskKind: "agent",
      task: '{"id":"synthetic-long-run"}',
      models: { aliases: [{ alias: "large", contextWindow: 200_000n }] },
    },
  });
  add("", { case: "state", value: { to: SessionState.RUNNING } });

  let calls = 0;
  let subagents = 0;
  const turn = (worker: string, number: number) => {
    const tools = ["read_file", "grep", "shell", "edit_file"];
    const k = 1 + (number % 3);
    add(worker, {
      case: "modelTurn",
      value: {
        turn: BigInt(number),
        model: worker === "root" ? "large" : "fast",
        text: `Turn ${number} of ${worker}: looking at the next part of the work.\nIt has a second line.`,
        toolCalls: tools.slice(0, k),
        usage: { inputTokens: BigInt(1000 + number * 13), outputTokens: 120n, cost: 0.002, currency: "EUR" },
      },
    });
    for (let c = 0; c < k && room() > 3; c++) {
      calls++;
      const id = `${worker}-${number}-${c}`;
      const tool = tools[c];
      const path = `src/module${number % 40}.ts`;
      add(worker, { case: "toolStarted", value: { callId: id, tool, input: JSON.stringify({ path, pattern: "x" }) } });
      if (tool === "edit_file") {
        add(worker, {
          case: "fileChange",
          value: {
            callId: id,
            path,
            diff: `--- a/${path}\n+++ b/${path}\n@@ -1,2 +1,2 @@\n-old ${number}\n+new ${number}\n`,
          },
        });
      }
      const output =
        calls % hugeEvery === 0
          ? "x".repeat(hugeSize)
          : Array.from({ length: 8 }, (_, i) => `${path}:${i + 1}: line ${i} of the output`).join("\n");
      add(worker, { case: "toolFinished", value: { callId: id, tool, output, took: { nanos: 20_000_000 } } });
    }
  };

  let rootTurn = 0;
  while (room() > 8) {
    rootTurn++;
    turn("root", rootTurn);
    if (rootTurn % 60 === 0 && room() > 60) {
      // Two subagents, interleaved with each other.
      const ids = [`root.${++subagents}`, `root.${++subagents}`];
      add("root", {
        case: "modelTurn",
        value: { turn: BigInt(++rootTurn), model: "large", text: "Splitting the work." },
      });
      for (const id of ids) {
        add("root", {
          case: "toolStarted",
          value: { callId: `spawn-${id}`, tool: "spawn_subagent", input: '{"task":"part"}' },
        });
        add(id, {
          case: "subagentSpawned",
          value: { parent: "root", task: `Part ${id}`, model: "fast", callId: `spawn-${id}` },
        });
      }
      for (let t = 1; t <= 6 && room() > 20; t++) for (const id of ids) turn(id, t);
      for (const id of ids) {
        add(id, { case: "subagentFinished", value: { result: `${id} is done.`, turns: 6n } });
        add("root", { case: "toolFinished", value: { callId: `spawn-${id}`, tool: "spawn_subagent", output: "done" } });
      }
    }
    if (rootTurn % 250 === 0 && room() > 2)
      add("", { case: "steer", value: { note: `Note ${rootTurn}: keep going.`, actor: "op" } });
  }
  while (room() > 0) add("root", { case: "text", value: { text: "wrapping up" } });
  add("", { case: "state", value: { from: SessionState.RUNNING, to: SessionState.COMPLETED } });
  return out;
}

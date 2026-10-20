import { create } from "@bufbuild/protobuf";
import { timestampFromMs, timestampNow } from "@bufbuild/protobuf/wkt";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityEventSchema,
  ActivityViewer,
  CommandResult,
  gateway,
  type ActivityEvent,
  type Command,
  type EventInput,
} from "../src";
import { recording } from "./recording";

type Theme = "auto" | "dark" | "light";

/**
 * Live mode as an implementor would drive it: events are appended as they
 * "arrive" (here, the recording at its own pace, stamped with the current
 * time), and commands are acknowledged by appending the command events a
 * box would publish.
 */
export function SimulatedLive({ theme, speed }: { theme: Theme; speed: number }) {
  const [start] = useState(() => Date.now());
  // When each event arrives, in milliseconds from the start: the
  // recording's pace at the chosen speed, with long pauses shortened.
  const schedule = useMemo(() => {
    const out: number[] = [];
    let t = 0;
    recording.forEach((ev, i) => {
      if (i > 0) t += Math.min((ms(ev) - ms(recording[i - 1])) / speed, 1500);
      out.push(t);
    });
    return out;
  }, [speed]);
  const stamped = useMemo(
    () => recording.map((ev, i) => ({ ...ev, time: timestampFromMs(start + schedule[i]) })),
    [start, schedule],
  );
  const [arrived, setArrived] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now() - start;
      let n = 0;
      while (n < schedule.length && schedule[n] <= t) n++;
      setArrived(n);
    }, 100);
    return () => clearInterval(id);
  }, [start, schedule]);

  // Events the demo's stand-in for a box published for commands, and how
  // many recorded events had arrived before them.
  const [replies, setReplies] = useState<{ after: number; events: EventInput[] }[]>([]);
  const events = useMemo(() => {
    const out: EventInput[] = [];
    let r = 0;
    for (let i = 0; i <= arrived; i++) {
      while (r < replies.length && replies[r].after === i) out.push(...replies[r++].events);
      if (i < arrived) out.push(stamped[i]);
    }
    return out;
  }, [stamped, arrived, replies]);

  const onCommand = (command: Command) => {
    // A real implementor sends the command to its orchestrator here.
    const after = arrived;
    const seq = after > 0 ? stamped[after - 1].seq : 0n;
    setTimeout(() => setReplies((prev) => [...prev, { after, events: acknowledge(seq, command) }]), 600);
  };

  return (
    <ActivityViewer
      events={events}
      mode="live"
      theme={theme}
      sessionId="demo"
      connectionLabel="live demo"
      onCommand={onCommand}
      allowedCommands={["steer", "pause", "stop"]}
      actor="demo operator"
    />
  );
}

function ms(ev: ActivityEvent): number {
  return ev.time ? Number(ev.time.seconds) * 1000 + ev.time.nanos / 1e6 : 0;
}

/** The events a box publishes for a command it accepted. */
function acknowledge(seq: bigint, command: Command): EventInput[] {
  const make = (body: ActivityEvent["body"]) =>
    create(ActivityEventSchema, { id: `1.${seq}`, epoch: 1n, seq, time: timestampNow(), body });
  const out = [
    make({
      case: "command",
      value: create(gateway.CommandReceivedSchema, { command, result: CommandResult.ACCEPTED }),
    }),
  ];
  if (command.action.case === "steer") {
    const note = create(gateway.SteerNoteSchema, { note: command.action.value.note, actor: command.actor });
    out.push(make({ case: "steer", value: note }));
  }
  return out;
}

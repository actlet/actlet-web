/**
 * Feeding the viewer from server-sent events, with commands sent back as
 * POST requests. Each SSE message is one activity event as Protobuf JSON,
 * with its sequence number as the message ID, so when the connection
 * drops, EventSource reconnects with Last-Event-ID and the backend resends
 * only what was missed: every event reaches the viewer once.
 *
 *   GET  /mock/sse?session=<id>          text/event-stream of events; "end" when done
 *   POST /mock/sse/<id>/command          a Command as Protobuf JSON → a CommandAck
 *
 * Whether a command was accepted shows from the command event the session
 * publishes; the POST's answer could be passed as acks too.
 */
import { toJson } from "@bufbuild/protobuf";
import { useEffect, useState } from "react";
import { ActivityViewer, CommandSchema, type Command, type ViewerTheme } from "../../src";
import { useEventBuffer } from "./useEventBuffer";

export function SseExample({ theme }: { theme: ViewerTheme }) {
  const [events, push] = useEventBuffer();
  const [session] = useState(() => Math.random().toString(36).slice(2));
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const source = new EventSource(`/mock/sse?session=${session}&speed=4`);
    source.onmessage = (m) => push(JSON.parse(m.data));
    source.addEventListener("end", () => {
      source.close();
      setEnded(true);
    });
    return () => source.close();
  }, [session, push]);

  const onCommand = async (cmd: Command) => {
    const res = await fetch(`/mock/sse/${session}/command`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toJson(CommandSchema, cmd)),
    });
    // A rejected promise marks the command as not delivered.
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  };

  return (
    <ActivityViewer
      events={events}
      ended={ended}
      theme={theme}
      connectionLabel="server-sent events"
      onCommand={onCommand}
      allowedCommands={["steer", "pause"]}
      actor="demo operator"
    />
  );
}

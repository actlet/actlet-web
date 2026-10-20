/**
 * Feeding the viewer from a WebSocket. The backend (here, the demo's mock
 * server) sends each activity event as Protobuf JSON and acknowledges
 * commands; the viewer's commands go back over the same socket.
 *
 *   server → client  {"type":"event","event":{…ActivityEvent…}}
 *                    {"type":"ack","ack":{…CommandAck…}}
 *   client → server  {"type":"command","command":{…Command…}}
 *
 * The message shapes are this example's own; the viewer only sees the
 * events, the acks and the commands.
 */
import { fromJson, toJson } from "@bufbuild/protobuf";
import { useEffect, useRef, useState } from "react";
import { ActivityViewer, CommandAckSchema, CommandSchema, type Command, type CommandAck } from "../../src";
import { useEventBuffer } from "./useEventBuffer";

export function WebSocketExample({ theme }: { theme: "auto" | "dark" | "light" }) {
  const [events, push] = useEventBuffer();
  const [acks, setAcks] = useState<CommandAck[]>([]);
  const [status, setStatus] = useState("connecting");
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${scheme}://${location.host}/mock/ws?speed=4`);
    let closing = false;
    socket.current = ws;
    ws.onopen = () => setStatus("websocket");
    ws.onmessage = (m) => {
      const msg = JSON.parse(String(m.data));
      if (msg.type === "event") push(msg.event);
      else if (msg.type === "ack") setAcks((prev) => [...prev, fromJson(CommandAckSchema, msg.ack)]);
    };
    ws.onclose = () => !closing && setStatus("websocket closed");
    return () => {
      closing = true;
      ws.close();
    };
  }, [push]);

  const onCommand = (cmd: Command) => {
    const ws = socket.current;
    // Throwing marks the command as not delivered.
    if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error("not connected");
    ws.send(JSON.stringify({ type: "command", command: toJson(CommandSchema, cmd) }));
  };

  return (
    <ActivityViewer
      events={events}
      acks={acks}
      ended={status === "websocket closed"}
      theme={theme}
      connectionLabel={status === "websocket closed" ? "websocket" : status}
      onCommand={onCommand}
      allowedCommands={["steer", "pause", "stop"]}
      actor="demo operator"
    />
  );
}

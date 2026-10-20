# Feeding the viewer

The viewer never connects anywhere. Your app gets a session's activity events by whatever means it has and passes them
in. When the operator sends a command, the viewer calls `onCommand`, and your app delivers it. This page shows three
common setups. Each one runs in the demo (`pnpm dev`, then choose an example) against small mock servers in
`demo/mock-server.ts`, and `pnpm check:examples` runs them end to end.

| Example            | Events arrive                                                         | Commands go back                                                            | Source                               |
| ------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------ |
| WebSocket          | `{"type":"event","event":…}` messages                                 | `{"type":"command",…}` on the same socket, answered with `{"type":"ack",…}` | `demo/examples/WebSocketExample.tsx` |
| Server-sent events | one event per SSE message, with its sequence number as the message ID | `POST /…/command`                                                           | `demo/examples/SseExample.tsx`       |
| JSONL file         | a file from `actlet-cli replay export --jsonl`, fetched or picked     | none: replays take no commands                                              | `demo/examples/JsonlExample.tsx`     |

The message shapes are the examples' own. The viewer sees only events, acknowledgements and commands, all as
`actlet.gateway.v0` messages or their Protobuf JSON.

## The pattern

```tsx
const [events, setEvents] = useState<EventInput[]>([]);

// Append each event as it arrives. Always append: the viewer then folds only the new ones.
socket.onmessage = (m) => setEvents((prev) => [...prev, JSON.parse(m.data).event]);

<ActivityViewer
  events={events}
  ended={socketClosed} // says "run ended" and stops the clock
  onCommand={(cmd) => send(toJson(CommandSchema, cmd))}
  acks={acks} // optional: CommandAck messages your backend returns
  allowedCommands={["steer", "pause"]} // what your backend lets this operator do
/>;
```

- **Batch bursts.** Events can arrive hundreds at a time when a session starts or a client catches up. Collect them and
  append once per animation frame (`demo/examples/useEventBuffer.ts` does this in 20 lines), so a burst costs one
  render.
- **Feed each event once.** When a connection drops and comes back, resume after the last event you have. With SSE,
  give each message the event's `seq` as its ID, and `EventSource` sends `Last-Event-ID` when it reconnects. The viewer
  doesn't deduplicate.
- **A new session needs a new array.** If you switch sessions, pass a fresh array (or a new `key`). An array that doesn't
  start with the events already folded is folded from scratch.
- **Commands.** `onCommand` gets a complete `Command` with a fresh ID and `ORIGIN_REMOTE` (change it with
  `commandOrigin`). Send it as Protobuf JSON with `toJson(CommandSchema, cmd)`. If delivery fails, throw or return a
  rejected promise, and the viewer shows the command as not delivered. The outcome appears once the box publishes its
  `command` event. If your backend also returns `CommandAck`s, pass them as `acks` to show the outcome sooner. The
  allowed commands should be the ones your backend accepts from this operator; the default is steer notes only.
- **Files.** To open files from a live box, pass `readFile(path)`. It receives the path relative to the session folder,
  and `toolPath(path)` gives the form Actlet's `FileRequest` takes. Resolve with the `FileResponse` fields (`content`,
  `size`, `truncated`, `binary`, `error`). Without `readFile`, the viewer shows what the events hold.

## Replays

For a recording, decode the whole file and pass it with `mode="replay"`:

```tsx
const events = parseJsonl(await (await fetch(url)).text());
<ActivityViewer events={events} mode="replay" autoPlay speed={8} />;
```

`parseJsonl` throws on a line that isn't an event and says which line. Decoding `.actrec` files stays on your side: run
`actlet-cli replay export --jsonl` on your backend, or use Actlet's Go SDK.

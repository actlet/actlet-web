/**
 * Mock servers for the demo's integration examples: a stand-in for an
 * implementor's backend that streams a session's events over a WebSocket
 * or server-sent events, takes commands back, and serves the recording as
 * a JSONL file. Each connection plays the demo recording as a new live
 * session, stamped with the current time, and acts on commands the way a
 * box would: it publishes a command event for each, a note for a steer,
 * and state changes for pause and stop.
 *
 * Dev only: it runs inside the demo's Vite server, never in the library.
 */
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { create, fromJson, toJson, type JsonObject } from "@bufbuild/protobuf";
import { timestampNow } from "@bufbuild/protobuf/wkt";
import type { Plugin, PreviewServer, ViteDevServer } from "vite";
import { WebSocketServer, type WebSocket } from "ws";
import {
  ActivityEventSchema,
  BudgetAction,
  BudgetStatusSchema,
  BudgetUsageSchema,
  CommandAckSchema,
  CommandReceivedSchema,
  CommandResult,
  CommandSchema,
  SessionState,
  StateChangeSchema,
  SteerNoteSchema,
  type ActivityEvent,
  type BudgetUsage,
  type Command,
} from "../src/gen/actlet/gateway/v0/gateway_pb.ts";

const fixture = fileURLToPath(new URL("../fixtures/demo.jsonl", import.meta.url));

type Body = ActivityEvent["body"];

/** A live session that replays the recording at a speed and takes commands. */
class MockSession {
  /** Every event published, so a client that reconnects can catch up. */
  readonly history: JsonObject[] = [];
  private readonly listeners = new Set<(ev: JsonObject) => void>();
  private readonly recording: ActivityEvent[];
  private next = 0;
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  ended = false;
  /** The budgets as last reported. */
  private budgets: BudgetUsage[] = [];
  onEnd = () => {};

  constructor(private readonly speed: number) {
    this.recording = readFileSync(fixture, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => fromJson(ActivityEventSchema, JSON.parse(l)));
    this.timer = setTimeout(() => this.play(), 300);
  }

  subscribe(fn: (ev: JsonObject) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Publishes an event: numbered in order and stamped now, as a box does. */
  private publish(worker: string, body: Body) {
    this.seq++;
    const ev = create(ActivityEventSchema, {
      id: `1.${this.seq}`,
      epoch: 1n,
      seq: BigInt(this.seq),
      time: timestampNow(),
      worker,
      body,
    });
    if (body.case === "budgetStatus") this.budgets = body.value.budgets;
    const json = toJson(ActivityEventSchema, ev, { useProtoFieldName: true }) as JsonObject;
    this.history.push(json);
    for (const fn of this.listeners) fn(json);
    if (
      body.case === "state" &&
      [SessionState.COMPLETED, SessionState.STOPPED, SessionState.PAUSED].includes(body.value.to)
    ) {
      this.end();
    }
  }

  private play() {
    if (this.ended || this.next >= this.recording.length) return;
    const ev = this.recording[this.next++];
    this.publish(ev.worker, ev.body);
    if (this.next < this.recording.length) {
      const gap = ms(this.recording[this.next]) - ms(ev);
      this.timer = setTimeout(() => this.play(), Math.min(gap / this.speed, 1500));
    }
  }

  private end() {
    this.ended = true;
    clearTimeout(this.timer);
    this.onEnd();
  }

  /** Acts on a command; returns what the box would acknowledge. */
  command(cmd: Command): { result: CommandResult; message: string } {
    if (this.ended) return { result: CommandResult.REJECTED, message: "the session has ended" };
    const ack = {
      result: CommandResult.ACCEPTED,
      message: cmd.action.case === "profileUpdate" ? `changed ${cmd.action.value.fields.join(", ")}` : "",
    };
    this.publish("", { case: "command", value: create(CommandReceivedSchema, { command: cmd, ...ack }) });
    const state = (from: SessionState, to: SessionState, reason: string) =>
      this.publish("", { case: "state", value: create(StateChangeSchema, { from, to, reason }) });
    switch (cmd.action.case) {
      case "steer":
        this.publish("", {
          case: "steer",
          value: create(SteerNoteSchema, { note: cmd.action.value.note, origin: cmd.origin, actor: cmd.actor }),
        });
        break;
      case "pause":
        state(SessionState.RUNNING, SessionState.PAUSING, "pause requested");
        setTimeout(() => state(SessionState.PAUSING, SessionState.PAUSED, "paused"), 800);
        break;
      case "stop":
        state(SessionState.RUNNING, SessionState.STOPPING, "stop requested");
        setTimeout(() => state(SessionState.STOPPING, SessionState.STOPPED, "stopped"), 800);
        break;
      case "profileUpdate": {
        // New limits, the usage so far (or none for a reset budget), and the state that gives.
        const u = cmd.action.value;
        if (!u.fields.includes("budgets") && u.resetBudgets.length === 0) break;
        const defs = u.fields.includes("budgets") ? (u.profile?.budgets ?? []) : [];
        const budgets = (defs.length > 0 ? defs : this.budgets).map((b) => {
          const before = this.budgets.find((x) => x.kind === b.kind);
          const used = u.resetBudgets.includes(b.kind) ? 0 : (before?.used ?? 0);
          const alert = "alertAtPercent" in b ? b.alertAtPercent : 0;
          const wait = "onExhaust" in b && b.onExhaust === BudgetAction.WAIT;
          const st =
            b.limit > 0 && used >= b.limit
              ? wait
                ? "waiting"
                : "exhausted"
              : alert > 0 && used * 100 >= b.limit * alert
                ? "alerted"
                : "ok";
          return create(BudgetUsageSchema, { kind: b.kind, limit: b.limit, used, currency: b.currency, state: st });
        });
        const reason = u.resetBudgets.length > 0 && defs.length === 0 ? "reset" : "update";
        this.publish("", { case: "budgetStatus", value: create(BudgetStatusSchema, { budgets, reason }) });
        break;
      }
    }
    return ack;
  }

  close() {
    this.end();
    this.listeners.clear();
  }
}

function ms(ev: ActivityEvent): number {
  return ev.time ? Number(ev.time.seconds) * 1000 + ev.time.nanos / 1e6 : 0;
}

function speedOf(url: URL): number {
  const s = Number(url.searchParams.get("speed") ?? 4);
  return s > 0 && s <= 64 ? s : 4;
}

/**
 * The WebSocket protocol: the server sends {"type":"event","event":…} for
 * each event (Protobuf JSON) and {"type":"ack","ack":…} for each command
 * (a CommandAck); the client sends {"type":"command","command":…}.
 */
function attachWebSocket(httpServer: NonNullable<ViteDevServer["httpServer"]>) {
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/mock/ws") return; // Vite's own sockets
    wss.handleUpgrade(req, socket, head, (ws) => serveWebSocket(ws, new MockSession(speedOf(url))));
  });
}

function serveWebSocket(ws: WebSocket, session: MockSession) {
  const unsubscribe = session.subscribe((event) => ws.send(JSON.stringify({ type: "event", event })));
  session.onEnd = () => setTimeout(() => ws.close(1000, "session ended"), 200);
  ws.on("message", (data) => {
    let cmd: Command;
    try {
      const msg = JSON.parse(String(data));
      cmd = fromJson(CommandSchema, msg.command);
    } catch {
      return; // not a command
    }
    const ack = create(CommandAckSchema, { commandId: cmd.id, ...session.command(cmd) });
    ws.send(JSON.stringify({ type: "ack", ack: toJson(CommandAckSchema, ack, { useProtoFieldName: true }) }));
  });
  ws.on("close", () => {
    unsubscribe();
    session.close();
  });
}

/**
 * Server-sent events: GET /mock/sse?session=<id> streams the session's
 * events, each with its sequence number as the event ID, so a reconnecting
 * EventSource resumes after the last one it got; an "end" event closes the
 * session. POST /mock/sse/<id>/command takes a command as Protobuf JSON.
 */
const sseSessions = new Map<string, MockSession>();

function serveSse(req: IncomingMessage, res: ServerResponse, url: URL) {
  const id = url.searchParams.get("session") ?? "";
  if (!/^[\w-]{1,64}$/.test(id)) return void res.writeHead(400).end("a session ID is required");
  let session = sseSessions.get(id);
  if (!session) {
    session = new MockSession(speedOf(url));
    sseSessions.set(id, session);
    const s = session;
    setTimeout(() => sseSessions.get(id) === s && sseSessions.delete(id), 30 * 60 * 1000);
  }
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  const send = (ev: JsonObject) => res.write(`id: ${ev.seq}\ndata: ${JSON.stringify(ev)}\n\n`);
  const after = Number(req.headers["last-event-id"] ?? 0);
  for (const ev of session.history) if (Number(ev.seq) > after) send(ev);
  const s = session;
  const end = () => res.end("event: end\ndata: {}\n\n");
  if (s.ended) return end();
  const unsubscribe = s.subscribe(send);
  s.onEnd = () => setTimeout(end, 200);
  req.on("close", unsubscribe);
}

async function serveSseCommand(req: IncomingMessage, res: ServerResponse, id: string) {
  const session = sseSessions.get(id);
  if (!session) return void res.writeHead(404).end("no such session");
  let body = "";
  for await (const chunk of req) body += chunk;
  let cmd: Command;
  try {
    cmd = fromJson(CommandSchema, JSON.parse(body));
  } catch (e) {
    return void res.writeHead(400).end(`not a command: ${e instanceof Error ? e.message : e}`);
  }
  const ack = create(CommandAckSchema, { commandId: cmd.id, ...session.command(cmd) });
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(toJson(CommandAckSchema, ack, { useProtoFieldName: true })));
}

function middleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/mock/sse" && req.method === "GET") return serveSse(req, res, url);
  const m = /^\/mock\/sse\/([\w-]{1,64})\/command$/.exec(url.pathname);
  if (m && req.method === "POST") return void serveSseCommand(req, res, m[1]);
  if (url.pathname === "/mock/demo.jsonl") {
    res.writeHead(200, { "content-type": "application/x-ndjson" });
    return void res.end(readFileSync(fixture));
  }
  next();
}

/** The mock servers as a Vite plugin, for the dev server and the preview server. */
export function mockServers(): Plugin {
  const install = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use(middleware);
    if (server.httpServer) attachWebSocket(server.httpServer);
  };
  return { name: "actlet-mock-servers", configureServer: install, configurePreviewServer: install };
}

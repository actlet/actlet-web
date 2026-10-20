/**
 * The session view as JSON, for comparing the TypeScript and Go view
 * models on the same events. docs/view-state.md describes the format.
 */
import { toJson } from "@bufbuild/protobuf";
import {
  BudgetSchema,
  ModelCatalogSchema,
  SessionState,
  ToolGrantSchema,
  ToolInfoSchema,
} from "../gen/actlet/gateway/v0/gateway_pb";
import {
  files,
  models,
  workers,
  type Diff,
  type Item,
  type LogLine,
  type Session,
  type ToolCall,
  type Turn,
  type Usage,
} from "./session";

/** The format's version. */
export const VIEW_STATE_VERSION = 1;

export type ViewStateJson = Record<string, unknown>;

const opts = { useProtoFieldName: true } as const;

/** The session view as a JSON value. */
export function toViewState(s: Session): ViewStateJson {
  const info = s.info;
  return {
    version: VIEW_STATE_VERSION,
    id: s.id,
    epoch: s.epoch,
    state: "SESSION_STATE_" + (SessionState[s.state] ?? String(s.state)),
    reason: s.reason,
    resumed: s.resumed,
    profile: s.profile,
    events: s.events,
    skipped: s.skipped,
    first: s.first?.time ?? null,
    last: s.last?.time ?? null,
    info: info && {
      task_id: info.taskId,
      task_kind: info.taskKind,
      task: info.task,
      config: info.config,
      budgets: info.budgets.map((b) => toJson(BudgetSchema, b, opts)),
      models: info.models && toJson(ModelCatalogSchema, info.models, opts),
      tools: info.tools.map((t) => toJson(ToolInfoSchema, t, opts)),
      grants: info.grants.map((g) => toJson(ToolGrantSchema, g, opts)),
      manifest: info.manifest,
      worker_id: info.workerId,
      version: info.version,
      local_commands: info.localCommands,
    },
    usage: usage(s.usage),
    items: s.items.map(item),
    dropped: s.dropped,
    workers: workers(s).map((w) => ({
      id: w.id,
      parent: w.parent,
      call_id: w.callId,
      model: w.model,
      task: w.task,
      status: w.status,
      result: w.result,
      turns: w.turns,
      context: w.context,
      usage: usage(w.usage),
      items: w.items.map(item),
      dropped: w.dropped,
    })),
    files: files(s),
    models: models(s),
    log: s.log.map(logLine),
    log_dropped: s.logDropped,
  };
}

function usage(u: Usage) {
  return {
    input: u.input,
    output: u.output,
    cache_read: u.cacheRead,
    cache_write: u.cacheWrite,
    cost: u.cost,
    currency: u.currency,
  };
}

function item(it: Item) {
  return {
    kind: it.kind,
    epoch: it.epoch,
    seq: it.seq,
    time: it.time,
    turn: it.turn && turn(it.turn),
    text: it.text,
    from: it.from,
    warn: it.warn,
  };
}

function turn(t: Turn) {
  return {
    number: t.number,
    model: t.model,
    text: t.text,
    usage: usage(t.usage),
    stop: t.stop,
    calls: t.calls.map(call),
    unseen: t.unseen,
  };
}

function call(c: ToolCall) {
  return {
    call_id: c.callId,
    name: c.name,
    input: c.input,
    status: c.status,
    output: c.output,
    took_ns: c.took,
    diffs: c.diffs.map((d: Diff) => ({ path: d.path, created: d.created, diff: d.diff })),
    child: c.child,
    epoch: c.epoch,
    seq: c.seq,
  };
}

function logLine(l: LogLine) {
  return { epoch: l.epoch, seq: l.seq, time: l.time, worker: l.worker, text: l.text };
}

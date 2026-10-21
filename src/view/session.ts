/**
 * The session view: folds a session's activity events into what a viewer
 * shows: the session's state, its workers, and each worker's conversation
 * as model turns, each with the assistant's text and its tool calls and
 * their results. It is deterministic, so a live viewer and a replay of the
 * same events arrive at the same state.
 *
 * A port of the Go view model; keep the two in step. Text from events is
 * untrusted (it comes from models, tools and files): terminal control
 * sequences are removed as events are folded.
 */
import {
  BudgetKind,
  CommandResult,
  Origin,
  PauseMode,
  SessionState,
  StopReason,
  type ActivityEvent,
  type Budget,
  type Command,
  type Compaction,
  type Lineage,
  type ModelCatalog,
  type SkillInfo,
  type ToolGrant,
  type ToolInfo,
  type Usage as UsageMessage,
} from "../gen/actlet/gateway/v0/gateway_pb";
import { sessionPath } from "./paths";
import { sanitize } from "./sanitize";
import { EPOCH, instant, nanos, type Instant } from "./time";

/** Bounds a timeline; older items are dropped and counted. */
export const MAX_ITEMS = 2000;
/** Bounds the raw event log. */
export const MAX_LOG = 5000;
/**
 * Bounds each piece of text a view keeps, in characters. Actlet cuts
 * content far shorter than this; the bound only holds memory in check
 * when an implementor feeds something larger.
 */
export const MAX_TEXT = 256 * 1024;
/** Bounds the feedback kept. */
export const MAX_FEEDBACK = 200;

/** Tokens, and what they cost when the gateway says. */
export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  currency: string;
}

/** The presentation state of a session. */
export interface Session {
  id: string;
  epoch: number;
  state: SessionState;
  reason: string;
  resumed: boolean;
  /** The profile ID from the latest start. */
  profile: string;
  /** The events folded. */
  events: number;
  /** The events known to be missing: gaps, or events a viewer missed. */
  skipped: number;
  /** The times of the first and latest events; null before any event with a time. */
  first: Instant | null;
  last: Instant | null;
  /** Describes the run, from its session_info event; null before it. */
  info: Info | null;
  /** Totals the model calls' tokens and cost, and those of tool calls through the gateway. */
  usage: Usage;
  /** The agent's latest progress report; null before one. */
  progress: Progress | null;
  /** What the agent sent with send_feedback, oldest first. */
  feedback: Feedback[];
  feedbackDropped: number;
  /** The budgets as the latest budget status reported them; null before one. */
  budgets: BudgetState[] | null;
  /** The session's own timeline: its start and state changes, commands, operator notes and messages. */
  items: Item[];
  dropped: number;
  /** Every event as one line, newest last. */
  log: LogLine[];
  logDropped: number;
  /** The workers by ID, and the order they were first seen in. */
  workers: Map<string, Worker>;
  order: string[];
}

/** A progress report of the agent's. */
export interface Progress extends Instant {
  worker: string;
  message: string;
  /** How far along it is, from 0 to 100, or -1 when it didn't say. */
  percent: number;
}

/** Feedback the agent sent. */
export interface Feedback extends Instant {
  worker: string;
  /** "problem", "suggestion", "question" or "other". */
  kind: string;
  message: string;
}

/** A budget as a budget status reported it. */
export interface BudgetState {
  kind: BudgetKind;
  limit: number;
  used: number;
  currency: string;
  /** "ok", "alerted" (past the alert threshold), "exhausted", or "waiting" (exhausted, and work waits for it to be raised). */
  state: string;
}

export type WorkerStatus = "running" | "finished" | "failed";

/** One worker of the session's agent: "root", or a subagent such as "root.1". */
export interface Worker {
  id: string;
  parent: string;
  /** The parent's spawn_subagent call waiting for it. */
  callId: string;
  model: string;
  /** A subagent's subtask. */
  task: string;
  status: WorkerStatus;
  /** A finished subagent's final answer. */
  result: string;
  turns: number;
  /** The input tokens of the worker's latest model call: how full its context is. */
  context: number;
  usage: Usage;
  /** The worker's timeline: its model turns and messages. */
  items: Item[];
  dropped: number;
  /** The latest turn, which new tool calls join. */
  last: Turn | null;
  /** Tool calls by call ID. */
  calls: Map<string, ToolCall>;
}

/** What a timeline item is: a model turn and its tool calls, an operator's note, or a message from Actlet or about the session. */
export type ItemKind = "turn" | "note" | "system";

/** One entry of a timeline. */
export interface Item extends Instant {
  kind: ItemKind;
  epoch: number;
  seq: number;
  turn: Turn | null;
  text: string;
  /** Who sent a note. */
  from: string;
  /** A system item worth attention, such as a gap. */
  warn: boolean;
  /** More to show on request, such as a compaction's summary; "" when there is none. Not in the view-state JSON. */
  detail: string;
}

/** One model call: the assistant's answer and the tool calls it made. */
export interface Turn {
  number: number;
  model: string;
  text: string;
  usage: Usage;
  stop: string;
  calls: ToolCall[];
  /** Marks calls whose model turn this viewer never saw. */
  unseen: boolean;
}

/** How a tool call went; "unknown" when the worker stopped while it ran. */
export type ToolStatus = "running" | "ok" | "error" | "unknown";

/** A tool call and its result. */
export interface ToolCall {
  callId: string;
  name: string;
  input: string;
  status: ToolStatus;
  output: string;
  /** How long it took, in nanoseconds. */
  took: number;
  /** What a call through the gateway used, such as an llm call; null for local tools. Not in the view-state JSON. */
  usage: Usage | null;
  diffs: Diff[];
  /** The subagent a spawn_subagent call started. */
  child: string;
  epoch: number;
  seq: number;
}

/** A file a tool call changed. */
export interface Diff {
  path: string;
  created: boolean;
  diff: string;
}

/** One event, described in a line. */
export interface LogLine extends Instant {
  epoch: number;
  seq: number;
  worker: string;
  text: string;
}

/** Describes a run: its task, configuration and tools. Text is sanitized; the messages are kept as sent. */
export interface Info {
  taskId: string;
  taskKind: string;
  /** task.json. */
  task: string;
  /** The effective configuration as JSON. */
  config: string;
  budgets: Budget[];
  models: ModelCatalog | null;
  tools: ToolInfo[];
  grants: ToolGrant[];
  manifest: string;
  workerId: string;
  version: string;
  localCommands: string[];
  /** The skills the agent may load. */
  skills: SkillInfo[];
  /** Where a session forked from another's checkpoint comes from; null when it isn't a fork. */
  lineage: Lineage | null;
}

/** A file changed in the session. */
export interface File {
  /** Relative to the session folder, such as "workspace/totals.py" or "output/report.md". */
  path: string;
  /** The lines of all its changes together. */
  added: number;
  removed: number;
  /** How many changes it had. */
  changes: number;
}

function newUsage(): Usage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, currency: "" };
}

function addUsage(u: Usage, m: UsageMessage | undefined) {
  if (!m) return;
  u.input += Number(m.inputTokens);
  u.output += Number(m.outputTokens);
  u.cacheRead += Number(m.cacheReadTokens);
  u.cacheWrite += Number(m.cacheWriteTokens);
  u.cost += m.cost;
  if (m.currency !== "") u.currency = keep(m.currency);
}

/** Returns an empty session view. */
export function newSession(id = ""): Session {
  return {
    id,
    epoch: 0,
    state: SessionState.UNSPECIFIED,
    reason: "",
    resumed: false,
    profile: "",
    events: 0,
    skipped: 0,
    first: null,
    last: null,
    info: null,
    usage: newUsage(),
    progress: null,
    feedback: [],
    feedbackDropped: 0,
    budgets: null,
    items: [],
    dropped: 0,
    log: [],
    logDropped: 0,
    workers: new Map(),
    order: [],
  };
}

/** Folds events into a new session view. */
export function fold(events: Iterable<ActivityEvent>, id = ""): Session {
  const s = newSession(id);
  for (const ev of events) apply(s, ev);
  return s;
}

/** Returns the workers as a tree: each parent before its subagents. */
export function workers(s: Session): Worker[] {
  const out = s.order.map((id) => s.workers.get(id)!);
  return out.sort((a, b) => compareWorkers(a.id, b.id));
}

/** Orders worker IDs as a tree: root, root.1, root.1.1, root.2, root.10. */
export function compareWorkers(a: string, b: string): number {
  const pa = a.split("."),
    pb = b.split(".");
  for (let i = 0; i < pa.length && i < pb.length; i++) {
    if (pa[i] === pb[i]) continue;
    const na = leadingInt(pa[i]),
      nb = leadingInt(pb[i]);
    if (na !== null && nb !== null) return na - nb;
    return pa[i] < pb[i] ? -1 : 1;
  }
  return pa.length - pb.length;
}

function leadingInt(s: string): number | null {
  const m = /^[+-]?\d+/.exec(s);
  return m ? Number(m[0]) : null;
}

function getWorker(s: Session, id: string): Worker {
  let w = s.workers.get(id);
  if (!w) {
    const i = id.lastIndexOf(".");
    w = {
      id,
      parent: i > 0 ? id.slice(0, i) : "",
      callId: "",
      model: "",
      task: "",
      status: "running",
      result: "",
      turns: 0,
      context: 0,
      usage: newUsage(),
      items: [],
      dropped: 0,
      last: null,
      calls: new Map(),
    };
    s.workers.set(id, w);
    s.order.push(id);
  }
  return w;
}

/** The call ID each call is known by in its worker's calls, as the event gave it. */
const callKeys = new WeakMap<ToolCall, string>();

/** Sanitizes text the view keeps, and bounds it to MAX_TEXT characters, marking the cut. */
export function keep(s: string): string {
  if (s.length <= MAX_TEXT) return sanitize(s);
  const clean = sanitize(s.slice(0, MAX_TEXT));
  return `${clean}\n[viewer cut ${s.length - MAX_TEXT} characters]`;
}

function addItem(owner: { items: Item[]; dropped: number }, it: Item): Item[] {
  owner.items.push(it);
  if (owner.items.length <= MAX_ITEMS) return [];
  const n = owner.items.length - MAX_ITEMS;
  owner.dropped += n;
  return owner.items.splice(0, n);
}

/**
 * Adds an item to a worker's timeline. The finished calls of turns that
 * fall off it are let go too, so a long session's memory stays bounded;
 * a call still running stays known, to take its result.
 */
function addWorkerItem(w: Worker, it: Item) {
  for (const old of addItem(w, it)) {
    for (const c of old.turn?.calls ?? []) {
      const key = callKeys.get(c);
      if (c.status !== "running" && key !== undefined && w.calls.get(key) === c) w.calls.delete(key);
    }
  }
}

function where(ev: ActivityEvent | null): { epoch: number; seq: number } & Instant {
  if (!ev) return { epoch: 0, seq: 0, ...EPOCH };
  return { epoch: Number(ev.epoch), seq: Number(ev.seq), ...instant(ev.time) };
}

function item(ev: ActivityEvent | null, kind: ItemKind, fields: Partial<Item> = {}): Item {
  return { kind, ...where(ev), turn: null, text: "", from: "", warn: false, detail: "", ...fields };
}

/** The worker's latest turn, for its tool calls: one this viewer never saw if there is none. */
function latestTurn(w: Worker, ev: ActivityEvent): Turn {
  if (!w.last) {
    w.last = { number: 0, model: "", text: "", usage: newUsage(), stop: "", calls: [], unseen: true };
    addWorkerItem(w, item(ev, "turn", { turn: w.last }));
  }
  return w.last;
}

/** A tool call of the worker, added to its latest turn if it is new. */
function call(w: Worker, ev: ActivityEvent, id: string, name: string): ToolCall {
  let c = w.calls.get(id);
  if (!c) {
    c = {
      callId: keep(id),
      name: keep(name),
      input: "",
      status: "running",
      output: "",
      took: 0,
      usage: null,
      diffs: [],
      child: "",
      epoch: Number(ev.epoch),
      seq: Number(ev.seq),
    };
    latestTurn(w, ev).calls.push(c);
    w.calls.set(id, c);
    callKeys.set(c, id);
  }
  return c;
}

/** The first spawn_subagent call of the latest turn that no subagent claims yet. */
function unclaimedSpawn(w: Worker): ToolCall | null {
  for (const c of w.last?.calls ?? []) {
    if (c.name === "spawn_subagent" && c.child === "") return c;
  }
  return null;
}

/** Records events a viewer missed. */
export function skip(s: Session, n: number) {
  s.skipped += n;
  system(s, null, `${n} events missed`, true);
}

function system(s: Session, ev: ActivityEvent | null, text: string, warn: boolean) {
  addItem(s, item(ev, "system", { text: keep(text), warn }));
}

function log(s: Session, ev: ActivityEvent, text: string) {
  s.log.push({ ...where(ev), worker: keep(ev.worker), text: keep(text) });
  if (s.log.length > MAX_LOG) {
    const n = s.log.length - MAX_LOG;
    s.log.splice(0, n);
    s.logDropped += n;
  }
}

/** Folds one event into the view. */
export function apply(s: Session, ev: ActivityEvent) {
  s.events++;
  const at = where(ev);
  if (ev.time) {
    const t = instant(ev.time);
    if (!s.first) s.first = t;
    s.last = t;
  }
  if (Number(ev.epoch) > s.epoch) s.epoch = Number(ev.epoch);
  log(s, ev, describe(ev));
  const w = ev.worker !== "" ? getWorker(s, ev.worker) : null;
  const b = ev.body;
  switch (b.case) {
    case "started": {
      s.resumed = b.value.resumed;
      s.profile = keep(b.value.profileId);
      let text = `run ${b.value.epoch} started`;
      if (b.value.resumed) text += ", resuming the session";
      system(s, ev, text, false);
      break;
    }
    case "state": {
      s.state = b.value.to;
      s.reason = keep(b.value.reason);
      if (b.value.from !== SessionState.UNSPECIFIED) {
        let text = "session " + stateName(b.value.to);
        if (b.value.reason !== "") text += ": " + b.value.reason;
        system(s, ev, text, b.value.to === SessionState.FAILED);
      }
      break;
    }
    case "command": {
      const c = b.value;
      if (c.command?.action.case === "steer" && c.result === CommandResult.ACCEPTED) {
        break; // the note itself shows
      }
      let text = `${commandName(c.command)} from ${originName(c.command?.origin ?? Origin.UNSPECIFIED)} ${enumName(CommandResult, c.result)}`;
      if (c.message !== "") text += ": " + c.message;
      system(s, ev, text, c.result === CommandResult.REJECTED);
      break;
    }
    case "steer": {
      const who = b.value.actor !== "" ? b.value.actor : originName(b.value.origin);
      addItem(s, item(ev, "note", { text: keep(b.value.note), from: keep(who) }));
      break;
    }
    case "text":
      if (w) addWorkerItem(w, item(ev, "system", { text: keep(b.value.text) }));
      else system(s, ev, b.value.text, false);
      break;
    case "gap":
      s.skipped += Number(b.value.dropped);
      system(s, ev, `${b.value.dropped} events dropped by the worker`, true);
      break;
    case "modelTurn": {
      if (!w) break;
      const m = b.value;
      w.turns = Math.max(w.turns, Number(m.turn));
      if (m.model !== "") w.model = keep(m.model);
      w.context = Number(m.usage?.inputTokens ?? 0);
      addUsage(w.usage, m.usage);
      addUsage(s.usage, m.usage);
      const t: Turn = {
        number: Number(m.turn),
        model: keep(m.model),
        text: keep(m.text),
        usage: newUsage(),
        stop: enumName(StopReason, m.stopReason),
        calls: [],
        unseen: false,
      };
      addUsage(t.usage, m.usage);
      w.last = t;
      addWorkerItem(w, { ...at, kind: "turn", turn: t, text: "", from: "", warn: false, detail: "" });
      break;
    }
    case "toolStarted": {
      if (!w) break;
      const t = b.value;
      const old = w.calls.get(t.callId);
      if (old && old.status !== "running") w.calls.delete(t.callId); // run again after recovery: a new call
      call(w, ev, t.callId, t.tool).input = keep(t.input);
      break;
    }
    case "toolFinished": {
      if (!w) break;
      const f = b.value;
      const c = call(w, ev, f.callId, f.tool);
      c.output = keep(f.output);
      c.took = nanos(f.took);
      addUsage(w.usage, f.usage);
      addUsage(s.usage, f.usage);
      if (f.usage) {
        c.usage = newUsage();
        addUsage(c.usage, f.usage);
      }
      c.status = f.outcomeUnknown ? "unknown" : f.isError ? "error" : "ok";
      break;
    }
    case "compaction": {
      const c = b.value;
      addUsage(s.usage, c.usage);
      if (w) {
        addUsage(w.usage, c.usage);
        addWorkerItem(w, item(ev, "system", { text: keep(compactionText(c)), detail: keep(c.summary) }));
      }
      break;
    }
    case "progress": {
      const pr = b.value;
      s.progress = {
        ...at,
        worker: keep(ev.worker),
        message: keep(pr.message),
        percent: pr.percent === undefined ? -1 : Math.min(pr.percent, 100),
      };
      break;
    }
    case "budgetStatus":
      s.budgets = b.value.budgets.map((u) => ({
        kind: u.kind,
        limit: u.limit,
        used: u.used,
        currency: keep(u.currency),
        state: keep(u.state),
      }));
      break;
    case "feedback": {
      s.feedback.push({ ...at, worker: keep(ev.worker), kind: keep(b.value.kind), message: keep(b.value.message) });
      const n = s.feedback.length - MAX_FEEDBACK;
      if (n > 0) {
        s.feedback.splice(0, n);
        s.feedbackDropped += n;
      }
      break;
    }
    case "fileChange": {
      if (!w) break;
      const f = b.value;
      call(w, ev, f.callId, "file change").diffs.push({
        path: keep(f.path),
        created: f.created,
        diff: keep(f.diff),
      });
      break;
    }
    case "subagentSpawned": {
      if (!w) break;
      const sp = b.value;
      w.parent = keep(sp.parent);
      w.task = keep(sp.task);
      w.model = keep(sp.model);
      w.callId = keep(sp.callId);
      w.status = "running";
      if (sp.parent !== "") {
        const parent = getWorker(s, sp.parent);
        const c = sp.callId !== "" ? call(parent, ev, sp.callId, "spawn_subagent") : unclaimedSpawn(parent); // an older recording
        if (c) {
          c.child = w.id;
          if (c.input === "") c.input = keep(goJSON({ task: sp.task }));
        } else {
          w.parent = ""; // no call to nest it under: show it where it is
        }
      }
      break;
    }
    case "subagentFinished": {
      if (!w) break;
      const f = b.value;
      w.status = f.isError ? "failed" : "finished";
      w.result = keep(f.result);
      w.turns = Math.max(w.turns, Number(f.turns));
      break;
    }
    case "sessionInfo": {
      const i = b.value;
      s.info = {
        taskId: keep(i.taskId),
        taskKind: keep(i.taskKind),
        task: keep(i.task),
        config: keep(i.config),
        budgets: i.budgets,
        models: i.models ?? null,
        tools: i.tools,
        grants: i.grants,
        manifest: keep(i.toolsManifest),
        workerId: keep(i.workerId),
        version: keep(i.actletVersion),
        localCommands: i.localCommands.map(sanitize),
        skills: i.skills,
        lineage: i.lineage ?? null,
      };
      break;
    }
  }
  // The session's end ends its workers too.
  if (s.state === SessionState.COMPLETED) {
    for (const wk of s.workers.values()) {
      if (wk.status === "running") wk.status = "finished";
    }
  }
}

/** The models the workers use, sorted. */
export function models(s: Session): string[] {
  const seen = new Set<string>();
  for (const w of s.workers.values()) if (w.model !== "") seen.add(w.model);
  return [...seen].sort();
}

/** The latest tool call still running and its worker, and how many calls are running. */
export function running(s: Session): { worker: Worker | null; call: ToolCall | null; count: number } {
  let worker: Worker | null = null;
  let latest: ToolCall | null = null;
  let count = 0;
  for (const id of s.order) {
    const w = s.workers.get(id)!;
    for (const c of w.calls.values()) {
      if (c.status !== "running") continue;
      count++;
      if (!latest || c.seq > latest.seq) {
        worker = w;
        latest = c;
      }
    }
  }
  return { worker, call: latest, count };
}

/** Counts a diff's added and removed lines. */
export function diffStat(d: Diff): { added: number; removed: number } {
  let added = 0,
    removed = 0;
  for (const l of d.diff.split("\n")) {
    if (l.startsWith("+++") || l.startsWith("---")) continue;
    if (l.startsWith("+")) added++;
    else if (l.startsWith("-")) removed++;
  }
  return { added, removed };
}

/** The files changed so far, in the order they were first changed. */
export function files(s: Session): File[] {
  const at = new Map<string, number>();
  const out: File[] = [];
  eachDiff(s, (d) => {
    const p = sessionPath(d.path);
    let i = at.get(p);
    if (i === undefined) {
      i = out.length;
      at.set(p, i);
      out.push({ path: p, added: 0, removed: 0, changes: 0 });
    }
    const st = diffStat(d);
    out[i].added += st.added;
    out[i].removed += st.removed;
    out[i].changes++;
  });
  return out;
}

/** The changes of a file, given relative to the session folder, in order. */
export function fileHistory(s: Session, p: string): Diff[] {
  const out: Diff[] = [];
  eachDiff(s, (d) => {
    if (sessionPath(d.path) === p) out.push(d);
  });
  return out;
}

/** Calls fn with every file change, in the order the tool calls started. */
function eachDiff(s: Session, fn: (d: Diff) => void) {
  const calls: ToolCall[] = [];
  for (const w of workers(s)) {
    for (const it of w.items) if (it.turn) calls.push(...it.turn.calls);
  }
  calls.sort((a, b) => a.epoch - b.epoch || a.seq - b.seq);
  for (const c of calls) for (const d of c.diffs) fn(d);
}

/** A model alias's context window from the profile's catalogue, or 0 if it isn't known. */
export function contextWindow(s: Session, model: string): number {
  for (const a of s.info?.models?.aliases ?? []) {
    if (a.alias === model) return Number(a.contextWindow);
  }
  return 0;
}

/** Writes a budget figure briefly, as Go's %.0f from 1000 up and %.4g below. */
export function amount(v: number): string {
  if (v >= 1000 || v <= -1000) return goFixed0(v);
  return goG4(v);
}

/** Go's %.0f: rounds half to even. */
function goFixed0(v: number): string {
  const f = Math.floor(v);
  const d = v - f;
  const r = d < 0.5 ? f : d > 0.5 ? f + 1 : f % 2 === 0 ? f : f + 1;
  return String(r === 0 ? 0 : r);
}

/** Go's %.4g: four significant digits, trailing zeros dropped, an exponent below 1e-4 or from 1e4. */
function goG4(v: number): string {
  if (v === 0 || !Number.isFinite(v)) return Number.isFinite(v) ? "0" : v > 0 ? "+Inf" : v < 0 ? "-Inf" : "NaN";
  const [mant, expText] = v.toExponential(3).split("e");
  const exp = Number(expText);
  if (exp < -4 || exp >= 4) {
    const m = mant.replace(/\.?0+$/, "");
    return `${m}e${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(2, "0")}`;
  }
  const fixed = v.toFixed(Math.max(3 - exp, 0));
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

/** A budget kind in lower case, such as "money". */
export function budgetName(k: BudgetKind): string {
  return enumName(BudgetKind, k);
}

/** A session state in lower case, such as "running"; "starting" before any. */
export function stateName(state: SessionState): string {
  if (state === SessionState.UNSPECIFIED) return "starting";
  return enumName(SessionState, state);
}

/** An enum value's name in lower case without its prefix, or its number if it isn't known. */
export function enumName(e: Record<number, string>, v: number): string {
  return (e[v] ?? String(v)).toLowerCase();
}

/** Who sent a command or note, in words. */
export function originName(o: Origin): string {
  switch (o) {
    case Origin.LOCAL:
      return "a local operator";
    case Origin.REMOTE:
      return "a remote operator";
    case Origin.ORCHESTRATOR:
      return "the orchestrator";
  }
  return "someone";
}

/** A command in a word or two, such as "pause (drain)" or "profile update (budgets)". */
export function commandName(c: Command | undefined): string {
  switch (c?.action.case) {
    case "pause":
      return "pause (" + enumName(PauseMode, c.action.value.mode) + ")";
    case "stop":
      return "stop";
    case "steer":
      return "note";
    case "profileUpdate": {
      const parts = [...c.action.value.fields];
      if (c.action.value.resetBudgets.length > 0) {
        parts.push("reset " + c.action.value.resetBudgets.map(budgetName).join(", "));
      }
      return `profile update (${parts.join("; ")})`;
    }
  }
  return "command";
}

/** Describes an event in one line, for the raw event log. */
export function describe(ev: ActivityEvent): string {
  const b = ev.body;
  switch (b.case) {
    case "started":
      return `started: run ${b.value.epoch}, resumed ${b.value.resumed}`;
    case "state":
      return `state: ${stateName(b.value.from)} → ${stateName(b.value.to)} (${b.value.reason})`;
    case "command":
      return `command ${b.value.command?.id ?? ""}: ${commandName(b.value.command)} ${enumName(CommandResult, b.value.result)}`;
    case "steer":
      return "steer: " + b.value.note;
    case "text":
      return "text: " + b.value.text;
    case "gap":
      return `gap: ${b.value.dropped} dropped`;
    case "modelTurn":
      return `model_turn ${b.value.turn} (${b.value.model}): ${firstLine(b.value.text)} → ${b.value.toolCalls.join(", ")}`;
    case "toolStarted":
      return `tool_started ${b.value.tool} ${b.value.callId}: ${b.value.input}`;
    case "toolFinished": {
      const f = b.value;
      return `tool_finished ${f.tool} ${f.callId} error=${f.isError} unknown=${f.outcomeUnknown}: ${firstLine(f.output)}`;
    }
    case "fileChange":
      return `file_change ${b.value.path} (call ${b.value.callId})`;
    case "subagentSpawned":
      return `subagent_spawned by ${b.value.parent} (call ${b.value.callId}): ${firstLine(b.value.task)}`;
    case "subagentFinished":
      return `subagent_finished error=${b.value.isError}: ${firstLine(b.value.result)}`;
    case "sessionInfo":
      return "session_info: task " + b.value.taskId;
    case "progress":
      if (b.value.percent !== undefined) return `progress ${b.value.percent}%: ${firstLine(b.value.message)}`;
      return "progress: " + firstLine(b.value.message);
    case "feedback":
      return `feedback (${b.value.kind}): ${firstLine(b.value.message)}`;
    case "compaction": {
      const c = b.value;
      return `compaction (${c.model}): ${c.summarizedTurns} turns summarised, ${c.keptTurns} kept, at ${c.contextTokens} tokens`;
    }
    case "budgetStatus": {
      const parts = b.value.budgets.map((u) => `${budgetName(u.kind)} ${amount(u.used)}/${amount(u.limit)} ${u.state}`);
      return `budget_status (${b.value.reason}): ${parts.join(", ")}`;
    }
  }
  return "an event this viewer doesn't know";
}

/** Describes a compaction in a worker's timeline. */
function compactionText(c: Compaction): string {
  const turns = c.summarizedTurns === 1 ? "turn" : "turns";
  return `context compacted at ${c.contextTokens} tokens: ${c.summarizedTurns} ${turns} summarised by ${c.model}, the last ${c.keptTurns} kept`;
}

export function firstLine(s: string): string {
  const i = s.indexOf("\n");
  return i < 0 ? s : s.slice(0, i);
}

/** Encodes like Go's encoding/json, which escapes <, > and & and the line separators. */
function goJSON(v: unknown): string {
  return JSON.stringify(v).replace(/[<>&\u2028\u2029]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

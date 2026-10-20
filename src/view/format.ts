/**
 * Presentation helpers shared by the components: how the TUI words and
 * lays out what the session view holds.
 */
import {
  diffStat,
  fileHistory,
  firstLine,
  type Item,
  type Progress,
  type Session,
  type ToolCall,
  type Usage,
  type Worker,
} from "./session";

/** A token count, short: 950, 1.2k, 34k, 1.5M. */
export function tokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1e3).toFixed(0)}k`;
  if (n >= 1000) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

/** A duration given in nanoseconds: 38ms, 4.2s, 1m5s. */
export function duration(ns: number): string {
  if (ns >= 10e9) return goDuration(Math.round(ns / 1e9) * 1e9);
  if (ns >= 1e9) return `${(ns / 1e9).toFixed(1)}s`;
  return goDuration(Math.round(ns / 1e6) * 1e6);
}

/** Formats a whole number of milliseconds or seconds like Go's Duration.String. */
function goDuration(ns: number): string {
  if (ns === 0) return "0s";
  if (ns < 1e9) return `${ns / 1e6}ms`;
  let s = Math.round(ns / 1e9);
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  if (h > 0) return `${h}h${m}m${s}s`;
  if (m > 0) return `${m}m${s}s`;
  return `${s}s`;
}

/** "1 turn", "3 turns". */
export function plural(n: number, what: string): string {
  return n === 1 ? `1 ${what}` : `${n} ${what}s`;
}

export function orNA(s: string): string {
  return s === "" ? "n/a" : s;
}

/** A byte size: 512 B, 1.5 KiB, 2.0 MiB. */
export function sizeOf(n: number): string {
  if (n >= 2 ** 30) return `${(n / 2 ** 30).toFixed(1)} GiB`;
  if (n >= 2 ** 20) return `${(n / 2 ** 20).toFixed(1)} MiB`;
  if (n >= 2 ** 10) return `${(n / 2 ** 10).toFixed(1)} KiB`;
  return `${n} B`;
}

/** Names a tool for people. */
export function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    read_file: "Read",
    write_file: "Write",
    edit_file: "Edit",
    glob: "Glob",
    grep: "Grep",
    shell: "Shell",
    python: "Python",
    spawn_subagent: "Subagent",
    report_progress: "Progress",
    send_feedback: "Feedback",
    budget_status: "Budget",
    decide: "Decide",
    llm: "LLM",
  };
  return Object.hasOwn(labels, name) ? labels[name] : name;
}

/** Decodes a tool call's JSON input; null if it isn't an object. */
export function callArgs(c: ToolCall): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(c.input);
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** A call's most telling arguments, in a line. */
export function keyArgs(c: ToolCall): string {
  const a = callArgs(c) ?? {};
  const str = (k: string) => {
    const v = a[k];
    return typeof v === "string" ? firstLine(v) : "";
  };
  switch (c.name) {
    case "read_file":
      return str("path");
    case "write_file":
    case "edit_file": {
      let p = str("path");
      for (const d of c.diffs) {
        const st = diffStat(d);
        p += `  +${st.added} −${st.removed}`;
      }
      return p;
    }
    case "glob":
      return `${str("pattern")} ${str("path")}`.trim();
    case "grep": {
      let s = str("pattern");
      if (str("path") !== "") s += "  in " + str("path");
      return s;
    }
    case "shell":
      return "$ " + str("command");
    case "python":
      return str("path") !== "" ? str("path") : firstLine(str("code"));
    case "spawn_subagent": {
      let s = c.child;
      if (str("model") !== "") s += " · " + str("model");
      return `${s}  ${str("task")}`.trim();
    }
    case "report_progress":
      return typeof a.percent === "number" ? `${a.percent.toFixed(0)}% · ${str("message")}` : str("message");
    case "send_feedback":
      return str("kind") + ": " + str("message");
    case "decide":
      return str("question");
    case "llm":
      return str("model") !== "" ? str("model") + " · " + str("prompt") : str("prompt");
    case "budget_status":
      return "";
  }
  return firstLine(c.input);
}

/** How a result line looks. */
export type Tone = "plain" | "add" | "del" | "hunk" | "muted" | "error";

export interface Styled {
  text: string;
  tone: Tone;
}

/** What a call shows: its diffs if it changed files, or its output. */
export function resultLines(c: ToolCall): Styled[] {
  const out: Styled[] = [];
  if (c.diffs.length > 0) {
    if (c.status === "error") out.push({ text: firstLine(c.output), tone: "error" });
    for (const d of c.diffs) {
      for (const l of d.diff.replace(/\n+$/, "").split("\n")) {
        if (l.startsWith("+++") || l.startsWith("---")) continue;
        out.push({ text: l, tone: diffTone(l) });
      }
    }
    return out;
  }
  const base: Tone = c.status === "error" || c.status === "unknown" ? "error" : "plain";
  for (const l of c.output.replace(/\n+$/, "").split("\n")) {
    let tone: Tone = base;
    if (l === "" && out.length === 0) continue;
    if (l === "stdout:" || l === "stderr:") continue; // the output speaks for itself
    if (l.startsWith("exit code 0")) continue;
    if (l.startsWith("exception:") || l.startsWith("outcome_unknown") || l.startsWith("exit code")) tone = "error";
    else if (l.startsWith("traceback") || l.startsWith("hint:")) tone = "muted";
    out.push({ text: l, tone });
  }
  return out;
}

export function diffTone(l: string): Tone {
  if (l.startsWith("@@")) return "hunk";
  if (l.startsWith("+")) return "add";
  if (l.startsWith("-")) return "del";
  return "muted";
}

/** A timeline item, and the worker whose timeline it is; null for the session's own. */
export interface Entry {
  item: Item;
  worker: Worker | null;
}

/**
 * The conversation as the main screen shows it: the session's own items
 * and the agent's turns, in order. Subagents nest under the calls that
 * started them; ones whose parent this viewer never saw go at the top
 * level. With a worker given, only that worker's timeline.
 */
export function conversation(s: Session, worker = ""): Entry[] {
  const out: Entry[] = [];
  if (worker === "") for (const it of s.items) out.push({ item: it, worker: null });
  const top = s.workers.get(worker === "" ? "root" : worker);
  if (top) for (const it of top.items) out.push({ item: it, worker: top });
  if (worker === "") {
    for (const id of s.order) {
      const wk = s.workers.get(id)!;
      if (wk.id !== "root" && (wk.parent === "" || !s.workers.has(wk.parent))) {
        for (const it of wk.items) out.push({ item: it, worker: wk });
      }
    }
  }
  return out.sort((a, b) => a.item.epoch - b.item.epoch || a.item.seq - b.item.seq);
}

/** What a recording holds of a file. */
export interface RecordedFile {
  lines: string[];
  /** The lines are a diff, not the file. */
  diff: boolean;
  note: string;
}

/** What the events hold of a file: the whole of it if it was created in one go, or else its latest change. */
export function recordedFile(s: Session, path: string): RecordedFile {
  const h = fileHistory(s, path);
  if (h.length === 0) return { lines: [], diff: false, note: "not in the recording" };
  if (h.length === 1 && h[0].created && !isCut(h[0].diff)) {
    const lines: string[] = [];
    for (const l of h[0].diff.replace(/\n+$/, "").split("\n")) {
      if (l.startsWith("+") && !l.startsWith("+++")) lines.push(l.slice(1));
    }
    return { lines, diff: false, note: "from the recording · read only" };
  }
  const last = h[h.length - 1];
  const lines = last.diff
    .replace(/\n+$/, "")
    .split("\n")
    .filter((l) => !l.startsWith("+++") && !l.startsWith("---"));
  return { lines, diff: true, note: `the recording holds only changes: the latest of ${h.length}` };
}

/** Marks Actlet, or the view model, put where content was cut short. */
const cutMarks = /\[\.\.\. \d+ bytes omitted \.\.\.\]|\[viewer cut \d+ characters\]|\s?\[cut\]$/;

/** Reports whether Actlet cut the text short. */
export function isCut(s: string): boolean {
  return cutMarks.test(s);
}

/** Splits text into plain parts and Actlet's cut marks, for showing truncation clearly. */
export function splitCuts(s: string): { text: string; cut: boolean }[] {
  const out: { text: string; cut: boolean }[] = [];
  const re = /\[\.\.\. (\d+) bytes omitted \.\.\.\]|\[viewer cut (\d+) characters\]|\[cut\]$/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), cut: false });
    out.push({ text: m[1] ? `${m[1]} bytes omitted` : m[2] ? `${m[2]} characters not kept` : "cut short", cut: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last), cut: false });
  return out;
}

/** Shortens text to at most max characters for display, saying how much was left out. */
export function clip(s: string, max: number): { text: string; omitted: number } {
  if (s.length <= max) return { text: s, omitted: 0 };
  let end = max;
  const c = s.charCodeAt(end - 1);
  if (c >= 0xd800 && c <= 0xdbff) end--; // don't split a surrogate pair
  return { text: s.slice(0, end), omitted: s.length - end };
}

/** Elapsed time of the session in nanoseconds: to now while it runs live, else to its latest event. */
export function elapsed(s: Session, now: number | null): number | null {
  if (!s.first) return null;
  const end = now ?? s.last!.at;
  return Math.max(end - s.first.at, 0) * 1e6;
}

/** The first sentence of a description. */
export function firstSentence(s: string): string {
  const i = s.indexOf(". ");
  return i > 0 ? s.slice(0, i + 1) : s;
}

/** A decide call: what was asked, and what was decided. */
export interface DecideView {
  question: string;
  options: string[];
  context: string;
  /** The answer; null while the call waits or if it failed. */
  decision: { decision: string; decidedBy: string; reason: string } | null;
}

/** Reads a decide call's question and, once answered, its decision. Null if the input isn't a decide call's. */
export function decideView(c: ToolCall): DecideView | null {
  const a = callArgs(c);
  if (!a || typeof a.question !== "string") return null;
  const options = Array.isArray(a.options) ? a.options.filter((o): o is string => typeof o === "string") : [];
  let decision: DecideView["decision"] = null;
  if (c.status === "ok") {
    try {
      const out: unknown = JSON.parse(c.output);
      if (out !== null && typeof out === "object" && typeof (out as { decision?: unknown }).decision === "string") {
        const o = out as Record<string, unknown>;
        const text = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
        decision = { decision: text("decision"), decidedBy: text("decided_by"), reason: text("reason") };
      }
    } catch {
      // not JSON: shown as plain output
    }
  }
  return { question: a.question, options, context: typeof a.context === "string" ? a.context : "", decision };
}

/** An llm call: the model, the prompt, and the answer with what it used. */
export interface LlmView {
  /** The alias asked for; "" for the default. */
  model: string;
  prompt: string;
  system: string;
}

/** Reads an llm call's input. Null if it isn't an llm call's. */
export function llmView(c: ToolCall): LlmView | null {
  const a = callArgs(c);
  if (!a || typeof a.prompt !== "string") return null;
  const text = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
  return { model: text("model"), prompt: text("prompt"), system: text("system") };
}

/** What a call through the gateway used, in a line: "180 in / 45 out · 0.0012 EUR". */
export function usageLine(u: Usage): string {
  let s = `${tokens(u.input)} in / ${tokens(u.output)} out`;
  if (u.cost > 0) s += ` · ${u.cost.toFixed(4)}${u.currency !== "" ? " " + u.currency : ""}`;
  return s;
}

/** A progress report in a line: "40% · Summary drafted", or just the message. */
export function progressText(p: Progress): string {
  return p.percent >= 0 ? `${p.percent}% · ${p.message}` : p.message;
}

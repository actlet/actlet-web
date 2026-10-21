import { BudgetKind, SessionState } from "../gen/actlet/gateway/v0/gateway_pb";
import { budgetAlarm, budgets } from "../view/budgets";
import { clip, duration, elapsed, progressText, tokens } from "../view/format";
import { contextWindow, stateName, type BudgetState, type Session } from "../view/session";
import { Text } from "./Text";

export interface StatusLineProps {
  session: Session;
  /** What the viewer shows, in a few words: "live", "replay playing 1x 45%". */
  connection: string;
  /** The current time in milliseconds, while a live session runs; elapsed time then counts to it. */
  now?: number | null;
  /** Something the reader should know, such as why the theme asked for isn't used. */
  notice?: string;
}

/** The most of the latest progress report the status line shows. */
const PROGRESS_CHARS = 48;

/** One segment of the status line, in its colour. */
interface Segment {
  text: string;
  className?: string;
  /** Before the text, muted: "ctx ". */
  label?: string;
}

/**
 * The one compact status line: the session's state as a pill in its
 * colour, then what is happening, the model, how full its context is,
 * cost, time and what the viewer shows.
 */
export function StatusLine({ session: s, connection, now = null, notice = "" }: StatusLineProps) {
  const root = s.workers.get("root");
  const parts: Segment[] = [];
  if (s.progress) {
    const text = progressText(s.progress);
    parts.push({
      text: text.length > PROGRESS_CHARS ? clip(text, PROGRESS_CHARS - 1).text + "…" : text,
      className: "actlet-seg-progress",
    });
  }
  if (root) {
    if (root.model !== "") parts.push({ text: root.model, className: "actlet-seg-model" });
    const window = contextWindow(s, root.model);
    if (window > 0 && root.context > 0) {
      const pct = Math.floor((root.context * 100) / window);
      parts.push({
        label: "ctx ",
        text: `${pct}%/${tokens(window)}`,
        className: pct >= 85 ? "actlet-err" : pct >= 60 ? "actlet-warn" : "actlet-ok",
      });
    } else if (root.context > 0) parts.push({ label: "ctx ", text: tokens(root.context) });
  }
  // Cost and time against their budgets' totals, when the session has them.
  const money = budgets(s).find((b) => b.kind === BudgetKind.MONEY && b.limit > 0);
  const cost = s.usage.cost;
  if (money && (s.usage.currency === "" || s.usage.currency === money.currency)) {
    parts.push({
      text: `${cost.toFixed(2)}/${money.limit.toFixed(2)} ${money.currency}`,
      className: budgetTone(s, money, cost),
    });
  } else if (cost > 0) parts.push({ text: `${cost.toFixed(2)} ${s.usage.currency}` });
  const running = s.state === SessionState.RUNNING || s.state === SessionState.UNSPECIFIED;
  const ns = elapsed(s, running ? now : null);
  const took = ns === null ? "0s" : duration(Math.round(ns / 1e9) * 1e9);
  const time = budgets(s).find((b) => b.kind === BudgetKind.TIME && b.limit > 0);
  if (time) {
    parts.push({
      text: `${took}/${roundDuration(duration(time.limit * 1e9))}`,
      className: budgetTone(s, time, (ns ?? 0) / 1e9),
    });
  } else parts.push({ text: took });
  parts.push({ text: connection, className: "actlet-seg-muted" });
  if (notice !== "") parts.push({ text: notice, className: "actlet-warn" });
  const alarm = budgetAlarm(s);
  return (
    // Not a live region: it changes every second. StateAnnouncer says when the state changes.
    <div className="actlet-status" role="group" aria-label="Session status">
      {/* Each segment starts with its separator; one that starts a line is out of sight. */}
      <span className="actlet-segs">
        <span className="actlet-segs-in">
          <span className={`actlet-pill actlet-pill-${stateKind(s.state)}`}>
            <StateIcon state={s.state} /> <span className="actlet-state">{stateName(s.state)}</span>
          </span>
          {parts.map((p, i) => (
            <span key={i} className="actlet-seg">
              <Sep />
              {p.label && <span className="actlet-seg-muted">{p.label}</span>}
              <span className={p.className}>
                <Text text={p.text} max={200} />
              </span>
            </span>
          ))}
          {alarm !== "" && (
            <span className="actlet-seg actlet-alarm">
              <Sep />
              <span className="actlet-icon" aria-hidden="true">
                ⚠
              </span>
              {alarm}
            </span>
          )}
        </span>
      </span>
    </div>
  );
}

function Sep() {
  return (
    <span className="actlet-seg-sep" aria-hidden="true">
      {" │ "}
    </span>
  );
}

/** A budget's colour: the error colour once it is used up, the warning colour past its alert. */
function budgetTone(s: Session, b: BudgetState, used: number): string | undefined {
  if (b.state === "exhausted" || b.state === "waiting" || used >= b.limit) return "actlet-err";
  const alert = s.info?.budgets.find((d) => d.kind === b.kind)?.alertAtPercent ?? 0;
  if (b.state === "alerted" || (alert > 0 && used * 100 >= b.limit * alert)) return "actlet-warn";
  return undefined;
}

/** A whole duration without its zero units: 30m rather than 30m0s. */
function roundDuration(d: string): string {
  return d.replace(/(\D)0s$/, "$1").replace(/(\D)0m$/, "$1");
}

/** The state's colour: running (or about to stop or pause), done, failed or stopped, or paused. */
function stateKind(state: SessionState): "running" | "done" | "failed" | "paused" {
  switch (state) {
    case SessionState.COMPLETED:
      return "done";
    case SessionState.FAILED:
    case SessionState.STOPPED:
      return "failed";
    case SessionState.PAUSED:
      return "paused";
  }
  return "running";
}

function StateIcon({ state }: { state: SessionState }) {
  switch (stateKind(state)) {
    case "done":
      return (
        <span className="actlet-icon" aria-hidden="true">
          ✓
        </span>
      );
    case "failed":
      return (
        <span className="actlet-icon" aria-hidden="true">
          ✗
        </span>
      );
    case "paused":
      return (
        <span className="actlet-icon" aria-hidden="true">
          ‖
        </span>
      );
  }
  return <span className="actlet-icon actlet-spinner" aria-hidden="true" />;
}

/** Tells screen readers when the session's state changes, such as when it completes. */
export function StateAnnouncer({ session }: { session: Session }) {
  return (
    <div className="actlet-sr-only" role="status" aria-live="polite" aria-atomic="true">
      {`Session ${stateName(session.state)}${budgetAlarm(session) ? `; ${budgetAlarm(session)}` : ""}`}
    </div>
  );
}

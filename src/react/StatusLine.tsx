import { SessionState } from "../gen/actlet/gateway/v0/gateway_pb";
import { duration, elapsed, tokens } from "../view/format";
import { contextWindow, stateName, type Session } from "../view/session";
import { Text } from "./Text";

export interface StatusLineProps {
  session: Session;
  /** What the viewer shows, in a few words: "live", "replay playing 1x 45%". */
  connection: string;
  /** The current time in milliseconds, while a live session runs; elapsed time then counts to it. */
  now?: number | null;
}

/** The one compact status line: what is happening, the model, how full its context is, cost, time and what the viewer shows. */
export function StatusLine({ session: s, connection, now = null }: StatusLineProps) {
  const root = s.workers.get("root");
  const parts: string[] = [];
  if (root) {
    if (root.model !== "") parts.push(root.model);
    const window = contextWindow(s, root.model);
    if (window > 0 && root.context > 0) parts.push(`ctx ${Math.floor((root.context * 100) / window)}%`);
    else if (root.context > 0) parts.push(`ctx ${tokens(root.context)}`);
  }
  if (s.usage.cost > 0) parts.push(`${s.usage.cost.toFixed(2)} ${s.usage.currency}`);
  const running = s.state === SessionState.RUNNING || s.state === SessionState.UNSPECIFIED;
  const ns = elapsed(s, running ? now : null);
  parts.push(ns === null ? "0s" : duration(Math.round(ns / 1e9) * 1e9));
  parts.push(connection);
  return (
    <div className="actlet-status" role="status">
      <StateIcon state={s.state} />
      <span className="actlet-state">{stateName(s.state)}</span>
      {parts.map((p, i) => (
        <span key={i}>
          <span className="actlet-faint">{" · "}</span>
          <Text text={p} max={200} />
        </span>
      ))}
    </div>
  );
}

function StateIcon({ state }: { state: SessionState }) {
  switch (state) {
    case SessionState.COMPLETED:
      return <span className="actlet-icon actlet-ok">✓</span>;
    case SessionState.FAILED:
    case SessionState.STOPPED:
      return <span className="actlet-icon actlet-err">✗</span>;
    case SessionState.PAUSED:
      return <span className="actlet-icon actlet-warn">‖</span>;
  }
  return <span className="actlet-icon actlet-spinner" />;
}

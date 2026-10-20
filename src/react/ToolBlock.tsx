import { useId } from "react";
import { duration, keyArgs, plural, resultLines, toolLabel } from "../view/format";
import type { Session, ToolCall, Worker } from "../view/session";
import { Text } from "./Text";
import { ItemView, type StreamOptions } from "./TurnStream";

/** Lines a collapsed result shows, and the most an expanded one shows. */
export const COLLAPSED_LINES = 3;
export const EXPANDED_LINES = 400;

export interface ToolBlockProps extends StreamOptions {
  session: Session;
  call: ToolCall;
  /** The worker whose call it is. */
  worker: Worker | null;
}

/** A tool call and its result, as one block that expands. A subagent's turns nest under the call that started it. */
export function ToolBlock(props: ToolBlockProps) {
  const { session, call, worker, isExpanded, onToggle } = props;
  const key = `${worker?.id ?? "root"}/${call.callId}`;
  const expanded = isExpanded(key);
  const right =
    call.status === "unknown"
      ? "outcome unknown"
      : call.status === "running"
        ? "running"
        : call.took > 0
          ? duration(call.took)
          : "";
  const child = call.child !== "" ? session.workers.get(call.child) : undefined;
  const bodyId = useId();
  return (
    <div className={`actlet-tool actlet-tool-${call.status}`} data-call={call.callId}>
      {/* Out of the tab order: the stream moves between tool calls with arrow keys. */}
      <button
        type="button"
        className="actlet-tool-head"
        tabIndex={-1}
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => onToggle(key)}
      >
        <StatusIcon status={call.status} />
        <span className="actlet-tool-name">
          <Text text={toolLabel(call.name)} max={200} />
        </span>
        <span className="actlet-tool-args">
          <Text text={keyArgs(call)} max={300} />
        </span>
        <span className="actlet-tool-took">{right}</span>
      </button>
      <div id={bodyId}>
        {child ? (
          <SubagentBody {...props} child={child} expanded={expanded} />
        ) : (
          <Result call={call} expanded={expanded} />
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: ToolCall["status"] }) {
  switch (status) {
    case "ok":
      return (
        <span className="actlet-icon actlet-ok" role="img" aria-label="done">
          ✓
        </span>
      );
    case "error":
      return (
        <span className="actlet-icon actlet-err" role="img" aria-label="failed">
          ✗
        </span>
      );
    case "unknown":
      return (
        <span className="actlet-icon actlet-warn" role="img" aria-label="outcome unknown">
          ?
        </span>
      );
  }
  return <span className="actlet-icon actlet-spinner" role="img" aria-label="running" />;
}

function Result({ call, expanded }: { call: ToolCall; expanded: boolean }) {
  const lines = resultLines(call);
  const limit = expanded ? EXPANDED_LINES : COLLAPSED_LINES;
  const shown = lines.slice(0, limit);
  const more = lines.length - shown.length;
  if (lines.length === 0) return null;
  return (
    <div className="actlet-tool-body">
      {shown.map((l, i) => (
        <div key={i} className={`actlet-line actlet-tone-${l.tone}`}>
          <Text text={l.text} max={expanded ? 20_000 : 500} />
        </div>
      ))}
      {more > 0 && <div className="actlet-line actlet-more">{`… ${plural(more, "more line")}`}</div>}
    </div>
  );
}

/** The most of a subagent's timeline shown nested under its spawn call; the rest shows when it is shown alone. */
export const NESTED_ITEMS = 40;

function SubagentBody(props: ToolBlockProps & { child: Worker; expanded: boolean }) {
  const { child, call, expanded, collapseSubagents, onFocusWorker } = props;
  const open = expanded || call.status === "running" || !collapseSubagents;
  const items = child.items.slice(-NESTED_ITEMS);
  const earlier = child.items.length - items.length + child.dropped;
  return (
    <div className="actlet-tool-body">
      {open ? (
        <div className="actlet-nested">
          {earlier > 0 && (
            <div className="actlet-line actlet-tone-muted">
              {`… ${plural(earlier, "earlier item")} of ${child.id}`}
              {onFocusWorker && (
                <>
                  {" · "}
                  <button type="button" className="actlet-link" onClick={() => onFocusWorker(child.id)}>
                    {`show ${child.id} alone`}
                  </button>
                </>
              )}
            </div>
          )}
          {items.map((it) => (
            <ItemView key={`${it.epoch}.${it.seq}:${it.kind}`} {...props} item={it} worker={child} />
          ))}
        </div>
      ) : (
        <div className="actlet-line actlet-tone-muted">{`${child.id} worked for ${plural(child.turns, "turn")}`}</div>
      )}
      {child.result !== "" && (
        <div className={`actlet-line actlet-result${child.status === "failed" ? " actlet-tone-error" : ""}`}>
          <span className="actlet-muted">↳ </span>
          <Text text={child.result} />
        </div>
      )}
    </div>
  );
}

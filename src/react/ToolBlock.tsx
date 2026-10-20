import { useId } from "react";
import { decideView, duration, keyArgs, llmView, plural, resultLines, toolLabel, usageLine } from "../view/format";
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
        ? call.name === "decide"
          ? "waiting for a decision"
          : "running"
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
          <CallBody call={call} expanded={expanded} />
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

/** The body for a call: a decision, a model's answer, or the call's result. */
function CallBody({ call, expanded }: { call: ToolCall; expanded: boolean }) {
  if (call.name === "decide") {
    const d = decideView(call);
    if (d) return <DecideBody call={call} view={d} expanded={expanded} />;
  }
  if (call.name === "llm") {
    const l = llmView(call);
    if (l) return <LlmBody call={call} view={l} expanded={expanded} />;
  }
  return <Result call={call} expanded={expanded} />;
}

/** A question put to a person or system, and the decision: who decided, and why. */
function DecideBody({
  call,
  view,
  expanded,
}: {
  call: ToolCall;
  view: NonNullable<ReturnType<typeof decideView>>;
  expanded: boolean;
}) {
  const d = view.decision;
  return (
    <div className="actlet-tool-body actlet-decide">
      {expanded && view.options.length > 0 && (
        <div className="actlet-line actlet-tone-muted">
          <Text text={"options: " + view.options.join(" · ")} max={2000} />
        </div>
      )}
      {expanded && view.context !== "" && (
        <div className="actlet-line actlet-tone-muted">
          <Text text={"context: " + view.context} />
        </div>
      )}
      {d ? (
        <>
          <div className="actlet-line actlet-decision">
            <span className="actlet-muted">→ </span>
            <strong>
              <Text text={d.decision} max={2000} />
            </strong>
            {d.decidedBy !== "" && (
              <span className="actlet-muted">
                {" · decided by "}
                <Text text={d.decidedBy} max={200} />
              </span>
            )}
          </div>
          {d.reason !== "" && (
            <div className="actlet-line actlet-tone-muted">
              <Text text={d.reason} max={expanded ? 20_000 : 500} />
            </div>
          )}
        </>
      ) : call.status === "running" ? (
        <div className="actlet-line actlet-tone-muted">
          waiting for a decision{view.options.length > 0 && !expanded ? ": " : ""}
          {view.options.length > 0 && !expanded && <Text text={view.options.join(" · ")} max={500} />}
        </div>
      ) : (
        <Result call={call} expanded={expanded} bare />
      )}
    </div>
  );
}

/** A side call to another model: the answer, with the model and what it used; the prompt when expanded. */
function LlmBody({
  call,
  view,
  expanded,
}: {
  call: ToolCall;
  view: NonNullable<ReturnType<typeof llmView>>;
  expanded: boolean;
}) {
  const meta = [view.model !== "" ? view.model : "the default model"];
  if (call.usage) meta.push(usageLine(call.usage));
  return (
    <div className="actlet-tool-body actlet-llm">
      {expanded && (
        <>
          {view.system !== "" && (
            <div className="actlet-line actlet-tone-muted">
              <Text text={"system: " + view.system} />
            </div>
          )}
          <div className="actlet-line actlet-tone-muted">
            <Text text={"prompt: " + view.prompt} />
          </div>
        </>
      )}
      {call.status !== "running" && <Result call={call} expanded={expanded} bare />}
      {call.status !== "running" && (
        <div className="actlet-line actlet-tone-muted actlet-llm-meta">
          <Text text={meta.join(" · ")} max={300} />
        </div>
      )}
    </div>
  );
}

function Result({ call, expanded, bare = false }: { call: ToolCall; expanded: boolean; bare?: boolean }) {
  const lines = resultLines(call);
  const limit = expanded ? EXPANDED_LINES : COLLAPSED_LINES;
  const shown = lines.slice(0, limit);
  const more = lines.length - shown.length;
  if (lines.length === 0) return null;
  const body = (
    <>
      {shown.map((l, i) => (
        <div key={i} className={`actlet-line actlet-tone-${l.tone}`}>
          <Text text={l.text} max={expanded ? 20_000 : 500} />
        </div>
      ))}
      {more > 0 && <div className="actlet-line actlet-more">{`… ${plural(more, "more line")}`}</div>}
    </>
  );
  return bare ? body : <div className="actlet-tool-body">{body}</div>;
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

import { useCallback, useLayoutEffect, useRef, useState, type UIEvent } from "react";
import { conversation, tokens } from "../view/format";
import type { Item, Session, Worker } from "../view/session";
import { clock } from "../view/time";
import { Text } from "./Text";
import { ToolBlock } from "./ToolBlock";

/** How the stream draws turns and tool calls. */
export interface StreamOptions {
  /** Draw a line between turns and between tool calls. */
  separators?: boolean;
  /** Show subagents' turns only as a line under their spawn call, until expanded. */
  collapseSubagents?: boolean;
  isExpanded: (key: string) => boolean;
  onToggle: (key: string) => void;
}

export interface TurnStreamProps {
  session: Session;
  /** Show only this worker's timeline; the whole conversation when empty. */
  worker?: string;
  separators?: boolean;
  collapseSubagents?: boolean;
  /** Expand every tool call. */
  expandAll?: boolean;
  /** Keep the newest content in view while new events arrive, unless the reader scrolled up. */
  follow?: boolean;
  /** Changes whenever the session does, so the stream knows to redraw and follow. */
  version?: number;
}

/**
 * The main screen: the conversation grouped by model turn, each turn's
 * text first and then each tool call with its result.
 */
export function TurnStream({
  session,
  worker = "",
  separators = false,
  collapseSubagents = false,
  expandAll = false,
  follow = true,
  version,
}: TurnStreamProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const onToggle = useCallback(
    (key: string) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );
  const isExpanded = (key: string) => expandAll !== expanded.has(key);
  const opts: StreamOptions = { separators, collapseSubagents, isExpanded, onToggle };

  const ref = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [behind, setBehind] = useState(false);
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom.current) setBehind(false);
  };
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !follow) return;
    if (atBottom.current) el.scrollTop = el.scrollHeight;
    else setBehind(true);
  }, [follow, version, session]);
  const toLatest = () => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    setBehind(false);
  };

  const entries = conversation(session, worker);
  return (
    <div className="actlet-stream-wrap">
      <div className="actlet-stream" ref={ref} onScroll={onScroll} role="log" aria-live="off">
        {entries.length === 0 && <div className="actlet-empty">Waiting for the agent…</div>}
        {entries.map((e, i) => (
          <div key={`${e.worker?.id ?? ""}:${e.item.epoch}.${e.item.seq}:${i}`}>
            {separators && i > 0 && e.item.kind !== "system" && <hr className="actlet-sep" />}
            <ItemView {...opts} session={session} item={e.item} worker={e.worker} />
          </div>
        ))}
      </div>
      {behind && (
        <button type="button" className="actlet-latest" onClick={toLatest}>
          ↓ latest
        </button>
      )}
    </div>
  );
}

export interface ItemViewProps extends StreamOptions {
  session: Session;
  item: Item;
  worker: Worker | null;
}

/** One timeline item: a model turn, an operator's note or a system line. */
export function ItemView(props: ItemViewProps) {
  const { item } = props;
  switch (item.kind) {
    case "note":
      return (
        <div className="actlet-msg actlet-operator">
          <div className="actlet-who">
            <strong>Operator</strong>
            <span className="actlet-muted">
              {" · "}
              <Text text={item.from} max={200} />
            </span>
            <Clock at={item.at} />
          </div>
          <div className="actlet-text">
            <Text text={item.text} />
          </div>
        </div>
      );
    case "system":
      return (
        <div className={`actlet-system${item.warn ? " actlet-warn" : ""}`}>
          {"· "}
          <Text text={item.text} />
        </div>
      );
    case "turn":
      return <TurnView {...props} />;
  }
}

function TurnView({ session, item, worker, ...opts }: ItemViewProps) {
  const t = item.turn!;
  const sub = worker !== null && worker.id !== "root";
  const who = sub ? `Subagent ${worker.id}` : "Agent";
  let meta = " · an earlier turn";
  if (!t.unseen) {
    meta = ` · turn ${t.number}`;
    if (t.model !== "") meta += " · " + t.model;
    if (t.usage.input + t.usage.output > 0) meta += ` · ${tokens(t.usage.input)} in / ${tokens(t.usage.output)} out`;
  }
  return (
    <div className={`actlet-msg ${sub ? "actlet-subagent" : "actlet-agent"}`}>
      <div className="actlet-who">
        <strong>{who}</strong>
        <span className="actlet-muted">
          <Text text={meta} max={300} />
        </span>
        {!t.unseen && <Clock at={item.at} />}
      </div>
      {!t.unseen && t.text !== "" && (
        <div className="actlet-text">
          <Text text={t.text} />
        </div>
      )}
      {t.calls.length > 0 && (
        <div className="actlet-calls">
          {t.calls.map((c, i) => (
            <div key={`${c.callId}:${i}`}>
              {opts.separators && i > 0 && <hr className="actlet-sep actlet-sep-dashed" />}
              <ToolBlock {...opts} session={session} call={c} worker={worker} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Clock({ at }: { at: number }) {
  const c = clock(at);
  return c === "" ? null : <span className="actlet-clock">{` · ${c}`}</span>;
}

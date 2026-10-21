import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type UIEvent,
} from "react";
import { conversation, tokens, type Entry } from "../view/format";
import type { Item, Session, Worker } from "../view/session";
import { clock } from "../view/time";
import { Text } from "./Text";
import { actionFor, STREAM_KEYS } from "./keys";
import { ToolBlock } from "./ToolBlock";

/** How the stream draws turns and tool calls. */
export interface StreamOptions {
  /** Draw a line between turns and between tool calls. */
  separators?: boolean;
  /** Show subagents' turns only as a line under their spawn call, until expanded. */
  collapseSubagents?: boolean;
  isExpanded: (key: string) => boolean;
  onToggle: (key: string) => void;
  /** Shows one worker's timeline alone, such as a subagent with too many turns to nest. */
  onFocusWorker?: (worker: string) => void;
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
  onFocusWorker?: (worker: string) => void;
}

/** From this many items on, only the items in and near view are rendered. */
export const VIRTUALIZE_FROM = 150;
/** How far beyond the view items are rendered, in pixels. */
const OVERSCAN = 1200;
/** The view's height when the browser can't say, such as in tests. */
const FALLBACK_HEIGHT = 900;

/**
 * The main screen: the conversation grouped by model turn, each turn's
 * text first and then each tool call with its result. Long conversations
 * are virtualised: only the items near the view are in the page. Arrow
 * keys (or j and k) move between tool calls; Enter or Space expands one.
 */
export function TurnStream({
  session,
  worker = "",
  separators = true,
  collapseSubagents = false,
  expandAll = false,
  follow = true,
  version,
  onFocusWorker,
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
  const opts: StreamOptions = { separators, collapseSubagents, isExpanded, onToggle, onFocusWorker };

  // The session changes in place; version says when.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const entries = useMemo(() => conversation(session, worker), [session, worker, version]);
  const keys = useMemo(() => entryKeys(entries), [entries]);

  const ref = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const atBottom = useRef(true);
  const [behind, setBehind] = useState(false);
  const [view, setView] = useState({ top: 0, height: 0 });
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom.current) setBehind(false);
    setView({ top: el.scrollTop, height: el.clientHeight });
  };

  // Measured heights of rendered items, by key.
  const heights = useRef(new Map<string, number>());
  const [, setMeasured] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((records) => {
      let changed = false;
      for (const r of records) {
        const key = (r.target as HTMLElement).dataset.key;
        const h = (r.target as HTMLElement).offsetHeight;
        if (key !== undefined && h > 0 && heights.current.get(key) !== h) {
          heights.current.set(key, h);
          changed = true;
        }
      }
      if (changed) setMeasured((n) => n + 1);
    });
    observer.current = ro;
    return () => ro.disconnect();
  }, []);
  const measure = useCallback((el: HTMLDivElement | null) => {
    if (el) observer.current?.observe(el);
  }, []);

  const virtual = entries.length >= VIRTUALIZE_FROM;
  /* eslint-disable react-hooks/refs */
  let first = 0;
  let last = entries.length;
  let padTop = 0;
  let padBottom = 0;
  if (virtual) {
    const offsets = new Float64Array(entries.length + 1);
    for (let i = 0; i < entries.length; i++) {
      offsets[i + 1] = offsets[i] + (heights.current.get(keys[i]) ?? estimate(entries[i]));
    }
    const total = offsets[entries.length];
    const height = view.height > 0 ? view.height : FALLBACK_HEIGHT;
    // Following the end, the view is at the bottom whatever was last scrolled.
    const top = follow && atBottom.current ? Math.max(total - height, 0) : view.top;
    first = Math.max(search(offsets, top - OVERSCAN) - 1, 0);
    last = Math.min(search(offsets, top + height + OVERSCAN) + 1, entries.length);
    padTop = offsets[first];
    padBottom = total - offsets[last];
  }
  /* eslint-enable react-hooks/refs */

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && follow && atBottom.current) el.scrollTop = el.scrollHeight;
  });
  useEffect(() => {
    if (follow && !atBottom.current) setBehind(true);
  }, [follow, version]);
  const toLatest = () => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    setBehind(false);
  };

  return (
    <div className="actlet-stream-wrap">
      <div
        className="actlet-stream"
        ref={ref}
        onScroll={onScroll}
        onKeyDown={onStreamKey}
        role="log"
        aria-live="off"
        aria-label="Conversation"
        aria-describedby={hintId}
        tabIndex={0}
        data-virtual={virtual || undefined}
      >
        {entries.length === 0 && <div className="actlet-empty">Waiting for the agent…</div>}
        {padTop > 0 && <div style={{ height: padTop }} aria-hidden="true" />}
        {entries.slice(first, last).map((e, j) => {
          const i = first + j;
          return (
            <div key={keys[i]} data-key={keys[i]} ref={virtual ? measure : undefined} className="actlet-entry">
              {separators && i > 0 && e.item.kind !== "system" && <hr className="actlet-sep" />}
              <ItemView {...opts} session={session} item={e.item} worker={e.worker} />
            </div>
          );
        })}
        {padBottom > 0 && <div style={{ height: padBottom }} aria-hidden="true" />}
      </div>
      <p id={hintId} className="actlet-sr-only">
        Arrow keys move between tool calls; Enter expands one.
      </p>
      {behind && (
        <button type="button" className="actlet-latest" onClick={toLatest}>
          ↓ latest
        </button>
      )}
    </div>
  );
}

/** Unique keys for the entries: whose timeline, and which event. */
function entryKeys(entries: Entry[]): string[] {
  const seen = new Map<string, number>();
  return entries.map((e) => {
    const base = `${e.worker?.id ?? ""}:${e.item.epoch}.${e.item.seq}:${e.item.kind}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}#${n}`;
  });
}

/** A first guess at an item's height in pixels, before it is measured. */
function estimate(e: Entry): number {
  const it = e.item;
  if (it.kind === "system") return 26;
  if (it.kind === "note") return 64;
  const t = it.turn!;
  let h = 44;
  if (t.text !== "") h += 20 * Math.min(t.text.split("\n").length, 12);
  for (const c of t.calls) h += c.child !== "" ? 140 : 84;
  return h;
}

/** The index of the last offset at or before y. */
function search(offsets: Float64Array, y: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Arrow keys, j and k move between tool calls; Home and End go to the first and last shown. */
function onStreamKey(e: KeyboardEvent<HTMLDivElement>) {
  const steps = { next: 1, previous: -1, first: -Infinity, last: Infinity, expand: 0 };
  const action = actionFor(STREAM_KEYS, e);
  if (!action || steps[action] === 0) return;
  const target = e.target as HTMLElement;
  if (target.matches("input, textarea, select")) return;
  const heads = [...e.currentTarget.querySelectorAll<HTMLElement>(".actlet-tool-head")];
  if (heads.length === 0) return;
  const at = heads.indexOf(target);
  const step = steps[action];
  let next: number;
  if (step === -Infinity) next = 0;
  else if (step === Infinity) next = heads.length - 1;
  else if (at < 0) next = step > 0 ? firstVisible(e.currentTarget, heads) : heads.length - 1;
  else next = Math.min(Math.max(at + step, 0), heads.length - 1);
  e.preventDefault();
  heads[next].focus();
  heads[next].scrollIntoView?.({ block: "nearest" });
}

function firstVisible(stream: HTMLElement, heads: HTMLElement[]): number {
  const top = stream.getBoundingClientRect().top;
  const i = heads.findIndex((h) => h.getBoundingClientRect().top >= top);
  return i < 0 ? 0 : i;
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
      if (item.detail !== "") {
        // Such as a compaction, whose summary shows on request.
        return (
          <details className={`actlet-system actlet-detail${item.warn ? " actlet-warn" : ""}`}>
            <summary>
              {"· "}
              <Text text={item.text} />
            </summary>
            <div className="actlet-text actlet-detail-body">
              <Text text={item.detail} />
            </div>
          </details>
        );
      }
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

import { useId, useState, type KeyboardEvent } from "react";
import { orNA, plural } from "../view/format";
import { files, workers, type Session } from "../view/session";
import { Text } from "./Text";

export interface SidebarProps {
  session: Session;
  /** The worker the stream shows alone, or "" for all. */
  focus?: string;
  onFocus?: (worker: string) => void;
  onOpenFile?: (path: string) => void;
}

/**
 * The workers and the changed files, with each file's lines added and
 * removed over all its changes. One row is in the tab order at a time;
 * arrow keys (or j and k) move between rows, Home and End to the ends.
 */
export function Sidebar({ session, focus = "", onFocus, onOpenFile }: SidebarProps) {
  const ws = workers(session);
  const fs = files(session);
  const id = useId();
  const rows = ws.length + fs.length;
  const [active, setActive] = useState(0);
  const current = Math.min(active, Math.max(rows - 1, 0));

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    const step: Record<string, number> = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 };
    let next: number;
    if (e.key in step) next = Math.min(Math.max(current + step[e.key], 0), rows - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = rows - 1;
    else return;
    e.preventDefault();
    setActive(next);
    e.currentTarget.querySelectorAll<HTMLElement>(".actlet-row")[next]?.focus();
  };

  return (
    <aside className="actlet-sidebar" aria-label="Workers and files" onKeyDown={onKey}>
      <h3 className="actlet-head" id={`${id}-workers`}>
        Workers
      </h3>
      {ws.length === 0 && <div className="actlet-faint">none yet</div>}
      <ul className="actlet-list" aria-labelledby={`${id}-workers`}>
        {ws.map((w, i) => (
          <li key={w.id}>
            <button
              type="button"
              className={`actlet-row${w.id === focus ? " actlet-selected" : ""}`}
              style={{ paddingLeft: `${(w.id.split(".").length - 1) * 0.9 + 0.3}em` }}
              tabIndex={i === current ? 0 : -1}
              aria-pressed={w.id === focus}
              title={w.id === focus ? "Show the whole conversation" : `Show only ${w.id}`}
              onFocus={() => setActive(i)}
              onClick={() => onFocus?.(w.id === focus ? "" : w.id)}
            >
              <span className={`actlet-icon ${iconClass(w.status)}`} role="img" aria-label={w.status}>
                {w.status === "finished" ? "✓" : w.status === "failed" ? "✗" : "●"}
              </span>
              <span className="actlet-row-name">{w.id}</span>
              <span className="actlet-muted">
                <Text text={` ${orNA(w.model)} ${plural(w.turns, "turn")}`} max={100} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <h3 className="actlet-head" id={`${id}-files`}>
        Files
      </h3>
      {fs.length === 0 && <div className="actlet-faint">none changed</div>}
      <ul className="actlet-list" aria-labelledby={`${id}-files`}>
        {fs.map((f, j) => {
          const i = ws.length + j;
          return (
            <li key={f.path}>
              <button
                type="button"
                className="actlet-row actlet-file"
                title={f.path}
                tabIndex={i === current ? 0 : -1}
                aria-haspopup="dialog"
                aria-label={`${f.path}, ${f.added} lines added, ${f.removed} removed`}
                onFocus={() => setActive(i)}
                onClick={() => onOpenFile?.(f.path)}
              >
                <span className="actlet-row-name actlet-path">
                  <bdi>
                    <Text text={f.path} max={500} />
                  </bdi>
                </span>
                <span className="actlet-add">{`+${f.added}`}</span>{" "}
                <span className="actlet-del">{`−${f.removed}`}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function iconClass(status: string) {
  return status === "finished" ? "actlet-ok" : status === "failed" ? "actlet-err" : "actlet-warn";
}

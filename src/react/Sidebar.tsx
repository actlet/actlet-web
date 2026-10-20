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

/** The workers and the changed files, with each file's lines added and removed over all its changes. */
export function Sidebar({ session, focus = "", onFocus, onOpenFile }: SidebarProps) {
  const ws = workers(session);
  const fs = files(session);
  return (
    <aside className="actlet-sidebar">
      <h3 className="actlet-head">Workers</h3>
      {ws.length === 0 && <div className="actlet-faint">none yet</div>}
      <ul className="actlet-list">
        {ws.map((w) => (
          <li key={w.id}>
            <button
              type="button"
              className={`actlet-row${w.id === focus ? " actlet-selected" : ""}`}
              style={{ paddingLeft: `${(w.id.split(".").length - 1) * 0.9 + 0.3}em` }}
              aria-pressed={w.id === focus}
              title={w.id === focus ? "Show the whole conversation" : `Show only ${w.id}`}
              onClick={() => onFocus?.(w.id === focus ? "" : w.id)}
            >
              <span className={`actlet-icon ${iconClass(w.status)}`}>
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
      <h3 className="actlet-head">Files</h3>
      {fs.length === 0 && <div className="actlet-faint">none changed</div>}
      <ul className="actlet-list">
        {fs.map((f) => (
          <li key={f.path}>
            <button
              type="button"
              className="actlet-row actlet-file"
              title={f.path}
              onClick={() => onOpenFile?.(f.path)}
            >
              <span className="actlet-row-name actlet-path">
                <bdi>
                  <Text text={f.path} max={500} />
                </bdi>
              </span>
              <span className="actlet-add">{`+${f.added}`}</span> <span className="actlet-del">{`−${f.removed}`}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function iconClass(status: string) {
  return status === "finished" ? "actlet-ok" : status === "failed" ? "actlet-err" : "actlet-warn";
}

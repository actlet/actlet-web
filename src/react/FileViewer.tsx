import { useEffect, useRef, useState } from "react";
import { diffTone, recordedFile, sizeOf } from "../view/format";
import { highlight } from "../view/highlight";
import { sanitize } from "../view/sanitize";
import type { Session } from "../view/session";
import { Text } from "./Text";

/** The most of a file the viewer shows. */
export const MAX_FILE_CHARS = 512 * 1024;
export const MAX_FILE_LINES = 5000;

/** A file of the session as the implementor reads it, such as from Actlet's FileResponse. */
export interface FileContent {
  /** The path relative to the session folder. */
  path?: string;
  /** The start of the file. Bytes are decoded as UTF-8. */
  content?: string | Uint8Array;
  /** The whole file's size in bytes. */
  size?: number;
  /** Only the start of the file is given. */
  truncated?: boolean;
  /** The file holds binary data, which isn't shown. */
  binary?: boolean;
  /** Why the file couldn't be read. */
  error?: string;
}

/**
 * Reads a file of the session for the viewer, given relative to the
 * session folder ("output/report.md"); toolPath turns it into the form
 * Actlet's file requests take ("../output/report.md"). The implementor
 * delivers the request; the viewer opens no connections.
 */
export type FileReader = (path: string) => Promise<FileContent>;

export interface FileViewerProps {
  session: Session;
  /** The file, relative to the session folder. */
  path: string;
  /** Reads the file from the box; without one, the viewer shows what the events hold of it. */
  readFile?: FileReader;
  onClose: () => void;
}

interface Shown {
  lines: string[];
  diff: boolean;
  note: string;
}

/** A read-only popup showing a file: from the box when the implementor can read it, or else from the events. */
export function FileViewer({ session, path, readFile, onClose }: FileViewerProps) {
  const [loaded, setLoaded] = useState<{ path: string; shown: Shown } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!readFile) return;
    let live = true;
    readFile(path).then(
      (c) => live && setLoaded({ path, shown: fromContent(c) }),
      (e: unknown) =>
        live &&
        setLoaded({
          path,
          shown: { lines: [], diff: false, note: "can't read it: " + (e instanceof Error ? e.message : String(e)) },
        }),
    );
    return () => {
      live = false;
    };
  }, [path, readFile]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  let shown: Shown;
  if (!readFile) shown = recordedFile(session, path);
  else if (loaded?.path === path) shown = loaded.shown;
  else shown = { lines: [], diff: false, note: "loading…" };

  const lines = shown.lines.slice(0, MAX_FILE_LINES);
  const more = shown.lines.length - lines.length;
  return (
    <div className="actlet-overlay" onClick={onClose}>
      <div
        className="actlet-popup"
        role="dialog"
        aria-modal="true"
        aria-label={`File ${sanitize(path)}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="actlet-popup-head">
          <strong className="actlet-path">
            <bdi>
              <Text text={path} max={500} />
            </bdi>
          </strong>
          <button type="button" ref={closeRef} className="actlet-btn" onClick={onClose} aria-label="Close">
            esc ✕
          </button>
        </div>
        <div className="actlet-popup-body">
          {lines.length === 0 ? (
            <div className="actlet-muted">
              <Text text={shown.note} />
            </div>
          ) : (
            <table className="actlet-code">
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    {!shown.diff && <td className="actlet-lineno">{i + 1}</td>}
                    <td className={shown.diff ? `actlet-tone-${diffTone(l)}` : undefined}>
                      {shown.diff ? <Text text={l} max={2000} /> : <Highlighted path={path} line={l} n={i} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {more > 0 && <div className="actlet-cut">{`… ${more} more lines not shown`}</div>}
        </div>
        <div className="actlet-popup-foot actlet-muted">
          <Text text={lines.length > 0 ? `${shown.note} · ${lines.length} lines` : "read only"} />
        </div>
      </div>
    </div>
  );
}

function Highlighted({ path, line, n }: { path: string; line: string; n: number }) {
  return (
    <>
      {highlight(path, line.replaceAll("\t", "    ").slice(0, 2000), n).map((s, i) =>
        s.kind === "plain" ? (
          <span key={i}>{s.text}</span>
        ) : (
          <span key={i} className={`actlet-hl-${s.kind}`}>
            {s.text}
          </span>
        ),
      )}
    </>
  );
}

/** What a read file shows: sanitized, cut to the viewer's limits, saying so. */
function fromContent(c: FileContent): Shown {
  if (c.error) return { lines: [], diff: false, note: "can't read it: " + sanitize(c.error) };
  let text = typeof c.content === "string" ? c.content : new TextDecoder().decode(c.content ?? new Uint8Array());
  if (c.binary || text.includes("\0")) {
    return { lines: [], diff: false, note: `a binary file of ${sizeOf(c.size ?? text.length)}` };
  }
  let cut = false;
  if (text.length > MAX_FILE_CHARS) {
    text = text.slice(0, MAX_FILE_CHARS);
    cut = true;
  }
  const lines = sanitize(text).replace(/\n+$/, "").split("\n");
  let note = `${sanitize(c.path ?? "")} · ${sizeOf(c.size ?? text.length)} · read only`.replace(/^ · /, "");
  if (c.truncated || cut) note += ` · the first ${sizeOf(text.length)} shown`;
  return { lines, diff: false, note };
}

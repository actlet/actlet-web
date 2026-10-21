import { useEffect, useId, useRef, useState } from "react";
import { diffTone, recordedFile, sizeOf } from "../view/format";
import { highlightFile } from "../view/highlight";
import { sanitize } from "../view/sanitize";
import type { Session } from "../view/session";
import { Spans } from "./Code";
import { useDialog } from "./dialog";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const id = useId();

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

  useDialog(dialogRef, closeRef, onClose);

  let shown: Shown;
  if (!readFile) shown = recordedFile(session, path);
  else if (loaded?.path === path) shown = loaded.shown;
  else shown = { lines: [], diff: false, note: "loading…" };

  const lines = shown.lines.slice(0, MAX_FILE_LINES);
  const more = shown.lines.length - lines.length;
  const spans = shown.diff
    ? []
    : highlightFile(
        path,
        lines.map((l) => l.replaceAll("\t", "    ").slice(0, 2000)),
      );
  return (
    <div className="actlet-overlay">
      <button type="button" className="actlet-backdrop" tabIndex={-1} aria-label="Close the file" onClick={onClose} />
      <div
        ref={dialogRef}
        className="actlet-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-note`}
      >
        <div className="actlet-popup-head">
          <h2 className="actlet-path actlet-popup-title" id={`${id}-title`}>
            <span className="actlet-sr-only">File</span>{" "}
            <bdi>
              <Text text={path} max={500} />
            </bdi>
          </h2>
          <button
            type="button"
            ref={closeRef}
            className="actlet-btn"
            onClick={onClose}
            aria-label="Close"
            aria-keyshortcuts="Escape"
          >
            esc ✕
          </button>
        </div>
        {/* The body scrolls; keyboard users focus it to scroll with the arrow keys. */}
        <div className="actlet-popup-body" tabIndex={0} role="region" aria-label="File content">
          {lines.length === 0 ? (
            <div className="actlet-muted">
              <Text text={shown.note} />
            </div>
          ) : (
            <div className="actlet-code">
              {lines.map((l, i) => (
                <div key={i} className={`actlet-code-line${shown.diff ? ` actlet-tone-${diffTone(l)}` : ""}`}>
                  {!shown.diff && (
                    <span className="actlet-lineno" aria-hidden="true">
                      {i + 1}
                    </span>
                  )}
                  <span className="actlet-code-text">
                    {shown.diff ? <Text text={l} max={2000} /> : <Spans spans={spans[i]} />}
                  </span>
                </div>
              ))}
            </div>
          )}
          {more > 0 && <div className="actlet-cut">{`… ${more} more lines not shown`}</div>}
        </div>
        <div className="actlet-popup-foot actlet-muted" id={`${id}-note`}>
          <Text text={lines.length > 0 ? `${shown.note} · ${lines.length} lines` : "read only"} />
        </div>
      </div>
    </div>
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

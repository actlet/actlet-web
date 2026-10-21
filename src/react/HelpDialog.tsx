import { Fragment, useId, useRef } from "react";
import type { CommandKind } from "../commands";
import { useDialog } from "./dialog";
import { keyGroups, keyName } from "./keys";

/** What each command the viewer may offer does, as the footer offers it. */
const commandHelp: Record<CommandKind, [string, string][]> = {
  steer: [["the note line, then Enter", "send the agent a note; it reads it at its next turn"]],
  pause: [
    ["Pause", "let running work finish, then pause"],
    ["Interrupt", "stop running work, then pause"],
  ],
  stop: [["Stop…", "stop the task for good, after asking"]],
  profile_update: [["Raise a budget…", "give one of the session's budgets a new limit"]],
};

export interface HelpDialogProps {
  /** The viewer plays a recording back, so the replay keys work. */
  replay: boolean;
  /** The commands the footer offers; none when the viewer only watches. */
  commands: readonly CommandKind[];
  onClose: () => void;
}

/** The viewer's keyboard shortcuts and commands, in groups, from the key map its handlers use. */
export function HelpDialog({ replay, commands, onClose }: HelpDialogProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialog(dialogRef, closeRef, onClose);
  const offered = commands.flatMap((c) => commandHelp[c] ?? []);
  return (
    <div className="actlet-overlay">
      <button type="button" className="actlet-backdrop" tabIndex={-1} aria-label="Close the help" onClick={onClose} />
      <div ref={dialogRef} className="actlet-popup actlet-help" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="actlet-popup-head">
          <h2 className="actlet-popup-title" id={id}>
            Keys and commands
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
        <div className="actlet-popup-body" tabIndex={0} role="region" aria-labelledby={id}>
          {keyGroups(replay).map((g) => (
            <section key={g.title} className="actlet-section">
              <h3 className="actlet-section-title">
                {g.title}
                {g.where && <span className="actlet-muted">{` (${g.where})`}</span>}
              </h3>
              <dl className="actlet-keys">
                {g.bindings.map((b) => (
                  <div key={b.action}>
                    <dt>
                      {b.keys.map((k, i) => (
                        <Fragment key={k}>
                          {i > 0 && <span className="actlet-muted"> or </span>}
                          <kbd>{keyName(k)}</kbd>
                        </Fragment>
                      ))}
                    </dt>
                    <dd>{b.does}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <section className="actlet-section">
            <h3 className="actlet-section-title">
              Commands
              <span className="actlet-muted"> (in the footer)</span>
            </h3>
            {offered.length === 0 ? (
              <p className="actlet-muted">None: this viewer only watches.</p>
            ) : (
              <dl className="actlet-keys">
                {offered.map(([what, does]) => (
                  <div key={what}>
                    <dt>{what}</dt>
                    <dd>{does}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="actlet-muted">
              A click on a worker shows it alone, and a click on a file opens it. A click on a tool call expands it.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

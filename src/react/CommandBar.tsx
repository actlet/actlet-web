import { useEffect, useRef, useState, type FormEvent } from "react";
import { PauseMode, type Command } from "../gen/actlet/gateway/v0/gateway_pb";
import { commandName } from "../view/session";
import {
  DEFAULT_COMMANDS,
  pauseCommand,
  steerCommand,
  stopCommand,
  type CommandKind,
  type CommandOptions,
  type CommandStatus,
  type SentCommand,
} from "../commands";
import { Text } from "./Text";

/** Delivers a command to the session. A rejected promise marks the command as not delivered. */
export type CommandHandler = (command: Command) => void | Promise<void>;

export interface CommandBarProps extends CommandOptions {
  onCommand: CommandHandler;
  /** The commands offered; steer notes only by default. */
  allowed?: readonly CommandKind[];
  /** What happened to commands, by ID, as far as the viewer knows. */
  outcomes?: ReadonlyMap<string, { status: CommandStatus; message: string }>;
  /** The session has ended: nothing more can be sent. */
  ended?: boolean;
}

/** The most recent sent commands the bar lists. */
const SHOWN = 5;

/**
 * Sends commands like the terminal viewer does: a line for operator notes,
 * and pause and stop when the implementor allows them. The implementor
 * delivers them; the bar shows whether each was accepted.
 */
export function CommandBar({
  onCommand,
  allowed = DEFAULT_COMMANDS,
  outcomes,
  ended = false,
  ...opts
}: CommandBarProps) {
  const [note, setNote] = useState("");
  const [sent, setSent] = useState<SentCommand[]>([]);
  const [confirmStop, setConfirmStop] = useState(false);
  // Asking to confirm a stop moves focus to Cancel, the safe choice; when
  // the question goes, focus goes back to the Stop button.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const stopRef = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (confirmStop) cancelRef.current?.focus();
    else if (asked.current) stopRef.current?.focus();
    asked.current = confirmStop;
  }, [confirmStop]);

  const send = (command: Command) => {
    const entry: SentCommand = { command, label: commandName(command), status: "pending", message: "" };
    setSent((prev) => [...prev, entry].slice(-SHOWN));
    const fail = (e: unknown) =>
      setSent((prev) =>
        prev.map((s) =>
          s.command.id === command.id
            ? { ...s, status: "failed", message: e instanceof Error ? e.message : String(e) }
            : s,
        ),
      );
    try {
      const r = onCommand(command);
      if (r && typeof r.then === "function") r.then(undefined, fail);
    } catch (e) {
      fail(e);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = note.trim();
    if (text === "" || ended) return;
    send(steerCommand(text, opts));
    setNote("");
  };

  const can = (k: CommandKind) => allowed.includes(k);
  return (
    <div className="actlet-commands">
      <div className="actlet-command-row">
        {can("steer") && (
          <form className="actlet-note-form" onSubmit={onSubmit}>
            <span className="actlet-prompt" aria-hidden="true">
              ›
            </span>
            <input
              className="actlet-input"
              type="text"
              aria-label="Note for the agent"
              placeholder={ended ? "the session has ended" : "send the agent a note"}
              value={note}
              disabled={ended}
              maxLength={4000}
              onChange={(e) => setNote(e.target.value)}
            />
            <button type="submit" className="actlet-btn" disabled={ended || note.trim() === ""}>
              Send
            </button>
          </form>
        )}
        {can("pause") && (
          <>
            <button
              type="button"
              className="actlet-btn"
              disabled={ended}
              title="Let running work finish, then pause"
              onClick={() => send(pauseCommand(PauseMode.DRAIN, opts))}
            >
              Pause
            </button>
            <button
              type="button"
              className="actlet-btn"
              disabled={ended}
              title="Interrupt running work, then pause"
              onClick={() => send(pauseCommand(PauseMode.INTERRUPT, opts))}
            >
              Interrupt
            </button>
          </>
        )}
        {can("stop") &&
          (confirmStop ? (
            <span className="actlet-confirm" role="group" aria-label="Confirm stop">
              Stop the task for good?
              <button
                type="button"
                className="actlet-btn actlet-btn-danger"
                onClick={() => {
                  setConfirmStop(false);
                  send(stopCommand(opts));
                }}
              >
                Stop
              </button>
              <button type="button" ref={cancelRef} className="actlet-btn" onClick={() => setConfirmStop(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              ref={stopRef}
              className="actlet-btn actlet-btn-danger"
              disabled={ended}
              aria-haspopup="true"
              onClick={() => setConfirmStop(true)}
            >
              Stop…
            </button>
          ))}
      </div>
      {sent.length > 0 && (
        <ul className="actlet-sent" aria-label="Sent commands" aria-live="polite">
          {sent.map((s) => {
            const known = s.status === "pending" ? outcomes?.get(s.command.id) : undefined;
            const status = known?.status ?? s.status;
            const message = known?.message ?? s.message;
            return (
              <li key={s.command.id} className={`actlet-sent-${status}`} data-status={status}>
                <span className="actlet-muted">{s.label}</span>
                {s.command.action.case === "steer" && (
                  <>
                    {" "}
                    <Text text={`“${s.command.action.value.note}”`} max={120} />
                  </>
                )}
                {` · ${statusText(status)}`}
                {message !== "" && (
                  <>
                    {": "}
                    <Text text={message} max={300} />
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function statusText(s: CommandStatus): string {
  switch (s) {
    case "pending":
      return "sent, waiting for the box";
    case "accepted":
      return "accepted";
    case "rejected":
      return "rejected";
    case "failed":
      return "not delivered";
  }
}

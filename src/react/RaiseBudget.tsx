import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { raiseBudgetCommand, type CommandOptions } from "../commands";
import type { Budget, Command } from "../gen/actlet/gateway/v0/gateway_pb";
import { sanitize } from "../view/sanitize";
import { budgetName, type BudgetState } from "../view/session";

export interface RaiseBudgetProps extends CommandOptions {
  /** The session's budgets as profile entries, from budgetDefinitions. */
  definitions: readonly Budget[];
  /** The budgets as last reported, to show what is used. */
  states: readonly BudgetState[];
  disabled?: boolean;
  onSend: (command: Command) => void;
}

/**
 * Raises one of the session's budgets with a profile update: choose the
 * budget, give its new limit, and confirm. It can also start the budget's
 * usage again from zero.
 */
export function RaiseBudget({ definitions, states, disabled = false, onSend, ...opts }: RaiseBudgetProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(definitions[0]?.kind ?? 0);
  const [limit, setLimit] = useState("");
  const [reset, setReset] = useState(false);
  const openRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLSelectElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) firstRef.current?.focus();
    else if (wasOpen.current) openRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  if (definitions.length === 0) return null;
  const chosen = definitions.find((b) => b.kind === kind) ?? definitions[0];
  const state = states.find((b) => b.kind === chosen.kind);
  const value = Number(limit);
  const valid = limit.trim() !== "" && Number.isFinite(value) && value > 0;
  const unit = chosen.currency !== "" ? ` ${sanitize(chosen.currency)}` : "";

  const start = () => {
    const b = definitions[0];
    setKind(b.kind);
    setLimit(suggest(b.limit));
    setReset(false);
    setOpen(true);
  };
  const choose = (k: number) => {
    setKind(k);
    setLimit(suggest(definitions.find((b) => b.kind === k)?.limit ?? 0));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || disabled) return;
    onSend(raiseBudgetCommand(definitions, chosen.kind, value, reset, opts));
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        ref={openRef}
        className="actlet-btn"
        disabled={disabled}
        aria-haspopup="true"
        onClick={start}
      >
        Raise a budget…
      </button>
    );
  }
  return (
    <form className="actlet-raise" aria-label="Raise a budget" onSubmit={submit}>
      <label htmlFor={`${id}-kind`}>Budget</label>
      <select
        id={`${id}-kind`}
        ref={firstRef}
        className="actlet-speed"
        value={chosen.kind}
        onChange={(e) => choose(Number(e.target.value))}
      >
        {definitions.map((b) => (
          <option key={b.kind} value={b.kind}>
            {budgetName(b.kind)}
          </option>
        ))}
      </select>
      <span className="actlet-muted">
        {`now ${chosen.limit}${unit}`}
        {state && state.used >= 0 ? `, ${Number(state.used.toPrecision(4))}${unit} used` : ""}
      </span>
      <label htmlFor={`${id}-limit`}>New limit</label>
      <input
        id={`${id}-limit`}
        className="actlet-input actlet-number"
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        value={limit}
        aria-invalid={!valid}
        onChange={(e) => setLimit(e.target.value)}
      />
      <label className="actlet-check">
        <input type="checkbox" checked={reset} onChange={(e) => setReset(e.target.checked)} /> start its usage from zero
      </label>
      <button type="submit" className="actlet-btn" disabled={!valid || disabled}>
        Raise
      </button>
      <button type="button" className="actlet-btn" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}

/** A new limit to start from: twice the current one. */
function suggest(limit: number): string {
  return limit > 0 ? String(Number((limit * 2).toPrecision(6))) : "";
}

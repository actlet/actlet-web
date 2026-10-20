/**
 * The session's budgets as the viewer shows them: the latest figures, how
 * much is used, and whether one is used up. Ported from the terminal
 * viewer.
 */
import { create } from "@bufbuild/protobuf";
import { BudgetKind, BudgetSchema, type Budget } from "../gen/actlet/gateway/v0/gateway_pb";
import { duration, elapsed, sizeOf, tokens } from "./format";
import { sanitize } from "./sanitize";
import { budgetName, type BudgetState, type Session } from "./session";

/**
 * The session's budgets: as the latest budget status reported them, or
 * else as the run started with them, with no usage known (used is -1 and
 * state is "").
 */
export function budgets(s: Session): BudgetState[] {
  if (s.budgets && s.budgets.length > 0) return s.budgets;
  return (s.info?.budgets ?? []).map((b) => ({
    kind: b.kind,
    limit: b.limit,
    used: -1,
    currency: sanitize(b.currency),
    state: "",
  }));
}

/**
 * What the session has used of a budget: the latest figure the viewer has,
 * from the budget status or, as usage only grows, the model calls and the
 * time since, if they say more. Null when nothing is known.
 */
export function budgetUsed(s: Session, b: BudgetState, now: number | null = null): number | null {
  let live = -1;
  switch (b.kind) {
    case BudgetKind.MONEY:
      if (s.usage.cost > 0 && s.usage.currency === b.currency) live = s.usage.cost;
      break;
    case BudgetKind.TOKENS:
      if (s.usage.input + s.usage.output > 0) live = s.usage.input + s.usage.output;
      break;
    case BudgetKind.TIME: {
      const ns = elapsed(s, now);
      if (ns !== null) live = ns / 1e9;
      break;
    }
  }
  if (live > b.used) return live;
  return b.used >= 0 ? b.used : null;
}

/** A budget, worded for people. */
export interface BudgetLine {
  kind: string;
  /** The limit and the amount used, in the kind's unit; used is "n/a" when unknown. */
  limit: string;
  used: string;
  /** How much of the limit is used, from 0; null when unknown. */
  percent: number | null;
  state: string;
  /** What the state means, such as "past the alert"; "" when it's fine. */
  stateText: string;
  /** All of it in a line, as the terminal viewer writes it. */
  text: string;
}

/** A budget in words: its limit, what is used of it, and its state. */
export function budgetLine(s: Session, b: BudgetState, now: number | null = null): BudgetLine {
  const kind = budgetName(b.kind);
  let limit = `${b.limit}`;
  if (b.currency !== "") limit += " " + b.currency;
  const used = budgetUsed(s, b, now);
  let usedText = "n/a";
  let percent: number | null = null;
  if (used !== null) {
    let figure: string;
    switch (b.kind) {
      case BudgetKind.TOKENS:
        figure = tokens(Math.trunc(used));
        limit = tokens(Math.trunc(b.limit));
        break;
      case BudgetKind.TIME:
        figure = duration(Math.trunc(used) * 1e9);
        limit = duration(Math.trunc(b.limit) * 1e9);
        break;
      case BudgetKind.DISK:
        figure = sizeOf(Math.trunc(used));
        limit = sizeOf(Math.trunc(b.limit));
        break;
      default:
        figure = used.toFixed(2);
    }
    percent = b.limit > 0 ? (used * 100) / b.limit : 0;
    usedText = `${figure} (${Math.round(percent)}%)`;
  }
  const stateText =
    b.state === "alerted"
      ? "past the alert"
      : b.state === "exhausted"
        ? "used up"
        : b.state === "waiting"
          ? "used up; work waits"
          : "";
  let text = `${kind.padEnd(6)} limit ${limit.padEnd(10)} used ${usedText}`;
  if (stateText !== "") text += "  " + stateText;
  return { kind, limit, used: usedText, percent, state: b.state, stateText, text };
}

/** Which budget is used up, for the status line; "" when none is. */
export function budgetAlarm(s: Session): string {
  for (const b of s.budgets ?? []) {
    if (b.state === "exhausted") return `${budgetName(b.kind)} budget used up`;
    if (b.state === "waiting") return `waiting for the ${budgetName(b.kind)} budget`;
  }
  return "";
}

/**
 * The session's budgets as profile entries, for a profile update: as the
 * run started with them, with the limits the latest budget status reports.
 * A profile update replaces all the budgets, so it sends every one.
 */
export function budgetDefinitions(s: Session): Budget[] {
  return (s.info?.budgets ?? []).map((b) => {
    const latest = s.budgets?.find((u) => u.kind === b.kind);
    return create(BudgetSchema, { ...b, limit: latest ? latest.limit : b.limit });
  });
}

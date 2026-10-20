import { create } from "@bufbuild/protobuf";
import {
  BudgetSchema,
  CommandResult,
  CommandSchema,
  Origin,
  PauseMode,
  type ActivityEvent,
  type Budget,
  type BudgetKind,
  type Command,
  type CommandAck,
} from "./gen/actlet/gateway/v0/gateway_pb";

/**
 * The commands a viewer can offer. "pause" offers both modes, drain and
 * interrupt; "profile_update" offers raising a budget.
 */
export type CommandKind = "steer" | "pause" | "stop" | "profile_update";

/** What the viewer offers by default: steer notes only, for monitoring and light steering. */
export const DEFAULT_COMMANDS: readonly CommandKind[] = ["steer"];

/** How a sent command went: waiting for the box, accepted or rejected, or not delivered by the implementor. */
export type CommandStatus = "pending" | "accepted" | "rejected" | "failed";

/** A command the viewer sent, and how it went. */
export interface SentCommand {
  command: Command;
  label: string;
  status: CommandStatus;
  message: string;
}

export interface CommandOptions {
  /** The command's origin: remote by default, a viewer that isn't on the box's machine. */
  origin?: Origin;
  actor?: string;
  newId?: () => string;
}

/** A unique command ID. */
export function newCommandId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return "web-" + c.randomUUID();
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function base(o: CommandOptions) {
  return { id: (o.newId ?? newCommandId)(), origin: o.origin ?? Origin.REMOTE, actor: o.actor ?? "" };
}

/** A steer command: an operator note for the agent. */
export function steerCommand(note: string, o: CommandOptions = {}): Command {
  return create(CommandSchema, { ...base(o), action: { case: "steer", value: { note } } });
}

/** A pause command: drain lets running work finish, interrupt stops it. */
export function pauseCommand(mode: PauseMode, o: CommandOptions = {}): Command {
  return create(CommandSchema, { ...base(o), action: { case: "pause", value: { mode } } });
}

/** A stop command: cancel the task, with the profile's grace period. */
export function stopCommand(o: CommandOptions = {}): Command {
  return create(CommandSchema, { ...base(o), action: { case: "stop", value: {} } });
}

/**
 * A profile update that changes one budget's limit, and optionally starts
 * its usage again from zero. A profile update replaces all the budgets, so
 * it carries every one: pass the session's budgets as they stand, from
 * budgetDefinitions.
 */
export function raiseBudgetCommand(
  current: readonly Budget[],
  kind: BudgetKind,
  limit: number,
  reset = false,
  o: CommandOptions = {},
): Command {
  const budgets = current.map((b) => create(BudgetSchema, { ...b, limit: b.kind === kind ? limit : b.limit }));
  return create(CommandSchema, {
    ...base(o),
    action: {
      case: "profileUpdate",
      value: { profile: { budgets }, fields: ["budgets"], resetBudgets: reset ? [kind] : [] },
    },
  });
}

/** What happened to a command, as far as the viewer knows. */
export interface CommandOutcome {
  status: CommandStatus;
  message: string;
}

/** Records what a command event or acknowledgement says happened to a command. */
export function recordOutcome(out: Map<string, CommandOutcome>, id: string, result: CommandResult, message: string) {
  if (result === CommandResult.ACCEPTED) out.set(id, { status: "accepted", message });
  else if (result === CommandResult.REJECTED) out.set(id, { status: "rejected", message });
}

/** Records the outcome a command event carries; other events are ignored. */
export function recordCommandEvent(out: Map<string, CommandOutcome>, ev: ActivityEvent) {
  if (ev.body.case === "command" && ev.body.value.command) {
    recordOutcome(out, ev.body.value.command.id, ev.body.value.result, ev.body.value.message);
  }
}

/** What happened to commands, by ID: from command events, and from acknowledgements the implementor passes on. */
export function commandOutcomes(
  events: readonly ActivityEvent[],
  acks: readonly CommandAck[] = [],
  known: ReadonlyMap<string, CommandOutcome> = new Map(),
): Map<string, CommandOutcome> {
  const out = new Map(known);
  for (const ev of events) recordCommandEvent(out, ev);
  for (const a of acks) recordOutcome(out, a.commandId, a.result, a.message);
  return out;
}

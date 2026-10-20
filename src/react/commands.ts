import { create } from "@bufbuild/protobuf";
import {
  CommandResult,
  CommandSchema,
  Origin,
  PauseMode,
  type ActivityEvent,
  type Command,
  type CommandAck,
} from "../gen/actlet/gateway/v0/gateway_pb";

/** The commands a viewer can offer. "pause" offers both modes: drain and interrupt. */
export type CommandKind = "steer" | "pause" | "stop";

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

/** What happened to commands, by ID: from command events, and from acknowledgements the implementor passes on. */
export function commandOutcomes(
  events: readonly ActivityEvent[],
  acks: readonly CommandAck[] = [],
): Map<string, { status: CommandStatus; message: string }> {
  const out = new Map<string, { status: CommandStatus; message: string }>();
  const set = (id: string, result: CommandResult, message: string) => {
    if (result === CommandResult.ACCEPTED) out.set(id, { status: "accepted", message });
    else if (result === CommandResult.REJECTED) out.set(id, { status: "rejected", message });
  };
  for (const ev of events) {
    if (ev.body.case === "command" && ev.body.value.command) {
      set(ev.body.value.command.id, ev.body.value.result, ev.body.value.message);
    }
  }
  for (const a of acks) set(a.commandId, a.result, a.message);
  return out;
}

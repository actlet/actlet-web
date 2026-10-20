/**
 * Turning what an implementor has into activity events. The library opens
 * no connections and reads no recordings: events arrive decoded, either as
 * messages or in the Protobuf JSON mapping (as `actlet-cli replay export
 * --jsonl` writes them).
 */
import { fromJson, isMessage, type JsonObject } from "@bufbuild/protobuf";
import { ActivityEventSchema, type ActivityEvent, type ActivityEventJson } from "./gen/actlet/gateway/v0/gateway_pb";

/** An activity event as a message, or as its Protobuf JSON (field names in either spelling). */
export type EventInput = ActivityEvent | ActivityEventJson | JsonObject;

const decoded = new WeakMap<object, ActivityEvent>();

/**
 * Decodes an event; a message is returned as it is. Fields this version
 * doesn't know are ignored. Throws if the JSON isn't an activity event.
 * Results are cached by object, so feeding the same objects again is cheap.
 */
export function toEvent(input: EventInput): ActivityEvent {
  if (isMessage(input, ActivityEventSchema)) return input;
  let ev = decoded.get(input);
  if (!ev) {
    ev = fromJson(ActivityEventSchema, input as JsonObject, { ignoreUnknownFields: true });
    decoded.set(input, ev);
  }
  return ev;
}

/** Decodes JSON Lines of events, one per line; blank lines are skipped. Throws on a line that isn't an event, naming it. */
export function parseJsonl(text: string): ActivityEvent[] {
  const out: ActivityEvent[] = [];
  text.split("\n").forEach((line, i) => {
    if (line.trim() === "") return;
    try {
      out.push(toEvent(JSON.parse(line) as JsonObject));
    } catch (e) {
      throw new Error(`line ${i + 1}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }
  });
  return out;
}

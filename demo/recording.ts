import demo from "../fixtures/demo.jsonl?raw";
import digest from "../fixtures/digest.jsonl?raw";
import standard from "../fixtures/standard.jsonl?raw";
import { parseJsonl } from "../src";

/** The demo's recording, exported with `actlet-cli replay export --jsonl`. */
export const recording = parseJsonl(demo);

/** A release check that uses every standard tool: progress, feedback, budgets, a decision and an llm call. */
export const standardRecording = parseJsonl(standard);

/** A sales digest that loads a skill and whose context is compacted half-way. */
export const digestRecording = parseJsonl(digest);

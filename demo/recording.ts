import demo from "../fixtures/demo.jsonl?raw";
import { parseJsonl } from "../src";

/** The demo's recording, exported with `actlet-cli replay export --jsonl`. */
export const recording = parseJsonl(demo);

// @actlet/viewer/core: the parts without React. Decoding events, folding
// them into a session view, sanitizing, replay timing and the view-state
// JSON, for servers, workers, tests or another UI framework.

export { parseJsonl, toEvent, type EventInput } from "./events";
export * as gateway from "./gen/actlet/gateway/v0/gateway_pb";
export {
  ActivityEventSchema,
  CommandAckSchema,
  CommandResult,
  CommandSchema,
  Origin,
  PauseMode,
  SessionState,
  type ActivityEvent,
  type ActivityEventJson,
  type Command,
  type CommandAck,
} from "./gen/actlet/gateway/v0/gateway_pb";
export {
  MAX_ITEMS,
  MAX_LOG,
  MAX_TEXT,
  apply,
  commandName,
  compareWorkers,
  contextWindow,
  describe,
  diffStat,
  fileHistory,
  files,
  fold,
  keep,
  models,
  newSession,
  originName,
  running,
  skip,
  stateName,
  workers,
  type Diff,
  type File,
  type Info,
  type Item,
  type ItemKind,
  type LogLine,
  type Session,
  type ToolCall,
  type ToolStatus,
  type Turn,
  type Usage,
  type Worker,
  type WorkerStatus,
} from "./view/session";
export { sanitize } from "./view/sanitize";
export { sessionPath, toolPath } from "./view/paths";
export { toViewState, VIEW_STATE_VERSION, type ViewStateJson } from "./view/state-json";
export {
  conversation,
  duration,
  keyArgs,
  recordedFile,
  resultLines,
  tokens,
  toolLabel,
  type Entry,
  type RecordedFile,
  type Styled,
  type Tone,
} from "./view/format";
export { Player, MAX_IDLE, MAX_SPEED, MIN_SPEED, type PlayerState } from "./replay/player";

// Commands, built for onCommand and their outcomes tracked; no React in them.
export {
  DEFAULT_COMMANDS,
  commandOutcomes,
  newCommandId,
  recordCommandEvent,
  recordOutcome,
  pauseCommand,
  steerCommand,
  stopCommand,
  type CommandKind,
  type CommandOutcome,
  type CommandStatus,
  type SentCommand,
} from "./commands";

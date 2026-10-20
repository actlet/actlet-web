// @actlet/viewer: React components that show an Actlet session's
// activity, live or replayed, from events the implementor feeds them.

// Events.
export { parseJsonl, toEvent, type EventInput } from "./events";
// The gateway contract's generated types, and the ones the viewer uses
// most at the top level.
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

// The session view: folding events into what a viewer shows.
export {
  MAX_ITEMS,
  MAX_LOG,
  apply,
  commandName,
  compareWorkers,
  contextWindow,
  describe,
  diffStat,
  fileHistory,
  files,
  fold,
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

// Components.
export { ActivityViewer, type ActivityViewerProps } from "./react/ActivityViewer";
export { TurnStream, ItemView, type TurnStreamProps, type StreamOptions } from "./react/TurnStream";
export { ToolBlock, type ToolBlockProps } from "./react/ToolBlock";
export { StatusLine, type StatusLineProps } from "./react/StatusLine";
export { Sidebar, type SidebarProps } from "./react/Sidebar";
export { FileViewer, type FileContent, type FileReader, type FileViewerProps } from "./react/FileViewer";
export { Tabs, TABS, type TabId, type TabsProps } from "./react/Tabs";
export { SessionPanel, TaskPanel, ProfilePanel, ToolsPanel, EventsPanel, type PanelProps } from "./react/Panels";
export { ReplayControls, type ReplayControlsProps } from "./react/ReplayControls";
export { CommandBar, type CommandBarProps, type CommandHandler } from "./react/CommandBar";
export {
  DEFAULT_COMMANDS,
  commandOutcomes,
  newCommandId,
  pauseCommand,
  steerCommand,
  stopCommand,
  type CommandKind,
  type CommandStatus,
  type SentCommand,
} from "./react/commands";
export { Text } from "./react/Text";
export {
  decodeEvents,
  useLiveSession,
  useNow,
  useReplay,
  type ReplayOptions,
  type ReplayView,
  type SessionView,
} from "./react/hooks";
